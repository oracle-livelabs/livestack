/*
 * load_demand_forecasts.sql
 * Seed data for Energy & Utilities demand, production, compliance, and capacity forecasts
 *
 * WHY THIS WAS EMPTY:
 * demand_forecasts was defined in 01_tables.sql (schema creation) but no
 * corresponding INSERT script was ever written and it was never included
 * in load_all_data.sql. The table is central to the "Asset Risk & Capacity
 * Analytics" demo story across electric, gas, water/wastewater, upstream,
 * midstream, downstream, customer operations, HSE, and emissions workflows.
 *
 * This script generates 30-day rolling forecasts for high-demand services,
 * production risk, compliance thresholds, and operating capacity across major regions.
 * The social_factor column simulates customer/community/operational signal momentum.
 * The explanation column stores
 * JSON-formatted reasoning (as Oracle JSON / CLOB) — the foundation for
 * explainable AI demand predictions.
 *
 * model_version = 'energy_utilities_signal_v3' represents Oracle ML pipeline:
 *   signal sources -> vector semantic trends -> time-series operating demand and risk
 *
 * Run AFTER: load_products.sql (needs service and asset product_id references)
 * Run AFTER: load_social_posts.sql (customer/community signal context)
 */

SET SERVEROUTPUT ON
SET DEFINE OFF

PROMPT Loading Energy & Utilities forecasts (30-day rolling window, high-demand services and operating risks)...

-- ============================================================
-- Forecasts for high-momentum electric utility services across major US regions
-- ============================================================

-- Grid service 1 across regions (high community-signal momentum)
INSERT INTO demand_forecasts (product_id, region, forecast_date, predicted_demand, confidence_low, confidence_high, social_factor, model_version, explanation)
SELECT p.product_id, 'Bay Area (SF)', TRUNC(SYSDATE) + LEVEL,
  ROUND(120 + (LEVEL * 8) + DBMS_RANDOM.VALUE(-15, 25)),
  ROUND(105 + (LEVEL * 8) - 20),
  ROUND(135 + (LEVEL * 8) + 30),
  ROUND(1.0 + (LEVEL * 0.04) + DBMS_RANDOM.VALUE(0, 0.3), 2),
  'grid_signal_v2',
  '{"model":"grid_signal_v2","drivers":["outage_report_spike","dispatch_ticket_cluster","weekend_storm_effect"],"top_advocate":"@gridbridge_ops","urgency_score":87,"confidence":"high","trend":"accelerating"}'
FROM (SELECT product_id FROM products ORDER BY product_id FETCH FIRST 1 ROW ONLY) p
CONNECT BY LEVEL <= 30;

INSERT INTO demand_forecasts (product_id, region, forecast_date, predicted_demand, confidence_low, confidence_high, social_factor, model_version, explanation)
SELECT p.product_id, 'New York Metro', TRUNC(SYSDATE) + LEVEL,
  ROUND(180 + (LEVEL * 6) + DBMS_RANDOM.VALUE(-20, 30)),
  ROUND(160 + (LEVEL * 6) - 25),
  ROUND(200 + (LEVEL * 6) + 35),
  ROUND(1.2 + (LEVEL * 0.03) + DBMS_RANDOM.VALUE(0, 0.2), 2),
  'grid_signal_v2',
  '{"model":"grid_signal_v2","drivers":["critical_load_forum_signal","customer_operations_thread","same_day_restoration_pressure"],"top_advocate":"@navigation_nora","urgency_score":79,"confidence":"high","trend":"rising"}'
FROM (SELECT product_id FROM products ORDER BY product_id FETCH FIRST 1 ROW ONLY) p
CONNECT BY LEVEL <= 30;

