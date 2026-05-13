# Download the LiveStack

## Introduction

This lab shows how to run the Higher Education Student Success LiveStack from the portable package. The bundle starts Oracle Database Free, ORDS, Ollama, and the Node/React application with Podman Compose.

Estimated Time: 30 minutes

### Objectives

In this lab, you will:
- Download `livestack-highered.zip`.
- Extract the `highered` solution folder.
- Prepare `.env` from `.env.example`.
- Start the stack, verify health, open the application, and stop it cleanly.

## Task 1: Download the Portable Package

1. Download the package named `livestack-highered.zip` from the provided LiveStack distribution location.
2. Save the file to your machine.
3. Confirm that the extracted package contains `compose.yml`, `.env.example`, `backend/`, `frontend/`, `db/`, `scripts/`, and `verification/`.

Expected result:
- You have `livestack-highered.zip` available on your machine.
- The archive extracts to a folder named `highered`.

## Task 2: Prepare the Working Directory

> **Note:** Do not extract or run the stack from your `Downloads` folder. Create a working folder first so Compose volumes, generated files, and logs stay easy to manage.

### For macOS or Linux

1. Open a terminal.

2. Create a working directory:
    ```bash
    <copy>
    mkdir -p ~/livestack-highered
    <copy>
    ```

3. Move into the working directory:
    ```bash
    <copy>
    cd ~/livestack-highered
    <copy>
    ```

4. Move the package from Downloads:
    ```bash
    <copy>
    mv ~/Downloads/livestack-highered.zip .
    <copy>
    ```

5. Extract the package and enter the solution folder:
    ```bash
    <copy>
    unzip livestack-highered.zip
    cd highered
    <copy>
    ```

6. Create your runtime environment file:
    ```bash
    <copy>
    cp .env.example .env
    <copy>
    ```

### For Windows PowerShell

1. Open PowerShell.

2. Create a working directory:
    ```powershell
    <copy>
    New-Item -ItemType Directory -Force -Path C:\LiveStack\highered | Out-Null
    <copy>
    ```

3. Copy the package into the working directory:
    ```powershell
    <copy>
    Copy-Item -LiteralPath $env:USERPROFILE\Downloads\livestack-highered.zip -Destination C:\LiveStack\highered
    <copy>
    ```

4. Extract the package and enter the solution folder:
    ```powershell
    <copy>
    Expand-Archive -LiteralPath C:\LiveStack\highered\livestack-highered.zip -DestinationPath C:\LiveStack\highered -Force
    Set-Location C:\LiveStack\highered\highered
    <copy>
    ```

5. Create your runtime environment file:
    ```powershell
    <copy>
    Copy-Item -LiteralPath .env.example -Destination .env -Force
    <copy>
    ```

Expected result:
- You are inside the `highered` solution directory.
- The folder contains `compose.yml`, `.env`, `.env.example`, and the application source.

## Task 3: Review Ports and Start the Stack

1. Open `.env` and review the port settings.
2. By default, the packaged Compose file maps the application through `APP_PORT=8505` and the container listens on `PORT=3001`.
3. If port `8505` is already in use, change `APP_PORT` before starting the stack.
4. Start all services:
    ```bash
    <copy>
    podman compose up -d --build
    <copy>
    ```

5. Check service status:
    ```bash
    <copy>
    podman compose ps
    <copy>
    ```

Expected result:
- Database, ORDS, Ollama, and app containers start.
- The app container exposes host port `8505` unless you changed `APP_PORT`.

## Task 4: Verify Health and Open the App

1. Verify application health:
    ```bash
    <copy>
    curl http://localhost:8505/api/health
    <copy>
    ```

2. Open the demo in a browser:
    `http://localhost:8505`

3. If you changed `APP_PORT`, replace `8505` with your configured port.

Expected result:
- The health route returns a healthy JSON response.
- The Higher Education Student Success LiveStack UI loads in the browser.

## Task 5: Stop the Stack When Finished

1. Stop and remove running containers:
    ```bash
    <copy>
    podman compose down
    <copy>
    ```

2. Confirm no stack containers are still running:
    ```bash
    <copy>
    podman compose ps
    <copy>
    ```

Expected result:
- The local LiveStack is stopped cleanly.
- Compose volumes remain available unless you explicitly remove them.

## Task 6: Why this matters?

The download workflow turns the demo into a repeatable field asset. Clear archive handling, `.env` port control, Compose startup, health validation, and clean shutdown steps help teams replay the same higher education story in a local environment or a hosted demo environment.

## Credits & Build Notes
- **Author** - Oracle LiveStack Team
- **Last Updated By/Date** - Oracle LiveStack Team, 2026-05-13
- **Archive Name** - `livestack-highered.zip`
- **Default Local App URL** - `http://localhost:8505`
- **Default Health URL** - `http://localhost:8505/api/health`
