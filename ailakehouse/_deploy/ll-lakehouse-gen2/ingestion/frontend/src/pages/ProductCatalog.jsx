import { useMemo, useState } from 'react';
import { Boxes, Database, Package, RefreshCw, Search, Tags, ThumbsUp, TrendingUp } from 'lucide-react';
import { api } from '../utils/api';
import { formatCurrency, formatDate, formatNumber } from '../utils/format';
import { useData } from '../hooks/useData';
import ImportanceModal, { ImportanceButton } from '../components/ImportanceModal';
import { IMPORTANCE_CONTENT } from '../content/importanceContent';

const PAGE_SIZE = 50;

function formatMomentumLabel(flag) {
  if (!flag) return 'Baseline';
  return String(flag)
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function SignalCard({ signal }) {
  const score = Number(signal.VIRALITY_SCORE || 0);
  const confidence = Number(signal.CONFIDENCE_SCORE || 0);

  return (
    <article className="product-catalog-signal-card">
      <div className="product-catalog-signal-card__header">
        <div>
          <span className="product-catalog-signal-source">
            {signal.HANDLE ? `@${signal.HANDLE}` : 'Signal source'}
          </span>
          <span className="product-catalog-signal-date">{formatDate(signal.POSTED_AT)}</span>
        </div>
        <span className={`momentum-badge momentum-${signal.MOMENTUM_FLAG || 'normal'}`}>
          {formatMomentumLabel(signal.MOMENTUM_FLAG)}
        </span>
      </div>

      <p className="product-catalog-signal-text">{signal.POST_TEXT}</p>

      <div className="product-catalog-signal-metrics">
        <span title="Demand priority score based on reach, engagement, and signal intensity.">
          <TrendingUp size={12} aria-hidden="true" />
          {score ? score.toFixed(1) : '0.0'} priority
        </span>
        <span title="Engagement count on the source signal.">
          <ThumbsUp size={12} aria-hidden="true" />
          {formatNumber(signal.LIKES_COUNT || 0)} engagement
        </span>
        {confidence > 0 && (
          <span title="Confidence that this demand signal is linked to the selected product.">
            {Math.round(confidence * 100)}% match
          </span>
        )}
        {signal.MENTION_TYPE && <span>{signal.MENTION_TYPE}</span>}
      </div>
    </article>
  );
}

function CatalogStat({ icon: Icon, label, value, accent }) {
  return (
    <div className="product-catalog-stat">
      <span className="product-catalog-stat__icon" style={{ color: accent, background: `${accent}16` }}>
        <Icon size={18} aria-hidden="true" />
      </span>
      <span>
        <strong>{value}</strong>
        <span>{label}</span>
      </span>
    </div>
  );
}

function ProductDetail({ productId, onClose }) {
  const { data, loading, error } = useData(() => api.products.detail(productId), [productId]);
  const product = data?.product;
  const inventory = data?.inventory || [];
  const signals = data?.socialMentions || [];

  return (
    <aside className="product-catalog-detail" aria-label="Product details">
      <div className="product-catalog-detail__header">
        <div>
          <p className="section-kicker">Curated Product Detail</p>
          <h3>{product?.PRODUCT_NAME || 'Loading product'}</h3>
        </div>
        <button type="button" className="btn-ghost text-xs" onClick={onClose}>Close</button>
      </div>

      {loading && <p className="text-sm text-[var(--color-text-dim)]">Loading product details...</p>}
      {error && <p className="text-sm tone-red">{error}</p>}

      {product && (
        <>
          <div className="product-catalog-detail__image">
            {product.IMAGE_URL ? (
              <img src={product.IMAGE_URL} alt={product.PRODUCT_NAME} loading="lazy" />
            ) : (
              <div className="product-catalog-detail__image-placeholder">
                <Package size={28} aria-hidden="true" />
                <span>No catalog image</span>
              </div>
            )}
          </div>

          <div className="product-catalog-detail__meta">
            <span>{product.SKU}</span>
            <span>{product.CATEGORY}</span>
            <span>{formatCurrency(product.UNIT_PRICE)}</span>
          </div>
          <p className="product-catalog-detail__description">{product.DESCRIPTION || 'Curated catalog product from the lakehouse export.'}</p>

          <h4>Inventory By Store</h4>
          <div className="product-catalog-mini-table">
            {inventory.slice(0, 8).map((row) => (
              <div key={`${row.CENTER_ID}-${row.INVENTORY_ID}`}>
                <span>{row.CENTER_NAME}</span>
                <strong>{formatNumber(row.QUANTITY_ON_HAND || 0)}</strong>
              </div>
            ))}
          </div>

          <h4>Demand Signals</h4>
          <div className="product-catalog-signal-list">
            {signals.slice(0, 5).map((signal) => (
              <SignalCard key={signal.POST_ID} signal={signal} />
            ))}
            {!signals.length && (
              <p className="product-catalog-signal-empty">No demand signals are linked to this product yet.</p>
            )}
          </div>
        </>
      )}
    </aside>
  );
}

export default function ProductCatalog() {
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [page, setPage] = useState(1);
  const [selectedProductId, setSelectedProductId] = useState(null);
  const [showImportance, setShowImportance] = useState(false);

  const params = useMemo(() => ({
    page,
    limit: PAGE_SIZE,
    ...(category && { category }),
    ...(search && { search }),
  }), [page, category, search]);

  const { data: productsData, loading, error, refetch } = useData(() => api.products.list(params), [params], { initialData: [] });
  const { data: categoriesData } = useData(() => api.products.categories(), [], { initialData: [] });
  const products = Array.isArray(productsData) ? productsData : [];
  const categories = Array.isArray(categoriesData) ? categoriesData : [];

  const catalogTotal = useMemo(
    () => categories.reduce((sum, row) => sum + Number(row.PRODUCT_COUNT || 0), 0),
    [categories],
  );
  const selectedCategoryCount = useMemo(
    () => categories.find((row) => row.CATEGORY === category)?.PRODUCT_COUNT || null,
    [categories, category],
  );

  const applySearch = (event) => {
    event.preventDefault();
    setSearch(searchInput.trim());
    setPage(1);
    setSelectedProductId(null);
  };

  const selectCategory = (nextCategory) => {
    setCategory(nextCategory === category ? '' : nextCategory);
    setPage(1);
    setSelectedProductId(null);
  };

  return (
    <div className="space-y-5 fade-in">
      <section className="glass-card product-catalog-hero">
        <div>
          <p className="section-kicker">Curated Data Catalog</p>
          <h2>Product Catalog</h2>
          <p>
            Browse products derived from the curated lakehouse export. Catalog, inventory,
            demand signals, and orders all use the same governed product keys.
          </p>
        </div>
        <ImportanceButton onClick={() => setShowImportance(true)} />
        <div className="product-catalog-stats">
          <CatalogStat icon={Package} label="Curated products" value={formatNumber(catalogTotal)} accent="#437C94" />
          <CatalogStat icon={Tags} label="Categories" value={formatNumber(categories.length)} accent="#AA643B" />
          <CatalogStat icon={Database} label="Source" value="CSV" accent="#4F7D7B" />
        </div>
      </section>

      <ImportanceModal
        open={showImportance}
        onClose={() => setShowImportance(false)}
        content={IMPORTANCE_CONTENT.productCatalog}
      />

      <section className="glass-card product-catalog-toolbar">
        <form onSubmit={applySearch} className="product-catalog-search">
          <Search size={16} aria-hidden="true" />
          <input
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder="Search product name, SKU, category, or brand"
          />
          <button type="submit" className="btn-primary text-sm">Search</button>
        </form>
        <button type="button" className="btn-ghost text-sm" onClick={refetch}>
          <RefreshCw size={14} aria-hidden="true" />
          Refresh
        </button>
      </section>

      <section className="product-catalog-layout">
        <div className="glass-card product-catalog-filter">
          <h3>Categories</h3>
          <button
            type="button"
            className={!category ? 'active' : ''}
            onClick={() => selectCategory('')}
          >
            <span>All Products</span>
            <strong>{formatNumber(catalogTotal)}</strong>
          </button>
          {categories.map((row) => (
            <button
              key={row.CATEGORY}
              type="button"
              className={category === row.CATEGORY ? 'active' : ''}
              onClick={() => selectCategory(row.CATEGORY)}
            >
              <span>{row.CATEGORY}</span>
              <strong>{formatNumber(row.PRODUCT_COUNT)}</strong>
            </button>
          ))}
        </div>

        <div className="glass-card product-catalog-table-shell">
          <div className="product-catalog-table-header">
            <div>
              <h3>{category || 'All Curated Products'}</h3>
              <p>
                {selectedCategoryCount ? formatNumber(selectedCategoryCount) : formatNumber(catalogTotal)} products
                {search ? ` matching "${search}"` : ''}
              </p>
            </div>
            <div className="product-catalog-pager">
              <button type="button" className="btn-ghost text-xs" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</button>
              <span>Page {page}</span>
              <button type="button" className="btn-ghost text-xs" disabled={products.length < PAGE_SIZE} onClick={() => setPage(page + 1)}>Next</button>
            </div>
          </div>

          {loading && <p className="text-sm text-[var(--color-text-dim)]">Loading catalog products...</p>}
          {error && <p className="text-sm tone-red">{error}</p>}

          {!loading && !error && (
            <div className="product-catalog-table-wrap">
              <table className="product-catalog-table">
                <thead>
                  <tr>
                    <th>Product</th>
                    <th>SKU</th>
                    <th>Category</th>
                    <th>Brand</th>
                    <th>Price</th>
                    <th>Inventory</th>
                    <th>Signals</th>
                  </tr>
                </thead>
                <tbody>
                  {products.map((product) => (
                    <tr
                      key={product.PRODUCT_ID}
                      className={selectedProductId === product.PRODUCT_ID ? 'is-selected' : ''}
                      onClick={() => setSelectedProductId(product.PRODUCT_ID)}
                    >
                      <td>
                        <span className="product-catalog-name">
                          <Boxes size={14} aria-hidden="true" />
                          {product.PRODUCT_NAME}
                        </span>
                      </td>
                      <td>{product.SKU}</td>
                      <td>{product.CATEGORY}</td>
                      <td>{product.BRAND_NAME}</td>
                      <td>{formatCurrency(product.UNIT_PRICE)}</td>
                      <td>{formatNumber(product.TOTAL_CAPACITY || 0)}</td>
                      <td>{formatNumber(product.SOCIAL_MENTIONS_7D || 0)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!products.length && <p className="text-sm text-center text-[var(--color-text-dim)] py-8">No products match the current filters.</p>}
            </div>
          )}
        </div>

        {selectedProductId && (
          <ProductDetail productId={selectedProductId} onClose={() => setSelectedProductId(null)} />
        )}
      </section>
    </div>
  );
}
