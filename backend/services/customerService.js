// backend/services/customerService.js
// Business logic: customer status promotion after 3 completed purchases

const { getDb } = require('../config/db');
const { v4: uuidv4 } = require('uuid');

const CUSTOMER_THRESHOLD = 3;

/**
 * Called after an order is marked as "delivered".
 * Finds or creates a customer record and checks if they qualify for full customer status.
 */
function updateCustomerRecord(order) {
  const db = getDb();

  // Find by phone (primary identifier) or email
  let customer = db.prepare(
    'SELECT * FROM customers WHERE phone = ? OR (email IS NOT NULL AND email = ?)'
  ).get(order.customer_phone, order.customer_email || '');

  if (!customer) {
    // Create a new prospect record
    const id = uuidv4();
    db.prepare(`
      INSERT INTO customers (id, name, phone, email, completed_purchases, total_spent, last_purchase, customer_status)
      VALUES (?, ?, ?, ?, 1, ?, datetime('now'), ?)
    `).run(
      id,
      order.customer_name,
      order.customer_phone,
      order.customer_email || null,
      order.total_amount,
      'new_buyer'
    );
    customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(id);
  } else {
    // Increment purchase count
    const newCount = customer.completed_purchases + 1;
    const newStatus = newCount >= CUSTOMER_THRESHOLD ? 'customer' :
                      newCount >= 2 ? 'returning_buyer' : 'new_buyer';

    db.prepare(`
      UPDATE customers
      SET completed_purchases = ?,
          total_spent = total_spent + ?,
          last_purchase = datetime('now'),
          customer_status = ?,
          updated_at = datetime('now')
      WHERE id = ?
    `).run(newCount, order.total_amount, newStatus, customer.id);

    customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(customer.id);
  }

  return customer;
}

module.exports = { updateCustomerRecord };
