/*
 * Canonical read-only Media JSON Relational Duality views.
 *
 * Nested relationships are JSON objects with their relational keys. This
 * shape avoids the scalar correlated-subquery generator failure seen in the
 * legacy product view and is safe for VPD-filtered read execution.
 */
WHENEVER OSERROR EXIT FAILURE ROLLBACK
WHENEVER SQLERROR EXIT SQL.SQLCODE ROLLBACK
SET DEFINE OFF

CREATE OR REPLACE JSON RELATIONAL DUALITY VIEW orders_dv AS
SELECT JSON {
    '_id'         : orders_row.order_id,
    'customerId'  : orders_row.customer_id,
    'status'      : orders_row.order_status,
    'total'       : orders_row.order_total,
    'shippingCost': orders_row.shipping_cost,
    'demandScore' : orders_row.demand_score,
    'createdAt'   : orders_row.created_at,
    'items' : [
        SELECT JSON {
            'itemId'    : item.item_id,
            'productId' : item.product_id,
            'quantity'  : item.quantity,
            'unitPrice' : item.unit_price
        }
        FROM order_items item
        WHERE item.order_id = orders_row.order_id
    ]
}
FROM orders orders_row;

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

DECLARE
    v_product_docs PLS_INTEGER;
    v_order_docs PLS_INTEGER;
BEGIN
    SELECT COUNT(*) INTO v_product_docs
    FROM (SELECT data FROM products_inventory_dv FETCH FIRST 1 ROW ONLY);
    SELECT COUNT(*) INTO v_order_docs
    FROM (SELECT data FROM orders_dv FETCH FIRST 1 ROW ONLY);
    IF v_product_docs <> 1 OR v_order_docs <> 1 THEN
        RAISE_APPLICATION_ERROR(
          -20440,
          'Media native Duality execution returned no document'
        );
    END IF;
END;
/

PROMPT Media read-only JSON Relational Duality runtime views are executable.
