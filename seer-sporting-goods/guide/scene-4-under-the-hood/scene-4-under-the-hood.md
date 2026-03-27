# Scene 4 Under The Hood

## Introduction

This scene is the deeper architecture walkthrough. If you want to understand how the LiveStack is assembled, you can trace the storefront behavior back to the compose services, bootstrap SQL, and Flask routes that support it.

Estimated Time: 10 minutes

### Objectives

In this lab, you will:
- Identify the services that make up the LiveStack.
- Inspect how product embeddings are created and stored.
- Map what you saw in the UI to the services and routes that support it.

## Task 1: Review the running services

1. Open a terminal and change to the stack folder:
    ```bash
    cd /Users/mkowalik/projects/codey/demo-factory/zebra-shopping-app/stack
    ```
2. Inspect the compose file:
    ```bash
    sed -n '1,220p' compose.yml
    ```
3. Call out the six main services:
    - `db`
    - `db-init`
    - `ords`
    - `ollama`
    - `init-brain`
    - `app`

    Expected result:
    - You can see that one compose file starts the database, model bootstrap, ORDS, LLM runtime, and Flask storefront together.

## Task 2: Inspect the vector bootstrap

1. Review the bootstrap SQL:
    ```bash
    sed -n '1,220p' sql/bootstrap.sql
    ```
2. Point out the in-database model load:
    ```sql
    dbms_vector.load_onnx_model(
        directory  => 'DEMO_PY_DIR',
        file_name  => 'all_MiniLM_L12_v2.onnx',
        model_name => 'demo_model'
    );
    ```
3. Point out the creation of the vectorized product table:
    ```sql
    create table products_vector as
        select p.prod_id,
               p.prod_name,
               p.prod_desc,
               p.prod_category_desc,
               p.prod_list_price,
               to_vector(
                   dbms_vector_chain.utl_to_embedding(
                       p.prod_desc,
                       json('{"provider":"database", "model":"demo_model"}')
                   )
               ) as embedding
          from products p;
    ```

    Expected result:
    - You can see that the product catalog is embedded inside Oracle AI Database before the storefront search runs.

## Task 3: Map the UI to Flask routes and SQL

1. Search the Flask app for the relevant SQL blocks and routes:
    ```bash
    rg -n "PRODUCT_SEARCH_SQL|SEMANTIC_CACHE_SEARCH_SQL|LLM_CACHE_INSERT_SQL|@app.route" app.py
    ```
2. Map the shopper flow:
    - `POST /` runs semantic catalog search against `products_vector`.
    - `POST /get_product_info` checks semantic cache, optionally calls the LLM, and stores the result.
    - `POST /clear_cache` resets `llm_cache` for a clean demo.
    - `POST /buy` is the storefront checkout stub.
3. Use this mapping to connect the visible UI actions to the stack components that produce them.

    Expected result:
    - You can connect every visible UI action to a specific Flask route and SQL block in the stack.

## Task 4: Why this matters

This scene makes the LiveStack easier to inspect and modify. Because the UI flow, SQL, and container services line up cleanly, you can move from observation to implementation without guessing where the behavior lives. That makes the stack easier to learn from, trust, and adapt in your own environment.

## Learn More

- [DBMS_VECTOR](https://docs.oracle.com/en/database/oracle/oracle-database/26/vecse/dbms_vector-vecse.html) for `LOAD_ONNX_MODEL` and other vector lifecycle operations used during bootstrap.
- [ONNX Pipeline Models: Text Embedding](https://docs.oracle.com/en/database/oracle/oracle-database/26/vecse/onnx-pipeline-models-text-embedding.html) for the model-loading pattern behind the in-database embedding workflow.
- [DBMS_VECTOR_CHAIN](https://docs.oracle.com/en/database/oracle/oracle-database/26/vecse/dbms_vector_chain-vecse.html) for the utilities used to turn product descriptions into embeddings stored in Oracle AI Database.

## Credits & Build Notes

- **Author** - LiveLabs Team
- **Last Updated By/Date** - LiveLabs Team, March 2026
