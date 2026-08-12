/*
 * load_demand_forecasts.sql
 * Seed data for public service demand forecasts
 *
 * WHY THIS WAS EMPTY:
 * demand_forecasts was defined in 01_tables.sql (schema creation) but no
 * corresponding INSERT script was ever written and it was never included
 * in load_all_data.sql. The table is central to the "Demand Forecasting"
 * demo story in the README ("See AI-predicted demand surges before they hit,
 * with explainable reasoning").
 *
 * This script generates 30-day rolling forecasts for high-demand public services across
 * Colorado county and regional service areas. The social_factor column simulates resident/community signal momentum and AI-detected
 * access urgency from the community partner graph. The explanation column stores
 * JSON-formatted reasoning (as Oracle JSON / CLOB) - the foundation for
 * explainable AI demand predictions.
 *
 * model_version = 'resident_signal_v2' represents Oracle ML pipeline:
 *   State and Local Government advocate graph signals -> vector semantic trends -> time-series public service demand
 *
 * Run AFTER: load_products.sql (needs public service product_id references)
 * Run AFTER: load_social_posts.sql (resident/community signal context)
 */

SET SERVEROUTPUT ON
SET DEFINE OFF

PROMPT Loading public service demand forecasts (30-day rolling window, Colorado service areas)...

-- ============================================================
-- Forecasts for high-momentum public services across Colorado service regions
-- ============================================================

-- Public Service service 1 across regions (high community-signal momentum)
INSERT INTO demand_forecasts (product_id, region, forecast_date, predicted_demand, confidence_low, confidence_high, social_factor, model_version, explanation)
SELECT p.product_id, 'Denver County Service Region', TRUNC(SYSDATE) + LEVEL,
  ROUND(120 + (LEVEL * 8) + DBMS_RANDOM.VALUE(-15, 25)),
  ROUND(105 + (LEVEL * 8) - 20),
  ROUND(135 + (LEVEL * 8) + 30),
  ROUND(1.0 + (LEVEL * 0.04) + DBMS_RANDOM.VALUE(0, 0.3), 2),
  'resident_signal_v2',
  '{"model":"resident_signal_v2","drivers":["community_access_spike","navigator_referral_cluster","weekend_case handoff_effect"],"top_advocate":"@civicbridge_hope","urgency_score":87,"confidence":"high","trend":"accelerating"}'
FROM (SELECT product_id FROM products ORDER BY product_id FETCH FIRST 1 ROW ONLY) p
CONNECT BY LEVEL <= 30;

INSERT INTO demand_forecasts (product_id, region, forecast_date, predicted_demand, confidence_low, confidence_high, social_factor, model_version, explanation)
SELECT p.product_id, 'Arapahoe County Service Region', TRUNC(SYSDATE) + LEVEL,
  ROUND(180 + (LEVEL * 6) + DBMS_RANDOM.VALUE(-20, 30)),
  ROUND(160 + (LEVEL * 6) - 25),
  ROUND(200 + (LEVEL * 6) + 35),
  ROUND(1.2 + (LEVEL * 0.03) + DBMS_RANDOM.VALUE(0, 0.2), 2),
  'resident_signal_v2',
  '{"model":"resident_signal_v2","drivers":["senior_services_forum_signal","community_partner","same_day_access_pressure"],"top_advocate":"@navigation_nora","urgency_score":79,"confidence":"high","trend":"rising"}'
FROM (SELECT product_id FROM products ORDER BY product_id FETCH FIRST 1 ROW ONLY) p
CONNECT BY LEVEL <= 30;

INSERT INTO demand_forecasts (product_id, region, forecast_date, predicted_demand, confidence_low, confidence_high, social_factor, model_version, explanation)
SELECT p.product_id, 'Jefferson County Service Region', TRUNC(SYSDATE) + LEVEL,
  ROUND(145 + (LEVEL * 5) + DBMS_RANDOM.VALUE(-18, 22)),
  ROUND(125 + (LEVEL * 5) - 20),
  ROUND(165 + (LEVEL * 5) + 28),
  ROUND(1.15 + (LEVEL * 0.025) + DBMS_RANDOM.VALUE(0, 0.25), 2),
  'resident_signal_v2',
  '{"model":"resident_signal_v2","drivers":["regional_news_mention","resident_education_video","respiratory_season"],"top_advocate":"@service counter_maya","urgency_score":74,"confidence":"medium","trend":"steady_growth"}'
FROM (SELECT product_id FROM products ORDER BY product_id FETCH FIRST 1 ROW ONLY) p
CONNECT BY LEVEL <= 30;

