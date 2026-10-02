// backend/routes/auth.js
const express = require('express');
const router  = express.Router();
const {
  register, login, adminLogin, me, logout,
  forgotPassword, resetPassword,
  changePassword, updateProfile
} = require('../controllers/authController');
const { requireAuth } = require('../middleware/auth');

// Public
router.post('/register',       register);
router.post('/login',          login);
router.post('/admin-login',    adminLogin);
router.post('/logout',         logout);
router.post('/forgot-password',forgotPassword);
router.post('/reset-password', resetPassword);

// Protected (any logged-in user)
router.get('/me',                     requireAuth, me);
router.post('/change-password',       requireAuth, changePassword);
router.put('/profile',                requireAuth, updateProfile);

module.exports = router;
