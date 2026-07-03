/*
 * finalize_spatial_routes.sql
 * Materialize and validate shipment route metrics with Oracle Spatial.
 *
 * Run after customers, plants, work orders, and shipments are seeded.
 */

WHENEVER OSERROR EXIT FAILURE ROLLBACK
WHENEVER SQLERROR EXIT SQL.SQLCODE ROLLBACK
SET SERVEROUTPUT ON

PROMPT Finalizing manufacturing routes with Oracle Spatial...

MERGE INTO shipments target
USING (
    SELECT measured.shipment_id,
           ROUND(measured.distance_miles * 1.60934, 2) AS distance_km,
           ROUND(measured.distance_miles / 55, 1) AS estimated_hours
    FROM (
        SELECT shipment.shipment_id,
               SDO_GEOM.SDO_DISTANCE(
                   customer.location,
                   center.location,
                   0.005,
                   'unit=MILE'
               ) AS distance_miles
        FROM shipments shipment
        JOIN manufacturing_work_orders work_order
          ON work_order.work_order_id = shipment.work_order_id
        JOIN customers customer
          ON customer.customer_id = work_order.customer_account_id
        JOIN fulfillment_centers center
          ON center.center_id = shipment.center_id
    ) measured
) source
ON (target.shipment_id = source.shipment_id)
WHEN MATCHED THEN UPDATE SET
    target.distance_km = source.distance_km,
    target.estimated_hours = source.estimated_hours;

DECLARE
    v_route_count      PLS_INTEGER;
    v_verified_routes  PLS_INTEGER;
BEGIN
    SELECT COUNT(*)
    INTO v_route_count
    FROM shipments;

    SELECT COUNT(*)
    INTO v_verified_routes
    FROM (
        SELECT shipment.distance_km,
               shipment.estimated_hours,
               ROUND(measured.distance_miles * 1.60934, 2)
                   AS expected_distance_km,
               ROUND(measured.distance_miles / 55, 1)
                   AS expected_hours
        FROM shipments shipment
        JOIN manufacturing_work_orders work_order
          ON work_order.work_order_id = shipment.work_order_id
        JOIN customers customer
          ON customer.customer_id = work_order.customer_account_id
        JOIN fulfillment_centers center
          ON center.center_id = shipment.center_id
        CROSS APPLY (
            SELECT SDO_GEOM.SDO_DISTANCE(
                       customer.location,
                       center.location,
                       0.005,
                       'unit=MILE'
                   ) AS distance_miles
            FROM dual
        ) measured
    ) route
    WHERE route.distance_km IS NOT NULL
      AND route.estimated_hours IS NOT NULL
      AND route.distance_km = route.expected_distance_km
      AND route.estimated_hours = route.expected_hours;

    IF v_route_count = 0 OR v_verified_routes <> v_route_count THEN
        RAISE_APPLICATION_ERROR(
            -20122,
            'Every seeded manufacturing route must use Oracle Spatial SDO_DISTANCE'
        );
    END IF;

    DBMS_OUTPUT.PUT_LINE(
        'Oracle Spatial routes verified: ' || v_verified_routes
    );
END;
/
