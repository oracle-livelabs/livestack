'use strict';

const db = require('../config/database');

const TOOL_LABELS = Object.freeze({
  RETAIL_SIGNAL_SQL: 'Oracle demand-signal SQL',
  CREATOR_GRAPH_QUERY: 'Oracle property graph relationship query',
  RETAIL_INVENTORY_SQL: 'Oracle inventory-risk SQL',
  ORACLE_SPATIAL_ROUTE: 'Oracle Spatial exact-distance SQL (SDO_GEOM)',
  RETAIL_COMMERCE_SQL: 'Oracle commerce SQL',
  RETURN_WORKBENCH_SQL: 'Oracle return workbench SQL',
  RETURN_VECTOR_SEARCH: 'Oracle AI Vector Search',
});

function toolEntry(key, status = 'success', details = {}) {
  return { tool_key: key, tool: TOOL_LABELS[key] || key, status, ...details };
}

function stablePart(value) {
  return String(value == null ? 'NA' : value).replace(/[^A-Za-z0-9_.-]/g, '_').slice(0, 100);
}

function source(id, type, title, fields, { scene, entity = {}, score = null, queryTimestamp } = {}) {
  const facts = Object.entries(fields || {})
    .filter(([, value]) => value !== null && value !== undefined && value !== '')
    .map(([key, value]) => `${key.replace(/_/g, ' ')}: ${value}`)
    .join('; ');
  return {
    id: stablePart(id), type, title, excerpt: facts, fields,
    scene, entity, score,
    queryTimestamp: queryTimestamp || new Date().toISOString(),
  };
}

async function resolveProduct(execute, route, question) {
  const requested = route.entities?.productName;
  if (requested) {
    const exact = await execute(`
      SELECT product_id, product_name, category
      FROM products
      WHERE UPPER(product_name) = UPPER(:requested)
      FETCH FIRST 1 ROW ONLY
    `, { requested });
    if (exact.rows?.[0]) return exact.rows[0];
  }
  const products = await execute('SELECT product_id, product_name, category FROM products ORDER BY LENGTH(product_name) DESC');
  const normalized = String(question || '').toLowerCase();
  return (products.rows || []).find((row) => normalized.includes(String(row.PRODUCT_NAME).toLowerCase())) || null;
}

async function demandSignals(execute, route, question) {
  const product = await resolveProduct(execute, route, question);
  const binds = {};
  const productClause = product ? 'AND p.product_id = :productId' : '';
  if (product) binds.productId = product.PRODUCT_ID;
  const result = await execute(`
    SELECT /*+ NO_PARALLEL */ p.product_id, p.product_name, p.category,
           COUNT(DISTINCT sp.post_id) AS signal_count,
           ROUND(AVG(sp.virality_score), 1) AS avg_virality,
           SUM(sp.views_count) AS total_views,
           MAX(sp.momentum_flag) AS peak_momentum
    FROM post_product_mentions ppm
    JOIN social_posts sp ON sp.post_id = ppm.post_id
    JOIN products p ON p.product_id = ppm.product_id
    WHERE CAST(sp.posted_at AS DATE) >= SYSDATE - 2 ${productClause}
    GROUP BY p.product_id, p.product_name, p.category
    ORDER BY avg_virality DESC, total_views DESC
    FETCH FIRST 8 ROWS ONLY
  `, binds);
  const rows = result.rows || [];
  const sources = rows.map((row) => source(
    `DEMAND_PRODUCT_${row.PRODUCT_ID}`, 'sql_row', row.PRODUCT_NAME,
    row, { scene: 'signals', entity: { productId: row.PRODUCT_ID, productName: row.PRODUCT_NAME } }
  ));
  const tools = [toolEntry('RETAIL_SIGNAL_SQL', 'success', { rowCount: rows.length })];

  if (/creator|influencer|network|relationship/i.test(question)) {
    const graphResult = await execute(`
      SELECT from_influencer, to_influencer, connection_type, strength,
             interaction_count, from_handle, to_handle,
             from_platform, to_platform
      FROM GRAPH_TABLE ( influencer_network
        MATCH (src IS influencer) -[edge IS connects_to]-> (dst IS influencer)
        COLUMNS (
          src.influencer_id AS from_influencer,
          dst.influencer_id AS to_influencer,
          edge.connection_type AS connection_type,
          edge.strength AS strength,
          edge.interaction_count AS interaction_count,
          src.handle AS from_handle,
          dst.handle AS to_handle,
          src.platform AS from_platform,
          dst.platform AS to_platform
        )
      )
      ORDER BY strength DESC, interaction_count DESC
      FETCH FIRST 10 ROWS ONLY
    `);
    const graphRows = graphResult.rows || [];
    tools.push(toolEntry('CREATOR_GRAPH_QUERY', 'success', { rowCount: graphRows.length }));
    sources.push(...graphRows.map((row) => source(
      `GRAPH_EDGE_${row.FROM_INFLUENCER}_${row.TO_INFLUENCER}_${row.CONNECTION_TYPE}`,
      'graph_relationship', `${row.FROM_HANDLE} ${row.CONNECTION_TYPE} ${row.TO_HANDLE}`, row,
      { scene: 'graph', entity: { fromInfluencerId: row.FROM_INFLUENCER, toInfluencerId: row.TO_INFLUENCER } }
    )));
    return { data: graphRows, context: { product: product?.PRODUCT_NAME || null, signalRows: rows, graphRows }, sources, tools };
  }
  return { data: rows, context: { product: product?.PRODUCT_NAME || null, signalRows: rows }, sources, tools };
}

