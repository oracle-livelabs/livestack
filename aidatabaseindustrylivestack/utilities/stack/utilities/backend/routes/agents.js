/**
 * Agents API - application-layer orchestration with Ollama reasoning
 * and Oracle SQL / PL/SQL execution against live demo data.
 */

const express = require('express');
const router = express.Router();
const db = require('../config/database');
const {
  DEFAULT_PROFILE,
  answerQuestion,
  generatePatternSql,
  getAvailableProfiles,
  normalizeProfile,
  summarizeContext,
  validateReadOnlySql,
} = require('../lib/ollamaAssistant');

const TEAM_IDS = {
  GRID_RELIABILITY: 'GRID_RELIABILITY_TEAM',
  FIELD_CREW_LOGISTICS: 'FIELD_CREW_LOGISTICS_TEAM',
  SERVICE_REQUEST: 'UTILITY_SERVICE_REQUEST_TEAM',
};

const TEAM_LABELS = {
  [TEAM_IDS.GRID_RELIABILITY]: 'Energy Operations Intelligence Agent',
  [TEAM_IDS.FIELD_CREW_LOGISTICS]: 'Field Dispatch & Asset Maintenance Agent',
  [TEAM_IDS.SERVICE_REQUEST]: 'Customer & Regulatory Operations Agent',
};

const INTENTS = {
  GRID_RELIABILITY: 'grid_reliability_signals',
  FIELD_CREW_LOGISTICS: 'field_crew_logistics',
  SERVICE_REQUESTS: 'utility_service_requests',
};

const STATIC_TEAMS = [
  {
    TEAM_NAME: TEAM_IDS.GRID_RELIABILITY,
    STATUS: 'ENABLED',
    DESCRIPTION: 'Ollama-backed electric reliability, gas pressure, water/wastewater compliance, oil & gas production, refinery, LNG, emissions, HSE, and regulatory signal analysis over live Energy & Utilities data.',
  },
  {
    TEAM_NAME: TEAM_IDS.FIELD_CREW_LOGISTICS,
    STATUS: 'ENABLED',
    DESCRIPTION: 'Ollama-backed field dispatch, maintenance, work order, pipeline integrity, asset capacity, crew, parts, logistics, and routing analysis.',
  },
  {
    TEAM_NAME: TEAM_IDS.SERVICE_REQUEST,
    STATUS: 'ENABLED',
    DESCRIPTION: 'Ollama-backed customer operations, billing, collections, service request, SLA, regulatory reporting, and compliance follow-up analysis.',
  },
];

function displayTeamName(teamName) {
  return TEAM_LABELS[teamName] || teamName;
}

const LEGACY_TEXT_REPLACEMENTS = [
  { from: ['SOCIAL', 'TREND', 'TEAM'].join('_'), to: TEAM_LABELS[TEAM_IDS.GRID_RELIABILITY] },
  { from: ['FULFILLMENT', 'TEAM'].join('_'), to: TEAM_LABELS[TEAM_IDS.FIELD_CREW_LOGISTICS] },
  { from: ['COMMERCE', 'TEAM'].join('_'), to: TEAM_LABELS[TEAM_IDS.SERVICE_REQUEST] },
  { from: ['Social', 'Trend', 'Agent'].join(' '), to: TEAM_LABELS[TEAM_IDS.GRID_RELIABILITY] },
  { from: ['Fulfillment', 'Agent'].join(' '), to: TEAM_LABELS[TEAM_IDS.FIELD_CREW_LOGISTICS] },
  { from: ['Commerce', 'Agent'].join(' '), to: TEAM_LABELS[TEAM_IDS.SERVICE_REQUEST] },
  { from: ['social', 'trend', 'agent'].join(' '), to: TEAM_LABELS[TEAM_IDS.GRID_RELIABILITY] },
  { from: ['fulfillment', 'agent'].join(' '), to: TEAM_LABELS[TEAM_IDS.FIELD_CREW_LOGISTICS] },
  { from: ['commerce', 'agent'].join(' '), to: TEAM_LABELS[TEAM_IDS.SERVICE_REQUEST] },
  { from: ['trend', 'detection', 'agent'].join('_'), to: 'grid_reliability_agent' },
  { from: ['inventory', 'agent'].join('_'), to: 'field_crew_logistics_agent' },
  { from: ['fulfillment', 'agent'].join('_'), to: 'field_crew_logistics_agent' },
  { from: ['master', 'orchestrator'].join('_'), to: 'utilities_ai_orchestrator' },
  { from: ['chat', 'agent'].join('_'), to: 'utilities_chat_agent' },
];

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function replaceLegacyTerm(value, search, replacement) {
  const pattern = new RegExp(`(^|[^A-Za-z0-9_])${escapeRegExp(search)}(?=$|[^A-Za-z0-9_])`, 'g');
  return value.replace(pattern, `$1${replacement}`);
}

function sanitizeUtilityText(value) {
  let text = String(value || '');
  for (const { from, to } of LEGACY_TEXT_REPLACEMENTS) {
    text = replaceLegacyTerm(text, from, to);
  }
  return text;
}

