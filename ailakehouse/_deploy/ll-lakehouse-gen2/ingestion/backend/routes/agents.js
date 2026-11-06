/** Agents API — Oracle Select AI Agent orchestration through OCI GenAI. */

const express = require('express');
const router = express.Router();
const db = require('../config/database');
const {
  ensureNativeAgentRuntime,
  nativeProfileCatalogEntry,
  nativeTeams,
  runNativeAgentQuestion,
} = require('../lib/appAgentService');

const STATIC_TEAMS = [
  {
    TEAM_NAME: 'RETAIL_RESPONSE_TEAM',
    STATUS: 'ENABLED',
    DESCRIPTION: 'Two agents turn one product demand signal into an inventory response.',
  },
];

// ── Helper: log an action to agent_actions ──
async function logAction(agentName, actionType, entityType, entityId, payload, confidence = 0.90) {
  try {
    await db.execute(
      `INSERT INTO agent_actions
         (agent_name, action_type, entity_type, entity_id, decision_payload,
          confidence, execution_status, executed_at)
       VALUES
         (:agent, :type, :etype, :eid, :payload, :conf, 'completed', SYSTIMESTAMP)`,
      {
        agent:   agentName,
        type:    actionType,
        etype:   entityType || null,
        eid:     entityId   || null,
        payload: JSON.stringify(payload),
        conf:    confidence,
      }
    );
  } catch (err) {
    console.error('logAction error:', err.message);
  }
}

