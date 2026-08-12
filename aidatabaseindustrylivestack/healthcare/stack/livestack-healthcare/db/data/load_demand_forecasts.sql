/*
 * load_demand_forecasts.sql
 * Seed data for DEMAND_FORECASTS table
 *
 * WHY THIS WAS EMPTY:
 * demand_forecasts was defined in 01_tables.sql (schema creation) but no
 * corresponding INSERT script was ever written and it was never included
 * in load_all_data.sql. The table is central to the "Product Demand Forecasting"
 * demo story in the README ("See AI-predicted demand surges before they hit,
 * with explainable reasoning").
 *
 * This script generates 30-day rolling forecasts for critical healthcare operations across
 * major regions. The social_factor column stores AI-detected regulatory and supply
 * signal momentum from the source graph. The explanation column stores
 * JSON-formatted reasoning (as Oracle JSON / CLOB) — the foundation for
 * explainable AI demand predictions.
 *
 * model_version = 'signal_aware_v2' represents Oracle ML pipeline:
 *   Signal-source graph signals -> Vector semantic matching -> Time-series demand
 *
 * Run AFTER: load_products.sql (needs product_id references)
 * Run AFTER: load_social_posts.sql (signal context)
 */

SET SERVEROUTPUT ON
SET DEFINE OFF

PROMPT Loading demand forecasts (30-day rolling window, critical healthcare operations, major regions)...

-- ============================================================
-- Forecasts for critical healthcare operations across major US regions
-- ============================================================

-- Product 1 across regions (high regulatory signal intensity)
INSERT INTO demand_forecasts (product_id, region, forecast_date, predicted_demand, confidence_low, confidence_high, social_factor, model_version, explanation)
SELECT p.product_id, 'Bay Area (SF)', TRUNC(SYSDATE) + LEVEL,
  ROUND(120 + (LEVEL * 8) + DBMS_RANDOM.VALUE(-15, 25)),
  ROUND(105 + (LEVEL * 8) - 20),
  ROUND(135 + (LEVEL * 8) + 30),
  ROUND(1.0 + (LEVEL * 0.04) + DBMS_RANDOM.VALUE(0, 0.3), 2),
  'signal_aware_v2',
  '{"model":"signal_aware_v2","drivers":["gxp_deviation_spike","manufacturer_allocation_notice","temperature_excursion_review"],"top_source":"@gxpdesk","criticality_score":87,"confidence":"high","trend":"accelerating"}'
FROM (SELECT product_id FROM products ORDER BY product_id FETCH FIRST 1 ROW ONLY) p
CONNECT BY LEVEL <= 30;

INSERT INTO demand_forecasts (product_id, region, forecast_date, predicted_demand, confidence_low, confidence_high, social_factor, model_version, explanation)
SELECT p.product_id, 'New York Metro', TRUNC(SYSDATE) + LEVEL,
  ROUND(180 + (LEVEL * 6) + DBMS_RANDOM.VALUE(-20, 30)),
  ROUND(160 + (LEVEL * 6) - 25),
  ROUND(200 + (LEVEL * 6) + 35),
  ROUND(1.2 + (LEVEL * 0.03) + DBMS_RANDOM.VALUE(0, 0.2), 2),
  'signal_aware_v2',
  '{"model":"signal_aware_v2","drivers":["fda_inspection_update","site_allocation_review","enrollment_pull_forward"],"top_source":"@fda_watch","criticality_score":79,"confidence":"high","trend":"rising"}'
FROM (SELECT product_id FROM products ORDER BY product_id FETCH FIRST 1 ROW ONLY) p
CONNECT BY LEVEL <= 30;

INSERT INTO demand_forecasts (product_id, region, forecast_date, predicted_demand, confidence_low, confidence_high, social_factor, model_version, explanation)
SELECT p.product_id, 'Los Angeles Basin', TRUNC(SYSDATE) + LEVEL,
  ROUND(145 + (LEVEL * 5) + DBMS_RANDOM.VALUE(-18, 22)),
  ROUND(125 + (LEVEL * 5) - 20),
  ROUND(165 + (LEVEL * 5) + 28),
  ROUND(1.15 + (LEVEL * 0.025) + DBMS_RANDOM.VALUE(0, 0.25), 2),
  'signal_aware_v2',
  '{"model":"signal_aware_v2","drivers":["ema_variation_notice","care logistics_route_restriction","airport_delay_signal"],"top_source":"@ema_updates","criticality_score":74,"confidence":"medium","trend":"steady_growth"}'
FROM (SELECT product_id FROM products ORDER BY product_id FETCH FIRST 1 ROW ONLY) p
CONNECT BY LEVEL <= 30;

