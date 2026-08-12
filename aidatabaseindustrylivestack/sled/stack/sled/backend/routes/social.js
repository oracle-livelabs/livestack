/**
 * Resident demand signal API - compatibility routes backed by Oracle vector search.
 */

const express = require('express');
const router = express.Router();
const db = require('../config/database');

const publicAgencyHandleSql = (alias = 'i') => `
CASE
  WHEN LOWER(${alias}.handle) LIKE '@sled_partner_%'
    THEN '@agency_partner_' || SUBSTR(${alias}.handle, LENGTH('@sled_partner_') + 1)
  WHEN LOWER(${alias}.handle) LIKE 'sled_partner_%'
    THEN 'agency_partner_' || SUBSTR(${alias}.handle, LENGTH('sled_partner_') + 1)
  ELSE ${alias}.handle
END`;

const SOURCE_CHANNEL_LABELS = {
  instagram: 'Resident portal',
  tiktok: 'Mobile service app',
  youtube: 'Public meeting record',
  twitter: '311 contact center',
  threads: 'Interagency queue',
};

const PRIORITY_FLAG_LABELS = {
  mega_viral: 'critical',
  viral: 'escalating',
  rising: 'rising',
  normal: 'normal',
};

const PUBLIC_RESPONSE_KEYS = {
  posts: 'signals',
  POST_ID: 'SIGNAL_ID',
  post_id: 'signal_id',
  PLATFORM: 'SOURCE_CHANNEL',
  platform: 'source_channel',
  POST_TEXT: 'SIGNAL_TEXT',
  post_text: 'signal_text',
  POSTED_AT: 'SIGNAL_AT',
  posted_at: 'signal_at',
  LIKES_COUNT: 'ACKNOWLEDGEMENTS_COUNT',
  likes_count: 'acknowledgements_count',
  SHARES_COUNT: 'HANDOFFS_COUNT',
  shares_count: 'handoffs_count',
  COMMENTS_COUNT: 'COMMENTS_COUNT',
  comments_count: 'comments_count',
  VIEWS_COUNT: 'REACH_COUNT',
  views_count: 'reach_count',
  VIRALITY_SCORE: 'PRIORITY_SCORE',
  virality_score: 'priority_score',
  MOMENTUM_FLAG: 'PRIORITY_FLAG',
  momentum_flag: 'priority_flag',
  INFLUENCER_HANDLE: 'PARTNER_HANDLE',
  influencer_handle: 'partner_handle',
  HANDLE: 'HANDLE',
  handle: 'handle',
  INFLUENCER_NAME: 'PARTNER_NAME',
  influencer_name: 'partner_name',
  DISPLAY_NAME: 'PARTNER_NAME',
  display_name: 'partner_name',
  FOLLOWER_COUNT: 'COMMUNITY_REACH',
  follower_count: 'community_reach',
  INFLUENCE_SCORE: 'AUTHORITY_SCORE',
  influence_score: 'authority_score',
  MENTIONED_PRODUCTS: 'MATCHED_SERVICES',
  mentioned_products: 'matched_services',
  PRODUCT_ID: 'SERVICE_ID',
  product_id: 'service_id',
  PRODUCT_NAME: 'SERVICE_NAME',
  product_name: 'service_name',
  BRAND_NAME: 'AGENCY_OR_PROGRAM',
  brand_name: 'agency_or_program',
  UNIT_PRICE: 'ESTIMATED_SERVICE_VALUE',
  unit_price: 'estimated_service_value',
  MENTION_COUNT: 'SIGNAL_MATCH_COUNT',
  mention_count: 'signal_match_count',
  POST_COUNT: 'SIGNAL_COUNT',
  post_count: 'signal_count',
  TOTAL_LIKES: 'TOTAL_ACKNOWLEDGEMENTS',
  total_likes: 'total_acknowledgements',
  TOTAL_SHARES: 'TOTAL_HANDOFFS',
  total_shares: 'total_handoffs',
  TOTAL_VIEWS: 'TOTAL_REACH',
  total_views: 'total_reach',
  VIRAL_COUNT: 'ESCALATION_COUNT',
  viral_count: 'escalation_count',
};

