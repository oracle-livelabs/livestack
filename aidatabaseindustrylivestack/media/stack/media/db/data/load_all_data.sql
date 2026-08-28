/*
 * load_all_data.sql
 * Master data loader — runs all data scripts in order
 * Generates ~5000 audience/social signal posts, ~45 content assets, 12 studios and labels,
 * 12 distribution hubs, ~483 creators, 2000 audience accounts, 3000 campaign orders
 *
 * NOTE: Uses individual INSERTs (not INSERT ALL) for tables with identity
 * columns to avoid ORA-00001 duplicate identity values on Oracle 23ai.
 */

SET SERVEROUTPUT ON
SET DEFINE OFF

PROMPT =====================================================
PROMPT Loading Media and Entertainment Content Intelligence Demo Data
PROMPT =====================================================

-- ============================================================
-- STUDIOS / LABELS / RIGHTS OWNERS (12) - individual INSERTs to avoid identity dup issue
-- ============================================================
PROMPT Loading studios and labels...

INSERT INTO brands (brand_name,brand_slug,brand_category,headquarters_city,headquarters_lat,headquarters_lon,founded_year,annual_revenue,social_tier) VALUES ('Aurora Studios','aurora','Film Studio','Los Angeles',34.0522,-118.2437,1998,920000000,'premium');
INSERT INTO brands (brand_name,brand_slug,brand_category,headquarters_city,headquarters_lat,headquarters_lon,founded_year,annual_revenue,social_tier) VALUES ('StreamWave Network','streamwave','Streaming Platform','New York',40.7128,-74.006,2011,1480000000,'premium');
INSERT INTO brands (brand_name,brand_slug,brand_category,headquarters_city,headquarters_lat,headquarters_lon,founded_year,annual_revenue,social_tier) VALUES ('CinePulse Pictures','cinepulse','Theatrical Releases','Atlanta',33.749,-84.388,2006,610000000,'premium');
INSERT INTO brands (brand_name,brand_slug,brand_category,headquarters_city,headquarters_lat,headquarters_lon,founded_year,annual_revenue,social_tier) VALUES ('SoundStage Live','soundstage','Live Entertainment','Nashville',36.1627,-86.7816,2015,280000000,'standard');
INSERT INTO brands (brand_name,brand_slug,brand_category,headquarters_city,headquarters_lat,headquarters_lon,founded_year,annual_revenue,social_tier) VALUES ('Marquee Media Network','marquee','Streaming and Live Entertainment','Seattle',47.6062,-122.3321,2017,540000000,'premium');
INSERT INTO brands (brand_name,brand_slug,brand_category,headquarters_city,headquarters_lat,headquarters_lon,founded_year,annual_revenue,social_tier) VALUES ('NeonKids','neonkids','Family Entertainment','Orlando',28.5383,-81.3792,2013,360000000,'standard');
INSERT INTO brands (brand_name,brand_slug,brand_category,headquarters_city,headquarters_lat,headquarters_lon,founded_year,annual_revenue,social_tier) VALUES ('SportsCast Plus','sportscast','Sports Media','Dallas',32.7767,-96.797,2009,790000000,'premium');
INSERT INTO brands (brand_name,brand_slug,brand_category,headquarters_city,headquarters_lat,headquarters_lon,founded_year,annual_revenue,social_tier) VALUES ('DocuWorld','docuworld','Documentary','Washington',38.9072,-77.0369,2018,140000000,'emerging');
INSERT INTO brands (brand_name,brand_slug,brand_category,headquarters_city,headquarters_lat,headquarters_lon,founded_year,annual_revenue,social_tier) VALUES ('KDrama Hub','kdramahub','International Streaming','San Francisco',37.7749,-122.4194,2020,320000000,'standard');
INSERT INTO brands (brand_name,brand_slug,brand_category,headquarters_city,headquarters_lat,headquarters_lon,founded_year,annual_revenue,social_tier) VALUES ('IndieFrame','indieframe','Independent Film','Portland',45.5152,-122.6784,2016,95000000,'emerging');
INSERT INTO brands (brand_name,brand_slug,brand_category,headquarters_city,headquarters_lat,headquarters_lon,founded_year,annual_revenue,social_tier) VALUES ('AnimeForge','animeforge','Animation','Austin',30.2672,-97.7431,2019,210000000,'standard');
INSERT INTO brands (brand_name,brand_slug,brand_category,headquarters_city,headquarters_lat,headquarters_lon,founded_year,annual_revenue,social_tier) VALUES ('LatinStream','latinstream','Spanish-Language Media','Miami',25.7617,-80.1918,2014,260000000,'standard');
COMMIT;
PROMPT Studios and labels loaded: 12

