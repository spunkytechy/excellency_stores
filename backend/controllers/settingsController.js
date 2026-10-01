// backend/controllers/settingsController.js

const { getDb } = require('../config/db');

// ── GET /api/settings ─────────────────────────────────────
function getSettings(req, res) {
  try {
    const db = getDb();
    const settings = db.prepare('SELECT * FROM store_settings WHERE id = 1').get();
    if (!settings) return res.status(404).json({ success: false, message: 'Settings not found.' });

    // Never expose secret payment keys to the frontend
    const safe = { ...settings };
    delete safe.paystack_secret_key;
    delete safe.flutterwave_secret_key;

    res.json({ success: true, settings: safe });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error.' });
  }
}

// ── GET /api/settings/public ─────────────────────────────
// Minimal settings safe for the storefront (no admin-only keys)
function getPublicSettings(req, res) {
  try {
    const db = getDb();
    const settings = db.prepare(
      'SELECT store_name, whatsapp_number, currency, currency_symbol, delivery_fee, free_delivery_threshold, paystack_public_key, flutterwave_public_key, payment_provider FROM store_settings WHERE id = 1'
    ).get();
    res.json({ success: true, settings });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error.' });
  }
}

// ── PUT /api/settings (admin) ─────────────────────────────
function updateSettings(req, res) {
  try {
    const db = getDb();
    const current = db.prepare('SELECT * FROM store_settings WHERE id = 1').get();
    if (!current) return res.status(404).json({ success: false, message: 'Settings not found.' });

    const {
      store_name, store_email, whatsapp_number, phone, address,
      order_notifications, complaint_notifications,
      payment_provider, currency, currency_symbol,
      delivery_fee, free_delivery_threshold, delivery_regions,
      paystack_public_key, flutterwave_public_key
    } = req.body;

    db.prepare(`
      UPDATE store_settings SET
        store_name = COALESCE(?, store_name),
        store_email = COALESCE(?, store_email),
        whatsapp_number = COALESCE(?, whatsapp_number),
        phone = COALESCE(?, phone),
        address = COALESCE(?, address),
        order_notifications = COALESCE(?, order_notifications),
        complaint_notifications = COALESCE(?, complaint_notifications),
        payment_provider = COALESCE(?, payment_provider),
        currency = COALESCE(?, currency),
        currency_symbol = COALESCE(?, currency_symbol),
        delivery_fee = COALESCE(?, delivery_fee),
        free_delivery_threshold = COALESCE(?, free_delivery_threshold),
        delivery_regions = COALESCE(?, delivery_regions),
        paystack_public_key = COALESCE(?, paystack_public_key),
        flutterwave_public_key = COALESCE(?, flutterwave_public_key),
        updated_at = datetime('now')
      WHERE id = 1
    `).run(
      store_name || null, store_email || null, whatsapp_number || null,
      phone || null, address || null,
      order_notifications !== undefined ? (order_notifications ? 1 : 0) : null,
      complaint_notifications !== undefined ? (complaint_notifications ? 1 : 0) : null,
      payment_provider || null, currency || null, currency_symbol || null,
      delivery_fee !== undefined ? parseFloat(delivery_fee) : null,
      free_delivery_threshold !== undefined ? parseFloat(free_delivery_threshold) : null,
      delivery_regions !== undefined ? (typeof delivery_regions === 'string' ? delivery_regions : JSON.stringify(delivery_regions)) : null,
      paystack_public_key || null, flutterwave_public_key || null
    );

    const updated = db.prepare('SELECT * FROM store_settings WHERE id = 1').get();
    delete updated.paystack_secret_key;
    delete updated.flutterwave_secret_key;

    res.json({ success: true, message: 'Settings updated.', settings: updated });
  } catch (err) {
    console.error('updateSettings error:', err);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
}

module.exports = { getSettings, getPublicSettings, updateSettings };
