/*
 * load_influencers.sql
 * 500 regulatory, operations, and market signal sources across feed types
 */

SET SERVEROUTPUT ON
PROMPT Loading signal sources...

DECLARE
    TYPE t_str IS TABLE OF VARCHAR2(100);
    v_prefixes t_str := t_str(
        'sec','finra','fdic','occ','fed','rates','credit','mortgage','wealth','cards','payments','aml','kyc','fraud','liquidity','capital','treasury','branch','advisor','portfolio','deposit','loan','consumer','commercial','insurance','retirement','brokerage','risk','market','fintech','openbanking','custody','municipal','basel','cecl','sanctions','wire','ach','rtp','fx','bond','fund','audit','regdesk','compliance','data','wallet','merchant','chargeback','client'
    );
    v_suffixes t_str := t_str(
        '_watch','_updates','_desk','_alerts','_bulletin','_ops','_lab',
        '_review','_monitor','_signal','_weekly','_notice','_intel',
        '_tracker','_compliance','_routing','_safety','_market','_network',
        '_wire','_flow','_audit','_forecast','_screen','_index','_map',
        '_ledger','_hub','_feed','_brief','_node','_office','_control',
        '_registry','_release','_status','_planner','_source','_risk',
        '_queue','_matrix','_watchlist','_coordinator','_report','_pulse',
        '_observer','_channel','_bulletins','_bridge','_controlroom'
    );
    -- Platform values are constrained by the original schema. In this retargeted
    -- demo they represent institutional monitoring feed channels, not social platforms.
    v_platforms t_str := t_str('instagram','tiktok','twitter','youtube','threads');
    v_niches    t_str := t_str(
        'SEC','FINRA','FDIC','OCC','Federal Reserve','Interest Rates','Credit Risk','Mortgage Lending','Wealth Management','Cards','Payments','AML','KYC','Fraud Operations','Liquidity Risk','Capital Markets','Treasury','Branch Operations','Advisor Desk','Portfolio Strategy'
    );
    v_cities    t_str := t_str(
        'New York','Los Angeles','Chicago','Houston','Phoenix','San Francisco',
        'Miami','Seattle','Denver','Austin','Nashville','Portland','Boston',
        'Atlanta','Dallas','San Diego','Minneapolis','Detroit','Las Vegas','Brooklyn'
    );
    v_regions   t_str := t_str(
        'New York','California','Illinois','Texas','Arizona','California',
        'Florida','Washington','Colorado','Texas','Tennessee','Oregon','Massachusetts',
        'Georgia','Texas','California','Minnesota','Michigan','Nevada','New York'
    );
    v_handle    VARCHAR2(200);
    v_display_name VARCHAR2(200);
    v_count     NUMBER := 0;
    v_followers NUMBER;
    v_eng_rate  NUMBER;
    v_score     NUMBER;
    v_plat_idx  NUMBER;
    v_niche_idx NUMBER;
    v_city_idx  NUMBER;

    FUNCTION source_display_name(p_handle VARCHAR2) RETURN VARCHAR2 IS
        v_body     VARCHAR2(200) := LOWER(REGEXP_REPLACE(NVL(p_handle, ''), '^@', ''));
        v_core     VARCHAR2(200);
        v_prefix   VARCHAR2(100);
        v_variant  VARCHAR2(100);
        v_sequence VARCHAR2(20);
        v_base     VARCHAR2(160);
    BEGIN
        v_core     := REGEXP_REPLACE(v_body, '_[0-9]+$', '');
        v_prefix   := REGEXP_SUBSTR(v_core, '^[^_]+');
        v_variant  := REGEXP_REPLACE(v_core, '^[^_]+_?', '');
        v_sequence := REGEXP_SUBSTR(v_body, '[0-9]+$');

        v_base := CASE
            WHEN v_prefix = 'finra' THEN 'FINRA Monitoring Feed'
            WHEN v_prefix = 'liquidity' THEN 'Liquidity Risk Monitor'
            WHEN v_prefix = 'aml' THEN 'AML Surveillance Engine'
            WHEN v_prefix = 'kyc' THEN 'AML Surveillance Engine - KYC'
            WHEN v_prefix = 'treasury' THEN 'Treasury Compliance Feed'
            WHEN v_prefix IN ('market', 'marketpulse') THEN 'Market Activity Monitor'
            WHEN v_prefix = 'rates' THEN 'Market Activity Monitor - Rates'
            WHEN v_prefix = 'capital' THEN 'Market Activity Monitor - Capital'
            WHEN v_prefix = 'portfolio' THEN 'Market Activity Monitor - Portfolio'
            WHEN v_prefix = 'brokerage' THEN 'Market Activity Monitor - Brokerage'
            WHEN v_prefix = 'fx' THEN 'Market Activity Monitor - FX'
            WHEN v_prefix = 'bond' THEN 'Market Activity Monitor - Bonds'
            WHEN v_prefix = 'fund' THEN 'Market Activity Monitor - Funds'
            WHEN v_prefix = 'payments' THEN 'Market Activity Monitor - Payments'
            WHEN v_prefix = 'credit' THEN 'Client Exposure Engine - Credit'
            WHEN v_prefix = 'mortgage' THEN 'Client Exposure Engine - Mortgage'
            WHEN v_prefix IN ('wealth', 'wealthdesk') THEN 'Client Exposure Engine - Wealth'
            WHEN v_prefix = 'cards' THEN 'Client Exposure Engine - Card Services'
            WHEN v_prefix = 'branch' THEN 'Client Exposure Engine - Branch'
            WHEN v_prefix = 'advisor' THEN 'Client Exposure Engine - Advisor'
            WHEN v_prefix = 'deposit' THEN 'Client Exposure Engine - Deposits'
            WHEN v_prefix = 'loan' THEN 'Client Exposure Engine - Lending'
            WHEN v_prefix = 'consumer' THEN 'Client Exposure Engine - Consumer'
            WHEN v_prefix = 'commercial' THEN 'Client Exposure Engine - Commercial'
            WHEN v_prefix = 'insurance' THEN 'Client Exposure Engine - Insurance'
            WHEN v_prefix = 'retirement' THEN 'Client Exposure Engine - Retirement'
            WHEN v_prefix = 'custody' THEN 'Client Exposure Engine - Custody'
            WHEN v_prefix = 'client' THEN 'Client Exposure Engine'
            WHEN v_prefix = 'fraud' THEN 'Fraud Detection Pipeline'
            WHEN v_prefix = 'sanctions' THEN 'Fraud Detection Pipeline - Sanctions'
            WHEN v_prefix = 'wire' THEN 'Fraud Detection Pipeline - Wire'
            WHEN v_prefix = 'ach' THEN 'Fraud Detection Pipeline - ACH'
            WHEN v_prefix = 'rtp' THEN 'Fraud Detection Pipeline - RTP'
            WHEN v_prefix = 'wallet' THEN 'Fraud Detection Pipeline - Wallet'
            WHEN v_prefix = 'merchant' THEN 'Fraud Detection Pipeline - Merchant'
            WHEN v_prefix = 'chargeback' THEN 'Fraud Detection Pipeline - Chargeback'
            WHEN v_prefix = 'fintech' THEN 'Fraud Detection Pipeline - Fintech'
            WHEN v_prefix = 'openbanking' THEN 'Fraud Detection Pipeline - Open Banking'
            WHEN v_prefix = 'sec' THEN 'Regulatory Intelligence Stream - SEC'
            WHEN v_prefix = 'fdic' THEN 'Regulatory Intelligence Stream - FDIC'
            WHEN v_prefix = 'occ' THEN 'Regulatory Intelligence Stream - OCC'
            WHEN v_prefix = 'fed' THEN 'Regulatory Intelligence Stream - Federal Reserve'
            WHEN v_prefix = 'basel' THEN 'Regulatory Intelligence Stream - Basel'
            WHEN v_prefix = 'cecl' THEN 'Regulatory Intelligence Stream - CECL'
            WHEN v_prefix = 'audit' THEN 'Regulatory Intelligence Stream - Audit'
            WHEN v_prefix = 'regdesk' THEN 'Regulatory Intelligence Stream - Regulatory Desk'
            WHEN v_prefix = 'compliance' THEN 'Regulatory Intelligence Stream - Compliance'
            WHEN v_prefix = 'data' THEN 'Regulatory Intelligence Stream - Data'
            WHEN v_prefix = 'municipal' THEN 'Regulatory Intelligence Stream - Municipal'
            WHEN v_prefix = 'risk' THEN 'Regulatory Intelligence Stream - Risk'
            ELSE 'Regulatory Intelligence Stream'
        END;

        IF v_sequence IS NOT NULL THEN
            RETURN v_base || ' ' || v_sequence;
        ELSIF v_variant IS NOT NULL THEN
            RETURN v_base || ' - ' || INITCAP(REPLACE(v_variant, '_', ' '));
        END IF;

        RETURN v_base;
    END;
