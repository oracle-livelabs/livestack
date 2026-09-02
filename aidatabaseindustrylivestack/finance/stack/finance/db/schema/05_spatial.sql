/*
 * 05_spatial.sql
 * Spatial objects for fulfillment routing and demand geography
 * Oracle 26ai — SDO_GEOMETRY, spatial indexes, routing functions
 */

-- ============================================================
-- ADD SDO_GEOMETRY COLUMNS
-- ============================================================

-- Branch service centers: location geometry
ALTER TABLE fulfillment_centers ADD (
    location SDO_GEOMETRY
);

-- Client LOCATION column is defined on the customers table in 01_tables.sql

-- ============================================================
-- POPULATE GEOMETRY FROM LAT/LON
-- ============================================================
UPDATE fulfillment_centers
SET location = SDO_GEOMETRY(
    2001,           -- point
    4326,           -- SRID: WGS84
    SDO_POINT_TYPE(longitude, latitude, NULL),
    NULL, NULL
)
WHERE latitude IS NOT NULL AND longitude IS NOT NULL;

UPDATE customers
SET location = SDO_GEOMETRY(
    2001, 4326,
    SDO_POINT_TYPE(longitude, latitude, NULL),
    NULL, NULL
)
WHERE latitude IS NOT NULL AND longitude IS NOT NULL;

COMMIT;

-- ============================================================
-- SPATIAL METADATA
-- ============================================================
INSERT INTO user_sdo_geom_metadata (TABLE_NAME, COLUMN_NAME, DIMINFO, SRID)
VALUES ('FULFILLMENT_CENTERS', 'LOCATION',
    SDO_DIM_ARRAY(
        SDO_DIM_ELEMENT('LON', -180, 180, 0.005),
        SDO_DIM_ELEMENT('LAT', -90, 90, 0.005)
    ), 4326);

INSERT INTO user_sdo_geom_metadata (TABLE_NAME, COLUMN_NAME, DIMINFO, SRID)
VALUES ('CUSTOMERS', 'LOCATION',
    SDO_DIM_ARRAY(
        SDO_DIM_ELEMENT('LON', -180, 180, 0.005),
        SDO_DIM_ELEMENT('LAT', -90, 90, 0.005)
    ), 4326);

COMMIT;

-- ============================================================
-- SPATIAL INDEXES
-- ============================================================
CREATE INDEX idx_fc_spatial ON fulfillment_centers(location)
    INDEXTYPE IS MDSYS.SPATIAL_INDEX_V2;

DECLARE
    v_idx_count NUMBER;
BEGIN
    SELECT COUNT(*)
      INTO v_idx_count
      FROM user_indexes
     WHERE table_name = 'CUSTOMERS'
       AND index_name = 'IDX_CUST_SPATIAL';

    IF v_idx_count = 0 THEN
        EXECUTE IMMEDIATE 'CREATE INDEX idx_cust_spatial ON customers(location) INDEXTYPE IS MDSYS.SPATIAL_INDEX_V2';
    END IF;
END;
/

-- ============================================================
-- FULFILLMENT ZONES (service area polygons)
-- ============================================================
CREATE TABLE fulfillment_zones (
    zone_id           NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    center_id         NUMBER NOT NULL REFERENCES fulfillment_centers(center_id),
    zone_type         VARCHAR2(30) DEFAULT 'standard'
                      CHECK (zone_type IN ('express','standard','economy','overnight')),
    max_delivery_hrs  NUMBER(5,1),
    zone_boundary     SDO_GEOMETRY,    -- polygon defining service area
    created_at        TIMESTAMP DEFAULT SYSTIMESTAMP
);

INSERT INTO user_sdo_geom_metadata (TABLE_NAME, COLUMN_NAME, DIMINFO, SRID)
VALUES ('FULFILLMENT_ZONES', 'ZONE_BOUNDARY',
    SDO_DIM_ARRAY(
        SDO_DIM_ELEMENT('LON', -180, 180, 0.005),
        SDO_DIM_ELEMENT('LAT', -90, 90, 0.005)
    ), 4326);

