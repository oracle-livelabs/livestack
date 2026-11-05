/*
 * enrich_post_product_mentions.sql
 * Adds secondary product mentions so demand signals form realistic clusters.
 *
 * The base seed intentionally gives each post one primary product mention.
 * For the dashboard, that makes every watched product show exactly one mention.
 * This enrichment links each post to a small number of same-category hot products,
 * preserving the original primary mention while making real demand clusters visible.
 *
 * The script is repeat-safe. It anchors on the first mention for each post as the
 * seed mention, removes stale generated mentions, then inserts the desired set.
 */

SET SERVEROUTPUT ON
PROMPT Enriching PeakGear product mention clusters...

DECLARE
    v_inserted NUMBER := 0;
    v_deleted NUMBER := 0;
BEGIN
    DELETE FROM post_product_mentions ppm
    WHERE ppm.mention_id <> (
        SELECT MIN(primary_ppm.mention_id)
        FROM post_product_mentions primary_ppm
        WHERE primary_ppm.post_id = ppm.post_id
    )
      AND NOT EXISTS (
        SELECT 1
        FROM (
            WITH primary_mentions AS (
                SELECT sp.post_id,
                       ppm_seed.product_id AS primary_product_id,
                       p.category,
                       sp.virality_score,
                       sp.views_count,
                       sp.likes_count,
                       sp.shares_count,
                       sp.comments_count
                FROM post_product_mentions ppm_seed
                JOIN (
                    SELECT post_id, MIN(mention_id) AS mention_id
                    FROM post_product_mentions
                    GROUP BY post_id
                ) seed_mentions
                  ON seed_mentions.mention_id = ppm_seed.mention_id
                JOIN social_posts sp ON sp.post_id = ppm_seed.post_id
                JOIN products p ON p.product_id = ppm_seed.product_id
            ),
            hot_products AS (
                SELECT category,
                       product_id,
                       hot_rank
                FROM (
                    SELECT pm.category,
                           pm.primary_product_id AS product_id,
                           ROW_NUMBER() OVER (
                               PARTITION BY pm.category
                               ORDER BY pm.virality_score DESC, pm.views_count DESC, pm.primary_product_id
                           ) AS hot_rank
                    FROM primary_mentions pm
                )
                WHERE hot_rank <= 6
            )
            SELECT DISTINCT
                   pm.post_id,
                   hp.product_id
            FROM primary_mentions pm
            JOIN hot_products hp ON hp.category = pm.category
            WHERE hp.product_id <> pm.primary_product_id
              AND hp.hot_rank <= CASE
                  WHEN pm.virality_score >= 90 THEN 4
                  WHEN pm.virality_score >= 75 THEN 3
                  WHEN pm.virality_score >= 50 THEN 2
                  ELSE 1
              END
        ) desired_mentions
        WHERE desired_mentions.post_id = ppm.post_id
          AND desired_mentions.product_id = ppm.product_id
    );

    v_deleted := SQL%ROWCOUNT;

    INSERT INTO post_product_mentions (
        post_id,
        product_id,
        confidence_score,
        mention_type
    )
    WITH primary_mentions AS (
        SELECT sp.post_id,
               ppm_seed.product_id AS primary_product_id,
               p.category,
               sp.virality_score,
               sp.views_count,
               sp.likes_count,
               sp.shares_count,
               sp.comments_count
        FROM post_product_mentions ppm_seed
        JOIN (
            SELECT post_id, MIN(mention_id) AS mention_id
            FROM post_product_mentions
            GROUP BY post_id
        ) seed_mentions
          ON seed_mentions.mention_id = ppm_seed.mention_id
        JOIN social_posts sp ON sp.post_id = ppm_seed.post_id
        JOIN products p ON p.product_id = ppm_seed.product_id
    ),
    hot_products AS (
        SELECT category,
               product_id,
               hot_rank
        FROM (
            SELECT pm.category,
                   pm.primary_product_id AS product_id,
                   ROW_NUMBER() OVER (
                       PARTITION BY pm.category
                       ORDER BY pm.virality_score DESC, pm.views_count DESC, pm.primary_product_id
                   ) AS hot_rank
            FROM primary_mentions pm
        )
        WHERE hot_rank <= 6
    ),
    mention_candidates AS (
        SELECT DISTINCT
               pm.post_id,
               hp.product_id,
               ROUND(LEAST(
                   0.98,
                   0.68
                   + NVL(pm.virality_score, 0) / 400
                   + LEAST(NVL(pm.views_count, 0) / 1000000, 0.06)
                   - hp.hot_rank / 100
               ), 3) AS confidence_score,
               CASE
                   WHEN hp.hot_rank <= 2 THEN 'semantic'
                   WHEN MOD(pm.post_id + hp.hot_rank, 3) = 0 THEN 'hashtag'
                   WHEN MOD(pm.post_id + hp.hot_rank, 3) = 1 THEN 'inferred'
                   ELSE 'visual'
               END AS mention_type
        FROM primary_mentions pm
        JOIN hot_products hp ON hp.category = pm.category
        WHERE hp.product_id <> pm.primary_product_id
          AND hp.hot_rank <= CASE
              WHEN pm.virality_score >= 90 THEN 4
              WHEN pm.virality_score >= 75 THEN 3
              WHEN pm.virality_score >= 50 THEN 2
              ELSE 1
          END
    )
    SELECT mc.post_id,
           mc.product_id,
           mc.confidence_score,
           mc.mention_type
    FROM mention_candidates mc
    WHERE NOT EXISTS (
        SELECT 1
        FROM post_product_mentions existing
        WHERE existing.post_id = mc.post_id
          AND existing.product_id = mc.product_id
    );

    v_inserted := SQL%ROWCOUNT;
    COMMIT;

    DBMS_OUTPUT.PUT_LINE('Stale generated product mentions removed: ' || v_deleted);
    DBMS_OUTPUT.PUT_LINE('Secondary product mentions inserted: ' || v_inserted);
END;
/
