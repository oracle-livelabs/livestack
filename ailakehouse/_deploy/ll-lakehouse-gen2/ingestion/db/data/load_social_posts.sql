/*
 * load_social_posts.sql
 * 5000 retail demand, pricing, creator, returns, and operations signals with product mentions
 */

SET SERVEROUTPUT ON
PROMPT Loading PeakGear demand and market signals...

DECLARE
    TYPE t_str IS TABLE OF VARCHAR2(500);

    -- Signal templates with {brand} and {product} placeholders.
    -- Existing table names stay as SOCIAL_POSTS for app compatibility.
    v_templates t_str := t_str(
        '{brand} saw creator demand spike for {product}; store allocation should be reviewed',
        'Dynamic price match alert references {product}; {brand} competitor pricing moved in two regions',
        'POS transaction surge detected for {product}; {brand} replenishment plan should be refreshed',
        'Returns audit note mentions {product}; {brand} product content and sizing guidance need review',
        'Store pickup demand increased for {product}; {brand} nearby inventory should be repositioned',
        'E-commerce search trend rising for {product}; {brand} campaign targeting score improved',
        'Weather and trail conditions lifted demand for {product}; {brand} regional forecast moved up',
        'B2B team order inquiry references {product}; {brand} school athletics pipeline is increasing',
        'Product image enrichment requested for {product}; {brand} catalog completeness needs attention',
        'Product manual search spike mentions {product}; {brand} service content should be promoted',
        'Influencer review mentions {product}; {brand} sentiment and conversion likelihood improved',
        'Inventory transfer signal raised for {product}; {brand} west-region stock is below plan',
        'Assortment planner flagged substitute demand for {product}; {brand} pickup incentives should be tested',
        'Customer propensity model ranked {product}; {brand} loyalty audience likely to convert',
        'Safety update references {product}; {brand} store teams should confirm return reason codes',
        'Peak season forecast raised for {product}; {brand} demand multiplier is accelerating',
        'Marketplace listing change mentions {product}; {brand} channel margin should be monitored',
        'Store master update affects {product}; {brand} location eligibility needs validation',
        'Lakehouse catalog enrichment matched {product}; {brand} semantic search coverage improved',
        'Operations signal added {product}; {brand} allocation workflow requested'
    );

    -- Additional generic signals with no brand or partner mention.
    v_generic t_str := t_str(
        'Trail running searches increased after a regional event announcement',
        'Dynamic price match activity rose across outdoor gear and activewear categories',
        'POS transactions show weekend demand shifting toward pickup and ship-from-store',
        'Returns audit volume increased for apparel sizing and product content gaps',
        'B2B partnership inquiries rose for school athletics and corporate wellness bundles',
        'Product image enrichment jobs improved catalog completeness for high-demand items',
        'Customer propensity scoring identified a new pickup incentive audience',
        'Demand forecasting model raised replenishment priority in mountain and coastal regions',
        'Store master updates changed eligibility for same-day pickup in several metros',
        'Product manual views increased for connected fitness devices'
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
        -- Pick random signal source.
        v_inf_id := FLOOR(DBMS_RANDOM.VALUE(1, v_max_inf_id + 1));

        -- Feed channel from source or random.
        BEGIN
            SELECT platform INTO v_platform FROM influencers WHERE influencer_id = v_inf_id;
        EXCEPTION
            WHEN NO_DATA_FOUND THEN
                v_platform := v_platforms(MOD(i, 5) + 1);
                v_inf_id := NULL;
        END;

        -- 70% brand or partner/sporting goods product-specific signals, 30% generic signals.
        IF DBMS_RANDOM.VALUE < 0.7 THEN
            -- Pick random sporting goods product.
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

        -- Generate signal reach metrics with power-law distribution.
        -- Most signals are routine, some elevated, few critical.
        CASE
            WHEN DBMS_RANDOM.VALUE < 0.02 THEN  -- 2% critical
                v_likes := FLOOR(DBMS_RANDOM.VALUE(50000, 500000));
                v_shares := FLOOR(DBMS_RANDOM.VALUE(10000, 100000));
                v_comments := FLOOR(DBMS_RANDOM.VALUE(5000, 50000));
                v_views := FLOOR(DBMS_RANDOM.VALUE(1000000, 20000000));
            WHEN DBMS_RANDOM.VALUE < 0.08 THEN  -- 6% elevated
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

        -- Sentiment: sporting goods product-specific signals skew toward actionable risk.
        v_sentiment := CASE
            WHEN v_prod_id IS NOT NULL THEN ROUND(DBMS_RANDOM.VALUE(-0.2, 0.75), 3)
            ELSE ROUND(DBMS_RANDOM.VALUE(-0.5, 0.6), 3)
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

        -- Insert product mention if we have one.
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
    DBMS_OUTPUT.PUT_LINE('PeakGear demand and market signals loaded: ' || v_count);
END;
/
