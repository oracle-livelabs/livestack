import { useState, useCallback, useMemo } from 'react';
import { TrendingUp, Filter, Search, Flame, Eye, Share2, MessageCircle, Heart, Package, Sparkles, Loader2, DollarSign, X } from 'lucide-react';
// recharts removed - Platform Activity chart removed
import { api } from '../utils/api';
import { useData } from '../hooks/useData';
import { useUser } from '../context/UserContext';
import { formatNumber, formatCurrency, timeAgo, getPlatformClassName, getPlatformDisplayName, getSignalSourceDisplayName } from '../utils/format';
import { SceneStoryPanel } from '../components/EnergyUtilitiesStory';
import { FeatureBadge, SqlBlock, DiagramBox } from '../components/OracleInfoPanel';
import { RegisterOraclePanel } from '../context/OraclePanelContext';
import { JetButton, JetInputText, JetSelectSingle } from '../components/JetControls';

function SignalMetric({ icon: Icon, label, value }) {
  const formatted = formatNumber(value);
  return (
    <span
      className="flex items-center gap-1 whitespace-nowrap"
      title={label}
      aria-label={`${label} ${formatted}`}
    >
      <Icon size={12} />
      {label} {formatted}
    </span>
  );
}

const SIGNAL_CARD_ACTIONS = [
  { label: 'View related services', page: 'orders' },
  { label: 'Check logistics impact', page: 'fulfillment' },
  { label: 'Open operational event workflow graph', page: 'graph' },
  { label: 'Route compliance follow-up', page: 'agents' },
];

const ELEVATED_SIGNAL_FLAGS = new Set(['viral', 'mega_viral']);

const SIGNAL_CONCERN_LABELS = {
  'Reliability Signal': 'electric reliability, gas pressure, and water network anomalies',
  'Production Signal': 'well performance, refinery throughput, and LNG logistics concerns',
  'Compliance Signal': 'compliance confirmation requests',
  'Field Access Bulletin': 'field access constraint risks',
  'Capacity Alert': 'capacity escalation signals',
  'Supply Quality Notice': 'supply quality notices',
  'Regulatory Notice': 'regulatory review notices',
  'HSE and Emissions Notice': 'HSE and emissions follow-up risks',
};

const SIGNAL_NEXT_STEPS = {
  'Reliability Signal': 'Review reliability and network risk',
  'Production Signal': 'Review production and throughput constraints',
  'Compliance Signal': 'Route compliance follow-up',
  'Field Access Bulletin': 'Check logistics impact',
  'Capacity Alert': 'Review capacity plan',
  'Supply Quality Notice': 'Review affected services and supply alternatives',
  'Regulatory Notice': 'Route compliance follow-up',
  'HSE and Emissions Notice': 'Route HSE and emissions follow-up',
};

function SignalCardActions() {
  return (
    <div className="signal-card-actions" aria-label="utility operations actions">
      {SIGNAL_CARD_ACTIONS.map((action) => (
        <a
          key={action.label}
          className="btn-ghost signal-card-action"
          href={`?page=${action.page}`}
        >
          {action.label}
        </a>
      ))}
    </div>
  );
}

function getTopSignalType(signalRows, fallbackPlatform) {
  if (fallbackPlatform) {
    return getPlatformDisplayName(fallbackPlatform);
  }

  const counts = new Map();
  signalRows.forEach((signal) => {
    const type = getPlatformDisplayName(signal.PLATFORM);
    if (!type) return;
    counts.set(type, (counts.get(type) || 0) + 1);
  });

  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || 'Compliance Signal';
}

function getHighestImpactSource(signalRows, fallbackSource) {
  if (fallbackSource) {
    return getSignalSourceDisplayName(fallbackSource);
  }

  const topSignal = signalRows
    .filter((signal) => signal.INFLUENCER_HANDLE)
    .sort((a, b) => Number(b.FOLLOWER_COUNT || 0) - Number(a.FOLLOWER_COUNT || 0))[0];

  return topSignal
    ? getSignalSourceDisplayName(topSignal.INFLUENCER_HANDLE, topSignal.INFLUENCER_NAME)
    : 'Specialty field operations';
}

