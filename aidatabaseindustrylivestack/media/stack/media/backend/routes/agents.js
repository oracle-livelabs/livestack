/**
 * Agents API — application-layer orchestration with Ollama reasoning
 * and Oracle SQL / PL/SQL execution against live demo data.
 */

const express = require('express');
const router = express.Router();

// Native Agent commands are deferred for this wave. Keep the interactive chat
// and profile-selection transports available, while retiring command-like
// endpoints before their legacy handlers can mutate operational demo data.
const ENABLED_AGENT_POST_ROUTES = new Set(['/chat', '/set-profile']);
router.use((req, res, next) => {
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) return next();
  if (req.method === 'POST' && ENABLED_AGENT_POST_ROUTES.has(req.path)) return next();
  return res.status(410).json({
    error: 'Native Agent commands are deferred for this LiveStack wave.',
    code: 'DEFERRED_AGENT_COMMAND_GONE',
    mutating: false,
  });
});
const db = require('../config/database');
const {
  DEFAULT_PROFILE,
  answerQuestion,
  getAvailableProfiles,
  normalizeProfile,
  summarizeContext,
} = require('../lib/ollamaAssistant');
const {
  MEDIA_AGENT_TEAMS,
  TEAM_ALIASES,
  cleanAgentFallbackText,
  normalizeAgentTeam,
  resolveAgentRuntimeMode,
  routeAgentQuestion,
} = require('../lib/agentChatRouting');

const TEAM_SIGNAL = MEDIA_AGENT_TEAMS.SIGNAL;
const TEAM_DISTRIBUTION = MEDIA_AGENT_TEAMS.DISTRIBUTION;
const TEAM_REVENUE = MEDIA_AGENT_TEAMS.REVENUE;
const VALID_TEAMS = [...Object.values(MEDIA_AGENT_TEAMS), ...Object.keys(TEAM_ALIASES)];

const STATIC_TEAMS = [
  {
    TEAM_NAME: TEAM_SIGNAL,
    STATUS: 'ENABLED',
    DESCRIPTION: 'Ollama-backed audience and community signal analysis over live media and entertainment intelligence data.',
  },
  {
    TEAM_NAME: TEAM_DISTRIBUTION,
    STATUS: 'ENABLED',
    DESCRIPTION: 'Ollama-backed content distribution analysis using capacity and routing context.',
  },
  {
    TEAM_NAME: TEAM_REVENUE,
    STATUS: 'ENABLED',
    DESCRIPTION: 'Ollama-backed content operations analysis using campaign requests and content-revenue context.',
  },
];

function isHighDemandAssetQuestion(question) {
  const qLower = String(question || '').toLowerCase();
  return /content assets?/.test(qLower)
    && /(highest demand|demand right now|current demand|seeing .*demand|forecast demand|predicted demand|most demand)/.test(qLower);
}

function isIncompleteAgentResponse(text) {
  return /(context is incomplete|does not provide information|need additional context|without this information|impossible to determine|cannot determine which content assets|no specific data on demand)/i.test(String(text || ''));
}

function hasDemandEvidence(text) {
  return /(predicted demand|views|audience signals|campaign requests|rights-capacity units|demand score)/i.test(String(text || ''));
}

function formatNumber(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '0';
  return Math.round(number).toLocaleString();
}

function formatDemandAssetSummary(rows) {
  const assets = Array.isArray(rows) ? rows.slice(0, 3) : [];
  if (!assets.length) {
    return 'No high-demand content assets were found in the current media operations window.';
  }

  const details = assets.map((asset) => {
    const name = asset.CONTENT_ASSET || asset.PRODUCT_NAME || 'Content asset';
    const studio = asset.STUDIO_OR_LABEL || asset.BRAND_NAME;
    const predictedDemand = formatNumber(asset.PREDICTED_DEMAND);
    const totalViews = formatNumber(asset.TOTAL_VIEWS);
    const signals = formatNumber(asset.AUDIENCE_SIGNALS || asset.MENTIONS);
    const avgUrgency = asset.AVG_URGENCY == null ? 'n/a' : Number(asset.AVG_URGENCY).toFixed(1);
    const campaignRequests = formatNumber(asset.CAMPAIGN_REQUESTS);
    const capacity = formatNumber(asset.CAPACITY_UNITS_AVAILABLE);
    return `${name}${studio ? ` (${studio})` : ''}: ${predictedDemand} predicted demand, ${totalViews} views, ${signals} audience signals, avg urgency ${avgUrgency}, ${campaignRequests} campaign requests, ${capacity} rights-capacity units available`;
  });

  return `Highest-demand content assets right now: ${details.join('; ')}.`;
}

