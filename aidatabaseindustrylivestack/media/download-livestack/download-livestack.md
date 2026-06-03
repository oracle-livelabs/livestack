# Download the LiveStack

## Introduction

This lab shows how to run the Media and Entertainment Content Intelligence LiveStack in your own environment using the portable stack package and Podman Compose. The local stack starts the database, ORDS, Ollama, and web application services so you can replay the same Seer Media demo outside the hosted environment.

Estimated Time: 30 minutes

### Objectives

In this lab, you will:
- Download the portable Media and Entertainment LiveStack package.
- Extract the package into a clean working directory.
- Prepare the runtime environment file.
- Start the full application stack with Podman Compose.
- Validate the application health endpoint and the Select AI runtime endpoint.
- Open the UI and stop the stack cleanly after the demo.

## Task 1: Download the portable package

1. Download the package named `livestack-media.zip` from the provided LiveStack distribution location.
2. Save the file to your machine.

The package contains the Media and Entertainment LiveStack application, compose configuration, database initialization assets, and supporting runtime files needed to run the demo locally.

## Task 2: Prepare the working directory

Do not extract or run the stack from your `Downloads` folder. Create a new working directory and move `livestack-media.zip` there first.

### For macOS or Linux

1. Open a terminal.

2. Create a new working directory outside of `Downloads`:

    ```bash
    <copy>
    mkdir -p ~/livestack-demo
    </copy>
    ```

3. Move into the new working directory:

    ```bash
    <copy>
    cd ~/livestack-demo
    </copy>
    ```

4. Move the downloaded package from `Downloads` into this directory:

    ```bash
    <copy>
    mv ~/Downloads/livestack-media.zip .
    </copy>
    ```

5. Extract the package:

    ```bash
    <copy>
    unzip livestack-media.zip
    </copy>
    ```

6. Move into the extracted folder:

    ```bash
    <copy>
    cd media
    </copy>
    ```

7. Create your runtime environment file:

    ```bash
    <copy>
    cp .env.example .env
    </copy>
    ```

Confirm that the folder contains `compose.yml` or `compose.yaml`, `.env`, and the required application files.

### For Windows PowerShell

1. Open PowerShell.

2. Create a new working directory:

    ```powershell
    <copy>
    New-Item -ItemType Directory -Force -Path C:\LiveStack\media | Out-Null
    </copy>
    ```

3. Copy the package into this directory:

    ```powershell
    <copy>
    Copy-Item "$env:USERPROFILE\Downloads\livestack-media.zip" C:\LiveStack\media\
    </copy>
    ```

4. Extract the package:

    ```powershell
    <copy>
    Expand-Archive C:\LiveStack\media\livestack-media.zip -DestinationPath C:\LiveStack\media -Force
    </copy>
    ```

5. Move into the extracted folder:

    ```powershell
    <copy>
    Set-Location C:\LiveStack\media\media
    </copy>
    ```

6. Create your runtime environment file:

    ```powershell
    <copy>
    Copy-Item .env.example .env
    </copy>
    ```

Expected result:
- You are inside the `media` directory.
- The folder contains `compose.yml` or `compose.yaml`, `.env`, and the required app files.

## Task 3: Start the demo with Podman Compose

1. Start all services:

    ```bash
    <copy>
    podman compose up -d --build
    </copy>
    ```

2. Check service status:

    ```bash
    <copy>
    podman compose ps
    </copy>
    ```

3. Verify application health:

    ```bash
    <copy>
    curl http://localhost:8505/api/health
    </copy>
    ```

4. Verify Select AI and runtime health:

    ```bash
    <copy>
    curl http://localhost:8505/api/selectai/health
    </copy>
    ```

5. Open the demo in a browser:

    ```text
    http://localhost:8505
    ```

Expected result:
- The `db`, `ords`, `ollama`, and `app` services start successfully.
- The health check returns a JSON response with `status` set to `healthy`.
- The Select AI health check returns the configured runtime profile and model status.
- The Seer Media LiveStack UI loads locally at `http://localhost:8505`.

## Task 4: Stop the stack when finished

1. Stop and remove running containers:

    ```bash
    <copy>
    podman compose down
    </copy>
    ```

2. If you need to remove local database and ORDS state for a clean rebuild, remove volumes intentionally:

    ```bash
    <copy>
    podman compose down -v
    </copy>
    ```

Expected result:
- The local LiveStack is stopped cleanly.
- Re-running `podman compose up -d --build` starts the same portable demo again.

## Task 5: Why this matters

1. Use the local run to explain that the portable package turns the Seer Media demo into a repeatable field asset.
2. Emphasize that a user can run the same Oracle-backed content-intelligence story locally, validate the health endpoint, and replay the workflow without relying on a shared hosted demo instance.

## Credits & Build Notes
- **Author** - Oracle LiveLabs Team
- **Last Updated By/Date** - Oracle LiveLabs Team, 2026-06-02
- **Application URL** - `http://localhost:8505`
- **Health URL** - `http://localhost:8505/api/health`
- **Select AI Health URL** - `http://localhost:8505/api/selectai/health`
