-- Backfill property hotel category labels for existing deployments.
WHENEVER SQLERROR EXIT SQL.SQLCODE ROLLBACK;
SET SERVEROUTPUT ON;

DECLARE
  v_count NUMBER := 0;
BEGIN
  FOR c IN (
    SELECT constraint_name
    FROM user_constraints
    WHERE table_name = 'FULFILLMENT_CENTERS'
      AND constraint_type = 'C'
      AND (
        constraint_name = 'CHK_FULFILLMENT_CENTER_TYPE'
        OR UPPER(search_condition_vc) LIKE '%CENTER_TYPE%'
      )
  ) LOOP
    EXECUTE IMMEDIATE 'ALTER TABLE fulfillment_centers DROP CONSTRAINT ' || c.constraint_name;
  END LOOP;

  UPDATE fulfillment_centers
  SET center_type = CASE center_type
    WHEN 'operations center' THEN 'Full-Service Hotel'
    WHEN 'Enterprise Operations' THEN 'Full-Service Hotel'
    WHEN 'warehouse' THEN 'Full-Service Hotel'
    WHEN 'distribution' THEN 'Convention Hotel'
    WHEN 'Regional Processing' THEN 'Convention Hotel'
    WHEN 'micro' THEN 'Select-Service Hotel'
    WHEN 'Property Services' THEN 'Select-Service Hotel'
    WHEN 'store' THEN 'Select-Service Hotel'
    WHEN 'drop_ship' THEN 'Partner Property'
    ELSE center_type
  END
  WHERE center_type IN (
    'operations center',
    'Enterprise Operations',
    'warehouse',
    'distribution',
    'Regional Processing',
    'micro',
    'Property Services',
    'store',
    'drop_ship'
  );

  v_count := SQL%ROWCOUNT;

  EXECUTE IMMEDIATE q'[
    ALTER TABLE fulfillment_centers ADD CONSTRAINT chk_fulfillment_center_type
    CHECK (center_type IN ('Full-Service Hotel','Convention Hotel','Select-Service Hotel','Resort Property','Extended-Stay Hotel','Partner Property'))
  ]';

  COMMIT;
  DBMS_OUTPUT.PUT_LINE('Updated property hotel categories: ' || v_count);
END;
/

COMMENT ON COLUMN fulfillment_centers.center_type IS
  'Hotel category: Full-Service Hotel, Convention Hotel, Select-Service Hotel, Resort Property, Extended-Stay Hotel, or Partner Property';

SELECT center_type, COUNT(*) AS row_count
FROM fulfillment_centers
GROUP BY center_type
ORDER BY center_type;
