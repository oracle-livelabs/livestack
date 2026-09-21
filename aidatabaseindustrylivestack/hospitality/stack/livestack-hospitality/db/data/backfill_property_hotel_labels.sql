-- Backfill visible hotel labels for existing Harborstone Hospitality deployments.
WHENEVER SQLERROR EXIT SQL.SQLCODE ROLLBACK;
SET SERVEROUTPUT ON;

BEGIN
  hospitality_security_pkg.set_user_context('admin_ava');
END;
/

DECLARE
  v_brand_rows NUMBER := 0;
  v_hotel_rows NUMBER := 0;
BEGIN
  UPDATE brands
  SET brand_name = 'Harborstone Continuity New Orleans Hotel'
  WHERE brand_name = 'Harborstone Continuity Operations Center';
  v_brand_rows := SQL%ROWCOUNT;

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

  UPDATE fulfillment_centers fc
  SET (center_name, center_type, city) = (
    SELECT m.center_name, m.center_type, m.city
    FROM (
      SELECT '08817' postal_code, 'Summit Grand Edison Metro Hotel' center_name, 'Full-Service Hotel' center_type, 'Edison' city FROM dual
      UNION ALL SELECT '91761', 'Airport Hotel Ontario Airport Hotel', 'Select-Service Hotel', 'Ontario' FROM dual
      UNION ALL SELECT '60435', 'Joliet Gateway Hotel', 'Select-Service Hotel', 'Joliet' FROM dual
      UNION ALL SELECT '75134', 'Harborstone Lancaster South Hotel', 'Full-Service Hotel', 'Lancaster' FROM dual
      UNION ALL SELECT '30291', 'Airport Hotel Union City Atlanta Airport', 'Select-Service Hotel', 'Union City' FROM dual
      UNION ALL SELECT '98032', 'Extended Stay Kent Valley', 'Extended-Stay Hotel', 'Kent' FROM dual
      UNION ALL SELECT '33012', 'Hialeah Miami Lakes Hotel', 'Full-Service Hotel', 'Hialeah' FROM dual
      UNION ALL SELECT '80202', 'Summit Grand Denver Downtown Hotel', 'Full-Service Hotel', 'Denver' FROM dual
      UNION ALL SELECT '85201', 'Phoenix West Hotel', 'Full-Service Hotel', 'Mesa' FROM dual
      UNION ALL SELECT '02720', 'Fall River Waterfront Hotel', 'Select-Service Hotel', 'Fall River' FROM dual
      UNION ALL SELECT '55379', 'Airport Hotel Shakopee Valley', 'Select-Service Hotel', 'Shakopee' FROM dual
      UNION ALL SELECT '97060', 'Troutdale Extended Stay', 'Extended-Stay Hotel', 'Troutdale' FROM dual
      UNION ALL SELECT '37087', 'Extended Stay Lebanon Nashville', 'Extended-Stay Hotel', 'Lebanon' FROM dual
      UNION ALL SELECT '94538', 'Fremont Silicon Valley Hotel', 'Select-Service Hotel', 'Fremont' FROM dual
      UNION ALL SELECT '48174', 'Grand Garden Detroit Metro Airport', 'Full-Service Hotel', 'Romulus' FROM dual
      UNION ALL SELECT '19709', 'Middletown Delaware Hotel', 'Select-Service Hotel', 'Middletown' FROM dual
      UNION ALL SELECT '77459', 'Harborstone Missouri City Gulf Coast Resort', 'Resort Property', 'Missouri City' FROM dual
      UNION ALL SELECT '84084', 'SpringHill Suites West Jordan', 'Select-Service Hotel', 'West Jordan' FROM dual
      UNION ALL SELECT '28027', 'Airport Hotel Concord Mills', 'Select-Service Hotel', 'Concord' FROM dual
      UNION ALL SELECT '46168', 'Extended Stay Plainfield Indianapolis', 'Extended-Stay Hotel', 'Plainfield' FROM dual
      UNION ALL SELECT '89030', 'Harborstone North Las Vegas Hotel', 'Full-Service Hotel', 'North Las Vegas' FROM dual
      UNION ALL SELECT '66111', 'Edwardsville Kansas City Hotel', 'Select-Service Hotel', 'Edwardsville' FROM dual
      UNION ALL SELECT '43018', 'Airport Hotel Etna Columbus', 'Select-Service Hotel', 'Etna' FROM dual
      UNION ALL SELECT '89431', 'Sparks Reno Hotel', 'Select-Service Hotel', 'Sparks' FROM dual
      UNION ALL SELECT '33510', 'Brandon Tampa Extended Stay', 'Extended-Stay Hotel', 'Brandon' FROM dual
      UNION ALL SELECT '21001', 'Extended Stay Aberdeen Chesapeake', 'Extended-Stay Hotel', 'Aberdeen' FROM dual
      UNION ALL SELECT '78130', 'Airport Hotel New Braunfels Riverwalk', 'Select-Service Hotel', 'New Braunfels' FROM dual
      UNION ALL SELECT '38654', 'Olive Branch Memphis Hotel', 'Select-Service Hotel', 'Olive Branch' FROM dual
      UNION ALL SELECT '96707', 'Harborstone Kapolei Beach Resort', 'Resort Property', 'Kapolei' FROM dual
      UNION ALL SELECT '99501', 'SpringHill Suites Anchorage Downtown', 'Select-Service Hotel', 'Anchorage' FROM dual
    ) m
    WHERE m.postal_code = fc.postal_code
  )
  WHERE EXISTS (
    SELECT 1
    FROM (
      SELECT '08817' postal_code FROM dual
      UNION ALL SELECT '91761' FROM dual
      UNION ALL SELECT '60435' FROM dual
      UNION ALL SELECT '75134' FROM dual
      UNION ALL SELECT '30291' FROM dual
      UNION ALL SELECT '98032' FROM dual
      UNION ALL SELECT '33012' FROM dual
      UNION ALL SELECT '80202' FROM dual
      UNION ALL SELECT '85201' FROM dual
      UNION ALL SELECT '02720' FROM dual
      UNION ALL SELECT '55379' FROM dual
      UNION ALL SELECT '97060' FROM dual
      UNION ALL SELECT '37087' FROM dual
      UNION ALL SELECT '94538' FROM dual
      UNION ALL SELECT '48174' FROM dual
      UNION ALL SELECT '19709' FROM dual
      UNION ALL SELECT '77459' FROM dual
      UNION ALL SELECT '84084' FROM dual
      UNION ALL SELECT '28027' FROM dual
      UNION ALL SELECT '46168' FROM dual
      UNION ALL SELECT '89030' FROM dual
      UNION ALL SELECT '66111' FROM dual
      UNION ALL SELECT '43018' FROM dual
      UNION ALL SELECT '89431' FROM dual
      UNION ALL SELECT '33510' FROM dual
      UNION ALL SELECT '21001' FROM dual
      UNION ALL SELECT '78130' FROM dual
      UNION ALL SELECT '38654' FROM dual
      UNION ALL SELECT '96707' FROM dual
      UNION ALL SELECT '99501' FROM dual
    ) m
    WHERE m.postal_code = fc.postal_code
  );
  v_hotel_rows := SQL%ROWCOUNT;

  EXECUTE IMMEDIATE q'[
    ALTER TABLE fulfillment_centers ADD CONSTRAINT chk_fulfillment_center_type
    CHECK (center_type IN ('Full-Service Hotel','Convention Hotel','Select-Service Hotel','Resort Property','Extended-Stay Hotel','Partner Property'))
  ]';

  COMMIT;
  DBMS_OUTPUT.PUT_LINE('Updated property rows: ' || v_hotel_rows);
  DBMS_OUTPUT.PUT_LINE('Updated brand rows: ' || v_brand_rows);
END;
/

SELECT center_type, COUNT(*) AS row_count
FROM fulfillment_centers
GROUP BY center_type
ORDER BY center_type;
