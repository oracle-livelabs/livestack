# ERD (from `db/schema/01_tables.sql`)

Below is a Mermaid ER diagram generated from the foreign-key references defined in `01_tables.sql`.

> Tip: GitHub renders Mermaid diagrams automatically in Markdown.

```mermaid
erDiagram
    BRANDS {
        NUMBER brand_id PK
        VARCHAR2 brand_slug UK
    }

    PRODUCTS {
        NUMBER product_id PK
        NUMBER brand_id FK
        VARCHAR2 sku UK
    }

    FULFILLMENT_CENTERS {
        NUMBER center_id PK
    }

    INVENTORY {
        NUMBER inventory_id PK
        NUMBER product_id FK
        NUMBER center_id FK
        UNIQUE (product_id, center_id)
    }

    CUSTOMERS {
        NUMBER customer_id PK
        VARCHAR2 email UK
    }

    MANUFACTURING_WORK_ORDERS {
        NUMBER work_order_id PK
        NUMBER customer_account_id FK
        NUMBER assigned_plant_id FK
        NUMBER production_signal_id FK
    }

    MANUFACTURING_WORK_ORDER_LINES {
        NUMBER work_order_line_id PK
        NUMBER work_order_id FK
        NUMBER manufactured_part_id FK
        NUMBER assigned_plant_id FK
    }

    INFLUENCERS {
        NUMBER influencer_id PK
        VARCHAR2 handle UK
    }

    MANUFACTURING_PRODUCTION_SIGNALS {
        NUMBER production_signal_id PK
        NUMBER network_account_id FK
    }

    MANUFACTURING_SIGNAL_PART_MENTIONS {
        NUMBER signal_part_mention_id PK
        NUMBER production_signal_id FK
        NUMBER manufactured_part_id FK
        UNIQUE (production_signal_id, manufactured_part_id)
    }

    MANUFACTURING_DEMAND_FORECASTS {
        NUMBER demand_forecast_id PK
        NUMBER manufactured_part_id FK
    }

    SHIPMENTS {
        NUMBER shipment_id PK
        NUMBER work_order_id FK
        NUMBER center_id FK
    }

    AGENT_ACTIONS {
        NUMBER action_id PK
    }

    APP_USERS {
        NUMBER user_id PK
        VARCHAR2 username UK
    }

    %% Relationships (based on REFERENCES in 01_tables.sql)
    BRANDS ||--o{ PRODUCTS : has
    PRODUCTS ||--o{ INVENTORY : stocked_in
    FULFILLMENT_CENTERS ||--o{ INVENTORY : holds

    CUSTOMERS ||--o{ MANUFACTURING_WORK_ORDERS : requests
    FULFILLMENT_CENTERS ||--o{ MANUFACTURING_WORK_ORDERS : assigned_to

    MANUFACTURING_WORK_ORDERS ||--o{ MANUFACTURING_WORK_ORDER_LINES : contains
    PRODUCTS ||--o{ MANUFACTURING_WORK_ORDER_LINES : requires
    FULFILLMENT_CENTERS ||--o{ MANUFACTURING_WORK_ORDER_LINES : line_assigned_to

    INFLUENCERS ||--o{ MANUFACTURING_PRODUCTION_SIGNALS : originates
    MANUFACTURING_PRODUCTION_SIGNALS ||--o{ MANUFACTURING_SIGNAL_PART_MENTIONS : identifies
    PRODUCTS ||--o{ MANUFACTURING_SIGNAL_PART_MENTIONS : detected_in

    PRODUCTS ||--o{ MANUFACTURING_DEMAND_FORECASTS : forecasted

    MANUFACTURING_WORK_ORDERS ||--o{ SHIPMENTS : routes_via
    FULFILLMENT_CENTERS ||--o{ SHIPMENTS : dispatches
```

## Notes / limitations

* `manufacturing_work_orders.production_signal_id` has a declared FK to `manufacturing_production_signals.production_signal_id`.
* `agent_actions` and `app_users` have no declared FKs in `01_tables.sql`.
