/*
 * 05_spatial.sql
 * Spatial objects for fulfillment routing and demand geography
 * Oracle 26ai — SDO_GEOMETRY, spatial indexes, routing functions
 */

-- ============================================================
-- ADD SDO_GEOMETRY COLUMNS
-- ============================================================

-- Fulfillment centers: location geometry
ALTER TABLE fulfillment_centers ADD (
    location SDO_GEOMETRY
);

-- Customers LOCATION column is defined in 01_tables.sql

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

CREATE INDEX idx_cust_spatial ON customers(location)
    INDEXTYPE IS MDSYS.SPATIAL_INDEX_V2;

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
    created_at        TIMESTAMP DEFAULT SYSTIMESTAMP,
    CONSTRAINT uk_fulfillment_zone_tier UNIQUE (center_id, zone_type)
);

INSERT INTO user_sdo_geom_metadata (TABLE_NAME, COLUMN_NAME, DIMINFO, SRID)
VALUES ('FULFILLMENT_ZONES', 'ZONE_BOUNDARY',
    SDO_DIM_ARRAY(
        SDO_DIM_ELEMENT('LON', -180, 180, 0.005),
        SDO_DIM_ELEMENT('LAT', -90, 90, 0.005)
    ), 4326);

CREATE INDEX idx_zones_boundary ON fulfillment_zones(zone_boundary)
    INDEXTYPE IS MDSYS.SPATIAL_INDEX_V2;

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
    social_density    NUMBER(8,2),      -- production signals per 1000 accounts
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
-- Find the N nearest fulfillment centers to a customer
-- that have the requested product in stock
-- ============================================================
CREATE OR REPLACE FUNCTION find_nearest_centers (
    p_customer_id   IN NUMBER,
    p_product_id    IN NUMBER,
    p_max_results   IN NUMBER DEFAULT 3
) RETURN SYS_REFCURSOR
AS
    v_results     SYS_REFCURSOR;
    v_max_results PLS_INTEGER := LEAST(GREATEST(NVL(p_max_results, 3), 1), 20);
BEGIN
    OPEN v_results FOR
        WITH origin AS (
            SELECT customer.location
            FROM customers customer
            WHERE customer.customer_id = p_customer_id
              AND customer.location IS NOT NULL
        ),
        indexed_candidates AS (
            SELECT /*+ LEADING(origin) USE_NL(center) INDEX(center idx_fc_spatial) */
                   center.center_id,
                   center.center_name,
                   center.city,
                   center.state_province,
                   center.center_type,
                   center.location AS center_location,
                   origin.location AS origin_location
            FROM origin
            JOIN fulfillment_centers center
              ON SDO_NN(
                    center.location,
                    origin.location,
                    'sdo_batch_size=50 unit=MILE'
                 ) = 'TRUE'
            WHERE center.is_active = 1
        ),
        available_candidates AS (
            SELECT candidate.*,
                   inventory.quantity_on_hand
            FROM indexed_candidates candidate
            JOIN inventory
              ON inventory.center_id = candidate.center_id
             AND inventory.product_id = p_product_id
            WHERE inventory.quantity_on_hand > inventory.quantity_reserved
        ),
        measured_candidates AS (
            SELECT candidate.*,
                   ROUND(
                       SDO_GEOM.SDO_DISTANCE(
                           candidate.origin_location,
                           candidate.center_location,
                           0.005,
                           'unit=MILE'
                       ),
                       2
                   ) AS distance_mi
            FROM available_candidates candidate
        )
        SELECT center_id,
               center_name,
               city,
               state_province,
               center_type,
               quantity_on_hand,
               distance_mi,
               ROUND(distance_mi / 50, 1) AS estimated_hours
        FROM measured_candidates
        ORDER BY distance_mi, center_id
        FETCH FIRST v_max_results ROWS ONLY;

    RETURN v_results;
END;
/

-- ============================================================
-- OPTIMAL FULFILLMENT: multi-item order routing
-- Finds best center(s) to fulfill an entire order,
-- balancing distance + inventory availability
-- ============================================================
CREATE OR REPLACE FUNCTION optimal_fulfillment (
    p_work_order_id IN NUMBER,
    p_strategy      IN VARCHAR2 DEFAULT 'nearest'  -- 'nearest','cheapest','fastest','balanced'
) RETURN SYS_REFCURSOR
AS
    v_results SYS_REFCURSOR;
BEGIN
    OPEN v_results FOR
        WITH order_products AS (
            SELECT oi.manufactured_part_id, oi.requested_units
            FROM manufacturing_work_order_lines oi
            WHERE oi.work_order_id = p_work_order_id
        ),
        customer_loc AS (
            SELECT c.location
            FROM manufacturing_work_orders o
            JOIN customers c ON o.customer_account_id = c.customer_id
            WHERE o.work_order_id = p_work_order_id
              AND c.location IS NOT NULL
        ),
        -- Use the R-tree index to produce candidates before exact measurement.
        indexed_candidates AS (
            SELECT /*+ LEADING(cl) USE_NL(fc) INDEX(fc idx_fc_spatial) */
                   fc.center_id,
                   fc.center_name,
                   fc.city,
                   fc.state_province,
                   fc.location AS center_location,
                   cl.location AS customer_location
            FROM customer_loc cl
            JOIN fulfillment_centers fc
              ON SDO_NN(
                    fc.location,
                    cl.location,
                    'sdo_batch_size=50 unit=MILE'
                 ) = 'TRUE'
            WHERE fc.is_active = 1
        ),
        -- Pre-compute exact distance as a scalar to avoid GROUP BY on SDO_GEOMETRY.
        center_distances AS (
            SELECT candidate.center_id,
                   candidate.center_name,
                   candidate.city,
                   candidate.state_province,
                   ROUND(
                       SDO_GEOM.SDO_DISTANCE(
                           candidate.customer_location,
                           candidate.center_location,
                           0.005,
                           'unit=MILE'
                       ),
                       2
                   ) AS distance_mi
            FROM indexed_candidates candidate
        ),
        center_scores AS (
            SELECT cd.center_id,
                   cd.center_name,
                   cd.city,
                   cd.state_province,
                   cd.distance_mi,
                   COUNT(DISTINCT op.manufactured_part_id) AS products_available,
                   (SELECT COUNT(*) FROM order_products) AS products_needed,
                   MIN(i.quantity_on_hand - i.quantity_reserved) AS min_available
            FROM center_distances cd
            JOIN inventory i ON cd.center_id = i.center_id
            JOIN order_products op ON i.product_id = op.manufactured_part_id
                                  AND (i.quantity_on_hand - i.quantity_reserved) >= op.requested_units
            GROUP BY cd.center_id, cd.center_name, cd.city, cd.state_province, cd.distance_mi
        )
        SELECT center_id,
               center_name,
               city,
               state_province,
               distance_mi,
               products_available,
               products_needed,
               CASE
                   WHEN products_available = products_needed THEN 'full'
                   ELSE 'partial'
               END AS fulfillment_type,
               ROUND(
                   (products_available / products_needed * 50) +
                   (1 / (distance_mi + 1) * 50),
               2) AS optimization_score
        FROM center_scores
        ORDER BY
            CASE p_strategy
                WHEN 'nearest' THEN distance_mi
                WHEN 'balanced' THEN -1 * (
                    (products_available / products_needed * 50) +
                    (1 / (distance_mi + 1) * 50)
                )
                ELSE distance_mi
            END
        FETCH FIRST 5 ROWS ONLY;

    RETURN v_results;
END;
/

COMMIT;

SELECT 'Spatial objects created successfully' AS status FROM dual;
