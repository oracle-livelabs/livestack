/*
 * load_social_posts.sql
 * 5000 resident/community signal posts with realistic service-access text and service mentions
 */

SET SERVEROUTPUT ON
PROMPT Loading resident and community signal posts...

DECLARE
    TYPE t_str IS TABLE OF VARCHAR2(500);

    -- Post templates with {brand} and {product} placeholders
    v_templates t_str := t_str(
        'A lot of residents in my panel are asking about {product} through {brand}; access demand is clearly rising',
        'Service coordinators are flagging {product} from {brand} as a bottleneck this week',
        'Community service counter update: {product} capacity at {brand} is getting tight after a spike in referrals',
        'Resident navigation note - {brand} {product} is the service everyone is trying to schedule right now',
        'Remote monitoring follow-up: demand for {product} is up and {brand} needs more slots',
        'Two-week review of {brand} {product}: strong outcomes, but capacity planning matters',
        'Families keep asking where to find {product}. {brand} is showing up in every referral thread',
        'Public Service team huddle: prioritize {brand} {product} referrals before the weekend surge',
        'Social determinants screening is surfacing new need for {product} from {brand}',
        'If your residents need {product}, check {brand} availability early; slots are moving fast',
        'Day 30 with the {product} workflow and the agency team says {brand} reduced manual follow-up',
        'Recommended {brand} {product} to a case handoff planner today because avoidable reworks are the risk',
        'Thought {product} demand would level off, but {brand} is still seeing urgent requests',
        'Morning panel review featuring {product}. {brand} needs pre-positioned public service capacity',
        'Added {product} to the high-priority public service pathway. Thank you {brand} for closing the gap'
    );

    -- Additional organic-sounding public service posts (no public program mention)
    v_generic t_str := t_str(
        'Residents are asking for clearer instructions after case handoff and faster follow-up windows',
        'Housing services access is the top request in our community forum this week',
        'Caseworkers need earlier visibility into inspection appointment availability',
        'Remote monitoring alerts are helping the team catch risk before an emergency call',
        'Transportation barriers are delaying preventive public service for several resident groups',
        'The service counter is seeing increased demand for chronic public service coaching after open enrollment',
        'Families keep asking for youth air-quality action plan support before school activities',
        'Senior agency teams need better fall-risk outreach after recent community events',
        'Service navigators are coordinating referrals across specialty service counters today',
        'Food insecurity screening is creating new handoffs to community partners'
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

        -- 70% public service-program mention posts, 30% generic
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

        -- Sentiment: mostly positive for service mentions
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
    DBMS_OUTPUT.PUT_LINE('Resident/community signal posts loaded: ' || v_count);
END;
/
