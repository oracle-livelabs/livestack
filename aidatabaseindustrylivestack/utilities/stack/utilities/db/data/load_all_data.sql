/*
 * load_all_data.sql
 * Master data loader — runs all data scripts in order
 * Generates ~5000 customer/community signal posts, 50+ services/assets, 18 utility operators,
 * 18 field operations sites, ~500 utilities advocates, 2000 customers, 3000 service tickets
 *
 * NOTE: Uses individual INSERTs (not INSERT ALL) for tables with identity
 * columns to avoid ORA-00001 duplicate identity values on Oracle 23ai.
 */

SET SERVEROUTPUT ON
SET DEFINE OFF

PROMPT =====================================================
PROMPT Loading Energy & Utilities Cross-Sector Demo Data
PROMPT =====================================================

-- ============================================================
-- UTILITY OPERATORS / SERVICE LINES (18) — individual INSERTs to avoid identity dup issue
-- ============================================================
PROMPT Loading utility programs...

INSERT INTO brands (brand_name,brand_slug,brand_category,headquarters_city,headquarters_lat,headquarters_lon,founded_year,annual_revenue,social_tier) VALUES ('GridBridge Electric','gridbridge','Electric Distribution','New York',40.7128,-74.006,2012,325000000,'premium');
INSERT INTO brands (brand_name,brand_slug,brand_category,headquarters_city,headquarters_lat,headquarters_lon,founded_year,annual_revenue,social_tier) VALUES ('PowerPath Utilities','powerpath','Reliability Programs','Chicago',41.8781,-87.6298,2008,210000000,'premium');
INSERT INTO brands (brand_name,brand_slug,brand_category,headquarters_city,headquarters_lat,headquarters_lon,founded_year,annual_revenue,social_tier) VALUES ('PeakPoint Grid Services','peakpoint','Distribution Automation','Dallas',32.7767,-96.797,2015,185000000,'premium');
INSERT INTO brands (brand_name,brand_slug,brand_category,headquarters_city,headquarters_lat,headquarters_lon,founded_year,annual_revenue,social_tier) VALUES ('ClearPower Customer Ops','clearpower','Customer Operations','Seattle',47.6062,-122.3321,2019,76000000,'standard');
INSERT INTO brands (brand_name,brand_slug,brand_category,headquarters_city,headquarters_lat,headquarters_lon,founded_year,annual_revenue,social_tier) VALUES ('FieldMotion Services','fieldmotion','Field Operations','Denver',39.7392,-104.9903,2016,98000000,'standard');
INSERT INTO brands (brand_name,brand_slug,brand_category,headquarters_city,headquarters_lat,headquarters_lon,founded_year,annual_revenue,social_tier) VALUES ('HomeEnergy Connect','homeenergy','Demand Management','Atlanta',33.749,-84.388,2018,124000000,'standard');
INSERT INTO brands (brand_name,brand_slug,brand_category,headquarters_city,headquarters_lat,headquarters_lon,founded_year,annual_revenue,social_tier) VALUES ('MeterSupply Direct','metersupply','Field Supplies','Phoenix',33.4484,-112.074,2014,260000000,'premium');
INSERT INTO brands (brand_name,brand_slug,brand_category,headquarters_city,headquarters_lat,headquarters_lon,founded_year,annual_revenue,social_tier) VALUES ('WaterWorks Utility','waterworks','Water Utility','Boston',42.3601,-71.0589,2020,54000000,'emerging');
INSERT INTO brands (brand_name,brand_slug,brand_category,headquarters_city,headquarters_lat,headquarters_lon,founded_year,annual_revenue,social_tier) VALUES ('FlowGuard Wastewater','flowguard','Water/Wastewater Utility','Seattle',47.6062,-122.3321,2006,118000000,'standard');
INSERT INTO brands (brand_name,brand_slug,brand_category,headquarters_city,headquarters_lat,headquarters_lon,founded_year,annual_revenue,social_tier) VALUES ('SilverLine Critical Load','silverline','Critical Customer Programs','Miami',25.7617,-80.1918,2011,148000000,'standard');
INSERT INTO brands (brand_name,brand_slug,brand_category,headquarters_city,headquarters_lat,headquarters_lon,founded_year,annual_revenue,social_tier) VALUES ('ResilienceHub Energy','resiliencehub','Grid Resilience','San Francisco',37.7749,-122.4194,2017,132000000,'premium');
INSERT INTO brands (brand_name,brand_slug,brand_category,headquarters_city,headquarters_lat,headquarters_lon,founded_year,annual_revenue,social_tier) VALUES ('GasFlow Operations','gasflow','Gas Utility','Houston',29.7604,-95.3698,2013,175000000,'premium');
INSERT INTO brands (brand_name,brand_slug,brand_category,headquarters_city,headquarters_lat,headquarters_lon,founded_year,annual_revenue,social_tier) VALUES ('North Basin Production','northbasin','Oil & Gas Upstream','Midland',31.9973,-102.0779,1999,612000000,'premium');
INSERT INTO brands (brand_name,brand_slug,brand_category,headquarters_city,headquarters_lat,headquarters_lon,founded_year,annual_revenue,social_tier) VALUES ('Bayou Midstream','bayoumidstream','Oil & Gas Midstream','Lafayette',30.2241,-92.0198,1988,830000000,'premium');
INSERT INTO brands (brand_name,brand_slug,brand_category,headquarters_city,headquarters_lat,headquarters_lon,founded_year,annual_revenue,social_tier) VALUES ('Sabine LNG Logistics','sabinelng','Oil & Gas Midstream','Sabine Pass',29.7322,-93.8708,2009,1240000000,'premium');
INSERT INTO brands (brand_name,brand_slug,brand_category,headquarters_city,headquarters_lat,headquarters_lon,founded_year,annual_revenue,social_tier) VALUES ('Gulf Refining Operations','gulfrefining','Oil & Gas Downstream','Corpus Christi',27.8006,-97.3964,1972,1850000000,'premium');
INSERT INTO brands (brand_name,brand_slug,brand_category,headquarters_city,headquarters_lat,headquarters_lon,founded_year,annual_revenue,social_tier) VALUES ('HSE ClearView','hseclear','HSE & Emissions','Corpus Christi',27.8006,-97.3964,2015,92000000,'standard');
INSERT INTO brands (brand_name,brand_slug,brand_category,headquarters_city,headquarters_lat,headquarters_lon,founded_year,annual_revenue,social_tier) VALUES ('StormFirst Response','stormfirst','Storm Operations','Nashville',36.1627,-86.7816,2018,84000000,'standard');
COMMIT;
PROMPT Utility operators loaded: 18

