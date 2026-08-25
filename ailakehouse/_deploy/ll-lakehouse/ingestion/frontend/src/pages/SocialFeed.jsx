import { useState, useCallback } from 'react';
import { TrendingUp, Filter, Search, Flame, Eye, Share2, MessageCircle, Heart, Package, Sparkles, Loader2, DollarSign, Info } from 'lucide-react';
// recharts removed — Platform Activity chart removed
import { api } from '../utils/api';
import { useData } from '../hooks/useData';
import { useUser } from '../context/UserContext';
import { formatNumber, formatCurrency, timeAgo, getPlatformColor } from '../utils/format';
import ImportanceModal, { ImportanceButton } from '../components/ImportanceModal';
import { FeatureBadge, SqlBlock, DiagramBox } from '../components/OracleInfoPanel';
import { RegisterOraclePanel } from '../context/OraclePanelContext';
import { JetButton, JetInputText, JetSelectSingle } from '../components/JetControls';
import { IMPORTANCE_CONTENT } from '../content/importanceContent';

const SOURCE_CHANNEL_LABELS = {
  instagram: 'Social',
  tiktok: 'Product Pages',
  twitter: 'Commerce',
  youtube: 'Store Activity',
  threads: 'Partner Feed',
};
const DEMAND_PRIORITY_HELP = '0-100 score based on reach, velocity, tone, and product impact.';
const REGION_LABELS = {
  TX: 'Texas',
  CA: 'California',
  OH: 'Ohio',
  IN: 'Indiana',
  AZ: 'Arizona',
  PA: 'Pennsylvania',
  WA: 'Washington',
};

function formatSourceChannel(platform) {
  return SOURCE_CHANNEL_LABELS[platform] || platform;
}

function getSignalTone(score) {
  if (score == null) return null;
  if (score >= 0.45) return { label: 'Positive', className: 'tone-pine' };
  if (score >= 0.25) return { label: 'Watch', className: 'tone-sienna' };
  return { label: 'Mixed', className: 'tone-red' };
}

function formatSignalIntensity(flag) {
  if (flag === 'mega_viral') return 'Urgent';
  if (flag === 'viral') return 'High';
  if (flag === 'rising') return 'Emerging';
  return 'Baseline';
}

function formatRegion(region) {
  if (!region) return null;
  return REGION_LABELS[region] || region;
}

function getRecommendedAction(post) {
  const text = (post.POST_TEXT || '').toLowerCase();
  if (text.includes('substitute')) return 'Watch substitute items';
  if (post.MOMENTUM_FLAG === 'mega_viral') return 'Review allocation';
  if (post.MOMENTUM_FLAG === 'viral') return 'Check store stock';
  if (post.MOMENTUM_FLAG === 'rising') return 'Coordinate campaign';
  return 'Monitor demand';
}

function getRecommendedActionReason(post) {
  const text = (post.POST_TEXT || '').toLowerCase();
  if (text.includes('substitute')) {
    return 'Recommended because the signal mentions substitute coverage, so merchandisers should check adjacent products before demand shifts.';
  }
  if (post.MOMENTUM_FLAG === 'mega_viral') {
    return 'Recommended because the signal is Urgent, which means allocation should be reviewed before demand outpaces available inventory.';
  }
  if (post.MOMENTUM_FLAG === 'viral') {
    return 'Recommended because the signal is High intensity, so stores and fulfillment sites should be checked for near-term stock risk.';
  }
  if (post.MOMENTUM_FLAG === 'rising') {
    return 'Recommended because the signal is Emerging, so merchandising and marketing teams can coordinate before the trend peaks.';
  }
  return 'Recommended because the signal is Baseline, so it should stay on the watchlist without immediate action.';
}

function SignalTone({ score }) {
  const signalTone = getSignalTone(score);
  if (!signalTone) return null;

  return (
    <span className="ml-auto">
      Signal Tone: <span className={signalTone.className}>
        {signalTone.label}
      </span>
    </span>
  );
}

function SignalChip({ label, value, tone = 'neutral', title, showInfo = false }) {
  if (!value) return null;

  const toneClass = tone === 'action'
    ? 'border border-pine-soft tone-pine'
    : tone === 'region'
      ? 'border border-teal-soft tone-teal'
      : 'border border-[var(--color-border)]/50 text-[var(--color-text)]';

  return (
    <span
      className={`inline-flex items-center gap-1 rounded px-2 py-1 text-[10px] font-semibold uppercase tracking-wide ${toneClass}`}
      title={title || `${label}: ${value}`}
      aria-label={title || `${label}: ${value}`}
    >
      <span className="text-[var(--color-text-dim)]">{label}</span>
      <span>{value}</span>
      {showInfo && (
        <Info
          size={11}
          className="opacity-80"
          aria-hidden="true"
        />
      )}
    </span>
  );
}

