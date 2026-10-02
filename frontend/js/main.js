/* ============================================================
   KISSOWRA'S BEAUTY — main.js
   Shared utilities: nav, toasts, modals, WhatsApp, complaints
   ============================================================ */

'use strict';

// ── API Base URL ───────────────────────────────────────────
const API_BASE = '';  // same-origin; server serves frontend

// ── Currency Formatter ─────────────────────────────────────
function formatCurrency(amount, symbol = '₦') {
  return `${symbol}${Number(amount || 0).toLocaleString('en-NG', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`;
}

// ── Date Formatter ─────────────────────────────────────────
function formatDate(dateStr) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-NG', {
    day: 'numeric', month: 'short', year: 'numeric'
  });
}

function formatDateTime(dateStr) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleString('en-NG', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });
}

// ── Toast Notifications ────────────────────────────────────
function showToast(message, type = 'info', duration = 4000) {
  const container = document.getElementById('toastContainer');
  if (!container) return;

  const icons = { success: '✓', error: '✕', warning: '⚠', info: '💬' };
  const titles = { success: 'Success', error: 'Error', warning: 'Warning', info: 'Info' };

  const toast = document.createElement('div');
  toast.className = `toast toast--${type}`;
  toast.innerHTML = `
    <span class="toast__icon">${icons[type] || '💬'}</span>
    <div>
      <div class="toast__title">${titles[type]}</div>
      <div class="toast__msg">${message}</div>
    </div>`;

  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(40px)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

// ── Modal Helpers ──────────────────────────────────────────
function openModal(id) {
  const el = document.getElementById(id);
  if (el) {
    el.classList.add('open');
    document.body.style.overflow = 'hidden';
    // Focus first focusable element
    const focusable = el.querySelector('input, button, select, textarea, a[href]');
    if (focusable) setTimeout(() => focusable.focus(), 100);
  }
}

function closeModal(id) {
  const el = document.getElementById(id);
  if (el) {
    el.classList.remove('open');
    document.body.style.overflow = '';
  }
}

// Close modals on overlay click
document.addEventListener('click', (e) => {
  if (e.target.classList.contains('modal-overlay')) {
    e.target.classList.remove('open');
    document.body.style.overflow = '';
  }
});

// Close modals on Escape
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    document.querySelectorAll('.modal-overlay.open').forEach(m => {
      m.classList.remove('open');
      document.body.style.overflow = '';
    });
  }
});

// ── Navigation ─────────────────────────────────────────────
(function initNav() {
  const nav       = document.getElementById('mainNav');
  const hamburger = document.getElementById('hamburger');
  const mobileMenu= document.getElementById('mobileMenu');

  // Scroll effect
  if (nav) {
    const onScroll = () => nav.classList.toggle('scrolled', window.scrollY > 20);
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }

  // Mobile menu toggle
  if (hamburger && mobileMenu) {
    hamburger.addEventListener('click', () => {
      const isOpen = mobileMenu.classList.toggle('open');
      hamburger.classList.toggle('open', isOpen);
      hamburger.setAttribute('aria-expanded', String(isOpen));
    });

    // Close on nav link click
    mobileMenu.querySelectorAll('a').forEach(a =>
      a.addEventListener('click', () => {
        mobileMenu.classList.remove('open');
        hamburger.classList.remove('open');
        hamburger.setAttribute('aria-expanded', 'false');
      })
    );
  }
})();

// ── Search Overlay ─────────────────────────────────────────
(function initSearch() {
  const toggle  = document.getElementById('searchToggle');
  const close   = document.getElementById('searchClose');
  const input   = document.getElementById('searchInput');
  const results = document.getElementById('searchResults');

  if (!toggle) return;

  toggle.addEventListener('click', () => openModal('searchOverlay'));
  if (close) close.addEventListener('click', () => closeModal('searchOverlay'));

  let searchTimer;
  if (input && results) {
    input.addEventListener('input', () => {
      clearTimeout(searchTimer);
      const q = input.value.trim();
      if (q.length < 2) { results.innerHTML = ''; return; }
      searchTimer = setTimeout(() => performSearch(q, results), 350);
    });
  }
})();

