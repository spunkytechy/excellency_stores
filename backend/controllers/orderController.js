// backend/controllers/orderController.js

const { getDb } = require('../config/db');
const { v4: uuidv4 } = require('uuid');
const { sendOrderAlert, sendOrderConfirmation } = require('../services/emailService');
const { updateCustomerRecord } = require('../services/customerService');
const { initializePayment, verifyPayment } = require('../services/paymentService');

function generateOrderNumber() {
  const prefix = 'KWS';
  const ts = Date.now().toString(36).toUpperCase();
  const rand = Math.random().toString(36).substring(2, 5).toUpperCase();
  return `${prefix}-${ts}-${rand}`;
}

// ── POST /api/orders ───────────────────────────────────────
async function createOrder(req, res) {
  try {
    const db = getDb();
    const { customer_name, customer_email, customer_phone, delivery_address, delivery_info, items } = req.body;

    if (!customer_name || !customer_phone || !delivery_address || !items || !items.length) {
      return res.status(400).json({ success: false, message: 'Name, phone, delivery address, and items are required.' });
    }

    // Validate and price items from DB
    const resolvedItems = [];
    let subtotal = 0;

    for (const item of items) {
      const product = db.prepare('SELECT * FROM products WHERE id = ?').get(item.product_id);
      if (!product) {
        return res.status(400).json({ success: false, message: `Product not found: ${item.product_id}` });
      }
      if (product.status !== 'active') {
        return res.status(400).json({ success: false, message: `Product unavailable: ${product.name}` });
      }
      if (product.stock < item.quantity) {
        return res.status(400).json({
          success: false,
          message: `Insufficient stock for: ${product.name}. Available: ${product.stock}`
        });
      }

      const unitPrice = product.discount_price || product.price;
      subtotal += unitPrice * item.quantity;
      resolvedItems.push({
        id: uuidv4(),
        product_id: product.id,
        product_name: product.name,
        product_image: product.image,
        quantity: item.quantity,
        price: unitPrice,
        variant: item.variant || null
      });
    }

    // Get delivery fee from settings
    const settings = db.prepare('SELECT delivery_fee FROM store_settings WHERE id = 1').get();
    const deliveryFee = settings ? settings.delivery_fee : 1500;
    const totalAmount = subtotal + deliveryFee;

    const orderId = uuidv4();
    const orderNumber = generateOrderNumber();

    // Create order
    db.prepare(`
      INSERT INTO orders (id, order_number, customer_name, customer_email, customer_phone,
        delivery_address, delivery_info, subtotal, delivery_fee, total_amount, payment_status, order_status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', 'pending')
    `).run(orderId, orderNumber, customer_name, customer_email || null, customer_phone,
           delivery_address, delivery_info || null, subtotal, deliveryFee, totalAmount);

    // Create order items
    const insertItem = db.prepare(`
      INSERT INTO order_items (id, order_id, product_id, product_name, product_image, quantity, price, variant)
      VALUES (@id, @order_id, @product_id, @product_name, @product_image, @quantity, @price, @variant)
    `);
    const insertItems = db.transaction((items) => {
      for (const i of items) insertItem.run({ ...i, order_id: orderId });
    });
    insertItems(resolvedItems);

    // Deduct stock
    const deductStock = db.transaction((items) => {
      for (const i of items) {
        db.prepare('UPDATE products SET stock = stock - ? WHERE id = ?').run(i.quantity, i.product_id);
      }
    });
    deductStock(resolvedItems);

    const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);

    // Initialize payment
    let paymentData = null;
    if (customer_email) {
      try {
        const payResult = await initializePayment({
          email: customer_email,
          amount: totalAmount,
          reference: orderNumber,
          name: customer_name,
          phone: customer_phone,
          metadata: { order_id: orderId, order_number: orderNumber }
        });
        paymentData = payResult;
      } catch (payErr) {
        console.error('Payment init error:', payErr.message);
      }
    }

    // Send email alerts (non-blocking)
    sendOrderAlert(order, resolvedItems).catch(console.error);
    sendOrderConfirmation(order, resolvedItems).catch(console.error);

    res.status(201).json({
      success: true,
      message: 'Order placed successfully.',
      order: {
        id: orderId,
        order_number: orderNumber,
        total_amount: totalAmount,
        delivery_fee: deliveryFee,
        subtotal
      },
      payment: paymentData
    });
  } catch (err) {
    console.error('createOrder error:', err);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
}

