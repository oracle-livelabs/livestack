/*
 * enrich_social_signal_text.sql
 * Rewrites generated gold-data signal copy into user-facing PeakGear demand signals.
 *
 * load_gold_seed.sql is generated from pg-stack/gold-data CSV exports and uses
 * internal wording such as "Gold supplier feed" and "gold-data catalog". That is
 * useful provenance, but awkward in the demo UI. This repeat-safe pass only
 * updates generated GOLD-SIGNAL rows and leaves streaming/customer-created
 * signals untouched.
 */

SET SERVEROUTPUT ON
SET DEFINE OFF

PROMPT Enriching PeakGear demand signal text...

DECLARE
    v_updated NUMBER := 0;
BEGIN
    MERGE INTO social_posts sp
    USING (
        WITH primary_mentions AS (
            SELECT ppm.post_id,
                   ppm.product_id,
                   ROW_NUMBER() OVER (
                     PARTITION BY ppm.post_id
                     ORDER BY ppm.mention_id
                   ) AS rn
            FROM post_product_mentions ppm
        ),
        top_forecast_region AS (
            SELECT product_id,
                   region,
                   predicted_demand,
                   ROW_NUMBER() OVER (
                     PARTITION BY product_id
                     ORDER BY predicted_demand DESC, forecast_date
                   ) AS rn
            FROM demand_forecasts
        ),
        signal_context AS (
            SELECT sp.post_id,
                   REGEXP_REPLACE(p.product_name, '[[:space:]]+', ' ') AS product_name,
                   NVL(p.category, 'sporting goods') AS category,
                   NVL(tfr.region, 'active regions') AS region_hint,
                   NVL(tfr.predicted_demand, 0) AS predicted_demand,
                   CASE sp.platform
                     WHEN 'instagram' THEN 'Social trend'
                     WHEN 'tiktok' THEN 'Product page'
                     WHEN 'twitter' THEN 'Commerce'
                     WHEN 'youtube' THEN 'Store activity'
                     WHEN 'threads' THEN 'Partner Feed'
                     ELSE 'Digital demand'
                   END AS platform_name,
                   NVL(i.city, 'regional') AS source_city,
                   sp.likes_count,
                   sp.shares_count,
                   sp.comments_count,
                   sp.views_count,
                   sp.sentiment_score,
                   sp.virality_score,
                   sp.momentum_flag,
                   CASE sp.momentum_flag
                     WHEN 'mega_viral' THEN 'critical demand spike'
                     WHEN 'viral' THEN 'fast-moving demand signal'
                     WHEN 'rising' THEN 'early demand lift'
                     ELSE 'steady demand signal'
                   END AS intensity_label,
                   CASE sp.momentum_flag
                     WHEN 'mega_viral' THEN 'A critical demand spike'
                     WHEN 'viral' THEN 'A fast-moving demand signal'
                     WHEN 'rising' THEN 'An early demand lift'
                     ELSE 'A steady demand signal'
                   END AS intensity_sentence,
                   CASE
                     WHEN sp.sentiment_score >= 0.45 THEN 'positive'
                     WHEN sp.sentiment_score <= 0.20 THEN 'mixed'
                     ELSE 'watch-list'
                   END AS sentiment_label,
                   CASE
                     WHEN sp.views_count >= 200000 THEN TO_CHAR(ROUND(sp.views_count / 1000)) || 'K views'
                     WHEN sp.views_count >= 100000 THEN TO_CHAR(ROUND(sp.views_count / 1000)) || 'K views'
                     WHEN sp.likes_count >= 5000 THEN TO_CHAR(ROUND(sp.likes_count / 1000, 1)) || 'K likes'
                     ELSE TO_CHAR(sp.shares_count) || ' shares'
                   END AS metric_label,
                   CASE
                     WHEN NVL(tfr.predicted_demand, 0) > 0 THEN
                       'forecasted demand of ' || TO_CHAR(tfr.predicted_demand) || ' units'
                     ELSE
                       'the current regional forecast'
                   END AS demand_label,
                   CASE
                     WHEN tfr.region IS NOT NULL THEN tfr.region || ' availability'
                     ELSE 'regional availability'
                   END AS availability_label,
                   CASE
                     WHEN tfr.region IS NOT NULL THEN tfr.region || ' forecasts'
                     ELSE 'regional forecasts'
                   END AS forecast_label,
                   CASE
                     WHEN tfr.region IS NOT NULL THEN tfr.region || ' demand'
                     ELSE 'regional demand'
                   END AS demand_region_label,
                   MOD(
                     sp.post_id
                     + NVL(sp.likes_count, 0)
                     + NVL(sp.shares_count, 0)
                     + NVL(ROUND(sp.virality_score), 0),
                     24
                   ) AS template_id
            FROM social_posts sp
            JOIN primary_mentions pm
              ON pm.post_id = sp.post_id
             AND pm.rn = 1
            JOIN products p
              ON p.product_id = pm.product_id
            LEFT JOIN influencers i
              ON i.influencer_id = sp.influencer_id
            LEFT JOIN top_forecast_region tfr
              ON tfr.product_id = p.product_id
             AND tfr.rn = 1
            WHERE sp.external_post_id LIKE 'GOLD-SIGNAL-%'
        )
        SELECT sp.post_id,
               CASE sc.template_id
                 WHEN 0 THEN
                   TO_CLOB('Regional demand monitors flag ')
                   || sc.product_name
                   || TO_CLOB(' as a ')
                   || sc.intensity_label
                   || TO_CLOB(' for ')
                   || sc.category
                   || TO_CLOB('; planners should compare ')
                   || sc.availability_label
                   || TO_CLOB(' with near-term demand.')
                 WHEN 1 THEN
                   TO_CLOB(sc.platform_name)
                   || TO_CLOB(' activity is building around ')
                   || sc.product_name
                   || TO_CLOB(', with ')
                   || sc.metric_label
                   || TO_CLOB(' and ')
                   || sc.sentiment_label
                   || TO_CLOB(' sentiment; check replenishment timing before campaigns scale.')
                 WHEN 2 THEN
                   TO_CLOB('Product page views, saves, and comments point to ')
                   || sc.product_name
                   || TO_CLOB(' gaining momentum; review fulfillment capacity in ')
                   || sc.region_hint
                   || TO_CLOB('.')
                 WHEN 3 THEN
                   TO_CLOB('Creator posts and commerce clicks are clustering around ')
                   || sc.product_name
                   || TO_CLOB('; allocation teams should look for inventory that can be moved closer to demand.')
                 WHEN 4 THEN
                   TO_CLOB('Customer interest in ')
                   || sc.product_name
                   || TO_CLOB(' is rising across ')
                   || sc.category
                   || TO_CLOB('; merchandise teams should validate size, color, and channel mix before restock decisions.')
                 ELSE
                   CASE sc.template_id
                     WHEN 5 THEN
                       TO_CLOB('Store traffic and social engagement both point to ')
                       || sc.product_name
                       || TO_CLOB('; compare ')
                       || sc.demand_label
                       || TO_CLOB(' with local replenishment coverage.')
                     WHEN 6 THEN
                       TO_CLOB(sc.intensity_sentence)
                       || TO_CLOB(' is forming for ')
                       || sc.product_name
                       || TO_CLOB(' after ')
                       || sc.metric_label
                       || TO_CLOB('; operations should watch pick capacity and substitutions.')
                     WHEN 7 THEN
                       TO_CLOB(sc.source_city)
                       || TO_CLOB('-area signals are lifting demand for ')
                       || sc.product_name
                       || TO_CLOB('; check whether nearby fulfillment sites can support same-day promises.')
                     WHEN 8 THEN
                       TO_CLOB('Search terms and product hints are converging on ')
                       || sc.product_name
                       || TO_CLOB('; catalog and paid media teams should keep messaging aligned with live demand.')
                     WHEN 9 THEN
                       TO_CLOB('Social saves for ')
                       || sc.product_name
                       || TO_CLOB(' are outpacing comments, suggesting shoppers are researching before purchase; monitor basket conversion.')
                     WHEN 10 THEN
                       TO_CLOB('Demand sensing shows ')
                       || sc.product_name
                       || TO_CLOB(' moving from awareness to intent; reserve inventory for regions with active forecasts.')
                     WHEN 11 THEN
                       TO_CLOB('The signal mix for ')
                       || sc.product_name
                       || TO_CLOB(' combines ')
                       || sc.metric_label
                       || TO_CLOB(' with ')
                       || sc.sentiment_label
                       || TO_CLOB(' feedback; planners should review markdown and replenishment exposure.')
                     WHEN 12 THEN
                       TO_CLOB(sc.category)
                       || TO_CLOB(' shoppers are reacting to ')
                       || sc.product_name
                       || TO_CLOB('; route the signal to assortment, inventory, and campaign owners.')
                     WHEN 13 THEN
                       TO_CLOB('Regional product discovery is accelerating for ')
                       || sc.product_name
                       || TO_CLOB('; check whether ')
                       || sc.forecast_label
                       || TO_CLOB(' are already reflected in allocation plans.')
                     WHEN 14 THEN
                       TO_CLOB('PeakGear should watch ')
                       || sc.product_name
                       || TO_CLOB(': engagement is strong enough to affect replenishment, store transfers, and promo timing.')
                     WHEN 15 THEN
                       TO_CLOB('Audience activity around ')
                       || sc.product_name
                       || TO_CLOB(' suggests demand could spill into adjacent ')
                       || sc.category
                       || TO_CLOB(' items; review substitute coverage.')
                     WHEN 16 THEN
                       TO_CLOB('The ')
                       || sc.platform_name
                       || TO_CLOB(' signal for ')
                       || sc.product_name
                       || TO_CLOB(' is trending above normal; supply planners should inspect open orders and incoming stock.')
                     WHEN 17 THEN
                       TO_CLOB('Demand intent for ')
                       || sc.product_name
                       || TO_CLOB(' is visible before checkout volume catches up; use the Bronze signal to trigger Silver and Gold monitoring.')
                     WHEN 18 THEN
                       TO_CLOB('Regional shoppers are comparing ')
                       || sc.product_name
                       || TO_CLOB(' with similar products; keep inventory and search recommendations synchronized.')
                     WHEN 19 THEN
                       TO_CLOB('The latest demand signal ties ')
                       || sc.product_name
                       || TO_CLOB(' to ')
                       || sc.demand_region_label
                       || TO_CLOB('; fulfillment should verify stock before the next traffic peak.')
                     WHEN 20 THEN
                       TO_CLOB('Engagement around ')
                       || sc.product_name
                       || TO_CLOB(' is broad enough to affect regional allocation; compare demand forecasts, on-hand stock, and reserved units.')
                     WHEN 21 THEN
                       TO_CLOB('Marketplace chatter for ')
                       || sc.product_name
                       || TO_CLOB(' is moving faster than batch reporting; stream the raw signal into Bronze for immediate triage.')
                     WHEN 22 THEN
                       TO_CLOB('Customers are showing renewed interest in ')
                       || sc.product_name
                       || TO_CLOB('; evaluate whether the ')
                       || sc.category
                       || TO_CLOB(' assortment needs a localized campaign response.')
                     ELSE
                       TO_CLOB('Signals from content, commerce, and store activity point to ')
                       || sc.product_name
                       || TO_CLOB('; PeakGear should decide whether to shift inventory, adjust campaigns, or protect margin.')
                   END
               END AS new_post_text
        FROM social_posts sp
        JOIN signal_context sc
          ON sc.post_id = sp.post_id
    ) src
    ON (sp.post_id = src.post_id)
    WHEN MATCHED THEN UPDATE
      SET sp.post_text = src.new_post_text
      WHERE sp.post_text IS NULL
         OR DBMS_LOB.COMPARE(sp.post_text, src.new_post_text) != 0;

    v_updated := SQL%ROWCOUNT;

    UPDATE signal_embeddings se
       SET embedding_text = (
         SELECT sp.post_text
         FROM social_posts sp
         WHERE sp.post_id = se.post_id
       )
     WHERE EXISTS (
       SELECT 1
       FROM social_posts sp
       WHERE sp.post_id = se.post_id
         AND sp.external_post_id LIKE 'GOLD-SIGNAL-%'
     );

    COMMIT;

    DBMS_OUTPUT.PUT_LINE('Generated demand signal rows rewritten: ' || v_updated);
END;
/
