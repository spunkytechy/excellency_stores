/* ============================================================
   KISSOWRA'S BEAUTY — admin.js
   All admin dashboard, products, orders, customers,
   analytics, complaints, settings page logic.
   ============================================================ */

'use strict';

// Every admin page calls initAdminSession() first.
// Individual init functions are called per-page.

// ── DASHBOARD ─────────────────────────────────────────────
async function initAdminDashboard() {
  if (!initAdminSession()) return;

  await loadSummary();
  await loadRecentOrders();
  await loadTrendingProducts();

  document.getElementById('refreshDashboard')?.addEventListener('click', async () => {
    await loadSummary();
    await loadRecentOrders();
    await loadTrendingProducts();
    showToast('Dashboard refreshed.', 'success');
  });
}

async function loadSummary() {
  try {
    const data = await apiFetch('/api/analytics/summary');
    if (!data.success) return;

    setValue('statTotalSales',     formatCurrency(data.total_sales));
    setValue('statTodaySales',     formatCurrency(data.today_sales));
    setValue('statTotalOrders',    data.total_orders);
    setValue('statPendingOrders',  data.pending_orders);
    setValue('statTotalProducts',  data.total_products);
    setValue('statTotalCustomers', data.total_customers);

    // Badge on orders sidebar link
    const badge = document.getElementById('pendingOrdersBadge');
    if (badge) {
      badge.textContent      = data.pending_orders;
      badge.style.display    = data.pending_orders > 0 ? '' : 'none';
    }

    const cBadge = document.getElementById('newComplaintsBadge');
    if (cBadge && data.new_complaints > 0) {
      cBadge.textContent   = data.new_complaints;
      cBadge.style.display = '';
    }

    // Revenue chart (last 7 days)
    renderRevenueChart(data.last7_days || []);

  } catch (err) { console.error('loadSummary error:', err); }
}

function renderRevenueChart(last7) {
  const canvas = document.getElementById('revenueChart');
  if (!canvas || typeof Chart === 'undefined') return;

  // Destroy existing instance if any
  if (canvas._chartInstance) canvas._chartInstance.destroy();

  const labels   = last7.map(d => formatDate(d.date));
  const revenues = last7.map(d => d.revenue);

  canvas._chartInstance = new Chart(canvas, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label:           'Revenue (₦)',
        data:            revenues,
        borderColor:     '#8b1a4a',
        backgroundColor: 'rgba(139,26,74,0.08)',
        borderWidth:     2.5,
        pointBackgroundColor: '#8b1a4a',
        pointRadius:     4,
        fill:            true,
        tension:         0.4
      }]
    },
    options: {
      responsive: true,
      plugins: { legend: { display: false } },
      scales: {
        y: { beginAtZero: true, ticks: { callback: v => `₦${(v/1000).toFixed(0)}k` } }
      }
    }
  });
}

async function loadRecentOrders() {
  try {
    const data = await apiFetch('/api/orders?limit=8&page=1');
    if (!data.success) return;

    const tbody = document.getElementById('recentOrdersBody');
    if (!tbody) return;

    if (!data.orders.length) {
      tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;padding:var(--space-6);color:var(--clr-muted);">No orders yet.</td></tr>';
      return;
    }

    tbody.innerHTML = data.orders.map(o => `
      <tr>
        <td><a href="orders.html" style="color:var(--clr-primary);font-weight:var(--fw-semi);">#${escHtml(o.order_number)}</a></td>
        <td>${escHtml(o.customer_name)}</td>
        <td><strong>${formatCurrency(o.total_amount)}</strong></td>
        <td>${statusBadge(o.order_status)}</td>
      </tr>`).join('');

  } catch { /* silent */ }
}

async function loadTrendingProducts() {
  try {
    const data = await apiFetch('/api/analytics/trending?limit=5&days=30');
    if (!data.success) return;

    const tbody = document.getElementById('trendingBody');
    if (!tbody) return;

    if (!data.trending.length) {
      tbody.innerHTML = '<tr><td colspan="3" style="text-align:center;padding:var(--space-6);color:var(--clr-muted);">No sales data yet.</td></tr>';
      return;
    }

    tbody.innerHTML = data.trending.map(t => `
      <tr>
        <td>
          <div style="display:flex;align-items:center;gap:var(--space-2);">
            <img src="${t.image || ''}" onerror="this.style.display='none'" alt="" style="width:36px;height:36px;object-fit:cover;border-radius:var(--radius-sm);" />
            <span style="font-size:var(--text-sm);font-weight:var(--fw-medium);">${escHtml(t.product_name)}</span>
          </div>
        </td>
        <td><span class="badge badge--primary">${t.units_sold} sold</span></td>
        <td><strong>${formatCurrency(t.revenue)}</strong></td>
      </tr>`).join('');

  } catch { /* silent */ }
}

