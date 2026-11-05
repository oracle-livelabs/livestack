Here are the regenerated DDL and DML scripts, explicitly utilizing the `GOLD` schema for the target data warehouse tables and the `SILVER` schema for the source operational/staged tables. 

### 1. GOLD.DIM_CUSTOMER (Unified B2C & B2B)

**DDL:**
```sql
CREATE TABLE GOLD.DIM_CUSTOMER (
    customer_sk NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    source_system VARCHAR2(50) NOT NULL,
    source_customer_id VARCHAR2(50) NOT NULL,
    customer_name VARCHAR2(255),
    customer_type VARCHAR2(20), 
    email VARCHAR2(255),
    phone VARCHAR2(50),
    loyalty_tier VARCHAR2(50),
    market_segment VARCHAR2(100),
    age NUMBER,
    education VARCHAR2(100),
    gender VARCHAR2(50),
    household_size NUMBER,
    income NUMBER(15,2),
    income_level VARCHAR2(50),
    job_type VARCHAR2(100),
    marital_status VARCHAR2(50),
    num_cars NUMBER,
    pet VARCHAR2(50),
    registration_date DATE,
    insert_dt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    update_dt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX GOLD.idx_dim_cust_nk ON GOLD.DIM_CUSTOMER(source_system, source_customer_id);
```

**DML:**
```sql
MERGE INTO GOLD.DIM_CUSTOMER tgt
USING (
    SELECT 
        'NetSuite' AS source_system,
        customer_id AS source_id,
        customer_name,
        'B2C' AS customer_type,
        email,
        phone,
        loyalty_tier,
        'Individual Consumer' AS market_segment, 
        age,
        education,
        gender,
        household_size,
        income,
        income_level,
        job_type,
        marital_status,
        num_cars,
        pet,
        registration_date
    FROM SILVER.CUSTOMER_ACCT
    UNION ALL
    SELECT 
        'Salesforce' AS source_system,
        partner_id AS source_id,
        partner_name AS customer_name,
        'B2B' AS customer_type,
        CAST(NULL AS VARCHAR2(255)) AS email,
        CAST(NULL AS VARCHAR2(50)) AS phone,
        CAST(NULL AS VARCHAR2(50)) AS loyalty_tier,
        market_segment,
        CAST(NULL AS NUMBER) AS age,
        CAST(NULL AS VARCHAR2(100)) AS education,
        CAST(NULL AS VARCHAR2(50)) AS gender,
        CAST(NULL AS NUMBER) AS household_size,
        CAST(NULL AS NUMBER(15,2)) AS income,
        CAST(NULL AS VARCHAR2(50)) AS income_level,
        CAST(NULL AS VARCHAR2(100)) AS job_type,
        CAST(NULL AS VARCHAR2(50)) AS marital_status,
        CAST(NULL AS NUMBER) AS num_cars,
        CAST(NULL AS VARCHAR2(50)) AS pet,
        CAST(NULL AS DATE) AS registration_date
    FROM SILVER.ACCOUNT
) src
ON (tgt.source_customer_id = src.source_id AND tgt.source_system = src.source_system)
WHEN MATCHED THEN
    UPDATE SET 
        tgt.customer_name = src.customer_name,
        tgt.email = src.email,
        tgt.phone = src.phone,
        tgt.loyalty_tier = src.loyalty_tier,
        tgt.market_segment = src.market_segment,
        tgt.age = src.age,
        tgt.education = src.education,
        tgt.gender = src.gender,
        tgt.household_size = src.household_size,
        tgt.income = src.income,
        tgt.income_level = src.income_level,
        tgt.job_type = src.job_type,
        tgt.marital_status = src.marital_status,
        tgt.num_cars = src.num_cars,
        tgt.pet = src.pet,
        tgt.update_dt = CURRENT_TIMESTAMP
    WHERE DECODE(tgt.customer_name, src.customer_name, 0, 1) = 1
       OR DECODE(tgt.loyalty_tier, src.loyalty_tier, 0, 1) = 1
       OR DECODE(tgt.market_segment, src.market_segment, 0, 1) = 1
       OR DECODE(tgt.income, src.income, 0, 1) = 1
       OR DECODE(tgt.marital_status, src.marital_status, 0, 1) = 1
WHEN NOT MATCHED THEN
    INSERT (source_system, source_customer_id, customer_name, customer_type, email, phone, loyalty_tier, market_segment, age, education, gender, household_size, income, income_level, job_type, marital_status, num_cars, pet, registration_date)
    VALUES (src.source_system, src.source_id, src.customer_name, src.customer_type, src.email, src.phone, src.loyalty_tier, src.market_segment, src.age, src.education, src.gender, src.household_size, src.income, src.income_level, src.job_type, src.marital_status, src.num_cars, src.pet, src.registration_date);
```

