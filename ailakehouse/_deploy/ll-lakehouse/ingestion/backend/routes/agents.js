/**
 * Agents API — native Select AI Agent orchestration when OCI GenAI is
 * available, with llama3.2 application orchestration as the local fallback.
 */

const express = require('express');
const router = express.Router();
const db = require('../config/database');
const {
  DEFAULT_PROFILE,
  answerQuestion,
  getAvailableProfiles: getOllamaProfiles,
  normalizeProfile,
  summarizeContext,
} = require('../lib/ollamaAssistant');
const {
  ensureNativeAgentRuntime,
  nativeProfileCatalogEntry,
  nativeTeams,
  runNativeAgentQuestion,
} = require('../lib/appAgentService');

const STATIC_TEAMS = [
  {
    TEAM_NAME: 'SOCIAL_TREND_TEAM',
    STATUS: 'ENABLED',
    DESCRIPTION: 'Demand and market signal analysis over live PeakGear app database data.',
  },
  {
    TEAM_NAME: 'FULFILLMENT_TEAM',
    STATUS: 'ENABLED',
    DESCRIPTION: 'Store service analysis using inventory and routing context.',
  },
  {
    TEAM_NAME: 'COMMERCE_TEAM',
    STATUS: 'ENABLED',
    DESCRIPTION: 'Customer order analysis using orders and revenue context.',
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
         WHERE sp.posted_at >= (SELECT MAX(posted_at) FROM social_posts) - INTERVAL '48' HOUR
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
         WHERE sp.posted_at >= (SELECT MAX(posted_at) FROM social_posts) - INTERVAL '48' HOUR
         GROUP BY i.handle, i.platform
         ORDER BY total_views DESC NULLS LAST
         FETCH FIRST 6 ROWS ONLY`
      ),
      db.execute(
        `SELECT momentum_flag, COUNT(*) AS post_count
         FROM social_posts
         WHERE posted_at >= (SELECT MAX(posted_at) FROM social_posts) - INTERVAL '48' HOUR
         GROUP BY momentum_flag
         ORDER BY post_count DESC`
      ),
    ]);

    return {
      instructions: 'Focus on sporting goods products, brands and partners, demand signals, criticality, and concrete metrics.',
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
      instructions: 'Focus on inventory risk, service routing, and practical fulfillment actions.',
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
       WHERE created_at >= (SELECT MAX(created_at) FROM orders) - INTERVAL '30' DAY`
    ),
    db.execute(
      `SELECT p.category,
              COUNT(DISTINCT o.order_id) AS orders,
              ROUND(SUM(oi.quantity * oi.unit_price), 2) AS revenue
       FROM order_items oi
       JOIN orders o ON oi.order_id = o.order_id
       JOIN products p ON oi.product_id = p.product_id
       WHERE o.created_at >= (SELECT MAX(created_at) FROM orders) - INTERVAL '30' DAY
       GROUP BY p.category
       ORDER BY revenue DESC
       FETCH FIRST 8 ROWS ONLY`
    ),
    db.execute(
      `SELECT order_status, COUNT(*) AS orders, ROUND(SUM(order_total), 2) AS revenue
       FROM orders
       WHERE created_at >= (SELECT MAX(created_at) FROM orders) - INTERVAL '30' DAY
       GROUP BY order_status
       ORDER BY revenue DESC`
    ),
  ]);

  return {
    instructions: 'Focus on B2B sporting goods orders, revenue, signal attribution, and business trends.',
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
      return context.trend_summary || 'No watched products found in the current window.';
    }
    return products
      .slice(0, 3)
      .map((product) => {
        const avgVirality = product.AVG_VIRALITY == null ? 'n/a' : product.AVG_VIRALITY;
        return `${product.PRODUCT_NAME} (${product.BRAND_NAME}) avg criticality ${avgVirality}, ${product.MENTIONS} mentions, ${product.TOTAL_VIEWS} reach`;
      })
      .join(' | ');
  }

  if (teamName === 'FULFILLMENT_TEAM') {
    const alerts = context.inventory_alerts || [];
    if (!alerts.length) {
      return 'No current low-capacity capacity alerts were found.';
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
  return `Last 30 days: ${totalOrders.toLocaleString()} orders, $${totalRevenue.toLocaleString()} revenue, ${socialOrders.toLocaleString()} signal-driven orders, $${socialRevenue.toLocaleString()} signal-attributed revenue.`;
}

function formatMoney(value) {
  return Number(value || 0).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  });
}

function summarizeCategoryRevenue(rows) {
  const categories = Array.isArray(rows) ? rows : [];
  if (!categories.length) {
    return 'No category revenue found in the demo-relative last 30-day order window.';
  }

  const totalRevenue = categories.reduce((sum, row) => sum + Number(row.REVENUE || 0), 0);
  const topLines = categories.slice(0, 8).map((row, index) => {
    const revenue = Number(row.REVENUE || 0);
    const pct = totalRevenue > 0 ? ((revenue / totalRevenue) * 100).toFixed(1) : '0.0';
    return `${index + 1}. ${row.CATEGORY || 'Uncategorized'}: ${formatMoney(revenue)} (${pct}%, ${Number(row.ORDERS || 0).toLocaleString()} orders)`;
  });

  return `Revenue by sporting goods product category for the demo-relative last 30 days:\n${topLines.join('\n')}\nTotal across categories: ${formatMoney(totalRevenue)}.`;
}

