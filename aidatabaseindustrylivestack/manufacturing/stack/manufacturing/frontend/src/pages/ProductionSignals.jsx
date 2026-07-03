import { useState, useCallback } from 'react';
import { TrendingUp, Filter, Search, Flame, Eye, Share2, MessageCircle, Heart, Package, Sparkles, Loader2, DollarSign, X } from 'lucide-react';
// recharts removed - Platform Activity chart removed
import { api } from '../utils/api';
import { useData } from '../hooks/useData';
import { useUser } from '../context/UserContext';
import { formatNumber, formatCurrency, formatScore, timeAgo } from '../utils/format';
import { FeatureBadge, SqlBlock, DiagramBox } from '../components/OracleInfoPanel';
import { RegisterOraclePanel } from '../context/OraclePanelContext';
import { JetButton, JetInputText, JetSelectSingle } from '../components/JetControls';
import { SceneStoryPanel } from '../components/ManufacturingStory';
import { DefinitionRow, MetricDefinition } from '../components/MetricDefinition';

const SIGNAL_CHANNEL_LABELS = {
  supplier_portal: 'Supplier portal',
  plant_floor: 'Plant floor alert',
  market_feed: 'Market demand feed',
  quality_bulletin: 'Quality bulletin',
  partner_operations: 'Partner operations feed',
};

const URGENCY_LABELS = {
  critical: 'Critical',
  escalating: 'Escalating',
  elevated: 'Elevated',
  stable: 'Stable',
};

const SIGNAL_METRIC_DEFINITIONS = [
  { label: 'Reach', description: 'signal-source audience or account exposure', scale: 'count' },
  { label: 'Urgency', description: 'production signal activity, amplification, and capacity relevance', scale: '0-100' },
  { label: 'Sentiment', description: 'text sentiment from negative to positive', scale: '-1 to +1' },
];

function signalChannelLabel(channel) {
  const key = String(channel || '').toLowerCase();
  return SIGNAL_CHANNEL_LABELS[key] || channel || 'Signal channel';
}

function urgencyLabel(flag) {
  return URGENCY_LABELS[flag] || 'Stable';
}

function liveCountLabel(value, label) {
  const count = Number(value);
  return Number.isFinite(count) ? `${count.toLocaleString()} ${label}` : `${label} count unavailable`;
}

