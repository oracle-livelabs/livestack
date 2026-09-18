/*
 * load_products.sql
 * Room types and revenue centers across property brands and regulated categories
 * Uses PL/SQL to generate volume with variety
 */

SET SERVEROUTPUT ON
PROMPT Loading products and revenue centers...

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
    -- Hospitality catalog. Existing table and column names stay unchanged
    -- for route/import compatibility; visible values now represent products and revenue centers and properties.
    add_prod('harborstone-grand-harbor','Deluxe King Room','Rooms','King Room',185,62,1,'king-room,occupancy,adr,member-rate');
    add_prod('harborstone-grand-harbor','Ocean View Suite','Rooms','Suite',340,118,1,'suite,ocean-view,adr,upsell');
    add_prod('harborstone-grand-harbor','Loyalty Member Rate','Rate Plans','Member Rate',165,58,1,'loyalty,rate-plan,direct-booking');
    add_prod('harborstone-grand-harbor','Corporate Group Rate','Groups and Events','Group Rate',210,86,1,'corporate,group-rate,room-block');
    add_prod('harborstone-grand-harbor','Extended Stay Studio','Rooms','Extended Stay',145,54,1,'extended-stay,studio,weekly-rate');
    add_prod('canyon-reserve-resort','Spa Weekend Package','Spa and Wellness','Package',425,148,1,'spa,weekend-package,ancillary');
    add_prod('canyon-reserve-resort','Resort Villa Package','Rooms','Villa',780,315,1,'villa,resort,luxury-stay');
    add_prod('canyon-reserve-resort','Ballroom Event Block','Events','Ballroom Block',4200,1850,1,'ballroom,event-block,catering');
    add_prod('canyon-reserve-resort','Late Checkout Add-On','Ancillary Services','Stay Extension',80,18,1,'late-checkout,ancillary,guest-request');
    add_prod('canyon-reserve-resort','Corporate Travel Program','Corporate Accounts','Travel Program',300,115,1,'corporate-account,travel-program,negotiated-rate');
    add_prod('harborstone-lakeside-inn','F&B Outlet Package','Food and Beverage','Outlet Package',220,86,1,'food-beverage,outlet,package');
    add_prod('harborstone-lakeside-inn','Banquet Deposit Service','Events','Banquet Deposit',450,120,1,'banquet,deposit,event-billing');
    add_prod('harborstone-lakeside-inn','Airport Transfer Service','Ancillary Services','Transportation',65,24,1,'airport-transfer,transportation,arrival');
    add_prod('harborstone-lakeside-inn','Service Recovery Add-On','Guest Experience','Service Recovery',180,64,1,'service-recovery,guest-issue,case');
    add_prod('harborstone-lakeside-inn','OTA Channel Audit','Channel Management','OTA Audit',420,170,1,'ota,channel-audit,rate-parity');
    add_prod('harborstone-summit-lodge','Digital Check-In Workflow','Front Office','Digital Check-In',240,93,1,'digital-check-in,guest-identity,arrival');
    add_prod('harborstone-summit-lodge','Wedding Room Block','Groups and Events','Wedding Block',995,410,1,'wedding,room-block,group-sales');
    add_prod('harborstone-summit-lodge','Seasonal Rate Plan','Revenue Management','Rate Plan',215,72,1,'seasonal-rate,demand,pricing');
    add_prod('harborstone-summit-lodge','Parking Package','Ancillary Services','Parking',45,14,1,'parking,ancillary,arrival');
    add_prod('harborstone-summit-lodge','Express Check-In','Front Office','Arrival',35,11,1,'express-check-in,front-office,arrival');
    add_prod('st-regis-city-center','University Group Block','Groups and Events','Education Group',525,215,1,'university,group-block,events');
    add_prod('st-regis-city-center','Conference Center Buyout','Events','Venue Buyout',3200,1850,1,'conference,buyout,venue');
    add_prod('st-regis-city-center','AV Equipment Rental','Events','Event Equipment',1875,980,1,'av,equipment,event-services');
    add_prod('st-regis-city-center','Split Folio Billing','Folio Management','Split Folio',725,260,1,'split-folio,billing,group-account');
    add_prod('st-regis-city-center','Event Deposit Guarantee','Events','Deposit Guarantee',1350,640,1,'event-deposit,guarantee,contract');
    add_prod('harborstone-vineyard-resort','International Guest Rate','Revenue Management','International Rate',520,155,1,'international,rate-plan,foreign-guest');
    add_prod('harborstone-vineyard-resort','Dynamic Pricing Review','Revenue Management','Pricing Review',950,380,1,'dynamic-pricing,adr,forecast');
    add_prod('harborstone-vineyard-resort','Revenue Manager Portal','Revenue Operations','Forecasting',500,160,1,'revenue-management,forecast,booking-pace');
    add_prod('harborstone-vineyard-resort','Senior Leisure Package','Leisure Packages','Senior Leisure',675,210,1,'senior-leisure,package,extended-stay');
    add_prod('harborstone-vineyard-resort','Family Vacation Package','Leisure Packages','Family',75,20,1,'family,package,leisure');
    add_prod('harborstone-beach-club','Wellness Consultation','Spa and Wellness','Consultation',450,165,1,'wellness,consultation,spa');
    add_prod('harborstone-beach-club','Spa Treatment Review','Spa and Wellness','Treatment',620,240,1,'spa-treatment,wellness,guest-preference');
    add_prod('harborstone-beach-club','Digital Key Support','Digital Guest Services','Mobile Key',810,340,1,'digital-key,mobile,guest-support');
    add_prod('harborstone-beach-club','Shoulder-Season Offer','Revenue Management','Seasonal Offer',210,70,1,'shoulder-season,offer,rate-plan');
    add_prod('harborstone-beach-club','Sustainable Stay Package','Sustainability','Green Stay',155,58,1,'sustainable-stay,green-program,package');
    add_prod('harborstone-convention-center','Private Villa Access','Rooms','Villa Access',2500,1100,1,'private-villa,luxury,access');
    add_prod('harborstone-convention-center','Mobile Folio Payment','Folio Payments','Mobile Folio',0,0,1,'mobile-wallet,folio,payment');
    add_prod('harborstone-convention-center','Instant Folio Closeout','Folio Payments','Checkout Closeout',120,38,1,'folio-settlement,payment,checkout');
    add_prod('harborstone-convention-center','Channel Manager API Access','Channel Management','API',600,180,1,'channel-manager,api,inventory-sync');
    add_prod('harborstone-convention-center','Guest Profile Monitoring','Guest Experience','Profile Monitoring',19,5,1,'guest-profile,preference,service-recovery');
    add_prod('harborstone-garden-hotel','Premium Suite Upgrade','Upsells','Suite Upgrade',1100,420,1,'suite-upgrade,upsell,adr');
    add_prod('harborstone-garden-hotel','Flexible Cancellation Option','Stay Management','Cancellation',250,85,1,'cancellation,flexible-rate,booking-policy');
    add_prod('harborstone-garden-hotel','Concierge Planning Package','Concierge','Itinerary Planning',1800,760,1,'concierge,itinerary,luxury');
    add_prod('harborstone-garden-hotel','VIP Family Itinerary','Concierge','VIP Itinerary',2400,900,1,'vip,itinerary,family');
    add_prod('harborstone-garden-hotel','Occupancy Stress Test','Operations Analytics','Occupancy Operations Risk',700,230,1,'occupancy,stress-test,risk');
    add_prod('springs-hotel-portland','Cancellation Reserve Scenario','Operations Analytics','Cancellation Forecast',850,320,1,'cancellation,forecast,reserve');
    add_prod('springs-hotel-portland','Property Performance Dashboard','Operations Analytics','Portfolio Dashboard',1200,460,1,'property-performance,revpar,portfolio');
    add_prod('springs-hotel-portland','Brand Standards Review','Brand Standards','Quality Audit',980,390,1,'brand-standards,quality-audit,compliance');
    add_prod('springs-hotel-portland','Do-Not-Rent Review','Guest Safety','Guest Safety Review',300,95,1,'guest-safety,guest-safety,screening');
    add_prod('springs-hotel-portland','Front Desk Appointment','Front Office','Appointment',40,10,1,'front-desk,appointment,guest-service');
    add_prod('harborstone-airport-hotel','Priority Guest Desk','Guest Experience','Priority Support',120,35,1,'priority-support,guest-experience,vip');
    add_prod('harborstone-airport-hotel','Service Recovery Case','Guest Experience','Case Management',90,30,1,'service-recovery,case,guest-issue');
    add_prod('harborstone-airport-hotel','Folio Dispute Monitoring','Folio Payments','Folio Dispute',180,68,1,'folio-dispute,folio-dispute,payment');
    add_prod('harborstone-airport-hotel','Stay Modification Review','Stay Management','Modification',550,210,1,'stay-modification,reservation-change');
    add_prod('harborstone-airport-hotel','No-Show Outreach Program','Stay Management','No-Show',275,110,1,'no-show,outreach,recovery');
    add_prod('dining-events-hotel-tulsa','Guest Value Analysis','Hospitality Analytics','Guest Value',450,160,1,'guest-value,analytics,analytics');
    add_prod('dining-events-hotel-tulsa','Guest Preference Control Model','Hospitality Analytics','Personalization',650,250,1,'guest-preference,personalization,ml');
    add_prod('dining-events-hotel-tulsa','Cancellation Operations Risk Alert','Hospitality Analytics','Retention',320,125,1,'cancellation-risk,retention,booking');
    add_prod('dining-events-hotel-tulsa','F&B Spend Forecast','Hospitality Analytics','Spend Forecast',380,140,1,'food-beverage,spend-forecast,analytics');
    add_prod('dining-events-hotel-tulsa','Group Booking Policy','Sales Strategy','Group Policy',500,175,1,'group-booking,policy,sales');
    add_prod('harborstone-portfolio','Guest Preference Assessment','Sales Strategy','Guest Preference',150,45,1,'guest-preference,assessment,sales');
    add_prod('tech-district-hotel','Sales Manager Book Review','Sales Strategy','Book Review',780,290,1,'sales-manager,book-review,analytics');
    add_prod('harborstone-sustainability-hotel','Daily Folio Forecast','Revenue Operations','Forecasting',340,105,1,'folio-forecast,revenue-operations');
    add_prod('harborstone-guest-protection','Ancillary Revenue Sweep','Revenue Operations','Ancillary Revenue',210,66,1,'ancillary-revenue,sweep,upsell');
    add_prod('harborstone-signature-events','Event Escrow Service','Events','Contracting',310,100,1,'event-contract,escrow,billing');
    add_prod('harborstone-coastal-resort-wilmington','Night Audit Reporting Feed','Operations Reporting','Night Audit',430,150,1,'night-audit,reporting,operations');
    add_prod('harborstone-assurance-services','Event Equipment Lending Program','Events','Event Equipment',1650,700,1,'event-equipment,lending,venue');
    add_prod('harborstone-partner-direct','Sustainability Revenue Tracking','Sustainability','Reporting',900,360,1,'sustainability,revenue,reporting');
    add_prod('harborstone-apex-resort','Green Meeting Sales Strategy','Revenue Management','Green Meetings',1450,620,1,'green-meeting,sales-strategy,demand');
    add_prod('harborstone-group-sales','Association Group Booking Portal','Association and Government Groups','Booking Portal',1150,480,1,'association-group,booking-portal,group-sales');
    add_prod('harborstone-continuity-desk','Long-Stay Forecast Review','Leisure Packages','Extended Stay Operations Risk',1700,690,1,'long-stay,forecast,extended-stay');
    add_prod('harborstone-medical-district-hotel','Wellness Stay Guest Profile','Rooms','Wellness Package',45,12,1,'wellness-stay,guest-profile,rooms');
    add_prod('harborstone-cleanstay-hotel','Guest Folio Document Desk','Guest Services','Folio Document Services',25,8,1,'guest-folio,document-service,guest-services');
    add_prod('harborstone-bridge-hotel','Mobile Check-In Service','Digital Guest Services','Mobile Check-In',0,0,1,'mobile-check-in,digital,arrival');
    add_prod('harborstone-direct-booking-desk','Loyalty Pricing Bundle','Rate Plans','Relationship Pricing',15,3,1,'loyalty-pricing,rate-plan,direct');
    add_prod('harborstone-portside-hotel','Corporate Folio Rate','Events','Corporate Folio',100,35,1,'corporate-folio,event-billing,group');
    add_prod('harborstone-extended-stay','Alternative Demand Feed','Channel Management','Demand Data',720,290,1,'demand-data,channel-management,forecast');
    add_prod('harborstone-data-connect','Group Booking Portfolio Review','Operations Analytics','Group Portfolio',1300,520,1,'group-booking,portfolio,revenue-review');
    add_prod('harborstone-events-exchange','Guest Wellness Program','Guest Experience','Wellness',60,18,1,'guest-wellness,experience,retention');

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
    DBMS_OUTPUT.PUT_LINE('Room types and revenue centers loaded: ' || v_idx);
END;
/

-- ============================================================
-- GENERATE INVENTORY (each product or revenue center available at 5-15 random sites)
-- ============================================================
PROMPT Generating inventory...

DECLARE
    v_count       NUMBER := 0;
    v_num_centers NUMBER;
BEGIN
    FOR p IN (SELECT product_id FROM products) LOOP
        v_num_centers := FLOOR(DBMS_RANDOM.VALUE(5, 16));
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
