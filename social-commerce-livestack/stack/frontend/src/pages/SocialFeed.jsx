import { useState, useCallback } from 'react';
import { TrendingUp, Filter, Search, Flame, Eye, Share2, MessageCircle, Heart, Package, Sparkles, Loader2, DollarSign, X } from 'lucide-react';
// recharts removed — Platform Activity chart removed
import { api } from '../utils/api';
import { useData } from '../hooks/useData';
import { useUser } from '../context/UserContext';
import { formatNumber, formatCurrency, timeAgo, getPlatformColor } from '../utils/format';
import { FeatureBadge, SqlBlock, DiagramBox } from '../components/OracleInfoPanel';
import { RegisterOraclePanel } from '../context/OraclePanelContext';

function PostCard({ post }) {
  const momentumClass = `momentum-${post.MOMENTUM_FLAG}`;
  return (
    <div className="glass-card p-4 fade-in">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1.5">
            <span className={`platform-badge platform-${post.PLATFORM}`}>{post.PLATFORM}</span>
            <span className={`momentum-badge ${momentumClass}`}>
              {post.MOMENTUM_FLAG === 'mega_viral' ? '🔥 MEGA VIRAL' :
               post.MOMENTUM_FLAG === 'viral' ? '🔥 Viral' :
               post.MOMENTUM_FLAG === 'rising' ? '📈 Rising' : 'Normal'}
            </span>
            <span className="text-[11px] text-[var(--color-text-dim)]">{timeAgo(post.POSTED_AT)}</span>
          </div>
          {post.INFLUENCER_HANDLE && (
            <p className="text-xs text-[var(--color-accent)] font-medium mb-1">
              {post.INFLUENCER_HANDLE}
              <span className="text-[var(--color-text-dim)] font-normal ml-2">
                {formatNumber(post.FOLLOWER_COUNT)} followers · Score {post.INFLUENCE_SCORE}
              </span>
            </p>
          )}
          <p className="text-sm leading-relaxed line-clamp-3">{post.POST_TEXT}</p>
        </div>
        {post.VIRALITY_SCORE && (
          <div className="flex-shrink-0 text-center">
            <div className="text-lg font-bold font-mono" style={{ color: post.VIRALITY_SCORE > 75 ? '#C74634' : post.VIRALITY_SCORE > 50 ? '#D4760A' : '#6B6560' }}>
              {post.VIRALITY_SCORE}
            </div>
            <div className="text-[9px] text-[var(--color-text-dim)] uppercase">Virality</div>
          </div>
        )}
      </div>
      <div className="flex items-center gap-4 mt-3 pt-3 border-t border-[var(--color-border)]/30 text-[12px] text-[var(--color-text-dim)]">
        <span className="flex items-center gap-1"><Heart size={12} /> {formatNumber(post.LIKES_COUNT)}</span>
        <span className="flex items-center gap-1"><Share2 size={12} /> {formatNumber(post.SHARES_COUNT)}</span>
        <span className="flex items-center gap-1"><MessageCircle size={12} /> {formatNumber(post.COMMENTS_COUNT)}</span>
        <span className="flex items-center gap-1"><Eye size={12} /> {formatNumber(post.VIEWS_COUNT)}</span>
        {post.SENTIMENT_SCORE != null && (
          <span className="ml-auto">
            Sentiment: <span className={post.SENTIMENT_SCORE > 0.5 ? 'text-green-400' : post.SENTIMENT_SCORE > 0 ? 'text-yellow-400' : 'text-red-400'}>
              {post.SENTIMENT_SCORE.toFixed(2)}
            </span>
          </span>
        )}
      </div>
    </div>
  );
}

// ── Similarity bar color ──────────────────────────────────────────────────────
function simColor(score) {
  if (score >= 0.7) return '#2D9F5E';
  if (score >= 0.5) return '#D4760A';
  if (score >= 0.3) return '#1B84ED';
  return '#6B6560';
}