function extractCity(question, route) {
  if (route.entities?.city) return route.entities.city;
  return String(question || '').match(/(?:customer\s+in|near|closest\s+to|to)\s+([A-Z][A-Za-z .'-]{1,40})(?:\?|$)/)?.[1]?.trim() || null;
}

async function fulfillment(execute, route, question) {
  const product = await resolveProduct(execute, route, question);
  const binds = {};
  const productClause = product ? 'AND p.product_id = :productId' : '';
  if (product) binds.productId = product.PRODUCT_ID;
  const result = await execute(`
    SELECT p.product_id, p.product_name, fc.center_id, fc.center_name, fc.city, fc.state_province,
           i.quantity_on_hand, i.quantity_reserved, i.reorder_point,
           CASE WHEN i.quantity_on_hand = 0 THEN 'OUT_OF_STOCK'
                WHEN i.quantity_on_hand <= i.reorder_point THEN 'AT_RISK'
                ELSE 'ADEQUATE' END AS inventory_risk
    FROM inventory i
    JOIN products p ON p.product_id = i.product_id
    JOIN fulfillment_centers fc ON fc.center_id = i.center_id
    WHERE fc.is_active = 1 ${productClause}
    ORDER BY CASE WHEN i.quantity_on_hand <= i.reorder_point THEN 0 ELSE 1 END, i.quantity_on_hand ASC
    FETCH FIRST 10 ROWS ONLY
  `, binds);
  const rows = result.rows || [];
  const sources = rows.map((row) => source(
    `INVENTORY_${row.PRODUCT_ID}_${row.CENTER_ID}`, 'sql_row', `${row.PRODUCT_NAME} at ${row.CENTER_NAME}`,
    row, { scene: 'fulfillment', entity: { productId: row.PRODUCT_ID, productName: row.PRODUCT_NAME, centerId: row.CENTER_ID } }
  ));
  const tools = [toolEntry('RETAIL_INVENTORY_SQL', 'success', { rowCount: rows.length })];
  let data = rows;
  let routeMap = null;
  const city = extractCity(question, route);
  if (city && product) {
    const spatial = await execute(`
      SELECT fc.center_id, fc.center_name, fc.city, fc.state_province,
             fc.latitude AS center_lat, fc.longitude AS center_lon,
             c.customer_id, c.latitude AS customer_lat, c.longitude AS customer_lon,
             c.city AS customer_city, c.state_province AS customer_state,
             i.quantity_on_hand,
             ROUND(SDO_GEOM.SDO_DISTANCE(c.location, fc.location, 0.005, 'unit=MILE'), 1) AS distance_mi
      FROM customers c CROSS JOIN fulfillment_centers fc
      JOIN inventory i ON i.center_id = fc.center_id
      WHERE UPPER(c.city) = UPPER(:city) AND i.product_id = :productId
        AND i.quantity_on_hand > i.quantity_reserved AND fc.is_active = 1
      ORDER BY SDO_GEOM.SDO_DISTANCE(c.location, fc.location, 0.005, 'unit=MILE')
      FETCH FIRST 5 ROWS ONLY
    `, { city, productId: product.PRODUCT_ID });
    const spatialRows = spatial.rows || [];
    if (spatialRows.length) {
      routeMap = {
        type: 'route', product: product.PRODUCT_NAME,
        customer: { city: spatialRows[0].CUSTOMER_CITY, state: spatialRows[0].CUSTOMER_STATE, lat: spatialRows[0].CUSTOMER_LAT, lon: spatialRows[0].CUSTOMER_LON },
        centers: spatialRows.map((row) => ({ name: row.CENTER_NAME, city: row.CITY, state: row.STATE_PROVINCE, lat: row.CENTER_LAT, lon: row.CENTER_LON, stock: row.QUANTITY_ON_HAND, distance: row.DISTANCE_MI })),
      };
      data = routeMap;
      sources.push(...spatialRows.map((row) => source(
        `SPATIAL_${row.CUSTOMER_ID}_${row.CENTER_ID}_${product.PRODUCT_ID}`, 'spatial_result', `${row.CENTER_NAME} route`,
        row, { scene: 'fulfillment', entity: { customerId: row.CUSTOMER_ID, centerId: row.CENTER_ID, productId: product.PRODUCT_ID } }
      )));
    }
    tools.push(toolEntry('ORACLE_SPATIAL_ROUTE', spatialRows.length ? 'success' : 'empty', { rowCount: spatialRows.length, params: { city, product: product.PRODUCT_NAME } }));
  }
  const riskStates = new Set(rows.map((row) => row.INVENTORY_RISK));
  const contradictions = riskStates.has('AT_RISK') && riskStates.has('ADEQUATE')
    ? ['Inventory condition differs by fulfillment center; do not generalize one center’s risk to the full network.'] : [];
  return { data, context: { product: product?.PRODUCT_NAME || null, inventoryRows: rows, route: routeMap }, sources, tools, contradictions };
}

async function commerce(execute, route, question) {
  const summary = await execute(`SELECT COUNT(*) AS total_orders, ROUND(NVL(SUM(order_total), 0), 2) AS total_revenue,
      ROUND(NVL(AVG(order_total), 0), 2) AS avg_order_value, COUNT(DISTINCT customer_id) AS unique_customers,
      COUNT(CASE WHEN social_source_id IS NOT NULL THEN 1 END) AS signal_driven_orders
      FROM orders WHERE CAST(created_at AS DATE) >= SYSDATE - 30`);
  const categories = await execute(`SELECT p.category, COUNT(DISTINCT o.order_id) AS orders, ROUND(SUM(oi.line_total), 2) AS revenue
      FROM order_items oi JOIN orders o ON o.order_id = oi.order_id JOIN products p ON p.product_id = oi.product_id
      WHERE CAST(o.created_at AS DATE) >= SYSDATE - 30 GROUP BY p.category ORDER BY revenue DESC FETCH FIRST 8 ROWS ONLY`);
  const showCategories = /category|breakdown/i.test(question);
  const rows = showCategories ? categories.rows || [] : summary.rows || [];
  const sources = rows.map((row, index) => source(
    showCategories ? `COMMERCE_CATEGORY_${row.CATEGORY}` : `COMMERCE_SUMMARY_30D_${index + 1}`,
    'sql_row', showCategories ? `${row.CATEGORY} commerce` : '30-day commerce summary', row,
    { scene: 'orders', entity: showCategories ? { category: row.CATEGORY } : {} }
  ));
  return { data: rows, context: { windowDays: 30, summary: summary.rows?.[0] || {}, categories: categories.rows || [] }, sources, tools: [toolEntry('RETAIL_COMMERCE_SQL', 'success', { rowCount: rows.length })] };
}

async function returns(execute, route, question) {
  const returnId = route.entities?.returnId || null;
  const generationResult = await execute(`SELECT active_generation_id FROM app_dataset_state WHERE state_id = 1`);
  const generationId = generationResult.rows?.[0]?.ACTIVE_GENERATION_ID;
  const binds = { returnId, question, generationId };
  const cases = await execute(`SELECT return_id, product_name, customer_name, return_reason, return_value,
      risk_rating, recommendation, status, policy_clause, evidence_count
      FROM retail_return_workbench_v WHERE (:returnId IS NULL OR return_id = :returnId)
      ORDER BY CASE UPPER(risk_rating) WHEN 'VERY HIGH' THEN 1 WHEN 'HIGH' THEN 2 ELSE 3 END, requested_at DESC
      FETCH FIRST 6 ROWS ONLY`, { returnId });
  const evidence = await execute(`SELECT /*+ VECTOR_INDEX_TRANSFORM(return_evidence_index IDX_RETURN_EVIDENCE_VEC POST_FILTER_WITHOUT_JOIN_BACK) */
      return_id, source_type, source_id, title,
      DBMS_LOB.SUBSTR(evidence_text, 600, 1) AS evidence_text,
      ROUND(1 - VECTOR_DISTANCE(embedding, VECTOR_EMBEDDING(ALL_MINILM_L12_V2 USING :question AS DATA), COSINE), 4) AS semantic_score,
      generation_id FROM return_evidence_index
      WHERE embedding IS NOT NULL
        AND generation_id = :generationId
        AND (:returnId IS NULL OR return_id = :returnId)
      ORDER BY VECTOR_DISTANCE(embedding, VECTOR_EMBEDDING(ALL_MINILM_L12_V2 USING :question AS DATA), COSINE)
      FETCH APPROXIMATE FIRST 8 ROWS ONLY`, binds);
  const caseRows = cases.rows || [];
  const evidenceRows = evidence.rows || [];
  const sources = [
    ...caseRows.map((row) => source(`RETURN_CASE_${row.RETURN_ID}`, 'sql_row', `Return RET-${String(row.RETURN_ID).padStart(4, '0')}`, row, { scene: 'returns', entity: { returnId: row.RETURN_ID, productName: row.PRODUCT_NAME } })),
    ...evidenceRows.map((row) => source(`RETURN_EVIDENCE_${row.GENERATION_ID}_${row.SOURCE_TYPE}_${row.SOURCE_ID}`, 'vector_result', row.TITLE || row.SOURCE_TYPE, {
      return_id: row.RETURN_ID, source_type: row.SOURCE_TYPE, source_id: row.SOURCE_ID,
      evidence_text: row.EVIDENCE_TEXT, semantic_score: row.SEMANTIC_SCORE, generation_id: row.GENERATION_ID,
    }, { scene: 'returns', entity: { returnId: row.RETURN_ID }, score: row.SEMANTIC_SCORE })),
  ];
  const contradictions = caseRows.filter((row) => /high/i.test(String(row.RISK_RATING)) && /approve/i.test(String(row.RECOMMENDATION)))
    .map((row) => `Return ${row.RETURN_ID} combines ${row.RISK_RATING} risk with recommendation ${row.RECOMMENDATION}; an Admin should review the underlying evidence.`);
  return {
    data: evidenceRows, context: { highRiskCases: caseRows, vectorEvidence: evidenceRows }, sources, contradictions,
    tools: [toolEntry('RETURN_WORKBENCH_SQL', 'success', { rowCount: caseRows.length }), toolEntry('RETURN_VECTOR_SEARCH', 'success', { rowCount: evidenceRows.length, model: 'ALL_MINILM_L12_V2', dimensions: 384, distance: 'COSINE' })],
  };
}

const RUNNERS = Object.freeze({
  DEMAND_SIGNAL_AGENT: demandSignals,
  FULFILLMENT_OPTIMIZATION_AGENT: fulfillment,
  COMMERCE_INTELLIGENCE_AGENT: commerce,
  RETURNS_TRIAGE_AGENT: returns,
});

async function runAgentTools(route, question, { username } = {}) {
  const runner = RUNNERS[route.team];
  if (!runner) throw new Error('No allowlisted tool runner exists for the routed specialist.');
  const startedAt = Date.now();
  const result = await db.withUserConnection(
    username,
    async ({ execute }) => runner(execute, route, question),
    { readOnly: true }
  );
  return {
    ...result,
    contradictions: result.contradictions || [],
    insufficientEvidence: !(result.sources || []).length,
    toolLatencyMs: Date.now() - startedAt,
  };
}

module.exports = { TOOL_LABELS, runAgentTools, toolEntry };
