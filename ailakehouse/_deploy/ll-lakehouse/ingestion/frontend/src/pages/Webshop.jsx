import { useEffect, useMemo, useState } from 'react';
import {
  Bot,
  Image as ImageIcon,
  Loader2,
  MessageCircle,
  Minus,
  PackageCheck,
  Plus,
  Search,
  Send,
  ShoppingCart,
  Sparkles,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { api } from '../utils/api';
import { formatCurrency, formatNumber } from '../utils/format';
import { convertPngToJpegFile } from '../utils/imageFiles';
import ImportanceModal, { ImportanceButton } from '../components/ImportanceModal';
import { FeatureBadge, SqlBlock, DiagramBox } from '../components/OracleInfoPanel';
import { RegisterOraclePanel } from '../context/OraclePanelContext';
import { IMPORTANCE_CONTENT } from '../content/importanceContent';

function similarityLabel(value) {
  if (value == null || Number.isNaN(Number(value))) return 'n/a';
  return `${Math.round(Number(value) * 100)}%`;
}

const ASK_PEAKGEAR_PROMPTS = [
  'I have a problem with a product',
  'I want to return a product',
];

function CartLine({ item, onIncrement, onDecrement, onRemove }) {
  return (
    <div className="webshop-cart-line">
      <div>
        <strong>{item.productName}</strong>
        <span>{formatCurrency(item.unitPrice)} each</span>
      </div>
      <div className="webshop-cart-line__controls">
        <button type="button" className="webshop-icon-button" onClick={() => onDecrement(item.productId)} aria-label={`Decrease ${item.productName}`}>
          <Minus size={14} aria-hidden="true" />
        </button>
        <span>{item.quantity}</span>
        <button type="button" className="webshop-icon-button" onClick={() => onIncrement(item.productId)} aria-label={`Increase ${item.productName}`}>
          <Plus size={14} aria-hidden="true" />
        </button>
        <button type="button" className="webshop-icon-button" onClick={() => onRemove(item.productId)} aria-label={`Remove ${item.productName}`}>
          <Trash2 size={14} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}

function ProductCard({ product, onAdd }) {
  const visualMatch = product.matchSources?.includes('visual');
  const catalogMatch = product.matchSources?.includes('catalog');

  return (
    <article className="webshop-product-card">
      <div className="webshop-product-card__image">
        {product.imageUrl ? (
          <img src={product.imageUrl} alt={product.productName} loading="lazy" />
        ) : (
          <ImageIcon size={32} aria-hidden="true" />
        )}
        {product.score != null && (
          <span className="webshop-score">{similarityLabel(product.score)}</span>
        )}
      </div>

      <div className="webshop-product-card__body">
        <div className="webshop-product-card__header">
          <div>
            <p className="webshop-product-card__category">{product.category}</p>
            <h3>{product.productName}</h3>
          </div>
          <strong>{formatCurrency(product.unitPrice)}</strong>
        </div>

        <p className="webshop-product-card__description">
          {product.description || `${product.brandName} ${product.subcategory || product.category}`}
        </p>

        <div className="webshop-match-row">
          {visualMatch && (
            <span>
              <ImageIcon size={13} aria-hidden="true" />
              Visual {similarityLabel(product.imageSimilarity)}
            </span>
          )}
          {catalogMatch && (
            <span>
              <Sparkles size={13} aria-hidden="true" />
              Catalog {similarityLabel(product.textSimilarity)}
            </span>
          )}
        </div>

        <div className="webshop-product-card__footer">
          <span>{formatNumber(product.totalInventory || 0)} in stock</span>
          <button type="button" className="btn-primary text-sm" onClick={() => onAdd(product)}>
            <Plus size={15} aria-hidden="true" />
            Add
          </button>
        </div>
      </div>
    </article>
  );
}

export default function Webshop() {
  const [queryInput, setQueryInput] = useState('');
  const [query, setQuery] = useState('');
  const [imageFile, setImageFile] = useState(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState('');
  const [imageSearch, setImageSearch] = useState(null);
  const [status, setStatus] = useState(null);
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [imageLoading, setImageLoading] = useState(false);
  const [indexing, setIndexing] = useState(false);
  const [error, setError] = useState('');
  const [cart, setCart] = useState([]);
  const [askOpen, setAskOpen] = useState(false);
  const [agentStatus, setAgentStatus] = useState(null);
  const [askSessionId] = useState(() => (
    window.crypto?.randomUUID ? window.crypto.randomUUID() : `ask-${Date.now()}`
  ));
  const [askMessages, setAskMessages] = useState([
    {
      id: 'welcome',
      role: 'assistant',
      content: 'Ask me for help with product issues, returns, and exchanges.',
    },
  ]);
  const [agentTrace, setAgentTrace] = useState([]);
  const [agentRequest, setAgentRequest] = useState(null);
  const [askInput, setAskInput] = useState('');
  const [askLoading, setAskLoading] = useState(false);
  const [askError, setAskError] = useState('');
  const [showSearchImportance, setShowSearchImportance] = useState(false);

  const cartTotal = useMemo(
    () => cart.reduce((sum, item) => sum + Number(item.unitPrice || 0) * item.quantity, 0),
    [cart],
  );
  const cartCount = useMemo(
    () => cart.reduce((sum, item) => sum + item.quantity, 0),
    [cart],
  );

  useEffect(() => {
    let isMounted = true;
    api.webshop.status()
      .then((data) => {
        if (isMounted) setStatus(data);
      })
      .catch((err) => {
        if (isMounted) setError(err.message);
      });
    return () => { isMounted = false; };
  }, []);

  useEffect(() => {
    let isMounted = true;
    api.webshop.agentStatus()
      .then((data) => {
        if (isMounted) setAgentStatus(data);
      })
      .catch((err) => {
        if (!isMounted) return;
        setAgentStatus({
          available: false,
          connected: false,
          reason: err.message,
          profileName: 'COHERE_RAG',
          teamName: 'RETURN_ADVISOR_TEAM',
        });
      });
    return () => { isMounted = false; };
  }, []);

  useEffect(() => () => {
    if (imagePreviewUrl) URL.revokeObjectURL(imagePreviewUrl);
  }, [imagePreviewUrl]);

  useEffect(() => {
    let isMounted = true;
    async function runSearch() {
      setLoading(true);
      setError('');
      try {
        const data = await api.webshop.search(query, 16);
        if (!isMounted) return;
        setResults(data.results || []);
        setStatus((current) => ({
          ...(current || {}),
          indexedImages: data.index?.indexed ?? current?.indexedImages,
          imageModel: data.models?.image || current?.imageModel,
          imageTextModel: data.models?.imageText || current?.imageTextModel,
          catalogTextModel: data.models?.catalogText || current?.catalogTextModel,
        }));
      } catch (err) {
        if (isMounted) setError(err.message);
      } finally {
        if (isMounted) setLoading(false);
      }
    }
    runSearch();
    return () => { isMounted = false; };
  }, [query]);

  const submitSearch = (event) => {
    event.preventDefault();
    const nextQuery = queryInput.trim();
    setImageSearch(null);
    setQuery(nextQuery);
  };

  const selectImage = (event) => {
    const file = event.target.files?.[0] || null;
    if (imagePreviewUrl) URL.revokeObjectURL(imagePreviewUrl);
    setImageSearch(null);
    setError('');

    if (!file) {
      setImageFile(null);
      setImagePreviewUrl('');
      return;
    }

    if (!['image/jpeg', 'image/png'].includes(file.type)) {
      setImageFile(null);
      setImagePreviewUrl('');
      setError('Upload a JPG or PNG image.');
      return;
    }

    setImageFile(file);
    setImagePreviewUrl(URL.createObjectURL(file));
  };

  const clearImage = () => {
    if (imagePreviewUrl) URL.revokeObjectURL(imagePreviewUrl);
    setImageFile(null);
    setImagePreviewUrl('');
    setImageSearch(null);
  };

  const runImageSearch = async () => {
    if (!imageFile) return;
    setImageLoading(true);
    setLoading(true);
    setError('');
    try {
      const searchableImage = await convertPngToJpegFile(imageFile, 'shopper-image');
      const data = await api.webshop.imageSearch(searchableImage, 16);
      setResults(data.results || []);
      setQuery('');
      setQueryInput('');
      setImageSearch(data.upload ? { ...data.upload, lakehouse: data.lakehouse || null, warning: data.warning || null } : null);
      setStatus((current) => ({
        ...(current || {}),
        indexedImages: data.index?.indexed ?? current?.indexedImages,
        imageModel: data.models?.image || current?.imageModel,
        uploadParConfigured: true,
      }));
    } catch (err) {
      setError(err.message);
    } finally {
      setImageLoading(false);
      setLoading(false);
    }
  };

  const rebuildIndex = async () => {
    setIndexing(true);
    setError('');
    try {
      const data = await api.webshop.index();
      setStatus((current) => ({ ...(current || {}), indexedImages: data.indexed }));
      if (query) {
        const searchData = await api.webshop.search(query, 16);
        setResults(searchData.results || []);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setIndexing(false);
    }
  };

  const addToCart = (product) => {
    setCart((current) => {
      const existing = current.find((item) => item.productId === product.productId);
      if (existing) {
        return current.map((item) => (
          item.productId === product.productId
            ? { ...item, quantity: item.quantity + 1 }
            : item
        ));
      }
      return [...current, { ...product, quantity: 1 }];
    });
  };

  const increment = (productId) => {
    setCart((current) => current.map((item) => (
      item.productId === productId ? { ...item, quantity: item.quantity + 1 } : item
    )));
  };

  const decrement = (productId) => {
    setCart((current) => current
      .map((item) => (item.productId === productId ? { ...item, quantity: item.quantity - 1 } : item))
      .filter((item) => item.quantity > 0));
  };

  const remove = (productId) => {
    setCart((current) => current.filter((item) => item.productId !== productId));
  };

  const returnAgentAvailable = Boolean(agentStatus?.available && agentStatus?.connected);
  const askAvailable = returnAgentAvailable;
  const askStatusLabel = returnAgentAvailable
    ? `Agent team ${agentStatus.teamName || 'RETURN_ADVISOR_TEAM'}`
    : 'Requires Select AI Agent setup in ADB';
  const askPlaceholder = 'Ask for help with a product issue, return, or exchange';
  const showAgentRequest = Boolean(agentRequest?.updatedAt);

  const submitAskMessage = async (messageOverride = '') => {
    const message = (messageOverride || askInput).trim();
    if (!message || askLoading || !askAvailable) return;

    const userMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: message,
    };

    setAskMessages((current) => [...current, userMessage]);
    setAskInput('');
    setAskError('');
    setAskLoading(true);

    try {
      const data = await api.webshop.agentAsk(message, askSessionId, agentStatus?.teamName);
      setAgentTrace(data.trace || []);
      setAgentRequest(data.request || null);
      setAskMessages((current) => [
        ...current,
        {
          id: `assistant-${Date.now()}`,
          role: 'assistant',
          content: data.answer || 'Ask PeakGear did not return an answer.',
        },
      ]);
    } catch (err) {
      setAskError(err.message);
      setAskMessages((current) => [
        ...current,
        {
          id: `assistant-error-${Date.now()}`,
          role: 'assistant',
          content: 'The Returns & Exchanges agent is unavailable right now. The Select AI Agent team must be enabled in ADB.',
        },
      ]);
    } finally {
      setAskLoading(false);
    }
  };

  const submitAskForm = (event) => {
    event.preventDefault();
    submitAskMessage();
  };

  return (
    <div className="webshop-page fade-in">
      <RegisterOraclePanel title="PeakGear Webshop">
        <div className="space-y-4">
          <div>
            <p className="text-xs font-semibold text-[var(--color-text-dim)] uppercase tracking-wider mb-2">What's Happening</p>
            <p className="text-[var(--color-text)] leading-relaxed">
              The webshop is the Serve Data outcome of the lakehouse flow. Bronze files are loaded as raw product,
              order, inventory, demand, and image-manifest data. The Process step standardizes and enriches that into
              Silver, then curated product and inventory records become a customer-facing catalog that can be searched with
              AI Vector Search over both product text and product imagery.
            </p>
            <p className="text-[var(--color-text)] leading-relaxed mt-2">
              The app does not ask users to know SKUs or categories; it lets them describe intent, style, or use case and
              lets Oracle vector search retrieve suitable products from governed catalog data.
            </p>
          </div>

          <div className="flex flex-wrap gap-1.5">
            <FeatureBadge label="Bronze Raw Data" color="orange" />
            <FeatureBadge label="Silver Standardization" color="blue" />
            <FeatureBadge label="Curated Product Catalog" color="green" />
            <FeatureBadge label="Oracle Vector Search" color="cyan" />
            <FeatureBadge label="Image Embeddings" color="purple" />
            <FeatureBadge label="Text Embeddings" color="pink" />
            <FeatureBadge label="Query Intent" color="orange" />
            <FeatureBadge label="Retail Attributes" color="green" />
          </div>

          <div>
            <p className="text-[10px] font-semibold text-[var(--color-text-dim)] uppercase tracking-wider mb-2">Runtime Flow</p>
            <div className="space-y-1" style={{ fontSize: 9 }}>
              <DiagramBox label="Bronze" sub="raw product, POS, inventory, demand, image manifest" color="#AA643B" />
              <div className="text-center text-[var(--color-text-dim)]">↓ process and clean</div>
              <DiagramBox label="Silver" sub="standardized SKUs, validated totals, image quality, demand signals" color="#437C94" />
              <div className="text-center text-[var(--color-text-dim)]">↓ curate for serving</div>
              <DiagramBox label="Curated Catalog" sub="products, inventory, descriptions, images, search features" color="#4C825C" />
              <div className="text-center text-[var(--color-text-dim)]">↓ exposed through app APIs</div>
              <DiagramBox label="PeakGear Webshop" sub="semantic text search + visual image search + ranked product cards" color="#C74634" />
            </div>
          </div>

          <div>
            <p className="text-[10px] font-semibold text-[var(--color-text-dim)] uppercase tracking-wider mb-2">Current Index</p>
            <div className="grid grid-cols-2 gap-2">
              <DiagramBox
                label={status?.indexedImages != null ? formatNumber(status.indexedImages) : 'n/a'}
                sub="visual embeddings"
                color="#796087"
              />
              <DiagramBox
                label={status?.productCount != null ? formatNumber(status.productCount) : 'n/a'}
                sub="catalog products"
                color="#4F7D7B"
              />
              <DiagramBox
                label={status?.productAttributes?.attributeCount != null ? formatNumber(status.productAttributes.attributeCount) : 'n/a'}
                sub="retail attributes"
                color="#AA643B"
              />
              <DiagramBox
                label={status?.productAttributes?.colorCount != null ? formatNumber(status.productAttributes.colorCount) : 'n/a'}
                sub="known colors"
                color="#C74634"
              />
            </div>
            <p className="text-[9px] text-[var(--color-text-dim)] mt-2 leading-relaxed">
              Refresh Index rebuilds the Oracle table that stores product image vectors from the mounted image folder.
              It also refreshes product color and type attributes used to re-rank shopper intent searches.
            </p>
          </div>

          <div>
            <p className="text-[10px] font-semibold text-[var(--color-text-dim)] uppercase tracking-wider mb-2">Hybrid Search Ranking</p>
            <p className="text-[var(--color-text)] leading-relaxed">
              Search now parses shopper intent such as color and product type, retrieves candidates from catalog text
              embeddings and product-image embeddings, then re-ranks with structured attributes from
              <span className="font-mono"> webshop_product_attributes</span>. A query like
              <span className="font-mono"> white tee shirt</span> is therefore scored by meaning, visual similarity,
              color family, and product type instead of vector similarity alone.
            </p>
          </div>

          <SqlBlock code={`-- Hybrid webshop search
-- 1. Parse shopper text for color and product-type intent
-- 2. Compare query text with product_embeddings
-- 3. Compare visual intent with webshop_product_image_embeddings
-- 4. Join webshop_product_attributes for color_family and product_type
-- 5. Re-rank with semantic score + visual score + color/type boosts
WITH catalog_matches AS (
  SELECT p.product_id,
         p.product_name,
         ROUND(1 - VECTOR_DISTANCE(
           pe.embedding,
           ca.embedding,
           COSINE
         ), 4) AS catalog_similarity,
         ROW_NUMBER() OVER (
           ORDER BY VECTOR_DISTANCE(pe.embedding, ca.embedding, COSINE)
         ) AS catalog_rank
  FROM products p
  JOIN product_embeddings pe ON pe.product_id = p.product_id
  CROSS JOIN (
    SELECT embedding
    FROM product_embeddings
    ORDER BY product_id
    FETCH FIRST 1 ROW ONLY
  ) ca
  WHERE p.is_active = 1
), visual_matches AS (
  SELECT w.product_id,
         w.image_filename,
         ROUND(1 - VECTOR_DISTANCE(
           w.embedding,
           va.embedding,
           COSINE
         ), 4) AS visual_similarity
  FROM webshop_product_image_embeddings w
  CROSS JOIN (
    SELECT embedding
    FROM webshop_product_image_embeddings
    ORDER BY image_filename
    FETCH FIRST 1 ROW ONLY
  ) va
)
SELECT c.product_name,
       a.color_family,
       a.product_type,
       v.image_filename,
       c.catalog_similarity,
       v.visual_similarity
FROM catalog_matches c
LEFT JOIN webshop_product_attributes a ON a.product_id = c.product_id
LEFT JOIN visual_matches v ON v.product_id = c.product_id
WHERE c.catalog_rank <= 10
ORDER BY c.catalog_similarity + NVL(v.visual_similarity, 0) DESC;`} />
        </div>
      </RegisterOraclePanel>

      <section className="glass-card webshop-discovery-panel" aria-label="PeakGear product discovery">
        <div className="webshop-discovery-panel__header">
          <div>
            <p className="section-kicker">Serve Data</p>
            <h2>PeakGear Webshop</h2>
          </div>
          <ImportanceButton onClick={() => setShowSearchImportance(true)} />
        </div>

        <ImportanceModal
          open={showSearchImportance}
          onClose={() => setShowSearchImportance(false)}
          content={IMPORTANCE_CONTENT.webshop}
        />

        <div className="webshop-discovery-grid">
          <div className="webshop-discovery-option">
            <div className="webshop-discovery-option__heading">
              <Search size={18} aria-hidden="true" />
              <div>
                <p>Meaning Search</p>
                <h3>Find products by intent</h3>
              </div>
            </div>
            <form className="webshop-search" onSubmit={submitSearch}>
              <Search size={18} aria-hidden="true" />
              <input
                value={queryInput}
                onChange={(event) => setQueryInput(event.target.value)}
                placeholder="Search products by meaning or visual style"
              />
              <button type="submit" className="btn-primary text-sm" disabled={loading}>
                {loading ? <Loader2 size={15} className="animate-spin" aria-hidden="true" /> : <Search size={15} aria-hidden="true" />}
                Search
              </button>
            </form>
          </div>

          <div className="webshop-discovery-option">
            <div className="webshop-discovery-option__heading">
              <ImageIcon size={18} aria-hidden="true" />
              <div>
                <p>Visual Search</p>
                <h3>Find similar products from a photo</h3>
              </div>
            </div>
            <div className="webshop-image-search__controls">
              <label className="webshop-image-picker">
                <input type="file" accept="image/jpeg,image/png" onChange={selectImage} />
                <span>
                  <Upload size={16} aria-hidden="true" />
                  {imageFile ? imageFile.name : 'Upload JPG or PNG'}
                </span>
              </label>
              {imagePreviewUrl && (
                <div className="webshop-image-preview">
                  <img src={imagePreviewUrl} alt="Uploaded search preview" />
                  <button type="button" className="webshop-icon-button" onClick={clearImage} aria-label="Remove uploaded image">
                    <X size={14} aria-hidden="true" />
                  </button>
                </div>
              )}
              <button type="button" className="btn-primary text-sm" onClick={runImageSearch} disabled={!imageFile || imageLoading || indexing}>
                {imageLoading ? <Loader2 size={15} className="animate-spin" aria-hidden="true" /> : <ImageIcon size={15} aria-hidden="true" />}
                Find Similar
              </button>
            </div>
          </div>
        </div>
      </section>

      <section className="webshop-layout">
        <div className="webshop-results-shell">
          <div className="webshop-results-header">
            <div>
              <h3>{imageSearch ? 'Visual matches for uploaded image' : query ? `Results for "${query}"` : 'Featured products'}</h3>
              <p>
                {loading ? 'Searching...' : `${results.length} products`}
                {status?.indexedImages != null ? ` · ${formatNumber(status.indexedImages)} visual embeddings` : ''}
              </p>
            </div>
            <button type="button" className="btn-ghost text-sm" onClick={rebuildIndex} disabled={indexing || loading}>
              {indexing ? <Loader2 size={15} className="animate-spin" aria-hidden="true" /> : <PackageCheck size={15} aria-hidden="true" />}
              Refresh Index
            </button>
          </div>

          {error && <p className="webshop-error">{error}</p>}

          <div className="webshop-product-grid">
            {results.map((product) => (
              <ProductCard key={product.productId} product={product} onAdd={addToCart} />
            ))}
          </div>

          {!loading && !error && !results.length && (
            <p className="webshop-empty">
              {query ? 'No products match the current search.' : 'No products are available yet.'}
            </p>
          )}
        </div>

        <aside className="glass-card webshop-cart" aria-label="Shopping cart">
          <div className="webshop-cart__header">
            <span>
              <ShoppingCart size={18} aria-hidden="true" />
              Cart
            </span>
            <strong>{formatNumber(cartCount)}</strong>
          </div>

          <div className="webshop-cart__lines">
            {cart.map((item) => (
              <CartLine
                key={item.productId}
                item={item}
                onIncrement={increment}
                onDecrement={decrement}
                onRemove={remove}
              />
            ))}
            {!cart.length && <p>Your cart is empty.</p>}
          </div>

          <div className="webshop-cart__total">
            <span>Total</span>
            <strong>{formatCurrency(cartTotal)}</strong>
          </div>
          <button type="button" className="btn-primary webshop-checkout" disabled={!cart.length}>
            Checkout
          </button>
        </aside>
      </section>

      <div className="ask-peakgear" aria-live="polite">
        {askOpen && (
          <section className="ask-peakgear-panel" aria-label="Ask PeakGear chat">
            <header className="ask-peakgear-panel__header">
              <div>
                <p>Ask PeakGear</p>
                <span>{askStatusLabel}</span>
              </div>
              <button type="button" className="webshop-icon-button" onClick={() => setAskOpen(false)} aria-label="Close Ask PeakGear">
                <X size={15} aria-hidden="true" />
              </button>
            </header>

            <div className="ask-peakgear-panel__messages">
              {askMessages.map((message) => (
                <div key={message.id} className={`ask-peakgear-message is-${message.role}`}>
                  {message.role === 'assistant' && <Bot size={14} aria-hidden="true" />}
                  <p>{message.content}</p>
                </div>
              ))}
              {askLoading && (
                <div className="ask-peakgear-message is-assistant">
                  <Loader2 size={14} className="animate-spin" aria-hidden="true" />
                  <p>Running the Select AI Agent team...</p>
                </div>
              )}
            </div>

            {(agentTrace.length > 0 || showAgentRequest) && (
              <div className="ask-peakgear-panel__trace" aria-label="Return agent database updates">
                <div>
                  <span>Agent flow</span>
                  {showAgentRequest && (
                    <strong>
                      Order {agentRequest.orderNumber} · {agentRequest.status?.replace(/_/g, ' ')}
                    </strong>
                  )}
                </div>
                {agentTrace.slice(0, 3).map((event) => (
                  <p key={`${event.eventType}-${event.createdAt}`}>
                    {event.eventType?.replace(/_/g, ' ') || 'Agent event'}
                    {event.payload?.replacementProduct ? ` · ${event.payload.replacementProduct}` : ''}
                  </p>
                ))}
              </div>
            )}

            <div className="ask-peakgear-panel__prompts">
              {ASK_PEAKGEAR_PROMPTS.map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  onClick={() => submitAskMessage(prompt)}
                  disabled={!askAvailable || askLoading}
                >
                  {prompt}
                </button>
              ))}
            </div>

            {askError && <p className="ask-peakgear-panel__error">{askError}</p>}
            {!askAvailable && (
              <p className="ask-peakgear-panel__unavailable">
                The return-agent team uses DBMS_CLOUD_AI_AGENT in ADB. It becomes available after the Terraform-provisioned AI agent setup is created.
              </p>
            )}

            <form className="ask-peakgear-panel__form" onSubmit={submitAskForm}>
              <input
                value={askInput}
                onChange={(event) => setAskInput(event.target.value)}
                placeholder={askPlaceholder}
                disabled={!askAvailable || askLoading}
              />
              <button type="submit" className="btn-primary" disabled={!askInput.trim() || !askAvailable || askLoading}>
                {askLoading ? <Loader2 size={15} className="animate-spin" aria-hidden="true" /> : <Send size={15} aria-hidden="true" />}
                Send
              </button>
            </form>
          </section>
        )}

        <button
          type="button"
          className={`ask-peakgear-launcher${askAvailable ? ' is-ready' : ''}`}
          onClick={() => setAskOpen((current) => !current)}
          aria-label="Open Ask PeakGear"
        >
          <MessageCircle size={19} aria-hidden="true" />
          Ask PeakGear
        </button>
      </div>
    </div>
  );
}