// ── PRODUCTS PAGE ──────────────────────────────────────────
async function initAdminProducts() {
  if (!initAdminSession()) return;

  let currentPage = 1;
  let categories  = [];

  await loadAdminProducts();
  await loadAdminCategories();

  // Debounced search
  let searchTimer;
  document.getElementById('productSearch')?.addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => { currentPage = 1; loadAdminProducts(); }, 350);
  });

  document.getElementById('productStatusFilter')?.addEventListener('change', () => { currentPage = 1; loadAdminProducts(); });
  document.getElementById('productCatFilter')?.addEventListener('change',    () => { currentPage = 1; loadAdminProducts(); });

  // Add product button
  document.getElementById('addProductBtn')?.addEventListener('click', () => openProductModal());

  // Modal close buttons
  document.getElementById('productModalClose')?.addEventListener('click', () => closeModal('productModal'));
  document.getElementById('cancelProductBtn')?.addEventListener('click',  () => closeModal('productModal'));
  document.getElementById('deleteModalClose')?.addEventListener('click',  () => closeModal('deleteProductModal'));
  document.getElementById('cancelDeleteBtn')?.addEventListener('click',   () => closeModal('deleteProductModal'));
  document.getElementById('priceModalClose')?.addEventListener('click',   () => closeModal('priceModal'));
  document.getElementById('cancelPriceBtn')?.addEventListener('click',    () => closeModal('priceModal'));

  // Save product
  document.getElementById('saveProductBtn')?.addEventListener('click', () => saveProduct());

  // Confirm delete
  document.getElementById('confirmDeleteBtn')?.addEventListener('click', () => deleteProduct());

  // Save price
  document.getElementById('savePriceBtn')?.addEventListener('click', () => updateProductPrice());

  const requestedAction = new URLSearchParams(window.location.search).get('action');
  if (requestedAction === 'add') {
    openProductModal();
  } else if (requestedAction === 'upload') {
    document.getElementById('productsTableBody')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    showToast('Choose a product and select its image action to upload or replace its picture.', 'info');
  } else if (requestedAction === 'delete' || requestedAction === 'price') {
    document.getElementById('productsTableBody')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    const actionMessage = requestedAction === 'delete'
      ? 'Choose a product below to delete.'
      : 'Choose a product below to update its price.';
    showToast(actionMessage, 'info');
  }

  // Image preview
  document.getElementById('pImage')?.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const preview = document.getElementById('imagePreviewArea');
    if (preview) {
      const url = URL.createObjectURL(file);
      preview.innerHTML = `<img src="${url}" alt="Preview" style="width:120px;height:120px;object-fit:cover;border-radius:var(--radius-md);border:1px solid var(--clr-border);" />`;
    }
  });

  async function loadAdminCategories() {
    try {
      const data = await apiFetch('/api/products/categories');
      if (!data.success) return;
      categories = data.categories;

      const catFilter  = document.getElementById('productCatFilter');
      const categorySelect = document.getElementById('pCategory');

      if (catFilter) data.categories.forEach(c => {
        catFilter.innerHTML += `<option value="${escHtml(c)}">${escHtml(c)}</option>`;
      });
      if (categorySelect) data.categories.forEach(c => {
        const option = document.createElement('option');
        option.value = c;
        option.textContent = c;
        categorySelect.appendChild(option);
      });
    } catch {}
  }

  async function loadAdminProducts() {
    const tbody    = document.getElementById('productsTableBody');
    const countEl  = document.getElementById('productTableCount');
    const pagEl    = document.getElementById('productPagination');

    if (tbody) tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:var(--space-8);"><div class="spinner" style="margin:auto;"></div></td></tr>';

    const qs = new URLSearchParams({ page: currentPage, limit: 15 });
    const search = document.getElementById('productSearch')?.value.trim();
    const status = document.getElementById('productStatusFilter')?.value;
    const cat    = document.getElementById('productCatFilter')?.value;

    if (search) qs.set('search', search);
    if (status) qs.set('status', status);
    if (cat)    qs.set('category', cat);

    try {
      const data = await apiFetch(`/api/products?${qs}`);
      if (!data.success) throw new Error();

      if (!data.products.length) {
        if (tbody) tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:var(--space-10);color:var(--clr-muted);">No products found.</td></tr>';
        if (countEl) countEl.textContent = '0 products';
        if (pagEl)   pagEl.innerHTML = '';
        return;
      }

      if (countEl) countEl.textContent = `${data.total} products`;

      tbody.innerHTML = data.products.map(p => {
        const imgSrc = p.image || '';
        return `
        <tr>
          <td>
            <div class="table-product-info">
              <img src="${imgSrc}" onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2244%22 height=%2244%22><rect fill=%22%23fdf0f5%22 width=%2244%22 height=%2244%22/><text y=%2230%22 x=%2222%22 text-anchor=%22middle%22 fill=%22%23c9955b%22 font-size=%2224%22>💋</text></svg>'"
                class="table-product-img" alt="${escHtml(p.name)}" />
              <div>
                <div class="table-product-name">${escHtml(p.name)}</div>
                <div class="table-product-cat">${escHtml(p.category)}</div>
              </div>
            </div>
          </td>
          <td><span class="badge badge--gold">${escHtml(p.category)}</span></td>
          <td>
            <div style="font-weight:var(--fw-bold);color:var(--clr-primary);">${formatCurrency(p.discount_price || p.price)}</div>
            ${p.discount_price ? `<div style="font-size:var(--text-xs);color:var(--clr-muted);text-decoration:line-through;">${formatCurrency(p.price)}</div>` : ''}
          </td>
          <td>
            <span class="${p.stock > 10 ? 'badge badge--success' : p.stock > 0 ? 'badge badge--warning' : 'badge badge--error'}">${p.stock}</span>
          </td>
          <td>${statusBadge(p.status)}</td>
          <td style="font-size:var(--text-xs);color:var(--clr-muted);">${formatDate(p.created_at)}</td>
          <td>
            <div class="table-action-group">
              <button class="btn btn-ghost btn--sm" onclick="openProductModal('${p.id}')" title="Edit">✏️</button>
              <button class="btn btn-ghost btn--sm" onclick="openProductImageModal('${p.id}')" title="Upload image" aria-label="Upload image for ${escHtml(p.name)}"><i data-feather="image" aria-hidden="true"></i></button>
              <button class="btn btn-ghost btn--sm" onclick="openPriceModal('${p.id}','${escHtml(p.name)}',${p.price},${p.discount_price || 'null'})" title="Price">💰</button>
              <button class="btn btn-danger btn--sm" onclick="openDeleteModal('${p.id}','${escHtml(p.name)}')" title="Delete">🗑️</button>
            </div>
          </td>
        </tr>`;
      }).join('');
      if (window.feather) window.feather.replace();

      renderPagination(pagEl, currentPage, Math.ceil(data.total / 15), (p) => { currentPage = p; loadAdminProducts(); });
    } catch {
      if (tbody) tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:var(--space-8);color:var(--clr-error);">Failed to load products.</td></tr>';
    }
  }
}

// Called from inline onclick in table
async function openProductModal(productId) {
  const modal     = document.getElementById('productModal');
  const titleEl   = document.getElementById('productModalTitle');
  const idInput   = document.getElementById('productId');

  // Reset form
  document.getElementById('productForm')?.reset();
  document.getElementById('imagePreviewArea').innerHTML = '';
  if (idInput) idInput.value = '';
  if (titleEl) titleEl.textContent = productId ? 'Edit Product' : 'Add Product';

  if (productId) {
    try {
      const data = await apiFetch(`/api/products/${productId}`);
      if (data.success && data.product) {
        const p = data.product;
        if (idInput) idInput.value = p.id;
        setValue_input('pName',          p.name);
        setValue_input('pCategory',      p.category);
        setValue_input('pDescription',   p.description);
        setValue_input('pPrice',         p.price);
        setValue_input('pDiscountPrice', p.discount_price || '');
        setValue_input('pStock',         p.stock);
        setValue_input('pVariants',      (p.variants || []).join(', '));
        const statusSel = document.getElementById('pStatus');
        if (statusSel) statusSel.value = p.status;
        if (p.image) {
          document.getElementById('imagePreviewArea').innerHTML =
            `<img src="${p.image}" alt="Current" style="width:120px;height:120px;object-fit:cover;border-radius:var(--radius-md);border:1px solid var(--clr-border);" />`;
        }
      }
    } catch {}
  }

  openModal('productModal');
}

