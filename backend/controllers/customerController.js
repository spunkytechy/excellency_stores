// backend/controllers/customerController.js

const { getDb } = require('../config/db');

// ── GET /api/customers (admin) ─────────────────────────────
function getCustomers(req, res) {
  try {
    const db = getDb();
    const { status, search, page = 1, limit = 20 } = req.query;

    let where = [];
    let params = [];

    if (status) { where.push('customer_status = ?'); params.push(status); }
    if (search) {
      where.push('(name LIKE ? OR phone LIKE ? OR email LIKE ?)');
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }

    const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const total = db.prepare(`SELECT COUNT(*) as count FROM customers ${whereClause}`).get(...params).count;
    const customers = db.prepare(
      `SELECT * FROM customers ${whereClause} ORDER BY created_at DESC LIMIT ? OFFSET ?`
    ).all(...params, parseInt(limit), offset);

    res.json({ success: true, customers, total, page: parseInt(page), limit: parseInt(limit) });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error.' });
  }
}

// ── GET /api/customers/:id (admin) ────────────────────────
function getCustomer(req, res) {
  try {
    const db = getDb();
    const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(req.params.id);
    if (!customer) return res.status(404).json({ success: false, message: 'Customer not found.' });

    // Get their order history
    const orders = db.prepare(
      "SELECT * FROM orders WHERE customer_phone = ? ORDER BY created_at DESC LIMIT 20"
    ).all(customer.phone);

    res.json({ success: true, customer, orders });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error.' });
  }
}

module.exports = { getCustomers, getCustomer };
