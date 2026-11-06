/*
 * backfill_social_post_criticality.sql
 *
 * Gives the Operations Dashboard watched-product criticality values a
 * deterministic retail-priority spread. The gold seed can generate many
 * top-ranked mega_viral posts with virality_score = 99; this pass keeps the
 * highest-priority rows high while avoiding copy-pasted-looking scores.
 */

SET SERVEROUTPUT ON

DECLARE
BEGIN
  FOR scored IN (
    WITH ranked_signals AS (
      SELECT
        sp.post_id,
        ROW_NUMBER() OVER (
          ORDER BY
            NVL(sp.virality_score, 0) DESC,
            NVL(sp.views_count, 0) DESC,
            NVL(sp.likes_count, 0) DESC,
            sp.post_id
        ) AS priority_rank
      FROM social_posts sp
      WHERE sp.posted_at >= (
        SELECT MAX(posted_at) FROM social_posts
      ) - INTERVAL '7' DAY
        AND EXISTS (
          SELECT 1
          FROM post_product_mentions ppm
          WHERE ppm.post_id = sp.post_id
        )
    )
    SELECT
      post_id,
      CASE
        WHEN priority_rank <= 25 THEN 99 - (priority_rank * 2)
        ELSE GREATEST(35, 49 - FLOOR((priority_rank - 26) / 12))
      END AS criticality_score
    FROM ranked_signals
  ) LOOP
    UPDATE social_posts sp
    SET sp.virality_score = scored.criticality_score,
        sp.momentum_flag = CASE
          WHEN scored.criticality_score >= 92 THEN 'mega_viral'
          WHEN scored.criticality_score >= 80 THEN 'viral'
          WHEN scored.criticality_score >= 60 THEN 'rising'
          ELSE 'normal'
        END
    WHERE sp.post_id = scored.post_id;
  END LOOP;
END;
/

COMMIT;

DECLARE
  v_rows NUMBER;
  v_distinct_scores NUMBER;
BEGIN
  SELECT COUNT(*), COUNT(DISTINCT virality_score)
  INTO v_rows, v_distinct_scores
  FROM social_posts
  WHERE posted_at >= (SELECT MAX(posted_at) FROM social_posts) - INTERVAL '7' DAY;

  DBMS_OUTPUT.PUT_LINE(
    'Watched-product criticality spread refreshed: ' ||
    v_rows || ' recent signals, ' ||
    v_distinct_scores || ' distinct scores.'
  );
END;
/
