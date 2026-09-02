/*
 * load_demand_forecasts.sql
 * Seed data for DEMAND_FORECASTS table
 *
 * WHY THIS WAS EMPTY:
 * demand_forecasts was defined in 01_tables.sql (schema creation) but no
 * corresponding INSERT script was ever written and it was never included
 * in load_all_data.sql. The table supports the "Financial Product Risk Forecasting"
 * demo story: see predicted service pressure and compliance exposure before
 * it affects operations, with explainable reasoning.
 *
 * This script generates 30-day rolling forecasts for critical financial products across
 * major regions. The social_factor column stores AI-detected regulatory and market
 * signal severity from the source graph. The explanation column stores
 * JSON-formatted reasoning (as Oracle JSON / CLOB) — the foundation for
 * explainable AI demand predictions.
 *
 * model_version = 'signal_aware_v2' represents Oracle ML pipeline:
 *   Signal-source graph signals -> Vector semantic matching -> Time-series service pressure
 *
 * Run AFTER: load_products.sql (needs product_id references)
 * Run AFTER: load_social_posts.sql (signal context)
 */

SET SERVEROUTPUT ON
SET DEFINE OFF

PROMPT Loading operational risk forecasts (30-day rolling window, critical financial products, major regions)...

-- ============================================================
-- Forecasts for critical financial products across major US regions
-- ============================================================

-- Financial Product 1 across regions (high regulatory signal intensity)
INSERT INTO demand_forecasts (product_id, region, forecast_date, predicted_demand, confidence_low, confidence_high, social_factor, model_version, explanation)
SELECT p.product_id, 'Bay Area (SF)', TRUNC(SYSDATE) + LEVEL,
  ROUND(120 + (LEVEL * 8) + DBMS_RANDOM.VALUE(-15, 25)),
  ROUND(105 + (LEVEL * 8) - 20),
  ROUND(135 + (LEVEL * 8) + 30),
  ROUND(1.0 + (LEVEL * 0.04) + DBMS_RANDOM.VALUE(0, 0.3), 2),
  'signal_aware_v2',
  '{"model":"signal_aware_v2","drivers":["policy_update_spike","institution_allocation_notice","eligibility_review"],"top_source":"Regulatory Intelligence Stream - OCC 01","criticality_score":87,"confidence":"high","trend":"accelerating"}'
FROM (SELECT product_id FROM products ORDER BY product_id FETCH FIRST 1 ROW ONLY) p
CONNECT BY LEVEL <= 30;

INSERT INTO demand_forecasts (product_id, region, forecast_date, predicted_demand, confidence_low, confidence_high, social_factor, model_version, explanation)
SELECT p.product_id, 'New York Metro', TRUNC(SYSDATE) + LEVEL,
  ROUND(180 + (LEVEL * 6) + DBMS_RANDOM.VALUE(-20, 30)),
  ROUND(160 + (LEVEL * 6) - 25),
  ROUND(200 + (LEVEL * 6) + 35),
  ROUND(1.2 + (LEVEL * 0.03) + DBMS_RANDOM.VALUE(0, 0.2), 2),
  'signal_aware_v2',
  '{"model":"signal_aware_v2","drivers":["finra_watchlist_update","client_exposure_review","transaction_volume_shift"],"top_source":"FINRA Monitoring Feed 01","criticality_score":79,"confidence":"high","trend":"elevated_activity"}'
FROM (SELECT product_id FROM products ORDER BY product_id FETCH FIRST 1 ROW ONLY) p
CONNECT BY LEVEL <= 30;

INSERT INTO demand_forecasts (product_id, region, forecast_date, predicted_demand, confidence_low, confidence_high, social_factor, model_version, explanation)
SELECT p.product_id, 'Los Angeles Basin', TRUNC(SYSDATE) + LEVEL,
  ROUND(145 + (LEVEL * 5) + DBMS_RANDOM.VALUE(-18, 22)),
  ROUND(125 + (LEVEL * 5) - 20),
  ROUND(165 + (LEVEL * 5) + 28),
  ROUND(1.15 + (LEVEL * 0.025) + DBMS_RANDOM.VALUE(0, 0.25), 2),
  'signal_aware_v2',
  '{"model":"signal_aware_v2","drivers":["sec_notice","branch_service_constraint","settlement_delay_signal"],"top_source":"Regulatory Intelligence Stream - SEC 01","criticality_score":74,"confidence":"medium","trend":"steady_growth"}'
FROM (SELECT product_id FROM products ORDER BY product_id FETCH FIRST 1 ROW ONLY) p
CONNECT BY LEVEL <= 30;

