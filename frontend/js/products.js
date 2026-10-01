/* ============================================================
   KISSOWRA'S STORES — products.js
   Shop page listing + Product detail page
   ============================================================ */

'use strict';

// ── Shop Page ──────────────────────────────────────────────
async function initShopPage() {
  let currentPage   = 1;
  let currentCat    = '';
  let currentSort   = 'newest';
  let currentSearch = '';
  let debounceTimer;

  const params = new URLSearchParams(window.location.search);
  if (params.get('cat'))    currentCat    = params.get('cat');
  if (params.get('search')) currentSearch = params.get('search');

  await loadCategories();
  await loadProducts();

  // ── Category filter sidebar radios ─────────────────────
  document.addEventListener('change', (e) => {
    if (e.target.name === 'cat') {
      currentCat  = e.target.value;
      currentPage = 1;
      updateChips(currentCat);
      loadProducts();
    }
    if (e.target.name === 'sort') {
      currentSort = e.target.value;
      currentPage = 1;
      loadProducts();
    }
  });

  // ── Category chips (hero bar) ──────────────────────────
  const chipsBar = document.getElementById('categoryChips');
  if (chipsBar) {
    chipsBar.addEventListener('click', (e) => {
      const chip = e.target.closest('[data-cat]');
      if (!chip) return;
      currentCat  = chip.dataset.cat;
      currentPage = 1;
      updateChips(currentCat);
      loadProducts();
    });
  }

  // ── Sort select (toolbar) ──────────────────────────────
  const sortSel = document.getElementById('sortSelect');
  if (sortSel) {
    sortSel.addEventListener('change', () => {
      currentSort = sortSel.value;
      currentPage = 1;
      loadProducts();
    });
  }

  // ── Search ─────────────────────────────────────────────
  const shopSearch = document.getElementById('shopSearch');
  if (shopSearch) {
    shopSearch.value = currentSearch;
    shopSearch.addEventListener('input', () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        currentSearch = shopSearch.value.trim();
        currentPage   = 1;
        loadProducts();
      }, 400);
    });
  }

  // ── Price apply ────────────────────────────────────────
  const applyPriceBtn = document.getElementById('applyPrice');
  if (applyPriceBtn) {
    applyPriceBtn.addEventListener('click', () => { currentPage = 1; loadProducts(); });
  }

  // ── Clear all filters ──────────────────────────────────
  const clearBtn = document.getElementById('clearFilters');
  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      currentCat = ''; currentSort = 'newest'; currentSearch = '';
      currentPage = 1;
      const firstCat  = document.querySelector('input[name="cat"]');
      const firstSort = document.querySelector('input[name="sort"]');
      if (firstCat)  firstCat.checked  = true;
      if (firstSort) firstSort.checked = true;
      if (shopSearch) shopSearch.value = '';
      const pMin = document.getElementById('priceMin');
      const pMax = document.getElementById('priceMax');
      if (pMin) pMin.value = '';
      if (pMax) pMax.value = '';
      updateChips('');
      loadProducts();
    });
  }

  // ── View toggle ────────────────────────────────────────
  const gridBtn = document.getElementById('gridView');
  const listBtn = document.getElementById('listView');
  const gridEl  = document.getElementById('shopProductGrid');
  if (gridBtn && listBtn && gridEl) {
    gridBtn.addEventListener('click', () => {
      gridEl.classList.remove('products-list');
      gridBtn.classList.add('active'); listBtn.classList.remove('active');
    });
    listBtn.addEventListener('click', () => {
      gridEl.classList.add('products-list');
      listBtn.classList.add('active'); gridBtn.classList.remove('active');
    });
  }

  // ── Mobile filter toggle ───────────────────────────────
  const filterToggle  = document.getElementById('filterToggleMobile');
  const filterSidebar = document.getElementById('filterSidebar');
  if (filterToggle && filterSidebar) {
    filterToggle.addEventListener('click', () => filterSidebar.classList.toggle('mobile-open'));
  }

  // ── Load categories ────────────────────────────────────
  async function loadCategories() {
    try {
      const res  = await fetch('/api/products/categories');
      const data = await res.json();
      if (!data.success) return;

      // Sidebar radios
      const catFilters = document.getElementById('categoryFilters');
      if (catFilters) {
        catFilters.innerHTML = `
          <label class="filter-option">
            <input type="radio" name="cat" value="" ${!currentCat ? 'checked' : ''} /> All Categories
          </label>`;
        data.categories.forEach(cat => {
          catFilters.innerHTML += `
            <label class="filter-option">
              <input type="radio" name="cat" value="${escHtml(cat)}" ${currentCat === cat ? 'checked' : ''} /> ${escHtml(cat)}
            </label>`;
        });
      }

      // Hero chips
      const chips = document.getElementById('categoryChips');
      if (chips) {
        data.categories.forEach(cat => {
          const btn = document.createElement('button');
          btn.className   = `chip${currentCat === cat ? ' active' : ''}`;
          btn.dataset.cat = cat;
          btn.textContent = cat;
          chips.appendChild(btn);
        });
      }
    } catch { /* silently fail */ }
  }

  function updateChips(activeCat) {
    document.querySelectorAll('#categoryChips .chip').forEach(c => {
      c.classList.toggle('active', c.dataset.cat === activeCat);
    });
    document.querySelectorAll('input[name="cat"]').forEach(r => {
      r.checked = r.value === activeCat;
    });
  }

  // ── Load products ──────────────────────────────────────
  async function loadProducts() {
    const gridEl   = document.getElementById('shopProductGrid');
    const countEl  = document.getElementById('productCount');
    const pagEl    = document.getElementById('pagination');
    if (!gridEl) return;

    gridEl.innerHTML = Array(6).fill(
      '<div class="skeleton" style="height:360px;border-radius:var(--radius-lg);"></div>'
    ).join('');

    const pMin = document.getElementById('priceMin')?.value || '';
    const pMax = document.getElementById('priceMax')?.value || '';

    const qs = new URLSearchParams({ page: currentPage, limit: 12 });
    if (currentCat)    qs.set('category', currentCat);
    if (currentSort)   qs.set('sort',     currentSort);
    if (currentSearch) qs.set('search',   currentSearch);
    if (pMin)          qs.set('price_min', pMin);
    if (pMax)          qs.set('price_max', pMax);

    try {
      const res  = await fetch(`/api/products?${qs}`);
      const data = await res.json();
      if (!data.success) throw new Error(data.message);

      if (!data.products.length) {
        gridEl.innerHTML = `
          <div class="empty-state" style="grid-column:1/-1;padding:var(--space-16);">
            <div class="empty-state__icon">🛍️</div>
            <h2 class="empty-state__title">No products found</h2>
            <p class="empty-state__text">Try adjusting your filters or search term.</p>
          </div>`;
        if (countEl) countEl.textContent = '0 products';
        if (pagEl)   pagEl.innerHTML     = '';
        return;
      }

      gridEl.innerHTML = data.products.map(p => renderProductCard(p)).join('');

      if (countEl) {
        countEl.textContent = `${data.total} product${data.total !== 1 ? 's' : ''}`;
      }

      const totalPages = Math.ceil(data.total / 12);
      renderPagination(pagEl, currentPage, totalPages, (p) => {
        currentPage = p;
        loadProducts();
        window.scrollTo({ top: 0, behavior: 'smooth' });
      });
    } catch {
      gridEl.innerHTML = `
        <div class="empty-state" style="grid-column:1/-1;padding:var(--space-16);">
          <div class="empty-state__icon">⚠️</div>
          <h2 class="empty-state__title">Could not load products</h2>
          <p class="empty-state__text">Please refresh the page.</p>
        </div>`;
    }
  }
}

