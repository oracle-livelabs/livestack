# Download the LiveStack

## Introduction

This lab shows how to run the Media & Entertainment Content Intelligence LiveStack in your own environment using the portable package and Podman Compose. The stack includes Oracle Database Free, ORDS, Ollama, and the Seer Media application.

Estimated Time: 30 minutes

### Objectives

In this lab, you will:
- Download the portable LiveStack package.
- Extract the package into a working folder.
- Create the runtime environment file.
- Start the database, ORDS, Ollama, and application services.
- Validate the app and stop the stack cleanly.

## Task 1: Download the portable package

1. Download the package named `livestack-media.zip` from the provided LiveStack distribution location.
2. Save the file to your machine.
3. Confirm the archive contains a top-level `media` folder.

Expected result:
- You have `livestack-media.zip` available on your machine.
- The archive expands into a `media` solution root that contains `compose.yml`, `.env.example`, `Containerfile`, `frontend`, `backend`, `db`, and `scripts`.

## Task 2: Prepare the working directory

> **Note:** Do not extract or run the stack from your `Downloads` folder. Create a new working directory and move the archive there first.

### For macOS or Linux

1. Create a working directory:

    ```bash
    <copy>
    mkdir -p ~/livestack-demo
    <copy>
    ```

2. Move into the working directory:

    ```bash
    <copy>
    cd ~/livestack-demo
    <copy>
    ```

3. Move the downloaded package into this directory:

    ```bash
    <copy>
    mv ~/Downloads/livestack-media.zip .
    <copy>
    ```

4. Extract the package and enter the solution root:

    ```bash
    <copy>
    unzip livestack-media.zip
    cd media
    <copy>
    ```

5. Create your runtime environment file:

    ```bash
    <copy>
    cp .env.example .env
    <copy>
    ```

### For Windows PowerShell

1. Create a working directory:

    ```powershell
    <copy>
    New-Item -ItemType Directory -Force -Path C:\LiveStack\media | Out-Null
    <copy>
    ```

2. Copy the package into the working directory:

    ```powershell
    <copy>
    Copy-Item "$env:USERPROFILE\Downloads\livestack-media.zip" C:\LiveStack\media\
    <copy>
    ```

3. Extract the package and enter the solution root:

    ```powershell
    <copy>
    Expand-Archive C:\LiveStack\media\livestack-media.zip -DestinationPath C:\LiveStack\media -Force
    Set-Location C:\LiveStack\media\media
    <copy>
    ```

4. Create your runtime environment file:

    ```powershell
    <copy>
    Copy-Item .env.example .env
    <copy>
    ```

Expected result:
- You are inside the `media` directory.
- The folder contains `compose.yml`, `.env`, and the required app files.

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
- The `db`, `ords`, `ollama`, and `app` services start successfully.
- The health check returns a JSON response with `status` set to `healthy`.
- The Seer Media LiveStack UI loads locally at `http://localhost:8505`.

## Task 4: Stop the stack when finished

1. Stop and remove running containers:

    ```bash
    <copy>
    podman compose down
    <copy>
    ```

2. If you need to remove local database and ORDS state for a clean rebuild, remove volumes intentionally:

    ```bash
    <copy>
    podman compose down -v
    <copy>
    ```

Expected result:
- The local LiveStack is stopped cleanly.
- Re-running `podman compose up -d --build` starts the same portable demo again.

## Task 5: Why this matters?

The portable package turns the Seer Media demo into a repeatable field asset. A user can run the same Oracle-backed content-intelligence story locally, validate the health endpoint, and replay the workflow without relying on a shared demo instance.

## Credits & Build Notes
- **Author** - Oracle LiveStack Team
- **Last Updated By/Date** - Oracle LiveStack Team, 2026-05-13
- **Archive Name** - `livestack-media.zip`
- **Application URL** - `http://localhost:8505`
- **Health URL** - `http://localhost:8505/api/health`
