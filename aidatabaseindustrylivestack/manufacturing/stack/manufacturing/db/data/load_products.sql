/*
 * load_products.sql
 * Manufacturing parts, product lines, capacity slots, and component inventory
 * Uses PL/SQL to generate volume with variety
 */

SET SERVEROUTPUT ON
PROMPT Loading manufactured parts and capacity items...

DECLARE
    TYPE t_prod IS RECORD (
        bslug VARCHAR2(100),
        pname VARCHAR2(300),
        cat   VARCHAR2(100),
        subcat VARCHAR2(100),
        price NUMBER(10,2),
        cost  NUMBER(10,2),
        wt    NUMBER(8,3),
        tags  VARCHAR2(1000)
    );
    TYPE t_prod_arr IS TABLE OF t_prod;
    v_prods t_prod_arr := t_prod_arr();
    v_brand_id NUMBER;
    v_sku VARCHAR2(50);
    v_idx NUMBER := 0;

    PROCEDURE add_prod(p_slug VARCHAR2, p_name VARCHAR2, p_cat VARCHAR2, p_sub VARCHAR2,
                       p_price NUMBER, p_cost NUMBER, p_wt NUMBER, p_tags VARCHAR2) IS
        v_rec t_prod;
    BEGIN
        v_rec.bslug := p_slug; v_rec.pname := p_name; v_rec.cat := p_cat;
        v_rec.subcat := p_sub; v_rec.price := p_price; v_rec.cost := p_cost;
        v_rec.wt := p_wt; v_rec.tags := p_tags;
        v_prods.EXTEND; v_prods(v_prods.COUNT) := v_rec;
    END;