-- ============================================================
-- FIELD OPERATIONS SITES (18) — individual INSERTs
-- ============================================================
PROMPT Loading field operations sites...

INSERT INTO fulfillment_centers (center_name,center_type,city,state_province,postal_code,country,latitude,longitude,capacity_units) VALUES ('NYC Grid Command Center','distribution','Edison','New Jersey','08817','US',40.5187,-74.4121,240000);
INSERT INTO fulfillment_centers (center_name,center_type,city,state_province,postal_code,country,latitude,longitude,capacity_units) VALUES ('Los Angeles Service Yard','warehouse','Ontario','California','91761','US',34.0633,-117.6509,320000);
INSERT INTO fulfillment_centers (center_name,center_type,city,state_province,postal_code,country,latitude,longitude,capacity_units) VALUES ('Chicago Midwest Restoration Hub','distribution','Joliet','Illinois','60435','US',41.525,-88.0817,210000);
INSERT INTO fulfillment_centers (center_name,center_type,city,state_province,postal_code,country,latitude,longitude,capacity_units) VALUES ('Dallas Distribution Operations Center','warehouse','Lancaster','Texas','75134','US',32.5921,-96.7561,185000);
INSERT INTO fulfillment_centers (center_name,center_type,city,state_province,postal_code,country,latitude,longitude,capacity_units) VALUES ('Atlanta Field Dispatch Depot','distribution','Union City','Georgia','30291','US',33.5871,-84.5421,220000);
INSERT INTO fulfillment_centers (center_name,center_type,city,state_province,postal_code,country,latitude,longitude,capacity_units) VALUES ('Seattle Customer Response Center','micro','Kent','Washington','98032','US',47.3809,-122.2348,95000);
INSERT INTO fulfillment_centers (center_name,center_type,city,state_province,postal_code,country,latitude,longitude,capacity_units) VALUES ('Miami Critical Load Hub','distribution','Hialeah','Florida','33012','US',25.8576,-80.2781,120000);
INSERT INTO fulfillment_centers (center_name,center_type,city,state_province,postal_code,country,latitude,longitude,capacity_units) VALUES ('Denver Field Capacity Center','warehouse','Aurora','Colorado','80011','US',39.7294,-104.8319,110000);
INSERT INTO fulfillment_centers (center_name,center_type,city,state_province,postal_code,country,latitude,longitude,capacity_units) VALUES ('Phoenix Meter Operations Hub','warehouse','Goodyear','Arizona','85338','US',33.4353,-112.3577,135000);
INSERT INTO fulfillment_centers (center_name,center_type,city,state_province,postal_code,country,latitude,longitude,capacity_units) VALUES ('Boston Water Response Center','micro','Fall River','Massachusetts','02720','US',41.7015,-71.155,88000);
INSERT INTO fulfillment_centers (center_name,center_type,city,state_province,postal_code,country,latitude,longitude,capacity_units) VALUES ('Houston Gas Operations Hub','distribution','Missouri City','Texas','77459','US',29.6186,-95.5377,150000);
INSERT INTO fulfillment_centers (center_name,center_type,city,state_province,postal_code,country,latitude,longitude,capacity_units) VALUES ('Bay Area DERMS Hub','micro','Fremont','California','94538','US',37.5485,-121.9886,90000);
INSERT INTO fulfillment_centers (center_name,center_type,city,state_province,postal_code,country,latitude,longitude,capacity_units) VALUES ('Seattle Wastewater Compliance Center','micro','Renton','Washington','98057','US',47.4829,-122.2171,76000);
INSERT INTO fulfillment_centers (center_name,center_type,city,state_province,postal_code,country,latitude,longitude,capacity_units) VALUES ('Permian Production Field Office','warehouse','Midland','Texas','79701','US',31.9973,-102.0779,125000);
INSERT INTO fulfillment_centers (center_name,center_type,city,state_province,postal_code,country,latitude,longitude,capacity_units) VALUES ('Lafayette Compressor Operations Center','distribution','Lafayette','Louisiana','70501','US',30.2241,-92.0198,145000);
INSERT INTO fulfillment_centers (center_name,center_type,city,state_province,postal_code,country,latitude,longitude,capacity_units) VALUES ('Sabine LNG Terminal Logistics Site','drop_ship','Sabine Pass','Texas','77655','US',29.7322,-93.8708,98000);
INSERT INTO fulfillment_centers (center_name,center_type,city,state_province,postal_code,country,latitude,longitude,capacity_units) VALUES ('Corpus Christi Refinery Dispatch Center','distribution','Corpus Christi','Texas','78401','US',27.8006,-97.3964,165000);
INSERT INTO fulfillment_centers (center_name,center_type,city,state_province,postal_code,country,latitude,longitude,capacity_units) VALUES ('Gulf Coast HSE Emissions Response Center','micro','Port Arthur','Texas','77640','US',29.8849,-93.9399,64000);
COMMIT;
PROMPT Field operations sites loaded: 18