async function openProductImageModal(productId) {
  await openProductModal(productId);
  document.getElementById('imageUploadArea')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  document.getElementById('pImage')?.focus({ preventScroll: true });
}

async function saveProduct() {
  const productId  = document.getElementById('productId')?.value;
  const saveBtn    = document.getElementById('saveProductBtn');
  saveBtn.disabled = true;
  saveBtn.textContent = 'Saving…';

  try {
    const formData = new FormData();
    formData.append('name',           document.getElementById('pName')?.value.trim());
    formData.append('category',       document.getElementById('pCategory')?.value.trim());
    formData.append('description',    document.getElementById('pDescription')?.value.trim());
    formData.append('price',          document.getElementById('pPrice')?.value);
    formData.append('discount_price', document.getElementById('pDiscountPrice')?.value);
    formData.append('stock',          document.getElementById('pStock')?.value);
    formData.append('status',         document.getElementById('pStatus')?.value);

    const variantRaw = document.getElementById('pVariants')?.value.trim();
    formData.append('variants', JSON.stringify(
      variantRaw ? variantRaw.split(',').map(v => v.trim()).filter(Boolean) : []
    ));

    const imageFile = document.getElementById('pImage')?.files[0];
    if (imageFile) formData.append('image', imageFile);

    const url     = productId ? `/api/products/${productId}` : '/api/products';
    const method  = productId ? 'PUT' : 'POST';
    const token   = localStorage.getItem('kws_admin_token');

    const res = await fetch(url, {
      method,
      headers: { Authorization: `Bearer ${token}` },
      body: formData
    });
    const data = await res.json();

    if (data.success) {
      showToast(productId ? 'Product updated.' : 'Product created.', 'success');
      closeModal('productModal');
      setTimeout(() => location.reload(), 800);
    } else {
      showToast(data.message || 'Save failed.', 'error');
    }
  } catch { showToast('Network error.', 'error'); }
  finally { saveBtn.disabled = false; saveBtn.textContent = 'Save Product'; }
}

function openDeleteModal(productId, name) {
  document.getElementById('deleteProductId').value   = productId;
  document.getElementById('deleteProductName').textContent = name;
  openModal('deleteProductModal');
}

async function deleteProduct() {
  const productId = document.getElementById('deleteProductId')?.value;
  const btn       = document.getElementById('confirmDeleteBtn');
  btn.disabled    = true;
  btn.textContent = 'Deleting…';

  try {
    const data = await apiFetch(`/api/products/${productId}`, { method: 'DELETE' });
    if (data.success) {
      showToast('Product deleted.', 'success');
      closeModal('deleteProductModal');
      setTimeout(() => location.reload(), 600);
    } else {
      showToast(data.message || 'Delete failed.', 'error');
    }
  } catch { showToast('Network error.', 'error'); }
  finally { btn.disabled = false; btn.textContent = 'Delete Product'; }
}

function openPriceModal(productId, name, price, discountPrice) {
  document.getElementById('priceProductId').value         = productId;
  document.getElementById('priceProductName').textContent = name;
  document.getElementById('currentPriceDisplay').textContent = formatCurrency(price);
  setValue_input('newPrice',         price);
  setValue_input('newDiscountPrice', discountPrice !== null && discountPrice !== 'null' ? discountPrice : '');
  openModal('priceModal');
}

async function updateProductPrice() {
  const productId = document.getElementById('priceProductId')?.value;
  const btn       = document.getElementById('savePriceBtn');
  btn.disabled    = true;
  btn.textContent = 'Saving…';

  const newPrice    = document.getElementById('newPrice')?.value;
  const newDiscount = document.getElementById('newDiscountPrice')?.value;

  try {
    const data = await apiFetch(`/api/products/${productId}/price`, {
      method: 'PATCH',
      body:   JSON.stringify({ price: newPrice, discount_price: newDiscount || null })
    });
    if (data.success) {
      showToast('Price updated.', 'success');
      closeModal('priceModal');
      setTimeout(() => location.reload(), 600);
    } else {
      showToast(data.message || 'Update failed.', 'error');
    }
  } catch { showToast('Network error.', 'error'); }
  finally { btn.disabled = false; btn.textContent = 'Update Price'; }
}

