/**
 * Social Posts API - Social listening, trends, and vector search
 */

const express = require('express');
const router = express.Router();
const db = require('../config/database');
const {
  capturePreviousCursor,
  classifyVectorPlan,
} = require('../lib/featurePlanEvidenceService');
const {
  VECTOR_MODEL_NAME,
  VECTOR_DIMENSIONS,
  VectorEvidenceError,
  assertVectorReadiness,
  readGlobalVectorAnchor,
} = require('../lib/vectorEvidenceService');

function boundedTopK(value, fallback) {
  const parsed = Number.parseInt(value ?? fallback, 10);
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= 50 ? parsed : null;
}

function scopeRequiresGlobalAnchor(accessScope) {
  return ['RESTRICTED', 'NONE'].includes(
    String(accessScope || '').trim().toUpperCase()
  );
}

function requirePositivePlanHash(proof) {
  const planHashValue = Number(proof?.planHashValue);
  if (!Number.isInteger(planHashValue) || planHashValue <= 0) {
    throw new VectorEvidenceError(
      'The exact Oracle Vector plan hash is unavailable.',
      { planHashValue: proof?.planHashValue ?? null },
      'VECTOR_CAPABILITY_UNAVAILABLE'
    );
  }
  return proof;
}

async function executeVectorSearch(
  username,
  sql,
  binds,
  planTarget = {},
  accessScope = 'GLOBAL'
) {
  const globalAnchor = scopeRequiresGlobalAnchor(accessScope)
    ? await readGlobalVectorAnchor()
    : null;
  return db.withUserConnection(username, async ({ connection, execute }) => {
    const readiness = await assertVectorReadiness({
      connection,
      execute,
      readGlobalAnchor: async () => globalAnchor,
      generationId: globalAnchor?.generationId || null,
      datasetFingerprint: globalAnchor?.datasetFingerprint || null,
    });
    if (readiness.scope?.scopedEmpty) {
      return {
        result: { rows: [] },
        proof: null,
        readiness,
        scopedEmpty: true,
      };
    }
    const result = await execute(sql, binds);
    if (!result.rows?.length) {
      throw new VectorEvidenceError(
        'The Oracle Vector search returned no rows for visible source data.',
        readiness,
        'VECTOR_SEARCH_RETURNED_NO_ROWS'
      );
    }
    const cursor = await capturePreviousCursor(connection, 'AI_VECTOR_SEARCH');
    const proof = classifyVectorPlan({
      ...cursor,
      resultRowCount: result.rows.length,
    }, {
      ...planTarget,
      indexBindings: readiness.catalog?.indexBindings,
    });
    requirePositivePlanHash(proof);
    return {
      result,
      proof,
      readiness,
      scopedEmpty: false,
    };
  }, { readOnly: true });
}

function handleVectorUnavailable(res, err) {
  if (err instanceof VectorEvidenceError
      || err?.code === 'VECTOR_CAPABILITY_UNAVAILABLE'
      || err?.code === 'VECTOR_SEARCH_RETURNED_NO_ROWS'
      || err?.code === 'FEATURE_PLAN_UNAVAILABLE'
      || /ORA-40284|ORA-519|ORA-00942|ORA-04063|vector.*index|model does not exist/i.test(String(err.message || ''))) {
    return res.status(503).json({
      category: 'FEATURE_UNAVAILABLE',
      feature: 'AI_VECTOR_SEARCH',
      available: false,
      code: 'VECTOR_CAPABILITY_UNAVAILABLE',
      reasonCode: err?.code || null,
      error: 'The Oracle Vector model, embeddings, or exact cursor plan are unavailable.',
      details: err?.details || null,
    });
  }
  return res.status(500).json({
    category: 'DATABASE_ERROR',
    feature: 'AI_VECTOR_SEARCH',
    available: false,
    error: 'Vector search failed.',
  });
}

