/*
 * load_social_posts.sql
 * 5000 channel, revenue, and demand signals across a 365-day history,
 * with varied revenue impact and product or revenue center links.
 */

SET SERVEROUTPUT ON
PROMPT Loading  hospitality risk and demand signals...

DECLARE
    TYPE t_str IS TABLE OF VARCHAR2(500);

    -- Signal templates with {brand} and {product} placeholders.
    -- Existing table names stay as SOCIAL_POSTS for app compatibility.
    v_templates t_str := t_str(
        '{brand} repriced {product} after demand guidance changed; revenue manager review recommended',
        'Channel bulletin references {product}; {brand} brand-standard team should update controls',
        'Revenue risk signal detected for {product}; {brand} revenue impact limits need review',
        'Booking Cancellation risk alert references {product}; {brand} property teams should prioritize revenue impact review',
        'Service recovery notice affects {product}; {brand} guest profile and channel-discrepancy thresholds should be refreshed',
        'Availability desk flagged elevated reservation volume for {product}; {brand} availability thresholds should be reviewed',
        'Guest Experience desk opened preference review for {product}; {brand} guest notes require update',
        'Demand volatility signal raised for {product}; {brand} property portfolio guidance may change',
        'Group Booking servicing alert references {product}; {brand} group modification workflow needs capacity',
        'Folio operations bulletin references {product}; {brand} folio closeout queue shows elevated activity',
        'OTA channel update affects {product}; {brand} deposit and channel-discrepancy case review volume expected to increase',
        'Brand Standard screening activity is rising for {product}; {brand} onboarding controls require review',
        'Group Booking desk reports elevated onboarding activity tied to {product}; {brand} room-block capacity should be checked',
        'Elevated revenue operations activity detected for {product}; {brand} property teams should monitor revenue impact thresholds',
        'Property operations alert: {brand} reported elevated onboarding workload for {product}',
        'Demand management desk flagged booking pace movement for {product}; {brand} pricing may change',
        'Guest protection update references {product}; {brand} documentation review requested',
        'Open hospitality signal shows elevated API reservation volume around {product}; {brand} digital controls team watching load',
        'Portfolio risk model detected cluster around {brand} {product}; expected revenue impact monitoring workload increasing',
        'Brand Standard queue added {product}; {brand} policy attestation requested'
    );

    -- Additional generic signals with no property mention.
    v_generic t_str := t_str(
        'Brand standards review volume increased for guest, OTA, and revenue-center activity this week',
        'Demand Forecast rate commentary pushed group booking and booking deposit repricing alerts higher',
        'Service Recovery monitoring desk reported elevated folio dispute patterns across digital channels',
        'Availability risk team flagged group folio concentration in several metro demands',
        'Guest identity refresh workload rose after new profile-verification guidance',
        'Property onboarding workload is elevated for group booking and long-stay planning services',
        'Guest Experience brand-standard desk opened more preference and service reviews than normal',
        'Folio operations reported higher real-time-payment exception volume tied to channel-discrepancy review',
        'Revenue risk team raised early-warning thresholds for cancellation-prone guest segments',
        'Revenue Operations services desk is tracking elevated corporate reservation volume',
        'Service Recovery Detection Pipeline escalated shared-device guest profile activity across digital check-in workflows',
        'OTA Surveillance Engine flagged suspicious group deposit bursts linked to revenue operations guest profiles',
        'Watchlist review queue detected repeated channel-payment screening exceptions across contracted guest profiles'
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
    v_criticality_score NUMBER;
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

        -- 70% property/product or revenue center-specific signals, 30% generic signals.
        IF DBMS_RANDOM.VALUE < 0.7 THEN
            -- Pick random product or revenue center.
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

        -- Generate signal revenue impact metrics with power-law distribution.
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

        -- Sentiment: product or revenue center-specific signals skew toward actionable risk.
        v_sentiment := CASE
            WHEN v_prod_id IS NOT NULL THEN ROUND(DBMS_RANDOM.VALUE(-0.2, 0.75), 3)
            ELSE ROUND(DBMS_RANDOM.VALUE(-0.5, 0.6), 3)
        END;

        -- Hospitality-facing risk severity score stored in the legacy virality_score column
        -- for compatibility with existing import templates and analytic routes.
        v_criticality_score := ROUND(LEAST(96, GREATEST(18,
            CASE
                WHEN v_likes > 300000 THEN 67
                WHEN v_likes > 150000 THEN 64
                WHEN v_likes > 50000 THEN 60
                WHEN v_likes > 10000 THEN 54
                WHEN v_likes > 1000  THEN 42
                ELSE 24
            END
            + LEAST(10, (LN(GREATEST(v_views, 1)) / LN(10)) * 1.2)
            + LEAST(6, (v_shares / GREATEST(v_likes, 1)) * 14)
            + LEAST(5, (v_comments / GREATEST(v_likes, 1)) * 8)
            + CASE
                WHEN v_sentiment < -0.2 THEN 5
                WHEN v_sentiment < 0 THEN 3
                WHEN v_sentiment > 0.7 THEN 2
                ELSE 0
              END
            + DBMS_RANDOM.VALUE(-6, 6)
        )), 1);

        -- Posted within the last year, weighted toward recent activity. The
        -- deterministic monthly anchors guarantee meaningful history in the
        -- 1-year dashboard view while the weighted population keeps short
        -- operational ranges active.
        v_posted_at := SYSTIMESTAMP - NUMTODSINTERVAL(
            CASE
                WHEN MOD(i, 500) = 0 THEN (i / 500) * 36.4 * 24
                ELSE POWER(DBMS_RANDOM.VALUE(0, 1), 2) * 365 * 24
            END,
            'HOUR'
        );

        INSERT INTO social_posts (
            influencer_id, platform, external_post_id, post_text,
            posted_at, likes_count, shares_count, comments_count, views_count,
            sentiment_score, virality_score, momentum_flag
        ) VALUES (
            v_inf_id,
            v_platform,
            'ext_' || LOWER(v_platform) || '_' || LPAD(i, 8, '0'),
            v_post_text,
            v_posted_at,
            v_likes, v_shares, v_comments, v_views,
            v_sentiment,
            v_criticality_score,
            CASE
                WHEN v_likes > 50000 THEN 'mega_viral'
                WHEN v_likes > 10000 THEN 'viral'
                WHEN v_likes > 1000  THEN 'rising'
                ELSE 'normal'
            END
        ) RETURNING post_id INTO v_post_id;

        -- Insert product or revenue center mention if we have one.
        IF v_prod_id IS NOT NULL THEN
            BEGIN
                INSERT INTO post_product_mentions (
                    post_id, product_id, confidence_score, mention_type
                ) VALUES (
                    v_post_id, v_prod_id,
                    ROUND(CASE MOD(i, 8)
                        WHEN 0 THEN DBMS_RANDOM.VALUE(0.94, 0.99)
                        WHEN 1 THEN DBMS_RANDOM.VALUE(0.88, 0.94)
                        WHEN 2 THEN DBMS_RANDOM.VALUE(0.80, 0.87)
                        WHEN 3 THEN DBMS_RANDOM.VALUE(0.72, 0.80)
                        WHEN 4 THEN DBMS_RANDOM.VALUE(0.60, 0.68)
                        WHEN 5 THEN DBMS_RANDOM.VALUE(0.54, 0.62)
                        WHEN 6 THEN DBMS_RANDOM.VALUE(0.46, 0.54)
                        ELSE DBMS_RANDOM.VALUE(0.40, 0.48)
                    END, 3),
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

    MERGE INTO social_posts sp
    USING (
        SELECT post_id,
               CASE
                   WHEN rn = 1 THEN 92
                   WHEN rn = 2 THEN 87
                   WHEN rn = 3 THEN 79
                   WHEN rn = 4 THEN 73
                   WHEN rn = 5 THEN 66
                   WHEN rn = 6 THEN 58
                   WHEN rn <= 40 THEN 64 + MOD(rn * 7, 9)
                   ELSE virality_score
               END AS criticality_score
        FROM (
            SELECT post_id,
                   virality_score,
                   ROW_NUMBER() OVER (
                       ORDER BY virality_score DESC NULLS LAST, posted_at DESC, post_id
                   ) AS rn
            FROM social_posts
        )
        WHERE rn <= 40
    ) ranked
    ON (sp.post_id = ranked.post_id)
    WHEN MATCHED THEN UPDATE SET sp.virality_score = ranked.criticality_score;

    COMMIT;
    DBMS_OUTPUT.PUT_LINE('Hospitality risk and demand signals loaded: ' || v_count);
END;
/
