# Download the LiveStack

## Introduction

This lab shows how to run the Seer Transport Fleet Logistics LiveStack in your own environment using the portable stack package and Podman Compose.

Estimated Time: 30 minutes

### Objectives

In this lab, you will:
- Download or copy the portable `livestack-transportation.zip` package.
- Extract the bundle into a clean working folder.
- Prepare the `.env` file from `.env.example`.
- Start Oracle Database Free, ORDS, Ollama, and the transportation app with Podman Compose.
- Validate the app at `http://localhost:8505` and stop the stack cleanly.

## Task 1: Download the portable package

1. Download the package named `livestack-transportation.zip` from the provided LiveStack distribution location.
2. Save the file to your machine.

Expected result:
- You have `livestack-transportation.zip` available on your machine.

## Task 2: Move the package and prepare environment settings

Note: Do not extract or run the stack from your `Downloads` folder. Create a new working directory and move `livestack-transportation.zip` there first.

### For macOS or Linux

1. Open a terminal.

2. Create a new working directory outside of `Downloads`:
    ```bash
<copy>
mkdir -p ~/livestack-transportation
<copy>
```

3. Move into the new working directory:
    ```bash
<copy>
cd ~/livestack-transportation
<copy>
```

4. Move the downloaded package from `Downloads` into this directory:
    ```bash
<copy>
mv ~/Downloads/livestack-transportation.zip .
<copy>
```

5. Extract the package:
    ```bash
<copy>
unzip livestack-transportation.zip
<copy>
```

6. Move into the extracted folder:
    ```bash
<copy>
cd transportation
<copy>
```

7. Create your runtime environment file:
    ```bash
<copy>
cp .env.example .env
<copy>
```

### For Windows PowerShell

1. Open PowerShell.

2. Create a new working directory outside of `Downloads`:
    ```powershell
<copy>
New-Item -ItemType Directory -Path C:\LiveStack\transportation -Force
<copy>
```

3. Move into the new working directory:
    ```powershell
<copy>
Set-Location C:\LiveStack\transportation
<copy>
```

4. Copy the downloaded package into this directory:
    ```powershell
<copy>
Copy-Item "$env:USERPROFILE\Downloads\livestack-transportation.zip" .
<copy>
```

5. Extract the package:
    ```powershell
<copy>
Expand-Archive .\livestack-transportation.zip -DestinationPath .
<copy>
```

6. Move into the extracted folder:
    ```powershell
<copy>
Set-Location .\transportation
<copy>
```

7. Create your runtime environment file:
    ```powershell
<copy>
Copy-Item .env.example .env
<copy>
```

Expected result:
- You are inside the `transportation` directory.
- The folder contains `compose.yml` or `compose.yaml`, `.env`, and the required app files.

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
- The health check returns `status: healthy` after the database connection pool is ready.
- The Seer Transport Fleet Logistics LiveStack UI loads locally.

## Task 4: Stop the stack when finished

1. Stop and remove running containers:
    ```bash
<copy>
podman compose down
<copy>
```

Expected result:
- The local LiveStack is stopped cleanly.

## Task 5: Why this matters?

A portable runbook is what turns the transportation LiveStack into a repeatable field asset. Podman Compose startup, the `/api/health` check, and clear folder layout instructions reduce setup drift and let users replay the same fleet logistics story in their own environment.

## Credits & Build Notes
- **Author** - LiveLabs Team
- **Last Updated By/Date** - LiveLabs Team, 2026-05-13
