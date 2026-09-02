/*
 * 02_json_collections.sql
 * JSON Document Store, event streams, and JSON Duality Views
 * Oracle 26ai — native JSON Duality Views & SODA collections
 */

-- ============================================================
-- NOTE: social_post_payloads table removed from this demo.
-- Raw social post data is stored directly in social_posts.
-- The table definition is retained below (commented out) for
-- reference in case a future phase needs raw API payload storage.
-- ============================================================
-- CREATE TABLE social_post_payloads (
--     payload_id    NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
--     post_id       NUMBER NOT NULL REFERENCES social_posts(post_id),
--     platform      VARCHAR2(50) NOT NULL,
--     raw_payload   JSON NOT NULL,   -- native JSON type (26ai)
--     enrichments   JSON,            -- NLP, sentiment, entities extracted
--     created_at    TIMESTAMP DEFAULT SYSTIMESTAMP
-- );
-- CREATE INDEX idx_payload_post ON social_post_payloads(post_id);
-- CREATE SEARCH INDEX idx_payload_json ON social_post_payloads(raw_payload)
--     FOR JSON;

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
  '_id': o.order_id,
  'customerId': o.customer_id,
  'status': o.order_status,
  'total': o.order_total,
  'shippingCost': o.shipping_cost,
  'demandScore': o.demand_score,
  'createdAt': o.created_at,
  'items': [
    SELECT JSON {
      'itemId': i.item_id,
      'productId': i.product_id,
      'quantity': i.quantity,
      'unitPrice': i.unit_price
    }
    FROM order_items i
    WHERE i.order_id = o.order_id
  ]
}
FROM orders o;

-- ============================================================
-- JSON DUALITY VIEW: Products with inventory
-- ============================================================
CREATE OR REPLACE JSON RELATIONAL DUALITY VIEW products_inventory_dv AS
SELECT JSON {
  '_id': p.product_id,
  'sku': p.sku,
  'productName': p.product_name,
  'category': p.category,
  'unitPrice': p.unit_price,
  'brand': (
    SELECT JSON {
      'brandId': b.brand_id,
      'brandName': b.brand_name
    }
    FROM brands b
    WHERE b.brand_id = p.brand_id
  ),
  'inventory': [
    SELECT JSON {
      'inventoryId': i.inventory_id,
      'centerId': i.center_id,
      'center': (
        SELECT JSON {
          'centerId': c.center_id,
          'centerName': c.center_name,
          'region': c.state_province,
          'facilityType': c.center_type
        }
        FROM fulfillment_centers c
        WHERE c.center_id = i.center_id
      ),
      'quantityOnHand': i.quantity_on_hand,
      'quantityReserved': i.quantity_reserved
    }
    FROM inventory i
    WHERE i.product_id = p.product_id
  ]
}
FROM products p;

COMMIT;

SELECT 'JSON collections and duality views created' AS status FROM dual;
