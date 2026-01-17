import { useState, useEffect } from 'react'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000'

function App() {
  const [products, setProducts] = useState([])
  const [searchUrl, setSearchUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const [activeView, setActiveView] = useState('dashboard')

  useEffect(() => {
    fetchProducts()
  }, [])

  const fetchProducts = async () => {
    try {
      const response = await fetch(`${API_URL}/api/products`)
      const data = await response.json()
      setProducts(data)
    } catch (error) {
      console.error('Error fetching products:', error)
    }
  }

  const handleAddProduct = async (e) => {
    e.preventDefault()
    setLoading(true)
    try {
      const response = await fetch(`${API_URL}/api/products`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ marketplace_url: searchUrl })
      })
      if (response.ok) {
        setSearchUrl('')
        fetchProducts()
      }
    } catch (error) {
      console.error('Error adding product:', error)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="app">
      {/* Sidebar */}
      <nav className="sidebar">
        <div className="logo">🦅 PriceHawk</div>
        <div className="nav-items">
          <button 
            className={activeView === 'dashboard' ? 'nav-item active' : 'nav-item'}
            onClick={() => setActiveView('dashboard')}
          >
            <span className="icon">📊</span>
            Dashboard
          </button>
          <button 
            className={activeView === 'products' ? 'nav-item active' : 'nav-item'}
            onClick={() => setActiveView('products')}
          >
            <span className="icon">📦</span>
            Tracked Products
          </button>
          <button 
            className={activeView === 'alerts' ? 'nav-item active' : 'nav-item'}
            onClick={() => setActiveView('alerts')}
          >
            <span className="icon">🔔</span>
            Price Alerts
          </button>
        </div>
      </nav>

      {/* Main Content */}
      <main className="main-content">
        <header className="header">
          <h1>Facebook Marketplace Price Tracker</h1>
          <p className="subtitle">Track prices and get alerts when items drop</p>
        </header>

        {/* Search Bar */}
        <div className="search-section">
          <form onSubmit={handleAddProduct} className="search-form">
            <input
              type="text"
              placeholder="Paste Facebook Marketplace URL here..."
              value={searchUrl}
              onChange={(e) => setSearchUrl(e.target.value)}
              className="search-input"
            />
            <button type="submit" disabled={loading} className="btn-primary">
              {loading ? '⏳ Adding...' : '➕ Track Product'}
            </button>
          </form>
        </div>

        {/* Stats Cards */}
        <div className="stats-grid">
          <div className="stat-card">
            <div className="stat-value">{products.length}</div>
            <div className="stat-label">Tracked Items</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">-</div>
            <div className="stat-label">Price Drops</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">-</div>
            <div className="stat-label">Active Alerts</div>
          </div>
        </div>

        {/* Products Grid */}
        <div className="products-section">
          <h2>Your Tracked Products</h2>
          {products.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">📦</div>
              <h3>No products tracked yet</h3>
              <p>Start tracking by adding a Facebook Marketplace URL above</p>
            </div>
          ) : (
            <div className="products-grid">
              {products.map(product => (
                <div key={product.id} className="product-card">
                  <div className="product-image">
                    {product.image_url ? (
                      <img src={product.image_url} alt={product.title} />
                    ) : (
                      <div className="placeholder-image">📸</div>
                    )}
                  </div>
                  <div className="product-info">
                    <h3 className="product-title">{product.title}</h3>
                    <div className="price-info">
                      <span className="current-price">${product.current_price}</span>
                      {product.original_price && product.original_price !== product.current_price && (
                        <span className="original-price">${product.original_price}</span>
                      )}
                    </div>
                    <div className="product-meta">
                      <span className="location">📍 {product.location || 'Unknown'}</span>
                    </div>
                  </div>
                  <div className="product-actions">
                    <a href={product.marketplace_url} target="_blank" rel="noopener noreferrer" className="btn-view">
                      View Listing
                    </a>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  )
}

export default App
