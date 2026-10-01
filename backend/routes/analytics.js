// backend/routes/analytics.js
const express = require('express');
const router = express.Router();
const { getDaily, getMonthly, getYearly, getTrending, getSummary } = require('../controllers/analyticsController');
const { requireAdmin } = require('../middleware/auth');

router.get('/summary', requireAdmin, getSummary);
router.get('/daily', requireAdmin, getDaily);
router.get('/monthly', requireAdmin, getMonthly);
router.get('/yearly', requireAdmin, getYearly);
router.get('/trending', requireAdmin, getTrending);

module.exports = router;
