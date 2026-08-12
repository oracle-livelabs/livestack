/*
 * load_social_posts.sql
 * 5000 customer/community/operational signal posts with realistic cross-sector Energy & Utilities mentions
 */

SET SERVEROUTPUT ON
SET DEFINE OFF
PROMPT Loading customer and community signal posts...

DECLARE
    TYPE t_str IS TABLE OF VARCHAR2(500);

    -- Post templates with {brand} and {product} placeholders
    v_templates t_str := t_str(
        'Customers are reporting a spike in requests for {product} through {brand}; operational demand is clearly rising',
        'Dispatch coordinators are flagging {product} from {brand} as a field-execution bottleneck this week',
        'Community update: {product} capacity at {brand} is getting tight after a storm, leak, and repair surge',
        'Customer operations note - {brand} {product} is the service everyone is trying to schedule right now',
        'Remote monitoring follow-up: demand for {product} is up and {brand} needs more field or facility slots',
        'Two-week review of {brand} {product}: strong resolution outcomes, but capacity planning matters',
        'Customers keep asking where to find {product}. {brand} is showing up in every service and safety thread',
        'Control room huddle: prioritize {brand} {product} tickets before the weekend weather and production window',
        'Telemetry and call-center signals are surfacing new need for {product} from {brand}',
        'If your customers or facilities need {product}, check {brand} availability early; depot and operations slots are moving fast',
        'Day 30 with the {product} workflow and the field team says {brand} reduced manual follow-up',
        'Recommended {brand} {product} to an operations planner today because asset integrity and SLA risk are rising',
        'Thought {product} demand would level off, but {brand} is still seeing urgent requests',
        'Morning control-room review featuring {product}. {brand} needs pre-positioned field, parts, or operating capacity',
        'Added {product} to the high-priority resolution pathway. Thank you {brand} for closing the gap'
    );

    -- Additional organic-sounding utility posts (no utility program mention)
    v_generic t_str := t_str(
        'Customers are asking for clearer outage restoration windows and faster callback updates',
        'Gas odor reports need safety call-backs, leak survey routing, and pressure-monitoring evidence',
        'Water pressure zones are showing recurring leak events after the latest main-break repairs',
        'Wastewater compliance teams are watching discharge thresholds before the next regulatory report',
        'Well production variance is triggering artificial-lift and produced-water handling reviews',
        'A refinery hydrocracker constraint is reducing throughput and raising turnaround readiness risk',
        'LNG cargo scheduling needs berth, storage, and product-movement coordination before the next nomination cycle',
        'Emissions threshold alerts need regulatory follow-up and corrective-action evidence',
        'HSE incident triage is creating safety-control handoffs for field and facility teams',
        'Billing and collections service requests are approaching SLA limits for priority accounts',
        'Streetlight repair is the top request in our community forum this week',
        'Critical-load customers need earlier visibility into planned-switching schedules',
        'Remote monitoring alerts are helping the team catch feeder, pipeline, pump, and compressor risk before incidents',
        'Access barriers are delaying field work for several customer groups and industrial sites',
        'The service territory is seeing increased demand for energy assistance after rate changes',
        'Customers keep asking for EV charger interconnection support before summer travel',
        'Storm teams need better vegetation-risk outreach after recent weather events',
        'Dispatch coordinators are routing electric, gas, water, refinery, and pipeline crews across depots today',
        'Affordability screening is creating new handoffs to community partners',
        'Regulatory operations needs reliability, wastewater, leak-response, and emissions evidence in one report'
    );

    v_max_inf_id NUMBER;
    v_max_prod_id NUMBER;
    v_inf_id NUMBER;
    v_prod_id NUMBER;
    v_brand_name VARCHAR2(200);
    v_prod_name VARCHAR2(300);
    v_post_text CLOB;
    v_platform VARCHAR2(50);
    v_platforms t_str := t_str(
        'Reliability Signal',
        'Production Signal',
        'Compliance Signal',
        'Field Access Bulletin',
        'Regulatory Notice',
        'Capacity Alert',
        'HSE and Emissions Notice'
    );
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
                v_platform := v_platforms(MOD(i, v_platforms.COUNT) + 1);
                v_inf_id := NULL;
        END;

        -- 70% utility-program mention posts, 30% generic
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
            'ext_' || REPLACE(LOWER(v_platform), ' ', '_') || '_' || LPAD(i, 8, '0'),
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
    DBMS_OUTPUT.PUT_LINE('Customer/community signal posts loaded: ' || v_count);
END;
/
