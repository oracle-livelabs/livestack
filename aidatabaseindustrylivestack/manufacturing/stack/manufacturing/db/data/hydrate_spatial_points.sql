/*
 * Hydrate Oracle Spatial point geometry after centers and customers exist.
 * Order and shipment generation depends on these points for real distances.
 */

SET SERVEROUTPUT ON
PROMPT Hydrating plant and customer Oracle Spatial points...

UPDATE fulfillment_centers
SET location = SDO_GEOMETRY(
    2001,
    4326,
    SDO_POINT_TYPE(longitude, latitude, NULL),
    NULL,
    NULL
)
WHERE latitude IS NOT NULL
  AND longitude IS NOT NULL;

UPDATE customers
SET location = SDO_GEOMETRY(
    2001,
    4326,
    SDO_POINT_TYPE(longitude, latitude, NULL),
    NULL,
    NULL
)
WHERE latitude IS NOT NULL
  AND longitude IS NOT NULL;

DECLARE
    v_center_diminfo     MDSYS.SDO_DIM_ARRAY;
    v_customer_diminfo   MDSYS.SDO_DIM_ARRAY;
    v_expected_centers   PLS_INTEGER;
    v_hydrated_centers   PLS_INTEGER;
    v_expected_customers PLS_INTEGER;
    v_hydrated_customers PLS_INTEGER;
    v_invalid_customer_coordinates PLS_INTEGER;
BEGIN
    SELECT diminfo
    INTO v_center_diminfo
    FROM user_sdo_geom_metadata
    WHERE table_name = 'FULFILLMENT_CENTERS'
      AND column_name = 'LOCATION'
      AND srid = 4326;

    SELECT diminfo
    INTO v_customer_diminfo
    FROM user_sdo_geom_metadata
    WHERE table_name = 'CUSTOMERS'
      AND column_name = 'LOCATION'
      AND srid = 4326;

    SELECT COUNT(*)
    INTO v_expected_centers
    FROM fulfillment_centers;

    SELECT COUNT(*)
    INTO v_hydrated_centers
    FROM fulfillment_centers fc
    WHERE fc.location IS NOT NULL
      AND fc.location.sdo_gtype = 2001
      AND fc.location.sdo_srid = 4326
      AND ABS(fc.location.sdo_point.x - fc.longitude) <= 0.000000001
      AND ABS(fc.location.sdo_point.y - fc.latitude) <= 0.000000001
      AND SDO_GEOM.VALIDATE_GEOMETRY_WITH_CONTEXT(
            fc.location,
            v_center_diminfo
          ) = 'TRUE';

    SELECT COUNT(*)
    INTO v_expected_customers
    FROM customers
    WHERE latitude IS NOT NULL
      AND longitude IS NOT NULL;

    SELECT COUNT(*)
    INTO v_invalid_customer_coordinates
    FROM customers
    WHERE (latitude IS NULL AND longitude IS NOT NULL)
       OR (latitude IS NOT NULL AND longitude IS NULL)
       OR latitude < -90
       OR latitude > 90
       OR longitude < -180
       OR longitude > 180;

    SELECT COUNT(*)
    INTO v_hydrated_customers
    FROM customers c
    WHERE c.location IS NOT NULL
      AND c.location.sdo_gtype = 2001
      AND c.location.sdo_srid = 4326
      AND ABS(c.location.sdo_point.x - c.longitude) <= 0.000000001
      AND ABS(c.location.sdo_point.y - c.latitude) <= 0.000000001
      AND SDO_GEOM.VALIDATE_GEOMETRY_WITH_CONTEXT(
            c.location,
            v_customer_diminfo
          ) = 'TRUE';

    IF v_expected_centers = 0 OR v_hydrated_centers <> v_expected_centers THEN
        RAISE_APPLICATION_ERROR(
            -20083,
            'Plant Spatial points must all be valid WGS84 points matching longitude/latitude'
        );
    END IF;

    IF v_invalid_customer_coordinates <> 0
       OR v_hydrated_customers <> v_expected_customers THEN
        RAISE_APPLICATION_ERROR(
            -20084,
            'Customer Spatial points must all be valid WGS84 points matching longitude/latitude'
        );
    END IF;

    DBMS_OUTPUT.PUT_LINE('Plant Spatial points hydrated: ' || v_hydrated_centers);
    DBMS_OUTPUT.PUT_LINE('Geocoded customer Spatial points hydrated: ' || v_hydrated_customers);
END;
/
