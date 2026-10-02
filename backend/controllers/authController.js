// backend/controllers/authController.js

const { getDb } = require('../config/db');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const { createTransporter } = require('../config/email');

// ── Helpers ────────────────────────────────────────────────
function signToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email, role: user.role, name: user.name },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );
}

function safeUser(user) {
  return { id: user.id, name: user.name, email: user.email, role: user.role, phone: user.phone || null };
}

// ── POST /api/auth/register ────────────────────────────────
async function register(req, res) {
  try {
    const { name, email, password, phone } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ success: false, message: 'Name, email and password are required.' });
    }
    if (password.length < 8) {
      return res.status(400).json({ success: false, message: 'Password must be at least 8 characters.' });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ success: false, message: 'Please enter a valid email address.' });
    }

    const db = getDb();
    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email.toLowerCase().trim());
    if (existing) {
      return res.status(409).json({ success: false, message: 'An account with this email already exists.' });
    }

    const hash = await bcrypt.hash(password, 12);
    const id   = uuidv4();

    db.prepare(`
      INSERT INTO users (id, name, email, password_hash, role, phone, is_verified)
      VALUES (?, ?, ?, ?, 'customer', ?, 1)
    `).run(id, name.trim(), email.toLowerCase().trim(), hash, phone?.trim() || null);

    const user  = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
    const token = signToken(user);

    // Send welcome email (non-blocking)
    sendWelcomeEmail(user).catch(() => {});

    res.status(201).json({
      success: true,
      message: 'Account created successfully! Welcome to KISSOWRA\'S BEAUTY.',
      token,
      user: safeUser(user)
    });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ success: false, message: 'Server error. Please try again.' });
  }
}

// ── POST /api/auth/login ───────────────────────────────────
function login(req, res) {
  return authenticate(req, res);
}

function adminLogin(req, res) {
  return authenticate(req, res, 'admin');
}

async function authenticate(req, res, requiredRole = null) {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Email and password are required.' });
    }

    const db   = getDb();
    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email.toLowerCase().trim());

    if (!user || (requiredRole && user.role !== requiredRole)) {
      return res.status(401).json({ success: false, message: 'Invalid email or password.' });
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ success: false, message: 'Invalid email or password.' });
    }

    const token = signToken(user);

    res.json({
      success: true,
      message: 'Welcome back!',
      token,
      user: safeUser(user)
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
}

// ── GET /api/auth/me ───────────────────────────────────────
function me(req, res) {
  const db   = getDb();
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (!user) return res.status(404).json({ success: false, message: 'User not found.' });
  res.json({ success: true, user: safeUser(user) });
}

// ── POST /api/auth/logout ──────────────────────────────────
// JWT is stateless — client drops the token. This endpoint exists
// so the frontend has a clean API call to call before clearing storage.
function logout(req, res) {
  res.json({ success: true, message: 'Logged out successfully.' });
}

// ── POST /api/auth/forgot-password ────────────────────────
async function forgotPassword(req, res) {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ success: false, message: 'Email is required.' });
    }

    const db   = getDb();
    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email.toLowerCase().trim());

    // Always respond with success — never reveal whether email exists
    if (!user) {
      return res.json({ success: true, message: 'If that email is registered, a reset link has been sent.' });
    }

    // Generate a short-lived token (1 hour)
    const resetToken   = uuidv4().replace(/-/g, '');
    const resetExpires = new Date(Date.now() + 60 * 60 * 1000).toISOString();

    db.prepare(`
      UPDATE users SET reset_token = ?, reset_token_expires = ? WHERE id = ?
    `).run(resetToken, resetExpires, user.id);

    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    const resetUrl    = `${frontendUrl}/reset-password.html?token=${resetToken}`;

    await sendResetEmail(user, resetUrl);

    res.json({ success: true, message: 'If that email is registered, a reset link has been sent.' });
  } catch (err) {
    console.error('Forgot password error:', err);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
}

// ── POST /api/auth/reset-password ─────────────────────────
async function resetPassword(req, res) {
  try {
    const { token, password } = req.body;

    if (!token || !password) {
      return res.status(400).json({ success: false, message: 'Token and new password are required.' });
    }
    if (password.length < 8) {
      return res.status(400).json({ success: false, message: 'Password must be at least 8 characters.' });
    }

    const db   = getDb();
    const user = db.prepare('SELECT * FROM users WHERE reset_token = ?').get(token);

    if (!user) {
      return res.status(400).json({ success: false, message: 'Invalid or expired reset link.' });
    }

    if (new Date(user.reset_token_expires) < new Date()) {
      return res.status(400).json({ success: false, message: 'Reset link has expired. Please request a new one.' });
    }

    const hash = await bcrypt.hash(password, 12);
    db.prepare(`
      UPDATE users
      SET password_hash = ?, reset_token = NULL, reset_token_expires = NULL, updated_at = datetime('now')
      WHERE id = ?
    `).run(hash, user.id);

    res.json({ success: true, message: 'Password reset successfully. You can now sign in.' });
  } catch (err) {
    console.error('Reset password error:', err);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
}

// ── POST /api/auth/change-password ────────────────────────
async function changePassword(req, res) {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ success: false, message: 'Both passwords are required.' });
    }
    if (newPassword.length < 8) {
      return res.status(400).json({ success: false, message: 'New password must be at least 8 characters.' });
    }

    const db   = getDb();
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);

    const valid = await bcrypt.compare(currentPassword, user.password_hash);
    if (!valid) {
      return res.status(401).json({ success: false, message: 'Current password is incorrect.' });
    }

    const hash = await bcrypt.hash(newPassword, 12);
    db.prepare("UPDATE users SET password_hash = ?, updated_at = datetime('now') WHERE id = ?")
      .run(hash, req.user.id);

    res.json({ success: true, message: 'Password updated successfully.' });
  } catch (err) {
    console.error('Change password error:', err);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
}