INSERT INTO demand_forecasts (product_id, region, forecast_date, predicted_demand, confidence_low, confidence_high, social_factor, model_version, explanation)
SELECT p.product_id, 'Los Angeles Basin', TRUNC(SYSDATE) + LEVEL,
  ROUND(145 + (LEVEL * 5) + DBMS_RANDOM.VALUE(-18, 22)),
  ROUND(125 + (LEVEL * 5) - 20),
  ROUND(165 + (LEVEL * 5) + 28),
  ROUND(1.15 + (LEVEL * 0.025) + DBMS_RANDOM.VALUE(0, 0.25), 2),
  'grid_signal_v2',
  '{"model":"grid_signal_v2","drivers":["regional_weather_mention","customer_outage_video","storm_season"],"top_advocate":"@controlroom_maya","urgency_score":74,"confidence":"medium","trend":"steady_growth"}'
FROM (SELECT product_id FROM products ORDER BY product_id FETCH FIRST 1 ROW ONLY) p
CONNECT BY LEVEL <= 30;

-- Electric service 2 - remote monitoring and field access pathways
INSERT INTO demand_forecasts (product_id, region, forecast_date, predicted_demand, confidence_low, confidence_high, social_factor, model_version, explanation)
SELECT p.product_id, 'Seattle Metro', TRUNC(SYSDATE) + LEVEL,
  ROUND(95 + (LEVEL * 4) + DBMS_RANDOM.VALUE(-10, 15)),
  ROUND(82 + (LEVEL * 4) - 12),
  ROUND(108 + (LEVEL * 4) + 18),
  ROUND(1.3 + (LEVEL * 0.02) + DBMS_RANDOM.VALUE(0, 0.15), 2),
  'grid_signal_v2',
  '{"model":"grid_signal_v2","drivers":["crew_adoption_signal","new_restoration_pathway","early_outage_cluster"],"top_advocate":"@gridops_mark","urgency_score":82,"confidence":"high","trend":"launch_spike"}'
FROM (SELECT product_id FROM products ORDER BY product_id OFFSET 1 ROW FETCH NEXT 1 ROW ONLY) p
CONNECT BY LEVEL <= 30;

INSERT INTO demand_forecasts (product_id, region, forecast_date, predicted_demand, confidence_low, confidence_high, social_factor, model_version, explanation)
SELECT p.product_id, 'Austin Metro', TRUNC(SYSDATE) + LEVEL,
  ROUND(78 + (LEVEL * 3) + DBMS_RANDOM.VALUE(-8, 12)),
  ROUND(67 + (LEVEL * 3) - 10),
  ROUND(90 + (LEVEL * 3) + 15),
  ROUND(1.25 + (LEVEL * 0.015) + DBMS_RANDOM.VALUE(0, 0.18), 2),
  'grid_signal_v2',
  '{"model":"grid_signal_v2","drivers":["regional_utility_roundtable","depot_network_adoption","field_team_forum_signal"],"top_advocate":"@access_ava","urgency_score":71,"confidence":"medium","trend":"rising"}'
FROM (SELECT product_id FROM products ORDER BY product_id OFFSET 1 ROW FETCH NEXT 1 ROW ONLY) p
CONNECT BY LEVEL <= 30;

-- Electric service 3 - field access recovery and chronic service demand
INSERT INTO demand_forecasts (product_id, region, forecast_date, predicted_demand, confidence_low, confidence_high, social_factor, model_version, explanation)
SELECT p.product_id, 'Denver Metro', TRUNC(SYSDATE) + LEVEL,
  ROUND(65 + (LEVEL * 2) + DBMS_RANDOM.VALUE(-8, 10)),
  ROUND(55 + (LEVEL * 2) - 10),
  ROUND(75 + (LEVEL * 2) + 12),
  ROUND(1.1 + (LEVEL * 0.01) + DBMS_RANDOM.VALUE(0, 0.12), 2),
  'grid_signal_v2',
  '{"model":"grid_signal_v2","drivers":["field_access_constraint_cluster","seasonal_reliability_effect","outdoor_work_season_start"],"top_advocate":"@field_access_reed","urgency_score":64,"confidence":"medium","trend":"seasonal_uptick"}'
