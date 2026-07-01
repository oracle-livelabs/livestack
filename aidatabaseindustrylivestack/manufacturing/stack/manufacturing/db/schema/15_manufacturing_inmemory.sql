/*
 * 15_manufacturing_inmemory.sql
 * Schema-owned Oracle Database In-Memory evidence for the Manufacturing app.
 *
 * The views expose only the configuration, expected segment population, and
 * cursor-plan proof needed by the demo. Direct fixed-view grants are installed
 * by the clean bootstrap; the application receives no broad catalog role.
 */

WHENEVER OSERROR EXIT FAILURE ROLLBACK
WHENEVER SQLERROR EXIT SQL.SQLCODE ROLLBACK
SET DEFINE OFF

CREATE OR REPLACE VIEW manufacturing_inmemory_segments_v AS
WITH expected_segments (segment_name) AS (
    SELECT 'MANUFACTURING_PRODUCTION_SIGNALS' FROM dual
    UNION ALL SELECT 'MANUFACTURING_WORK_ORDERS' FROM dual
    UNION ALL SELECT 'MANUFACTURING_WORK_ORDER_LINES' FROM dual
    UNION ALL SELECT 'MANUFACTURING_DEMAND_FORECASTS' FROM dual
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
       tables.inmemory AS table_inmemory,
       tables.inmemory_priority,
       tables.inmemory_compression,
       COALESCE(population.populate_status, 'NOT POPULATED') AS populate_status,
       COALESCE(population.disk_bytes, 0) AS disk_bytes,
       COALESCE(population.inmemory_bytes, 0) AS inmemory_bytes,
       COALESCE(population.bytes_not_populated, 0) AS bytes_not_populated
FROM expected_segments expected
JOIN user_tables tables
  ON tables.table_name = expected.segment_name
LEFT JOIN segment_population population
  ON population.segment_name = expected.segment_name;

CREATE OR REPLACE VIEW manufacturing_inmemory_status_v AS
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
               WHEN populate_status = 'COMPLETED'
                AND bytes_not_populated = 0
               THEN 1 ELSE 0
             END
           ) AS populated_segment_count,
           SUM(bytes_not_populated) AS bytes_not_populated
    FROM manufacturing_inmemory_segments_v
), plan_candidates AS (
    SELECT plan.sql_id,
           sql_cursor.last_active_time,
           ROW_NUMBER() OVER (
             ORDER BY sql_cursor.last_active_time DESC, plan.sql_id
           ) AS recency_rank
    FROM sys.v_$sql_plan plan
    JOIN sys.v_$sql sql_cursor
      ON sql_cursor.sql_id = plan.sql_id
     AND sql_cursor.child_number = plan.child_number
    WHERE plan.operation = 'TABLE ACCESS'
      AND plan.options = 'INMEMORY FULL'
      AND plan.object_owner = USER
      AND plan.object_name = 'MANUFACTURING_PRODUCTION_SIGNALS'
      AND sql_cursor.sql_text LIKE '%MANUFACTURING_INMEMORY_PROOF%'
), plan_proof AS (
    SELECT MAX(CASE WHEN recency_rank = 1 THEN sql_id END) AS plan_proof_sql_id
    FROM plan_candidates
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
       CASE
         WHEN plan_proof.plan_proof_sql_id IS NOT NULL
         THEN 'TABLE ACCESS INMEMORY FULL'
         ELSE NULL
       END AS plan_proof_operation,
       CASE
         WHEN capability.inmemory_option = 'TRUE'
          AND parameters.database_inmemory_size_bytes >= 268435456
          AND parameters.inmemory_force = 'BASE_LEVEL'
          AND parameters.inmemory_query = 'ENABLE'
          AND area.area_allocated_bytes >= 268435456
          AND segments.expected_segment_count = 4
          AND segments.populated_segment_count = 4
          AND segments.bytes_not_populated = 0
          AND plan_proof.plan_proof_sql_id IS NOT NULL
         THEN 'ACTIVE'
         ELSE 'NOT_READY'
       END AS evidence_status
FROM capability
CROSS JOIN parameters
CROSS JOIN area
CROSS JOIN segments
CROSS JOIN plan_proof;

COMMENT ON TABLE manufacturing_inmemory_segments_v IS
  'Catalog-derived population evidence for the four canonical Manufacturing Database In-Memory segments.';

COMMENT ON TABLE manufacturing_inmemory_status_v IS
  'Oracle Database In-Memory Base Level configuration, population, and actual cursor-plan evidence.';

PROMPT Manufacturing Database In-Memory evidence views created.
