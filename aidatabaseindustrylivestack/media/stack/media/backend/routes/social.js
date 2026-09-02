/**
 * Social Posts API — Social listening, trends, and vector search
 */

const express = require('express');
const router = express.Router();
const db = require('../config/database');
const { featureUnavailable } = require('../lib/featureUnavailable');
const { executeWithExactPlanEvidence } = require('../lib/exactPlanEvidence');
const {
  assertMediaVectorEvidence,
  collectMediaVectorScopeEvidence,
  readMediaGlobalVectorAnchor,
} = require('../lib/mediaVectorEvidence');

function globalAnchorResponse(globalAnchor) {
  return {
    generationId: globalAnchor.generationId,
    datasetFingerprint: globalAnchor.datasetFingerprint,
    tableName: globalAnchor.objectName,
    indexName: globalAnchor.indexName,
    planOperation: globalAnchor.planOperation,
    resultRowCount: globalAnchor.resultRowCount,
    exactPlanFingerprint: globalAnchor.exactPlanFingerprint,
  };
}

// GET /api/social/posts — paginated social feed
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
    return featureUnavailable(res, {
      feature: 'APPLICATION_CONTEXT_VPD',
      source: 'MEDIA_APP_CTX + DBMS_RLS',
      message: 'VPD-governed audience signals are unavailable.',
    });
  }
});

// GET /api/social/influencers — lightweight list of influencer handles for releasedown filters
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

// GET /api/social/viral — viral and mega_viral posts
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

// POST /api/social/semantic-search — real-time vector similarity search
// Uses Oracle VECTOR_EMBEDDING to embed the query text at runtime,
// then VECTOR_DISTANCE to find the closest product embeddings via ANN index.
router.post('/semantic-search', async (req, res) => {
  try {
    const { query, topK = 10 } = req.body;

    if (!query) {
      return res.status(400).json({ error: 'Query text is required' });
    }
    const boundedTopK = Number(topK);
    if (!Number.isInteger(boundedTopK) || boundedTopK < 1 || boundedTopK > 50) {
      return res.status(400).json({ error: 'topK must be an integer from 1 to 50' });
    }

    const generationId = req.activeGenerationId;
    if (!generationId) throw new Error('Active dataset generation is unavailable');
    const globalAnchor = await readMediaGlobalVectorAnchor({
      expectedGenerationId: generationId,
    });
    const scopedResult = await db.withUserConnection(
      req.demoUser,
      async ({ connection }) => {
        const scopedEvidence = assertMediaVectorEvidence(
          await collectMediaVectorScopeEvidence(connection, {
            accessScope: req.demoIdentity?.accessScope || 'RESTRICTED',
            generationId,
            datasetFingerprint: globalAnchor.datasetFingerprint,
          }),
          { globalAnchor }
        );
        if (scopedEvidence.scopedEmpty) {
          return { scopedEvidence, proof: null };
        }
        const proof = await executeWithExactPlanEvidence(connection, {
        generationId,
        datasetFingerprint: globalAnchor.datasetFingerprint,
        feature: 'VECTOR_SEARCH_API',
        sql: `
      SELECT candidates.product_id,
             p.product_name,
             p.category,
             p.unit_price,
             b.brand_name,
             candidates.similarity_score,
             candidates.embedding_model,
             (SELECT COUNT(*) FROM post_product_mentions ppm
              WHERE ppm.product_id = candidates.product_id) AS mention_count
      FROM (
        SELECT /*+ GATHER_PLAN_STATISTICS
                   VECTOR_INDEX_TRANSFORM(pe idx_product_vec) */
               pe.product_id,
               ROUND(1 - VECTOR_DISTANCE(
                 pe.embedding,
                 VECTOR_EMBEDDING(ALL_MINILM_L12_V2 USING :query AS DATA),
                 COSINE
               ), 4) AS similarity_score,
               pe.embedding_model
        FROM   product_embeddings pe
        ORDER  BY VECTOR_DISTANCE(
          pe.embedding,
          VECTOR_EMBEDDING(ALL_MINILM_L12_V2 USING :query2 AS DATA),
          COSINE
        )
        FETCH APPROXIMATE FIRST :topK ROWS ONLY
      ) candidates
      JOIN products p ON p.product_id = candidates.product_id
      JOIN brands b ON b.brand_id = p.brand_id
      ORDER BY candidates.similarity_score DESC, candidates.product_id
    `,
        binds: { query, query2: query, topK: boundedTopK },
        requiredPlan: (row) => /VECTOR/i.test(String(row.OPTIONS || ''))
          || String(row.OBJECT_NAME || '').toUpperCase() === 'IDX_PRODUCT_VEC',
        requiredIndexName: 'IDX_PRODUCT_VEC',
        requiredTableName: 'PRODUCT_EMBEDDINGS',
        indexBindings: globalAnchor.indexBindings,
        forbiddenFullScanTables: [
          'PRODUCT_EMBEDDINGS',
          'POST_EMBEDDINGS',
        ],
        requireNonEmptyResult: true,
        persist: false,
        });
        return { scopedEvidence, proof };
      }
    );
    if (scopedResult.scopedEvidence.scopedEmpty) {
      return res.json({
        query,
        model: 'ALL_MINILM_L12_V2',
        dimensions: 384,
        results: [],
        scopeStatus: 'SCOPED_NO_VISIBLE_VECTOR_DATA',
        globalAnchor: globalAnchorResponse(globalAnchor),
      });
    }
    const { proof } = scopedResult;

    res.json({
      query,
      model: 'ALL_MINILM_L12_V2',
      dimensions: 384,
      results: proof.result.rows,
      scopeStatus: scopedResult.scopedEvidence.scopeStatus,
      globalAnchor: globalAnchorResponse(globalAnchor),
      evidence: {
        ...proof.evidence,
        model: 'ALL_MINILM_L12_V2',
        dimensions: 384,
        resultCount: proof.result.rows.length,
      },
    });
  } catch (err) {
    console.error('Semantic search error:', err);
    featureUnavailable(res, {
      feature: 'AI_VECTOR_SEARCH',
      source: 'IDX_PRODUCT_VEC',
      correlationId: req.headers['x-correlation-id'] || null,
      message: 'Native Oracle AI Vector Search is unavailable.',
    });
  }
});

