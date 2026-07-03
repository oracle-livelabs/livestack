/**
 * Agents API — application-layer orchestration with Ollama reasoning
 * and Oracle SQL / PL/SQL execution against live demo data.
 */

const express = require('express');
const router = express.Router();
const db = require('../config/database');
const {
  DEFAULT_PROFILE,
  answerQuestion,
  getAvailableProfiles,
  normalizeProfile,
  summarizeContext,
} = require('../lib/ollamaAssistant');

const STATIC_TEAMS = [
  {
    TEAM_NAME: 'PRODUCTION_SIGNAL_TEAM',
    STATUS: 'ENABLED',
    DESCRIPTION: 'Ollama-backed production/demand signal analysis over live manufacturing operations data.',
  },
  {
    TEAM_NAME: 'FULFILLMENT_TEAM',
    STATUS: 'ENABLED',
    DESCRIPTION: 'Ollama-backed plant capacity analysis using capacity and routing context.',
  },
  {
    TEAM_NAME: 'MANUFACTURING_OPERATIONS_TEAM',
    STATUS: 'ENABLED',
    DESCRIPTION: 'Ollama-backed manufacturing operations analysis using work orders and work-order value context.',
  },
];

async function askSelectAI(question, action = 'narrate', demoUser = null) {
  if (action === 'showsql') {
    const result = await answerQuestion(question, { mode: 'narrate', demoUser });
    return result.sql;
  }

  const result = await answerQuestion(question, {
    mode: action === 'chat' ? 'chat' : 'narrate',
    demoUser,
  });
  return result.answer;
}

async function buildAgentContext(teamName) {
  if (teamName === 'PRODUCTION_SIGNAL_TEAM') {
    const [summary, products, influencers, momentum] = await Promise.all([
      db.execute(`SELECT detect_trending_products(48, 50) AS result FROM dual`),
      db.execute(
        `SELECT /*+ NO_PARALLEL */ p.product_name, b.brand_name, p.category,
                COUNT(DISTINCT sp.production_signal_id) AS mentions,
                ROUND(AVG(sp.urgency_score), 1) AS average_urgency_score,
                SUM(sp.observation_count) AS total_observations,
                MAX(sp.momentum_code) AS peak_momentum
         FROM manufacturing_signal_part_mentions ppm
         JOIN manufacturing_production_signals sp ON ppm.production_signal_id = sp.production_signal_id
         JOIN products p ON ppm.manufactured_part_id = p.product_id
         JOIN brands b ON p.brand_id = b.brand_id
         WHERE CAST(sp.observed_at AS DATE) >= SYSDATE - 2
         GROUP BY p.product_name, b.brand_name, p.category
         ORDER BY average_urgency_score DESC, total_observations DESC
         FETCH FIRST 8 ROWS ONLY`
      ),
      db.execute(
        `SELECT /*+ NO_PARALLEL */ i.handle AS network_account_handle,
                sp.signal_channel_code,
                COUNT(sp.production_signal_id) AS production_signal_count,
                ROUND(AVG(sp.urgency_score), 1) AS average_urgency_score,
                SUM(sp.observation_count) AS total_observations
         FROM manufacturing_production_signals sp
         JOIN influencers i ON sp.network_account_id = i.influencer_id
         WHERE CAST(sp.observed_at AS DATE) >= SYSDATE - 2
         GROUP BY i.handle, sp.signal_channel_code
         ORDER BY total_observations DESC NULLS LAST
         FETCH FIRST 6 ROWS ONLY`
      ),
      db.execute(
        `SELECT momentum_code, COUNT(*) AS signal_count
         FROM manufacturing_production_signals
         WHERE CAST(observed_at AS DATE) >= SYSDATE - 2
         GROUP BY momentum_code
         ORDER BY signal_count DESC`
      ),
    ]);

    return {
      instructions: 'Focus on manufactured parts, supplier networks, urgent signals, and concrete metrics.',
      context: {
        team: teamName,
        trend_summary: summary.rows?.[0]?.RESULT || null,
        top_products: products.rows || [],
        top_influencers: influencers.rows || [],
        momentum_distribution: momentum.rows || [],
      },
    };
  }

  if (teamName === 'FULFILLMENT_TEAM') {
    const [inventoryAlerts, centers] = await Promise.all([
      db.execute(
        `SELECT /*+ NO_PARALLEL */ p.product_name, fc.center_name, fc.city,
                i.quantity_on_hand, i.quantity_reserved, i.reorder_point,
                CASE
                  WHEN i.quantity_on_hand = 0 THEN 'out_of_stock'
                  WHEN i.quantity_on_hand <= i.reorder_point * 0.5 THEN 'critical'
                  WHEN i.quantity_on_hand <= i.reorder_point THEN 'low'
                  ELSE 'ok'
                END AS stock_status
         FROM inventory i
         JOIN products p ON i.product_id = p.product_id
         JOIN fulfillment_centers fc ON i.center_id = fc.center_id
         WHERE i.quantity_on_hand <= i.reorder_point
         ORDER BY i.quantity_on_hand ASC, i.reorder_point DESC
         FETCH FIRST 10 ROWS ONLY`
      ),
      db.execute(
        `SELECT /*+ NO_PARALLEL */ fc.center_name, fc.city, fc.state_province,
                fc.center_type,
                NVL(SUM(i.quantity_on_hand), 0) AS total_on_hand,
                SUM(CASE WHEN i.quantity_on_hand <= i.reorder_point THEN 1 ELSE 0 END) AS low_stock_items
         FROM fulfillment_centers fc
         LEFT JOIN inventory i ON fc.center_id = i.center_id
         WHERE fc.is_active = 1
         GROUP BY fc.center_name, fc.city, fc.state_province, fc.center_type
         ORDER BY total_on_hand DESC
         FETCH FIRST 8 ROWS ONLY`
      ),
    ]);

    return {
      instructions: 'Focus on capacity risk, routing, and practical plant-capacity actions.',
      context: {
        team: teamName,
        inventory_alerts: inventoryAlerts.rows || [],
        active_centers: centers.rows || [],
      },
    };
  }

  const [summary, categories, orderStatus] = await Promise.all([
    db.execute(
      `SELECT COUNT(*) AS total_work_orders,
              COUNT(CASE WHEN production_signal_id IS NOT NULL THEN 1 END) AS signal_influenced_work_orders,
              ROUND(SUM(work_order_value), 2) AS total_work_order_value,
              ROUND(SUM(CASE WHEN production_signal_id IS NOT NULL THEN work_order_value ELSE 0 END), 2) AS signal_attributed_work_order_value,
              ROUND(AVG(work_order_value), 2) AS average_work_order_value
       FROM manufacturing_work_orders
       WHERE CAST(created_at AS DATE) >= SYSDATE - 30`
    ),
    db.execute(
      `SELECT p.category,
              COUNT(DISTINCT o.work_order_id) AS work_order_count,
              ROUND(SUM(oi.requested_units * oi.planned_unit_value), 2) AS work_order_value
       FROM manufacturing_work_order_lines oi
       JOIN manufacturing_work_orders o ON oi.work_order_id = o.work_order_id
       JOIN products p ON oi.manufactured_part_id = p.product_id
       WHERE CAST(o.created_at AS DATE) >= SYSDATE - 30
       GROUP BY p.category
       ORDER BY work_order_value DESC
       FETCH FIRST 8 ROWS ONLY`
    ),
    db.execute(
      `SELECT work_order_status_code, COUNT(*) AS work_order_count, ROUND(SUM(work_order_value), 2) AS work_order_value
       FROM manufacturing_work_orders
       WHERE CAST(created_at AS DATE) >= SYSDATE - 30
       GROUP BY work_order_status_code
       ORDER BY work_order_value DESC`
    ),
  ]);

  return {
    instructions: 'Focus on work orders, order value, production-signal attribution, and operational trends.',
    context: {
      team: teamName,
      operations_summary: summary.rows?.[0] || {},
      category_breakdown: categories.rows || [],
      order_status_breakdown: orderStatus.rows || [],
    },
  };
}