function SignalContextChips({ post }) {
  const recommendedAction = getRecommendedAction(post);

  return (
    <div className="mt-2 flex flex-wrap items-center gap-1.5">
      <SignalChip label="Category" value={post.PRODUCT_CATEGORY} />
      <SignalChip label="Market" value={formatRegion(post.DEMAND_REGION)} tone="region" />
      <SignalChip
        label="Recommended Action"
        value={recommendedAction}
        tone="action"
        title={getRecommendedActionReason(post)}
        showInfo
      />
    </div>
  );
}

function MetricStat({ icon: Icon, label, value }) {
  const formattedValue = formatNumber(value);

  return (
    <span
      className="flex items-center gap-1 whitespace-nowrap"
      title={`${label}: ${formattedValue}`}
      aria-label={`${label}: ${formattedValue}`}
    >
      <Icon size={12} />
      <span className="text-[10px] uppercase tracking-wide">{label}</span>
      <span>{formattedValue}</span>
    </span>
  );
}

function PostCard({ post }) {
  const momentumClass = `momentum-${post.MOMENTUM_FLAG}`;
  return (
    <div className="glass-card p-4 fade-in">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1.5">
            <span className={`platform-badge platform-${post.PLATFORM}`}>{formatSourceChannel(post.PLATFORM)}</span>
            <span className={`momentum-badge ${momentumClass}`}>
              {formatSignalIntensity(post.MOMENTUM_FLAG)}
            </span>
            <span className="text-[11px] text-[var(--color-text-dim)]">{timeAgo(post.POSTED_AT)}</span>
          </div>
          {post.INFLUENCER_HANDLE && (
            <p className="text-xs text-[var(--color-accent)] font-medium mb-1">
              {post.INFLUENCER_HANDLE}
              <span className="text-[var(--color-text-dim)] font-normal ml-2">
                {formatNumber(post.FOLLOWER_COUNT)} audience reach · source influence {post.INFLUENCE_SCORE}
              </span>
            </p>
          )}
          <p className="text-sm leading-relaxed line-clamp-3">{post.POST_TEXT}</p>
          <SignalContextChips post={post} />
        </div>
        {post.VIRALITY_SCORE && (
          <div className="flex-shrink-0 w-28 text-center" title={DEMAND_PRIORITY_HELP}>
            <div className="text-lg font-bold font-mono" style={{ color: post.VIRALITY_SCORE > 75 ? '#C74634' : post.VIRALITY_SCORE > 50 ? '#AA643B' : '#7A736E' }}>
              {post.VIRALITY_SCORE}
            </div>
            <div className="text-[9px] text-[var(--color-text-dim)] uppercase">Demand Priority</div>
            <div className="mt-0.5 text-[8px] leading-tight text-[var(--color-text-dim)]">
              0-100: reach, velocity, tone, product impact
            </div>
          </div>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mt-3 pt-3 border-t border-[var(--color-border)]/30 text-[12px] text-[var(--color-text-dim)]">
        <MetricStat icon={Heart} label="Engagement" value={post.LIKES_COUNT} />
        <MetricStat icon={Share2} label="Amplification" value={post.SHARES_COUNT} />
        <MetricStat icon={MessageCircle} label="Discussion" value={post.COMMENTS_COUNT} />
        <MetricStat icon={Eye} label="Reach" value={post.VIEWS_COUNT} />
        <SignalTone score={post.SENTIMENT_SCORE} />
      </div>
    </div>
  );
}

// ── Similarity bar color ──────────────────────────────────────────────────────
function simColor(score) {
  if (score >= 0.7) return '#4C825C';
  if (score >= 0.5) return '#AA643B';
  if (score >= 0.3) return '#437C94';
  return '#7A736E';
}

// ── Vector Search Section ─────────────────────────────────────────────────────
function VectorSearch() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState(null);
  const [meta, setMeta] = useState(null);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState(null);

  const EXAMPLE_QUERIES = [
    'trail running shoe demand',
    'store pickup demand risk',
    'fitness device adoption',
    'assortment planning substitute demand',
    'ESG impact assortment',
    'safety update for loyalty exposure',
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
    <div className="glass-card p-5 border border-teal-soft social-vector-search-panel">
      <div className="flex items-center gap-2 mb-4">
        <Sparkles size={18} className="tone-teal social-vector-search-panel__spark" />
        <h3 className="social-vector-search-panel__title">Find Demand Patterns</h3>
      </div>

      {/* Search Input */}
      <div className="jet-control-row mb-3">
        <JetInputText
          value={query}
          placeholder="Search for demand intent, product need, or region..."
          className="jet-inline-field"
          onValueChange={setQuery}
        />
        <JetButton
          label={searching ? 'Searching…' : 'Search'}
          iconClass={searching ? 'oj-fwk-icon oj-fwk-icon-load' : 'oj-fwk-icon oj-fwk-icon-magnifier'}
          chroming="callToAction"
          disabled={searching || !query.trim()}
          onAction={() => runSearch()}
        />
        {(results || query) && (
          <JetButton
            label="Clear"
            iconClass="oj-fwk-icon oj-fwk-icon-cross"
            chroming="outlined"
            onAction={() => { setQuery(''); setResults(null); setMeta(null); setError(null); }}
          />
        )}
      </div>

      {/* Example Queries */}
      {!results && (
        <div className="flex flex-wrap gap-1.5 mb-1 items-center">
          <span className="social-vector-search-panel__helper-label mr-1">Try:</span>
          {EXAMPLE_QUERIES.map(eq => (
            <JetButton
              key={eq}
              label={eq}
              chroming="outlined"
              className="social-vector-search-panel__example-button"
              onAction={() => { setQuery(eq); runSearch(eq); }}
            />
          ))}
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="text-sm tone-red mt-2">Search error: {error}</div>
      )}

      {/* Results */}
      {results && (
        <div className="mt-3">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs text-[var(--color-text-dim)]">
              {results.length} products matched for "<span className="tone-teal">{meta?.query}</span>"
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
                  className="flex items-center gap-3 p-3 rounded-lg border border-[var(--color-border)]/40 bg-[var(--color-bg)]/50 hover:border-teal-soft transition-colors"
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
                      {r.MENTION_COUNT > 0 && <span className="tone-sienna ml-1">· {r.MENTION_COUNT} mentions</span>}
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
  const [showImportance, setShowImportance] = useState(false);

  const runPostSearch = useCallback(async (q) => {
    const query = (q || postQuery).trim();
    if (!query) return;
    setPostSearching(true);
    try {
      const res = await api.social.postSearch(query);
      setPostSearchResults(res);
    } catch (err) {
      console.error('Signal search error:', err);
      setPostSearchResults(null);
    } finally {
      setPostSearching(false);
    }
  }, [postQuery]);

  const clearPostSearch = () => {
    setPostQuery('');
    setPostSearchResults(null);
  };

  // Fetch all signal sources for dropdown filter
  const { data: influencerList } = useData(
    () => api.social.influencers(),
    [currentUser?.USERNAME]
  );
  const influencers = influencerList || [];

  // Refetch when user changes (VPD filters demand signals by region)
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
      <RegisterOraclePanel title="Retail Demand Sensing">
        <div className="space-y-4">
          <div>
            <p className="text-xs font-semibold text-[var(--color-text-dim)] uppercase tracking-wider mb-2">What's Happening</p>
            <p className="text-[var(--color-text)] leading-relaxed">
              The <span className="tone-teal font-mono">vector search bar</span> embeds your query at runtime using <span className="tone-teal font-mono">VECTOR_EMBEDDING(ALL_MINILM_L12_V2)</span> —
              an ONNX model loaded directly into Oracle. It then computes <span className="tone-sienna font-mono">VECTOR_DISTANCE(COSINE)</span> against{' '}
              <span className="tone-pine">650 pre-embedded product vectors</span> and returns the top matches via an <span className="tone-plum font-mono">ANN index</span>
              (approximate nearest neighbor). No external API, no Python, no microservice — the entire embedding + search pipeline runs inside the database.
              The visible feed currently shows <span className="tone-pine">{formatNumber(total)} demand signals</span> from the seeded retail-demand sample, with{' '}
              <span className="tone-sienna">semantic matches</span> that connect source activity to products, categories, and markets.
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
            <FeatureBadge label="signal_embeddings" color="orange" />
          </div>
          <SqlBlock code={`-- Real-time vector semantic search for sporting goods products
-- Embeds the demand-pattern query, then ranks the nearest product vectors
WITH ranked_products AS (
  SELECT p.product_id,
         p.product_name,
         p.category,
         p.unit_price,
         b.brand_name,
         VECTOR_DISTANCE(
           pe.embedding,
           VECTOR_EMBEDDING(
             ALL_MINILM_L12_V2
             USING 'trail running shoe demand' AS DATA
           ),
           COSINE
         ) AS distance
  FROM product_embeddings pe
  JOIN products p ON pe.product_id = p.product_id
  JOIN brands b ON p.brand_id = b.brand_id
)
SELECT product_id,
       product_name,
       category,
       unit_price,
       brand_name,
       ROUND(1 - distance, 4) AS similarity_score
FROM ranked_products
ORDER BY distance
FETCH FIRST 10 ROWS ONLY;`} />
          <div>
            <p className="text-[10px] font-semibold text-[var(--color-text-dim)] uppercase tracking-wider mb-2">Vector Search Pipeline</p>
            <div className="space-y-1.5">
              <DiagramBox label="User Query" sub="'trail running shoe demand'" color="#4F7D7B" />
              <div className="text-center text-[var(--color-text-dim)]">↓</div>
              <DiagramBox label="VECTOR_EMBEDDING" sub="ALL_MINILM_L12_V2 ONNX model · 384 dimensions" color="#4F7D7B" />
              <div className="text-center text-[var(--color-text-dim)]">↓</div>
              <DiagramBox label="VECTOR_DISTANCE(COSINE)" sub="Query vector vs 650 sporting goods product embeddings" color="#AA643B" />
              <div className="text-center text-[var(--color-text-dim)]">↓</div>
              <DiagramBox label="ANN Index Scan" sub="FETCH APPROXIMATE FIRST K ROWS · 95% accuracy" color="#796087" />
              <div className="text-center text-[var(--color-text-dim)]">↓</div>
              <DiagramBox label="Ranked Products" sub="Similarity score · brand or partner · price · signal mentions" color="#4C825C" />
            </div>
            <p className="text-[10px] font-semibold text-[var(--color-text-dim)] uppercase tracking-wider mb-2 mt-4">Embedding Tables</p>
            <div className="space-y-1.5">
              <DiagramBox label="product_embeddings" sub="650 sporting goods products · 384-dim VECTOR · COSINE ANN index" color="#AA643B" />
              <DiagramBox label="signal_embeddings" sub="visible demand-signal sample · 384-dim VECTOR · COSINE ANN index" color="#AA643B" />
              <DiagramBox label="semantic_matches" sub="demand signal-product matches · vector method" color="#796087" />
            </div>
          </div>
          <div>
            <p className="text-xs font-semibold text-[var(--color-text-dim)] uppercase tracking-wider mb-2">Virtual Private Database (VPD)</p>
            <p className="text-[var(--color-text)] leading-relaxed">
              <span className="tone-pine font-mono">DBMS_RLS</span> policies filter demand signals and source data
              based on the active user's role and region — applied transparently at the database kernel level.
              {currentUser?.ROLE === 'fulfillment_mgr' ? (
                <span className="tone-sienna"> Showing only demand signals from <strong>{currentUser.REGION}</strong> sources.</span>
              ) : (
                <span className="tone-pine"> Full access — all regions visible.</span>
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

      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <TrendingUp className="text-[var(--color-accent)]" /> Retail Demand Sensing
          </h2>
          <p className="text-sm text-[var(--color-text-dim)] mt-1">
            Detect emerging product demand across social, commerce, product-page, and store activity before planning cycles catch up.
          </p>
        </div>
        <ImportanceButton onClick={() => setShowImportance(true)} />
      </div>

      <ImportanceModal
        open={showImportance}
        onClose={() => setShowImportance(false)}
        content={IMPORTANCE_CONTENT.socialFeed}
      />

      {/* ── Vector Search ── */}
      <VectorSearch />

      <div className="flex items-center justify-between gap-3">
        <h3 className="text-base font-semibold text-[var(--color-text)]">Demand Signal Feed</h3>
      </div>

      {/* Filters */}
      <div className="jet-control-row">
        <Filter size={14} className="text-[var(--color-text-dim)]" />
        <JetSelectSingle
          value={momentum}
          className="jet-inline-field"
          placeholder="All Signal Intensity"
          onValueChange={(next) => { setMomentum(next); setPage(1); }}
          options={[
            { value: '', label: 'All Signal Intensity' },
            { value: 'mega_viral', label: 'Urgent' },
            { value: 'viral', label: 'High' },
            { value: 'rising', label: 'Emerging' },
            { value: 'normal', label: 'Baseline' },
          ]}
        />
        <JetSelectSingle
          value={platform}
          className="jet-inline-field"
          placeholder="All Signal Sources"
          onValueChange={(next) => { setPlatform(next); setPage(1); }}
          options={[
            { value: '', label: 'All Signal Sources' },
            { value: 'instagram', label: 'Social' },
            { value: 'tiktok', label: 'Product Pages' },
            { value: 'twitter', label: 'Commerce' },
            { value: 'youtube', label: 'Store Activity' },
            { value: 'threads', label: 'Partner Feed' },
          ]}
        />
        <JetSelectSingle
          value={influencer}
          className="jet-inline-field"
          placeholder="All Signal Feeds"
          onValueChange={(next) => { setInfluencer(next); setPage(1); }}
          options={[
            { value: '', label: 'All Signal Feeds' },
            ...influencers.map((i) => ({ value: i.HANDLE, label: i.HANDLE })),
          ]}
        />
        <div className="flex items-center gap-1 ml-2">
          <JetInputText
            value={postQuery}
            placeholder="Search demand signals by embedding..."
            className="jet-inline-field"
            onValueChange={setPostQuery}
          />
          <JetButton
            label={postSearching ? '...' : 'Go'}
            iconClass={postSearching ? 'oj-fwk-icon oj-fwk-icon-load' : 'oj-fwk-icon oj-fwk-icon-magnifier'}
            chroming="callToAction"
            disabled={postSearching || !postQuery.trim()}
            onAction={() => runPostSearch()}
          />
          {postSearchResults && (
            <JetButton
              label="Clear"
              iconClass="oj-fwk-icon oj-fwk-icon-cross"
              chroming="outlined"
              onAction={clearPostSearch}
            />
          )}
        </div>
        <span className="text-xs text-[var(--color-text-dim)] ml-auto">
          {postSearchResults
            ? <><span className="tone-teal">{postSearchResults.count}</span> matches · {postSearchResults.elapsed}ms</>
            : <>{formatNumber(total)} visible demand signals</>}
        </span>
      </div>

      {/* Demand signal feed — vector search results or normal feed */}
      {postSearchResults ? (
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-xs text-[var(--color-text-dim)]">
            <Sparkles size={12} className="tone-teal" />
            <span>Vector search results for "<span className="tone-teal">{postSearchResults.query}</span>"</span>
            <span className="font-mono text-[10px]">{postSearchResults.model} · {postSearchResults.dimensions}d · cosine</span>
          </div>
          {postSearchResults.posts?.length === 0 ? (
            <p className="text-sm text-[var(--color-text-dim)]">No matching demand signals found.</p>
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
                      <span className={`platform-badge platform-${p.PLATFORM}`}>{formatSourceChannel(p.PLATFORM)}</span>
                      <span className={`momentum-badge momentum-${p.MOMENTUM_FLAG}`}>
                        {formatSignalIntensity(p.MOMENTUM_FLAG)}
                      </span>
                      <span className="text-[11px] text-[var(--color-text-dim)]">{timeAgo(p.POSTED_AT)}</span>
                    </div>
                    {p.INFLUENCER_HANDLE && (
                      <p className="text-xs text-[var(--color-accent)] font-medium mb-1">
                        {p.INFLUENCER_HANDLE}
                        <span className="text-[var(--color-text-dim)] font-normal ml-2">
                          {formatNumber(p.FOLLOWER_COUNT)} audience reach · source influence {p.INFLUENCE_SCORE}
                        </span>
                      </p>
                    )}
                    <p className="text-sm leading-relaxed line-clamp-3">{p.POST_TEXT}</p>
                    <SignalContextChips post={p} />
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
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mt-3 pt-3 border-t border-[var(--color-border)]/30 text-[12px] text-[var(--color-text-dim)]">
                  <MetricStat icon={Heart} label="Engagement" value={p.LIKES_COUNT} />
                  <MetricStat icon={Share2} label="Amplification" value={p.SHARES_COUNT} />
                  <MetricStat icon={MessageCircle} label="Discussion" value={p.COMMENTS_COUNT} />
                  <MetricStat icon={Eye} label="Reach" value={p.VIEWS_COUNT} />
                  <SignalTone score={p.SENTIMENT_SCORE} />
                </div>
              </div>
            ))
          )}
        </div>
      ) : (
        <>
          {/* Normal demand signal feed */}
          <div className="space-y-3">
            {loading ? (
              <p className="text-sm text-[var(--color-text-dim)]">Loading demand signals...</p>
            ) : posts.length === 0 ? (
              <p className="text-sm text-[var(--color-text-dim)]">No demand signals found</p>
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