// ── ORDERS PAGE ────────────────────────────────────────────
async function initAdminOrders() {
  if (!initAdminSession()) return;

  let currentPage = 1;
  let searchTimer;

  await loadAdminOrders();

  document.getElementById('orderSearch')?.addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => { currentPage = 1; loadAdminOrders(); }, 350);
  });
  document.getElementById('orderStatusFilter')?.addEventListener('change',  () => { currentPage = 1; loadAdminOrders(); });
  document.getElementById('paymentStatusFilter')?.addEventListener('change', () => { currentPage = 1; loadAdminOrders(); });

  document.getElementById('orderModalClose')?.addEventListener('click',  () => closeModal('orderModal'));
  document.getElementById('closeOrderModal')?.addEventListener('click',  () => closeModal('orderModal'));
  document.getElementById('statusModalClose')?.addEventListener('click', () => closeModal('statusModal'));
  document.getElementById('cancelStatusBtn')?.addEventListener('click',  () => closeModal('statusModal'));
  document.getElementById('saveStatusBtn')?.addEventListener('click',    () => saveOrderStatus());

  async function loadAdminOrders() {
    const tbody   = document.getElementById('ordersTableBody');
    const countEl = document.getElementById('orderTableCount');
    const pagEl   = document.getElementById('orderPagination');

    if (tbody) tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:var(--space-8);"><div class="spinner" style="margin:auto;"></div></td></tr>';

    const qs = new URLSearchParams({ page: currentPage, limit: 15 });
    const search  = document.getElementById('orderSearch')?.value.trim();
    const oStatus = document.getElementById('orderStatusFilter')?.value;
    const pStatus = document.getElementById('paymentStatusFilter')?.value;
    if (search)  qs.set('search', search);
    if (oStatus) qs.set('status', oStatus);
    if (pStatus) qs.set('payment_status', pStatus);

    try {
      const data = await apiFetch(`/api/orders?${qs}`);
      if (!data.success) throw new Error();

      if (countEl) countEl.textContent = `${data.total} orders`;

      if (!data.orders.length) {
        tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:var(--space-10);color:var(--clr-muted);">No orders found.</td></tr>';
        if (pagEl) pagEl.innerHTML = '';
        return;
      }

      tbody.innerHTML = data.orders.map(o => `
        <tr>
          <td><a href="#" onclick="viewOrderDetail('${o.id}');return false;" style="color:var(--clr-primary);font-weight:var(--fw-semi);">#${escHtml(o.order_number)}</a></td>
          <td>${escHtml(o.customer_name)}</td>
          <td>${escHtml(o.customer_phone)}</td>
          <td style="font-size:var(--text-xs);color:var(--clr-muted);">${formatDateTime(o.created_at)}</td>
          <td><strong>${formatCurrency(o.total_amount)}</strong></td>
          <td>${statusBadge(o.payment_status)}</td>
          <td>${statusBadge(o.order_status)}</td>
          <td>
            <div class="table-action-group">
              <button class="btn btn-ghost btn--sm" onclick="viewOrderDetail('${o.id}')" title="View">👁️</button>
              <button class="btn btn-primary btn--sm" onclick="openStatusModal('${o.id}','${escHtml(o.order_number)}','${o.order_status}','${o.payment_status}')" title="Update Status">🔄</button>
            </div>
          </td>
        </tr>`).join('');

      renderPagination(pagEl, currentPage, Math.ceil(data.total / 15), (p) => { currentPage = p; loadAdminOrders(); });
    } catch {
      if (tbody) tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;color:var(--clr-error);padding:var(--space-8);">Failed to load orders.</td></tr>';
    }
  }
}

async function viewOrderDetail(orderId) {
  openModal('orderModal');
  const body = document.getElementById('orderModalBody');
  if (body) body.innerHTML = '<div style="text-align:center;padding:var(--space-8);"><div class="spinner" style="margin:auto;"></div></div>';

  try {
    const data = await apiFetch(`/api/orders/${orderId}`);
    if (!data.success) throw new Error();
    const o     = data.order;
    const items = data.items || [];

    body.innerHTML = `
      <div style="display:grid;gap:var(--space-5);">
        <div style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:var(--space-3);">
          <div>
            <div style="font-size:var(--text-xs);color:var(--clr-muted);text-transform:uppercase;letter-spacing:.1em;">Order Number</div>
            <div style="font-size:var(--text-xl);font-weight:var(--fw-bold);color:var(--clr-primary);">#${escHtml(o.order_number)}</div>
            <div style="font-size:var(--text-xs);color:var(--clr-muted);">${formatDateTime(o.created_at)}</div>
          </div>
          <div style="display:flex;gap:var(--space-2);">${statusBadge(o.order_status)} ${statusBadge(o.payment_status)}</div>
        </div>
        <div style="background:var(--clr-accent-light);border-radius:var(--radius-md);padding:var(--space-4);">
          <div style="font-size:var(--text-xs);color:var(--clr-muted);font-weight:var(--fw-bold);letter-spacing:.1em;text-transform:uppercase;margin-bottom:var(--space-3);">Customer</div>
          <div style="font-size:var(--text-sm);line-height:1.8;">
            <strong>${escHtml(o.customer_name)}</strong><br>
            📞 ${escHtml(o.customer_phone)}<br>
            ${o.customer_email ? `✉️ ${escHtml(o.customer_email)}<br>` : ''}
            📍 ${escHtml(o.delivery_address)}
            ${o.delivery_info ? `<br><span style="color:var(--clr-muted);">${escHtml(o.delivery_info)}</span>` : ''}
          </div>
        </div>
        <div>
          <div style="font-size:var(--text-xs);color:var(--clr-muted);font-weight:var(--fw-bold);letter-spacing:.1em;text-transform:uppercase;margin-bottom:var(--space-3);">Items</div>
          ${items.map(i => `
            <div style="display:flex;align-items:center;gap:var(--space-3);padding:var(--space-3) 0;border-bottom:1px dashed var(--clr-border);">
              <div style="flex:1;">
                <div style="font-size:var(--text-sm);font-weight:var(--fw-medium);">${escHtml(i.product_name)}</div>
                ${i.variant ? `<div style="font-size:var(--text-xs);color:var(--clr-muted);">${escHtml(i.variant)}</div>` : ''}
              </div>
              <div style="font-size:var(--text-xs);color:var(--clr-muted);">×${i.quantity}</div>
              <div style="font-weight:var(--fw-bold);">${formatCurrency(i.price * i.quantity)}</div>
            </div>`).join('')}
        </div>
        <div style="text-align:right;">
          <div style="font-size:var(--text-sm);color:var(--clr-muted);">Subtotal: ${formatCurrency(o.subtotal)}</div>
          <div style="font-size:var(--text-sm);color:var(--clr-muted);">Delivery: ${formatCurrency(o.delivery_fee)}</div>
          <div style="font-size:var(--text-xl);font-weight:var(--fw-bold);color:var(--clr-primary);margin-top:var(--space-2);">Total: ${formatCurrency(o.total_amount)}</div>
        </div>
      </div>`;
  } catch {
    body.innerHTML = '<p style="color:var(--clr-error);text-align:center;">Could not load order details.</p>';
  }
}

function openStatusModal(orderId, orderNum, currentOrderStatus, currentPaymentStatus) {
  document.getElementById('statusOrderId').value      = orderId;
  document.getElementById('statusOrderNum').textContent = `#${orderNum}`;
  const oSel = document.getElementById('newOrderStatus');
  const pSel = document.getElementById('newPaymentStatus');
  if (oSel) oSel.value = currentOrderStatus;
  if (pSel) pSel.value = currentPaymentStatus;
  openModal('statusModal');
}

async function saveOrderStatus() {
  const orderId      = document.getElementById('statusOrderId')?.value;
  const order_status = document.getElementById('newOrderStatus')?.value;
  const payment_status = document.getElementById('newPaymentStatus')?.value;
  const btn = document.getElementById('saveStatusBtn');
  btn.disabled = true; btn.textContent = 'Saving…';

  try {
    const data = await apiFetch(`/api/orders/${orderId}/status`, {
      method: 'PUT',
      body: JSON.stringify({ order_status, payment_status })
    });
    if (data.success) {
      showToast('Order status updated.', 'success');
      closeModal('statusModal');
      setTimeout(() => location.reload(), 600);
    } else {
      showToast(data.message || 'Update failed.', 'error');
    }
  } catch { showToast('Network error.', 'error'); }
  finally { btn.disabled = false; btn.textContent = 'Update Status'; }
}

