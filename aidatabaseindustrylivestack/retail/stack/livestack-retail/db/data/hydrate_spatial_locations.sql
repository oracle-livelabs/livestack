/*
 * Populate Spatial points after the retail fixtures are loaded. The base
 * spatial schema precedes fixture import, so its initial point update sees no
 * business rows on a fresh deployment.
 */
WHENEVER OSERROR EXIT FAILURE ROLLBACK
WHENEVER SQLERROR EXIT SQL.SQLCODE ROLLBACK

UPDATE fulfillment_centers
SET location = SDO_GEOMETRY(
  2001, 4326, SDO_POINT_TYPE(longitude, latitude, NULL), NULL, NULL
)
WHERE latitude IS NOT NULL
  AND longitude IS NOT NULL
  AND location IS NULL;

UPDATE customers
SET location = SDO_GEOMETRY(
  2001, 4326, SDO_POINT_TYPE(longitude, latitude, NULL), NULL, NULL
)
WHERE latitude IS NOT NULL
  AND longitude IS NOT NULL
  AND location IS NULL;

DECLARE
  v_center_missing NUMBER;
  v_customer_missing NUMBER;
BEGIN
  SELECT COUNT(*) INTO v_center_missing
  FROM fulfillment_centers
  WHERE location IS NULL;
  SELECT COUNT(*) INTO v_customer_missing
  FROM customers
  WHERE location IS NULL;
  IF v_center_missing <> 0 OR v_customer_missing <> 0 THEN
    RAISE_APPLICATION_ERROR(-20540, 'Retail Spatial point hydration is incomplete');
  END IF;
END;
/

COMMIT;
