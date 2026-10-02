/* ============================================================
   KISSOWRA'S BEAUTY — customer-auth.js
   Customer authentication: sign-in, sign-up, forgot/reset
   password, account page, nav session state.
   ============================================================ */

'use strict';

// ── Session storage keys ───────────────────────────────────
const CUS_TOKEN_KEY    = 'kws_customer_token';
const CUS_USER_KEY     = 'kws_customer_user';
const CUS_REDIRECT_KEY = 'kws_auth_redirect';

// ── CustomerAuth object ────────────────────────────────────
const CustomerAuth = {
  getToken()  { return localStorage.getItem(CUS_TOKEN_KEY); },
  getUser()   {
    try { return JSON.parse(localStorage.getItem(CUS_USER_KEY) || 'null'); }
    catch { return null; }
  },
  setSession(token, user) {
    // Persist depends on "remember me" (sessionStorage vs localStorage)
    const store = CustomerAuth._persistent ? localStorage : sessionStorage;
    store.setItem(CUS_TOKEN_KEY, token);
    store.setItem(CUS_USER_KEY, JSON.stringify(user));
    // Always keep localStorage in sync for cross-tab awareness
    if (!CustomerAuth._persistent) {
      sessionStorage.setItem(CUS_TOKEN_KEY, token);
      sessionStorage.setItem(CUS_USER_KEY, JSON.stringify(user));
    }
    localStorage.setItem(CUS_TOKEN_KEY, token);
    localStorage.setItem(CUS_USER_KEY, JSON.stringify(user));
  },
  clearSession() {
    [localStorage, sessionStorage].forEach(s => {
      s.removeItem(CUS_TOKEN_KEY);
      s.removeItem(CUS_USER_KEY);
    });
  },
  isLoggedIn() {
    return !!(localStorage.getItem(CUS_TOKEN_KEY) || sessionStorage.getItem(CUS_TOKEN_KEY));
  },
  setRedirectUrl(url) { sessionStorage.setItem(CUS_REDIRECT_KEY, url); },
  getRedirectUrl()    {
    const url = sessionStorage.getItem(CUS_REDIRECT_KEY);
    sessionStorage.removeItem(CUS_REDIRECT_KEY);
    return url;
  },
  _persistent: true
};

// ── Shared API call with customer token ───────────────────
async function customerFetch(url, options = {}) {
  const token = CustomerAuth.getToken();
  const headers = { 'Content-Type': 'application/json', ...options.headers };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res  = await fetch(url, { ...options, headers });
  const data = await res.json();
  if (res.status === 401) CustomerAuth.clearSession();
  return data;
}

// ── Toggle password visibility ─────────────────────────────
function addPasswordToggle(inputId, btnId) {
  const input = document.getElementById(inputId);
  const btn   = document.getElementById(btnId);
  if (!input || !btn) return;
  btn.addEventListener('click', () => {
    const show = input.type === 'password';
    input.type = show ? 'text' : 'password';
    btn.innerHTML = show
      ? '<i data-feather="eye-off" style="width:17px;height:17px;"></i>'
      : '<i data-feather="eye"     style="width:17px;height:17px;"></i>';
    if (typeof feather !== 'undefined') feather.replace();
  });
}

