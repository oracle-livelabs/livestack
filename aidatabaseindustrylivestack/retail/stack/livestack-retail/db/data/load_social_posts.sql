/*
 * load_social_posts.sql
 * 5000 sporting-goods demand signal posts with realistic text, varied engagement, and product mentions
 */

SET SERVEROUTPUT ON
PROMPT Loading social posts...

DECLARE
    TYPE t_str IS TABLE OF VARCHAR2(500);

    -- Post templates with {brand} and {product} placeholders
    v_templates t_str := t_str(
        'Trail test with the {brand} {product}: strong grip, comfort, and durability feedback',
        'Customers are asking whether the new {product} from {brand} runs true to size',
        'Weekend hiking groups are comparing the {product} for wet trail performance',
        'Store associates report stronger interest in {brand} {product} before spring trips',
        'Unboxing the {brand} {product} for a field review after the next trail session',
        '{brand} {product} review after two weeks of daily training and outdoor use',
        'Customer demand for the {product} is rising and stores need inventory ready',
        'Gear guide note: the {brand} {product} is becoming a frequent recommendation',
        'Training customers are adding the {product} to their regular rotation',
        'Trail customers keep asking about the {product} from {brand}',
        'Day 30 with the {product}: consistent performance across repeated use',
        'Recommended the {brand} {product} to my hiking group after the latest route',
        'The {product} looked overhyped, but field feedback for {brand} is strong',
        'Trail test featuring the new {product}; {brand} is building strong demand',
        'Added the {product} to the weekend gear kit for repeat use',
        'The {product} from {brand} arrived early and is ready for the next trail run',
        'Rating the {brand} {product} high for comfort, fit, and outdoor durability',
        'Followers keep asking about this {product}; it is from {brand} and demand is building',
        '{brand} improved the trail experience with this {product}',
        'Three months with the {product}: still a strong performer from {brand}',
        'Recommended the {brand} {product} to my training partner for the next trip',
        'The {product} is gaining attention because {brand} met a real trail-use need',
        'Comparing the {brand} {product} to alternatives for grip, sizing, and packability',
        'When {brand} drops a new {product}, our local outdoor group takes notice',
        'This {product} is getting strong feedback from trail customers. Strong product signal for {brand}',
        'The {brand} {product} changed the way customers plan weekend routes',
        'Customers are asking whether every store will stock the {product} this week',
        'The attention to detail on this {product} from {brand} supports tough field use',
        'Spotted: the {brand} {product} trending across outdoor communities',
        'My honest review of the {product} after a month of use: {brand} built a credible option'
    );

    -- Additional organic-sounding posts (no brand mention)
    v_generic t_str := t_str(
        'Weekend trail shoppers are asking for waterproof boots with clearer sizing guidance',
        'Found the right workout gear for morning runs and strength training',
        'Store teams are seeing stronger demand for trail footwear, packs, and hydration gear',
        'Customers comparing hiking boots want grip, comfort, and easy exchanges if sizing runs small',
        'Outdoor creators are driving interest in AllTerrain Hiking Boots and adjacent camping gear',
        'Weekend hiking with updated gear is becoming a repeat customer story',
        'Regional demand is rising for running shoes, cycling accessories, and home training equipment',
        'Service teams are watching packaging, fit, and delivery timing feedback for outdoor gear',
        'Training audio and sports tech accessories are getting stronger customer attention',
        'Recovery and outdoor care products are showing up in more post-trip customer conversations'
    );

    v_max_inf_id NUMBER;
    v_max_prod_id NUMBER;
    v_inf_id NUMBER;
    v_prod_id NUMBER;
    v_brand_name VARCHAR2(200);
    v_prod_name VARCHAR2(300);
    v_post_text CLOB;
    v_platform VARCHAR2(50);
    v_platforms t_str := t_str('instagram','tiktok','twitter','youtube','threads');
    v_likes NUMBER;
    v_shares NUMBER;
    v_comments NUMBER;
    v_views NUMBER;
    v_sentiment NUMBER;
    v_posted_at TIMESTAMP;
    v_post_id NUMBER;
    v_count NUMBER := 0;
