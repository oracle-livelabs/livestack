/*
 * 01_tables.sql
 * Core relational tables for manufacturing operations, signals, and plant capacity
 * Oracle AI Database 26ai Free
 *
 * Run as: ADMIN or a dedicated schema owner (e.g., LIVESTACK)
 */

-- ============================================================
-- APPLICATION PROVISIONING STATE
-- One authoritative row is advanced by the bootstrap process.
-- ============================================================
CREATE TABLE app_provisioning_state (
    state_id              NUMBER(1)     PRIMARY KEY,
    provisioning_version  VARCHAR2(30)  NOT NULL,
    provisioning_status   VARCHAR2(20)  NOT NULL,
    started_at             TIMESTAMP     DEFAULT SYSTIMESTAMP NOT NULL,
    completed_at           TIMESTAMP,
    failure_message        VARCHAR2(4000),
    updated_at             TIMESTAMP     DEFAULT SYSTIMESTAMP NOT NULL,
    CONSTRAINT ck_app_provisioning_singleton
        CHECK (state_id = 1),
    CONSTRAINT ck_app_provisioning_status
        CHECK (provisioning_status IN ('PROVISIONING', 'READY', 'FAILED')),
    CONSTRAINT ck_app_provisioning_completion
        CHECK (
            (provisioning_status = 'READY'
             AND completed_at IS NOT NULL
             AND failure_message IS NULL)
            OR (provisioning_status = 'PROVISIONING'
                AND completed_at IS NULL
                AND failure_message IS NULL)
            OR (provisioning_status = 'FAILED'
                AND completed_at IS NULL
                AND failure_message IS NOT NULL)
        )
);

INSERT INTO app_provisioning_state (
    state_id,
    provisioning_version,
    provisioning_status
) VALUES (
    1,
    '2026.07.01.1',
    'PROVISIONING'
);

COMMIT;

-- ============================================================
-- BRANDS
-- ============================================================
CREATE TABLE brands (
    brand_id          NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    brand_name        VARCHAR2(200)  NOT NULL,
    brand_slug        VARCHAR2(100)  NOT NULL UNIQUE,
    brand_category    VARCHAR2(100),
    headquarters_city VARCHAR2(100),
    headquarters_lat  NUMBER(10,7),
    headquarters_lon  NUMBER(11,7),
    founded_year      NUMBER(4),
    annual_revenue    NUMBER(15,2),
    social_tier       VARCHAR2(20) DEFAULT 'standard'
                      CHECK (social_tier IN ('emerging','standard','premium','luxury')),
    created_at        TIMESTAMP DEFAULT SYSTIMESTAMP,
    updated_at        TIMESTAMP DEFAULT SYSTIMESTAMP
);

-- ============================================================
-- PRODUCTS
-- ============================================================
CREATE TABLE products (
    product_id        NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    brand_id          NUMBER NOT NULL REFERENCES brands(brand_id),
    sku               VARCHAR2(50)  NOT NULL UNIQUE,
    product_name      VARCHAR2(300) NOT NULL,
    description       CLOB,
    category          VARCHAR2(100),
    subcategory       VARCHAR2(100),
    unit_price        NUMBER(10,2)  NOT NULL,
    unit_cost         NUMBER(10,2),
    weight_kg         NUMBER(8,3),
    is_active         NUMBER(1) DEFAULT 1,
    launch_date       DATE,
    tags              VARCHAR2(1000),  -- comma-separated for simple querying
    created_at        TIMESTAMP DEFAULT SYSTIMESTAMP,
    updated_at        TIMESTAMP DEFAULT SYSTIMESTAMP
);

CREATE INDEX idx_products_brand    ON products(brand_id);
CREATE INDEX idx_products_category ON products(category, subcategory);
CREATE INDEX idx_products_active   ON products(is_active);