function SignalSummaryPanel({
  summary,
  total,
  posts,
  postSearchResults,
  viralPosts,
  momentum,
  platform,
  influencer,
}) {
  const summaryItems = useMemo(() => {
    const searchPosts = postSearchResults?.posts || [];
    const isSearchView = Boolean(postSearchResults);
    const visibleSignals = isSearchView ? searchPosts : posts;
    const hasFilters = Boolean(momentum || platform || influencer);
    const currentCount = isSearchView ? (postSearchResults?.count || searchPosts.length) : total;
    const indexedCount = summary?.POSTS_TOTAL ?? total;
    const visibleElevatedCount = visibleSignals.filter((signal) => ELEVATED_SIGNAL_FLAGS.has(signal.MOMENTUM_FLAG)).length;

    if (isSearchView && currentCount === 0) {
      return [
        { label: 'Indexed signals', value: '0 matched signals' },
        { label: 'Elevated / critical', value: '0 elevated or critical matches' },
        { label: 'Top concern', value: 'No matched concern yet' },
        { label: 'Highest impact source', value: 'No matched source yet' },
        { label: 'Recommended next step', value: 'Adjust query or review broader signal filters', tone: 'action' },
      ];
    }

    const topSignalType = getTopSignalType(visibleSignals, platform);
    const topConcern = SIGNAL_CONCERN_LABELS[topSignalType] || `${topSignalType.toLowerCase()} signals`;
    const highestImpactSource = getHighestImpactSource(visibleSignals, influencer);
    const nextStep = SIGNAL_NEXT_STEPS[topSignalType] || 'Review affected services and supply alternatives';

    let signalCount;
    if (isSearchView) {
      signalCount = `${formatNumber(currentCount)} matched signals`;
    } else if (hasFilters) {
      signalCount = `${formatNumber(currentCount)} signals in current filter`;
    } else {
      signalCount = `${formatNumber(indexedCount)} signals indexed`;
    }

    let elevatedCount;
    if (isSearchView) {
      elevatedCount = `${formatNumber(visibleElevatedCount)} elevated or critical matches`;
    } else if (momentum === 'mega_viral') {
      elevatedCount = `${formatNumber(total)} critical signals in current filter`;
    } else if (momentum === 'viral') {
      elevatedCount = `${formatNumber(total)} elevated signals in current filter`;
    } else if (hasFilters) {
      elevatedCount = `${formatNumber(visibleElevatedCount)} elevated or critical visible`;
    } else {
      elevatedCount = `${formatNumber(summary?.VIRAL_POSTS ?? viralPosts?.length ?? visibleElevatedCount)} elevated or critical signals`;
    }

    return [
      { label: 'Indexed signals', value: signalCount },
      { label: 'Elevated / critical', value: elevatedCount },
      { label: 'Top concern', value: topConcern },
      { label: 'Highest impact source', value: highestImpactSource },
      { label: 'Recommended next step', value: nextStep, tone: 'action' },
    ];
  }, [summary, total, posts, postSearchResults, viralPosts, momentum, platform, influencer]);

  return (
    <section className="glass-card border border-teal-soft signal-summary-panel" aria-labelledby="signal-summary-title">
      <div className="signal-summary-panel__header">
        <div>
          <h3 id="signal-summary-title" className="signal-summary-panel__title">Signal Summary</h3>
          <p className="signal-summary-panel__subtitle">What the current signal view indicates for utility operations.</p>
        </div>
        <span className="social-vector-search-panel__chip text-[var(--color-text)] border border-teal-soft font-mono">
          LIVE VIEW
        </span>
      </div>
      <dl className="signal-summary-panel__grid">
        {summaryItems.map((item) => (
          <div key={item.label} className="signal-summary-panel__item">
            <dt className="signal-summary-panel__label">{item.label}</dt>
            <dd className={`signal-summary-panel__value${item.tone === 'action' ? ' signal-summary-panel__value--action' : ''}`}>
              {item.value}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function PostCard({ post }) {
  const momentumClass = `momentum-${post.MOMENTUM_FLAG}`;
  return (
    <div className="glass-card p-4 fade-in">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1.5">
            <span className={getPlatformClassName(post.PLATFORM)}>{getPlatformDisplayName(post.PLATFORM)}</span>
            <span className={`momentum-badge ${momentumClass}`}>
              {post.MOMENTUM_FLAG === 'mega_viral' ? 'CRITICAL' :
               post.MOMENTUM_FLAG === 'viral' ? 'Elevated' :
               post.MOMENTUM_FLAG === 'rising' ? 'Rising' : 'Normal'}
            </span>
            <span className="text-[11px] text-[var(--color-text-dim)]">{timeAgo(post.POSTED_AT)}</span>
          </div>
          {post.INFLUENCER_HANDLE && (
            <p className="text-xs text-[var(--color-accent)] font-medium mb-1">
              {getSignalSourceDisplayName(post.INFLUENCER_HANDLE, post.INFLUENCER_NAME)}
              <span className="text-[var(--color-text-dim)] font-normal ml-2">
                {formatNumber(post.FOLLOWER_COUNT)} network impact · Match score {post.INFLUENCE_SCORE}
              </span>
            </p>
          )}
          <p className="text-sm leading-relaxed line-clamp-3">{post.POST_TEXT}</p>
        </div>
        {post.VIRALITY_SCORE && (
          <div className="flex-shrink-0 text-center">
            <div className="text-lg font-bold font-mono" style={{ color: post.VIRALITY_SCORE > 75 ? '#C74634' : post.VIRALITY_SCORE > 50 ? '#AA643B' : '#7A736E' }}>
              {post.VIRALITY_SCORE}
            </div>
            <div className="text-[9px] text-[var(--color-text-dim)] uppercase">Criticality</div>
          </div>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-3 pt-3 border-t border-[var(--color-border)]/30 text-[12px] text-[var(--color-text-dim)]">
        <SignalMetric icon={Heart} label="Related signals" value={post.LIKES_COUNT} />
        <SignalMetric icon={Share2} label="Affected services" value={post.SHARES_COUNT} />
        <SignalMetric icon={MessageCircle} label="Open follow-ups" value={post.COMMENTS_COUNT} />
        <SignalMetric icon={Eye} label="Matched records" value={post.VIEWS_COUNT} />
        {post.SENTIMENT_SCORE != null && (
          <span className="ml-auto whitespace-nowrap">
            Signal confidence: <span className={post.SENTIMENT_SCORE > 0.5 ? 'tone-pine' : post.SENTIMENT_SCORE > 0 ? 'tone-sienna' : 'tone-red'}>
              {post.SENTIMENT_SCORE.toFixed(2)}
            </span>
          </span>
        )}
      </div>
      <SignalCardActions />
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
    'SAIDI SAIFI feeder outage risk and storm readiness',
    'gas pipeline pressure variance and leak response SLA',
    'water pressure anomaly and recurring leak events',
    'wastewater discharge compliance threshold alert',
    'well production variance versus forecast',
    'refinery throughput constraint and emissions excursion',
    'LNG logistics delay and terminal capacity risk',
    'HSE incident trend and maintenance backlog',
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
      <div className="mb-4">
        <div className="flex items-center gap-2 flex-wrap">
          <Sparkles size={18} className="tone-teal social-vector-search-panel__spark" />
          <h3 className="social-vector-search-panel__title">Semantic Reliability, Production & Compliance Signal Search</h3>
          <span className="social-vector-search-panel__chip text-[var(--color-text)] border border-teal-soft font-mono">
            VECTOR_EMBEDDING · COSINE · ANN
          </span>
        </div>
        <p className="text-xs text-[var(--color-text-dim)] mt-2 leading-relaxed">
          Use natural language to find related electric reliability, gas pressure, water/wastewater compliance, oil & gas production, refinery, LNG, emissions, HSE, asset, customer, and maintenance signals across the Seer Energy & Utilities dataset.
        </p>
      </div>

      {/* Search Input */}
      <div className="jet-control-row mb-3">
        <JetInputText
          value={query}
          placeholder="Search for a utility service, supply constraint, capacity risk, or quality notice…"
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
              {results.length} services and supplies matched for "<span className="tone-teal">{meta?.query}</span>"
            </p>
            {meta && (
              <span className="text-[10px] text-[var(--color-text-dim)] font-mono">
                {meta.model} · {meta.dimensions}d · cosine
              </span>
            )}
          </div>
          {results.length === 0 ? (
            <p className="text-sm text-[var(--color-text-dim)]">No services or supplies matched the query vector.</p>
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
                  {/* Utility service info */}
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

  // Refetch when user changes (VPD filters signal bulletins by region)
  const { data: postsData, loading } = useData(
    () => api.social.posts({ momentum, platform, page, limit: 15, ...(influencer && { influencer }) }),
    [momentum, platform, influencer, page, currentUser?.USERNAME]
  );
  const { data: viralPosts } = useData(() => api.social.viral(48), [currentUser?.USERNAME]);
  const { data: summary } = useData(() => api.dashboard.summary(), [currentUser?.USERNAME]);

  const posts = postsData?.posts || [];
  const total = postsData?.total || 0;

  return (
    <div className="space-y-6 fade-in">

      {/* Register Oracle Internals into the right panel */}
      <RegisterOraclePanel title="Reliability, Production & Compliance Signals">
        <div className="space-y-4">
          <div>
            <p className="text-xs font-semibold text-[var(--color-text-dim)] uppercase tracking-wider mb-2">What's Happening</p>
            <p className="text-[var(--color-text)] leading-relaxed">
              The <span className="tone-teal font-mono">vector search bar</span> embeds your query at runtime using <span className="tone-teal font-mono">VECTOR_EMBEDDING(ALL_MINILM_L12_V2)</span> -
              an ONNX model loaded directly into Oracle. It then computes <span className="tone-sienna font-mono">VECTOR_DISTANCE(COSINE)</span> against{' '}
              <span className="tone-pine">187 pre-embedded service and supply vectors</span> and returns the top matches via an <span className="tone-plum font-mono">ANN index</span>
              (approximate nearest neighbor). No external API, no Python, no microservice - the entire embedding + search pipeline runs inside the database.
              The signal feed below uses <span className="tone-red font-mono">momentum scoring</span> across 5,000 reliability, production, compliance, emissions, HSE, regulatory, partner, and capacity bulletins with{' '}
              <span className="tone-pine">5,000 bulletin embeddings</span> and <span className="tone-sienna">574 semantic matches</span>.
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
            <FeatureBadge label="Utility-Service Embeddings" color="orange" />
            <FeatureBadge label="Signal Embeddings" color="orange" />
          </div>
          <SqlBlock code={`-- Real-time vector semantic search for utility services and supplies
-- Physical table product_embeddings is retained for compatibility.
-- Embeds user query at runtime, then finds nearest
-- service and supply vectors via ANN index (cosine distance)
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
              <DiagramBox label="User Query" sub="'field coordination kit for critical load pilot'" color="#4F7D7B" />
              <div className="text-center text-[var(--color-text-dim)]">↓</div>
              <DiagramBox label="VECTOR_EMBEDDING" sub="ALL_MINILM_L12_V2 ONNX model · 384 dimensions" color="#4F7D7B" />
              <div className="text-center text-[var(--color-text-dim)]">↓</div>
              <DiagramBox label="VECTOR_DISTANCE(COSINE)" sub="Query vector vs 187 utility-service embeddings" color="#AA643B" />
              <div className="text-center text-[var(--color-text-dim)]">↓</div>
              <DiagramBox label="ANN Index Scan" sub="FETCH APPROXIMATE FIRST K ROWS · 95% accuracy" color="#796087" />
              <div className="text-center text-[var(--color-text-dim)]">↓</div>
              <DiagramBox label="Ranked Services and Supplies" sub="Similarity score · partner · operational value · signal mentions" color="#4C825C" />
            </div>
            <p className="text-[10px] font-semibold text-[var(--color-text-dim)] uppercase tracking-wider mb-2 mt-4">Embedding Tables</p>
            <div className="space-y-1.5">
              <DiagramBox label="Utility-service embeddings" sub="physical product_embeddings · 187 utility services · 384-dim VECTOR · COSINE ANN index" color="#AA643B" />
              <DiagramBox label="Signal embeddings" sub="physical post_embeddings · 5,000 signal bulletins · 384-dim VECTOR · COSINE ANN index" color="#AA643B" />
              <DiagramBox label="Semantic matches" sub="physical semantic_matches · 574 bulletin-service matches · vector method" color="#796087" />
            </div>
          </div>
          <div>
            <p className="text-xs font-semibold text-[var(--color-text-dim)] uppercase tracking-wider mb-2">Virtual Private Database (VPD)</p>
            <p className="text-[var(--color-text)] leading-relaxed">
              <span className="tone-pine font-mono">DBMS_RLS</span> policies filter bulletins and source data
              based on the active user's role and region - applied transparently at the database kernel level.
              {currentUser?.ROLE === 'fulfillment_mgr' ? (
                <span className="tone-sienna"> Showing only bulletins from <strong>{currentUser.REGION}</strong> sources.</span>
              ) : (
                <span className="tone-pine"> Full access - all regions visible.</span>
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
          <TrendingUp className="text-[var(--color-accent)]" /> Reliability, Production & Compliance Signal Intelligence
        </h2>
        <p className="text-sm text-[var(--color-text-dim)] mt-1">
          Oracle Vector Search with ONNX embeddings for semantic matching across electric reliability, gas pipeline integrity, water/wastewater compliance, upstream production, midstream logistics, downstream operations, HSE, emissions, and operational momentum detection.
        </p>
      </div>

      <SceneStoryPanel scene="social" />

      {/* ── Vector Search ── */}
      <VectorSearch />

      <SignalSummaryPanel
        summary={summary}
        total={total}
        posts={posts}
        postSearchResults={postSearchResults}
        viralPosts={viralPosts}
        momentum={momentum}
        platform={platform}
        influencer={influencer}
      />

      {/* Filters */}
      <div className="jet-control-row">
        <Filter size={14} className="text-[var(--color-text-dim)]" />
        <JetSelectSingle
          value={momentum}
          className="jet-inline-field"
          placeholder="Momentum"
          ariaLabel="Momentum filter"
          onValueChange={(next) => { setMomentum(next); setPage(1); }}
          options={[
            { value: '', label: 'Momentum' },
            { value: 'mega_viral', label: 'Critical' },
            { value: 'viral', label: 'Elevated' },
            { value: 'rising', label: 'Rising' },
            { value: 'normal', label: 'Normal' },
          ]}
        />
        <JetSelectSingle
          value={platform}
          className="jet-inline-field"
          placeholder="Signal Type"
          ariaLabel="Signal type filter"
          onValueChange={(next) => { setPlatform(next); setPage(1); }}
          options={[
            { value: '', label: 'Signal Type' },
            { value: 'Reliability Signal', label: 'Reliability Signal' },
            { value: 'Production Signal', label: 'Production Signal' },
            { value: 'Supply Quality Notice', label: 'Supply Quality Notice' },
            { value: 'Compliance Signal', label: 'Compliance Signal' },
            { value: 'Field Access Bulletin', label: 'Field Access Bulletin' },
            { value: 'Regulatory Notice', label: 'Regulatory Notice' },
            { value: 'Capacity Alert', label: 'Capacity Alert' },
            { value: 'HSE and Emissions Notice', label: 'HSE and Emissions Notice' },
          ]}
        />
        <JetSelectSingle
          value={influencer}
          className="jet-inline-field"
          placeholder="Utility Operator / Partner"
          ariaLabel="Utility operator or partner filter"
          onValueChange={(next) => { setInfluencer(next); setPage(1); }}
          options={[
            { value: '', label: 'Utility Operator / Partner' },
            ...influencers.map((i) => ({ value: i.HANDLE, label: getSignalSourceDisplayName(i.HANDLE) })),
          ]}
        />
        <div className="flex items-center gap-1 ml-2">
          <JetInputText
            value={postQuery}
            placeholder="Search within matched signals…"
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
            : <>{formatNumber(total)} bulletins</>}
        </span>
      </div>

      <div className="mb-2">
        <h3 className="text-sm font-semibold text-[var(--color-text)]">
          Matched Reliability, Production &amp; Compliance Signals
        </h3>
        <p className="text-xs text-[var(--color-text-dim)] leading-snug">
          Ranked by semantic similarity, operational momentum, signal confidence, compliance exposure, production impact, and network impact.
        </p>
      </div>

      {/* Signal feed - vector search results or normal feed */}
      {postSearchResults ? (
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-xs text-[var(--color-text-dim)]">
            <Sparkles size={12} className="tone-teal" />
            <span>Vector search results for "<span className="tone-teal">{postSearchResults.query}</span>"</span>
            <span className="font-mono text-[10px]">{postSearchResults.model} · {postSearchResults.dimensions}d · cosine</span>
          </div>
          {postSearchResults.posts?.length === 0 ? (
            <p className="text-sm text-[var(--color-text-dim)]">No matching bulletins found.</p>
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
                      <span className={getPlatformClassName(p.PLATFORM)}>{getPlatformDisplayName(p.PLATFORM)}</span>
                      <span className={`momentum-badge momentum-${p.MOMENTUM_FLAG}`}>
                        {p.MOMENTUM_FLAG === 'mega_viral' ? 'CRITICAL' :
                         p.MOMENTUM_FLAG === 'viral' ? 'Elevated' :
                         p.MOMENTUM_FLAG === 'rising' ? 'Rising' : 'Normal'}
                      </span>
                      <span className="text-[11px] text-[var(--color-text-dim)]">{timeAgo(p.POSTED_AT)}</span>
                    </div>
                    {p.INFLUENCER_HANDLE && (
                      <p className="text-xs text-[var(--color-accent)] font-medium mb-1">
                        {getSignalSourceDisplayName(p.INFLUENCER_HANDLE, p.INFLUENCER_NAME)}
                        <span className="text-[var(--color-text-dim)] font-normal ml-2">
                          {formatNumber(p.FOLLOWER_COUNT)} network impact · Match score {p.INFLUENCE_SCORE}
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
                      <div className="text-[8px] text-[var(--color-text-dim)]">match score</div>
                    </div>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-3 pt-3 border-t border-[var(--color-border)]/30 text-[12px] text-[var(--color-text-dim)]">
                  <SignalMetric icon={Heart} label="Related signals" value={p.LIKES_COUNT} />
                  <SignalMetric icon={Share2} label="Affected services" value={p.SHARES_COUNT} />
                  <SignalMetric icon={MessageCircle} label="Open follow-ups" value={p.COMMENTS_COUNT} />
                  <SignalMetric icon={Eye} label="Matched records" value={p.VIEWS_COUNT} />
                  {p.SENTIMENT_SCORE != null && (
                    <span className="ml-auto whitespace-nowrap">
                      Signal confidence: <span className={p.SENTIMENT_SCORE > 0.5 ? 'tone-pine' : p.SENTIMENT_SCORE > 0 ? 'tone-sienna' : 'tone-red'}>
                        {p.SENTIMENT_SCORE.toFixed(2)}
                      </span>
                    </span>
                  )}
                </div>
                <SignalCardActions />
              </div>
            ))
          )}
        </div>
      ) : (
        <>
          {/* Normal signal feed */}
          <div className="space-y-3">
            {loading ? (
              <p className="text-sm text-[var(--color-text-dim)]">Loading bulletins...</p>
            ) : posts.length === 0 ? (
              <p className="text-sm text-[var(--color-text-dim)]">No bulletins found</p>
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
