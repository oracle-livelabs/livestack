/*
 * enrich_product_descriptions.sql
 * Replaces generated gold-catalog placeholder copy with retail product copy.
 * Safe to rerun after load_gold_seed.sql. Targets generated gold-data catalog
 * rows so copy and subcategory improvements can be reapplied after reseeds.
 */

SET SERVEROUTPUT ON
SET DEFINE OFF
PROMPT Enriching PeakGear product descriptions...

DECLARE
    v_updated NUMBER := 0;

    FUNCTION normalized_name(p_name VARCHAR2) RETURN VARCHAR2 IS
        v_name VARCHAR2(300);
    BEGIN
        v_name := REGEXP_REPLACE(TRIM(p_name), '\s+', ' ');
        v_name := REGEXP_REPLACE(v_name, '\s+[0-9]+$', '');
        RETURN v_name;
    END;

    FUNCTION derived_subcategory(p_name VARCHAR2, p_category VARCHAR2) RETURN VARCHAR2 IS
        v_name VARCHAR2(300) := LOWER(normalized_name(p_name));
        v_category VARCHAR2(100) := NVL(p_category, 'Uncategorized');
    BEGIN
        IF v_name LIKE '%trail runner%' THEN RETURN 'Trail Running';
        ELSIF v_name LIKE '%running shoe%' THEN RETURN 'Road Running';
        ELSIF v_name LIKE '%cross-training shoe%' THEN RETURN 'Cross Training';
        ELSIF v_name LIKE '%hiking boot%' THEN RETURN 'Hiking Boots';
        ELSIF v_name LIKE '%running socks%' THEN RETURN 'Running Socks';
        ELSIF v_name LIKE '%hydration belt%' THEN RETURN 'Hydration';
        ELSIF v_name LIKE '%reflective vest%' THEN RETURN 'Visibility';
        ELSIF v_name LIKE '%foam roller%' THEN RETURN 'Recovery';
        ELSIF v_name LIKE '%training hoodie%' THEN RETURN 'Hoodies';
        ELSIF v_name LIKE '%compression shorts%' THEN RETURN 'Compression';
        ELSIF v_name LIKE '%performance tee%' THEN RETURN 'Performance Tops';
        ELSIF v_name LIKE '%base layer top%' OR v_name LIKE '%base layer pants%' THEN RETURN 'Base Layers';
        ELSIF v_name LIKE '%outdoor jacket%' THEN RETURN 'Weather Shells';
        ELSIF v_name LIKE '%daypack%' OR v_name LIKE '%backpack%' THEN RETURN 'Packs';
        ELSIF v_name LIKE '%trekking poles%' THEN RETURN 'Trekking Poles';
        ELSIF v_name LIKE '%tent%' THEN RETURN 'Tents';
        ELSIF v_name LIKE '%camping stove%' THEN RETURN 'Camp Kitchen';
        ELSIF v_name LIKE '%headlamp%' THEN RETURN 'Lighting';
        ELSIF v_name LIKE '%dry bag%' THEN RETURN 'Dry Bags';
        ELSIF v_name LIKE '%bike light%' THEN RETURN 'Bike Lights';
        ELSIF v_name LIKE '%cycling jersey%' THEN RETURN 'Cycling Apparel';
        ELSIF v_name LIKE '%repair kit%' THEN RETURN 'Bike Maintenance';
        ELSIF v_name LIKE '%kettlebell%' OR v_name LIKE '%dumbbells%' THEN RETURN 'Free Weights';
        ELSIF v_name LIKE '%resistance band%' THEN RETURN 'Resistance Training';
        ELSIF v_name LIKE '%yoga mat%' THEN RETURN 'Yoga';
        ELSIF v_name LIKE '%gps fitness watch%' THEN RETURN 'Wearables';
        ELSIF v_name LIKE '%smart scale%' THEN RETURN 'Connected Scales';
        ELSIF v_name LIKE '%basketball%' THEN RETURN 'Basketball';
        ELSIF v_name LIKE '%soccer ball%' THEN RETURN 'Soccer';
        ELSIF v_name LIKE '%baseball glove%' THEN RETURN 'Baseball';
        ELSIF v_name LIKE '%volleyball%' THEN RETURN 'Volleyball';
        ELSIF v_name LIKE '%pickleball paddle%' THEN RETURN 'Pickleball';
        ELSIF v_name LIKE '%tennis racket%' THEN RETURN 'Tennis';
        ELSIF v_name LIKE '%badminton set%' THEN RETURN 'Badminton';
        ELSIF v_name LIKE '%grip tape%' THEN RETURN 'Racquet Accessories';
        ELSIF v_name LIKE '%climbing harness%' THEN RETURN 'Harnesses';
        ELSIF v_name LIKE '%belay device%' THEN RETURN 'Belay Devices';
        ELSIF v_name LIKE '%carabiner set%' THEN RETURN 'Carabiners';
        ELSIF v_name LIKE '%snow helmet%' THEN RETURN 'Helmets';
        ELSIF v_name LIKE '%wetsuit%' THEN RETURN 'Wetsuits';
        ELSIF v_name LIKE '%swim goggles%' THEN RETURN 'Swim Goggles';
        ELSIF v_name LIKE '%paddle leash%' THEN RETURN 'Paddle Accessories';
        ELSIF v_name LIKE '%electrolyte mix%' THEN RETURN 'Hydration Nutrition';
        ELSE RETURN v_category;
        END IF;
    END;

    FUNCTION description_for(
        p_name VARCHAR2,
        p_brand VARCHAR2,
        p_category VARCHAR2,
        p_subcategory VARCHAR2
    ) RETURN VARCHAR2 IS
        v_name VARCHAR2(300) := normalized_name(p_name);
        v_lower VARCHAR2(300) := LOWER(normalized_name(p_name));
        v_brand VARCHAR2(200) := NVL(p_brand, 'PeakGear');
        v_category VARCHAR2(100) := NVL(p_category, 'sporting goods');
        v_subcategory VARCHAR2(100) := NVL(p_subcategory, v_category);
    BEGIN
        IF v_lower LIKE '%trail runner%' THEN
            RETURN 'The ' || v_name || ' is a mixed-terrain trail running shoe built for grip, stable cushioning, and fast turns from training runs to weekend race demand.';
        ELSIF v_lower LIKE '%running shoe%' OR v_lower LIKE '%cross-training shoe%' THEN
            RETURN 'The ' || v_name || ' supports daily training with responsive cushioning, breathable construction, and the durability shoppers expect from a high-rotation footwear item.';
        ELSIF v_lower LIKE '%running socks%' THEN
            RETURN 'The ' || v_name || ' are running essentials with moisture control, targeted cushioning, and a secure fit for shoppers stocking up before training blocks, races, and travel weekends.';
        ELSIF v_lower LIKE '%training hoodie%' THEN
            RETURN 'The ' || v_name || ' is a soft training layer for warmups, recovery days, and casual wear, balancing comfort, stretch, and repeatable fit across PeakGear channels.';
        ELSIF v_lower LIKE '%compression shorts%' THEN
            RETURN 'The ' || v_name || ' deliver supportive stretch, quick-dry fabric, and low-profile comfort for gym sessions, running plans, and team training bundles.';
        ELSIF v_lower LIKE '%performance tee%' OR v_lower LIKE '%base layer top%' OR v_lower LIKE '%base layer pants%' THEN
            RETURN 'The ' || v_name || ' is a technical apparel staple with breathable fabric, easy layering, and dependable fit for training, travel, and seasonal assortment planning.';
        ELSIF v_lower LIKE '%outdoor jacket%' THEN
            RETURN 'The ' || v_name || ' gives shoppers a weather-ready outer layer with packable coverage, trail-friendly mobility, and practical protection for changing conditions.';
        ELSIF v_lower LIKE '%daypack%' OR v_lower LIKE '%backpack%' THEN
            RETURN 'The ' || v_name || ' is built for trail days, commutes, and store-pickup adventures with organized storage, durable materials, and comfortable carry support.';
        ELSIF v_lower LIKE '%trekking poles%' THEN
            RETURN 'The ' || v_name || ' add stable support for hikes and uneven terrain with adjustable handling, dependable tips, and lightweight packability.';
        ELSIF v_lower LIKE '%tent%' THEN
            RETURN 'The ' || v_name || ' supports camping and weekend outdoor trips with dependable shelter, straightforward setup, and packable storage for family and trail customers.';
        ELSIF v_lower LIKE '%camping stove%' THEN
            RETURN 'The ' || v_name || ' gives campers a compact cooking option for trailheads, campsites, and road trips, with practical handling for repeat outdoor use.';
        ELSIF v_lower LIKE '%headlamp%' THEN
            RETURN 'The ' || v_name || ' keeps runners, hikers, and campsite customers visible with hands-free lighting designed for early starts and late returns.';
        ELSIF v_lower LIKE '%dry bag%' THEN
            RETURN 'The ' || v_name || ' protects essentials around water, rain, and travel with roll-top storage and durable materials for paddle, beach, and outdoor trips.';
        ELSIF v_lower LIKE '%bike light%' THEN
            RETURN 'The ' || v_name || ' improves cycling visibility for commuting and evening rides with simple mounting, practical brightness, and everyday reliability.';
        ELSIF v_lower LIKE '%cycling jersey%' THEN
            RETURN 'The ' || v_name || ' is a breathable cycling layer with ride-ready pockets, close fit, and comfort for training groups, weekend riders, and event demand.';
        ELSIF v_lower LIKE '%repair kit%' THEN
            RETURN 'The ' || v_name || ' gives cyclists a compact maintenance essential for flats, adjustments, and ride-day issues, making it a practical add-on for service and checkout.';
        ELSIF v_lower LIKE '%kettlebell%' OR v_lower LIKE '%dumbbells%' OR v_lower LIKE '%resistance band%' THEN
            RETURN 'The ' || v_name || ' fits strength routines at home, in gyms, and in team training programs with durable construction and broad workout versatility.';
        ELSIF v_lower LIKE '%yoga mat%' OR v_lower LIKE '%foam roller%' THEN
            RETURN 'The ' || v_name || ' supports mobility, recovery, and daily wellness routines with dependable comfort for studio, home, and post-training use.';
        ELSIF v_lower LIKE '%gps fitness watch%' THEN
            RETURN 'The ' || v_name || ' helps athletes track runs, rides, workouts, and recovery signals with a wearable profile suited to connected fitness shoppers.';
        ELSIF v_lower LIKE '%smart scale%' THEN
            RETURN 'The ' || v_name || ' adds connected wellness tracking for households and training customers who want simple progress signals between workouts.';
        ELSIF v_lower LIKE '%basketball%' OR v_lower LIKE '%soccer ball%' OR v_lower LIKE '%baseball glove%' OR v_lower LIKE '%volleyball%' THEN
            RETURN 'The ' || v_name || ' belongs in the team-sport assortment for practice, school programs, clubs, and family recreation, with dependable construction for frequent play.';
        ELSIF v_lower LIKE '%pickleball paddle%' OR v_lower LIKE '%tennis racket%' OR v_lower LIKE '%badminton set%' OR v_lower LIKE '%grip tape%' THEN
            RETURN 'The ' || v_name || ' supports racquet-sport demand across club play, casual matches, and seasonal promotions with approachable performance and practical add-on potential.';
        ELSIF v_lower LIKE '%climbing harness%' OR v_lower LIKE '%belay device%' OR v_lower LIKE '%carabiner set%' THEN
            RETURN 'The ' || v_name || ' supports climbing customers with practical gear for gym sessions, outdoor trips, and safety-focused equipment checks.';
        ELSIF v_lower LIKE '%snow helmet%' THEN
            RETURN 'The ' || v_name || ' gives winter-sport customers protective coverage for ski and snow days with comfortable fit and durable shell construction.';
        ELSIF v_lower LIKE '%wetsuit%' OR v_lower LIKE '%swim goggles%' OR v_lower LIKE '%paddle leash%' THEN
            RETURN 'The ' || v_name || ' supports water-sport customers with dependable performance for paddle, swim, beach, and warm-weather travel demand.';
        ELSIF v_lower LIKE '%electrolyte mix%' THEN
            RETURN 'The ' || v_name || ' helps endurance and training customers replenish during workouts, races, and hot-weather activity with an easy basket-building nutrition item.';
        ELSE
            RETURN 'The ' || v_name || ' is a ' || LOWER(v_brand) || ' ' || LOWER(v_subcategory) || ' item in the ' || LOWER(v_category) || ' assortment, positioned for active shoppers and repeat retail demand.';
        END IF;
    END;
