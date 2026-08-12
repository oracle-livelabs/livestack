/*
 * load_all_data.sql
 * Master data loader — runs all data scripts in order
 * Generates ~5000 student/community signal posts, ~31 services, 12 academic programs,
 * 12 campus service centers, ~483 campus advocates, 2000 students, 3000 student requests
 *
 * NOTE: Uses individual INSERTs (not INSERT ALL) for tables with identity
 * columns to avoid ORA-00001 duplicate identity values on Oracle 23ai.
 */

SET SERVEROUTPUT ON
SET DEFINE OFF

PROMPT =====================================================
PROMPT Loading Higher Education Student Success Demo Data
PROMPT =====================================================

-- ============================================================
-- ACADEMIC PROGRAMS / STUDENT SERVICE LINES (12) — individual INSERTs to avoid identity dup issue
-- ============================================================
PROMPT Loading academic programs...

INSERT INTO brands (brand_name,brand_slug,brand_category,headquarters_city,headquarters_lat,headquarters_lon,founded_year,annual_revenue,social_tier) VALUES ('Northstar Advising Network','northstar','Academic Advising','New York',40.7128,-74.006,2012,325000000,'premium');
INSERT INTO brands (brand_name,brand_slug,brand_category,headquarters_city,headquarters_lat,headquarters_lon,founded_year,annual_revenue,social_tier) VALUES ('Riverbend Enrollment Services','riverbend','Enrollment Management','Chicago',41.8781,-87.6298,2008,210000000,'premium');
INSERT INTO brands (brand_name,brand_slug,brand_category,headquarters_city,headquarters_lat,headquarters_lon,founded_year,annual_revenue,social_tier) VALUES ('Summit Career Pathways','summit','Career Readiness','Dallas',32.7767,-96.797,2015,185000000,'premium');
INSERT INTO brands (brand_name,brand_slug,brand_category,headquarters_city,headquarters_lat,headquarters_lon,founded_year,annual_revenue,social_tier) VALUES ('ClearPath Wellness Center','clearpath','Student Wellness','Seattle',47.6062,-122.3321,2019,76000000,'standard');
INSERT INTO brands (brand_name,brand_slug,brand_category,headquarters_city,headquarters_lat,headquarters_lon,founded_year,annual_revenue,social_tier) VALUES ('Pioneer Academic Support','pioneer','Learning Support','Denver',39.7392,-104.9903,2016,98000000,'standard');
INSERT INTO brands (brand_name,brand_slug,brand_category,headquarters_city,headquarters_lat,headquarters_lon,founded_year,annual_revenue,social_tier) VALUES ('Coastal Access Office','coastal','Student Services','Atlanta',33.749,-84.388,2018,124000000,'standard');
INSERT INTO brands (brand_name,brand_slug,brand_category,headquarters_city,headquarters_lat,headquarters_lon,founded_year,annual_revenue,social_tier) VALUES ('Lakeside Financial Aid','lakeside','Financial Aid','Phoenix',33.4484,-112.074,2014,260000000,'premium');
INSERT INTO brands (brand_name,brand_slug,brand_category,headquarters_city,headquarters_lat,headquarters_lon,founded_year,annual_revenue,social_tier) VALUES ('Horizon First-Year Experience','horizon','First-Year Experience','Boston',42.3601,-71.0589,2020,54000000,'emerging');
INSERT INTO brands (brand_name,brand_slug,brand_category,headquarters_city,headquarters_lat,headquarters_lon,founded_year,annual_revenue,social_tier) VALUES ('Liberty Transfer Center','liberty','Transfer Success','Miami',25.7617,-80.1918,2011,148000000,'standard');
INSERT INTO brands (brand_name,brand_slug,brand_category,headquarters_city,headquarters_lat,headquarters_lon,founded_year,annual_revenue,social_tier) VALUES ('Innovation Online Campus','innovation','Online Learning','San Francisco',37.7749,-122.4194,2017,132000000,'premium');
INSERT INTO brands (brand_name,brand_slug,brand_category,headquarters_city,headquarters_lat,headquarters_lon,founded_year,annual_revenue,social_tier) VALUES ('Desert Workforce Institute','desert','Workforce Programs','Houston',29.7604,-95.3698,2013,175000000,'premium');
INSERT INTO brands (brand_name,brand_slug,brand_category,headquarters_city,headquarters_lat,headquarters_lon,founded_year,annual_revenue,social_tier) VALUES ('Blue Ridge Graduate College','blueridge','Graduate Studies','Nashville',36.1627,-86.7816,2018,84000000,'standard');
COMMIT;
PROMPT Academic programs loaded: 12