-- Public Service service 2 - remote monitoring and access pathways
INSERT INTO demand_forecasts (product_id, region, forecast_date, predicted_demand, confidence_low, confidence_high, social_factor, model_version, explanation)
SELECT p.product_id, 'Larimer County Service Region', TRUNC(SYSDATE) + LEVEL,
  ROUND(95 + (LEVEL * 4) + DBMS_RANDOM.VALUE(-10, 15)),
  ROUND(82 + (LEVEL * 4) - 12),
  ROUND(108 + (LEVEL * 4) + 18),
  ROUND(1.3 + (LEVEL * 0.02) + DBMS_RANDOM.VALUE(0, 0.15), 2),
  'resident_signal_v2',
  '{"model":"resident_signal_v2","drivers":["provider_adoption_signal","new_public_service_pathway","early_service_counter_cluster"],"top_advocate":"@digital_intake_mark","urgency_score":82,"confidence":"high","trend":"launch_spike"}'
FROM (SELECT product_id FROM products ORDER BY product_id OFFSET 1 ROW FETCH NEXT 1 ROW ONLY) p
CONNECT BY LEVEL <= 30;

INSERT INTO demand_forecasts (product_id, region, forecast_date, predicted_demand, confidence_low, confidence_high, social_factor, model_version, explanation)
SELECT p.product_id, 'El Paso County Service Region', TRUNC(SYSDATE) + LEVEL,
  ROUND(78 + (LEVEL * 3) + DBMS_RANDOM.VALUE(-8, 12)),
  ROUND(67 + (LEVEL * 3) - 10),
  ROUND(90 + (LEVEL * 3) + 15),
  ROUND(1.25 + (LEVEL * 0.015) + DBMS_RANDOM.VALUE(0, 0.18), 2),
  'resident_signal_v2',
  '{"model":"resident_signal_v2","drivers":["regional_provider_roundtable","service_counter_network_adoption","public_service_team_forum_signal"],"top_advocate":"@access_ava","urgency_score":71,"confidence":"medium","trend":"rising"}'
FROM (SELECT product_id FROM products ORDER BY product_id OFFSET 1 ROW FETCH NEXT 1 ROW ONLY) p
CONNECT BY LEVEL <= 30;

-- Public Service service 3 - inspection and recurring public service demand
INSERT INTO demand_forecasts (product_id, region, forecast_date, predicted_demand, confidence_low, confidence_high, social_factor, model_version, explanation)
SELECT p.product_id, 'Mesa County Service Region', TRUNC(SYSDATE) + LEVEL,
  ROUND(65 + (LEVEL * 2) + DBMS_RANDOM.VALUE(-8, 10)),
  ROUND(55 + (LEVEL * 2) - 10),
  ROUND(75 + (LEVEL * 2) + 12),
  ROUND(1.1 + (LEVEL * 0.01) + DBMS_RANDOM.VALUE(0, 0.12), 2),
  'resident_signal_v2',
  '{"model":"resident_signal_v2","drivers":["inspection_referral_cluster","seasonal_service_window","outdoor_public_works_season"],"top_advocate":"@publicworks_reed","urgency_score":64,"confidence":"medium","trend":"seasonal_uptick"}'
FROM (SELECT product_id FROM products ORDER BY product_id OFFSET 2 ROW FETCH NEXT 1 ROW ONLY) p
CONNECT BY LEVEL <= 30;

INSERT INTO demand_forecasts (product_id, region, forecast_date, predicted_demand, confidence_low, confidence_high, social_factor, model_version, explanation)
SELECT p.product_id, 'Pueblo County Service Region', TRUNC(SYSDATE) + LEVEL,
  ROUND(88 + (LEVEL * 3) + DBMS_RANDOM.VALUE(-12, 15)),
  ROUND(74 + (LEVEL * 3) - 14),
  ROUND(102 + (LEVEL * 3) + 18),
  ROUND(1.05 + (LEVEL * 0.012) + DBMS_RANDOM.VALUE(0, 0.14), 2),
  'resident_signal_v2',
  '{"model":"resident_signal_v2","drivers":["community_inspection_backlog","public_works_advocate","spring_service_season"],"top_advocate":"@publicworks_keisha","urgency_score":68,"confidence":"medium","trend":"growing"}'
FROM (SELECT product_id FROM products ORDER BY product_id OFFSET 2 ROW FETCH NEXT 1 ROW ONLY) p
CONNECT BY LEVEL <= 30;

-- Public Service service 4 - preventive and specialty access demand
INSERT INTO demand_forecasts (product_id, region, forecast_date, predicted_demand, confidence_low, confidence_high, social_factor, model_version, explanation)
SELECT p.product_id, 'La Plata County Service Region', TRUNC(SYSDATE) + LEVEL,
  ROUND(110 + (LEVEL * 7) + DBMS_RANDOM.VALUE(-14, 20)),
  ROUND(94 + (LEVEL * 7) - 18),
  ROUND(126 + (LEVEL * 7) + 25),
  ROUND(1.4 + (LEVEL * 0.05) + DBMS_RANDOM.VALUE(0, 0.35), 2),
  'resident_signal_v2',
  '{"model":"resident_signal_v2","drivers":["community_outreach_spike","summer_access_planning","heat_risk_outreach"],"top_advocate":"@senior_sam","urgency_score":91,"confidence":"very_high","trend":"critical_surge"}'
