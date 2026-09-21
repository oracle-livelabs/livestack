/*
 * Catalog-derived Oracle Database In-Memory evidence. No estimates.
 */
ALTER TABLE products NO INMEMORY;
ALTER TABLE customers INMEMORY MEMCOMPRESS FOR QUERY LOW PRIORITY HIGH;
ALTER TABLE orders INMEMORY MEMCOMPRESS FOR QUERY LOW PRIORITY HIGH;
ALTER TABLE order_items INMEMORY MEMCOMPRESS FOR QUERY LOW PRIORITY HIGH;
ALTER TABLE social_posts INMEMORY MEMCOMPRESS FOR QUERY LOW PRIORITY HIGH;

CREATE OR REPLACE VIEW media_inmemory_segments_v AS
WITH expected(segment_name) AS (
    SELECT 'CUSTOMERS' FROM dual UNION ALL
    SELECT 'ORDERS' FROM dual UNION ALL
    SELECT 'ORDER_ITEMS' FROM dual UNION ALL
    SELECT 'SOCIAL_POSTS' FROM dual
), populated AS (
    SELECT segment_name,
           MAX(populate_status) populate_status,
           SUM(bytes) disk_bytes,
           SUM(inmemory_size) inmemory_bytes,
           SUM(bytes_not_populated) bytes_not_populated
    FROM sys.v_$im_segments
    WHERE owner = USER
    GROUP BY segment_name
)
SELECT e.segment_name, t.num_rows row_count, t.inmemory table_inmemory,
       t.inmemory_priority, t.inmemory_compression,
       NVL(p.populate_status, 'NOT POPULATED') populate_status,
       NVL(p.disk_bytes, s.bytes) disk_bytes,
       NVL(p.inmemory_bytes, 0) inmemory_bytes,
       p.bytes_not_populated
FROM expected e
JOIN user_tables t ON t.table_name = e.segment_name
LEFT JOIN user_segments s ON s.segment_name = e.segment_name AND s.segment_type = 'TABLE'
LEFT JOIN populated p ON p.segment_name = e.segment_name;

CREATE OR REPLACE VIEW media_inmemory_status_v AS
WITH segments AS (
    SELECT COUNT(*) expected_segments,
           SUM(CASE WHEN table_inmemory = 'ENABLED'
                     AND populate_status = 'COMPLETED'
                     AND inmemory_bytes > 0
                     AND bytes_not_populated = 0 THEN 1 ELSE 0 END) populated_segments
    FROM media_inmemory_segments_v
), proof AS (
    SELECT MAX(evidence.sql_id) sql_id,
           MAX(evidence.child_number) child_number,
           MAX(evidence.operation) operation,
           MAX(evidence.options) options
    FROM app_dataset_readiness readiness
    JOIN app_dataset_jobs job ON job.job_id = readiness.job_id
    JOIN app_feature_execution_evidence evidence
      ON evidence.generation_id = job.candidate_generation_id
     AND evidence.feature_name = 'INMEMORY'
     AND evidence.evidence_status = 'VERIFIED'
    WHERE readiness.readiness_id = 1
      AND readiness.status = 'ACTIVE'
)
SELECT segments.expected_segments,
       segments.populated_segments,
       proof.sql_id plan_proof_sql_id,
       proof.child_number plan_proof_child_number,
       TRIM(proof.operation || ' ' || proof.options) plan_proof_operation,
       CASE WHEN segments.expected_segments = 4
                  AND segments.populated_segments = 4
                  AND proof.sql_id IS NOT NULL
            THEN 'ACTIVE' ELSE 'NOT_READY' END evidence_status
FROM segments CROSS JOIN proof;