-- Financial Product 2 - deposit allocation pressure (Seattle + Austin clusters)
INSERT INTO demand_forecasts (product_id, region, forecast_date, predicted_demand, confidence_low, confidence_high, social_factor, model_version, explanation)
SELECT p.product_id, 'Seattle Metro', TRUNC(SYSDATE) + LEVEL,
  ROUND(95 + (LEVEL * 4) + DBMS_RANDOM.VALUE(-10, 15)),
  ROUND(82 + (LEVEL * 4) - 12),
  ROUND(108 + (LEVEL * 4) + 18),
  ROUND(1.3 + (LEVEL * 0.02) + DBMS_RANDOM.VALUE(0, 0.15), 2),
  'signal_aware_v2',
  '{"model":"signal_aware_v2","drivers":["institution_quality_notice","control_review_spike","qualified_client_cluster"],"top_source":"Regulatory Intelligence Stream - OCC 01","criticality_score":82,"confidence":"high","trend":"control_review_spike"}'
FROM (SELECT product_id FROM products ORDER BY product_id OFFSET 1 ROW FETCH NEXT 1 ROW ONLY) p
CONNECT BY LEVEL <= 30;

INSERT INTO demand_forecasts (product_id, region, forecast_date, predicted_demand, confidence_low, confidence_high, social_factor, model_version, explanation)
SELECT p.product_id, 'Austin Metro', TRUNC(SYSDATE) + LEVEL,
  ROUND(78 + (LEVEL * 3) + DBMS_RANDOM.VALUE(-8, 12)),
  ROUND(67 + (LEVEL * 3) - 10),
  ROUND(90 + (LEVEL * 3) + 15),
  ROUND(1.25 + (LEVEL * 0.015) + DBMS_RANDOM.VALUE(0, 0.18), 2),
  'signal_aware_v2',
  '{"model":"signal_aware_v2","drivers":["settlement_backlog","payments_product_cluster","monitoring_feed_spike"],"top_source":"Market Activity Monitor - Payments 01","criticality_score":71,"confidence":"medium","trend":"elevated_activity"}'
FROM (SELECT product_id FROM products ORDER BY product_id OFFSET 1 ROW FETCH NEXT 1 ROW ONLY) p
CONNECT BY LEVEL <= 30;

-- Financial Product 3 - water-treatment demand (Denver + Atlanta)
INSERT INTO demand_forecasts (product_id, region, forecast_date, predicted_demand, confidence_low, confidence_high, social_factor, model_version, explanation)
SELECT p.product_id, 'Denver Metro', TRUNC(SYSDATE) + LEVEL,
  ROUND(65 + (LEVEL * 2) + DBMS_RANDOM.VALUE(-8, 10)),
  ROUND(55 + (LEVEL * 2) - 10),
  ROUND(75 + (LEVEL * 2) + 12),
  ROUND(1.1 + (LEVEL * 0.01) + DBMS_RANDOM.VALUE(0, 0.12), 2),
  'signal_aware_v2',
  '{"model":"signal_aware_v2","drivers":["municipal_finance_bulletin","municipal_bid_cycle","periodic_cash_review"],"top_source":"Treasury Compliance Feed 01","criticality_score":64,"confidence":"medium","trend":"periodic_activity_uptick"}'
FROM (SELECT product_id FROM products ORDER BY product_id OFFSET 2 ROW FETCH NEXT 1 ROW ONLY) p
CONNECT BY LEVEL <= 30;

INSERT INTO demand_forecasts (product_id, region, forecast_date, predicted_demand, confidence_low, confidence_high, social_factor, model_version, explanation)
SELECT p.product_id, 'Atlanta Metro', TRUNC(SYSDATE) + LEVEL,
  ROUND(88 + (LEVEL * 3) + DBMS_RANDOM.VALUE(-12, 15)),
  ROUND(74 + (LEVEL * 3) - 14),
  ROUND(102 + (LEVEL * 3) + 18),
  ROUND(1.05 + (LEVEL * 0.012) + DBMS_RANDOM.VALUE(0, 0.14), 2),
  'signal_aware_v2',
  '{"model":"signal_aware_v2","drivers":["branch_capacity_notice","institution_allocation","maintenance_window"],"top_source":"Client Exposure Engine - Branch 01","criticality_score":68,"confidence":"medium","trend":"growing"}'
FROM (SELECT product_id FROM products ORDER BY product_id OFFSET 2 ROW FETCH NEXT 1 ROW ONLY) p
CONNECT BY LEVEL <= 30;

-- Financial Product 4 - compliance-driven surge (Miami + NYC)
INSERT INTO demand_forecasts (product_id, region, forecast_date, predicted_demand, confidence_low, confidence_high, social_factor, model_version, explanation)
SELECT p.product_id, 'Miami-South Florida', TRUNC(SYSDATE) + LEVEL,
  ROUND(110 + (LEVEL * 7) + DBMS_RANDOM.VALUE(-14, 20)),
  ROUND(94 + (LEVEL * 7) - 18),
  ROUND(126 + (LEVEL * 7) + 25),
  ROUND(1.4 + (LEVEL * 0.05) + DBMS_RANDOM.VALUE(0, 0.35), 2),
  'signal_aware_v2',
  '{"model":"signal_aware_v2","drivers":["policy_update_cluster","eligibility_threshold_warning","client_exposure_review"],"top_source":"Regulatory Intelligence Stream - OCC 01","criticality_score":91,"confidence":"very_high","trend":"critical_escalation"}'
