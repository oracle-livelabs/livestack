/*
 * backfill_signal_source_names.sql
 * Updates existing signal-source display names from social-style handles to
 * finance-facing names while leaving handle values as stable internal keys.
 */

SET SERVEROUTPUT ON
SET DEFINE OFF

PROMPT Backfilling finance-facing signal source names...

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

    replace_top_source('@occ_riskdesk_01');
    replace_top_source('@finra_watch_01');
    replace_top_source('@sec_updates_01');
    replace_top_source('@payments_ops_01');
    replace_top_source('@treasury_daily_01');
    replace_top_source('@branch_ops_01');
    replace_top_source('@marketpulse_01');
    replace_top_source('@market_pulse_01');

    COMMIT;

    DBMS_OUTPUT.PUT_LINE('Signal source display names updated: ' || v_updated_sources);
END;
/

SELECT COUNT(*) AS total_sources,
       COUNT(DISTINCT display_name) AS distinct_source_names,
       SUM(CASE WHEN display_name LIKE '@%' OR display_name LIKE '%@%' THEN 1 ELSE 0 END) AS names_with_at_sign
FROM influencers;