-- ============================================================
-- FULFILLMENT CENTERS (plant capacity centers / production hubs kept on baseline table name)
-- ============================================================
CREATE TABLE fulfillment_centers (
    center_id         NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    center_name       VARCHAR2(200)  NOT NULL,
    center_type       VARCHAR2(30)   DEFAULT 'warehouse'
                      CHECK (center_type IN ('warehouse','distribution','micro','drop_ship','store')),
    address_line1     VARCHAR2(300),
    city              VARCHAR2(100),
    state_province    VARCHAR2(100),
    postal_code       VARCHAR2(20),
    country           VARCHAR2(3) DEFAULT 'US',
    latitude          NUMBER(10,7) NOT NULL,
    longitude         NUMBER(11,7) NOT NULL,
    capacity_units    NUMBER(10) DEFAULT 100000,
    current_load_pct  NUMBER(5,2) DEFAULT 0,
    is_active         NUMBER(1) DEFAULT 1,
    operating_hours   VARCHAR2(50) DEFAULT '06:00-22:00',
    created_at        TIMESTAMP DEFAULT SYSTIMESTAMP
);

-- ============================================================
-- INVENTORY (manufactured part capacity / component inventory units at each access center)
-- ============================================================
CREATE TABLE inventory (
    inventory_id      NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    product_id        NUMBER NOT NULL REFERENCES products(product_id),
    center_id         NUMBER NOT NULL REFERENCES fulfillment_centers(center_id),
    quantity_on_hand  NUMBER(10) DEFAULT 0,
    quantity_reserved NUMBER(10) DEFAULT 0,
    quantity_incoming NUMBER(10) DEFAULT 0,
    reorder_point     NUMBER(10) DEFAULT 50,
    reorder_qty       NUMBER(10) DEFAULT 200,
    last_restock_date DATE,
    updated_at        TIMESTAMP DEFAULT SYSTIMESTAMP,
    CONSTRAINT uq_inventory UNIQUE (product_id, center_id)
);

CREATE INDEX idx_inventory_product ON inventory(product_id);
CREATE INDEX idx_inventory_center  ON inventory(center_id);

-- ============================================================
-- CUSTOMERS
-- ============================================================
CREATE TABLE customers (
    customer_id       NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    email             VARCHAR2(300)  NOT NULL UNIQUE,
    first_name        VARCHAR2(100),
    last_name         VARCHAR2(100),
    city              VARCHAR2(100),
    state_province    VARCHAR2(100),
    postal_code       VARCHAR2(20),
    country           VARCHAR2(3) DEFAULT 'US',
    latitude          NUMBER(10,7),
    longitude         NUMBER(11,7),
    location          SDO_GEOMETRY,
    customer_tier     VARCHAR2(20) DEFAULT 'standard'
                      CHECK (customer_tier IN ('new','standard','preferred','vip')),
    lifetime_value    NUMBER(12,2) DEFAULT 0,
    created_at        TIMESTAMP DEFAULT SYSTIMESTAMP
);

-- ============================================================
-- MANUFACTURING WORK ORDERS
-- ============================================================
CREATE TABLE manufacturing_work_orders (
    work_order_id     NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    work_order_code   VARCHAR2(50) NOT NULL,
    customer_account_id NUMBER NOT NULL REFERENCES customers(customer_id),
    work_order_status_code VARCHAR2(30) DEFAULT 'planned'
                      CHECK (work_order_status_code IN ('planned','released','in_progress',
                             'dispatched','completed','cancelled','on_hold')),
    work_order_value  NUMBER(12,2),
    routing_cost      NUMBER(8,2) DEFAULT 0,
    assigned_plant_id NUMBER REFERENCES fulfillment_centers(center_id),
    destination_latitude  NUMBER(10,7),
    destination_longitude NUMBER(11,7),
    target_completion_date DATE,
    actual_completion_date DATE,
    production_signal_id NUMBER,
    demand_urgency_score NUMBER(5,2),
    created_at         TIMESTAMP DEFAULT SYSTIMESTAMP,
    updated_at         TIMESTAMP DEFAULT SYSTIMESTAMP,
    CONSTRAINT uq_mfg_wo_plant_scope UNIQUE (work_order_id, assigned_plant_id)
) INMEMORY MEMCOMPRESS FOR QUERY LOW PRIORITY HIGH;

