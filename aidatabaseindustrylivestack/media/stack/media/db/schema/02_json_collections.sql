/*
 * 02_json_collections.sql
 * JSON Document Store, event streams, and JSON Duality Views
 * Oracle 26ai — native JSON Duality Views & SODA collections
 */

-- ============================================================
-- SOCIAL POST PAYLOADS (native JSON source and enrichment documents)
-- ============================================================
CREATE TABLE social_post_payloads (
    payload_id    NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    post_id       NUMBER NOT NULL REFERENCES social_posts(post_id),
    platform      VARCHAR2(50) NOT NULL,
    raw_payload   JSON NOT NULL,
    enrichments   JSON,
    created_at    TIMESTAMP DEFAULT SYSTIMESTAMP,
    CONSTRAINT uq_social_payload_post UNIQUE (post_id)
);
-- The unique constraint supplies the required post_id index. Creating another
-- index on the same column list raises ORA-01408 during fresh bootstrap.
CREATE SEARCH INDEX idx_payload_json ON social_post_payloads(raw_payload)
    FOR JSON;

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
    created_at    TIMESTAMP DEFAULT SYSTIMESTAMP
);

CREATE INDEX idx_events_type      ON event_stream(event_type);
CREATE INDEX idx_events_processed ON event_stream(processed, created_at);
CREATE INDEX idx_events_corr      ON event_stream(correlation_id);

-- ============================================================
-- JSON DUALITY VIEW: Orders (relational ↔ JSON)
-- Allows REST-style JSON access to relational order data
-- ============================================================
CREATE OR REPLACE JSON RELATIONAL DUALITY VIEW orders_dv AS
SELECT JSON {
    '_id'         : o.order_id,       -- required root-level PK field
    'customerId'  : o.customer_id,
    'status'      : o.order_status,
    'total'       : o.order_total,
    'shippingCost': o.shipping_cost,
    'demandScore' : o.demand_score,
    'createdAt'   : o.created_at,
    'items' : [
        SELECT JSON {
            'itemId'    : oi.item_id,
            'productId' : oi.product_id,
            'quantity'  : oi.quantity,
            'unitPrice' : oi.unit_price
        }
        FROM order_items oi
        WHERE oi.order_id = o.order_id
    ]
}
FROM orders o;

-- ============================================================
-- JSON DUALITY VIEW: Products with inventory
-- ============================================================
CREATE OR REPLACE JSON RELATIONAL DUALITY VIEW products_inventory_dv AS
SELECT JSON {
    '_id'          : product.product_id,
    'sku'          : product.sku,
    'productName'  : product.product_name,
    'category'     : product.category,
    'unitPrice'    : product.unit_price,
    'brand'        : (
        SELECT JSON {
            'brandId'   : brand.brand_id,
            'brandName' : brand.brand_name
        }
        FROM brands brand
        WHERE brand.brand_id = product.brand_id
    ),
    'inventory'    : [
        SELECT JSON {
            'inventoryId'    : inventory_row.inventory_id,
            'centerId'        : inventory_row.center_id,
            'center'          : (
                SELECT JSON {
                    'centerId'     : center.center_id,
                    'centerName'   : center.center_name,
                    'region'       : center.state_province,
                    'facilityType' : center.center_type
                }
                FROM fulfillment_centers center
                WHERE center.center_id = inventory_row.center_id
            ),
            'quantityOnHand'  : inventory_row.quantity_on_hand,
            'quantityReserved': inventory_row.quantity_reserved
        }
        FROM inventory inventory_row
        WHERE inventory_row.product_id = product.product_id
    ]
}
FROM products product;

COMMIT;

SELECT 'JSON collections and duality views created' AS status FROM dual;