-- ============================================================
-- CAMPUS SERVICE CENTERS (12) — individual INSERTs
-- ============================================================
PROMPT Loading campus service centers...

INSERT INTO fulfillment_centers (center_name,center_type,city,state_province,postal_code,country,latitude,longitude,capacity_units) VALUES ('Northeast Advising Hub','distribution','Edison','New Jersey','08817','US',40.5187,-74.4121,240000);
INSERT INTO fulfillment_centers (center_name,center_type,city,state_province,postal_code,country,latitude,longitude,capacity_units) VALUES ('Southern California Enrollment Center','warehouse','Ontario','California','91761','US',34.0633,-117.6509,320000);
INSERT INTO fulfillment_centers (center_name,center_type,city,state_province,postal_code,country,latitude,longitude,capacity_units) VALUES ('Midwest Student Success Hub','distribution','Joliet','Illinois','60435','US',41.525,-88.0817,210000);
INSERT INTO fulfillment_centers (center_name,center_type,city,state_province,postal_code,country,latitude,longitude,capacity_units) VALUES ('Dallas Career Readiness Center','warehouse','Lancaster','Texas','75134','US',32.5921,-96.7561,185000);
INSERT INTO fulfillment_centers (center_name,center_type,city,state_province,postal_code,country,latitude,longitude,capacity_units) VALUES ('Atlanta Student Support Center','distribution','Union City','Georgia','30291','US',33.5871,-84.5421,220000);
INSERT INTO fulfillment_centers (center_name,center_type,city,state_province,postal_code,country,latitude,longitude,capacity_units) VALUES ('Seattle Wellness Access Center','micro','Kent','Washington','98032','US',47.3809,-122.2348,95000);
INSERT INTO fulfillment_centers (center_name,center_type,city,state_province,postal_code,country,latitude,longitude,capacity_units) VALUES ('Miami Transfer Success Hub','distribution','Hialeah','Florida','33012','US',25.8576,-80.2781,120000);
INSERT INTO fulfillment_centers (center_name,center_type,city,state_province,postal_code,country,latitude,longitude,capacity_units) VALUES ('Denver Learning Commons','warehouse','Aurora','Colorado','80011','US',39.7294,-104.8319,110000);
INSERT INTO fulfillment_centers (center_name,center_type,city,state_province,postal_code,country,latitude,longitude,capacity_units) VALUES ('Phoenix Financial Aid Center','warehouse','Goodyear','Arizona','85338','US',33.4353,-112.3577,135000);
INSERT INTO fulfillment_centers (center_name,center_type,city,state_province,postal_code,country,latitude,longitude,capacity_units) VALUES ('Boston First-Year Success Center','micro','Fall River','Massachusetts','02720','US',41.7015,-71.155,88000);
INSERT INTO fulfillment_centers (center_name,center_type,city,state_province,postal_code,country,latitude,longitude,capacity_units) VALUES ('Houston Workforce Programs Hub','distribution','Missouri City','Texas','77459','US',29.6186,-95.5377,150000);
INSERT INTO fulfillment_centers (center_name,center_type,city,state_province,postal_code,country,latitude,longitude,capacity_units) VALUES ('Bay Area Online Learning Studio','micro','Fremont','California','94538','US',37.5485,-121.9886,90000);
COMMIT;
PROMPT Campus service centers loaded: 12

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
                'Higher Education Demo Data' AS active_label,
                'v1' AS active_version,
                'highered_bootstrap_v1' AS active_generation
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

PROMPT =====================================================
PROMPT All data loaded successfully!
PROMPT =====================================================