function shouldUseDirectToolFallback(question, response) {
  const q = String(question || '').toLowerCase();
  const answer = String(response || '').toLowerCase();
  const broadQuestion = /\b(which|what|show|list|top|highest|lowest|summary)\b/.test(q);
  const asksForClarification = /(could you|please provide|would you like|can you specify|provide a list|which product)/.test(answer);
  return broadQuestion && asksForClarification;
}

function cleanCandidateProductName(value) {
  return String(value || '')
    .replace(/[?.!,;:]+$/g, '')
    .replace(/\s+(?:on|in)\s+stock\s*$/i, '')
    .replace(/\s+(?:available|availability|inventory|capacity)\s*$/i, '')
    .replace(/\s+(?:items?|products?|gear)\s*$/i, '')
    .trim();
}

async function findProductNameInQuestion(question) {
  const text = String(question || '').trim();
  if (!text) return null;

  const exactResult = await db.execute(
    `SELECT product_name
     FROM products
     WHERE INSTR(UPPER(:questionText), UPPER(product_name)) > 0
     ORDER BY LENGTH(product_name) DESC
     FETCH FIRST 1 ROW ONLY`,
    { questionText: text }
  );
  if (exactResult.rows?.length) {
    return exactResult.rows[0].PRODUCT_NAME;
  }

  const productPatterns = [
    /["']([^"']+)["']/,
    /(?:do we have enough|have enough|enough stock for|enough inventory for)\s+(?:the\s+)?(.+?)(?:\s+(?:on|in)\s+stock|\s+available|\s+inventory|\s*\??\s*$)/i,
    /(?:stock|inventory|availability|capacity|check)\s+(?:for|of|on)\s+(?:the\s+)?(.+?)(?:\s+across|\s+at|\s+in|\s*\??\s*$)/i,
    /(?:ship|deliver|send|route)\s+(?:the\s+)?(.+?)(?:\s+to\s+|\s+for\s+)/i,
    /(?:fulfillment|nearest)\s+(?:center\s+)?(?:for|with)\s+(.+?)(?:\s+in\s+capacity|\s+to\s+|\s+for\s+|\s*\??\s*$)/i,
    /(?:for|of|about)\s+(?:the\s+)?([A-Z][A-Za-z0-9\s-]+?)(?:\s+across|\s+at|\s+in|\s+to|\s*\??\s*$)/i,
  ];

  for (const pattern of productPatterns) {
    const match = text.match(pattern);
    const candidate = cleanCandidateProductName(match?.[1]);
    if (!candidate || candidate.length < 3 || /^(a |the |an |to |in |for )/i.test(candidate)) {
      continue;
    }

    const fuzzyResult = await db.execute(
      `SELECT product_name
       FROM products
       WHERE UPPER(product_name) LIKE '%' || UPPER(:candidate) || '%'
          OR UPPER(:candidate) LIKE '%' || UPPER(product_name) || '%'
       ORDER BY LENGTH(product_name) DESC
       FETCH FIRST 1 ROW ONLY`,
      { candidate }
    );
    if (fuzzyResult.rows?.length) {
      return fuzzyResult.rows[0].PRODUCT_NAME;
    }
    return candidate;
  }

  return null;
}

async function getProductMetadata(productName) {
  if (!productName) return null;
  const result = await db.execute(
    `SELECT p.product_name, b.brand_name, p.category
     FROM products p
     JOIN brands b ON p.brand_id = b.brand_id
     WHERE UPPER(p.product_name) = UPPER(:productName)
     FETCH FIRST 1 ROW ONLY`,
    { productName }
  );
  return result.rows?.[0] || null;
}

async function findCategoryInQuestion(question) {
  const text = String(question || '').trim();
  if (!text) return null;
  const result = await db.execute(
    `SELECT category
     FROM (
       SELECT DISTINCT category
       FROM products
       WHERE category IS NOT NULL
         AND INSTR(UPPER(:questionText), UPPER(category)) > 0
       ORDER BY LENGTH(category) DESC
     )
     WHERE ROWNUM = 1`,
    { questionText: text }
  );
  return result.rows?.[0]?.CATEGORY || null;
}

function formatSignalWindow(hours) {
  if (hours === 24) return '24 hours';
  return hours % 24 === 0 ? `${hours / 24} days` : `${hours} hours`;
}

