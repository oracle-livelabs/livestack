/*
 * load_manufacturing_demand_forecasts.sql
 * Seed data for production demand forecasts
 *
 * WHY THIS WAS EMPTY:
 * manufacturing_demand_forecasts was defined in 01_tables.sql (schema creation) but no
 * corresponding INSERT script was ever written and it was never included
 * in load_all_data.sql. The table is central to the "Demand Forecasting"
 * demo story in the README ("See AI-predicted demand surges before they hit,
 * with explainable reasoning").
 *
 * This script generates 30-day rolling forecasts for high-demand manufactured parts across
 * major regions. The production_signal_factor column simulates production/demand signal momentum and AI-detected
 * production demand from the manufacturing supplier and operations signal graph. The forecast_explanation column stores
 * JSON-formatted reasoning (as Oracle JSON / CLOB) — the foundation for
 * explainable AI demand predictions.
 *
 * model_version = 'manufacturing_signal_v2' represents Oracle ML pipeline:
 *   Manufacturing supplier and operations graph signals -> vector semantic trends -> time-series production demand
 *
 * Run AFTER: load_products.sql (needs manufactured part product_id references)
 * Run AFTER: load_manufacturing_production_signals.sql (production/demand signal context)
 */

SET SERVEROUTPUT ON
SET DEFINE OFF

PROMPT Loading production demand forecasts (30-day rolling window, high-demand manufactured parts, major regions)...

-- ============================================================
-- Forecasts for high-momentum manufactured parts across major US regions
-- ============================================================

-- Manufactured part 1 across regions (high community-signal momentum)
INSERT INTO manufacturing_demand_forecasts (manufactured_part_id, planning_region, forecast_date, predicted_unit_demand, lower_confidence_units, upper_confidence_units, production_signal_factor, model_version, forecast_explanation)
SELECT p.product_id, 'Bay Area (SF)', TRUNC(SYSDATE) + LEVEL,
  ROUND(120 + (LEVEL * 8) + DBMS_RANDOM.VALUE(-15, 25)),
  ROUND(105 + (LEVEL * 8) - 20),
  ROUND(135 + (LEVEL * 8) + 30),
  ROUND(1.0 + (LEVEL * 0.04) + DBMS_RANDOM.VALUE(0, 0.3), 2),
  'manufacturing_signal_v2',
  '{"model":"manufacturing_signal_v2","drivers":["line_capacity_spike","planner_schedule_cluster","weekend_shift_constraint"],"top_network_account":"@detroit_line_watch","urgency_score":87,"confidence":"high","trend":"accelerating"}'
FROM (SELECT product_id FROM products ORDER BY product_id FETCH FIRST 1 ROW ONLY) p
CONNECT BY LEVEL <= 30;

INSERT INTO manufacturing_demand_forecasts (manufactured_part_id, planning_region, forecast_date, predicted_unit_demand, lower_confidence_units, upper_confidence_units, production_signal_factor, model_version, forecast_explanation)
SELECT p.product_id, 'New York Metro', TRUNC(SYSDATE) + LEVEL,
  ROUND(180 + (LEVEL * 6) + DBMS_RANDOM.VALUE(-20, 30)),
  ROUND(160 + (LEVEL * 6) - 25),
  ROUND(200 + (LEVEL * 6) + 35),
  ROUND(1.2 + (LEVEL * 0.03) + DBMS_RANDOM.VALUE(0, 0.2), 2),
  'manufacturing_signal_v2',
  '{"model":"manufacturing_signal_v2","drivers":["line_supervisor_forum_signal","supplier_capacity_planner","same_day_work_order_pressure"],"top_network_account":"@shopfloor_nora","urgency_score":79,"confidence":"high","trend":"elevated"}'
FROM (SELECT product_id FROM products ORDER BY product_id FETCH FIRST 1 ROW ONLY) p
CONNECT BY LEVEL <= 30;