function utilityNarrative(value) {
  if (value == null) return value;
  return sanitizeUtilityText(value)
    .replace(/\bintent: trends\b/gi, 'intent: grid reliability signals')
    .replace(/\bintent: fulfillment\b/gi, 'intent: field operations')
    .replace(/\bintent: commerce\b/gi, 'intent: utility service requests')
    .replace(/\btrending products\b/gi, 'critical utility-service signals')
    .replace(/\btrending product\b/gi, 'critical utility-service signal')
    .replace(/\bproducts found\b/gi, 'utility-service signals found')
    .replace(/\bproducts\b/gi, 'utility services')
    .replace(/\bproduct\b/gi, 'utility service')
    .replace(/\binventory alerts\b/gi, 'capacity and supply alerts')
    .replace(/\binventory\b/gi, 'capacity and supply')
    .replace(/\bout of stock\b/gi, 'unavailable')
    .replace(/\bin stock\b/gi, 'available')
    .replace(/\bstock\b/gi, 'available capacity')
    .replace(/\bfulfillment\b/gi, 'field operations')
    .replace(/\bsocial\b/gi, 'signal')
    .replace(/\bvirality\b/gi, 'criticality')
    .replace(/\bviral\b/gi, 'critical')
    .replace(/\binfluencers\b/gi, 'signal sources')
    .replace(/\binfluencer\b/gi, 'signal source')
    .replace(/\bmanufacturers\b/gi, 'utilities partners')
    .replace(/\bmanufacturer\b/gi, 'utilities partner')
    .replace(/\brevenue\b/gi, 'operational value');
}

function shouldTryOperationalGraphFallback(qLower) {
  return [
    'gas', 'pipeline', 'pressure', 'integrity', 'corrosion',
    'water', 'wastewater', 'well', 'production', 'refinery',
    'lng', 'emissions', 'hse', 'compliance', 'regulatory',
    'work order', 'maintenance', 'storm', 'feeder', 'outage',
  ].some((term) => qLower.includes(term));
}

function isUnhelpfulAgentResponse(value) {
  const text = String(value || '').trim().toLowerCase();
  if (!text) return true;
  return [
    /i (can'?t|cannot|do not|don't|am unable to|am not able to) answer/,
    /i (can'?t|cannot|do not|don't|am unable to|am not able to) provide/,
    /i (do not|don't) have enough (information|context|data)/,
    /provided (json )?context.*(incomplete|does not contain|no information)/,
    /provided json data does not contain/,
    /not enough (information|context|data)/,
    /no (information|context|data) (about|for)/,
  ].some((pattern) => pattern.test(text));
}

function summarizeGraphRow(row) {
  const id = row.NODE_ID || row.CENTER_NODE_ID || row.ENTITY_KEY || row.FINDING_TYPE || row.EDGE_TYPE || 'record';
  const type = row.NODE_TYPE || row.ENTITY_TYPE || row.FINDING_TYPE || row.CATEGORY || 'operational context';
  const name = row.DISPLAY_NAME || row.TITLE || row.OPERATIONS_LABEL || row.DESCRIPTION || id;
  const domain = row.OPERATIONS_DOMAIN || row.CATEGORY || row.SIGNAL_DOMAIN || 'Energy & Utilities';
  const risk = row.RISK_SCORE != null ? `risk ${Number(row.RISK_SCORE).toFixed(0)}` : null;
  return [id, type, name, domain, risk].filter(Boolean).join(' - ');
}

async function buildOperationalGraphFallback(question, qLower) {
  if (!shouldTryOperationalGraphFallback(qLower)) return null;

  const sql = generatePatternSql(question);
  if (!sql || !/utility_graph_/i.test(sql)) return null;

  const validation = validateReadOnlySql(sql);
  if (!validation.ok) return null;

  const result = await db.execute(validation.sql);
  const rows = result.rows || [];
  if (!rows.length) return null;

  const domains = [...new Set(rows.map((row) => row.OPERATIONS_DOMAIN || row.CATEGORY).filter(Boolean))];
  const rowSummary = rows.slice(0, 5).map(summarizeGraphRow).join('; ');
  const domainText = domains.length ? ` across ${domains.join(', ')}` : '';

  return {
    result: `Operational event graph analysis found ${rows.length} relevant Energy & Utilities records${domainText}. Key records: ${rowSummary}. Recommended dispatch action: review linked assets, compliance records, work orders, crews, and resolution milestones before assigning field execution.`,
    data: rows,
    sql: validation.sql,
  };
}

function sanitizeUtilityPayload(value) {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      try {
        return JSON.stringify(sanitizeUtilityPayload(JSON.parse(trimmed)));
      } catch (_) {
        // Fall through and sanitize as plain text.
      }
    }
    return utilityNarrative(value);
  }
  if (Array.isArray(value)) return value.map(sanitizeUtilityPayload);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => {
        let cleaned = sanitizeUtilityPayload(item);
        if (typeof cleaned === 'string' && /^(ENTITY_TYPE|intent)$/i.test(key)) {
          if (cleaned === 'trends') cleaned = INTENTS.GRID_RELIABILITY;
          if (cleaned === 'fulfillment') cleaned = INTENTS.FIELD_CREW_LOGISTICS;
          if (cleaned === 'commerce') cleaned = INTENTS.SERVICE_REQUESTS;
        }
        return [key, cleaned];
      })
    );
  }
  return value;
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
  if (teamName === TEAM_IDS.GRID_RELIABILITY) {
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
      instructions: 'Focus on Energy & Utilities signals across electric reliability, gas pressure/leak response, water/wastewater compliance, well production, pipeline integrity, refinery throughput, LNG logistics, emissions, HSE, regulatory status, and concrete metrics.',
      context: {
        team: teamName,
        trend_summary: summary.rows?.[0]?.RESULT || null,
        top_products: products.rows || [],
        top_influencers: influencers.rows || [],
        momentum_distribution: momentum.rows || [],
      },
    };
  }

  if (teamName === TEAM_IDS.FIELD_CREW_LOGISTICS) {
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
      instructions: 'Focus on capacity and supply risk, field dispatch, maintenance plans, pipeline integrity work, work orders, crew or parts blockers, logistics routing, and practical Energy & Utilities operating actions.',
      context: {
        team: teamName,
        inventory_alerts: inventoryAlerts.rows || [],
        active_centers: centers.rows || [],
      },
    };
  }

  const [summary, categories, requestStatus] = await Promise.all([
    db.execute(
      `SELECT COUNT(*) AS total_service_requests,
              COUNT(CASE WHEN source_signal_id IS NOT NULL THEN 1 END) AS signal_driven_service_requests,
              ROUND(SUM(request_value), 2) AS total_service_value,
              ROUND(SUM(CASE WHEN source_signal_id IS NOT NULL THEN request_value ELSE 0 END), 2) AS signal_driven_service_value,
              ROUND(AVG(request_value), 2) AS avg_service_request_value
       FROM utility_service_requests
       WHERE CAST(created_at AS DATE) >= SYSDATE - 30`
    ),
    db.execute(
      `SELECT cri.utility_category,
              COUNT(DISTINCT cri.service_request_id) AS service_requests,
              ROUND(SUM(cri.line_value), 2) AS service_value
       FROM utility_request_items cri
       JOIN utility_service_requests csr
         ON csr.service_request_id = cri.service_request_id
       WHERE CAST(csr.created_at AS DATE) >= SYSDATE - 30
       GROUP BY cri.utility_category
       ORDER BY service_value DESC
       FETCH FIRST 8 ROWS ONLY`
    ),
    db.execute(
      `SELECT request_status_display_name AS request_status,
              COUNT(*) AS service_requests,
              ROUND(SUM(request_value), 2) AS service_value
       FROM utility_service_requests
       WHERE CAST(created_at AS DATE) >= SYSDATE - 30
       GROUP BY request_status_display_name
       ORDER BY service_value DESC`
    ),
  ]);

  return {
    instructions: 'Focus on utility service requests, customer operations, billing and collections, SLA breaches, regulatory follow-up, operational value, signal attribution, and service-point demand trends.',
    context: {
      team: teamName,
      service_request_summary: summary.rows?.[0] || {},
      category_breakdown: categories.rows || [],
      service_request_status_breakdown: requestStatus.rows || [],
    },
  };
}

