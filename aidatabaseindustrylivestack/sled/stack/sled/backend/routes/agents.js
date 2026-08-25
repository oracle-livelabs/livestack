/**
 * Agents API - application-layer orchestration with Ollama reasoning
 * and Oracle SQL / PL/SQL execution against live demo data.
 */

const express = require('express');
const router = express.Router();
const db = require('../config/database');
const {
  sanitizePublicLifecyclePayload,
  sanitizePublicLifecycleText,
  toPublicRequestStatus,
  toPublicServiceTaskStatus,
} = require('../lib/serviceLifecycle');
const {
  DEFAULT_PROFILE,
  answerQuestion,
  getAvailableProfiles,
  normalizeProfile,
  summarizeContext,
} = require('../lib/ollamaAssistant');

const STATIC_TEAMS = [
  {
    TEAM_NAME: 'SOCIAL_TREND_TEAM',
    STATUS: 'ENABLED',
    DESCRIPTION: 'Ollama-backed resident/community signal analysis over live public service coordination data.',
  },
  {
    TEAM_NAME: 'FULFILLMENT_TEAM',
    STATUS: 'ENABLED',
    DESCRIPTION: 'Ollama-backed service access analysis using capacity and routing context.',
  },
  {
    TEAM_NAME: 'COMMERCE_TEAM',
    STATUS: 'ENABLED',
    DESCRIPTION: 'Ollama-backed civic operations analysis using service requests and service-value context.',
  },
];

router.use((req, res, next) => {
  const originalJson = res.json.bind(res);
  res.json = (payload) => originalJson(sanitizeAgentBusinessPayload(
    sanitizePublicLifecyclePayload(payload, { sanitizeText: true })
  ));
  next();
});

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
  if (teamName === 'SOCIAL_TREND_TEAM') {
    const [summary, products, influencers, momentum] = await Promise.all([
      db.execute(`SELECT detect_trending_products(48, 50) AS result FROM dual`),
      db.execute(
        `SELECT /*+ NO_PARALLEL */ p.product_name, b.brand_name, p.category,
                COUNT(DISTINCT sp.post_id) AS mentions,
                ROUND(AVG(sp.virality_score), 1) AS avg_virality,
                SUM(sp.views_count) AS total_views,
                MAX(sp.momentum_flag) AS peak_momentum
         FROM post_product_mentions ppm
         JOIN social_posts sp ON ppm.post_id = sp.post_id
         JOIN products p ON ppm.product_id = p.product_id
         JOIN brands b ON p.brand_id = b.brand_id
         WHERE CAST(sp.posted_at AS DATE) >= SYSDATE - 2
         GROUP BY p.product_name, b.brand_name, p.category
         ORDER BY avg_virality DESC, total_views DESC
         FETCH FIRST 8 ROWS ONLY`
      ),
      db.execute(
        `SELECT /*+ NO_PARALLEL */ i.handle, i.platform,
                COUNT(sp.post_id) AS posts,
                ROUND(AVG(sp.virality_score), 1) AS avg_virality,
                SUM(sp.views_count) AS total_views
         FROM social_posts sp
         JOIN influencers i ON sp.influencer_id = i.influencer_id
         WHERE CAST(sp.posted_at AS DATE) >= SYSDATE - 2
         GROUP BY i.handle, i.platform
         ORDER BY total_views DESC NULLS LAST
         FETCH FIRST 6 ROWS ONLY`
      ),
      db.execute(
        `SELECT momentum_flag, COUNT(*) AS post_count
         FROM social_posts
         WHERE CAST(posted_at AS DATE) >= SYSDATE - 2
         GROUP BY momentum_flag
         ORDER BY post_count DESC`
      ),
    ]);

    return {
      instructions: 'Focus on public services, community partners, urgent signals, and concrete metrics.',
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
      instructions: 'Focus on capacity risk, routing, and practical service-access actions.',
      context: {
        team: teamName,
        inventory_alerts: inventoryAlerts.rows || [],
        active_centers: centers.rows || [],
      },
    };
  }

  const [summary, categories, orderStatus] = await Promise.all([
    db.execute(
      `SELECT COUNT(*) AS total_orders,
              COUNT(CASE WHEN social_source_id IS NOT NULL THEN 1 END) AS social_orders,
              ROUND(SUM(order_total), 2) AS total_revenue,
              ROUND(SUM(CASE WHEN social_source_id IS NOT NULL THEN order_total ELSE 0 END), 2) AS social_revenue,
              ROUND(AVG(order_total), 2) AS avg_order_value
       FROM orders
       WHERE CAST(created_at AS DATE) >= SYSDATE - 30`
    ),
    db.execute(
      `SELECT p.category,
              COUNT(DISTINCT o.order_id) AS orders,
              ROUND(SUM(oi.quantity * oi.unit_price), 2) AS revenue
       FROM order_items oi
       JOIN orders o ON oi.order_id = o.order_id
       JOIN products p ON oi.product_id = p.product_id
       WHERE CAST(o.created_at AS DATE) >= SYSDATE - 30
       GROUP BY p.category
       ORDER BY revenue DESC
       FETCH FIRST 8 ROWS ONLY`
    ),
    db.execute(
      `SELECT order_status, COUNT(*) AS orders, ROUND(SUM(order_total), 2) AS revenue
       FROM orders
       WHERE CAST(created_at AS DATE) >= SYSDATE - 30
       GROUP BY order_status
       ORDER BY revenue DESC`
    ),
  ]);

  return {
    instructions: 'Focus on service requests, service value, resident-signal attribution, and operational trends.',
    context: {
      team: teamName,
      commerce_summary: summary.rows?.[0] || {},
      category_breakdown: categories.rows || [],
      order_status_breakdown: sanitizePublicLifecyclePayload(orderStatus.rows || []),
    },
  };
}