INSERT INTO manufacturing_demand_forecasts (manufactured_part_id, planning_region, forecast_date, predicted_unit_demand, lower_confidence_units, upper_confidence_units, production_signal_factor, model_version, forecast_explanation)
SELECT p.product_id, 'Los Angeles Basin', TRUNC(SYSDATE) + LEVEL,
  ROUND(145 + (LEVEL * 5) + DBMS_RANDOM.VALUE(-18, 22)),
  ROUND(125 + (LEVEL * 5) - 20),
  ROUND(165 + (LEVEL * 5) + 28),
  ROUND(1.15 + (LEVEL * 0.025) + DBMS_RANDOM.VALUE(0, 0.25), 2),
  'manufacturing_signal_v2',
  '{"model":"manufacturing_signal_v2","drivers":["regional_supplier_notice","customer_forecast_update","peak_production_season"],"top_network_account":"@supplier_maya","urgency_score":74,"confidence":"medium","trend":"steady_growth"}'
FROM (SELECT product_id FROM products ORDER BY product_id FETCH FIRST 1 ROW ONLY) p
CONNECT BY LEVEL <= 30;

-- Manufactured part 2 - remote monitoring and access pathways
INSERT INTO manufacturing_demand_forecasts (manufactured_part_id, planning_region, forecast_date, predicted_unit_demand, lower_confidence_units, upper_confidence_units, production_signal_factor, model_version, forecast_explanation)
SELECT p.product_id, 'Seattle Metro', TRUNC(SYSDATE) + LEVEL,
  ROUND(95 + (LEVEL * 4) + DBMS_RANDOM.VALUE(-10, 15)),
  ROUND(82 + (LEVEL * 4) - 12),
  ROUND(108 + (LEVEL * 4) + 18),
  ROUND(1.3 + (LEVEL * 0.02) + DBMS_RANDOM.VALUE(0, 0.15), 2),
  'manufacturing_signal_v2',
  '{"model":"manufacturing_signal_v2","drivers":["plant_adoption_signal","new_product_program","early_network_cluster"],"top_network_account":"@industrial-iot_mark","urgency_score":82,"confidence":"high","trend":"production_spike"}'
FROM (SELECT product_id FROM products ORDER BY product_id OFFSET 1 ROW FETCH NEXT 1 ROW ONLY) p
CONNECT BY LEVEL <= 30;

INSERT INTO manufacturing_demand_forecasts (manufactured_part_id, planning_region, forecast_date, predicted_unit_demand, lower_confidence_units, upper_confidence_units, production_signal_factor, model_version, forecast_explanation)
SELECT p.product_id, 'Austin Metro', TRUNC(SYSDATE) + LEVEL,
  ROUND(78 + (LEVEL * 3) + DBMS_RANDOM.VALUE(-8, 12)),
  ROUND(67 + (LEVEL * 3) - 10),
  ROUND(90 + (LEVEL * 3) + 15),
  ROUND(1.25 + (LEVEL * 0.015) + DBMS_RANDOM.VALUE(0, 0.18), 2),
  'manufacturing_signal_v2',
  '{"model":"manufacturing_signal_v2","drivers":["regional_supplier_roundtable","supplier_network_adoption","plant_team_forum_signal"],"top_network_account":"@plant_ava","urgency_score":71,"confidence":"medium","trend":"elevated"}'
FROM (SELECT product_id FROM products ORDER BY product_id OFFSET 1 ROW FETCH NEXT 1 ROW ONLY) p
CONNECT BY LEVEL <= 30;

-- Manufactured part 3 - retooling and recurring production demand
INSERT INTO manufacturing_demand_forecasts (manufactured_part_id, planning_region, forecast_date, predicted_unit_demand, lower_confidence_units, upper_confidence_units, production_signal_factor, model_version, forecast_explanation)
SELECT p.product_id, 'Denver Metro', TRUNC(SYSDATE) + LEVEL,
  ROUND(65 + (LEVEL * 2) + DBMS_RANDOM.VALUE(-8, 10)),
  ROUND(55 + (LEVEL * 2) - 10),
  ROUND(75 + (LEVEL * 2) + 12),
  ROUND(1.1 + (LEVEL * 0.01) + DBMS_RANDOM.VALUE(0, 0.12), 2),
  'manufacturing_signal_v2',
  '{"model":"manufacturing_signal_v2","drivers":["retooling_request_cluster","new_year_retooling_effect","outdoor_season_start"],"top_network_account":"@retooling_reed","urgency_score":64,"confidence":"medium","trend":"seasonal_uptick"}'
