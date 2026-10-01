// backend/server.js
// KISSOWRA'S STORES — Express API Server

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

const express  = require('express');
const cors     = require('cors');
const helmet   = require('helmet');
const morgan   = require('morgan');
const path     = require('path');
const rateLimit = require('express-rate-limit');

// Initialise DB (creates tables + seeds defaults on first run)
require('./config/initDb');

const app = express();

// ── Security ───────────────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: false // allow inline styles/scripts for the frontend
}));

// ── CORS ───────────────────────────────────────────────────
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true
}));

// ── Rate limiting ──────────────────────────────────────────
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many requests. Please try again later.' }
});
app.use('/api/', apiLimiter);

// ── Body parsing ───────────────────────────────────────────
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ── Logging ────────────────────────────────────────────────
if (process.env.NODE_ENV !== 'test') {
  app.use(morgan('dev'));
}

// ── Static files ───────────────────────────────────────────
// Serve uploaded product images
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
// Serve frontend
app.use(express.static(path.join(__dirname, '../frontend')));

// ── API Routes ─────────────────────────────────────────────
app.use('/api/auth',       require('./routes/auth'));
app.use('/api/products',   require('./routes/products'));
app.use('/api/orders',     require('./routes/orders'));
app.use('/api/customers',  require('./routes/customers'));
app.use('/api/complaints', require('./routes/complaints'));
app.use('/api/analytics',  require('./routes/analytics'));
app.use('/api/settings',   require('./routes/settings'));

// ── Health check ───────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({ success: true, message: "KISSOWRA'S STORES API is running.", timestamp: new Date() });
});

// ── SPA fallback — serve frontend for all non-API routes ──
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

// ── Global error handler ───────────────────────────────────
app.use((err, req, res, _next) => {
  console.error('Unhandled error:', err);

  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ success: false, message: 'File too large. Maximum size is 5MB.' });
  }

  res.status(500).json({ success: false, message: err.message || 'Internal server error.' });
});

// ── Start ─────────────────────────────────────────────────
const PORT = parseInt(process.env.PORT || '3000');
app.listen(PORT, () => {
  console.log('');
  console.log("  ██╗  ██╗██╗███████╗███████╗ ██████╗ ██╗    ██╗██████╗  █████╗ ");
  console.log("  ██║ ██╔╝██║██╔════╝██╔════╝██╔═══██╗██║    ██║██╔══██╗██╔══██╗");
  console.log("  █████╔╝ ██║███████╗███████╗██║   ██║██║ █╗ ██║██████╔╝███████║");
  console.log("  ██╔═██╗ ██║╚════██║╚════██║██║   ██║██║███╗██║██╔══██╗██╔══██║");
  console.log("  ██║  ██╗██║███████║███████║╚██████╔╝╚███╔███╔╝██║  ██║██║  ██║");
  console.log("  ╚═╝  ╚═╝╚═╝╚══════╝╚══════╝ ╚═════╝  ╚══╝╚══╝ ╚═╝  ╚═╝╚═╝  ╚═╝");
  console.log('');
  console.log(`  🛍️  KISSOWRA'S STORES API running at http://localhost:${PORT}`);
  console.log(`  📦  Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log('');
});

module.exports = app;
