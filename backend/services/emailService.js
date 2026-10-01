// backend/services/emailService.js
// Handles all outgoing email notifications

const { createTransporter } = require('../config/email');

const OWNER_EMAIL = process.env.OWNER_EMAIL || 'owner@kissowrastores.com';
const STORE_NAME  = "KISSOWRA'S STORES";

// ── Helper: format currency ────────────────────────────────
function fmt(amount) {
  return `₦${Number(amount || 0).toLocaleString('en-NG', { minimumFractionDigits: 2 })}`;
}

// ── Order notification to store owner ─────────────────────
async function sendOrderAlert(order, items) {
  const transporter = createTransporter();

  const itemRows = items.map(i =>
    `<tr>
      <td style="padding:8px;border-bottom:1px solid #f0e6ec;">${i.product_name}</td>
      <td style="padding:8px;border-bottom:1px solid #f0e6ec;text-align:center;">${i.quantity}</td>
      <td style="padding:8px;border-bottom:1px solid #f0e6ec;text-align:right;">${fmt(i.price)}</td>
      <td style="padding:8px;border-bottom:1px solid #f0e6ec;text-align:right;">${fmt(i.price * i.quantity)}</td>
    </tr>`
  ).join('');

  const html = `
  <div style="font-family:Georgia,serif;max-width:600px;margin:auto;background:#fff;border:1px solid #f0e6ec;">
    <div style="background:#8b1a4a;padding:24px;text-align:center;">
      <h1 style="color:#fff;margin:0;font-size:22px;letter-spacing:2px;">${STORE_NAME}</h1>
      <p style="color:#f7c5d9;margin:6px 0 0;">New Order Received!</p>
    </div>
    <div style="padding:24px;">
      <p><strong>Order #:</strong> ${order.order_number}</p>
      <p><strong>Date:</strong> ${new Date(order.created_at).toLocaleString('en-NG')}</p>
      <p><strong>Payment Status:</strong> ${order.payment_status.toUpperCase()}</p>
      <hr style="border:none;border-top:1px solid #f0e6ec;">
      <h3 style="color:#8b1a4a;">Customer Details</h3>
      <p><strong>Name:</strong> ${order.customer_name}</p>
      <p><strong>Phone:</strong> ${order.customer_phone}</p>
      <p><strong>Email:</strong> ${order.customer_email || 'N/A'}</p>
      <p><strong>Delivery Address:</strong> ${order.delivery_address}</p>
      ${order.delivery_info ? `<p><strong>Additional Info:</strong> ${order.delivery_info}</p>` : ''}
      <hr style="border:none;border-top:1px solid #f0e6ec;">
      <h3 style="color:#8b1a4a;">Order Items</h3>
      <table style="width:100%;border-collapse:collapse;font-size:14px;">
        <thead>
          <tr style="background:#fdf0f5;">
            <th style="padding:8px;text-align:left;">Product</th>
            <th style="padding:8px;text-align:center;">Qty</th>
            <th style="padding:8px;text-align:right;">Unit Price</th>
            <th style="padding:8px;text-align:right;">Subtotal</th>
          </tr>
        </thead>
        <tbody>${itemRows}</tbody>
      </table>
      <div style="text-align:right;margin-top:16px;">
        <p>Subtotal: <strong>${fmt(order.subtotal)}</strong></p>
        <p>Delivery Fee: <strong>${fmt(order.delivery_fee)}</strong></p>
        <p style="font-size:18px;color:#8b1a4a;">Total: <strong>${fmt(order.total_amount)}</strong></p>
      </div>
    </div>
    <div style="background:#fdf0f5;padding:16px;text-align:center;font-size:12px;color:#999;">
      ${STORE_NAME} — Automated Order Alert
    </div>
  </div>`;

  try {
    await transporter.sendMail({
      from: `"${STORE_NAME}" <${process.env.EMAIL_USER}>`,
      to: OWNER_EMAIL,
      subject: `[NEW ORDER] #${order.order_number} — ${fmt(order.total_amount)}`,
      html
    });
  } catch (err) {
    console.error('Order email failed:', err.message);
  }
}

