/* ============================================================
   KISSOWRA'S BEAUTY — auth.js
   Admin login page + token-based session management
   ============================================================ */

'use strict';

// ── Token Helpers ──────────────────────────────────────────
const Auth = {
  getToken()  { return localStorage.getItem('kws_admin_token'); },
  getUser()   {
    try { return JSON.parse(localStorage.getItem('kws_admin_user') || 'null'); }
    catch { return null; }
  },
  setSession(token, user) {
    localStorage.setItem('kws_admin_token', token);
    localStorage.setItem('kws_admin_user', JSON.stringify(user));
  },
  clearSession() {
    localStorage.removeItem('kws_admin_token');
    localStorage.removeItem('kws_admin_user');
  },
  isLoggedIn() { return !!this.getToken(); }
};

// ── Guard: redirect to login if not authenticated ──────────
function requireAdminAuth() {
  if (!Auth.isLoggedIn() || Auth.getUser()?.role !== 'admin') {
    Auth.clearSession();
    window.location.href = '../login.html';
    return false;
  }
  return true;
}

// ── Login Page ─────────────────────────────────────────────
function initLoginPage() {
  // Already logged in? Go to dashboard
  if (Auth.isLoggedIn()) {
    if (Auth.getUser()?.role === 'admin') {
      window.location.href = 'admin/dashboard.html';
      return;
    }
    Auth.clearSession();
  }

  const form       = document.getElementById('loginForm');
  const loginBtn   = document.getElementById('loginBtn');
  const errorBox   = document.getElementById('loginError');
  const errorMsg   = document.getElementById('loginErrorMsg');
  const pwField    = document.getElementById('loginPassword');
  const togglePw   = document.getElementById('togglePassword');
  const eyeIcon    = document.getElementById('eyeIcon');
  const forgotBtn  = document.getElementById('forgotPwBtn');
  const closeModal_= document.getElementById('closeForgotModal');
  const forgotClose= document.getElementById('forgotModalClose');

  // Toggle password visibility
  if (togglePw && pwField) {
    togglePw.addEventListener('click', () => {
      const isText = pwField.type === 'text';
      pwField.type = isText ? 'password' : 'text';
      if (eyeIcon) eyeIcon.setAttribute('data-feather', isText ? 'eye' : 'eye-off');
      if (typeof feather !== 'undefined') feather.replace();
    });
  }

  // Forgot password modal
  if (forgotBtn) forgotBtn.addEventListener('click', (e) => { e.preventDefault(); openModal('forgotModal'); });
  if (closeModal_) closeModal_.addEventListener('click', () => closeModal('forgotModal'));
  if (forgotClose) forgotClose.addEventListener('click', () => closeModal('forgotModal'));

  // Login form submit
  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (errorBox) errorBox.classList.remove('show');

      const email    = document.getElementById('loginEmail')?.value.trim();
      const password = pwField?.value;

      if (!email || !password) {
        showError('Please enter your email and password.');
        return;
      }

      loginBtn.disabled    = true;
      loginBtn.textContent = 'Signing in…';

      try {
        const res  = await fetch('/api/auth/admin-login', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ email, password })
        });
        const data = await res.json();

        if (data.success && data.user?.role === 'admin') {
          Auth.setSession(data.token, data.user);
          window.location.href = 'admin/dashboard.html';
        } else {
          showError(data.message || 'Invalid credentials.');
        }
      } catch {
        showError('Network error. Please try again.');
      } finally {
        loginBtn.disabled    = false;
        loginBtn.textContent = 'Sign In';
      }
    });
  }

  function showError(msg) {
    if (errorBox) errorBox.classList.add('show');
    if (errorMsg) errorMsg.textContent = msg;
  }
}

// ── Admin Session Initialiser (called on every admin page) ─
function initAdminSession() {
  if (!requireAdminAuth()) return false;

  const user = Auth.getUser();
  if (!user) return false;

  // Populate sidebar user info
  const nameEl   = document.getElementById('adminName');
  const avatarEl = document.getElementById('adminAvatar');
  if (nameEl)   nameEl.textContent   = user.name || 'Admin';
  if (avatarEl) avatarEl.textContent = (user.name || 'A').charAt(0).toUpperCase();

  // Logout button
  const logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
      Auth.clearSession();
      window.location.href = '../login.html';
    });
  }

  return true;
}