// ── Product Detail Page ────────────────────────────────────
async function initProductPage() {
  const params    = new URLSearchParams(window.location.search);
  const productId = params.get('id');

  const loadingEl = document.getElementById('productLoading');
  const contentEl = document.getElementById('productContent');
  const errorEl   = document.getElementById('productError');

  if (!productId) {
    if (loadingEl) loadingEl.style.display = 'none';
    if (errorEl)   errorEl.style.display   = 'block';
    return;
  }

  try {
    const res  = await fetch(`/api/products/${productId}`);
    const data = await res.json();

    if (!data.success || !data.product) throw new Error('Not found');

    renderProductDetail(data.product);

    // Related products
    fetch(`/api/products?category=${encodeURIComponent(data.product.category)}&limit=5`)
      .then(r => r.json())
      .then(d => {
        const related = (d.products || []).filter(p => p.id !== productId).slice(0, 4);
        if (!related.length) return;
        const section = document.getElementById('relatedSection');
        const grid    = document.getElementById('relatedProducts');
        if (section) section.style.display = '';
        if (grid)    grid.innerHTML = related.map(p => renderProductCard(p)).join('');
      }).catch(() => {});

  } catch {
    if (loadingEl) loadingEl.style.display = 'none';
    if (errorEl)   errorEl.style.display   = 'block';
  }
}