// ── Password strength checker ──────────────────────────────
function initStrengthMeter(inputId) {
  const input     = document.getElementById(inputId);
  const bar       = document.getElementById('strengthBar');
  const fill      = document.getElementById('strengthFill');
  const label     = document.getElementById('strengthLabel');
  const rules     = { len: /^.{8,}$/, upper: /[A-Z]/, lower: /[a-z]/, num: /[0-9]/ };
  const ruleEls   = { len: document.getElementById('ruleLen'), upper: document.getElementById('ruleUpper'), lower: document.getElementById('ruleLower'), num: document.getElementById('ruleNum') };

  if (!input) return;

  input.addEventListener('input', () => {
    const val   = input.value;
    if (bar) bar.style.display = val ? 'block' : 'none';

    let score = 0;
    Object.entries(rules).forEach(([key, rx]) => {
      const ok = rx.test(val);
      if (ok) score++;
      if (ruleEls[key]) ruleEls[key].classList.toggle('ok', ok);
    });

    // Also reward special chars
    if (/[^a-zA-Z0-9]/.test(val)) score = Math.min(score + 0.5, 4);

    const levels = [
      { pct: '25%',  bg: 'var(--clr-error)',   cls: 'strength-weak',   text: 'Weak' },
      { pct: '50%',  bg: 'var(--clr-warning)',  cls: 'strength-fair',   text: 'Fair' },
      { pct: '75%',  bg: '#2e7d4f',             cls: 'strength-good',   text: 'Good' },
      { pct: '100%', bg: 'var(--clr-success)',  cls: 'strength-strong', text: 'Strong 💪' }
    ];
    const lvl = levels[Math.min(Math.floor(score) - 1, 3)] || levels[0];

    if (fill)  { fill.style.width = lvl.pct; fill.style.background = lvl.bg; }
    if (label) { label.className = `strength-label ${lvl.cls}`; label.textContent = val ? lvl.text : ''; }
  });
}

// ── Show/hide auth error banners ───────────────────────────
function showAuthError(boxId, msgId, msg) {
  const box = document.getElementById(boxId);
  const msg_= document.getElementById(msgId);
  if (box)  box.classList.add('show');
  if (msg_) msg_.textContent = msg;
}
function hideAuthError(boxId) {
  document.getElementById(boxId)?.classList.remove('show');
}

// ═══════════════════════════════════════════════════════════
// SIGN-IN PAGE
// ═══════════════════════════════════════════════════════════
function initSignInPage() {
  // Tabs
  const signinTab  = document.getElementById('signinTab');
  const signupTab  = document.getElementById('signupTab');
  const signinPanel= document.getElementById('signinPanel');
  const forgotPanel= document.getElementById('forgotPanel');

  const showPanel = (id) => {
    ['signinPanel','forgotPanel'].forEach(p => {
      const el = document.getElementById(p);
      if (el) el.classList.toggle('active', p === id);
    });
  };

  signinTab?.addEventListener('click', () => {
    signinTab.classList.add('active'); signupTab?.classList.remove('active');
    signinTab.setAttribute('aria-selected','true');
    signupTab?.setAttribute('aria-selected','false');
    showPanel('signinPanel');
  });

  signupTab?.addEventListener('click', () => {
    window.location.href = 'signup.html';
  });

  document.getElementById('goToSignup')?.addEventListener('click', () => {
    window.location.href = 'signup.html';
  });

  // Forgot password toggle
  document.getElementById('forgotBtn')?.addEventListener('click', () => {
    showPanel('forgotPanel');
    signinTab?.classList.remove('active');
  });
  document.getElementById('backToSignin')?.addEventListener('click', () => {
    showPanel('signinPanel');
    signinTab?.classList.add('active');
    hideAuthError('forgotError');
    hideAuthError('forgotSuccess');
  });

  // Password toggle
  addPasswordToggle('siPassword', 'siPwToggle');

  // Remember me
  const rememberMe = document.getElementById('rememberMe');
  CustomerAuth._persistent = rememberMe?.checked ?? true;
  rememberMe?.addEventListener('change', () => { CustomerAuth._persistent = rememberMe.checked; });

  // ── Sign-in form ──────────────────────────────────────
  const signinForm = document.getElementById('signinForm');
  const signinBtn  = document.getElementById('signinBtn');

  signinForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    hideAuthError('signinError');
    signinBtn.disabled    = true;
    signinBtn.textContent = 'Signing in…';

    const email    = document.getElementById('siEmail')?.value.trim();
    const password = document.getElementById('siPassword')?.value;

    try {
      const data = await customerFetch('/api/auth/login', {
        method: 'POST',
        body:   JSON.stringify({ email, password })
      });

      if (data.success) {
        CustomerAuth.setSession(data.token, data.user);
        updateNavForLoggedInUser(data.user);
        showToast(`Welcome back, ${data.user.name}! 💋`, 'success');
        setTimeout(() => {
          window.location.href = CustomerAuth.getRedirectUrl() || 'index.html';
        }, 700);
      } else {
        showAuthError('signinError', 'signinErrorMsg', data.message || 'Invalid email or password.');
      }
    } catch {
      showAuthError('signinError', 'signinErrorMsg', 'Network error. Please check your connection.');
    } finally {
      signinBtn.disabled    = false;
      signinBtn.textContent = 'Sign In';
    }
  });

  // ── Forgot password form ──────────────────────────────
  const forgotForm = document.getElementById('forgotForm');
  const forgotBtn2 = document.getElementById('forgotBtn2');

  forgotForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    hideAuthError('forgotError');
    hideAuthError('forgotSuccess');
    const email = document.getElementById('forgotEmail')?.value.trim();
    if (!email) { showAuthError('forgotError', 'forgotErrorMsg', 'Please enter your email address.'); return; }

    forgotBtn2.disabled    = true;
    forgotBtn2.textContent = 'Sending…';

    try {
      const data = await customerFetch('/api/auth/forgot-password', {
        method: 'POST',
        body:   JSON.stringify({ email })
      });
      // Always show success (server doesn't reveal if email exists)
      const successBox = document.getElementById('forgotSuccess');
      const successMsg = document.getElementById('forgotSuccessMsg');
      if (successBox) successBox.classList.add('show');
      if (successMsg) successMsg.textContent = data.message || 'Reset link sent! Check your inbox.';
      forgotForm.reset();
    } catch {
      showAuthError('forgotError', 'forgotErrorMsg', 'Network error. Please try again.');
    } finally {
      forgotBtn2.disabled    = false;
      forgotBtn2.textContent = 'Send Reset Link';
    }
  });
}

