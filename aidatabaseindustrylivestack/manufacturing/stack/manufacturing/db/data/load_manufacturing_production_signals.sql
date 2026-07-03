/*
 * load_manufacturing_production_signals.sql
 * 5000 production and demand signals with realistic plant, supplier, and part mentions
 */

SET SERVEROUTPUT ON
PROMPT Loading manufacturing production and demand signals...

DECLARE
    TYPE t_str IS TABLE OF VARCHAR2(500);

    -- Signal templates with {brand} and {product} placeholders
    v_templates t_str := t_str(
        'Line supervisors are asking for {product} through {brand}; demand is clearly rising',
        'Production planners are flagging {product} from {brand} as a bottleneck this week',
        'Supplier update: {product} capacity at {brand} is getting tight after a spike in work orders',
        'Plant dispatch note - {brand} {product} is the part every line wants scheduled right now',
        'Condition-monitoring follow-up: demand for {product} is up and {brand} needs more capacity slots',
        'Two-week review of {brand} {product}: strong yield, but capacity planning matters',
        'Maintenance teams keep asking where to find {product}. {brand} is showing up in every shortage thread',
        'Operations huddle: prioritize {brand} {product} before the weekend production surge',
        'Supplier quality screening is surfacing new need for {product} from {brand}',
        'If your plants need {product}, check {brand} availability early; slots are moving fast',
        'Day 30 with the {product} workflow and the operations team says {brand} reduced manual expediting',
        'Recommended {brand} {product} to a production planner today because avoidable downtime is the risk',
        'Thought {product} demand would level off, but {brand} is still seeing urgent work orders',
        'Morning S&OP review featuring {product}. {brand} needs pre-positioned production capacity',
        'Added {product} to the high-priority build plan. Thank you {brand} for closing the gap'
    );

    -- Additional manufacturing signals without a product-line mention
    v_generic t_str := t_str(
        'Operators are asking for clearer shortage signals and faster replenishment windows',
        'Bearing and seal kits are the top request in our maintenance channel this week',
        'Line supervisors need earlier visibility into production slot availability',
        'Remote monitoring alerts are helping the team catch downtime risk before a line stop',
        'Transportation delays are slowing component availability for several customer programs',
        'The plant is seeing increased demand for changeover tooling after schedule changes',
        'Quality engineers keep asking for inspection capacity before launch builds',
        'Maintenance teams need better spare-part outreach after recent unplanned downtime',
        'Production planners are coordinating work orders across fabrication cells today',
        'Supplier constraints are creating new handoffs to procurement and logistics partners'
    );

    v_max_inf_id NUMBER;
    v_max_prod_id NUMBER;
    v_inf_id NUMBER;
    v_prod_id NUMBER;
    v_brand_name VARCHAR2(200);
    v_prod_name VARCHAR2(300);
    v_signal_text CLOB;
    v_signal_channel VARCHAR2(50);
    v_signal_channels t_str := t_str(
        'supplier_portal','plant_floor','market_feed','quality_bulletin','partner_operations'
    );
    v_acknowledgements NUMBER;
    v_propagations NUMBER;
    v_responses NUMBER;
    v_observations NUMBER;
    v_sentiment NUMBER;
    v_urgency NUMBER;
    v_observed_at TIMESTAMP;
    v_production_signal_id NUMBER;
    v_count NUMBER := 0;
