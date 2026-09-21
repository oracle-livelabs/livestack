/*
 * load_social_posts.sql
 * 5000 subscriber/network signal posts with realistic network-experience text and service mentions
 */

SET SERVEROUTPUT ON
PROMPT Loading subscriber and network signal posts...

DECLARE
    TYPE t_str IS TABLE OF VARCHAR2(500);

    -- Post templates with {brand} and {product} placeholders
    v_templates t_str := t_str(
        'Subscribers are asking about {product} through {brand}; upgrade and activation demand is rising',
        'Network operations is flagging {product} from {brand} as a capacity bottleneck this week',
        'Coverage update: {product} capacity at {brand} is getting tight after a spike in service orders',
        'Subscriber experience note - {brand} {product} is the service everyone is trying to schedule right now',
        'Outage follow-up: demand for {product} is up and {brand} needs more field slots',
        'Two-week review of {brand} {product}: strong subscriber response, but capacity planning matters',
        'Families keep asking where to find {product}. {brand} is showing up in every upgrade thread',
        'NOC huddle: prioritize {brand} {product} installs before the weekend streaming surge',
        'Billing and usage signals are surfacing new need for {product} from {brand}',
        'If your subscribers need {product}, check {brand} availability early; appointment slots are moving fast',
        'Day 30 with the {product} workflow and the field team says {brand} reduced manual follow-up',
        'Recommended {brand} {product} to an account manager today because churn risk is the issue',
        'Thought {product} demand would level off, but {brand} is still seeing urgent requests',
        'Morning capacity review featuring {product}. {brand} needs pre-positioned technician capacity',
        'Added {product} to the high-priority service assurance path. Thank you {brand} for closing the gap'
    );

    -- Additional organic-sounding telecom posts (no service brand mention)
    v_generic t_str := t_str(
        'Subscribers are asking for clearer instructions after fiber installation and faster follow-up windows',
        'Outage follow-up is the top request in our subscriber forum this week',
        'Small businesses need earlier visibility into field technician appointment availability',
        'Network monitoring alerts are helping the team catch congestion before call volume spikes',
        'Coverage gaps are delaying service assurance for several subscriber groups',
        'Device-support channels are seeing increased activation demand after a handset launch',
        'Families keep asking for better Wi-Fi performance before evening streaming starts',
        'Connected life teams need better outreach after recent storm-related service events',
        'Enterprise care teams are coordinating SLA-impact cases across regional service teams today',
        'Roaming bill questions are creating new handoffs to billing and retention teams'
    );

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
    FOR i IN 1..5000 LOOP
        -- Pick random influencer
        SELECT influencer_id INTO v_inf_id
        FROM (
          SELECT influencer_id
          FROM influencers
          ORDER BY DBMS_RANDOM.VALUE
        )
        WHERE ROWNUM = 1;

        -- Platform from influencer or random
        BEGIN
            SELECT platform INTO v_platform FROM influencers WHERE influencer_id = v_inf_id;
        EXCEPTION
            WHEN NO_DATA_FOUND THEN
                v_platform := v_platforms(MOD(i, 5) + 1);
                v_inf_id := NULL;
        END;

        -- 70% service-brand mention posts, 30% generic
        IF DBMS_RANDOM.VALUE < 0.7 THEN
            -- Pick random product
            SELECT product_id INTO v_prod_id
            FROM (
              SELECT product_id
              FROM products
              ORDER BY DBMS_RANDOM.VALUE
            )
            WHERE ROWNUM = 1;
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
    DBMS_OUTPUT.PUT_LINE('Subscriber/network signal posts loaded: ' || v_count);
END;
/