### 2. GOLD.DIM_STORE

**DDL:**
```sql
CREATE TABLE GOLD.DIM_STORE (
    store_sk NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    source_system VARCHAR2(50) DEFAULT 'In-Store POS' NOT NULL,
    source_store_id VARCHAR2(50) NOT NULL,
    location VARCHAR2(255),
    manager_name VARCHAR2(100),
    channel_type VARCHAR2(50),
    store_type VARCHAR2(100),
    opened_date DATE,
    insert_dt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    update_dt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX GOLD.idx_dim_store_nk ON GOLD.DIM_STORE(source_store_id);
```

**DML:**
```sql
MERGE INTO GOLD.DIM_STORE tgt
USING (
    SELECT 
        store_id, 
        location, 
        manager, 
        channel_type, 
        store_type,
        opened_date
    FROM SILVER.STORE_INFO
) src
ON (tgt.source_store_id = src.store_id)
WHEN MATCHED THEN
    UPDATE SET 
        tgt.location = src.location,
        tgt.manager_name = src.manager,
        tgt.channel_type = src.channel_type,
        tgt.store_type = src.store_type,
        tgt.update_dt = CURRENT_TIMESTAMP
    WHERE DECODE(tgt.manager_name, src.manager, 0, 1) = 1
       OR DECODE(tgt.channel_type, src.channel_type, 0, 1) = 1
       OR DECODE(tgt.store_type, src.store_type, 0, 1) = 1
WHEN NOT MATCHED THEN
    INSERT (source_store_id, location, manager_name, channel_type, store_type, opened_date)
    VALUES (src.store_id, src.location, src.manager, src.channel_type, src.store_type, src.opened_date);
```

### 3. GOLD.DIM_PRODUCT

**DDL:**
```sql
CREATE TABLE GOLD.DIM_PRODUCT (
    product_sk NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    source_system VARCHAR2(50) DEFAULT 'NetSuite' NOT NULL,
    source_product_id VARCHAR2(50) NOT NULL,
    sku VARCHAR2(100),
    product_name VARCHAR2(255),
    category VARCHAR2(100),
    current_cost_price NUMBER(15,2),
    current_retail_price NUMBER(15,2),
    insert_dt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    update_dt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX GOLD.idx_dim_prod_nk ON GOLD.DIM_PRODUCT(source_product_id);
```

**DML:**
```sql
MERGE INTO GOLD.DIM_PRODUCT tgt
USING (
    SELECT 
        product_id, 
        sku, 
        product_name, 
        category, 
        cost_price, 
        retail_price
    FROM SILVER.PRODUCT_CATALOG
) src
ON (tgt.source_product_id = src.product_id)
WHEN MATCHED THEN
    UPDATE SET 
        tgt.sku = src.sku,
        tgt.product_name = src.product_name,
        tgt.category = src.category,
        tgt.current_cost_price = src.cost_price,
        tgt.current_retail_price = src.retail_price,
        tgt.update_dt = CURRENT_TIMESTAMP
    WHERE DECODE(tgt.current_cost_price, src.cost_price, 0, 1) = 1
       OR DECODE(tgt.current_retail_price, src.retail_price, 0, 1) = 1
       OR DECODE(tgt.category, src.category, 0, 1) = 1
WHEN NOT MATCHED THEN
    INSERT (source_product_id, sku, product_name, category, current_cost_price, current_retail_price)
    VALUES (src.product_id, src.sku, src.product_name, src.category, src.cost_price, src.retail_price);
```

