/*
 * 11_silver_tables.sql
 * Silver layer DDL for the PeakGear AI Data Lakehouse demo.
 *
 * These tables receive cleaned and standardized outputs from Data Studio /
 * Data Transforms after the raw Bronze files have been loaded.
 */

SET SERVEROUTPUT ON
PROMPT Creating PeakGear Silver tables...

DECLARE
    v_has_product_master_raw NUMBER := 0;

    PROCEDURE run_ddl(p_sql VARCHAR2, p_label VARCHAR2) IS
    BEGIN
        EXECUTE IMMEDIATE p_sql;
        DBMS_OUTPUT.PUT_LINE('Created ' || p_label || '.');
    EXCEPTION
        WHEN OTHERS THEN
            IF SQLCODE = -955 THEN
                DBMS_OUTPUT.PUT_LINE(p_label || ' already exists.');
            ELSE
                RAISE;
            END IF;
    END;
BEGIN
    run_ddl(q'[
        CREATE TABLE silver_products (
            sku               VARCHAR2(50) PRIMARY KEY,
            product_name      VARCHAR2(300) NOT NULL,
            brand_name        VARCHAR2(200),
            category          VARCHAR2(100),
            subcategory       VARCHAR2(100),
            list_price        NUMBER(10,2),
            cost              NUMBER(10,2),
            weight_kg         NUMBER(8,3),
            launch_date       DATE,
            tags              VARCHAR2(1000),
            source_system     VARCHAR2(50),
            source_updated_at TIMESTAMP WITH TIME ZONE,
            created_at        TIMESTAMP DEFAULT SYSTIMESTAMP,
            updated_at        TIMESTAMP DEFAULT SYSTIMESTAMP
        )
    ]', 'SILVER_PRODUCTS');

    run_ddl(q'[
        CREATE INDEX idx_silver_products_category
        ON silver_products (category, subcategory)
    ]', 'IDX_SILVER_PRODUCTS_CATEGORY');

    run_ddl(q'[
        CREATE INDEX idx_silver_products_brand
        ON silver_products (brand_name)
    ]', 'IDX_SILVER_PRODUCTS_BRAND');

    run_ddl(q'[
        CREATE TABLE silver_order_lines (
            order_line_id       NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
            transaction_id      VARCHAR2(80) NOT NULL,
            transaction_ts      TIMESTAMP WITH TIME ZONE,
            channel             VARCHAR2(30),
            customer_ref        VARCHAR2(80),
            customer_city       VARCHAR2(100),
            customer_region     VARCHAR2(50),
            store_id            VARCHAR2(80),
            sku                 VARCHAR2(50) NOT NULL,
            quantity            NUMBER(10),
            unit_price          NUMBER(10,2),
            discount_pct        NUMBER(5,2),
            line_total          NUMBER(12,2),
            expected_line_total NUMBER(12,2),
            line_total_status   VARCHAR2(20),
            payment_type        VARCHAR2(40),
            fulfillment_method  VARCHAR2(60),
            demand_signal_ref   VARCHAR2(80),
            created_at          TIMESTAMP DEFAULT SYSTIMESTAMP
        )
    ]', 'SILVER_ORDER_LINES');

    run_ddl(q'[
        CREATE INDEX idx_silver_order_lines_txn
        ON silver_order_lines (transaction_id)
    ]', 'IDX_SILVER_ORDER_LINES_TXN');

    run_ddl(q'[
        CREATE INDEX idx_silver_order_lines_sku
        ON silver_order_lines (sku)
    ]', 'IDX_SILVER_ORDER_LINES_SKU');

    run_ddl(q'[
        CREATE INDEX idx_silver_order_lines_signal
        ON silver_order_lines (demand_signal_ref)
    ]', 'IDX_SILVER_ORDER_LINES_SIGNAL');

    run_ddl(q'[
        CREATE TABLE silver_inventory (
            inventory_snapshot_id NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
            snapshot_ts           TIMESTAMP WITH TIME ZONE,
            location_code         VARCHAR2(80) NOT NULL,
            location_name         VARCHAR2(200),
            location_type         VARCHAR2(40),
            city                  VARCHAR2(100),
            state                 VARCHAR2(50),
            sku                   VARCHAR2(50) NOT NULL,
            on_hand               NUMBER(10),
            reserved              NUMBER(10),
            incoming              NUMBER(10),
            available_qty         NUMBER(10),
            reorder_point         NUMBER(10),
            stock_status          VARCHAR2(20),
            last_restock_date     DATE,
            created_at            TIMESTAMP DEFAULT SYSTIMESTAMP
        )
    ]', 'SILVER_INVENTORY');

    run_ddl(q'[
        CREATE INDEX idx_silver_inventory_sku
        ON silver_inventory (sku)
    ]', 'IDX_SILVER_INVENTORY_SKU');

    run_ddl(q'[
        CREATE INDEX idx_silver_inventory_location
        ON silver_inventory (location_code, location_type)
    ]', 'IDX_SILVER_INVENTORY_LOCATION');

    run_ddl(q'[
        CREATE INDEX idx_silver_inventory_status
        ON silver_inventory (stock_status)
    ]', 'IDX_SILVER_INVENTORY_STATUS');

    run_ddl(q'[
        CREATE TABLE silver_demand_signals (
            signal_id         VARCHAR2(80) PRIMARY KEY,
            observed_at       TIMESTAMP,
            source_system     VARCHAR2(80),
            source_type       VARCHAR2(50),
            platform          VARCHAR2(80),
            region            VARCHAR2(50),
            signal_text       VARCHAR2(4000),
            likes             NUMBER(12),
            shares            NUMBER(12),
            comments          NUMBER(12),
            views             NUMBER(14),
            sentiment_score   NUMBER(6,3),
            criticality_score NUMBER(6,2),
            momentum_flag     VARCHAR2(30),
            product_hints     VARCHAR2(4000)
                              CONSTRAINT chk_silver_demand_product_hints_json
                              CHECK (product_hints IS JSON),
            topic_tags        VARCHAR2(4000)
                              CONSTRAINT chk_silver_demand_topic_tags_json
                              CHECK (topic_tags IS JSON),
            created_at        TIMESTAMP DEFAULT SYSTIMESTAMP
        )
    ]', 'SILVER_DEMAND_SIGNALS');

    run_ddl(q'[
        CREATE INDEX idx_silver_demand_region
        ON silver_demand_signals (region)
    ]', 'IDX_SILVER_DEMAND_REGION');

    run_ddl(q'[
        CREATE INDEX idx_silver_demand_score
        ON silver_demand_signals (criticality_score DESC)
    ]', 'IDX_SILVER_DEMAND_SCORE');

    run_ddl(q'[
        CREATE INDEX idx_silver_demand_momentum
        ON silver_demand_signals (momentum_flag)
    ]', 'IDX_SILVER_DEMAND_MOMENTUM');

    run_ddl(q'[
        CREATE TABLE silver_product_images (
            image_asset_id    NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
            sku               VARCHAR2(50) NOT NULL,
            asset_type        VARCHAR2(40),
            object_uri        VARCHAR2(1000),
            file_name         VARCHAR2(300),
            mime_type         VARCHAR2(100),
            width             NUMBER(8),
            height            NUMBER(8),
            quality_status    VARCHAR2(40),
            has_image         CHAR(1)
                              CONSTRAINT chk_silver_images_has_image
                              CHECK (has_image IN ('Y', 'N')),
            source_updated_at TIMESTAMP WITH TIME ZONE,
            created_at        TIMESTAMP DEFAULT SYSTIMESTAMP
        )
    ]', 'SILVER_PRODUCT_IMAGES');

    run_ddl(q'[
        CREATE INDEX idx_silver_product_images_sku
        ON silver_product_images (sku)
    ]', 'IDX_SILVER_PRODUCT_IMAGES_SKU');

    run_ddl(q'[
        CREATE INDEX idx_silver_product_images_quality
        ON silver_product_images (quality_status, has_image)
    ]', 'IDX_SILVER_PRODUCT_IMAGES_QUALITY');

    SELECT COUNT(*)
    INTO v_has_product_master_raw
    FROM user_tables
    WHERE table_name = 'PRODUCT_MASTER_RAW';

    IF v_has_product_master_raw > 0 THEN
        run_ddl(q'[
            CREATE OR REPLACE VIEW product_master_silver_v AS
            SELECT
                sku,
                product_name,
                brand_name,
                category,
                subcategory,
                list_price,
                cost,
                weight_kg,
                launch_date,
                tags,
                source_system,
                source_updated_at
            FROM (
                SELECT
                    raw_sku AS sku,
                    TRIM(product_name) AS product_name,
                    TRIM(brand_name) AS brand_name,
                    INITCAP(TRIM(category)) AS category,
                    INITCAP(TRIM(subcategory)) AS subcategory,
                    list_price,
                    cost,
                    weight_kg,
                    launch_date,
                    tags,
                    source_system,
                    source_updated_at,
                    ROW_NUMBER() OVER (
                        PARTITION BY raw_sku
                        ORDER BY source_updated_at DESC
                    ) AS row_rank
                FROM product_master_raw
                WHERE record_status <> 'DELETE'
            )
            WHERE row_rank = 1
        ]', 'PRODUCT_MASTER_SILVER_V');
    ELSE
        DBMS_OUTPUT.PUT_LINE('Skipped PRODUCT_MASTER_SILVER_V; load PRODUCT_MASTER_RAW first and create the view from the Silver guide.');
    END IF;
END;
/

PROMPT PeakGear Silver table DDL complete.
