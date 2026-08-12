/*
 * load_all_data.sql
 * Master data loader - runs all data scripts in order
 * Generates ~5000 resident/community signal posts, ~31 services, 12 public programs,
 * 12 service access centers, ~483 community partners, 2000 residents, 3000 service requests
 *
 * NOTE: Uses individual INSERTs (not INSERT ALL) for tables with identity
 * columns to avoid ORA-00001 duplicate identity values on Oracle 23ai.
 */

SET SERVEROUTPUT ON
SET DEFINE OFF

PROMPT =====================================================
PROMPT Loading State and Local Government Service Operations Demo Data
PROMPT =====================================================

-- ============================================================
-- COLORADO PUBLIC PROGRAMS / SERVICE LINES (12) - individual INSERTs to avoid identity dup issue
-- ============================================================
PROMPT Loading public programs...

INSERT INTO brands (brand_name,brand_slug,brand_category,headquarters_city,headquarters_lat,headquarters_lon,founded_year,annual_revenue,social_tier) VALUES ('CivicBridge Network','civicbridge','Integrated Services','Denver',39.7392,-104.9903,2012,325000000,'premium');
INSERT INTO brands (brand_name,brand_slug,brand_category,headquarters_city,headquarters_lat,headquarters_lon,founded_year,annual_revenue,social_tier) VALUES ('VitalPath Service Counters','vitalpath','Constituent Services','Aurora',39.7294,-104.8319,2008,210000000,'premium');
INSERT INTO brands (brand_name,brand_slug,brand_category,headquarters_city,headquarters_lat,headquarters_lon,founded_year,annual_revenue,social_tier) VALUES ('PulsePoint Infrastructure','pulsepoint','Infrastructure','Colorado Springs',38.8339,-104.8214,2015,185000000,'premium');
INSERT INTO brands (brand_name,brand_slug,brand_category,headquarters_city,headquarters_lat,headquarters_lon,founded_year,annual_revenue,social_tier) VALUES ('ClearMind Housing and Human Services','clearmind','Housing and Human Services','Boulder',40.0150,-105.2705,2019,76000000,'standard');
INSERT INTO brands (brand_name,brand_slug,brand_category,headquarters_city,headquarters_lat,headquarters_lon,founded_year,annual_revenue,social_tier) VALUES ('OrthoMotion Rehab','orthomotion','Transportation','Fort Collins',40.5853,-105.0844,2016,98000000,'standard');
INSERT INTO brands (brand_name,brand_slug,brand_category,headquarters_city,headquarters_lat,headquarters_lon,founded_year,annual_revenue,social_tier) VALUES ('FieldWorks Connect','fieldworks','Field Services','Pueblo',38.2544,-104.6091,2018,124000000,'standard');
INSERT INTO brands (brand_name,brand_slug,brand_category,headquarters_city,headquarters_lat,headquarters_lon,founded_year,annual_revenue,social_tier) VALUES ('PublicWorks Supply','pwsupply','Public Works Materials','Grand Junction',39.0639,-108.5506,2014,260000000,'premium');
INSERT INTO brands (brand_name,brand_slug,brand_category,headquarters_city,headquarters_lat,headquarters_lon,founded_year,annual_revenue,social_tier) VALUES ('WellNest Youth Services','wellnest','Youth Services','Greeley',40.4233,-104.7091,2020,54000000,'emerging');
INSERT INTO brands (brand_name,brand_slug,brand_category,headquarters_city,headquarters_lat,headquarters_lon,founded_year,annual_revenue,social_tier) VALUES ('SilverLine Senior and Veteran Services','silverline','Senior and Veteran Services','Lakewood',39.7047,-105.0814,2011,148000000,'standard');
INSERT INTO brands (brand_name,brand_slug,brand_category,headquarters_city,headquarters_lat,headquarters_lon,founded_year,annual_revenue,social_tier) VALUES ('OncoGuide Services','oncoguide','Special Programs','Durango',37.2753,-107.8801,2017,132000000,'premium');
INSERT INTO brands (brand_name,brand_slug,brand_category,headquarters_city,headquarters_lat,headquarters_lon,founded_year,annual_revenue,social_tier) VALUES ('WaterFlow Services','waterflow','Water Services','Loveland',40.3978,-105.0750,2013,175000000,'premium');
INSERT INTO brands (brand_name,brand_slug,brand_category,headquarters_city,headquarters_lat,headquarters_lon,founded_year,annual_revenue,social_tier) VALUES ('CommunityFirst Services','womenfirst','Community Services','Alamosa',37.4694,-105.8700,2018,84000000,'standard');
COMMIT;
PROMPT Public Service programs loaded: 12