function fallbackAgentSummary(teamName, context) {
  if (teamName === 'PRODUCTION_SIGNAL_TEAM') {
    const products = context.top_products || [];
    if (!products.length) {
      return context.trend_summary || 'No high-demand manufactured parts found in the current window.';
    }
    return products
      .slice(0, 3)
      .map((product) => {
        const averageUrgency = product.AVERAGE_URGENCY_SCORE == null ? 'n/a' : product.AVERAGE_URGENCY_SCORE;
        return `${product.PRODUCT_NAME} (${product.BRAND_NAME}) average urgency ${averageUrgency}, ${product.PRODUCTION_SIGNAL_COUNT} production signals, ${product.TOTAL_OBSERVATIONS} observations`;
      })
      .join(' | ');
  }

  if (teamName === 'FULFILLMENT_TEAM') {
    const alerts = context.inventory_alerts || [];
    if (!alerts.length) {
      return 'No current low-capacity manufactured part alerts were found.';
    }
    return alerts
      .slice(0, 3)
      .map((item) =>
        `${item.PRODUCT_NAME} at ${item.CENTER_NAME}, ${item.CITY}: ${item.QUANTITY_ON_HAND} on hand vs reorder point ${item.REORDER_POINT} [${item.STOCK_STATUS}]`
      )
      .join(' | ');
  }

  const summary = context.operations_summary || {};
  const totalWorkOrders = summary.TOTAL_WORK_ORDERS || 0;
  const totalWorkOrderValue = summary.TOTAL_WORK_ORDER_VALUE || 0;
  const signalInfluencedWorkOrders = summary.SIGNAL_INFLUENCED_WORK_ORDERS || 0;
  const signalAttributedWorkOrderValue = summary.SIGNAL_ATTRIBUTED_WORK_ORDER_VALUE || 0;
  return `Last 30 days: ${totalWorkOrders.toLocaleString()} work orders, $${totalWorkOrderValue.toLocaleString()} work-order value, ${signalInfluencedWorkOrders.toLocaleString()} signal-influenced work orders, $${signalAttributedWorkOrderValue.toLocaleString()} signal-attributed work-order value.`;
}

async function askAgent(teamName, question) {
  const { instructions, context } = await buildAgentContext(teamName);
  const fallback = fallbackAgentSummary(teamName, context);
  try {
    return await Promise.race([
      summarizeContext({ question, instructions, context }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 30000)),
    ]);
  } catch (_) {
    return fallback;
  }
}