BEGIN
    SELECT MAX(influencer_id) INTO v_max_inf_id FROM influencers;
    SELECT MAX(product_id) INTO v_max_prod_id FROM products;

    FOR i IN 1..5000 LOOP
        -- Pick random influencer
        v_inf_id := FLOOR(DBMS_RANDOM.VALUE(1, v_max_inf_id + 1));

        -- Map the retained network-account source to a manufacturing channel.
        BEGIN
            SELECT CASE platform
                     WHEN 'instagram' THEN 'supplier_portal'
                     WHEN 'tiktok' THEN 'plant_floor'
                     WHEN 'twitter' THEN 'market_feed'
                     WHEN 'youtube' THEN 'quality_bulletin'
                     ELSE 'partner_operations'
                   END
            INTO v_signal_channel
            FROM influencers
            WHERE influencer_id = v_inf_id;
        EXCEPTION
            WHEN NO_DATA_FOUND THEN
                v_signal_channel := v_signal_channels(MOD(i, 5) + 1);
                v_inf_id := NULL;
        END;

        -- 70% product-line mentions, 30% generic signals
        IF DBMS_RANDOM.VALUE < 0.7 THEN
            -- Pick random product
            v_prod_id := FLOOR(DBMS_RANDOM.VALUE(1, v_max_prod_id + 1));
            BEGIN
                SELECT p.product_name, b.brand_name
                INTO v_prod_name, v_brand_name
                FROM products p JOIN brands b ON p.brand_id = b.brand_id
                WHERE p.product_id = v_prod_id;

                v_signal_text := REPLACE(
                    REPLACE(
                        v_templates(MOD(i, v_templates.COUNT) + 1),
                        '{brand}', v_brand_name
                    ),
                    '{product}', v_prod_name
                );
            EXCEPTION
                WHEN NO_DATA_FOUND THEN
                    v_signal_text := v_generic(MOD(i, v_generic.COUNT) + 1);
                    v_prod_id := NULL;
            END;
        ELSE
            v_signal_text := v_generic(MOD(i, v_generic.COUNT) + 1);
            v_prod_id := NULL;
        END IF;

        -- Generate signal activity metrics with power-law distribution.
        -- Most production signals are low urgency, some medium, a few critical.
        CASE
            WHEN DBMS_RANDOM.VALUE < 0.02 THEN  -- 2% critical surge
                v_acknowledgements := FLOOR(DBMS_RANDOM.VALUE(50000, 500000));
                v_propagations := FLOOR(DBMS_RANDOM.VALUE(10000, 100000));
                v_responses := FLOOR(DBMS_RANDOM.VALUE(5000, 50000));
                v_observations := FLOOR(DBMS_RANDOM.VALUE(1000000, 20000000));
            WHEN DBMS_RANDOM.VALUE < 0.08 THEN  -- 6% escalating
                v_acknowledgements := FLOOR(DBMS_RANDOM.VALUE(10000, 50000));
                v_propagations := FLOOR(DBMS_RANDOM.VALUE(2000, 15000));
                v_responses := FLOOR(DBMS_RANDOM.VALUE(1000, 8000));
                v_observations := FLOOR(DBMS_RANDOM.VALUE(200000, 1000000));
            WHEN DBMS_RANDOM.VALUE < 0.25 THEN  -- 17% elevated
                v_acknowledgements := FLOOR(DBMS_RANDOM.VALUE(1000, 10000));
                v_propagations := FLOOR(DBMS_RANDOM.VALUE(200, 2000));
                v_responses := FLOOR(DBMS_RANDOM.VALUE(100, 1000));
                v_observations := FLOOR(DBMS_RANDOM.VALUE(20000, 200000));
            ELSE  -- 75% stable
                v_acknowledgements := FLOOR(DBMS_RANDOM.VALUE(10, 1000));
                v_propagations := FLOOR(DBMS_RANDOM.VALUE(0, 100));
                v_responses := FLOOR(DBMS_RANDOM.VALUE(0, 50));
                v_observations := FLOOR(DBMS_RANDOM.VALUE(100, 20000));
        END CASE;

        -- Sentiment: mostly positive for part mentions
        v_sentiment := CASE
            WHEN v_prod_id IS NOT NULL THEN ROUND(DBMS_RANDOM.VALUE(0.2, 0.95), 3)
            ELSE ROUND(DBMS_RANDOM.VALUE(-0.3, 0.9), 3)
        END;

        v_urgency := CASE
            WHEN v_acknowledgements > 50000 THEN ROUND(DBMS_RANDOM.VALUE(90, 100), 2)
            WHEN v_acknowledgements > 10000 THEN ROUND(DBMS_RANDOM.VALUE(75, 89.99), 2)
            WHEN v_acknowledgements > 1000  THEN ROUND(DBMS_RANDOM.VALUE(50, 74.99), 2)
            ELSE ROUND(DBMS_RANDOM.VALUE(10, 49.99), 2)
        END;

        -- Preserve a deterministic year of history for 1y trend views while
        -- retaining multiple signals in the current two-day window.
        v_observed_at := CAST(TRUNC(SYSDATE) AS TIMESTAMP)
                       - NUMTODSINTERVAL(MOD(i - 1, 360), 'DAY');

        INSERT INTO manufacturing_production_signals (
            network_account_id, signal_channel_code, external_signal_id, signal_text,
            observed_at, acknowledgement_count, propagation_count, response_count, observation_count,
            sentiment_score, urgency_score, momentum_code
        ) VALUES (
            v_inf_id,
            v_signal_channel,
            'signal_' || LOWER(v_signal_channel) || '_' || LPAD(i, 8, '0'),
            v_signal_text,
            v_observed_at,
            v_acknowledgements, v_propagations, v_responses, v_observations,
            v_sentiment, v_urgency,
            CASE
                WHEN v_acknowledgements > 50000 THEN 'critical'
                WHEN v_acknowledgements > 10000 THEN 'escalating'
                WHEN v_acknowledgements > 1000  THEN 'elevated'
                ELSE 'stable'
            END
        ) RETURNING production_signal_id INTO v_production_signal_id;

        -- Insert product mention if we have one
        IF v_prod_id IS NOT NULL THEN
            BEGIN
                INSERT INTO manufacturing_signal_part_mentions (
                    production_signal_id, manufactured_part_id, confidence_score, mention_type
                ) VALUES (
                    v_production_signal_id, v_prod_id,
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
    DBMS_OUTPUT.PUT_LINE('Manufacturing production signals loaded: ' || v_count);
END;
/
