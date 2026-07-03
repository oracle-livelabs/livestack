/*
 * 02_json_collections.sql
 * JSON Document Store, event streams, and JSON Duality Views
 * Oracle 26ai — native JSON Duality Views & SODA collections
 */

-- ============================================================
-- Production-signal source data is stored directly in
-- MANUFACTURING_PRODUCTION_SIGNALS. There is no compatibility payload table.

-- ============================================================
-- PRODUCT CATALOG EXTENDED (JSON flexible attributes)
-- Allows different product categories to have different attribute shapes
-- ============================================================
CREATE TABLE product_attributes (
    attr_id       NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    product_id    NUMBER NOT NULL REFERENCES products(product_id),
    attributes    JSON NOT NULL,
    created_at    TIMESTAMP DEFAULT SYSTIMESTAMP,
    CONSTRAINT uq_prod_attr UNIQUE (product_id)
);

CREATE SEARCH INDEX idx_prodattr_json ON product_attributes(attributes)
    FOR JSON;

-- ============================================================
-- EVENT STREAM (append-only log of system events as JSON)
-- Used by agents to observe and react
-- ============================================================
CREATE TABLE event_stream (
    event_id      NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    event_type    VARCHAR2(100) NOT NULL,
    event_source  VARCHAR2(100),
    event_data    JSON NOT NULL,
    correlation_id VARCHAR2(100),
    processed     NUMBER(1) DEFAULT 0,
    region_code   VARCHAR2(2),
    created_at    TIMESTAMP DEFAULT SYSTIMESTAMP
);

CREATE INDEX idx_events_type      ON event_stream(event_type);
CREATE INDEX idx_events_processed ON event_stream(processed, created_at);
CREATE INDEX idx_events_corr      ON event_stream(correlation_id);

-- ============================================================
-- JSON DUALITY VIEW: Manufacturing work-order documents
-- ============================================================
CREATE OR REPLACE JSON RELATIONAL DUALITY VIEW manufacturing_work_order_documents_dv AS
SELECT JSON {
    '_id'         : o.work_order_id, -- required root-level PK field
    'workOrderCode' : o.work_order_code,
    'customerAccountId' : o.customer_account_id,
    'workOrderStatusCode': o.work_order_status_code,
    'workOrderValue'     : o.work_order_value,
    'routingCost'        : o.routing_cost,
    'assignedPlantId'    : o.assigned_plant_id,
    'demandUrgencyScore' : o.demand_urgency_score,
    'targetCompletionDate': o.target_completion_date,
    'actualCompletionDate': o.actual_completion_date,
    'productionSignalId'  : o.production_signal_id,
    'createdAt'            : o.created_at,
    'updatedAt'            : o.updated_at,
    'workOrderLines' : [
        SELECT JSON {
            'workOrderLineId'  : oi.work_order_line_id,
            'manufacturedPartId': oi.manufactured_part_id,
            'assignedPlantId'   : oi.assigned_plant_id,
            'requestedUnits'    : oi.requested_units,
            'plannedUnitValue'  : oi.planned_unit_value
        }
        FROM manufacturing_work_order_lines oi
        WHERE oi.work_order_id = o.work_order_id
    ]
}
FROM manufacturing_work_orders o;

-- ============================================================
-- JSON DUALITY VIEW: Products with inventory
-- ============================================================
CREATE OR REPLACE JSON RELATIONAL DUALITY VIEW products_inventory_dv AS
SELECT JSON {
    '_id'          : p.product_id,    -- required root-level PK field
    'sku'          : p.sku,
    'productName'  : p.product_name,
    'category'     : p.category,
    'unitPrice'    : p.unit_price,
    'brand'        : (
        SELECT JSON {
            'brandId'   : b.brand_id,
            'brandName' : b.brand_name
        }
        FROM brands b
        WHERE b.brand_id = p.brand_id
    ),
    'inventory'    : [
        SELECT JSON {
            'inventoryId'    : i.inventory_id,
            'centerId'        : i.center_id,
            'plant'           : (
                SELECT JSON {
                    'centerId'     : fc.center_id,
                    'centerName'   : fc.center_name,
                    'region'       : fc.state_province,
                    'facilityType' : fc.center_type
                }
                FROM fulfillment_centers fc
                WHERE fc.center_id = i.center_id
            ),
            'quantityOnHand'  : i.quantity_on_hand,
            'quantityReserved': i.quantity_reserved
        }
        FROM inventory i
        WHERE i.product_id = p.product_id
    ]
}
FROM products p;

