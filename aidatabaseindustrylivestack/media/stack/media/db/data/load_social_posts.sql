/*
 * load_social_posts.sql
 * 5000 audience/social signal posts with realistic entertainment buzz and asset mentions
 */

SET SERVEROUTPUT ON
PROMPT Loading audience and fan-community signal posts...

DECLARE
    TYPE t_str IS TABLE OF VARCHAR2(500);

    -- Post templates with {brand} and {product} placeholders
    v_templates t_str := t_str(
        'Audience buzz around {brand} {product} is rising fast ahead of the weekend release window',
        'Fan edits are making {product} from {brand} a bottleneck for available campaign inventory this week',
        'Creator reaction threads say {product} capacity at {brand} is tightening after a spike in demand',
        'Audience watchlist note - {brand} {product} is the asset everyone wants promoted right now',
        'Streaming engagement check: demand for {product} is up and {brand} needs more placement slots',
        'Two-week review of {brand} {product}: strong fandom lift, but inventory planning matters',
        'Families keep asking where to stream {product}. {brand} is showing up in every recommendation thread',
        'Marketing huddle: prioritize {brand} {product} before the weekend audience surge',
        'Social listening is surfacing new regional demand for {product} from {brand}',
        'If your audience wants {product}, check {brand} inventory early; premium slots are moving fast',
        'Day 30 with the {product} workflow and the distribution team says {brand} reduced manual campaign follow-up',
        'Recommended {brand} {product} to a media planner today because missed opening-weekend momentum is the risk',
        'Thought {product} demand would level off, but {brand} is still seeing urgent placement requests',
        'Morning audience review featuring {product}. {brand} needs pre-positioned campaign inventory',
        'Added {product} to the high-priority release pathway. Thank you {brand} for closing the fan-demand gap',
        'Retention team flagged churn risk around {brand} {product} and needs the offer live before tonight',
        'Watch time for {product} is dipping in one cohort but {brand} can still recover viewers with the right journey',
        'ARPU signal for {brand} {product} is climbing after the premium bundle test went live',
        'Premium bundle demand for {product} from {brand} is ahead of forecast before the weekend premiere reminder',
        'Season access chatter around {brand} {product} is moving faster than live event operations capacity planning',
        'Live event operations team says {product} needs more reward calendar slots before the next subscriber segment release',
        'Moderation queue for {brand} {product} is rising as fan chat volume moves into launch window',
        'Regional rights desk says {product} from {brand} needs capacity reserved before sponsor demand peaks'
    );

    -- Additional organic-sounding media posts (no studio or label mention)
    v_generic t_str := t_str(
        'Audience accounts are asking for cleaner release reminders and faster links to bonus content',
        'Trailer reactions are the top thread in our fan community this week',
        'Media planners need earlier visibility into premium homepage placement availability',
        'Streaming engagement alerts are helping the team catch breakout fandom before churn risk rises',
        'Regional viewing spikes are shifting ad inventory for several audience groups',
        'The studio is seeing increased demand for creator clips after the finale teaser',
        'Families keep asking for animation watch-party content before school holidays',
        'Sports fans need better highlight availability after recent playoff events',
        'Creator strategists are coordinating campaign packages across specialty channels today',
        'International fandom screening is creating new handoffs to localization teams',
        'Subscriber cohorts are showing churn risk after skipping the latest premium event',
        'Watch time fell for lapsed viewers who did not receive next-best-content reminders',
        'ARPU tests are helping teams pick the right offer for high-value fan segments',
        'Live event operations queues need better capacity planning before the next weekend reset',
        'Moderation and trust teams are watching family and premiere chats during traffic spikes',
        'Rights teams are coordinating sponsor packages for regional sports and live events'
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

        -- 70% studio/asset mention posts, 30% generic
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

        -- Sentiment: mostly positive for asset mentions
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
    DBMS_OUTPUT.PUT_LINE('Audience/social signal posts loaded: ' || v_count);
END;
/