// ═══════════════════════════════════════════════════════════
// SIGN-UP PAGE
// ═══════════════════════════════════════════════════════════
function initSignUpPage() {
  addPasswordToggle('suPassword',    'suPwToggle');
  addPasswordToggle('suConfirm',     'suConfirmToggle');
  initStrengthMeter('suPassword');

  const suPassword = document.getElementById('suPassword');
  const suConfirm  = document.getElementById('suConfirm');
  const confirmErr = document.getElementById('confirmError');

  // Live confirm match check
  const checkMatch = () => {
    if (!suConfirm?.value) return;
    const mismatch = suPassword?.value !== suConfirm?.value;
    if (confirmErr) confirmErr.style.display = mismatch ? 'flex' : 'none';
    suConfirm?.style && (suConfirm.style.borderColor = mismatch ? 'var(--clr-error)' : '');
  };
  suPassword?.addEventListener('input',  checkMatch);
  suConfirm?.addEventListener('input',   checkMatch);

  const signupForm = document.getElementById('signupForm');
  const signupBtn  = document.getElementById('signupBtn');

  signupForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    hideAuthError('signupError');

    const name     = document.getElementById('suName')?.value.trim();
    const email    = document.getElementById('suEmail')?.value.trim();
    const phone    = document.getElementById('suPhone')?.value.trim();
    const password = document.getElementById('suPassword')?.value;
    const confirm  = document.getElementById('suConfirm')?.value;
    const agreed   = document.getElementById('agreeTerms')?.checked;

    // Validations
    if (!name) { showAuthError('signupError','signupErrorMsg','Please enter your full name.'); return; }
    if (!email){ showAuthError('signupError','signupErrorMsg','Please enter your email address.'); return; }
    if (password.length < 8) { showAuthError('signupError','signupErrorMsg','Password must be at least 8 characters.'); return; }
    if (password !== confirm) { showAuthError('signupError','signupErrorMsg','Passwords do not match.'); return; }
    if (!agreed) { showAuthError('signupError','signupErrorMsg','Please agree to the Terms & Conditions to continue.'); return; }

    signupBtn.disabled    = true;
    signupBtn.textContent = 'Creating Account…';

    try {
      const data = await customerFetch('/api/auth/register', {
        method: 'POST',
        body:   JSON.stringify({ name, email, password, phone })
      });

      if (data.success) {
        CustomerAuth.setSession(data.token, data.user);
        updateNavForLoggedInUser(data.user);
        // Show success modal
        openModal('successOverlay');
      } else {
        showAuthError('signupError', 'signupErrorMsg', data.message || 'Registration failed.');
      }
    } catch {
      showAuthError('signupError', 'signupErrorMsg', 'Network error. Please check your connection.');
    } finally {
      signupBtn.disabled    = false;
      signupBtn.textContent = 'Create My Account';
    }
  });
}

