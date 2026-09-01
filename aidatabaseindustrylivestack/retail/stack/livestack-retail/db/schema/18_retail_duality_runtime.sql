/* Canonical read-only Retail JSON Relational Duality views. */
WHENEVER OSERROR EXIT FAILURE ROLLBACK
WHENEVER SQLERROR EXIT SQL.SQLCODE ROLLBACK
SET DEFINE OFF

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