async function fetchHighDemandAssets(limit = 8) {
  const boundedLimit = Math.min(Math.max(parseInt(limit, 10) || 8, 1), 20);
  const result = await db.execute(
    `WITH signal_window AS (
       SELECT MAX(CAST(posted_at AS DATE)) AS max_posted_at
       FROM social_posts
     ),
     request_window AS (
       SELECT MAX(CAST(created_at AS DATE)) AS max_created_at
       FROM orders
     ),
     signal_metrics AS (
       SELECT ppm.product_id AS content_asset_id,
              COUNT(DISTINCT sp.post_id) AS audience_signals,
              ROUND(AVG(sp.virality_score), 1) AS avg_urgency,
              SUM(sp.views_count) AS total_views,
              MAX(sp.momentum_flag) AS peak_momentum
       FROM post_product_mentions ppm
       JOIN social_posts sp ON sp.post_id = ppm.post_id
       CROSS JOIN signal_window sw
       WHERE sw.max_posted_at IS NULL
          OR CAST(sp.posted_at AS DATE) >= sw.max_posted_at - 2
       GROUP BY ppm.product_id
     ),
     campaign_metrics AS (
       SELECT oi.product_id AS content_asset_id,
              COUNT(DISTINCT o.order_id) AS campaign_requests,
              SUM(oi.quantity) AS requested_units,
              ROUND(SUM(oi.line_total), 2) AS campaign_value
       FROM order_items oi
       JOIN orders o ON o.order_id = oi.order_id
       CROSS JOIN request_window rw
       WHERE rw.max_created_at IS NULL
          OR CAST(o.created_at AS DATE) >= rw.max_created_at - 7
       GROUP BY oi.product_id
     ),
     forecast_window AS (
       SELECT MAX(TRUNC(forecast_date)) AS max_forecast_date
       FROM demand_forecasts
     ),
     forecast_metrics AS (
       SELECT df.product_id AS content_asset_id,
              SUM(NVL(df.predicted_demand, 0)) AS predicted_demand,
              ROUND(AVG(NVL(df.social_factor, 1)), 2) AS audience_signal_factor,
              MAX(df.forecast_date) AS latest_forecast_date
       FROM demand_forecasts df
       CROSS JOIN forecast_window fw
       WHERE fw.max_forecast_date IS NULL
          OR TRUNC(df.forecast_date) >= fw.max_forecast_date - 7
       GROUP BY df.product_id
     ),
     capacity_metrics AS (
       SELECT i.product_id AS content_asset_id,
              SUM(NVL(i.quantity_on_hand, 0)) AS capacity_units_available,
              SUM(NVL(i.quantity_reserved, 0)) AS capacity_units_reserved,
              COUNT(DISTINCT i.center_id) AS coverage_hubs
       FROM inventory i
       GROUP BY i.product_id
     )
     SELECT ca.product_id AS content_asset_id,
            ca.content_asset,
            ca.studio_or_label,
            ca.content_category,
            NVL(fore.predicted_demand, 0) AS predicted_demand,
            NVL(sig.total_views, 0) AS total_views,
            NVL(sig.audience_signals, 0) AS audience_signals,
            NVL(sig.avg_urgency, 0) AS avg_urgency,
            sig.peak_momentum,
            NVL(camp.campaign_requests, 0) AS campaign_requests,
            NVL(camp.requested_units, 0) AS requested_units,
            NVL(camp.campaign_value, 0) AS campaign_value,
            NVL(cap.capacity_units_available, 0) AS capacity_units_available,
            NVL(cap.capacity_units_reserved, 0) AS capacity_units_reserved,
            NVL(fore.audience_signal_factor, 1) AS audience_signal_factor,
            NVL(cap.coverage_hubs, 0) AS coverage_hubs,
            fore.latest_forecast_date,
            ROUND(
              NVL(fore.predicted_demand, 0) * 0.45
              + NVL(sig.total_views, 0) / 1000 * 0.25
              + NVL(sig.avg_urgency, 0) * 4
              + NVL(camp.requested_units, 0) * 0.35
              + NVL(camp.campaign_value, 0) / 10000,
              2
            ) AS demand_score
     FROM media_content_assets_v ca
     LEFT JOIN capacity_metrics cap ON cap.content_asset_id = ca.product_id
     LEFT JOIN forecast_metrics fore ON fore.content_asset_id = ca.product_id
     LEFT JOIN signal_metrics sig ON sig.content_asset_id = ca.product_id
     LEFT JOIN campaign_metrics camp ON camp.content_asset_id = ca.product_id
     WHERE ca.is_active = 1
     ORDER BY demand_score DESC,
              predicted_demand DESC,
              total_views DESC,
              campaign_requests DESC
     FETCH FIRST :limit ROWS ONLY`,
    { limit: boundedLimit }
  );
  return result.rows || [];
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
  const normalizedTeam = normalizeAgentTeam(teamName);
  if (normalizedTeam === TEAM_SIGNAL) {
    const [summary, products, influencers, momentum, highDemandAssets] = await Promise.all([
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
      fetchHighDemandAssets(8),
    ]);

    return {
      instructions: 'Focus on content assets, current demand, content creators, urgent signals, and concrete metrics. For highest-demand content asset questions, use high_demand_assets first and include predicted demand, views, audience signals, campaign requests, and capacity.',
      context: {
        team: normalizedTeam,
        trend_summary: summary.rows?.[0]?.RESULT || null,
        top_products: products.rows || [],
        high_demand_assets: highDemandAssets || [],
        demand_metric_definition: 'Demand score combines predicted demand, recent audience views, audience-signal urgency, requested campaign units, and campaign value over the current data window.',
        top_influencers: influencers.rows || [],
        momentum_distribution: momentum.rows || [],
      },
    };
  }

  if (normalizedTeam === TEAM_DISTRIBUTION) {
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
      instructions: 'Focus on capacity risk, routing, and practical content-distribution actions.',
      context: {
        team: normalizedTeam,
        inventory_alerts: inventoryAlerts.rows || [],
        active_centers: centers.rows || [],
      },
    };
  }

  const [summary, categories, orderStatus] = await Promise.all([
    db.execute(
      `SELECT COUNT(*) AS total_campaign_requests,
              COUNT(CASE WHEN social_source_id IS NOT NULL THEN 1 END) AS audience_signal_campaign_requests,
              ROUND(SUM(order_total), 2) AS content_revenue,
              ROUND(SUM(CASE WHEN social_source_id IS NOT NULL THEN order_total ELSE 0 END), 2) AS audience_signal_content_revenue,
              ROUND(AVG(order_total), 2) AS avg_campaign_value
       FROM orders
       WHERE CAST(created_at AS DATE) >= SYSDATE - 30`
    ),
    db.execute(
      `SELECT p.category,
              COUNT(DISTINCT o.order_id) AS campaign_requests,
              ROUND(SUM(oi.quantity * oi.unit_price), 2) AS content_revenue
       FROM order_items oi
       JOIN orders o ON oi.order_id = o.order_id
       JOIN products p ON oi.product_id = p.product_id
       WHERE CAST(o.created_at AS DATE) >= SYSDATE - 30
       GROUP BY p.category
       ORDER BY content_revenue DESC
       FETCH FIRST 8 ROWS ONLY`
    ),
    db.execute(
      `SELECT order_status AS campaign_status,
              COUNT(*) AS campaign_requests,
              ROUND(SUM(order_total), 2) AS content_revenue
       FROM orders
       WHERE CAST(created_at AS DATE) >= SYSDATE - 30
       GROUP BY order_status
       ORDER BY content_revenue DESC`
    ),
  ]);

  return {
    instructions: 'Focus on campaign requests, content revenue, subscriber-signal attribution, and operational trends.',
    context: {
      team: normalizedTeam,
      commerce_summary: summary.rows?.[0] || {},
      category_breakdown: categories.rows || [],
      order_status_breakdown: orderStatus.rows || [],
    },
  };
}