BEGIN
    FOR r IN (
        SELECT p.product_id,
               p.product_name,
               p.description,
               p.category,
               p.subcategory,
               b.brand_name
        FROM products p
        JOIN brands b ON b.brand_id = p.brand_id
        WHERE p.tags LIKE 'gold-data,%'
           OR DBMS_LOB.INSTR(p.description, 'Gold catalog product') > 0
           OR p.subcategory IN ('NetSuite', 'Gold Lakehouse')
           OR p.subcategory IS NULL
    ) LOOP
        DECLARE
            v_subcategory VARCHAR2(100);
            v_description VARCHAR2(4000);
        BEGIN
            v_subcategory := derived_subcategory(r.product_name, r.category);
            v_description := description_for(r.product_name, r.brand_name, r.category, v_subcategory);

            UPDATE products
            SET description = TO_CLOB(v_description),
                subcategory = v_subcategory,
                updated_at = SYSTIMESTAMP
            WHERE product_id = r.product_id;

            v_updated := v_updated + 1;
        END;
    END LOOP;

    COMMIT;
    DBMS_OUTPUT.PUT_LINE('PeakGear product descriptions enriched: ' || v_updated);
END;
/

DECLARE
    v_embedding_count NUMBER := 0;
    v_model_count NUMBER := 0;
    v_refreshed NUMBER := 0;
