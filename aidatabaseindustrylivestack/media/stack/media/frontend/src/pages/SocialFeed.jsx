import { useState, useCallback, useEffect } from 'react';
import { TrendingUp, Filter, Search, Flame, Eye, Share2, MessageCircle, Heart, Package, Sparkles, Loader2, DollarSign, X } from 'lucide-react';
// recharts removed - Platform Activity chart removed
import { api } from '../utils/api';
import { useData } from '../hooks/useData';
import { useUser } from '../context/UserContext';
import { formatNumber, formatCurrency, timeAgo, getPlatformColor } from '../utils/format';
import { FeatureBadge, SqlBlock, DiagramBox } from '../components/OracleInfoPanel';
import { SceneStoryPanel } from '../components/MediaStory';
import { RegisterOraclePanel } from '../context/OraclePanelContext';
import { JetButton, JetInputText, JetSelectSingle } from '../components/JetControls';
import useGenerationRequestGuard from '../hooks/useGenerationRequestGuard';

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
                {formatNumber(post.FOLLOWER_COUNT)} followers  -  Score {post.INFLUENCE_SCORE}
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

// Vector Search Section
function VectorSearch() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState(null);
  const [meta, setMeta] = useState(null);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState(null);
  const { beginRequest, isCurrent, boundaryKey } = useGenerationRequestGuard(() => {
    setResults(null);
    setMeta(null);
    setSearching(false);
    setError(null);
  });

  useEffect(() => {
    setResults(null);
    setMeta(null);
  }, [boundaryKey]);

  const EXAMPLE_QUERIES = [
    'streaming demand for teen drama',
    'sports rights highlight clips',
    'FAST channel weekend binge',
    'creator backlash on finale',
    'regional demand for live event',
    'brand safety risk in creator campaigns',
    'subscriber churn after season finale',
    'audience safety signals around live sports',
  ];

  const runSearch = useCallback(async (searchQuery) => {
    const q = searchQuery || query;
    if (!q.trim()) return;
    const requestToken = beginRequest('content-vector-search');
    setSearching(true);
    setError(null);
    try {
      const data = await api.social.search(q.trim(), 8);
      if (!isCurrent(requestToken)) return;
      setResults(data.results || []);
      setMeta({
        query: data.query,
        model: data.model,
        dimensions: data.dimensions,
        scopeStatus: data.scopeStatus,
        globalAnchor: data.globalAnchor,
        ...(data.evidence || {}),
      });
    } catch (err) {
      if (!isCurrent(requestToken)) return;
      setError(err.message);
      setResults([]);
      setMeta(null);
    } finally {
      if (isCurrent(requestToken)) setSearching(false);
    }
  }, [beginRequest, isCurrent, query]);

  return (
    <div className="glass-card p-5 border border-teal-soft social-vector-search-panel">
      <div className="flex items-center gap-2 mb-4">
        <Sparkles size={18} className="tone-teal social-vector-search-panel__spark" />
        <h3 className="social-vector-search-panel__title">Content Asset Vector Search</h3>
        <span className="social-vector-search-panel__chip text-[var(--color-text)] border border-teal-soft font-mono">
          VECTOR_EMBEDDING  -  COSINE  -  CURRENT PLAN
        </span>
      </div>

      {/* Search Input */}
      <div className="jet-control-row mb-3">
        <JetInputText
          value={query}
          placeholder="Describe a content audience signal... (e.g. 'fans asking for sci-fi marathon weekend')"
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
        <div className="mt-2" role="alert">
          <p className="text-sm font-semibold tone-red">
            Native Oracle AI Vector Search is unavailable
          </p>
          <p className="text-xs text-[var(--color-text-dim)]">{error}</p>
        </div>
      )}

      {/* Results */}
      {results && (
        <div className="mt-3">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs text-[var(--color-text-dim)]">
              {results.length} content assets matched for "<span className="tone-teal">{meta?.query}</span>"
            </p>
            {meta && (
              <span className="text-[10px] text-[var(--color-text-dim)] font-mono">
                {meta.model}  -  {meta.dimensions}d  -  cosine
              </span>
            )}
          </div>
          {meta?.scopeStatus === 'SCOPED_NO_VISIBLE_VECTOR_DATA' ? (
            <div
              role="status"
              data-testid="vector-scoped-empty"
              className="rounded p-3 text-sm text-[var(--color-text-dim)]"
              style={{ border: '1px solid rgba(170,100,59,0.45)' }}
            >
              No Vector rows are visible in this VPD scope. The
              current generation remains globally proven by the exact
              {' '}
              <span className="font-mono tone-sienna">IDX_PRODUCT_VEC</span>
              {' '}
              anchor.
            </div>
          ) : results.length === 0 ? (
            <p className="text-sm text-[var(--color-text-dim)]">No content assets matched the query vector.</p>
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
                      {r.BRAND_NAME}  -  {r.CATEGORY}
                      {r.MENTION_COUNT > 0 && <span className="tone-sienna ml-1"> -  {r.MENTION_COUNT} mentions</span>}
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
          {meta && meta.scopeStatus !== 'SCOPED_NO_VISIBLE_VECTOR_DATA' && (
            <div
              className="mt-3 rounded p-2 text-[9px] font-mono text-[var(--color-text-dim)]"
              data-testid="vector-execution-proof"
              style={{ border: '1px dashed rgba(79,125,123,0.3)' }}
            >
              Generation: {meta.generationId}
              {' · '}
              Cursor: {meta.sqlId}/{meta.childNumber}
              {' · '}
              Plan: {[meta.operation, meta.options].filter(Boolean).join(' ')}
              {' '}
              {meta.objectName}
              {' · '}
              Plan hash: {meta.planHashValue}
            </div>
          )}
          {meta?.globalAnchor && (
            <div
              className="mt-2 rounded p-2 text-[9px] font-mono text-[var(--color-text-dim)]"
              data-testid="vector-global-anchor"
              style={{ border: '1px dashed rgba(170,100,59,0.35)' }}
            >
              Current-generation global anchor:
              {' '}
              {meta.globalAnchor.indexName}
              {' · '}
              {meta.globalAnchor.planOperation}
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
  const [postSearchError, setPostSearchError] = useState(null);
  const { beginRequest, isCurrent, boundaryKey } = useGenerationRequestGuard(() => {
    setPostSearchResults(null);
    setPostSearching(false);
    setPostQuery('');
    setPostSearchError(null);
  });

  useEffect(() => {
    setPostSearchResults(null);
    setPostSearchError(null);
  }, [boundaryKey]);

  const runPostSearch = useCallback(async (q) => {
    const query = (q || postQuery).trim();
    if (!query) return;
    const requestToken = beginRequest('post-vector-search');
    setPostSearching(true);
    setPostSearchError(null);
    try {
      const res = await api.social.postSearch(query);
      if (!isCurrent(requestToken)) return;
      setPostSearchResults(res);
    } catch (err) {
      if (!isCurrent(requestToken)) return;
      setPostSearchResults(null);
      setPostSearchError(
        err.message || 'Native Oracle AI Vector Search is unavailable.'
      );
    } finally {
      if (isCurrent(requestToken)) setPostSearching(false);
    }
  }, [beginRequest, isCurrent, postQuery]);

  const clearPostSearch = () => {
    setPostQuery('');
    setPostSearchResults(null);
    setPostSearchError(null);
  };

  // Fetch all influencers for releasedown filter
  const { data: influencerList } = useData(
    () => api.social.influencers(),
    [currentUser?.USERNAME]
  );
  const influencers = influencerList || [];

  // Refetch when user changes (VPD filters social posts by region)
  const { data: postsData, loading, error: postsError } = useData(
    () => api.social.posts({ momentum, platform, page, limit: 15, ...(influencer && { influencer }) }),
    [momentum, platform, influencer, page, currentUser?.USERNAME]
  );
  const { data: viralPosts } = useData(() => api.social.viral(48), [currentUser?.USERNAME]);

  const posts = postsData?.posts || [];
  const total = postsData?.total || 0;

  return (
    <div className="space-y-6 fade-in">

      {/* Register Oracle Internals into the right panel */}
      <RegisterOraclePanel title="Audience Momentum & Safety Signals">
        <div className="space-y-4">
          <div>
            <p className="text-xs font-semibold text-[var(--color-text-dim)] uppercase tracking-wider mb-2">What's Happening</p>
            <p className="text-[var(--color-text)] leading-relaxed">
              The <span className="tone-teal font-mono">vector search bar</span> embeds your query at runtime using <span className="tone-teal font-mono">VECTOR_EMBEDDING(ALL_MINILM_L12_V2)</span> -
              an ONNX model loaded directly into Oracle. It then computes <span className="tone-sienna font-mono">VECTOR_DISTANCE(COSINE)</span> against{' '}
              <span className="tone-pine">current-generation content asset vectors</span> and returns bounded,
              deterministically ordered matches. The result panel reports the model, generation and exact plan
              evidence returned by the API; no fixed dataset counts or accuracy claim is substituted.
            </p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <FeatureBadge label="VECTOR_EMBEDDING (ONNX)" color="cyan" />
            <FeatureBadge label="VECTOR_DISTANCE(COSINE)" color="cyan" />
            <FeatureBadge label="Exact IDX_PRODUCT_VEC Plan" color="purple" />
            <FeatureBadge label="ALL_MINILM_L12_V2" color="green" />
            <FeatureBadge label="384-dim Vectors" color="blue" />
            <FeatureBadge label="FETCH APPROXIMATE" color="yellow" />
            <FeatureBadge label="Momentum Scoring" color="red" />
            <FeatureBadge label="Content Asset Vectors" color="orange" />
            <FeatureBadge label="post_embeddings" color="orange" />
          </div>
          <SqlBlock code={`-- Real-time vector semantic search for content assets
-- Embeds user query at runtime, then finds nearest
-- current-generation content asset vectors using cosine distance
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
              <DiagramBox label="User Query" sub="'FAST channel weekend binge'" color="#4F7D7B" />
              <div className="text-center text-[var(--color-text-dim)]">↓</div>
              <DiagramBox label="VECTOR_EMBEDDING" sub="ALL_MINILM_L12_V2 ONNX model  -  384 dimensions" color="#4F7D7B" />
              <div className="text-center text-[var(--color-text-dim)]">↓</div>
              <DiagramBox label="VECTOR_DISTANCE(COSINE)" sub="Query vector vs current API-scoped content vectors" color="#AA643B" />
              <div className="text-center text-[var(--color-text-dim)]">↓</div>
              <DiagramBox label="Executed Vector Plan" sub="SQL ID, child cursor and operation supplied by the API" color="#796087" />
              <div className="text-center text-[var(--color-text-dim)]">↓</div>
              <DiagramBox label="Ranked Content Assets" sub="Similarity score  -  studio attribution  -  rights value  -  audience signals" color="#4C825C" />
            </div>
            <p className="text-[10px] font-semibold text-[var(--color-text-dim)] uppercase tracking-wider mb-2 mt-4">Embedding Tables</p>
            <div className="space-y-1.5">
              <DiagramBox label="Content Asset Vectors" sub="current-generation count from the API  -  384-dim VECTOR" color="#AA643B" />
              <DiagramBox label="post_embeddings" sub="current-generation count from the API  -  384-dim VECTOR" color="#AA643B" />
              <DiagramBox label="semantic_matches" sub="current-generation API count  -  vector method" color="#796087" />
            </div>
          </div>
          <div>
            <p className="text-xs font-semibold text-[var(--color-text-dim)] uppercase tracking-wider mb-2">Virtual Private Database (VPD)</p>
            <p className="text-[var(--color-text)] leading-relaxed">
              <span className="tone-pine font-mono">DBMS_RLS</span> policies filter social posts and influencer data
              based on the active user's role and region - applied transparently at the database kernel level.
              {currentUser?.ROLE === 'fulfillment_mgr' ? (
                <span className="tone-sienna"> Showing only media signals from <strong>{currentUser.REGION}</strong> influencers.</span>
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
          <TrendingUp className="text-[var(--color-accent)]" /> Audience Momentum & Safety Signals
        </h2>
        <p className="text-sm text-[var(--color-text-dim)] mt-1">
          <span className="tone-teal">Oracle Vector Search</span> with ONNX embeddings  -  semantic content asset matching  -  momentum detection
        </p>
      </div>

      <SceneStoryPanel scene="social" />

      {postsError && (
        <div
          className="glass-card p-4"
          role="alert"
          data-testid="social-vpd-unavailable"
          style={{ borderLeft: '3px solid var(--color-danger)' }}
        >
          <p className="text-sm font-semibold tone-red">
            VPD-governed audience signals are unavailable
          </p>
          <p className="text-xs text-[var(--color-text-dim)] mt-1">
            {postsError.message}
          </p>
        </div>
      )}

      {/* ── Vector Search ── */}
      <VectorSearch />

      {/* Filters */}
      <div className="jet-control-row">
        <Filter size={14} className="text-[var(--color-text-dim)]" />
        <JetSelectSingle
          value={momentum}
          className="jet-inline-field"
          placeholder="All Momentum"
          onValueChange={(next) => { setMomentum(next); setPage(1); }}
          options={[
            { value: '', label: 'All Momentum' },
            { value: 'mega_viral', label: 'Mega Viral' },
            { value: 'viral', label: 'Viral' },
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
        <div className="flex items-center gap-1 ml-2">
          <JetInputText
            value={postQuery}
            placeholder="Search audience signals by embedding..."
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
            ? <><span className="tone-teal">{postSearchResults.count}</span> matches  -  {postSearchResults.elapsed}ms</>
            : <>{formatNumber(total)} posts</>}
        </span>
      </div>

      {postSearchError && (
        <div
          className="glass-card p-3"
          role="alert"
          data-testid="post-vector-feature-unavailable"
          style={{ borderLeft: '3px solid var(--color-danger)' }}
        >
          <p className="text-sm font-semibold tone-red">
            Native Oracle AI Vector Search is unavailable
          </p>
          <p className="text-xs text-[var(--color-text-dim)] mt-1">
            {postSearchError}
          </p>
        </div>
      )}

      {/* Post Feed - vector search results or normal feed */}
      {postSearchResults ? (
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-xs text-[var(--color-text-dim)]">
            <Sparkles size={12} className="tone-teal" />
            <span>Vector search results for "<span className="tone-teal">{postSearchResults.query}</span>"</span>
            <span className="font-mono text-[10px]">{postSearchResults.model}  -  {postSearchResults.dimensions}d  -  cosine</span>
          </div>
          {postSearchResults.scopeStatus === 'SCOPED_NO_VISIBLE_VECTOR_DATA' ? (
            <div
              role="status"
              data-testid="post-vector-scoped-empty"
              className="glass-card p-3 text-sm text-[var(--color-text-dim)]"
              style={{ borderLeft: '3px solid var(--color-warning)' }}
            >
              No audience-signal vectors are visible in this VPD scope.
              The current generation remains globally proven by the exact
              {' '}
              <span className="font-mono tone-sienna">IDX_PRODUCT_VEC</span>
              {' '}
              anchor.
            </div>
          ) : postSearchResults.posts?.length === 0 ? (
            <p className="text-sm text-[var(--color-text-dim)]">No matching audience signals found.</p>
          ) : (
            postSearchResults.posts.map((p, idx) => (
              <div key={p.POST_ID} className="glass-card p-4 fade-in">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className="flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded"
                        style={{ background: `${simColor(p.SIMILARITY_SCORE)}22`, color: simColor(p.SIMILARITY_SCORE), border: `1px solid ${simColor(p.SIMILARITY_SCORE)}44` }}>
                        #{idx + 1}  -  {(p.SIMILARITY_SCORE * 100).toFixed(1)}%
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
                          {formatNumber(p.FOLLOWER_COUNT)} followers  -  Score {p.INFLUENCE_SCORE}
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
              <p className="text-sm text-[var(--color-text-dim)]">No audience signals found</p>
            ) : (
              posts.map(p => <PostCard key={p.POST_ID} post={p} />)
            )}
          </div>

          {/* Pagination */}
          {total > 15 && (
            <div className="flex items-center justify-center gap-2">
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="btn-ghost">{'<-'} Prev</button>
              <span className="text-sm text-[var(--color-text-dim)]">Page {page} of {Math.ceil(total / 15)}</span>
              <button onClick={() => setPage(p => p + 1)} disabled={page >= Math.ceil(total / 15)} className="btn-ghost">Next {'->'}</button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
