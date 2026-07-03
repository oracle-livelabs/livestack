/*
 * load_all_data.sql
 * Master data loader — runs all data scripts in order
 * Generates ~5000 production/demand signals, ~31 manufactured parts, 12 product lines,
 * 12 plants and distribution hubs, ~483 supplier/operations network accounts, 2000 customers, 3000 work orders
 *
 * NOTE: Uses individual INSERTs (not INSERT ALL) for tables with identity
 * columns to avoid ORA-00001 duplicate identity values on Oracle 23ai.
 */

SET SERVEROUTPUT ON
SET DEFINE OFF

PROMPT =====================================================
PROMPT Loading Manufacturing Operations Demo Data
PROMPT =====================================================

BEGIN
    DBMS_RANDOM.SEED(260630);
END;
/

-- ============================================================
-- PRODUCT LINES / MANUFACTURING BUSINESS UNITS (12) — individual INSERTs to avoid identity dup issue
-- ============================================================
PROMPT Loading product lines...

INSERT INTO brands (brand_name,brand_slug,brand_category,headquarters_city,headquarters_lat,headquarters_lon,founded_year,annual_revenue,social_tier) VALUES ('Apex Automation Systems','apexautomation','Industrial Automation','Detroit',42.3314,-83.0458,2004,725000000,'premium');
INSERT INTO brands (brand_name,brand_slug,brand_category,headquarters_city,headquarters_lat,headquarters_lon,founded_year,annual_revenue,social_tier) VALUES ('CircuitForge Electronics','circuitforge','Electronics','Austin',30.2672,-97.7431,2010,540000000,'premium');
INSERT INTO brands (brand_name,brand_slug,brand_category,headquarters_city,headquarters_lat,headquarters_lon,founded_year,annual_revenue,social_tier) VALUES ('MotorWorks Mobility','motorworks','Mobility Components','Dallas',32.7767,-96.797,2008,685000000,'premium');
INSERT INTO brands (brand_name,brand_slug,brand_category,headquarters_city,headquarters_lat,headquarters_lon,founded_year,annual_revenue,social_tier) VALUES ('PrecisionCast Foundry','precisioncast','Metal Fabrication','Pittsburgh',40.4406,-79.9959,1998,410000000,'standard');
INSERT INTO brands (brand_name,brand_slug,brand_category,headquarters_city,headquarters_lat,headquarters_lon,founded_year,annual_revenue,social_tier) VALUES ('NordicTool Works','nordictools','Machine Tools','Minneapolis',44.9778,-93.265,2001,295000000,'standard');
INSERT INTO brands (brand_name,brand_slug,brand_category,headquarters_city,headquarters_lat,headquarters_lon,founded_year,annual_revenue,social_tier) VALUES ('RoboFlex Assembly','roboflex','Flexible Assembly','Atlanta',33.749,-84.388,2016,360000000,'standard');
INSERT INTO brands (brand_name,brand_slug,brand_category,headquarters_city,headquarters_lat,headquarters_lon,founded_year,annual_revenue,social_tier) VALUES ('Pacific Sensor Systems','pacificsensors','Industrial IoT','San Jose',37.3382,-121.8863,2014,250000000,'premium');
INSERT INTO brands (brand_name,brand_slug,brand_category,headquarters_city,headquarters_lat,headquarters_lon,founded_year,annual_revenue,social_tier) VALUES ('Quantum Plastics Group','quantumplastics','Injection Molding','Phoenix',33.4484,-112.074,2006,320000000,'standard');
INSERT INTO brands (brand_name,brand_slug,brand_category,headquarters_city,headquarters_lat,headquarters_lon,founded_year,annual_revenue,social_tier) VALUES ('Summit Industrial Supply','summitsupply','MRO Supply','Denver',39.7392,-104.9903,1995,455000000,'standard');
INSERT INTO brands (brand_name,brand_slug,brand_category,headquarters_city,headquarters_lat,headquarters_lon,founded_year,annual_revenue,social_tier) VALUES ('AlloyWorks Fabrication','alloyworks','Advanced Materials','Cleveland',41.4993,-81.6944,2009,515000000,'premium');
INSERT INTO brands (brand_name,brand_slug,brand_category,headquarters_city,headquarters_lat,headquarters_lon,founded_year,annual_revenue,social_tier) VALUES ('GreenPack Materials','greenpack','Packaging Materials','Nashville',36.1627,-86.7816,2018,185000000,'emerging');
INSERT INTO brands (brand_name,brand_slug,brand_category,headquarters_city,headquarters_lat,headquarters_lon,founded_year,annual_revenue,social_tier) VALUES ('Titan Parts Network','titanparts','Aftermarket Parts','Chicago',41.8781,-87.6298,2002,610000000,'premium');
COMMIT;
PROMPT Product lines loaded: 12