// ── Complaint notification to store owner ─────────────────
async function sendComplaintAlert(complaint) {
  const transporter = createTransporter();

  const html = `
  <div style="font-family:Georgia,serif;max-width:600px;margin:auto;background:#fff;border:1px solid #f0e6ec;">
    <div style="background:#8b1a4a;padding:24px;text-align:center;">
      <h1 style="color:#fff;margin:0;font-size:22px;letter-spacing:2px;">${STORE_NAME}</h1>
      <p style="color:#f7c5d9;margin:6px 0 0;">New Complaint Received</p>
    </div>
    <div style="padding:24px;">
      <p><strong>Complaint ID:</strong> ${complaint.id}</p>
      <p><strong>Date:</strong> ${new Date(complaint.created_at).toLocaleString('en-NG')}</p>
      <hr style="border:none;border-top:1px solid #f0e6ec;">
      <h3 style="color:#8b1a4a;">Customer Details</h3>
      <p><strong>Name:</strong> ${complaint.customer_name}</p>
      <p><strong>Phone:</strong> ${complaint.phone}</p>
      <p><strong>Email:</strong> ${complaint.email || 'N/A'}</p>
      ${complaint.order_id ? `<p><strong>Order ID:</strong> ${complaint.order_id}</p>` : ''}
      <hr style="border:none;border-top:1px solid #f0e6ec;">
      <h3 style="color:#8b1a4a;">Complaint</h3>
      <p style="background:#fdf0f5;padding:16px;border-radius:4px;">${complaint.complaint}</p>
    </div>
    <div style="background:#fdf0f5;padding:16px;text-align:center;font-size:12px;color:#999;">
      ${STORE_NAME} — Automated Complaint Alert
    </div>
  </div>`;

  try {
    await transporter.sendMail({
      from: `"${STORE_NAME}" <${process.env.EMAIL_USER}>`,
      to: OWNER_EMAIL,
      subject: `[COMPLAINT] From ${complaint.customer_name}`,
      html
    });
  } catch (err) {
    console.error('Complaint email failed:', err.message);
  }
}

// ── Order confirmation to customer ─────────────────────────
async function sendOrderConfirmation(order, items) {
  if (!order.customer_email) return;

  const transporter = createTransporter();

  const itemRows = items.map(i =>
    `<tr>
      <td style="padding:8px;border-bottom:1px solid #f0e6ec;">${i.product_name}${i.variant ? ` (${i.variant})` : ''}</td>
      <td style="padding:8px;border-bottom:1px solid #f0e6ec;text-align:center;">${i.quantity}</td>
      <td style="padding:8px;border-bottom:1px solid #f0e6ec;text-align:right;">${fmt(i.price * i.quantity)}</td>
    </tr>`
  ).join('');

  const html = `
  <div style="font-family:Georgia,serif;max-width:600px;margin:auto;background:#fff;border:1px solid #f0e6ec;">
    <div style="background:#8b1a4a;padding:24px;text-align:center;">
      <h1 style="color:#fff;margin:0;font-size:22px;letter-spacing:2px;">${STORE_NAME}</h1>
      <p style="color:#f7c5d9;margin:6px 0 0;">Order Confirmed ✨</p>
    </div>
    <div style="padding:24px;">
      <p>Hi <strong>${order.customer_name}</strong>, thank you for your order!</p>
      <p>Your order <strong>#${order.order_number}</strong> has been received and is being processed.</p>
      <table style="width:100%;border-collapse:collapse;font-size:14px;margin-top:16px;">
        <thead>
          <tr style="background:#fdf0f5;">
            <th style="padding:8px;text-align:left;">Product</th>
            <th style="padding:8px;text-align:center;">Qty</th>
            <th style="padding:8px;text-align:right;">Amount</th>
          </tr>
        </thead>
        <tbody>${itemRows}</tbody>
      </table>
      <div style="text-align:right;margin-top:16px;">
        <p>Delivery Fee: <strong>${fmt(order.delivery_fee)}</strong></p>
        <p style="font-size:18px;color:#8b1a4a;">Total: <strong>${fmt(order.total_amount)}</strong></p>
      </div>
      <p style="margin-top:24px;">We'll keep you updated on your order status. Questions? Chat us on WhatsApp!</p>
    </div>
    <div style="background:#fdf0f5;padding:16px;text-align:center;font-size:12px;color:#999;">
      ${STORE_NAME} — Shop Beauty. Shop Fashion.
    </div>
  </div>`;

  try {
    await transporter.sendMail({
      from: `"${STORE_NAME}" <${process.env.EMAIL_USER}>`,
      to: order.customer_email,
      subject: `Order Confirmed — #${order.order_number}`,
      html
    });
  } catch (err) {
    console.error('Customer confirmation email failed:', err.message);
  }
}

module.exports = { sendOrderAlert, sendComplaintAlert, sendOrderConfirmation };
