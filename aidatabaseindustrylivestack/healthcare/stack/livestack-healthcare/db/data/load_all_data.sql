/*
 * load_all_data.sql
 * Master data loader — runs all data scripts in order
 * Generates ~5000 regulatory, quality, and care capacity signals, ~90 products, 50 manufacturers,
 * 30 fulfillment sites, ~483 signal sources, 2000 care sites, 3000 orders
 *
 * NOTE: Uses individual INSERTs (not INSERT ALL) for tables with identity
 * columns to avoid ORA-00001 duplicate identity values on Oracle 23ai.
 */

SET SERVEROUTPUT ON
SET DEFINE OFF

PROMPT =====================================================
PROMPT Loading Healthcare Demo Data
PROMPT =====================================================

-- ============================================================
-- provider networks and healthcare partners (50) - individual INSERTs
-- ============================================================
PROMPT Loading provider networks...

INSERT INTO brands (brand_name,brand_slug,brand_category,headquarters_city,headquarters_lat,headquarters_lon,founded_year,annual_revenue,social_tier) VALUES ('NorthStar Health System','vitacore','Specialty Care Manufacturing','Boston',42.3601,-71.0589,1998,245000000,'premium');
INSERT INTO brands (brand_name,brand_slug,brand_category,headquarters_city,headquarters_lat,headquarters_lon,founded_year,annual_revenue,social_tier) VALUES ('CarePath Clinics','solvanta','Care Operations','Research Triangle Park',35.9049,-78.8640,2004,186000000,'premium');
INSERT INTO brands (brand_name,brand_slug,brand_category,headquarters_city,headquarters_lat,headquarters_lon,founded_year,annual_revenue,social_tier) VALUES ('BioPure Diagnostics','biopure','Diagnostics','Chicago',41.8781,-87.6298,1987,132000000,'premium');
INSERT INTO brands (brand_name,brand_slug,brand_category,headquarters_city,headquarters_lat,headquarters_lon,founded_year,annual_revenue,social_tier) VALUES ('Regional Oncology Network','genenova','Specialty Care','Cambridge',42.3736,-71.1097,1992,221000000,'luxury');
INSERT INTO brands (brand_name,brand_slug,brand_category,headquarters_city,headquarters_lat,headquarters_lon,founded_year,annual_revenue,social_tier) VALUES ('Immunology Care Alliance','immunoworks','Specialty Care','South San Francisco',37.6547,-122.4077,2001,98000000,'standard');
INSERT INTO brands (brand_name,brand_slug,brand_category,headquarters_city,headquarters_lat,headquarters_lon,founded_year,annual_revenue,social_tier) VALUES ('Community Health Partners','preclinix','Population Health Research','San Diego',32.7157,-117.1611,1979,154000000,'premium');
INSERT INTO brands (brand_name,brand_slug,brand_category,headquarters_city,headquarters_lat,headquarters_lon,founded_year,annual_revenue,social_tier) VALUES ('MedMove Logistics','cryograde','Care Logistics','Memphis',35.1495,-90.0490,2016,91000000,'premium');
INSERT INTO brands (brand_name,brand_slug,brand_category,headquarters_city,headquarters_lat,headquarters_lon,founded_year,annual_revenue,social_tier) VALUES ('QualityBridge Advisory','safegxp','Quality and Compliance Services','Rockville',39.0840,-77.1528,2011,43000000,'standard');
INSERT INTO brands (brand_name,brand_slug,brand_category,headquarters_city,headquarters_lat,headquarters_lon,founded_year,annual_revenue,social_tier) VALUES ('Central Sterile Services','sterileprocess','Bioprocess Consumables','Cleveland',41.4993,-81.6944,1968,275000000,'luxury');
INSERT INTO brands (brand_name,brand_slug,brand_category,headquarters_city,headquarters_lat,headquarters_lon,founded_year,annual_revenue,social_tier) VALUES ('GreenCare Supplies','greenlab','Sustainable Lab Supplies','Portland',45.5152,-122.6784,2018,39000000,'emerging');
INSERT INTO brands (brand_name,brand_slug,brand_category,headquarters_city,headquarters_lat,headquarters_lon,founded_year,annual_revenue,social_tier) VALUES ('MedDevice Services','medpack','Device Packaging','Charlotte',35.2271,-80.8431,2007,76000000,'standard');
INSERT INTO brands (brand_name,brand_slug,brand_category,headquarters_city,headquarters_lat,headquarters_lon,founded_year,annual_revenue,social_tier) VALUES ('CareFlow Analytics','catalysthub','Operations Analytics','Tulsa',36.1540,-95.9928,1996,117000000,'premium');
INSERT INTO brands (brand_name,brand_slug,brand_category,headquarters_city,headquarters_lat,headquarters_lon,founded_year,annual_revenue,social_tier) VALUES ('Northern BioReagents','northernreagents','Lab Reagents','Minneapolis',44.9778,-93.2650,2005,52000000,'standard');
INSERT INTO brands (brand_name,brand_slug,brand_category,headquarters_city,headquarters_lat,headquarters_lon,founded_year,annual_revenue,social_tier) VALUES ('Gulf Vaccine Bed Management','gulfvaccine','Vaccine Manufacturing','Baton Rouge',30.4515,-91.1871,1974,203000000,'premium');
INSERT INTO brands (brand_name,brand_slug,brand_category,headquarters_city,headquarters_lat,headquarters_lon,founded_year,annual_revenue,social_tier) VALUES ('Midwest Care Capacity','midwesttrial','Healthcare Operations Supply','Indianapolis',39.7684,-86.1581,1989,88000000,'standard');
INSERT INTO brands (brand_name,brand_slug,brand_category,headquarters_city,headquarters_lat,headquarters_lon,founded_year,annual_revenue,social_tier) VALUES ('Pacific BioServices','pacificbio','CDMO Services','Los Angeles',34.0522,-118.2437,1994,143000000,'premium');
INSERT INTO brands (brand_name,brand_slug,brand_category,headquarters_city,headquarters_lat,headquarters_lon,founded_year,annual_revenue,social_tier) VALUES ('PurityLabs IVD','puritylabs','Diagnostics','San Jose',37.3382,-121.8863,2012,69000000,'standard');
INSERT INTO brands (brand_name,brand_slug,brand_category,headquarters_city,headquarters_lat,headquarters_lon,founded_year,annual_revenue,social_tier) VALUES ('CryoRoute Logistics','cryoroute','Care Logistics','Memphis',35.1495,-90.0490,2009,58000000,'standard');
INSERT INTO brands (brand_name,brand_slug,brand_category,headquarters_city,headquarters_lat,headquarters_lon,founded_year,annual_revenue,social_tier) VALUES ('WaterWorks BioUtilities','waterworkslab','GMP Utilities','Milwaukee',43.0389,-87.9065,2003,74000000,'standard');
INSERT INTO brands (brand_name,brand_slug,brand_category,headquarters_city,headquarters_lat,headquarters_lon,founded_year,annual_revenue,social_tier) VALUES ('BioBuffer','biobuffer','Pharmacy Supply','San Diego',32.7157,-117.1611,2015,46000000,'emerging');
INSERT INTO brands (brand_name,brand_slug,brand_category,headquarters_city,headquarters_lat,headquarters_lon,founded_year,annual_revenue,social_tier) VALUES ('ElectrolyteWorks Clinical','electrolyteworks','Diagnostic Reagents','Phoenix',33.4484,-112.0740,2019,34000000,'emerging');
INSERT INTO brands (brand_name,brand_slug,brand_category,headquarters_city,headquarters_lat,headquarters_lon,founded_year,annual_revenue,social_tier) VALUES ('RecyBio Labs','recybio','Circular Lab Supplies','Seattle',47.6062,-122.3321,2021,21000000,'emerging');
INSERT INTO brands (brand_name,brand_slug,brand_category,headquarters_city,headquarters_lat,headquarters_lon,founded_year,annual_revenue,social_tier) VALUES ('GxPDesk','gxpdesk','Regulatory Content','Denver',39.7392,-104.9903,2014,18000000,'emerging');
INSERT INTO brands (brand_name,brand_slug,brand_category,headquarters_city,headquarters_lat,headquarters_lon,founded_year,annual_revenue,social_tier) VALUES ('PharmaPrep','pharmaprep','Pharmacy Supply','Philadelphia',39.9526,-75.1652,1999,112000000,'premium');
INSERT INTO brands (brand_name,brand_slug,brand_category,headquarters_city,headquarters_lat,headquarters_lon,founded_year,annual_revenue,social_tier) VALUES ('CleanSuite Healthcare','cleansuite','Cleanroom Services','Cincinnati',39.1031,-84.5120,2008,65000000,'standard');
INSERT INTO brands (brand_name,brand_slug,brand_category,headquarters_city,headquarters_lat,headquarters_lon,founded_year,annual_revenue,social_tier) VALUES ('FormulationBridge','formulationbridge','Drug Product Formulation','Atlanta',33.7490,-84.3880,1991,126000000,'premium');
INSERT INTO brands (brand_name,brand_slug,brand_category,headquarters_city,headquarters_lat,headquarters_lon,founded_year,annual_revenue,social_tier) VALUES ('SpecimenShield','specimenshield','Specimen Logistics','Dallas',32.7767,-96.7970,2013,47000000,'standard');
INSERT INTO brands (brand_name,brand_slug,brand_category,headquarters_city,headquarters_lat,headquarters_lon,founded_year,annual_revenue,social_tier) VALUES ('FineBio Direct','finebiodirect','Specialty Specialty Care','Raleigh',35.7796,-78.6382,2006,82000000,'standard');
INSERT INTO brands (brand_name,brand_slug,brand_category,headquarters_city,headquarters_lat,headquarters_lon,founded_year,annual_revenue,social_tier) VALUES ('PortBio Supply','portbio','Global API Import','Savannah',32.0809,-81.0912,1985,157000000,'premium');
INSERT INTO brands (brand_name,brand_slug,brand_category,headquarters_city,headquarters_lat,headquarters_lon,founded_year,annual_revenue,social_tier) VALUES ('Peptide Partners','peptidepartners','API Intermediates','Kansas City',39.0997,-94.5786,1997,93000000,'standard');
INSERT INTO brands (brand_name,brand_slug,brand_category,headquarters_city,headquarters_lat,headquarters_lon,founded_year,annual_revenue,social_tier) VALUES ('PurePAC Clinical','purepac','Clinical Packaging','St. Louis',38.6270,-90.1994,1982,138000000,'premium');
INSERT INTO brands (brand_name,brand_slug,brand_category,headquarters_city,headquarters_lat,headquarters_lon,founded_year,annual_revenue,social_tier) VALUES ('SiliconeWorks Medical','siliconeworks','Device Components','Akron',41.0814,-81.5190,2002,71000000,'standard');
INSERT INTO brands (brand_name,brand_slug,brand_category,headquarters_city,headquarters_lat,headquarters_lon,founded_year,annual_revenue,social_tier) VALUES ('EndoClear BioProcess','endoclear','Bioprocess Filtration','Pittsburgh',40.4406,-79.9959,1978,99000000,'standard');
INSERT INTO brands (brand_name,brand_slug,brand_category,headquarters_city,headquarters_lat,headquarters_lon,founded_year,annual_revenue,social_tier) VALUES ('SterilityGuard','sterilityguard','Sterility Assurance','Tampa',27.9506,-82.4572,1995,61000000,'standard');
INSERT INTO brands (brand_name,brand_slug,brand_category,headquarters_city,headquarters_lat,headquarters_lon,founded_year,annual_revenue,social_tier) VALUES ('Readmission ReviewCo','stabilityco','Readmission Review Excipients','Baltimore',39.2904,-76.6122,2000,55000000,'standard');
INSERT INTO brands (brand_name,brand_slug,brand_category,headquarters_city,headquarters_lat,headquarters_lon,founded_year,annual_revenue,social_tier) VALUES ('AseptiCoast','asepticoast','Aseptic Processing','Wilmington',34.2257,-77.9447,1993,104000000,'premium');
INSERT INTO brands (brand_name,brand_slug,brand_category,headquarters_city,headquarters_lat,headquarters_lon,founded_year,annual_revenue,social_tier) VALUES ('CitrateSource Pharma','citricsource','Pharmacy Supply','Nashville',36.1627,-86.7816,2006,57000000,'standard');
INSERT INTO brands (brand_name,brand_slug,brand_category,headquarters_city,headquarters_lat,headquarters_lon,founded_year,annual_revenue,social_tier) VALUES ('WFI Direct','wfidirect','Sterile Excipients','San Antonio',29.4241,-98.4936,1990,118000000,'premium');
INSERT INTO brands (brand_name,brand_slug,brand_category,headquarters_city,headquarters_lat,headquarters_lon,founded_year,annual_revenue,social_tier) VALUES ('AdhesiveOne Medical','adhesiveone','Device Components','Louisville',38.2527,-85.7585,2004,67000000,'standard');
INSERT INTO brands (brand_name,brand_slug,brand_category,headquarters_city,headquarters_lat,headquarters_lon,founded_year,annual_revenue,social_tier) VALUES ('MedPropel Devices','medpropel','Medical Device Materials','Omaha',41.2565,-95.9345,1988,149000000,'premium');
INSERT INTO brands (brand_name,brand_slug,brand_category,headquarters_city,headquarters_lat,headquarters_lon,founded_year,annual_revenue,social_tier) VALUES ('CleanSteamCare','cleansteamcare','GMP Utilities','New Orleans',29.9511,-90.0715,2001,59000000,'standard');
INSERT INTO brands (brand_name,brand_slug,brand_category,headquarters_city,headquarters_lat,headquarters_lon,founded_year,annual_revenue,social_tier) VALUES ('VaccineWatch','vaccinewatch','Vaccine Safety Intelligence','Austin',30.2672,-97.7431,2020,26000000,'emerging');
INSERT INTO brands (brand_name,brand_slug,brand_category,headquarters_city,headquarters_lat,headquarters_lon,founded_year,annual_revenue,social_tier) VALUES ('CMS Watch','fdawatch','Regulatory Intelligence','Washington',38.9072,-77.0369,2017,31000000,'emerging');
INSERT INTO brands (brand_name,brand_slug,brand_category,headquarters_city,headquarters_lat,headquarters_lon,founded_year,annual_revenue,social_tier) VALUES ('Joint Commission Updates','emaupdates','Regulatory Intelligence','Washington',38.9072,-77.0369,2010,44000000,'standard');
INSERT INTO brands (brand_name,brand_slug,brand_category,headquarters_city,headquarters_lat,headquarters_lon,founded_year,annual_revenue,social_tier) VALUES ('SupplyDisruption Signals','portsupply','Import and Port Signals','Long Beach',33.7701,-118.1937,2018,29000000,'emerging');
INSERT INTO brands (brand_name,brand_slug,brand_category,headquarters_city,headquarters_lat,headquarters_lon,founded_year,annual_revenue,social_tier) VALUES ('PatientFlowOps','coldchainops','Care Logistics Operations','Las Vegas',36.1699,-115.1398,2012,51000000,'standard');
INSERT INTO brands (brand_name,brand_slug,brand_category,headquarters_city,headquarters_lat,headquarters_lon,founded_year,annual_revenue,social_tier) VALUES ('CarePathway Desk','protocoldesk','Clinical Protocol Signals','Cleveland',41.4993,-81.6944,2016,37000000,'emerging');
INSERT INTO brands (brand_name,brand_slug,brand_category,headquarters_city,headquarters_lat,headquarters_lon,founded_year,annual_revenue,social_tier) VALUES ('LabGrade Connect','labgradeconnect','Lab Reagents','Salt Lake City',40.7608,-111.8910,2009,48000000,'standard');
INSERT INTO brands (brand_name,brand_slug,brand_category,headquarters_city,headquarters_lat,headquarters_lon,founded_year,annual_revenue,social_tier) VALUES ('SpecBio Exchange','specbioexchange','Specialty Specialty Care Distribution','Miami',25.7617,-80.1918,2015,63000000,'standard');
INSERT INTO brands (brand_name,brand_slug,brand_category,headquarters_city,headquarters_lat,headquarters_lon,founded_year,annual_revenue,social_tier) VALUES ('NorthStar GlycoSpecialty Care','northstarglyco','Glycobiology Materials','Fargo',46.8772,-96.7898,2008,54000000,'standard');
COMMIT;
PROMPT Manufacturers loaded: 50