// ── CUSTOMERS PAGE ─────────────────────────────────────────
async function initAdminCustomers() {
  if (!initAdminSession()) return;

  let currentPage = 1;
  let searchTimer;

  await loadAdminCustomers();
  await loadCustomerStats();

  document.getElementById('customerSearch')?.addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => { currentPage = 1; loadAdminCustomers(); }, 350);
  });
  document.getElementById('customerStatusFilter')?.addEventListener('change', () => { currentPage = 1; loadAdminCustomers(); });
  document.getElementById('customerModalClose')?.addEventListener('click', () => closeModal('customerModal'));
  document.getElementById('closeCustomerModal')?.addEventListener('click', () => closeModal('customerModal'));

  async function loadCustomerStats() {
    try {
      const all  = await apiFetch('/api/customers?limit=1000');
      if (!all.success) return;
      const customers = all.customers || [];
      setValue('statTotalBuyers',   customers.length || all.total);
      setValue('statFullCustomers', customers.filter(c => c.customer_status === 'customer').length);
      setValue('statReturning',     customers.filter(c => c.customer_status === 'returning_buyer').length);
      setValue('statNew',           customers.filter(c => c.customer_status === 'new_buyer').length);
    } catch {}
  }

  async function loadAdminCustomers() {
    const tbody   = document.getElementById('customersTableBody');
    const countEl = document.getElementById('customerTableCount');
    const pagEl   = document.getElementById('customerPagination');

    if (tbody) tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:var(--space-8);"><div class="spinner" style="margin:auto;"></div></td></tr>';

    const qs = new URLSearchParams({ page: currentPage, limit: 15 });
    const search = document.getElementById('customerSearch')?.value.trim();
    const status = document.getElementById('customerStatusFilter')?.value;
    if (search) qs.set('search', search);
    if (status) qs.set('status', status);

    try {
      const data = await apiFetch(`/api/customers?${qs}`);
      if (!data.success) throw new Error();
      if (countEl) countEl.textContent = `${data.total} records`;

      if (!data.customers.length) {
        tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:var(--space-10);color:var(--clr-muted);">No customer records found.</td></tr>';
        if (pagEl) pagEl.innerHTML = '';
        return;
      }

      tbody.innerHTML = data.customers.map(c => `
        <tr>
          <td><strong>${escHtml(c.name)}</strong></td>
          <td>${escHtml(c.phone)}</td>
          <td>${c.email ? escHtml(c.email) : '<span style="color:var(--clr-muted);">—</span>'}</td>
          <td><span class="badge badge--primary">${c.completed_purchases}</span></td>
          <td><strong>${formatCurrency(c.total_spent)}</strong></td>
          <td style="font-size:var(--text-xs);color:var(--clr-muted);">${c.last_purchase ? formatDate(c.last_purchase) : '—'}</td>
          <td>${statusBadge(c.customer_status, c.customer_status === 'customer' ? 'Customer ★' : c.customer_status === 'returning_buyer' ? 'Returning' : 'New Buyer')}</td>
          <td><button class="btn btn-ghost btn--sm" onclick="viewCustomerDetail('${c.id}')" title="View">👁️</button></td>
        </tr>`).join('');

      renderPagination(pagEl, currentPage, Math.ceil(data.total / 15), (p) => { currentPage = p; loadAdminCustomers(); });
    } catch {
      if (tbody) tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;color:var(--clr-error);padding:var(--space-8);">Failed to load customers.</td></tr>';
    }
  }
}

async function viewCustomerDetail(customerId) {
  openModal('customerModal');
  const body = document.getElementById('customerModalBody');
  body.innerHTML = '<div style="text-align:center;padding:var(--space-8);"><div class="spinner" style="margin:auto;"></div></div>';

  try {
    const data = await apiFetch(`/api/customers/${customerId}`);
    if (!data.success) throw new Error();
    const c      = data.customer;
    const orders = data.orders || [];

    body.innerHTML = `
      <div style="display:grid;gap:var(--space-5);">
        <div style="display:flex;align-items:center;gap:var(--space-4);">
          <div style="width:56px;height:56px;border-radius:50%;background:linear-gradient(135deg,var(--clr-primary),var(--clr-secondary));display:flex;align-items:center;justify-content:center;color:white;font-size:1.5rem;font-weight:bold;flex-shrink:0;">
            ${c.name.charAt(0).toUpperCase()}
          </div>
          <div>
            <div style="font-size:var(--text-xl);font-weight:var(--fw-bold);">${escHtml(c.name)}</div>
            <div>${statusBadge(c.customer_status, c.customer_status === 'customer' ? 'Customer (3+ Purchases)' : c.customer_status === 'returning_buyer' ? 'Returning Buyer' : 'New Buyer')}</div>
          </div>
        </div>
        <div style="background:var(--clr-accent-light);border-radius:var(--radius-md);padding:var(--space-4);font-size:var(--text-sm);line-height:1.8;">
          📞 ${escHtml(c.phone)}<br>
          ${c.email ? `✉️ ${escHtml(c.email)}<br>` : ''}
          🛍️ ${c.completed_purchases} completed purchase${c.completed_purchases !== 1 ? 's' : ''}<br>
          💰 Total spent: ${formatCurrency(c.total_spent)}<br>
          📅 Member since: ${formatDate(c.created_at)}
          ${c.last_purchase ? `<br>🕐 Last purchase: ${formatDate(c.last_purchase)}` : ''}
        </div>
        ${orders.length ? `
        <div>
          <div style="font-size:var(--text-xs);font-weight:var(--fw-bold);color:var(--clr-muted);letter-spacing:.1em;text-transform:uppercase;margin-bottom:var(--space-3);">Recent Orders</div>
          ${orders.slice(0, 5).map(o => `
            <div style="display:flex;justify-content:space-between;padding:var(--space-2) 0;border-bottom:1px dashed var(--clr-border);font-size:var(--text-sm);">
              <span style="color:var(--clr-primary);">#${escHtml(o.order_number)}</span>
              <span>${formatCurrency(o.total_amount)}</span>
              <span>${statusBadge(o.order_status)}</span>
              <span style="color:var(--clr-muted);">${formatDate(o.created_at)}</span>
            </div>`).join('')}
        </div>` : ''}
      </div>`;
  } catch {
    body.innerHTML = '<p style="color:var(--clr-error);text-align:center;">Could not load customer details.</p>';
  }
}