BEGIN
    FOR i IN 1..v_prefixes.COUNT LOOP
        FOR j IN 1..10 LOOP
            v_handle := '@' || v_prefixes(i) || v_suffixes(MOD(i * j, v_suffixes.COUNT) + 1);

            -- Vary subscriber counts: mostly specialist feeds, some major desks.
            CASE
                WHEN DBMS_RANDOM.VALUE < 0.05 THEN
                    v_followers := FLOOR(DBMS_RANDOM.VALUE(1000000, 15000000));  -- mega
                WHEN DBMS_RANDOM.VALUE < 0.15 THEN
                    v_followers := FLOOR(DBMS_RANDOM.VALUE(100000, 1000000));    -- macro
                WHEN DBMS_RANDOM.VALUE < 0.40 THEN
                    v_followers := FLOOR(DBMS_RANDOM.VALUE(10000, 100000));      -- mid
                ELSE
                    v_followers := FLOOR(DBMS_RANDOM.VALUE(1000, 10000));        -- micro
            END CASE;

            -- Engagement rate inversely correlates with subscriber count.
            v_eng_rate := CASE
                WHEN v_followers > 1000000 THEN ROUND(DBMS_RANDOM.VALUE(0.005, 0.025), 4)
                WHEN v_followers > 100000  THEN ROUND(DBMS_RANDOM.VALUE(0.015, 0.045), 4)
                WHEN v_followers > 10000   THEN ROUND(DBMS_RANDOM.VALUE(0.025, 0.08), 4)
                ELSE ROUND(DBMS_RANDOM.VALUE(0.03, 0.12), 4)
            END;

            -- Source authority score: blend of monitored exposure and escalation activity.
            v_score := ROUND(
                LEAST(100,
                    LN(v_followers) * 5 +
                    v_eng_rate * 500 +
                    DBMS_RANDOM.VALUE(-5, 10)
                ), 2);

            v_plat_idx  := MOD(v_count, v_platforms.COUNT) + 1;
            v_niche_idx := MOD(v_count, v_niches.COUNT) + 1;
            v_city_idx  := MOD(v_count, v_cities.COUNT) + 1;
            v_display_name := source_display_name(v_handle);

            BEGIN
                INSERT INTO influencers (
                    handle, display_name, platform, follower_count,
                    engagement_rate, influence_score, niche, city,
                    region, is_verified
                ) VALUES (
                    v_handle,
                    v_display_name,
                    v_platforms(v_plat_idx),
                    v_followers,
                    v_eng_rate,
                    v_score,
                    v_niches(v_niche_idx),
                    v_cities(v_city_idx),
                    v_regions(v_city_idx),
                    CASE WHEN v_followers > 500000 THEN 1 ELSE 0 END
                );
                v_count := v_count + 1;
            EXCEPTION
                WHEN DUP_VAL_ON_INDEX THEN NULL;
            END;

            EXIT WHEN v_count >= 500;
        END LOOP;
        EXIT WHEN v_count >= 500;
    END LOOP;

    COMMIT;
    DBMS_OUTPUT.PUT_LINE('Signal sources loaded: ' || v_count);
END;
/