-- Product 2 - care capacity allocation pressure (Seattle + Austin clusters)
INSERT INTO demand_forecasts (product_id, region, forecast_date, predicted_demand, confidence_low, confidence_high, social_factor, model_version, explanation)
SELECT p.product_id, 'Seattle Metro', TRUNC(SYSDATE) + LEVEL,
  ROUND(95 + (LEVEL * 4) + DBMS_RANDOM.VALUE(-10, 15)),
  ROUND(82 + (LEVEL * 4) - 12),
  ROUND(108 + (LEVEL * 4) + 18),
  ROUND(1.3 + (LEVEL * 0.02) + DBMS_RANDOM.VALUE(0, 0.15), 2),
  'signal_aware_v2',
  '{"model":"signal_aware_v2","drivers":["manufacturer_quality_notice","lot_release_update","activated_site_cluster"],"top_source":"@gxpdesk","criticality_score":82,"confidence":"high","trend":"launch_spike"}'
FROM (SELECT product_id FROM products ORDER BY product_id OFFSET 1 ROW FETCH NEXT 1 ROW ONLY) p
CONNECT BY LEVEL <= 30;

INSERT INTO demand_forecasts (product_id, region, forecast_date, predicted_demand, confidence_low, confidence_high, social_factor, model_version, explanation)
SELECT p.product_id, 'Austin Metro', TRUNC(SYSDATE) + LEVEL,
  ROUND(78 + (LEVEL * 3) + DBMS_RANDOM.VALUE(-8, 12)),
  ROUND(67 + (LEVEL * 3) - 10),
  ROUND(90 + (LEVEL * 3) + 15),
  ROUND(1.25 + (LEVEL * 0.015) + DBMS_RANDOM.VALUE(0, 0.18), 2),
  'signal_aware_v2',
  '{"model":"signal_aware_v2","drivers":["port_congestion","cell_therapy_products_cluster","source_feed_spike"],"top_source":"@vaccinewatch","criticality_score":71,"confidence":"medium","trend":"rising"}'
FROM (SELECT product_id FROM products ORDER BY product_id OFFSET 1 ROW FETCH NEXT 1 ROW ONLY) p
CONNECT BY LEVEL <= 30;

-- Product 3 - water-treatment demand (Denver + Atlanta)
INSERT INTO demand_forecasts (product_id, region, forecast_date, predicted_demand, confidence_low, confidence_high, social_factor, model_version, explanation)
SELECT p.product_id, 'Denver Metro', TRUNC(SYSDATE) + LEVEL,
  ROUND(65 + (LEVEL * 2) + DBMS_RANDOM.VALUE(-8, 10)),
  ROUND(55 + (LEVEL * 2) - 10),
  ROUND(75 + (LEVEL * 2) + 12),
  ROUND(1.1 + (LEVEL * 0.01) + DBMS_RANDOM.VALUE(0, 0.12), 2),
  'signal_aware_v2',
  '{"model":"signal_aware_v2","drivers":["diagnostics_demand_bulletin","site_startup_cycle","enrollment_wave_prep"],"top_source":"@waterworks_lab","criticality_score":64,"confidence":"medium","trend":"seasonal_uptick"}'
FROM (SELECT product_id FROM products ORDER BY product_id OFFSET 2 ROW FETCH NEXT 1 ROW ONLY) p
CONNECT BY LEVEL <= 30;

INSERT INTO demand_forecasts (product_id, region, forecast_date, predicted_demand, confidence_low, confidence_high, social_factor, model_version, explanation)
SELECT p.product_id, 'Atlanta Metro', TRUNC(SYSDATE) + LEVEL,
  ROUND(88 + (LEVEL * 3) + DBMS_RANDOM.VALUE(-12, 15)),
  ROUND(74 + (LEVEL * 3) - 14),
  ROUND(102 + (LEVEL * 3) + 18),
  ROUND(1.05 + (LEVEL * 0.012) + DBMS_RANDOM.VALUE(0, 0.14), 2),
  'signal_aware_v2',
  '{"model":"signal_aware_v2","drivers":["cdmo_capacity_notice","manufacturer_allocation","release_testing_window"],"top_source":"@care logistics_ops","criticality_score":68,"confidence":"medium","trend":"growing"}'
FROM (SELECT product_id FROM products ORDER BY product_id OFFSET 2 ROW FETCH NEXT 1 ROW ONLY) p
CONNECT BY LEVEL <= 30;

-- Product 4 - compliance-driven surge (Miami + NYC)
INSERT INTO demand_forecasts (product_id, region, forecast_date, predicted_demand, confidence_low, confidence_high, social_factor, model_version, explanation)
SELECT p.product_id, 'Miami-South Florida', TRUNC(SYSDATE) + LEVEL,
  ROUND(110 + (LEVEL * 7) + DBMS_RANDOM.VALUE(-14, 20)),
  ROUND(94 + (LEVEL * 7) - 18),
  ROUND(126 + (LEVEL * 7) + 25),
  ROUND(1.4 + (LEVEL * 0.05) + DBMS_RANDOM.VALUE(0, 0.35), 2),
  'signal_aware_v2',
  '{"model":"signal_aware_v2","drivers":["gxp_document_cluster","temperature_excursion_warning","protocol_substitution_review"],"top_source":"@gxpdesk","criticality_score":91,"confidence":"very_high","trend":"mega_viral"}'
