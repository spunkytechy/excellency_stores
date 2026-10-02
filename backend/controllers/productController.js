// backend/controllers/productController.js

const { getDb } = require('../config/db');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const fs = require('fs');

const PRODUCT_CATEGORIES = ['Lipgloss', 'Lip set', 'Clothes', 'Shoes', 'Handbags'];

// ── GET /api/products ──────────────────────────────────────
function getProducts(req, res) {
  try {
    const db = getDb();
    const { category, search, sort, status, page = 1, limit = 20 } = req.query;

    let where = [];
    let params = [];

    // Public route only shows active products
    const isAdmin = req.user && req.user.role === 'admin';
    if (!isAdmin) {
      where.push("status = 'active'");
    } else if (status) {
      where.push('status = ?');
      params.push(status);
    }

    if (category) {
      where.push('category = ?');
      params.push(category);
    }

    if (search) {
      where.push('(name LIKE ? OR description LIKE ?)');
      params.push(`%${search}%`, `%${search}%`);
    }

    const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';

    let orderBy = 'created_at DESC';
    if (sort === 'price_asc') orderBy = 'price ASC';
    else if (sort === 'price_desc') orderBy = 'price DESC';
    else if (sort === 'name') orderBy = 'name ASC';
    else if (sort === 'newest') orderBy = 'created_at DESC';

    const offset = (parseInt(page) - 1) * parseInt(limit);
    const total = db.prepare(`SELECT COUNT(*) as count FROM products ${whereClause}`).get(...params).count;

    const products = db.prepare(
      `SELECT * FROM products ${whereClause} ORDER BY ${orderBy} LIMIT ? OFFSET ?`
    ).all(...params, parseInt(limit), offset);

    // Parse JSON fields
    const parsed = products.map(p => ({
      ...p,
      images: safeParseJson(p.images, []),
      variants: safeParseJson(p.variants, [])
    }));

    res.json({ success: true, products: parsed, total, page: parseInt(page), limit: parseInt(limit) });
  } catch (err) {
    console.error('getProducts error:', err);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
}

// ── GET /api/products/categories ──────────────────────────
function getCategories(req, res) {
  try {
    res.json({ success: true, categories: PRODUCT_CATEGORIES });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error.' });
  }
}

// ── GET /api/products/:id ──────────────────────────────────
function getProduct(req, res) {
  try {
    const db = getDb();
    const product = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);

    if (!product) {
      return res.status(404).json({ success: false, message: 'Product not found.' });
    }

    res.json({
      success: true,
      product: {
        ...product,
        images: safeParseJson(product.images, []),
        variants: safeParseJson(product.variants, [])
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error.' });
  }
}

// ── POST /api/products (admin) ─────────────────────────────
function createProduct(req, res) {
  try {
    const db = getDb();
    const {
      name, description, category, price, discount_price,
      stock, variants, status
    } = req.body;

    if (!name || !category || !price) {
      return res.status(400).json({ success: false, message: 'Name, category, and price are required.' });
    }
    if (!PRODUCT_CATEGORIES.includes(category)) {
      return res.status(400).json({ success: false, message: 'Choose a valid product category.' });
    }

    const id = uuidv4();
    const imagePath = req.file ? `/uploads/${req.file.filename}` : null;
    const imagesJson = req.files && req.files.length > 1
      ? JSON.stringify(req.files.slice(1).map(f => `/uploads/${f.filename}`))
      : '[]';

    db.prepare(`
      INSERT INTO products (id, name, description, category, price, discount_price, stock, image, images, variants, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id, name, description || '', category,
      parseFloat(price), discount_price ? parseFloat(discount_price) : null,
      parseInt(stock || 0), imagePath, imagesJson,
      typeof variants === 'string' ? variants : JSON.stringify(variants || []),
      status || 'active'
    );

    const product = db.prepare('SELECT * FROM products WHERE id = ?').get(id);
    res.status(201).json({
      success: true,
      message: 'Product created.',
      product: { ...product, images: safeParseJson(product.images, []), variants: safeParseJson(product.variants, []) }
    });
  } catch (err) {
    console.error('createProduct error:', err);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
}

// ── PUT /api/products/:id (admin) ─────────────────────────
function updateProduct(req, res) {
  try {
    const db = getDb();
    const product = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
    if (!product) return res.status(404).json({ success: false, message: 'Product not found.' });

    const {
      name, description, category, price, discount_price,
      stock, variants, status
    } = req.body;

    const nextCategory = category || product.category;
    if (!PRODUCT_CATEGORIES.includes(nextCategory)) {
      return res.status(400).json({ success: false, message: 'Choose a valid product category.' });
    }

    const imagePath = req.file ? `/uploads/${req.file.filename}` : product.image;

    db.prepare(`
      UPDATE products SET
        name = ?, description = ?, category = ?, price = ?,
        discount_price = ?, stock = ?, image = ?, variants = ?,
        status = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(
      name || product.name,
      description !== undefined ? description : product.description,
      nextCategory,
      price !== undefined ? parseFloat(price) : product.price,
      discount_price !== undefined ? (discount_price ? parseFloat(discount_price) : null) : product.discount_price,
      stock !== undefined ? parseInt(stock) : product.stock,
      imagePath,
      variants !== undefined ? (typeof variants === 'string' ? variants : JSON.stringify(variants)) : product.variants,
      status || product.status,
      req.params.id
    );

    const updated = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
    res.json({
      success: true,
      message: 'Product updated.',
      product: { ...updated, images: safeParseJson(updated.images, []), variants: safeParseJson(updated.variants, []) }
    });
  } catch (err) {
    console.error('updateProduct error:', err);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
}

// ── DELETE /api/products/:id (admin) ──────────────────────
function deleteProduct(req, res) {
  try {
    const db = getDb();
    const product = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
    if (!product) return res.status(404).json({ success: false, message: 'Product not found.' });

    // Delete image file if it's a local upload
    if (product.image && product.image.startsWith('/uploads/')) {
      const filePath = path.resolve(__dirname, '../uploads', path.basename(product.image));
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    }

    db.prepare('DELETE FROM products WHERE id = ?').run(req.params.id);
    res.json({ success: true, message: 'Product deleted.' });
  } catch (err) {
    console.error('deleteProduct error:', err);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
}

// ── PATCH /api/products/:id/price (admin) ─────────────────
function updatePrice(req, res) {
  try {
    const db = getDb();
    const { price, discount_price } = req.body;
    const product = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
    if (!product) return res.status(404).json({ success: false, message: 'Product not found.' });

    db.prepare(`
      UPDATE products SET
        price = ?,
        discount_price = ?,
        updated_at = datetime('now')
      WHERE id = ?
    `).run(
      price !== undefined ? parseFloat(price) : product.price,
      discount_price !== undefined ? (discount_price !== null && discount_price !== '' ? parseFloat(discount_price) : null) : product.discount_price,
      req.params.id
    );

    const updated = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
    res.json({ success: true, message: 'Price updated.', product: updated });
  } catch (err) {
    console.error('updatePrice error:', err);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
}

function safeParseJson(str, fallback) {
  try { return JSON.parse(str || '[]'); }
  catch { return fallback; }
}

module.exports = { getProducts, getCategories, getProduct, createProduct, updateProduct, deleteProduct, updatePrice };
