/*
 * load_products.sql
 * Energy & Utilities services, assets, programs, capacity slots, and field supplies
 * Uses PL/SQL to generate volume with variety
 */

SET SERVEROUTPUT ON
SET DEFINE OFF
PROMPT Loading Energy & Utilities services, assets, and capacity items...

DECLARE
    TYPE t_prod IS RECORD (
        bslug VARCHAR2(100),
        pname VARCHAR2(300),
        cat   VARCHAR2(100),
        subcat VARCHAR2(100),
        price NUMBER(10,2),
        cost  NUMBER(10,2),
        wt    NUMBER(8,3),
        tags  VARCHAR2(1000)
    );
    TYPE t_prod_arr IS TABLE OF t_prod;
    v_prods t_prod_arr := t_prod_arr();
    v_brand_id NUMBER;
    v_sku VARCHAR2(50);
    v_idx NUMBER := 0;

    PROCEDURE add_prod(p_slug VARCHAR2, p_name VARCHAR2, p_cat VARCHAR2, p_sub VARCHAR2,
                       p_price NUMBER, p_cost NUMBER, p_wt NUMBER, p_tags VARCHAR2) IS
        v_rec t_prod;
    BEGIN
        v_rec.bslug := p_slug; v_rec.pname := p_name; v_rec.cat := p_cat;
        v_rec.subcat := p_sub; v_rec.price := p_price; v_rec.cost := p_cost;
        v_rec.wt := p_wt; v_rec.tags := p_tags;
        v_prods.EXTEND; v_prods(v_prods.COUNT) := v_rec;
    END;