// ── POST /api/orders/verify-payment ───────────────────────
async function verifyOrderPayment(req, res) {
  try {
    const { reference, transaction_id } = req.body;
    if (!reference) return res.status(400).json({ success: false, message: 'Reference required.' });

    const db = getDb();
    const order = db.prepare('SELECT * FROM orders WHERE order_number = ?').get(reference);
    if (!order) return res.status(404).json({ success: false, message: 'Order not found.' });

    const result = await verifyPayment(reference, transaction_id);

    let paymentSuccess = false;
    const provider = process.env.PAYMENT_PROVIDER || 'paystack';

    if (provider === 'paystack') {
      paymentSuccess = result.status === true && result.data && result.data.status === 'success';
    } else {
      paymentSuccess = result.status === 'success' && result.data && result.data.status === 'successful';
    }

    if (paymentSuccess) {
      db.prepare(`
        UPDATE orders SET payment_status = 'paid', order_status = 'confirmed', updated_at = datetime('now')
        WHERE id = ?
      `).run(order.id);
      res.json({ success: true, message: 'Payment verified.', order_number: reference });
    } else {
      db.prepare(`
        UPDATE orders SET payment_status = 'failed', updated_at = datetime('now') WHERE id = ?
      `).run(order.id);
      res.json({ success: false, message: 'Payment verification failed.' });
    }
  } catch (err) {
    console.error('verifyPayment error:', err);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
}

// ── GET /api/orders (admin) ────────────────────────────────
function getOrders(req, res) {
  try {
    const db = getDb();
    const { status, payment_status, page = 1, limit = 20, search } = req.query;

    let where = [];
    let params = [];

    if (status) { where.push('order_status = ?'); params.push(status); }
    if (payment_status) { where.push('payment_status = ?'); params.push(payment_status); }
    if (search) {
      where.push('(order_number LIKE ? OR customer_name LIKE ? OR customer_phone LIKE ?)');
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }

    const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const total = db.prepare(`SELECT COUNT(*) as count FROM orders ${whereClause}`).get(...params).count;
    const orders = db.prepare(
      `SELECT * FROM orders ${whereClause} ORDER BY created_at DESC LIMIT ? OFFSET ?`
    ).all(...params, parseInt(limit), offset);

    res.json({ success: true, orders, total, page: parseInt(page), limit: parseInt(limit) });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error.' });
  }
}

// ── GET /api/orders/:id ────────────────────────────────────
function getOrder(req, res) {
  try {
    const db = getDb();
    const order = db.prepare('SELECT * FROM orders WHERE id = ? OR order_number = ?')
                    .get(req.params.id, req.params.id);
    if (!order) return res.status(404).json({ success: false, message: 'Order not found.' });

    const items = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(order.id);
    res.json({ success: true, order, items });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error.' });
  }
}

// ── PUT /api/orders/:id/status (admin) ────────────────────
function updateOrderStatus(req, res) {
  try {
    const db = getDb();
    const { order_status, payment_status } = req.body;
    const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id);
    if (!order) return res.status(404).json({ success: false, message: 'Order not found.' });

    const validStatuses = ['pending', 'confirmed', 'processing', 'ready_for_delivery', 'shipped', 'delivered', 'cancelled'];
    if (order_status && !validStatuses.includes(order_status)) {
      return res.status(400).json({ success: false, message: 'Invalid order status.' });
    }

    db.prepare(`
      UPDATE orders SET
        order_status = COALESCE(?, order_status),
        payment_status = COALESCE(?, payment_status),
        updated_at = datetime('now')
      WHERE id = ?
    `).run(order_status || null, payment_status || null, req.params.id);

    // If marked delivered, update customer record
    if (order_status === 'delivered') {
      const updatedOrder = db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id);
      try { updateCustomerRecord(updatedOrder); } catch (e) { console.error('Customer update error:', e); }
    }

    const updated = db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id);
    res.json({ success: true, message: 'Order updated.', order: updated });
  } catch (err) {
    console.error('updateOrderStatus error:', err);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
}

module.exports = { createOrder, verifyOrderPayment, getOrders, getOrder, updateOrderStatus };
