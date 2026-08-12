/*
 * load_social_posts.sql
 * 5000 regulatory, quality, safety, and care delivery signals with varied reach and product mentions
 */

SET SERVEROUTPUT ON
PROMPT Loading regulatory, quality, and care capacity signals...

DECLARE
    TYPE t_str IS TABLE OF VARCHAR2(500);

    -- Signal templates with {brand} and {product} placeholders.
    -- Existing table names stay as SOCIAL_POSTS for app compatibility.
    v_templates t_str := t_str(
        'FDA inspection signal mentions {product} from {brand}; quality team requested lot genealogy review',
        'EMA variation update references {product}; {brand} release plan should be reviewed',
        'Protocol amendment increases demand for {product}; {brand} care capacity forecast needs refresh',
        'Care logistics lane exception affects inbound {product}; {brand} shipments may need alternate routes',
        'CDMO capacity bulletin references {brand} slot availability for {product}; care sites should watch allocation',
        'Critical component shortage advisory raised for {product}; {brand} lead times may extend this week',
        'Out-of-specification trend opened for {brand} {product}; QA teams should inspect recent lots',
        'Allocation notice issued for {product}; {brand} prioritizing enrolled care sites first',
        'New manufacturer qualification started for {brand} {product}; risk team tracking certificates',
        'Temperature excursion warning updated for {product}; verify release hold before receiving {brand} lots',
        'Port congestion signal may delay {brand} {product}; care logistics routing needs updated ETA',
        'Enrollment surge detected for {product}; {brand} order book rising after protocol update',
        'GxP desk published revised handling language for {product}; {brand} sites should refresh labels',
        'FDA safety update references downstream use of {product}; {brand} compliance packet under review',
        'Manufacturer quality note: {brand} reported tighter specifications for {product} effective next batch',
        'Air freight capacity watch added for {product}; {brand} shipments through hub corridor need monitoring',
        'Critical inventory advisory opened for {brand} {product}; replenish regional care logistics sites',
        'Vaccine safety desk highlights {product}; {brand} availability could tighten next month',
        'Companion diagnostics bulletin notes elevated demand for {product}; {brand} allocation score rising',
        'Device engineering flagged substitute review for {product}; {brand} technical file updated',
        'Customs hold advisory mentions {brand} {product}; import documentation review required',
        'PatientFlowOps escalated {product}; verify temperature profile and packaging before next {brand} shipment',
        'Market access desk reports payer coverage movement for {product}; {brand} quotes expiring faster',
        'Manufacturer onboarding alert: secondary source needed for {brand} {product} due to capacity risk',
        'Regulatory review queue added {product}; {brand} certificate of analysis requested',
        'Storage temperature note changed for {product}; update receiving checklist for {brand}',
        'PortSupply signal shows longer dwell time for {product}; reroute {brand} orders where possible',
        'Safety desk published compatibility matrix update for {product}; quarantine suspect lots from {brand}',
        'Forecast model detected signal cluster around {brand} {product}; expected demand multiplier increasing',
        'Clinical supply desk requests allocation review for {product}; {brand} confidence changed'
    );

    -- Additional generic signals with no manufacturer mention.
    v_generic t_str := t_str(
        'FDA inspection observations increased for sterile manufacturing sites this week',
        'EMA review window opened for several biologics variation dossiers',
        'Pharmacovigilance intake volume is rising across marketed therapies',
        'Care logistics routing desk reports new lane restrictions near a major airport hub',
        'Single-use component availability tightened after a supplier capacity outage',
        'Manufacturer quality desk flagged more out-of-specification investigations than normal',
        'Care sites are increasing demand for diagnostic kits and sample logistics',
        'Vaccine allocation score rose after a regional safety bulletin',
        'Temperature excursion reviews are pending for biologics and cell therapy shipments',
        'Port dwell time is rising for regulated care delivery containers'
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
        'Supply Quality Notice',
        'Compliance Signal',
        'Cold Chain Bulletin',
        'Regulatory Notice',
        'Capacity Alert'
    );
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

        -- 70% manufacturer/product-specific signals, 30% generic signals.
        IF DBMS_RANDOM.VALUE < 0.7 THEN
            -- Pick random product.
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

        -- Sentiment: product-specific signals skew toward actionable risk.
        v_sentiment := CASE
            WHEN v_prod_id IS NOT NULL THEN ROUND(DBMS_RANDOM.VALUE(-0.2, 0.75), 3)
            ELSE ROUND(DBMS_RANDOM.VALUE(-0.5, 0.6), 3)
        END;

        v_criticality_score := ROUND(LEAST(
            100,
            (LEAST(NVL(v_views, 0), 2000000) / 2000000 * 45) +
            (LEAST(NVL(v_likes, 0), 75000) / 75000 * 30) +
            (LEAST(NVL(v_shares, 0), 15000) / 15000 * 20) +
            (LEAST(NVL(v_comments, 0), 8000) / 8000 * 5)
        ), 2);

        -- Posted within last 30 days, weighted toward recent
        v_posted_at := SYSTIMESTAMP - NUMTODSINTERVAL(
            POWER(DBMS_RANDOM.VALUE(0, 1), 2) * 30 * 24, 'HOUR'
        );

        INSERT INTO social_posts (
            influencer_id, platform, external_post_id, post_text,
            posted_at, likes_count, shares_count, comments_count, views_count,
            sentiment_score, virality_score, momentum_flag
        ) VALUES (
            v_inf_id,
            v_platform,
            'ext_' || REGEXP_REPLACE(LOWER(v_platform), '[^a-z0-9]+', '_') || '_' || LPAD(i, 8, '0'),
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
    DBMS_OUTPUT.PUT_LINE('Regulatory, quality, and care capacity signals loaded: ' || v_count);
END;
/