function fallbackAgentSummary(teamName, context) {
  const normalizedTeam = normalizeAgentTeam(teamName);
  if (normalizedTeam === TEAM_SIGNAL) {
    const demandAssets = context.high_demand_assets || [];
    if (demandAssets.length) {
      return formatDemandAssetSummary(demandAssets);
    }

    const products = context.top_products || [];
    if (!products.length) {
      return context.trend_summary || 'No high-demand content assets found in the current window.';
    }
    return products
      .slice(0, 3)
      .map((product) => {
        const avgVirality = product.AVG_VIRALITY == null ? 'n/a' : product.AVG_VIRALITY;
        return `${product.PRODUCT_NAME} (${product.BRAND_NAME}) avg urgency ${avgVirality}, ${product.MENTIONS} mentions, ${product.TOTAL_VIEWS} views`;
      })
      .join(' | ');
  }

  if (normalizedTeam === TEAM_DISTRIBUTION) {
    const alerts = context.inventory_alerts || [];
    if (!alerts.length) {
      return 'No current low-capacity content asset alerts were found.';
    }
    return alerts
      .slice(0, 3)
      .map((item) =>
        `${item.PRODUCT_NAME} at ${item.CENTER_NAME}, ${item.CITY}: ${item.QUANTITY_ON_HAND} capacity units vs threshold ${item.REORDER_POINT} [${item.STOCK_STATUS}]`
      )
      .join(' | ');
  }

  const summary = context.commerce_summary || {};
  const totalRequests = summary.TOTAL_CAMPAIGN_REQUESTS || summary.TOTAL_ORDERS || 0;
  const totalRevenue = summary.CONTENT_REVENUE || summary.TOTAL_REVENUE || 0;
  const signalRequests = summary.AUDIENCE_SIGNAL_CAMPAIGN_REQUESTS || summary.SOCIAL_ORDERS || 0;
  const signalRevenue = summary.AUDIENCE_SIGNAL_CONTENT_REVENUE || summary.SOCIAL_REVENUE || 0;
  return `Last 30 days: ${totalRequests.toLocaleString()} campaign requests, $${totalRevenue.toLocaleString()} content revenue, ${signalRequests.toLocaleString()} subscriber-signal-driven campaign requests, $${signalRevenue.toLocaleString()} subscriber-signal content revenue.`;
}