FROM (SELECT product_id FROM products ORDER BY product_id OFFSET 2 ROW FETCH NEXT 1 ROW ONLY) p
CONNECT BY LEVEL <= 30;

INSERT INTO manufacturing_demand_forecasts (manufactured_part_id, planning_region, forecast_date, predicted_unit_demand, lower_confidence_units, upper_confidence_units, production_signal_factor, model_version, forecast_explanation)
SELECT p.product_id, 'Atlanta Metro', TRUNC(SYSDATE) + LEVEL,
  ROUND(88 + (LEVEL * 3) + DBMS_RANDOM.VALUE(-12, 15)),
  ROUND(74 + (LEVEL * 3) - 14),
  ROUND(102 + (LEVEL * 3) + 18),
  ROUND(1.05 + (LEVEL * 0.012) + DBMS_RANDOM.VALUE(0, 0.14), 2),
  'manufacturing_signal_v2',
  '{"model":"manufacturing_signal_v2","drivers":["field_service_repair_backlog","maintenance_engineer_signal","spring_season"],"top_network_account":"@fieldservice_keisha","urgency_score":68,"confidence":"medium","trend":"growing"}'
FROM (SELECT product_id FROM products ORDER BY product_id OFFSET 2 ROW FETCH NEXT 1 ROW ONLY) p
CONNECT BY LEVEL <= 30;

-- Manufactured part 4 - preventive and specialty access demand
INSERT INTO manufacturing_demand_forecasts (manufactured_part_id, planning_region, forecast_date, predicted_unit_demand, lower_confidence_units, upper_confidence_units, production_signal_factor, model_version, forecast_explanation)
SELECT p.product_id, 'Miami-South Florida', TRUNC(SYSDATE) + LEVEL,
  ROUND(110 + (LEVEL * 7) + DBMS_RANDOM.VALUE(-14, 20)),
  ROUND(94 + (LEVEL * 7) - 18),
  ROUND(126 + (LEVEL * 7) + 25),
  ROUND(1.4 + (LEVEL * 0.05) + DBMS_RANDOM.VALUE(0, 0.35), 2),
  'manufacturing_signal_v2',
  '{"model":"manufacturing_signal_v2","drivers":["supplier_delay_spike","summer_shutdown_planning","heat_risk_inspection"],"top_network_account":"@supplier_sam","urgency_score":91,"confidence":"very_high","trend":"critical_surge"}'
FROM (SELECT product_id FROM products ORDER BY product_id OFFSET 3 ROW FETCH NEXT 1 ROW ONLY) p
CONNECT BY LEVEL <= 30;

INSERT INTO manufacturing_demand_forecasts (manufactured_part_id, planning_region, forecast_date, predicted_unit_demand, lower_confidence_units, upper_confidence_units, production_signal_factor, model_version, forecast_explanation)
SELECT p.product_id, 'New York Metro', TRUNC(SYSDATE) + LEVEL,
  ROUND(155 + (LEVEL * 9) + DBMS_RANDOM.VALUE(-18, 28)),
  ROUND(135 + (LEVEL * 9) - 22),
  ROUND(175 + (LEVEL * 9) + 34),
  ROUND(1.45 + (LEVEL * 0.06) + DBMS_RANDOM.VALUE(0, 0.4), 2),
  'manufacturing_signal_v2',
  '{"model":"manufacturing_signal_v2","drivers":["specialty_component_spike","oem_schedule_pull_in","high_priority_capacity_need"],"top_network_account":"@quality_nina","urgency_score":94,"confidence":"very_high","trend":"explosive_growth"}'
FROM (SELECT product_id FROM products ORDER BY product_id OFFSET 3 ROW FETCH NEXT 1 ROW ONLY) p
CONNECT BY LEVEL <= 30;

