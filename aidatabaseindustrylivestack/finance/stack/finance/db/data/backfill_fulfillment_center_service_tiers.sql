-- Backfill fulfillment center service-tier labels for existing deployments.
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
    WHEN 'warehouse' THEN 'Enterprise Operations'
    WHEN 'distribution' THEN 'Regional Processing'
    WHEN 'micro' THEN 'Branch Services'
    ELSE center_type
  END
  WHERE center_type IN ('warehouse', 'distribution', 'micro');

  v_count := SQL%ROWCOUNT;

  EXECUTE IMMEDIATE q'[
    ALTER TABLE fulfillment_centers ADD CONSTRAINT chk_fulfillment_center_type
    CHECK (center_type IN ('Enterprise Operations','Regional Processing','Branch Services','drop_ship','store'))
  ]';

  COMMIT;
  DBMS_OUTPUT.PUT_LINE('Updated fulfillment center service tiers: ' || v_count);
END;
/

COMMENT ON COLUMN fulfillment_centers.center_type IS
  'Service tier: Enterprise Operations, Regional Processing, Branch Services, drop_ship, or store';

SELECT center_type, COUNT(*) AS row_count
FROM fulfillment_centers
GROUP BY center_type
ORDER BY center_type;
