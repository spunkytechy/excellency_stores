// backend/routes/orders.js
const express = require('express');
const router = express.Router();
const { createOrder, verifyOrderPayment, getOrders, getOrder, updateOrderStatus } = require('../controllers/orderController');
const { requireAdmin } = require('../middleware/auth');

// Public — customers place orders and verify payment
router.post('/', createOrder);
router.post('/verify-payment', verifyOrderPayment);
router.get('/:id', getOrder); // customers can look up their own order by number

// Admin
router.get('/', requireAdmin, getOrders);
router.put('/:id/status', requireAdmin, updateOrderStatus);

module.exports = router;
