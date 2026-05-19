# Download the LiveStack

## Introduction

This lab shows how to run the SLED LiveStack from the portable `livestack-sled.zip` package. The bundle contains the application, database bootstrap scripts, ORDS setup, Ollama runtime, frontend build, and the guide you are reading.

Estimated Time: 30 minutes

### Objectives

In this lab, you will:
- Download the portable SLED package.
- Extract the bundle into a working directory outside of `Downloads`.
- Review and adjust runtime ports in `.env`.
- Start the full stack with Podman Compose.
- Validate the application health route and stop the stack cleanly.

## Task 1: Download the portable package

1. Download the package named `livestack-sled.zip` from the LiveStack distribution location.
2. Save the file to your machine.
3. Keep the zip file intact until you have moved it into a clean working directory.

Expected result:
- You have `livestack-sled.zip` available on your machine.

## Task 2: Move the package and prepare environment settings

> **Note:** Do not extract or run the stack from your `Downloads` folder. Create a working directory first so logs, volumes, generated files, and future edits stay together.

### For macOS or Linux

1. Open a terminal.

2. Create a working directory outside of `Downloads`:
    ```bash
    <copy>
    mkdir -p ~/livestack-demo
    <copy>
    ```

3. Move into the working directory:
    ```bash
    <copy>
    cd ~/livestack-demo
    <copy>
    ```

4. Move the downloaded package into this directory:
    ```bash
    <copy>
    mv ~/Downloads/livestack-sled.zip .
    <copy>
    ```

5. Extract the package:
    ```bash
    <copy>
    unzip livestack-sled.zip
    <copy>
    ```

6. Move into the extracted folder:
    ```bash
    <copy>
    cd sled
    <copy>
    ```

7. Create or refresh the runtime environment file if needed:
    ```bash
    <copy>
    cp .env.example .env
    <copy>
    ```

Expected result:
- You are inside the `sled` directory.
- The folder contains `compose.yml`, `.env`, `.env.example`, `backend/`, `frontend/`, `db/`, and `scripts/`.

## Task 3: Review the default ports

1. Open `.env`.
2. Confirm the default app port:
    ```bash
    <copy>
    grep '^APP_PORT=' .env
    <copy>
    ```
3. Keep `APP_PORT=8505` for the portable default, or change it if that port is already in use on your machine.
4. If you change `APP_PORT`, also update `FRONTEND_URL` to the same browser URL.

Expected result:
- The app port in `.env` matches the URL you plan to open.
- For the extracted bundle defaults, the app URL is `http://localhost:8505`.

## Task 4: Start the demo with Podman Compose

1. Start all services:
    ```bash
    <copy>
    podman compose up -d --build
    <copy>
    ```

2. Check service status:
    ```bash
    <copy>
    podman compose ps
    <copy>
    ```

3. Verify application health:
    ```bash
    <copy>
    curl http://localhost:8505/api/health
    <copy>
    ```

4. Open the demo in a browser:
    `http://localhost:8505`

Expected result:
- Database, ORDS, Ollama, and app containers start successfully.
- The health endpoint returns a JSON response with `status` set to `healthy`.
- The SLED LiveStack UI loads in the browser.

## Task 5: Stop the stack when finished

1. Stop and remove the running containers:
    ```bash
    <copy>
    podman compose down
    <copy>
    ```

2. Confirm the services are no longer running:
    ```bash
    <copy>
    podman compose ps
    <copy>
    ```

Expected result:
- The local LiveStack is stopped cleanly.
- Persistent Podman volumes remain available for the next run unless you explicitly remove them.

## Task 6: Why this matters?

A portable SLED LiveStack lets a field team repeat the same service-operations story without rebuilding the environment by hand. The download workflow also gives operators a clear place to change ports, verify health, and prove that the application is backed by the full Oracle, ORDS, Ollama, and Node.js runtime rather than a static mockup.

## Credits & Build Notes
- **Author** - Oracle LiveStack Team
- **Last Updated By/Date** - Oracle LiveStack Team, 2026-05-13
- **Source bundle** - `livestack-sled.zip`
- **Runtime default** - `APP_PORT=8505` from the extracted `.env` and `.env.example`.
