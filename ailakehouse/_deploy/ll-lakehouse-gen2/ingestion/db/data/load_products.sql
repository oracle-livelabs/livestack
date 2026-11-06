/*
 * load_products.sql
 * PeakGear sporting goods products across retail, e-commerce, store, and B2B channels
 * Uses PL/SQL to generate volume with variety
 */

SET SERVEROUTPUT ON
PROMPT Loading PeakGear products...

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
    -- PeakGear sporting goods catalog inspired by the AI Lakehouse deck:
    -- products and inventory, dynamic price match, returns audit, store master info,
    -- customer propensity, and demand forecasting.
    add_prod('peakgearcore','SummitStride Trail Runner','Footwear','Trail Running',149.99,72,0.68,'trail-running,footwear,grip,demand-forecast');
    add_prod('summittrail','RidgeRunner Hiking Boot','Footwear','Hiking Boots',189.99,91.5,1.25,'hiking,boots,outdoor,inventory');
    add_prod('ridgerunner','VelocityFit Court Shoe','Footwear','Court Sports',129.99,58,0.72,'court,team-sports,footwear');
    add_prod('velocityfit','GoldLayer Training Hoodie','Activewear','Hoodies',84.99,31,0.52,'gold-layer,activewear,training');
    add_prod('alpineforge','SilverRidge Trail Shell','Activewear','Outerwear',179.99,78,0.44,'silver-layer,trail,weatherproof');
    add_prod('trailheadteams','BronzeTrail Base Tee','Activewear','Base Layers',34.99,11.5,0.18,'bronze-layer,tee,training');
    add_prod('gearpay','MotionFlex Compression Tight','Activewear','Compression',69.99,25,0.26,'activewear,compression,fitness');
    add_prod('packguard','StormGuard Rain Jacket','Outdoor Gear','Weather Shells',159.99,68,0.58,'outdoor,rain,storm,zero-copy');
    add_prod('urbancourt','ZeroCopy Hydration Vest','Outdoor Gear','Hydration',119.99,49,0.41,'hydration,trail,zero-copy');
    add_prod('ecopeak','SilverRidge Backpack 35L','Outdoor Gear','Packs',139.99,61,1.15,'pack,backpack,silver-layer');
    add_prod('loyaltypeak','TrailForge Trekking Poles','Outdoor Gear','Trekking Poles',99.99,39,0.62,'trekking,trailforge,outdoor');
    add_prod('catalystsafety','SummitCore Sleeping Bag','Outdoor Gear','Camp Sleep',219.99,98,1.8,'summit,camping,sleep');
    add_prod('northstaroutdoor','ApexCamp 3P Tent','Outdoor Gear','Tents',349.99,175,3.2,'tent,camping,apex');
    add_prod('gulfrun','PulseTrack GPS Watch','Fitness Devices','Wearables',249.99,118,0.08,'fitness-device,gps,aidp');
    add_prod('midwestpickup','ApexBand HR Sensor','Fitness Devices','Sensors',79.99,29,0.04,'wearable,heart-rate,fitness');
    add_prod('pacificcommerce','CadencePro Bike Computer','Fitness Devices','Cycling Tech',199.99,91,0.11,'cycling,device,fitness');
    add_prod('returnsure','RecoveryPulse Massage Sleeve','Fitness Devices','Recovery',129.99,55,0.35,'recovery,fitness,wellness');
    add_prod('routeonefulfillment','PowerRack Adjustable Kettlebell','Fitness Equipment','Strength',119.99,50,8,'strength,kettlebell,store-pickup');
    add_prod('waterlineoutdoor','CoreBalance Yoga Kit','Fitness Equipment','Yoga',64.99,22,1.1,'yoga,training,home-fitness');
    add_prod('recoveryfit','CourtCore Basketball','Team Sports','Basketball',39.99,13,0.62,'team-sports,basketball,b2b');
    add_prod('electraride','GoalLine Team Kit','Team Sports','Soccer',299.99,128,4.6,'team-kit,soccer,b2b');
    add_prod('recycleoutdoor','DiamondPro Baseball Glove','Team Sports','Baseball',119.99,48,0.55,'baseball,glove,team');
    add_prod('demanddesk','Waterline SUP Board','Water Sports','Paddle Boards',599.99,310,10.5,'water-sports,sup,oversized');
    add_prod('healthpeak','CoastalDry Duffel','Outdoor Gear','Dry Bags',89.99,33,0.85,'waterproof,duffel,outdoor');
    add_prod('cleantrail','TeamPack Sideline Bundle','B2B Partnerships','Team Bundles',799.99,365,12,'b2b,team-sales,school-athletics');
    add_prod('bridgelineb2b','Dynamic Price Match Bundle','E-Commerce','Promotions',59.99,19,0.3,'dynamic-price-match,promotion,ecommerce');
    add_prod('stockguard','Returns Audit Starter Kit','Store Operations','Returns Audit',44.99,12,0.2,'returns-audit,store-ops,quality');
    add_prod('finepointdigital','Product Image Enrichment Pack','Product Data','Digital Assets',24.99,5,0.01,'product-images,object-store,catalog');
    add_prod('portsideoutdoor','Store Master Info Kit','Store Operations','Store Master',39.99,9,0.02,'store-master,pos,governance');
    add_prod('altitudeyield','Customer Propensity Offer Pack','Loyalty and Offers','Campaign Targeting',49.99,14,0.05,'customer-propensity,campaign,loyalty');
    add_prod('purepack','SummitStride Trail Runner 2','Footwear','Trail Running',149.99,72,0.68,'trail-running,footwear,grip,demand-forecast');
    add_prod('siliconfit','RidgeRunner Hiking Boot 2','Footwear','Hiking Boots',189.99,91.5,1.25,'hiking,boots,outdoor,inventory');
    add_prod('carbonactive','VelocityFit Court Shoe 2','Footwear','Court Sports',129.99,58,0.72,'court,team-sports,footwear');
    add_prod('returnguard','GoldLayer Training Hoodie 2','Activewear','Hoodies',84.99,31,0.52,'gold-layer,activewear,training');
    add_prod('gearvault','SilverRidge Trail Shell 2','Activewear','Outerwear',179.99,78,0.44,'silver-layer,trail,weatherproof');
    add_prod('coastalperimeter','BronzeTrail Base Tee 2','Activewear','Base Layers',34.99,11.5,0.18,'bronze-layer,tee,training');
    add_prod('civicsure','MotionFlex Compression Tight 2','Activewear','Compression',69.99,25,0.26,'activewear,compression,fitness');
    add_prod('ipadirect','StormGuard Rain Jacket 2','Outdoor Gear','Weather Shells',159.99,68,0.58,'outdoor,rain,storm,zero-copy');
    add_prod('apexoneoutdoors','ZeroCopy Hydration Vest 2','Outdoor Gear','Hydration',119.99,49,0.41,'hydration,trail,zero-copy');
    add_prod('propelperformance','SilverRidge Backpack 35L 2','Outdoor Gear','Packs',139.99,61,1.15,'pack,backpack,silver-layer');
    add_prod('continuitysupply','TrailForge Trekking Poles 2','Outdoor Gear','Trekking Poles',99.99,39,0.62,'trekking,trailforge,outdoor');
    add_prod('batterystreet','SummitCore Sleeping Bag 2','Outdoor Gear','Camp Sleep',219.99,98,1.8,'summit,camping,sleep');
    add_prod('trendwatch','ApexCamp 3P Tent 2','Outdoor Gear','Tents',349.99,175,3.2,'tent,camping,apex');
    add_prod('safetyupdates','PulseTrack GPS Watch 2','Fitness Devices','Wearables',249.99,118,0.08,'fitness-device,gps,aidp');
    add_prod('marketpulse','ApexBand HR Sensor 2','Fitness Devices','Sensors',79.99,29,0.04,'wearable,heart-rate,fitness');
    add_prod('storeops','CadencePro Bike Computer 2','Fitness Devices','Cycling Tech',199.99,91,0.11,'cycling,device,fitness');
    add_prod('assortmentdesk','RecoveryPulse Massage Sleeve 2','Fitness Devices','Recovery',129.99,55,0.35,'recovery,fitness,wellness');
    add_prod('ledgergrade','PowerRack Adjustable Kettlebell 2','Fitness Equipment','Strength',119.99,50,8,'strength,kettlebell,store-pickup');
    add_prod('specialtygear','CoreBalance Yoga Kit 2','Fitness Equipment','Yoga',64.99,22,1.1,'yoga,training,home-fitness');
    add_prod('northstarpickup','CourtCore Basketball 2','Team Sports','Basketball',39.99,13,0.62,'team-sports,basketball,b2b');
    add_prod('peakgearcore','GoalLine Team Kit 2','Team Sports','Soccer',299.99,128,4.6,'team-kit,soccer,b2b');
    add_prod('summittrail','DiamondPro Baseball Glove 2','Team Sports','Baseball',119.99,48,0.55,'baseball,glove,team');
    add_prod('ridgerunner','Waterline SUP Board 2','Water Sports','Paddle Boards',599.99,310,10.5,'water-sports,sup,oversized');
    add_prod('velocityfit','CoastalDry Duffel 2','Outdoor Gear','Dry Bags',89.99,33,0.85,'waterproof,duffel,outdoor');
    add_prod('alpineforge','TeamPack Sideline Bundle 2','B2B Partnerships','Team Bundles',799.99,365,12,'b2b,team-sales,school-athletics');
    add_prod('trailheadteams','Dynamic Price Match Bundle 2','E-Commerce','Promotions',59.99,19,0.3,'dynamic-price-match,promotion,ecommerce');
    add_prod('gearpay','Returns Audit Starter Kit 2','Store Operations','Returns Audit',44.99,12,0.2,'returns-audit,store-ops,quality');
    add_prod('packguard','Product Image Enrichment Pack 2','Product Data','Digital Assets',24.99,5,0.01,'product-images,object-store,catalog');
    add_prod('urbancourt','Store Master Info Kit 2','Store Operations','Store Master',39.99,9,0.02,'store-master,pos,governance');
    add_prod('ecopeak','Customer Propensity Offer Pack 2','Loyalty and Offers','Campaign Targeting',49.99,14,0.05,'customer-propensity,campaign,loyalty');
    add_prod('loyaltypeak','SummitStride Trail Runner 3','Footwear','Trail Running',149.99,72,0.68,'trail-running,footwear,grip,demand-forecast');
    add_prod('catalystsafety','RidgeRunner Hiking Boot 3','Footwear','Hiking Boots',189.99,91.5,1.25,'hiking,boots,outdoor,inventory');
    add_prod('northstaroutdoor','VelocityFit Court Shoe 3','Footwear','Court Sports',129.99,58,0.72,'court,team-sports,footwear');
    add_prod('gulfrun','GoldLayer Training Hoodie 3','Activewear','Hoodies',84.99,31,0.52,'gold-layer,activewear,training');
    add_prod('midwestpickup','SilverRidge Trail Shell 3','Activewear','Outerwear',179.99,78,0.44,'silver-layer,trail,weatherproof');
    add_prod('pacificcommerce','BronzeTrail Base Tee 3','Activewear','Base Layers',34.99,11.5,0.18,'bronze-layer,tee,training');
    add_prod('returnsure','MotionFlex Compression Tight 3','Activewear','Compression',69.99,25,0.26,'activewear,compression,fitness');
    add_prod('routeonefulfillment','StormGuard Rain Jacket 3','Outdoor Gear','Weather Shells',159.99,68,0.58,'outdoor,rain,storm,zero-copy');
    add_prod('waterlineoutdoor','ZeroCopy Hydration Vest 3','Outdoor Gear','Hydration',119.99,49,0.41,'hydration,trail,zero-copy');
    add_prod('recoveryfit','SilverRidge Backpack 35L 3','Outdoor Gear','Packs',139.99,61,1.15,'pack,backpack,silver-layer');
    add_prod('electraride','TrailForge Trekking Poles 3','Outdoor Gear','Trekking Poles',99.99,39,0.62,'trekking,trailforge,outdoor');
    add_prod('recycleoutdoor','SummitCore Sleeping Bag 3','Outdoor Gear','Camp Sleep',219.99,98,1.8,'summit,camping,sleep');
    add_prod('demanddesk','ApexCamp 3P Tent 3','Outdoor Gear','Tents',349.99,175,3.2,'tent,camping,apex');
    add_prod('healthpeak','PulseTrack GPS Watch 3','Fitness Devices','Wearables',249.99,118,0.08,'fitness-device,gps,aidp');
    add_prod('cleantrail','ApexBand HR Sensor 3','Fitness Devices','Sensors',79.99,29,0.04,'wearable,heart-rate,fitness');
    add_prod('bridgelineb2b','CadencePro Bike Computer 3','Fitness Devices','Cycling Tech',199.99,91,0.11,'cycling,device,fitness');
    add_prod('stockguard','RecoveryPulse Massage Sleeve 3','Fitness Devices','Recovery',129.99,55,0.35,'recovery,fitness,wellness');
    add_prod('finepointdigital','PowerRack Adjustable Kettlebell 3','Fitness Equipment','Strength',119.99,50,8,'strength,kettlebell,store-pickup');
    add_prod('portsideoutdoor','CoreBalance Yoga Kit 3','Fitness Equipment','Yoga',64.99,22,1.1,'yoga,training,home-fitness');
    add_prod('altitudeyield','CourtCore Basketball 3','Team Sports','Basketball',39.99,13,0.62,'team-sports,basketball,b2b');
    add_prod('purepack','GoalLine Team Kit 3','Team Sports','Soccer',299.99,128,4.6,'team-kit,soccer,b2b');
    add_prod('siliconfit','DiamondPro Baseball Glove 3','Team Sports','Baseball',119.99,48,0.55,'baseball,glove,team');
    add_prod('carbonactive','Waterline SUP Board 3','Water Sports','Paddle Boards',599.99,310,10.5,'water-sports,sup,oversized');
    add_prod('returnguard','CoastalDry Duffel 3','Outdoor Gear','Dry Bags',89.99,33,0.85,'waterproof,duffel,outdoor');
    add_prod('gearvault','TeamPack Sideline Bundle 3','B2B Partnerships','Team Bundles',799.99,365,12,'b2b,team-sales,school-athletics');
    add_prod('coastalperimeter','Dynamic Price Match Bundle 3','E-Commerce','Promotions',59.99,19,0.3,'dynamic-price-match,promotion,ecommerce');
    add_prod('civicsure','Returns Audit Starter Kit 3','Store Operations','Returns Audit',44.99,12,0.2,'returns-audit,store-ops,quality');
    add_prod('ipadirect','Product Image Enrichment Pack 3','Product Data','Digital Assets',24.99,5,0.01,'product-images,object-store,catalog');
    add_prod('apexoneoutdoors','Store Master Info Kit 3','Store Operations','Store Master',39.99,9,0.02,'store-master,pos,governance');
    add_prod('propelperformance','Customer Propensity Offer Pack 3','Loyalty and Offers','Campaign Targeting',49.99,14,0.05,'customer-propensity,campaign,loyalty');

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
    DBMS_OUTPUT.PUT_LINE('PeakGear products loaded: ' || v_idx);
END;
/

-- ============================================================
-- GENERATE INVENTORY (each PeakGear product available at 5-15 random sites)
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
    DBMS_OUTPUT.PUT_LINE('Inventory records loaded: ' || v_count);
END;
/
