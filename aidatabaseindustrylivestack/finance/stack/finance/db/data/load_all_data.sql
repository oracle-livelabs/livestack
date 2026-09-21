/*
 * load_all_data.sql
 * Master data loader — runs all data scripts in order
 * Generates ~5000 financial risk and market signals, ~90 financial products, 50 institutions,
 * 30 branch service centers, ~483 signal sources, 2000 clients, 3000 orders
 *
 * NOTE: Uses individual INSERTs (not INSERT ALL) for tables with identity
 * columns to avoid ORA-00001 duplicate identity values on Oracle 23ai.
 */

SET SERVEROUTPUT ON
SET DEFINE OFF

PROMPT =====================================================
PROMPT Loading Financial Services Demo Data
PROMPT =====================================================

-- ============================================================
-- INSTITUTIONS (50) - individual INSERTs to avoid identity dup issue
-- ============================================================
PROMPT Loading institutions...

INSERT INTO brands (brand_name,brand_slug,brand_category,headquarters_city,headquarters_lat,headquarters_lon,founded_year,annual_revenue,social_tier) VALUES ('Meridian Trust Bank','meridiantrust','Retail Banking','Houston',29.7604,-95.3698,1998,245000000,'premium');
INSERT INTO brands (brand_name,brand_slug,brand_category,headquarters_city,headquarters_lat,headquarters_lon,founded_year,annual_revenue,social_tier) VALUES ('Horizon Capital','horizoncapital','Wealth Management','Newark',40.7357,-74.1724,2004,186000000,'premium');
INSERT INTO brands (brand_name,brand_slug,brand_category,headquarters_city,headquarters_lat,headquarters_lon,founded_year,annual_revenue,social_tier) VALUES ('Clearwater Credit Union','clearwatercu','Consumer Banking','Chicago',41.8781,-87.6298,1987,132000000,'premium');
INSERT INTO brands (brand_name,brand_slug,brand_category,headquarters_city,headquarters_lat,headquarters_lon,founded_year,annual_revenue,social_tier) VALUES ('NorthBridge Investments','northbridgeinvest','Brokerage','Detroit',42.3314,-83.0458,1992,221000000,'luxury');
INSERT INTO brands (brand_name,brand_slug,brand_category,headquarters_city,headquarters_lat,headquarters_lon,founded_year,annual_revenue,social_tier) VALUES ('Granite Wealth','granitewealth','Private Banking','Columbus',39.9612,-82.9988,2001,98000000,'standard');
INSERT INTO brands (brand_name,brand_slug,brand_category,headquarters_city,headquarters_lat,headquarters_lon,founded_year,annual_revenue,social_tier) VALUES ('Harvest Commercial Bank','harvestcommercial','Commercial Banking','Des Moines',41.5868,-93.625,1979,154000000,'premium');
INSERT INTO brands (brand_name,brand_slug,brand_category,headquarters_city,headquarters_lat,headquarters_lon,founded_year,annual_revenue,social_tier) VALUES ('VoltPay Financial','voltpay','Payments','Reno',39.5296,-119.8138,2016,91000000,'premium');
INSERT INTO brands (brand_name,brand_slug,brand_category,headquarters_city,headquarters_lat,headquarters_lon,founded_year,annual_revenue,social_tier) VALUES ('SecureLedger Compliance','secureledger','Risk and Compliance','Boston',42.3601,-71.0589,2011,43000000,'standard');
INSERT INTO brands (brand_name,brand_slug,brand_category,headquarters_city,headquarters_lat,headquarters_lon,founded_year,annual_revenue,social_tier) VALUES ('Civic National Bank','civicnational','Retail Banking','Cleveland',41.4993,-81.6944,1968,275000000,'luxury');
INSERT INTO brands (brand_name,brand_slug,brand_category,headquarters_city,headquarters_lat,headquarters_lon,founded_year,annual_revenue,social_tier) VALUES ('Greenline Asset Management','greenlineasset','Sustainable Investing','Portland',45.5152,-122.6784,2018,39000000,'emerging');
INSERT INTO brands (brand_name,brand_slug,brand_category,headquarters_city,headquarters_lat,headquarters_lon,founded_year,annual_revenue,social_tier) VALUES ('PrimeCard Services','primecard','Credit Cards','Charlotte',35.2271,-80.8431,2007,76000000,'standard');
INSERT INTO brands (brand_name,brand_slug,brand_category,headquarters_city,headquarters_lat,headquarters_lon,founded_year,annual_revenue,social_tier) VALUES ('Catalyst Insurance Group','catalystinsurance','Insurance','Tulsa',36.154,-95.9928,1996,117000000,'premium');
INSERT INTO brands (brand_name,brand_slug,brand_category,headquarters_city,headquarters_lat,headquarters_lon,founded_year,annual_revenue,social_tier) VALUES ('Northern Advisory','northernadvisory','Financial Advisory','Minneapolis',44.9778,-93.265,2005,52000000,'standard');
INSERT INTO brands (brand_name,brand_slug,brand_category,headquarters_city,headquarters_lat,headquarters_lon,founded_year,annual_revenue,social_tier) VALUES ('Gulf Coast Treasury','gulfcoasttreasury','Treasury Services','Baton Rouge',30.4515,-91.1871,1974,203000000,'premium');
INSERT INTO brands (brand_name,brand_slug,brand_category,headquarters_city,headquarters_lat,headquarters_lon,founded_year,annual_revenue,social_tier) VALUES ('Midwest Mortgage Partners','midwestmortgage','Mortgage Lending','Indianapolis',39.7684,-86.1581,1989,88000000,'standard');
INSERT INTO brands (brand_name,brand_slug,brand_category,headquarters_city,headquarters_lat,headquarters_lon,founded_year,annual_revenue,social_tier) VALUES ('Pacific Payments Network','pacificpayments','Payments','Los Angeles',34.0522,-118.2437,1994,143000000,'premium');
INSERT INTO brands (brand_name,brand_slug,brand_category,headquarters_city,headquarters_lat,headquarters_lon,founded_year,annual_revenue,social_tier) VALUES ('Purity AML Labs','purityaml','Financial Crime','San Jose',37.3382,-121.8863,2012,69000000,'standard');
INSERT INTO brands (brand_name,brand_slug,brand_category,headquarters_city,headquarters_lat,headquarters_lon,founded_year,annual_revenue,social_tier) VALUES ('RouteOne Servicing','routeoneservicing','Loan Servicing','Memphis',35.1495,-90.049,2009,58000000,'standard');
INSERT INTO brands (brand_name,brand_slug,brand_category,headquarters_city,headquarters_lat,headquarters_lon,founded_year,annual_revenue,social_tier) VALUES ('Waterline Municipal Finance','waterlinefinance','Public Finance','Milwaukee',43.0389,-87.9065,2003,74000000,'standard');
INSERT INTO brands (brand_name,brand_slug,brand_category,headquarters_city,headquarters_lat,headquarters_lon,founded_year,annual_revenue,social_tier) VALUES ('BioMed Benefits Finance','biomedbenefits','Benefits Finance','San Diego',32.7157,-117.1611,2015,46000000,'emerging');
INSERT INTO brands (brand_name,brand_slug,brand_category,headquarters_city,headquarters_lat,headquarters_lon,founded_year,annual_revenue,social_tier) VALUES ('ElectraPay','electrapay','Digital Wallets','Phoenix',33.4484,-112.074,2019,34000000,'emerging');
INSERT INTO brands (brand_name,brand_slug,brand_category,headquarters_city,headquarters_lat,headquarters_lon,founded_year,annual_revenue,social_tier) VALUES ('RecycleCredit Exchange','recyclecredit','Green Finance','Seattle',47.6062,-122.3321,2021,21000000,'emerging');
INSERT INTO brands (brand_name,brand_slug,brand_category,headquarters_city,headquarters_lat,headquarters_lon,founded_year,annual_revenue,social_tier) VALUES ('RiskDesk Analytics','riskdesk','Risk Intelligence','Denver',39.7392,-104.9903,2014,18000000,'emerging');
INSERT INTO brands (brand_name,brand_slug,brand_category,headquarters_city,headquarters_lat,headquarters_lon,founded_year,annual_revenue,social_tier) VALUES ('PharmaPay Receivables','pharmapay','Receivables Finance','Philadelphia',39.9526,-75.1652,1999,112000000,'premium');
INSERT INTO brands (brand_name,brand_slug,brand_category,headquarters_city,headquarters_lat,headquarters_lon,founded_year,annual_revenue,social_tier) VALUES ('CleanRate Lending','cleanrate','Consumer Lending','Cincinnati',39.1031,-84.512,2008,65000000,'standard');
INSERT INTO brands (brand_name,brand_slug,brand_category,headquarters_city,headquarters_lat,headquarters_lon,founded_year,annual_revenue,social_tier) VALUES ('BridgeLine Capital','bridgelinecapital','Capital Markets','Atlanta',33.749,-84.388,1991,126000000,'premium');
INSERT INTO brands (brand_name,brand_slug,brand_category,headquarters_city,headquarters_lat,headquarters_lon,founded_year,annual_revenue,social_tier) VALUES ('Solvency Risk Advisors','solvencyrisk','Risk Advisory','Dallas',32.7767,-96.797,2013,47000000,'standard');
INSERT INTO brands (brand_name,brand_slug,brand_category,headquarters_city,headquarters_lat,headquarters_lon,founded_year,annual_revenue,social_tier) VALUES ('FinePoint Direct','finepointdirect','Digital Banking','Raleigh',35.7796,-78.6382,2006,82000000,'standard');
INSERT INTO brands (brand_name,brand_slug,brand_category,headquarters_city,headquarters_lat,headquarters_lon,founded_year,annual_revenue,social_tier) VALUES ('Portside Trade Finance','portsidetrade','Trade Finance','Savannah',32.0809,-81.0912,1985,157000000,'premium');
INSERT INTO brands (brand_name,brand_slug,brand_category,headquarters_city,headquarters_lat,headquarters_lon,founded_year,annual_revenue,social_tier) VALUES ('AltYield Alternative Credit','altyieldcredit','Private Credit','Kansas City',39.0997,-94.5786,1997,93000000,'standard');
INSERT INTO brands (brand_name,brand_slug,brand_category,headquarters_city,headquarters_lat,headquarters_lon,founded_year,annual_revenue,social_tier) VALUES ('PurePAC Portfolio Services','purepacportfolio','Portfolio Services','St. Louis',38.627,-90.1994,1982,138000000,'premium');
INSERT INTO brands (brand_name,brand_slug,brand_category,headquarters_city,headquarters_lat,headquarters_lon,founded_year,annual_revenue,social_tier) VALUES ('Silicon Valley Wealth','siliconwealth','Wealth Management','Akron',41.0814,-81.519,2002,71000000,'standard');
INSERT INTO brands (brand_name,brand_slug,brand_category,headquarters_city,headquarters_lat,headquarters_lon,founded_year,annual_revenue,social_tier) VALUES ('CarbonActive Finance','carbonactivefinance','Carbon Markets','Pittsburgh',40.4406,-79.9959,1978,99000000,'standard');
INSERT INTO brands (brand_name,brand_slug,brand_category,headquarters_city,headquarters_lat,headquarters_lon,founded_year,annual_revenue,social_tier) VALUES ('FraudGuard Operations','fraudguardops','Fraud Operations','Tampa',27.9506,-82.4572,1995,61000000,'standard');
INSERT INTO brands (brand_name,brand_slug,brand_category,headquarters_city,headquarters_lat,headquarters_lon,founded_year,annual_revenue,social_tier) VALUES ('MetaTrust Custody','metatrustcustody','Custody','Baltimore',39.2904,-76.6122,2000,55000000,'standard');
INSERT INTO brands (brand_name,brand_slug,brand_category,headquarters_city,headquarters_lat,headquarters_lon,founded_year,annual_revenue,social_tier) VALUES ('Coastal Perimeter Bank','coastalperimeter','Regional Banking','Wilmington',34.2257,-77.9447,1993,104000000,'premium');
INSERT INTO brands (brand_name,brand_slug,brand_category,headquarters_city,headquarters_lat,headquarters_lon,founded_year,annual_revenue,social_tier) VALUES ('CivicSure Insurance','civicsureinsurance','Insurance','Nashville',36.1627,-86.7816,2006,57000000,'standard');
INSERT INTO brands (brand_name,brand_slug,brand_category,headquarters_city,headquarters_lat,headquarters_lon,founded_year,annual_revenue,social_tier) VALUES ('IPA Direct Finance','ipadirectfinance','Specialty Finance','San Antonio',29.4241,-98.4936,1990,118000000,'premium');
INSERT INTO brands (brand_name,brand_slug,brand_category,headquarters_city,headquarters_lat,headquarters_lon,founded_year,annual_revenue,social_tier) VALUES ('ApexOne Capital','apexonecapital','Private Equity','Louisville',38.2527,-85.7585,2004,67000000,'standard');
INSERT INTO brands (brand_name,brand_slug,brand_category,headquarters_city,headquarters_lat,headquarters_lon,founded_year,annual_revenue,social_tier) VALUES ('Propel Pension Strategies','propelpension','Retirement','Omaha',41.2565,-95.9345,1988,149000000,'premium');
INSERT INTO brands (brand_name,brand_slug,brand_category,headquarters_city,headquarters_lat,headquarters_lon,founded_year,annual_revenue,social_tier) VALUES ('Continuity Risk Advisors','continuityrisk','Operational Risk','New Orleans',29.9511,-90.0715,2001,59000000,'standard');
INSERT INTO brands (brand_name,brand_slug,brand_category,headquarters_city,headquarters_lat,headquarters_lon,founded_year,annual_revenue,social_tier) VALUES ('BatteryStreet FinTech Watch','batterystreetwatch','FinTech Intelligence','Austin',30.2672,-97.7431,2020,26000000,'emerging');
INSERT INTO brands (brand_name,brand_slug,brand_category,headquarters_city,headquarters_lat,headquarters_lon,founded_year,annual_revenue,social_tier) VALUES ('RegWatch Capital','regwatchcapital','Regulatory Intelligence','Washington',38.9072,-77.0369,2017,31000000,'emerging');
INSERT INTO brands (brand_name,brand_slug,brand_category,headquarters_city,headquarters_lat,headquarters_lon,founded_year,annual_revenue,social_tier) VALUES ('SEC Updates Desk','secupdates','Regulatory Intelligence','Washington',38.9072,-77.0369,2010,44000000,'standard');
INSERT INTO brands (brand_name,brand_slug,brand_category,headquarters_city,headquarters_lat,headquarters_lon,founded_year,annual_revenue,social_tier) VALUES ('MarketPulse Signals','marketpulse','Market Data','Long Beach',33.7701,-118.1937,2018,29000000,'emerging');
INSERT INTO brands (brand_name,brand_slug,brand_category,headquarters_city,headquarters_lat,headquarters_lon,founded_year,annual_revenue,social_tier) VALUES ('BranchOps','branchops','Branch Operations','Las Vegas',36.1699,-115.1398,2012,51000000,'standard');
INSERT INTO brands (brand_name,brand_slug,brand_category,headquarters_city,headquarters_lat,headquarters_lon,founded_year,annual_revenue,social_tier) VALUES ('PortfolioDesk','portfoliodesk','Portfolio Signals','Cleveland',41.4993,-81.6944,2016,37000000,'emerging');
INSERT INTO brands (brand_name,brand_slug,brand_category,headquarters_city,headquarters_lat,headquarters_lon,founded_year,annual_revenue,social_tier) VALUES ('LedgerGrade Connect','ledgergradeconnect','Data Services','Salt Lake City',40.7608,-111.891,2009,48000000,'standard');
INSERT INTO brands (brand_name,brand_slug,brand_category,headquarters_city,headquarters_lat,headquarters_lon,founded_year,annual_revenue,social_tier) VALUES ('SpecFinance Exchange','specfinanceexchange','Capital Markets','Miami',25.7617,-80.1918,2015,63000000,'standard');
INSERT INTO brands (brand_name,brand_slug,brand_category,headquarters_city,headquarters_lat,headquarters_lon,founded_year,annual_revenue,social_tier) VALUES ('NorthStar Mortgage','northstarmortgage','Mortgage Lending','Fargo',46.8772,-96.7898,2008,54000000,'standard');
COMMIT;
PROMPT Institutions loaded: 50