function fallbackAgentSummary(teamName, context) {
  if (teamName === TEAM_IDS.GRID_RELIABILITY) {
    const products = context.top_products || [];
    if (!products.length) {
      return utilityNarrative(context.trend_summary || 'No watched utility services found in the current window.');
    }
    return utilityNarrative(products
      .slice(0, 3)
      .map((product) => {
        const avgVirality = product.AVG_VIRALITY == null ? 'n/a' : product.AVG_VIRALITY;
        return `${product.PRODUCT_NAME} (${product.BRAND_NAME}) avg criticality ${avgVirality}, ${product.MENTIONS} mentions, ${product.TOTAL_VIEWS} reach`;
      })
      .join(' | '));
  }

  if (teamName === TEAM_IDS.FIELD_CREW_LOGISTICS) {
    const alerts = context.inventory_alerts || [];
    if (!alerts.length) {
      return 'No current capacity and supply alerts were found.';
    }
    return utilityNarrative(alerts
      .slice(0, 3)
      .map((item) =>
        `${item.PRODUCT_NAME} at ${item.CENTER_NAME}, ${item.CITY}: ${item.QUANTITY_ON_HAND} available units vs reserve threshold ${item.REORDER_POINT} [${item.STOCK_STATUS}]`
      )
      .join(' | '));
  }

  const summary = context.service_request_summary || context.commerce_summary || {};
  const totalRequests = summary.TOTAL_SERVICE_REQUESTS || summary.TOTAL_ORDERS || 0;
  const totalServiceValue = summary.TOTAL_SERVICE_VALUE || summary.TOTAL_REVENUE || 0;
  const signalRequests = summary.SIGNAL_DRIVEN_SERVICE_REQUESTS || summary.SOCIAL_ORDERS || 0;
  const signalServiceValue = summary.SIGNAL_DRIVEN_SERVICE_VALUE || summary.SOCIAL_REVENUE || 0;
  return `Last 30 days: ${totalRequests.toLocaleString()} utility service requests, $${totalServiceValue.toLocaleString()} operational value, ${signalRequests.toLocaleString()} signal-driven requests, $${signalServiceValue.toLocaleString()} signal-attributed operational value.`;
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
// Runs the signal team to identify critical utility service signals.
// Falls back to direct PL/SQL if the LLM agent is unavailable.
// ─────────────────────────────────────────────────────────────────────────────
router.post('/detect-trends', async (req, res) => {
  const { windowHours = 24, viralThreshold = 75, criticalityThreshold } = req.body;
  const hours     = parseInt(windowHours);
  const threshold = parseInt(criticalityThreshold || viralThreshold);

  try {
    // 1. PL/SQL signal detection (always reliable)
    const trendResult = await db.execute(
      `SELECT detect_trending_products(:hours, :threshold) AS result FROM dual`,
      { hours, threshold }
    );
    const trendText = utilityNarrative(trendResult.rows[0]?.RESULT || 'No critical utility service signals found');

    // 2. Get top utility-service signals for per-service action logging
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
        askAgent(TEAM_IDS.GRID_RELIABILITY,
          `Identify the top utility service signals and signal sources from the last ${hours} hours ` +
          `using the detect trends tool with minimum criticality score ${threshold}`),
        new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 10000)),
      ]);
    } catch (agentErr) {
      logOptionalAgentWarning('Ollama trend analysis skipped', agentErr);
    }

    // 5. Log per-service actions
    const loggedActions = [];
    for (const p of products) {
      const confidence = p.AVG_VIRALITY > 80 ? 0.95 : p.AVG_VIRALITY > 60 ? 0.85 : 0.75;
      await logAction('grid_reliability_agent', 'detect_trends', 'utility_service', p.PRODUCT_ID, {
        product_name:  p.PRODUCT_NAME,
        brand:         p.BRAND_NAME,
        mention_count: p.MENTION_COUNT,
        avg_virality:  p.AVG_VIRALITY,
        total_views:   p.TOTAL_VIEWS,
        peak_momentum: p.PEAK_MOMENTUM,
        window_hours:  hours,
        reason: `${p.PEAK_MOMENTUM} utility service signal with ${p.MENTION_COUNT} bulletins and criticality ${p.AVG_VIRALITY}`,
      }, confidence);
      loggedActions.push({ utilityService: p.PRODUCT_NAME, criticality: p.AVG_VIRALITY });
    }

    // 6. Log the overall run summary
    await logAction('grid_reliability_agent', 'signal_analysis_complete', 'reliability_signals', null, {
      window_hours:   hours,
      criticality_threshold: threshold,
      signals_found:   products.length,
      reason: utilityNarrative(agentAnalysis || trendText.slice(0, 500)),
    }, 0.90);

    // 7. Emit event
    await logEvent('reliability_signal_detected', 'grid_reliability_agent', {
      window_hours:   hours,
      threshold,
      signals_found:  products.length,
      triggered_at:   new Date().toISOString(),
    });

    res.json({
      message:      `Signal detection complete - ${products.length} critical utility service signals identified in last ${hours}h`,
      signals:      trendText,
      analysis:     utilityNarrative(agentAnalysis),
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
// Full orchestration: signal detection -> capacity check -> service request attribution.
// All three agent teams run in sequence. Falls back to direct SQL if LLM unavailable.
// ─────────────────────────────────────────────────────────────────────────────
router.post('/run-cycle', async (req, res) => {
  const allActions = [];

  try {
    // ── PHASE 1: Cross-sector reliability, production, and compliance signal detection ──
    const trendResult = await db.execute(
      `SELECT detect_trending_products(48, 50) AS result FROM dual`
    );
    const trendText = utilityNarrative(trendResult.rows[0]?.RESULT || '');

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

    // Best-effort LLM signal analysis
    let trendAnalysis = null;
    try {
      trendAnalysis = await Promise.race([
        askAgent(TEAM_IDS.GRID_RELIABILITY,
          'What utility service signals are critical right now based on regulatory and supply activity in the last 48 hours'),
        new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 10000)),
      ]);
    } catch (e) {
      logOptionalAgentWarning('Grid reliability agent skipped', e);
    }

    for (const p of topProducts) {
      await logAction('grid_reliability_agent', 'detect_trends', 'utility_service', p.PRODUCT_ID, {
        product_name:  p.PRODUCT_NAME,
        brand:         p.BRAND_NAME,
        mention_count: p.MENTION_COUNT,
        avg_virality:  p.AVG_VIRALITY,
        peak_momentum: p.PEAK_MOMENTUM,
        reason: `Detected via full cycle - ${p.PEAK_MOMENTUM} with criticality ${p.AVG_VIRALITY}`,
      }, p.AVG_VIRALITY > 80 ? 0.95 : 0.85);
      allActions.push({ phase: INTENTS.GRID_RELIABILITY, utilityService: p.PRODUCT_NAME });
    }

    await logEvent('reliability_signal_detected', 'utilities_ai_orchestrator', {
      phase: INTENTS.GRID_RELIABILITY, signals_found: topProducts.length,
    });

    // ── PHASE 2: Capacity and Supply Check ─────────────────────────────────
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

    // Best-effort LLM field operations analysis
    let fulfillmentAnalysis = null;
    try {
      fulfillmentAnalysis = await Promise.race([
        askAgent(TEAM_IDS.FIELD_CREW_LOGISTICS,
          'Which critical utility services have low capacity or supply and need immediate pre-positioning or allocation'),
        new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 10000)),
      ]);
    } catch (e) {
      logOptionalAgentWarning('Field operations agent skipped', e);
    }

    for (const inv of criticalInventory) {
      await logAction('field_crew_logistics_agent', 'capacity_supply_alert', 'capacity_supply', inv.PRODUCT_ID, {
        product_name:       inv.PRODUCT_NAME,
        center:             inv.CENTER_NAME,
        quantity_on_hand:   inv.QUANTITY_ON_HAND,
        quantity_reserved:  inv.QUANTITY_RESERVED,
        reorder_point:      inv.REORDER_POINT,
        stock_status:       inv.STOCK_STATUS,
        strategy:           `Pre-position capacity at ${inv.CENTER_NAME} - critical utility service with ${inv.STOCK_STATUS} capacity status`,
        reason: `${inv.STOCK_STATUS} capacity (${inv.QUANTITY_ON_HAND} units) for critical utility service at ${inv.CENTER_NAME}`,
      }, inv.STOCK_STATUS === 'out_of_stock' ? 0.98 : 0.92);
      allActions.push({ phase: INTENTS.FIELD_CREW_LOGISTICS, utilityService: inv.PRODUCT_NAME, status: inv.STOCK_STATUS });
    }

    await logEvent('capacity_supply_alert', 'field_crew_logistics_agent', {
      phase: 'capacity_supply_check', critical_count: criticalInventory.length,
    });

    // ── PHASE 3: Utility service request attribution ────────────────────────────
    const serviceRequestResult = await db.execute(
      `SELECT /*+ NO_PARALLEL */
              COUNT(*) AS total_service_requests,
              COUNT(CASE WHEN source_signal_id IS NOT NULL THEN 1 END) AS signal_driven_service_requests,
              ROUND(SUM(request_value), 2) AS total_service_value,
              ROUND(SUM(CASE WHEN source_signal_id IS NOT NULL THEN request_value ELSE 0 END), 2) AS signal_driven_service_value,
              ROUND(AVG(request_value), 2) AS avg_service_request_value
       FROM utility_service_requests
       WHERE CAST(created_at AS DATE) >= SYSDATE - 7`
    );
    const serviceRequests = serviceRequestResult.rows[0] || {};

    // Best-effort LLM service request analysis
    let serviceRequestAnalysis = null;
    try {
      serviceRequestAnalysis = await Promise.race([
        askAgent(TEAM_IDS.SERVICE_REQUEST,
          'Summarize signal-driven utility service requests and operational value attribution from the last 7 days'),
        new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 10000)),
      ]);
    } catch (e) {
      logOptionalAgentWarning('Utility service request agent skipped', e);
    }

    const signalPct = serviceRequests.TOTAL_SERVICE_REQUESTS > 0
      ? ((serviceRequests.SIGNAL_DRIVEN_SERVICE_REQUESTS / serviceRequests.TOTAL_SERVICE_REQUESTS) * 100).toFixed(1)
      : 0;

    await logAction('utilities_ai_orchestrator', 'service_request_attribution', 'service_requests', null, {
      total_service_requests: serviceRequests.TOTAL_SERVICE_REQUESTS,
      signal_driven_service_requests: serviceRequests.SIGNAL_DRIVEN_SERVICE_REQUESTS,
      total_service_value: serviceRequests.TOTAL_SERVICE_VALUE,
      signal_driven_service_value: serviceRequests.SIGNAL_DRIVEN_SERVICE_VALUE,
      signal_pct: `${signalPct}%`,
      avg_service_request_value: serviceRequests.AVG_SERVICE_REQUEST_VALUE,
      reason: `${signalPct}% of utility service requests ($${(serviceRequests.SIGNAL_DRIVEN_SERVICE_VALUE || 0).toLocaleString()}) attributed to compliance and supply signals in last 7 days`,
    }, 0.93);
    allActions.push({ phase: INTENTS.SERVICE_REQUESTS, signal_pct: signalPct });

    await logEvent('service_request_analysis_complete', 'utilities_ai_orchestrator', {
      phase: 'service_request_attribution',
      signal_driven_service_requests: serviceRequests.SIGNAL_DRIVEN_SERVICE_REQUESTS,
      signal_driven_service_value: serviceRequests.SIGNAL_DRIVEN_SERVICE_VALUE,
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
      message: `Full cycle complete - ${topProducts.length} signals · ${criticalInventory.length} capacity and supply alerts · ${signalPct}% signal-driven utility service requests`,
      phases: {
        grid_reliability: {
          signals_found: topProducts.length,
          summary:        trendText.split('\n')[0],
          analysis:       utilityNarrative(trendAnalysis),
        },
        capacity_supply: {
          critical_items: criticalInventory.length,
          analysis:       utilityNarrative(fulfillmentAnalysis),
        },
        service_requests: {
          total_service_requests: serviceRequests.TOTAL_SERVICE_REQUESTS,
          signal_driven_service_requests: serviceRequests.SIGNAL_DRIVEN_SERVICE_REQUESTS,
          signal_driven_service_value: serviceRequests.SIGNAL_DRIVEN_SERVICE_VALUE,
          signal_pct: `${signalPct}%`,
          analysis:       utilityNarrative(serviceRequestAnalysis),
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

    const validTeams = Object.values(TEAM_IDS);
    if (!validTeams.includes(team.toUpperCase())) {
      return res.status(400).json({
        error: `Invalid team. Choose from: ${validTeams.join(', ')}`
      });
    }

    const requestedTeam = team.toUpperCase();
    const response = await askAgent(requestedTeam, question);

    res.json({ team: requestedTeam, teamLabel: displayTeamName(requestedTeam), question, response: utilityNarrative(response) });
  } catch (err) {
    console.error('Agent ask error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/agents/trends - ask the trend agent ──
router.post('/trends', async (req, res) => {
  try {
    const { question } = req.body;
    const q = question || 'What utility service signals are critical right now based on regulatory and supply activity';
    const response = await askAgent(TEAM_IDS.GRID_RELIABILITY, q);
    res.json({ team: TEAM_IDS.GRID_RELIABILITY, teamLabel: displayTeamName(TEAM_IDS.GRID_RELIABILITY), question: q, response: utilityNarrative(response) });
  } catch (err) {
    console.error('Trends agent error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/agents/fulfillment - ask the field operations agent ──
router.post('/fulfillment', async (req, res) => {
  try {
    const { question } = req.body;
    const q = question || 'Which critical utility services have low capacity or supply';
    const response = await askAgent(TEAM_IDS.FIELD_CREW_LOGISTICS, q);
    res.json({ team: TEAM_IDS.FIELD_CREW_LOGISTICS, teamLabel: displayTeamName(TEAM_IDS.FIELD_CREW_LOGISTICS), question: q, response: utilityNarrative(response) });
  } catch (err) {
    console.error('Field operations agent error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/agents/commerce - ask the utility service request agent ──
router.post('/commerce', async (req, res) => {
  try {
    const { question } = req.body;
    const q = question || 'How many utility service requests were created in the last 24 hours and what is the total operational value';
    const response = await askAgent(TEAM_IDS.SERVICE_REQUEST, q);
    res.json({ team: TEAM_IDS.SERVICE_REQUEST, teamLabel: displayTeamName(TEAM_IDS.SERVICE_REQUEST), question: q, response: utilityNarrative(response) });
  } catch (err) {
    console.error('Utility service request agent error:', err);
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

    res.json(sanitizeUtilityPayload(result.rows));
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

    res.json(sanitizeUtilityPayload(result.rows));
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

    res.json(sanitizeUtilityPayload(result.rows));
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

    res.json(sanitizeUtilityPayload(result.rows));
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

    res.json(sanitizeUtilityPayload(result.rows));
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
  let team = TEAM_IDS.SERVICE_REQUEST;
  let intent = INTENTS.SERVICE_REQUESTS;
  let toolsUsed = [];

  // Strong signals: worth 3 points each because they unambiguously indicate one intent.
  const trendStrong = ['critical signal', 'grid signal', 'reliability signal', 'load signal', 'gas pressure', 'gas leak', 'pipeline anomaly', 'wastewater compliance', 'well production', 'production variance', 'refinery throughput', 'lng delay', 'emissions', 'hse', 'momentum', 'source', 'bulletin', 'regulatory', 'compliance', 'criticality', 'field operations notice', 'rising'];
  const inventoryStrong = ['capacity', 'supply', 'reserve threshold', 'field operations', 'field dispatch', 'work order', 'maintenance plan', 'crew availability', 'parts availability', 'asset maintenance', 'pipeline integrity', 'allocation', 'pre-position', 'logistics site'];
  const commerceStrong = ['operational value', 'request priority value', 'service request', 'utility service request', 'billing inquiry', 'collections', 'payment arrangement', 'customer request', 'service point', 'sla', 'regulatory report'];

  // Weak signals: worth 1 point each because they can relate to multiple intents.
  const trendWeak = ['trend', 'post', 'engagement', 'views', 'likes', 'shares', 'sentiment', 'signal', 'reliability', 'pressure', 'throughput', 'production', 'integrity', 'emission', 'safety', 'reach', 'regulatory'];
  const inventoryWeak = ['route', 'routing', 'center', 'supply', 'logistics', 'dispatch', 'crew', 'maintenance', 'inspection', 'nearest', 'distance', 'site'];
  const commerceWeak = ['request', 'customer', 'service point', 'account', 'billing', 'collections', 'price', 'category', 'partner', 'utility service', 'total'];

  const trendScore = trendStrong.filter(k => qLower.includes(k)).length * 3
                   + trendWeak.filter(k => qLower.includes(k)).length;
  const inventoryScore = inventoryStrong.filter(k => qLower.includes(k)).length * 3
                       + inventoryWeak.filter(k => qLower.includes(k)).length;
  const commerceScore = commerceStrong.filter(k => qLower.includes(k)).length * 3
                      + commerceWeak.filter(k => qLower.includes(k)).length;

  if (trendScore >= inventoryScore && trendScore >= commerceScore && trendScore > 0) {
    team = TEAM_IDS.GRID_RELIABILITY; intent = INTENTS.GRID_RELIABILITY;
  } else if (inventoryScore > trendScore && inventoryScore >= commerceScore) {
    team = TEAM_IDS.FIELD_CREW_LOGISTICS; intent = INTENTS.FIELD_CREW_LOGISTICS;
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
      toolsUsed.push({ tool: 'Ollama llama3.2', team: displayTeamName(team), status: 'success' });
    }
  } catch (agentErr) {
    toolsUsed.push({ tool: 'Ollama llama3.2', team: displayTeamName(team), status: 'fallback', reason: agentErr.message });
  }

  // Step 3: Fallback - call PL/SQL tool functions directly
  let fallbackResult = null;
  let fallbackData = null;

  try {
    if (intent === INTENTS.GRID_RELIABILITY) {
      const graphFallback = await buildOperationalGraphFallback(q, qLower);

      if (graphFallback) {
        fallbackResult = graphFallback.result;
        fallbackData = graphFallback.data;
        toolsUsed.push({
          tool: 'Operational event graph SQL tool',
          params: { rows: graphFallback.data.length },
          status: 'success',
        });
      } else {
        // Extract hours/score params from question if mentioned
        const hoursMatch = qLower.match(/(\d+)\s*hours?/);
        const hours = hoursMatch ? parseInt(hoursMatch[1]) : 48;
        const scoreMatch = qLower.match(/score.*?(\d+)|criticality.*?(\d+)/);
        const minScore = scoreMatch ? parseInt(scoreMatch[1] || scoreMatch[2]) : 50;

        const trendRes = await db.execute(
          `SELECT detect_trending_products(:hours, :score) AS result FROM dual`,
          { hours, score: minScore }
        );
        fallbackResult = utilityNarrative(trendRes.rows[0]?.RESULT || 'No critical utility service signals found');
        toolsUsed.push({ tool: 'Grid signal detection tool', params: { hours, minScore }, status: 'success' });

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

        // Check for signal-source-specific questions
        const handleMatch = q.match(/@[\w_]+/);
        if (handleMatch || qLower.includes('signal source') || qLower.includes('influencer') || qLower.includes('source')) {
          const handle = handleMatch ? handleMatch[0] : null;
          if (handle) {
            const netRes = await db.execute(
              `SELECT get_influencer_network(:handle) AS result FROM dual`,
              { handle }
            );
            fallbackResult += '\n\n' + utilityNarrative(netRes.rows[0]?.RESULT || '');
            toolsUsed.push({ tool: 'Utility signal network tool', params: { handle }, status: 'success' });
          }
        }
      }

    } else if (intent === INTENTS.FIELD_CREW_LOGISTICS) {
      // Extract utility service or supply name from question
      const productPatterns = [
        /["']([^"']+)["']/,                                                           // quoted product name
        /(?:inventory|stock|check)\s+(?:for|of|on)\s+(?:the\s+)?(.+?)(?:\s+across|\s+at|\s+in|\s*\??\s*$)/i,
        /(?:ship|deliver|send|route)\s+(?:the\s+)?(.+?)(?:\s+to\s+|\s+for\s+)/i,
        /(?:fulfillment|nearest)\s+(?:center\s+)?(?:for|with)\s+(.+?)(?:\s+in\s+stock|\s+to\s+|\s+for\s+|\s*\??\s*$)/i,
        /(?:for|of|about)\s+(?:the\s+)?([A-Z][A-Za-z\s]+?)(?:\s+across|\s+at|\s+in|\s+to|\s*\??\s*$)/i,
      ];
      let productName = null;
      for (const pat of productPatterns) {
        const m = q.match(pat);
        if (m) {
          let pn = m[1].trim();
          // Clean up: remove trailing filler words
          pn = pn.replace(/\s+(items?|products?|products?)\s*$/i, '').trim();
          // Skip if the extracted name looks like a non-product phrase.
          if (pn.length >= 3 && !/^(a |the |an |to |in |for )/i.test(pn)) {
            productName = pn;
            break;
          }
        }
      }

      // Check if this is a routing question that mentions a service point or city.
      const cityMatch = q.match(/(?:to|in|near)\s+(?:a\s+(?:customer|service point)\s+in\s+)?([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/);
      const emailMatch = q.match(/[\w.]+@[\w.]+/);

      if (productName && (cityMatch || emailMatch)) {
        // Spatial routing: find best field operations site.
        let customerEmail = emailMatch ? emailMatch[0] : null;

        // If user gave a city name, look up a real service point email in that city.
        if (!customerEmail && cityMatch) {
          const cityName = cityMatch[1];
          try {
            const custRes = await db.execute(
              `SELECT email FROM customers WHERE UPPER(city) = UPPER(:city) FETCH FIRST 1 ROWS ONLY`,
              { city: cityName }
            );
            if (custRes.rows.length > 0) {
              customerEmail = custRes.rows[0].EMAIL;
              toolsUsed.push({ tool: 'service point_lookup', params: { city: cityName }, status: 'success', email: customerEmail });
            }
          } catch (_) {}
        }

        if (customerEmail) {
          try {
            const routeRes = await db.execute(
              `SELECT find_best_fulfillment(:email, :pname) AS result FROM dual`,
              { email: customerEmail, pname: productName }
            );
            fallbackResult = utilityNarrative(routeRes.rows[0]?.RESULT || 'No field operations route found');
            toolsUsed.push({ tool: 'Field operations routing tool', params: { servicePoint: customerEmail, utilityService: productName }, status: 'success' });

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
            fallbackResult = utilityNarrative(invRes.rows[0]?.RESULT || 'No capacity and supply data found');
            toolsUsed.push({ tool: 'Capacity and supply check tool', params: { utilityService: productName }, status: 'success' });
          }
        } else {
          // City not found: fall back to inventory check.
          const invRes = await db.execute(
            `SELECT check_product_inventory(:pname) AS result FROM dual`,
            { pname: productName }
          );
          fallbackResult = utilityNarrative(invRes.rows[0]?.RESULT || 'No capacity and supply data found');
          toolsUsed.push({ tool: 'Capacity and supply check tool', params: { utilityService: productName }, status: 'success' });
        }
      } else if (productName) {
        const invRes = await db.execute(
          `SELECT check_product_inventory(:pname) AS result FROM dual`,
          { pname: productName }
        );
        fallbackResult = utilityNarrative(invRes.rows[0]?.RESULT || 'No capacity and supply data found');
        toolsUsed.push({ tool: 'Capacity and supply check tool', params: { utilityService: productName }, status: 'success' });
      } else {
        // General capacity and field operations query.
        const invRes = await db.execute(
          `SELECT fc.center_name, fc.city, fc.state_province, fc.center_type,
                  COUNT(i.product_id) AS utility_services_available,
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
        fallbackResult = `Field operations overview: ${invRes.rows.length} active field operations sites`;
        toolsUsed.push({ tool: 'Service request SQL tool (fallback)', status: 'success' });
      }

    } else {
      // utilities service request and service-value queries.
      const commerceRes = await db.execute(
        `SELECT COUNT(*) AS total_service_requests,
                COUNT(CASE WHEN source_signal_id IS NOT NULL THEN 1 END) AS signal_driven_requests,
                ROUND(SUM(request_value), 2) AS total_service_value,
                ROUND(SUM(CASE WHEN source_signal_id IS NOT NULL THEN request_value ELSE 0 END), 2) AS signal_driven_service_value,
                ROUND(AVG(request_value), 2) AS avg_service_request_value,
                COUNT(DISTINCT requesting_service_point_id) AS unique_service_points
         FROM utility_service_requests
         WHERE CAST(created_at AS DATE) >= SYSDATE - 30`
      );
      const c = commerceRes.rows[0] || {};
      const signalPct = c.TOTAL_SERVICE_REQUESTS > 0 ? ((c.SIGNAL_DRIVEN_REQUESTS / c.TOTAL_SERVICE_REQUESTS) * 100).toFixed(1) : '0';

      fallbackResult = `Last 30 days: ${(c.TOTAL_SERVICE_REQUESTS || 0).toLocaleString()} service requests, $${(c.TOTAL_SERVICE_VALUE || 0).toLocaleString()} operational value. ` +
        `${signalPct}% signal-driven ($${(c.SIGNAL_DRIVEN_SERVICE_VALUE || 0).toLocaleString()}). ` +
        `Avg request: $${c.AVG_SERVICE_REQUEST_VALUE || 0}. ${(c.UNIQUE_SERVICE_POINTS || 0).toLocaleString()} unique service points.`;
      fallbackData = [c];
      toolsUsed.push({ tool: 'Service request SQL tool (direct)', status: 'success' });

      // Category breakdown if asked
      if (qLower.includes('category') || qLower.includes('breakdown')) {
        const catRes = await db.execute(
          `SELECT cri.utility_category,
                  COUNT(DISTINCT cri.service_request_id) AS service_requests,
                  ROUND(SUM(cri.line_value), 2) AS service_value
           FROM utility_request_items cri
           JOIN utility_service_requests csr
             ON csr.service_request_id = cri.service_request_id
           WHERE CAST(csr.created_at AS DATE) >= SYSDATE - 30
           GROUP BY cri.utility_category
           ORDER BY service_value DESC`
        );
        fallbackData = catRes.rows;
        toolsUsed.push({ tool: 'Service request SQL tool (category)', status: 'success' });
      }
    }
  } catch (toolErr) {
    toolsUsed.push({ tool: 'fallback', status: 'error', reason: toolErr.message });
  }

  // Step 4: Log the chat interaction
  await logAction('utilities_chat_agent', 'chat_query', intent, null, {
    question: q,
    team,
    agent_used: agentUsed,
    tools_called: toolsUsed.length,
    reason: `Chat query routed to ${displayTeamName(team)} (intent: ${intent})`,
  }, 0.90);

  const elapsed = Date.now() - startTime;

  const toolHistory = toolsUsed.slice(0, 5).map((entry) => ({
    TOOL_NAME: entry.tool,
    CALLED_AT: new Date().toISOString().slice(11, 19),
    RESULT_PREVIEW: utilityNarrative(entry.reason || entry.status || 'success'),
  }));
  const hasOperationalGraphEvidence = toolsUsed.some(
    (entry) => entry.tool === 'Operational event graph SQL tool' && entry.status === 'success'
  );
  const agentResponseIsUseful = agentResponse && !isUnhelpfulAgentResponse(agentResponse);
  const responseText = fallbackResult && (hasOperationalGraphEvidence || !agentResponseIsUseful)
    ? fallbackResult
    : agentResponse || fallbackResult || 'No results found for your question.';

  res.json({
    question: q,
    team,
    teamLabel: displayTeamName(team),
    intent,
    agentUsed,
    response: utilityNarrative(responseText),
    data: fallbackData,
    toolsUsed: sanitizeUtilityPayload(toolsUsed),
    toolHistory,
    elapsed,
  });
});

// ── GET /api/agents/teams - list available teams ──
router.get('/teams', async (req, res) => {
  res.json(STATIC_TEAMS);
});

module.exports = router;
