import { useState, useCallback, useEffect, useRef } from 'react';
import { TrendingUp, Filter, Search, Flame, Eye, Share2, MessageCircle, Heart, Package, Sparkles, Loader2, DollarSign, X } from 'lucide-react';
// recharts removed - Platform Activity chart removed
import { api } from '../utils/api';
import { useData } from '../hooks/useData';
import { useUser } from '../context/UserContext';
import { formatNumber, formatCurrency, timeAgo, getPlatformColor } from '../utils/format';
import { vpdScopePresentation } from '../utils/vpdScope';
import { FeatureBadge, SqlBlock, DiagramBox } from '../components/OracleInfoPanel';
import { RegisterOraclePanel } from '../context/OraclePanelContext';
import { RetailSceneStory } from '../components/RetailStory';
import { JetButton, JetInputText, JetSelectSingle } from '../components/JetControls';

function PostCard({ post }) {
  const momentumClass = `momentum-${post.MOMENTUM_FLAG}`;
  return (
    <div className="glass-card p-4 fade-in">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1.5">
            <span className={`platform-badge platform-${post.PLATFORM}`}>{post.PLATFORM}</span>
            <span className={`momentum-badge ${momentumClass}`}>
              {post.MOMENTUM_FLAG === 'mega_viral' ? '🔥 MEGA SIGNAL' :
               post.MOMENTUM_FLAG === 'viral' ? '🔥 Spike' :
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
            <div className="text-lg font-bold font-mono" style={{ color: post.VIRALITY_SCORE > 75 ? '#C74634' : post.VIRALITY_SCORE > 50 ? '#AA643B' : '#7A736E' }}>
              {post.VIRALITY_SCORE}
            </div>
            <div className="text-[9px] text-[var(--color-text-dim)] uppercase">Momentum</div>
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
            Sentiment: <span className={post.SENTIMENT_SCORE > 0.5 ? 'tone-pine' : post.SENTIMENT_SCORE > 0 ? 'tone-sienna' : 'tone-red'}>
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
  if (score >= 0.7) return '#4C825C';
  if (score >= 0.5) return '#AA643B';
  if (score >= 0.3) return '#437C94';
  return '#7A736E';
}

function isExactVectorPlanProof(
  proof,
  expectedIndex = 'IDX_PRODUCT_VEC',
  expectedObject = 'PRODUCT_EMBEDDINGS'
) {
  const planHashValue = Number(proof?.planHashValue);
  const resultRowCount = Number(proof?.resultRowCount);
  return /^[0-9a-z]{13}$/.test(String(proof?.sqlId || ''))
    && proof?.childNumber !== null
    && proof?.childNumber !== undefined
    && Number.isInteger(Number(proof.childNumber))
    && Number.isInteger(planHashValue)
    && planHashValue > 0
    && Number.isInteger(resultRowCount)
    && resultRowCount > 0
    && proof?.indexName === expectedIndex
    && proof?.objectName === expectedObject
    && String(proof?.operation || '').includes('VECTOR INDEX');
}

// ── Vector Search Section ─────────────────────────────────────────────────────
function VectorSearch({ generationKey }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState(null);
  const [meta, setMeta] = useState(null);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState(null);
  const requestGeneration = useRef(0);

  useEffect(() => {
    requestGeneration.current += 1;
    setQuery('');
    setResults(null);
    setMeta(null);
    setError(null);
    setSearching(false);
  }, [generationKey]);

  const EXAMPLE_QUERIES = [
    'waterproof hiking boots for spring trails',
    'AllTerrain Hiking Boots sizing and trail grip',
    'trail running shoes lightweight breathable',
    'carbon road bike accessories',
    'home gym strength training equipment',
    'camping gear for weekend trips',
  ];

  const runSearch = useCallback(async (searchQuery) => {
    const q = searchQuery || query;
    if (!q.trim()) return;
    setSearching(true);
    setError(null);
    const requestId = ++requestGeneration.current;
    try {
      const data = await api.social.search(q.trim(), 8);
      if (requestId !== requestGeneration.current) return;
      if (!isExactVectorPlanProof(data.proof)) {
        throw new Error('Exact Oracle Vector execution proof is unavailable.');
      }
      setResults(data.results || []);
      setMeta({
        model: data.model,
        dimensions: data.dimensions,
        query: data.query,
        proof: data.proof,
        source: data.source,
      });
    } catch (err) {
      if (requestId !== requestGeneration.current) return;
      setError(err.message);
      setResults([]);
    } finally {
      if (requestId === requestGeneration.current) setSearching(false);
    }
  }, [query]);

  return (
    <div className="glass-card p-5 border border-teal-soft social-vector-search-panel">
      <div className="flex items-center gap-2 mb-2">
        <Sparkles size={18} className="tone-teal social-vector-search-panel__spark" />
        <h3 className="social-vector-search-panel__title">Semantic Product Discovery</h3>
        <span className="social-vector-search-panel__chip text-[var(--color-text)] border border-teal-soft font-mono">
          VECTOR_EMBEDDING · COSINE · LIVE PROOF AFTER SEARCH
        </span>
      </div>
      <p className="text-sm text-[var(--color-text-dim)] mb-4">
        Understand shopper intent using AI-powered semantic search and product similarity.
      </p>

      {/* Search Input */}
      <div className="jet-control-row mb-3">
        <JetInputText
          value={query}
          placeholder="Describe a sporting-goods need, trail activity, product signal, or return pattern..."
          className="jet-inline-field"
          onValueChange={setQuery}
        />
        <JetButton
          label={searching ? 'Searching...' : 'Search'}
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
                {meta.source || 'ORACLE_VECTOR_SEARCH'} · {meta.model} · {meta.dimensions}d · cosine
                {meta.proof?.operation ? ` · ${meta.proof.operation}` : ''}
                {meta.proof?.sqlId ? ` · SQL ${meta.proof.sqlId}/${meta.proof.childNumber ?? '?'}` : ''}
                {meta.proof?.planHashValue ? ` · plan hash ${meta.proof.planHashValue}` : ''}
                {meta.proof?.indexName || meta.proof?.objectName
                  ? ` · ${meta.proof.indexName || meta.proof.objectName}`
                  : ''}
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
  const vpdAccess = vpdScopePresentation(currentUser);
  const [momentum, setMomentum] = useState('');
  const [platform, setPlatform] = useState('');
  const [influencer, setInfluencer] = useState('');
  const [page, setPage] = useState(1);
  const [postQuery, setPostQuery] = useState('');
  const [postSearchResults, setPostSearchResults] = useState(null);
  const [postSearching, setPostSearching] = useState(false);
  const [datasetRevision, setDatasetRevision] = useState(0);
  const postRequestGeneration = useRef(0);
  const generationKey = `${currentUser?.USERNAME || 'anonymous'}:${datasetRevision}`;

  useEffect(() => {
    const reset = () => {
      postRequestGeneration.current += 1;
      setPostQuery('');
      setPostSearchResults(null);
      setPostSearching(false);
      setPage(1);
      setDatasetRevision((value) => value + 1);
    };
    window.addEventListener('retail-dataset-revision', reset);
    return () => window.removeEventListener('retail-dataset-revision', reset);
  }, []);

  useEffect(() => {
    postRequestGeneration.current += 1;
    setPostQuery('');
    setPostSearchResults(null);
    setPostSearching(false);
    setPage(1);
  }, [currentUser?.USERNAME]);

  const runPostSearch = useCallback(async (q) => {
    const query = (q || postQuery).trim();
    if (!query) return;
    setPostSearching(true);
    const requestId = ++postRequestGeneration.current;
    try {
      const res = await api.social.postSearch(query);
      if (requestId !== postRequestGeneration.current) return;
      if (!isExactVectorPlanProof(
        res.proof,
        'IDX_POST_VEC',
        'POST_EMBEDDINGS'
      )) {
        throw new Error('Exact Oracle post Vector execution proof is unavailable.');
      }
      setPostSearchResults(res);
    } catch (err) {
      if (requestId !== postRequestGeneration.current) return;
      console.error('Post search error:', err);
      setPostSearchResults(null);
    } finally {
      if (requestId === postRequestGeneration.current) setPostSearching(false);
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
  const {
    data: vectorReadiness,
    error: vectorReadinessError,
  } = useData(
    () => api.social.vectorReadiness(),
    [currentUser?.USERNAME, datasetRevision]
  );
  const vectorCounts = vectorReadiness?.counts || {};
  const vectorScopedEmpty = vectorReadiness?.scope?.status
    === 'SCOPED_NO_VISIBLE_VECTOR_DATA';
  const vectorGlobalAnchor = vectorReadiness?.scope?.globalAnchor || null;
  const vectorPlanEvidence = vectorReadiness?.planEvidence || null;
  const vectorGlobalPlan = vectorGlobalAnchor?.currentPlan || null;
  const vectorEvidenceReady = vectorScopedEmpty
    ? isExactVectorPlanProof(vectorGlobalPlan)
    : isExactVectorPlanProof(vectorPlanEvidence);
  const vectorReadinessUnavailable = Boolean(vectorReadinessError)
    || Boolean(vectorReadiness && !vectorEvidenceReady);

  const posts = postsData?.posts || [];
  const total = postsData?.total || 0;

  return (
    <div className="space-y-6 fade-in">

      {/* Register Oracle Internals into the right panel */}
      <RegisterOraclePanel title="Customer Trend Signals">
        <div className="space-y-4">
          {vectorReadinessUnavailable && (
            <div className="glass-card p-4 border border-[var(--color-danger)]/40">
              <p className="font-semibold tone-red">
                Native Oracle AI Vector Search is unavailable
              </p>
              <p className="text-xs text-[var(--color-text-dim)] mt-1">
                Current-generation vector readiness could not be proved, so
                vector counts, model identity, and execution claims are hidden.
              </p>
            </div>
          )}
          {!vectorReadinessError && !vectorReadinessUnavailable
            && vectorScopedEmpty && (
            <div data-testid="vector-readiness-scoped-empty-detail">
              <p className="font-semibold tone-ocean">
                No vector signal rows are visible for this VPD persona
              </p>
              <p className="text-xs text-[var(--color-text-dim)] mt-2">
                A separate read-only Oracle system transaction proved the
                same current dataset generation, canonical vectors, semantic
                cache, and exact Vector index before this restricted scope
                was accepted as empty.
              </p>
              <p
                className="text-xs font-mono tone-teal mt-2"
                data-testid="vector-readiness-global-anchor"
              >
                {vectorGlobalAnchor?.generationId} · {' '}
                {vectorGlobalAnchor?.indexName} · {' '}
                {vectorGlobalAnchor?.planOperation} · {' '}
                plan hash {vectorGlobalPlan?.planHashValue}
              </p>
            </div>
          )}
          {!vectorReadinessError && !vectorReadinessUnavailable
            && !vectorScopedEmpty && (
            <>
              <div>
                <p className="text-xs font-semibold text-[var(--color-text-dim)] uppercase tracking-wider mb-2">What's Happening</p>
                <p className="text-[var(--color-text)] leading-relaxed">
                  The feed, filters, influencer list, and viral cards use ordinary VPD-scoped relational SQL. Only the <span className="tone-teal font-mono">vector search bar</span> invokes native AI Vector Search: it embeds your query at runtime using <span className="tone-teal font-mono">VECTOR_EMBEDDING(ALL_MINILM_L12_V2)</span> -
                  an ONNX model loaded directly into Oracle. It then computes <span className="tone-sienna font-mono">VECTOR_DISTANCE(COSINE)</span> against{' '}
                  <span className="tone-pine">{formatNumber(vectorCounts.PRODUCT_EMBEDDINGS || 0)} current product vectors</span>.
                  Each search reports the exact cursor SQL ID/child, actual plan operation, and inspected object or index.
                  No external vector service is used. The current VPD scope contains{' '}
                  <span className="tone-pine">{formatNumber(vectorCounts.POST_EMBEDDINGS || 0)} post embeddings</span> and{' '}
                  <span className="tone-sienna">{formatNumber(vectorCounts.SEMANTIC_MATCHES || 0)} semantic matches</span>.
                </p>
              </div>
              <div className="flex flex-wrap gap-1.5">
                <FeatureBadge label="VECTOR_EMBEDDING (ONNX)" color="cyan" />
                <FeatureBadge label="VECTOR_DISTANCE(COSINE)" color="cyan" />
                <FeatureBadge label="DBMS_XPLAN Execution Proof" color="purple" />
                <FeatureBadge label="ALL_MINILM_L12_V2" color="green" />
                <FeatureBadge label="384-dim Vectors" color="blue" />
                <FeatureBadge label="Current Dataset Counts" color="yellow" />
                <FeatureBadge label="Read-only VPD session" color="green" />
                <FeatureBadge label="Momentum Scoring" color="red" />
                <FeatureBadge label="product_embeddings" color="orange" />
                <FeatureBadge label="post_embeddings" color="orange" />
              </div>
              <SqlBlock code={`-- Real-time vector semantic search for products
-- Embeds user query at runtime, then finds nearest
-- product vectors by cosine distance; the API returns
-- the actual current cursor-plan operation.
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
                  <DiagramBox label="User Query" sub="'waterproof hiking boots for spring trails'" color="#4F7D7B" />
                  <div className="text-center text-[var(--color-text-dim)]">↓</div>
                  <DiagramBox label="VECTOR_EMBEDDING" sub="ALL_MINILM_L12_V2 ONNX model · 384 dimensions" color="#4F7D7B" />
                  <div className="text-center text-[var(--color-text-dim)]">↓</div>
                  <DiagramBox label="VECTOR_DISTANCE(COSINE)" sub={`Query vector vs ${formatNumber(vectorCounts.PRODUCT_EMBEDDINGS || 0)} product embeddings`} color="#AA643B" />
                  <div className="text-center text-[var(--color-text-dim)]">↓</div>
                  <DiagramBox label="Current Cursor Plan" sub="Exact deployed VECTOR INDEX · reported after each search" color="#796087" />
                  <div className="text-center text-[var(--color-text-dim)]">↓</div>
                  <DiagramBox label="📦 Ranked Products" sub="Similarity score · brand · price · social mentions" color="#4C825C" />
                </div>
                <p className="text-[10px] font-semibold text-[var(--color-text-dim)] uppercase tracking-wider mb-2 mt-4">Embedding Tables</p>
                <div className="space-y-1.5">
                  <DiagramBox label="product_embeddings" sub={`${formatNumber(vectorCounts.PRODUCT_EMBEDDINGS || 0)} current rows · 384-dim VECTOR`} color="#AA643B" />
                  <DiagramBox label="post_embeddings" sub={`${formatNumber(vectorCounts.POST_EMBEDDINGS || 0)} current rows · 384-dim VECTOR`} color="#AA643B" />
                  <DiagramBox label="semantic_matches" sub={`${formatNumber(vectorCounts.SEMANTIC_MATCHES || 0)} current post↔product rows`} color="#796087" />
                </div>
              </div>
            </>
          )}
          <div>
            <p className="text-xs font-semibold text-[var(--color-text-dim)] uppercase tracking-wider mb-2">Virtual Private Database (VPD)</p>
            <p className="text-[var(--color-text)] leading-relaxed">
              <span className="tone-pine font-mono">DBMS_RLS</span> policies filter customer signal posts and creator/community data
              based on the active user's role and region - applied transparently at the database kernel level.
              <span className={vpdAccess.scope === 'RESTRICTED' ? 'tone-ocean' : 'tone-sienna'}>
                {' '}{vpdAccess.label}. {vpdAccess.description}
              </span>
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
          <TrendingUp className="text-[var(--color-accent)]" /> Customer Trend Signals
        </h2>
        <p className="text-sm text-[var(--color-text-dim)] mt-1">
          <span className="tone-teal">Oracle Vector Search</span> connects outdoor creator posts, customer reviews, return patterns, sporting-goods demand, and community signals.
        </p>
      </div>

      <RetailSceneStory scene="social" />

      {!vectorReadinessError && !vectorReadinessUnavailable
        && vectorReadiness
        && !vectorScopedEmpty && (
        <div
          className="glass-card p-3 text-xs text-[var(--color-text-dim)]"
          data-testid="vector-readiness-tuple"
        >
          Current Oracle vector evidence: {' '}
          <span className="font-mono tone-teal">ORACLE_VECTOR_SEARCH</span> · {' '}
          <span className="font-mono text-[var(--color-text)]">
            {formatNumber(vectorCounts.PRODUCT_EMBEDDINGS || 0)}
          </span> product vectors · {' '}
          <span className="font-mono text-[var(--color-text)]">
            {formatNumber(vectorCounts.POST_EMBEDDINGS || 0)}
          </span> post vectors · {' '}
          <span className="font-mono text-[var(--color-text)]">
            {formatNumber(vectorCounts.SEMANTIC_MATCHES || 0)}
          </span> semantic matches · plan hash {' '}
          <span className="font-mono text-[var(--color-text)]">
            {vectorPlanEvidence?.planHashValue}
          </span>
        </div>
      )}

      {/* ── Vector Search ── */}
      {vectorReadinessUnavailable && (
        <div
          className="glass-card p-8 text-center border border-[var(--color-danger)]/40"
          data-testid="vector-readiness-unavailable"
          role="alert"
        >
          <Sparkles size={24} className="mx-auto mb-3 tone-red" />
          <p className="font-semibold tone-red">
            Native Oracle AI Vector Search is unavailable
          </p>
          <p className="text-xs text-[var(--color-text-dim)] mt-2">
            Current-generation vector readiness could not be loaded. Vector
            search and readiness claims remain hidden until Oracle reports
            a healthy, generation-bound feature state.
          </p>
        </div>
      )}
      {!vectorReadinessError && !vectorReadinessUnavailable
        && vectorScopedEmpty && (
        <div
          className="glass-card p-8 text-center border border-ocean-soft"
          data-testid="vector-readiness-scoped-empty"
          role="status"
        >
          <Sparkles size={24} className="mx-auto mb-3 tone-ocean" />
          <p className="font-semibold tone-ocean">
            No vector signal rows are visible for this VPD persona
          </p>
          <p className="text-xs text-[var(--color-text-dim)] mt-2">
            Current generation {vectorGlobalAnchor?.generationId} is anchored
            by exact {vectorGlobalAnchor?.indexName} execution. This VPD scope
            intentionally exposes no vector-backed signal data.
          </p>
        </div>
      )}
      {!vectorReadinessError && !vectorReadinessUnavailable
        && !vectorScopedEmpty && (
        <VectorSearch generationKey={generationKey} />
      )}

      <section className="glass-card p-5">
        <div className="flex items-center gap-2 mb-2">
          <Search size={18} className="text-[var(--color-accent)]" />
          <h3 className="text-lg font-bold">Customer Demand Intelligence</h3>
        </div>
        <p className="text-sm text-[var(--color-text-dim)] mb-4">
          Monitor outdoor creator posts, customer conversations, emerging sporting-goods demand, and product sentiment across social platforms.
        </p>

        {/* Filters */}
        <div className="jet-control-row mb-4">
          <Filter size={14} className="text-[var(--color-text-dim)]" />
          <JetSelectSingle
            value={momentum}
            className="jet-inline-field"
            placeholder="All Demand Momentum"
            onValueChange={(next) => { setMomentum(next); setPage(1); }}
            options={[
              { value: '', label: 'All Demand Momentum' },
              { value: 'mega_viral', label: 'Mega Signal' },
              { value: 'viral', label: 'Signal Spike' },
              { value: 'rising', label: 'Rising' },
              { value: 'normal', label: 'Normal' },
            ]}
          />
          <JetSelectSingle
            value={platform}
            className="jet-inline-field"
            placeholder="All Platforms"
            onValueChange={(next) => { setPlatform(next); setPage(1); }}
            options={[
              { value: '', label: 'All Platforms' },
              { value: 'instagram', label: 'Instagram' },
              { value: 'tiktok', label: 'TikTok' },
              { value: 'twitter', label: 'Twitter' },
              { value: 'youtube', label: 'YouTube' },
              { value: 'threads', label: 'Threads' },
            ]}
          />
          <JetSelectSingle
            value={influencer}
            className="jet-inline-field"
            placeholder="All Creators"
            onValueChange={(next) => { setInfluencer(next); setPage(1); }}
            options={[
              { value: '', label: 'All Creators' },
              ...influencers.map((i) => ({ value: i.HANDLE, label: i.HANDLE })),
            ]}
          />
          {!vectorReadinessUnavailable && !vectorScopedEmpty && (
          <div className="flex items-center gap-1 ml-2">
            <JetInputText
              value={postQuery}
              placeholder="Try: viral trail shoes, damaged packaging complaints, winter jacket demand..."
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
          )}
          <span className="text-xs text-[var(--color-text-dim)] ml-auto">
            {postSearchResults
              ? <><span className="tone-teal">{postSearchResults.count}</span> matches · {postSearchResults.elapsed}ms</>
              : <>{formatNumber(total)} posts</>}
          </span>
        </div>

        {/* Post Feed - vector search results or normal feed */}
        {postSearchResults ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-xs text-[var(--color-text-dim)]">
              <Sparkles size={12} className="tone-teal" />
              <span>Vector search results for "<span className="tone-teal">{postSearchResults.query}</span>"</span>
              <span className="font-mono text-[10px]">
                {postSearchResults.model} · {postSearchResults.dimensions}d · cosine
                {postSearchResults.proof?.operation ? ` · ${postSearchResults.proof.operation}` : ''}
                {postSearchResults.proof?.sqlId
                  ? ` · SQL ${postSearchResults.proof.sqlId}/${postSearchResults.proof.childNumber ?? '?'}`
                  : ''}
                {postSearchResults.proof?.planHashValue
                  ? ` · plan hash ${postSearchResults.proof.planHashValue}`
                  : ''}
                {postSearchResults.proof?.indexName || postSearchResults.proof?.objectName
                  ? ` · ${postSearchResults.proof.indexName || postSearchResults.proof.objectName}`
                  : ''}
              </span>
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
                          {p.MOMENTUM_FLAG === 'mega_viral' ? '🔥 MEGA SIGNAL' :
                           p.MOMENTUM_FLAG === 'viral' ? '🔥 Spike' :
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
                        Sentiment: <span className={p.SENTIMENT_SCORE > 0.5 ? 'tone-pine' : p.SENTIMENT_SCORE > 0 ? 'tone-sienna' : 'tone-red'}>
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
              <div className="flex items-center justify-center gap-2 mt-4">
                <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="btn-ghost">← Prev</button>
                <span className="text-sm text-[var(--color-text-dim)]">Page {page} of {Math.ceil(total / 15)}</span>
                <button onClick={() => setPage(p => p + 1)} disabled={page >= Math.ceil(total / 15)} className="btn-ghost">Next →</button>
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}
