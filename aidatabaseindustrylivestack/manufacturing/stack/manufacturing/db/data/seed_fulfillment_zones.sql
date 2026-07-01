/*
 * Build four Oracle Spatial capacity-zone polygons around every active plant.
 * Point and polygon geometry is validated against registered layer DIMINFO.
 */

WHENEVER OSERROR EXIT FAILURE ROLLBACK
WHENEVER SQLERROR EXIT SQL.SQLCODE ROLLBACK
SET SERVEROUTPUT ON
PROMPT Rebuilding manufacturing capacity zones with Oracle Spatial...

DECLARE
    v_center_diminfo     MDSYS.SDO_DIM_ARRAY;
    v_active_centers     PLS_INTEGER;
    v_valid_centers      PLS_INTEGER;
BEGIN
    SELECT diminfo
    INTO v_center_diminfo
    FROM user_sdo_geom_metadata
    WHERE table_name = 'FULFILLMENT_CENTERS'
      AND column_name = 'LOCATION'
      AND srid = 4326;

    SELECT COUNT(*)
    INTO v_active_centers
    FROM fulfillment_centers
    WHERE is_active = 1;

    SELECT COUNT(*)
    INTO v_valid_centers
    FROM fulfillment_centers center
    WHERE center.is_active = 1
      AND center.location IS NOT NULL
      AND center.location.sdo_gtype = 2001
      AND center.location.sdo_srid = 4326
      AND ABS(center.location.sdo_point.x - center.longitude) <= 0.000000001
      AND ABS(center.location.sdo_point.y - center.latitude) <= 0.000000001
      AND SDO_GEOM.VALIDATE_GEOMETRY_WITH_CONTEXT(
            center.location,
            v_center_diminfo
          ) = 'TRUE';

    IF v_active_centers = 0 OR v_valid_centers <> v_active_centers THEN
        RAISE_APPLICATION_ERROR(
            -20086,
            'Capacity-zone generation requires valid WGS84 points for every active plant'
        );
    END IF;
END;
/

DELETE FROM fulfillment_zones;

INSERT INTO fulfillment_zones (center_id, zone_type, max_delivery_hrs, zone_boundary)
SELECT center_id, 'express', 8,
       SDO_GEOM.SDO_BUFFER(location, 80000, 1, 'unit=METER')
FROM fulfillment_centers
WHERE is_active = 1;

INSERT INTO fulfillment_zones (center_id, zone_type, max_delivery_hrs, zone_boundary)
SELECT center_id, 'overnight', 16,
       SDO_GEOM.SDO_BUFFER(location, 160000, 1, 'unit=METER')
FROM fulfillment_centers
WHERE is_active = 1;

INSERT INTO fulfillment_zones (center_id, zone_type, max_delivery_hrs, zone_boundary)
SELECT center_id, 'standard', 24,
       SDO_GEOM.SDO_BUFFER(location, 250000, 1, 'unit=METER')
FROM fulfillment_centers
WHERE is_active = 1;

INSERT INTO fulfillment_zones (center_id, zone_type, max_delivery_hrs, zone_boundary)
SELECT center_id, 'economy', 72,
       SDO_GEOM.SDO_BUFFER(location, 500000, 1, 'unit=METER')
FROM fulfillment_centers
WHERE is_active = 1;

DECLARE
    v_zone_diminfo          MDSYS.SDO_DIM_ARRAY;
    v_active_centers        PLS_INTEGER;
    v_expected_zones        PLS_INTEGER;
    v_valid_zones           PLS_INTEGER;
    v_complete_zone_centers PLS_INTEGER;
    v_inactive_zones        PLS_INTEGER;
BEGIN
    SELECT diminfo
    INTO v_zone_diminfo
    FROM user_sdo_geom_metadata
    WHERE table_name = 'FULFILLMENT_ZONES'
      AND column_name = 'ZONE_BOUNDARY'
      AND srid = 4326;

    SELECT COUNT(*)
    INTO v_active_centers
    FROM fulfillment_centers
    WHERE is_active = 1;
    v_expected_zones := v_active_centers * 4;

    SELECT COUNT(*)
    INTO v_valid_zones
    FROM fulfillment_zones zone
    JOIN fulfillment_centers center
      ON center.center_id = zone.center_id
     AND center.is_active = 1
    WHERE zone.zone_boundary IS NOT NULL
      AND zone.zone_boundary.sdo_gtype = 2003
      AND zone.zone_boundary.sdo_srid = 4326
      AND SDO_GEOM.VALIDATE_GEOMETRY_WITH_CONTEXT(
            zone.zone_boundary,
            v_zone_diminfo
          ) = 'TRUE'
      AND SDO_GEOM.RELATE(
            zone.zone_boundary,
            'EQUAL',
            SDO_GEOM.SDO_BUFFER(
                center.location,
                CASE zone.zone_type
                    WHEN 'express' THEN 80000
                    WHEN 'overnight' THEN 160000
                    WHEN 'standard' THEN 250000
                    WHEN 'economy' THEN 500000
                END,
                1,
                'unit=METER'
            ),
            0.005
          ) = 'EQUAL';

    SELECT COUNT(*)
    INTO v_complete_zone_centers
    FROM (
        SELECT zone.center_id
        FROM fulfillment_zones zone
        JOIN fulfillment_centers center
          ON center.center_id = zone.center_id
         AND center.is_active = 1
        GROUP BY zone.center_id
        HAVING COUNT(*) = 4
           AND COUNT(DISTINCT zone_type) = 4
           AND SUM(CASE
                 WHEN zone_type = 'express' AND max_delivery_hrs = 8 THEN 1
                 WHEN zone_type = 'overnight' AND max_delivery_hrs = 16 THEN 1
                 WHEN zone_type = 'standard' AND max_delivery_hrs = 24 THEN 1
                 WHEN zone_type = 'economy' AND max_delivery_hrs = 72 THEN 1
                 ELSE 0
               END) = 4
    );

    SELECT COUNT(*)
    INTO v_inactive_zones
    FROM fulfillment_zones zone
    JOIN fulfillment_centers center
      ON center.center_id = zone.center_id
    WHERE center.is_active <> 1;

    IF v_valid_zones <> v_expected_zones
       OR v_complete_zone_centers <> v_active_centers
       OR v_inactive_zones <> 0 THEN
        RAISE_APPLICATION_ERROR(
            -20087,
            'Every active plant must have four valid Oracle Spatial capacity-zone tiers'
        );
    END IF;

    DBMS_OUTPUT.PUT_LINE('Oracle Spatial capacity zones verified: ' || v_valid_zones);
END;
/

SELECT zone_type,
       COUNT(*) AS zone_count,
       MIN(max_delivery_hrs) AS min_hrs,
       MAX(max_delivery_hrs) AS max_hrs
FROM fulfillment_zones
GROUP BY zone_type
ORDER BY min_hrs;