-- ============================================================
-- DISTRIBUTION / AD OPS HUBS (12) - individual INSERTs
-- ============================================================
PROMPT Loading distribution hubs...

INSERT INTO fulfillment_centers (center_name,center_type,city,state_province,postal_code,country,latitude,longitude,capacity_units) VALUES ('NYC Content Operations Hub','distribution','Edison','New Jersey','08817','US',40.5187,-74.4121,240000);
INSERT INTO fulfillment_centers (center_name,center_type,city,state_province,postal_code,country,latitude,longitude,capacity_units) VALUES ('Los Angeles Studio Coverage Desk','warehouse','Burbank','California','91505','US',34.1808,-118.3089,320000);
INSERT INTO fulfillment_centers (center_name,center_type,city,state_province,postal_code,country,latitude,longitude,capacity_units) VALUES ('Chicago Midwest Ad Ops Hub','distribution','Joliet','Illinois','60435','US',41.525,-88.0817,210000);
INSERT INTO fulfillment_centers (center_name,center_type,city,state_province,postal_code,country,latitude,longitude,capacity_units) VALUES ('Dallas Sports Rights Desk','warehouse','Irving','Texas','75039','US',32.8755,-96.944,185000);
INSERT INTO fulfillment_centers (center_name,center_type,city,state_province,postal_code,country,latitude,longitude,capacity_units) VALUES ('Atlanta Theatrical Booking Center','distribution','Atlanta','Georgia','30308','US',33.7715,-84.3871,220000);
INSERT INTO fulfillment_centers (center_name,center_type,city,state_province,postal_code,country,latitude,longitude,capacity_units) VALUES ('Seattle Streaming Launch Desk','micro','Bellevue','Washington','98004','US',47.6101,-122.2015,95000);
INSERT INTO fulfillment_centers (center_name,center_type,city,state_province,postal_code,country,latitude,longitude,capacity_units) VALUES ('Miami LatinStream Audience Hub','distribution','Hialeah','Florida','33012','US',25.8576,-80.2781,120000);
INSERT INTO fulfillment_centers (center_name,center_type,city,state_province,postal_code,country,latitude,longitude,capacity_units) VALUES ('Denver Mountain Region Ad Ops','warehouse','Aurora','Colorado','80011','US',39.7294,-104.8319,110000);
INSERT INTO fulfillment_centers (center_name,center_type,city,state_province,postal_code,country,latitude,longitude,capacity_units) VALUES ('Phoenix FAST Channel Desk','warehouse','Goodyear','Arizona','85338','US',33.4353,-112.3577,135000);
INSERT INTO fulfillment_centers (center_name,center_type,city,state_province,postal_code,country,latitude,longitude,capacity_units) VALUES ('Boston Family Programming Hub','micro','Fall River','Massachusetts','02720','US',41.7015,-71.155,88000);
INSERT INTO fulfillment_centers (center_name,center_type,city,state_province,postal_code,country,latitude,longitude,capacity_units) VALUES ('Houston Live Events Rights Hub','distribution','Missouri City','Texas','77459','US',29.6186,-95.5377,150000);
INSERT INTO fulfillment_centers (center_name,center_type,city,state_province,postal_code,country,latitude,longitude,capacity_units) VALUES ('Bay Area International Launch Desk','micro','Fremont','California','94538','US',37.5485,-121.9886,90000);
COMMIT;
PROMPT Distribution hubs loaded: 12

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
                'Media and Entertainment Demo Data' AS active_label,
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

PROMPT Applying media semantic metadata and views...
WHENEVER OSERROR EXIT FAILURE
@/workspace/app/db/schema/09_comments.sql
@/workspace/app/db/schema/10_media_semantic_views.sql

PROMPT =====================================================
PROMPT All data loaded successfully!
PROMPT =====================================================