CREATE INDEX idx_mfg_wo_customer ON manufacturing_work_orders(customer_account_id);
CREATE INDEX idx_mfg_wo_status   ON manufacturing_work_orders(work_order_status_code);
CREATE INDEX idx_mfg_wo_plant    ON manufacturing_work_orders(assigned_plant_id);
CREATE INDEX idx_mfg_wo_created  ON manufacturing_work_orders(created_at);
CREATE UNIQUE INDEX uq_mfg_wo_code ON manufacturing_work_orders(work_order_code);

-- ============================================================
-- MANUFACTURING WORK ORDER LINES
-- ============================================================
CREATE TABLE manufacturing_work_order_lines (
    work_order_line_id NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    work_order_id      NUMBER NOT NULL REFERENCES manufacturing_work_orders(work_order_id),
    manufactured_part_id NUMBER NOT NULL REFERENCES products(product_id),
    requested_units    NUMBER(6)  NOT NULL,
    planned_unit_value NUMBER(10,2) NOT NULL,
    line_value         NUMBER(12,2) GENERATED ALWAYS AS (requested_units * planned_unit_value) VIRTUAL,
    assigned_plant_id  NUMBER REFERENCES fulfillment_centers(center_id),
    CONSTRAINT fk_mfg_wol_plant_scope
        FOREIGN KEY (work_order_id, assigned_plant_id)
        REFERENCES manufacturing_work_orders (work_order_id, assigned_plant_id)
) INMEMORY MEMCOMPRESS FOR QUERY LOW PRIORITY HIGH;

CREATE INDEX idx_mfg_wol_order ON manufacturing_work_order_lines(work_order_id);
CREATE INDEX idx_mfg_wol_part  ON manufacturing_work_order_lines(manufactured_part_id);

-- ============================================================
-- MANUFACTURING NETWORK ACCOUNTS (baseline physical name retained)
-- ============================================================
CREATE TABLE influencers (
    influencer_id     NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    handle            VARCHAR2(200) NOT NULL UNIQUE,
    display_name      VARCHAR2(200),
    platform          VARCHAR2(50) DEFAULT 'instagram'
                      CHECK (platform IN ('instagram','tiktok','twitter','youtube','threads')),
    follower_count    NUMBER(12) DEFAULT 0,
    engagement_rate   NUMBER(5,4) DEFAULT 0,   -- e.g. 0.0345 = 3.45%
    influence_score   NUMBER(5,2) DEFAULT 0,   -- computed 0-100
    niche             VARCHAR2(100),
    city              VARCHAR2(100),
    region            VARCHAR2(100),            -- state / province for VPD
    country           VARCHAR2(3) DEFAULT 'US',
    is_verified       NUMBER(1) DEFAULT 0,
    created_at        TIMESTAMP DEFAULT SYSTIMESTAMP
);

CREATE INDEX idx_influencers_platform ON influencers(platform);
CREATE INDEX idx_influencers_score    ON influencers(influence_score DESC);