// ── ANALYTICS PAGE ─────────────────────────────────────────
async function initAdminAnalytics() {
  if (!initAdminSession()) return;

  let currentPeriod = 'daily';
  let mainChart, ordersChart;

  // Set default date values
  const today = new Date().toISOString().split('T')[0];
  const thisMonth = today.substring(0, 7);
  const thisYear  = new Date().getFullYear().toString();

  const dailyPicker = document.getElementById('dailyDatePicker');
  const monthPicker = document.getElementById('monthPicker');
  const yearPicker  = document.getElementById('yearPicker');

  if (dailyPicker) dailyPicker.value = today;
  if (monthPicker) monthPicker.value = thisMonth;
  if (yearPicker)  yearPicker.value  = thisYear;

  // Period toggle buttons
  document.querySelectorAll('.period-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.period-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentPeriod = btn.dataset.period;
      togglePickers(currentPeriod);
    });
  });

  document.getElementById('loadAnalyticsBtn')?.addEventListener('click', () => loadAnalytics());
  document.getElementById('loadTrendingBtn')?.addEventListener('click',   () => loadTrendingTable());

  togglePickers('daily');
  await loadAnalytics();
  await loadTrendingTable();

  function togglePickers(period) {
    if (dailyPicker) dailyPicker.style.display = period === 'daily'   ? '' : 'none';
    if (monthPicker) monthPicker.style.display = period === 'monthly' ? '' : 'none';
    if (yearPicker)  yearPicker.style.display  = period === 'yearly'  ? '' : 'none';
  }

  async function loadAnalytics() {
    let url, extraKey;

    if (currentPeriod === 'daily') {
      const date = dailyPicker?.value || today;
      url = `/api/analytics/daily?date=${date}`;
    } else if (currentPeriod === 'monthly') {
      const month = monthPicker?.value || thisMonth;
      url = `/api/analytics/monthly?month=${month}`;
      extraKey = 'revenue_growth';
    } else {
      const year = yearPicker?.value || thisYear;
      url = `/api/analytics/yearly?year=${year}`;
    }

    try {
      const data = await apiFetch(url);
      if (!data.success) return;

      setValue('aRevenue',       formatCurrency(data.revenue));
      setValue('aOrders',        data.total_orders);
      setValue('aProductsSold',  data.products_sold);
      setValue('aAvgOrder',      formatCurrency(data.avg_order_value));

      const growthCard = document.getElementById('growthCard');
      if (growthCard && data.revenue_growth !== undefined) {
        growthCard.style.display = '';
        const growth = parseFloat(data.revenue_growth);
        setValue('aGrowth', `${growth >= 0 ? '+' : ''}${growth}%`);
        document.getElementById('aGrowth').style.color = growth >= 0 ? 'var(--clr-success)' : 'var(--clr-error)';
      } else if (growthCard) {
        growthCard.style.display = 'none';
      }

      // Build chart data
      const breakdownData = data.hourly || data.daily || data.monthly || [];
      renderAnalyticsCharts(breakdownData, currentPeriod);

    } catch {}
  }

  function renderAnalyticsCharts(breakdownData, period) {
    const labelMap = {
      hourly:  (d) => `${d.hour}:00`,
      daily:   (d) => `Day ${d.day}`,
      monthly: (d) => ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][d.month - 1] || d.month
    };

    const key    = period === 'daily' ? 'hourly' : period === 'monthly' ? 'daily' : 'monthly';
    const labels = breakdownData.map(labelMap[key] || (d => d.day || d.month));
    const revs   = breakdownData.map(d => d.revenue || 0);
    const ords   = breakdownData.map(d => d.orders  || 0);

    const mainCanvas   = document.getElementById('mainAnalyticsChart');
    const ordersCanvas = document.getElementById('ordersAnalyticsChart');

    if (mainCanvas && typeof Chart !== 'undefined') {
      if (mainChart) mainChart.destroy();
      mainChart = new Chart(mainCanvas, {
        type: 'bar',
        data: {
          labels,
          datasets: [{
            label: 'Revenue (₦)',
            data: revs,
            backgroundColor: 'rgba(139,26,74,0.7)',
            borderColor:     '#8b1a4a',
            borderWidth: 1.5,
            borderRadius: 4
          }]
        },
        options: {
          responsive: true,
          plugins: { legend: { display: false } },
          scales: { y: { beginAtZero: true, ticks: { callback: v => `₦${(v/1000).toFixed(0)}k` } } }
        }
      });
    }

    if (ordersCanvas && typeof Chart !== 'undefined') {
      if (ordersChart) ordersChart.destroy();
      ordersChart = new Chart(ordersCanvas, {
        type: 'line',
        data: {
          labels,
          datasets: [{
            label: 'Orders',
            data: ords,
            borderColor:     '#c9955b',
            backgroundColor: 'rgba(201,149,91,0.1)',
            borderWidth: 2.5,
            pointRadius: 4,
            fill: true,
            tension: 0.4
          }]
        },
        options: {
          responsive: true,
          plugins: { legend: { display: false } },
          scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } }
        }
      });
    }
  }

  async function loadTrendingTable() {
    const tbody = document.getElementById('trendingTableBody');
    const days  = document.getElementById('trendingDays')?.value || '30';

    if (tbody) tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:var(--space-8);"><div class="spinner" style="margin:auto;"></div></td></tr>';

    try {
      const data = await apiFetch(`/api/analytics/trending?limit=10&days=${days}`);
      if (!data.success) throw new Error();

      if (!data.trending.length) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:var(--space-10);color:var(--clr-muted);">No sales data for this period.</td></tr>';
        return;
      }

      tbody.innerHTML = data.trending.map((t, i) => `
        <tr>
          <td><strong style="color:var(--clr-primary);">#${i + 1}</strong></td>
          <td>
            <div style="display:flex;align-items:center;gap:var(--space-3);">
              <img src="${t.image || ''}" onerror="this.style.display='none'" alt="" style="width:40px;height:40px;object-fit:cover;border-radius:var(--radius-sm);flex-shrink:0;" />
              <span style="font-weight:var(--fw-medium);">${escHtml(t.product_name)}</span>
            </div>
          </td>
          <td><span class="badge badge--gold">${escHtml(t.category || '—')}</span></td>
          <td><strong>${t.units_sold}</strong></td>
          <td><strong style="color:var(--clr-primary);">${formatCurrency(t.revenue)}</strong></td>
        </tr>`).join('');
    } catch {
      if (tbody) tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--clr-error);padding:var(--space-8);">Failed to load data.</td></tr>';
    }
  }
}

