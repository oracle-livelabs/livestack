/*
 * load_all_data.sql
 * Master data loader — runs all data scripts in order
 * Generates ~5000  hospitality risk and demand signals, ~90 products and revenue centers, 50 properties,
 * 30 property hotels, ~483 signal sources, 2000 guests, 3000 orders
 *
 * NOTE: Uses individual INSERTs (not INSERT ALL) for tables with identity
 * columns to avoid ORA-00001 duplicate identity values on Oracle 23ai.
 */

SET SERVEROUTPUT ON
SET DEFINE OFF

PROMPT =====================================================
PROMPT Loading Hospitality Services Demo Data
PROMPT =====================================================

-- ============================================================
-- INSTITUTIONS (50) - individual INSERTs to avoid identity dup issue
-- ============================================================
PROMPT Loading properties...

INSERT INTO brands (brand_name,brand_slug,brand_category,headquarters_city,headquarters_lat,headquarters_lon,founded_year,annual_revenue,social_tier) VALUES ('Grand Harbor Hotel','harborstone-grand-harbor','Urban Hotel','Houston',29.7604,-95.3698,1998,245000000,'premium');
INSERT INTO brands (brand_name,brand_slug,brand_category,headquarters_city,headquarters_lat,headquarters_lon,founded_year,annual_revenue,social_tier) VALUES ('Canyon Reserve Resort','canyon-reserve-resort','Luxury Hospitality','Newark',40.7357,-74.1724,2004,186000000,'premium');
INSERT INTO brands (brand_name,brand_slug,brand_category,headquarters_city,headquarters_lat,headquarters_lon,founded_year,annual_revenue,social_tier) VALUES ('Lakeside Chicago Hotel','harborstone-lakeside-inn','Lifestyle Hotel','Chicago',41.8781,-87.6298,1987,132000000,'premium');
INSERT INTO brands (brand_name,brand_slug,brand_category,headquarters_city,headquarters_lat,headquarters_lon,founded_year,annual_revenue,social_tier) VALUES ('Summit Resort','harborstone-summit-lodge','Resort Event Sales','Detroit',42.3314,-83.0458,1992,221000000,'luxury');
INSERT INTO brands (brand_name,brand_slug,brand_category,headquarters_city,headquarters_lat,headquarters_lon,founded_year,annual_revenue,social_tier) VALUES ('City Center Grand Hotel','st-regis-city-center','Luxury Hotel','Columbus',39.9612,-82.9988,2001,98000000,'standard');
INSERT INTO brands (brand_name,brand_slug,brand_category,headquarters_city,headquarters_lat,headquarters_lon,founded_year,annual_revenue,social_tier) VALUES ('Vineyard Resort','harborstone-vineyard-resort','Resort Operations','Des Moines',41.5868,-93.625,1979,154000000,'premium');
INSERT INTO brands (brand_name,brand_slug,brand_category,headquarters_city,headquarters_lat,headquarters_lon,founded_year,annual_revenue,social_tier) VALUES ('Shoreline Beach Club','harborstone-beach-club','Beach Resort','Reno',39.5296,-119.8138,2016,91000000,'premium');
INSERT INTO brands (brand_name,brand_slug,brand_category,headquarters_city,headquarters_lat,headquarters_lon,founded_year,annual_revenue,social_tier) VALUES ('Landmark Convention Center','harborstone-convention-center','Events Venue','Boston',42.3601,-71.0589,2011,43000000,'standard');
INSERT INTO brands (brand_name,brand_slug,brand_category,headquarters_city,headquarters_lat,headquarters_lon,founded_year,annual_revenue,social_tier) VALUES ('Grand Garden Hotel','harborstone-garden-hotel','Urban Hotel','Cleveland',41.4993,-81.6944,1968,275000000,'luxury');
INSERT INTO brands (brand_name,brand_slug,brand_category,headquarters_city,headquarters_lat,headquarters_lon,founded_year,annual_revenue,social_tier) VALUES ('Springs Hotel Portland','springs-hotel-portland','Sustainable Hospitality','Portland',45.5152,-122.6784,2018,39000000,'emerging');
INSERT INTO brands (brand_name,brand_slug,brand_category,headquarters_city,headquarters_lat,headquarters_lon,founded_year,annual_revenue,social_tier) VALUES ('Airport Hotel Charlotte','harborstone-airport-hotel','Airport Hotel','Charlotte',35.2271,-80.8431,2007,76000000,'standard');
INSERT INTO brands (brand_name,brand_slug,brand_category,headquarters_city,headquarters_lat,headquarters_lon,founded_year,annual_revenue,social_tier) VALUES ('Dining and Events Hotel Tulsa','dining-events-hotel-tulsa','Food and Beverage','Tulsa',36.154,-95.9928,1996,117000000,'premium');
INSERT INTO brands (brand_name,brand_slug,brand_category,headquarters_city,headquarters_lat,headquarters_lon,founded_year,annual_revenue,social_tier) VALUES ('Mountain Spa Resort','northern-guestexp','Spa and Wellness','Minneapolis',44.9778,-93.265,2005,52000000,'standard');
INSERT INTO brands (brand_name,brand_slug,brand_category,headquarters_city,headquarters_lat,headquarters_lon,founded_year,annual_revenue,social_tier) VALUES ('Harborstone Gulf Coast Resort and Spa','harborstone-gulf-coast-resort','Revenue Operations','Baton Rouge',30.4515,-91.1871,1974,203000000,'premium');
INSERT INTO brands (brand_name,brand_slug,brand_category,headquarters_city,headquarters_lat,headquarters_lon,founded_year,annual_revenue,social_tier) VALUES ('Midwest Convention Hotel','harborstone-midwest-convention-hotel','Group Sales','Indianapolis',39.7684,-86.1581,1989,88000000,'standard');
INSERT INTO brands (brand_name,brand_slug,brand_category,headquarters_city,headquarters_lat,headquarters_lon,founded_year,annual_revenue,social_tier) VALUES ('Pacific Center Hotel','pacific-center-hotel','Folio Payments','Los Angeles',34.0522,-118.2437,1994,143000000,'premium');
INSERT INTO brands (brand_name,brand_slug,brand_category,headquarters_city,headquarters_lat,headquarters_lon,founded_year,annual_revenue,social_tier) VALUES ('Quality Services Hotel','quality-services-hotel','Guest Experience','San Jose',37.3382,-121.8863,2012,69000000,'standard');
INSERT INTO brands (brand_name,brand_slug,brand_category,headquarters_city,headquarters_lat,headquarters_lon,founded_year,annual_revenue,social_tier) VALUES ('Service Recovery Hotel','service-recovery-hotel','Group Booking Servicing','Memphis',35.1495,-90.049,2009,58000000,'standard');
INSERT INTO brands (brand_name,brand_slug,brand_category,headquarters_city,headquarters_lat,headquarters_lon,founded_year,annual_revenue,social_tier) VALUES ('Harborstone Waterfront Milwaukee','harborstone-waterfront-milwaukee','Association and Government Group','Milwaukee',43.0389,-87.9065,2003,74000000,'standard');
INSERT INTO brands (brand_name,brand_slug,brand_category,headquarters_city,headquarters_lat,headquarters_lon,founded_year,annual_revenue,social_tier) VALUES ('Wellness Retreat San Diego','wellness-retreat-san-diego','Wellness Hospitality','San Diego',32.7157,-117.1611,2015,46000000,'emerging');
INSERT INTO brands (brand_name,brand_slug,brand_category,headquarters_city,headquarters_lat,headquarters_lon,founded_year,annual_revenue,social_tier) VALUES ('Digital Guest Services Hotel','digital-guest-services-hotel','Digital Guest Services','Phoenix',33.4484,-112.074,2019,34000000,'emerging');
INSERT INTO brands (brand_name,brand_slug,brand_category,headquarters_city,headquarters_lat,headquarters_lon,founded_year,annual_revenue,social_tier) VALUES ('Sustainability Lodge','sustainability-lodge','Sustainable Hospitality','Seattle',47.6062,-122.3321,2021,21000000,'emerging');
INSERT INTO brands (brand_name,brand_slug,brand_category,headquarters_city,headquarters_lat,headquarters_lon,founded_year,annual_revenue,social_tier) VALUES ('Harborstone Operations Analytics Center','harborstone-operations-analytics','Operations Intelligence','Denver',39.7392,-104.9903,2014,18000000,'emerging');
INSERT INTO brands (brand_name,brand_slug,brand_category,headquarters_city,headquarters_lat,headquarters_lon,founded_year,annual_revenue,social_tier) VALUES ('Extended Stay Medical District','harborstone-medical-district-hotel','Group Billing','Philadelphia',39.9526,-75.1652,1999,112000000,'premium');
INSERT INTO brands (brand_name,brand_slug,brand_category,headquarters_city,headquarters_lat,headquarters_lon,founded_year,annual_revenue,social_tier) VALUES ('CleanStay Cincinnati Hotel','harborstone-cleanstay-hotel','Select-Service Hotel','Cincinnati',39.1031,-84.512,2008,65000000,'standard');
INSERT INTO brands (brand_name,brand_slug,brand_category,headquarters_city,headquarters_lat,headquarters_lon,founded_year,annual_revenue,social_tier) VALUES ('Harborstone Bridge Revenue Hotel','harborstone-bridge-hotel','Revenue Management','Atlanta',33.749,-84.388,1991,126000000,'premium');
INSERT INTO brands (brand_name,brand_slug,brand_category,headquarters_city,headquarters_lat,headquarters_lon,founded_year,annual_revenue,social_tier) VALUES ('Harborstone Continuity Guest Desk','harborstone-continuity-desk','Guest Experience Operations Risk','Dallas',32.7767,-96.797,2013,47000000,'standard');
INSERT INTO brands (brand_name,brand_slug,brand_category,headquarters_city,headquarters_lat,headquarters_lon,founded_year,annual_revenue,social_tier) VALUES ('Harborstone Direct Booking Center','harborstone-direct-booking-desk','Digital Hospitality','Raleigh',35.7796,-78.6382,2006,82000000,'standard');
INSERT INTO brands (brand_name,brand_slug,brand_category,headquarters_city,headquarters_lat,headquarters_lon,founded_year,annual_revenue,social_tier) VALUES ('Harborstone Portside Events Hotel','harborstone-portside-hotel','Event Revenue','Savannah',32.0809,-81.0912,1985,157000000,'premium');
INSERT INTO brands (brand_name,brand_slug,brand_category,headquarters_city,headquarters_lat,headquarters_lon,founded_year,annual_revenue,social_tier) VALUES ('Extended Stay Kansas City','harborstone-extended-stay','Extended Stay','Kansas City',39.0997,-94.5786,1997,93000000,'standard');
INSERT INTO brands (brand_name,brand_slug,brand_category,headquarters_city,headquarters_lat,headquarters_lon,founded_year,annual_revenue,social_tier) VALUES ('Harborstone U.S. Property Portfolio','harborstone-portfolio','Property Portfolio','St. Louis',38.627,-90.1994,1982,138000000,'premium');
INSERT INTO brands (brand_name,brand_slug,brand_category,headquarters_city,headquarters_lat,headquarters_lon,founded_year,annual_revenue,social_tier) VALUES ('Tech District Hotel','tech-district-hotel','Luxury Hospitality','Akron',41.0814,-81.519,2002,71000000,'standard');
INSERT INTO brands (brand_name,brand_slug,brand_category,headquarters_city,headquarters_lat,headquarters_lon,founded_year,annual_revenue,social_tier) VALUES ('GreenStay Pittsburgh Hotel','harborstone-sustainability-hotel','Sustainability','Pittsburgh',40.4406,-79.9959,1978,99000000,'standard');
INSERT INTO brands (brand_name,brand_slug,brand_category,headquarters_city,headquarters_lat,headquarters_lon,founded_year,annual_revenue,social_tier) VALUES ('Harborstone Guest Protection Desk','harborstone-guest-protection','Guest Protection','Tampa',27.9506,-82.4572,1995,61000000,'standard');
INSERT INTO brands (brand_name,brand_slug,brand_category,headquarters_city,headquarters_lat,headquarters_lon,founded_year,annual_revenue,social_tier) VALUES ('City Center Grand VIP Planning Events','harborstone-signature-events','Events Operations','Baltimore',39.2904,-76.6122,2000,55000000,'standard');
INSERT INTO brands (brand_name,brand_slug,brand_category,headquarters_city,headquarters_lat,headquarters_lon,founded_year,annual_revenue,social_tier) VALUES ('Harborstone Coastal Resort Wilmington','harborstone-coastal-resort-wilmington','Regional Hospitality','Wilmington',34.2257,-77.9447,1993,104000000,'premium');
INSERT INTO brands (brand_name,brand_slug,brand_category,headquarters_city,headquarters_lat,headquarters_lon,founded_year,annual_revenue,social_tier) VALUES ('Harborstone Assurance Services Desk','harborstone-assurance-services','Guest Protection','Nashville',36.1627,-86.7816,2006,57000000,'standard');
INSERT INTO brands (brand_name,brand_slug,brand_category,headquarters_city,headquarters_lat,headquarters_lon,founded_year,annual_revenue,social_tier) VALUES ('Harborstone Partner Direct Desk','harborstone-partner-direct','Partner Hospitality','San Antonio',29.4241,-98.4936,1990,118000000,'premium');
INSERT INTO brands (brand_name,brand_slug,brand_category,headquarters_city,headquarters_lat,headquarters_lon,founded_year,annual_revenue,social_tier) VALUES ('Harborstone Apex Resort Louisville','harborstone-apex-resort','Resort Operations','Louisville',38.2527,-85.7585,2004,67000000,'standard');
INSERT INTO brands (brand_name,brand_slug,brand_category,headquarters_city,headquarters_lat,headquarters_lon,founded_year,annual_revenue,social_tier) VALUES ('Harborstone Group Sales Strategy Center','harborstone-group-sales','Long-Stay Hospitality','Omaha',41.2565,-95.9345,1988,149000000,'premium');
INSERT INTO brands (brand_name,brand_slug,brand_category,headquarters_city,headquarters_lat,headquarters_lon,founded_year,annual_revenue,social_tier) VALUES ('Harborstone Continuity New Orleans Hotel','harborstone-continuity-operations','Operational Resilience','New Orleans',29.9511,-90.0715,2001,59000000,'standard');
INSERT INTO brands (brand_name,brand_slug,brand_category,headquarters_city,headquarters_lat,headquarters_lon,founded_year,annual_revenue,social_tier) VALUES ('Harborstone Channel Watch Austin','harborstone-channel-watch','Channel Intelligence','Austin',30.2672,-97.7431,2020,26000000,'emerging');
INSERT INTO brands (brand_name,brand_slug,brand_category,headquarters_city,headquarters_lat,headquarters_lon,founded_year,annual_revenue,social_tier) VALUES ('Harborstone Brand Standards Office','harborstone-brand-standards-office','Brand Standards','Washington',38.9072,-77.0369,2017,31000000,'emerging');
INSERT INTO brands (brand_name,brand_slug,brand_category,headquarters_city,headquarters_lat,headquarters_lon,founded_year,annual_revenue,social_tier) VALUES ('Harborstone Brand Standards Desk','harborstone-brand-standards','Brand Standards','Washington',38.9072,-77.0369,2010,44000000,'standard');
INSERT INTO brands (brand_name,brand_slug,brand_category,headquarters_city,headquarters_lat,headquarters_lon,founded_year,annual_revenue,social_tier) VALUES ('Harborstone Demand Signals Lab','harborstone-demand-signals','Demand Data','Long Beach',33.7701,-118.1937,2018,29000000,'emerging');
INSERT INTO brands (brand_name,brand_slug,brand_category,headquarters_city,headquarters_lat,headquarters_lon,founded_year,annual_revenue,social_tier) VALUES ('Harborstone Property Operations Las Vegas','harborstone-property-operations','Property Operations','Las Vegas',36.1699,-115.1398,2012,51000000,'standard');
INSERT INTO brands (brand_name,brand_slug,brand_category,headquarters_city,headquarters_lat,headquarters_lon,founded_year,annual_revenue,social_tier) VALUES ('Harborstone U.S. Property Portfolio Desk','harborstone-portfolio-insights','Property Portfolio Signals','Cleveland',41.4993,-81.6944,2016,37000000,'emerging');
INSERT INTO brands (brand_name,brand_slug,brand_category,headquarters_city,headquarters_lat,headquarters_lon,founded_year,annual_revenue,social_tier) VALUES ('Harborstone Data Connect Center','harborstone-data-connect','Data Services','Salt Lake City',40.7608,-111.891,2009,48000000,'standard');
INSERT INTO brands (brand_name,brand_slug,brand_category,headquarters_city,headquarters_lat,headquarters_lon,founded_year,annual_revenue,social_tier) VALUES ('Harborstone Events Exchange Miami','harborstone-events-exchange','Revenue Management','Miami',25.7617,-80.1918,2015,63000000,'standard');
INSERT INTO brands (brand_name,brand_slug,brand_category,headquarters_city,headquarters_lat,headquarters_lon,founded_year,annual_revenue,social_tier) VALUES ('Harborstone NorthStar Group Sales','harborstone-northstar-lodge','Group Sales','Fargo',46.8772,-96.7898,2008,54000000,'standard');
COMMIT;
PROMPT Properties loaded: 50