function publicSourceChannel(value) {
  const key = String(value || '').toLowerCase();
  return SOURCE_CHANNEL_LABELS[key] || value;
}

function publicPriorityFlag(value) {
  const key = String(value || '').toLowerCase();
  return PRIORITY_FLAG_LABELS[key] || value;
}

function storedPriorityFlag(value) {
  const key = String(value || '').toLowerCase();
  if (key === 'critical') return 'mega_viral';
  if (key === 'escalating') return 'viral';
  return key || value;
}

function sanitizeSocialPayload(value, mappedKey = '') {
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeSocialPayload(item, mappedKey));
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, entryValue]) => {
      const nextKey = PUBLIC_RESPONSE_KEYS[key] || key;
      return [nextKey, sanitizeSocialPayload(entryValue, nextKey)];
    }));
  }
  if (typeof value === 'string') {
    if (mappedKey === 'SOURCE_CHANNEL' || mappedKey === 'source_channel') {
      return publicSourceChannel(value);
    }
    if (mappedKey === 'PRIORITY_FLAG' || mappedKey === 'priority_flag') {
      return publicPriorityFlag(value);
    }
    return value
      .replace(/@sled_partner_/gi, '@agency_partner_')
      .replace(/\bsled_partner_/gi, 'agency_partner_')
      .replace(/\bFulfillment\b/g, 'Resolution')
      .replace(/\bfulfillment\b/g, 'resolution');
  }
  return value;
}

router.use((req, res, next) => {
  const originalJson = res.json.bind(res);
  res.json = (payload) => originalJson(sanitizeSocialPayload(payload));
  next();
});