### 4. GOLD.DIM_VENDOR

**DDL:**
```sql
CREATE TABLE GOLD.DIM_VENDOR (
    vendor_sk NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    source_system VARCHAR2(50) DEFAULT 'Oracle Fusion' NOT NULL,
    source_vendor_id VARCHAR2(50) NOT NULL,
    vendor_name VARCHAR2(255),
    region VARCHAR2(100),
    rating NUMBER(3,1),
    onboarding_date DATE,
    insert_dt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    update_dt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX GOLD.idx_dim_vendor_nk ON GOLD.DIM_VENDOR(source_vendor_id);
```

**DML:**
```sql
MERGE INTO GOLD.DIM_VENDOR tgt
USING (
    SELECT 
        vendor_id, 
        vendor_name, 
        region, 
        rating, 
        onboarding_date
    FROM SILVER.SUPPLIERS
) src
ON (tgt.source_vendor_id = src.vendor_id)
WHEN MATCHED THEN
    UPDATE SET 
        tgt.vendor_name = src.vendor_name,
        tgt.region = src.region,
        tgt.rating = src.rating,
        tgt.update_dt = CURRENT_TIMESTAMP
    WHERE DECODE(tgt.rating, src.rating, 0, 1) = 1
       OR DECODE(tgt.region, src.region, 0, 1) = 1
WHEN NOT MATCHED THEN
    INSERT (source_vendor_id, vendor_name, region, rating, onboarding_date)
    VALUES (src.vendor_id, src.vendor_name, src.region, src.rating, src.onboarding_date);
```

---

### 5. GOLD.FACT_SALES

**DDL:**
```sql
CREATE TABLE GOLD.FACT_SALES (
    sales_fact_id NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    txn_id VARCHAR2(100),
    txn_timestamp TIMESTAMP,
    store_id VARCHAR2(50),
    product_id VARCHAR2(50),
    customer_id VARCHAR2(50),
    channel_type VARCHAR2(50),
    qty_sold NUMBER,
    unit_retail_price NUMBER(10,2),
    unit_cost_price NUMBER(10,2),
    total_sale_amount NUMBER(10,2),
    total_margin_amount NUMBER(10,2)
);
```

**DML:**
```sql
INSERT INTO GOLD.FACT_SALES (txn_id, txn_timestamp, store_id, product_id, customer_id, channel_type, qty_sold, unit_retail_price, unit_cost_price, total_sale_amount, total_margin_amount)
SELECT 
    pos.txn_id,
    pos.timestamp,
    pos.store_id,
    pos.product_id,
    so.customer_id, 
    si.channel_type,
    pos.qty_sold,
    pc.retail_price,
    pc.cost_price,
    pos.total_sale_amount,
    (pos.total_sale_amount - (pos.qty_sold * NVL(pc.cost_price, 0))) AS total_margin_amount
FROM SILVER.POS_TRANSACTIONS pos
LEFT JOIN SILVER.STORE_INFO si ON pos.store_id = si.store_id
LEFT JOIN SILVER.PRODUCT_CATALOG pc ON pos.product_id = pc.product_id
LEFT JOIN SILVER.SALES_ORDER so ON pos.store_id = so.store_id AND TRUNC(pos.timestamp) = so.date;
```

### 6. GOLD.FACT_INVENTORY_MOVEMENT

**DDL:**
```sql
CREATE TABLE GOLD.FACT_INVENTORY_MOVEMENT (
    inventory_fact_id NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    snapshot_date DATE,
    store_id VARCHAR2(50),
    product_id VARCHAR2(50),
    stock_on_hand NUMBER,
    reorder_level NUMBER,
    is_reorder_alert NUMBER(1),
    is_out_of_stock NUMBER(1)
);
```

