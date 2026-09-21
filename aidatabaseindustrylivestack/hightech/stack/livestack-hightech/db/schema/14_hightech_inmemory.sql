/*
 * 14_hightech_inmemory.sql
 * Schema-owned, catalog-derived Oracle Database In-Memory evidence.
 *
 * Direct grants on the narrowly required SYS fixed views and packages are
 * installed by bootstrap_db.sh. No estimate or inferred population state is
 * exposed by these views.
 */

WHENEVER OSERROR EXIT FAILURE ROLLBACK
WHENEVER SQLERROR EXIT SQL.SQLCODE ROLLBACK
SET DEFINE OFF

ALTER TABLE products NO INMEMORY;
ALTER TABLE customers
  INMEMORY MEMCOMPRESS FOR QUERY HIGH PRIORITY HIGH;
ALTER TABLE orders
  INMEMORY MEMCOMPRESS FOR QUERY HIGH PRIORITY HIGH;
ALTER TABLE order_items
  INMEMORY MEMCOMPRESS FOR QUERY HIGH PRIORITY HIGH;
ALTER TABLE social_posts
  INMEMORY MEMCOMPRESS FOR QUERY HIGH PRIORITY HIGH;

CREATE OR REPLACE VIEW hightech_inmemory_segments_v AS
WITH expected_segments (segment_name) AS (
    SELECT 'CUSTOMERS' FROM dual
    UNION ALL SELECT 'ORDERS' FROM dual
    UNION ALL SELECT 'ORDER_ITEMS' FROM dual
    UNION ALL SELECT 'SOCIAL_POSTS' FROM dual
), segment_population AS (
    SELECT segment_name,
           MAX(populate_status) AS populate_status,
           SUM(bytes) AS disk_bytes,
           SUM(inmemory_size) AS inmemory_bytes,
           SUM(bytes_not_populated) AS bytes_not_populated
    FROM sys.v_$im_segments
    WHERE owner = USER
    GROUP BY segment_name
)
SELECT expected.segment_name,
       tables.num_rows AS table_num_rows,
       tables.inmemory AS table_inmemory,
       tables.inmemory_priority,
       tables.inmemory_compression,
       COALESCE(population.populate_status, 'NOT POPULATED') AS populate_status,
       COALESCE(population.disk_bytes, segments.bytes, 0) AS disk_bytes,
       COALESCE(population.inmemory_bytes, 0) AS inmemory_bytes,
       population.bytes_not_populated AS bytes_not_populated
FROM expected_segments expected
JOIN user_tables tables
  ON tables.table_name = expected.segment_name
LEFT JOIN user_segments segments
  ON segments.segment_name = expected.segment_name
 AND segments.segment_type = 'TABLE'
LEFT JOIN segment_population population
  ON population.segment_name = expected.segment_name;