// ── PUT /api/auth/profile ──────────────────────────────────
async function updateProfile(req, res) {
  try {
    const { name, phone } = req.body;
    if (!name) {
      return res.status(400).json({ success: false, message: 'Name is required.' });
    }

    const db = getDb();
    db.prepare(`
      UPDATE users SET name = ?, phone = ?, updated_at = datetime('now') WHERE id = ?
    `).run(name.trim(), phone?.trim() || null, req.user.id);

    const updated = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
    res.json({ success: true, message: 'Profile updated.', user: safeUser(updated) });
  } catch (err) {
    console.error('Update profile error:', err);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
}

// ── Email Helpers ──────────────────────────────────────────
async function sendWelcomeEmail(user) {
  const transporter = createTransporter();
  const html = `
  <div style="font-family:Georgia,serif;max-width:580px;margin:auto;background:#fff;border:1px solid #f0e6ec;">
    <div style="background:#8b1a4a;padding:28px;text-align:center;">
      <h1 style="color:#fff;margin:0;font-size:22px;letter-spacing:2px;">KISSOWRA'S BEAUTY</h1>
      <p style="color:#f7c5d9;margin:6px 0 0;font-size:14px;">Welcome to the family! 💋</p>
    </div>
    <div style="padding:32px;">
      <h2 style="color:#8b1a4a;font-size:20px;">Hi ${user.name},</h2>
      <p style="color:#555;line-height:1.7;">Your account has been created successfully. You can now shop our full range of premium lip gloss and fashion pieces.</p>
      <div style="text-align:center;margin:28px 0;">
        <a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}/shop.html"
           style="background:#8b1a4a;color:#fff;padding:14px 32px;border-radius:999px;text-decoration:none;font-weight:600;letter-spacing:.05em;">
          Start Shopping →
        </a>
      </div>
      <p style="color:#999;font-size:13px;">If you didn't create this account, you can safely ignore this email.</p>
    </div>
    <div style="background:#fdf0f5;padding:14px;text-align:center;font-size:11px;color:#aaa;">
      © ${new Date().getFullYear()} KISSOWRA'S BEAUTY · Beauty · Fashion · Elegance
    </div>
  </div>`;

  await transporter.sendMail({
    from: `"KISSOWRA'S BEAUTY" <${process.env.EMAIL_USER}>`,
    to:   user.email,
    subject: `Welcome to KISSOWRA'S BEAUTY, ${user.name}! 💋`,
    html
  });
}

async function sendResetEmail(user, resetUrl) {
  const transporter = createTransporter();
  const html = `
  <div style="font-family:Georgia,serif;max-width:580px;margin:auto;background:#fff;border:1px solid #f0e6ec;">
    <div style="background:#8b1a4a;padding:28px;text-align:center;">
      <h1 style="color:#fff;margin:0;font-size:22px;letter-spacing:2px;">KISSOWRA'S BEAUTY</h1>
      <p style="color:#f7c5d9;margin:6px 0 0;font-size:14px;">Password Reset Request</p>
    </div>
    <div style="padding:32px;">
      <h2 style="color:#8b1a4a;font-size:20px;">Hi ${user.name},</h2>
      <p style="color:#555;line-height:1.7;">We received a request to reset your password. Click the button below to choose a new one. This link expires in <strong>1 hour</strong>.</p>
      <div style="text-align:center;margin:28px 0;">
        <a href="${resetUrl}"
           style="background:#8b1a4a;color:#fff;padding:14px 32px;border-radius:999px;text-decoration:none;font-weight:600;letter-spacing:.05em;">
          Reset My Password
        </a>
      </div>
      <p style="color:#999;font-size:13px;">If you didn't request a password reset, you can safely ignore this email. Your password won't change.</p>
      <p style="color:#bbb;font-size:11px;word-break:break-all;">Or copy this link: ${resetUrl}</p>
    </div>
    <div style="background:#fdf0f5;padding:14px;text-align:center;font-size:11px;color:#aaa;">
      © ${new Date().getFullYear()} KISSOWRA'S BEAUTY
    </div>
  </div>`;

  await transporter.sendMail({
    from: `"KISSOWRA'S BEAUTY" <${process.env.EMAIL_USER}>`,
    to:   user.email,
    subject: 'Reset your KISSOWRA\'S BEAUTY password',
    html
  });
}

module.exports = { register, login, adminLogin, me, logout, forgotPassword, resetPassword, changePassword, updateProfile };