-- ============================================================
-- PLANTS AND DISTRIBUTION HUBS (12) — individual INSERTs
-- ============================================================
PROMPT Loading plant capacity centers...

INSERT INTO fulfillment_centers (center_name,center_type,city,state_province,postal_code,country,latitude,longitude,capacity_units) VALUES ('Detroit Final Assembly Plant','distribution','Warren','MI','48093','US',42.5145,-83.0147,420000);
INSERT INTO fulfillment_centers (center_name,center_type,city,state_province,postal_code,country,latitude,longitude,capacity_units) VALUES ('Ontario Electronics Distribution Hub','warehouse','Ontario','CA','91761','US',34.0633,-117.6509,360000);
INSERT INTO fulfillment_centers (center_name,center_type,city,state_province,postal_code,country,latitude,longitude,capacity_units) VALUES ('Joliet Midwest Fabrication Center','distribution','Joliet','IL','60435','US',41.525,-88.0817,280000);
INSERT INTO fulfillment_centers (center_name,center_type,city,state_province,postal_code,country,latitude,longitude,capacity_units) VALUES ('Dallas Mobility Components Plant','warehouse','Lancaster','TX','75134','US',32.5921,-96.7561,255000);
INSERT INTO fulfillment_centers (center_name,center_type,city,state_province,postal_code,country,latitude,longitude,capacity_units) VALUES ('Atlanta Flexible Assembly Hub','distribution','Union City','GA','30291','US',33.5871,-84.5421,300000);
INSERT INTO fulfillment_centers (center_name,center_type,city,state_province,postal_code,country,latitude,longitude,capacity_units) VALUES ('Seattle Sensor Calibration Cell','micro','Kent','WA','98032','US',47.3809,-122.2348,125000);
INSERT INTO fulfillment_centers (center_name,center_type,city,state_province,postal_code,country,latitude,longitude,capacity_units) VALUES ('Miami Aftermarket Parts Hub','distribution','Hialeah','FL','33012','US',25.8576,-80.2781,175000);
INSERT INTO fulfillment_centers (center_name,center_type,city,state_province,postal_code,country,latitude,longitude,capacity_units) VALUES ('Denver MRO Supply Warehouse','warehouse','Aurora','CO','80011','US',39.7294,-104.8319,160000);
INSERT INTO fulfillment_centers (center_name,center_type,city,state_province,postal_code,country,latitude,longitude,capacity_units) VALUES ('Phoenix Injection Molding Plant','warehouse','Goodyear','AZ','85338','US',33.4353,-112.3577,230000);
INSERT INTO fulfillment_centers (center_name,center_type,city,state_province,postal_code,country,latitude,longitude,capacity_units) VALUES ('Newark Precision Prototype Cell','micro','Newark','NJ','07102','US',40.7357,-74.1724,90000);
INSERT INTO fulfillment_centers (center_name,center_type,city,state_province,postal_code,country,latitude,longitude,capacity_units) VALUES ('Houston Powertrain Components Hub','distribution','Missouri City','TX','77459','US',29.6186,-95.5377,240000);
INSERT INTO fulfillment_centers (center_name,center_type,city,state_province,postal_code,country,latitude,longitude,capacity_units) VALUES ('Bay Area Advanced Materials Cell','micro','Fremont','CA','94538','US',37.5485,-121.9886,105000);
COMMIT;
PROMPT Plant capacity centers loaded: 12

