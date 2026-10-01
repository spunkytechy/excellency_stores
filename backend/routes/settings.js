// backend/routes/settings.js
const express = require('express');
const router = express.Router();
const { getSettings, getPublicSettings, updateSettings } = require('../controllers/settingsController');
const { requireAdmin } = require('../middleware/auth');

router.get('/public', getPublicSettings);      // storefront safe endpoint
router.get('/', requireAdmin, getSettings);
router.put('/', requireAdmin, updateSettings);

module.exports = router;
