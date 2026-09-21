/*
 * backfill_signal_source_names.sql
 * Updates existing signal-source display names from social-style handles to
 * hospitality-facing names while leaving handle values as stable internal keys.
 */

SET SERVEROUTPUT ON
SET DEFINE OFF

PROMPT Backfilling hospitality-facing signal source names...

DECLARE
    v_updated_sources NUMBER := 0;

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
            WHEN v_prefix IN ('revenueops', 'revenue operations') THEN 'Revenue Operations Brand Standard Feed'
            WHEN v_prefix IN ('demand', 'bookingpace', 'seasonal', 'harborstone-demand-signals') THEN 'Demand Activity Monitor'
            WHEN v_prefix = 'rates' THEN 'Demand Activity Monitor - Rate Plans'
            WHEN v_prefix IN ('portfolio', 'property portfolio') THEN 'Demand Activity Monitor - Property Portfolio'
            WHEN v_prefix IN ('channelsales', 'channel sales') THEN 'Demand Activity Monitor - Event Sales'
            WHEN v_prefix = 'international' THEN 'Demand Activity Monitor - International'
            WHEN v_prefix = 'eventsales' THEN 'Demand Activity Monitor - Event Sales'
            WHEN v_prefix = 'forecast' THEN 'Demand Activity Monitor - Forecast'
            WHEN v_prefix = 'payments' THEN 'Demand Activity Monitor - Folio Payments'
            WHEN v_prefix IN ('revpar', 'revenue') THEN 'Guest Revenue Impact Engine - RevPAR'
            WHEN v_prefix IN ('groupbooking', 'group booking') THEN 'Guest Revenue Impact Engine - Group Booking'
            WHEN v_prefix IN ('vip', 'luxury guest', 'luxury guestdesk') THEN 'Guest Revenue Impact Engine - VIP Guests'
            WHEN v_prefix = 'loyalty' THEN 'Guest Revenue Impact Engine - Loyalty'
            WHEN v_prefix IN ('harborstone-property-operations', 'property') THEN 'Guest Revenue Impact Engine - Property Operations'
            WHEN v_prefix IN ('guestexp', 'guest experience') THEN 'Guest Revenue Impact Engine - Guest Experience'
            WHEN v_prefix IN ('deposit', 'booking deposit') THEN 'Guest Revenue Impact Engine - Booking Deposits'
            WHEN v_prefix IN ('corporate', 'contracted') THEN 'Guest Revenue Impact Engine - Corporate Accounts'
            WHEN v_prefix IN ('leisure', 'guest') THEN 'Guest Revenue Impact Engine - Leisure'
            WHEN v_prefix IN ('longstay', 'long-stay') THEN 'Guest Revenue Impact Engine - Long-Stay Hospitality'
            WHEN v_prefix IN ('events', 'events operations') THEN 'Guest Revenue Impact Engine - Events'
            WHEN v_prefix IN ('guest', 'guest') THEN 'Guest Revenue Impact Engine'
            WHEN v_prefix IN ('recovery', 'service recovery') THEN 'Service Recovery Detection Pipeline'
            WHEN v_prefix IN ('watchlist', 'guest-safety') THEN 'Service Recovery Detection Pipeline - Watchlist'
            WHEN v_prefix IN ('transport', 'airport-transfer') THEN 'Service Recovery Detection Pipeline - Airport Transfer'
            WHEN v_prefix IN ('banquet', 'banquet-deposit') THEN 'Service Recovery Detection Pipeline - Banquet Deposit'
            WHEN v_prefix IN ('settlement', 'instant-folio-payment') THEN 'Service Recovery Detection Pipeline - Folio Checkout Closeout'
            WHEN v_prefix = 'wallet' THEN 'Service Recovery Detection Pipeline - Mobile Folio'
            WHEN v_prefix = 'folio-payment' THEN 'Service Recovery Detection Pipeline - folio-payment'
            WHEN v_prefix = 'folio-dispute' THEN 'Service Recovery Detection Pipeline - Folio Dispute'
            WHEN v_prefix IN ('channeltech', 'channel-tech') THEN 'Service Recovery Detection Pipeline - Channel Technology'
            WHEN v_prefix = 'openhospitality' THEN 'Service Recovery Detection Pipeline - Open Hospitality'
            WHEN v_prefix IN ('brandstandards', 'standards') THEN 'Channel Intelligence Stream - Brand Standards'
            WHEN v_prefix IN ('safety', 'propertiesafety') THEN 'Channel Intelligence Stream - Property Safety'
            WHEN v_prefix IN ('ops', 'occ') THEN 'Channel Intelligence Stream - Operations Control'
            WHEN v_prefix = 'quality' THEN 'Channel Intelligence Stream - Brand Compliance'
            WHEN v_prefix = 'cancellation' THEN 'Channel Intelligence Stream - Cancellation Reserve'
            WHEN v_prefix = 'maintenance' THEN 'Channel Intelligence Stream - Maintenance'
            WHEN v_prefix = 'housekeeping' THEN 'Channel Intelligence Stream - Housekeeping'
            WHEN v_prefix = 'audit' THEN 'Channel Intelligence Stream - Audit'
            WHEN v_prefix IN ('channeldesk', 'regdesk') THEN 'Channel Intelligence Stream - Channel Desk'
            WHEN v_prefix IN ('brandstandard', 'brand-standard') THEN 'Channel Intelligence Stream - Brand Standard'
            WHEN v_prefix = 'data' THEN 'Channel Intelligence Stream - Data'
            WHEN v_prefix IN ('associationgroup', 'association-group') THEN 'Channel Intelligence Stream - Association Groups'
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

    PROCEDURE replace_top_source(p_handle VARCHAR2) IS
        v_new_name VARCHAR2(200) := source_display_name(p_handle);
    BEGIN
        UPDATE demand_forecasts
        SET explanation = REPLACE(explanation, p_handle, v_new_name)
        WHERE DBMS_LOB.INSTR(explanation, p_handle) > 0;
    END;
BEGIN
    FOR rec IN (SELECT ROWID AS row_id, handle FROM influencers) LOOP
        DECLARE
            v_new_name VARCHAR2(200) := source_display_name(rec.handle);
        BEGIN
        UPDATE influencers
        SET display_name = v_new_name
        WHERE ROWID = rec.row_id;
        v_updated_sources := v_updated_sources + 1;
        END;
    END LOOP;

    replace_top_source('@ops_harborstone-operations-analytics_01');
    replace_top_source('@brandqa_watch_01');
    replace_top_source('@brandstandards_updates_01');
    replace_top_source('@payments_ops_01');
    replace_top_source('@revenueops_daily_01');
    replace_top_source('@harborstone-property-operations_ops_01');
    replace_top_source('@harborstone-demand-signals_01');
    replace_top_source('@demand_pulse_01');

    COMMIT;

    DBMS_OUTPUT.PUT_LINE('Signal source display names updated: ' || v_updated_sources);
END;
/

SELECT COUNT(*) AS total_sources,
       COUNT(DISTINCT display_name) AS distinct_source_names,
       SUM(CASE WHEN display_name LIKE '@%' OR display_name LIKE '%@%' THEN 1 ELSE 0 END) AS names_with_at_sign
FROM influencers;