// ═══════════════════════════════════════════════════════════
// RESET PASSWORD PAGE
// ═══════════════════════════════════════════════════════════
function initResetPasswordPage() {
  const params = new URLSearchParams(window.location.search);
  const token  = params.get('token');

  if (!token) {
    document.getElementById('resetForm')?.setAttribute('style', 'display:none;');
    document.getElementById('invalidToken')?.removeAttribute('style');
    return;
  }

  addPasswordToggle('newPw',      'newPwToggle');
  addPasswordToggle('confirmPw',  'confirmPwToggle');

  const newPw     = document.getElementById('newPw');
  const confirmPw = document.getElementById('confirmPw');
  const confErr   = document.getElementById('confirmError');

  confirmPw?.addEventListener('input', () => {
    const mismatch = newPw?.value !== confirmPw?.value;
    if (confErr) confErr.style.display = mismatch ? 'flex' : 'none';
  });

  const form   = document.getElementById('resetPwForm');
  const btn    = document.getElementById('resetBtn');

  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    hideAuthError('resetError');

    const password = newPw?.value;
    const confirm  = confirmPw?.value;

    if (!password || password.length < 8) {
      showAuthError('resetError','resetErrorMsg','Password must be at least 8 characters.'); return;
    }
    if (password !== confirm) {
      showAuthError('resetError','resetErrorMsg','Passwords do not match.'); return;
    }

    btn.disabled    = true;
    btn.textContent = 'Resetting…';

    try {
      const data = await customerFetch('/api/auth/reset-password', {
        method: 'POST',
        body:   JSON.stringify({ token, password })
      });

      if (data.success) {
        document.getElementById('resetForm')?.setAttribute('style','display:none;');
        document.getElementById('resetSuccess')?.removeAttribute('style');
      } else {
        // Token expired
        if (data.message?.toLowerCase().includes('expired') || data.message?.toLowerCase().includes('invalid')) {
          document.getElementById('resetForm')?.setAttribute('style','display:none;');
          document.getElementById('invalidToken')?.removeAttribute('style');
        } else {
          showAuthError('resetError','resetErrorMsg', data.message || 'Reset failed.');
        }
      }
    } catch {
      showAuthError('resetError','resetErrorMsg','Network error. Please try again.');
    } finally {
      btn.disabled    = false;
      btn.textContent = 'Reset Password';
    }
  });
}