async function buildProductInventoryAnswer(productName) {
  const summaryResult = await db.execute(
    `SELECT COUNT(*) AS site_count,
            NVL(SUM(i.quantity_on_hand), 0) AS total_on_hand,
            NVL(SUM(i.quantity_reserved), 0) AS total_reserved,
            NVL(SUM(i.quantity_on_hand - i.quantity_reserved), 0) AS total_available,
            SUM(CASE WHEN i.quantity_on_hand = 0 THEN 1 ELSE 0 END) AS out_of_capacity_sites,
            SUM(CASE WHEN i.quantity_on_hand > 0 AND i.quantity_on_hand <= i.reorder_point THEN 1 ELSE 0 END) AS low_capacity_sites
     FROM inventory i
     JOIN fulfillment_centers fc ON i.center_id = fc.center_id
     JOIN products p ON i.product_id = p.product_id
     WHERE UPPER(p.product_name) = UPPER(:productName)
       AND fc.is_active = 1`,
    { productName }
  );

  const summary = summaryResult.rows?.[0] || {};
  if (!Number(summary.SITE_COUNT || 0)) {
    return {
      text: `No inventory found for product matching: ${productName}`,
      data: { summary, constrainedSites: [] },
    };
  }

  const constrainedResult = await db.execute(
    `SELECT fc.center_name,
            fc.city,
            fc.state_province,
            i.quantity_on_hand,
            i.quantity_reserved,
            i.reorder_point,
            CASE
              WHEN i.quantity_on_hand = 0 THEN 'out_of_capacity'
              WHEN i.quantity_on_hand <= i.reorder_point * 0.5 THEN 'critical'
              WHEN i.quantity_on_hand <= i.reorder_point THEN 'low'
              ELSE 'ok'
            END AS capacity_status
     FROM inventory i
     JOIN fulfillment_centers fc ON i.center_id = fc.center_id
     JOIN products p ON i.product_id = p.product_id
     WHERE UPPER(p.product_name) = UPPER(:productName)
       AND fc.is_active = 1
     ORDER BY
       CASE
         WHEN i.quantity_on_hand = 0 THEN 0
         WHEN i.quantity_on_hand <= i.reorder_point * 0.5 THEN 1
         WHEN i.quantity_on_hand <= i.reorder_point THEN 2
         ELSE 3
       END,
       i.quantity_on_hand ASC,
       i.quantity_reserved DESC
     FETCH FIRST 5 ROWS ONLY`,
    { productName }
  );

  const constrainedSites = constrainedResult.rows || [];
  const totalOnHand = Number(summary.TOTAL_ON_HAND || 0);
  const totalReserved = Number(summary.TOTAL_RESERVED || 0);
  const totalAvailable = Number(summary.TOTAL_AVAILABLE || 0);
  const outSites = Number(summary.OUT_OF_CAPACITY_SITES || 0);
  const lowSites = Number(summary.LOW_CAPACITY_SITES || 0);
  const siteCount = Number(summary.SITE_COUNT || 0);
  const enough = totalAvailable > 0 && outSites === 0 && lowSites === 0;

  const headline = enough
    ? `Yes. ${productName} has enough stock overall.`
    : `${productName} needs attention in parts of the fulfillment network.`;
  const lines = [
    headline,
    `${totalOnHand.toLocaleString()} units are on hand, ${totalReserved.toLocaleString()} are reserved, and ${totalAvailable.toLocaleString()} are available across ${siteCount} active sites.`,
    outSites || lowSites
      ? `${outSites} sites are out of capacity and ${lowSites} sites are below reorder point.`
      : 'No active site is currently below reorder point.',
  ];

  if (constrainedSites.length) {
    lines.push(`Lowest-stock sites: ${constrainedSites.map((site) =>
      `${site.CENTER_NAME} (${site.CITY}, ${site.STATE_PROVINCE}) has ${site.QUANTITY_ON_HAND} on hand, ${site.QUANTITY_RESERVED} reserved [${site.CAPACITY_STATUS}]`
    ).join('; ')}.`);
  }

  lines.push(enough
    ? 'Recommended action: keep monitoring because this product is showing urgent demand momentum, but no immediate replenishment action is required.'
    : 'Recommended action: review allocation and replenishment for constrained sites before the demand signal turns into a stockout.');

  return {
    text: lines.join('\n'),
    data: { summary, constrainedSites },
  };
}

function uniqueValues(values) {
  return [...new Set(values.filter(Boolean).map((value) => String(value).trim()).filter(Boolean))];
}