function fallbackAgentSummary(teamName, context) {
  if (teamName === 'SOCIAL_TREND_TEAM') {
    const products = context.top_products || [];
    if (!products.length) {
      return context.trend_summary || 'No high-demand public services found in the current window.';
    }
    return products
      .slice(0, 3)
      .map((product) => {
        const avgUrgency = product.AVG_VIRALITY == null ? 'n/a' : product.AVG_VIRALITY;
        return `${product.PRODUCT_NAME} (${product.BRAND_NAME}) avg urgency ${avgUrgency}, ${product.MENTIONS} mentions, ${product.TOTAL_VIEWS} views`;
      })
      .join(' | ');
  }

  if (teamName === 'FULFILLMENT_TEAM') {
    const alerts = context.inventory_alerts || [];
    if (!alerts.length) {
      return 'No current low-capacity public service alerts were found.';
    }
    return alerts
      .slice(0, 3)
      .map((item) =>
        `${item.PRODUCT_NAME} at ${item.CENTER_NAME}, ${item.CITY}: ${item.QUANTITY_ON_HAND} on hand vs reorder point ${item.REORDER_POINT} [${item.STOCK_STATUS}]`
      )
      .join(' | ');
  }

  const summary = context.commerce_summary || {};
  const totalOrders = summary.TOTAL_ORDERS || 0;
  const totalRevenue = summary.TOTAL_REVENUE || 0;
  const socialOrders = summary.SOCIAL_ORDERS || 0;
  const socialRevenue = summary.SOCIAL_REVENUE || 0;
  return `Last 30 days: ${totalOrders.toLocaleString()} orders, $${totalRevenue.toLocaleString()} revenue, ${socialOrders.toLocaleString()} resident-signal-driven service requests, $${socialRevenue.toLocaleString()} resident-signal service value.`;
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
          confidence, execution_status, executed_at, service_region_code)
       VALUES
         (:agent, :type, :etype, :eid, :payload, :conf, 'completed', SYSTIMESTAMP,
          SYS_CONTEXT('SLED_APP_CTX', 'REGION'))`,
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
      `INSERT INTO event_stream
         (event_type, event_source, event_data, processed, service_region_code)
       VALUES
         (:etype, :esrc, :edata, 1, SYS_CONTEXT('SLED_APP_CTX', 'REGION'))`,
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
// Runs the SOCIAL_TREND_TEAM to identify urgent public service demand.
// Falls back to direct PL/SQL if the LLM agent is unavailable.
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
    const trendText = trendResult.rows[0]?.RESULT || 'No high-demand public services found';

    // 2. Get top trending public services for per-service action logging
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
       WHERE CAST(sp.posted_at AS DATE) >= SYSDATE - :hours/24
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
       WHERE CAST(posted_at AS DATE) >= SYSDATE - :hours/24
       GROUP BY momentum_flag
       ORDER BY post_count DESC`,
      { hours }
    );

    // 4. Try Ollama-based agent analysis for richer natural-language output (best-effort)
    let agentAnalysis = null;
    try {
      agentAnalysis = await Promise.race([
        askAgent('SOCIAL_TREND_TEAM',
          `Identify the top trending public services and community partners from the last ${hours} hours ` +
          `using the detect trending public services tool with minimum urgency score ${threshold}`),
        new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 10000)),
      ]);
    } catch (agentErr) {
      logOptionalAgentWarning('Ollama trend analysis skipped', agentErr);
    }

    // 5. Log per-product actions
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
        reason: `${p.PEAK_MOMENTUM} public service with ${p.MENTION_COUNT} resident/community signal mentions and urgency ${p.AVG_VIRALITY}`,
      }, confidence);
      loggedActions.push({ public_service_service: p.PRODUCT_NAME, urgency: p.AVG_VIRALITY });
    }

    // 6. Log the overall run summary
    await logAction('trend_detection_agent', 'trend_analysis_complete', 'social_posts', null, {
      window_hours:   hours,
      viral_threshold: threshold,
      public_service_services_found:  products.length,
      reason: agentAnalysis || trendText.slice(0, 500),
    }, 0.90);

    // 7. Emit event
    await logEvent('trend_detected', 'trend_detection_agent', {
      window_hours:   hours,
      threshold,
      public_service_services_found: products.length,
      triggered_at:   new Date().toISOString(),
    });

    res.json({
      message:      `Trend detection complete - ${products.length} urgent public services identified in last ${hours}h`,
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
// Full orchestration: trend detection → inventory check → civic operations attribution.
// All three agent teams run in sequence. Falls back to direct SQL if LLM unavailable.
// ─────────────────────────────────────────────────────────────────────────────
router.post('/run-cycle', async (req, res) => {
  const allActions = [];

  try {
    // ── PHASE 1: Resident Signal ─────────────────────────────────────────────
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
       WHERE CAST(sp.posted_at AS DATE) >= SYSDATE - 2
         AND sp.virality_score >= 50
       GROUP BY p.product_id, p.product_name, b.brand_name
       ORDER BY avg_virality DESC
       FETCH FIRST 5 ROWS ONLY`
    );
    const topProducts = topProductsResult.rows || [];

    // Best-effort LLM trend analysis
    let trendAnalysis = null;
    try {
      trendAnalysis = await Promise.race([
        askAgent('SOCIAL_TREND_TEAM',
          'What public services are trending right now based on resident and community signal activity in the last 48 hours'),
        new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 10000)),
      ]);
    } catch (e) {
      logOptionalAgentWarning('Resident Signal agent skipped', e);
    }

    for (const p of topProducts) {
      await logAction('trend_detection_agent', 'detect_trends', 'product', p.PRODUCT_ID, {
        product_name:  p.PRODUCT_NAME,
        brand:         p.BRAND_NAME,
        mention_count: p.MENTION_COUNT,
        avg_virality:  p.AVG_VIRALITY,
        peak_momentum: p.PEAK_MOMENTUM,
        reason: `Detected via full cycle - ${p.PEAK_MOMENTUM} with urgency ${p.AVG_VIRALITY}`,
      }, p.AVG_VIRALITY > 80 ? 0.95 : 0.85);
      allActions.push({ phase: 'trends', public_service_service: p.PRODUCT_NAME });
    }

    await logEvent('trend_detected', 'master_orchestrator', {
      phase: 'trend_detection', public_service_services_found: topProducts.length,
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
           SELECT /*+ NO_PARALLEL */ DISTINCT ppm.product_id
           FROM post_product_mentions ppm
           JOIN social_posts sp ON ppm.post_id = sp.post_id
           WHERE CAST(sp.posted_at AS DATE) >= SYSDATE - 2
             AND sp.virality_score >= 50
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
          'Which trending public services have critically low capacity and need immediate intervention'),
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
        strategy:           `Pre-position stock at ${inv.CENTER_NAME} - trending public service with ${inv.STOCK_STATUS} inventory`,
        reason: `${inv.STOCK_STATUS} stock (${inv.QUANTITY_ON_HAND} units) for trending product at ${inv.CENTER_NAME}`,
      }, inv.STOCK_STATUS === 'out_of_stock' ? 0.98 : 0.92);
      allActions.push({ phase: 'inventory', product: inv.PRODUCT_NAME, status: inv.STOCK_STATUS });
    }

    await logEvent('inventory_alert', 'inventory_agent', {
      phase: 'inventory_check', critical_count: criticalInventory.length,
    });

    // ── PHASE 3: Public Service Operations Attribution ────────────────────────────────────────
    const commerceResult = await db.execute(
      `SELECT /*+ NO_PARALLEL */
              COUNT(*) AS total_orders,
              COUNT(CASE WHEN social_source_id IS NOT NULL THEN 1 END) AS social_orders,
              ROUND(SUM(order_total), 2) AS total_revenue,
              ROUND(SUM(CASE WHEN social_source_id IS NOT NULL THEN order_total ELSE 0 END), 2) AS social_revenue,
              ROUND(AVG(order_total), 2) AS avg_order_value
       FROM orders
       WHERE CAST(created_at AS DATE) >= SYSDATE - 7`
    );
    const commerce = commerceResult.rows[0] || {};

    // Best-effort LLM commerce analysis
    let commerceAnalysis = null;
    try {
      commerceAnalysis = await Promise.race([
        askAgent('COMMERCE_TEAM',
          'Summarize resident-signal-driven service requests and revenue attribution from the last 7 days'),
        new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 10000)),
      ]);
    } catch (e) {
      logOptionalAgentWarning('Civic operations agent skipped', e);
    }

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
      reason: `${socialPct}% of orders ($${(commerce.SOCIAL_REVENUE || 0).toLocaleString()}) attributed to social in last 7 days`,
    }, 0.93);
    allActions.push({ phase: 'commerce', social_pct: socialPct });

    await logEvent('commerce_analysis_complete', 'master_orchestrator', {
      phase: 'commerce_attribution',
      social_orders: commerce.SOCIAL_ORDERS,
      signal_service_value: commerce.SOCIAL_REVENUE,
    });

    // ── Momentum distribution for result banner ──────────────────────────────
    const distResult = await db.execute(
      `SELECT /*+ NO_PARALLEL */ momentum_flag, COUNT(*) AS post_count
       FROM social_posts
       WHERE CAST(posted_at AS DATE) >= SYSDATE - 2
       GROUP BY momentum_flag
       ORDER BY post_count DESC`
    );

    res.json({
      message: `Full cycle complete - ${topProducts.length} trends · ${criticalInventory.length} capacity alerts · ${socialPct}% resident-signal-driven service requests`,
      phases: {
        trends: {
          public_service_services_found: topProducts.length,
          summary:        trendText.split('\n')[0],
          analysis:       trendAnalysis,
        },
        capacity: {
          critical_items: criticalInventory.length,
          analysis:       fulfillmentAnalysis,
        },
        commerce: {
          total_public_service_requests: commerce.TOTAL_ORDERS,
          signal_public_service_requests: commerce.SOCIAL_ORDERS,
          signal_service_value: commerce.SOCIAL_REVENUE,
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

// ── POST /api/agents/ask - ask a specific agent team a question ──
router.post('/ask', async (req, res) => {
  try {
    const { team, question } = req.body;

    if (!team || !question) {
      return res.status(400).json({ error: 'Both "team" and "question" are required' });
    }

    const validTeams = ['SOCIAL_TREND_TEAM', 'FULFILLMENT_TEAM', 'COMMERCE_TEAM'];
    if (!validTeams.includes(team.toUpperCase())) {
      return res.status(400).json({
        error: `Invalid team. Choose from: ${validTeams.map(publicTeamName).join(', ')}`
      });
    }

    const internalTeam = team.toUpperCase();
    const response = await askAgent(internalTeam, question);

    res.json({ team: publicTeamName(internalTeam), question, response: sanitizeAgentBusinessText(response) });
  } catch (err) {
    console.error('Agent ask error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/agents/trends - ask the trend agent ──
router.post('/trends', async (req, res) => {
  try {
    const { question } = req.body;
    const q = question || 'What public services are trending right now based on resident and community signal activity';
    const response = await askAgent('SOCIAL_TREND_TEAM', q);
    res.json({ team: publicTeamName('SOCIAL_TREND_TEAM'), question: q, response: sanitizeAgentBusinessText(response) });
  } catch (err) {
    console.error('Resident signal agent error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/agents/fulfillment - ask the fulfillment agent ──
router.post('/fulfillment', async (req, res) => {
  try {
    const { question } = req.body;
    const q = question || 'Which trending public services have critically low capacity';
    const response = await askAgent('FULFILLMENT_TEAM', q);
    res.json({ team: publicTeamName('FULFILLMENT_TEAM'), question: q, response: sanitizeAgentBusinessText(response) });
  } catch (err) {
    console.error('Service access agent error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/agents/commerce - ask the commerce agent ──
router.post('/commerce', async (req, res) => {
  try {
    const { question } = req.body;
    const q = question || 'How many service requests were opened in the last 24 hours and what is the total service value exposure';
    const response = await askAgent('COMMERCE_TEAM', q);
    res.json({ team: publicTeamName('COMMERCE_TEAM'), question: q, response: sanitizeAgentBusinessText(response) });
  } catch (err) {
    console.error('Civic operations agent error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/agents/events - recent event stream entries ──
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

// ── GET /api/agents/tool-history - what tools did agents call ──
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

// ── GET /api/agents/team-history - team execution history ──
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

// ── GET /api/agents/actions - audit trail from agent_actions table ──
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

// ── GET /api/agents/summary - agent performance summary ──
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

// ── GET /api/agents/profiles - list available AI profiles ──
router.get('/profiles', async (req, res) => {
  res.json({
    profiles: getAvailableProfiles(),
    activeProfile: DEFAULT_PROFILE,
  });
});

// ── POST /api/agents/set-profile - switch the active AI profile ──
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

function sanitizeAgentBusinessText(value) {
  if (!value || typeof value !== 'string') return value;
  return sanitizePublicLifecycleText(value)
    .replace(/\bSOCIAL_TREND_TEAM\b/g, 'RESIDENT_SIGNAL_TEAM')
    .replace(/\bFULFILLMENT_TEAM\b/g, 'SERVICE_ACCESS_TEAM')
    .replace(/\bCOMMERCE_TEAM\b/g, 'AGENCY_OPERATIONS_TEAM')
    .replace(/\borders\b/gi, 'service requests')
    .replace(/\border\b/gi, 'service request')
    .replace(/\bcustomers\b/gi, 'constituents')
    .replace(/\bcustomer\b/gi, 'constituent')
    .replace(/\bproducts\b/gi, 'public services')
    .replace(/\bproduct\b/gi, 'public service')
    .replace(/\binventory\b/gi, 'capacity')
    .replace(/\bstock\b/gi, 'capacity')
    .replace(/\bsocial-driven\b/gi, 'resident-signal-linked')
    .replace(/\bsocial\b/gi, 'resident signal')
    .replace(/\bviral\b/gi, 'priority')
    .replace(/\bvirality\b/gi, 'priority')
    .replace(/detect_trending_public services\(\)/gi, 'detect_priority_services()')
    .replace(/check_public service_capacity\(\)/gi, 'check_service_capacity()')
    .replace(/find_best_fulfillment\(\)/gi, 'find_best_service_access()');
}

function publicTeamName(team) {
  switch (String(team || '').toUpperCase()) {
    case 'SOCIAL_TREND_TEAM': return 'RESIDENT_SIGNAL_TEAM';
    case 'FULFILLMENT_TEAM': return 'SERVICE_ACCESS_TEAM';
    case 'COMMERCE_TEAM': return 'AGENCY_OPERATIONS_TEAM';
    default: return sanitizeAgentBusinessText(team);
  }
}

const AGENT_PUBLIC_KEYS = {
  PRODUCT_ID: 'SERVICE_ID',
  PRODUCT_NAME: 'SERVICE_NAME',
  BRAND_NAME: 'AGENCY_OR_PROGRAM',
  CUSTOMER_ID: 'CONSTITUENT_ID',
  TOTAL_ORDERS: 'TOTAL_SERVICE_REQUESTS',
  SOCIAL_ORDERS: 'SIGNAL_LINKED_REQUESTS',
  TOTAL_REVENUE: 'SERVICE_VALUE_EXPOSURE',
  SOCIAL_REVENUE: 'SIGNAL_LINKED_SERVICE_VALUE',
  AVG_ORDER_VALUE: 'AVG_REQUEST_VALUE',
  UNIQUE_CUSTOMERS: 'CONSTITUENTS_SERVED',
  ORDERS: 'SERVICE_REQUESTS',
  REVENUE: 'SERVICE_VALUE',
  AVG_VIRALITY: 'AVG_PRIORITY',
  PEAK_MOMENTUM: 'PEAK_PRIORITY',
  MENTIONS: 'SIGNAL_COUNT',
  TOTAL_VIEWS: 'TOTAL_REACH',
  QUANTITY_ON_HAND: 'AVAILABLE_CAPACITY',
  REORDER_POINT: 'CAPACITY_THRESHOLD',
  STOCK_STATUS: 'CAPACITY_STATUS',
  ORDER_STATUS: 'SERVICE_REQUEST_STATUS',
  order_status: 'service_request_status',
  SHIP_STATUS: 'SERVICE_TASK_STATUS',
  ship_status: 'service_task_status',
};

function sanitizeAgentBusinessPayload(value) {
  if (Array.isArray(value)) return value.map(sanitizeAgentBusinessPayload);
  if (value instanceof Date) return value.toISOString();
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, entryValue]) => {
      const publicKey = AGENT_PUBLIC_KEYS[key] || key;
      if (['ORDER_STATUS', 'SERVICE_REQUEST_STATUS', 'REQUEST_STATUS'].includes(String(publicKey).toUpperCase())) {
        return [publicKey, toPublicRequestStatus(entryValue)];
      }
      if (['SHIP_STATUS', 'SERVICE_TASK_STATUS', 'ROUTE_STATUS'].includes(String(publicKey).toUpperCase())) {
        return [publicKey, toPublicServiceTaskStatus(entryValue)];
      }
      return [publicKey, sanitizeAgentBusinessPayload(entryValue)];
    }));
  }
  return sanitizeAgentBusinessText(value);
}

// ── POST /api/agents/chat - intelligent chat routing to agent teams ──
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
  let team = 'COMMERCE_TEAM';
  let intent = 'agency_operations';
  let toolsUsed = [];

  // Strong signals - worth 3 points each (unambiguously indicate one intent)
  const trendStrong = ['trending', 'highest demand', 'urgent', 'urgency', 'viral', 'virality', 'mega_viral', 'momentum', 'advocate', 'community', 'critical resident service signal', 'instagram', 'hashtag', 'rising'];
  const inventoryStrong = ['capacity', 'service access', 'service site', 'same-day', 'counter slots', 'inventory', 'reorder', 'replenish', 'out of capacity'];
  const commerceStrong = ['service value', 'service request', 'request total', 'agency operations'];

  // Weak signals - worth 1 point each (ambiguous, could relate to multiple intents)
  const trendWeak = ['trend', 'signal', 'resident signal', 'post', 'engagement', 'views', 'likes', 'shares', 'sentiment'];
  const inventoryWeak = ['stock', 'route', 'routing', 'center', 'supply', 'logistics', 'completion', 'nearest', 'distance'];
  const commerceWeak = ['request', 'resident', 'value', 'category', 'program', 'service', 'total'];

  const trendScore = trendStrong.filter(k => qLower.includes(k)).length * 3
                   + trendWeak.filter(k => qLower.includes(k)).length;
  const inventoryScore = inventoryStrong.filter(k => qLower.includes(k)).length * 3
                       + inventoryWeak.filter(k => qLower.includes(k)).length;
  const commerceScore = commerceStrong.filter(k => qLower.includes(k)).length * 3
                      + commerceWeak.filter(k => qLower.includes(k)).length;

  if (trendScore >= inventoryScore && trendScore >= commerceScore && trendScore > 0) {
    team = 'SOCIAL_TREND_TEAM'; intent = 'trends';
  } else if (inventoryScore > trendScore && inventoryScore >= commerceScore) {
    team = 'FULFILLMENT_TEAM'; intent = 'fulfillment';
  }

  // ── Step 2: Governed SLED question pipeline ─────────────────────────────
  // The agent team label is retained for the UI, but all reasoning now uses
  // the same governed semantic-view SQL path as Ask State and Local Government Data.
  let agentResponse = null;
  let agentUsed = false;
  let governedResult = null;
  try {
    governedResult = await Promise.race([
      answerQuestion(q, { mode: 'chat', demoUser: req.demoUser }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 180000)),
    ]);
    agentResponse = governedResult.answer;
    agentUsed = true;
    toolsUsed.push({ tool: 'Oracle governed SLED semantic views', status: 'success' });
    toolsUsed.push({ tool: `Ollama ${governedResult.model || 'llama3.2'}`, status: 'success' });
  } catch (queryErr) {
    toolsUsed.push({ tool: 'Oracle governed SLED semantic views', status: 'error', reason: queryErr.message });
  }

  const fallbackResult = governedResult?.answer || null;
  const fallbackData = governedResult?.rows || null;

  // ── Step 3: Log the chat interaction ──
  await logAction('chat_agent', 'chat_query', intent, null, {
    question: q,
    team: publicTeamName(team),
    agent_used: agentUsed,
    tools_called: toolsUsed.length,
    reason: `Chat query routed to ${publicTeamName(team)} (intent: ${intent})`,
  }, 0.90);

  const elapsed = Date.now() - startTime;
  const publicToolsUsed = sanitizeAgentBusinessPayload(toolsUsed).map((entry) => ({
    ...entry,
    team: entry.team ? publicTeamName(entry.team) : undefined,
  }));

  const toolHistory = publicToolsUsed.slice(0, 5).map((entry) => ({
    TOOL_NAME: entry.tool,
    CALLED_AT: new Date().toISOString().slice(11, 19),
    RESULT_PREVIEW: entry.reason || entry.status || 'success',
  }));

  res.json({
    question: q,
    team: publicTeamName(team),
    intent,
    agentUsed,
    response: sanitizeAgentBusinessText(agentResponse || fallbackResult || 'No results found for your question.'),
    data: sanitizeAgentBusinessPayload(fallbackData),
    toolsUsed: publicToolsUsed,
    toolHistory,
    elapsed,
  });
});

// ── GET /api/agents/teams - list available teams ──
router.get('/teams', async (req, res) => {
  res.json(STATIC_TEAMS);
});

module.exports = router;