-- ============================================================
-- DOMAIN JSON DUALITY VIEW: Manufactured part and plant capacity
-- Read-only by design. Every nested object carries its relational key.
-- ============================================================
CREATE OR REPLACE JSON RELATIONAL DUALITY VIEW manufactured_part_capacity_dv AS
SELECT JSON {
    '_id'                 : p.product_id,
    'partCode'            : p.sku,
    'partName'            : p.product_name,
    'description'         : p.description,
    'partCategory'        : p.category,
    'partSubcategory'     : p.subcategory,
    'plannedUnitValue'    : p.unit_price,
    'standardUnitCost'    : p.unit_cost,
    'weightKg'            : p.weight_kg,
    'active'              : p.is_active,
    'launchDate'          : p.launch_date,
    'productLine'         : (
        SELECT JSON {
            'productLineId'    : b.brand_id,
            'productLineName'  : b.brand_name,
            'category'         : b.brand_category,
            'headquartersCity' : b.headquarters_city
        }
        FROM brands b
        WHERE b.brand_id = p.brand_id
    ),
    'plantCapacity'       : [
        SELECT JSON {
            'capacityRecordId'       : i.inventory_id,
            'plantId'                : i.center_id,
            'plant'                  : (
                SELECT JSON {
                    'plantId'      : fc.center_id,
                    'plantName'    : fc.center_name,
                    'siteTypeCode' : fc.center_type,
                    'city'         : fc.city,
                    'region'       : fc.state_province,
                    'country'      : fc.country,
                    'active'       : fc.is_active
                }
                FROM fulfillment_centers fc
                WHERE fc.center_id = i.center_id
            ),
            'capacityUnitsOnHand'     : i.quantity_on_hand,
            'capacityUnitsReserved'   : i.quantity_reserved,
            'capacityUnitsIncoming'   : i.quantity_incoming,
            'availableToPromiseUnits' : GENERATED USING (
                GREATEST(NVL(i.quantity_on_hand, 0) - NVL(i.quantity_reserved, 0), 0)
            ),
            'reorderPointUnits'       : i.reorder_point,
            'replenishmentLotUnits'   : i.reorder_qty,
            'lastRestockedAt'         : i.last_restock_date,
            'updatedAt'               : i.updated_at
        }
        FROM inventory i
        WHERE i.product_id = p.product_id
    ]
}
FROM products p;

-- ============================================================
-- DOMAIN JSON DUALITY VIEW: Manufacturing plant capacity
-- ============================================================
CREATE OR REPLACE JSON RELATIONAL DUALITY VIEW manufacturing_plant_capacity_dv AS
SELECT JSON {
    '_id'                : fc.center_id,
    'plantName'          : fc.center_name,
    'siteTypeCode'       : fc.center_type,
    'addressLine1'       : fc.address_line1,
    'city'               : fc.city,
    'region'             : fc.state_province,
    'postalCode'         : fc.postal_code,
    'country'            : fc.country,
    'latitude'           : fc.latitude,
    'longitude'          : fc.longitude,
    'ratedCapacityUnits' : fc.capacity_units,
    'currentLoadPercent' : fc.current_load_pct,
    'operatingHours'     : fc.operating_hours,
    'active'             : fc.is_active,
    'partCapacity'       : [
        SELECT JSON {
            'capacityRecordId'       : i.inventory_id,
            'plantId'                : i.center_id,
            'capacityUnitsOnHand'     : i.quantity_on_hand,
            'capacityUnitsReserved'   : i.quantity_reserved,
            'capacityUnitsIncoming'   : i.quantity_incoming,
            'availableToPromiseUnits' : GENERATED USING (
                GREATEST(NVL(i.quantity_on_hand, 0) - NVL(i.quantity_reserved, 0), 0)
            ),
            'reorderPointUnits'       : i.reorder_point,
            'replenishmentLotUnits'   : i.reorder_qty,
            'lastRestockedAt'         : i.last_restock_date,
            'updatedAt'               : i.updated_at,
            'manufacturedPart'        : (
                SELECT JSON {
                    'partId'          : p.product_id,
                    'partCode'        : p.sku,
                    'partName'        : p.product_name,
                    'partCategory'    : p.category,
                    'partSubcategory' : p.subcategory,
                    'productLine'     : (
                        SELECT JSON {
                            'productLineId'   : b.brand_id,
                            'productLineName' : b.brand_name
                        }
                        FROM brands b
                        WHERE b.brand_id = p.brand_id
                    )
                }
                FROM products p
                WHERE p.product_id = i.product_id
            )
        }
        FROM inventory i
        WHERE i.center_id = fc.center_id
    ],
    'workOrders'          : [
        SELECT JSON {
            'workOrderId'          : o.work_order_id,
            'workOrderCode'        : o.work_order_code,
            'workOrderStatusCode'  : o.work_order_status_code,
            'workOrderValue'       : o.work_order_value,
            'demandUrgencyScore'   : o.demand_urgency_score,
            'targetCompletionDate' : o.target_completion_date,
            'createdAt'            : o.created_at
        }
        FROM manufacturing_work_orders o
        WHERE o.assigned_plant_id = fc.center_id
    ]
}
FROM fulfillment_centers fc;

COMMIT;

SELECT 'JSON collections and duality views created' AS status FROM dual;