BEGIN
    -- Manufacturing product lines, parts, tooling, and production capacity offers
    add_prod('apexautomation','Servo Drive Controller AX-400','Industrial Automation','Motion Control',1280,620,3.8,'servo,drive,controller,motion-control');
    add_prod('apexautomation','Robotic Palletizer Control Cabinet','Industrial Automation','Robotics',18400,9100,280,'robotics,palletizer,control-cabinet,automation');
    add_prod('apexautomation','Predictive Maintenance Sensor Pack','Industrial Automation','Condition Monitoring',740,310,1.6,'sensor,maintenance,vibration,iiot');
    add_prod('circuitforge','Industrial Gateway PCB Assembly','Electronics','PCB Assembly',92,41,0.18,'pcb,gateway,assembly,smt');
    add_prod('circuitforge','Ruggedized Edge Compute Module','Electronics','Edge Compute',680,325,1.2,'edge-compute,rugged,controller,module');
    add_prod('circuitforge','Power Regulation Board','Electronics','Power Electronics',145,66,0.32,'power,regulator,board,electronics');
    add_prod('motorworks','EV Motor Stator Assembly','Mobility Components','Electric Drive',1460,720,18.5,'ev,stator,motor,assembly');
    add_prod('motorworks','Torque Sensor Housing','Mobility Components','Sensors',210,92,1.1,'torque,sensor,housing,cnc');
    add_prod('motorworks','Thermal Management Manifold','Mobility Components','Thermal',390,175,2.8,'thermal,manifold,cooling,mobility');
    add_prod('precisioncast','CNC Machined Pump Impeller','Metal Fabrication','Machining',275,118,2.4,'cnc,impeller,pump,metal');
    add_prod('precisioncast','Investment Cast Valve Body','Metal Fabrication','Casting',520,230,6.8,'casting,valve,body,alloy');
    add_prod('precisioncast','Welded Structural Bracket Set','Metal Fabrication','Welding',185,78,4.2,'welded,bracket,structural,fabrication');
    add_prod('nordictools','High-Precision Drill Fixture','Machine Tools','Tooling',980,410,8.5,'fixture,drill,tooling,precision');
    add_prod('nordictools','Modular CNC Workholding Kit','Machine Tools','Workholding',1250,540,12.3,'cnc,workholding,fixture,kit');
    add_prod('nordictools','Line Changeover Gauge Set','Machine Tools','Quality Tooling',360,145,2.1,'gauge,changeover,quality,tooling');
    add_prod('roboflex','Collaborative Assembly Cell Slot','Flexible Assembly','Assembly Capacity',5200,2600,0.001,'cobot,assembly,capacity,line-slot');
    add_prod('roboflex','Vision Inspection Station','Flexible Assembly','Quality Automation',8900,4300,95,'vision,inspection,quality,automation');
    add_prod('roboflex','End-of-Arm Tooling Adapter','Flexible Assembly','Robotics Tooling',430,175,2.6,'robot,tooling,adapter,eoat');
    add_prod('pacificsensors','Temperature Sensor Node','Industrial IoT','Sensors',74,28,0.22,'temperature,sensor,node,iiot');
    add_prod('pacificsensors','Vibration Analytics Gateway','Industrial IoT','Condition Monitoring',620,285,1.9,'vibration,analytics,gateway,maintenance');
    add_prod('pacificsensors','Line Utilization Beacon','Industrial IoT','Production Telemetry',110,44,0.35,'line-utilization,beacon,telemetry');
    add_prod('quantumplastics','Injection Molded Gear Housing','Injection Molding','Polymer Parts',132,52,0.8,'injection-molding,gear,housing,polymer');
    add_prod('quantumplastics','Industrial-Grade Enclosure Shell','Injection Molding','Enclosures',98,39,0.5,'enclosure,shell,molded,polymer');
    add_prod('summitsupply','Bearing and Seal Maintenance Kit','MRO Supply','Maintenance Kit',260,108,3.2,'bearing,seal,mro,maintenance');
    add_prod('summitsupply','Safety Stock Replenishment Bundle','MRO Supply','Inventory Bundle',475,210,7.5,'safety-stock,replenishment,mro,bundle');
    add_prod('alloyworks','Lightweight Aluminum Extrusion','Advanced Materials','Extrusions',340,150,5.4,'aluminum,extrusion,lightweight,materials');
    add_prod('alloyworks','Nickel Alloy Heat Shield','Advanced Materials','Thermal Shielding',720,330,4.7,'nickel,alloy,heat-shield,thermal');
    add_prod('titanparts','Hydraulic Actuator Repair Kit','Aftermarket Parts','Hydraulics',390,165,6.3,'hydraulic,actuator,repair,aftermarket');
    add_prod('titanparts','Field Service Spare Parts Pack','Aftermarket Parts','Service Parts',580,240,9.5,'field-service,spare-parts,aftermarket');
    add_prod('greenpack','Recyclable Protective Packaging Insert','Packaging Materials','Protective Packaging',46,19,0.28,'recyclable,packaging,insert,materials');
    add_prod('greenpack','Returnable Dunnage Tray','Packaging Materials','Returnable Packaging',88,36,1.4,'dunnage,tray,returnable,packaging');

    FOR i IN 1..v_prods.COUNT LOOP
        BEGIN
            SELECT brand_id INTO v_brand_id
            FROM brands
            WHERE brand_slug = v_prods(i).bslug;

            v_idx := v_idx + 1;
            v_sku := UPPER(SUBSTR(v_prods(i).bslug, 1, 3)) || '-' ||
                     LPAD(v_idx, 5, '0');

            INSERT INTO products (brand_id, sku, product_name, category, subcategory,
                                  unit_price, unit_cost, weight_kg, tags, launch_date)
            VALUES (v_brand_id, v_sku, v_prods(i).pname, v_prods(i).cat, v_prods(i).subcat,
                    v_prods(i).price, v_prods(i).cost, v_prods(i).wt, v_prods(i).tags,
                    SYSDATE - DBMS_RANDOM.VALUE(30, 730));
        EXCEPTION
            WHEN DUP_VAL_ON_INDEX THEN NULL;  -- skip dupes
        END;
    END LOOP;

    COMMIT;
    DBMS_OUTPUT.PUT_LINE('Manufactured part records loaded: ' || v_idx);
