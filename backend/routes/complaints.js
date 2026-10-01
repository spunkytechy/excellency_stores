// backend/routes/complaints.js
const express = require('express');
const router = express.Router();
const { createComplaint, getComplaints, updateComplaint } = require('../controllers/complaintController');
const { requireAdmin } = require('../middleware/auth');

// Public — any customer can submit a complaint
router.post('/', createComplaint);

// Admin
router.get('/', requireAdmin, getComplaints);
router.put('/:id', requireAdmin, updateComplaint);

module.exports = router;