FROM (SELECT product_id FROM products ORDER BY product_id OFFSET 3 ROW FETCH NEXT 1 ROW ONLY) p
CONNECT BY LEVEL <= 30;

INSERT INTO demand_forecasts (product_id, region, forecast_date, predicted_demand, confidence_low, confidence_high, social_factor, model_version, explanation)
SELECT p.product_id, 'New York Metro', TRUNC(SYSDATE) + LEVEL,
  ROUND(155 + (LEVEL * 9) + DBMS_RANDOM.VALUE(-18, 28)),
  ROUND(135 + (LEVEL * 9) - 22),
  ROUND(175 + (LEVEL * 9) + 34),
  ROUND(1.45 + (LEVEL * 0.06) + DBMS_RANDOM.VALUE(0, 0.4), 2),
  'signal_aware_v2',
  '{"model":"signal_aware_v2","drivers":["fda_labeling_review","regulatory_dossier_update","critical_site_allocation"],"top_source":"@fda_watch","criticality_score":94,"confidence":"very_high","trend":"explosive_growth"}'
FROM (SELECT product_id FROM products ORDER BY product_id OFFSET 3 ROW FETCH NEXT 1 ROW ONLY) p
CONNECT BY LEVEL <= 30;

-- Product 5 - regional supply shift (Pacific Northwest + Mountain West)
INSERT INTO demand_forecasts (product_id, region, forecast_date, predicted_demand, confidence_low, confidence_high, social_factor, model_version, explanation)
SELECT p.product_id, 'Pacific Northwest', TRUNC(SYSDATE) + LEVEL,
  ROUND(72 + (LEVEL * 2) + DBMS_RANDOM.VALUE(-9, 11)),
  ROUND(61 + (LEVEL * 2) - 11),
  ROUND(83 + (LEVEL * 2) + 14),
  ROUND(1.08 + (LEVEL * 0.009) + DBMS_RANDOM.VALUE(0, 0.11), 2),
  'signal_aware_v2',
  '{"model":"signal_aware_v2","drivers":["enrollment_demand_shift","air_cargo_lane_signal","seasonal_trial_supply"],"top_source":"@portsupply","criticality_score":61,"confidence":"medium","trend":"seasonal"}'
FROM (SELECT product_id FROM products ORDER BY product_id OFFSET 4 ROW FETCH NEXT 1 ROW ONLY) p
CONNECT BY LEVEL <= 30;

INSERT INTO demand_forecasts (product_id, region, forecast_date, predicted_demand, confidence_low, confidence_high, social_factor, model_version, explanation)
SELECT p.product_id, 'Mountain West', TRUNC(SYSDATE) + LEVEL,
  ROUND(55 + (LEVEL * 1) + DBMS_RANDOM.VALUE(-7, 9)),
  ROUND(47 + (LEVEL * 1) - 8),
  ROUND(63 + (LEVEL * 1) + 11),
  ROUND(1.05 + (LEVEL * 0.007) + DBMS_RANDOM.VALUE(0, 0.10), 2),
  'signal_aware_v2',
  '{"model":"signal_aware_v2","drivers":["import_inventory_release","manufacturer_eta_update","cold_chain_route_review"],"top_source":"@care logistics_ops","criticality_score":55,"confidence":"low","trend":"flat_seasonal"}'
FROM (SELECT product_id FROM products ORDER BY product_id OFFSET 4 ROW FETCH NEXT 1 ROW ONLY) p
CONNECT BY LEVEL <= 30;

-- Additional cross-region forecast for critical product (product 1 - nationwide surge)
INSERT INTO demand_forecasts (product_id, region, forecast_date, predicted_demand, confidence_low, confidence_high, social_factor, model_version, explanation)
SELECT p.product_id, 'Northeast Corridor', TRUNC(SYSDATE) + LEVEL,
  ROUND(310 + (LEVEL * 12) + DBMS_RANDOM.VALUE(-30, 45)),
  ROUND(275 + (LEVEL * 12) - 38),
  ROUND(345 + (LEVEL * 12) + 55),
  ROUND(1.55 + (LEVEL * 0.07) + DBMS_RANDOM.VALUE(0, 0.45), 2),
  'signal_aware_v2',
  '{"model":"signal_aware_v2","drivers":["multi_source_signal_cluster","regulatory_review","manufacturer_outage","clinical_supply_pull_forward"],"top_source":"@pvwatch_signal","criticality_score":97,"confidence":"very_high","trend":"critical_signal_event","alert":"pre_position_inventory_recommended"}'
FROM (SELECT product_id FROM products ORDER BY product_id FETCH FIRST 1 ROW ONLY) p
CONNECT BY LEVEL <= 30;

COMMIT;

PROMPT Demand forecasts loaded.
SELECT 'demand_forecasts seeded: ' || COUNT(*) || ' rows across ' ||
       COUNT(DISTINCT region) || ' regions for ' ||
       COUNT(DISTINCT product_id) || ' products' AS status
FROM demand_forecasts;