// GET /api/social/posts - paginated social feed
router.get('/posts', async (req, res) => {
  try {
    const { page = 1, limit = 20, momentum, platform, influencer } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    let whereClause = 'WHERE 1=1';
    const binds = { limit: parseInt(limit), offset };

    if (momentum) {
      whereClause += " AND sp.momentum_flag = :momentum";
      binds.momentum = momentum;
    }
    if (platform) {
      whereClause += " AND sp.platform = :platform";
      binds.platform = platform;
    }
    if (influencer) {
      whereClause += " AND i.handle = :influencer";
      binds.influencer = influencer;
    }

    const result = await db.executeAsUser(`
      SELECT sp.post_id, sp.platform, sp.post_text, sp.posted_at,
             sp.likes_count, sp.shares_count, sp.comments_count, sp.views_count,
             sp.sentiment_score, sp.virality_score, sp.momentum_flag,
             i.handle AS influencer_handle,
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

    const countFrom = influencer
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
    console.error('Social posts error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/social/influencers - lightweight list of influencer handles for dropdown filters
router.get('/influencers', async (req, res) => {
  try {
    const result = await db.executeAsUser(`
      SELECT i.handle, i.platform, i.influence_score
      FROM influencers i
      ORDER BY i.influence_score DESC, i.handle
    `, {}, req.demoUser);
    res.json(result.rows);
  } catch (err) {
    console.error('Social influencers list error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/social/viral - viral and mega_viral posts
router.get('/viral', async (req, res) => {
  try {
    const hours = parseInt(req.query.hours) || 48;
    const result = await db.executeAsUser(`
      SELECT sp.post_id, sp.platform, sp.post_text, sp.posted_at,
             sp.likes_count, sp.shares_count, sp.comments_count, sp.views_count,
             sp.virality_score, sp.momentum_flag,
             i.handle, i.display_name, i.follower_count, i.influence_score,
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
    console.error('Viral posts error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/social/momentum-timeline
router.get('/momentum-timeline', async (req, res) => {
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
    console.error('Momentum timeline error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/social/platform-breakdown
router.get('/platform-breakdown', async (req, res) => {
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
    console.error('Platform breakdown error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.get('/vector-readiness', async (req, res) => {
  try {
    const globalAnchor = scopeRequiresGlobalAnchor(
      req.demoIdentity?.accessScope
    )
      ? await readGlobalVectorAnchor()
      : null;
    const readiness = await db.withUserConnection(
      req.demoUser,
      ({ connection, execute }) => assertVectorReadiness({
        connection,
        execute,
        readGlobalAnchor: async () => globalAnchor,
        generationId: globalAnchor?.generationId || null,
        datasetFingerprint: globalAnchor?.datasetFingerprint || null,
      }),
      { readOnly: true }
    );
    requirePositivePlanHash(
      readiness.scope?.scopedEmpty
        ? readiness.scope?.globalAnchor?.currentPlan
        : readiness.planEvidence
    );
    return res.json(readiness);
  } catch (err) {
    return handleVectorUnavailable(res, err);
  }
});

// POST /api/social/semantic-search - real-time vector similarity search
// Uses Oracle VECTOR_EMBEDDING to embed the query text at runtime,
// then VECTOR_DISTANCE to find the closest product embeddings via ANN index.
router.post('/semantic-search', async (req, res) => {
  try {
    const { query, topK = 10 } = req.body;
    const limit = boundedTopK(topK, 10);

    if (!String(query || '').trim() || !limit) {
      return res.status(400).json({
        category: 'INVALID_REQUEST', feature: 'AI_VECTOR_SEARCH', available: true,
        error: 'Query text is required and topK must be an integer from 1 through 50.',
      });
    }

    const search = await executeVectorSearch(req.demoUser, `
      SELECT product_id, product_name, category, unit_price, brand_name,
             ROUND(1 - distance_score, 4) similarity_score,
             embedding_model, mention_count
      FROM (
        SELECT ranked.product_id, p.product_name, p.category, p.unit_price,
               b.brand_name, ranked.embedding_model,
               (SELECT COUNT(*) FROM post_product_mentions ppm
                WHERE ppm.product_id = p.product_id) mention_count,
               ranked.distance_score
        FROM (
          SELECT /*+ GATHER_PLAN_STATISTICS
                     VECTOR_INDEX_TRANSFORM(pe IDX_PRODUCT_VEC PRE_FILTER_WITHOUT_JOIN_BACK) */
                 pe.product_id,
                 pe.embedding_model,
                 VECTOR_DISTANCE(
                   pe.embedding,
                   VECTOR_EMBEDDING(ALL_MINILM_L12_V2 USING :query AS DATA),
                   COSINE
                 ) distance_score
          FROM product_embeddings pe
          ORDER BY distance_score
          FETCH APPROXIMATE FIRST :topK ROWS ONLY
          /* RETAIL_PRODUCT_VECTOR_PROOF */
        ) ranked
        JOIN products p ON ranked.product_id = p.product_id
        JOIN brands b ON p.brand_id = b.brand_id
      )
      ORDER BY distance_score, product_id
    `, { query: String(query).trim(), topK: limit }, {},
    req.demoIdentity?.accessScope);

    if (search.scopedEmpty) {
      return res.json({
        query: String(query).trim(),
        available: true,
        ready: true,
        feature: 'AI_VECTOR_SEARCH',
        code: 'SCOPED_NO_VISIBLE_VECTOR_DATA',
        source: 'ORACLE_METADATA_AND_VPD_SCOPE',
        scope: search.readiness.scope,
        results: [],
      });
    }

    return res.json({
      query,
      available: true,
      ready: true,
      feature: 'AI_VECTOR_SEARCH',
      source: 'ORACLE_VECTOR_SEARCH',
      model: VECTOR_MODEL_NAME,
      dimensions: VECTOR_DIMENSIONS,
      readiness: search.readiness,
      proof: search.proof,
      results: search.result.rows,
    });
  } catch (err) {
    console.error('Semantic search error:', err);
    return handleVectorUnavailable(res, err);
  }
});

// POST /api/social/post-search - vector similarity search over social posts
// Embeds query at runtime using ALL_MINILM_L12_V2, finds nearest post_embeddings via ANN index.
router.post('/post-search', async (req, res) => {
  try {
    const { query, topK = 20 } = req.body;
    const limit = boundedTopK(topK, 20);

    if (!String(query || '').trim() || !limit) {
      return res.status(400).json({
        category: 'INVALID_REQUEST', feature: 'AI_VECTOR_SEARCH', available: true,
        error: 'Query text is required and topK must be an integer from 1 through 50.',
      });
    }

    const startTime = Date.now();
    const search = await executeVectorSearch(req.demoUser, `
      SELECT post_id, platform, post_text, posted_at, likes_count, shares_count,
             comments_count, views_count, sentiment_score, virality_score,
             momentum_flag, influencer_handle, influencer_name, follower_count,
             influence_score, ROUND(1 - distance_score, 4) similarity_score
      FROM (
        SELECT ranked.post_id, sp.platform, sp.post_text, sp.posted_at,
               sp.likes_count, sp.shares_count, sp.comments_count, sp.views_count,
               sp.sentiment_score, sp.virality_score, sp.momentum_flag,
               i.handle influencer_handle, i.display_name influencer_name,
               i.follower_count, i.influence_score,
               ranked.distance_score
        FROM (
          SELECT /*+ GATHER_PLAN_STATISTICS
                     VECTOR_INDEX_TRANSFORM(pe IDX_POST_VEC PRE_FILTER_WITHOUT_JOIN_BACK) */
                 pe.post_id,
                 VECTOR_DISTANCE(
                   pe.embedding,
                   VECTOR_EMBEDDING(ALL_MINILM_L12_V2 USING :query AS DATA),
                   COSINE
                 ) distance_score
          FROM post_embeddings pe
          ORDER BY distance_score
          FETCH APPROXIMATE FIRST :topK ROWS ONLY
          /* RETAIL_POST_VECTOR_PROOF */
        ) ranked
        JOIN social_posts sp ON ranked.post_id = sp.post_id
        LEFT JOIN influencers i ON sp.influencer_id = i.influencer_id
      )
      ORDER BY distance_score, post_id
    `, { query: String(query).trim(), topK: limit }, {
      objectName: 'POST_EMBEDDINGS',
      indexName: 'IDX_POST_VEC',
    }, req.demoIdentity?.accessScope);

    const elapsed = Date.now() - startTime;

    if (search.scopedEmpty) {
      return res.json({
        query: String(query).trim(),
        available: true,
        ready: true,
        feature: 'AI_VECTOR_SEARCH',
        code: 'SCOPED_NO_VISIBLE_VECTOR_DATA',
        source: 'ORACLE_METADATA_AND_VPD_SCOPE',
        scope: search.readiness.scope,
        posts: [],
        count: 0,
        elapsed,
      });
    }

    return res.json({
      query,
      available: true,
      ready: true,
      feature: 'AI_VECTOR_SEARCH',
      source: 'ORACLE_VECTOR_SEARCH',
      model: VECTOR_MODEL_NAME,
      dimensions: VECTOR_DIMENSIONS,
      readiness: search.readiness,
      proof: search.proof,
      posts: search.result.rows,
      count: search.result.rows.length,
      elapsed,
    });
  } catch (err) {
    console.error('Post vector search error:', err);
    return handleVectorUnavailable(res, err);
  }
});

module.exports = router;
