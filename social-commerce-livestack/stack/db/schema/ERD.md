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

    ORDERS {
        NUMBER order_id PK
        NUMBER customer_id FK
        NUMBER fulfillment_center_id FK
        NUMBER social_source_id
    }

    ORDER_ITEMS {
        NUMBER item_id PK
        NUMBER order_id FK
        NUMBER product_id FK
        NUMBER fulfilled_from FK
    }

    INFLUENCERS {
        NUMBER influencer_id PK
        VARCHAR2 handle UK
    }

    SOCIAL_POSTS {
        NUMBER post_id PK
        NUMBER influencer_id FK
    }

    POST_PRODUCT_MENTIONS {
        NUMBER mention_id PK
        NUMBER post_id FK
        NUMBER product_id FK
        UNIQUE (post_id, product_id)
    }

    DEMAND_FORECASTS {
        NUMBER forecast_id PK
        NUMBER product_id FK
    }

    SHIPMENTS {
        NUMBER shipment_id PK
        NUMBER order_id FK
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

    CUSTOMERS ||--o{ ORDERS : places
    FULFILLMENT_CENTERS ||--o{ ORDERS : fulfills

    ORDERS ||--o{ ORDER_ITEMS : contains
    PRODUCTS ||--o{ ORDER_ITEMS : ordered
    FULFILLMENT_CENTERS ||--o{ ORDER_ITEMS : item_fulfilled_from

    INFLUENCERS ||--o{ SOCIAL_POSTS : creates
    SOCIAL_POSTS ||--o{ POST_PRODUCT_MENTIONS : mentions
    PRODUCTS ||--o{ POST_PRODUCT_MENTIONS : mentioned_in

    PRODUCTS ||--o{ DEMAND_FORECASTS : forecasted

    ORDERS ||--o{ SHIPMENTS : ships_via
    FULFILLMENT_CENTERS ||--o{ SHIPMENTS : dispatches
```

## Notes / limitations

* `orders.social_source_id` is commented as "FK to social_posts" in the SQL, but no FK constraint is declared in `01_tables.sql`, so it is shown as an unlinked attribute.
* `agent_actions` and `app_users` have no declared FKs in `01_tables.sql`.
