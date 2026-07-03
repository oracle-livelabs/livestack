/**
 * Production Signals API — signal feed, urgency trends, and vector search
 */

const express = require('express');
const router = express.Router();
const db = require('../config/database');

// GET /api/production-signals — paginated production signal feed
router.get('/', async (req, res) => {
  try {
    const { page = 1, limit = 20, momentum, channel, networkAccount } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    let whereClause = 'WHERE 1=1';
    const binds = { limit: parseInt(limit), offset };

    if (momentum) {
      whereClause += " AND sp.momentum_code = :momentum";
      binds.momentum = momentum;
    }
    if (channel) {
      whereClause += " AND sp.signal_channel_code = :channel";
      binds.channel = channel;
    }
    if (networkAccount) {
      whereClause += " AND i.handle = :networkAccount";
      binds.networkAccount = networkAccount;
    }

    const result = await db.executeAsUser(`
      SELECT sp.production_signal_id, sp.signal_channel_code, sp.signal_text, sp.observed_at,
             sp.acknowledgement_count, sp.propagation_count, sp.response_count, sp.observation_count,
             sp.sentiment_score, sp.urgency_score, sp.momentum_code,
             i.handle AS network_account_handle,
             i.display_name AS network_account_name,
             i.follower_count AS network_account_reach,
             i.influence_score AS network_account_score
      FROM manufacturing_production_signals sp
      LEFT JOIN influencers i ON sp.network_account_id = i.influencer_id
      ${whereClause}
      ORDER BY sp.urgency_score DESC NULLS LAST, sp.observed_at DESC
      OFFSET :offset ROWS FETCH NEXT :limit ROWS ONLY
    `, binds, req.demoUser);

    // Build count binds without pagination-only vars (limit/offset not in COUNT query)
    const countBinds = { ...binds };
    delete countBinds.limit;
    delete countBinds.offset;

    const countFrom = networkAccount
      ? `manufacturing_production_signals sp LEFT JOIN influencers i ON sp.network_account_id = i.influencer_id`
      : `manufacturing_production_signals sp`;
    const countResult = await db.executeAsUser(`
      SELECT COUNT(*) AS total FROM ${countFrom} ${whereClause}
    `, countBinds, req.demoUser);

    res.json({
      signals: result.rows,
      total: countResult.rows[0].TOTAL,
      page: parseInt(page),
      limit: parseInt(limit)
    });
  } catch (err) {
    console.error('Production signals error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/production-signals/network-accounts — source accounts for filters
router.get('/network-accounts', async (req, res) => {
  try {
    const result = await db.executeAsUser(`
      SELECT i.handle,
             i.follower_count AS network_account_reach,
             i.influence_score AS network_account_score
      FROM influencers i
      ORDER BY network_account_score DESC, i.handle
    `, {}, req.demoUser);
    res.json(result.rows);
  } catch (err) {
    console.error('Manufacturing network account list error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/production-signals/urgent — escalating and critical production signals
router.get('/urgent', async (req, res) => {
  try {
    const hours = parseInt(req.query.hours) || 48;
    const result = await db.executeAsUser(`
      SELECT sp.production_signal_id, sp.signal_channel_code, sp.signal_text, sp.observed_at,
             sp.acknowledgement_count, sp.propagation_count, sp.response_count, sp.observation_count,
             sp.urgency_score, sp.momentum_code,
             i.handle AS network_account_handle,
             i.display_name AS network_account_name,
             i.follower_count AS network_account_reach,
             i.influence_score AS network_account_score,
             (SELECT LISTAGG(p.product_name, ', ') WITHIN GROUP (ORDER BY ppm.confidence_score DESC)
              FROM manufacturing_signal_part_mentions ppm
              JOIN products p ON ppm.manufactured_part_id = p.product_id
              WHERE ppm.production_signal_id = sp.production_signal_id) AS mentioned_parts
      FROM manufacturing_production_signals sp
      LEFT JOIN influencers i ON sp.network_account_id = i.influencer_id
      WHERE sp.momentum_code IN ('escalating', 'critical')
        AND sp.observed_at >= (SELECT MAX(observed_at) FROM manufacturing_production_signals) - NUMTODSINTERVAL(:hours, 'HOUR')
      ORDER BY sp.urgency_score DESC
      FETCH FIRST 50 ROWS ONLY
    `, { hours }, req.demoUser);

    res.json(result.rows);
  } catch (err) {
    console.error('Production signal urgency error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/production-signals/momentum-timeline
router.get('/momentum-timeline', async (req, res) => {
  try {
    const result = await db.executeAsUser(`
      SELECT
        TO_CHAR(TRUNC(observed_at, 'HH'), 'YYYY-MM-DD HH24:MI') AS time_bucket,
        momentum_code,
        COUNT(*) AS signal_count,
        SUM(acknowledgement_count) AS total_acknowledgements,
        SUM(observation_count) AS total_observations
      FROM manufacturing_production_signals
      WHERE observed_at >= (SELECT MAX(observed_at) FROM manufacturing_production_signals) - INTERVAL '72' HOUR
      GROUP BY TRUNC(observed_at, 'HH'), momentum_code
      ORDER BY time_bucket, momentum_code
    `, {}, req.demoUser);

    res.json(result.rows);
  } catch (err) {
    console.error('Momentum timeline error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/production-signals/channel-breakdown
router.get('/channel-breakdown', async (req, res) => {
  try {
    const result = await db.executeAsUser(`
      SELECT signal_channel_code,
             COUNT(*) AS signal_count,
             SUM(acknowledgement_count) AS total_acknowledgements,
             SUM(propagation_count) AS total_propagations,
             SUM(observation_count) AS total_observations,
             ROUND(AVG(sentiment_score), 3) AS avg_sentiment,
             COUNT(CASE WHEN momentum_code IN ('escalating','critical') THEN 1 END) AS urgent_signal_count
      FROM manufacturing_production_signals
      WHERE observed_at >= (SELECT MAX(observed_at) FROM manufacturing_production_signals) - INTERVAL '7' DAY
      GROUP BY signal_channel_code
      ORDER BY total_observations DESC
    `, {}, req.demoUser);

    res.json(result.rows);
  } catch (err) {
    console.error('Signal channel breakdown error:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/production-signals/semantic-search — real-time vector similarity search
// Uses Oracle VECTOR_EMBEDDING to embed the query text at runtime,
// then VECTOR_DISTANCE to find the closest manufactured part vectors via ANN index.
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
             (SELECT COUNT(*) FROM manufacturing_signal_part_mentions ppm
              WHERE ppm.manufactured_part_id = p.product_id) AS signal_count
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

// POST /api/production-signals/signal-search — vector similarity search over production signals.
// Embeds query at runtime using ALL_MINILM_L12_V2, finds nearest production signal vectors via ANN index.
router.post('/signal-search', async (req, res) => {
  try {
    const { query, topK = 20 } = req.body;

    if (!query) {
      return res.status(400).json({ error: 'Query text is required' });
    }

    const startTime = Date.now();
    const result = await db.executeAsUser(`
      SELECT sp.production_signal_id, sp.signal_channel_code, sp.signal_text, sp.observed_at,
             sp.acknowledgement_count, sp.propagation_count, sp.response_count, sp.observation_count,
             sp.sentiment_score, sp.urgency_score, sp.momentum_code,
             i.handle AS network_account_handle, i.display_name AS network_account_name,
             i.follower_count AS network_account_reach,
             i.influence_score AS network_account_score,
             ROUND(1 - VECTOR_DISTANCE(
               pe.embedding,
               VECTOR_EMBEDDING(ALL_MINILM_L12_V2 USING :query AS DATA),
               COSINE
             ), 4) AS similarity_score
      FROM   manufacturing_signal_embeddings pe
      JOIN   manufacturing_production_signals sp ON pe.production_signal_id = sp.production_signal_id
      LEFT JOIN influencers i ON sp.network_account_id = i.influencer_id
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
      signals: result.rows,
      count: result.rows.length,
      elapsed,
    });
  } catch (err) {
    console.error('Production signal vector search error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