// GET /api/social/posts - paginated social feed
router.get('/posts', async (req, res) => {
  try {
    const { page = 1, limit = 20, momentum, platform, sourceChannel, influencer, partner } = req.query;
    const sourceFilter = platform || sourceChannel;
    const partnerFilter = influencer || partner;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    let whereClause = 'WHERE 1=1';
    const binds = { limit: parseInt(limit), offset };

    if (momentum) {
      whereClause += " AND sp.momentum_flag = :momentum";
      binds.momentum = storedPriorityFlag(momentum);
    }
    if (sourceFilter) {
      whereClause += " AND sp.platform = :platform";
      binds.platform = sourceFilter;
    }
    if (partnerFilter) {
      whereClause += ` AND ${publicAgencyHandleSql('i')} = :influencer`;
      binds.influencer = partnerFilter;
    }

    const result = await db.executeAsUser(`
      SELECT sp.post_id, sp.platform, sp.post_text, sp.posted_at,
             sp.likes_count, sp.shares_count, sp.comments_count, sp.views_count,
             sp.sentiment_score, sp.virality_score, sp.momentum_flag,
             ${publicAgencyHandleSql('i')} AS influencer_handle,
             i.display_name AS influencer_name,
             i.follower_count,
             i.influence_score
      FROM social_posts sp
      LEFT JOIN influencers i ON sp.influencer_id = i.influencer_id
      ${whereClause}
      ORDER BY sp.virality_score DESC NULLS LAST, sp.posted_at DESC
      OFFSET :offset ROWS FETCH NEXT :limit ROWS ONLY
    `, binds, req.demoUser);

    // Build count binds without pagination-only vars (limit/offset not in COUNT query)
    const countBinds = { ...binds };
    delete countBinds.limit;
    delete countBinds.offset;

    const countFrom = partnerFilter
      ? `social_posts sp LEFT JOIN influencers i ON sp.influencer_id = i.influencer_id`
      : `social_posts sp`;
    const countResult = await db.executeAsUser(`
      SELECT COUNT(*) AS total FROM ${countFrom} ${whereClause}
    `, countBinds, req.demoUser);

    res.json({
      posts: result.rows,
      total: countResult.rows[0].TOTAL,
      page: parseInt(page),
      limit: parseInt(limit)
    });
  } catch (err) {
    console.error('Resident signals error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/social/influencers - lightweight list of influencer handles for dropdown filters
router.get('/influencers', async (req, res) => {
  try {
    const result = await db.executeAsUser(`
      SELECT ${publicAgencyHandleSql('i')} AS handle, i.platform, i.influence_score
      FROM influencers i
      ORDER BY i.influence_score DESC, i.handle
    `, {}, req.demoUser);
    res.json(result.rows);
  } catch (err) {
    console.error('Community partners list error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/social/priority-signals - urgent resident signals
async function prioritySignalsHandler(req, res) {
  try {
    const hours = parseInt(req.query.hours) || 48;
    const result = await db.executeAsUser(`
      SELECT sp.post_id, sp.platform, sp.post_text, sp.posted_at,
             sp.likes_count, sp.shares_count, sp.comments_count, sp.views_count,
             sp.virality_score, sp.momentum_flag,
             ${publicAgencyHandleSql('i')} AS handle, i.display_name, i.follower_count, i.influence_score,
             (SELECT LISTAGG(p.product_name, ', ') WITHIN GROUP (ORDER BY ppm.confidence_score DESC)
              FROM post_product_mentions ppm
              JOIN products p ON ppm.product_id = p.product_id
              WHERE ppm.post_id = sp.post_id) AS mentioned_products
      FROM social_posts sp
      LEFT JOIN influencers i ON sp.influencer_id = i.influencer_id
      WHERE sp.momentum_flag IN ('viral', 'mega_viral')
        AND sp.posted_at >= (SELECT MAX(posted_at) FROM social_posts) - NUMTODSINTERVAL(:hours, 'HOUR')
      ORDER BY sp.virality_score DESC
      FETCH FIRST 50 ROWS ONLY
    `, { hours }, req.demoUser);

    res.json(result.rows);
  } catch (err) {
    console.error('Priority resident signals error:', err);
    res.status(500).json({ error: err.message });
  }
}
router.get('/viral', prioritySignalsHandler);
router.get('/priority-signals', prioritySignalsHandler);

// GET /api/social/priority-timeline
async function priorityTimelineHandler(req, res) {
  try {
    const result = await db.executeAsUser(`
      SELECT
        TO_CHAR(TRUNC(posted_at, 'HH'), 'YYYY-MM-DD HH24:MI') AS time_bucket,
        momentum_flag,
        COUNT(*) AS post_count,
        SUM(likes_count) AS total_likes,
        SUM(views_count) AS total_views
      FROM social_posts
      WHERE posted_at >= (SELECT MAX(posted_at) FROM social_posts) - INTERVAL '72' HOUR
      GROUP BY TRUNC(posted_at, 'HH'), momentum_flag
      ORDER BY time_bucket, momentum_flag
    `, {}, req.demoUser);

    res.json(result.rows);
  } catch (err) {
    console.error('Priority timeline error:', err);
    res.status(500).json({ error: err.message });
  }
}
router.get('/momentum-timeline', priorityTimelineHandler);
router.get('/priority-timeline', priorityTimelineHandler);

// GET /api/social/source-channel-breakdown
async function sourceChannelBreakdownHandler(req, res) {
  try {
    const result = await db.executeAsUser(`
      SELECT platform,
             COUNT(*) AS post_count,
             SUM(likes_count) AS total_likes,
             SUM(shares_count) AS total_shares,
             SUM(views_count) AS total_views,
             ROUND(AVG(sentiment_score), 3) AS avg_sentiment,
             COUNT(CASE WHEN momentum_flag IN ('viral','mega_viral') THEN 1 END) AS viral_count
      FROM social_posts
      WHERE posted_at >= (SELECT MAX(posted_at) FROM social_posts) - INTERVAL '7' DAY
      GROUP BY platform
      ORDER BY total_views DESC
    `, {}, req.demoUser);

    res.json(result.rows);
  } catch (err) {
    console.error('Source channel breakdown error:', err);
    res.status(500).json({ error: err.message });
  }
}
router.get('/platform-breakdown', sourceChannelBreakdownHandler);
router.get('/source-channel-breakdown', sourceChannelBreakdownHandler);

// POST /api/social/semantic-search - real-time vector similarity search
// Uses Oracle VECTOR_EMBEDDING to embed the query text at runtime,
// then VECTOR_DISTANCE to find the closest product embeddings via ANN index.
router.post('/semantic-search', async (req, res) => {
  try {
    const { query, topK = 10 } = req.body;

    if (!query) {
      return res.status(400).json({ error: 'Query text is required' });
    }

    const result = await db.executeAsUser(`
      SELECT p.product_id,
             p.product_name,
             p.category,
             p.unit_price,
             b.brand_name,
             ROUND(1 - VECTOR_DISTANCE(
               pe.embedding,
               VECTOR_EMBEDDING(ALL_MINILM_L12_V2 USING :query AS DATA),
               COSINE
             ), 4) AS similarity_score,
             pe.embedding_model,
             (SELECT COUNT(*) FROM post_product_mentions ppm
              WHERE ppm.product_id = p.product_id) AS mention_count
      FROM   product_embeddings pe
      JOIN   products p ON pe.product_id = p.product_id
      JOIN   brands   b ON p.brand_id    = b.brand_id
      ORDER  BY VECTOR_DISTANCE(
        pe.embedding,
        VECTOR_EMBEDDING(ALL_MINILM_L12_V2 USING :query2 AS DATA),
        COSINE
      )
      FETCH APPROXIMATE FIRST :topK ROWS ONLY
    `, { query, query2: query, topK }, req.demoUser);

    res.json({
      query,
      model: 'ALL_MINILM_L12_V2',
      dimensions: 384,
      results: result.rows,
    });
  } catch (err) {
    console.error('Semantic search error:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/social/signal-search - vector similarity search over resident signals
// Embeds query at runtime using ALL_MINILM_L12_V2, finds nearest signal vectors via ANN index.
async function signalSearchHandler(req, res) {
  try {
    const { query, topK = 20 } = req.body;

    if (!query) {
      return res.status(400).json({ error: 'Query text is required' });
    }

    const startTime = Date.now();
    const result = await db.executeAsUser(`
      SELECT sp.post_id, sp.platform, sp.post_text, sp.posted_at,
             sp.likes_count, sp.shares_count, sp.comments_count, sp.views_count,
             sp.sentiment_score, sp.virality_score, sp.momentum_flag,
             ${publicAgencyHandleSql('i')} AS influencer_handle, i.display_name AS influencer_name,
             i.follower_count, i.influence_score,
             ROUND(1 - VECTOR_DISTANCE(
               pe.embedding,
               VECTOR_EMBEDDING(ALL_MINILM_L12_V2 USING :query AS DATA),
               COSINE
             ), 4) AS similarity_score
      FROM   post_embeddings pe
      JOIN   social_posts sp ON pe.post_id = sp.post_id
      LEFT JOIN influencers i ON sp.influencer_id = i.influencer_id
      ORDER  BY VECTOR_DISTANCE(
        pe.embedding,
        VECTOR_EMBEDDING(ALL_MINILM_L12_V2 USING :query2 AS DATA),
        COSINE
      )
      FETCH APPROXIMATE FIRST :topK ROWS ONLY
    `, { query, query2: query, topK }, req.demoUser);

    const elapsed = Date.now() - startTime;

    res.json({
      query,
      model: 'ALL_MINILM_L12_V2',
      dimensions: 384,
      posts: result.rows,
      count: result.rows.length,
      elapsed,
    });
  } catch (err) {
    console.error('Resident signal vector search error:', err);
    res.status(500).json({ error: err.message });
  }
}
router.post('/post-search', signalSearchHandler);
router.post('/signal-search', signalSearchHandler);

module.exports = router;