BEGIN
    -- Electric utility programs, grid asset lines, capacity slots, and field supplies
    add_prod('gridbridge','Smart Meter Exchange','Electric Utility','AMI',125,48,0.8,'smart-meter,ami,exchange,field-work');
    add_prod('gridbridge','Outage Restoration Dispatch','Electric Utility','Restoration',210,82,0.001,'outage,dispatch,restoration,crew-routing');
    add_prod('gridbridge','Transformer Load Assessment','Electric Utility','Transformer',95,35,0.001,'transformer,load,inspection,distribution');
    add_prod('powerpath','Vegetation Clearance Work Order','Electric Utility','Vegetation',160,65,0.001,'vegetation,reliability,feeder,work-order');
    add_prod('powerpath','EV Charger Interconnection Review','Electric Utility','EV Infrastructure',340,125,0.001,'ev,interconnection,charger,capacity');
    add_prod('powerpath','Voltage Quality Investigation','Electric Utility','Voltage',275,98,0.05,'voltage,power-quality,monitoring');
    add_prod('peakpoint','Feeder Recloser Inspection','Electric Utility','Protection',420,175,0.001,'recloser,feeder,automation,protection');
    add_prod('peakpoint','Mobile Substation Deployment','Electric Utility','Contingency',680,260,1.2,'substation,mobile,contingency,restoration');
    add_prod('peakpoint','Fault Indicator Install','Electric Utility','Fault Detection',520,210,0.7,'fault-indicator,automation,feeder');
    add_prod('peakpoint','DER Interconnection Queue Review','Electric Utility','DER Interconnection',285,112,0.001,'der,solar,interconnection,queue');
    add_prod('peakpoint','Demand Response Event Enrollment','Electric Utility','Demand Response',175,68,0.001,'demand-response,load-forecast,reliability');
    add_prod('clearpower','Billing Exception Review','Customer Operations','Billing',180,70,0.001,'billing,exception,customer-service');
    add_prod('clearpower','Collections Payment Arrangement','Customer Operations','Collections',145,56,0.001,'collections,payment-arrangement,customer-service');
    add_prod('clearpower','Retail Energy Plan Inquiry','Customer Operations','Retail Energy',95,38,0.001,'retail-energy,plan,inquiry');
    add_prod('clearpower','Industrial Account Service Review','Customer Operations','Industrial Customer',360,142,0.001,'industrial,account,service-request,sla');
    add_prod('clearpower','Storm Customer Callback','Customer Operations','Storm Response',140,58,0.001,'storm,callback,customer-communications');
    add_prod('clearpower','Low-Income Energy Assistance Case','Customer Programs','Assistance',260,105,0.001,'assistance,affordability,customer-program');
    add_prod('fieldmotion','Pole Inspection Ticket','Field Operations','Pole',220,90,0.001,'pole,inspection,field-crew');
    add_prod('fieldmotion','Underground Cable Locate','Field Operations','Underground',780,310,1.4,'cable,locate,underground,safety');
    add_prod('fieldmotion','Streetlight Repair','Municipal Services','Lighting',195,74,0.001,'streetlight,municipal,repair');
    add_prod('fieldmotion','Priority Crew Dispatch Slot','Field Operations','Crew Dispatch',260,102,0.001,'crew,dispatch,priority,travel-time');
    add_prod('homeenergy','Home Energy Audit','Demand Management','Efficiency',240,96,0.001,'energy-audit,efficiency,demand-management');
    add_prod('homeenergy','Thermostat Rebate Kit','Electric Utility','Demand Response',145,54,0.9,'thermostat,rebate,demand-response');
    add_prod('homeenergy','Distributed Solar Application','Electric Utility','Solar',310,120,0.4,'solar,interconnection,distributed-energy');
    add_prod('metersupply','AMI Gateway Kit','Field Supplies','AMI',89,31,0.35,'ami,gateway,meter-network');
    add_prod('metersupply','Line Sensor LTE Kit','Field Supplies','Line Sensor',115,42,0.5,'line-sensor,lte,grid-monitoring');
    add_prod('metersupply','Padmount Transformer Sensor','Field Supplies','Transformer',185,70,0.6,'padmount,transformer,sensor');
    add_prod('waterworks','Water Main Pressure Inspection','Water/Wastewater Utility','Pressure',170,68,0.001,'water-main,pressure,inspection');
    add_prod('waterworks','Leak Detection Field Visit','Water/Wastewater Utility','Leak Detection',145,55,0.001,'leak,detection,water,field-work');
    add_prod('waterworks','Water Quality Sampling','Water/Wastewater Utility','Water Quality',210,84,0.001,'water-quality,sampling,regulatory');
    add_prod('waterworks','Pump Station Capacity Review','Water/Wastewater Utility','Pump Station',275,110,0.001,'pump-station,capacity,pressure-zone');
    add_prod('flowguard','Wastewater Discharge Compliance Review','Water/Wastewater Utility','Discharge Compliance',430,180,0.001,'wastewater,discharge,compliance,permit');
    add_prod('flowguard','Sewer Overflow Response','Water/Wastewater Utility','Overflow Response',520,216,0.001,'sewer-overflow,wastewater,emergency');
    add_prod('flowguard','Treatment Plant Capacity Assessment','Water/Wastewater Utility','Treatment Capacity',390,156,0.001,'treatment-plant,capacity,compliance');
    add_prod('silverline','Senior Critical Load Enrollment','Customer Programs','Critical Load',190,78,0.001,'critical-load,senior,customer-program');
    add_prod('silverline','Critical Load Account Review','Customer Programs','Critical Load',130,50,0.001,'critical-load,customer-support');
    add_prod('resiliencehub','Microgrid Islanding Test','Resilience','Microgrid',360,145,0.001,'microgrid,resilience,islanding');
    add_prod('resiliencehub','Battery Storage Dispatch Review','DERMS','Battery Storage',640,260,0.001,'battery,storage,derms,dispatch');
    add_prod('gasflow','Gas Leak Investigation','Gas Utility','Emergency',520,210,0.001,'gas,leak,emergency,field-crew');
    add_prod('gasflow','Regulator Station Inspection','Gas Utility','Regulator',155,62,0.001,'gas,regulator,inspection');
    add_prod('gasflow','Pipeline Pressure Monitoring Review','Gas Utility','Pressure Monitoring',235,95,0.001,'gas,pipeline,pressure,monitoring');
    add_prod('gasflow','Leak Response SLA Review','Gas Utility','Leak Response SLA',185,72,0.001,'gas,leak,sla,safety-call');
    add_prod('gasflow','Odorization Monitoring Inspection','Gas Utility','Odorization',225,88,0.001,'gas,odorization,compliance,inspection');
    add_prod('northbasin','Well Production Variance Review','Oil & Gas Upstream','Well Performance',450,180,0.001,'well,production,variance,forecast');
    add_prod('northbasin','Artificial Lift Monitoring','Oil & Gas Upstream','Artificial Lift',360,145,0.001,'artificial-lift,vibration,well');
    add_prod('northbasin','Produced Water Handling Review','Oil & Gas Upstream','Produced Water',310,124,0.001,'produced-water,handling,hse');
    add_prod('northbasin','Lease Operating Expense Review','Oil & Gas Upstream','LOE',240,92,0.001,'lease-operating-expense,production');
    add_prod('bayoumidstream','Pipeline Integrity Assessment','Oil & Gas Midstream','Pipeline Integrity',620,255,0.001,'pipeline,integrity,corrosion,inspection');
    add_prod('bayoumidstream','Compressor Station Reliability Review','Oil & Gas Midstream','Compressor Station',540,220,0.001,'compressor,vibration,reliability');
    add_prod('bayoumidstream','Storage Nomination Scheduling Review','Oil & Gas Midstream','Storage Scheduling',330,132,0.001,'storage,nominations,scheduling');
    add_prod('bayoumidstream','Midstream Leak Detection Patrol','Oil & Gas Midstream','Leak Detection',410,165,0.001,'midstream,leak-detection,pipeline');
    add_prod('sabinelng','LNG Cargo Delay Review','Oil & Gas Midstream','LNG Logistics',580,240,0.001,'lng,cargo,delay,berth');
    add_prod('sabinelng','LNG Terminal Berth Planning','Oil & Gas Midstream','LNG Terminal',470,188,0.001,'lng,terminal,berth,logistics');
    add_prod('gulfrefining','Refinery Hydrocracker Constraint Review','Oil & Gas Downstream','Refinery Unit',730,300,0.001,'refinery,hydrocracker,throughput,constraint');
    add_prod('gulfrefining','Turnaround Readiness Plan','Oil & Gas Downstream','Turnaround',610,250,0.001,'turnaround,maintenance,parts,crew');
    add_prod('gulfrefining','Product Movement Scheduling','Oil & Gas Downstream','Product Movement',390,158,0.001,'product-movement,terminal,scheduling');
    add_prod('gulfrefining','Hydrocarbon Accounting Exception Review','Oil & Gas Downstream','Hydrocarbon Accounting',320,128,0.001,'hydrocarbon-accounting,terminal,product');
    add_prod('gulfrefining','Petrochemical Unit Constraint Review','Oil & Gas Downstream','Petrochemical Operations',520,210,0.001,'petrochemical,unit,constraint');
    add_prod('hseclear','Emissions Threshold Follow-up','HSE & Emissions','Emissions Reporting',280,110,0.001,'emissions,threshold,regulatory-follow-up');
    add_prod('hseclear','HSE Incident Triage','HSE & Emissions','HSE Incident',260,104,0.001,'hse,incident,triage,safety');
    add_prod('hseclear','Regulatory Report Preparation','Regulatory Compliance','Regulatory Report',340,136,0.001,'regulatory,reporting,compliance');
    add_prod('stormfirst','Storm Patrol Assignment','Storm Operations','Patrol',210,86,0.001,'storm,patrol,damage-assessment');
    add_prod('stormfirst','Mutual Aid Crew Staging','Storm Operations','Mutual Aid',135,53,0.001,'mutual-aid,crew-staging,storm');

    FOR i IN 1..v_prods.COUNT LOOP
        BEGIN
            SELECT brand_id INTO v_brand_id
            FROM brands
            WHERE brand_slug = v_prods(i).bslug;

            v_idx := v_idx + 1;
            v_sku := UPPER(SUBSTR(v_prods(i).bslug, 1, 3)) || '-' ||
                     LPAD(v_idx, 5, '0');

            INSERT INTO products (brand_id, sku, product_name, category, subcategory,
                                  unit_price, unit_cost, weight_kg, tags, launch_date)
            VALUES (v_brand_id, v_sku, v_prods(i).pname, v_prods(i).cat, v_prods(i).subcat,
                    v_prods(i).price, v_prods(i).cost, v_prods(i).wt, v_prods(i).tags,
                    SYSDATE - DBMS_RANDOM.VALUE(30, 730));
        EXCEPTION
            WHEN DUP_VAL_ON_INDEX THEN NULL;  -- skip dupes
        END;
    END LOOP;

    COMMIT;
    DBMS_OUTPUT.PUT_LINE('Energy & Utilities service and asset records loaded: ' || v_idx);