@@load_products.sql
@@load_influencers.sql
@@load_customers.sql
@@load_social_posts.sql
@@load_orders.sql
@@load_graph_data.sql
@@load_app_users.sql
@@load_demand_regions.sql
@@load_demand_forecasts.sql

BEGIN
    EXECUTE IMMEDIATE q'[
        MERGE INTO app_dataset_state target
        USING (
            SELECT
                1 AS state_id,
                'demo' AS active_source,
                'Energy & Utilities Demo Data' AS active_label,
                'v1' AS active_version,
                'gen_bootstrap_v1' AS active_generation
            FROM dual
        ) incoming
        ON (target.state_id = incoming.state_id)
        WHEN MATCHED THEN UPDATE SET
            target.active_source = incoming.active_source,
            target.active_label = incoming.active_label,
            target.active_version = incoming.active_version,
            target.active_generation = incoming.active_generation,
            target.updated_at = SYSTIMESTAMP
        WHEN NOT MATCHED THEN INSERT (
            state_id,
            active_source,
            active_label,
            active_version,
            active_generation,
            updated_at
        ) VALUES (
            incoming.state_id,
            incoming.active_source,
            incoming.active_label,
            incoming.active_version,
            incoming.active_generation,
            SYSTIMESTAMP
        )
    ]';
    DBMS_OUTPUT.PUT_LINE('Dataset metadata set to demo.');
EXCEPTION
    WHEN OTHERS THEN
        IF SQLCODE != -942 THEN
            RAISE;
        END IF;
        DBMS_OUTPUT.PUT_LINE('app_dataset_state not present; skipping dataset metadata seed.');
END;
/

BEGIN
    EXECUTE IMMEDIATE q'[
        MERGE INTO app_demo_date_anchor target
        USING (
            SELECT
                1 AS anchor_id,
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
        )
    ]';
EXCEPTION
    WHEN OTHERS THEN
        IF SQLCODE != -942 THEN
            RAISE;
        END IF;
END;
/

PROMPT =====================================================
PROMPT All data loaded successfully!
PROMPT =====================================================