function SignalCard({ signal }) {
  const momentumClass = `momentum-${signal.MOMENTUM_CODE}`;
  return (
    <div className="glass-card p-4 fade-in">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1.5">
            <span className={`signal-channel-badge signal-channel-${signal.SIGNAL_CHANNEL_CODE}`}>{signalChannelLabel(signal.SIGNAL_CHANNEL_CODE)}</span>
            <span className={`momentum-badge ${momentumClass}`}>
              {urgencyLabel(signal.MOMENTUM_CODE)}
            </span>
            <span className="text-[11px] text-[var(--color-text-dim)]">{timeAgo(signal.OBSERVED_AT)}</span>
          </div>
          {signal.NETWORK_ACCOUNT_HANDLE && (
            <p className="text-xs text-[var(--color-accent)] font-medium mb-1">
              {signal.NETWORK_ACCOUNT_HANDLE}
              <span className="text-[var(--color-text-dim)] font-normal ml-2">
                <strong className="text-[var(--color-text)]">{formatNumber(signal.NETWORK_ACCOUNT_REACH)}</strong> reach
              </span>
            </p>
          )}
          <p className="text-sm leading-relaxed line-clamp-3">{signal.SIGNAL_TEXT}</p>
        </div>
        {signal.URGENCY_SCORE != null && (
          <div className="flex-shrink-0 text-center">
            <div className="text-lg font-bold font-mono" style={{ color: signal.URGENCY_SCORE > 75 ? '#C74634' : signal.URGENCY_SCORE > 50 ? '#AA643B' : '#7A736E' }}>
              {formatScore(signal.URGENCY_SCORE)} / 100
            </div>
            <div className="text-[9px] text-[var(--color-text-dim)] uppercase">Urgency</div>
          </div>
        )}
      </div>
      <div className="flex items-center gap-4 mt-3 pt-3 border-t border-[var(--color-border)]/30 text-[12px] text-[var(--color-text-dim)]">
        <span className="flex items-center gap-1"><Heart size={12} /> {formatNumber(signal.ACKNOWLEDGEMENT_COUNT)}</span>
        <span className="flex items-center gap-1"><Share2 size={12} /> {formatNumber(signal.PROPAGATION_COUNT)}</span>
        <span className="flex items-center gap-1"><MessageCircle size={12} /> {formatNumber(signal.RESPONSE_COUNT)}</span>
        <span className="flex items-center gap-1"><Eye size={12} /> {formatNumber(signal.OBSERVATION_COUNT)}</span>
        {signal.SENTIMENT_SCORE != null && (
          <span className="ml-auto">
            Sentiment: <span className={signal.SENTIMENT_SCORE > 0.5 ? 'tone-pine' : signal.SENTIMENT_SCORE > 0 ? 'tone-sienna' : 'tone-red'}>
              <strong>{signal.SENTIMENT_SCORE.toFixed(2)}</strong>
            </span>
          </span>
        )}
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
    'servo drive controller capacity',
    'vision inspection station bottleneck',
    'supplier delay for industrial automation parts',
    'line changeover scheduling',
    'line utilization beacon demand',
    'bearing and seal maintenance kits',
  ];

  const runSearch = useCallback(async (searchQuery) => {
    const q = searchQuery || query;
    if (!q.trim()) return;
    setSearching(true);
    setError(null);
    try {
      const data = await api.productionSignals.search(q.trim(), 8);
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
    <div className="glass-card p-5 border border-teal-soft production-signal-vector-search-panel">
      <div className="flex items-center gap-2 mb-4">
        <Sparkles size={18} className="tone-teal production-signal-vector-search-panel__spark" />
        <h3 className="production-signal-vector-search-panel__title">Manufactured Part Vector Search</h3>
        <span className="production-signal-vector-search-panel__chip text-[var(--color-text)] border border-teal-soft font-mono">
          VECTOR_EMBEDDING · COSINE · ANN
        </span>
      </div>

      {/* Search Input */}
      <div className="jet-control-row mb-3">
        <JetInputText
          value={query}
          placeholder="Describe a manufacturing signal... (e.g. 'servo controller shortage')"
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
          <span className="production-signal-vector-search-panel__helper-label mr-1">Try:</span>
          {EXAMPLE_QUERIES.map(eq => (
            <JetButton
              key={eq}
              label={eq}
              chroming="outlined"
              className="production-signal-vector-search-panel__example-button"
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
              {results.length} manufactured parts matched for "<span className="tone-teal">{meta?.query}</span>"
            </p>
            {meta && (
              <span className="text-[10px] text-[var(--color-text-dim)] font-mono">
                {meta.model} · {meta.dimensions}d · cosine
              </span>
            )}
          </div>
          {results.length === 0 ? (
            <p className="text-sm text-[var(--color-text-dim)]">No manufactured parts matched the query vector.</p>
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
                      {r.SIGNAL_COUNT > 0 && <span className="tone-sienna ml-1">· {r.SIGNAL_COUNT} signals</span>}
                    </p>
                  </div>
                  {/* Price */}
                  <div className="text-right flex-shrink-0">
                    <div className="text-sm font-mono font-bold">{formatCurrency(r.UNIT_PRICE)}</div>
                    <div className="text-[8px] text-[var(--color-text-dim)] uppercase" title="Manufactured-part value or cost proxy from the product record">
                      Unit value proxy
                    </div>
                  </div>
                  {/* Similarity */}
                  <div className="flex-shrink-0 w-16">
                    <div className="text-right text-xs font-mono font-bold" style={{ color: simColor(r.SIMILARITY_SCORE) }}>
                      {(r.SIMILARITY_SCORE * 100).toFixed(1)}%
                    </div>
                    <div className="text-right text-[8px] text-[var(--color-text-dim)] uppercase" title="Vector similarity between the query and manufactured-part embedding">
                      Match
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

export default function ProductionSignals() {
  const { currentUser } = useUser();
  const [momentum, setMomentum] = useState('');
  const [channel, setChannel] = useState('');
  const [networkAccount, setNetworkAccount] = useState('');
  const [page, setPage] = useState(1);
  const [signalQuery, setSignalQuery] = useState('');
  const [signalSearchResults, setSignalSearchResults] = useState(null);
  const [signalSearching, setSignalSearching] = useState(false);

  const runSignalSearch = useCallback(async (q) => {
    const query = (q || signalQuery).trim();
    if (!query) return;
    setSignalSearching(true);
    try {
      const res = await api.productionSignals.signalSearch(query);
      setSignalSearchResults(res);
    } catch (err) {
      console.error('Signal search error:', err);
      setSignalSearchResults(null);
    } finally {
      setSignalSearching(false);
    }
  }, [signalQuery]);

  const clearSignalSearch = () => {
    setSignalQuery('');
    setSignalSearchResults(null);
  };

  // Fetch source accounts for the governed signal filter.
  const { data: networkAccountList } = useData(
    () => api.productionSignals.networkAccounts(),
    [currentUser?.USERNAME]
  );
  const networkAccounts = networkAccountList || [];

  // Refetch when user changes (VPD filters production signals by region)
  const { data: signalsData, loading } = useData(
    () => api.productionSignals.list({ momentum, channel, page, limit: 15, ...(networkAccount && { networkAccount }) }),
    [momentum, channel, networkAccount, page, currentUser?.USERNAME]
  );
  const { data: featureStatus } = useData(() => api.demo.status(), [currentUser?.USERNAME]);

  const signals = signalsData?.signals || [];
  const total = signalsData?.total || 0;
  const productVectorEvidence = liveCountLabel(featureStatus?.product_embeddings, 'manufactured part vectors');
  const signalVectorEvidence = liveCountLabel(
    featureStatus?.manufacturing_signal_embeddings,
    'production signal vectors'
  );
  const semanticMatchEvidence = liveCountLabel(featureStatus?.manufacturing_signal_part_matches, 'semantic matches');

  return (
    <div className="space-y-6 fade-in">

      {/* Register Oracle Internals into the right panel */}
      <RegisterOraclePanel title="Production Signal Monitor">
        <div className="space-y-4">
          <div>
            <p className="text-xs font-semibold text-[var(--color-text-dim)] uppercase tracking-wider mb-2">What's Happening</p>
            <p className="text-[var(--color-text)] leading-relaxed">
              The <span className="tone-teal font-mono">vector search bar</span> embeds your query at runtime using <span className="tone-teal font-mono">VECTOR_EMBEDDING(ALL_MINILM_L12_V2)</span> -
              an ONNX model loaded directly into Oracle. It then computes <span className="tone-sienna font-mono">VECTOR_DISTANCE(COSINE)</span> against{' '}
              <span className="tone-pine">pre-embedded manufactured part vectors</span> and returns the top matches via an <span className="tone-plum font-mono">IVF neighbor-partition index</span>
              (approximate nearest neighbor). No external API, no Python, no microservice - the entire embedding + search pipeline runs inside the database.
              The deployed database currently reports <span className="tone-pine">{productVectorEvidence}</span>,{' '}
              <span className="tone-pine">{signalVectorEvidence}</span>, and <span className="tone-sienna">{semanticMatchEvidence}</span>.
            </p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <FeatureBadge label="VECTOR_EMBEDDING (ONNX)" color="cyan" />
            <FeatureBadge label="VECTOR_DISTANCE(COSINE)" color="cyan" />
            <FeatureBadge label="ANN Index (IVF Neighbor Partitions)" color="purple" />
            <FeatureBadge label="ALL_MINILM_L12_V2" color="green" />
            <FeatureBadge label="384-dim Vectors" color="blue" />
            <FeatureBadge label="FETCH APPROXIMATE" color="yellow" />
            <FeatureBadge label="Momentum Scoring" color="red" />
            <FeatureBadge label="Manufactured Part Vectors" color="orange" />
            <FeatureBadge label="Production Signal Vectors" color="orange" />
          </div>
          <SqlBlock code={`-- Real-time vector semantic search for manufactured parts
-- Embeds user query at runtime, then finds nearest
-- manufactured part vectors via ANN index (cosine distance)
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
              <DiagramBox label="User Query" sub="'servo controller shortage'" color="#4F7D7B" />
              <div className="text-center text-[var(--color-text-dim)]">↓</div>
              <DiagramBox label="VECTOR_EMBEDDING" sub="ALL_MINILM_L12_V2 ONNX model · 384 dimensions" color="#4F7D7B" />
              <div className="text-center text-[var(--color-text-dim)]">↓</div>
              <DiagramBox label="VECTOR_DISTANCE(COSINE)" sub={`Query vector vs ${productVectorEvidence}`} color="#AA643B" />
              <div className="text-center text-[var(--color-text-dim)]">↓</div>
              <DiagramBox label="IVF Neighbor-Partition Scan" sub="FETCH APPROXIMATE FIRST K ROWS" color="#796087" />
              <div className="text-center text-[var(--color-text-dim)]">↓</div>
              <DiagramBox label="Ranked Manufactured Parts" sub="Similarity score · product line · cost · production signals" color="#4C825C" />
            </div>
            <p className="text-[10px] font-semibold text-[var(--color-text-dim)] uppercase tracking-wider mb-2 mt-4">Embedding Tables</p>
            <div className="space-y-1.5">
              <DiagramBox label="Manufactured Part Vectors" sub={`${productVectorEvidence} · 384-dim VECTOR · COSINE IVF index`} color="#AA643B" />
              <DiagramBox label="Production Signal Vectors" sub={`${signalVectorEvidence} · 384-dim VECTOR · COSINE IVF index`} color="#AA643B" />
              <DiagramBox label="manufacturing_signal_part_matches" sub={`${semanticMatchEvidence} · vector method`} color="#796087" />
            </div>
          </div>
          <div>
            <p className="text-xs font-semibold text-[var(--color-text-dim)] uppercase tracking-wider mb-2">Virtual Private Database (VPD)</p>
            <p className="text-[var(--color-text)] leading-relaxed">
              <span className="tone-pine font-mono">DBMS_RLS</span> policies filter production signal and network account data
              based on the active user's role and region - applied transparently at the database kernel level.
              {currentUser?.ROLE === 'fulfillment_mgr' ? (
                <span className="tone-sienna"> Showing only manufacturing signals from <strong>{currentUser.REGION}</strong> network accounts.</span>
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
          <TrendingUp className="text-[var(--color-accent)]" /> Production Signal Monitor
        </h2>
        <p className="text-sm text-[var(--color-text-dim)] mt-1">
          <span className="tone-teal">Oracle Vector Search</span> connects AX-400 supplier, telemetry, quality, and demand signals to the manufactured parts they affect.
        </p>
      </div>

      <SceneStoryPanel scene="production-signals" />

      {/* ── Vector Search ── */}
      <VectorSearch />

      <div className="glass-card p-3 space-y-2">
        <DefinitionRow items={SIGNAL_METRIC_DEFINITIONS} />
        <div className="metric-definition-row">
          <MetricDefinition label="Unit value proxy">
            Product unit_price from the manufactured-part record, used as a value or cost proxy.
          </MetricDefinition>
          <MetricDefinition label="Match" scale="%">
            Vector similarity between the search text and manufactured-part or signal embedding.
          </MetricDefinition>
        </div>
      </div>

      {/* Filters */}
      <div className="jet-control-row">
        <Filter size={14} className="text-[var(--color-text-dim)]" />
        <JetSelectSingle
          value={momentum}
          className="jet-inline-field"
          placeholder="All urgency bands"
          onValueChange={(next) => { setMomentum(next); setPage(1); }}
          options={[
            { value: '', label: 'All urgency bands' },
            { value: 'critical', label: 'Critical' },
            { value: 'escalating', label: 'Escalating' },
            { value: 'elevated', label: 'Elevated' },
            { value: 'stable', label: 'Stable' },
          ]}
        />
        <JetSelectSingle
          value={channel}
          className="jet-inline-field"
          placeholder="All signal channels"
          onValueChange={(next) => { setChannel(next); setPage(1); }}
          options={[
            { value: '', label: 'All signal channels' },
            { value: 'supplier_portal', label: 'Supplier portal' },
            { value: 'plant_floor', label: 'Plant floor alert' },
            { value: 'market_feed', label: 'Market demand feed' },
            { value: 'quality_bulletin', label: 'Quality bulletin' },
            { value: 'partner_operations', label: 'Partner operations feed' },
          ]}
        />
        <JetSelectSingle
          value={networkAccount}
          className="jet-inline-field"
          placeholder="All Supplier Networks"
          onValueChange={(next) => { setNetworkAccount(next); setPage(1); }}
          options={[
            { value: '', label: 'All Supplier Networks' },
            ...networkAccounts.map((account) => ({ value: account.HANDLE, label: account.HANDLE })),
          ]}
        />
        <div className="flex items-center gap-1 ml-2">
          <JetInputText
            value={signalQuery}
            placeholder="Search signals by embedding..."
            className="jet-inline-field"
            onValueChange={setSignalQuery}
          />
          <JetButton
            label={signalSearching ? '...' : 'Go'}
            iconClass={signalSearching ? 'oj-fwk-icon oj-fwk-icon-load' : 'oj-fwk-icon oj-fwk-icon-magnifier'}
            chroming="callToAction"
            disabled={signalSearching || !signalQuery.trim()}
            onAction={() => runSignalSearch()}
          />
          {signalSearchResults && (
            <JetButton
              label="Clear"
              iconClass="oj-fwk-icon oj-fwk-icon-cross"
              chroming="outlined"
              onAction={clearSignalSearch}
            />
          )}
        </div>
        <span className="text-xs text-[var(--color-text-dim)] ml-auto">
          {signalSearchResults
            ? <><span className="tone-teal">{signalSearchResults.count}</span> matches · {signalSearchResults.elapsed}ms</>
            : <>{formatNumber(total)} signals</>}
        </span>
      </div>

      {/* Production Signal Feed - vector search results or normal feed */}
      {signalSearchResults ? (
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-xs text-[var(--color-text-dim)]">
            <Sparkles size={12} className="tone-teal" />
            <span>Vector search results for "<span className="tone-teal">{signalSearchResults.query}</span>"</span>
            <span className="font-mono text-[10px]">{signalSearchResults.model} · {signalSearchResults.dimensions}d · cosine</span>
          </div>
          {signalSearchResults.signals?.length === 0 ? (
            <p className="text-sm text-[var(--color-text-dim)]">No matching signals found.</p>
          ) : (
            signalSearchResults.signals.map((p, idx) => (
              <div key={p.PRODUCTION_SIGNAL_ID} className="glass-card p-4 fade-in">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className="flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded"
                        style={{ background: `${simColor(p.SIMILARITY_SCORE)}22`, color: simColor(p.SIMILARITY_SCORE), border: `1px solid ${simColor(p.SIMILARITY_SCORE)}44` }}>
                        #{idx + 1} · {(p.SIMILARITY_SCORE * 100).toFixed(1)}%
                      </span>
                      <span className={`signal-channel-badge signal-channel-${p.SIGNAL_CHANNEL_CODE}`}>{signalChannelLabel(p.SIGNAL_CHANNEL_CODE)}</span>
                      <span className={`momentum-badge momentum-${p.MOMENTUM_CODE}`}>
                        {urgencyLabel(p.MOMENTUM_CODE)}
                      </span>
                      <span className="text-[11px] text-[var(--color-text-dim)]">{timeAgo(p.OBSERVED_AT)}</span>
                    </div>
                    {p.NETWORK_ACCOUNT_HANDLE && (
                      <p className="text-xs text-[var(--color-accent)] font-medium mb-1">
                        {p.NETWORK_ACCOUNT_HANDLE}
                        <span className="text-[var(--color-text-dim)] font-normal ml-2">
                          <strong className="text-[var(--color-text)]">{formatNumber(p.NETWORK_ACCOUNT_REACH)}</strong> reach
                        </span>
                      </p>
                    )}
                    <p className="text-sm leading-relaxed line-clamp-3">{p.SIGNAL_TEXT}</p>
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
                  <span className="flex items-center gap-1"><Heart size={12} /> {formatNumber(p.ACKNOWLEDGEMENT_COUNT)}</span>
                  <span className="flex items-center gap-1"><Share2 size={12} /> {formatNumber(p.PROPAGATION_COUNT)}</span>
                  <span className="flex items-center gap-1"><MessageCircle size={12} /> {formatNumber(p.RESPONSE_COUNT)}</span>
                  <span className="flex items-center gap-1"><Eye size={12} /> {formatNumber(p.OBSERVATION_COUNT)}</span>
                  {p.SENTIMENT_SCORE != null && (
                    <span className="ml-auto">
                      Sentiment: <span className={p.SENTIMENT_SCORE > 0.5 ? 'tone-pine' : p.SENTIMENT_SCORE > 0 ? 'tone-sienna' : 'tone-red'}>
                        <strong>{p.SENTIMENT_SCORE.toFixed(2)}</strong>
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
          {/* Production Signal Feed */}
          <div className="space-y-3">
            {loading ? (
              <p className="text-sm text-[var(--color-text-dim)]">Loading signals...</p>
            ) : signals.length === 0 ? (
              <p className="text-sm text-[var(--color-text-dim)]">No signals found</p>
            ) : (
              signals.map((signal) => <SignalCard key={signal.PRODUCTION_SIGNAL_ID} signal={signal} />)
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
