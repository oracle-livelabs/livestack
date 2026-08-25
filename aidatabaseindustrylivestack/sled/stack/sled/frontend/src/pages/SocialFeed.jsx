import { useState, useCallback, useMemo } from 'react';
import { TrendingUp, Filter, Search, Flame, Eye, Share2, MessageCircle, Package, Sparkles, Loader2, DollarSign, X } from 'lucide-react';
// recharts removed - Platform Activity chart removed
import { api } from '../utils/api';
import { useData } from '../hooks/useData';
import { formatRegionLabel, useUser } from '../context/UserContext';
import { formatNumber, formatCurrency, timeAgo } from '../utils/format';
import { FeatureBadge, SqlBlock, DiagramBox } from '../components/OracleInfoPanel';
import { RegisterOraclePanel } from '../context/OraclePanelContext';
import { JetButton, JetInputText, JetSelectSingle } from '../components/JetControls';
import { SceneStoryPanel } from '../components/StateLocalGovernmentStory';

const SOURCE_CHANNEL_LABELS = {
  instagram: 'Resident portal',
  tiktok: 'Mobile service app',
  twitter: '311 contact center',
  youtube: 'Public meeting record',
  threads: 'Interagency queue',
  twitch: 'Emergency operations desk',
};

const ELEVATED_SIGNAL_FLAGS = new Set(['critical', 'escalating']);

const SIGNAL_CONCERN_LABELS = {
  'Resident portal': 'resident digital-service access and intake friction',
  'Mobile service app': 'mobile service completion and appointment follow-through',
  '311 contact center': 'contact center backlog, public works, and service request escalation',
  'Public meeting record': 'public meeting follow-up, records requests, and transparency commitments',
  'Interagency queue': 'handoffs across agencies, programs, and community partners',
  'Emergency operations desk': 'emergency response, shelter intake, and public safety coordination',
};

const SIGNAL_NEXT_STEPS = {
  'Resident portal': 'Review resident experience and affected public services',
  'Mobile service app': 'Check access barriers and appointment capacity',
  '311 contact center': 'Route service backlog and public works follow-up',
  'Public meeting record': 'Verify records, accessibility, and policy evidence',
  'Interagency queue': 'Trace the community partner workflow',
  'Emergency operations desk': 'Escalate emergency response coordination',
};

const RESIDENT_SIGNAL_ACTIONS = [
  { label: 'Open service requests', page: 'orders' },
  { label: 'Explore partner path', page: 'graph' },
  { label: 'Check capacity risk', page: 'oml' },
  { label: 'Route agency action', page: 'agents' },
];

function getSignalTrendLabel(flag) {
  switch (String(flag || '').toLowerCase()) {
    case 'critical': return 'Critical';
    case 'escalating': return 'Escalating';
    case 'rising': return 'Rising';
    case 'normal': return 'Normal';
    default: return 'Normal';
  }
}

function getSignalPriorityClass(flag) {
  switch (String(flag || '').toLowerCase()) {
    case 'critical':
      return 'priority-critical';
    case 'escalating':
      return 'priority-escalating';
    case 'rising':
      return 'priority-rising';
    default:
      return 'priority-normal';
  }
}

function getChannelClass(channel) {
  return `source-${String(channel || 'source')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')}`;
}

function getSourceChannelLabel(channel) {
  return SOURCE_CHANNEL_LABELS[String(channel || '').toLowerCase()] || String(channel || 'Agency source').replace(/_/g, ' ');
}

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