-- ============================================================
-- FULFILLMENT CENTERS (30) — individual INSERTs
-- ============================================================
PROMPT Loading branch service centers...

INSERT INTO fulfillment_centers (center_name,center_type,city,state_province,postal_code,country,latitude,longitude,capacity_units) VALUES ('Edison Wealth Service Center','Regional Processing','Edison','New Jersey','08817','US',40.5187,-74.4121,500000);
INSERT INTO fulfillment_centers (center_name,center_type,city,state_province,postal_code,country,latitude,longitude,capacity_units) VALUES ('Ontario Loan Operations Hub','Enterprise Operations','Ontario','California','91761','US',34.0633,-117.6509,750000);
INSERT INTO fulfillment_centers (center_name,center_type,city,state_province,postal_code,country,latitude,longitude,capacity_units) VALUES ('Joliet Midwest Risk Desk','Regional Processing','Joliet','Illinois','60435','US',41.5250,-88.0817,400000);
INSERT INTO fulfillment_centers (center_name,center_type,city,state_province,postal_code,country,latitude,longitude,capacity_units) VALUES ('Lancaster Treasury Service Center','Enterprise Operations','Lancaster','Texas','75134','US',32.5921,-96.7561,350000);
INSERT INTO fulfillment_centers (center_name,center_type,city,state_province,postal_code,country,latitude,longitude,capacity_units) VALUES ('Union City Southeast Branch Hub','Regional Processing','Union City','Georgia','30291','US',33.5871,-84.5421,450000);
INSERT INTO fulfillment_centers (center_name,center_type,city,state_province,postal_code,country,latitude,longitude,capacity_units) VALUES ('Kent Pacific Client Center','Enterprise Operations','Kent','Washington','98032','US',47.3809,-122.2348,300000);
INSERT INTO fulfillment_centers (center_name,center_type,city,state_province,postal_code,country,latitude,longitude,capacity_units) VALUES ('Hialeah Trade Finance Desk','Regional Processing','Hialeah','Florida','33012','US',25.8576,-80.2781,250000);
INSERT INTO fulfillment_centers (center_name,center_type,city,state_province,postal_code,country,latitude,longitude,capacity_units) VALUES ('Aurora Mountain West Advisory Hub','Enterprise Operations','Aurora','Colorado','80011','US',39.7294,-104.8319,200000);
INSERT INTO fulfillment_centers (center_name,center_type,city,state_province,postal_code,country,latitude,longitude,capacity_units) VALUES ('Goodyear Desert Retail Branch','Enterprise Operations','Goodyear','Arizona','85338','US',33.4353,-112.3577,280000);
INSERT INTO fulfillment_centers (center_name,center_type,city,state_province,postal_code,country,latitude,longitude,capacity_units) VALUES ('Fall River Northeast Service Hub','Regional Processing','Fall River','Massachusetts','02720','US',41.7015,-71.1550,220000);
INSERT INTO fulfillment_centers (center_name,center_type,city,state_province,postal_code,country,latitude,longitude,capacity_units) VALUES ('Shakopee North Central Operations','Enterprise Operations','Shakopee','Minnesota','55379','US',44.7974,-93.5272,180000);
INSERT INTO fulfillment_centers (center_name,center_type,city,state_province,postal_code,country,latitude,longitude,capacity_units) VALUES ('Troutdale Pacific Micro Branch','Branch Services','Troutdale','Oregon','97060','US',45.5390,-122.3872,80000);
INSERT INTO fulfillment_centers (center_name,center_type,city,state_province,postal_code,country,latitude,longitude,capacity_units) VALUES ('Lebanon Central Banking Center','Enterprise Operations','Lebanon','Tennessee','37087','US',36.2081,-86.2911,250000);
INSERT INTO fulfillment_centers (center_name,center_type,city,state_province,postal_code,country,latitude,longitude,capacity_units) VALUES ('Fremont Bay Area Advisory Office','Branch Services','Fremont','California','94538','US',37.5485,-121.9886,120000);
INSERT INTO fulfillment_centers (center_name,center_type,city,state_province,postal_code,country,latitude,longitude,capacity_units) VALUES ('Romulus Great Lakes Mortgage Hub','Enterprise Operations','Romulus','Michigan','48174','US',42.2223,-83.3963,200000);
INSERT INTO fulfillment_centers (center_name,center_type,city,state_province,postal_code,country,latitude,longitude,capacity_units) VALUES ('Middletown Mid-Atlantic Branch Hub','Regional Processing','Middletown','Delaware','19709','US',39.4496,-75.7163,350000);
INSERT INTO fulfillment_centers (center_name,center_type,city,state_province,postal_code,country,latitude,longitude,capacity_units) VALUES ('Missouri City Gulf Coast Treasury Center','Enterprise Operations','Missouri City','Texas','77459','US',29.6186,-95.5377,300000);
INSERT INTO fulfillment_centers (center_name,center_type,city,state_province,postal_code,country,latitude,longitude,capacity_units) VALUES ('West Jordan Mountain Client Center','Enterprise Operations','West Jordan','Utah','84084','US',40.6097,-111.9391,180000);
INSERT INTO fulfillment_centers (center_name,center_type,city,state_province,postal_code,country,latitude,longitude,capacity_units) VALUES ('Concord Southeast Micro Branch','Branch Services','Concord','North Carolina','28027','US',35.4088,-80.5795,100000);
INSERT INTO fulfillment_centers (center_name,center_type,city,state_province,postal_code,country,latitude,longitude,capacity_units) VALUES ('Plainfield Heartland Banking Hub','Enterprise Operations','Plainfield','Indiana','46168','US',39.7043,-86.3994,250000);
INSERT INTO fulfillment_centers (center_name,center_type,city,state_province,postal_code,country,latitude,longitude,capacity_units) VALUES ('North Las Vegas West Service Center','Enterprise Operations','North Las Vegas','Nevada','89030','US',36.1989,-115.1175,200000);
INSERT INTO fulfillment_centers (center_name,center_type,city,state_province,postal_code,country,latitude,longitude,capacity_units) VALUES ('Edwardsville Central Operations Site','Regional Processing','Edwardsville','Kansas','66111','US',39.0614,-94.8193,320000);
INSERT INTO fulfillment_centers (center_name,center_type,city,state_province,postal_code,country,latitude,longitude,capacity_units) VALUES ('Etna Midwest Specialty Finance Desk','Enterprise Operations','Etna','Ohio','43018','US',39.9576,-82.6818,220000);
INSERT INTO fulfillment_centers (center_name,center_type,city,state_province,postal_code,country,latitude,longitude,capacity_units) VALUES ('Sparks West Coast Risk Hub','Enterprise Operations','Sparks','Nevada','89431','US',39.5349,-119.7527,280000);
INSERT INTO fulfillment_centers (center_name,center_type,city,state_province,postal_code,country,latitude,longitude,capacity_units) VALUES ('Brandon Florida Micro Branch','Branch Services','Brandon','Florida','33510','US',27.9378,-82.2859,90000);
INSERT INTO fulfillment_centers (center_name,center_type,city,state_province,postal_code,country,latitude,longitude,capacity_units) VALUES ('Aberdeen East Coast Banking Center','Enterprise Operations','Aberdeen','Maryland','21001','US',39.5096,-76.1641,240000);
INSERT INTO fulfillment_centers (center_name,center_type,city,state_province,postal_code,country,latitude,longitude,capacity_units) VALUES ('New Braunfels South Texas Branch','Branch Services','New Braunfels','Texas','78130','US',29.7030,-98.1245,100000);
INSERT INTO fulfillment_centers (center_name,center_type,city,state_province,postal_code,country,latitude,longitude,capacity_units) VALUES ('Olive Branch Memphis Service Site','Regional Processing','Olive Branch','Mississippi','38654','US',34.9618,-89.8295,400000);
INSERT INTO fulfillment_centers (center_name,center_type,city,state_province,postal_code,country,latitude,longitude,capacity_units) VALUES ('Kapolei Pacific Island Branch','Branch Services','Kapolei','Hawaii','96707','US',21.3350,-158.0581,50000);
INSERT INTO fulfillment_centers (center_name,center_type,city,state_province,postal_code,country,latitude,longitude,capacity_units) VALUES ('Anchorage Alaska Advisory Office','Branch Services','Anchorage','Alaska','99501','US',61.2181,-149.9003,40000);
COMMIT;
PROMPT Branch service centers loaded: 30

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
