// backend/config/initDb.js
// Creates all tables and seeds default data

require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });

const { getDb } = require('./db');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

function initDb() {
  const db = getDb();

  // ── Users ──────────────────────────────────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'customer',
      phone TEXT,
      is_verified INTEGER NOT NULL DEFAULT 1,
      reset_token TEXT,
      reset_token_expires TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  // Migrate existing users table — add new columns if they don't exist yet
  const userCols = db.prepare("PRAGMA table_info(users)").all().map(c => c.name);
  if (!userCols.includes('phone'))               db.exec("ALTER TABLE users ADD COLUMN phone TEXT");
  if (!userCols.includes('is_verified'))         db.exec("ALTER TABLE users ADD COLUMN is_verified INTEGER NOT NULL DEFAULT 1");
  if (!userCols.includes('reset_token'))         db.exec("ALTER TABLE users ADD COLUMN reset_token TEXT");
  if (!userCols.includes('reset_token_expires')) db.exec("ALTER TABLE users ADD COLUMN reset_token_expires TEXT");
  // SQLite ALTER TABLE cannot use non-constant defaults (datetime('now') not allowed), so default to NULL
  if (!userCols.includes('updated_at'))          db.exec("ALTER TABLE users ADD COLUMN updated_at TEXT");

  // ── Products ───────────────────────────────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS products (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      category TEXT NOT NULL,
      price REAL NOT NULL,
      discount_price REAL,
      stock INTEGER NOT NULL DEFAULT 0,
      image TEXT,
      images TEXT DEFAULT '[]',
      variants TEXT DEFAULT '[]',
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  db.prepare(`
    UPDATE products SET category = CASE lower(trim(category))
      WHEN 'lip gloss' THEN 'Lipgloss'
      WHEN 'lipgloss' THEN 'Lipgloss'
      WHEN 'lip glosses' THEN 'Lipgloss'
      WHEN 'lip set' THEN 'Lip set'
      WHEN 'lip sets' THEN 'Lip set'
      WHEN 'lipset' THEN 'Lip set'
      WHEN 'lipsets' THEN 'Lip set'
      WHEN 'dress' THEN 'Clothes'
      WHEN 'dresses' THEN 'Clothes'
      WHEN 'co-ord' THEN 'Clothes'
      WHEN 'co-ords' THEN 'Clothes'
      WHEN 'clothing' THEN 'Clothes'
      WHEN 'clothes' THEN 'Clothes'
      WHEN 'fashion' THEN 'Clothes'
      WHEN 'shoe' THEN 'Shoes'
      WHEN 'shoes' THEN 'Shoes'
      WHEN 'footwear' THEN 'Shoes'
      WHEN 'handbag' THEN 'Handbags'
      WHEN 'handbags' THEN 'Handbags'
      WHEN 'bag' THEN 'Handbags'
      WHEN 'bags' THEN 'Handbags'
      WHEN 'purse' THEN 'Handbags'
      WHEN 'purses' THEN 'Handbags'
      ELSE category
    END
    WHERE lower(trim(category)) IN (
      'lip gloss', 'lipgloss', 'lip glosses', 'lip set', 'lip sets', 'lipset', 'lipsets',
      'dress', 'dresses', 'co-ord', 'co-ords', 'clothing', 'clothes', 'fashion',
      'shoe', 'shoes', 'footwear', 'handbag', 'handbags', 'bag', 'bags', 'purse', 'purses'
    )
  `).run();

  // ── Orders ─────────────────────────────────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS orders (
      id TEXT PRIMARY KEY,
      order_number TEXT UNIQUE NOT NULL,
      customer_name TEXT NOT NULL,
      customer_email TEXT,
      customer_phone TEXT NOT NULL,
      delivery_address TEXT NOT NULL,
      delivery_info TEXT,
      subtotal REAL NOT NULL DEFAULT 0,
      delivery_fee REAL NOT NULL DEFAULT 0,
      total_amount REAL NOT NULL DEFAULT 0,
      payment_status TEXT NOT NULL DEFAULT 'pending',
      payment_reference TEXT,
      order_status TEXT NOT NULL DEFAULT 'pending',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  // ── Order Items ────────────────────────────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS order_items (
      id TEXT PRIMARY KEY,
      order_id TEXT NOT NULL,
      product_id TEXT,
      product_name TEXT NOT NULL,
      product_image TEXT,
      quantity INTEGER NOT NULL DEFAULT 1,
      price REAL NOT NULL,
      variant TEXT,
      FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
      FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL
    );
  `);

  // ── Customers ──────────────────────────────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS customers (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      phone TEXT NOT NULL,
      email TEXT,
      completed_purchases INTEGER NOT NULL DEFAULT 0,
      total_spent REAL NOT NULL DEFAULT 0,
      last_purchase TEXT,
      customer_status TEXT NOT NULL DEFAULT 'new_buyer',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  // ── Complaints ─────────────────────────────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS complaints (
      id TEXT PRIMARY KEY,
      customer_name TEXT NOT NULL,
      phone TEXT NOT NULL,
      email TEXT,
      order_id TEXT,
      complaint TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'new',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  // ── Store Settings ─────────────────────────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS store_settings (
      id INTEGER PRIMARY KEY DEFAULT 1,
      store_name TEXT NOT NULL DEFAULT 'KISSOWRA''S STORES',
      store_email TEXT DEFAULT 'hello@kissowrastores.com',
      whatsapp_number TEXT DEFAULT '2348000000000',
      phone TEXT DEFAULT '',
      address TEXT DEFAULT '',
      order_notifications INTEGER NOT NULL DEFAULT 1,
      complaint_notifications INTEGER NOT NULL DEFAULT 1,
      payment_provider TEXT NOT NULL DEFAULT 'paystack',
      currency TEXT NOT NULL DEFAULT 'NGN',
      currency_symbol TEXT NOT NULL DEFAULT '₦',
      delivery_fee REAL NOT NULL DEFAULT 1500,
      free_delivery_threshold REAL NOT NULL DEFAULT 0,
      delivery_regions TEXT DEFAULT '[]',
      paystack_public_key TEXT DEFAULT '',
      flutterwave_public_key TEXT DEFAULT '',
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  // Seed default settings row (only once)
  const settingsExist = db.prepare('SELECT id FROM store_settings WHERE id = 1').get();
  if (!settingsExist) {
    db.prepare(`
      INSERT INTO store_settings (id, store_name, whatsapp_number, delivery_fee)
      VALUES (1, 'KISSOWRA''S BEAUTY', ?, 1500)
    `).run(process.env.WHATSAPP_NUMBER || '2348000000000');
    console.log('✔  Default store settings seeded.');
  }

  // Seed admin user (only once)
  const adminExists = db.prepare("SELECT id FROM users WHERE role = 'admin'").get();
  if (!adminExists) {
    const hash = bcrypt.hashSync(process.env.ADMIN_PASSWORD || 'Admin@Kissowra2024', 12);
    db.prepare(`
      INSERT INTO users (id, name, email, password_hash, role)
      VALUES (?, 'Store Admin', ?, ?, 'admin')
    `).run(uuidv4(), process.env.ADMIN_EMAIL || 'admin@kissowrastores.com', hash);
    console.log('✔  Default admin user created.');
    console.log(`   Email: ${process.env.ADMIN_EMAIL || 'admin@kissowrastores.com'}`);
    console.log(`   Password: (see .env → ADMIN_PASSWORD)`);
  }

  // Seed sample products (only if table empty)
  const productCount = db.prepare('SELECT COUNT(*) as count FROM products').get();
  if (productCount.count === 0) {
    const sampleProducts = [
      {
        id: uuidv4(), name: 'Kissowra Gloss Luxe', description: 'Premium high-shine lip gloss with a moisturising formula. Long-lasting colour and shine for every occasion.',
        category: 'Lipgloss', price: 4500, discount_price: 3800, stock: 50,
        image: '/images/product-placeholder.jpg', status: 'active',
        variants: JSON.stringify(['Nude Bliss', 'Rose Gold', 'Berry Kiss', 'Clear Shine'])
      },
      {
        id: uuidv4(), name: 'Velvet Plump Gloss', description: 'Plumping lip gloss with hyaluronic acid. Gives lips a fuller, juicier look.',
        category: 'Lipgloss', price: 5200, discount_price: null, stock: 35,
        image: '/images/product-placeholder.jpg', status: 'active',
        variants: JSON.stringify(['Pink Velvet', 'Coral Crush', 'Mauve Dreams'])
      },
      {
        id: uuidv4(), name: 'KISSOWRA Silk Dress', description: 'Elegant wrap-style midi dress in premium satin fabric. Perfect for date nights and special occasions.',
        category: 'Clothes', price: 28000, discount_price: 22000, stock: 20,
        image: '/images/product-placeholder.jpg', status: 'active',
        variants: JSON.stringify(['XS', 'S', 'M', 'L', 'XL'])
      },
      {
        id: uuidv4(), name: 'Golden Hour Lip Set', description: 'Complete lip care set: gloss, liner, and overnight balm. The perfect gift for beauty lovers.',
        category: 'Lip set', price: 12000, discount_price: 9500, stock: 15,
        image: '/images/product-placeholder.jpg', status: 'active',
        variants: JSON.stringify(['Set A - Nudes', 'Set B - Berries', 'Set C - Corals'])
      },
      {
        id: uuidv4(), name: 'Linen Co-ord Set', description: 'Breathable linen two-piece co-ord set. Casual elegance redefined.',
        category: 'Clothes', price: 18500, discount_price: null, stock: 25,
        image: '/images/product-placeholder.jpg', status: 'active',
        variants: JSON.stringify(['S', 'M', 'L', 'XL'])
      },
      {
        id: uuidv4(), name: 'Glow Gloss Trio', description: 'Three bestselling glosses in one curated set. Everyday glam made easy.',
        category: 'Lip set', price: 9000, discount_price: 7200, stock: 40,
        image: '/images/product-placeholder.jpg', status: 'active',
        variants: JSON.stringify(['Trio A', 'Trio B'])
      }
    ];

    const insertProduct = db.prepare(`
      INSERT INTO products (id, name, description, category, price, discount_price, stock, image, variants, status)
      VALUES (@id, @name, @description, @category, @price, @discount_price, @stock, @image, @variants, @status)
    `);

    const insertMany = db.transaction((products) => {
      for (const p of products) insertProduct.run(p);
    });

    insertMany(sampleProducts);
    console.log(`✔  ${sampleProducts.length} sample products seeded.`);
  }

  console.log('✔  Database initialised successfully.');
}

initDb();