// ── COMPLAINTS PAGE ────────────────────────────────────────
async function initAdminComplaints() {
  if (!initAdminSession()) return;

  let currentPage = 1;
  let searchTimer;

  await loadAdminComplaints();
  await loadComplaintStats();

  document.getElementById('complaintSearch')?.addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => { currentPage = 1; loadAdminComplaints(); }, 350);
  });
  document.getElementById('complaintStatusFilter')?.addEventListener('change', () => { currentPage = 1; loadAdminComplaints(); });

  document.getElementById('complaintModalClose')?.addEventListener('click', () => closeModal('complaintModal'));
  document.getElementById('closeComplaintModal')?.addEventListener('click', () => closeModal('complaintModal'));
  document.getElementById('cStatusClose')?.addEventListener('click',        () => closeModal('complaintStatusModal'));
  document.getElementById('cancelCStatusBtn')?.addEventListener('click',    () => closeModal('complaintStatusModal'));
  document.getElementById('saveCStatusBtn')?.addEventListener('click',      () => saveComplaintStatus());

  async function loadComplaintStats() {
    try {
      const data = await apiFetch('/api/complaints?limit=1000');
      if (!data.success) return;
      const complaints = data.complaints || [];
      setValue('cStatNew',      complaints.filter(c => c.status === 'new').length);
      setValue('cStatReview',   complaints.filter(c => c.status === 'in_review').length);
      setValue('cStatResolved', complaints.filter(c => c.status === 'resolved').length);
      setValue('cStatClosed',   complaints.filter(c => c.status === 'closed').length);
    } catch {}
  }

  async function loadAdminComplaints() {
    const tbody   = document.getElementById('complaintsTableBody');
    const countEl = document.getElementById('complaintTableCount');
    const pagEl   = document.getElementById('complaintPagination');

    if (tbody) tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:var(--space-8);"><div class="spinner" style="margin:auto;"></div></td></tr>';

    const qs     = new URLSearchParams({ page: currentPage, limit: 15 });
    const search = document.getElementById('complaintSearch')?.value.trim();
    const status = document.getElementById('complaintStatusFilter')?.value;
    if (search) qs.set('search', search);
    if (status) qs.set('status', status);

    try {
      const data = await apiFetch(`/api/complaints?${qs}`);
      if (!data.success) throw new Error();
      if (countEl) countEl.textContent = `${data.total} complaints`;

      if (!data.complaints.length) {
        tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:var(--space-10);color:var(--clr-muted);">No complaints found.</td></tr>';
        if (pagEl) pagEl.innerHTML = '';
        return;
      }

      tbody.innerHTML = data.complaints.map(c => {
        const snippet = c.complaint.length > 60 ? c.complaint.substring(0, 60) + '…' : c.complaint;
        return `
        <tr>
          <td style="font-size:var(--text-xs);color:var(--clr-muted);">${c.id.substring(0, 8)}…</td>
          <td><strong>${escHtml(c.customer_name)}</strong></td>
          <td>${escHtml(c.phone)}</td>
          <td>${c.order_id ? `<span style="color:var(--clr-primary);">${escHtml(c.order_id)}</span>` : '—'}</td>
          <td style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escHtml(snippet)}</td>
          <td style="font-size:var(--text-xs);color:var(--clr-muted);">${formatDate(c.created_at)}</td>
          <td>${statusBadge(c.status)}</td>
          <td>
            <div class="table-action-group">
              <button class="btn btn-ghost btn--sm" onclick="viewComplaintDetail('${c.id}')" title="View">👁️</button>
              <button class="btn btn-primary btn--sm" onclick="openCStatusModal('${c.id}','${c.status}')" title="Update">🔄</button>
            </div>
          </td>
        </tr>`;
      }).join('');

      renderPagination(pagEl, currentPage, Math.ceil(data.total / 15), (p) => { currentPage = p; loadAdminComplaints(); });
    } catch {
      if (tbody) tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;color:var(--clr-error);padding:var(--space-8);">Failed to load complaints.</td></tr>';
    }
  }
}

async function viewComplaintDetail(complaintId) {
  openModal('complaintModal');
  const body = document.getElementById('complaintModalBody');
  body.innerHTML = '<div style="text-align:center;padding:var(--space-8);"><div class="spinner" style="margin:auto;"></div></div>';

  try {
    // No individual endpoint — find in list
    const data = await apiFetch(`/api/complaints?limit=1000`);
    const c = (data.complaints || []).find(x => x.id === complaintId);
    if (!c) throw new Error();

    // Store id for status update btn
    document.getElementById('cStatusId').value = c.id;
    const updateBtn = document.getElementById('updateComplaintStatusBtn');
    if (updateBtn) {
      updateBtn.style.display = '';
      updateBtn.onclick = () => { closeModal('complaintModal'); openCStatusModal(c.id, c.status); };
    }

    body.innerHTML = `
      <div style="display:grid;gap:var(--space-4);">
        <div style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:var(--space-2);">
          <div style="font-size:var(--text-xs);color:var(--clr-muted);">ID: ${c.id.substring(0,8)}… · ${formatDateTime(c.created_at)}</div>
          ${statusBadge(c.status)}
        </div>
        <div style="background:var(--clr-accent-light);border-radius:var(--radius-md);padding:var(--space-4);font-size:var(--text-sm);line-height:1.8;">
          <strong>${escHtml(c.customer_name)}</strong><br>
          📞 ${escHtml(c.phone)}<br>
          ${c.email ? `✉️ ${escHtml(c.email)}<br>` : ''}
          ${c.order_id ? `📦 Order: ${escHtml(c.order_id)}` : ''}
        </div>
        <div>
          <div style="font-size:var(--text-xs);font-weight:bold;color:var(--clr-muted);letter-spacing:.1em;text-transform:uppercase;margin-bottom:var(--space-2);">Complaint</div>
          <div style="background:var(--clr-light);border-radius:var(--radius-md);padding:var(--space-4);font-size:var(--text-sm);line-height:1.7;border-left:3px solid var(--clr-primary);">${escHtml(c.complaint)}</div>
        </div>
      </div>`;
  } catch {
    body.innerHTML = '<p style="color:var(--clr-error);text-align:center;">Could not load complaint.</p>';
  }
}

