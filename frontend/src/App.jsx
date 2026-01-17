import { useState, useEffect } from 'react'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000'

function App() {
  const [products, setProducts] = useState([])
  const [searchUrl, setSearchUrl] = useState('')
  const [loading, setLoading] = useState(false)

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
      <header>
        <h1>🦅 PriceHawk</h1>
        <p>Track Facebook Marketplace prices</p>
      </header>

      <main>
        <form onSubmit={handleAddProduct} className="search-form">
          <input
            type="url"
            value={searchUrl}
            onChange={(e) => setSearchUrl(e.target.value)}
            placeholder="Paste Facebook Marketplace URL"
            required
          />
          <button type="submit" disabled={loading}>
            {loading ? 'Adding...' : 'Track Product'}
          </button>
        </form>

        <div className="products-grid">
          {products.map(product => (
            <div key={product.id} className="product-card">
              <h3>{product.title}</h3>
              <p className="price">${product.current_price}</p>
              <p className="status">{product.status}</p>
            </div>
          ))}
        </div>
      </main>
    </div>
  )
}

export default App