END;
/

-- ============================================================
-- GENERATE CAPACITY / SUPPLY LEVELS (each service stocked at 5-12 operations sites)
-- ============================================================
PROMPT Generating cross-sector capacity, parts, and field supply levels...

DECLARE
    v_count       NUMBER := 0;
    v_num_centers NUMBER;
BEGIN
    FOR p IN (SELECT product_id FROM products) LOOP
        v_num_centers := FLOOR(DBMS_RANDOM.VALUE(5, 13));
        FOR c IN (
            SELECT center_id FROM (
                SELECT center_id FROM fulfillment_centers
                ORDER BY DBMS_RANDOM.VALUE
            ) WHERE ROWNUM <= v_num_centers
        ) LOOP
            BEGIN
                INSERT INTO inventory (product_id, center_id, quantity_on_hand,
                                       quantity_reserved, reorder_point, reorder_qty,
                                       last_restock_date)
                VALUES (p.product_id, c.center_id,
                        FLOOR(DBMS_RANDOM.VALUE(10, 500)),
                        FLOOR(DBMS_RANDOM.VALUE(0, 30)),
                        FLOOR(DBMS_RANDOM.VALUE(20, 100)),
                        FLOOR(DBMS_RANDOM.VALUE(100, 500)),
                        SYSDATE - DBMS_RANDOM.VALUE(1, 30));
                v_count := v_count + 1;
            EXCEPTION
                WHEN DUP_VAL_ON_INDEX THEN NULL;
            END;
        END LOOP;
    END LOOP;
    COMMIT;
    DBMS_OUTPUT.PUT_LINE('Capacity records loaded: ' || v_count);
END;
/
