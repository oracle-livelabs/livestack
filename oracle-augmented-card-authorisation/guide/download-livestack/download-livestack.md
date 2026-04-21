# Download the Augmented Bank LiveStack

## Introduction

This lab shows how to run the LiveStack in your own environment using the portable stack package and Podman Compose.

Estimated Time: 30 minutes

### Objectives

In this lab, you will:
- Download the portable package.
- Extract it into a clean local working directory.
- Create the local runtime environment file.
- Start the full stack with Podman Compose.
- Validate the app and stop the stack cleanly.

## Task 1: Download the portable package

1. Download the package from:
    [augmented-bank-livestack.zip](https://objectstorage.us-ashburn-1.oraclecloud.com/p/uDxOqph2yWR1SqN7FFs00ZL2NFTdYXpA2HTqD-RAJwej_J93bmZh5LoRaxkR-KKQ/n/c4u04/b/livelabsfiles/o/livestack/lloyds-bank-livestack.zip)

2. Save the file to your machine.

Expected result:
- You have `augmented-bank-livestack.zip` available on your machine.

## Task 2: Move the package and prepare environment settings

> **Note:** Do not extract or run the stack from your `Downloads` folder. Create a new empty working directory and move `augmented-bank-livestack.zip` there first. This package extracts its files directly into the current folder, so a clean directory keeps the LiveStack contents organized and avoids Podman issues caused by working from `Downloads`.

### For macOS or Linux

1. Open a terminal.

2. Create a new working directory outside of `Downloads`:
    ```bash
    <copy>
    mkdir -p ~/livestack-augmented-bank
    </copy>
    ```

3. Move into the new working directory:
    ```bash
    <copy>
    cd ~/livestack-augmented-bank
    </copy>
    ```

4. Move the downloaded package from `Downloads` into this directory:
    ```bash
    <copy>
    mv ~/Downloads/augmented-bank-livestack.zip .
    </copy>
    ```

5. Extract the package:
    ```bash
    <copy>
    unzip augmented-bank-livestack.zip
    </copy>
    ```

6. Create or refresh your runtime environment file:
    ```bash
    <copy>
    cp .env.example .env
    </copy>
    ```

### For Windows

1. Open PowerShell.

2. Create a new working directory outside of `Downloads`:
    ```powershell
    <copy>
    New-Item -ItemType Directory -Force -Path "$HOME\livestack-augmented-bank" | Out-Null
    </copy>
    ```

3. Move into the new working directory:
    ```powershell
    <copy>
    Set-Location "$HOME\livestack-augmented-bank"
    </copy>
    ```

4. Move the downloaded package from `Downloads` into this directory:
    ```powershell
    <copy>
    Move-Item "$HOME\Downloads\augmented-bank-livestack.zip" .
    </copy>
    ```

5. Extract the package:
    ```powershell
    <copy>
    tar -xf .\augmented-bank-livestack.zip
    </copy>
    ```

6. Create or refresh your runtime environment file:
    ```powershell
    <copy>
    Copy-Item .env.example .env -Force
    </copy>
    ```

Expected result:
- You are in a clean working directory outside `Downloads`.
- The directory now contains `compose.yml`, `.env`, `.env.example`, `backend/`, `frontend/`, `db/`, `scripts/`, and `Containerfile`.

## Task 3: Start the LiveStack with Podman Compose

1. If you are using Podman on macOS or Windows and your Podman machine is not already running, start it now:
    ```bash
    <copy>
    podman machine start
    </copy>
    ```

    > **Note:** The first run may take several minutes because `podman compose up -d --build` pulls the required Oracle Database Free, ORDS, and Ollama images, builds the application image, and then warms the local `llama3.2` and `gemma:2b` models automatically.

### For macOS or Linux

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

4. Open the LiveStack in a browser:
    `http://localhost:8505`

### For Windows

1. Start all services:
    ```powershell
    <copy>
    podman compose up -d --build
    </copy>
    ```

2. Check service status:
    ```powershell
    <copy>
    podman compose ps
    </copy>
    ```

3. Verify application health:
    ```powershell
    <copy>
    Invoke-RestMethod http://localhost:8505/api/health
    </copy>
    ```

4. Open the LiveStack in a browser:
    `http://localhost:8505`

Expected result:
- `db`, `ords`, `ollama`, and `app` are running.
- The health endpoint returns `status: ok`.
- The Augmented Bank UI loads locally.

## Task 4: Stop the stack when finished

1. Stop and remove the running containers:
    ```bash
    <copy>
    podman compose down
    </copy>
    ```

Expected result:
- The local LiveStack stops cleanly and can be started again from the same folder.

## Task 5: Why this matters?

A portable LiveStack runbook turns this guide into something teams can reproduce instead of just read. By shipping Augmented Bank as a Podman Compose package with a clear startup flow, you reduce environment drift, make scene validation repeatable, and give teams a practical way to explore the same Oracle-backed experience on macOS, Linux, and Windows.

## Credits & Build Notes

- **Author** - The LiveLabs Team
- **Last Updated By/Date** - The LiveLabs Team, April 2026
