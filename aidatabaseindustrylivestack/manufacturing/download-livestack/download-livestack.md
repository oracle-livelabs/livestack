# Download the LiveStack

## Introduction

This lab shows how to run the Manufacturing Operations LiveStack in your own environment using the portable stack package and Podman Compose. The package starts Oracle Database Free, ORDS, Ollama, and the Node application container.

Estimated Time: 30 minutes

### Objectives

In this lab, you will:
- Download the portable Manufacturing Operations LiveStack package.
- Extract the bundle and review the runtime layout.
- Confirm or adjust the local `APP_PORT` setting.
- Start the full application stack with Podman Compose.
- Validate the health endpoint and stop the stack cleanly.

## Task 1: Download the portable package

1. Download the package named `livestack-manufacturing.zip` from the provided LiveStack distribution location.
2. Save the file to your machine.

Expected result:
- You have `livestack-manufacturing.zip` available on your machine.

## Task 2: Move the package and prepare environment settings

> **Note:** Do not extract or run the stack from your `Downloads` folder. Create a new working directory and move `livestack-manufacturing.zip` there first.

### For macOS or Linux

1. Open a terminal.

2. Create a new working directory outside of `Downloads`:
    ```bash
    <copy>
    mkdir -p ~/livestack-manufacturing
    <copy>
    ```

3. Move into the new working directory:
    ```bash
    <copy>
    cd ~/livestack-manufacturing
    <copy>
    ```

4. Move the downloaded package from `Downloads` into this directory:
    ```bash
    <copy>
    mv ~/Downloads/livestack-manufacturing.zip .
    <copy>
    ```

5. Extract the package:
    ```bash
    <copy>
    unzip livestack-manufacturing.zip
    <copy>
    ```

6. Move into the extracted folder:
    ```bash
    <copy>
    cd manufacturing
    <copy>
    ```

7. Create your runtime environment file if it is missing:
    ```bash
    <copy>
    cp -n .env.example .env
    <copy>
    ```

8. Confirm the application port. The package defaults to `APP_PORT=8505`; change this value in `.env` only if another service already uses that port.

Expected result:
- You are inside the `manufacturing` directory.
- The folder contains `compose.yml`, `.env`, `Containerfile`, `backend/`, `frontend/`, `db/`, `scripts/`, and `verification/`.
- The application port is known before startup.

## Task 3: Start the demo with Podman Compose

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
- Database, ORDS, Ollama, and app services start successfully.
- The health check returns a healthy response.
- The Manufacturing Operations LiveStack UI loads locally.

## Task 4: Stop the stack when finished

1. Stop and remove running containers:
    ```bash
    <copy>
    podman compose down
    <copy>
    ```

2. If you need to remove persistent demo data volumes for a clean rebuild, explicitly remove the named volumes after confirming you no longer need them.

Expected result:
- The local LiveStack is stopped cleanly.
- Persistent volumes remain unless you intentionally remove them.

## Task 5: Why this matters?

The download lab turns the Manufacturing Operations LiveStack into a repeatable field asset. Podman Compose startup, health checks, clear folder layout, and an explicit `APP_PORT` setting reduce setup drift and let teams replay the same manufacturing operations story in their own environment.

## Credits & Build Notes
- **Author** - LiveLabs Team
- **Last Updated By/Date** - LiveLabs Team, 2026-05-13
- **Source package** - `livestack-manufacturing.zip`
