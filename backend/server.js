require('dotenv').config();
const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const axios = require('axios');
const cheerio = require('cheerio');
const nodemailer = require('nodemailer');
const cron = require('node-cron');

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

// Email transporter (using Gmail - configure with your SMTP)
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

// Health check endpoint
app.get('/', (req, res) => {
  res.json({ status: 'ok', message: 'PriceHawk API is running' });
});

// Scrape Facebook Marketplace listing
async function scrapeFacebookListing(url) {
  try {
    // Note: Facebook Marketplace requires authentication and has anti-scraping measures
    // This is a simplified version - in production, you'd need:
    // 1. Puppeteer/Playwright for JavaScript rendering
    // 2. Proxy rotation
    // 3. Cookie management
    // For now, we'll extract what we can from the URL and create mock data
    
    const listingId = url.match(/\/marketplace\/item\/(\d+)/);
    
    if (!listingId) {
      throw new Error('Invalid Facebook Marketplace URL');
    }

    // In a real implementation, you would scrape the actual page
    // For now, return mock data structure
    return {
      title: 'Product from Marketplace',
      description: 'Tracked item',
      price: 0,
      image_url: '',
      location: 'Location TBD',
      seller_name: 'Seller TBD',
      listing_id: listingId[1],
      marketplace_url: url
    };
  } catch (error) {
    console.error('Scraping error:', error);
    throw error;
  }
}