FROM (SELECT product_id FROM products ORDER BY product_id OFFSET 3 ROW FETCH NEXT 1 ROW ONLY) p
CONNECT BY LEVEL <= 30;

INSERT INTO demand_forecasts (product_id, region, forecast_date, predicted_demand, confidence_low, confidence_high, social_factor, model_version, explanation)
SELECT p.product_id, 'New York Metro', TRUNC(SYSDATE) + LEVEL,
  ROUND(155 + (LEVEL * 9) + DBMS_RANDOM.VALUE(-18, 28)),
  ROUND(135 + (LEVEL * 9) - 22),
  ROUND(175 + (LEVEL * 9) + 34),
  ROUND(1.45 + (LEVEL * 0.06) + DBMS_RANDOM.VALUE(0, 0.4), 2),
  'signal_aware_v2',
  '{"model":"signal_aware_v2","drivers":["exposure_restriction_review","compliance_dossier_update","critical_client_exposure"],"top_source":"FINRA Monitoring Feed 01","criticality_score":94,"confidence":"very_high","trend":"rapid_risk_escalation"}'
FROM (SELECT product_id FROM products ORDER BY product_id OFFSET 3 ROW FETCH NEXT 1 ROW ONLY) p
CONNECT BY LEVEL <= 30;

-- Financial Product 5 - regional demand shift (Pacific Northwest + Mountain West)
INSERT INTO demand_forecasts (product_id, region, forecast_date, predicted_demand, confidence_low, confidence_high, social_factor, model_version, explanation)
SELECT p.product_id, 'Pacific Northwest', TRUNC(SYSDATE) + LEVEL,
  ROUND(72 + (LEVEL * 2) + DBMS_RANDOM.VALUE(-9, 11)),
  ROUND(61 + (LEVEL * 2) - 11),
  ROUND(83 + (LEVEL * 2) + 14),
  ROUND(1.08 + (LEVEL * 0.009) + DBMS_RANDOM.VALUE(0, 0.11), 2),
  'signal_aware_v2',
  '{"model":"signal_aware_v2","drivers":["regional_transaction_shift","settlement_lane_signal","periodic_account_activity"],"top_source":"Market Activity Monitor 01","criticality_score":61,"confidence":"medium","trend":"periodic_activity"}'
FROM (SELECT product_id FROM products ORDER BY product_id OFFSET 4 ROW FETCH NEXT 1 ROW ONLY) p
CONNECT BY LEVEL <= 30;

INSERT INTO demand_forecasts (product_id, region, forecast_date, predicted_demand, confidence_low, confidence_high, social_factor, model_version, explanation)
SELECT p.product_id, 'Mountain West', TRUNC(SYSDATE) + LEVEL,
  ROUND(55 + (LEVEL * 1) + DBMS_RANDOM.VALUE(-7, 9)),
  ROUND(47 + (LEVEL * 1) - 8),
  ROUND(63 + (LEVEL * 1) + 11),
  ROUND(1.05 + (LEVEL * 0.007) + DBMS_RANDOM.VALUE(0, 0.10), 2),
  'signal_aware_v2',
  '{"model":"signal_aware_v2","drivers":["liquidity_release","institution_eta_update","settlement_route_review"],"top_source":"Client Exposure Engine - Branch 01","criticality_score":55,"confidence":"low","trend":"stable_periodic_activity"}'
FROM (SELECT product_id FROM products ORDER BY product_id OFFSET 4 ROW FETCH NEXT 1 ROW ONLY) p
CONNECT BY LEVEL <= 30;

-- Additional cross-region forecast for critical financial product (financial product 1 - nationwide surge)
INSERT INTO demand_forecasts (product_id, region, forecast_date, predicted_demand, confidence_low, confidence_high, social_factor, model_version, explanation)
SELECT p.product_id, 'Northeast Corridor', TRUNC(SYSDATE) + LEVEL,
  ROUND(310 + (LEVEL * 12) + DBMS_RANDOM.VALUE(-30, 45)),
  ROUND(275 + (LEVEL * 12) - 38),
  ROUND(345 + (LEVEL * 12) + 55),
  ROUND(1.55 + (LEVEL * 0.07) + DBMS_RANDOM.VALUE(0, 0.45), 2),
  'signal_aware_v2',
  '{"model":"signal_aware_v2","drivers":["multi_source_signal_cluster","regulatory_review","institution_outage","liquidity_scarcity_signal"],"top_source":"Regulatory Intelligence Stream - OCC 01","criticality_score":97,"confidence":"very_high","trend":"critical_signal_event","alert":"pre_position_capacity_recommended"}'
FROM (SELECT product_id FROM products ORDER BY product_id FETCH FIRST 1 ROW ONLY) p
CONNECT BY LEVEL <= 30;

COMMIT;

PROMPT Operational risk forecasts loaded.
SELECT 'operational risk forecasts seeded: ' || COUNT(*) || ' rows across ' ||
       COUNT(DISTINCT region) || ' regions for ' ||
       COUNT(DISTINCT product_id) || ' financial products' AS status
FROM demand_forecasts;
