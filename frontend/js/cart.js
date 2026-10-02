/* ============================================================
   KISSOWRA'S BEAUTY — cart.js
   Shopping cart using localStorage for persistence
   ============================================================ */

'use strict';

const Cart = (() => {
  const STORAGE_KEY = 'kws_cart';

  // ── Internal: load/save ──────────────────────────────────
  function _load() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); }
    catch { return []; }
  }

  function _save(items) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    updateBadge();
    window.dispatchEvent(new CustomEvent('cartUpdated', { detail: { items } }));
  }

  // ── Public API ────────────────────────────────────────────

  /** Return all cart items */
  function getItems() { return _load(); }

  /** Total item count */
  function getCount() {
    return _load().reduce((sum, i) => sum + i.quantity, 0);
  }

  /** Subtotal (before delivery) */
  function getSubtotal() {
    return _load().reduce((sum, i) => sum + i.price * i.quantity, 0);
  }

  /**
   * Add item to cart.
   * item = { product_id, name, price, image, quantity, variant }
   * If same product_id + variant already in cart, increases quantity.
   */
  function add(item) {
    const items = _load();
    const key = `${item.product_id}__${item.variant || ''}`;

    const existing = items.find(i => `${i.product_id}__${i.variant || ''}` === key);

    if (existing) {
      existing.quantity += (item.quantity || 1);
    } else {
      items.push({
        product_id: item.product_id,
        name:       item.name,
        price:      item.price,
        image:      item.image || null,
        quantity:   item.quantity || 1,
        variant:    item.variant || null,
        cartKey:    key
      });
    }

    _save(items);
  }

  /** Remove item by cartKey (product_id__variant) */
  function remove(cartKey) {
    const items = _load().filter(i => `${i.product_id}__${i.variant || ''}` !== cartKey);
    _save(items);
  }

  /** Update quantity for a cart item */
  function setQuantity(cartKey, qty) {
    const items = _load();
    const item = items.find(i => `${i.product_id}__${i.variant || ''}` === cartKey);
    if (item) {
      if (qty <= 0) {
        return remove(cartKey);
      }
      item.quantity = qty;
      _save(items);
    }
  }

  /** Increase quantity by 1 */
  function increment(cartKey) {
    const items = _load();
    const item = items.find(i => `${i.product_id}__${i.variant || ''}` === cartKey);
    if (item) { item.quantity++; _save(items); }
  }

  /** Decrease quantity by 1 (removes if 0) */
  function decrement(cartKey) {
    const items = _load();
    const item = items.find(i => `${i.product_id}__${i.variant || ''}` === cartKey);
    if (item) {
      item.quantity--;
      if (item.quantity <= 0) return remove(cartKey);
      _save(items);
    }
  }

  /** Empty the cart */
  function clear() { _save([]); }

  /** Update all cart badge elements on the page */
  function updateBadge() {
    const count = getCount();
    document.querySelectorAll('#cartBadge, .cart-badge').forEach(el => {
      el.textContent = count;
      el.style.display = count > 0 ? '' : 'none';
    });
    // Mobile count
    const mobileCount = document.getElementById('mobileCartCount');
    if (mobileCount) mobileCount.textContent = count;
  }

  return { getItems, getCount, getSubtotal, add, remove, setQuantity, increment, decrement, clear, updateBadge };
})();