-- ============================================================
-- FULFILLMENT CENTERS (30) — individual INSERTs
-- ============================================================
PROMPT Loading property hotels...

INSERT INTO fulfillment_centers (center_name,center_type,city,state_province,postal_code,country,latitude,longitude,capacity_units,current_load_pct) VALUES ('Summit Grand Edison Metro Hotel','Full-Service Hotel','Edison','New Jersey','08817','US',40.5187,-74.4121,240,15.8);
INSERT INTO fulfillment_centers (center_name,center_type,city,state_province,postal_code,country,latitude,longitude,capacity_units,current_load_pct) VALUES ('Airport Hotel Ontario Airport Hotel','Select-Service Hotel','Ontario','California','91761','US',34.0633,-117.6509,190,13.7);
INSERT INTO fulfillment_centers (center_name,center_type,city,state_province,postal_code,country,latitude,longitude,capacity_units,current_load_pct) VALUES ('Joliet Gateway Hotel','Select-Service Hotel','Joliet','Illinois','60435','US',41.5250,-88.0817,126,19.8);
INSERT INTO fulfillment_centers (center_name,center_type,city,state_province,postal_code,country,latitude,longitude,capacity_units,current_load_pct) VALUES ('Harborstone Lancaster South Hotel','Full-Service Hotel','Lancaster','Texas','75134','US',32.5921,-96.7561,205,11.7);
INSERT INTO fulfillment_centers (center_name,center_type,city,state_province,postal_code,country,latitude,longitude,capacity_units,current_load_pct) VALUES ('Airport Hotel Union City Atlanta Airport','Select-Service Hotel','Union City','Georgia','30291','US',33.5871,-84.5421,150,17.3);
INSERT INTO fulfillment_centers (center_name,center_type,city,state_province,postal_code,country,latitude,longitude,capacity_units,current_load_pct) VALUES ('Extended Stay Kent Valley','Extended-Stay Hotel','Kent','Washington','98032','US',47.3809,-122.2348,132,18.9);
INSERT INTO fulfillment_centers (center_name,center_type,city,state_province,postal_code,country,latitude,longitude,capacity_units,current_load_pct) VALUES ('Hialeah Miami Lakes Hotel','Full-Service Hotel','Hialeah','Florida','33012','US',25.8576,-80.2781,145,22.8);
INSERT INTO fulfillment_centers (center_name,center_type,city,state_province,postal_code,country,latitude,longitude,capacity_units,current_load_pct) VALUES ('Summit Grand Denver Downtown Hotel','Full-Service Hotel','Denver','Colorado','80202','US',39.7392,-104.9903,250,7.6);
INSERT INTO fulfillment_centers (center_name,center_type,city,state_province,postal_code,country,latitude,longitude,capacity_units,current_load_pct) VALUES ('Phoenix West Hotel','Full-Service Hotel','Mesa','Arizona','85201','US',33.4353,-112.3577,170,12.9);
INSERT INTO fulfillment_centers (center_name,center_type,city,state_province,postal_code,country,latitude,longitude,capacity_units,current_load_pct) VALUES ('Fall River Waterfront Hotel','Select-Service Hotel','Fall River','Massachusetts','02720','US',41.7015,-71.1550,108,23.1);
INSERT INTO fulfillment_centers (center_name,center_type,city,state_province,postal_code,country,latitude,longitude,capacity_units,current_load_pct) VALUES ('Airport Hotel Shakopee Valley','Select-Service Hotel','Shakopee','Minnesota','55379','US',44.7974,-93.5272,116,21.6);
INSERT INTO fulfillment_centers (center_name,center_type,city,state_province,postal_code,country,latitude,longitude,capacity_units,current_load_pct) VALUES ('Troutdale Extended Stay','Extended-Stay Hotel','Troutdale','Oregon','97060','US',45.5390,-122.3872,95,26.3);
INSERT INTO fulfillment_centers (center_name,center_type,city,state_province,postal_code,country,latitude,longitude,capacity_units,current_load_pct) VALUES ('Extended Stay Lebanon Nashville','Extended-Stay Hotel','Lebanon','Tennessee','37087','US',36.2081,-86.2911,124,23.4);
INSERT INTO fulfillment_centers (center_name,center_type,city,state_province,postal_code,country,latitude,longitude,capacity_units,current_load_pct) VALUES ('Fremont Silicon Valley Hotel','Select-Service Hotel','Fremont','California','94538','US',37.5485,-121.9886,138,18.1);
INSERT INTO fulfillment_centers (center_name,center_type,city,state_province,postal_code,country,latitude,longitude,capacity_units,current_load_pct) VALUES ('Grand Garden Detroit Metro Airport','Full-Service Hotel','Romulus','Michigan','48174','US',42.2223,-83.3963,215,9.3);
INSERT INTO fulfillment_centers (center_name,center_type,city,state_province,postal_code,country,latitude,longitude,capacity_units,current_load_pct) VALUES ('Middletown Delaware Hotel','Select-Service Hotel','Middletown','Delaware','19709','US',39.4496,-75.7163,102,23.5);
INSERT INTO fulfillment_centers (center_name,center_type,city,state_province,postal_code,country,latitude,longitude,capacity_units,current_load_pct) VALUES ('Harborstone Missouri City Gulf Coast Resort','Resort Property','Missouri City','Texas','77459','US',29.6186,-95.5377,220,10.5);
INSERT INTO fulfillment_centers (center_name,center_type,city,state_province,postal_code,country,latitude,longitude,capacity_units,current_load_pct) VALUES ('SpringHill Suites West Jordan','Select-Service Hotel','West Jordan','Utah','84084','US',40.6097,-111.9391,118,24.6);
INSERT INTO fulfillment_centers (center_name,center_type,city,state_province,postal_code,country,latitude,longitude,capacity_units,current_load_pct) VALUES ('Airport Hotel Concord Mills','Select-Service Hotel','Concord','North Carolina','28027','US',35.4088,-80.5795,112,19.6);
INSERT INTO fulfillment_centers (center_name,center_type,city,state_province,postal_code,country,latitude,longitude,capacity_units,current_load_pct) VALUES ('Extended Stay Plainfield Indianapolis','Extended-Stay Hotel','Plainfield','Indiana','46168','US',39.7043,-86.3994,122,26.2);
INSERT INTO fulfillment_centers (center_name,center_type,city,state_province,postal_code,country,latitude,longitude,capacity_units,current_load_pct) VALUES ('Harborstone North Las Vegas Hotel','Full-Service Hotel','North Las Vegas','Nevada','89030','US',36.1989,-115.1175,210,12.9);
INSERT INTO fulfillment_centers (center_name,center_type,city,state_province,postal_code,country,latitude,longitude,capacity_units,current_load_pct) VALUES ('Edwardsville Kansas City Hotel','Select-Service Hotel','Edwardsville','Kansas','66111','US',39.0614,-94.8193,104,26.0);
INSERT INTO fulfillment_centers (center_name,center_type,city,state_province,postal_code,country,latitude,longitude,capacity_units,current_load_pct) VALUES ('Airport Hotel Etna Columbus','Select-Service Hotel','Etna','Ohio','43018','US',39.9576,-82.6818,110,20.0);
INSERT INTO fulfillment_centers (center_name,center_type,city,state_province,postal_code,country,latitude,longitude,capacity_units,current_load_pct) VALUES ('Sparks Reno Hotel','Select-Service Hotel','Sparks','Nevada','89431','US',39.5349,-119.7527,128,21.1);
INSERT INTO fulfillment_centers (center_name,center_type,city,state_province,postal_code,country,latitude,longitude,capacity_units,current_load_pct) VALUES ('Brandon Tampa Extended Stay','Extended-Stay Hotel','Brandon','Florida','33510','US',27.9378,-82.2859,92,26.1);
INSERT INTO fulfillment_centers (center_name,center_type,city,state_province,postal_code,country,latitude,longitude,capacity_units,current_load_pct) VALUES ('Extended Stay Aberdeen Chesapeake','Extended-Stay Hotel','Aberdeen','Maryland','21001','US',39.5096,-76.1641,120,19.2);
INSERT INTO fulfillment_centers (center_name,center_type,city,state_province,postal_code,country,latitude,longitude,capacity_units,current_load_pct) VALUES ('Airport Hotel New Braunfels Riverwalk','Select-Service Hotel','New Braunfels','Texas','78130','US',29.7030,-98.1245,125,15.2);
INSERT INTO fulfillment_centers (center_name,center_type,city,state_province,postal_code,country,latitude,longitude,capacity_units,current_load_pct) VALUES ('Olive Branch Memphis Hotel','Select-Service Hotel','Olive Branch','Mississippi','38654','US',34.9618,-89.8295,118,11.9);
INSERT INTO fulfillment_centers (center_name,center_type,city,state_province,postal_code,country,latitude,longitude,capacity_units,current_load_pct) VALUES ('Harborstone Kapolei Beach Resort','Resort Property','Kapolei','Hawaii','96707','US',21.3350,-158.0581,160,18.8);
INSERT INTO fulfillment_centers (center_name,center_type,city,state_province,postal_code,country,latitude,longitude,capacity_units,current_load_pct) VALUES ('SpringHill Suites Anchorage Downtown','Select-Service Hotel','Anchorage','Alaska','99501','US',61.2181,-149.9003,105,19.0);
COMMIT;
PROMPT Property hotels loaded: 30

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
                'Demo Data' AS active_label,
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

PROMPT =====================================================
PROMPT All data loaded successfully!
PROMPT =====================================================
