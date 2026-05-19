# Download the LiveStack
## Introduction

This lab shows how to run the Seer Comms Network Experience LiveStack in your own environment using the portable `livestack-telco.zip` package and Podman Compose. The stack includes Oracle Database Free, ORDS, Ollama, and the Seer Comms application container.

Estimated Time: 30 minutes

### Objectives

In this lab, you will:
- Download and extract the portable LiveStack package.
- Prepare the `.env` runtime file.
- Start the full application stack with Podman Compose.
- Validate the app on the configured local port.
- Stop the stack cleanly when finished.

## Task 1: Download the portable package

1. Download the package named `livestack-telco.zip` from the provided LiveStack distribution location.
2. Save the file to your machine.

Expected result:
- You have `livestack-telco.zip` available on your machine.

## Task 2: Move the package and prepare environment settings

> **Note:** Do not extract or run the stack from your `Downloads` folder. Create a new working directory and move `livestack-telco.zip` there first.

### For macOS or Linux

1. Open a terminal.

2. Create a new working directory outside of `Downloads`:
    ```bash
<copy>
mkdir -p ~/livestack-demo
<copy>
```

3. Move into the new working directory:
    ```bash
<copy>
cd ~/livestack-demo
<copy>
```

4. Move the downloaded package from `Downloads` into this directory:
    ```bash
<copy>
mv ~/Downloads/livestack-telco.zip .
<copy>
```

5. Extract the package:
    ```bash
<copy>
unzip livestack-telco.zip
<copy>
```

6. Move into the extracted folder:
    ```bash
<copy>
cd telco
<copy>
```

7. Create your runtime environment file:
    ```bash
<copy>
cp .env.example .env
<copy>
```

Expected result:
- You are inside the `telco` directory.
- The folder contains `compose.yml`, `.env`, `.env.example`, `Containerfile`, `backend/`, `frontend/`, and `db/`.
- The default `.env` publishes the app at `APP_PORT=8505`.

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
- The health check returns a healthy response after the Oracle schema bootstrap completes.
- The Seer Comms Network Experience UI loads locally.

## Task 4: Stop the stack when finished

1. Stop and remove running containers:
    ```bash
<copy>
podman compose down
<copy>
```

2. If you need to remove persistent data for a clean rebuild, remove the named volumes only after confirming you no longer need the local database state:
    ```bash
<copy>
podman compose down -v
<copy>
```

Expected result:
- The local LiveStack is stopped cleanly.
- Persistent data remains available unless you chose the volume-removal command.

## Task 5: Why this matters?

A portable runbook turns the Seer Comms demo into a repeatable field asset. Podman Compose startup, health checks, and a clear folder layout reduce setup drift so a team can replay the same network-experience story in a local environment.

## Credits & Build Notes
- **Author** - LiveLabs Team
- **Last Updated By/Date** - LiveLabs Team, 2026-05-13