// GET all products
app.get('/api/products', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT p.*, 
        (SELECT json_agg(json_build_object(
          'id', ph.id,
          'price', ph.price,
          'checked_at', ph.checked_at
        ) ORDER BY ph.checked_at DESC)
        FROM price_history ph
        WHERE ph.product_id = p.id
        LIMIT 30) as price_history
      FROM products p
      ORDER BY p.created_at DESC`
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching products:', error);
    res.status(500).json({ error: 'Failed to fetch products' });
  }
});

// GET single product with full history
app.get('/api/products/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const productResult = await pool.query(
      'SELECT * FROM products WHERE id = $1',
      [id]
    );
    
    if (productResult.rows.length === 0) {
      return res.status(404).json({ error: 'Product not found' });
    }

    const historyResult = await pool.query(
      'SELECT * FROM price_history WHERE product_id = $1 ORDER BY checked_at DESC LIMIT 90',
      [id]
    );

    res.json({
      ...productResult.rows[0],
      price_history: historyResult.rows
    });
  } catch (error) {
    console.error('Error fetching product:', error);
    res.status(500).json({ error: 'Failed to fetch product' });
  }
});

// POST new product to track
app.post('/api/products', async (req, res) => {
  try {
    const { marketplace_url, user_email, target_price } = req.body;

    if (!marketplace_url) {
      return res.status(400).json({ error: 'Marketplace URL is required' });
    }

    // Scrape the listing
    const listingData = await scrapeFacebookListing(marketplace_url);

    // Check if product already exists
    const existing = await pool.query(
      'SELECT id FROM products WHERE listing_id = $1',
      [listingData.listing_id]
    );

    let productId;

    if (existing.rows.length > 0) {
      productId = existing.rows[0].id;
      // Update existing product
      await pool.query(
        `UPDATE products 
         SET current_price = $1, last_checked = NOW(), status = 'active'
         WHERE id = $2`,
        [listingData.price, productId]
      );
    } else {
      // Insert new product
      const result = await pool.query(
        `INSERT INTO products (title, description, current_price, image_url, location, seller_name, listing_id, marketplace_url, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'active')
         RETURNING *`,
        [listingData.title, listingData.description, listingData.price, listingData.image_url, 
         listingData.location, listingData.seller_name, listingData.listing_id, marketplace_url]
      );
      productId = result.rows[0].id;
    }

    // Add to price history
    await pool.query(
      'INSERT INTO price_history (product_id, price) VALUES ($1, $2)',
      [productId, listingData.price]
    );

    // Create alert if target price specified
    if (user_email && target_price) {
      await pool.query(
        'INSERT INTO alerts (product_id, user_email, target_price, alert_type) VALUES ($1, $2, $3, $4)',
        [productId, user_email, target_price, 'price_drop']
      );
    }

    const product = await pool.query('SELECT * FROM products WHERE id = $1', [productId]);
    res.json(product.rows[0]);
  } catch (error) {
    console.error('Error adding product:', error);
    res.status(500).json({ error: error.message || 'Failed to add product' });
  }
});

// DELETE product
app.delete('/api/products/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await pool.query('DELETE FROM products WHERE id = $1', [id]);
    res.json({ message: 'Product deleted successfully' });
  } catch (error) {
    console.error('Error deleting product:', error);
    res.status(500).json({ error: 'Failed to delete product' });
  }
});

// Update product check (manual refresh)
app.post('/api/products/:id/check', async (req, res) => {
  try {
    const { id } = req.params;
    
    const product = await pool.query('SELECT * FROM products WHERE id = $1', [id]);
    if (product.rows.length === 0) {
      return res.status(404).json({ error: 'Product not found' });
    }

    const listingData = await scrapeFacebookListing(product.rows[0].marketplace_url);
    
    // Update product
    await pool.query(
      `UPDATE products 
       SET current_price = $1, last_checked = NOW()
       WHERE id = $2`,
      [listingData.price, id]
    );

    // Add to price history if price changed
    if (listingData.price !== product.rows[0].current_price) {
      await pool.query(
        'INSERT INTO price_history (product_id, price) VALUES ($1, $2)',
        [id, listingData.price]
      );

      // Check for alerts
      await checkAlerts(id, listingData.price);
    }

    res.json({ message: 'Product updated', price: listingData.price });
  } catch (error) {
    console.error('Error checking product:', error);
    res.status(500).json({ error: 'Failed to check product' });
  }
});

// GET product statistics
app.get('/api/stats', async (req, res) => {
  try {
    const stats = await pool.query(`
      SELECT 
        COUNT(*) as total_products,
        COUNT(CASE WHEN status = 'active' THEN 1 END) as active_products,
        AVG(current_price) as avg_price,
        MAX(current_price) as max_price,
        MIN(current_price) as min_price
      FROM products
    `);
    res.json(stats.rows[0]);
  } catch (error) {
    console.error('Error fetching stats:', error);
    res.status(500).json({ error: 'Failed to fetch statistics' });
  }
});

// Check alerts for a product
async function checkAlerts(productId, currentPrice) {
  try {
    const alerts = await pool.query(
      `SELECT a.*, p.title, p.marketplace_url 
       FROM alerts a
       JOIN products p ON a.product_id = p.id
       WHERE a.product_id = $1 AND a.is_active = true`,
      [productId]
    );

    for (const alert of alerts.rows) {
      if (currentPrice <= alert.target_price) {
        await sendPriceAlert(alert, currentPrice);
        
        // Mark alert as triggered
        await pool.query(
          'UPDATE alerts SET triggered_at = NOW(), is_active = false WHERE id = $1',
          [alert.id]
        );
      }
    }
  } catch (error) {
    console.error('Error checking alerts:', error);
  }
}

// Send price alert email
async function sendPriceAlert(alert, currentPrice) {
  try {
    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: alert.user_email,
      subject: `🦅 PriceHawk Alert: ${alert.title} price dropped!`,
      html: `
        <h2>Price Alert Triggered!</h2>
        <p>The product you're tracking has reached your target price:</p>
        <h3>${alert.title}</h3>
        <p><strong>Current Price:</strong> $${currentPrice}</p>
        <p><strong>Your Target:</strong> $${alert.target_price}</p>
        <p><a href="${alert.marketplace_url}">View Listing</a></p>
        <br>
        <p>Happy shopping!</p>
        <p>- PriceHawk Team</p>
      `
    };

    await transporter.sendMail(mailOptions);
    console.log(`Alert sent to ${alert.user_email}`);
  } catch (error) {
    console.error('Error sending email:', error);
  }
}

// Cron job to check prices every hour
cron.schedule('0 * * * *', async () => {
  console.log('Running scheduled price check...');
  try {
    const products = await pool.query('SELECT * FROM products WHERE status = \'active\'');
    
    for (const product of products.rows) {
      try {
        const listingData = await scrapeFacebookListing(product.marketplace_url);
        
        await pool.query(
          `UPDATE products 
           SET current_price = $1, last_checked = NOW()
           WHERE id = $2`,
          [listingData.price, product.id]
        );

        if (listingData.price !== product.current_price) {
          await pool.query(
            'INSERT INTO price_history (product_id, price) VALUES ($1, $2)',
            [product.id, listingData.price]
          );

          await checkAlerts(product.id, listingData.price);
        }

        // Small delay between requests
        await new Promise(resolve => setTimeout(resolve, 2000));
      } catch (error) {
        console.error(`Error checking product ${product.id}:`, error);
      }
    }
    console.log('Price check completed');
  } catch (error) {
    console.error('Error in scheduled price check:', error);
  }
});

app.listen(port, () => {
  console.log(`PriceHawk API running on port ${port}`);
});
