/*
 * load_influencers.sql
 * 500 regulatory, quality, safety, trial, and care logistics signal sources across feed types
 */

SET SERVEROUTPUT ON
PROMPT Loading signal sources...

DECLARE
    TYPE t_str IS TABLE OF VARCHAR2(100);
    v_prefixes t_str := t_str(
        'fda','ema','mhra','ich','gxp','trial','pv','safety',
        'coldchain','site','cro','cdmo','biologics','vaccine','gene',
        'celltherapy','diagnostic','device','lab','quality','release','stability',
        'deviation','excursion','enrollment','protocol','inspection','recall','import',
        'api','excipient','sterility','bioburden','pharma','clinical','route',
        'aircargo','airport','global','pacific','midwest','northeast','southwest',
        'vaccinewatch','protocoldesk','gxpdesk','portsupply','coldchainops','fdawatch','emaupdates'
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
    -- Healthcare signal channels retained in the inherited PLATFORM column.
    v_platforms t_str := t_str(
        'Supply Quality Notice',
        'Compliance Signal',
        'Cold Chain Bulletin',
        'Regulatory Notice',
        'Capacity Alert'
    );
    v_niches    t_str := t_str(
        'FDA','EMA','GxP','Care Logistics','Care Operations',
        'Pharmacovigilance','Cell Therapy','Biologics Manufacturing',
        'Diagnostics','Medical Devices','Care Capacity','Sterility Assurance',
        'Manufacturer Quality','Enrollment Risk','Air Cargo'
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
    v_count     NUMBER := 0;
    v_followers NUMBER;
    v_eng_rate  NUMBER;
    v_score     NUMBER;
    v_plat_idx  NUMBER;
    v_niche_idx NUMBER;
    v_city_idx  NUMBER;
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

            -- Source score: blend of reach and engagement.
            v_score := ROUND(
                LEAST(100,
                    LN(v_followers) * 5 +
                    v_eng_rate * 500 +
                    DBMS_RANDOM.VALUE(-5, 10)
                ), 2);

            v_plat_idx  := MOD(v_count, v_platforms.COUNT) + 1;
            v_niche_idx := MOD(v_count, v_niches.COUNT) + 1;
            v_city_idx  := MOD(v_count, v_cities.COUNT) + 1;

            BEGIN
                INSERT INTO influencers (
                    handle, display_name, platform, follower_count,
                    engagement_rate, influence_score, niche, city,
                    region, is_verified
                ) VALUES (
                    v_handle,
                    INITCAP(REPLACE(REPLACE(v_handle, '@', ''), '_', ' ')),
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
