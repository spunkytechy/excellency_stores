// backend/services/paymentService.js
// Payment gateway abstraction — Paystack & Flutterwave

const https = require('https');

// ── Paystack ───────────────────────────────────────────────
function paystackRequest(method, path, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const options = {
      hostname: 'api.paystack.co',
      port: 443,
      path,
      method,
      headers: {
        Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
        'Content-Type': 'application/json',
        ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {})
      }
    };

    const req = https.request(options, (res) => {
      let raw = '';
      res.on('data', (chunk) => { raw += chunk; });
      res.on('end', () => {
        try { resolve(JSON.parse(raw)); }
        catch (e) { reject(e); }
      });
    });

    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

async function initializePaystack({ email, amount, reference, metadata }) {
  return paystackRequest('POST', '/transaction/initialize', {
    email,
    amount: Math.round(amount * 100), // kobo
    reference,
    metadata,
    callback_url: `${process.env.FRONTEND_URL}/checkout.html?verify=true`
  });
}

async function verifyPaystack(reference) {
  return paystackRequest('GET', `/transaction/verify/${encodeURIComponent(reference)}`);
}

// ── Flutterwave ────────────────────────────────────────────
function flutterwaveRequest(method, path, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const options = {
      hostname: 'api.flutterwave.com',
      port: 443,
      path: `/v3${path}`,
      method,
      headers: {
        Authorization: `Bearer ${process.env.FLUTTERWAVE_SECRET_KEY}`,
        'Content-Type': 'application/json',
        ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {})
      }
    };

    const req = https.request(options, (res) => {
      let raw = '';
      res.on('data', (chunk) => { raw += chunk; });
      res.on('end', () => {
        try { resolve(JSON.parse(raw)); }
        catch (e) { reject(e); }
      });
    });

    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

async function initializeFlutterwave({ email, amount, reference, name, phone, metadata }) {
  return flutterwaveRequest('POST', '/payments', {
    tx_ref: reference,
    amount,
    currency: 'NGN',
    redirect_url: `${process.env.FRONTEND_URL}/checkout.html?verify=true`,
    customer: { email, name, phonenumber: phone },
    meta: metadata,
    customizations: {
      title: "KISSOWRA'S BEAUTY",
      logo: `${process.env.FRONTEND_URL}/images/logo.png`
    }
  });
}

async function verifyFlutterwave(transactionId) {
  return flutterwaveRequest('GET', `/transactions/${transactionId}/verify`);
}

// ── Unified API ────────────────────────────────────────────
async function initializePayment(payload) {
  const provider = process.env.PAYMENT_PROVIDER || 'paystack';
  if (provider === 'flutterwave') return initializeFlutterwave(payload);
  return initializePaystack(payload);
}

async function verifyPayment(reference, transactionId) {
  const provider = process.env.PAYMENT_PROVIDER || 'paystack';
  if (provider === 'flutterwave') return verifyFlutterwave(transactionId || reference);
  return verifyPaystack(reference);
}

module.exports = { initializePayment, verifyPayment };