END;
/

-- ============================================================
-- GENERATE CAPACITY / SUPPLY LEVELS (each part stocked at 5-12 plants)
-- ============================================================
PROMPT Generating production capacity and component inventory levels...

DECLARE
    v_count                    NUMBER := 0;
    v_num_centers              NUMBER;
    v_calibration_stock_count  NUMBER;
BEGIN
    SAVEPOINT manufacturing_inventory_load;

    FOR p IN (SELECT product_id FROM products) LOOP
        v_num_centers := FLOOR(DBMS_RANDOM.VALUE(5, 13));
        FOR c IN (
            SELECT center_id FROM (
                SELECT center_id FROM fulfillment_centers
                ORDER BY DBMS_RANDOM.VALUE
            ) WHERE ROWNUM <= v_num_centers
        ) LOOP
            BEGIN
                INSERT INTO inventory (product_id, center_id, quantity_on_hand,
                                       quantity_reserved, reorder_point, reorder_qty,
                                       last_restock_date)
                VALUES (p.product_id, c.center_id,
                        FLOOR(DBMS_RANDOM.VALUE(10, 500)),
                        FLOOR(DBMS_RANDOM.VALUE(0, 30)),
                        FLOOR(DBMS_RANDOM.VALUE(20, 100)),
                        FLOOR(DBMS_RANDOM.VALUE(100, 500)),
                        SYSDATE - DBMS_RANDOM.VALUE(1, 30));
                v_count := v_count + 1;
            EXCEPTION
                WHEN DUP_VAL_ON_INDEX THEN NULL;
            END;
        END LOOP;
    END LOOP;

    -- This real stock row gives both the gateway part and Pacific Sensor
    -- supplier deterministic California graph access through Seattle.
    MERGE INTO inventory target
    USING (
        SELECT p.product_id,
               fc.center_id
        FROM brands b
        JOIN products p
          ON p.brand_id = b.brand_id
         AND p.product_name = 'Vibration Analytics Gateway'
        CROSS JOIN fulfillment_centers fc
        WHERE b.brand_slug = 'pacificsensors'
          AND fc.center_name = 'Seattle Sensor Calibration Cell'
    ) source
    ON (
        target.product_id = source.product_id
        AND target.center_id = source.center_id
    )
    WHEN NOT MATCHED THEN INSERT (
        product_id,
        center_id,
        quantity_on_hand,
        quantity_reserved,
        quantity_incoming,
        reorder_point,
        reorder_qty,
        last_restock_date
    ) VALUES (
        source.product_id,
        source.center_id,
        250,
        25,
        50,
        75,
        250,
        TRUNC(SYSDATE) - 1
    );

    v_count := v_count + SQL%ROWCOUNT;

    SELECT COUNT(*)
    INTO v_calibration_stock_count
    FROM inventory i
    JOIN products p
      ON p.product_id = i.product_id
    JOIN brands b
      ON b.brand_id = p.brand_id
    JOIN fulfillment_centers fc
      ON fc.center_id = i.center_id
    WHERE b.brand_slug = 'pacificsensors'
      AND p.product_name = 'Vibration Analytics Gateway'
      AND fc.center_name = 'Seattle Sensor Calibration Cell';

    IF v_calibration_stock_count <> 1 THEN
        RAISE_APPLICATION_ERROR(
            -20082,
            'Seattle calibration inventory seed must resolve to exactly one product-center row'
        );
    END IF;

    DBMS_OUTPUT.PUT_LINE('Capacity records loaded: ' || v_count);
    DBMS_OUTPUT.PUT_LINE('Seattle calibration inventory anchors loaded: ' || v_calibration_stock_count);
    COMMIT;
EXCEPTION
    WHEN OTHERS THEN
        ROLLBACK TO manufacturing_inventory_load;
        RAISE;
END;
/