FROM (SELECT product_id FROM products ORDER BY product_id OFFSET 2 ROW FETCH NEXT 1 ROW ONLY) p
CONNECT BY LEVEL <= 30;

INSERT INTO demand_forecasts (product_id, region, forecast_date, predicted_demand, confidence_low, confidence_high, social_factor, model_version, explanation)
SELECT p.product_id, 'Atlanta Metro', TRUNC(SYSDATE) + LEVEL,
  ROUND(88 + (LEVEL * 3) + DBMS_RANDOM.VALUE(-12, 15)),
  ROUND(74 + (LEVEL * 3) - 14),
  ROUND(102 + (LEVEL * 3) + 18),
  ROUND(1.05 + (LEVEL * 0.012) + DBMS_RANDOM.VALUE(0, 0.14), 2),
  'grid_signal_v2',
  '{"model":"grid_signal_v2","drivers":["feeder_access_constraint","field_crew_dispatch_signal","storm_season"],"top_advocate":"@stormresponse_keisha","urgency_score":68,"confidence":"medium","trend":"growing"}'
FROM (SELECT product_id FROM products ORDER BY product_id OFFSET 2 ROW FETCH NEXT 1 ROW ONLY) p
CONNECT BY LEVEL <= 30;

-- Electric service 4 - vegetation and field access demand
INSERT INTO demand_forecasts (product_id, region, forecast_date, predicted_demand, confidence_low, confidence_high, social_factor, model_version, explanation)
SELECT p.product_id, 'Miami-South Florida', TRUNC(SYSDATE) + LEVEL,
  ROUND(110 + (LEVEL * 7) + DBMS_RANDOM.VALUE(-14, 20)),
  ROUND(94 + (LEVEL * 7) - 18),
  ROUND(126 + (LEVEL * 7) + 25),
  ROUND(1.4 + (LEVEL * 0.05) + DBMS_RANDOM.VALUE(0, 0.35), 2),
  'grid_signal_v2',
  '{"model":"grid_signal_v2","drivers":["community_outreach_spike","summer_access_planning","heat_risk_outreach"],"top_advocate":"@senior_sam","urgency_score":91,"confidence":"very_high","trend":"critical_surge"}'
FROM (SELECT product_id FROM products ORDER BY product_id OFFSET 3 ROW FETCH NEXT 1 ROW ONLY) p
CONNECT BY LEVEL <= 30;

INSERT INTO demand_forecasts (product_id, region, forecast_date, predicted_demand, confidence_low, confidence_high, social_factor, model_version, explanation)
SELECT p.product_id, 'New York Metro', TRUNC(SYSDATE) + LEVEL,
  ROUND(155 + (LEVEL * 9) + DBMS_RANDOM.VALUE(-18, 28)),
  ROUND(135 + (LEVEL * 9) - 22),
  ROUND(175 + (LEVEL * 9) + 34),
  ROUND(1.45 + (LEVEL * 0.06) + DBMS_RANDOM.VALUE(0, 0.4), 2),
  'grid_signal_v2',
  '{"model":"grid_signal_v2","drivers":["critical_load_request_spike","customer_story_feature","restoration_priority_need"],"top_advocate":"@grid_planner_nina","urgency_score":94,"confidence":"very_high","trend":"explosive_growth"}'
FROM (SELECT product_id FROM products ORDER BY product_id OFFSET 3 ROW FETCH NEXT 1 ROW ONLY) p
CONNECT BY LEVEL <= 30;

-- Electric service 5 - regional home and community energy demand
INSERT INTO demand_forecasts (product_id, region, forecast_date, predicted_demand, confidence_low, confidence_high, social_factor, model_version, explanation)
SELECT p.product_id, 'Pacific Northwest', TRUNC(SYSDATE) + LEVEL,
  ROUND(72 + (LEVEL * 2) + DBMS_RANDOM.VALUE(-9, 11)),
  ROUND(61 + (LEVEL * 2) - 11),
  ROUND(83 + (LEVEL * 2) + 14),
  ROUND(1.08 + (LEVEL * 0.009) + DBMS_RANDOM.VALUE(0, 0.11), 2),
  'grid_signal_v2',
  '{"model":"grid_signal_v2","drivers":["rural_restoration_signal","customer_notification_signal","seasonal_field_visit_need"],"top_advocate":"@community_grid_pnw","urgency_score":61,"confidence":"medium","trend":"seasonal"}'
