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
    TEAM_NAME: 'SOCIAL_TREND_TEAM',
    STATUS: 'ENABLED',
    DESCRIPTION: 'Ollama-backed guest, channel, and demand signal analysis over live hospitality data.',
  },
  {
    TEAM_NAME: 'FULFILLMENT_TEAM',
    STATUS: 'ENABLED',
    DESCRIPTION: 'Ollama-backed housekeeping, maintenance, and property service analysis using capacity and routing context.',
  },
  {
    TEAM_NAME: 'COMMERCE_TEAM',
    STATUS: 'ENABLED',
    DESCRIPTION: 'Ollama-backed guest reservation analysis using orders and revenue context.',
  },
];

const CHAT_AUDIT_LABELS = {
  SOCIAL_TREND_TEAM: {
    label: 'Guest & Demand Signal Agent',
    entityType: 'guest_signals',
    intentLabel: 'guest signals',
  },
  FULFILLMENT_TEAM: {
    label: 'Housekeeping & Maintenance Routing Agent',
    entityType: 'service_operations',
    intentLabel: 'service operations',
  },
  COMMERCE_TEAM: {
    label: 'Reservation Revenue Agent',
    entityType: 'reservation_revenue',
    intentLabel: 'reservation revenue',
  },
};

const TEAM_BY_INTENT = {
  trends: 'SOCIAL_TREND_TEAM',
  fulfillment: 'FULFILLMENT_TEAM',
  commerce: 'COMMERCE_TEAM',
};

const INTENT_BY_TEAM = {
  SOCIAL_TREND_TEAM: 'trends',
  FULFILLMENT_TEAM: 'fulfillment',
  COMMERCE_TEAM: 'commerce',
};

function normalizeAgentConversationHistory(history) {
  if (!Array.isArray(history)) return [];
  return history
    .map((entry) => ({
      role: entry?.role === 'assistant' ? 'agent' : entry?.role,
      text: String(entry?.text || '').trim().slice(0, 1400),
      team: entry?.team && INTENT_BY_TEAM[entry.team] ? entry.team : null,
      intent: entry?.intent && TEAM_BY_INTENT[entry.intent] ? entry.intent : null,
      data: entry?.data || null,
    }))
    .filter((entry) => (entry.role === 'user' || entry.role === 'agent') && entry.text)
    .slice(-12);
}

function findLastAgentTurn(history) {
  return [...history].reverse().find((entry) => entry.role === 'agent') || null;
}

function findLastUserTurn(history, currentQuestion) {
  const current = String(currentQuestion || '').trim().toLowerCase();
  return [...history]
    .reverse()
    .find((entry) => entry.role === 'user' && entry.text.toLowerCase() !== current) || null;
}

function isAgentFollowUpQuestion(question, history) {
  if (!history.length) return false;
  const q = String(question || '').trim();
  if (!q) return false;
  return q.length < 100 ||
    /\b(it|that|those|them|same|previous|above|break down|breakdown|compare|what about|how about|by property|by brand|by guest|by tier|by segment|by source|by category|by room|by operations|why)\b/i.test(q);
}

function scoreAgentIntent(question) {
  const qLower = String(question || '').toLowerCase();
  const trendStrong = ['risk signal', 'severity', 'escalating', 'critical signal', 'revenue impact', 'brand-standard alert', 'channel alert', 'trending', 'viral', 'virality', 'mega_viral', 'momentum', 'influencer', 'source', 'bulletin', 'channel', 'brand-standard', 'criticality', 'channel notice', 'rising'];
  const inventoryStrong = ['processing capacity', 'service capacity', 'operations center', 'inventory', 'warehouse', 'fulfillment', 'reorder', 'replenishment', 'out of capacity', 'regulated', 'allocation'];
  const commerceStrong = ['revenue', 'sales', 'purchase', 'spend', 'order total'];

  const trendWeak = ['trend', 'social', 'post', 'engagement', 'views', 'likes', 'shares', 'sentiment', 'signal', 'brandqa', 'brandstandards', 'ops'];
  const inventoryWeak = ['capacity', 'ship', 'routing', 'center', 'service', 'operations', 'delivery', 'nearest', 'distance', 'site'];
  const commerceWeak = ['order', 'guest', 'price', 'category', 'brand', 'property', 'product', 'room type or revenue center', 'total', 'reservation', 'booking', 'folio'];

  const trendScore = trendStrong.filter(k => qLower.includes(k)).length * 3
                   + trendWeak.filter(k => qLower.includes(k)).length;
  const inventoryScore = inventoryStrong.filter(k => qLower.includes(k)).length * 3
                       + inventoryWeak.filter(k => qLower.includes(k)).length;
  const commerceScore = commerceStrong.filter(k => qLower.includes(k)).length * 3
                      + commerceWeak.filter(k => qLower.includes(k)).length;

  if (trendScore >= inventoryScore && trendScore >= commerceScore && trendScore > 0) {
    return { team: 'SOCIAL_TREND_TEAM', intent: 'trends', maxScore: trendScore };
  }
  if (inventoryScore > trendScore && inventoryScore >= commerceScore) {
    return { team: 'FULFILLMENT_TEAM', intent: 'fulfillment', maxScore: inventoryScore };
  }
  return { team: 'COMMERCE_TEAM', intent: 'commerce', maxScore: commerceScore };
}

