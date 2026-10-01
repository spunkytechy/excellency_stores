// backend/routes/products.js
const express = require('express');
const router = express.Router();
const {
  getProducts, getCategories, getProduct,
  createProduct, updateProduct, deleteProduct, updatePrice
} = require('../controllers/productController');
const { requireAdmin } = require('../middleware/auth');
const upload = require('../middleware/upload');

// Public routes
router.get('/', getProducts);
router.get('/categories', getCategories);
router.get('/:id', getProduct);

// Admin routes
router.post('/', requireAdmin, upload.single('image'), createProduct);
router.put('/:id', requireAdmin, upload.single('image'), updateProduct);
router.delete('/:id', requireAdmin, deleteProduct);
router.patch('/:id/price', requireAdmin, updatePrice);

module.exports = router;