**DML:**
```sql
INSERT INTO GOLD.FACT_INVENTORY_MOVEMENT (snapshot_date, store_id, product_id, stock_on_hand, reorder_level, is_reorder_alert, is_out_of_stock)
SELECT 
    TRUNC(last_stock_update) AS snapshot_date,
    store_id,
    product_id,
    stock_on_hand,
    reorder_level,
    CASE WHEN stock_on_hand <= reorder_level THEN 1 ELSE 0 END AS is_reorder_alert,
    CASE WHEN stock_on_hand <= 0 THEN 1 ELSE 0 END AS is_out_of_stock
FROM SILVER.INVENTORY;
```

### 7. GOLD.FACT_B2B_CONTRACTS

**DDL:**
```sql
CREATE TABLE GOLD.FACT_B2B_CONTRACTS (
    b2b_fact_id NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    partner_id VARCHAR2(50),
    contract_id VARCHAR2(50),
    opportunity_id VARCHAR2(50),
    region VARCHAR2(100),
    market_segment VARCHAR2(100),
    active_from DATE,
    expires_on DATE,
    annual_contract_value NUMBER(15,2),
    pipeline_amount NUMBER(15,2),
    pipeline_stage VARCHAR2(50),
    is_active NUMBER(1)
);
```

**DML:**
```sql
INSERT INTO GOLD.FACT_B2B_CONTRACTS (partner_id, contract_id, opportunity_id, region, market_segment, active_from, expires_on, annual_contract_value, pipeline_amount, pipeline_stage, is_active)
SELECT 
    a.partner_id,
    c.contract_id,
    dp.opportunity_id,
    dp.region,
    a.market_segment,
    c.active_from,
    c.expires_on,
    c.annual_value,
    dp.amount,
    dp.stage,
    CASE WHEN SYSDATE BETWEEN c.active_from AND c.expires_on THEN 1 ELSE 0 END AS is_active
FROM SILVER.ACCOUNT a
LEFT JOIN SILVER.CONTRACTS c ON a.partner_id = c.partner_id
LEFT JOIN SILVER.DEAL_PIPELINE dp ON a.partner_id = dp.opportunity_id; 
```

### 8. GOLD.FACT_SUPPLIER_FEEDS

**DDL:**
```sql
CREATE TABLE GOLD.FACT_SUPPLIER_FEEDS (
    feed_fact_id NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    record_date DATE,
    product_id VARCHAR2(50),
    supplier_id VARCHAR2(50),
    competitor_name VARCHAR2(100),
    available_qty NUMBER,
    competitor_list_price NUMBER(10,2)
);
```

**DML:**
```sql
INSERT INTO GOLD.FACT_SUPPLIER_FEEDS (record_date, product_id, supplier_id, competitor_name, available_qty, competitor_list_price)
SELECT 
    COALESCE(ss.restock_date, cp.date_captured) AS record_date,
    COALESCE(ss.product_id, cp.product_id) AS product_id,
    ss.supplier_id,
    cp.competitor_name,
    ss.available_qty,
    cp.list_price
FROM SILVER.SUPPLIER_STOCK ss
FULL OUTER JOIN SILVER.COMPETITOR_PRICING cp 
    ON ss.product_id = cp.product_id 
    AND ss.restock_date = cp.date_captured;
```

### 9. GOLD.FACT_PROCUREMENT

**DDL:**
```sql
CREATE TABLE GOLD.FACT_PROCUREMENT (
    procurement_fact_id NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    po_number VARCHAR2(50),
    vendor_id VARCHAR2(50),
    vendor_region VARCHAR2(100),
    creation_date DATE,
    po_status VARCHAR2(50),
    total_amount NUMBER(15,2),
    vendor_rating NUMBER(3,1)
);
```

**DML:**
```sql
INSERT INTO GOLD.FACT_PROCUREMENT (po_number, vendor_id, vendor_region, creation_date, po_status, total_amount, vendor_rating)
SELECT 
    ph.po_number,
    ph.vendor_id,
    s.region,
    ph.creation_date,
    ph.status,
    ph.total_amount,
    s.rating
FROM SILVER.PO_HEADERS ph
LEFT JOIN SILVER.SUPPLIERS s ON ph.vendor_id = s.vendor_id;
```