async function performSearch(query, container) {
  container.innerHTML = '<div style="text-align:center;padding:var(--space-5);"><div class="spinner" style="margin:auto;"></div></div>';
  try {
    const res  = await fetch(`/api/products?search=${encodeURIComponent(query)}&limit=6`);
    const data = await res.json();
    if (!data.success || !data.products.length) {
      container.innerHTML = '<div class="empty-state" style="padding:var(--space-8);"><div class="empty-state__icon">🔍</div><p class="empty-state__title">No results found</p></div>';
      return;
    }
    container.innerHTML = `<div class="products-grid" style="grid-template-columns:repeat(auto-fill,minmax(200px,1fr));">${data.products.map(p => renderProductCard(p)).join('')}</div>`;
  } catch {
    container.innerHTML = '<p style="color:var(--clr-error);text-align:center;">Search failed. Please try again.</p>';
  }
}

// ── Product Card Renderer (shared) ─────────────────────────
function renderProductCard(p) {
  const currentPrice  = p.discount_price || p.price;
  const hasDiscount   = p.discount_price && p.discount_price < p.price;
  const discountPct   = hasDiscount ? Math.round((1 - p.discount_price / p.price) * 100) : 0;
  const outOfStock    = p.stock <= 0;
  const imgSrc        = p.image || 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300"><rect fill="%23fdf0f5" width="300" height="300"/><text y="160" x="150" text-anchor="middle" fill="%23c9955b" font-size="60">💋</text></svg>';

  return `
  <article class="product-card" data-id="${p.id}">
    <div class="product-card__image">
      <img src="${imgSrc}" alt="${escHtml(p.name)}" loading="lazy" />
      ${hasDiscount ? `<span class="product-card__badge">${discountPct}% OFF</span>` : ''}
      ${outOfStock   ? `<span class="product-card__badge product-card__badge--out">Out of Stock</span>` : ''}
      <div class="product-card__actions">
        <a href="product.html?id=${p.id}" class="btn btn-secondary btn--sm" style="color:white;border-color:rgba(255,255,255,0.6);">View Details</a>
        ${!outOfStock ? `<button class="btn btn-gold btn--sm" onclick="addToCartQuick('${p.id}','${escHtml(p.name)}',${currentPrice},'${imgSrc}')">Add to Cart</button>` : ''}
      </div>
    </div>
    <div class="product-card__body">
      <div class="product-card__category">${escHtml(p.category)}</div>
      <h3 class="product-card__name"><a href="product.html?id=${p.id}">${escHtml(p.name)}</a></h3>
      <div class="product-card__price">
        <span class="price-current">${formatCurrency(currentPrice)}</span>
        ${hasDiscount ? `<span class="price-original">${formatCurrency(p.price)}</span><span class="price-discount">-${discountPct}%</span>` : ''}
      </div>
    </div>
  </article>`;
}

// Quick add-to-cart from product cards (no variant selection needed)
function addToCartQuick(productId, name, price, image) {
  Cart.add({ product_id: productId, name, price, image, quantity: 1, variant: null });
  showToast(`${name} added to cart!`, 'success');
}

// ── HTML Escape ────────────────────────────────────────────
function escHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ── Status Badge HTML ──────────────────────────────────────
function statusBadge(status, text) {
  const label = text || status.replace(/_/g, ' ');
  return `<span class="status-badge status-${status}">${label}</span>`;
}

// ── WhatsApp Integration ───────────────────────────────────
let storeSettings = null;

async function loadStoreConfig() {
  if (storeSettings) return storeSettings;
  try {
    const res  = await fetch('/api/settings/public');
    const data = await res.json();
    if (data.success) storeSettings = data.settings;
  } catch {}
  return storeSettings;
}

function buildWhatsAppUrl(number, message) {
  return `https://wa.me/${number}?text=${encodeURIComponent(message)}`;
}

async function initWhatsAppButtons() {
  const cfg = await loadStoreConfig();
  const num  = cfg?.whatsapp_number || '';
  if (!num) return;

  const defaultMsg = "Hello KISSOWRA'S BEAUTY, I'd like to place an order.";

  // Main floating button
  const floatBtn = document.getElementById('whatsappFloat');
  if (floatBtn) floatBtn.href = buildWhatsAppUrl(num, defaultMsg);

  // Footer WhatsApp
  const footerWa = document.querySelector('#footerWhatsApp a, #footerWa a');
  if (footerWa) footerWa.href = buildWhatsAppUrl(num, defaultMsg);
}