function openCStatusModal(complaintId, currentStatus) {
  document.getElementById('cStatusId').value  = complaintId;
  const sel = document.getElementById('cNewStatus');
  if (sel) sel.value = currentStatus;
  openModal('complaintStatusModal');
}

async function saveComplaintStatus() {
  const id     = document.getElementById('cStatusId')?.value;
  const status = document.getElementById('cNewStatus')?.value;
  const btn    = document.getElementById('saveCStatusBtn');
  btn.disabled = true; btn.textContent = 'Saving…';

  try {
    const data = await apiFetch(`/api/complaints/${id}`, {
      method: 'PUT',
      body:   JSON.stringify({ status })
    });
    if (data.success) {
      showToast('Complaint status updated.', 'success');
      closeModal('complaintStatusModal');
      setTimeout(() => location.reload(), 600);
    } else {
      showToast(data.message || 'Update failed.', 'error');
    }
  } catch { showToast('Network error.', 'error'); }
  finally { btn.disabled = false; btn.textContent = 'Update'; }
}

// ── SETTINGS PAGE ──────────────────────────────────────────
async function initAdminSettings() {
  if (!initAdminSession()) return;

  await loadSettingsForm();

  document.getElementById('saveAllSettingsBtn')?.addEventListener('click', () => saveSettings());
  document.getElementById('changePasswordBtn')?.addEventListener('click',  () => changePassword());

  async function loadSettingsForm() {
    try {
      const data = await apiFetch('/api/settings');
      if (!data.success) return;
      const s = data.settings;

      setValue_input('sStoreName',       s.store_name);
      setValue_input('sStoreEmail',      s.store_email);
      setValue_input('sWhatsApp',        s.whatsapp_number);
      setValue_input('sPhone',           s.phone);
      setValue_input('sAddress',         s.address);
      setValue_input('sPaymentProvider', s.payment_provider);
      setValue_input('sCurrency',        s.currency);
      setValue_input('sCurrencySymbol',  s.currency_symbol);
      setValue_input('sDeliveryFee',     s.delivery_fee);
      setValue_input('sFreeThreshold',   s.free_delivery_threshold);
      setValue_input('sPaystackPub',     s.paystack_public_key);
      setValue_input('sFlutterwavePub',  s.flutterwave_public_key);

      const provSel = document.getElementById('sPaymentProvider');
      if (provSel) provSel.value = s.payment_provider || 'paystack';

      const orderChk = document.getElementById('sOrderNotif');
      const compChk  = document.getElementById('sComplaintNotif');
      if (orderChk) orderChk.checked = !!s.order_notifications;
      if (compChk)  compChk.checked  = !!s.complaint_notifications;
    } catch { showToast('Could not load settings.', 'error'); }
  }

  async function saveSettings() {
    const btn = document.getElementById('saveAllSettingsBtn');
    btn.disabled = true; btn.innerHTML = '⏳ Saving…';

    const payload = {
      store_name:              document.getElementById('sStoreName')?.value.trim(),
      store_email:             document.getElementById('sStoreEmail')?.value.trim(),
      whatsapp_number:         document.getElementById('sWhatsApp')?.value.trim(),
      phone:                   document.getElementById('sPhone')?.value.trim(),
      address:                 document.getElementById('sAddress')?.value.trim(),
      payment_provider:        document.getElementById('sPaymentProvider')?.value,
      currency:                document.getElementById('sCurrency')?.value.trim(),
      currency_symbol:         document.getElementById('sCurrencySymbol')?.value.trim(),
      delivery_fee:            document.getElementById('sDeliveryFee')?.value,
      free_delivery_threshold: document.getElementById('sFreeThreshold')?.value,
      paystack_public_key:     document.getElementById('sPaystackPub')?.value.trim(),
      flutterwave_public_key:  document.getElementById('sFlutterwavePub')?.value.trim(),
      order_notifications:     document.getElementById('sOrderNotif')?.checked ? 1 : 0,
      complaint_notifications: document.getElementById('sComplaintNotif')?.checked ? 1 : 0
    };

    try {
      const data = await apiFetch('/api/settings', {
        method: 'PUT',
        body:   JSON.stringify(payload)
      });
      if (data.success) {
        showToast('Settings saved successfully.', 'success');
      } else {
        showToast(data.message || 'Save failed.', 'error');
      }
    } catch { showToast('Network error.', 'error'); }
    finally {
      btn.disabled = false;
      btn.innerHTML = '<i data-feather="save"></i> Save All Settings';
      if (typeof feather !== 'undefined') feather.replace();
    }
  }

  async function changePassword() {
    const current  = document.getElementById('currentPw')?.value;
    const newPw    = document.getElementById('newPw')?.value;
    const confirm  = document.getElementById('confirmPw')?.value;
    const btn      = document.getElementById('changePasswordBtn');

    if (!current || !newPw || !confirm) { showToast('Fill in all password fields.', 'warning'); return; }
    if (newPw !== confirm)              { showToast('New passwords do not match.', 'error');   return; }
    if (newPw.length < 8)              { showToast('Password must be at least 8 characters.', 'warning'); return; }

    btn.disabled    = true;
    btn.textContent = 'Updating…';

    try {
      const data = await apiFetch('/api/auth/change-password', {
        method: 'POST',
        body:   JSON.stringify({ currentPassword: current, newPassword: newPw })
      });
      if (data.success) {
        showToast('Password updated successfully.', 'success');
        document.getElementById('currentPw').value = '';
        document.getElementById('newPw').value     = '';
        document.getElementById('confirmPw').value = '';
      } else {
        showToast(data.message || 'Password update failed.', 'error');
      }
    } catch { showToast('Network error.', 'error'); }
    finally { btn.disabled = false; btn.textContent = 'Update Password'; }
  }
}

// ── Shared Utility Shortcuts ───────────────────────────────
function setValue(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val ?? '—';
}

function setValue_input(id, val) {
  const el = document.getElementById(id);
  if (!el) return;
  if (el.tagName === 'SELECT') el.value = val || '';
  else if (el.tagName === 'TEXTAREA') el.value = val || '';
  else el.value = val ?? '';
}