-- ============================================================
-- MANUFACTURING PRODUCTION SIGNALS
-- ============================================================
CREATE TABLE manufacturing_production_signals (
    production_signal_id NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    network_account_id NUMBER REFERENCES influencers(influencer_id),
    signal_channel_code VARCHAR2(50)
                      CHECK (signal_channel_code IN ('supplier_portal','plant_floor','market_feed',
                             'quality_bulletin','partner_operations')),
    external_signal_id VARCHAR2(200),
    signal_text        CLOB,
    observed_at        TIMESTAMP NOT NULL,
    acknowledgement_count NUMBER(10) DEFAULT 0,
    propagation_count  NUMBER(10) DEFAULT 0,
    response_count     NUMBER(10) DEFAULT 0,
    observation_count  NUMBER(12) DEFAULT 0,
    sentiment_score   NUMBER(4,3),       -- -1.0 to 1.0
    urgency_score     NUMBER(5,2)
                      CHECK (urgency_score BETWEEN 0 AND 100),
    detected_part_ids VARCHAR2(2000),    -- comma-separated manufactured-part IDs matched
    momentum_code     VARCHAR2(20) DEFAULT 'stable'
                      CHECK (momentum_code IN ('stable','elevated','escalating','critical')),
    processed_at      TIMESTAMP,
    created_at        TIMESTAMP DEFAULT SYSTIMESTAMP
) INMEMORY MEMCOMPRESS FOR QUERY LOW PRIORITY HIGH;

CREATE INDEX idx_mfg_signal_account ON manufacturing_production_signals(network_account_id);
CREATE INDEX idx_mfg_signal_observed ON manufacturing_production_signals(observed_at DESC);
CREATE INDEX idx_mfg_signal_momentum ON manufacturing_production_signals(momentum_code);
CREATE INDEX idx_mfg_signal_urgency ON manufacturing_production_signals(urgency_score DESC);

ALTER TABLE manufacturing_work_orders ADD CONSTRAINT fk_mfg_wo_signal
    FOREIGN KEY (production_signal_id)
    REFERENCES manufacturing_production_signals(production_signal_id);

-- ============================================================
-- PRODUCTION SIGNAL ↔ MANUFACTURED PART MENTIONS (many-to-many)
-- ============================================================
CREATE TABLE manufacturing_signal_part_mentions (
    signal_part_mention_id NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    production_signal_id NUMBER NOT NULL REFERENCES manufacturing_production_signals(production_signal_id),
    manufactured_part_id NUMBER NOT NULL REFERENCES products(product_id),
    confidence_score  NUMBER(4,3) DEFAULT 1.0,  -- semantic match confidence
    mention_type      VARCHAR2(30) DEFAULT 'direct'
                      CHECK (mention_type IN ('direct','semantic','hashtag','visual','inferred')),
    created_at        TIMESTAMP DEFAULT SYSTIMESTAMP,
    CONSTRAINT uq_mfg_signal_part UNIQUE (production_signal_id, manufactured_part_id)
);

CREATE INDEX idx_mfg_spm_part ON manufacturing_signal_part_mentions(manufactured_part_id);
CREATE INDEX idx_mfg_spm_signal ON manufacturing_signal_part_mentions(production_signal_id);

-- ============================================================
-- MANUFACTURING DEMAND FORECASTS
-- ============================================================
CREATE TABLE manufacturing_demand_forecasts (
    demand_forecast_id NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    manufactured_part_id NUMBER NOT NULL REFERENCES products(product_id),
    planning_region   VARCHAR2(100),
    forecast_date     DATE NOT NULL,
    predicted_unit_demand NUMBER(10) NOT NULL,
    lower_confidence_units NUMBER(10),
    upper_confidence_units NUMBER(10),
    production_signal_factor NUMBER(5,2) DEFAULT 1.0,
    model_version     VARCHAR2(50),
    forecast_explanation CLOB, -- JSON with explainable factors
    created_at        TIMESTAMP DEFAULT SYSTIMESTAMP
) INMEMORY MEMCOMPRESS FOR QUERY LOW PRIORITY HIGH;

CREATE INDEX idx_mfg_forecast_part ON manufacturing_demand_forecasts(manufactured_part_id, forecast_date);