FROM (SELECT product_id FROM products ORDER BY product_id OFFSET 4 ROW FETCH NEXT 1 ROW ONLY) p
CONNECT BY LEVEL <= 30;

INSERT INTO demand_forecasts (product_id, region, forecast_date, predicted_demand, confidence_low, confidence_high, social_factor, model_version, explanation)
SELECT p.product_id, 'Mountain West', TRUNC(SYSDATE) + LEVEL,
  ROUND(55 + (LEVEL * 1) + DBMS_RANDOM.VALUE(-7, 9)),
  ROUND(47 + (LEVEL * 1) - 8),
  ROUND(63 + (LEVEL * 1) + 11),
  ROUND(1.05 + (LEVEL * 0.007) + DBMS_RANDOM.VALUE(0, 0.10), 2),
  'grid_signal_v2',
  '{"model":"grid_signal_v2","drivers":["remote_outage_recovery_wave","field_access_recovery_trend","remote_region_awareness"],"top_advocate":"@rural_access_max","urgency_score":55,"confidence":"low","trend":"flat_seasonal"}'
FROM (SELECT product_id FROM products ORDER BY product_id OFFSET 4 ROW FETCH NEXT 1 ROW ONLY) p
CONNECT BY LEVEL <= 30;

-- Additional cross-region forecast for a nationwide service surge
INSERT INTO demand_forecasts (product_id, region, forecast_date, predicted_demand, confidence_low, confidence_high, social_factor, model_version, explanation)
SELECT p.product_id, 'Northeast Corridor', TRUNC(SYSDATE) + LEVEL,
  ROUND(310 + (LEVEL * 12) + DBMS_RANDOM.VALUE(-30, 45)),
  ROUND(275 + (LEVEL * 12) - 38),
  ROUND(345 + (LEVEL * 12) + 55),
  ROUND(1.55 + (LEVEL * 0.07) + DBMS_RANDOM.VALUE(0, 0.45), 2),
  'grid_signal_v2',
  '{"model":"grid_signal_v2","drivers":["multi_channel_access_spike","local_media_awareness","media_coverage","capacity_scarcity_signal"],"top_advocate":"@grid_signal_network","urgency_score":97,"confidence":"very_high","trend":"historic_access_surge","alert":"pre_position_capacity_recommended"}'
FROM (SELECT product_id FROM products ORDER BY product_id FETCH FIRST 1 ROW ONLY) p
CONNECT BY LEVEL <= 30;

-- Cross-sector gas utility pressure and leak-response forecast
INSERT INTO demand_forecasts (product_id, region, forecast_date, predicted_demand, confidence_low, confidence_high, social_factor, model_version, explanation)
SELECT p.product_id, 'Houston Gas Network', TRUNC(SYSDATE) + LEVEL,
  ROUND(85 + (LEVEL * 4) + DBMS_RANDOM.VALUE(-10, 18)),
  ROUND(72 + (LEVEL * 4) - 10),
  ROUND(98 + (LEVEL * 4) + 20),
  ROUND(1.22 + (LEVEL * 0.025) + DBMS_RANDOM.VALUE(0, 0.18), 2),
  'energy_utilities_signal_v3',
  '{"model":"energy_utilities_signal_v3","subsector":"Gas Utility","drivers":["pressure_variance_cluster","gas_odor_call_volume","corrosion_inspection_backlog"],"reference_id":"GLK-2208","urgency_score":88,"confidence":"high","trend":"rising","alert":"leak_response_sla_watch"}'