// ── Vector Search Section ─────────────────────────────────────────────────────
function VectorSearch() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState(null);
  const [meta, setMeta] = useState(null);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState(null);

  const EXAMPLE_QUERIES = [
    'summer running shoes lightweight breathable',
    'organic skincare anti-aging serum',
    'wireless bluetooth headphones noise canceling',
    'sustainable fashion eco friendly clothing',
    'gaming laptop high performance graphics',
    'healthy protein snacks fitness nutrition',
  ];

  const runSearch = useCallback(async (searchQuery) => {
    const q = searchQuery || query;
    if (!q.trim()) return;
    setSearching(true);
    setError(null);
    try {
      const data = await api.social.search(q.trim(), 8);
      setResults(data.results || []);
      setMeta({ model: data.model, dimensions: data.dimensions, query: data.query });
    } catch (err) {
      setError(err.message);
      setResults([]);
    } finally {
      setSearching(false);
    }
  }, [query]);

  return (
    <div className="glass-card p-5 border border-cyan-500/20">
      <div className="flex items-center gap-2 mb-4">
        <Sparkles size={18} className="text-cyan-400" />
        <h3 className="text-sm font-bold">Product Vector Search</h3>
        <span className="text-[10px] px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-400 border border-cyan-500/30 font-mono">
          VECTOR_EMBEDDING · COSINE · ANN
        </span>
      </div>

      {/* Search Input */}
      <div className="flex gap-2 mb-3">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-text-dim)]" />
          <input
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && runSearch()}
            placeholder="Describe what you're looking for... (e.g. 'summer running shoes')"
            className="w-full pl-9 pr-3 py-2.5 rounded-lg text-sm bg-[var(--color-bg)] border border-[var(--color-border)] focus:border-cyan-500/50 focus:outline-none transition-colors"
          />
        </div>
        <button
          onClick={() => runSearch()}
          disabled={searching || !query.trim()}
          className="px-5 py-2.5 rounded-lg text-sm font-medium bg-cyan-600 hover:bg-cyan-500 disabled:opacity-40 transition-colors flex items-center gap-2"
        >
          {searching ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
          Search
        </button>
        {(results || query) && (
          <button
            onClick={() => { setQuery(''); setResults(null); setMeta(null); setError(null); }}
            className="px-3 py-2.5 rounded-lg text-sm text-[var(--color-text-dim)] hover:text-white border border-[var(--color-border)] hover:border-red-500/40 transition-colors"
          >
            Clear
          </button>
        )}
      </div>

      {/* Example Queries */}
      {!results && (
        <div className="flex flex-wrap gap-1.5 mb-1">
          <span className="text-[10px] text-[var(--color-text-dim)] mr-1">Try:</span>
          {EXAMPLE_QUERIES.map(eq => (
            <button
              key={eq}
              onClick={() => { setQuery(eq); runSearch(eq); }}
              className="text-[10px] px-2 py-1 rounded-full border border-[var(--color-border)] hover:border-cyan-500/50 hover:text-cyan-400 transition-colors"
            >
              {eq}
            </button>
          ))}
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="text-sm text-red-400 mt-2">Search error: {error}</div>
      )}

      {/* Results */}
      {results && (
        <div className="mt-3">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs text-[var(--color-text-dim)]">
              {results.length} products matched for "<span className="text-cyan-400">{meta?.query}</span>"
            </p>
            {meta && (
              <span className="text-[10px] text-[var(--color-text-dim)] font-mono">
                {meta.model} · {meta.dimensions}d · cosine
              </span>
            )}
          </div>
          {results.length === 0 ? (
            <p className="text-sm text-[var(--color-text-dim)]">No products matched the query vector.</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {results.map((r, i) => (
                <div
                  key={r.PRODUCT_ID}
                  className="flex items-center gap-3 p-3 rounded-lg border border-[var(--color-border)]/40 bg-[var(--color-bg)]/50 hover:border-cyan-500/30 transition-colors"
                >
                  {/* Rank badge */}
                  <div className="flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold"
                    style={{ background: `${simColor(r.SIMILARITY_SCORE)}22`, color: simColor(r.SIMILARITY_SCORE), border: `1px solid ${simColor(r.SIMILARITY_SCORE)}44` }}>
                    {i + 1}
                  </div>
                  {/* Product info */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{r.PRODUCT_NAME}</p>
                    <p className="text-[11px] text-[var(--color-text-dim)]">
                      {r.BRAND_NAME} · {r.CATEGORY}
                      {r.MENTION_COUNT > 0 && <span className="text-orange-400 ml-1">· {r.MENTION_COUNT} mentions</span>}
                    </p>
                  </div>
                  {/* Price */}
                  <div className="text-right flex-shrink-0">
                    <div className="text-sm font-mono">{formatCurrency(r.UNIT_PRICE)}</div>
                  </div>
                  {/* Similarity */}
                  <div className="flex-shrink-0 w-16">
                    <div className="text-right text-xs font-mono font-bold" style={{ color: simColor(r.SIMILARITY_SCORE) }}>
                      {(r.SIMILARITY_SCORE * 100).toFixed(1)}%
                    </div>
                    <div className="h-1.5 rounded-full bg-[var(--color-border)]/30 mt-0.5">
                      <div className="h-full rounded-full transition-all" style={{
                        width: `${Math.max(r.SIMILARITY_SCORE * 100, 5)}%`,
                        background: simColor(r.SIMILARITY_SCORE),
                      }} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function SocialFeed() {
  const { currentUser } = useUser();
  const [momentum, setMomentum] = useState('');
  const [platform, setPlatform] = useState('');
  const [influencer, setInfluencer] = useState('');
  const [page, setPage] = useState(1);
  const [postQuery, setPostQuery] = useState('');
  const [postSearchResults, setPostSearchResults] = useState(null);
  const [postSearching, setPostSearching] = useState(false);

  const runPostSearch = useCallback(async (q) => {
    const query = (q || postQuery).trim();
    if (!query) return;
    setPostSearching(true);
    try {
      const res = await api.social.postSearch(query);
      setPostSearchResults(res);
    } catch (err) {
      console.error('Post search error:', err);
      setPostSearchResults(null);
    } finally {
      setPostSearching(false);
    }
  }, [postQuery]);

  const clearPostSearch = () => {
    setPostQuery('');
    setPostSearchResults(null);
  };

  // Fetch all influencers for dropdown filter
  const { data: influencerList } = useData(
    () => api.social.influencers(),
    [currentUser?.USERNAME]
  );
  const influencers = influencerList || [];

  // Refetch when user changes (VPD filters social posts by region)
  const { data: postsData, loading } = useData(
    () => api.social.posts({ momentum, platform, page, limit: 15, ...(influencer && { influencer }) }),
    [momentum, platform, influencer, page, currentUser?.USERNAME]
  );
  const { data: viralPosts } = useData(() => api.social.viral(48), [currentUser?.USERNAME]);

  const posts = postsData?.posts || [];
  const total = postsData?.total || 0;

  return (
    <div className="space-y-6 fade-in">

      {/* Register Oracle Internals into the right panel */}
      <RegisterOraclePanel title="Social Trends">
        <div className="space-y-4">
          <div>
            <p className="text-xs font-semibold text-[var(--color-text-dim)] uppercase tracking-wider mb-2">What's Happening</p>
            <p className="text-[var(--color-text)] leading-relaxed">
              The <span className="text-cyan-400 font-mono">vector search bar</span> embeds your query at runtime using <span className="text-cyan-400 font-mono">VECTOR_EMBEDDING(ALL_MINILM_L12_V2)</span> —
              an ONNX model loaded directly into Oracle. It then computes <span className="text-yellow-400 font-mono">VECTOR_DISTANCE(COSINE)</span> against{' '}
              <span className="text-green-400">187 pre-embedded product vectors</span> and returns the top matches via an <span className="text-purple-400 font-mono">ANN index</span>
              (approximate nearest neighbor). No external API, no Python, no microservice — the entire embedding + search pipeline runs inside the database.
              The social feed below uses <span className="text-red-400 font-mono">momentum scoring</span> across 5,000 posts with{' '}
              <span className="text-green-400">5,000 post embeddings</span> and <span className="text-orange-400">574 semantic matches</span>.
            </p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <FeatureBadge label="VECTOR_EMBEDDING (ONNX)" color="cyan" />
            <FeatureBadge label="VECTOR_DISTANCE(COSINE)" color="cyan" />
            <FeatureBadge label="ANN Index (HNSW)" color="purple" />
            <FeatureBadge label="ALL_MINILM_L12_V2" color="green" />
            <FeatureBadge label="384-dim Vectors" color="blue" />
            <FeatureBadge label="FETCH APPROXIMATE" color="yellow" />
            <FeatureBadge label="Momentum Scoring" color="red" />
            <FeatureBadge label="product_embeddings" color="orange" />
            <FeatureBadge label="post_embeddings" color="orange" />
          </div>
          <SqlBlock code={`-- Real-time vector semantic search for products
-- Embeds user query at runtime, then finds nearest
-- product vectors via ANN index (cosine distance)
SELECT p.product_id, p.product_name, p.category,
       p.unit_price, b.brand_name,
       ROUND(1 - VECTOR_DISTANCE(
         pe.embedding,
         VECTOR_EMBEDDING(ALL_MINILM_L12_V2
                          USING :query AS DATA),
         COSINE), 4)             AS similarity_score
FROM   product_embeddings pe
JOIN   products p ON pe.product_id = p.product_id
JOIN   brands   b ON p.brand_id   = b.brand_id
ORDER  BY VECTOR_DISTANCE(
  pe.embedding,
  VECTOR_EMBEDDING(ALL_MINILM_L12_V2
                   USING :query AS DATA),
  COSINE)
FETCH APPROXIMATE FIRST 10 ROWS ONLY;`} />
          <div>
            <p className="text-[10px] font-semibold text-[var(--color-text-dim)] uppercase tracking-wider mb-2">Vector Search Pipeline</p>
            <div className="space-y-1.5">
              <DiagramBox label="🔍 User Query" sub="'summer running shoes lightweight'" color="#1AADA8" />
              <div className="text-center text-[var(--color-text-dim)]">↓</div>
              <DiagramBox label="VECTOR_EMBEDDING" sub="ALL_MINILM_L12_V2 ONNX model · 384 dimensions" color="#1AADA8" />
              <div className="text-center text-[var(--color-text-dim)]">↓</div>
              <DiagramBox label="VECTOR_DISTANCE(COSINE)" sub="Query vector vs 187 product_embeddings" color="#D4760A" />
              <div className="text-center text-[var(--color-text-dim)]">↓</div>
              <DiagramBox label="ANN Index Scan" sub="FETCH APPROXIMATE FIRST K ROWS · 95% accuracy" color="#7B48A5" />
              <div className="text-center text-[var(--color-text-dim)]">↓</div>
              <DiagramBox label="📦 Ranked Products" sub="Similarity score · brand · price · social mentions" color="#2D9F5E" />
            </div>
            <p className="text-[10px] font-semibold text-[var(--color-text-dim)] uppercase tracking-wider mb-2 mt-4">Embedding Tables</p>
            <div className="space-y-1.5">
              <DiagramBox label="product_embeddings" sub="187 products · 384-dim VECTOR · COSINE ANN index" color="#D4760A" />
              <DiagramBox label="post_embeddings" sub="5,000 social posts · 384-dim VECTOR · COSINE ANN index" color="#E87B1A" />
              <DiagramBox label="semantic_matches" sub="574 pre-computed post↔product matches · vector method" color="#7B48A5" />
            </div>
          </div>
          <div>
            <p className="text-xs font-semibold text-[var(--color-text-dim)] uppercase tracking-wider mb-2">Virtual Private Database (VPD)</p>
            <p className="text-[var(--color-text)] leading-relaxed">
              <span className="text-green-400 font-mono">DBMS_RLS</span> policies filter social posts and influencer data
              based on the active user's role and region — applied transparently at the database kernel level.
              {currentUser?.ROLE === 'fulfillment_mgr' ? (
                <span className="text-yellow-400"> Showing only posts from <strong>{currentUser.REGION}</strong> influencers.</span>
              ) : (
                <span className="text-green-400"> Full access — all regions visible.</span>
              )}
            </p>
            <div className="flex flex-wrap gap-1.5 mt-2">
              <FeatureBadge label="DBMS_RLS" color="green" />
              <FeatureBadge label="Row-Level Security" color="green" />
              <FeatureBadge label="Region Filtering" color="blue" />
            </div>
          </div>
        </div>
      </RegisterOraclePanel>

      <div>
        <h2 className="text-2xl font-bold flex items-center gap-2">
          <TrendingUp className="text-[var(--color-accent)]" /> Social Trend Monitor
        </h2>
        <p className="text-sm text-[var(--color-text-dim)] mt-1">
          <span className="text-cyan-400">Oracle Vector Search</span> with ONNX embeddings · semantic product matching · momentum detection
        </p>
      </div>

      {/* ── Vector Search ── */}
      <VectorSearch />

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <Filter size={14} className="text-[var(--color-text-dim)]" />
        <select value={momentum} onChange={e => { setMomentum(e.target.value); setPage(1); }}
          className="btn-ghost bg-transparent text-sm">
          <option value="">All Momentum</option>
          <option value="mega_viral">🔥 Mega Viral</option>
          <option value="viral">Viral</option>
          <option value="rising">Rising</option>
          <option value="normal">Normal</option>
        </select>
        <select value={platform} onChange={e => { setPlatform(e.target.value); setPage(1); }}
          className="btn-ghost bg-transparent text-sm">
          <option value="">All Platforms</option>
          <option value="instagram">Instagram</option>
          <option value="tiktok">TikTok</option>
          <option value="twitter">Twitter</option>
          <option value="youtube">YouTube</option>
          <option value="threads">Threads</option>
        </select>
        <select value={influencer} onChange={e => { setInfluencer(e.target.value); setPage(1); }}
          className="btn-ghost bg-transparent text-sm">
          <option value="">All Influencers</option>
          {influencers.map(i => (
            <option key={i.HANDLE} value={i.HANDLE}>{i.HANDLE}</option>
          ))}
        </select>
        <div className="flex items-center gap-1 ml-2">
          <div className="relative">
            <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-text-dim)] pointer-events-none" />
            <input
              type="text"
              value={postQuery}
              onChange={e => setPostQuery(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && runPostSearch()}
              placeholder="Search posts by embedding..."
              className="btn-ghost bg-transparent text-sm pr-2 w-80"
              style={{ paddingLeft: '2.25rem' }}
            />
          </div>
          <button onClick={() => runPostSearch()} disabled={postSearching || !postQuery.trim()}
            className="px-2.5 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1 transition-all disabled:opacity-40"
            style={{ background: 'var(--color-accent)', color: '#fff' }}>
            {postSearching ? <Loader2 size={12} className="animate-spin" /> : <Search size={12} />}
          </button>
          {postSearchResults && (
            <button onClick={clearPostSearch}
              className="px-1.5 py-1.5 rounded-lg text-xs text-[var(--color-text-dim)] hover:text-[var(--color-text)] transition-colors border border-[var(--color-border)]">
              <X size={12} />
            </button>
          )}
        </div>
        <span className="text-xs text-[var(--color-text-dim)] ml-auto">
          {postSearchResults
            ? <><span className="text-cyan-400">{postSearchResults.count}</span> matches · {postSearchResults.elapsed}ms</>
            : <>{formatNumber(total)} posts</>}
        </span>
      </div>

      {/* Post Feed — vector search results or normal feed */}
      {postSearchResults ? (
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-xs text-[var(--color-text-dim)]">
            <Sparkles size={12} className="text-cyan-400" />
            <span>Vector search results for "<span className="text-cyan-400">{postSearchResults.query}</span>"</span>
            <span className="font-mono text-[10px]">{postSearchResults.model} · {postSearchResults.dimensions}d · cosine</span>
          </div>
          {postSearchResults.posts?.length === 0 ? (
            <p className="text-sm text-[var(--color-text-dim)]">No matching posts found.</p>
          ) : (
            postSearchResults.posts.map((p, idx) => (
              <div key={p.POST_ID} className="glass-card p-4 fade-in">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className="flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded"
                        style={{ background: `${simColor(p.SIMILARITY_SCORE)}22`, color: simColor(p.SIMILARITY_SCORE), border: `1px solid ${simColor(p.SIMILARITY_SCORE)}44` }}>
                        #{idx + 1} · {(p.SIMILARITY_SCORE * 100).toFixed(1)}%
                      </span>
                      <span className={`platform-badge platform-${p.PLATFORM}`}>{p.PLATFORM}</span>
                      <span className={`momentum-badge momentum-${p.MOMENTUM_FLAG}`}>
                        {p.MOMENTUM_FLAG === 'mega_viral' ? '🔥 MEGA VIRAL' :
                         p.MOMENTUM_FLAG === 'viral' ? '🔥 Viral' :
                         p.MOMENTUM_FLAG === 'rising' ? '📈 Rising' : 'Normal'}
                      </span>
                      <span className="text-[11px] text-[var(--color-text-dim)]">{timeAgo(p.POSTED_AT)}</span>
                    </div>
                    {p.INFLUENCER_HANDLE && (
                      <p className="text-xs text-[var(--color-accent)] font-medium mb-1">
                        {p.INFLUENCER_HANDLE}
                        <span className="text-[var(--color-text-dim)] font-normal ml-2">
                          {formatNumber(p.FOLLOWER_COUNT)} followers · Score {p.INFLUENCE_SCORE}
                        </span>
                      </p>
                    )}
                    <p className="text-sm leading-relaxed line-clamp-3">{p.POST_TEXT}</p>
                  </div>
                  <div className="flex-shrink-0 text-center">
                    <div className="w-12 h-12 rounded-lg flex flex-col items-center justify-center"
                      style={{ background: `${simColor(p.SIMILARITY_SCORE)}15`, border: `1px solid ${simColor(p.SIMILARITY_SCORE)}30` }}>
                      <div className="text-sm font-bold font-mono" style={{ color: simColor(p.SIMILARITY_SCORE) }}>
                        {(p.SIMILARITY_SCORE * 100).toFixed(0)}%
                      </div>
                      <div className="text-[8px] text-[var(--color-text-dim)]">match</div>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-4 mt-3 pt-3 border-t border-[var(--color-border)]/30 text-[12px] text-[var(--color-text-dim)]">
                  <span className="flex items-center gap-1"><Heart size={12} /> {formatNumber(p.LIKES_COUNT)}</span>
                  <span className="flex items-center gap-1"><Share2 size={12} /> {formatNumber(p.SHARES_COUNT)}</span>
                  <span className="flex items-center gap-1"><MessageCircle size={12} /> {formatNumber(p.COMMENTS_COUNT)}</span>
                  <span className="flex items-center gap-1"><Eye size={12} /> {formatNumber(p.VIEWS_COUNT)}</span>
                  {p.SENTIMENT_SCORE != null && (
                    <span className="ml-auto">
                      Sentiment: <span className={p.SENTIMENT_SCORE > 0.5 ? 'text-green-400' : p.SENTIMENT_SCORE > 0 ? 'text-yellow-400' : 'text-red-400'}>
                        {p.SENTIMENT_SCORE.toFixed(2)}
                      </span>
                    </span>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      ) : (
        <>
          {/* Normal Post Feed */}
          <div className="space-y-3">
            {loading ? (
              <p className="text-sm text-[var(--color-text-dim)]">Loading posts...</p>
            ) : posts.length === 0 ? (
              <p className="text-sm text-[var(--color-text-dim)]">No posts found</p>
            ) : (
              posts.map(p => <PostCard key={p.POST_ID} post={p} />)
            )}
          </div>

          {/* Pagination */}
          {total > 15 && (
            <div className="flex items-center justify-center gap-2">
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="btn-ghost">← Prev</button>
              <span className="text-sm text-[var(--color-text-dim)]">Page {page} of {Math.ceil(total / 15)}</span>
              <button onClick={() => setPage(p => p + 1)} disabled={page >= Math.ceil(total / 15)} className="btn-ghost">Next →</button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