-- Manufactured part 5 - regional home and community production demand
INSERT INTO manufacturing_demand_forecasts (manufactured_part_id, planning_region, forecast_date, predicted_unit_demand, lower_confidence_units, upper_confidence_units, production_signal_factor, model_version, forecast_explanation)
SELECT p.product_id, 'Pacific Northwest', TRUNC(SYSDATE) + LEVEL,
  ROUND(72 + (LEVEL * 2) + DBMS_RANDOM.VALUE(-9, 11)),
  ROUND(61 + (LEVEL * 2) - 11),
  ROUND(83 + (LEVEL * 2) + 14),
  ROUND(1.08 + (LEVEL * 0.009) + DBMS_RANDOM.VALUE(0, 0.11), 2),
  'manufacturing_signal_v2',
  '{"model":"manufacturing_signal_v2","drivers":["remote_supplier_signal","supplier_capacity_planner_signal","seasonal_maintenance_need"],"top_network_account":"@supplier_signal_pnw","urgency_score":61,"confidence":"medium","trend":"seasonal"}'
FROM (SELECT product_id FROM products ORDER BY product_id OFFSET 4 ROW FETCH NEXT 1 ROW ONLY) p
CONNECT BY LEVEL <= 30;

INSERT INTO manufacturing_demand_forecasts (manufactured_part_id, planning_region, forecast_date, predicted_unit_demand, lower_confidence_units, upper_confidence_units, production_signal_factor, model_version, forecast_explanation)
SELECT p.product_id, 'Mountain West', TRUNC(SYSDATE) + LEVEL,
  ROUND(55 + (LEVEL * 1) + DBMS_RANDOM.VALUE(-7, 9)),
  ROUND(47 + (LEVEL * 1) - 8),
  ROUND(63 + (LEVEL * 1) + 11),
  ROUND(1.05 + (LEVEL * 0.007) + DBMS_RANDOM.VALUE(0, 0.10), 2),
  'manufacturing_signal_v2',
  '{"model":"manufacturing_signal_v2","drivers":["post_shutdown_restart_wave","mobility_component_recovery_trend","remote_region_capacity_signal"],"top_network_account":"@remote_supplier_max","urgency_score":55,"confidence":"low","trend":"flat_seasonal"}'
FROM (SELECT product_id FROM products ORDER BY product_id OFFSET 4 ROW FETCH NEXT 1 ROW ONLY) p
CONNECT BY LEVEL <= 30;

-- Additional cross-region forecast for a nationwide access surge
INSERT INTO manufacturing_demand_forecasts (manufactured_part_id, planning_region, forecast_date, predicted_unit_demand, lower_confidence_units, upper_confidence_units, production_signal_factor, model_version, forecast_explanation)
SELECT p.product_id, 'Northeast Corridor', TRUNC(SYSDATE) + LEVEL,
  ROUND(310 + (LEVEL * 12) + DBMS_RANDOM.VALUE(-30, 45)),
  ROUND(275 + (LEVEL * 12) - 38),
  ROUND(345 + (LEVEL * 12) + 55),
  ROUND(1.55 + (LEVEL * 0.07) + DBMS_RANDOM.VALUE(0, 0.45), 2),
  'manufacturing_signal_v2',
  '{"model":"manufacturing_signal_v2","drivers":["multi_channel_demand_spike","plant_floor_signal_awareness","supplier_coverage","capacity_constraint_signal"],"top_network_account":"@capacity_planning_network","urgency_score":97,"confidence":"very_high","trend":"historic_demand_surge","alert":"pre_position_material_capacity_recommended"}'
FROM (SELECT product_id FROM products ORDER BY product_id FETCH FIRST 1 ROW ONLY) p
CONNECT BY LEVEL <= 30;

COMMIT;

PROMPT Demand forecasts loaded.
SELECT 'manufacturing_demand_forecasts seeded: ' || COUNT(*) || ' rows across ' ||
       COUNT(DISTINCT planning_region) || ' regions for ' ||
       COUNT(DISTINCT manufactured_part_id) || ' manufactured parts' AS status
FROM manufacturing_demand_forecasts;