FROM (SELECT product_id FROM products WHERE category = 'Gas Utility' ORDER BY product_id FETCH FIRST 1 ROW ONLY) p
CONNECT BY LEVEL <= 30;

-- Cross-sector water/wastewater compliance and pressure forecast
INSERT INTO demand_forecasts (product_id, region, forecast_date, predicted_demand, confidence_low, confidence_high, social_factor, model_version, explanation)
SELECT p.product_id, 'Pacific Northwest Water Network', TRUNC(SYSDATE) + LEVEL,
  ROUND(70 + (LEVEL * 3) + DBMS_RANDOM.VALUE(-8, 16)),
  ROUND(60 + (LEVEL * 3) - 9),
  ROUND(82 + (LEVEL * 3) + 18),
  ROUND(1.18 + (LEVEL * 0.02) + DBMS_RANDOM.VALUE(0, 0.16), 2),
  'energy_utilities_signal_v3',
  '{"model":"energy_utilities_signal_v3","subsector":"Water/Wastewater Utility","drivers":["water_pressure_anomaly","main_break_repeat_events","wastewater_discharge_threshold"],"reference_id":"WWC-9031","urgency_score":84,"confidence":"high","trend":"compliance_watch","alert":"regulatory_follow_up_required"}'
FROM (SELECT product_id FROM products WHERE category = 'Water/Wastewater Utility' ORDER BY product_id FETCH FIRST 1 ROW ONLY) p
CONNECT BY LEVEL <= 30;

-- Upstream well production variance forecast
INSERT INTO demand_forecasts (product_id, region, forecast_date, predicted_demand, confidence_low, confidence_high, social_factor, model_version, explanation)
SELECT p.product_id, 'Permian Basin', TRUNC(SYSDATE) + LEVEL,
  ROUND(58 + (LEVEL * 2) + DBMS_RANDOM.VALUE(-7, 12)),
  ROUND(49 + (LEVEL * 2) - 8),
  ROUND(67 + (LEVEL * 2) + 14),
  ROUND(1.12 + (LEVEL * 0.018) + DBMS_RANDOM.VALUE(0, 0.14), 2),
  'energy_utilities_signal_v3',
  '{"model":"energy_utilities_signal_v3","subsector":"Oil & Gas Upstream","drivers":["well_production_variance","artificial_lift_vibration","produced_water_constraint"],"reference_id":"WELL-NB-014","urgency_score":81,"confidence":"medium","trend":"production_variance"}'
FROM (SELECT product_id FROM products WHERE category = 'Oil & Gas Upstream' ORDER BY product_id FETCH FIRST 1 ROW ONLY) p
CONNECT BY LEVEL <= 30;

-- Midstream pipeline/LNG logistics forecast
INSERT INTO demand_forecasts (product_id, region, forecast_date, predicted_demand, confidence_low, confidence_high, social_factor, model_version, explanation)
SELECT p.product_id, 'Gulf Coast Midstream', TRUNC(SYSDATE) + LEVEL,
  ROUND(62 + (LEVEL * 3) + DBMS_RANDOM.VALUE(-8, 15)),
  ROUND(52 + (LEVEL * 3) - 8),
  ROUND(74 + (LEVEL * 3) + 16),
  ROUND(1.2 + (LEVEL * 0.019) + DBMS_RANDOM.VALUE(0, 0.17), 2),
  'energy_utilities_signal_v3',
  '{"model":"energy_utilities_signal_v3","subsector":"Oil & Gas Midstream","drivers":["pipeline_pressure_anomaly","compressor_vibration","lng_cargo_delay","storage_nomination_risk"],"reference_id":"LNG-7842","urgency_score":79,"confidence":"medium","trend":"capacity_watch"}'
FROM (SELECT product_id FROM products WHERE category = 'Oil & Gas Midstream' ORDER BY product_id FETCH FIRST 1 ROW ONLY) p
CONNECT BY LEVEL <= 30;