function ResidentSignalActions() {
  return (
    <div className="signal-card-actions" aria-label="resident signal actions">
      {RESIDENT_SIGNAL_ACTIONS.map((action) => (
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

function getTopSignalChannel(signalRows, fallbackChannel) {
  if (fallbackChannel) return getSourceChannelLabel(fallbackChannel);

  const counts = new Map();
  signalRows.forEach((signal) => {
    const type = getSourceChannelLabel(signal.SOURCE_CHANNEL);
    if (!type) return;
    counts.set(type, (counts.get(type) || 0) + 1);
  });

  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || 'Agency source';
}

function getHighestImpactPartner(signalRows, fallbackPartner) {
  if (fallbackPartner) return fallbackPartner;

  const topSignal = signalRows
    .filter((signal) => signal.PARTNER_HANDLE)
    .sort((a, b) => Number(b.COMMUNITY_REACH || 0) - Number(a.COMMUNITY_REACH || 0))[0];

  return topSignal?.PARTNER_HANDLE || 'Agency and community partners';
}

function ResidentSignalSummaryPanel({
  total,
  posts,
  searchedSignals,
  postSearchResults,
  viralSignals,
  momentum,
  platform,
  influencer,
}) {
  const summaryItems = useMemo(() => {
    const isSearchView = Boolean(postSearchResults);
    const visibleSignals = isSearchView ? searchedSignals : posts;
    const hasFilters = Boolean(momentum || platform || influencer);
    const currentCount = isSearchView ? (postSearchResults?.count || searchedSignals.length) : total;
    const visibleElevatedCount = visibleSignals.filter((signal) => ELEVATED_SIGNAL_FLAGS.has(String(signal.PRIORITY_FLAG || '').toLowerCase())).length;

    if (isSearchView && currentCount === 0) {
      return [
        { label: 'Visible signals', value: '0 matched signals' },
        { label: 'Critical / escalating', value: '0 matched signals' },
        { label: 'Top concern', value: 'No matched concern yet' },
        { label: 'Highest reach partner', value: 'No matched partner yet' },
        { label: 'Recommended next step', value: 'Adjust the query or review broader demand filters', tone: 'action' },
      ];
    }

    const topChannel = getTopSignalChannel(visibleSignals, platform);
    const topConcern = SIGNAL_CONCERN_LABELS[topChannel] || `${topChannel.toLowerCase()} signals`;
    const highestImpactPartner = getHighestImpactPartner(visibleSignals, influencer);
    const nextStep = SIGNAL_NEXT_STEPS[topChannel] || 'Review affected services and capacity risk';
    const elevatedTotal = Array.isArray(viralSignals) ? viralSignals.length : visibleElevatedCount;

    let signalCount;
    if (isSearchView) {
      signalCount = `${formatNumber(currentCount)} matched signals`;
    } else if (hasFilters) {
      signalCount = `${formatNumber(currentCount)} signals in current filter`;
    } else {
      signalCount = `${formatNumber(total)} resident signals indexed`;
    }

    let elevatedCount;
    if (isSearchView || hasFilters) {
      elevatedCount = `${formatNumber(visibleElevatedCount)} critical or escalating visible`;
    } else {
      elevatedCount = `${formatNumber(elevatedTotal)} critical or escalating signals`;
    }

    return [
      { label: 'Visible signals', value: signalCount },
      { label: 'Critical / escalating', value: elevatedCount },
      { label: 'Top concern', value: topConcern },
      { label: 'Highest reach partner', value: highestImpactPartner },
      { label: 'Recommended next step', value: nextStep, tone: 'action' },
    ];
  }, [total, posts, searchedSignals, postSearchResults, viralSignals, momentum, platform, influencer]);

  return (
    <section className="glass-card border border-teal-soft signal-summary-panel" aria-labelledby="resident-signal-summary-title">
      <div className="signal-summary-panel__header">
        <div>
          <h3 id="resident-signal-summary-title" className="signal-summary-panel__title">Resident Signal Summary</h3>
          <p className="signal-summary-panel__subtitle">What the current demand view indicates for public service operations.</p>
        </div>
        <span className="signal-vector-search-panel__chip text-[var(--color-text)] border border-teal-soft font-mono">
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
  const priorityFlag = post.PRIORITY_FLAG;
  const momentumClass = getSignalPriorityClass(priorityFlag);
  const sourceChannel = post.SOURCE_CHANNEL || 'Agency source';
  const sourceChannelLabel = getSourceChannelLabel(sourceChannel);
  const signalAt = post.SIGNAL_AT;
  const partnerHandle = post.PARTNER_HANDLE;
  const communityReach = post.COMMUNITY_REACH;
  const authorityScore = post.AUTHORITY_SCORE;
  const priorityScore = post.PRIORITY_SCORE;
  const signalText = post.SIGNAL_TEXT;
  return (
    <div className="glass-card p-4 fade-in">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1.5">
            <span className={`source-badge ${getChannelClass(sourceChannelLabel)}`}>{sourceChannelLabel}</span>
            <span className={`priority-badge ${momentumClass}`}>
              {getSignalTrendLabel(priorityFlag)}
            </span>
            <span className="text-[11px] text-[var(--color-text-dim)]">{timeAgo(signalAt)}</span>
          </div>
          {partnerHandle && (
            <p className="text-xs text-[var(--color-accent)] font-medium mb-1">
              {partnerHandle}
              <span className="text-[var(--color-text-dim)] font-normal ml-2">
                {formatNumber(communityReach)} community reach · Authority {authorityScore}
              </span>
            </p>
          )}
          <p className="text-sm leading-relaxed line-clamp-3">{signalText}</p>
        </div>
        {priorityScore && (
          <div className="flex-shrink-0 text-center">
            <div className="text-lg font-bold font-mono" style={{ color: priorityScore > 75 ? '#C74634' : priorityScore > 50 ? '#AA643B' : '#7A736E' }}>
              {priorityScore}
            </div>
            <div className="text-[9px] text-[var(--color-text-dim)] uppercase">Priority</div>
          </div>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-3 pt-3 border-t border-[var(--color-border)]/30 text-[12px] text-[var(--color-text-dim)]">
        <SignalMetric icon={TrendingUp} label="Acknowledgements" value={post.ACKNOWLEDGEMENTS_COUNT} />
        <SignalMetric icon={Share2} label="Agency handoffs" value={post.HANDOFFS_COUNT} />
        <SignalMetric icon={MessageCircle} label="Open follow-ups" value={post.COMMENTS_COUNT} />
        <SignalMetric icon={Eye} label="Matched records" value={post.REACH_COUNT} />
        {post.SENTIMENT_SCORE != null && (
          <span className="ml-auto whitespace-nowrap">
            Sentiment: <span className={post.SENTIMENT_SCORE > 0.5 ? 'tone-pine' : post.SENTIMENT_SCORE > 0 ? 'tone-sienna' : 'tone-red'}>
              {post.SENTIMENT_SCORE.toFixed(2)}
            </span>
          </span>
        )}
      </div>
      <ResidentSignalActions />
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
    'benefits eligibility appointment backlog',
    'business license inspection delay',
    'public works road repair request',
    'emergency shelter intake coordination',
    'records request accessibility issue',
    'permit review status escalation',
  ];

  const runSearch = useCallback(async (searchQuery) => {
    const q = searchQuery || query;
    if (!q.trim()) return;
    setSearching(true);
    setError(null);
    try {
      const data = await api.residentSignals.search(q.trim(), 8);
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
    <div className="glass-card p-5 border border-teal-soft signal-vector-search-panel">
      <div className="flex items-center gap-2 mb-4">
        <Sparkles size={18} className="tone-teal signal-vector-search-panel__spark" />
        <h3 className="signal-vector-search-panel__title">Public Service Vector Search</h3>
        <span className="signal-vector-search-panel__chip text-[var(--color-text)] border border-teal-soft font-mono">
          VECTOR_EMBEDDING · COSINE · ANN
        </span>
      </div>

      {/* Search Input */}
      <div className="jet-control-row mb-3">
        <JetInputText
          value={query}
          placeholder="Describe the service signal to match..."
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
          <span className="signal-vector-search-panel__helper-label mr-1">Try:</span>
          {EXAMPLE_QUERIES.map(eq => (
            <JetButton
              key={eq}
              label={eq}
              chroming="outlined"
              className="signal-vector-search-panel__example-button"
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
              {results.length} public services matched for "<span className="tone-teal">{meta?.query}</span>"
            </p>
            {meta && (
              <span className="text-[10px] text-[var(--color-text-dim)] font-mono">
                {meta.model} · {meta.dimensions}d · cosine
              </span>
            )}
          </div>
          {results.length === 0 ? (
            <p className="text-sm text-[var(--color-text-dim)]">No public services matched the query vector.</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {results.map((r, i) => (
                <div
                  key={r.SERVICE_ID}
                  className="flex items-center gap-3 p-3 rounded-lg border border-[var(--color-border)]/40 bg-[var(--color-bg)]/50 hover:border-teal-soft transition-colors"
                >
                  {/* Rank badge */}
                  <div className="flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold"
                    style={{ background: `${simColor(r.SIMILARITY_SCORE)}22`, color: simColor(r.SIMILARITY_SCORE), border: `1px solid ${simColor(r.SIMILARITY_SCORE)}44` }}>
                    {i + 1}
                  </div>
                  {/* Public service info */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{r.SERVICE_NAME}</p>
                    <p className="text-[11px] text-[var(--color-text-dim)]">
                      {r.AGENCY_OR_PROGRAM} · {r.CATEGORY}
                      {r.SIGNAL_MATCH_COUNT > 0 && (
                        <span className="tone-sienna ml-1">· {r.SIGNAL_MATCH_COUNT} signal matches</span>
                      )}
                    </p>
                  </div>
                  {/* Service value */}
                  <div className="text-right flex-shrink-0">
                    <div className="text-sm font-mono">{formatCurrency(r.ESTIMATED_SERVICE_VALUE)}</div>
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
  const { currentUser, accessScope } = useUser();
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
      const res = await api.residentSignals.signalSearch(query);
      setPostSearchResults(res);
    } catch (err) {
      console.error('Resident signal search error:', err);
      setPostSearchResults(null);
    } finally {
      setPostSearching(false);
    }
  }, [postQuery]);

  const clearPostSearch = () => {
    setPostQuery('');
    setPostSearchResults(null);
  };

  // Fetch all community partners for dropdown filter
  const { data: influencerList } = useData(
    () => api.residentSignals.influencers(),
    [currentUser?.USERNAME]
  );
  const influencers = influencerList || [];

  // Refetch when user changes (VPD filters resident signals by region)
  const { data: postsData, loading } = useData(
    () => api.residentSignals.posts({ momentum, sourceChannel: platform, page, limit: 15, ...(influencer && { partner: influencer }) }),
    [momentum, platform, influencer, page, currentUser?.USERNAME]
  );
  const { data: viralPosts } = useData(() => api.residentSignals.prioritySignals(48), [currentUser?.USERNAME]);

  const posts = postsData?.signals || [];
  const total = postsData?.total || 0;
  const searchedSignals = postSearchResults?.signals || [];

  return (
    <div className="space-y-6 fade-in">
      {/* Register Oracle Internals into the right panel */}
      <RegisterOraclePanel title="Resident Demand Signals">
        <div className="space-y-4">
          <div>
            <p className="text-xs font-semibold text-[var(--color-text-dim)] uppercase tracking-wider mb-2">What's Happening</p>
            <p className="text-[var(--color-text)] leading-relaxed">
              The <span className="tone-teal font-mono">vector search bar</span> embeds a resident question at runtime using <span className="tone-teal font-mono">VECTOR_EMBEDDING(ALL_MINILM_L12_V2)</span> -
              an ONNX model loaded directly into Oracle. It then computes <span className="tone-sienna font-mono">VECTOR_DISTANCE(COSINE)</span> against{' '}
              <span className="tone-pine">pre-embedded public service vectors</span> and returns the top matches via an <span className="tone-plum font-mono">ANN index</span>
              (approximate nearest neighbor). No external API, no Python, no microservice - the entire embedding + search pipeline runs inside the database.
              The resident signal feed below uses <span className="tone-red font-mono">priority scoring</span> across 5,000 resident service signals with{' '}
              <span className="tone-pine">5,000 signal embeddings</span> and <span className="tone-sienna">574 semantic matches</span>.
            </p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <FeatureBadge label="VECTOR_EMBEDDING (ONNX)" color="cyan" />
            <FeatureBadge label="VECTOR_DISTANCE(COSINE)" color="cyan" />
            <FeatureBadge label="ANN Index (HNSW)" color="purple" />
            <FeatureBadge label="ALL_MINILM_L12_V2" color="green" />
            <FeatureBadge label="384-dim Vectors" color="blue" />
            <FeatureBadge label="FETCH APPROXIMATE" color="yellow" />
            <FeatureBadge label="Priority Scoring" color="red" />
            <FeatureBadge label="service_vectors" color="orange" />
            <FeatureBadge label="resident_signal_vectors" color="orange" />
          </div>
          <SqlBlock code={`-- Real-time vector semantic search for public services
-- Embeds the resident question at runtime, then finds the nearest
-- service vectors via ANN index (cosine distance)
SELECT s.service_id,
       s.service_name,
       s.service_category,
       s.service_value_proxy AS estimated_service_value,
       s.program_name AS agency_or_program,
       ROUND(1 - VECTOR_DISTANCE(
         pe.embedding,
         VECTOR_EMBEDDING(ALL_MINILM_L12_V2
                          USING 'permit inspection status escalation' AS DATA),
         COSINE), 4)          AS similarity_score
FROM   sled_public_services_v s
JOIN   product_embeddings pe
  ON   pe.product_id = s.service_id
ORDER  BY VECTOR_DISTANCE(
  pe.embedding,
  VECTOR_EMBEDDING(ALL_MINILM_L12_V2
                   USING 'permit inspection status escalation' AS DATA),
  COSINE)
FETCH APPROXIMATE FIRST 10 ROWS ONLY;`} />
          <div>
            <p className="text-[10px] font-semibold text-[var(--color-text-dim)] uppercase tracking-wider mb-2">Vector Search Pipeline</p>
            <div className="space-y-1.5">
              <DiagramBox label="User Query" sub="'permit inspection status escalation'" color="#4F7D7B" />
              <div className="text-center text-[var(--color-text-dim)]">↓</div>
              <DiagramBox label="VECTOR_EMBEDDING" sub="ALL_MINILM_L12_V2 ONNX model · 384 dimensions" color="#4F7D7B" />
              <div className="text-center text-[var(--color-text-dim)]">↓</div>
              <DiagramBox label="VECTOR_DISTANCE(COSINE)" sub="Query vector vs 187 service vectors" color="#AA643B" />
              <div className="text-center text-[var(--color-text-dim)]">↓</div>
              <DiagramBox label="ANN Index Scan" sub="FETCH APPROXIMATE FIRST K ROWS · 95% accuracy" color="#796087" />
              <div className="text-center text-[var(--color-text-dim)]">↓</div>
              <DiagramBox label="Ranked Public Services" sub="Similarity score · public program · service value · resident signals" color="#4C825C" />
            </div>
            <p className="text-[10px] font-semibold text-[var(--color-text-dim)] uppercase tracking-wider mb-2 mt-4">Embedding Tables</p>
            <div className="space-y-1.5">
              <DiagramBox label="service_vectors" sub="State and Local Government services · 384-dim VECTOR · COSINE ANN index" color="#AA643B" />
              <DiagramBox label="resident_signal_vectors" sub="5,000 resident service signals · 384-dim VECTOR · COSINE ANN index" color="#AA643B" />
              <DiagramBox label="semantic_matches" sub="574 pre-computed signal-to-service matches · vector method" color="#796087" />
            </div>
          </div>
          <div>
            <p className="text-xs font-semibold text-[var(--color-text-dim)] uppercase tracking-wider mb-2">Virtual Private Database (VPD)</p>
            <p className="text-[var(--color-text)] leading-relaxed">
              <span className="tone-pine font-mono">DBMS_RLS</span> policies filter resident signals and community source data
              based on the active user's role and region - applied transparently at the database kernel level.{' '}
              <span className="tone-sienna font-mono">SLED_SECURITY_PKG</span> validates the username, while policy
              functions read <span className="tone-sienna font-mono">SLED_APP_CTX</span> only through{' '}
              <span className="tone-sienna font-mono">SYS_CONTEXT</span> and deny access when context is missing.
              {accessScope === 'REGIONAL' ? (
                <span className="tone-sienna"> Showing only State and Local Government signals from <strong>{formatRegionLabel(currentUser.REGION)}</strong> community sources.</span>
              ) : accessScope === 'GLOBAL' ? (
                <span className="tone-pine"> Global VPD access covers every Colorado service region.</span>
              ) : (
                <span className="tone-ocean"> Restricted VPD access returns no protected operational rows.</span>
              )}
            </p>
            <div className="flex flex-wrap gap-1.5 mt-2">
              <FeatureBadge label="DBMS_RLS" color="green" />
              <FeatureBadge label="Row-Level Security" color="green" />
              <FeatureBadge label="Region Filtering" color="blue" />
              <FeatureBadge label="SLED_SECURITY_PKG / SLED_APP_CTX" color="yellow" />
            </div>
          </div>
        </div>
      </RegisterOraclePanel>

      <div>
        <h2 className="text-2xl font-bold flex items-center gap-2">
          <TrendingUp className="text-[var(--color-accent)]" /> Resident Demand Signals
        </h2>
        <p className="text-sm text-[var(--color-text-dim)] mt-1">
          <span className="tone-teal">Oracle Vector Search</span> with ONNX embeddings · semantic public service matching · priority detection
        </p>
      </div>

      <SceneStoryPanel scene="social" />

      {/* ── Vector Search ── */}
      <VectorSearch />

      <ResidentSignalSummaryPanel
        total={total}
        posts={posts}
        searchedSignals={searchedSignals}
        postSearchResults={postSearchResults}
        viralSignals={viralPosts}
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
          placeholder="All Priority"
          onValueChange={(next) => { setMomentum(next); setPage(1); }}
          options={[
            { value: '', label: 'All Priority' },
            { value: 'critical', label: 'Critical' },
            { value: 'escalating', label: 'Escalating' },
            { value: 'rising', label: 'Rising' },
            { value: 'normal', label: 'Normal' },
          ]}
        />
        <JetSelectSingle
          value={platform}
          className="jet-inline-field"
          placeholder="All Source Channels"
          onValueChange={(next) => { setPlatform(next); setPage(1); }}
          options={[
            { value: '', label: 'All Source Channels' },
            { value: 'instagram', label: 'Resident portal' },
            { value: 'tiktok', label: 'Mobile service app' },
            { value: 'twitter', label: '311 contact center' },
            { value: 'youtube', label: 'Public meeting record' },
            { value: 'threads', label: 'Interagency queue' },
          ]}
        />
        <JetSelectSingle
          value={influencer}
          className="jet-inline-field"
          placeholder="All Community Partners"
          onValueChange={(next) => { setInfluencer(next); setPage(1); }}
          options={[
            { value: '', label: 'All Community Partners' },
            ...influencers.map((i) => ({ value: i.HANDLE || i.PARTNER_HANDLE, label: i.HANDLE || i.PARTNER_HANDLE })),
          ]}
        />
        <div className="flex items-center gap-1 ml-2">
          <JetInputText
            value={postQuery}
            placeholder="Search resident signals by embedding..."
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
            : <>{formatNumber(total)} signals</>}
        </span>
      </div>

      {/* Resident signal feed - vector search results or normal feed */}
      {postSearchResults ? (
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-xs text-[var(--color-text-dim)]">
            <Sparkles size={12} className="tone-teal" />
            <span>Vector search results for "<span className="tone-teal">{postSearchResults.query}</span>"</span>
            <span className="font-mono text-[10px]">{postSearchResults.model} · {postSearchResults.dimensions}d · cosine</span>
          </div>
          {searchedSignals.length === 0 ? (
            <p className="text-sm text-[var(--color-text-dim)]">No matching resident signals found.</p>
          ) : (
            searchedSignals.map((p, idx) => {
              const priorityFlag = p.PRIORITY_FLAG;
              const sourceChannel = p.SOURCE_CHANNEL || 'Agency source';
              const sourceChannelLabel = getSourceChannelLabel(sourceChannel);
              const partnerHandle = p.PARTNER_HANDLE;
              const communityReach = p.COMMUNITY_REACH;
              const authorityScore = p.AUTHORITY_SCORE;
              const signalAt = p.SIGNAL_AT;
              const signalText = p.SIGNAL_TEXT;
              return (
              <div key={p.SIGNAL_ID || idx} className="glass-card p-4 fade-in">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className="flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded"
                        style={{ background: `${simColor(p.SIMILARITY_SCORE)}22`, color: simColor(p.SIMILARITY_SCORE), border: `1px solid ${simColor(p.SIMILARITY_SCORE)}44` }}>
                        #{idx + 1} · {(p.SIMILARITY_SCORE * 100).toFixed(1)}%
                      </span>
                      <span className={`source-badge ${getChannelClass(sourceChannelLabel)}`}>{sourceChannelLabel}</span>
                      <span className={`priority-badge ${getSignalPriorityClass(priorityFlag)}`}>
                        {getSignalTrendLabel(priorityFlag)}
                      </span>
                      <span className="text-[11px] text-[var(--color-text-dim)]">{timeAgo(signalAt)}</span>
                    </div>
                    {partnerHandle && (
                      <p className="text-xs text-[var(--color-accent)] font-medium mb-1">
                        {partnerHandle}
                        <span className="text-[var(--color-text-dim)] font-normal ml-2">
                          {formatNumber(communityReach)} community reach · Authority {authorityScore}
                        </span>
                      </p>
                    )}
                    <p className="text-sm leading-relaxed line-clamp-3">{signalText}</p>
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
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-3 pt-3 border-t border-[var(--color-border)]/30 text-[12px] text-[var(--color-text-dim)]">
                  <SignalMetric icon={TrendingUp} label="Acknowledgements" value={p.ACKNOWLEDGEMENTS_COUNT} />
                  <SignalMetric icon={Share2} label="Agency handoffs" value={p.HANDOFFS_COUNT} />
                  <SignalMetric icon={MessageCircle} label="Open follow-ups" value={p.COMMENTS_COUNT} />
                  <SignalMetric icon={Eye} label="Matched records" value={p.REACH_COUNT} />
                  {p.SENTIMENT_SCORE != null && (
                    <span className="ml-auto whitespace-nowrap">
                      Sentiment: <span className={p.SENTIMENT_SCORE > 0.5 ? 'tone-pine' : p.SENTIMENT_SCORE > 0 ? 'tone-sienna' : 'tone-red'}>
                        {p.SENTIMENT_SCORE.toFixed(2)}
                      </span>
                    </span>
                  )}
                </div>
                <ResidentSignalActions />
              </div>
              );
            })
          )}
        </div>
      ) : (
        <>
          {/* Normal resident signal feed */}
          <div className="space-y-3">
            {loading ? (
              <p className="text-sm text-[var(--color-text-dim)]">Loading resident signals...</p>
            ) : posts.length === 0 ? (
              <p className="text-sm text-[var(--color-text-dim)]">No resident signals found</p>
            ) : (
              posts.map((p, i) => <PostCard key={p.SIGNAL_ID || i} post={p} />)
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
