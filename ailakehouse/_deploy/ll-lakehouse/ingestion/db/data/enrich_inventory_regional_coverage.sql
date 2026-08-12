/*
 * enrich_inventory_regional_coverage.sql
 * Adds realistic regional coverage for watched products.
 *
 * The gold seed can leave high-signal products without any inventory in the
 * demand region, which makes the dashboard jump from zero regional capacity to
 * very large state-wide totals. This repeat-safe pass gives recent watched
 * products a small number of local fulfillment rows in their strongest signal
 * region, with varied on-hand and reserved quantities.
 */

SET SERVEROUTPUT ON
SET DEFINE OFF

PROMPT Enriching PeakGear regional inventory coverage...

DECLARE
    v_merged NUMBER := 0;
BEGIN
    MERGE INTO inventory i
    USING (
        WITH product_signal_state AS (
            SELECT ppm.product_id,
                   CASE UPPER(inf.city)
                     WHEN 'DALLAS' THEN 'TX'
                     WHEN 'AUSTIN' THEN 'TX'
                     WHEN 'HOUSTON' THEN 'TX'
                     WHEN 'FORT WORTH' THEN 'TX'
                     WHEN 'SAN ANTONIO' THEN 'TX'
                     WHEN 'PHOENIX' THEN 'AZ'
                     WHEN 'SEATTLE' THEN 'WA'
                     WHEN 'CHICAGO' THEN 'IL'
                     WHEN 'ATLANTA' THEN 'NC'
                     WHEN 'CHARLOTTE' THEN 'NC'
                     WHEN 'RALEIGH' THEN 'NC'
                   END AS state_province,
                   COUNT(DISTINCT sp.post_id) AS signal_posts,
                   ROUND(AVG(sp.virality_score), 2) AS avg_virality,
                   SUM(NVL(sp.views_count, 0)) AS total_views,
                   ROW_NUMBER() OVER (
                     PARTITION BY ppm.product_id
                     ORDER BY COUNT(DISTINCT sp.post_id) DESC,
                              AVG(sp.virality_score) DESC,
                              SUM(NVL(sp.views_count, 0)) DESC
                   ) AS rn
            FROM post_product_mentions ppm
            JOIN social_posts sp ON sp.post_id = ppm.post_id
            JOIN influencers inf ON inf.influencer_id = sp.influencer_id
            WHERE sp.posted_at >= (SELECT MAX(posted_at) FROM social_posts) - INTERVAL '7' DAY
            GROUP BY ppm.product_id,
                   CASE UPPER(inf.city)
                     WHEN 'DALLAS' THEN 'TX'
                     WHEN 'AUSTIN' THEN 'TX'
                     WHEN 'HOUSTON' THEN 'TX'
                     WHEN 'FORT WORTH' THEN 'TX'
                     WHEN 'SAN ANTONIO' THEN 'TX'
                     WHEN 'PHOENIX' THEN 'AZ'
                     WHEN 'SEATTLE' THEN 'WA'
                     WHEN 'CHICAGO' THEN 'IL'
                     WHEN 'ATLANTA' THEN 'NC'
                     WHEN 'CHARLOTTE' THEN 'NC'
                     WHEN 'RALEIGH' THEN 'NC'
                   END
        ),
        forecast_state AS (
            SELECT product_id,
                   UPPER(region) AS state_province,
                   predicted_demand AS signal_posts,
                   LEAST(99, 55 + predicted_demand / 2) AS avg_virality,
                   predicted_demand * 1000 AS total_views,
                   ROW_NUMBER() OVER (
                     PARTITION BY product_id, UPPER(region)
                     ORDER BY social_factor DESC, predicted_demand DESC, forecast_date DESC
                   ) AS rn
            FROM demand_forecasts
            WHERE UPPER(region) IN ('TX','AZ','WA','IL','NC','CA','FL','GA','CO','NY')
              AND forecast_date >= (SELECT MAX(forecast_date) FROM demand_forecasts) - 30
        ),
        target_products AS (
            SELECT product_id,
                   state_province,
                   MAX(signal_posts) AS signal_posts,
                   MAX(avg_virality) AS avg_virality,
                   MAX(total_views) AS total_views
            FROM (
                SELECT product_id,
                       state_province,
                       signal_posts,
                       avg_virality,
                       total_views
                FROM product_signal_state
                WHERE rn = 1
                  AND state_province IS NOT NULL
                UNION ALL
                SELECT product_id,
                       state_province,
                       signal_posts,
                       avg_virality,
                       total_views
                FROM forecast_state
                WHERE rn = 1
                  AND state_province IS NOT NULL
            )
            GROUP BY product_id, state_province
        ),
        target_centers AS (
            SELECT tp.product_id,
                   fc.center_id,
                   tp.signal_posts,
                   tp.avg_virality,
                   tp.total_views,
                   ROW_NUMBER() OVER (
                     PARTITION BY tp.product_id, tp.state_province
                     ORDER BY MOD((tp.product_id * 19) + (fc.center_id * 23), 97),
                              fc.center_id
                   ) AS center_rank
            FROM target_products tp
            JOIN fulfillment_centers fc
              ON fc.state_province = tp.state_province
             AND fc.is_active = 1
        )
        SELECT product_id,
               center_id,
               ROUND(
                 55
                 + MOD((product_id * 13) + (center_id * 7), 130)
                 + LEAST(NVL(signal_posts, 0) * 6, 48)
                 + CASE WHEN avg_virality >= 90 THEN 35
                        WHEN avg_virality >= 80 THEN 24
                        ELSE 12 END
               ) AS quantity_on_hand,
               ROUND(
                 6
                 + MOD((product_id * 5) + (center_id * 3), 28)
                 + CASE WHEN avg_virality >= 90 THEN 10
                        WHEN avg_virality >= 80 THEN 6
                        ELSE 2 END
               ) AS quantity_reserved,
               ROUND(10 + MOD((product_id * 11) + center_id, 70)) AS quantity_incoming,
               ROUND(28 + MOD((product_id * 7) + center_id, 42)) AS reorder_point,
               ROUND(120 + MOD((product_id * 17) + center_id, 150)) AS reorder_qty
        FROM target_centers
        WHERE center_rank <= CASE
            WHEN avg_virality >= 90 THEN 3
            WHEN avg_virality >= 80 THEN 2
            ELSE 1
        END
    ) src
    ON (i.product_id = src.product_id AND i.center_id = src.center_id)
    WHEN MATCHED THEN UPDATE SET
      i.quantity_on_hand = GREATEST(i.quantity_on_hand, src.quantity_on_hand),
      i.quantity_reserved = LEAST(
        GREATEST(i.quantity_reserved, src.quantity_reserved),
        GREATEST(i.quantity_on_hand, src.quantity_on_hand) - 1
      ),
      i.quantity_incoming = GREATEST(i.quantity_incoming, src.quantity_incoming),
      i.reorder_point = GREATEST(i.reorder_point, src.reorder_point),
      i.reorder_qty = GREATEST(i.reorder_qty, src.reorder_qty)
    WHEN NOT MATCHED THEN INSERT (
      product_id,
      center_id,
      quantity_on_hand,
      quantity_reserved,
      quantity_incoming,
      reorder_point,
      reorder_qty,
      last_restock_date
    ) VALUES (
      src.product_id,
      src.center_id,
      src.quantity_on_hand,
      LEAST(src.quantity_reserved, src.quantity_on_hand - 1),
      src.quantity_incoming,
      src.reorder_point,
      src.reorder_qty,
      TRUNC(SYSDATE) - MOD(src.product_id + src.center_id, 21)
    );

    v_merged := SQL%ROWCOUNT;
    COMMIT;

    DBMS_OUTPUT.PUT_LINE('Regional inventory coverage rows merged: ' || v_merged);
END;
/