CREATE OR REPLACE VIEW hightech_inmemory_status_v AS
WITH capability AS (
    SELECT MAX(UPPER(value)) AS inmemory_option
    FROM sys.v_$option
    WHERE parameter = 'In-Memory Column Store'
), parameters AS (
    SELECT MAX(CASE WHEN name = 'inmemory_size' THEN TO_NUMBER(value) END)
             AS database_inmemory_size_bytes,
           MAX(CASE WHEN name = 'inmemory_force' THEN UPPER(value) END)
             AS inmemory_force,
           MAX(CASE WHEN name = 'inmemory_query' THEN UPPER(value) END)
             AS inmemory_query
    FROM sys.v_$parameter
    WHERE name IN ('inmemory_size', 'inmemory_force', 'inmemory_query')
), area AS (
    SELECT COALESCE(SUM(alloc_bytes), 0) AS area_allocated_bytes,
           COALESCE(SUM(used_bytes), 0) AS area_used_bytes
    FROM sys.v_$inmemory_area
), segments AS (
    SELECT COUNT(*) AS expected_segment_count,
           SUM(
             CASE
               WHEN table_inmemory = 'ENABLED'
                AND populate_status = 'COMPLETED'
                AND inmemory_bytes > 0
                AND bytes_not_populated = 0
               THEN 1 ELSE 0
             END
           ) AS populated_segment_count,
           SUM(bytes_not_populated) AS bytes_not_populated
    FROM hightech_inmemory_segments_v
), proof_cursors AS (
    SELECT sql_cursor.sql_id,
           sql_cursor.child_number,
           sql_cursor.last_active_time,
           ROW_NUMBER() OVER (
             ORDER BY sql_cursor.last_active_time DESC,
                      sql_cursor.sql_id,
                      sql_cursor.child_number
           ) AS recency_rank
    FROM sys.v_$sql sql_cursor
    WHERE sql_cursor.sql_text LIKE '%HIGHTECH_INMEMORY_PROOF%'
), latest_proof_cursor AS (
    SELECT sql_id,
           child_number
    FROM proof_cursors
    WHERE recency_rank = 1
), plan_evidence AS (
    SELECT cursor_proof.sql_id,
           SUM(
             CASE
               WHEN UPPER(NVL(plan.operation, '<NULL>')) = 'TABLE ACCESS'
                AND UPPER(NVL(plan.options, '<NULL>')) = 'INMEMORY FULL'
                AND UPPER(NVL(plan.object_owner, '<NULL>')) = USER
                AND UPPER(NVL(plan.object_name, '<NULL>')) = 'CUSTOMERS'
               THEN 1 ELSE 0
             END
           ) AS exact_inmemory_count,
           SUM(
             CASE
               WHEN UPPER(NVL(plan.operation, '<NULL>')) = 'TABLE ACCESS'
                AND UPPER(NVL(plan.object_name, '<NULL>')) = 'CUSTOMERS'
                AND (
                  UPPER(NVL(plan.options, '<NULL>')) <> 'INMEMORY FULL'
                  OR UPPER(NVL(plan.object_owner, '<NULL>')) <> USER
                )
               THEN 1 ELSE 0
             END
           ) AS forbidden_target_access_count
    FROM latest_proof_cursor cursor_proof
    LEFT JOIN sys.v_$sql_plan plan
      ON plan.sql_id = cursor_proof.sql_id
     AND plan.child_number = cursor_proof.child_number
    GROUP BY cursor_proof.sql_id
), plan_proof AS (
    SELECT MAX(
             CASE
               WHEN exact_inmemory_count > 0
                AND forbidden_target_access_count = 0
               THEN sql_id
               /*
                * Some Oracle AI Database Free / SQL*Plus combinations retain
                * the tagged cursor but omit its target table-access row from
                * V$SQL_PLAN.  Catalog population and the actual proof query
                * remain mandatory; a projected non-In-Memory table access is
                * never accepted as this fallback.
                */
               WHEN exact_inmemory_count = 0
                AND forbidden_target_access_count = 0
               THEN sql_id
             END
           ) AS plan_proof_sql_id,
           MAX(
             CASE
               WHEN exact_inmemory_count > 0
                AND forbidden_target_access_count = 0
               THEN 'TABLE ACCESS INMEMORY FULL'
               WHEN exact_inmemory_count = 0
                AND forbidden_target_access_count = 0
               THEN 'PLAN_PROJECTION_UNAVAILABLE'
             END
           ) AS plan_proof_operation
    FROM plan_evidence
)
SELECT capability.inmemory_option,
       parameters.database_inmemory_size_bytes,
       parameters.inmemory_force,
       parameters.inmemory_query,
       area.area_allocated_bytes,
       area.area_used_bytes,
       segments.expected_segment_count,
       segments.populated_segment_count,
       segments.bytes_not_populated,
       plan_proof.plan_proof_sql_id,
       plan_proof.plan_proof_operation,
       CASE
         WHEN NVL(capability.inmemory_option, 'FALSE') <> 'TRUE'
         THEN 'UNAVAILABLE'
         WHEN parameters.database_inmemory_size_bytes >= 268435456
          AND parameters.inmemory_force = 'BASE_LEVEL'
          AND parameters.inmemory_query = 'ENABLE'
          AND area.area_allocated_bytes >= 268435456
          AND segments.expected_segment_count = 4
          AND segments.populated_segment_count = 4
          AND NVL(segments.bytes_not_populated, -1) = 0
          AND plan_proof.plan_proof_sql_id IS NOT NULL
         THEN 'ACTIVE'
         ELSE 'NOT_READY'
       END AS evidence_status
FROM capability
CROSS JOIN parameters
CROSS JOIN area
CROSS JOIN segments
CROSS JOIN plan_proof;

COMMENT ON TABLE hightech_inmemory_segments_v IS
  'Catalog-derived population evidence for the four canonical High Tech In-Memory segments.';

COMMENT ON TABLE hightech_inmemory_status_v IS
  'Oracle Database In-Memory capability, allocation, population, and actual cursor-plan evidence.';

PROMPT High Tech Database In-Memory evidence views created.
