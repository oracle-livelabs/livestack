/*
 * Hydrate Oracle Spatial point geometry after field operations sites and care
 * sites exist. Nearest-site routing depends on these indexed points.
 */

SET SERVEROUTPUT ON
PROMPT Hydrating field operations and service-point Oracle Spatial points...

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
    v_center_diminfo             MDSYS.SDO_DIM_ARRAY;
    v_customer_diminfo           MDSYS.SDO_DIM_ARRAY;
    v_expected_centers           PLS_INTEGER;
    v_hydrated_centers           PLS_INTEGER;
    v_expected_customers         PLS_INTEGER;
    v_hydrated_customers         PLS_INTEGER;
    v_invalid_center_coordinates PLS_INTEGER;
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
    FROM fulfillment_centers
    WHERE latitude IS NOT NULL
      AND longitude IS NOT NULL;

    SELECT COUNT(*)
    INTO v_invalid_center_coordinates
    FROM fulfillment_centers
    WHERE (latitude IS NULL AND longitude IS NOT NULL)
       OR (latitude IS NOT NULL AND longitude IS NULL)
       OR latitude < -90
       OR latitude > 90
       OR longitude < -180
       OR longitude > 180;

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

    IF v_expected_centers = 0
       OR v_invalid_center_coordinates <> 0
       OR v_hydrated_centers <> v_expected_centers THEN
        RAISE_APPLICATION_ERROR(
            -20083,
            'Field operations Spatial points must all be valid WGS84 points matching longitude/latitude'
        );
    END IF;

    IF v_invalid_customer_coordinates <> 0
       OR v_hydrated_customers <> v_expected_customers THEN
        RAISE_APPLICATION_ERROR(
            -20084,
            'Service-point Spatial points must all be valid WGS84 points matching longitude/latitude'
        );
    END IF;

    DBMS_OUTPUT.PUT_LINE('Field operations Spatial points hydrated: ' || v_hydrated_centers);
    DBMS_OUTPUT.PUT_LINE('Geocoded service-point Spatial points hydrated: ' || v_hydrated_customers);
END;
/
