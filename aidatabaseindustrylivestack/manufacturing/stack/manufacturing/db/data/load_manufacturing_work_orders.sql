/*
 * load_manufacturing_work_orders.sql
 * 3000 work orders with part lines, varied statuses, and production-signal attribution
 */

SET SERVEROUTPUT ON
PROMPT Loading manufacturing work orders...

DECLARE
    v_min_cust NUMBER; v_max_cust NUMBER;
    v_min_prod NUMBER; v_max_prod NUMBER;
    v_min_post NUMBER; v_max_post NUMBER;
    v_min_center NUMBER; v_max_center NUMBER;
    v_cust_id NUMBER;
    v_order_id NUMBER;
    v_num_items NUMBER;
    v_prod_id NUMBER;
    v_price NUMBER;
    v_qty NUMBER;
    v_total NUMBER;
    v_status VARCHAR2(30);
    v_center_id NUMBER;
    v_social_id NUMBER;
    v_count NUMBER := 0;
    v_anchor_count NUMBER;
    v_total_order_count NUMBER;
    v_missing_order_code_count NUMBER;
    v_bad_milestone_count NUMBER;
    v_bad_route_metric_count NUMBER;
    v_distance NUMBER;
    v_est_hours NUMBER;
    v_shipped_at TIMESTAMP;
    v_delivered_at TIMESTAMP;

    TYPE t_str IS TABLE OF VARCHAR2(30);
    v_statuses t_str := t_str('planned','released','in_progress','dispatched','completed','completed','completed','cancelled');