-- Downstream refinery and terminal capacity forecast
INSERT INTO demand_forecasts (product_id, region, forecast_date, predicted_demand, confidence_low, confidence_high, social_factor, model_version, explanation)
SELECT p.product_id, 'Corpus Christi Downstream', TRUNC(SYSDATE) + LEVEL,
  ROUND(74 + (LEVEL * 4) + DBMS_RANDOM.VALUE(-9, 17)),
  ROUND(62 + (LEVEL * 4) - 10),
  ROUND(88 + (LEVEL * 4) + 20),
  ROUND(1.28 + (LEVEL * 0.021) + DBMS_RANDOM.VALUE(0, 0.18), 2),
  'energy_utilities_signal_v3',
  '{"model":"energy_utilities_signal_v3","subsector":"Oil & Gas Downstream","drivers":["refinery_unit_constraint","turnaround_readiness","product_movement_schedule","emissions_excursion"],"reference_id":"RFY-HCU-02","urgency_score":90,"confidence":"high","trend":"throughput_constraint"}'
FROM (SELECT product_id FROM products WHERE category = 'Oil & Gas Downstream' ORDER BY product_id FETCH FIRST 1 ROW ONLY) p
CONNECT BY LEVEL <= 30;

-- HSE, emissions, and regulatory reporting forecast
INSERT INTO demand_forecasts (product_id, region, forecast_date, predicted_demand, confidence_low, confidence_high, social_factor, model_version, explanation)
SELECT p.product_id, 'Gulf Coast HSE and Emissions', TRUNC(SYSDATE) + LEVEL,
  ROUND(52 + (LEVEL * 2) + DBMS_RANDOM.VALUE(-6, 13)),
  ROUND(43 + (LEVEL * 2) - 7),
  ROUND(62 + (LEVEL * 2) + 15),
  ROUND(1.17 + (LEVEL * 0.017) + DBMS_RANDOM.VALUE(0, 0.15), 2),
  'energy_utilities_signal_v3',
  '{"model":"energy_utilities_signal_v3","subsector":"HSE & Emissions","drivers":["emissions_threshold_alert","hse_incident_triage","regulatory_report_due"],"reference_id":"EMS-1190","urgency_score":86,"confidence":"high","trend":"regulatory_follow_up"}'
FROM (SELECT product_id FROM products WHERE category IN ('HSE & Emissions','Regulatory Compliance') ORDER BY product_id FETCH FIRST 1 ROW ONLY) p
CONNECT BY LEVEL <= 30;

-- Customer operations, billing, and collections forecast
INSERT INTO demand_forecasts (product_id, region, forecast_date, predicted_demand, confidence_low, confidence_high, social_factor, model_version, explanation)
SELECT p.product_id, 'National Customer Operations', TRUNC(SYSDATE) + LEVEL,
  ROUND(96 + (LEVEL * 5) + DBMS_RANDOM.VALUE(-12, 20)),
  ROUND(82 + (LEVEL * 5) - 12),
  ROUND(112 + (LEVEL * 5) + 24),
  ROUND(1.25 + (LEVEL * 0.022) + DBMS_RANDOM.VALUE(0, 0.18), 2),
  'energy_utilities_signal_v3',
  '{"model":"energy_utilities_signal_v3","subsector":"Customer Operations","drivers":["billing_inquiry_volume","collections_arrangement_sla","high_usage_concern","move_in_move_out_requests"],"reference_id":"SR-77120","urgency_score":83,"confidence":"high","trend":"sla_watch"}'
FROM (SELECT product_id FROM products WHERE category = 'Customer Operations' ORDER BY product_id FETCH FIRST 1 ROW ONLY) p
CONNECT BY LEVEL <= 30;

COMMIT;

PROMPT Demand forecasts loaded.
SELECT 'demand_forecasts seeded: ' || COUNT(*) || ' rows across ' ||
       COUNT(DISTINCT region) || ' regions for ' ||
       COUNT(DISTINCT product_id) || ' Energy & Utilities services/assets' AS status
FROM demand_forecasts;