BEGIN
    SELECT COUNT(*) INTO v_embedding_count FROM product_embeddings;

    IF v_embedding_count = 0 THEN
        DBMS_OUTPUT.PUT_LINE('Product embeddings refresh skipped: no existing embeddings.');
    ELSE
        SELECT COUNT(*) INTO v_model_count
        FROM user_mining_models
        WHERE model_name = 'ALL_MINILM_L12_V2';

        IF v_model_count = 0 THEN
            DBMS_OUTPUT.PUT_LINE('Product embeddings refresh skipped: ALL_MINILM_L12_V2 is not loaded.');
        ELSE
            EXECUTE IMMEDIATE q'[
                UPDATE product_embeddings pe
                SET embedding_text = (
                        SELECT SUBSTR(
                                   p.product_name || ' ' ||
                                   p.category || ' ' ||
                                   DBMS_LOB.SUBSTR(p.description, 1200, 1) || ' ' ||
                                   b.brand_name,
                                   1,
                                   1900
                               )
                        FROM products p
                        JOIN brands b ON b.brand_id = p.brand_id
                        WHERE p.product_id = pe.product_id
                    ),
                    embedding = (
                        SELECT VECTOR_EMBEDDING(
                                   ALL_MINILM_L12_V2 USING
                                   SUBSTR(
                                       p.product_name || ' ' ||
                                       p.category || ' ' ||
                                       DBMS_LOB.SUBSTR(p.description, 1200, 1) || ' ' ||
                                       b.brand_name,
                                       1,
                                       1900
                                   ) AS DATA
                               )
                        FROM products p
                        JOIN brands b ON b.brand_id = p.brand_id
                        WHERE p.product_id = pe.product_id
                    ),
                    created_at = SYSTIMESTAMP
                WHERE EXISTS (
                    SELECT 1
                    FROM products p
                    WHERE p.product_id = pe.product_id
                      AND p.tags LIKE 'gold-data,%'
                )
            ]';

            v_refreshed := SQL%ROWCOUNT;
            COMMIT;
            DBMS_OUTPUT.PUT_LINE('Product embeddings refreshed: ' || v_refreshed);
        END IF;
    END IF;
EXCEPTION
    WHEN OTHERS THEN
        DBMS_OUTPUT.PUT_LINE('Product embeddings refresh skipped: ' || SQLERRM);
END;
/
