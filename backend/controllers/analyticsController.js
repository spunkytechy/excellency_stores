// backend/controllers/analyticsController.js

const { getDb } = require('../config/db');

// ── GET /api/analytics/daily ──────────────────────────────
function getDaily(req, res) {
  try {
    const db = getDb();
    const { date } = req.query;
    const targetDate = date || new Date().toISOString().split('T')[0];

    const stats = db.prepare(`
      SELECT
        COUNT(*) as total_orders,
        COALESCE(SUM(total_amount), 0) as revenue,
        COALESCE(SUM(total_amount) / NULLIF(COUNT(*), 0), 0) as avg_order_value
      FROM orders
      WHERE DATE(created_at) = ? AND payment_status = 'paid'
    `).get(targetDate);

    const itemsStats = db.prepare(`
      SELECT COALESCE(SUM(oi.quantity), 0) as products_sold
      FROM order_items oi
      JOIN orders o ON oi.order_id = o.id
      WHERE DATE(o.created_at) = ? AND o.payment_status = 'paid'
    `).get(targetDate);

    // Hourly breakdown
    const hourly = db.prepare(`
      SELECT
        CAST(strftime('%H', created_at) AS INTEGER) as hour,
        COUNT(*) as orders,
        COALESCE(SUM(total_amount), 0) as revenue
      FROM orders
      WHERE DATE(created_at) = ? AND payment_status = 'paid'
      GROUP BY hour ORDER BY hour
    `).all(targetDate);

    res.json({
      success: true,
      date: targetDate,
      revenue: stats.revenue,
      total_orders: stats.total_orders,
      products_sold: itemsStats.products_sold,
      avg_order_value: stats.avg_order_value,
      hourly
    });
  } catch (err) {
    console.error('getDaily error:', err);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
}

// ── GET /api/analytics/monthly ────────────────────────────
function getMonthly(req, res) {
  try {
    const db = getDb();
    const { month } = req.query; // YYYY-MM
    const now = new Date();
    const targetMonth = month || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const [year, mon] = targetMonth.split('-');

    // Previous month
    const prevDate = new Date(parseInt(year), parseInt(mon) - 2, 1);
    const prevMonth = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}`;

    const getStats = (m) => db.prepare(`
      SELECT
        COUNT(*) as total_orders,
        COALESCE(SUM(total_amount), 0) as revenue,
        COALESCE(SUM(total_amount) / NULLIF(COUNT(*), 0), 0) as avg_order_value
      FROM orders
      WHERE strftime('%Y-%m', created_at) = ? AND payment_status = 'paid'
    `).get(m);

    const current = getStats(targetMonth);
    const previous = getStats(prevMonth);

    const itemsStats = db.prepare(`
      SELECT COALESCE(SUM(oi.quantity), 0) as products_sold
      FROM order_items oi
      JOIN orders o ON oi.order_id = o.id
      WHERE strftime('%Y-%m', o.created_at) = ? AND o.payment_status = 'paid'
    `).get(targetMonth);

    // Daily breakdown for the month
    const daily = db.prepare(`
      SELECT
        strftime('%d', created_at) as day,
        COUNT(*) as orders,
        COALESCE(SUM(total_amount), 0) as revenue
      FROM orders
      WHERE strftime('%Y-%m', created_at) = ? AND payment_status = 'paid'
      GROUP BY day ORDER BY day
    `).all(targetMonth);

    const revGrowth = previous.revenue > 0
      ? ((current.revenue - previous.revenue) / previous.revenue * 100).toFixed(1)
      : null;

    res.json({
      success: true,
      month: targetMonth,
      revenue: current.revenue,
      total_orders: current.total_orders,
      products_sold: itemsStats.products_sold,
      avg_order_value: current.avg_order_value,
      prev_month_revenue: previous.revenue,
      revenue_growth: revGrowth,
      daily
    });
  } catch (err) {
    console.error('getMonthly error:', err);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
}

// ── GET /api/analytics/yearly ─────────────────────────────
function getYearly(req, res) {
  try {
    const db = getDb();
    const { year } = req.query;
    const targetYear = year || new Date().getFullYear().toString();

    const stats = db.prepare(`
      SELECT
        COUNT(*) as total_orders,
        COALESCE(SUM(total_amount), 0) as revenue,
        COALESCE(SUM(total_amount) / NULLIF(COUNT(*), 0), 0) as avg_order_value
      FROM orders
      WHERE strftime('%Y', created_at) = ? AND payment_status = 'paid'
    `).get(targetYear);

    const itemsStats = db.prepare(`
      SELECT COALESCE(SUM(oi.quantity), 0) as products_sold
      FROM order_items oi
      JOIN orders o ON oi.order_id = o.id
      WHERE strftime('%Y', o.created_at) = ? AND o.payment_status = 'paid'
    `).get(targetYear);

    const monthly = db.prepare(`
      SELECT
        CAST(strftime('%m', created_at) AS INTEGER) as month,
        COUNT(*) as orders,
        COALESCE(SUM(total_amount), 0) as revenue
      FROM orders
      WHERE strftime('%Y', created_at) = ? AND payment_status = 'paid'
      GROUP BY month ORDER BY month
    `).all(targetYear);

    res.json({
      success: true,
      year: targetYear,
      revenue: stats.revenue,
      total_orders: stats.total_orders,
      products_sold: itemsStats.products_sold,
      avg_order_value: stats.avg_order_value,
      monthly
    });
  } catch (err) {
    console.error('getYearly error:', err);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
}

// ── GET /api/analytics/trending ───────────────────────────
function getTrending(req, res) {
  try {
    const db = getDb();
    const { limit = 10, days = 30 } = req.query;

    const trending = db.prepare(`
      SELECT
        oi.product_id,
        oi.product_name,
        p.image,
        p.price,
        p.discount_price,
        p.category,
        SUM(oi.quantity) as units_sold,
        SUM(oi.quantity * oi.price) as revenue
      FROM order_items oi
      JOIN orders o ON oi.order_id = o.id
      LEFT JOIN products p ON oi.product_id = p.id
      WHERE o.payment_status = 'paid'
        AND o.created_at >= datetime('now', ? || ' days')
      GROUP BY oi.product_id
      ORDER BY units_sold DESC, revenue DESC
      LIMIT ?
    `).all(`-${parseInt(days)}`, parseInt(limit));

    res.json({ success: true, trending, period_days: parseInt(days) });
  } catch (err) {
    console.error('getTrending error:', err);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
}

// ── GET /api/analytics/summary (admin dashboard) ──────────
function getSummary(req, res) {
  try {
    const db = getDb();
    const today = new Date().toISOString().split('T')[0];

    const totalSales = db.prepare(
      "SELECT COALESCE(SUM(total_amount), 0) as val FROM orders WHERE payment_status = 'paid'"
    ).get().val;

    const todaySales = db.prepare(
      "SELECT COALESCE(SUM(total_amount), 0) as val FROM orders WHERE payment_status = 'paid' AND DATE(created_at) = ?"
    ).get(today).val;

    const totalOrders = db.prepare('SELECT COUNT(*) as val FROM orders').get().val;
    const pendingOrders = db.prepare("SELECT COUNT(*) as val FROM orders WHERE order_status = 'pending'").get().val;
    const totalProducts = db.prepare("SELECT COUNT(*) as val FROM products WHERE status = 'active'").get().val;
    const totalCustomers = db.prepare('SELECT COUNT(*) as val FROM customers').get().val;
    const newComplaints = db.prepare("SELECT COUNT(*) as val FROM complaints WHERE status = 'new'").get().val;

    // Last 7 days revenue trend
    const last7Days = db.prepare(`
      SELECT DATE(created_at) as date, COALESCE(SUM(total_amount), 0) as revenue
      FROM orders
      WHERE payment_status = 'paid' AND created_at >= datetime('now', '-7 days')
      GROUP BY date ORDER BY date
    `).all();

    res.json({
      success: true,
      total_sales: totalSales,
      today_sales: todaySales,
      total_orders: totalOrders,
      pending_orders: pendingOrders,
      total_products: totalProducts,
      total_customers: totalCustomers,
      new_complaints: newComplaints,
      last7_days: last7Days
    });
  } catch (err) {
    console.error('getSummary error:', err);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
}

module.exports = { getDaily, getMonthly, getYearly, getTrending, getSummary };