-- ============================================================
-- DEMAND HEATMAP REGIONS
-- ============================================================
CREATE TABLE demand_regions (
    region_id         NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    region_name       VARCHAR2(100) NOT NULL,
    region_type       VARCHAR2(30) DEFAULT 'metro'
                      CHECK (region_type IN ('metro','state','region','zip_cluster')),
    boundary          SDO_GEOMETRY,     -- polygon
    population        NUMBER(10),
    avg_income        NUMBER(10,2),
    social_density    NUMBER(8,2),      -- regulatory/market signals per 1000 population
    demand_index      NUMBER(5,2) DEFAULT 50,  -- 0-100
    updated_at        TIMESTAMP DEFAULT SYSTIMESTAMP
);

INSERT INTO user_sdo_geom_metadata (TABLE_NAME, COLUMN_NAME, DIMINFO, SRID)
VALUES ('DEMAND_REGIONS', 'BOUNDARY',
    SDO_DIM_ARRAY(
        SDO_DIM_ELEMENT('LON', -180, 180, 0.005),
        SDO_DIM_ELEMENT('LAT', -90, 90, 0.005)
    ), 4326);

-- ============================================================
-- SPATIAL ROUTING FUNCTION
-- Find the N nearest branch service centers to a client
-- that have the requested financial product available
-- ============================================================
CREATE OR REPLACE FUNCTION find_nearest_centers (
    p_customer_id   IN NUMBER,
    p_product_id    IN NUMBER,
    p_max_results   IN NUMBER DEFAULT 5
) RETURN SYS_REFCURSOR
AS
    v_results SYS_REFCURSOR;
BEGIN
    OPEN v_results FOR
        WITH candidates AS (
            SELECT fc.center_id,
                   fc.center_name,
                   fc.city,
                   fc.state_province,
                   fc.center_type,
                   fc.latitude,
                   fc.longitude,
                   i.quantity_on_hand,
                   SDO_GEOM.SDO_DISTANCE(
                       c.location,
                       fc.location,
                       0.005,
                       'unit=KM'
                   ) AS distance_km_raw
            FROM customers c
            CROSS JOIN fulfillment_centers fc
            JOIN inventory i ON fc.center_id = i.center_id
                            AND i.product_id = p_product_id
            WHERE c.customer_id = p_customer_id
              AND fc.is_active = 1
              AND i.quantity_on_hand > i.quantity_reserved
        )
        SELECT center_id,
               center_name,
               city,
               state_province,
               center_type,
               latitude,
               longitude,
               quantity_on_hand,
               ROUND(distance_km_raw, 2) AS distance_km,
               ROUND(distance_km_raw / 80, 1) AS estimated_hours
        FROM candidates
        ORDER BY distance_km_raw
        FETCH FIRST p_max_results ROWS ONLY;

    RETURN v_results;
END;
/

-- ============================================================
-- OPTIMAL FULFILLMENT: multi-item order routing
-- Finds best center(s) to fulfill an entire order,
-- balancing distance + inventory availability
-- ============================================================
CREATE OR REPLACE FUNCTION optimal_fulfillment (
    p_order_id      IN NUMBER,
    p_strategy      IN VARCHAR2 DEFAULT 'balanced'  -- 'nearest','capacity','balanced'
) RETURN SYS_REFCURSOR
AS
    v_results SYS_REFCURSOR;