// POST /api/social/post-search — vector similarity search over social posts
// Embeds query at runtime using ALL_MINILM_L12_V2, finds nearest post_embeddings via ANN index.
router.post('/post-search', async (req, res) => {
  try {
    const { query, topK = 20 } = req.body;

    if (!query) {
      return res.status(400).json({ error: 'Query text is required' });
    }
    const boundedTopK = Number(topK);
    if (!Number.isInteger(boundedTopK) || boundedTopK < 1 || boundedTopK > 50) {
      return res.status(400).json({ error: 'topK must be an integer from 1 to 50' });
    }

    const generationId = req.activeGenerationId;
    if (!generationId) throw new Error('Active dataset generation is unavailable');
    const startTime = Date.now();
    const globalAnchor = await readMediaGlobalVectorAnchor({
      expectedGenerationId: generationId,
    });
    const scopedResult = await db.withUserConnection(
      req.demoUser,
      async ({ connection }) => {
        const scopedEvidence = assertMediaVectorEvidence(
          await collectMediaVectorScopeEvidence(connection, {
            accessScope: req.demoIdentity?.accessScope || 'RESTRICTED',
            generationId,
            datasetFingerprint: globalAnchor.datasetFingerprint,
          }),
          { globalAnchor }
        );
        if (scopedEvidence.scopedEmpty) {
          return { scopedEvidence, proof: null };
        }
        const proof = await executeWithExactPlanEvidence(connection, {
        generationId,
        datasetFingerprint: globalAnchor.datasetFingerprint,
        feature: 'POST_VECTOR_SEARCH_API',
        sql: `
      SELECT candidates.post_id,
             sp.platform, sp.post_text, sp.posted_at,
             sp.likes_count, sp.shares_count, sp.comments_count, sp.views_count,
             sp.sentiment_score, sp.virality_score, sp.momentum_flag,
             i.handle AS influencer_handle, i.display_name AS influencer_name,
             i.follower_count, i.influence_score,
             candidates.similarity_score
      FROM (
        SELECT /*+ GATHER_PLAN_STATISTICS
                   VECTOR_INDEX_TRANSFORM(pe idx_post_vec) */
               pe.post_id,
               ROUND(1 - VECTOR_DISTANCE(
                 pe.embedding,
                 VECTOR_EMBEDDING(ALL_MINILM_L12_V2 USING :query AS DATA),
                 COSINE
               ), 4) AS similarity_score
        FROM   post_embeddings pe
        ORDER  BY VECTOR_DISTANCE(
          pe.embedding,
          VECTOR_EMBEDDING(ALL_MINILM_L12_V2 USING :query2 AS DATA),
          COSINE
        )
        FETCH APPROXIMATE FIRST :topK ROWS ONLY
      ) candidates
      JOIN social_posts sp ON sp.post_id = candidates.post_id
      LEFT JOIN influencers i ON i.influencer_id = sp.influencer_id
      ORDER BY candidates.similarity_score DESC, candidates.post_id
    `,
        binds: { query, query2: query, topK: boundedTopK },
        requiredPlan: (row) => /VECTOR/i.test(String(row.OPTIONS || ''))
          || String(row.OBJECT_NAME || '').toUpperCase() === 'IDX_POST_VEC',
        requiredIndexName: 'IDX_POST_VEC',
        requiredTableName: 'POST_EMBEDDINGS',
        indexBindings: globalAnchor.indexBindings,
        forbiddenFullScanTables: [
          'PRODUCT_EMBEDDINGS',
          'POST_EMBEDDINGS',
        ],
        requireNonEmptyResult: true,
        persist: false,
        });
        return { scopedEvidence, proof };
      }
    );

    const elapsed = Date.now() - startTime;
    if (scopedResult.scopedEvidence.scopedEmpty) {
      return res.json({
        query,
        model: 'ALL_MINILM_L12_V2',
        dimensions: 384,
        posts: [],
        count: 0,
        elapsed,
        scopeStatus: 'SCOPED_NO_VISIBLE_VECTOR_DATA',
        globalAnchor: globalAnchorResponse(globalAnchor),
      });
    }
    const { proof } = scopedResult;

    res.json({
      query,
      model: 'ALL_MINILM_L12_V2',
      dimensions: 384,
      posts: proof.result.rows,
      count: proof.result.rows.length,
      elapsed,
      scopeStatus: scopedResult.scopedEvidence.scopeStatus,
      globalAnchor: globalAnchorResponse(globalAnchor),
      evidence: proof.evidence,
    });
  } catch (err) {
    console.error('Post vector search error:', err);
    featureUnavailable(res, {
      feature: 'AI_VECTOR_SEARCH',
      source: 'IDX_POST_VEC',
      correlationId: req.headers['x-correlation-id'] || null,
      message: 'Native Oracle AI Vector Search is unavailable.',
    });
  }
});

module.exports = router;