@@load_products.sql
@@load_influencers.sql
@@load_customers.sql
@@hydrate_spatial_points.sql
@@load_manufacturing_production_signals.sql
@@load_manufacturing_work_orders.sql
@@load_graph_data.sql
@@load_app_users.sql
@@load_demand_regions.sql
@@load_manufacturing_demand_forecasts.sql

MERGE INTO app_dataset_state target
USING (
    SELECT 1 AS state_id,
           'demo' AS active_source,
           'Manufacturing Demo Data' AS active_label,
           'v1' AS active_version
    FROM dual
) incoming
ON (target.state_id = incoming.state_id)
WHEN MATCHED THEN UPDATE SET
    target.active_source = incoming.active_source,
    target.active_label = incoming.active_label,
    target.active_version = incoming.active_version,
    target.updated_at = SYSTIMESTAMP
WHEN NOT MATCHED THEN INSERT (
    state_id,
    active_source,
    active_label,
    active_version,
    updated_at
) VALUES (
    incoming.state_id,
    incoming.active_source,
    incoming.active_label,
    incoming.active_version,
    SYSTIMESTAMP
);

MERGE INTO app_demo_date_anchor target
USING (
    SELECT 1 AS anchor_id,
           'database' AS anchor_source,
           'sql_seed_current_date' AS anchor_strategy,
           CAST(TRUNC(SYSDATE) AS TIMESTAMP) AS original_seed_anchor,
           CAST(TRUNC(SYSDATE) AS TIMESTAMP) AS restore_anchor,
           0 AS offset_days,
           0 AS offset_seconds,
           0 AS shifted_table_count,
           0 AS shifted_column_count,
           0 AS shifted_value_count,
           '{}' AS shifted_columns_json
    FROM dual
) incoming
ON (target.anchor_id = incoming.anchor_id)
WHEN MATCHED THEN UPDATE SET
    target.anchor_source = incoming.anchor_source,
    target.anchor_strategy = incoming.anchor_strategy,
    target.original_seed_anchor = incoming.original_seed_anchor,
    target.restore_anchor = incoming.restore_anchor,
    target.offset_days = incoming.offset_days,
    target.offset_seconds = incoming.offset_seconds,
    target.shifted_table_count = incoming.shifted_table_count,
    target.shifted_column_count = incoming.shifted_column_count,
    target.shifted_value_count = incoming.shifted_value_count,
    target.shifted_columns_json = incoming.shifted_columns_json,
    target.refreshed_at = SYSTIMESTAMP
WHEN NOT MATCHED THEN INSERT (
    anchor_id,
    anchor_source,
    anchor_strategy,
    original_seed_anchor,
    restore_anchor,
    offset_days,
    offset_seconds,
    shifted_table_count,
    shifted_column_count,
    shifted_value_count,
    shifted_columns_json,
    refreshed_at
) VALUES (
    incoming.anchor_id,
    incoming.anchor_source,
    incoming.anchor_strategy,
    incoming.original_seed_anchor,
    incoming.restore_anchor,
    incoming.offset_days,
    incoming.offset_seconds,
    incoming.shifted_table_count,
    incoming.shifted_column_count,
    incoming.shifted_value_count,
    incoming.shifted_columns_json,
    SYSTIMESTAMP
);

@@finalize_spatial_routes.sql
@@seed_fulfillment_zones.sql
@@validate_spatial_structure.sql

COMMIT;

PROMPT =====================================================
PROMPT All data loaded successfully!
PROMPT =====================================================