-- ============================================================
-- COLORADO SERVICE ACCESS CENTERS (12) - individual INSERTs
-- ============================================================
PROMPT Loading service access centers...

INSERT INTO fulfillment_centers (center_name,center_type,city,state_province,postal_code,country,latitude,longitude,capacity_units) VALUES ('Denver County Eligibility Service Center','distribution','Denver','Colorado','80202','US',39.7392,-104.9903,240000);
INSERT INTO fulfillment_centers (center_name,center_type,city,state_province,postal_code,country,latitude,longitude,capacity_units) VALUES ('Arapahoe County Eligibility Service Center','warehouse','Aurora','Colorado','80012','US',39.7294,-104.8319,320000);
INSERT INTO fulfillment_centers (center_name,center_type,city,state_province,postal_code,country,latitude,longitude,capacity_units) VALUES ('El Paso County Resident Services Hub','distribution','Colorado Springs','Colorado','80903','US',38.8339,-104.8214,210000);
INSERT INTO fulfillment_centers (center_name,center_type,city,state_province,postal_code,country,latitude,longitude,capacity_units) VALUES ('Boulder County Medicaid Eligibility Office','micro','Boulder','Colorado','80302','US',40.0150,-105.2705,185000);
INSERT INTO fulfillment_centers (center_name,center_type,city,state_province,postal_code,country,latitude,longitude,capacity_units) VALUES ('Larimer County Eligibility Service Center','distribution','Fort Collins','Colorado','80521','US',40.5853,-105.0844,220000);
INSERT INTO fulfillment_centers (center_name,center_type,city,state_province,postal_code,country,latitude,longitude,capacity_units) VALUES ('Pueblo County Resident Services Hub','warehouse','Pueblo','Colorado','81003','US',38.2544,-104.6091,95000);
INSERT INTO fulfillment_centers (center_name,center_type,city,state_province,postal_code,country,latitude,longitude,capacity_units) VALUES ('Mesa County Eligibility Service Center','distribution','Grand Junction','Colorado','81501','US',39.0639,-108.5506,120000);
INSERT INTO fulfillment_centers (center_name,center_type,city,state_province,postal_code,country,latitude,longitude,capacity_units) VALUES ('Weld County Medicaid Eligibility Office','warehouse','Greeley','Colorado','80631','US',40.4233,-104.7091,110000);
INSERT INTO fulfillment_centers (center_name,center_type,city,state_province,postal_code,country,latitude,longitude,capacity_units) VALUES ('Jefferson County Resident Services Hub','distribution','Lakewood','Colorado','80226','US',39.7047,-105.0814,135000);
INSERT INTO fulfillment_centers (center_name,center_type,city,state_province,postal_code,country,latitude,longitude,capacity_units) VALUES ('La Plata County Eligibility Service Center','micro','Durango','Colorado','81301','US',37.2753,-107.8801,88000);
INSERT INTO fulfillment_centers (center_name,center_type,city,state_province,postal_code,country,latitude,longitude,capacity_units) VALUES ('Douglas County Resident Services Hub','distribution','Castle Rock','Colorado','80104','US',39.3722,-104.8561,150000);
INSERT INTO fulfillment_centers (center_name,center_type,city,state_province,postal_code,country,latitude,longitude,capacity_units) VALUES ('Alamosa County Medicaid Eligibility Office','micro','Alamosa','Colorado','81101','US',37.4694,-105.8700,90000);
COMMIT;
PROMPT Public Service access centers loaded: 12

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
                'State and Local Government Demo Data' AS active_label,
                'v1' AS active_version,
                'sled_bootstrap_v1' AS active_generation
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