-- ============================================================
-- FULFILLMENT CENTERS (30) — individual INSERTs
-- ============================================================
PROMPT Loading fulfillment centers...

INSERT INTO fulfillment_centers (center_name,center_type,city,state_province,postal_code,country,latitude,longitude,capacity_units) VALUES ('Edison Northeast Care Logistics Depot','distribution','Edison','New Jersey','08817','US',40.5187,-74.4121,500000);
INSERT INTO fulfillment_centers (center_name,center_type,city,state_province,postal_code,country,latitude,longitude,capacity_units) VALUES ('Ontario Care Delivery Warehouse','warehouse','Ontario','California','91761','US',34.0633,-117.6509,750000);
INSERT INTO fulfillment_centers (center_name,center_type,city,state_province,postal_code,country,latitude,longitude,capacity_units) VALUES ('Joliet Midwest Regulatory Hub','distribution','Joliet','Illinois','60435','US',41.5250,-88.0817,400000);
INSERT INTO fulfillment_centers (center_name,center_type,city,state_province,postal_code,country,latitude,longitude,capacity_units) VALUES ('Lancaster Trial Kit Storage Site','warehouse','Lancaster','Texas','75134','US',32.5921,-96.7561,350000);
INSERT INTO fulfillment_centers (center_name,center_type,city,state_province,postal_code,country,latitude,longitude,capacity_units) VALUES ('Union City Southeast Care Logistics Hub','distribution','Union City','Georgia','30291','US',33.5871,-84.5421,450000);
INSERT INTO fulfillment_centers (center_name,center_type,city,state_province,postal_code,country,latitude,longitude,capacity_units) VALUES ('Kent Pacific Specialty Care Warehouse','warehouse','Kent','Washington','98032','US',47.3809,-122.2348,300000);
INSERT INTO fulfillment_centers (center_name,center_type,city,state_province,postal_code,country,latitude,longitude,capacity_units) VALUES ('Hialeah Import Compliance Site','distribution','Hialeah','Florida','33012','US',25.8576,-80.2781,250000);
INSERT INTO fulfillment_centers (center_name,center_type,city,state_province,postal_code,country,latitude,longitude,capacity_units) VALUES ('Aurora Mountain West Repack Hub','warehouse','Aurora','Colorado','80011','US',39.7294,-104.8319,200000);
INSERT INTO fulfillment_centers (center_name,center_type,city,state_province,postal_code,country,latitude,longitude,capacity_units) VALUES ('Goodyear Desert Care Logistics Site','warehouse','Goodyear','Arizona','85338','US',33.4353,-112.3577,280000);
INSERT INTO fulfillment_centers (center_name,center_type,city,state_province,postal_code,country,latitude,longitude,capacity_units) VALUES ('Fall River Northeast Safety Hub','distribution','Fall River','Massachusetts','02720','US',41.7015,-71.1550,220000);
INSERT INTO fulfillment_centers (center_name,center_type,city,state_province,postal_code,country,latitude,longitude,capacity_units) VALUES ('Shakopee Care Capacity Warehouse','warehouse','Shakopee','Minnesota','55379','US',44.7974,-93.5272,180000);
INSERT INTO fulfillment_centers (center_name,center_type,city,state_province,postal_code,country,latitude,longitude,capacity_units) VALUES ('Troutdale Pacific Micro Site','micro','Troutdale','Oregon','97060','US',45.5390,-122.3872,80000);
INSERT INTO fulfillment_centers (center_name,center_type,city,state_province,postal_code,country,latitude,longitude,capacity_units) VALUES ('Lebanon Central Specialty Care Warehouse','warehouse','Lebanon','Tennessee','37087','US',36.2081,-86.2911,250000);
INSERT INTO fulfillment_centers (center_name,center_type,city,state_province,postal_code,country,latitude,longitude,capacity_units) VALUES ('Fremont Bay Area Compliance Site','micro','Fremont','California','94538','US',37.5485,-121.9886,120000);
INSERT INTO fulfillment_centers (center_name,center_type,city,state_province,postal_code,country,latitude,longitude,capacity_units) VALUES ('Romulus Great Lakes Bioprocess Hub','warehouse','Romulus','Michigan','48174','US',42.2223,-83.3963,200000);
INSERT INTO fulfillment_centers (center_name,center_type,city,state_province,postal_code,country,latitude,longitude,capacity_units) VALUES ('Middletown Mid-Atlantic Care Logistics Hub','distribution','Middletown','Delaware','19709','US',39.4496,-75.7163,350000);
INSERT INTO fulfillment_centers (center_name,center_type,city,state_province,postal_code,country,latitude,longitude,capacity_units) VALUES ('Missouri City Gulf Coast Warehouse','warehouse','Missouri City','Texas','77459','US',29.6186,-95.5377,300000);
INSERT INTO fulfillment_centers (center_name,center_type,city,state_province,postal_code,country,latitude,longitude,capacity_units) VALUES ('West Jordan Mountain Clinical Site','warehouse','West Jordan','Utah','84084','US',40.6097,-111.9391,180000);
INSERT INTO fulfillment_centers (center_name,center_type,city,state_province,postal_code,country,latitude,longitude,capacity_units) VALUES ('Concord Southeast Micro Site','micro','Concord','North Carolina','28027','US',35.4088,-80.5795,100000);
INSERT INTO fulfillment_centers (center_name,center_type,city,state_province,postal_code,country,latitude,longitude,capacity_units) VALUES ('Plainfield Heartland Clinical Hub','warehouse','Plainfield','Indiana','46168','US',39.7043,-86.3994,250000);
INSERT INTO fulfillment_centers (center_name,center_type,city,state_province,postal_code,country,latitude,longitude,capacity_units) VALUES ('North Las Vegas West Storage Site','warehouse','North Las Vegas','Nevada','89030','US',36.1989,-115.1175,200000);
INSERT INTO fulfillment_centers (center_name,center_type,city,state_province,postal_code,country,latitude,longitude,capacity_units) VALUES ('Edwardsville Central Distribution Site','distribution','Edwardsville','Kansas','66111','US',39.0614,-94.8193,320000);
INSERT INTO fulfillment_centers (center_name,center_type,city,state_province,postal_code,country,latitude,longitude,capacity_units) VALUES ('Etna Midwest Specialty Warehouse','warehouse','Etna','Ohio','43018','US',39.9576,-82.6818,220000);
INSERT INTO fulfillment_centers (center_name,center_type,city,state_province,postal_code,country,latitude,longitude,capacity_units) VALUES ('Sparks West Coast Care Logistics Hub','warehouse','Sparks','Nevada','89431','US',39.5349,-119.7527,280000);
INSERT INTO fulfillment_centers (center_name,center_type,city,state_province,postal_code,country,latitude,longitude,capacity_units) VALUES ('Brandon Florida Micro Site','micro','Brandon','Florida','33510','US',27.9378,-82.2859,90000);
INSERT INTO fulfillment_centers (center_name,center_type,city,state_province,postal_code,country,latitude,longitude,capacity_units) VALUES ('Aberdeen East Coast Specialty Care Warehouse','warehouse','Aberdeen','Maryland','21001','US',39.5096,-76.1641,240000);
INSERT INTO fulfillment_centers (center_name,center_type,city,state_province,postal_code,country,latitude,longitude,capacity_units) VALUES ('New Braunfels South Texas Micro Site','micro','New Braunfels','Texas','78130','US',29.7030,-98.1245,100000);
INSERT INTO fulfillment_centers (center_name,center_type,city,state_province,postal_code,country,latitude,longitude,capacity_units) VALUES ('Olive Branch Memphis Logistics Site','distribution','Olive Branch','Mississippi','38654','US',34.9618,-89.8295,400000);
INSERT INTO fulfillment_centers (center_name,center_type,city,state_province,postal_code,country,latitude,longitude,capacity_units) VALUES ('Kapolei Pacific Island Storage Site','micro','Kapolei','Hawaii','96707','US',21.3350,-158.0581,50000);
INSERT INTO fulfillment_centers (center_name,center_type,city,state_province,postal_code,country,latitude,longitude,capacity_units) VALUES ('Anchorage Alaska Care Logistics Site','micro','Anchorage','Alaska','99501','US',61.2181,-149.9003,40000);
COMMIT;
PROMPT Fulfillment centers loaded: 30

@@load_products.sql
@@load_influencers.sql
@@load_customers.sql
@@load_social_posts.sql
@@load_orders.sql
@@load_graph_data.sql
@@load_care_pathway_graph.sql
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
    DBMS_OUTPUT.PUT_LINE('Demo date anchor metadata set.');
EXCEPTION
    WHEN OTHERS THEN
        IF SQLCODE != -942 THEN
            RAISE;
        END IF;
        DBMS_OUTPUT.PUT_LINE('app_demo_date_anchor not present; skipping date anchor metadata seed.');
END;
/

PROMPT =====================================================
PROMPT All data loaded successfully!
PROMPT =====================================================
