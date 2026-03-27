# Download the LiveStack

## Introduction

This lab shows how to run the Seer Sporting Goods demo in your own environment using the portable stack package and Podman Compose.

Estimated Time: 30 minutes

### Objectives

In this lab, you will:
- Download the portable demo package.
- Extract and prepare the local environment file.
- Start the full application stack with Podman Compose.
- Validate the app and stop the stack cleanly.

## Task 1: Download the portable package

1. Download the package from:
    [livestack_ll-seer-sporting-goods-vector.zip](https://objectstorage.us-ashburn-1.oraclecloud.com/n/c4u04/b/livelabsfiles/o/livestack%2Flivestack_ll-seer-sporting-goods-vector.zip)
2. Save the file to a local working directory.

Expected result:
- You have `livestack_ll-seer-sporting-goods-vector.zip` available on your machine.

## Task 2: Extract and prepare environment settings

1. Extract the package:
    ```bash
    unzip livestack_ll-seer-sporting-goods-vector.zip -d seer-sporting-goods-demo
    ```
2. Move into the extracted stack folder:
    ```bash
    cd seer-sporting-goods-demo/zebra-shopping-app/stack
    ```
3. Create your runtime environment file:
    ```bash
    cp .env.example .env
    ```

Expected result:
- The folder contains `compose.yml`, `.env.example`, `.env`, and all required app files.

## Task 3: Start the demo with Podman Compose

1. Start all services:
    ```bash
    podman compose -f compose.yml up -d
    ```
2. Check service status:
    ```bash
    podman compose -f compose.yml ps
    ```
3. Verify application health:
    ```bash
    curl http://localhost:5500 | head
    ```
4. Open the demo in a browser:
    `http://localhost:5500`

Expected result:
- Oracle AI Database, ORDS, Ollama, model initialization, and app services start successfully.
- The storefront returns HTML.
- The Seer Sporting Goods UI loads locally.

## Task 4: Stop the stack when finished

1. Stop and remove running containers:
    ```bash
    podman compose -f compose.yml down
    ```

Expected result:
- The local demo stack is stopped cleanly.

## Task 5: Why this matters?

A portable runbook turns this LiveStack into a reusable hands-on asset. By packaging the Seer Sporting Goods application and startup flow into a Podman Compose stack, you can reproduce the same semantic search, Database X-Ray, and semantic-cache walkthrough in your own environment with less setup drift. That makes it easier to test, learn from, and share the stack without depending on a guided session.

## Learn More

- [Introduction to Oracle AI Database Free](https://docs.oracle.com/en/database/oracle/oracle-database/26/xeinw/introduction.html) for the local free edition used in this take-home stack.
- [Connecting to Oracle AI Database Free](https://docs.oracle.com/en/database/oracle/oracle-database/26/xeinl/connecting-oracle-database-free.html) for service names and local connectivity basics such as `FREEPDB1`.
- [Overview of Oracle AI Vector Search](https://docs.oracle.com/en/database/oracle/oracle-database/26/vecse/overview-ai-vector-search.html) for the vector search capabilities that the local stack brings up.

## Credits & Build Notes

- **Author** - LiveLabs Team
- **Last Updated By/Date** - LiveLabs Team, March 2026
