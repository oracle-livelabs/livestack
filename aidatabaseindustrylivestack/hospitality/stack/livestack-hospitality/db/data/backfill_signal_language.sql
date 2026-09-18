/*
 * backfill_signal_language.sql
 * Idempotently updates existing demo records so signal copy reads like
 *  hospitality operations and brand-standard monitoring instead of retail demanding.
 */

SET SERVEROUTPUT ON
SET DEFINE OFF

PROMPT Backfilling hospitality-facing signal language...

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
    replace_post_text('Booking Cancellation risk alert mentions ', 'Booking Cancellation risk alert references ');
    replace_post_text(' property teams should prioritize outreach', ' property teams should prioritize guest recovery review');
    replace_post_text('Availability desk flagged demand for ', 'Availability desk flagged elevated reservation volume for ');
    replace_post_text(' folio planning should be reviewed', ' inventory and room-readiness thresholds should be reviewed');
    replace_post_text('Folio operations bulletin mentions ', 'Folio operations bulletin references ');
    replace_post_text(' folio closeout queue is rising', ' folio closeout queue shows elevated activity');
    replace_post_text('guest campaign response rising for ', 'Brand Standard screening activity is rising for ');
    replace_post_text(' next-best-offer score improved', ' onboarding controls require review');
    replace_post_text('Group Booking desk reports more applications tied to ', 'Group Booking desk reports elevated onboarding activity tied to ');
    replace_post_text('Revenue Operations guest demand increased for ', 'Elevated revenue operations onboarding activity detected for ');
    replace_post_text(' property teams should monitor limits', ' property teams should monitor revenue impact thresholds');
    replace_post_text('Property service note: ', 'Property operations alert: ');
    replace_post_text(' reported higher appointment volume for ', ' reported elevated onboarding workload for ');
    replace_post_text('Guest protection preference update mentions ', 'Guest protection update references ');
    replace_post_text('Open hospitality signal shows increased API usage around ', 'Open hospitality signal shows elevated API reservation volume around ');
    replace_post_text(' digital team watching load', ' digital controls team watching load');
    replace_post_text(' expected guest demand multiplier increasing', ' expected revenue impact monitoring workload increasing');
    replace_post_text('Property appointment demand is rising for ', 'Property onboarding workload is elevated for ');
    replace_post_text('Revenue Operations services desk is tracking higher corporate folio-management demand', 'Revenue Operations services desk is tracking elevated corporate order volume');

    UPDATE products
    SET product_name = 'Guest Preference Control Model',
        subcategory = 'Personalization',
        tags = 'guest preference,controls,ml,risk-decisioning'
    WHERE product_name = 'Next Best Offer Model'
       OR tags LIKE '%next-best-offer%';
    v_updated_products := SQL%ROWCOUNT;

    UPDATE products
    SET description = REPLACE(
        description,
        'tracked for guest preference, revenue impact, operational risk, and guest service.',
        'tracked for guest preference, revenue impact, operational risk, and guest service.'
    )
    WHERE description IS NOT NULL
      AND DBMS_LOB.INSTR(description, 'tracked for guest preference, revenue impact, operational risk, and guest service.') > 0;
    v_updated_products := v_updated_products + SQL%ROWCOUNT;

    replace_post_text('Next Best Offer Model', 'Guest Preference Control Model');
    replace_post_text('next best offer', 'guest preference controls');
    replace_post_text('Next Best Offer', 'Guest Preference Control');

    replace_forecast_text('guest_demand_shift', 'guest_revenue_impact_shift');
    replace_forecast_text('contract_pull_advance-booking', 'reservation_volume_shift');
    replace_forecast_text('source_feed_spike', 'monitoring_feed_spike');
    replace_forecast_text('launch_spike', 'control_review_spike');
    replace_forecast_text('mega_viral', 'critical_escalation');
    replace_forecast_text('explosive_growth', 'rapid_risk_escalation');
    replace_forecast_text('regional_demand_shift', 'regional_order_shift');
    replace_forecast_text('seasonal_folio_planning', 'periodic_folio_review');
    replace_forecast_text('seasonal_guest profile_activity', 'periodic_guest profile_activity');
    replace_forecast_text('flat_seasonal', 'stable_periodic_activity');
    replace_forecast_text('seasonal_uptick', 'periodic_activity_uptick');
    replace_forecast_text('"seasonal"', '"periodic_activity"');
    replace_forecast_text('"rising"', '"elevated_activity"');
    replace_forecast_text('reach_restriction_review', 'revenue_impact_restriction_review');
    replace_forecast_text('critical_guest_allocation', 'critical_guest_revenue_impact');
    replace_forecast_text('guest_allocation_review', 'guest_revenue_impact_review');
    replace_forecast_text('guest_substitution_review', 'guest_revenue_impact_review');

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
            WHEN 1 THEN 'Service Recovery Detection Pipeline escalated CASE-ATO-2026-014 after shared-device activity linked Premier King Room 8841, Revenue Operations guest profile review, and OTA settlement channel 017; investigation SLA at risk.'
            WHEN 2 THEN 'OTA Surveillance Engine detected suspicious group-deposit and digital wallet bursts tied to Revenue Operations guest profiles; revenue impact review required for high-value stays.'
            WHEN 3 THEN 'Brand QA Monitoring Feed flagged control review around OTA screening and guest-safety checks; evidence linked to guest profile takeover activity.'
            WHEN 4 THEN 'Revenue Operations Brand Standard Feed reported elevated onboarding and payment-screening exceptions across contracted guest profiles; regional operations center capacity is constrained.'
            WHEN 5 THEN 'Demand Activity Monitor detected unusual folio-closeout-volume movement for short-stay packages and revenue operations guest profiles; availability risk review opened.'
            WHEN 6 THEN 'Guest Revenue Impact Engine connected private villa guests to shared device, IP, and payment patterns already present in service recovery case CASE-ATO-2026-014.'
            WHEN 7 THEN 'Channel Intelligence Stream opened monitoring item for guest-safety and channel-payment exception clusters across cross-border booking workflows.'
            ELSE 'Service Recovery Detection Pipeline reported folio-dispute and real-time-payment anomalies across digital servicing channels; active investigations require prioritization.'
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
            WHEN 0 THEN 'Service recovery notice affects digital onboarding controls; guest profile-takeover monitoring thresholds require review.'
            WHEN 1 THEN 'OTA surveillance alert references revenue operations order monitoring; suspicious Group Deposit review queue is elevated.'
            WHEN 2 THEN 'Channel intelligence stream reported cross-border airport-transfer screening exceptions; guest-safety operations opened review.'
            ELSE 'guest revenue impact engine detected shared-device activity across servicing channels; investigation prioritization required.'
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
           sp.post_text LIKE 'Service Recovery Detection Pipeline escalated CASE-ATO-2026-014%'
        OR sp.post_text LIKE 'OTA Surveillance Engine detected suspicious Group Deposit%'
        OR sp.post_text LIKE 'Brand QA Monitoring Feed flagged control review%'
        OR sp.post_text LIKE 'Revenue Operations Brand Standard Feed reported elevated onboarding%'
        OR sp.post_text LIKE 'Demand Activity Monitor detected unusual folio-closeout-volume%'
        OR sp.post_text LIKE 'guest Revenue Impact Engine connected private luxury guest households%'
        OR sp.post_text LIKE 'Channel Intelligence Stream opened monitoring item%'
        OR sp.post_text LIKE 'Service Recovery Detection Pipeline reported folio-dispute%'
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
            OR LOWER(post_text) LIKE '%guest demand%'
            OR LOWER(post_text) LIKE '%appointment volume%'
            OR LOWER(post_text) LIKE '%demand multiplier%' THEN 1 ELSE 0 END) AS remaining_post_language
FROM social_posts;

SELECT
  SUM(CASE WHEN LOWER(explanation) LIKE '%guest_demand%'
            OR LOWER(explanation) LIKE '%mega_viral%'
            OR LOWER(explanation) LIKE '%explosive_growth%'
            OR LOWER(explanation) LIKE '%source_feed_spike%'
            OR LOWER(explanation) LIKE '%launch_spike%'
            OR LOWER(explanation) LIKE '%seasonal%' THEN 1 ELSE 0 END) AS remaining_forecast_language
FROM demand_forecasts;