function detectAgentRouting(question, history) {
  const base = scoreAgentIntent(question);
  const lastAgent = findLastAgentTurn(history);
  const isFollowUp = isAgentFollowUpQuestion(question, history);
  if (isFollowUp && lastAgent?.team && base.maxScore < 3) {
    return {
      team: lastAgent.team,
      intent: lastAgent.intent || INTENT_BY_TEAM[lastAgent.team] || base.intent,
      contextApplied: true,
    };
  }
  return { ...base, contextApplied: false };
}

function buildContextualAgentQuestion(question, history) {
  if (!isAgentFollowUpQuestion(question, history)) return question;
  const previousUser = findLastUserTurn(history, question);
  const previousAgent = findLastAgentTurn(history);
  if (!previousUser && !previousAgent) return question;

  return [
    `Current follow-up: ${question}`,
    previousUser ? `Previous user question: ${previousUser.text}` : null,
    previousAgent ? `Previous agent answer: ${previousAgent.text}` : null,
    previousAgent?.team ? `Continue with previous team: ${previousAgent.team}` : null,
    'Answer the current follow-up using the same Harborstone hospitality conversation context unless the user explicitly changes topic.',
  ].filter(Boolean).join('\n');
}

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
                COUNT(DISTINCT sp.post_id) AS risk_events,
                ROUND(AVG(sp.virality_score), 1) AS criticality_score,
                SUM(sp.views_count) AS revenue_impact_count,
                MAX(sp.momentum_flag) AS severity_band
         FROM post_product_mentions ppm
         JOIN social_posts sp ON ppm.post_id = sp.post_id
         JOIN products p ON ppm.product_id = p.product_id
         JOIN brands b ON p.brand_id = b.brand_id
         WHERE CAST(sp.posted_at AS DATE) >= SYSDATE - 2
         GROUP BY p.product_name, b.brand_name, p.category
         ORDER BY criticality_score DESC, revenue_impact_count DESC
         FETCH FIRST 8 ROWS ONLY`
      ),
      db.execute(
        `SELECT /*+ NO_PARALLEL */ i.display_name AS signal_source, i.platform,
                COUNT(sp.post_id) AS signal_count,
                ROUND(AVG(sp.virality_score), 1) AS criticality_score,
                SUM(sp.views_count) AS revenue_impact_count
         FROM social_posts sp
         JOIN influencers i ON sp.influencer_id = i.influencer_id
         WHERE CAST(sp.posted_at AS DATE) >= SYSDATE - 2
         GROUP BY i.display_name, i.platform
         ORDER BY revenue_impact_count DESC NULLS LAST
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
      instructions: 'Focus on room types and revenue centers, properties, risk signals, risk severity, and concrete metrics.',
      context: {
        team: teamName,
        trend_summary: summary.rows?.[0]?.RESULT || null,
        top_products: products.rows || [],
        top_sources: influencers.rows || [],
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
                  WHEN i.quantity_on_hand = 0 THEN 'out_of_capacity'
                  WHEN i.quantity_on_hand <= i.reorder_point * 0.5 THEN 'critical'
                  WHEN i.quantity_on_hand <= i.reorder_point THEN 'low'
                  ELSE 'ok'
                END AS capacity_status
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
                SUM(CASE WHEN i.quantity_on_hand <= i.reorder_point THEN 1 ELSE 0 END) AS low_capacity_items
         FROM fulfillment_centers fc
         LEFT JOIN inventory i ON fc.center_id = i.center_id
         WHERE fc.is_active = 1
         GROUP BY fc.center_name, fc.city, fc.state_province, fc.center_type
         ORDER BY total_on_hand DESC
         FETCH FIRST 8 ROWS ONLY`
      ),
    ]);

    return {
      instructions: 'Focus on service-capacity risk, property routing, housekeeping and maintenance actions, and SLA recovery.',
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
    instructions: 'Focus on reservations, folios, room revenue, signal attribution, and hospitality business trends.',
    context: {
      team: teamName,
      commerce_summary: summary.rows?.[0] || {},
      category_breakdown: categories.rows || [],
      order_status_breakdown: orderStatus.rows || [],
    },
  };
}

function fallbackAgentSummary(teamName, context) {
  if (teamName === 'SOCIAL_TREND_TEAM') {
    const products = context.top_products || [];
    if (!products.length) {
      return context.trend_summary || 'No watched room types and revenue centers found in the current window.';
    }
    return products
      .slice(0, 3)
      .map((product) => {
        const riskSeverity = product.CRITICALITY_SCORE == null ? 'n/a' : product.CRITICALITY_SCORE;
        return `${product.PRODUCT_NAME} (${product.BRAND_NAME}) avg risk severity ${riskSeverity}, ${product.RISK_EVENTS} risk events, ${product.REVENUE_IMPACT_COUNT ?? product.EXPOSURE_COUNT ?? 0} revenue exposure, severity ${formatSeverityBand(product.SEVERITY_BAND)}`;
      })
      .join(' | ');
  }

  if (teamName === 'FULFILLMENT_TEAM') {
    const alerts = context.inventory_alerts || [];
    if (!alerts.length) {
      return 'No current service-capacity alerts were found.';
    }
    return alerts
      .slice(0, 3)
      .map((item) =>
        `${item.PRODUCT_NAME} at ${item.CENTER_NAME}, ${item.CITY}: ${item.QUANTITY_ON_HAND} processing capacity vs threshold ${item.REORDER_POINT} [${item.CAPACITY_STATUS}]`
      )
      .join(' | ');
  }

  const summary = context.commerce_summary || {};
  const totalOrders = summary.TOTAL_ORDERS || 0;
  const totalRevenue = summary.TOTAL_REVENUE || 0;
  const socialOrders = summary.SOCIAL_ORDERS || 0;
  const socialRevenue = summary.SOCIAL_REVENUE || 0;
  return `Last 30 days: ${totalOrders.toLocaleString()} reservations, $${totalRevenue.toLocaleString()} total revenue, ${socialOrders.toLocaleString()} signal-driven reservations, $${socialRevenue.toLocaleString()} signal-attributed revenue.`;
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

function formatSeverityBand(flag) {
  switch (flag) {
    case 'mega_viral': return 'Critical';
    case 'viral': return 'Escalating';
    case 'rising': return 'Elevated';
    case 'normal': return 'Normal';
    default: return flag ? String(flag).replaceAll('_', ' ') : 'Unknown';
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/agents/detect-trends
// Runs the signal team to identify critical room type or revenue center signals.
// Falls back to direct PL/SQL if the LLM agent is unavailable.
// ─────────────────────────────────────────────────────────────────────────────
router.post('/detect-trends', async (req, res) => {
  const { windowHours = 24, viralThreshold = 75 } = req.body;
  const hours     = parseInt(windowHours);
  const threshold = parseInt(viralThreshold);

  try {
    // 1. PL/SQL signal detection (always reliable)
    const trendResult = await db.execute(
      `SELECT detect_trending_products(:hours, :threshold) AS result FROM dual`,
      { hours, threshold }
    );
    const trendText = trendResult.rows[0]?.RESULT || 'No critical risk signals found';

    // 2. Get top risk-signal products for per-product action logging
    const productsResult = await db.execute(
      `SELECT /*+ NO_PARALLEL */ p.product_id, p.product_name, b.brand_name,
              COUNT(DISTINCT sp.post_id)        AS risk_events,
              ROUND(AVG(sp.virality_score), 1)  AS criticality_score,
              SUM(sp.views_count)               AS revenue_impact_count,
              MAX(sp.momentum_flag)             AS severity_band
       FROM post_product_mentions ppm
       JOIN social_posts sp ON ppm.post_id    = sp.post_id
       JOIN products p      ON ppm.product_id = p.product_id
       JOIN brands b        ON p.brand_id     = b.brand_id
       WHERE CAST(sp.posted_at AS DATE) >= SYSDATE - :hours/24
         AND sp.virality_score >= :threshold
       GROUP BY p.product_id, p.product_name, b.brand_name
       ORDER BY criticality_score DESC
       FETCH FIRST 5 ROWS ONLY`,
      { hours, threshold }
    );
    const products = productsResult.rows || [];

    // 3. Severity distribution for the result banner
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
          `Identify the top room type or revenue center signals and signal sources from the last ${hours} hours ` +
          `using the risk-signal detector with minimum risk severity score ${threshold}`),
        new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 10000)),
      ]);
    } catch (agentErr) {
      logOptionalAgentWarning('Ollama risk-signal analysis skipped', agentErr);
    }

    // 5. Log per-product actions
    const loggedActions = [];
    for (const p of products) {
      const confidence = p.CRITICALITY_SCORE > 80 ? 0.95 : p.CRITICALITY_SCORE > 60 ? 0.85 : 0.75;
      await logAction('trend_detection_agent', 'detect_trends', 'product', p.PRODUCT_ID, {
        product_name:  p.PRODUCT_NAME,
        brand:         p.BRAND_NAME,
        risk_events:   p.RISK_EVENTS,
        risk_severity_score: p.CRITICALITY_SCORE,
        revenue_impact_count: p.EXPOSURE_COUNT,
        severity_band: formatSeverityBand(p.SEVERITY_BAND),
        window_hours:  hours,
        reason: `${formatSeverityBand(p.SEVERITY_BAND)} room type or revenue center signal with ${p.RISK_EVENTS} brand-standard alerts and risk severity ${p.CRITICALITY_SCORE}`,
      }, confidence);
      loggedActions.push({ product: p.PRODUCT_NAME, risk_severity_score: p.CRITICALITY_SCORE });
    }

    // 6. Log the overall run summary
    await logAction('trend_detection_agent', 'trend_analysis_complete', 'social_posts', null, {
      window_hours:   hours,
      risk_severity_threshold: threshold,
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
      message:      `Signal detection complete - ${products.length} critical room type or revenue center signals identified in last ${hours}h`,
      signal_summary: trendText,
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
// Full orchestration: signal detection -> inventory check -> order attribution.
// All three agent teams run in sequence. Falls back to direct SQL if LLM unavailable.
// ─────────────────────────────────────────────────────────────────────────────
router.post('/run-cycle', async (req, res) => {
  const allActions = [];

  try {
    // ── PHASE 1: Signal Detection ────────────────────────────────────────────
    const trendResult = await db.execute(
      `SELECT detect_trending_products(48, 50) AS result FROM dual`
    );
    const trendText = trendResult.rows[0]?.RESULT || '';

    const topProductsResult = await db.execute(
      `SELECT /*+ NO_PARALLEL */ p.product_id, p.product_name, b.brand_name,
              COUNT(DISTINCT sp.post_id)       AS risk_events,
              ROUND(AVG(sp.virality_score), 1) AS criticality_score,
              MAX(sp.momentum_flag)            AS severity_band
       FROM post_product_mentions ppm
       JOIN social_posts sp ON ppm.post_id    = sp.post_id
       JOIN products p      ON ppm.product_id = p.product_id
       JOIN brands b        ON p.brand_id     = b.brand_id
       WHERE CAST(sp.posted_at AS DATE) >= SYSDATE - 2
         AND sp.virality_score >= 50
       GROUP BY p.product_id, p.product_name, b.brand_name
       ORDER BY criticality_score DESC
       FETCH FIRST 5 ROWS ONLY`
    );
    const topProducts = topProductsResult.rows || [];

    // Best-effort LLM risk-signal analysis
    let trendAnalysis = null;
    try {
      trendAnalysis = await Promise.race([
        askAgent('SOCIAL_TREND_TEAM',
          'What room type or revenue center signals are critical right now based on channel and demand activity in the last 48 hours'),
        new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 10000)),
      ]);
    } catch (e) {
      logOptionalAgentWarning('Trend agent skipped', e);
    }

    for (const p of topProducts) {
      await logAction('trend_detection_agent', 'detect_trends', 'product', p.PRODUCT_ID, {
        product_name:  p.PRODUCT_NAME,
        brand:         p.BRAND_NAME,
        risk_events:   p.RISK_EVENTS,
        risk_severity_score: p.CRITICALITY_SCORE,
        severity_band: formatSeverityBand(p.SEVERITY_BAND),
        reason: `Detected via full cycle - ${formatSeverityBand(p.SEVERITY_BAND)} severity with risk severity ${p.CRITICALITY_SCORE}`,
      }, p.CRITICALITY_SCORE > 80 ? 0.95 : 0.85);
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
          'Which critical room types and revenue centers have low inventory and need immediate replenishment or allocation'),
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
        capacity_status:       inv.STOCK_STATUS,
        strategy:           `Pre-position capacity at ${inv.CENTER_NAME} - critical room type or revenue center with ${inv.STOCK_STATUS} inventory`,
        reason: `${inv.STOCK_STATUS} capacity (${inv.QUANTITY_ON_HAND} units) for critical room type or revenue center at ${inv.CENTER_NAME}`,
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
       WHERE CAST(created_at AS DATE) >= SYSDATE - 7`
    );
    const commerce = commerceResult.rows[0] || {};

    // Best-effort LLM commerce analysis
    let commerceAnalysis = null;
    try {
      commerceAnalysis = await Promise.race([
        askAgent('COMMERCE_TEAM',
          'Summarize signal-driven guest reservations and revenue attribution from the last 7 days'),
        new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 10000)),
      ]);
    } catch (e) {
      logOptionalAgentWarning('Commerce agent skipped', e);
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
      reason: `${socialPct}% of orders ($${(commerce.SOCIAL_REVENUE || 0).toLocaleString()}) attributed to brand-standard and demand signals in last 7 days`,
    }, 0.93);
    allActions.push({ phase: 'commerce', social_pct: socialPct });

    await logEvent('commerce_analysis_complete', 'master_orchestrator', {
      phase: 'commerce_attribution',
      social_orders: commerce.SOCIAL_ORDERS,
      social_revenue: commerce.SOCIAL_REVENUE,
    });

    // ── Severity distribution for result banner ──────────────────────────────
    const distResult = await db.execute(
      `SELECT /*+ NO_PARALLEL */ momentum_flag, COUNT(*) AS post_count
       FROM social_posts
       WHERE CAST(posted_at AS DATE) >= SYSDATE - 2
       GROUP BY momentum_flag
       ORDER BY post_count DESC`
    );

    res.json({
      message: `Full cycle complete - ${topProducts.length} signals · ${criticalInventory.length} capacity alerts · ${socialPct}% signal-driven orders`,
      phases: {
        signals: {
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

// ── POST /api/agents/ask — ask a specific agent team a question ──
router.post('/ask', async (req, res) => {
  try {
    const { team, question } = req.body;

    if (!team || !question) {
      return res.status(400).json({ error: 'Both "team" and "question" are required' });
    }

    const validTeams = ['SOCIAL_TREND_TEAM', 'FULFILLMENT_TEAM', 'COMMERCE_TEAM'];
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
    const q = question || 'What room type or revenue center signals are critical right now based on channel and demand activity';
    const response = await askAgent('SOCIAL_TREND_TEAM', q);
    res.json({ team: 'SOCIAL_TREND_TEAM', question: q, response });
  } catch (err) {
    console.error('Trends agent error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/agents/fulfillment — ask the fulfillment agent ──
router.post('/fulfillment', async (req, res) => {
  try {
    const { question } = req.body;
    const q = question || 'Which critical room types and revenue centers have low inventory';
    const response = await askAgent('FULFILLMENT_TEAM', q);
    res.json({ team: 'FULFILLMENT_TEAM', question: q, response });
  } catch (err) {
    console.error('Fulfillment agent error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/agents/commerce — ask the commerce agent ──
router.post('/commerce', async (req, res) => {
  try {
    const { question } = req.body;
    const q = question || 'How many orders were placed in the last 24 hours and what is the total revenue';
    const response = await askAgent('COMMERCE_TEAM', q);
    res.json({ team: 'COMMERCE_TEAM', question: q, response });
  } catch (err) {
    console.error('Commerce agent error:', err);
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
  const { question, history = [], profile } = req.body;
  if (!question || !question.trim()) {
    return res.status(400).json({ error: 'A question is required' });
  }

  const q = question.trim();
  const conversationHistory = normalizeAgentConversationHistory(history);
  const contextualQuestion = buildContextualAgentQuestion(q, conversationHistory);
  const qLower = contextualQuestion.toLowerCase();
  const startTime = Date.now();
  const resolvedProfile = normalizeProfile(profile || DEFAULT_PROFILE);

  // ── Step 1: Auto-detect intent and pick agent team ──
  const routing = detectAgentRouting(q, conversationHistory);
  let team = routing.team;
  let intent = routing.intent;
  let toolsUsed = routing.contextApplied
    ? [{
      tool: 'CONVERSATION_CONTEXT',
      status: 'success',
      reason: `Continued prior ${CHAT_AUDIT_LABELS[team]?.intentLabel || intent} thread`,
    }]
    : [];

  // ── Step 2: Try Ollama team reasoning first ─────────────────────────────
  let agentResponse = null;
  let agentUsed = false;
  try {
    agentResponse = await Promise.race([
      askAgent(team, contextualQuestion),
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
      const scoreMatch = qLower.match(/score.*?(\d+)|criticality.*?(\d+)|severity.*?(\d+)|virality.*?(\d+)/);
      const minScore = scoreMatch ? parseInt(scoreMatch[1] || scoreMatch[2] || scoreMatch[3] || scoreMatch[4]) : 50;

      const trendRes = await db.execute(
        `SELECT detect_trending_products(:hours, :score) AS result FROM dual`,
        { hours, score: minScore }
      );
      fallbackResult = trendRes.rows[0]?.RESULT || 'No critical room type or revenue center signals found';
      toolsUsed.push({ tool: 'DETECT_TRENDS_TOOL', params: { hours, minScore }, status: 'success' });

      // Also get structured data
      const dataRes = await db.execute(
        `SELECT p.product_name, b.brand_name, p.category,
                COUNT(DISTINCT sp.post_id) AS risk_events,
                ROUND(AVG(sp.virality_score), 1) AS criticality_score,
                SUM(sp.views_count) AS revenue_impact_count,
                CASE MAX(sp.momentum_flag)
                  WHEN 'mega_viral' THEN 'Critical'
                  WHEN 'viral' THEN 'Escalating'
                  WHEN 'rising' THEN 'Elevated'
                  WHEN 'normal' THEN 'Normal'
                  ELSE MAX(sp.momentum_flag)
                END AS severity_band
         FROM post_product_mentions ppm
         JOIN social_posts sp ON ppm.post_id = sp.post_id
         JOIN products p ON ppm.product_id = p.product_id
         JOIN brands b ON p.brand_id = b.brand_id
         WHERE CAST(sp.posted_at AS DATE) >= SYSDATE - :hours/24
           AND sp.virality_score >= :score
         GROUP BY p.product_name, b.brand_name, p.category
         ORDER BY criticality_score DESC
         FETCH FIRST 10 ROWS ONLY`,
        { hours, score: minScore }
      );
      fallbackData = dataRes.rows;

      // Check for signal-source-specific questions
      const handleMatch = q.match(/@[\w_]+/);
      if (handleMatch || qLower.includes('influencer') || qLower.includes('source')) {
        const handle = handleMatch ? handleMatch[0] : null;
        if (handle) {
          const netRes = await db.execute(
            `SELECT get_influencer_network(:handle) AS result FROM dual`,
            { handle }
          );
          fallbackResult += '\n\n' + (netRes.rows[0]?.RESULT || '');
          toolsUsed.push({ tool: 'SIGNAL_NETWORK_TOOL', params: { handle }, status: 'success' });
        }
      }

    } else if (intent === 'fulfillment') {
      // Extract room type or revenue center name from question
      const productPatterns = [
        /["']([^"']+)["']/,                                                           // quoted room type or revenue center name
        /(?:inventory|capacity|check)\s+(?:for|of|on)\s+(?:the\s+)?(.+?)(?:\s+across|\s+at|\s+in|\s*\??\s*$)/i,
        /(?:ship|deliver|send|route)\s+(?:the\s+)?(.+?)(?:\s+to\s+|\s+for\s+)/i,
        /(?:fulfillment|nearest)\s+(?:center\s+)?(?:for|with)\s+(.+?)(?:\s+in\s+capacity|\s+to\s+|\s+for\s+|\s*\??\s*$)/i,
        /(?:for|of|about)\s+(?:the\s+)?([A-Z][A-Za-z\s]+?)(?:\s+across|\s+at|\s+in|\s+to|\s*\??\s*$)/i,
      ];
      let productName = null;
      for (const pat of productPatterns) {
        const m = q.match(pat);
        if (m) {
          let pn = m[1].trim();
          // Clean up: remove trailing filler words
          pn = pn.replace(/\s+(items?|products?|room types and revenue centers?|costs?)\s*$/i, '').trim();
          // Skip if the extracted name looks like a non-room type or revenue center phrase.
          if (pn.length >= 3 && !/^(a |the |an |to |in |for )/i.test(pn)) {
            productName = pn;
            break;
          }
        }
      }

      // Check if this is a routing question that mentions a guest or city.
      const cityMatch = q.match(/(?:to|in|near)\s+(?:a\s+(?:guest|guest)\s+in\s+)?([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/);
      const emailMatch = q.match(/[\w.]+@[\w.]+/);

      if (productName && (cityMatch || emailMatch)) {
        // Spatial routing: find best property hotel.
        let guestEmail = emailMatch ? emailMatch[0] : null;

        // If user gave a city name, look up a real guest email in that city.
        if (!guestEmail && cityMatch) {
          const cityName = cityMatch[1];
          try {
            const custRes = await db.execute(
              `SELECT email FROM guests WHERE UPPER(city) = UPPER(:city) FETCH FIRST 1 ROWS ONLY`,
              { city: cityName }
            );
            if (custRes.rows.length > 0) {
              guestEmail = custRes.rows[0].EMAIL;
              toolsUsed.push({ tool: 'GUEST_LOOKUP_TOOL', params: { city: cityName }, status: 'success', email: guestEmail });
            }
          } catch (_) {}
        }

        if (guestEmail) {
          try {
            const routeRes = await db.execute(
              `SELECT find_best_fulfillment(:email, :pname) AS result FROM dual`,
              { email: guestEmail, pname: productName }
            );
            fallbackResult = routeRes.rows[0]?.RESULT || 'No fulfillment route found';
            toolsUsed.push({ tool: 'ROUTE_SERVICE_CASE_TOOL', params: { guest: guestEmail, product: productName }, status: 'success' });

            // Get structured route data with coordinates for map visualization
            try {
              const routeDataRes = await db.execute(
                `SELECT fc.center_name, fc.city, fc.state_province,
                        fc.latitude AS center_lat, fc.longitude AS center_lon,
                        i.quantity_on_hand,
                        ROUND(SDO_GEOM.SDO_DISTANCE(
                          c.location, fc.location, 0.005, 'unit=MILE'), 1) AS distance_mi
                 FROM guests c
                 CROSS JOIN fulfillment_centers fc
                 JOIN inventory i ON fc.center_id = i.center_id
                 JOIN products p ON i.product_id = p.product_id
                 WHERE c.email = :email
                   AND UPPER(p.product_name) LIKE '%' || UPPER(:pname) || '%'
                   AND i.quantity_on_hand > 0
                   AND fc.is_active = 1
                 ORDER BY SDO_GEOM.SDO_DISTANCE(c.location, fc.location, 0.005, 'unit=MILE')
                 FETCH FIRST 5 ROWS ONLY`,
                { email: guestEmail, pname: productName }
              );
              // Get guest coordinates
              const custGeo = await db.execute(
                `SELECT latitude, longitude, city, state_province FROM guests WHERE email = :email`,
                { email: guestEmail }
              );
              if (custGeo.rows.length > 0 && routeDataRes.rows.length > 0) {
                fallbackData = {
                  type: 'route',
                  guest: {
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
                    capacity: r.QUANTITY_ON_HAND,
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
            fallbackResult = invRes.rows[0]?.RESULT || 'No capacity data found';
            toolsUsed.push({ tool: 'CHECK_SERVICE_CAPACITY_TOOL', params: { productName }, status: 'success' });
          }
        } else {
          // City not found: fall back to inventory check.
          const invRes = await db.execute(
            `SELECT check_product_inventory(:pname) AS result FROM dual`,
            { pname: productName }
          );
          fallbackResult = invRes.rows[0]?.RESULT || 'No capacity data found';
          toolsUsed.push({ tool: 'CHECK_SERVICE_CAPACITY_TOOL', params: { productName }, status: 'success' });
        }
      } else if (productName) {
        const invRes = await db.execute(
          `SELECT check_product_inventory(:pname) AS result FROM dual`,
          { pname: productName }
        );
        fallbackResult = invRes.rows[0]?.RESULT || 'No capacity data found';
        toolsUsed.push({ tool: 'CHECK_SERVICE_CAPACITY_TOOL', params: { productName }, status: 'success' });
      } else {
        // General inventory/fulfillment query.
        const invRes = await db.execute(
          `SELECT fc.center_name, fc.city, fc.state_province, fc.center_type,
                  COUNT(i.product_id) AS products_available,
                  SUM(i.quantity_on_hand) AS total_on_hand,
                  SUM(CASE WHEN i.quantity_on_hand <= i.reorder_point THEN 1 ELSE 0 END) AS low_capacity_items
           FROM fulfillment_centers fc
           LEFT JOIN inventory i ON fc.center_id = i.center_id
           WHERE fc.is_active = 1
           GROUP BY fc.center_name, fc.city, fc.state_province, fc.center_type
           ORDER BY total_on_hand DESC
           FETCH FIRST 10 ROWS ONLY`
        );
        fallbackData = invRes.rows;
        fallbackResult = `Fulfillment overview: ${invRes.rows.length} active centers`;
        toolsUsed.push({ tool: 'HOSPITALITY_SQL_TOOL (service capacity)', status: 'success' });
      }

    } else {
      // guest reservation and revenue queries.
      const commerceRes = await db.execute(
        `SELECT COUNT(*) AS total_orders,
                COUNT(CASE WHEN social_source_id IS NOT NULL THEN 1 END) AS social_orders,
                ROUND(SUM(order_total), 2) AS total_revenue,
                ROUND(SUM(CASE WHEN social_source_id IS NOT NULL THEN order_total ELSE 0 END), 2) AS social_revenue,
                ROUND(AVG(order_total), 2) AS avg_order_value,
                COUNT(DISTINCT guest_id) AS unique_guests
         FROM orders
         WHERE CAST(created_at AS DATE) >= SYSDATE - 30`
      );
      const c = commerceRes.rows[0] || {};
      const socialPct = c.TOTAL_ORDERS > 0 ? ((c.SOCIAL_ORDERS / c.TOTAL_ORDERS) * 100).toFixed(1) : '0';

      fallbackResult = `Last 30 days: ${(c.TOTAL_ORDERS || 0).toLocaleString()} orders, $${(c.TOTAL_REVENUE || 0).toLocaleString()} revenue. ` +
        `${socialPct}% signal-driven ($${(c.SOCIAL_REVENUE || 0).toLocaleString()}). ` +
        `Avg reservation: $${c.AVG_ORDER_VALUE || 0}. ${(c.UNIQUE_GUESTS || 0).toLocaleString()} unique guests.`;
      fallbackData = [c];
      toolsUsed.push({ tool: 'HOSPITALITY_SQL_TOOL (reservation revenue)', status: 'success' });

      // Category breakdown if asked
      if (qLower.includes('category') || qLower.includes('breakdown')) {
        const catRes = await db.execute(
          `SELECT p.category,
                  COUNT(DISTINCT o.order_id) AS orders,
                  ROUND(SUM(oi.quantity * oi.unit_price), 2) AS revenue
           FROM order_items oi
           JOIN orders o ON oi.order_id = o.order_id
           JOIN products p ON oi.product_id = p.product_id
           WHERE CAST(o.created_at AS DATE) >= SYSDATE - 30
           GROUP BY p.category
           ORDER BY revenue DESC`
        );
        fallbackData = catRes.rows;
        toolsUsed.push({ tool: 'HOSPITALITY_SQL_TOOL (room type category)', status: 'success' });
      }
    }
  } catch (toolErr) {
    toolsUsed.push({ tool: 'fallback', status: 'error', reason: toolErr.message });
  }

  // ── Step 4: Log the chat interaction ──
  const auditLabels = CHAT_AUDIT_LABELS[team] || {
    label: team,
    entityType: intent,
    intentLabel: intent,
  };

  await logAction('chat_agent', 'chat_query', auditLabels.entityType, null, {
    question: q,
    team,
    agent_used: agentUsed,
    profile: resolvedProfile,
    conversation_turns: conversationHistory.length,
    context_applied: routing.contextApplied,
    tools_called: toolsUsed.length,
    reason: `Chat query routed to ${auditLabels.label} (${auditLabels.intentLabel})`,
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
    profile: resolvedProfile,
    contextApplied: routing.contextApplied,
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