async function buildAgentWorkflow({ question, team, intent, response, data }) {
  let products = [];
  let category = null;

  if (Array.isArray(data)) {
    products = uniqueValues(data.map((row) => row.PRODUCT_NAME)).slice(0, 3);
    category = data.find((row) => row.CATEGORY)?.CATEGORY || null;
  } else if (data && typeof data === 'object') {
    if (data.product) products = [data.product];
    if (data.summary?.PRODUCT_NAME) products = [data.summary.PRODUCT_NAME];
  }

  const detectedProduct = products[0] || await findProductNameInQuestion(`${question}\n${response || ''}`);
  if (detectedProduct && !products.includes(detectedProduct)) {
    products = [detectedProduct, ...products].slice(0, 3);
  }

  const primaryProduct = products[0] || null;
  if (primaryProduct && !category) {
    const metadata = await getProductMetadata(primaryProduct);
    category = metadata?.CATEGORY || null;
  }
  if (!category) {
    category = await findCategoryInQuestion(`${question}\n${response || ''}`);
  }

  const nextActions = [];

  const addAction = (label, actionQuestion, actionTeam, actionIntent, reason) => {
    if (!label || !actionQuestion) return;
    if (nextActions.some((action) => action.question === actionQuestion)) return;
    nextActions.push({ label, question: actionQuestion, team: actionTeam, intent: actionIntent, reason });
  };

  if (intent === 'trends') {
    const noProductSignals = primaryProduct && /no urgent demand signals found/i.test(String(response || ''));
    if (noProductSignals) {
      addAction(
        'Widen signal window',
        `Find urgent demand signals for ${primaryProduct} in the last 7 days`,
        'SOCIAL_TREND_TEAM',
        'trends',
        'No signal appeared in the short window, so widen the observation period before acting.'
      );
      if (category) {
        addAction(
          'Check related category signals',
          `Find urgent demand signals in ${category} in the last 24 hours`,
          'SOCIAL_TREND_TEAM',
          'trends',
          `See whether the broader ${category} category is moving even if this product is quiet.`
        );
      }
      addAction(
        'Compare all urgent signals',
        'Find urgent demand signals in the last 24 hours',
        'SOCIAL_TREND_TEAM',
        'trends',
        'Compare this quiet product against products that are currently gaining demand.'
      );
    } else if (primaryProduct) {
      addAction(
        'Check stock for this product',
        `Check inventory for ${primaryProduct}`,
        'FULFILLMENT_TEAM',
        'fulfillment',
        'Demand only becomes actionable when inventory and store capacity are checked.'
      );
      addAction(
        'Find a fulfillment route',
        `Find nearest eligible store fulfillment site with ${primaryProduct} for a customer in Miami`,
        'FULFILLMENT_TEAM',
        'fulfillment',
        'Connect demand momentum to a service decision.'
      );
    }
    if (!primaryProduct && category && /no urgent demand signals found/i.test(String(response || ''))) {
      addAction(
        'Widen category window',
        `Find urgent demand signals in ${category} in the last 7 days`,
        'SOCIAL_TREND_TEAM',
        'trends',
        `No ${category} signal appeared in the short window, so widen the observation period.`
      );
      addAction(
        'Compare all urgent signals',
        'Find urgent demand signals in the last 24 hours',
        'SOCIAL_TREND_TEAM',
        'trends',
        `See which products are moving while ${category} is quiet.`
      );
      addAction(
        'Check low inventory',
        'Which products have low inventory?',
        'FULFILLMENT_TEAM',
        'fulfillment',
        'Inventory can still require attention even when demand signals are quiet.'
      );
    } else if (category) {
      addAction(
        'Check category revenue',
        'Show revenue breakdown by product category',
        'COMMERCE_TEAM',
        'commerce',
        `See whether ${category} demand is reflected in customer orders.`
      );
    }
  } else if (intent === 'fulfillment') {
    if (primaryProduct) {
      addAction(
        'Check demand signals for this product',
        `Find urgent demand signals for ${primaryProduct} in the last 24 hours`,
        'SOCIAL_TREND_TEAM',
        'trends',
        'Inventory risk is more urgent when live demand signals are also rising.'
      );
      addAction(
        'Find a fulfillment route',
        `Find nearest eligible store fulfillment site with ${primaryProduct} for a customer in Miami`,
        'FULFILLMENT_TEAM',
        'fulfillment',
        'Use available stock to make a concrete service-routing decision.'
      );
    }
    addAction(
      'Show other low-inventory products',
      'Which products have low inventory?',
      'FULFILLMENT_TEAM',
      'fulfillment',
      'Compare this item against the broader fulfillment risk queue.'
    );
  } else {
    addAction(
      'Find urgent demand signals',
      'Find urgent demand signals in the last 24 hours',
      'SOCIAL_TREND_TEAM',
      'trends',
      'Connect order performance to emerging market demand.'
    );
    addAction(
      'Check low inventory',
      'Which products have low inventory?',
      'FULFILLMENT_TEAM',
      'fulfillment',
      'See whether revenue momentum is constrained by fulfillment capacity.'
    );
  }

  return {
    stage: intent === 'trends' ? 'demand_sensing' : intent === 'fulfillment' ? 'fulfillment_check' : 'commerce_review',
    entities: {
      products,
      primaryProduct,
      category,
    },
    nextActions: nextActions.slice(0, 3),
  };
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
// Runs the signal team to identify critical sporting goods product signals.
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

    // 4. Try Ollama-based agent analysis for richer natural-language output (best-effort)
    let agentAnalysis = null;
    try {
      agentAnalysis = await Promise.race([
        askAgent('SOCIAL_TREND_TEAM',
          `Identify the top sporting goods product signals and signal sources from the last ${hours} hours ` +
          `using the detect trends tool with minimum criticality score ${threshold}`),
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
// Full orchestration: signal detection -> inventory check -> order attribution.
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
       WHERE sp.posted_at >= (SELECT MAX(posted_at) FROM social_posts) - INTERVAL '48' HOUR
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
          'What sporting goods product signals are critical right now based on market and operations activity in the last 48 hours'),
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

    // Best-effort LLM fulfillment analysis
    let fulfillmentAnalysis = null;
    try {
      fulfillmentAnalysis = await Promise.race([
        askAgent('FULFILLMENT_TEAM',
          'Which critical sporting goods products have low inventory and need immediate replenishment or allocation'),
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

    // Best-effort LLM commerce analysis
    let commerceAnalysis = null;
    try {
      commerceAnalysis = await Promise.race([
        askAgent('COMMERCE_TEAM',
          'Summarize signal-driven customer and partner orders and revenue attribution from the last 7 days'),
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
    const q = question || 'What sporting goods product signals are critical right now based on market and operations activity';
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
    const q = question || 'Which critical sporting goods products have low inventory';
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
    profiles: getOllamaProfiles(),
    activeProfile: DEFAULT_PROFILE,
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
  let team = 'COMMERCE_TEAM';
  let intent = 'commerce';
  let toolsUsed = [];
  let nativeRuntimeFailed = false;

  // Strong signals: worth 3 points each because they unambiguously indicate one intent.
  const trendStrong = ['trending', 'viral', 'virality', 'mega_viral', 'momentum', 'influencer', 'source', 'bulletin', 'market', 'returns audit', 'criticality', 'market notice', 'rising'];
  const inventoryStrong = ['inventory', 'stock', 'in stock', 'on stock', 'available', 'availability', 'have enough', 'enough', 'warehouse', 'fulfillment', 'reorder', 'replenishment', 'out of capacity', 'eligible', 'allocation'];
  const commerceStrong = ['revenue', 'sales', 'purchase', 'spend', 'order total'];

  // Weak signals: worth 1 point each because they can relate to multiple intents.
  const trendWeak = ['trend', 'social', 'post', 'engagement', 'views', 'likes', 'shares', 'sentiment', 'signal', 'safety', 'price', 'returns'];
  const inventoryWeak = ['capacity', 'ship', 'routing', 'center', 'service', 'operations', 'delivery', 'nearest', 'distance', 'site', 'store'];
  const commerceWeak = ['order', 'customer', 'customer', 'price', 'category', 'brand', 'brand or partner', 'product', 'sporting goods product', 'total'];

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

  // ── Step 2: Use native Select AI Agent when OCI GenAI is available ────────
  try {
    const nativeResult = await runNativeAgentQuestion({ question: q, team, intent });
    if (nativeResult) {
      if (shouldUseDirectToolFallback(q, nativeResult.response)) {
        nativeRuntimeFailed = true;
        toolsUsed.push({
          tool: 'Select AI Agent orchestration',
          technicalTool: 'DBMS_CLOUD_AI_AGENT.RUN_TEAM',
          team,
          status: 'fallback',
          reason: 'Native agent asked for clarification; direct Oracle tools can answer this broad question',
        });
      } else {
        const workflow = await buildAgentWorkflow({
          question: q,
          team,
          intent,
          response: nativeResult.response,
          data: nativeResult.data,
        });
        await logAction('chat_agent', 'select_ai_agent_query', intent, null, {
          question: q,
          team,
          runtime: 'select_ai_agent',
          profile: nativeResult.profile,
          reason: `Chat query routed to native ${team} through DBMS_CLOUD_AI_AGENT.RUN_TEAM`,
        }, 0.95);
        return res.json({
          ...nativeResult,
          workflow,
          nextActions: workflow.nextActions,
        });
      }
    }
  } catch (nativeErr) {
    if (nativeErr.nativeRuntimeAvailable) {
      nativeRuntimeFailed = true;
      logOptionalAgentWarning('Native Select AI Agent skipped to direct Oracle tools', nativeErr);
      toolsUsed.push({
        tool: 'Select AI Agent orchestration',
        technicalTool: 'DBMS_CLOUD_AI_AGENT.RUN_TEAM',
        team,
        status: 'fallback',
        reason: 'Native orchestration did not complete quickly enough; direct Oracle tools answered the request.',
        technicalReason: nativeErr.message || 'Native Select AI Agent did not complete in time',
      });
    }
  }

  // ── Step 3: Try Ollama team reasoning when native agents are unavailable ─
  let agentResponse = null;
  let agentUsed = false;
  if (!nativeRuntimeFailed) {
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
  }

  // ── Step 4: Fallback — call PL/SQL tool functions directly ──
  let fallbackResult = null;
  let fallbackData = null;

  try {
    if (intent === 'trends') {
      // Extract hours/score params from question if mentioned
      const hoursMatch = qLower.match(/(\d+)\s*hours?/);
      const daysMatch = qLower.match(/(\d+)\s*days?/);
      const hours = hoursMatch ? parseInt(hoursMatch[1], 10) : daysMatch ? parseInt(daysMatch[1], 10) * 24 : 48;
      const windowLabel = formatSignalWindow(hours);
      const scoreMatch = qLower.match(/score.*?(\d+)|virality.*?(\d+)/);
      const minScore = scoreMatch ? parseInt(scoreMatch[1] || scoreMatch[2]) : 50;
      const trendProductName = await findProductNameInQuestion(q);
      const trendCategory = trendProductName ? null : await findCategoryInQuestion(q);

      if (trendProductName) {
        const dataRes = await db.execute(
          `SELECT p.product_name,
                  b.brand_name,
                  p.category,
                  COUNT(DISTINCT sp.post_id) AS mentions,
                  ROUND(AVG(sp.virality_score), 1) AS avg_virality,
                  SUM(sp.views_count) AS total_views,
                  MAX(sp.momentum_flag) AS peak_momentum,
                  MAX(sp.posted_at) AS latest_signal_at
           FROM post_product_mentions ppm
           JOIN social_posts sp ON ppm.post_id = sp.post_id
           JOIN products p ON ppm.product_id = p.product_id
           JOIN brands b ON p.brand_id = b.brand_id
           WHERE UPPER(p.product_name) = UPPER(:productName)
             AND sp.posted_at >= (SELECT MAX(posted_at) FROM social_posts) - NUMTODSINTERVAL(:hours, 'HOUR')
             AND sp.virality_score >= :score
           GROUP BY p.product_name, b.brand_name, p.category`,
          { productName: trendProductName, hours, score: minScore }
        );
        fallbackData = dataRes.rows || [];
        if (fallbackData.length) {
          const row = fallbackData[0];
          fallbackResult = `${row.PRODUCT_NAME} has ${row.MENTIONS} urgent demand signal${row.MENTIONS === 1 ? '' : 's'} in the last ${windowLabel}. ` +
            `Average demand priority is ${row.AVG_VIRALITY}, total reach is ${Number(row.TOTAL_VIEWS || 0).toLocaleString()}, and signal intensity is ${row.PEAK_MOMENTUM}.`;
        } else {
          fallbackResult = `No urgent demand signals found for ${trendProductName} in the last ${windowLabel} at demand priority >= ${minScore}.\n` +
            'That means live channels are not currently showing demand pressure for this product, so do not treat the inventory situation as demand-driven yet.\n' +
            'Recommended action: widen the signal window or compare related category signals before changing allocation.';
        }
        toolsUsed.push({ tool: 'Demand signal detection tool', technicalTool: 'demand_signal_product_sql', params: { productName: trendProductName, hours, minScore }, status: 'success' });
      } else if (trendCategory) {
        const dataRes = await db.execute(
          `SELECT p.product_name,
                  b.brand_name,
                  p.category,
                  COUNT(DISTINCT sp.post_id) AS mentions,
                  ROUND(AVG(sp.virality_score), 1) AS avg_virality,
                  SUM(sp.views_count) AS total_views,
                  MAX(sp.momentum_flag) AS peak_momentum
           FROM post_product_mentions ppm
           JOIN social_posts sp ON ppm.post_id = sp.post_id
           JOIN products p ON ppm.product_id = p.product_id
           JOIN brands b ON p.brand_id = b.brand_id
           WHERE UPPER(p.category) = UPPER(:category)
             AND sp.posted_at >= (SELECT MAX(posted_at) FROM social_posts) - NUMTODSINTERVAL(:hours, 'HOUR')
             AND sp.virality_score >= :score
           GROUP BY p.product_name, b.brand_name, p.category
           ORDER BY avg_virality DESC, total_views DESC
           FETCH FIRST 10 ROWS ONLY`,
          { category: trendCategory, hours, score: minScore }
        );
        fallbackData = dataRes.rows || [];
        fallbackResult = fallbackData.length
          ? `Found ${fallbackData.length} urgent ${trendCategory} demand signals in the last ${windowLabel}:\n${fallbackData.map((row) =>
            `${row.PRODUCT_NAME} (${row.BRAND_NAME}) - ${row.MENTIONS} signals, demand priority ${row.AVG_VIRALITY}, ${Number(row.TOTAL_VIEWS || 0).toLocaleString()} reach, intensity: ${row.PEAK_MOMENTUM}`
          ).join('\n')}`
          : `No urgent demand signals found in ${trendCategory} in the last ${windowLabel} at demand priority >= ${minScore}.`;
        toolsUsed.push({ tool: 'Demand signal detection tool', technicalTool: 'demand_signal_category_sql', params: { category: trendCategory, hours, minScore }, status: 'success' });
      } else {
        const trendRes = await db.execute(
          `SELECT detect_trending_products(:hours, :score) AS result FROM dual`,
          { hours, score: minScore }
        );
        fallbackResult = trendRes.rows[0]?.RESULT || 'No critical sporting goods product signals found';
        toolsUsed.push({ tool: 'Demand signal detection tool', technicalTool: 'detect_trending_products()', params: { hours, minScore }, status: 'success' });

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
           WHERE sp.posted_at >= (SELECT MAX(posted_at) FROM social_posts) - NUMTODSINTERVAL(:hours, 'HOUR')
             AND sp.virality_score >= :score
           GROUP BY p.product_name, b.brand_name, p.category
           ORDER BY avg_virality DESC
           FETCH FIRST 10 ROWS ONLY`,
          { hours, score: minScore }
        );
        fallbackData = dataRes.rows;
      }

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
          toolsUsed.push({ tool: 'Signal source network tool', technicalTool: 'get_influencer_network()', params: { handle }, status: 'success' });
        }
      }

    } else if (intent === 'fulfillment') {
      const productName = await findProductNameInQuestion(q);

      // Check if this is a routing question that mentions a customer or city.
      const cityMatch = q.match(/(?:to|in|near)\s+(?:a\s+(?:customer|customer)\s+in\s+)?([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/);
      const emailMatch = q.match(/[\w.]+@[\w.]+/);

      if (productName && (cityMatch || emailMatch)) {
        // Spatial routing: find best store fulfillment site.
        let customerEmail = emailMatch ? emailMatch[0] : null;

        // If user gave a city name, look up a real customer email in that city.
        if (!customerEmail && cityMatch) {
          const cityName = cityMatch[1];
          try {
            const custRes = await db.execute(
              `SELECT email FROM customers WHERE UPPER(city) = UPPER(:city) FETCH FIRST 1 ROWS ONLY`,
              { city: cityName }
            );
            if (custRes.rows.length > 0) {
              customerEmail = custRes.rows[0].EMAIL;
              toolsUsed.push({ tool: 'Customer location lookup', technicalTool: 'customer_lookup', params: { city: cityName }, status: 'success', email: customerEmail });
            }
          } catch (_) {}
        }

        if (customerEmail) {
          try {
            const routeRes = await db.execute(
              `SELECT find_best_fulfillment(:email, :pname) AS result FROM dual`,
              { email: customerEmail, pname: productName }
            );
            fallbackResult = routeRes.rows[0]?.RESULT || 'No fulfillment route found';
            toolsUsed.push({ tool: 'Fulfillment routing tool', technicalTool: 'find_best_fulfillment()', params: { customer: customerEmail, product: productName }, status: 'success' });

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
                    capacity: r.QUANTITY_ON_HAND,
                    distance: r.DISTANCE_MI,
                  })),
                };
              }
            } catch (geoErr) {
              logOptionalAgentWarning('Route geo data skipped', geoErr);
            }
          } catch (routeErr) {
            const inventoryAnswer = await buildProductInventoryAnswer(productName);
            fallbackResult = inventoryAnswer.text;
            fallbackData = inventoryAnswer.data;
            toolsUsed.push({ tool: 'Product inventory check tool', technicalTool: 'inventory_summary_sql', params: { productName }, status: 'success' });
          }
        } else {
          // City not found: fall back to inventory check.
          const inventoryAnswer = await buildProductInventoryAnswer(productName);
          fallbackResult = inventoryAnswer.text;
          fallbackData = inventoryAnswer.data;
          toolsUsed.push({ tool: 'Product inventory check tool', technicalTool: 'inventory_summary_sql', params: { productName }, status: 'success' });
        }
      } else if (productName) {
        const inventoryAnswer = await buildProductInventoryAnswer(productName);
        fallbackResult = inventoryAnswer.text;
        fallbackData = inventoryAnswer.data;
        toolsUsed.push({ tool: 'Product inventory check tool', technicalTool: 'inventory_summary_sql', params: { productName }, status: 'success' });
      } else if (qLower.includes('low inventory') || qLower.includes('low capacity') || qLower.includes('stockout')) {
        const lowInventoryRes = await db.execute(
          `SELECT p.product_name,
                  b.brand_name,
                  p.category,
                  fc.center_name,
                  fc.city,
                  fc.state_province,
                  i.quantity_on_hand,
                  i.quantity_reserved,
                  i.reorder_point,
                  CASE
                    WHEN i.quantity_on_hand = 0 THEN 'out_of_capacity'
                    WHEN i.quantity_on_hand <= i.reorder_point * 0.5 THEN 'critical'
                    WHEN i.quantity_on_hand <= i.reorder_point THEN 'low'
                    ELSE 'ok'
                  END AS capacity_status
           FROM inventory i
           JOIN products p ON i.product_id = p.product_id
           JOIN brands b ON p.brand_id = b.brand_id
           JOIN fulfillment_centers fc ON i.center_id = fc.center_id
           WHERE fc.is_active = 1
             AND i.quantity_on_hand <= i.reorder_point
           ORDER BY i.quantity_on_hand ASC, i.reorder_point DESC, p.product_name
           FETCH FIRST 10 ROWS ONLY`
        );
        fallbackData = lowInventoryRes.rows || [];
        if (fallbackData.length) {
          fallbackResult = `Top low-inventory products:\n${fallbackData.map((row, index) =>
            `${index + 1}. ${row.PRODUCT_NAME} (${row.BRAND_NAME}, ${row.CATEGORY}) at ${row.CENTER_NAME}, ${row.CITY}: ` +
            `${row.QUANTITY_ON_HAND} on hand, ${row.QUANTITY_RESERVED} reserved, reorder point ${row.REORDER_POINT} [${row.CAPACITY_STATUS}]`
          ).join('\n')}`;
        } else {
          fallbackResult = 'No low-inventory products were found against the current reorder points.';
        }
        toolsUsed.push({ tool: 'Inventory availability query', technicalTool: 'COMMERCE_SQL_TOOL', status: 'success' });
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
        toolsUsed.push({ tool: 'Fulfillment center summary query', technicalTool: 'COMMERCE_SQL_TOOL', status: 'success' });
      }

    } else {
      // customer order and revenue queries.
      const commerceRes = await db.execute(
        `SELECT COUNT(*) AS total_orders,
                COUNT(CASE WHEN social_source_id IS NOT NULL THEN 1 END) AS social_orders,
                ROUND(NVL(SUM(order_total), 0), 2) AS total_revenue,
                ROUND(NVL(SUM(CASE WHEN social_source_id IS NOT NULL THEN order_total ELSE 0 END), 0), 2) AS social_revenue,
                ROUND(NVL(AVG(order_total), 0), 2) AS avg_order_value,
                COUNT(DISTINCT customer_id) AS unique_customers
         FROM orders
         WHERE created_at >= (SELECT MAX(created_at) FROM orders) - INTERVAL '30' DAY`
      );
      const c = commerceRes.rows[0] || {};
      const socialPct = c.TOTAL_ORDERS > 0 ? ((c.SOCIAL_ORDERS / c.TOTAL_ORDERS) * 100).toFixed(1) : '0';

      fallbackResult = `Last 30 days: ${(c.TOTAL_ORDERS || 0).toLocaleString()} orders, $${(c.TOTAL_REVENUE || 0).toLocaleString()} revenue. ` +
        `${socialPct}% signal-driven ($${(c.SOCIAL_REVENUE || 0).toLocaleString()}). ` +
        `Avg transaction: $${c.AVG_ORDER_VALUE || 0}. ${(c.UNIQUE_CUSTOMERS || 0).toLocaleString()} unique customers.`;
      fallbackData = [c];
      toolsUsed.push({ tool: 'Orders and revenue query', technicalTool: 'COMMERCE_SQL_TOOL', status: 'success' });

      // Category breakdown if asked
      if (qLower.includes('category') || qLower.includes('breakdown')) {
        const catRes = await db.execute(
          `SELECT p.category,
                  COUNT(DISTINCT o.order_id) AS orders,
                  ROUND(SUM(oi.quantity * oi.unit_price), 2) AS revenue
           FROM order_items oi
           JOIN orders o ON oi.order_id = o.order_id
           JOIN products p ON oi.product_id = p.product_id
           WHERE o.created_at >= (SELECT MAX(created_at) FROM orders) - INTERVAL '30' DAY
           GROUP BY p.category
           ORDER BY revenue DESC`
        );
        fallbackData = catRes.rows;
        fallbackResult = summarizeCategoryRevenue(catRes.rows);
        toolsUsed.push({ tool: 'Product category revenue query', technicalTool: 'COMMERCE_SQL_TOOL', status: 'success' });
      }
    }
  } catch (toolErr) {
    toolsUsed.push({ tool: 'Direct Oracle tool fallback', status: 'error', reason: toolErr.message });
  }

  // ── Step 5: Log the chat interaction ──
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
  const hasSuccessfulSqlTool = toolsUsed.some((entry) =>
    entry.status === 'success' && !String(entry.tool || '').startsWith('Ollama')
  );
  const responseText = (hasSuccessfulSqlTool && fallbackResult) ? fallbackResult : agentResponse || fallbackResult || 'No results found for your question.';
  const workflow = await buildAgentWorkflow({
    question: q,
    team,
    intent,
    response: responseText,
    data: fallbackData,
  });

  res.json({
    question: q,
    team,
    intent,
    agentUsed,
    runtime: nativeRuntimeFailed ? 'select_ai_agent_fallback' : 'ollama',
    runtimeLabel: nativeRuntimeFailed ? 'Oracle SQL / PL/SQL Tools' : 'Ollama + Oracle SQL',
    provider: nativeRuntimeFailed ? 'Oracle Database' : 'Ollama',
    response: responseText,
    data: fallbackData,
    toolsUsed,
    toolHistory,
    workflow,
    nextActions: workflow.nextActions,
    elapsed,
  });
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
