// backend/routes/customers.js
const express = require('express');
const router = express.Router();
const { getCustomers, getCustomer } = require('../controllers/customerController');
const { requireAdmin } = require('../middleware/auth');

router.get('/', requireAdmin, getCustomers);
router.get('/:id', requireAdmin, getCustomer);

module.exports = router;