// ── Cart Page Logic ────────────────────────────────────────
function initCartPage() {
  let deliveryFee = 1500;

  // Load delivery fee from settings
  fetch('/api/settings/public')
    .then(r => r.json())
    .then(d => {
      if (d.success && d.settings) {
        deliveryFee = d.settings.delivery_fee || 1500;
      }
    })
    .catch(() => {})
    .finally(() => renderCart());

  function renderCart() {
    const items      = Cart.getItems();
    const layout     = document.getElementById('cartLayout');
    const emptyState = document.getElementById('emptyCart');
    const countEl    = document.getElementById('cartItemCount');

    if (!items.length) {
      if (layout)     layout.style.display    = 'none';
      if (emptyState) emptyState.style.display = 'flex';
      if (countEl)    countEl.textContent       = '0 items';
      return;
    }

    if (layout)     layout.style.display    = '';
    if (emptyState) emptyState.style.display = 'none';
    if (countEl)    countEl.textContent       = `${Cart.getCount()} item${Cart.getCount() !== 1 ? 's' : ''}`;

    renderItems(items);
    renderTotals(items);
  }

  function renderItems(items) {
    const listEl = document.getElementById('cartItemsList');
    if (!listEl) return;

    listEl.innerHTML = items.map(item => {
      const key       = `${item.product_id}__${item.variant || ''}`;
      const imgSrc    = item.image || 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="88" height="88"><rect fill="%23fdf0f5" width="88" height="88"/><text y="55" x="44" text-anchor="middle" fill="%23c9955b" font-size="36">💋</text></svg>';
      return `
      <div class="cart-item" data-key="${escHtml(key)}">
        <img class="cart-item__img" src="${imgSrc}" alt="${escHtml(item.name)}" loading="lazy" />
        <div>
          <div class="cart-item__name">
            <a href="product.html?id=${item.product_id}" style="color:inherit;">${escHtml(item.name)}</a>
          </div>
          ${item.variant ? `<div class="cart-item__variant">Variant: ${escHtml(item.variant)}</div>` : ''}
          <div class="cart-item__price">${formatCurrency(item.price)}</div>
          <div class="qty-selector" style="margin-top:var(--space-3);">
            <button class="qty-selector__btn" data-action="dec" data-key="${escHtml(key)}" aria-label="Decrease">−</button>
            <input class="qty-selector__input" type="number" value="${item.quantity}" min="1" max="99"
              data-key="${escHtml(key)}" readonly aria-label="Quantity" />
            <button class="qty-selector__btn" data-action="inc" data-key="${escHtml(key)}" aria-label="Increase">+</button>
          </div>
        </div>
        <div class="cart-item__controls">
          <div style="font-weight:var(--fw-bold);color:var(--clr-primary);font-size:var(--text-base);">
            ${formatCurrency(item.price * item.quantity)}
          </div>
          <button class="cart-item__remove" data-action="remove" data-key="${escHtml(key)}" aria-label="Remove item">
            ✕ Remove
          </button>
        </div>
      </div>`;
    }).join('');

    // Event delegation for qty + remove buttons
    listEl.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      const key = btn.dataset.key;

      if (btn.dataset.action === 'inc') { Cart.increment(key); renderCart(); }
      if (btn.dataset.action === 'dec') { Cart.decrement(key); renderCart(); }
      if (btn.dataset.action === 'remove') { Cart.remove(key); renderCart(); }
    });
  }

  function renderTotals(items) {
    const subtotal = Cart.getSubtotal();
    const total    = subtotal + deliveryFee;

    const subEl  = document.getElementById('cartSubtotal');
    const delEl  = document.getElementById('cartDelivery');
    const totEl  = document.getElementById('cartTotal');

    if (subEl) subEl.textContent = formatCurrency(subtotal);
    if (delEl) delEl.textContent = formatCurrency(deliveryFee);
    if (totEl) totEl.textContent = formatCurrency(total);
  }

  // Clear cart button
  const clearBtn = document.getElementById('clearCartBtn');
  if (clearBtn) {
    clearBtn.addEventListener('click', () => openModal('clearCartModal'));
  }

  const cancelClear  = document.getElementById('cancelClearCart');
  const confirmClear = document.getElementById('confirmClearCart');
  const closeModal_  = document.getElementById('clearCartModalClose');

  if (cancelClear)  cancelClear.addEventListener('click',  () => closeModal('clearCartModal'));
  if (closeModal_)  closeModal_.addEventListener('click',  () => closeModal('clearCartModal'));
  if (confirmClear) confirmClear.addEventListener('click', () => {
    Cart.clear();
    closeModal('clearCartModal');
    renderCart();
    showToast('Cart cleared.', 'info');
  });

  // Listen for external cart updates
  window.addEventListener('cartUpdated', () => renderCart());
}