// ── Complaint Modal ────────────────────────────────────────
function initComplaintModal() {
  const openBtns = [
    document.getElementById('complaintFloat'),
    document.getElementById('footerComplaintBtn')
  ];

  openBtns.forEach(btn => {
    if (btn) btn.addEventListener('click', (e) => {
      e.preventDefault();
      openModal('complaintModal');
    });
  });

  const closeBtn = document.getElementById('complaintModalClose');
  if (closeBtn) closeBtn.addEventListener('click', () => closeModal('complaintModal'));

  const form = document.getElementById('complaintForm');
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('complaintSubmitBtn');
    btn.disabled = true;
    btn.textContent = 'Submitting…';

    const body = Object.fromEntries(new FormData(form));

    try {
      const res  = await fetch('/api/complaints', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      const data = await res.json();

      if (data.success) {
        closeModal('complaintModal');
        form.reset();
        showToast('Complaint submitted successfully. The admin has been notified by email and dashboard.', 'success');
      } else {
        showToast(data.message || 'Submission failed.', 'error');
      }
    } catch {
      showToast('Network error. Please try again.', 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Submit Complaint';
    }
  });
}

// ── Admin Sidebar ──────────────────────────────────────────
function initAdminSidebar() {
  const menuBtn  = document.getElementById('menuBtn');
  const sidebar  = document.getElementById('adminSidebar');
  const overlay  = document.getElementById('sidebarOverlay');

  if (!menuBtn || !sidebar) return;

  const toggle = () => {
    sidebar.classList.toggle('open');
    overlay.classList.toggle('open');
  };

  menuBtn.addEventListener('click', toggle);
  overlay.addEventListener('click', toggle);
}

// ── Init on DOMContentLoaded ───────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  initWhatsAppButtons();
  initComplaintModal();
  initAdminSidebar();

  // Update cart badge from localStorage
  if (typeof Cart !== 'undefined') Cart.updateBadge();

  // Set current date for admin topbar
  const dateEl = document.getElementById('currentDate');
  if (dateEl) {
    dateEl.textContent = new Date().toLocaleDateString('en-NG', {
      weekday: 'short', day: 'numeric', month: 'short', year: 'numeric'
    });
  }
});

// ── API Helper ─────────────────────────────────────────────
async function apiFetch(url, options = {}) {
  const token = localStorage.getItem('kws_admin_token');
  const headers = { 'Content-Type': 'application/json', Accept: 'application/json', ...options.headers };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(url, { ...options, headers });

  const responseText = await res.text();
  let data = {};

  if (responseText) {
    const contentType = res.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      try {
        data = JSON.parse(responseText);
      } catch {
        throw new Error('The server returned invalid JSON.');
      }
    } else if (responseText.trim().startsWith('<')) {
      throw new Error('The server returned an HTML page instead of JSON. Please verify the app is running and the admin API route is available.');
    } else {
      data = { message: responseText };
    }
  }

  if (res.status === 401 || res.status === 403) {
    // Token expired or invalid — redirect to login
    if (window.location.pathname.includes('/admin/')) {
      localStorage.removeItem('kws_admin_token');
      localStorage.removeItem('kws_admin_user');
      window.location.href = '../login.html';
    }
  }

  if (!res.ok) {
    throw new Error(data.message || 'Request failed.');
  }

  return data;
}

// ── Pagination Helper ──────────────────────────────────────
function renderPagination(container, currentPage, totalPages, onPageChange) {
  if (!container || totalPages <= 1) { if (container) container.innerHTML = ''; return; }

  let html = '';
  // Prev
  html += `<button class="pagination__btn" ${currentPage === 1 ? 'disabled' : ''} data-page="${currentPage - 1}">‹</button>`;

  // Page numbers
  const range = buildPageRange(currentPage, totalPages);
  range.forEach(p => {
    if (p === '…') {
      html += `<span style="padding:0 var(--space-2);color:var(--clr-muted);">…</span>`;
    } else {
      html += `<button class="pagination__btn ${p === currentPage ? 'active' : ''}" data-page="${p}">${p}</button>`;
    }
  });

  // Next
  html += `<button class="pagination__btn" ${currentPage === totalPages ? 'disabled' : ''} data-page="${currentPage + 1}">›</button>`;

  container.innerHTML = html;
  container.querySelectorAll('.pagination__btn:not([disabled])').forEach(btn => {
    btn.addEventListener('click', () => onPageChange(parseInt(btn.dataset.page)));
  });
}

function buildPageRange(current, total) {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  if (current <= 4) return [1, 2, 3, 4, 5, '…', total];
  if (current >= total - 3) return [1, '…', total - 4, total - 3, total - 2, total - 1, total];
  return [1, '…', current - 1, current, current + 1, '…', total];
}
