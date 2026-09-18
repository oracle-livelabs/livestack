/*
 * Populate Oracle Spatial point geometry after demo or imported rows exist.
 *
 * The spatial schema is created before the base demo dataset is loaded, so the
 * original schema-time updates cannot populate rows that have not been inserted
 * yet. This idempotent hydration step keeps the existing spatial and optimal-
 * fulfillment scenes usable after a fresh container bootstrap.
 */

SET SERVEROUTPUT ON
SET DEFINE OFF

BEGIN
  UPDATE fulfillment_centers
     SET location = SDO_GEOMETRY(
       2001,
       4326,
       SDO_POINT_TYPE(longitude, latitude, NULL),
       NULL,
       NULL
     )
   WHERE latitude IS NOT NULL
     AND longitude IS NOT NULL
     AND location IS NULL;

  DBMS_OUTPUT.PUT_LINE(SQL%ROWCOUNT || ' fulfillment center locations backfilled.');

  UPDATE guests
     SET location = SDO_GEOMETRY(
       2001,
       4326,
       SDO_POINT_TYPE(longitude, latitude, NULL),
       NULL,
       NULL
     )
   WHERE latitude IS NOT NULL
     AND longitude IS NOT NULL
     AND location IS NULL;

  DBMS_OUTPUT.PUT_LINE(SQL%ROWCOUNT || ' guest locations backfilled.');

  COMMIT;
END;
/
