/*
 * backfill_signal_language.sql
 * Idempotently updates existing demo records so signal copy reads like
 * financial operations and compliance monitoring instead of retail marketing.
 */

SET SERVEROUTPUT ON
SET DEFINE OFF

PROMPT Backfilling finance-facing signal language...

DECLARE
    v_updated_posts NUMBER := 0;
    v_updated_products NUMBER := 0;
    v_updated_forecasts NUMBER := 0;

    PROCEDURE replace_post_text(p_old VARCHAR2, p_new VARCHAR2) IS
    BEGIN
        UPDATE social_posts
        SET post_text = REPLACE(post_text, p_old, p_new)
        WHERE DBMS_LOB.INSTR(post_text, p_old) > 0;
        v_updated_posts := v_updated_posts + SQL%ROWCOUNT;
    END;

    PROCEDURE replace_forecast_text(p_old VARCHAR2, p_new VARCHAR2) IS
    BEGIN
        UPDATE demand_forecasts
        SET explanation = REPLACE(explanation, p_old, p_new)
        WHERE DBMS_LOB.INSTR(explanation, p_old) > 0;
        v_updated_forecasts := v_updated_forecasts + SQL%ROWCOUNT;
    END;
BEGIN
    replace_post_text('Deposit attrition alert mentions ', 'Deposit attrition alert references ');
    replace_post_text(' branch teams should prioritize outreach', ' branch teams should prioritize exposure review');
    replace_post_text('Liquidity desk flagged demand for ', 'Liquidity desk flagged elevated transaction volume for ');
    replace_post_text(' cash planning should be reviewed', ' liquidity thresholds should be reviewed');
    replace_post_text('Payments operations bulletin mentions ', 'Payments operations bulletin references ');
    replace_post_text(' settlement queue is rising', ' settlement queue shows elevated activity');
    replace_post_text('Client campaign response rising for ', 'Compliance screening activity is rising for ');
    replace_post_text(' next-best-offer score improved', ' onboarding controls require review');
    replace_post_text('Mortgage desk reports more applications tied to ', 'Mortgage desk reports elevated onboarding activity tied to ');
    replace_post_text('Treasury client demand increased for ', 'Elevated treasury onboarding activity detected for ');
    replace_post_text(' relationship teams should monitor limits', ' relationship teams should monitor exposure thresholds');
    replace_post_text('Branch service note: ', 'Branch operations alert: ');
    replace_post_text(' reported higher appointment volume for ', ' reported elevated onboarding workload for ');
    replace_post_text('Insurance suitability update mentions ', 'Insurance suitability update references ');
    replace_post_text('Open banking signal shows increased API usage around ', 'Open banking signal shows elevated API transaction volume around ');
    replace_post_text(' digital team watching load', ' digital controls team watching load');
    replace_post_text(' expected client demand multiplier increasing', ' expected exposure monitoring workload increasing');
    replace_post_text('Branch appointment demand is rising for ', 'Branch onboarding workload is elevated for ');
    replace_post_text('Treasury services desk is tracking higher corporate cash-management demand', 'Treasury services desk is tracking elevated corporate transaction volume');

    UPDATE products
    SET product_name = 'Client Suitability Control Model',
        subcategory = 'Risk Decisioning',
        tags = 'suitability,controls,ml,risk-decisioning'
    WHERE product_name = 'Next Best Offer Model'
       OR tags LIKE '%next-best-offer%';
    v_updated_products := SQL%ROWCOUNT;

    UPDATE products
    SET description = REPLACE(
        description,
        'tracked for suitability, demand, risk, and client servicing.',
        'tracked for suitability, exposure monitoring, operational risk, and client servicing.'
    )
    WHERE description IS NOT NULL
      AND DBMS_LOB.INSTR(description, 'tracked for suitability, demand, risk, and client servicing.') > 0;
    v_updated_products := v_updated_products + SQL%ROWCOUNT;

    replace_post_text('Next Best Offer Model', 'Client Suitability Control Model');
    replace_post_text('next best offer', 'suitability controls');
    replace_post_text('Next Best Offer', 'Client Suitability Control');

    replace_forecast_text('client_demand_shift', 'client_exposure_shift');
    replace_forecast_text('contract_pull_forward', 'transaction_volume_shift');
    replace_forecast_text('source_feed_spike', 'monitoring_feed_spike');
    replace_forecast_text('launch_spike', 'control_review_spike');
    replace_forecast_text('mega_viral', 'critical_escalation');
    replace_forecast_text('explosive_growth', 'rapid_risk_escalation');
    replace_forecast_text('regional_demand_shift', 'regional_transaction_shift');
    replace_forecast_text('seasonal_cash_planning', 'periodic_cash_review');
    replace_forecast_text('seasonal_account_activity', 'periodic_account_activity');
    replace_forecast_text('flat_seasonal', 'stable_periodic_activity');
    replace_forecast_text('seasonal_uptick', 'periodic_activity_uptick');
    replace_forecast_text('"seasonal"', '"periodic_activity"');
    replace_forecast_text('"rising"', '"elevated_activity"');
    replace_forecast_text('reach_restriction_review', 'exposure_restriction_review');
    replace_forecast_text('critical_client_allocation', 'critical_client_exposure');
    replace_forecast_text('client_allocation_review', 'client_exposure_review');
    replace_forecast_text('client_substitution_review', 'client_exposure_review');

    MERGE INTO social_posts sp
    USING (
        SELECT post_id, rn
        FROM (
            SELECT post_id,
                   ROW_NUMBER() OVER (ORDER BY post_id) AS rn
            FROM social_posts
        )
        WHERE rn <= 8
    ) ranked
    ON (sp.post_id = ranked.post_id)
    WHEN MATCHED THEN UPDATE SET
        sp.post_text = CASE ranked.rn
            WHEN 1 THEN 'Fraud Detection Pipeline escalated CASE-ATO-2026-014 after shared-device activity linked Premier Checking 8841, Treasury Sweep Account, and Mule Payee 017; investigation SLA at risk.'
            WHEN 2 THEN 'AML Surveillance Engine detected suspicious ACH and digital wallet transaction bursts tied to Treasury Sweep Account; exposure review required for high-value clients.'
            WHEN 3 THEN 'FINRA Monitoring Feed flagged control review around AML Screening Package and Sanctions Alert Review; evidence linked to account-takeover mule activity.'
            WHEN 4 THEN 'Treasury Compliance Feed reported elevated onboarding and wire-screening exceptions across commercial relationship accounts; regional operations center capacity is constrained.'
            WHEN 5 THEN 'Market Activity Monitor detected unusual settlement-volume movement for Short Duration Bond Fund and Treasury Management Account; liquidity risk review opened.'
            WHEN 6 THEN 'Client Exposure Engine connected private wealth households to shared device, IP, and beneficiary patterns already present in fraud case CASE-ATO-2026-014.'
            WHEN 7 THEN 'Regulatory Intelligence Stream opened monitoring item for sanctions-screening exception clusters across cross-border wire workflows.'
            ELSE 'Fraud Detection Pipeline reported card-dispute and real-time-payment anomalies across digital servicing channels; active investigations require prioritization.'
        END,
        sp.platform = CASE ranked.rn
            WHEN 1 THEN 'tiktok'
            WHEN 2 THEN 'threads'
            WHEN 3 THEN 'twitter'
            WHEN 4 THEN 'instagram'
            WHEN 5 THEN 'youtube'
            WHEN 6 THEN 'threads'
            WHEN 7 THEN 'twitter'
            ELSE 'tiktok'
        END,
        sp.posted_at = SYSTIMESTAMP - NUMTODSINTERVAL(
            CASE ranked.rn
                WHEN 1 THEN 42
                WHEN 2 THEN 74
                WHEN 3 THEN 125
                WHEN 4 THEN 188
                WHEN 5 THEN 260
                WHEN 6 THEN 355
                WHEN 7 THEN 430
                ELSE 520
            END,
            'MINUTE'
        ),
        sp.likes_count = CASE ranked.rn
            WHEN 1 THEN 58300
            WHEN 2 THEN 40200
            WHEN 3 THEN 31600
            WHEN 4 THEN 28100
            WHEN 5 THEN 19700
            WHEN 6 THEN 14300
            WHEN 7 THEN 9800
            ELSE 7200
        END,
        sp.shares_count = CASE ranked.rn
            WHEN 1 THEN 9400
            WHEN 2 THEN 7600
            WHEN 3 THEN 5100
            WHEN 4 THEN 4200
            WHEN 5 THEN 3100
            WHEN 6 THEN 2400
            WHEN 7 THEN 1800
            ELSE 1200
        END,
        sp.comments_count = CASE ranked.rn
            WHEN 1 THEN 1260
            WHEN 2 THEN 980
            WHEN 3 THEN 740
            WHEN 4 THEN 620
            WHEN 5 THEN 410
            WHEN 6 THEN 290
            WHEN 7 THEN 180
            ELSE 120
        END,
        sp.views_count = CASE ranked.rn
            WHEN 1 THEN 12560000
            WHEN 2 THEN 8840000
            WHEN 3 THEN 6420000
            WHEN 4 THEN 4170000
            WHEN 5 THEN 2630000
            WHEN 6 THEN 1710000
            WHEN 7 THEN 980000
            ELSE 615000
        END,
        sp.sentiment_score = CASE ranked.rn
            WHEN 1 THEN -0.42
            WHEN 2 THEN -0.35
            WHEN 3 THEN -0.21
            WHEN 4 THEN -0.12
            WHEN 5 THEN 0.08
            WHEN 6 THEN 0.18
            WHEN 7 THEN 0.24
            ELSE 0.31
        END,
        sp.virality_score = CASE ranked.rn
            WHEN 1 THEN 96
            WHEN 2 THEN 92
            WHEN 3 THEN 88
            WHEN 4 THEN 85
            WHEN 5 THEN 83
            WHEN 6 THEN 81
            WHEN 7 THEN 80
            ELSE 79
        END,
        sp.momentum_flag = CASE
            WHEN ranked.rn IN (1, 2) THEN 'mega_viral'
            WHEN ranked.rn IN (3, 4, 6, 7) THEN 'viral'
            ELSE 'rising'
        END;
    v_updated_posts := v_updated_posts + SQL%ROWCOUNT;

    UPDATE social_posts sp
    SET post_text = CASE MOD(sp.post_id, 4)
            WHEN 0 THEN 'Fraud operations notice affects digital onboarding controls; account-takeover monitoring thresholds require review.'
            WHEN 1 THEN 'AML surveillance alert references treasury transaction monitoring; suspicious ACH review queue is elevated.'
            WHEN 2 THEN 'Regulatory intelligence stream reported cross-border wire screening exceptions; sanctions operations opened review.'
            ELSE 'Client exposure engine detected shared-device activity across servicing channels; investigation prioritization required.'
        END,
        virality_score = 62 + MOD(sp.post_id, 11),
        momentum_flag = CASE WHEN MOD(sp.post_id, 3) = 0 THEN 'viral' ELSE 'rising' END
    WHERE sp.post_id NOT IN (
        SELECT post_id
        FROM (
            SELECT post_id,
                   ROW_NUMBER() OVER (ORDER BY post_id) AS rn
            FROM social_posts
        )
        WHERE rn <= 8
    )
      AND (
           sp.post_text LIKE 'Fraud Detection Pipeline escalated CASE-ATO-2026-014%'
        OR sp.post_text LIKE 'AML Surveillance Engine detected suspicious ACH%'
        OR sp.post_text LIKE 'FINRA Monitoring Feed flagged control review%'
        OR sp.post_text LIKE 'Treasury Compliance Feed reported elevated onboarding%'
        OR sp.post_text LIKE 'Market Activity Monitor detected unusual settlement-volume%'
        OR sp.post_text LIKE 'Client Exposure Engine connected private wealth households%'
        OR sp.post_text LIKE 'Regulatory Intelligence Stream opened monitoring item%'
        OR sp.post_text LIKE 'Fraud Detection Pipeline reported card-dispute%'
      );
    v_updated_posts := v_updated_posts + SQL%ROWCOUNT;

    UPDATE post_product_mentions ppm
    SET mention_type = CASE MOD(ppm.post_id, 4)
        WHEN 0 THEN 'direct'
        WHEN 1 THEN 'semantic'
        WHEN 2 THEN 'inferred'
        ELSE 'hashtag'
    END
    WHERE ppm.post_id IN (
        SELECT post_id
        FROM (
            SELECT post_id,
                   ROW_NUMBER() OVER (ORDER BY virality_score DESC NULLS LAST, posted_at DESC, post_id) AS rn
            FROM social_posts
        )
        WHERE rn <= 40
    );

    COMMIT;

    DBMS_OUTPUT.PUT_LINE('Signal records text replacements applied: ' || v_updated_posts);
    DBMS_OUTPUT.PUT_LINE('Product records updated: ' || v_updated_products);
    DBMS_OUTPUT.PUT_LINE('Forecast explanation replacements applied: ' || v_updated_forecasts);
END;
/

SELECT
  SUM(CASE WHEN LOWER(post_text) LIKE '%campaign response%'
            OR LOWER(post_text) LIKE '%next-best-offer%'
            OR LOWER(post_text) LIKE '%client demand%'
            OR LOWER(post_text) LIKE '%appointment volume%'
            OR LOWER(post_text) LIKE '%demand multiplier%' THEN 1 ELSE 0 END) AS remaining_post_language
FROM social_posts;

SELECT
  SUM(CASE WHEN LOWER(explanation) LIKE '%client_demand%'
            OR LOWER(explanation) LIKE '%mega_viral%'
            OR LOWER(explanation) LIKE '%explosive_growth%'
            OR LOWER(explanation) LIKE '%source_feed_spike%'
            OR LOWER(explanation) LIKE '%launch_spike%'
            OR LOWER(explanation) LIKE '%seasonal%' THEN 1 ELSE 0 END) AS remaining_forecast_language
FROM demand_forecasts;