// ═══════════════════════════════════════════════════════════
// ACCOUNT PAGE
// ═══════════════════════════════════════════════════════════
async function initAccountPage() {
  const adminToken = localStorage.getItem('kws_admin_token');
  if (adminToken) {
    try {
      const response = await fetch('/api/auth/me', {
        headers: { Authorization: `Bearer ${adminToken}` }
      });
      const data = await response.json();
      if (response.ok && data.success && data.user?.role === 'admin') {
        const user = data.user;
        const avatarEl = document.getElementById('accountAvatar');
        const nameEl = document.getElementById('accountName');
        const emailEl = document.getElementById('accountEmail');
        const storeManagementNav = document.getElementById('storeManagementNav');

        if (avatarEl) avatarEl.textContent = (user.name || 'A').charAt(0).toUpperCase();
        if (nameEl) nameEl.textContent = user.name || 'Admin';
        if (emailEl) emailEl.textContent = user.email || '';

        document.querySelectorAll('.account-nav-link:not(#storeManagementNav)').forEach(link => {
          link.hidden = true;
        });
        document.getElementById('customerAccountDivider').hidden = true;
        storeManagementNav.hidden = false;
        storeManagementNav.classList.add('active');

        document.querySelectorAll('.account-panel').forEach(panel => panel.classList.remove('active'));
        document.getElementById('panel-store-management').classList.add('active');
        const heading = document.querySelector('.account-page h1');
        if (heading) heading.textContent = 'Store Management';
        const subtitle = heading?.nextElementSibling;
        if (subtitle) subtitle.textContent = 'Manage products, pricing, orders, and store settings.';

        storeManagementNav.addEventListener('click', () => {
          document.querySelectorAll('.account-panel').forEach(panel => panel.classList.remove('active'));
          document.getElementById('panel-store-management').classList.add('active');
          storeManagementNav.classList.add('active');
        });
        return;
      }
    } catch {}
  }

  // Require login
  if (!CustomerAuth.isLoggedIn()) {
    CustomerAuth.setRedirectUrl('account.html');
    window.location.href = 'signin.html';
    return;
  }

  // Load fresh user data
  let user = CustomerAuth.getUser();
  try {
    const data = await customerFetch('/api/auth/me');
    if (data.success) {
      user = data.user;
      CustomerAuth.setSession(CustomerAuth.getToken(), user);
    }
  } catch {}

  if (!user) { CustomerAuth.clearSession(); window.location.href = 'signin.html'; return; }

  // Populate sidebar
  const avatarEl = document.getElementById('accountAvatar');
  const nameEl   = document.getElementById('accountName');
  const emailEl  = document.getElementById('accountEmail');
  if (avatarEl) avatarEl.textContent = user.name.charAt(0).toUpperCase();
  if (nameEl)   nameEl.textContent   = user.name;
  if (emailEl)  emailEl.textContent  = user.email;

  // Panel switching
  document.querySelectorAll('.account-nav-link[data-panel]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.account-nav-link').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.account-panel').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById(`panel-${btn.dataset.panel}`)?.classList.add('active');

      // Load orders lazily
      if (btn.dataset.panel === 'orders') loadMyOrders(user);
    });
  });

  // Sign out
  document.getElementById('accountLogoutBtn')?.addEventListener('click', () => {
    CustomerAuth.clearSession();
    showToast('Signed out. See you soon! 💋', 'info');
    setTimeout(() => { window.location.href = 'index.html'; }, 700);
  });

  // Profile form
  const profName  = document.getElementById('profName');
  const profPhone = document.getElementById('profPhone');
  const profEmail = document.getElementById('profEmail');
  if (profName)  profName.value  = user.name  || '';
  if (profPhone) profPhone.value = user.phone || '';
  if (profEmail) profEmail.value = user.email || '';

  document.getElementById('profileForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('saveProfileBtn');
    btn.disabled = true; btn.textContent = 'Saving…';
    try {
      const data = await customerFetch('/api/auth/profile', {
        method: 'PUT',
        body: JSON.stringify({ name: profName.value.trim(), phone: profPhone?.value.trim() })
      });
      if (data.success) {
        CustomerAuth.setSession(CustomerAuth.getToken(), data.user);
        if (nameEl) nameEl.textContent = data.user.name;
        if (avatarEl) avatarEl.textContent = data.user.name.charAt(0).toUpperCase();
        showToast('Profile updated successfully.', 'success');
      } else {
        showToast(data.message || 'Update failed.', 'error');
      }
    } catch { showToast('Network error.', 'error'); }
    finally { btn.disabled = false; btn.textContent = 'Save Changes'; }
  });

  // Security form
  document.getElementById('securityForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn     = document.getElementById('saveSecurityBtn');
    const curPw   = document.getElementById('curPw')?.value;
    const newPw   = document.getElementById('secNewPw')?.value;
    const confPw  = document.getElementById('secConfirmPw')?.value;

    if (!curPw || !newPw || !confPw) { showToast('Please fill in all password fields.', 'warning'); return; }
    if (newPw.length < 8)            { showToast('New password must be at least 8 characters.', 'warning'); return; }
    if (newPw !== confPw)            { showToast('New passwords do not match.', 'error'); return; }

    btn.disabled = true; btn.textContent = 'Updating…';
    try {
      const data = await customerFetch('/api/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({ currentPassword: curPw, newPassword: newPw })
      });
      if (data.success) {
        showToast('Password updated successfully.', 'success');
        document.getElementById('securityForm').reset();
      } else {
        showToast(data.message || 'Update failed.', 'error');
      }
    } catch { showToast('Network error.', 'error'); }
    finally { btn.disabled = false; btn.textContent = 'Update Password'; }
  });

  // Overview stats
  loadOverviewStats(user);
}

