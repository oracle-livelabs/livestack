# Download the LiveStack

## Introduction

This lab shows how to run the Seer Equity Bank Finance LiveStack from the portable package. Download [`livestack-finance.zip`](https://objectstorage.us-ashburn-1.oraclecloud.com/p/4Au3jJ-t8Wtw3LWyYsDMqQk2FdlXDvXCb1MYRS0J6P4QS-GCrv2YNOolWdtFMLZq/n/c4u04/b/livelabsfiles/o/livestack/livestack-finance.zip); it expands into a `finance/` working directory. Do not expect a nested `stack/` folder: `compose.yml`, `Containerfile`, `frontend/`, `backend/`, `db/`, `scripts/`, and `verification/` live at the `finance/` bundle root.

Estimated Time: 30 minutes

### Objectives

In this lab, you will:
- Prepare a clean working directory for the portable package.
- Download and extract [`livestack-finance.zip`](https://objectstorage.us-ashburn-1.oraclecloud.com/p/4Au3jJ-t8Wtw3LWyYsDMqQk2FdlXDvXCb1MYRS0J6P4QS-GCrv2YNOolWdtFMLZq/n/c4u04/b/livelabsfiles/o/livestack/livestack-finance.zip) into that directory.
- Start Oracle Database, ORDS, Ollama, and the finance application with Podman Compose.
- Validate the health endpoint and open the application.
- Stop the stack cleanly when the demo is complete.

## Task 1: Prepare the working directory

1. Create a clean folder outside of `Downloads`.

    ```bash
    <copy>
    mkdir -p ~/livestack-finance
    <copy>
    ```

2. Move into the folder.

    ```bash
    <copy>
    cd ~/livestack-finance
    <copy>
    ```

3. Move the downloaded archive into the folder.

    ```bash
    <copy>
    mv ~/Downloads/livestack-finance.zip .
    <copy>
    ```

Expected result:
- The file `livestack-finance.zip` is in a clean directory that will contain the extracted `finance/` bundle root.

## Task 2: Extract the package

1. Extract the archive.

    ```bash
    <copy>
    unzip livestack-finance.zip
    <copy>
    ```

2. Move into the extracted finance bundle.

    ```bash
    <copy>
    cd finance
    <copy>
    ```

3. Confirm that the archive expanded into the expected bundle root.

    ```bash
    <copy>
    ls compose.yml Containerfile frontend backend db scripts verification
    <copy>
    ```

Expected result:
- You see `compose.yml` in the `finance/` directory.
- You do not need to `cd stack`; the extracted `finance/` directory is the bundle root.

## Task 3: Start the LiveStack

1. Start all services.

    ```bash
    <copy>
    podman compose up -d --build
    <copy>
    ```

2. Watch the service state.

    ```bash
    <copy>
    podman compose ps
    <copy>
    ```

3. If this is the first run on the machine, allow time for the Oracle Database image, ORDS image, Ollama image, ONNX embedding model, and `llama3.2` model to download and warm up.

Expected result:
- The `db`, `ords`, `ollama`, and `app` services move toward a healthy state.
- The database bootstrap creates the `LIVESTACK` schema and loads the demo data automatically.
- The app service listens on host port `8505`.

## Task 4: Validate health and open the application

1. Check the application health endpoint.

    ```bash
    <copy>
    curl http://localhost:8505/api/health
    <copy>
    ```

2. Open the LiveStack UI in a browser.

    ```bash
    <copy>
    open http://localhost:8505
    <copy>
    ```

3. If you are not on macOS, open `http://localhost:8505` manually in your browser.

Expected result:
- The health check returns a healthy JSON response after Oracle is ready.
- The browser opens the Seer Equity Bank LiveStack with the control tower, left navigation, dataset action, and Oracle Internals panel.

## Task 5: Stop the stack when finished

1. Stop and remove running containers while preserving volumes.

    ```bash
    <copy>
    podman compose down
    <copy>
    ```

2. Use this command only when you intentionally want to delete the local Oracle and Ollama volumes for a complete reset.

    ```bash
    <copy>
    podman compose down -v
    <copy>
    ```

Expected result:
- `podman compose down` stops the local LiveStack cleanly.
- Demo data remains available on the next startup unless you use the explicit volume-removal command.

## Task 6: Why this matters?

The package is designed to be portable: one archive, one bundle directory, one compose file, and one browser URL. Keeping the startup command simple reduces setup drift, while the health endpoint confirms that the Oracle-backed app is ready before the demo starts.

## Credits & Build Notes
- **Author** - LiveLabs Team
- **Last Updated By/Date** - LiveLabs Team, 2026-05-11
- **Build Notes** - The local run path is derived from the current `livestack-finance.zip` archive and `finance/compose.yml`.
