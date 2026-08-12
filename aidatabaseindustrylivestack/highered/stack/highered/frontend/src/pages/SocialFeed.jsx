import { useState, useCallback } from 'react';
import { TrendingUp, Filter, Eye, Share2, MessageCircle, Heart, Sparkles } from 'lucide-react';
// recharts removed - Platform Activity chart removed
import { api } from '../utils/api';
import { useData } from '../hooks/useData';
import { useUser } from '../context/UserContext';
import { formatNumber, formatCurrency, timeAgo, platformLabel } from '../utils/format';
import { FeatureBadge, SqlBlock, DiagramBox } from '../components/OracleInfoPanel';
import { RegisterOraclePanel } from '../context/OraclePanelContext';
import { JetButton, JetInputText, JetSelectSingle } from '../components/JetControls';

function PostCard({ post }) {
 const momentumClass = `momentum-${post.MOMENTUM_FLAG}`;
 const momentumLabel = post.MOMENTUM_FLAG === 'mega_viral' ? 'Critical Momentum'
 : post.MOMENTUM_FLAG === 'viral' ? 'High Momentum'
 : post.MOMENTUM_FLAG === 'rising' ? 'Rising Need'
 : 'Normal';
 return (
 <div className="glass-card p-4 fade-in">
 <div className="flex items-start justify-between gap-3">
 <div className="flex-1 min-w-0">
 <div className="flex items-center gap-2 mb-1.5">
	 <span className={`platform-badge platform-${(post.PLATFORM || '').toLowerCase()}`}>{platformLabel(post.PLATFORM)}</span>
 <span className={`momentum-badge ${momentumClass}`}>
 {momentumLabel}
 </span>
 <span className="text-[11px] text-[var(--color-text-dim)]">{timeAgo(post.POSTED_AT)}</span>
 </div>
 {post.INFLUENCER_HANDLE && (
 <p className="text-xs text-[var(--color-accent)] font-medium mb-1">
 {post.INFLUENCER_HANDLE}
 <span className="text-[var(--color-text-dim)] font-normal ml-2">
 {formatNumber(post.FOLLOWER_COUNT)} audience - Support Score {post.INFLUENCE_SCORE}
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
 <div className="text-[9px] text-[var(--color-text-dim)] uppercase">Urgency</div>
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

// -- Similarity bar color ------------------------------------------------------
function simColor(score) {
 if (score >= 0.7) return '#4C825C';
 if (score >= 0.5) return '#AA643B';
 if (score >= 0.3) return '#437C94';
 return '#7A736E';
}

// -- Vector Search Section -----------------------------------------------------
function VectorSearch() {
 const [query, setQuery] = useState('');
 const [results, setResults] = useState(null);
 const [meta, setMeta] = useState(null);
 const [searching, setSearching] = useState(false);
 const [error, setError] = useState(null);

 const EXAMPLE_QUERIES = [
 'students need emergency housing support',
 'financial aid appeal and scholarship matching',
 'degree audit for graduation risk',
 'mental health counseling intake',
 'first-generation student advising',
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
 <h3 className="social-vector-search-panel__title">Student Service Vector Search</h3>
 <span className="social-vector-search-panel__chip text-[var(--color-text)] border border-teal-soft font-mono">
 VECTOR_EMBEDDING - COSINE - ANN
 </span>
 </div>

 {/* Search Input */}
 <div className="jet-control-row mb-3">
 <JetInputText
 value={query}
 placeholder="Describe a student need... (e.g. 'mental health counseling intake')"
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
 {results.length} student services matched for "<span className="tone-teal">{meta?.query}</span>"
 </p>
 {meta && (
 <span className="text-[10px] text-[var(--color-text-dim)] font-mono">
 {meta.model} - {meta.dimensions}d - cosine
 </span>
 )}
 </div>
 {results.length === 0 ? (
 <p className="text-sm text-[var(--color-text-dim)]">No student services matched the query vector.</p>
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
 {/* Student service info */}
 <div className="flex-1 min-w-0">
 <p className="text-sm font-medium truncate">{r.PRODUCT_NAME}</p>
 <p className="text-[11px] text-[var(--color-text-dim)]">
 {r.BRAND_NAME} - {r.CATEGORY}
 {r.MENTION_COUNT > 0 && <span className="tone-sienna ml-1"> - {r.MENTION_COUNT} signal matches</span>}
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
 <RegisterOraclePanel title="Student Intent & Support Signals">
 <div className="space-y-4">
 <div>
 <p className="text-xs font-semibold text-[var(--color-text-dim)] uppercase tracking-wider mb-2">What's Happening</p>
 <p className="text-[var(--color-text)] leading-relaxed">
 The <span className="tone-teal font-mono">vector search bar</span> embeds your query at runtime using <span className="tone-teal font-mono">VECTOR_EMBEDDING(ALL_MINILM_L12_V2)</span> -
 an ONNX model loaded directly into Oracle. It then computes <span className="tone-sienna font-mono">VECTOR_DISTANCE(COSINE)</span> against{' '}
 <span className="tone-pine">pre-embedded student service vectors</span> and returns the top matches via an <span className="tone-plum font-mono">ANN index</span>
 (approximate nearest neighbor). No external API, no Python, no microservice - the entire embedding + search pipeline runs inside the database.
	 The student signal feed below uses <span className="tone-red font-mono">momentum scoring</span> across 5,000 student signals with{' '}
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
 <FeatureBadge label="Momentum Scoring" color="red" />
	 <FeatureBadge label="Service embeddings" color="orange" />
	 <FeatureBadge label="Signal embeddings" color="orange" />
 </div>
 <SqlBlock code={`-- Real-time vector semantic search for student services
-- Embeds user query at runtime, then finds nearest
-- service vectors via ANN index (cosine distance)
	SELECT svc.service_id, svc.service_name,
	 svc.service_category, svc.academic_program,
	 ROUND(1 - VECTOR_DISTANCE(
	 pe.embedding,
	 VECTOR_EMBEDDING(ALL_MINILM_L12_V2
	 USING :query AS DATA),
	 COSINE), 4) AS similarity_score
	FROM product_embeddings pe
	JOIN student_services_v svc ON pe.product_id = svc.service_id
	ORDER BY VECTOR_DISTANCE(
 pe.embedding,
 VECTOR_EMBEDDING(ALL_MINILM_L12_V2
 USING :query AS DATA),
 COSINE)
FETCH APPROXIMATE FIRST 10 ROWS ONLY;`} />
 <div>
 <p className="text-[10px] font-semibold text-[var(--color-text-dim)] uppercase tracking-wider mb-2">Vector Search Pipeline</p>
 <div className="space-y-1.5">
 <DiagramBox label="User Query" sub="'mental health counseling intake'" color="#4F7D7B" />
 <div className="text-center text-[var(--color-text-dim)]">down</div>
 <DiagramBox label="VECTOR_EMBEDDING" sub="ALL_MINILM_L12_V2 ONNX model - 384 dimensions" color="#4F7D7B" />
 <div className="text-center text-[var(--color-text-dim)]">down</div>
 <DiagramBox label="VECTOR_DISTANCE(COSINE)" sub="Query vector vs 187 student service embeddings" color="#AA643B" />
 <div className="text-center text-[var(--color-text-dim)]">down</div>
 <DiagramBox label="ANN Index Scan" sub="FETCH APPROXIMATE FIRST K ROWS - 95% accuracy" color="#796087" />
 <div className="text-center text-[var(--color-text-dim)]">down</div>
 <DiagramBox label="Ranked Student Services" sub="Similarity score - academic program - cost - student signals" color="#4C825C" />
 </div>
 <p className="text-[10px] font-semibold text-[var(--color-text-dim)] uppercase tracking-wider mb-2 mt-4">Embedding Tables</p>
 <div className="space-y-1.5">
	 <DiagramBox label="Service embeddings" sub="higher education services - 384-dim VECTOR - COSINE ANN index" color="#AA643B" />
		 <DiagramBox label="Signal embeddings" sub="5,000 student signals - 384-dim VECTOR - COSINE ANN index" color="#AA643B" />
 <DiagramBox label="semantic_matches" sub="574 pre-computed signal-to-service matches - vector method" color="#796087" />
 </div>
 </div>
 <div>
 <p className="text-xs font-semibold text-[var(--color-text-dim)] uppercase tracking-wider mb-2">Virtual Private Database (VPD)</p>
 <p className="text-[var(--color-text)] leading-relaxed">
	 <span className="tone-pine font-mono">DBMS_RLS</span> policies filter student signals and success-advocate data
 based on the active user's role and region - applied transparently at the database kernel level.
 {currentUser?.ROLE === 'fulfillment_mgr' ? (
	 <span className="tone-sienna"> Showing only higher education signals from <strong>{currentUser.REGION}</strong> success advocates.</span>
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
 <TrendingUp className="text-[var(--color-accent)]" /> Student Intent &amp; Support Signals
 </h2>
 <p className="text-sm text-[var(--color-text-dim)] mt-1">
 <span className="tone-teal">Oracle Vector Search</span> with ONNX embeddings - semantic student service matching - momentum detection
 </p>
 </div>

 {/* -- Vector Search -- */}
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
 { value: 'mega_viral', label: 'Critical Momentum' },
 { value: 'viral', label: 'High Momentum' },
 { value: 'rising', label: 'Rising Need' },
 { value: 'normal', label: 'Normal' },
 ]}
 />
 <JetSelectSingle
 value={platform}
 className="jet-inline-field"
	 placeholder="All Signal Channels"
 onValueChange={(next) => { setPlatform(next); setPage(1); }}
 options={[
	 { value: '', label: 'All Signal Channels' },
	 { value: 'instagram', label: 'Student Communities' },
	 { value: 'tiktok', label: 'Student Video' },
	 { value: 'twitter', label: 'Public Student Threads' },
	 { value: 'youtube', label: 'Campus Video' },
	 { value: 'threads', label: 'Peer Network Threads' },
 ]}
 />
 <JetSelectSingle
 value={influencer}
 className="jet-inline-field"
 placeholder="All Success Advocates"
 onValueChange={(next) => { setInfluencer(next); setPage(1); }}
 options={[
 { value: '', label: 'All Success Advocates' },
 ...influencers.map((i) => ({ value: i.HANDLE, label: i.HANDLE })),
 ]}
 />
 <div className="flex items-center gap-1 ml-2">
 <JetInputText
 value={postQuery}
	 placeholder="Search signals by embedding..."
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
 ? <><span className="tone-teal">{postSearchResults.count}</span> matches - {postSearchResults.elapsed}ms</>
	 : <>{formatNumber(total)} signals</>}
 </span>
 </div>

	 {/* Signal Feed - vector search results or normal feed */}
 {postSearchResults ? (
 <div className="space-y-3">
 <div className="flex items-center gap-2 text-xs text-[var(--color-text-dim)]">
 <Sparkles size={12} className="tone-teal" />
 <span>Vector search results for "<span className="tone-teal">{postSearchResults.query}</span>"</span>
 <span className="font-mono text-[10px]">{postSearchResults.model} - {postSearchResults.dimensions}d - cosine</span>
 </div>
 {postSearchResults.posts?.length === 0 ? (
	 <p className="text-sm text-[var(--color-text-dim)]">No matching signals found.</p>
 ) : (
 postSearchResults.posts.map((p, idx) => (
 <div key={p.POST_ID} className="glass-card p-4 fade-in">
 <div className="flex items-start justify-between gap-3">
 <div className="flex-1 min-w-0">
 <div className="flex items-center gap-2 mb-1.5">
 <span className="flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded"
 style={{ background: `${simColor(p.SIMILARITY_SCORE)}22`, color: simColor(p.SIMILARITY_SCORE), border: `1px solid ${simColor(p.SIMILARITY_SCORE)}44` }}>
 #{idx + 1} - {(p.SIMILARITY_SCORE * 100).toFixed(1)}%
 </span>
	 <span className={`platform-badge platform-${(p.PLATFORM || '').toLowerCase()}`}>{platformLabel(p.PLATFORM)}</span>
 <span className={`momentum-badge momentum-${p.MOMENTUM_FLAG}`}>
 {p.MOMENTUM_FLAG === 'mega_viral' ? 'Critical Momentum' :
 p.MOMENTUM_FLAG === 'viral' ? 'High Momentum' :
 p.MOMENTUM_FLAG === 'rising' ? 'Rising Need' : 'Normal'}
 </span>
 <span className="text-[11px] text-[var(--color-text-dim)]">{timeAgo(p.POSTED_AT)}</span>
 </div>
 {p.INFLUENCER_HANDLE && (
 <p className="text-xs text-[var(--color-accent)] font-medium mb-1">
 {p.INFLUENCER_HANDLE}
 <span className="text-[var(--color-text-dim)] font-normal ml-2">
 {formatNumber(p.FOLLOWER_COUNT)} audience - Support Score {p.INFLUENCE_SCORE}
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
	 {/* Normal Signal Feed */}
 <div className="space-y-3">
 {loading ? (
	 <p className="text-sm text-[var(--color-text-dim)]">Loading signals...</p>
 ) : posts.length === 0 ? (
	 <p className="text-sm text-[var(--color-text-dim)]">No signals found</p>
 ) : (
 posts.map(p => <PostCard key={p.POST_ID} post={p} />)
 )}
 </div>

 {/* Pagination */}
 {total > 15 && (
 <div className="flex items-center justify-center gap-2">
	 <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="btn-ghost">Prev</button>
 <span className="text-sm text-[var(--color-text-dim)]">Page {page} of {Math.ceil(total / 15)}</span>
	 <button onClick={() => setPage(p => p + 1)} disabled={page >= Math.ceil(total / 15)} className="btn-ghost">Next</button>
 </div>
 )}
 </>
 )}
 </div>
 );
}