FROM (SELECT product_id FROM products ORDER BY product_id OFFSET 3 ROW FETCH NEXT 1 ROW ONLY) p
CONNECT BY LEVEL <= 30;

INSERT INTO demand_forecasts (product_id, region, forecast_date, predicted_demand, confidence_low, confidence_high, social_factor, model_version, explanation)
SELECT p.product_id, 'Boulder County Service Region', TRUNC(SYSDATE) + LEVEL,
  ROUND(155 + (LEVEL * 9) + DBMS_RANDOM.VALUE(-18, 28)),
  ROUND(135 + (LEVEL * 9) - 22),
  ROUND(175 + (LEVEL * 9) + 34),
  ROUND(1.45 + (LEVEL * 0.06) + DBMS_RANDOM.VALUE(0, 0.4), 2),
  'resident_signal_v2',
  '{"model":"resident_signal_v2","drivers":["specialty_referral_spike","resident_story_feature","high_acuity_navigation_need"],"top_advocate":"@oncoguide_nina","urgency_score":94,"confidence":"very_high","trend":"explosive_growth"}'
FROM (SELECT product_id FROM products ORDER BY product_id OFFSET 3 ROW FETCH NEXT 1 ROW ONLY) p
CONNECT BY LEVEL <= 30;

-- Public Service service 5 - regional home and community public service demand
INSERT INTO demand_forecasts (product_id, region, forecast_date, predicted_demand, confidence_low, confidence_high, social_factor, model_version, explanation)
SELECT p.product_id, 'Northeast Plains Regional Service Area', TRUNC(SYSDATE) + LEVEL,
  ROUND(72 + (LEVEL * 2) + DBMS_RANDOM.VALUE(-9, 11)),
  ROUND(61 + (LEVEL * 2) - 11),
  ROUND(83 + (LEVEL * 2) + 14),
  ROUND(1.08 + (LEVEL * 0.009) + DBMS_RANDOM.VALUE(0, 0.11), 2),
  'resident_signal_v2',
  '{"model":"resident_signal_v2","drivers":["rural_service_signal","community_partner_signal","seasonal_field_visit_need"],"top_advocate":"@community_service_plains","urgency_score":61,"confidence":"medium","trend":"seasonal"}'
FROM (SELECT product_id FROM products ORDER BY product_id OFFSET 4 ROW FETCH NEXT 1 ROW ONLY) p
CONNECT BY LEVEL <= 30;

INSERT INTO demand_forecasts (product_id, region, forecast_date, predicted_demand, confidence_low, confidence_high, social_factor, model_version, explanation)
SELECT p.product_id, 'Southwest Colorado Regional Service Area', TRUNC(SYSDATE) + LEVEL,
  ROUND(55 + (LEVEL * 1) + DBMS_RANDOM.VALUE(-7, 9)),
  ROUND(47 + (LEVEL * 1) - 8),
  ROUND(63 + (LEVEL * 1) + 11),
  ROUND(1.05 + (LEVEL * 0.007) + DBMS_RANDOM.VALUE(0, 0.10), 2),
  'resident_signal_v2',
  '{"model":"resident_signal_v2","drivers":["post_storm_inspection_wave","mobility_access_trend","remote_region_awareness"],"top_advocate":"@rural_access_max","urgency_score":55,"confidence":"low","trend":"flat_seasonal"}'
FROM (SELECT product_id FROM products ORDER BY product_id OFFSET 4 ROW FETCH NEXT 1 ROW ONLY) p
CONNECT BY LEVEL <= 30;

-- Additional statewide forecast for a high-priority Colorado access surge
INSERT INTO demand_forecasts (product_id, region, forecast_date, predicted_demand, confidence_low, confidence_high, social_factor, model_version, explanation)
SELECT p.product_id, 'Summit County Service Region', TRUNC(SYSDATE) + LEVEL,
  ROUND(310 + (LEVEL * 12) + DBMS_RANDOM.VALUE(-30, 45)),
  ROUND(275 + (LEVEL * 12) - 38),
  ROUND(345 + (LEVEL * 12) + 55),
  ROUND(1.55 + (LEVEL * 0.07) + DBMS_RANDOM.VALUE(0, 0.45), 2),
  'resident_signal_v2',
  '{"model":"resident_signal_v2","drivers":["multi_channel_access_spike","local_media_awareness","media_coverage","capacity_scarcity_signal"],"top_advocate":"@public_service_signal_network","urgency_score":97,"confidence":"very_high","trend":"historic_access_surge","alert":"pre_position_capacity_recommended"}'
FROM (SELECT product_id FROM products ORDER BY product_id FETCH FIRST 1 ROW ONLY) p
CONNECT BY LEVEL <= 30;

COMMIT;

PROMPT Demand forecasts loaded.
SELECT 'demand_forecasts seeded: ' || COUNT(*) || ' rows across ' ||
       COUNT(DISTINCT region) || ' regions for ' ||
       COUNT(DISTINCT product_id) || ' public services' AS status
FROM demand_forecasts;