BEGIN
    SELECT MAX(influencer_id) INTO v_max_inf_id FROM influencers;
    SELECT MAX(product_id) INTO v_max_prod_id FROM products;

    FOR i IN 1..5000 LOOP
        -- Pick random influencer
        v_inf_id := FLOOR(DBMS_RANDOM.VALUE(1, v_max_inf_id + 1));

        -- Platform from influencer or random
        BEGIN
            SELECT platform INTO v_platform FROM influencers WHERE influencer_id = v_inf_id;
        EXCEPTION
            WHEN NO_DATA_FOUND THEN
                v_platform := v_platforms(MOD(i, 5) + 1);
                v_inf_id := NULL;
        END;

        -- 70% brand-mention posts, 30% generic
        IF DBMS_RANDOM.VALUE < 0.7 THEN
            -- Pick random product
            v_prod_id := FLOOR(DBMS_RANDOM.VALUE(1, v_max_prod_id + 1));
            BEGIN
                SELECT p.product_name, b.brand_name
                INTO v_prod_name, v_brand_name
                FROM products p JOIN brands b ON p.brand_id = b.brand_id
                WHERE p.product_id = v_prod_id;

                v_post_text := REPLACE(
                    REPLACE(
                        v_templates(MOD(i, v_templates.COUNT) + 1),
                        '{brand}', v_brand_name
                    ),
                    '{product}', v_prod_name
                );
            EXCEPTION
                WHEN NO_DATA_FOUND THEN
                    v_post_text := v_generic(MOD(i, v_generic.COUNT) + 1);
                    v_prod_id := NULL;
            END;
        ELSE
            v_post_text := v_generic(MOD(i, v_generic.COUNT) + 1);
            v_prod_id := NULL;
        END IF;

        -- Generate engagement metrics with power-law distribution
        -- Most posts low engagement, some medium, few viral
        CASE
            WHEN DBMS_RANDOM.VALUE < 0.02 THEN  -- 2% mega viral
                v_likes := FLOOR(DBMS_RANDOM.VALUE(50000, 500000));
                v_shares := FLOOR(DBMS_RANDOM.VALUE(10000, 100000));
                v_comments := FLOOR(DBMS_RANDOM.VALUE(5000, 50000));
                v_views := FLOOR(DBMS_RANDOM.VALUE(1000000, 20000000));
            WHEN DBMS_RANDOM.VALUE < 0.08 THEN  -- 6% viral
                v_likes := FLOOR(DBMS_RANDOM.VALUE(10000, 50000));
                v_shares := FLOOR(DBMS_RANDOM.VALUE(2000, 15000));
                v_comments := FLOOR(DBMS_RANDOM.VALUE(1000, 8000));
                v_views := FLOOR(DBMS_RANDOM.VALUE(200000, 1000000));
            WHEN DBMS_RANDOM.VALUE < 0.25 THEN  -- 17% rising
                v_likes := FLOOR(DBMS_RANDOM.VALUE(1000, 10000));
                v_shares := FLOOR(DBMS_RANDOM.VALUE(200, 2000));
                v_comments := FLOOR(DBMS_RANDOM.VALUE(100, 1000));
                v_views := FLOOR(DBMS_RANDOM.VALUE(20000, 200000));
            ELSE  -- 75% normal
                v_likes := FLOOR(DBMS_RANDOM.VALUE(10, 1000));
                v_shares := FLOOR(DBMS_RANDOM.VALUE(0, 100));
                v_comments := FLOOR(DBMS_RANDOM.VALUE(0, 50));
                v_views := FLOOR(DBMS_RANDOM.VALUE(100, 20000));
        END CASE;

        -- Sentiment: mostly positive for product mentions
        v_sentiment := CASE
            WHEN v_prod_id IS NOT NULL THEN ROUND(DBMS_RANDOM.VALUE(0.2, 0.95), 3)
            ELSE ROUND(DBMS_RANDOM.VALUE(-0.3, 0.9), 3)
        END;

        -- Posted within last 30 days, weighted toward recent
        v_posted_at := SYSTIMESTAMP - NUMTODSINTERVAL(
            POWER(DBMS_RANDOM.VALUE(0, 1), 2) * 30 * 24, 'HOUR'
        );

        INSERT INTO social_posts (
            influencer_id, platform, external_post_id, post_text,
            posted_at, likes_count, shares_count, comments_count, views_count,
            sentiment_score, momentum_flag
        ) VALUES (
            v_inf_id,
            v_platform,
            'ext_' || LOWER(v_platform) || '_' || LPAD(i, 8, '0'),
            v_post_text,
            v_posted_at,
            v_likes, v_shares, v_comments, v_views,
            v_sentiment,
            CASE
                WHEN v_likes > 50000 THEN 'mega_viral'
                WHEN v_likes > 10000 THEN 'viral'
                WHEN v_likes > 1000  THEN 'rising'
                ELSE 'normal'
            END
        ) RETURNING post_id INTO v_post_id;

        -- Insert product mention if we have one
        IF v_prod_id IS NOT NULL THEN
            BEGIN
                INSERT INTO post_product_mentions (
                    post_id, product_id, confidence_score, mention_type
                ) VALUES (
                    v_post_id, v_prod_id,
                    ROUND(DBMS_RANDOM.VALUE(0.7, 1.0), 3),
                    CASE MOD(i, 5)
                        WHEN 0 THEN 'direct'
                        WHEN 1 THEN 'semantic'
                        WHEN 2 THEN 'hashtag'
                        WHEN 3 THEN 'visual'
                        ELSE 'inferred'
                    END
                );
            EXCEPTION
                WHEN DUP_VAL_ON_INDEX THEN NULL;
            END;
        END IF;

        v_count := v_count + 1;

        IF MOD(v_count, 500) = 0 THEN
            COMMIT;
        END IF;
    END LOOP;

    COMMIT;
    DBMS_OUTPUT.PUT_LINE('Social posts loaded: ' || v_count);
END;
/
