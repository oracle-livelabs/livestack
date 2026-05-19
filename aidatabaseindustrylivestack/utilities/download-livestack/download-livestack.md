# Download the LiveStack

## Introduction

This lab shows how to run the Energy and Utilities Grid Operations LiveStack locally from the portable archive.

Estimated Time: 35 minutes

### Objectives

In this lab, you will:
- Download the `livestack-utilities.zip` archive.
- Extract the `utilities` solution folder.
- Prepare the environment file and align the app port.
- Start the database, ORDS, Ollama, and application services with Podman Compose.
- Validate the app health endpoint and stop the stack cleanly.

## Task 1: Download the portable package

1. Download `livestack-utilities.zip` from the LiveStack distribution location.
2. Save it in a working folder dedicated to this demo.
3. Do not run the stack directly from your Downloads folder.

Expected result:
- The file `livestack-utilities.zip` is available in a clean working directory.

## Task 2: Extract the LiveStack

### macOS or Linux

1. Create and enter a working folder:
   ```bash
<copy>
mkdir -p ~/livestack-utilities-demo
cd ~/livestack-utilities-demo
<copy>
```

2. Move or copy the archive into this folder, then extract it:
   ```bash
<copy>
unzip livestack-utilities.zip
cd utilities
<copy>
```

### Windows PowerShell

1. Create and enter a working folder:
   ```powershell
<copy>
New-Item -ItemType Directory -Force -Path C:\LiveStack\utilities-demo
Set-Location C:\LiveStack\utilities-demo
<copy>
```

2. Copy the archive into this folder, then extract it:
   ```powershell
<copy>
Expand-Archive -LiteralPath .\livestack-utilities.zip -DestinationPath . -Force
Set-Location .\utilities
<copy>
```

Expected result:
- You are inside the extracted `utilities` folder.
- The folder contains `compose.yml`, `.env.example`, `.env`, `frontend`, `backend`, `db`, and `scripts`.

## Task 3: Prepare environment settings

1. If `.env` does not exist, create it from the example file:
   ```bash
<copy>
cp .env.example .env
<copy>
```

2. Open `.env` and confirm these app URL settings:
   ```text
<copy>
APP_PORT=8509
FRONTEND_URL=http://localhost:8509
<copy>
```

3. Leave database, ORDS, Ollama, and schema settings at their demo defaults unless your environment requires different ports.

Expected result:
- The public application URL is `http://localhost:8509`.
- The health route is `http://localhost:8509/api/health`.
- The app container still listens on internal port `3001`.

## Task 4: Start the demo with Podman Compose

1. Start the stack:
   ```bash
<copy>
podman compose up -d --build
<copy>
```

2. Check container status:
   ```bash
<copy>
podman compose ps
<copy>
```

3. Validate application health:
   ```bash
<copy>
curl http://localhost:8509/api/health
<copy>
```

4. Open the app in a browser:
   `http://localhost:8509`

Expected result:
- The database, ORDS, Ollama, and app services start successfully.
- The health endpoint returns a healthy response.
- The Energy and Utilities Grid Operations LiveStack loads in the browser.

## Task 5: Stop the stack when finished

1. Stop and remove the running containers:
   ```bash
<copy>
podman compose down
<copy>
```

2. To remove volumes as well, run this only when you want to reset database state:
   ```bash
<copy>
podman compose down -v
<copy>
```

Expected result:
- The LiveStack is stopped cleanly.
- Demo volumes remain available unless you chose the `-v` reset command.

## Task 6: Why this matters?

The download lab turns the guide into a repeatable field asset. It gives every presenter the same archive name, extracted layout, app URL, health route, startup command, and clean shutdown command.

## Credits & Build Notes
- **Author** - Oracle LiveStack Team
- **Last Updated By/Date** - Oracle LiveStack Team, 2026-05-13
- **Port note** - The README describes `http://localhost:8509`; confirm `.env` uses `APP_PORT=8509` and `FRONTEND_URL=http://localhost:8509` before startup.
