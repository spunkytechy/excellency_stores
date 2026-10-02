// backend/controllers/complaintController.js

const { getDb } = require('../config/db');
const { v4: uuidv4 } = require('uuid');
const { sendComplaintAlert } = require('../services/emailService');

// ── POST /api/complaints ───────────────────────────────────
async function createComplaint(req, res) {
  try {
    const { customer_name, phone, email, order_id, complaint } = req.body;

    if (!customer_name || !phone || !complaint) {
      return res.status(400).json({ success: false, message: 'Name, phone, and complaint message are required.' });
    }

    const db = getDb();
    const id = uuidv4();

    db.prepare(`
      INSERT INTO complaints (id, customer_name, phone, email, order_id, complaint, status)
      VALUES (?, ?, ?, ?, ?, ?, 'new')
    `).run(id, customer_name, phone, email || null, order_id || null, complaint);

    const newComplaint = db.prepare('SELECT * FROM complaints WHERE id = ?').get(id);

    // Send email alert (non-blocking)
    sendComplaintAlert(newComplaint).catch(console.error);

    res.status(201).json({ success: true, message: 'Complaint submitted successfully.', complaint: newComplaint });
  } catch (err) {
    console.error('createComplaint error:', err);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
}

// ── GET /api/complaints (admin) ────────────────────────────
function getComplaints(req, res) {
  try {
    const db = getDb();
    const { status, search, page = 1, limit = 20 } = req.query;

    let where = [];
    let params = [];

    if (status) { where.push('status = ?'); params.push(status); }
    if (search) {
      where.push('(customer_name LIKE ? OR phone LIKE ? OR order_id LIKE ?)');
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }

    const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const total = db.prepare(`SELECT COUNT(*) as count FROM complaints ${whereClause}`).get(...params).count;
    const complaints = db.prepare(
      `SELECT * FROM complaints ${whereClause} ORDER BY created_at DESC LIMIT ? OFFSET ?`
    ).all(...params, parseInt(limit), offset);

    res.json({ success: true, complaints, total, page: parseInt(page), limit: parseInt(limit) });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error.' });
  }
}

// ── PUT /api/complaints/:id (admin) ───────────────────────
function updateComplaint(req, res) {
  try {
    const db = getDb();
    const { status } = req.body;
    const validStatuses = ['new', 'in_review', 'resolved', 'closed'];

    if (!validStatuses.includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid status.' });
    }

    const complaint = db.prepare('SELECT * FROM complaints WHERE id = ?').get(req.params.id);
    if (!complaint) return res.status(404).json({ success: false, message: 'Complaint not found.' });

    db.prepare("UPDATE complaints SET status = ?, updated_at = datetime('now') WHERE id = ?")
      .run(status, req.params.id);

    const updated = db.prepare('SELECT * FROM complaints WHERE id = ?').get(req.params.id);
    res.json({ success: true, message: 'Complaint updated.', complaint: updated });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error.' });
  }
}

function deleteComplaint(req, res) {
  try {
    const db = getDb();
    const complaint = db.prepare('SELECT * FROM complaints WHERE id = ?').get(req.params.id);
    if (!complaint) return res.status(404).json({ success: false, message: 'Complaint not found.' });

    db.prepare('DELETE FROM complaints WHERE id = ?').run(req.params.id);
    res.json({ success: true, message: 'Complaint deleted.' });
  } catch (err) {
    console.error('deleteComplaint error:', err);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
}

module.exports = { createComplaint, getComplaints, updateComplaint, deleteComplaint };