-- ============================================================
-- SHIPMENTS
-- ============================================================
CREATE TABLE shipments (
    shipment_id       NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    work_order_id     NUMBER NOT NULL REFERENCES manufacturing_work_orders(work_order_id),
    center_id         NUMBER NOT NULL REFERENCES fulfillment_centers(center_id),
    carrier           VARCHAR2(100),
    tracking_number   VARCHAR2(200),
    ship_status       VARCHAR2(30) DEFAULT 'preparing'
                      CHECK (ship_status IN ('preparing','picked','packed','shipped',
                             'in_transit','out_for_delivery','delivered','exception')),
    distance_km       NUMBER(8,2),
    estimated_hours   NUMBER(6,2),
    ship_cost         NUMBER(8,2),
    shipped_at        TIMESTAMP,
    delivered_at      TIMESTAMP,
    created_at        TIMESTAMP DEFAULT SYSTIMESTAMP
);

CREATE INDEX idx_shipments_work_order ON shipments(work_order_id);
CREATE INDEX idx_shipments_center ON shipments(center_id);

-- ============================================================
-- AGENT ACTIONS LOG (audit trail for AI agent decisions)
-- ============================================================
CREATE TABLE agent_actions (
    action_id         NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    agent_name        VARCHAR2(100) NOT NULL,
    action_type       VARCHAR2(100) NOT NULL,
    entity_type       VARCHAR2(50),      -- baseline entity names: product/service, order/request, inventory/capacity, shipment/route
    entity_id         NUMBER,
    decision_payload  CLOB,              -- JSON: reasoning, factors, outcome
    confidence        NUMBER(4,3),
    execution_status  VARCHAR2(30) DEFAULT 'proposed'
                      CHECK (execution_status IN ('proposed','approved','executing',
                             'completed','failed','rolled_back')),
    executed_at       TIMESTAMP,
    region_code       VARCHAR2(2),
    created_at        TIMESTAMP DEFAULT SYSTIMESTAMP
);

CREATE INDEX idx_agent_actions_type   ON agent_actions(action_type);
CREATE INDEX idx_agent_actions_entity ON agent_actions(entity_type, entity_id);

-- ============================================================
-- APP USERS & ROLES (for RBAC demo)
-- ============================================================
CREATE TABLE app_users (
    user_id           NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    username          VARCHAR2(100) NOT NULL UNIQUE,
    password_hash     VARCHAR2(500) NOT NULL,
    full_name         VARCHAR2(200),
    email             VARCHAR2(300),
    role              VARCHAR2(30) NOT NULL
                      CHECK (role IN ('admin','analyst','fulfillment_mgr',
                             'merchandiser','viewer')),
    region            VARCHAR2(100),
    is_active         NUMBER(1) DEFAULT 1,
    last_login        TIMESTAMP,
    created_at        TIMESTAMP DEFAULT SYSTIMESTAMP
);

-- ============================================================
-- ACTIVE DATASET STATE
-- ============================================================
CREATE TABLE app_dataset_state (
    state_id          NUMBER(1) PRIMARY KEY
                      CHECK (state_id = 1),
    active_source     VARCHAR2(20) NOT NULL
                      CHECK (active_source IN ('demo','custom')),
    active_label      VARCHAR2(100) NOT NULL,
    active_version    VARCHAR2(20),
    updated_at        TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL
);

-- ============================================================
-- DEMO DATE REFRESH ANCHOR
-- ============================================================
CREATE TABLE app_demo_date_anchor (
    anchor_id            NUMBER(1) PRIMARY KEY
                         CHECK (anchor_id = 1),
    anchor_source        VARCHAR2(30) NOT NULL,
    anchor_strategy      VARCHAR2(80) NOT NULL,
    original_seed_anchor TIMESTAMP,
    restore_anchor       TIMESTAMP NOT NULL,
    offset_days          NUMBER(12,4) DEFAULT 0 NOT NULL,
    offset_seconds       NUMBER(18,3) DEFAULT 0 NOT NULL,
    shifted_table_count  NUMBER DEFAULT 0 NOT NULL,
    shifted_column_count NUMBER DEFAULT 0 NOT NULL,
    shifted_value_count  NUMBER DEFAULT 0 NOT NULL,
    shifted_columns_json CLOB,
    refreshed_at         TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL
);

COMMIT;

-- Summary
SELECT 'Tables created successfully' AS status FROM dual;
