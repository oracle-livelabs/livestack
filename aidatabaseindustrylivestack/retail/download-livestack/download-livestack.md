# Download the LiveStack

## Introduction

This lab shows how to run the Seer Sporting Goods Retail LiveStack from the portable package. The stack includes an Oracle database service, ORDS, Ollama, the Express API, and the React frontend served by the app container.

Estimated Time: 30 minutes

### Objectives

In this lab, you will:
- Download and extract `livestack-retail.zip`.
- Prepare the runtime environment file.
- Start the full stack with Podman Compose.
- Verify application health and open the UI.
- Stop the stack cleanly when finished.

## Task 1: Download the portable package

1. Download the package named `livestack-retail.zip` from the LiveStack distribution location.
2. Save the file to a working area where you keep demo assets.
3. Confirm that the archive extracts to a folder named `retail`.

Expected result:
- You have `livestack-retail.zip` available locally.
- The package contains `compose.yml`, `.env.example`, `Containerfile`, `backend`, `frontend`, `db`, `scripts`, and `verification`.

## Task 2: Prepare the working directory

Do not extract or run the stack directly from your Downloads folder. Create a clean working folder first.

### macOS or Linux

1. Open a terminal.
2. Create a working folder:

    ```bash
    <copy>
    mkdir -p ~/livestack-retail
    <copy>
    ```

3. Move into the folder:

    ```bash
    <copy>
    cd ~/livestack-retail
    <copy>
    ```

4. Move the downloaded package into the folder:

    ```bash
    <copy>
    mv ~/Downloads/livestack-retail.zip .
    <copy>
    ```

5. Extract the package:

    ```bash
    <copy>
    unzip livestack-retail.zip
    <copy>
    ```

6. Move into the extracted stack:

    ```bash
    <copy>
    cd retail
    <copy>
    ```

7. Create the runtime environment file:

    ```bash
    <copy>
    cp .env.example .env
    <copy>
    ```

Expected result:
- You are inside the `retail` directory.
- The directory contains `compose.yml`, `.env`, `backend`, `frontend`, and `db`.

## Task 3: Review the default ports

1. Open `.env`.
2. Confirm or adjust these defaults before startup:
- `APP_PORT=8505` for the browser-facing app.
- `PORT=3001` for the internal Express API listener.
- `DBPORT=1521` for Oracle Database.
- `ORDS_PORT=8181` for ORDS.
- `OLLAMA_PORT=11434` for the local AI runtime.

Expected result:
- The application URL will be `http://localhost:8505` unless you change `APP_PORT`.
- The health route will be `http://localhost:8505/api/health`.

## Task 4: Start the demo with Podman Compose

1. Start the services:

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
- Database, ORDS, Ollama, and the app services start successfully.
- The health route returns a healthy JSON response.
- The Seer Sporting Goods Retail LiveStack UI loads in the browser.

## Task 5: Stop the stack when finished

1. Stop and remove the running containers:

    ```bash
    <copy>
    podman compose down
    <copy>
    ```

2. Confirm that no `retail` stack containers are still running:

    ```bash
    <copy>
    podman compose ps
    <copy>
    ```

Expected result:
- The local LiveStack is stopped cleanly.
- The working directory remains available for the next demo run.

## Task 6: Why this matters?

The download lab makes the LiveStack repeatable. A presenter can start the same Oracle-backed retail story, verify it with a health route, open the same app URL, and shut it down cleanly without rebuilding the demo by hand.

## Credits & Build Notes
- **Author** - Oracle LiveStack Team
- **Last Updated By/Date** - Oracle LiveStack Team, 2026-05-13
- **Source package** - `livestack-retail.zip`