async function askAgent(teamName, question, profile = DEFAULT_PROFILE) {
  const normalizedTeam = normalizeAgentTeam(teamName);
  const { instructions, context } = await buildAgentContext(normalizedTeam);
  const fallback = fallbackAgentSummary(normalizedTeam, context);
  try {
    return await Promise.race([
      summarizeContext({ question, instructions, context, profile }),
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
// Runs the media signal team to identify urgent content asset demand.
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
    const trendText = trendResult.rows[0]?.RESULT || 'No high-demand content assets found';

    // 2. Get top trending content assets for per-asset action logging
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
        askAgent(TEAM_SIGNAL,
          `Identify the top trending content assets and media creators from the last ${hours} hours ` +
          `using the detect trending content assets tool with minimum urgency score ${threshold}`),
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
        reason: `${p.PEAK_MOMENTUM} content asset with ${p.MENTION_COUNT} audience/social signal mentions and urgency ${p.AVG_VIRALITY}`,
      }, confidence);
      loggedActions.push({ content_asset: p.PRODUCT_NAME, urgency: p.AVG_VIRALITY });
    }

    // 6. Log the overall run summary
    await logAction('trend_detection_agent', 'trend_analysis_complete', 'social_posts', null, {
      window_hours:   hours,
      viral_threshold: threshold,
      content_assets_found: products.length,
      reason: agentAnalysis || trendText.slice(0, 500),
    }, 0.90);

    // 7. Emit event
    await logEvent('trend_detected', 'trend_detection_agent', {
      window_hours:   hours,
      threshold,
      content_assets_found: products.length,
      triggered_at:   new Date().toISOString(),
    });

    res.json({
      message:      `Trend detection complete - ${products.length} urgent content assets identified in last ${hours}h`,
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
// Full orchestration: trend detection → inventory check → content operations attribution.
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
        askAgent(TEAM_SIGNAL,
          'What content assets are trending right now based on subscriber and community signal activity in the last 48 hours'),
        new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 10000)),
      ]);
    } catch (e) {
      logOptionalAgentWarning('Trend agent skipped', e);
    }

    for (const p of topProducts) {
      await logAction('trend_detection_agent', 'detect_trends', 'product', p.PRODUCT_ID, {
        product_name:  p.PRODUCT_NAME,
        brand:         p.BRAND_NAME,
        mention_count: p.MENTION_COUNT,
        avg_virality:  p.AVG_VIRALITY,
        peak_momentum: p.PEAK_MOMENTUM,
        reason: `Detected via full cycle — ${p.PEAK_MOMENTUM} with urgency ${p.AVG_VIRALITY}`,
      }, p.AVG_VIRALITY > 80 ? 0.95 : 0.85);
      allActions.push({ phase: 'trends', content_asset: p.PRODUCT_NAME });
    }

    await logEvent('trend_detected', 'master_orchestrator', {
      phase: 'trend_detection', content_assets_found: topProducts.length,
    });

    // ── PHASE 2: Distribution Capacity Check ────────────────────────────────
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

    // Best-effort LLM distribution analysis
    let distributionAnalysis = null;
    try {
      distributionAnalysis = await Promise.race([
        askAgent(TEAM_DISTRIBUTION,
          'Which trending content assets have critically low capacity and need immediate intervention'),
        new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 10000)),
      ]);
    } catch (e) {
      logOptionalAgentWarning('Distribution agent skipped', e);
    }

    for (const inv of criticalInventory) {
      await logAction('inventory_agent', 'inventory_alert', 'inventory', inv.PRODUCT_ID, {
        product_name:       inv.PRODUCT_NAME,
        center:             inv.CENTER_NAME,
        quantity_on_hand:   inv.QUANTITY_ON_HAND,
        quantity_reserved:  inv.QUANTITY_RESERVED,
        reorder_point:      inv.REORDER_POINT,
        stock_status:       inv.STOCK_STATUS,
        strategy:           `Pre-position capacity at ${inv.CENTER_NAME} - trending content asset with ${inv.STOCK_STATUS} distribution capacity`,
        reason: `${inv.STOCK_STATUS} capacity (${inv.QUANTITY_ON_HAND} units) for trending content asset at ${inv.CENTER_NAME}`,
      }, inv.STOCK_STATUS === 'out_of_stock' ? 0.98 : 0.92);
      allActions.push({ phase: 'capacity', content_asset: inv.PRODUCT_NAME, status: inv.STOCK_STATUS });
    }

    await logEvent('inventory_alert', 'inventory_agent', {
      phase: 'inventory_check', critical_count: criticalInventory.length,
    });

    // ── PHASE 3: Content Operations Attribution ────────────────────────────────────────
    const commerceResult = await db.execute(
      `SELECT /*+ NO_PARALLEL */
              COUNT(*) AS total_campaign_requests,
              COUNT(CASE WHEN social_source_id IS NOT NULL THEN 1 END) AS audience_signal_campaign_requests,
              ROUND(SUM(order_total), 2) AS content_revenue,
              ROUND(SUM(CASE WHEN social_source_id IS NOT NULL THEN order_total ELSE 0 END), 2) AS audience_signal_content_revenue,
              ROUND(AVG(order_total), 2) AS avg_campaign_value
       FROM orders
       WHERE CAST(created_at AS DATE) >= SYSDATE - 7`
    );
    const commerce = commerceResult.rows[0] || {};

    // Best-effort LLM revenue analysis
    let revenueAnalysis = null;
    try {
      revenueAnalysis = await Promise.race([
        askAgent(TEAM_REVENUE,
          'Summarize subscriber-signal-driven campaign requests and revenue attribution from the last 7 days'),
        new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 10000)),
      ]);
    } catch (e) {
      logOptionalAgentWarning('Media operations agent skipped', e);
    }

    const socialPct = commerce.TOTAL_CAMPAIGN_REQUESTS > 0
      ? ((commerce.AUDIENCE_SIGNAL_CAMPAIGN_REQUESTS / commerce.TOTAL_CAMPAIGN_REQUESTS) * 100).toFixed(1)
      : 0;

    await logAction('master_orchestrator', 'commerce_attribution', 'campaign_requests', null, {
      total_campaign_requests: commerce.TOTAL_CAMPAIGN_REQUESTS,
      audience_signal_campaign_requests: commerce.AUDIENCE_SIGNAL_CAMPAIGN_REQUESTS,
      content_revenue: commerce.CONTENT_REVENUE,
      audience_signal_content_revenue: commerce.AUDIENCE_SIGNAL_CONTENT_REVENUE,
      social_pct:      `${socialPct}%`,
      avg_campaign_value: commerce.AVG_CAMPAIGN_VALUE,
      reason: `${socialPct}% of campaign requests ($${(commerce.AUDIENCE_SIGNAL_CONTENT_REVENUE || 0).toLocaleString()}) attributed to audience signals in last 7 days`,
    }, 0.93);
    allActions.push({ phase: 'commerce', social_pct: socialPct });

    await logEvent('commerce_analysis_complete', 'master_orchestrator', {
      phase: 'commerce_attribution',
      audience_signal_campaign_requests: commerce.AUDIENCE_SIGNAL_CAMPAIGN_REQUESTS,
      signal_campaign_value: commerce.AUDIENCE_SIGNAL_CONTENT_REVENUE,
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
      message: `Full cycle complete - ${topProducts.length} trends · ${criticalInventory.length} capacity alerts · ${socialPct}%subscriber-signal-driven campaign requests`,
      phases: {
        trends: {
          content_assets_found: topProducts.length,
          summary:        trendText.split('\n')[0],
          analysis:       trendAnalysis,
        },
        capacity: {
          critical_items: criticalInventory.length,
          analysis:       distributionAnalysis,
        },
        commerce: {
          total_campaign_orders: commerce.TOTAL_ORDERS,
          signal_campaign_orders: commerce.SOCIAL_ORDERS,
          signal_campaign_value: commerce.SOCIAL_REVENUE,
          social_pct:     `${socialPct}%`,
          analysis:       revenueAnalysis,
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

    const requestedTeam = team.toUpperCase();
    if (!VALID_TEAMS.includes(requestedTeam)) {
      return res.status(400).json({
        error: `Invalid team. Choose from: ${[TEAM_SIGNAL, TEAM_DISTRIBUTION, TEAM_REVENUE].join(', ')}`
      });
    }

    const resolvedTeam = normalizeAgentTeam(requestedTeam);
    const response = await askAgent(resolvedTeam, question);

    res.json({ team: resolvedTeam, question, response });
  } catch (err) {
    console.error('Agent ask error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/agents/trends — ask the trend agent ──
router.post('/trends', async (req, res) => {
  try {
    const { question } = req.body;
    const q = question || 'What content assets are trending right now based on subscriber and community signal activity';
    const response = await askAgent(TEAM_SIGNAL, q);
    res.json({ team: TEAM_SIGNAL, question: q, response });
  } catch (err) {
    console.error('Trends agent error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/agents/fulfillment — compatibility route for the distribution agent ──
router.post('/fulfillment', async (req, res) => {
  try {
    const { question } = req.body;
    const q = question || 'Which trending content assets have critically low capacity';
    const response = await askAgent(TEAM_DISTRIBUTION, q);
    res.json({ team: TEAM_DISTRIBUTION, question: q, response });
  } catch (err) {
    console.error('Fulfillment agent error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/agents/commerce — compatibility route for the media revenue agent ──
router.post('/commerce', async (req, res) => {
  try {
    const { question } = req.body;
    const q = question || 'How many orders were placed in the last 24 hours and what is the total revenue';
    const response = await askAgent(TEAM_REVENUE, q);
    res.json({ team: TEAM_REVENUE, question: q, response });
  } catch (err) {
    console.error('Media operations agent error:', err);
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
  const { question, profile } = req.body;
  if (!question || !question.trim()) {
    return res.status(400).json({ error: 'A question is required' });
  }

  const q = question.trim();
  const qLower = q.toLowerCase();
  const resolvedProfile = normalizeProfile(profile);
  const startTime = Date.now();

  // ── Step 1: Auto-detect intent and pick agent team ──
  const routed = routeAgentQuestion(q);
  const { team, intent } = routed;
  let toolsUsed = [];

  // ── Step 2: Try Ollama team reasoning first ─────────────────────────────
  let agentResponse = null;
  let agentUsed = false;
  try {
    agentResponse = await Promise.race([
      askAgent(team, q, resolvedProfile),
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
      const scoreMatch = qLower.match(/score.*?(\d+)|urgency.*?(\d+)|virality.*?(\d+)/);
      const minScore = scoreMatch ? parseInt(scoreMatch[1] || scoreMatch[2] || scoreMatch[3]) : 50;

      const trendRes = await db.execute(
        `SELECT detect_trending_products(:hours, :score) AS result FROM dual`,
        { hours, score: minScore }
      );
      fallbackResult = trendRes.rows[0]?.RESULT || 'No high-demand content assets found';
      toolsUsed.push({ tool: 'detect_trending_products()', params: { hours, minScore }, status: 'success' });

      // Also get structured data
      const dataRes = await db.execute(
        `SELECT p.product_name, b.brand_name, p.category,
                COUNT(DISTINCT sp.post_id) AS mentions,
                ROUND(AVG(sp.virality_score), 1) AS avg_virality,
                SUM(sp.views_count) AS total_views,
                MAX(sp.momentum_flag) AS peak_momentum
         FROM post_product_mentions ppm
         JOIN social_posts sp ON ppm.post_id = sp.post_id
         JOIN products p ON ppm.product_id = p.product_id
         JOIN brands b ON p.brand_id = b.brand_id
         WHERE CAST(sp.posted_at AS DATE) >= SYSDATE - :hours/24
           AND sp.virality_score >= :score
         GROUP BY p.product_name, b.brand_name, p.category
         ORDER BY avg_virality DESC
         FETCH FIRST 10 ROWS ONLY`,
        { hours, score: minScore }
      );
      fallbackData = dataRes.rows;

      if (isHighDemandAssetQuestion(q)) {
        const demandRows = await fetchHighDemandAssets(10);
        if (demandRows.length) {
          fallbackData = demandRows;
          fallbackResult = formatDemandAssetSummary(demandRows);
          toolsUsed.push({ tool: 'MEDIA_DEMAND_CONTEXT_SQL_TOOL', status: 'success', rows: demandRows.length });
        }
      }

      // Check for media creator-specific questions
      const handleMatch = q.match(/@[\w_]+/);
      if (handleMatch || qLower.includes('creator') || qLower.includes('influencer')) {
        const handle = handleMatch ? handleMatch[0] : null;
        if (handle) {
          const netRes = await db.execute(
            `SELECT get_influencer_network(:handle) AS result FROM dual`,
            { handle }
          );
          fallbackResult += '\n\n' + (netRes.rows[0]?.RESULT || '');
          toolsUsed.push({ tool: 'get_influencer_network()', params: { handle }, status: 'success' });
        }
      }

    } else if (intent === 'distribution') {
      // Extract product name from question
      const productPatterns = [
        /["']([^"']+)["']/,                                                           // quoted: "Midnight Harbor Premiere Window"
        /(?:inventory|stock|check)\s+(?:for|of|on)\s+(?:the\s+)?(.+?)(?:\s+across|\s+at|\s+in|\s*\??\s*$)/i,
        /(?:ship|deliver|send|route)\s+(?:the\s+)?(.+?)(?:\s+to\s+|\s+for\s+)/i,     // "ship same-day studio slot to..."
        /(?:fulfillment|nearest)\s+(?:center\s+)?(?:for|with)\s+(.+?)(?:\s+in\s+stock|\s+to\s+|\s+for\s+|\s*\??\s*$)/i,
        /(?:for|of|about)\s+(?:the\s+)?([A-Z][A-Za-z\s]+?)(?:\s+with|\s+across|\s+at|\s+in|\s+to|\s*\??\s*$)/i,
      ];
      let productName = null;
      for (const pat of productPatterns) {
        const m = q.match(pat);
        if (m) {
          let pn = m[1].trim();
          // Clean up: remove trailing filler words
          pn = pn.replace(/\s+(earbuds?|headphones?|shoes?|items?|products?)\s*$/i, '').trim();
          if (/^(same-day\s+)?studio slots?|coverage hubs?|capacity|nearest coverage hub$/i.test(pn)) {
            continue;
          }
          // Skip if the extracted name looks like a non-product phrase
          if (pn.length >= 3 && !/^(a |the |an |to |in |for )/i.test(pn)) {
            productName = pn;
            break;
          }
        }
      }

      // Check if this is a routing question (mentions an audience account or city)
      const cityMatch = q.match(/(?:to|in|near)\s+(?:(?:a\s+)?(?:customer|audience account|subscriber)\s+in\s+)?([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/);
      const emailMatch = q.match(/[\w.]+@[\w.]+/);

      let customerEmail = emailMatch ? emailMatch[0] : null;
      let audienceCity = null;

      // If user gave a city name, look up a synthetic audience account email in that city
      if (!customerEmail && cityMatch) {
        const cityName = cityMatch[1];
        try {
          const custRes = await db.execute(
            `SELECT email FROM customers WHERE UPPER(city) = UPPER(:city) FETCH FIRST 1 ROWS ONLY`,
            { city: cityName }
          );
          if (custRes.rows.length > 0) {
            customerEmail = custRes.rows[0].EMAIL;
            audienceCity = cityName;
            toolsUsed.push({ tool: 'audience_account_lookup', params: { city: cityName }, status: 'success', email: customerEmail });
          }
        } catch (_) {}
      }

      if (productName && (cityMatch || emailMatch)) {
        // Spatial routing - find best distribution hub
        if (customerEmail) {
          try {
            const routeRes = await db.execute(
              `SELECT find_best_fulfillment(:email, :pname) AS result FROM dual`,
              { email: customerEmail, pname: productName }
            );
            fallbackResult = routeRes.rows[0]?.RESULT || 'No content route found';
            toolsUsed.push({ tool: 'find_best_distribution_hub()', params: { synthetic_subscriber: customerEmail, content_asset: productName }, status: 'success' });

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
            fallbackResult = invRes.rows[0]?.RESULT || 'No capacity data found';
            toolsUsed.push({ tool: 'check_content_asset_capacity()', params: { contentAsset: productName }, status: 'success' });
          }
        } else {
          // City not found - fall back to capacity check
          const invRes = await db.execute(
            `SELECT check_product_inventory(:pname) AS result FROM dual`,
            { pname: productName }
          );
          fallbackResult = invRes.rows[0]?.RESULT || 'No capacity data found';
          toolsUsed.push({ tool: 'check_content_asset_capacity()', params: { contentAsset: productName }, status: 'success' });
        }
      } else if (!productName && customerEmail && /(nearest|route|routing|coverage hub|same-day|studio slots)/.test(qLower)) {
        const routeDataRes = await db.execute(
          `SELECT fc.center_name, fc.city, fc.state_province,
                  fc.latitude AS center_lat, fc.longitude AS center_lon,
                  (SELECT NVL(SUM(i.quantity_on_hand), 0)
                   FROM inventory i
                   WHERE i.center_id = fc.center_id) AS capacity_units_available,
                  ROUND(SDO_GEOM.SDO_DISTANCE(
                    c.location, fc.location, 0.005, 'unit=MILE'), 1) AS distance_mi
           FROM customers c
           CROSS JOIN fulfillment_centers fc
           WHERE c.email = :email
             AND fc.is_active = 1
           ORDER BY distance_mi
           FETCH FIRST 5 ROWS ONLY`,
          { email: customerEmail }
        );
        const custGeo = await db.execute(
          `SELECT latitude, longitude, city, state_province FROM customers WHERE email = :email`,
          { email: customerEmail }
        );
        if (custGeo.rows.length > 0 && routeDataRes.rows.length > 0) {
          const best = routeDataRes.rows[0];
          fallbackResult = `Nearest coverage hub for ${audienceCity || custGeo.rows[0].CITY} audience activation is ${best.CENTER_NAME} in ${best.CITY}, ${best.STATE_PROVINCE}, ${best.DISTANCE_MI} mi away with ${best.CAPACITY_UNITS_AVAILABLE} capacity units available.`;
          fallbackData = {
            type: 'route',
            customer: {
              lat: custGeo.rows[0].LATITUDE,
              lon: custGeo.rows[0].LONGITUDE,
              city: custGeo.rows[0].CITY,
              state: custGeo.rows[0].STATE_PROVINCE,
            },
            product: 'Same-day studio slots',
            centers: routeDataRes.rows.map(r => ({
              name: r.CENTER_NAME,
              city: r.CITY,
              state: r.STATE_PROVINCE,
              lat: r.CENTER_LAT,
              lon: r.CENTER_LON,
              stock: r.CAPACITY_UNITS_AVAILABLE,
              distance: r.DISTANCE_MI,
            })),
          };
          toolsUsed.push({ tool: 'nearest_coverage_hub_route()', params: { synthetic_subscriber: customerEmail }, status: 'success' });
        } else {
          fallbackResult = 'No active coverage hubs found for that audience location.';
          toolsUsed.push({ tool: 'nearest_coverage_hub_route()', params: { synthetic_subscriber: customerEmail }, status: 'success' });
        }
      } else if (productName) {
        const invRes = await db.execute(
          `SELECT check_product_inventory(:pname) AS result FROM dual`,
          { pname: productName }
        );
        fallbackResult = invRes.rows[0]?.RESULT || 'No capacity data found';
        toolsUsed.push({ tool: 'check_content_asset_capacity()', params: { contentAsset: productName }, status: 'success' });
      } else {
        // General distribution-capacity query
        const invRes = await db.execute(
          `SELECT fc.center_name, fc.city, fc.state_province, fc.center_type,
                  COUNT(i.product_id) AS content_assets_supported,
                  SUM(i.quantity_on_hand) AS capacity_units_available,
                  SUM(CASE WHEN i.quantity_on_hand <= i.reorder_point THEN 1 ELSE 0 END) AS low_capacity_items
           FROM fulfillment_centers fc
           LEFT JOIN inventory i ON fc.center_id = i.center_id
           WHERE fc.is_active = 1
           GROUP BY fc.center_name, fc.city, fc.state_province, fc.center_type
           ORDER BY capacity_units_available DESC
           FETCH FIRST 10 ROWS ONLY`
        );
        fallbackData = invRes.rows;
        fallbackResult = `Coverage overview: ${invRes.rows.length} active hubs`;
        toolsUsed.push({ tool: 'MEDIA_DISTRIBUTION_SQL_TOOL (fallback)', status: 'success' });
      }

    } else {
      // Commerce — general orders/revenue queries
      const commerceRes = await db.execute(
        `SELECT COUNT(*) AS total_campaign_requests,
                COUNT(CASE WHEN social_source_id IS NOT NULL THEN 1 END) AS audience_signal_campaign_requests,
                ROUND(SUM(order_total), 2) AS content_revenue,
                ROUND(SUM(CASE WHEN social_source_id IS NOT NULL THEN order_total ELSE 0 END), 2) AS audience_signal_content_revenue,
                ROUND(AVG(order_total), 2) AS avg_campaign_value,
                COUNT(DISTINCT customer_id) AS unique_audience_accounts
         FROM orders
         WHERE CAST(created_at AS DATE) >= SYSDATE - 30`
      );
      const c = commerceRes.rows[0] || {};
      const socialPct = c.TOTAL_CAMPAIGN_REQUESTS > 0 ? ((c.AUDIENCE_SIGNAL_CAMPAIGN_REQUESTS / c.TOTAL_CAMPAIGN_REQUESTS) * 100).toFixed(1) : '0';

      fallbackResult = `Last 30 days: ${(c.TOTAL_CAMPAIGN_REQUESTS || 0).toLocaleString()} campaign requests, $${(c.CONTENT_REVENUE || 0).toLocaleString()} content revenue. ` +
        `${socialPct}% audience-signal-driven ($${(c.AUDIENCE_SIGNAL_CONTENT_REVENUE || 0).toLocaleString()}). ` +
        `Avg campaign value: $${c.AVG_CAMPAIGN_VALUE || 0}. ${(c.UNIQUE_AUDIENCE_ACCOUNTS || 0).toLocaleString()} unique audience accounts.`;
      fallbackData = [c];
      toolsUsed.push({ tool: 'MEDIA_REVENUE_SQL_TOOL (direct)', status: 'success' });

      // Category breakdown if asked
      if (qLower.includes('category') || qLower.includes('breakdown')) {
        const catRes = await db.execute(
          `SELECT p.category,
                  COUNT(DISTINCT o.order_id) AS campaign_requests,
                  ROUND(SUM(oi.quantity * oi.unit_price), 2) AS content_revenue
           FROM order_items oi
           JOIN orders o ON oi.order_id = o.order_id
           JOIN products p ON oi.product_id = p.product_id
           WHERE CAST(o.created_at AS DATE) >= SYSDATE - 30
           GROUP BY p.category
           ORDER BY content_revenue DESC`
        );
        fallbackData = catRes.rows;
        toolsUsed.push({ tool: 'MEDIA_REVENUE_SQL_TOOL (category)', status: 'success' });
      }
    }
  } catch (toolErr) {
    toolsUsed.push({ tool: 'fallback', status: 'error', reason: toolErr.message });
  }

  const agentResponseRejected = fallbackResult && (
    isIncompleteAgentResponse(agentResponse)
    || (isHighDemandAssetQuestion(q) && !hasDemandEvidence(agentResponse))
  );
  if (agentResponseRejected) {
    toolsUsed.push({ tool: 'agent_response_guardrail', status: 'fallback', reason: 'replaced incomplete-context model response with Oracle demand context' });
  }
  const responseUsedAgent = agentUsed && !agentResponseRejected && agentResponse;
  const runtimeMode = resolveAgentRuntimeMode({ agentUsed: Boolean(responseUsedAgent), toolsUsed });
  const response = cleanAgentFallbackText((responseUsedAgent ? agentResponse : fallbackResult) || 'No results found for your question.');

  // ── Step 4: Log the chat interaction ──
  await logAction('chat_agent', 'chat_query', intent, null, {
    question: q,
    team,
    profile: resolvedProfile,
    runtime_mode: runtimeMode,
    agent_used: Boolean(responseUsedAgent),
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
    profile: resolvedProfile,
    runtimeMode,
    agentUsed: Boolean(responseUsedAgent),
    response,
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