BEGIN
    OPEN v_results FOR
        WITH order_context AS (
            SELECT o.order_id,
                   o.fulfillment_center_id AS current_center_id,
                   c.location AS customer_location
            FROM orders o
            JOIN customers c ON c.customer_id = o.customer_id
            WHERE o.order_id = p_order_id
        ),
        order_products AS (
            SELECT oi.product_id,
                   SUM(oi.quantity) AS requested_quantity
            FROM order_items oi
            WHERE oi.order_id = p_order_id
            GROUP BY oi.product_id
        ),
        product_totals AS (
            SELECT COUNT(*) AS products_needed,
                   SUM(requested_quantity) AS requested_units
            FROM order_products
        ),
        center_product_capacity AS (
            SELECT fc.center_id,
                   fc.center_name,
                   fc.city,
                   fc.state_province,
                   fc.center_type,
                   fc.latitude,
                   fc.longitude,
                   oc.current_center_id,
                   op.product_id,
                   op.requested_quantity,
                   GREATEST(NVL(i.quantity_on_hand - i.quantity_reserved, 0), 0) AS available_quantity,
                   SDO_GEOM.SDO_DISTANCE(
                       oc.customer_location,
                       fc.location,
                       0.005,
                       'unit=KM'
                   ) AS distance_km_raw
            FROM fulfillment_centers fc
            CROSS JOIN order_context oc
            CROSS JOIN order_products op
            LEFT JOIN inventory i ON i.center_id = fc.center_id
                                AND i.product_id = op.product_id
            WHERE fc.is_active = 1
        ),
        center_scores AS (
            SELECT cpc.center_id,
                   cpc.center_name,
                   cpc.city,
                   cpc.state_province,
                   cpc.center_type,
                   cpc.latitude,
                   cpc.longitude,
                   cpc.current_center_id,
                   ROUND(MIN(cpc.distance_km_raw), 2) AS distance_km,
                   ROUND(MIN(cpc.distance_km_raw) / 80, 1) AS estimated_hours,
                   SUM(CASE WHEN cpc.available_quantity >= cpc.requested_quantity THEN 1 ELSE 0 END) AS products_available,
                   pt.products_needed,
                   pt.requested_units,
                   SUM(LEAST(cpc.available_quantity, cpc.requested_quantity)) AS available_units,
                   MIN(cpc.available_quantity - cpc.requested_quantity) AS capacity_margin
            FROM center_product_capacity cpc
            CROSS JOIN product_totals pt
            GROUP BY cpc.center_id,
                     cpc.center_name,
                     cpc.city,
                     cpc.state_province,
                     cpc.center_type,
                     cpc.latitude,
                     cpc.longitude,
                     cpc.current_center_id,
                     pt.products_needed,
                     pt.requested_units
        ),
        scored AS (
            SELECT cs.*,
                   CASE
                       WHEN cs.products_available = cs.products_needed THEN 'full'
                       WHEN cs.products_available > 0 THEN 'partial'
                       ELSE 'none'
                   END AS coverage_status,
                   CASE WHEN cs.center_id = cs.current_center_id THEN 1 ELSE 0 END AS is_current_center,
                   ROUND(
                       (cs.products_available / NULLIF(cs.products_needed, 0) * 60) +
                       (LEAST(cs.available_units / NULLIF(cs.requested_units, 0), 1) * 25) +
                       (1 / (cs.distance_km + 1) * 15),
                       2
                   ) AS optimization_score
            FROM center_scores cs
        ),
        ranked AS (
            SELECT scored.*,
                   ROW_NUMBER() OVER (
                       ORDER BY
                           CASE LOWER(p_strategy)
                               WHEN 'nearest' THEN scored.distance_km
                               ELSE NULL
                           END ASC NULLS LAST,
                           CASE LOWER(p_strategy)
                               WHEN 'capacity' THEN scored.products_available
                               WHEN 'balanced' THEN scored.optimization_score
                               ELSE scored.optimization_score
                           END DESC NULLS LAST,
                           CASE LOWER(p_strategy)
                               WHEN 'capacity' THEN scored.available_units
                               ELSE scored.products_available
                           END DESC NULLS LAST,
                           scored.distance_km ASC,
                           scored.center_id ASC
                   ) AS recommendation_rank
            FROM scored
        )
        SELECT center_id,
               center_name,
               city,
               state_province,
               center_type,
               latitude,
               longitude,
               distance_km,
               estimated_hours,
               products_available,
               products_needed,
               requested_units,
               available_units,
               capacity_margin,
               coverage_status,
               optimization_score,
               is_current_center,
               recommendation_rank,
               CASE
                   WHEN is_current_center = 1 AND recommendation_rank = 1 THEN
                       'Assigned center is the top ranked option for distance and service capacity.'
                   WHEN coverage_status = 'full' THEN
                       'Full service coverage with ' || ROUND(distance_km, 1) || ' km client distance.'
                   WHEN coverage_status = 'partial' THEN
                       'Partial service coverage: ' || products_available || ' of ' || products_needed || ' required products available.'
                   ELSE
                       'No requested service lines have available capacity at this center.'
               END AS recommendation_reason
        FROM ranked
        WHERE recommendation_rank <= 5
           OR is_current_center = 1
        ORDER BY recommendation_rank, is_current_center DESC;

    RETURN v_results;
END;
/

COMMIT;

SELECT 'Spatial objects created successfully' AS status FROM dual;