// ── Helper: insert into event_stream ──
async function logEvent(eventType, eventSource, eventData) {
  try {
    await db.execute(
      `INSERT INTO event_stream (event_type, event_source, event_data, processed)
       VALUES (:etype, :esrc, :edata, 1)`,
      {
        etype: eventType,
        esrc:  eventSource,
        edata: JSON.stringify(eventData),
      }
    );
  } catch (err) {
    console.error('logEvent error:', err.message);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/agents/detect-trends
// Deterministic demand-signal analysis; the focused team is run through /chat.
// ─────────────────────────────────────────────────────────────────────────────
router.post('/detect-trends', async (req, res) => {
  const { windowHours = 24, viralThreshold = 75 } = req.body;
  const hours     = parseInt(windowHours);
  const threshold = parseInt(viralThreshold);

  try {
    // 1. PL/SQL trend detection (always reliable)
    const trendResult = await db.execute(
      `SELECT detect_trending_products(:hours, :threshold) AS result FROM dual`,
      { hours, threshold }
    );
    const trendText = trendResult.rows[0]?.RESULT || 'No trending products found';

    // 2. Get top trending products for per-product action logging
    const productsResult = await db.execute(
      `SELECT /*+ NO_PARALLEL */ p.product_id, p.product_name, b.brand_name,
              COUNT(DISTINCT sp.post_id)        AS mention_count,
              ROUND(AVG(sp.virality_score), 1)  AS avg_virality,
              SUM(sp.views_count)               AS total_views,
              MAX(sp.momentum_flag)             AS peak_momentum
       FROM post_product_mentions ppm
       JOIN social_posts sp ON ppm.post_id    = sp.post_id
       JOIN products p      ON ppm.product_id = p.product_id
       JOIN brands b        ON p.brand_id     = b.brand_id
       WHERE sp.posted_at >= (SELECT MAX(posted_at) FROM social_posts) - NUMTODSINTERVAL(:hours, 'HOUR')
         AND sp.virality_score >= :threshold
       GROUP BY p.product_id, p.product_name, b.brand_name
       ORDER BY avg_virality DESC
       FETCH FIRST 5 ROWS ONLY`,
      { hours, threshold }
    );
    const products = productsResult.rows || [];

    // 3. Momentum distribution for the result banner
    const distResult = await db.execute(
      `SELECT /*+ NO_PARALLEL */ momentum_flag, COUNT(*) AS post_count
       FROM social_posts
       WHERE posted_at >= (SELECT MAX(posted_at) FROM social_posts) - NUMTODSINTERVAL(:hours, 'HOUR')
       GROUP BY momentum_flag
       ORDER BY post_count DESC`,
      { hours }
    );

    // 4. Log per-product actions
    const agentAnalysis = null;
    const loggedActions = [];
    for (const p of products) {
      const confidence = p.AVG_VIRALITY > 80 ? 0.95 : p.AVG_VIRALITY > 60 ? 0.85 : 0.75;
      await logAction('trend_detection_agent', 'detect_trends', 'product', p.PRODUCT_ID, {
        product_name:  p.PRODUCT_NAME,
        brand:         p.BRAND_NAME,
        mention_count: p.MENTION_COUNT,
        avg_virality:  p.AVG_VIRALITY,
        total_views:   p.TOTAL_VIEWS,
        peak_momentum: p.PEAK_MOMENTUM,
        window_hours:  hours,
        reason: `${p.PEAK_MOMENTUM} sporting goods product signal with ${p.MENTION_COUNT} demand signals and demand priority ${p.AVG_VIRALITY}`,
      }, confidence);
      loggedActions.push({ product: p.PRODUCT_NAME, virality: p.AVG_VIRALITY });
    }

    // 6. Log the overall run summary
    await logAction('trend_detection_agent', 'trend_analysis_complete', 'social_posts', null, {
      window_hours:   hours,
      viral_threshold: threshold,
      products_found:  products.length,
      reason: agentAnalysis || trendText.slice(0, 500),
    }, 0.90);

    // 7. Emit event
    await logEvent('trend_detected', 'trend_detection_agent', {
      window_hours:   hours,
      threshold,
      products_found: products.length,
      triggered_at:   new Date().toISOString(),
    });

    res.json({
      message:      `Signal detection complete - ${products.length} critical sporting goods product signals identified in last ${hours}h`,
      trending:     trendText,
      analysis:     agentAnalysis,
      actions:      loggedActions,
      distribution: distResult.rows,
    });

  } catch (err) {
    console.error('detect-trends error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/agents/run-cycle
// Deterministic signal detection, inventory check, and order attribution.
// ─────────────────────────────────────────────────────────────────────────────
router.post('/run-cycle', async (req, res) => {
  const allActions = [];

  try {
    // ── PHASE 1: Trend Detection ─────────────────────────────────────────────
    const trendResult = await db.execute(
      `SELECT detect_trending_products(48, 50) AS result FROM dual`
    );
    const trendText = trendResult.rows[0]?.RESULT || '';

    const topProductsResult = await db.execute(
      `SELECT /*+ NO_PARALLEL */ p.product_id, p.product_name, b.brand_name,
              COUNT(DISTINCT sp.post_id)       AS mention_count,
              ROUND(AVG(sp.virality_score), 1) AS avg_virality,
              MAX(sp.momentum_flag)            AS peak_momentum
       FROM post_product_mentions ppm
       JOIN social_posts sp ON ppm.post_id    = sp.post_id
       JOIN products p      ON ppm.product_id = p.product_id
       JOIN brands b        ON p.brand_id     = b.brand_id
       WHERE sp.posted_at >= (SELECT MAX(posted_at) FROM social_posts) - INTERVAL '48' HOUR
         AND sp.virality_score >= 50
       GROUP BY p.product_id, p.product_name, b.brand_name
       ORDER BY avg_virality DESC
       FETCH FIRST 5 ROWS ONLY`
    );
    const topProducts = topProductsResult.rows || [];

    const trendAnalysis = null;

    for (const p of topProducts) {
      await logAction('trend_detection_agent', 'detect_trends', 'product', p.PRODUCT_ID, {
        product_name:  p.PRODUCT_NAME,
        brand:         p.BRAND_NAME,
        mention_count: p.MENTION_COUNT,
        avg_virality:  p.AVG_VIRALITY,
        peak_momentum: p.PEAK_MOMENTUM,
        reason: `Detected via full cycle - ${p.PEAK_MOMENTUM} with criticality ${p.AVG_VIRALITY}`,
      }, p.AVG_VIRALITY > 80 ? 0.95 : 0.85);
      allActions.push({ phase: 'trends', product: p.PRODUCT_NAME });
    }

    await logEvent('trend_detected', 'master_orchestrator', {
      phase: 'trend_detection', products_found: topProducts.length,
    });

    // ── PHASE 2: Inventory Check ─────────────────────────────────────────────
    const inventoryResult = await db.execute(
      `SELECT /*+ NO_PARALLEL */ p.product_id, p.product_name,
              fc.center_name, fc.city,
              i.quantity_on_hand, i.quantity_reserved,
              i.reorder_point,
              CASE
                WHEN i.quantity_on_hand = 0                          THEN 'out_of_capacity'
                WHEN i.quantity_on_hand <= i.reorder_point * 0.5    THEN 'critical'
                WHEN i.quantity_on_hand <= i.reorder_point          THEN 'low'
                ELSE 'ok'
              END AS capacity_status
       FROM inventory i
       JOIN products p             ON i.product_id = p.product_id
       JOIN fulfillment_centers fc ON i.center_id  = fc.center_id
       WHERE i.quantity_on_hand <= i.reorder_point
         AND p.product_id IN (
           SELECT /*+ NO_PARALLEL */ DISTINCT ppm.product_id
           FROM post_product_mentions ppm
           JOIN social_posts sp ON ppm.post_id = sp.post_id
           WHERE sp.posted_at >= (SELECT MAX(posted_at) FROM social_posts) - INTERVAL '48' HOUR
             AND sp.virality_score >= 50
         )
       ORDER BY i.quantity_on_hand ASC
       FETCH FIRST 10 ROWS ONLY`
    );
    const criticalInventory = inventoryResult.rows || [];

    const fulfillmentAnalysis = null;

    for (const inv of criticalInventory) {
      await logAction('inventory_agent', 'inventory_alert', 'inventory', inv.PRODUCT_ID, {
        product_name:       inv.PRODUCT_NAME,
        center:             inv.CENTER_NAME,
        quantity_on_hand:   inv.QUANTITY_ON_HAND,
        quantity_reserved:  inv.QUANTITY_RESERVED,
        reorder_point:      inv.REORDER_POINT,
        capacity_status:       inv.STOCK_STATUS,
        strategy:           `Pre-position capacity at ${inv.CENTER_NAME} - critical sporting goods product with ${inv.STOCK_STATUS} inventory`,
        reason: `${inv.STOCK_STATUS} capacity (${inv.QUANTITY_ON_HAND} units) for critical sporting goods product at ${inv.CENTER_NAME}`,
      }, inv.STOCK_STATUS === 'out_of_capacity' ? 0.98 : 0.92);
      allActions.push({ phase: 'inventory', product: inv.PRODUCT_NAME, status: inv.STOCK_STATUS });
    }

    await logEvent('inventory_alert', 'inventory_agent', {
      phase: 'inventory_check', critical_count: criticalInventory.length,
    });

    // ── PHASE 3: Commerce Attribution ────────────────────────────────────────
    const commerceResult = await db.execute(
      `SELECT /*+ NO_PARALLEL */
              COUNT(*) AS total_orders,
              COUNT(CASE WHEN social_source_id IS NOT NULL THEN 1 END) AS social_orders,
              ROUND(SUM(order_total), 2) AS total_revenue,
              ROUND(SUM(CASE WHEN social_source_id IS NOT NULL THEN order_total ELSE 0 END), 2) AS social_revenue,
              ROUND(AVG(order_total), 2) AS avg_order_value
       FROM orders
       WHERE created_at >= (SELECT MAX(created_at) FROM orders) - INTERVAL '7' DAY`
    );
    const commerce = commerceResult.rows[0] || {};

    const commerceAnalysis = null;

    const socialPct = commerce.TOTAL_ORDERS > 0
      ? ((commerce.SOCIAL_ORDERS / commerce.TOTAL_ORDERS) * 100).toFixed(1)
      : 0;

    await logAction('master_orchestrator', 'commerce_attribution', 'orders', null, {
      total_orders:    commerce.TOTAL_ORDERS,
      social_orders:   commerce.SOCIAL_ORDERS,
      total_revenue:   commerce.TOTAL_REVENUE,
      social_revenue:  commerce.SOCIAL_REVENUE,
      social_pct:      `${socialPct}%`,
      avg_order_value: commerce.AVG_ORDER_VALUE,
      reason: `${socialPct}% of orders ($${(commerce.SOCIAL_REVENUE || 0).toLocaleString()}) attributed to demand and market signals in last 7 days`,
    }, 0.93);
    allActions.push({ phase: 'commerce', social_pct: socialPct });

    await logEvent('commerce_analysis_complete', 'master_orchestrator', {
      phase: 'commerce_attribution',
      social_orders: commerce.SOCIAL_ORDERS,
      social_revenue: commerce.SOCIAL_REVENUE,
    });

    // ── Momentum distribution for result banner ──────────────────────────────
    const distResult = await db.execute(
      `SELECT /*+ NO_PARALLEL */ momentum_flag, COUNT(*) AS post_count
       FROM social_posts
       WHERE posted_at >= (SELECT MAX(posted_at) FROM social_posts) - INTERVAL '48' HOUR
       GROUP BY momentum_flag
       ORDER BY post_count DESC`
    );

    res.json({
      message: `Full cycle complete - ${topProducts.length} signals · ${criticalInventory.length} capacity alerts · ${socialPct}% signal-driven orders`,
      phases: {
        trends: {
          products_found: topProducts.length,
          summary:        trendText.split('\n')[0],
          analysis:       trendAnalysis,
        },
        inventory: {
          critical_items: criticalInventory.length,
          analysis:       fulfillmentAnalysis,
        },
        commerce: {
          total_orders:   commerce.TOTAL_ORDERS,
          social_orders:  commerce.SOCIAL_ORDERS,
          social_revenue: commerce.SOCIAL_REVENUE,
          social_pct:     `${socialPct}%`,
          analysis:       commerceAnalysis,
        },
      },
      actions:      allActions,
      distribution: distResult.rows,
    });

  } catch (err) {
    console.error('run-cycle error:', err);
    res.status(500).json({ error: err.message });
  }
});

// The former specialist-team endpoints are retired. Use the focused /chat workflow.
for (const route of ['/ask', '/trends', '/fulfillment', '/commerce']) {
  router.post(route, (_req, res) => res.status(410).json({
    error: 'This specialist team was replaced by the Retail Operations response workflow at /api/agents/chat.',
  }));
}

// ── GET /api/agents/events — recent event stream entries ──
router.get('/events', async (req, res) => {
  try {
    const { limit = 15 } = req.query;

    const result = await db.execute(
      `SELECT /*+ NO_PARALLEL */ event_id, event_type, event_source,
              JSON_SERIALIZE(event_data) AS event_data,
              processed, created_at
       FROM event_stream
       ORDER BY created_at DESC
       FETCH FIRST :limit ROWS ONLY`,
      { limit: parseInt(limit) }
    );

    res.json(result.rows);
  } catch (err) {
    console.error('Events error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/agents/tool-history — what tools did agents call ──
router.get('/tool-history', async (req, res) => {
  try {
    const { limit = 20 } = req.query;

    const result = await db.execute(
      `SELECT action_type AS tool_name,
              TO_CHAR(created_at, 'YYYY-MM-DD HH24:MI:SS') AS called_at,
              TO_CHAR(executed_at, 'YYYY-MM-DD HH24:MI:SS') AS ended_at,
              SUBSTR(decision_payload, 1, 200) AS result_preview
       FROM agent_actions
       ORDER BY created_at DESC
       FETCH FIRST :limit ROWS ONLY`,
      { limit: parseInt(limit) }
    );

    res.json(result.rows);
  } catch (err) {
    console.error('Tool history error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/agents/team-history — team execution history ──
router.get('/team-history', async (req, res) => {
  try {
    const { limit = 20 } = req.query;

    const result = await db.execute(
      `SELECT event_source AS team_name,
              TO_CHAR(created_at, 'YYYY-MM-DD HH24:MI:SS') AS started_at,
              TO_CHAR(created_at, 'YYYY-MM-DD HH24:MI:SS') AS ended_at,
              CASE WHEN processed = 1 THEN 'completed' ELSE 'pending' END AS state
       FROM event_stream
       ORDER BY created_at DESC
       FETCH FIRST :limit ROWS ONLY`,
      { limit: parseInt(limit) }
    );

    res.json(result.rows);
  } catch (err) {
    console.error('Team history error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/agents/actions — audit trail from agent_actions table ──
router.get('/actions', async (req, res) => {
  try {
    const { agent, type, limit = 50 } = req.query;
    let where = '1=1';
    const binds = { limit: parseInt(limit) };

    if (agent) { where += ' AND agent_name = :agent'; binds.agent = agent; }
    if (type)  { where += ' AND action_type = :type';  binds.type  = type; }

    const result = await db.execute(
      `SELECT action_id, agent_name, action_type, entity_type, entity_id,
              decision_payload, confidence, execution_status,
              executed_at, created_at
       FROM agent_actions
       WHERE ${where}
       ORDER BY created_at DESC
       FETCH FIRST :limit ROWS ONLY`,
      binds
    );

    res.json(result.rows);
  } catch (err) {
    console.error('Agent actions error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/agents/summary — agent performance summary ──
router.get('/summary', async (req, res) => {
  try {
    const result = await db.execute(
      `SELECT agent_name,
              COUNT(*) AS total_actions,
              COUNT(CASE WHEN execution_status = 'completed' THEN 1 END) AS completed,
              COUNT(CASE WHEN execution_status = 'failed'    THEN 1 END) AS failed,
              COUNT(CASE WHEN execution_status = 'proposed'  THEN 1 END) AS proposed,
              ROUND(AVG(confidence), 3) AS avg_confidence,
              MAX(created_at) AS last_action
       FROM agent_actions
       WHERE created_at >= (SELECT MAX(created_at) FROM agent_actions) - INTERVAL '7' DAY
       GROUP BY agent_name
       ORDER BY total_actions DESC`
    );

    res.json(result.rows);
  } catch (err) {
    console.error('Agent summary error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/agents/profiles — list available AI profiles ──
router.get('/profiles', async (req, res) => {
  const nativeStatus = await ensureNativeAgentRuntime();
  if (nativeStatus.available) {
    return res.json({
      profiles: [nativeProfileCatalogEntry(nativeStatus)],
      activeProfile: nativeStatus.profileName,
      runtime: nativeStatus,
      agentRuntime: nativeStatus,
    });
  }

  return res.json({
    profiles: [],
    activeProfile: null,
    runtime: nativeStatus,
    agentRuntime: nativeStatus,
  });
});

// ── GET /api/agents/native/status — native Select AI Agent readiness ──
router.get('/native/status', async (req, res) => {
  const status = await ensureNativeAgentRuntime({ force: req.query.force === 'true' });
  res.json(status);
});

// ── POST /api/agents/set-profile — switch the active AI profile ──
router.post('/set-profile', async (req, res) => {
  const { profile } = req.body;
  if (!profile || !profile.trim()) {
    return res.status(400).json({ error: 'Profile name is required' });
  }

  const status = await ensureNativeAgentRuntime();
  if (!status.available) {
    return res.status(503).json({ error: 'Oracle Select AI Agent is unavailable.' });
  }
  if (profile.trim().toUpperCase() !== status.profileName.toUpperCase()) {
    return res.status(400).json({ error: `Only the configured OCI GenAI profile ${status.profileName} is available.` });
  }
  return res.json({ success: true, profile: status.profileName, message: `Active AI profile is ${status.profileName}` });
});

// ── POST /api/agents/chat — run the focused demand-to-stock team ──
router.post('/chat', async (req, res) => {
  const { question } = req.body;
  if (!question || !question.trim()) {
    return res.status(400).json({ error: 'A question is required' });
  }

  const q = question.trim();
  const team = 'RETAIL_RESPONSE_TEAM';
  const intent = 'retail_response';

  try {
    const result = await runNativeAgentQuestion({ question: q, team, intent });
    if (!result) {
      return res.status(503).json({
        error: 'Oracle Select AI Agent is unavailable. Check the OCI GenAI profile and database connection.',
        runtime: 'unavailable',
      });
    }
    await logAction('chat_agent', 'select_ai_agent_query', intent, null, {
      question: q, team, runtime: result.runtime, profile: result.profile,
      reason: result.runtime === 'select_ai_agent'
        ? 'Retail response completed through DBMS_CLOUD_AI_AGENT.RUN_TEAM'
        : 'RUN_TEAM timed out; response used the registered Oracle tools directly',
    }, result.runtime === 'select_ai_agent' ? 0.95 : 0.90);
    return res.json({ ...result, workflow: { stage: 'retail_response', nextActions: [] }, nextActions: [] });
  } catch (err) {
    console.error('Native Select AI Agent chat error:', err);
    return res.status(err.statusCode || (err.nativeRuntimeAvailable ? 502 : 503)).json({
      error: err.message,
      runtime: 'unavailable',
    });
  }
});

// ── GET /api/agents/teams — list available teams ──
router.get('/teams', async (req, res) => {
  try {
    const nativeStatus = await ensureNativeAgentRuntime();
    return res.json(nativeTeams(nativeStatus));
  } catch (_) {
    return res.json(STATIC_TEAMS);
  }
});

module.exports = router;