BEGIN
    SAVEPOINT manufacturing_orders_load;

    SELECT MIN(customer_id), MAX(customer_id) INTO v_min_cust, v_max_cust FROM customers;
    SELECT MIN(product_id),  MAX(product_id)  INTO v_min_prod, v_max_prod FROM products;
    SELECT MIN(production_signal_id),     MAX(production_signal_id)     INTO v_min_post, v_max_post FROM manufacturing_production_signals;
    SELECT MIN(center_id),   MAX(center_id)   INTO v_min_center, v_max_center FROM fulfillment_centers;

    -- Seed the five domain anchors first so their stable work-order identities
    -- remain the lowest eligible order IDs selected by the graph refresh.
    FOR anchor IN (
        SELECT 'WO-4501' AS work_order_code,
               'apexautomation' AS brand_slug,
               'Servo Drive Controller AX-400' AS product_name,
               'Detroit Final Assembly Plant' AS center_name,
               96 AS demand_urgency_score
        FROM dual
        UNION ALL SELECT
               'WO-4520', 'motorworks', 'EV Motor Stator Assembly',
               'Dallas Mobility Components Plant', 89
        FROM dual
        UNION ALL SELECT
               'WO-4554', 'motorworks', 'Torque Sensor Housing',
               'Atlanta Flexible Assembly Hub', 91
        FROM dual
        UNION ALL SELECT
               'WO-4572', 'pacificsensors', 'Vibration Analytics Gateway',
               'Seattle Sensor Calibration Cell', 75
        FROM dual
        UNION ALL SELECT
               'WO-4599', 'summitsupply', 'Bearing and Seal Maintenance Kit',
               'Joliet Midwest Fabrication Center', 83
        FROM dual
    ) LOOP
        SELECT p.product_id,
               p.unit_price,
               fc.center_id
        INTO v_prod_id,
             v_price,
             v_center_id
        FROM brands b
        JOIN products p
          ON p.brand_id = b.brand_id
         AND p.product_name = anchor.product_name
        CROSS JOIN fulfillment_centers fc
        WHERE b.brand_slug = anchor.brand_slug
          AND fc.center_name = anchor.center_name;

        INSERT INTO manufacturing_work_orders (
            work_order_code,
            customer_account_id,
            work_order_status_code,
            work_order_value,
            routing_cost,
            assigned_plant_id,
            production_signal_id,
            demand_urgency_score,
            created_at
        ) VALUES (
            anchor.work_order_code,
            v_min_cust,
            'released',
            v_price,
            0,
            v_center_id,
            NULL,
            anchor.demand_urgency_score,
            SYSTIMESTAMP
        ) RETURNING work_order_id INTO v_order_id;

        INSERT INTO manufacturing_work_order_lines (
            work_order_id,
            manufactured_part_id,
            requested_units,
            planned_unit_value,
            assigned_plant_id
        ) VALUES (
            v_order_id,
            v_prod_id,
            1,
            v_price,
            v_center_id
        );

        v_count := v_count + 1;
    END LOOP;

    FOR i IN 1..2995 LOOP
        v_cust_id := v_min_cust + FLOOR(DBMS_RANDOM.VALUE(0, v_max_cust - v_min_cust + 1));
        v_status := v_statuses(MOD(i, v_statuses.COUNT) + 1);
        v_num_items := FLOOR(DBMS_RANDOM.VALUE(1, 6));
        v_total := 0;

        -- 30% of work orders are associated with a production or demand signal
        IF DBMS_RANDOM.VALUE < 0.3 THEN
            v_social_id := v_min_post + FLOOR(DBMS_RANDOM.VALUE(0, v_max_post - v_min_post + 1));
        ELSE
            v_social_id := NULL;
        END IF;

        -- Assign a plant for work orders that have progressed beyond planning.
        IF v_status != 'planned' THEN
            v_center_id := v_min_center + FLOOR(DBMS_RANDOM.VALUE(0, v_max_center - v_min_center + 1));
        ELSE
            v_center_id := NULL;
        END IF;

        INSERT INTO manufacturing_work_orders (
            work_order_code, customer_account_id, work_order_status_code, work_order_value, routing_cost,
            assigned_plant_id, production_signal_id, demand_urgency_score,
            created_at
        ) VALUES (
            'WO-' || LPAD(5000 + i, 8, '0'), v_cust_id, v_status, 0,
            CASE
                WHEN DBMS_RANDOM.VALUE < 0.3 THEN 0
                WHEN DBMS_RANDOM.VALUE < 0.7 THEN 7.99
                ELSE 14.99
            END,
            v_center_id,
            v_social_id,
            ROUND(DBMS_RANDOM.VALUE(10, 95), 2),
            SYSTIMESTAMP - NUMTODSINTERVAL(DBMS_RANDOM.VALUE(0, 60) * 24, 'HOUR')
        ) RETURNING work_order_id INTO v_order_id;

        -- Add requested parts and capacity allocations
        FOR j IN 1..v_num_items LOOP
            v_prod_id := v_min_prod + FLOOR(DBMS_RANDOM.VALUE(0, v_max_prod - v_min_prod + 1));
            v_qty := FLOOR(DBMS_RANDOM.VALUE(1, 4));

            BEGIN
                SELECT unit_price INTO v_price FROM products WHERE product_id = v_prod_id;

                INSERT INTO manufacturing_work_order_lines (
                    work_order_id, manufactured_part_id, requested_units,
                    planned_unit_value, assigned_plant_id
                )
                VALUES (v_order_id, v_prod_id, v_qty, v_price, v_center_id);

                v_total := v_total + (v_price * v_qty);
            EXCEPTION
                WHEN NO_DATA_FOUND THEN NULL;
                WHEN DUP_VAL_ON_INDEX THEN NULL;
            END;
        END LOOP;

        -- Update total work order value
        UPDATE manufacturing_work_orders SET work_order_value = v_total WHERE work_order_id = v_order_id;

        -- Create a routing record for dispatched or completed work orders.
        IF v_status IN ('dispatched', 'completed') AND v_center_id IS NOT NULL THEN
            -- Compute real distance using Oracle Spatial SDO_GEOM.SDO_DISTANCE (great-circle)
            -- For live queries, the backend uses SDO_GCDR.ELOC_ROUTE for actual driving distance/time
            SELECT SDO_GEOM.SDO_DISTANCE(
                       c.location, fc.location, 0.005, 'unit=MILE'
                   )
              INTO v_distance
              FROM customers c, fulfillment_centers fc
             WHERE c.customer_id = v_cust_id
               AND fc.center_id = v_center_id;

            -- Estimate routing hours using a simple distance proxy
            v_est_hours := CASE WHEN v_distance IS NOT NULL
                                THEN ROUND(v_distance / 55, 1)
                                ELSE NULL END;

            v_shipped_at := SYSTIMESTAMP
                            - NUMTODSINTERVAL(DBMS_RANDOM.VALUE(3, 10) * 24, 'HOUR');
            v_delivered_at := CASE v_status
                WHEN 'completed' THEN v_shipped_at
                                      + NUMTODSINTERVAL(DBMS_RANDOM.VALUE(4, 48), 'HOUR')
                ELSE NULL
            END;

            INSERT INTO shipments (
                work_order_id, center_id, carrier, tracking_number,
                ship_status, distance_km, estimated_hours, ship_cost,
                shipped_at, delivered_at
            ) VALUES (
                v_order_id, v_center_id,
                CASE MOD(i, 4)
                    WHEN 0 THEN 'PlantFleet'
                    WHEN 1 THEN 'ExpediteCarrier'
                    WHEN 2 THEN 'LineTransfer'
                    ELSE 'SupplierShuttle'
                END,
                'TRK' || LPAD(v_order_id, 12, '0'),
                CASE v_status WHEN 'completed' THEN 'delivered' ELSE 'in_transit' END,
                CASE WHEN v_distance IS NOT NULL THEN ROUND(v_distance * 1.60934, 2) ELSE NULL END,
                v_est_hours,
                ROUND(DBMS_RANDOM.VALUE(5, 25), 2),
                v_shipped_at,
                v_delivered_at
            );
        END IF;

        v_count := v_count + 1;
    END LOOP;

    SELECT COUNT(*)
    INTO v_anchor_count
    FROM (
        SELECT required_anchor.work_order_code
        FROM (
            SELECT 'WO-4501' AS work_order_code,
                   'apexautomation' AS brand_slug,
                   'Servo Drive Controller AX-400' AS product_name,
                   'Detroit Final Assembly Plant' AS center_name
            FROM dual
            UNION ALL SELECT
                   'WO-4520', 'motorworks', 'EV Motor Stator Assembly',
                   'Dallas Mobility Components Plant'
            FROM dual
            UNION ALL SELECT
                   'WO-4554', 'motorworks', 'Torque Sensor Housing',
                   'Atlanta Flexible Assembly Hub'
            FROM dual
            UNION ALL SELECT
                   'WO-4572', 'pacificsensors', 'Vibration Analytics Gateway',
                   'Seattle Sensor Calibration Cell'
            FROM dual
            UNION ALL SELECT
                   'WO-4599', 'summitsupply', 'Bearing and Seal Maintenance Kit',
                   'Joliet Midwest Fabrication Center'
            FROM dual
        ) required_anchor
        JOIN brands b
          ON b.brand_slug = required_anchor.brand_slug
        JOIN products p
          ON p.brand_id = b.brand_id
         AND p.product_name = required_anchor.product_name
        JOIN fulfillment_centers fc
          ON fc.center_name = required_anchor.center_name
        JOIN manufacturing_work_orders o
          ON o.work_order_code = required_anchor.work_order_code
         AND o.assigned_plant_id = fc.center_id
        JOIN manufacturing_work_order_lines oi
          ON oi.work_order_id = o.work_order_id
         AND oi.manufactured_part_id = p.product_id
         AND oi.assigned_plant_id = fc.center_id
        WHERE o.work_order_status_code = 'released'
          AND o.production_signal_id IS NULL
          AND oi.requested_units = 1
          AND oi.planned_unit_value = p.unit_price
          AND o.work_order_value = oi.requested_units * oi.planned_unit_value
          AND (
              SELECT COUNT(*)
              FROM manufacturing_work_order_lines anchor_item
              WHERE anchor_item.work_order_id = o.work_order_id
          ) = 1
          AND NOT EXISTS (
              SELECT 1
              FROM manufacturing_work_order_lines competing_item
              JOIN products competing_product
                ON competing_product.product_id = competing_item.manufactured_part_id
              WHERE competing_item.work_order_id = o.work_order_id
                AND competing_product.product_id <> p.product_id
                AND competing_product.product_name IN (
                    'Servo Drive Controller AX-400',
                    'EV Motor Stator Assembly',
                    'Torque Sensor Housing',
                    'Vibration Analytics Gateway',
                    'Bearing and Seal Maintenance Kit'
                )
          )
    );

    SELECT COUNT(*)
    INTO v_total_order_count
    FROM manufacturing_work_orders;

    SELECT COUNT(*)
    INTO v_missing_order_code_count
    FROM manufacturing_work_orders
    WHERE work_order_code IS NULL;

    IF v_count <> 3000 OR v_total_order_count <> 3000 THEN
        RAISE_APPLICATION_ERROR(
            -20080,
            'Manufacturing work-order load must produce exactly 3000 work orders'
        );
    END IF;

    IF v_missing_order_code_count <> 0 THEN
        RAISE_APPLICATION_ERROR(
            -20083,
            'Manufacturing work-order load must assign every work order a domain identifier'
        );
    END IF;

    IF v_anchor_count <> 5 THEN
        RAISE_APPLICATION_ERROR(
            -20081,
            'Manufacturing work-order load did not produce all five canonical graph anchors'
        );
    END IF;

    SELECT COUNT(*)
    INTO v_bad_milestone_count
    FROM shipments
    WHERE shipped_at IS NOT NULL
      AND delivered_at IS NOT NULL
      AND delivered_at < shipped_at;

    IF v_bad_milestone_count <> 0 THEN
        RAISE_APPLICATION_ERROR(
            -20082,
            'Manufacturing route load produced reversed shipment milestones'
        );
    END IF;

    SELECT COUNT(*)
    INTO v_bad_route_metric_count
    FROM shipments
    WHERE distance_km IS NULL
       OR estimated_hours IS NULL;

    IF v_bad_route_metric_count <> 0 THEN
        RAISE_APPLICATION_ERROR(
            -20085,
            'Manufacturing route load must retain Oracle Spatial distance and duration evidence'
        );
    END IF;

    DBMS_OUTPUT.PUT_LINE('Manufacturing work orders loaded: ' || v_count);
    DBMS_OUTPUT.PUT_LINE('Canonical graph work-order anchors loaded: ' || v_anchor_count);
    COMMIT;
EXCEPTION
    WHEN OTHERS THEN
        ROLLBACK TO manufacturing_orders_load;
        RAISE;
END;
/
