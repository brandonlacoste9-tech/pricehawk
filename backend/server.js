require('dotenv').config();
const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');

const app = express();
const port = process.env.PORT || 3001;

// Database connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Middleware
app.use(cors({
  origin: process.env.FRONTEND_URL || '*',
  credentials: true
}));
app.use(express.json());

// Health check endpoint
app.get('/', (req, res) => {
  res.json({ 
    status: '🦅 PriceHawk API is live!',
    message: 'Facebook Marketplace Price Tracker',
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  });
});

// Database health check
app.get('/api/health', async (req, res) => {
  try {
    const result = await pool.query('SELECT NOW()');
    res.json({ 
      status: 'healthy',
      database: 'connected',
      timestamp: result.rows[0].now 
    });
  } catch (error) {
    res.status(500).json({ 
      status: 'unhealthy',
      database: 'disconnected',
      error: error.message 
    });
  }
});

// Get all active listings
app.get('/api/listings', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT * FROM listings
      WHERE status = 'active'
      ORDER BY id DESC
      LIMIT 50
    `);
    res.json({ 
      success: true, 
      count: result.rows.length,
      listings: result.rows 
    });
  } catch (error) {
    console.error('Error fetching listings:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Get single listing with price history
app.get('/api/listings/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const listing = await pool.query('SELECT * FROM listings WHERE id = $1', [id]);
    if (listing.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Listing not found' });
    }
    
    const history = await pool.query(
      'SELECT price, recorded_at FROM price_history WHERE listing_id = $1 ORDER BY recorded_at ASC',
      [id]
    );
    
    res.json({ 
      success: true, 
      listing: listing.rows[0],
      priceHistory: history.rows
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Add new listing
app.post('/api/listings', async (req, res) => {
  try {
    const { url, title, price, location, category } = req.body;
    
    // Check if listing already exists
    const existing = await pool.query('SELECT id FROM listings WHERE url = $1', [url]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ 
        success: false, 
        error: 'Listing already exists',
        listingId: existing.rows[0].id
      });
    }
    
    // Insert new listing
    const result = await pool.query(
      `INSERT INTO listings (url, title, price, location, category) 
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [url, title, price, location, category]
    );
    
    // Add initial price history
    await pool.query(
      'INSERT INTO price_history (listing_id, price) VALUES ($1, $2)',
      [result.rows[0].id, price]
    );
    
    res.json({ success: true, listing: result.rows[0] });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get all alerts
app.get('/api/alerts', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT a.*, l.title, l.price as current_price
      FROM alerts a
      JOIN listings l ON a.listing_id = l.id
      WHERE a.status = 'active'
      ORDER BY a.created_at DESC
    `);
    res.json({ success: true, count: result.rows.length, alerts: result.rows });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Create alert
app.post('/api/alerts', async (req, res) => {
  try {
    const { user_email, listing_id, alert_type, target_price } = req.body;
    const result = await pool.query(
      `INSERT INTO alerts (user_email, listing_id, alert_type, target_price) 
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [user_email, listing_id, alert_type, target_price]
    );
    res.json({ success: true, alert: result.rows[0] });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get market stats (optional - requires data)
app.get('/api/stats', async (req, res) => {
  try {
    const totalListings = await pool.query('SELECT COUNT(*) FROM listings WHERE status = $1', ['active']);
    const totalAlerts = await pool.query('SELECT COUNT(*) FROM alerts WHERE status = $1', ['active']);
    const avgPrice = await pool.query('SELECT AVG(price) as avg FROM listings WHERE status = $1', ['active']);
    
    res.json({
      success: true,
      stats: {
        totalListings: parseInt(totalListings.rows[0].count),
        totalAlerts: parseInt(totalAlerts.rows[0].count),
        averagePrice: parseFloat(avgPrice.rows[0].avg || 0).toFixed(2)
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Start server
app.listen(port, () => {
  console.log(`🚀 PriceHawk API running on port ${port}`);
  console.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🗄️  Database: ${process.env.DATABASE_URL ? 'configured' : 'not configured'}`);
});
