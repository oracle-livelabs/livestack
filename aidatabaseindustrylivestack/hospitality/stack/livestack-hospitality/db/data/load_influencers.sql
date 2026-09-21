/*
 * load_influencers.sql
 * 500 channel, operations, and demand signal sources across feed types
 */

SET SERVEROUTPUT ON
PROMPT Loading signal sources...

DECLARE
    TYPE t_str IS TABLE OF VARCHAR2(100);
    v_prefixes t_str := t_str(
        'brandstandards','brandqa','safety','ops','demand','rates','revpar','groupbooking','vip','loyalty','payments','ota','identity','recovery','availability','bookingpace','revenueops','harborstone-property-operations','guestexp','portfolio','deposit','corporate','leisure','maintenance','housekeeping','longstay','channelsales','risk','seasonal','channeltech','openhospitality','events','associationgroup','quality','cancellation','watchlist','transport','banquet','settlement','international','eventsales','forecast','audit','channeldesk','brandstandard','data','wallet','folio-payment','folio-dispute','guest'
    );
    v_suffixes t_str := t_str(
        '_watch','_updates','_desk','_alerts','_bulletin','_ops','_lab',
        '_review','_monitor','_signal','_weekly','_notice','_intel',
        '_tracker','_brand-standard','_routing','_safety','_demand','_network',
        '_airport-transfer','_flow','_audit','_forecast','_screen','_index','_map',
        '_ledger','_hub','_feed','_brief','_node','_office','_control',
        '_registry','_release','_status','_planner','_source','_risk',
        '_queue','_matrix','_watchlist','_coordinator','_report','_pulse',
        '_observer','_channel','_bulletins','_bridge','_controlroom'
    );
    -- Platform values are constrained by the original schema. In this retargeted
    -- demo they represent property monitoring feed channels, not social platforms.
    v_platforms t_str := t_str('instagram','tiktok','twitter','youtube','threads');
    v_niches    t_str := t_str(
        'Brand Standards','Brand QA','Property Safety','Operations Control','Demand Forecast','Rate Plans','Revenue Operations Risk','Group Sales','VIP Guest Management','Loyalty','Folio Payments','OTA','Guest Identity','Service Recovery Operations','Availability Operations Risk','Demand Management','Revenue Operations','Property Operations','Guest Experience Desk','Property Portfolio Strategy'
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
            WHEN v_prefix = 'brandqa' THEN 'Brand QA Monitoring Feed'
            WHEN v_prefix = 'availability' THEN 'Availability Operations Risk Monitor'
            WHEN v_prefix = 'ota' THEN 'OTA Surveillance Engine'
            WHEN v_prefix = 'identity' THEN 'OTA Surveillance Engine - Guest Identity'
            WHEN v_prefix = 'revenueops' THEN 'Revenue Operations Brand Standard Feed'
            WHEN v_prefix IN ('demand', 'bookingpace', 'seasonal') THEN 'Demand Activity Monitor'
            WHEN v_prefix = 'rates' THEN 'Demand Activity Monitor - Rate Plans'
            WHEN v_prefix = 'portfolio' THEN 'Demand Activity Monitor - Property Portfolio'
            WHEN v_prefix = 'channelsales' THEN 'Demand Activity Monitor - Event Sales'
            WHEN v_prefix = 'international' THEN 'Demand Activity Monitor - International'
            WHEN v_prefix = 'eventsales' THEN 'Demand Activity Monitor - Event Sales'
            WHEN v_prefix = 'forecast' THEN 'Demand Activity Monitor - Forecast'
            WHEN v_prefix = 'payments' THEN 'Demand Activity Monitor - Folio Payments'
            WHEN v_prefix = 'revpar' THEN 'Guest Revenue Impact Engine - RevPAR'
            WHEN v_prefix = 'groupbooking' THEN 'Guest Revenue Impact Engine - Group Booking'
            WHEN v_prefix = 'vip' THEN 'Guest Revenue Impact Engine - VIP Guests'
            WHEN v_prefix = 'loyalty' THEN 'Guest Revenue Impact Engine - Loyalty'
            WHEN v_prefix = 'harborstone-property-operations' THEN 'Guest Revenue Impact Engine - Property Operations'
            WHEN v_prefix = 'guestexp' THEN 'Guest Revenue Impact Engine - Guest Experience'
            WHEN v_prefix = 'deposit' THEN 'Guest Revenue Impact Engine - Booking Deposits'
            WHEN v_prefix = 'corporate' THEN 'Guest Revenue Impact Engine - Corporate Accounts'
            WHEN v_prefix = 'leisure' THEN 'Guest Revenue Impact Engine - Leisure'
            WHEN v_prefix = 'longstay' THEN 'Guest Revenue Impact Engine - Long-Stay Hospitality'
            WHEN v_prefix = 'events' THEN 'Guest Revenue Impact Engine - Events'
            WHEN v_prefix = 'guest' THEN 'Guest Revenue Impact Engine'
            WHEN v_prefix = 'recovery' THEN 'Service Recovery Detection Pipeline'
            WHEN v_prefix = 'watchlist' THEN 'Service Recovery Detection Pipeline - Watchlist'
            WHEN v_prefix = 'transport' THEN 'Service Recovery Detection Pipeline - Airport Transfer'
            WHEN v_prefix = 'banquet' THEN 'Service Recovery Detection Pipeline - Banquet Deposit'
            WHEN v_prefix = 'settlement' THEN 'Service Recovery Detection Pipeline - Folio Checkout Closeout'
            WHEN v_prefix = 'wallet' THEN 'Service Recovery Detection Pipeline - Mobile Folio'
            WHEN v_prefix = 'folio-payment' THEN 'Service Recovery Detection Pipeline - folio-payment'
            WHEN v_prefix = 'folio-dispute' THEN 'Service Recovery Detection Pipeline - Folio Dispute'
            WHEN v_prefix = 'channeltech' THEN 'Service Recovery Detection Pipeline - Channel Technology'
            WHEN v_prefix = 'openhospitality' THEN 'Service Recovery Detection Pipeline - Open Hospitality'
            WHEN v_prefix = 'brandstandards' THEN 'Channel Intelligence Stream - Brand Standards'
            WHEN v_prefix = 'safety' THEN 'Channel Intelligence Stream - Property Safety'
            WHEN v_prefix = 'ops' THEN 'Channel Intelligence Stream - Operations Control'
            WHEN v_prefix = 'quality' THEN 'Channel Intelligence Stream - Brand Compliance'
            WHEN v_prefix = 'cancellation' THEN 'Channel Intelligence Stream - Cancellation Reserve'
            WHEN v_prefix = 'maintenance' THEN 'Channel Intelligence Stream - Maintenance'
            WHEN v_prefix = 'housekeeping' THEN 'Channel Intelligence Stream - Housekeeping'
            WHEN v_prefix = 'audit' THEN 'Channel Intelligence Stream - Audit'
            WHEN v_prefix = 'channeldesk' THEN 'Channel Intelligence Stream - Channel Desk'
            WHEN v_prefix = 'brandstandard' THEN 'Channel Intelligence Stream - Brand Standard'
            WHEN v_prefix = 'data' THEN 'Channel Intelligence Stream - Data'
            WHEN v_prefix = 'associationgroup' THEN 'Channel Intelligence Stream - Association Groups'
            WHEN v_prefix = 'risk' THEN 'Channel Intelligence Stream - Operations Risk'
            ELSE 'Channel Intelligence Stream'
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

            -- Source authority score: blend of monitored revenue impact and escalation activity.
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