function renderProductDetail(product) {
  const loadingEl = document.getElementById('productLoading');
  const contentEl = document.getElementById('productContent');
  if (loadingEl) loadingEl.style.display = 'none';
  if (contentEl) contentEl.style.display = 'block';

  document.title = `${product.name} — KISSOWRA'S STORES`;

  // Breadcrumb
  const bc = document.getElementById('breadcrumbProduct');
  if (bc) bc.textContent = product.name;

  // Category, name
  const el = (id) => document.getElementById(id);
  if (el('productCategory'))    el('productCategory').textContent = product.category;
  if (el('productName'))        el('productName').textContent     = product.name;
  if (el('productDescription')) el('productDescription').textContent = product.description || '';

  // Price block
  const priceBlock = el('productPriceBlock');
  if (priceBlock) {
    const hasDiscount = product.discount_price && product.discount_price < product.price;
    const pct = hasDiscount
      ? Math.round((1 - product.discount_price / product.price) * 100)
      : 0;
    priceBlock.innerHTML = `
      <span class="product-info__current-price">${formatCurrency(product.discount_price || product.price)}</span>
      ${hasDiscount
        ? `<span class="product-info__original-price">${formatCurrency(product.price)}</span>
           <span class="price-discount">−${pct}% OFF</span>`
        : ''}`;
  }

  // Stock
  const stockEl    = el('stockStatus');
  const stockCount = el('stockCount');
  if (stockEl) {
    stockEl.textContent = product.stock > 0 ? 'In Stock' : 'Out of Stock';
    stockEl.classList.toggle('out-of-stock', product.stock <= 0);
  }
  if (stockCount) stockCount.textContent = product.stock > 0 ? `${product.stock} available` : '';

  // Images
  const fallback = `data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' width='400' height='500'>
    <rect fill='%23fdf0f5' width='400' height='500'/>
    <text y='270' x='200' text-anchor='middle' fill='%23c9955b' font-size='100'>💋</text></svg>`;

  const allImages  = [product.image, ...(product.images || [])].filter(Boolean);
  const mainImg    = el('mainProductImage');
  const thumbStrip = el('thumbnailStrip');

  if (mainImg) mainImg.src = allImages[0] || fallback;

  if (thumbStrip && allImages.length > 1) {
    thumbStrip.innerHTML = allImages.map((src, i) => `
      <div class="gallery-thumb ${i === 0 ? 'active' : ''}" role="listitem">
        <img src="${src}" alt="View ${i + 1}" loading="lazy" />
      </div>`).join('');

    thumbStrip.addEventListener('click', (e) => {
      const thumb = e.target.closest('.gallery-thumb');
      if (!thumb) return;
      thumbStrip.querySelectorAll('.gallery-thumb').forEach(t => t.classList.remove('active'));
      thumb.classList.add('active');
      if (mainImg) mainImg.src = thumb.querySelector('img').src;
    });
  }

  // Zoom
  const zoomBtn   = el('zoomBtn');
  const zoomedImg = el('zoomedImage');
  if (zoomBtn && zoomedImg) {
    zoomBtn.addEventListener('click', () => {
      zoomedImg.src = mainImg?.src || fallback;
      openModal('zoomModal');
    });
    el('zoomClose')?.addEventListener('click', () => closeModal('zoomModal'));
  }

  // Variants
  let selectedVariant = null;
  const variantSection = el('variantSection');
  const variantChips   = el('variantChips');
  const variantLabel   = el('selectedVariantLabel');

  if (product.variants && product.variants.length > 0) {
    if (variantSection) variantSection.style.display = 'block';
    if (variantChips) {
      variantChips.innerHTML = product.variants.map(v =>
        `<button class="variant-chip" data-variant="${escHtml(v)}">${escHtml(v)}</button>`
      ).join('');

      variantChips.addEventListener('click', (e) => {
        const chip = e.target.closest('.variant-chip');
        if (!chip) return;
        variantChips.querySelectorAll('.variant-chip').forEach(c => c.classList.remove('selected'));
        chip.classList.add('selected');
        selectedVariant = chip.dataset.variant;
        if (variantLabel) variantLabel.textContent = selectedVariant;
      });
    }
  }

  // Quantity
  let qty = 1;
  const qtyMinus = el('qtyMinus');
  const qtyPlus  = el('qtyPlus');
  const qtyInput = el('qtyInput');
  const updateQtyDisplay = () => { if (qtyInput) qtyInput.value = qty; };

  if (qtyMinus) qtyMinus.addEventListener('click', () => { if (qty > 1) { qty--; updateQtyDisplay(); } });
  if (qtyPlus)  qtyPlus.addEventListener('click', () => {
    if (qty < product.stock) { qty++; updateQtyDisplay(); }
  });

  // Add to Cart
  const addBtn = el('addToCartBtn');
  const buyBtn = el('buyNowBtn');

  if (addBtn) {
    if (product.stock <= 0) {
      addBtn.disabled    = true;
      addBtn.textContent = 'Out of Stock';
    }

    addBtn.addEventListener('click', () => {
      if (product.variants?.length > 0 && !selectedVariant) {
        showToast('Please select a variant first.', 'warning');
        variantSection?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return;
      }

      Cart.add({
        product_id: product.id,
        name:       product.name,
        price:      product.discount_price || product.price,
        image:      product.image,
        quantity:   qty,
        variant:    selectedVariant
      });

      // Visual feedback
      const original = addBtn.innerHTML;
      addBtn.innerHTML        = '✓ Added to Cart!';
      addBtn.style.background = 'var(--clr-success)';
      addBtn.style.borderColor= 'var(--clr-success)';
      addBtn.style.color      = 'white';

      const banner = el('cartAddedBanner');
      if (banner) { banner.style.display = 'block'; setTimeout(() => { banner.style.display = 'none'; }, 2500); }

      setTimeout(() => {
        addBtn.innerHTML        = original;
        addBtn.style.background = '';
        addBtn.style.borderColor= '';
        addBtn.style.color      = '';
        if (typeof feather !== 'undefined') feather.replace();
      }, 2000);

      showToast(`${product.name} added to cart!`, 'success');
    });
  }

  if (buyBtn) {
    if (product.stock <= 0) { buyBtn.disabled = true; }
    buyBtn.addEventListener('click', () => {
      if (product.variants?.length > 0 && !selectedVariant) {
        showToast('Please select a variant first.', 'warning');
        return;
      }
      Cart.add({
        product_id: product.id,
        name:       product.name,
        price:      product.discount_price || product.price,
        image:      product.image,
        quantity:   qty,
        variant:    selectedVariant
      });
      window.location.href = 'checkout.html';
    });
  }
}
