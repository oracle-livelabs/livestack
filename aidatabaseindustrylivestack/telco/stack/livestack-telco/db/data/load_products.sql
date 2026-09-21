/*
 * load_products.sql
 * Telecom services, programs, capacity slots, and network supplies
 * Uses PL/SQL to generate volume with variety
 */

SET SERVEROUTPUT ON
PROMPT Loading telecom services and capacity items...

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
        v_rec.bslug := p_slug;
        v_rec.pname := p_name;
        v_rec.cat := p_cat;
        v_rec.subcat := p_sub;
        v_rec.price := p_price;
        v_rec.cost := p_cost;
        v_rec.wt := p_wt;
        v_rec.tags := p_tags;
        v_prods.EXTEND;
        v_prods(v_prods.COUNT) := v_rec;
    END;
BEGIN

    -- Telecommunications plans, devices, connectivity services, field capacity, and support workflows
    add_prod('signalbridge','5G Unlimited Mobile Plan','Mobile Service','Consumer Wireless',85,32,0.001,'5g,unlimited,mobile,consumer,plan');
    add_prod('signalbridge','Premium International Roaming Pass','Roaming Services','Travel',35,12,0.001,'roaming,international,travel,billing');
    add_prod('signalbridge','Number Port-In Activation','Mobile Service','Activation',25,8,0.001,'activation,port-in,line,subscriber');
    add_prod('fiberpath','Gigabit Fiber Install','Fiber Broadband','Residential Fiber',120,48,0.001,'fiber,gigabit,install,broadband');
    add_prod('fiberpath','Fiber Repair Appointment','Field Operations','Repair',95,36,0.001,'fiber,repair,technician,dispatch');
    add_prod('fiberpath','Small Business Fiber SLA','Enterprise Connectivity','Business Broadband',260,110,0.001,'business,fiber,sla,enterprise');
    add_prod('pulsepoint5g','5G Business Consultation','5G Services','Enterprise Wireless',420,175,0.001,'5g,business,consultation,private-network');
    add_prod('pulsepoint5g','Home Wi-Fi Mesh Kit','Devices','Home Network',180,72,1.2,'wifi,mesh,home-internet,device');
    add_prod('pulsepoint5g','Device Upgrade Enrollment','Mobile Service','Upgrade',55,19,0.001,'upgrade,device,subscriber,retention');
    add_prod('clearmindcare','Customer Retention Intake','Customer Retention','Churn Save',0,0,0.001,'retention,churn,save-offer,agent');
    add_prod('clearmindcare','Outage Follow-Up Call','Service Assurance','Outage Response',0,0,0.001,'outage,follow-up,customer-care');
    add_prod('clearmindcare','Fraud Resolution Case','Security','Account Protection',45,18,0.001,'fraud,sim-swap,account-security');
    add_prod('orbitmotion','IoT Sensor Gateway Kit','IoT Connectivity','Industrial IoT',310,122,0.6,'iot,gateway,sensor,enterprise');
    add_prod('orbitmotion','Fleet Telematics SIM Pack','IoT Connectivity','Fleet',145,54,0.2,'iot,fleet,telematics,sim');
    add_prod('orbitmotion','Field Technician Evaluation','Field Operations','Dispatch',220,90,0.001,'technician,field,dispatch,work-order');
    add_prod('homeconnect','Fixed Wireless Home Internet','Fixed Wireless','Residential Broadband',70,28,0.001,'fixed-wireless,home-internet,broadband');
    add_prod('homeconnect','LTE Backup Gateway','Devices','Business Continuity',115,42,0.5,'lte,backup,gateway,business');
    add_prod('homeconnect','Smart Home Connectivity Assessment','Connected Home','Support',95,36,0.001,'smart-home,coverage,wifi,assessment');
    add_prod('metrosupply','5G Mobile Hotspot Kit','Devices','Mobile Broadband',89,31,0.35,'hotspot,5g,mobile-broadband,device');
    add_prod('metrosupply','SIM Replacement Starter Kit','Devices','Subscriber Support',15,5,0.05,'sim,replacement,activation,support');
    add_prod('metrosupply','Connected Device Monitoring Onboarding','Network Monitoring','Device Operations',210,84,0.4,'device-monitoring,onboarding,iot,network');
    add_prod('wellnest','Student Mobile Plan','Family Plans','Student',40,16,0.001,'student,family,mobile,plan');
    add_prod('wellnest','Family Data Share Plan','Family Plans','Shared Data',150,62,0.001,'family,data-share,multi-line,plan');
    add_prod('wellnest','Network Congestion Plan Review','Service Assurance','Congestion',0,0,0.001,'congestion,plan-review,network');
    add_prod('silverline','Senior Connected Life Plan','Connected Life','Senior Mobile',45,18,0.001,'senior,connected-life,mobile,plan');
    add_prod('silverline','Family Connectivity Support Session','Connected Life','Family Support',30,12,0.001,'family,family-support,connectivity,support');
    add_prod('enterpriseedge','Enterprise Account Navigation','Enterprise Connectivity','Account Management',360,145,0.001,'enterprise,account,network,consulting');
    add_prod('enterpriseedge','Edge Compute Reservation','Enterprise Connectivity','Edge',640,260,0.001,'edge,compute,reservation,enterprise');
    add_prod('roamflow','Fiber Appointment Scheduling','Field Operations','Scheduling',0,0,0.001,'appointment,fiber,scheduling,dispatch');
    add_prod('roamflow','Roaming Cost Coaching','Roaming Services','Bill Optimization',25,8,0.001,'roaming,billing,cost-optimization');
    add_prod('wavefirst','New Line Activation','Mobile Service','Growth',30,11,0.001,'new-line,activation,growth');
    add_prod('wavefirst','Churn Risk Save Offer','Customer Retention','Save Offer',20,7,0.001,'churn,save-offer,retention');

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
    DBMS_OUTPUT.PUT_LINE('Telecom service records loaded: ' || v_idx);
END;
/

-- ============================================================
-- GENERATE CAPACITY / SUPPLY LEVELS (each service stocked at 5-12 network sites)
-- ============================================================
PROMPT Generating network capacity and network supply levels...

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
