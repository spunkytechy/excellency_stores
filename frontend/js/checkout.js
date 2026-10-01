/* ============================================================
   KISSOWRA'S STORES — checkout.js
   Multi-step checkout: details → review → payment
   ============================================================ */

'use strict';

async function initCheckoutPage() {
  // Redirect if cart is empty
  const cartItems = Cart.getItems();
  if (!cartItems.length) {
    window.location.href = 'cart.html';
    return;
  }

  let deliveryFee  = 1500;
  let customerData = {};
  let placedOrder  = null;

  // Load settings
  try {
    const res  = await fetch('/api/settings/public');
    const data = await res.json();
    if (data.success && data.settings) {
      deliveryFee = data.settings.delivery_fee || 1500;
      // WhatsApp
      const wa = document.getElementById('whatsappFloat');
      if (wa && data.settings.whatsapp_number) {
        wa.href = `https://wa.me/${data.settings.whatsapp_number}`;
      }
    }
  } catch {}

  // Check for payment verification callback (Paystack redirect)
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get('verify') === 'true') {
    const reference    = urlParams.get('reference') || urlParams.get('trxref');
    const transactionId= urlParams.get('transaction_id');
    if (reference) {
      showStep(3);
      showPaymentState('processing');
      await verifyPayment(reference, transactionId);
      return;
    }
  }

  // Render order summary in step 1
  renderOrderSummary('checkoutItems', 'coSubtotal', 'coDelivery', 'coTotal');

  // ── STEP 1: Customer Details Form ─────────────────────
  const form = document.getElementById('checkoutForm');
  if (form) {
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      if (!validateForm(form)) return;

      customerData = Object.fromEntries(new FormData(form));
      renderReviewStep();
      showStep(2);
    });
  }

  // ── STEP 2: Review & Place Order ──────────────────────
  const editBtn    = document.getElementById('editDetailsBtn');
  const placeOrder = document.getElementById('placeOrderBtn');

  if (editBtn) editBtn.addEventListener('click', () => showStep(1));

  // Payment method card selection
  document.querySelectorAll('.payment-method-card').forEach(card => {
    card.addEventListener('click', () => {
      document.querySelectorAll('.payment-method-card').forEach(c => c.classList.remove('selected'));
      card.classList.add('selected');
      card.querySelector('input').checked = true;
    });
  });

  if (placeOrder) {
    placeOrder.addEventListener('click', async () => {
      placeOrder.disabled    = true;
      placeOrder.textContent = 'Placing Order…';
      showStep(3);
      showPaymentState('processing');
      await submitOrder();
    });
  }

  // ── Retry button ───────────────────────────────────────
  const retryBtn = document.getElementById('retryPaymentBtn');
  if (retryBtn) retryBtn.addEventListener('click', () => { showStep(2); });

  // ── Helpers ────────────────────────────────────────────

  function showStep(step) {
    [1, 2, 3].forEach(n => {
      const el = document.getElementById(`checkoutStep${n}`);
      if (el) el.style.display = n === step ? '' : 'none';
    });

    // Update step indicators
    [1, 2, 3].forEach(n => {
      const ind    = document.getElementById(`step${n}Indicator`);
      const conn   = document.getElementById(`connector${n}`);
      if (ind) {
        ind.classList.toggle('active', n === step);
        ind.classList.toggle('done',   n < step);
      }
      if (conn) conn.classList.toggle('done', n < step);
    });

    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function showPaymentState(state) {
    ['paymentProcessing', 'paymentSuccess', 'paymentFailed', 'codSuccess'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.style.display = 'none';
    });
    const target = {
      processing: 'paymentProcessing',
      success:    'paymentSuccess',
      failed:     'paymentFailed',
      cod:        'codSuccess'
    }[state];
    const el = document.getElementById(target);
    if (el) el.style.display = 'flex';
  }

  function renderOrderSummary(itemsId, subId, delId, totId) {
    const items    = Cart.getItems();
    const subtotal = Cart.getSubtotal();
    const total    = subtotal + deliveryFee;

    const itemsEl = document.getElementById(itemsId);
    if (itemsEl) {
      const fallback = `data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' width='52' height='52'>
        <rect fill='%23fdf0f5' width='52' height='52'/><text y='36' x='26' text-anchor='middle' fill='%23c9955b' font-size='28'>💋</text></svg>`;

      itemsEl.innerHTML = items.map(item => `
        <div class="order-item">
          <div class="order-item__img" style="position:relative;">
            <img src="${item.image || fallback}" alt="${escHtml(item.name)}"
              style="width:52px;height:52px;object-fit:cover;border-radius:var(--radius-sm);" />
            <span class="order-item__qty-badge">${item.quantity}</span>
          </div>
          <div class="order-item__info">
            <div class="order-item__name">${escHtml(item.name)}</div>
            ${item.variant ? `<div class="order-item__variant">${escHtml(item.variant)}</div>` : ''}
          </div>
          <div class="order-item__price">${formatCurrency(item.price * item.quantity)}</div>
        </div>`).join('');
    }

    const subEl = document.getElementById(subId);
    const delEl = document.getElementById(delId);
    const totEl = document.getElementById(totId);
    if (subEl) subEl.textContent = formatCurrency(subtotal);
    if (delEl) delEl.textContent = formatCurrency(deliveryFee);
    if (totEl) totEl.textContent = formatCurrency(total);
  }

  function renderReviewStep() {
    // Customer info summary
    const reviewInfo = document.getElementById('reviewCustomerInfo');
    if (reviewInfo) {
      reviewInfo.innerHTML = `
        <strong>${escHtml(customerData.customer_name)}</strong><br>
        📞 ${escHtml(customerData.customer_phone)}
        ${customerData.customer_email ? `<br>✉️ ${escHtml(customerData.customer_email)}` : ''}<br>
        📍 ${escHtml(customerData.delivery_address)}
        ${customerData.delivery_info ? `<br><span style="color:var(--clr-muted);">${escHtml(customerData.delivery_info)}</span>` : ''}`;
    }

    // Re-render items in review step
    renderOrderSummary('reviewSummaryItems', 'revSubtotal', 'revDelivery', 'revTotal');

    // Clone items to review list as well
    const reviewList = document.getElementById('reviewItemsList');
    const srcList    = document.getElementById('reviewSummaryItems');
    if (reviewList && srcList) {
      reviewList.innerHTML = srcList.innerHTML;
    }
  }

  async function submitOrder() {
    const items        = Cart.getItems();
    const selectedPay  = document.querySelector('input[name="paymentMethod"]:checked')?.value || 'paystack';

    const orderPayload = {
      customer_name:    customerData.customer_name,
      customer_email:   customerData.customer_email || '',
      customer_phone:   customerData.customer_phone,
      delivery_address: customerData.delivery_address,
      delivery_info:    customerData.delivery_info || '',
      items: items.map(i => ({
        product_id: i.product_id,
        quantity:   i.quantity,
        variant:    i.variant || null
      }))
    };

    try {
      const res  = await fetch('/api/orders', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(orderPayload)
      });
      const data = await res.json();

      if (!data.success) {
        showPaymentState('failed');
        showToast(data.message || 'Order failed.', 'error');
        const placeOrder = document.getElementById('placeOrderBtn');
        if (placeOrder) { placeOrder.disabled = false; placeOrder.innerHTML = '🔒 Place Order &amp; Pay'; }
        return;
      }

      placedOrder = data.order;
      Cart.clear();

      if (selectedPay === 'on_delivery') {
        // Cash on delivery — no payment gateway
        const codNumEl = document.getElementById('codOrderNum');
        if (codNumEl) codNumEl.textContent = `Order #${data.order.order_number}`;
        showPaymentState('cod');
        return;
      }

      // Redirect to Paystack / Flutterwave
      if (data.payment) {
        const provider = data.payment.status; // paystack returns {status: true, data: {authorization_url}}
        const authUrl  = data.payment.data?.authorization_url  // Paystack
                      || data.payment.data?.link;              // Flutterwave

        if (authUrl) {
          window.location.href = authUrl;
          return;
        }
      }

      // Fallback: no payment URL but order was created
      const successNumEl = document.getElementById('successOrderNum');
      if (successNumEl) successNumEl.textContent = `Order #${data.order.order_number}`;
      showPaymentState('success');

    } catch (err) {
      console.error('Order submission error:', err);
      showPaymentState('failed');
      showToast('Network error. Please try again.', 'error');
      const placeOrder = document.getElementById('placeOrderBtn');
      if (placeOrder) { placeOrder.disabled = false; placeOrder.innerHTML = '🔒 Place Order &amp; Pay'; }
    }
  }

  async function verifyPayment(reference, transactionId) {
    try {
      const res  = await fetch('/api/orders/verify-payment', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ reference, transaction_id: transactionId })
      });
      const data = await res.json();

      if (data.success) {
        Cart.clear();
        const successNumEl = document.getElementById('successOrderNum');
        if (successNumEl) successNumEl.textContent = `Order #${data.order_number}`;
        showPaymentState('success');
        // Clean the URL
        window.history.replaceState({}, document.title, window.location.pathname);
      } else {
        showPaymentState('failed');
      }
    } catch {
      showPaymentState('failed');
    }
  }

  function validateForm(form) {
    let valid = true;
    form.querySelectorAll('[required]').forEach(field => {
      if (!field.value.trim()) {
        field.style.borderColor = 'var(--clr-error)';
        valid = false;
        field.addEventListener('input', () => { field.style.borderColor = ''; }, { once: true });
      }
    });
    if (!valid) showToast('Please fill in all required fields.', 'warning');
    return valid;
  }
}
