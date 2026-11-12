/*
 * enrich_inventory_reservations.sql
 * Makes reserved capacity realistic across fulfillment sites.
 *
 * The generated gold seed gives every site for the same product the same
 * quantity_reserved value. That makes the dashboard detail modal look flat.
 * This repeat-safe enrichment derives reservations from product, site, stock
 * level, regional forecast pressure, and low-stock status.
 */

SET SERVEROUTPUT ON
SET DEFINE OFF

PROMPT Enriching PeakGear inventory reservations...

DECLARE
    v_updated NUMBER := 0;
BEGIN
    MERGE INTO inventory i
    USING (
        WITH regional_pressure AS (
            SELECT df.product_id,
                   CASE
                     WHEN UPPER(df.region) LIKE '%TEXAS%'
                       OR UPPER(df.region) LIKE '%DALLAS%'
                       OR UPPER(df.region) LIKE '%AUSTIN%'
                       OR UPPER(df.region) LIKE '%HOUSTON%' THEN 'TX'
                     WHEN UPPER(df.region) LIKE '%ARIZONA%'
                       OR UPPER(df.region) LIKE '%PHOENIX%' THEN 'AZ'
                     WHEN UPPER(df.region) LIKE '%WASHINGTON%'
                       OR UPPER(df.region) LIKE '%SEATTLE%'
                       OR UPPER(df.region) LIKE '%PACIFIC NORTHWEST%' THEN 'WA'
                     WHEN UPPER(df.region) LIKE '%ILLINOIS%'
                       OR UPPER(df.region) LIKE '%CHICAGO%'
                       OR UPPER(df.region) LIKE '%GREAT LAKES%' THEN 'IL'
                     WHEN UPPER(df.region) LIKE '%CAROLINA%'
                       OR UPPER(df.region) LIKE '%CHARLOTTE%' THEN 'NC'
                     WHEN UPPER(df.region) LIKE '%CALIFORNIA%'
                       OR UPPER(df.region) LIKE '%LOS ANGELES%'
                       OR UPPER(df.region) LIKE '%BAY AREA%' THEN 'CA'
                     WHEN UPPER(df.region) LIKE '%FLORIDA%'
                       OR UPPER(df.region) LIKE '%MIAMI%' THEN 'FL'
                     WHEN UPPER(df.region) LIKE '%GEORGIA%'
                       OR UPPER(df.region) LIKE '%ATLANTA%' THEN 'GA'
                     WHEN UPPER(df.region) LIKE '%COLORADO%'
                       OR UPPER(df.region) LIKE '%DENVER%'
                       OR UPPER(df.region) LIKE '%MOUNTAIN WEST%' THEN 'CO'
                     WHEN UPPER(df.region) LIKE '%NEW YORK%'
                       OR UPPER(df.region) LIKE '%NORTHEAST%' THEN 'NY'
                   END AS state_province,
                   ROUND(AVG(df.social_factor), 2) AS avg_social_factor,
                   ROUND(AVG(df.predicted_demand)) AS avg_predicted_demand
            FROM demand_forecasts df
            GROUP BY df.product_id,
                   CASE
                     WHEN UPPER(df.region) LIKE '%TEXAS%'
                       OR UPPER(df.region) LIKE '%DALLAS%'
                       OR UPPER(df.region) LIKE '%AUSTIN%'
                       OR UPPER(df.region) LIKE '%HOUSTON%' THEN 'TX'
                     WHEN UPPER(df.region) LIKE '%ARIZONA%'
                       OR UPPER(df.region) LIKE '%PHOENIX%' THEN 'AZ'
                     WHEN UPPER(df.region) LIKE '%WASHINGTON%'
                       OR UPPER(df.region) LIKE '%SEATTLE%'
                       OR UPPER(df.region) LIKE '%PACIFIC NORTHWEST%' THEN 'WA'
                     WHEN UPPER(df.region) LIKE '%ILLINOIS%'
                       OR UPPER(df.region) LIKE '%CHICAGO%'
                       OR UPPER(df.region) LIKE '%GREAT LAKES%' THEN 'IL'
                     WHEN UPPER(df.region) LIKE '%CAROLINA%'
                       OR UPPER(df.region) LIKE '%CHARLOTTE%' THEN 'NC'
                     WHEN UPPER(df.region) LIKE '%CALIFORNIA%'
                       OR UPPER(df.region) LIKE '%LOS ANGELES%'
                       OR UPPER(df.region) LIKE '%BAY AREA%' THEN 'CA'
                     WHEN UPPER(df.region) LIKE '%FLORIDA%'
                       OR UPPER(df.region) LIKE '%MIAMI%' THEN 'FL'
                     WHEN UPPER(df.region) LIKE '%GEORGIA%'
                       OR UPPER(df.region) LIKE '%ATLANTA%' THEN 'GA'
                     WHEN UPPER(df.region) LIKE '%COLORADO%'
                       OR UPPER(df.region) LIKE '%DENVER%'
                       OR UPPER(df.region) LIKE '%MOUNTAIN WEST%' THEN 'CO'
                     WHEN UPPER(df.region) LIKE '%NEW YORK%'
                       OR UPPER(df.region) LIKE '%NORTHEAST%' THEN 'NY'
                   END
        )
        SELECT i.inventory_id,
               LEAST(
                 GREATEST(i.quantity_on_hand - 1, 0),
                 ROUND(
                   LEAST(i.quantity_on_hand * 0.45,
                     MOD((i.product_id * 17) + (i.center_id * 11), 36)
                     + CASE WHEN rp.product_id IS NOT NULL THEN 8 ELSE 0 END
                     + CASE WHEN NVL(rp.avg_social_factor, 1) >= 1.4 THEN 7 ELSE 0 END
                     + CASE WHEN NVL(rp.avg_predicted_demand, 0) >= 120 THEN 6 ELSE 0 END
                     + CASE WHEN i.quantity_on_hand <= i.reorder_point THEN 5 ELSE 0 END
                   )
                 )
               ) AS quantity_reserved
        FROM inventory i
        JOIN fulfillment_centers fc ON fc.center_id = i.center_id
        LEFT JOIN regional_pressure rp
          ON rp.product_id = i.product_id
         AND rp.state_province = fc.state_province
    ) src
    ON (i.inventory_id = src.inventory_id)
    WHEN MATCHED THEN UPDATE
      SET i.quantity_reserved = src.quantity_reserved;

    v_updated := SQL%ROWCOUNT;
    COMMIT;

    DBMS_OUTPUT.PUT_LINE('Inventory reservation rows updated: ' || v_updated);
END;
/
