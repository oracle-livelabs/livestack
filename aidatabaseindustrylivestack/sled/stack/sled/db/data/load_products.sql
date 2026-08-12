/*
 * load_products.sql
 * State and Local Government services, programs, capacity slots, and public works materials
 * Uses PL/SQL to generate volume with variety
 */

SET SERVEROUTPUT ON
PROMPT Loading State and Local Government services and capacity items...

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
    -- State and Local Government public programs, service lines, capacity slots, and public works materials
    add_prod('civicbridge','Online Permit Intake','Constituent Services','Digital Intake',125,48,0.001,'digital intake,constituent-services,triage,virtual');
    add_prod('civicbridge','Interagency Case Handoff','Interagency Coordination','Case Transfer',210,82,0.001,'case handoff,follow-up,rework,service-plan');
    add_prod('civicbridge','License Eligibility Review','Licensing','Safety',95,35,0.001,'license,reconciliation,licensing,safety');
    add_prod('vitalpath','DMV Appointment Slot','Constituent Services','Access',160,65,0.001,'service counter,same-day,access,appointment');
    add_prod('vitalpath','Rental Assistance Case Plan','Long-Running Casework','Housing Assistance',340,125,0.001,'housing-assistance,eligibility,long-casework,case-management');
    add_prod('vitalpath','Water Main Sensor Monitoring','Long-Running Casework','Infrastructure Monitoring',275,98,0.05,'flood-gauge,remote-monitoring,flood-monitoring');
    add_prod('pulsepoint','Road Repair Engineering Review','Special Programs','Infrastructure',420,175,0.001,'infrastructure,referral,consult,infrastructure');
    add_prod('pulsepoint','Storm Drain Sensor Kit','Remote Field Monitoring','Infrastructure',680,260,1.2,'storm-drain,sensor,gauge,monitoring');
    add_prod('pulsepoint','Capital Project Recovery Plan','Recovery Operations','Infrastructure',520,210,0.001,'capital-project,exercise,recovery');
    add_prod('clearmind','Housing and Human Services Intake','Housing and Human Services','Intake',180,70,0.001,'housing-services,intake,eligibility,access');
    add_prod('clearmind','Emergency Shelter Follow-Up','Housing and Human Services','Crisis',140,58,0.001,'crisis,follow-up,safety-plan');
    add_prod('clearmind','Substance Response Outreach','Housing and Human Services','Community Response',260,105,0.001,'substance-response,outreach,agency-team');
    add_prod('orthomotion','Pothole Inspection Dispatch','Recovery Operations','Transportation',220,90,0.001,'inspection,evaluation,transportation,public-works');
    add_prod('orthomotion','Bridge Closure Detour Package','Recovery Operations','Detours',780,310,1.4,'detour,closure,recovery,traffic-control');
    add_prod('orthomotion','Senior Home Safety Inspection','Senior and Veteran Services','Safety',195,74,0.001,'fall-risk,home-safety,assessment');
    add_prod('fieldworks','Inspection Work Order','Inspection Services','Code Enforcement',240,96,0.001,'inspection-services,code-enforcement,site-visit');
    add_prod('fieldworks','Road Patch Materials Kit','Public Works Materials','Road Repair',145,54,0.9,'road-repair,materials,safety,supplies');
    add_prod('fieldworks','Remote Asset Sensor Onboarding','Remote Field Monitoring','Onboarding',310,120,0.4,'remote-asset,onboarding,sensor,agency-team');
    add_prod('pwsupply','Water Quality Test Kit','Public Works Materials','Environmental Quality',89,31,0.35,'water-quality,test-kit,public-works,housing-assistance');
    add_prod('pwsupply','Flood Gauge LTE Unit','Remote Field Monitoring','Flood Monitoring',115,42,0.5,'flood-gauge,lte,sensor,emergency-response');
    add_prod('pwsupply','Air Quality Sensor Kit','Remote Field Monitoring','Environmental Quality',185,70,0.6,'air-quality,sensor,environmental-monitoring,remote');
    add_prod('wellnest','Youth Program Enrollment','Youth Services','Preventive Services',170,68,0.001,'youth,program-enrollment,eligibility');
    add_prod('wellnest','Air Quality Action Plan Review','Youth Services','Environmental Quality',145,55,0.001,'air-quality,action-plan,youth');
    add_prod('silverline','Senior Benefits Review','Senior and Veteran Services','Preventive Services',190,78,0.001,'senior-services,benefits-review,public-assistance');
    add_prod('silverline','Caregiver Support Session','Senior and Veteran Services','Caregiver',130,50,0.001,'caregiver,support,senior-services');
    add_prod('oncoguide','Special Programs Navigation','Special Programs','Special Programs',360,145,0.001,'special-programs,navigation,service-plan');
    add_prod('oncoguide','Emergency Operations Desk Reservation','Special Programs','Emergency Operations',640,260,0.001,'emergency-operations,eoc,scheduling,capacity');
    add_prod('waterflow','Water Service Inspection Scheduling','Special Programs','Water Service',520,210,0.001,'water-service,inspection-scheduling,public-works,capacity');
    add_prod('waterflow','Utility Relief Program Coaching','Long-Running Casework','Water Service',155,62,0.001,'utility-relief,public-assistance,coaching,water-affordability');
    add_prod('womenfirst','Family Services Intake Visit','Community Services','Family Services',210,86,0.001,'family-services,case-intake,public-assistance');
    add_prod('womenfirst','Housing Stability Screen','Community Services','Housing and Human Services',135,53,0.001,'housing,mental-health,screening');

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
    DBMS_OUTPUT.PUT_LINE('State and Local Government service records loaded: ' || v_idx);
END;
/

-- ============================================================
-- GENERATE CAPACITY / SUPPLY LEVELS (each service stocked at 5-12 service sites)
-- ============================================================
PROMPT Generating public service capacity and public works material levels...

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