function logOptionalAgentWarning(label, error) {
  const message = error?.message || String(error || '');
  if (!message || /^timeout$/i.test(message)) {
    return;
  }
  console.warn(`${label}:`, message);
}

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
// Runs the PRODUCTION_SIGNAL_TEAM to identify urgent manufactured part demand.
// Falls back to direct PL/SQL if the LLM agent is unavailable.
// ─────────────────────────────────────────────────────────────────────────────
router.post('/detect-trends', async (req, res) => {
  const { windowHours = 24, urgencyThreshold = 75 } = req.body;
  const hours     = parseInt(windowHours);
  const threshold = parseInt(urgencyThreshold);

  try {
    // 1. PL/SQL trend detection (always reliable)
    const trendResult = await db.execute(
      `SELECT detect_trending_products(:hours, :threshold) AS result FROM dual`,
      { hours, threshold }
    );
    const trendText = trendResult.rows[0]?.RESULT || 'No high-demand manufactured parts found';

    // 2. Get top trending manufactured parts for per-service action logging
    const productsResult = await db.execute(
      `SELECT /*+ NO_PARALLEL */ p.product_id, p.product_name, b.brand_name,
              COUNT(DISTINCT sp.production_signal_id)        AS production_signal_count,
              ROUND(AVG(sp.urgency_score), 1)  AS average_urgency_score,
              SUM(sp.observation_count)               AS total_observations,
              MAX(sp.momentum_code)             AS peak_momentum
       FROM manufacturing_signal_part_mentions ppm
       JOIN manufacturing_production_signals sp ON ppm.production_signal_id    = sp.production_signal_id
       JOIN products p      ON ppm.manufactured_part_id = p.product_id
       JOIN brands b        ON p.brand_id     = b.brand_id
       WHERE CAST(sp.observed_at AS DATE) >= SYSDATE - :hours/24
         AND sp.urgency_score >= :threshold
       GROUP BY p.product_id, p.product_name, b.brand_name
       ORDER BY average_urgency_score DESC
       FETCH FIRST 5 ROWS ONLY`,
      { hours, threshold }
    );
    const products = productsResult.rows || [];

    // 3. Momentum distribution for the result banner
    const distResult = await db.execute(
      `SELECT /*+ NO_PARALLEL */ momentum_code, COUNT(*) AS signal_count
       FROM manufacturing_production_signals
       WHERE CAST(observed_at AS DATE) >= SYSDATE - :hours/24
       GROUP BY momentum_code
       ORDER BY signal_count DESC`,
      { hours }
    );

    // 4. Try Ollama-based agent analysis for richer natural-language output (best-effort)
    let agentAnalysis = null;
    try {
      agentAnalysis = await Promise.race([
        askAgent('PRODUCTION_SIGNAL_TEAM',
          `Identify the top trending manufactured parts and manufacturing network accounts from the last ${hours} hours ` +
          `using the detect trending manufactured parts tool with minimum urgency score ${threshold}`),
        new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 10000)),
      ]);
    } catch (agentErr) {
      logOptionalAgentWarning('Ollama trend analysis skipped', agentErr);
    }

    // 5. Log per-product actions
    const loggedActions = [];
    for (const p of products) {
      const confidence = p.AVERAGE_URGENCY_SCORE > 80 ? 0.95 : p.AVERAGE_URGENCY_SCORE > 60 ? 0.85 : 0.75;
      await logAction('trend_detection_agent', 'detect_trends', 'product', p.PRODUCT_ID, {
        product_name:  p.PRODUCT_NAME,
        brand:         p.BRAND_NAME,
        production_signal_count: p.PRODUCTION_SIGNAL_COUNT,
        average_urgency_score:  p.AVERAGE_URGENCY_SCORE,
        total_observations:   p.TOTAL_OBSERVATIONS,
        peak_momentum: p.PEAK_MOMENTUM,
        window_hours:  hours,
        reason: `${p.PEAK_MOMENTUM} manufactured part with ${p.PRODUCTION_SIGNAL_COUNT} production/demand signal mentions and urgency ${p.AVERAGE_URGENCY_SCORE}`,
      }, confidence);
      loggedActions.push({ manufactured_part: p.PRODUCT_NAME, urgency: p.AVERAGE_URGENCY_SCORE });
    }

    // 6. Log the overall run summary
    await logAction('trend_detection_agent', 'trend_analysis_complete', 'manufacturing_production_signals', null, {
      window_hours:   hours,
      urgency_threshold: threshold,
      manufactured_parts_found:  products.length,
      reason: agentAnalysis || trendText.slice(0, 500),
    }, 0.90);

    // 7. Emit event
    await logEvent('trend_detected', 'trend_detection_agent', {
      window_hours:   hours,
      threshold,
      manufactured_parts_found: products.length,
      triggered_at:   new Date().toISOString(),
    });

    res.json({
      message:      `Trend detection complete - ${products.length} urgent manufactured parts identified in last ${hours}h`,
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
// Full orchestration: trend detection → inventory check → manufacturing operations attribution.
// All three agent teams run in sequence. Falls back to direct SQL if LLM unavailable.
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
              COUNT(DISTINCT sp.production_signal_id)       AS production_signal_count,
              ROUND(AVG(sp.urgency_score), 1) AS average_urgency_score,
              MAX(sp.momentum_code)            AS peak_momentum
       FROM manufacturing_signal_part_mentions ppm
       JOIN manufacturing_production_signals sp ON ppm.production_signal_id    = sp.production_signal_id
       JOIN products p      ON ppm.manufactured_part_id = p.product_id
       JOIN brands b        ON p.brand_id     = b.brand_id
       WHERE CAST(sp.observed_at AS DATE) >= SYSDATE - 2
         AND sp.urgency_score >= 50
       GROUP BY p.product_id, p.product_name, b.brand_name
       ORDER BY average_urgency_score DESC
       FETCH FIRST 5 ROWS ONLY`
    );
    const topProducts = topProductsResult.rows || [];

    // Best-effort LLM trend analysis
    let trendAnalysis = null;
    try {
      trendAnalysis = await Promise.race([
        askAgent('PRODUCTION_SIGNAL_TEAM',
          'What manufactured parts are trending right now based on customer and supplier signal activity in the last 48 hours'),
        new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 10000)),
      ]);
    } catch (e) {
      logOptionalAgentWarning('Trend agent skipped', e);
    }

    for (const p of topProducts) {
      await logAction('trend_detection_agent', 'detect_trends', 'product', p.PRODUCT_ID, {
        product_name:  p.PRODUCT_NAME,
        brand:         p.BRAND_NAME,
        production_signal_count: p.PRODUCTION_SIGNAL_COUNT,
        average_urgency_score:  p.AVERAGE_URGENCY_SCORE,
        peak_momentum: p.PEAK_MOMENTUM,
        reason: `Detected via full cycle — ${p.PEAK_MOMENTUM} with urgency ${p.AVERAGE_URGENCY_SCORE}`,
      }, p.AVERAGE_URGENCY_SCORE > 80 ? 0.95 : 0.85);
      allActions.push({ phase: 'trends', manufactured_part: p.PRODUCT_NAME });
    }

    await logEvent('trend_detected', 'master_orchestrator', {
      phase: 'trend_detection', manufactured_parts_found: topProducts.length,
    });

    // ── PHASE 2: Inventory Check ─────────────────────────────────────────────
    const inventoryResult = await db.execute(
      `SELECT /*+ NO_PARALLEL */ p.product_id, p.product_name,
              fc.center_name, fc.city,
              i.quantity_on_hand, i.quantity_reserved,
              i.reorder_point,
              CASE
                WHEN i.quantity_on_hand = 0                          THEN 'out_of_stock'
                WHEN i.quantity_on_hand <= i.reorder_point * 0.5    THEN 'critical'
                WHEN i.quantity_on_hand <= i.reorder_point          THEN 'low'
                ELSE 'ok'
              END AS stock_status
       FROM inventory i
       JOIN products p             ON i.product_id = p.product_id
       JOIN fulfillment_centers fc ON i.center_id  = fc.center_id
       WHERE i.quantity_on_hand <= i.reorder_point
         AND p.product_id IN (
           SELECT /*+ NO_PARALLEL */ DISTINCT ppm.manufactured_part_id
           FROM manufacturing_signal_part_mentions ppm
           JOIN manufacturing_production_signals sp ON ppm.production_signal_id = sp.production_signal_id
           WHERE CAST(sp.observed_at AS DATE) >= SYSDATE - 2
             AND sp.urgency_score >= 50
         )
       ORDER BY i.quantity_on_hand ASC
       FETCH FIRST 10 ROWS ONLY`
    );
    const criticalInventory = inventoryResult.rows || [];

    // Best-effort LLM fulfillment analysis
    let fulfillmentAnalysis = null;
    try {
      fulfillmentAnalysis = await Promise.race([
        askAgent('FULFILLMENT_TEAM',
          'Which trending manufactured parts have critically low capacity and need immediate intervention'),
        new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 10000)),
      ]);
    } catch (e) {
      logOptionalAgentWarning('Fulfillment agent skipped', e);
    }

    for (const inv of criticalInventory) {
      await logAction('inventory_agent', 'inventory_alert', 'inventory', inv.PRODUCT_ID, {
        product_name:       inv.PRODUCT_NAME,
        center:             inv.CENTER_NAME,
        quantity_on_hand:   inv.QUANTITY_ON_HAND,
        quantity_reserved:  inv.QUANTITY_RESERVED,
        reorder_point:      inv.REORDER_POINT,
        stock_status:       inv.STOCK_STATUS,
        strategy:           `Pre-position capacity at ${inv.CENTER_NAME} - high-demand manufactured part with ${inv.STOCK_STATUS} capacity`,
        reason: `${inv.STOCK_STATUS} stock (${inv.QUANTITY_ON_HAND} units) for trending product at ${inv.CENTER_NAME}`,
      }, inv.STOCK_STATUS === 'out_of_stock' ? 0.98 : 0.92);
      allActions.push({ phase: 'inventory', product: inv.PRODUCT_NAME, status: inv.STOCK_STATUS });
    }

    await logEvent('inventory_alert', 'inventory_agent', {
      phase: 'inventory_check', critical_count: criticalInventory.length,
    });

    // ── PHASE 3: Manufacturing Operations Attribution ────────────────────────────────────────
    const operationsResult = await db.execute(
      `SELECT /*+ NO_PARALLEL */
              COUNT(*) AS total_work_orders,
              COUNT(CASE WHEN production_signal_id IS NOT NULL THEN 1 END) AS signal_influenced_work_orders,
              ROUND(SUM(work_order_value), 2) AS total_work_order_value,
              ROUND(SUM(CASE WHEN production_signal_id IS NOT NULL THEN work_order_value ELSE 0 END), 2) AS signal_attributed_work_order_value,
              ROUND(AVG(work_order_value), 2) AS average_work_order_value
       FROM manufacturing_work_orders
       WHERE CAST(created_at AS DATE) >= SYSDATE - 7`
    );
    const operations = operationsResult.rows[0] || {};

    // Best-effort LLM operations analysis
    let operationsAnalysis = null;
    try {
      operationsAnalysis = await Promise.race([
        askAgent('MANUFACTURING_OPERATIONS_TEAM',
          'Summarize signal-influenced work orders and attributed work-order value from the last 7 days'),
        new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 10000)),
      ]);
    } catch (e) {
      logOptionalAgentWarning('Manufacturing operations agent skipped', e);
    }

    const signalPct = operations.TOTAL_WORK_ORDERS > 0
      ? ((operations.SIGNAL_INFLUENCED_WORK_ORDERS / operations.TOTAL_WORK_ORDERS) * 100).toFixed(1)
      : 0;

    await logAction('master_orchestrator', 'operations_attribution', 'manufacturing_work_orders', null, {
      total_work_orders:    operations.TOTAL_WORK_ORDERS,
      signal_driven_work_orders: operations.SIGNAL_INFLUENCED_WORK_ORDERS,
      total_work_order_value:   operations.TOTAL_WORK_ORDER_VALUE,
      signal_attributed_order_value: operations.SIGNAL_ATTRIBUTED_WORK_ORDER_VALUE,
      signal_attribution_pct: `${signalPct}%`,
      average_work_order_value: operations.AVERAGE_WORK_ORDER_VALUE,
      reason: `${signalPct}% of work orders ($${(operations.SIGNAL_ATTRIBUTED_WORK_ORDER_VALUE || 0).toLocaleString()}) attributed to production and demand signals in the last 7 days`,
    }, 0.93);
    allActions.push({ phase: 'manufacturing_operations', signal_attribution_pct: signalPct });

    await logEvent('operations_analysis_complete', 'master_orchestrator', {
      phase: 'operations_attribution',
      signal_influenced_work_orders: operations.SIGNAL_INFLUENCED_WORK_ORDERS,
      signal_service_value: operations.SIGNAL_ATTRIBUTED_WORK_ORDER_VALUE,
    });

    // ── Momentum distribution for result banner ──────────────────────────────
    const distResult = await db.execute(
      `SELECT /*+ NO_PARALLEL */ momentum_code, COUNT(*) AS signal_count
       FROM manufacturing_production_signals
       WHERE CAST(observed_at AS DATE) >= SYSDATE - 2
       GROUP BY momentum_code
       ORDER BY signal_count DESC`
    );

    res.json({
      message: `Full cycle complete - ${topProducts.length} trends · ${criticalInventory.length} capacity alerts · ${signalPct}% signal-influenced work orders`,
      phases: {
        trends: {
          manufactured_parts_found: topProducts.length,
          summary:        trendText.split('\n')[0],
          analysis:       trendAnalysis,
        },
        capacity: {
          critical_items: criticalInventory.length,
          analysis:       fulfillmentAnalysis,
        },
        operations: {
          total_work_orders: operations.TOTAL_WORK_ORDERS,
          signal_influenced_work_orders: operations.SIGNAL_INFLUENCED_WORK_ORDERS,
          signal_attributed_work_order_value: operations.SIGNAL_ATTRIBUTED_WORK_ORDER_VALUE,
          signal_attribution_pct: `${signalPct}%`,
          analysis:       operationsAnalysis,
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

// ── POST /api/agents/ask — ask a specific agent team a question ──
router.post('/ask', async (req, res) => {
  try {
    const { team, question } = req.body;

    if (!team || !question) {
      return res.status(400).json({ error: 'Both "team" and "question" are required' });
    }

    const validTeams = ['PRODUCTION_SIGNAL_TEAM', 'FULFILLMENT_TEAM', 'MANUFACTURING_OPERATIONS_TEAM'];
    if (!validTeams.includes(team.toUpperCase())) {
      return res.status(400).json({
        error: `Invalid team. Choose from: ${validTeams.join(', ')}`
      });
    }

    const response = await askAgent(team.toUpperCase(), question);

    res.json({ team, question, response });
  } catch (err) {
    console.error('Agent ask error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/agents/trends — ask the trend agent ──
router.post('/trends', async (req, res) => {
  try {
    const { question } = req.body;
    const q = question || 'What manufactured parts are trending right now based on customer and supplier signal activity';
    const response = await askAgent('PRODUCTION_SIGNAL_TEAM', q);
    res.json({ team: 'PRODUCTION_SIGNAL_TEAM', question: q, response });
  } catch (err) {
    console.error('Trends agent error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/agents/fulfillment — ask the fulfillment agent ──
router.post('/fulfillment', async (req, res) => {
  try {
    const { question } = req.body;
    const q = question || 'Which trending manufactured parts have critically low capacity';
    const response = await askAgent('FULFILLMENT_TEAM', q);
    res.json({ team: 'FULFILLMENT_TEAM', question: q, response });
  } catch (err) {
    console.error('Fulfillment agent error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/agents/operations — ask the operations agent ──
router.post('/operations', async (req, res) => {
  try {
    const { question } = req.body;
    const q = question || 'How many work orders were created in the last 24 hours and what is their total work-order value';
    const response = await askAgent('MANUFACTURING_OPERATIONS_TEAM', q);
    res.json({ team: 'MANUFACTURING_OPERATIONS_TEAM', question: q, response });
  } catch (err) {
    console.error('Manufacturing operations agent error:', err);
    res.status(500).json({ error: err.message });
  }
});

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
              executed_at, created_at,
              JSON_VALUE(decision_payload, '$.estimated_time_saved') AS estimated_time_saved,
              COALESCE(
                JSON_VALUE(decision_payload, '$.impact'),
                JSON_VALUE(decision_payload, '$.strategy'),
                JSON_VALUE(decision_payload, '$.reason')
              ) AS action_impact,
              CASE agent_name
                WHEN 'trend_detection_agent' THEN 'Production Signal Agent'
                WHEN 'inventory_agent' THEN 'Plant Capacity Agent'
                WHEN 'manufacturing_operations_agent' THEN 'Work Order Agent'
                ELSE INITCAP(REPLACE(agent_name, '_', ' '))
              END AS owner_system,
              execution_status AS action_status,
              NVL(executed_at, created_at) AS action_timestamp
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
  res.json({
    profiles: getAvailableProfiles(),
    activeProfile: DEFAULT_PROFILE,
  });
});

// ── POST /api/agents/set-profile — switch the active AI profile ──
router.post('/set-profile', async (req, res) => {
  const { profile } = req.body;
  if (!profile || !profile.trim()) {
    return res.status(400).json({ error: 'Profile name is required' });
  }

  const profileName = normalizeProfile(profile);
  return res.json({
    success: true,
    profile: profileName,
    message: `Active AI profile set to ${profileName} (Ollama llama3.2)`,
  });
});

// ── POST /api/agents/chat — intelligent chat routing to agent teams ──
// Auto-detects intent, tries Ollama reasoning first,
// and falls back to direct SQL / PL/SQL tool functions.
router.post('/chat', async (req, res) => {
  const { question } = req.body;
  if (!question || !question.trim()) {
    return res.status(400).json({ error: 'A question is required' });
  }

  const q = question.trim();
  const qLower = q.toLowerCase();
  const startTime = Date.now();

  // ── Step 1: Auto-detect intent and pick agent team ──
  let team = 'MANUFACTURING_OPERATIONS_TEAM';
  let intent = 'operations';
  let toolsUsed = [];

  // Strong signals — worth 3 points each (unambiguously indicate one intent)
  const trendStrong = ['trending', 'urgent', 'urgency', 'critical', 'escalating', 'elevated', 'momentum', 'network account', 'signal channel', 'supplier portal'];
  const inventoryStrong = ['capacity', 'plant capacity', 'inventory', 'reorder', 'replenish', 'out of capacity'];
  const operationsStrong = ['order value', 'work order', 'request total', 'order total'];

  // Weak signals — worth 1 point each (ambiguous, could relate to multiple intents)
  const trendWeak = ['trend', 'signal', 'production signal', 'activity', 'observations', 'acknowledgements', 'propagations', 'sentiment'];
  const inventoryWeak = ['stock', 'route', 'routing', 'center', 'supply', 'logistics', 'completion', 'nearest', 'distance'];
  const operationsWeak = ['request', 'customer', 'value', 'category', 'program', 'service', 'total'];

  const trendScore = trendStrong.filter(k => qLower.includes(k)).length * 3
                   + trendWeak.filter(k => qLower.includes(k)).length;
  const inventoryScore = inventoryStrong.filter(k => qLower.includes(k)).length * 3
                       + inventoryWeak.filter(k => qLower.includes(k)).length;
  const operationsScore = operationsStrong.filter(k => qLower.includes(k)).length * 3
                      + operationsWeak.filter(k => qLower.includes(k)).length;

  if (trendScore >= inventoryScore && trendScore >= operationsScore && trendScore > 0) {
    team = 'PRODUCTION_SIGNAL_TEAM'; intent = 'trends';
  } else if (inventoryScore > trendScore && inventoryScore >= operationsScore) {
    team = 'FULFILLMENT_TEAM'; intent = 'fulfillment';
  }

  // ── Step 2: Try Ollama team reasoning first ─────────────────────────────
  let agentResponse = null;
  let agentUsed = false;
  try {
    agentResponse = await Promise.race([
      askAgent(team, q),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 8000)),
    ]);
    if (agentResponse) {
      agentUsed = true;
      toolsUsed.push({ tool: 'Ollama llama3.2', team, status: 'success' });
    }
  } catch (agentErr) {
    toolsUsed.push({ tool: 'Ollama llama3.2', team, status: 'fallback', reason: agentErr.message });
  }

  // ── Step 3: Fallback — call PL/SQL tool functions directly ──
  let fallbackResult = null;
  let fallbackData = null;

  try {
    if (intent === 'trends') {
      // Extract hours/score params from question if mentioned
      const hoursMatch = qLower.match(/(\d+)\s*hours?/);
      const hours = hoursMatch ? parseInt(hoursMatch[1]) : 48;
      const scoreMatch = qLower.match(/score.*?(\d+)|urgency.*?(\d+)/);
      const minScore = scoreMatch ? parseInt(scoreMatch[1] || scoreMatch[2] || scoreMatch[3]) : 50;

      const trendRes = await db.execute(
        `SELECT detect_trending_products(:hours, :score) AS result FROM dual`,
        { hours, score: minScore }
      );
      fallbackResult = trendRes.rows[0]?.RESULT || 'No high-demand manufactured parts found';
      toolsUsed.push({ tool: 'detect_trending_products()', params: { hours, minScore }, status: 'success' });

      // Also get structured data
      const dataRes = await db.execute(
        `SELECT p.product_name, b.brand_name, p.category,
                COUNT(DISTINCT sp.production_signal_id) AS mentions,
                ROUND(AVG(sp.urgency_score), 1) AS average_urgency_score,
                SUM(sp.observation_count) AS total_observations,
                MAX(sp.momentum_code) AS peak_momentum
         FROM manufacturing_signal_part_mentions ppm
         JOIN manufacturing_production_signals sp ON ppm.production_signal_id = sp.production_signal_id
         JOIN products p ON ppm.manufactured_part_id = p.product_id
         JOIN brands b ON p.brand_id = b.brand_id
         WHERE CAST(sp.observed_at AS DATE) >= SYSDATE - :hours/24
           AND sp.urgency_score >= :score
         GROUP BY p.product_name, b.brand_name, p.category
         ORDER BY average_urgency_score DESC
         FETCH FIRST 10 ROWS ONLY`,
        { hours, score: minScore }
      );
      fallbackData = dataRes.rows;

      // Check for manufacturing network account-specific questions
      const handleMatch = q.match(/@[\w_]+/);
      if (handleMatch || qLower.includes('network account') || qLower.includes('influencer')) {
        const handle = handleMatch ? handleMatch[0] : null;
        if (handle) {
          const netRes = await db.execute(
            `SELECT get_supplier_network(:handle) AS result FROM dual`,
            { handle }
          );
          fallbackResult += '\n\n' + (netRes.rows[0]?.RESULT || '');
          toolsUsed.push({ tool: 'get_supplier_network()', params: { handle }, status: 'success' });
        }
      }

    } else if (intent === 'fulfillment') {
      // Extract product name from question
      const productPatterns = [
        /["']([^"']+)["']/,                                                           // quoted: "Servo Drive Controller AX-400"
        /(?:inventory|stock|check)\s+(?:for|of|on)\s+(?:the\s+)?(.+?)(?:\s+across|\s+at|\s+in|\s*\??\s*$)/i,
        /(?:ship|deliver|send|route)\s+(?:the\s+)?(.+?)(?:\s+to\s+|\s+for\s+)/i,     // "ship urgent capacity slot to..."
        /(?:fulfillment|nearest)\s+(?:center\s+)?(?:for|with)\s+(.+?)(?:\s+in\s+stock|\s+to\s+|\s+for\s+|\s*\??\s*$)/i,
        /(?:for|of|about)\s+(?:the\s+)?([A-Z][A-Za-z\s]+?)(?:\s+across|\s+at|\s+in|\s+to|\s*\??\s*$)/i,
      ];
      let productName = null;
      for (const pat of productPatterns) {
        const m = q.match(pat);
        if (m) {
          let pn = m[1].trim();
          // Clean up: remove trailing filler words
          pn = pn.replace(/\s+(earbuds?|headphones?|shoes?|items?|products?)\s*$/i, '').trim();
          // Skip if the extracted name looks like a non-product phrase
          if (pn.length >= 3 && !/^(a |the |an |to |in |for )/i.test(pn)) {
            productName = pn;
            break;
          }
        }
      }

      // Check if this is a routing question (mentions customer/city)
      const cityMatch = q.match(/(?:to|in|near)\s+(?:a\s+customer\s+in\s+)?([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/);
      const emailMatch = q.match(/[\w.]+@[\w.]+/);

      if (productName && (cityMatch || emailMatch)) {
        // Spatial routing - find best plant capacity center
        let customerEmail = emailMatch ? emailMatch[0] : null;

        // If user gave a city name, look up a synthetic customer email in that city
        if (!customerEmail && cityMatch) {
          const cityName = cityMatch[1];
          try {
            const custRes = await db.execute(
              `SELECT email FROM customers WHERE UPPER(city) = UPPER(:city) FETCH FIRST 1 ROWS ONLY`,
              { city: cityName }
            );
            if (custRes.rows.length > 0) {
              customerEmail = custRes.rows[0].EMAIL;
              toolsUsed.push({ tool: 'customer_lookup', params: { city: cityName }, status: 'success', email: customerEmail });
            }
          } catch (_) {}
        }

        if (customerEmail) {
          try {
            const routeRes = await db.execute(
              `SELECT find_best_fulfillment(:email, :pname) AS result FROM dual`,
              { email: customerEmail, pname: productName }
            );
            fallbackResult = routeRes.rows[0]?.RESULT || 'No production route found';
            toolsUsed.push({ tool: 'find_best_fulfillment()', params: { synthetic_customer: customerEmail, manufactured_part: productName }, status: 'success' });

            // Get structured route data with coordinates for map visualization
            try {
              const routeDataRes = await db.execute(
                `SELECT fc.center_name, fc.city, fc.state_province,
                        fc.latitude AS center_lat, fc.longitude AS center_lon,
                        i.quantity_on_hand,
                        ROUND(SDO_GEOM.SDO_DISTANCE(
                          c.location, fc.location, 0.005, 'unit=MILE'), 1) AS distance_mi
                 FROM customers c
                 CROSS JOIN fulfillment_centers fc
                 JOIN inventory i ON fc.center_id = i.center_id
                 JOIN products p ON i.product_id = p.product_id
                 WHERE c.email = :email
                   AND UPPER(p.product_name) LIKE '%' || UPPER(:pname) || '%'
                   AND i.quantity_on_hand > 0
                   AND fc.is_active = 1
                 ORDER BY SDO_GEOM.SDO_DISTANCE(c.location, fc.location, 0.005, 'unit=MILE')
                 FETCH FIRST 5 ROWS ONLY`,
                { email: customerEmail, pname: productName }
              );
              // Get customer coordinates
              const custGeo = await db.execute(
                `SELECT latitude, longitude, city, state_province FROM customers WHERE email = :email`,
                { email: customerEmail }
              );
              if (custGeo.rows.length > 0 && routeDataRes.rows.length > 0) {
                fallbackData = {
                  type: 'route',
                  customer: {
                    lat: custGeo.rows[0].LATITUDE,
                    lon: custGeo.rows[0].LONGITUDE,
                    city: custGeo.rows[0].CITY,
                    state: custGeo.rows[0].STATE_PROVINCE,
                  },
                  product: productName,
                  centers: routeDataRes.rows.map(r => ({
                    name: r.CENTER_NAME,
                    city: r.CITY,
                    state: r.STATE_PROVINCE,
                    lat: r.CENTER_LAT,
                    lon: r.CENTER_LON,
                    stock: r.QUANTITY_ON_HAND,
                    distance: r.DISTANCE_MI,
                  })),
                };
              }
            } catch (geoErr) {
              logOptionalAgentWarning('Route geo data skipped', geoErr);
            }
          } catch (routeErr) {
            const invRes = await db.execute(
              `SELECT check_product_inventory(:pname) AS result FROM dual`,
              { pname: productName }
            );
            fallbackResult = invRes.rows[0]?.RESULT || 'No inventory data found';
            toolsUsed.push({ tool: 'check_product_inventory()', params: { productName }, status: 'success' });
          }
        } else {
          // City not found — fall back to inventory check
          const invRes = await db.execute(
            `SELECT check_product_inventory(:pname) AS result FROM dual`,
            { pname: productName }
          );
          fallbackResult = invRes.rows[0]?.RESULT || 'No inventory data found';
          toolsUsed.push({ tool: 'check_product_inventory()', params: { productName }, status: 'success' });
        }
      } else if (productName) {
        const invRes = await db.execute(
          `SELECT check_product_inventory(:pname) AS result FROM dual`,
          { pname: productName }
        );
        fallbackResult = invRes.rows[0]?.RESULT || 'No inventory data found';
        toolsUsed.push({ tool: 'check_product_inventory()', params: { productName }, status: 'success' });
      } else {
        // General inventory/fulfillment query
        const invRes = await db.execute(
          `SELECT fc.center_name, fc.city, fc.state_province, fc.center_type,
                  COUNT(i.product_id) AS products_stocked,
                  SUM(i.quantity_on_hand) AS total_on_hand,
                  SUM(CASE WHEN i.quantity_on_hand <= i.reorder_point THEN 1 ELSE 0 END) AS low_stock_items
           FROM fulfillment_centers fc
           LEFT JOIN inventory i ON fc.center_id = i.center_id
           WHERE fc.is_active = 1
           GROUP BY fc.center_name, fc.city, fc.state_province, fc.center_type
           ORDER BY total_on_hand DESC
           FETCH FIRST 10 ROWS ONLY`
        );
        fallbackData = invRes.rows;
        fallbackResult = `Plant capacity overview: ${invRes.rows.length} active plants`;
        toolsUsed.push({ tool: 'WORK_ORDER_SQL_TOOL (fallback)', status: 'success' });
      }

    } else {
      // Manufacturing Operations — general work-order value queries
      const operationsRes = await db.execute(
        `SELECT COUNT(*) AS total_work_orders,
                COUNT(CASE WHEN production_signal_id IS NOT NULL THEN 1 END) AS signal_influenced_work_orders,
                ROUND(SUM(work_order_value), 2) AS total_work_order_value,
                ROUND(SUM(CASE WHEN production_signal_id IS NOT NULL THEN work_order_value ELSE 0 END), 2) AS signal_attributed_work_order_value,
                ROUND(AVG(work_order_value), 2) AS average_work_order_value,
                COUNT(DISTINCT customer_account_id) AS unique_customers
         FROM manufacturing_work_orders
         WHERE CAST(created_at AS DATE) >= SYSDATE - 30`
      );
      const c = operationsRes.rows[0] || {};
      const signalPct = c.TOTAL_WORK_ORDERS > 0 ? ((c.SIGNAL_INFLUENCED_WORK_ORDERS / c.TOTAL_WORK_ORDERS) * 100).toFixed(1) : '0';

      fallbackResult = `Last 30 days: ${(c.TOTAL_WORK_ORDERS || 0).toLocaleString()} work orders, $${(c.TOTAL_WORK_ORDER_VALUE || 0).toLocaleString()} order value. ` +
        `${signalPct}% production-signal-driven ($${(c.SIGNAL_ATTRIBUTED_WORK_ORDER_VALUE || 0).toLocaleString()}). ` +
        `Avg work order: $${c.AVERAGE_WORK_ORDER_VALUE || 0}. ${(c.UNIQUE_CUSTOMERS || 0).toLocaleString()} customer accounts.`;
      fallbackData = [c];
      toolsUsed.push({ tool: 'WORK_ORDER_SQL_TOOL (direct)', status: 'success' });

      // Category breakdown if asked
      if (qLower.includes('category') || qLower.includes('breakdown')) {
        const catRes = await db.execute(
          `SELECT p.category,
                  COUNT(DISTINCT o.work_order_id) AS work_order_count,
                  ROUND(SUM(oi.requested_units * oi.planned_unit_value), 2) AS work_order_value
           FROM manufacturing_work_order_lines oi
           JOIN manufacturing_work_orders o ON oi.work_order_id = o.work_order_id
           JOIN products p ON oi.manufactured_part_id = p.product_id
           WHERE CAST(o.created_at AS DATE) >= SYSDATE - 30
           GROUP BY p.category
           ORDER BY work_order_value DESC`
        );
        fallbackData = catRes.rows;
        toolsUsed.push({ tool: 'WORK_ORDER_SQL_TOOL (category)', status: 'success' });
      }
    }
  } catch (toolErr) {
    toolsUsed.push({ tool: 'fallback', status: 'error', reason: toolErr.message });
  }

  // ── Step 4: Log the chat interaction ──
  await logAction('chat_agent', 'chat_query', intent, null, {
    question: q,
    team,
    agent_used: agentUsed,
    tools_called: toolsUsed.length,
    reason: `Chat query routed to ${team} (intent: ${intent})`,
  }, 0.90);

  const elapsed = Date.now() - startTime;

  const toolHistory = toolsUsed.slice(0, 5).map((entry) => ({
    TOOL_NAME: entry.tool,
    CALLED_AT: new Date().toISOString().slice(11, 19),
    RESULT_PREVIEW: entry.reason || entry.status || 'success',
  }));

  res.json({
    question: q,
    team,
    intent,
    agentUsed,
    response: agentResponse || fallbackResult || 'No results found for your question.',
    data: fallbackData,
    toolsUsed,
    toolHistory,
    elapsed,
  });
});

// ── GET /api/agents/teams — list available teams ──
router.get('/teams', async (req, res) => {
  res.json(STATIC_TEAMS);
});

module.exports = router;