async function loadOverviewStats(user) {
  // Orders for this customer (matched by email/phone on backend)
  try {
    // Use a search against the customer's email
    const qs   = user.email ? `search=${encodeURIComponent(user.email)}` : '';
    const data = await customerFetch(`/api/orders?${qs}&limit=100`);
    if (data.success) {
      const orders = data.orders || [];
      const spent  = orders.filter(o => o.payment_status === 'paid').reduce((s, o) => s + o.total_amount, 0);
      const statOrders = document.getElementById('statOrders');
      const statSpent  = document.getElementById('statSpent');
      if (statOrders) statOrders.textContent = orders.length;
      if (statSpent)  statSpent.textContent  = formatCurrency(spent);
    }
  } catch {}
}

async function loadMyOrders(user) {
  const panel = document.getElementById('ordersPanel');
  if (!panel) return;
  panel.innerHTML = '<div style="text-align:center;padding:var(--space-8);"><div class="spinner" style="margin:auto;"></div></div>';

  try {
    const qs   = user.email ? `search=${encodeURIComponent(user.email)}` : '';
    const data = await customerFetch(`/api/orders?${qs}&limit=20`);
    if (!data.success) throw new Error();

    const orders = data.orders || [];
    if (!orders.length) {
      panel.innerHTML = `
        <div class="empty-state" style="padding:var(--space-12);">
          <div class="empty-state__icon">📦</div>
          <h3 class="empty-state__title">No orders yet</h3>
          <p class="empty-state__text">Your orders will appear here once you've placed one.</p>
          <a href="shop.html" class="btn btn-primary" style="margin-top:var(--space-4);">Start Shopping</a>
        </div>`;
      return;
    }

    panel.innerHTML = orders.map(o => `
      <div class="order-card">
        <div class="order-card__header">
          <div>
            <div style="font-size:var(--text-xs);color:var(--clr-muted);">Order</div>
            <div style="font-weight:var(--fw-bold);color:var(--clr-primary);">#${escHtml(o.order_number)}</div>
          </div>
          <div style="display:flex;gap:var(--space-2);flex-wrap:wrap;">
            <span class="status-badge status-${o.order_status}">${o.order_status.replace(/_/g,' ')}</span>
            <span class="status-badge status-${o.payment_status}">${o.payment_status}</span>
          </div>
          <div style="text-align:right;">
            <div style="font-size:var(--text-xs);color:var(--clr-muted);">${formatDate(o.created_at)}</div>
            <div style="font-weight:var(--fw-bold);color:var(--clr-primary);">${formatCurrency(o.total_amount)}</div>
          </div>
        </div>
      </div>`).join('');
  } catch {
    panel.innerHTML = '<p style="color:var(--clr-error);text-align:center;padding:var(--space-8);">Could not load orders.</p>';
  }
}

// ═══════════════════════════════════════════════════════════
// NAV SESSION STATE (runs on every page)
// ═══════════════════════════════════════════════════════════
function updateNavForLoggedInUser(user) {
  // Replace "Sign In" link with account dropdown if present
  const accountLinks = document.querySelectorAll('.nav-account-link');
  accountLinks.forEach(el => {
    el.innerHTML = `
      <a href="account.html" class="nav-link" style="display:flex;align-items:center;gap:var(--space-2);">
        <span style="width:26px;height:26px;background:var(--clr-primary);color:#fff;border-radius:50%;
               display:inline-flex;align-items:center;justify-content:center;font-size:12px;font-weight:bold;">
          ${(user?.name || 'U').charAt(0).toUpperCase()}
        </span>
        ${escHtml(user?.name?.split(' ')[0] || 'Account')}
      </a>`;
  });
}

// Run on every page load to reflect session state in nav
(function syncNavSession() {
  if (!CustomerAuth.isLoggedIn()) return;
  const user = CustomerAuth.getUser();
  if (user) updateNavForLoggedInUser(user);
})();
