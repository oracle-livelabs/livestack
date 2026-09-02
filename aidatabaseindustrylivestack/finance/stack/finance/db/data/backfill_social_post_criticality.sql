/*
 * backfill_social_post_criticality.sql
 * Populates finance risk severity scores in the legacy social_posts.virality_score column.
 */

SET SERVEROUTPUT ON
PROMPT Rebalancing social post risk severity scores...

UPDATE social_posts
SET virality_score = ROUND(LEAST(96, GREATEST(18,
    CASE
        WHEN NVL(likes_count, 0) > 300000 THEN 67
        WHEN NVL(likes_count, 0) > 150000 THEN 64
        WHEN NVL(likes_count, 0) > 50000 THEN 60
        WHEN NVL(likes_count, 0) > 10000 THEN 54
        WHEN NVL(likes_count, 0) > 1000  THEN 42
        ELSE 24
    END
    + LEAST(10, (LN(GREATEST(NVL(views_count, 0), 1)) / LN(10)) * 1.2)
    + LEAST(6, (NVL(shares_count, 0) / GREATEST(NVL(likes_count, 0), 1)) * 14)
    + LEAST(5, (NVL(comments_count, 0) / GREATEST(NVL(likes_count, 0), 1)) * 8)
    + CASE
        WHEN NVL(sentiment_score, 0) < -0.2 THEN 5
        WHEN NVL(sentiment_score, 0) < 0 THEN 3
        WHEN sentiment_score > 0.7 THEN 2
        ELSE 0
      END
    + (MOD(post_id * 37, 13) - 6)
)), 1);

MERGE INTO social_posts sp
USING (
    SELECT post_id,
           CASE
               WHEN rn = 1 THEN 92
               WHEN rn = 2 THEN 87
               WHEN rn = 3 THEN 79
               WHEN rn = 4 THEN 73
               WHEN rn = 5 THEN 66
               WHEN rn = 6 THEN 58
               WHEN rn <= 40 THEN 64 + MOD(rn * 7, 9)
               ELSE virality_score
           END AS criticality_score
    FROM (
        SELECT post_id,
               virality_score,
               ROW_NUMBER() OVER (
                   ORDER BY virality_score DESC NULLS LAST, posted_at DESC, post_id
               ) AS rn
        FROM social_posts
    )
    WHERE rn <= 40
) ranked
ON (sp.post_id = ranked.post_id)
WHEN MATCHED THEN UPDATE SET sp.virality_score = ranked.criticality_score;

UPDATE social_posts
SET virality_score = CASE
    WHEN post_text LIKE 'Fraud Detection Pipeline escalated CASE-ATO-2026-014%' THEN 96
    WHEN post_text LIKE 'AML Surveillance Engine detected suspicious ACH%' THEN 92
    WHEN post_text LIKE 'FINRA Monitoring Feed flagged control review%' THEN 88
    WHEN post_text LIKE 'Treasury Compliance Feed reported elevated onboarding%' THEN 85
    WHEN post_text LIKE 'Market Activity Monitor detected unusual settlement-volume%' THEN 83
    WHEN post_text LIKE 'Client Exposure Engine connected private wealth households%' THEN 81
    WHEN post_text LIKE 'Regulatory Intelligence Stream opened monitoring item%' THEN 80
    WHEN post_text LIKE 'Fraud Detection Pipeline reported card-dispute%' THEN 79
    ELSE virality_score
END
WHERE post_text LIKE 'Fraud Detection Pipeline escalated CASE-ATO-2026-014%'
   OR post_text LIKE 'AML Surveillance Engine detected suspicious ACH%'
   OR post_text LIKE 'FINRA Monitoring Feed flagged control review%'
   OR post_text LIKE 'Treasury Compliance Feed reported elevated onboarding%'
   OR post_text LIKE 'Market Activity Monitor detected unusual settlement-volume%'
   OR post_text LIKE 'Client Exposure Engine connected private wealth households%'
   OR post_text LIKE 'Regulatory Intelligence Stream opened monitoring item%'
   OR post_text LIKE 'Fraud Detection Pipeline reported card-dispute%';

UPDATE post_product_mentions
SET confidence_score = ROUND(CASE MOD(mention_id, 8)
    WHEN 0 THEN 0.98
    WHEN 1 THEN 0.92
    WHEN 2 THEN 0.84
    WHEN 3 THEN 0.77
    WHEN 4 THEN 0.63
    WHEN 5 THEN 0.58
    WHEN 6 THEN 0.49
    ELSE 0.41
END, 3);

COMMIT;

SELECT COUNT(*) AS total_posts,
       COUNT(virality_score) AS posts_with_criticality,
       COUNT(CASE WHEN virality_score IS NULL THEN 1 END) AS posts_without_criticality,
       MIN(virality_score) AS min_criticality,
       ROUND(AVG(virality_score), 2) AS avg_criticality,
       MAX(virality_score) AS max_criticality
FROM social_posts;
