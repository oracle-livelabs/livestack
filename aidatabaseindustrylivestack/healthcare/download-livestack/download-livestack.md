# Download the LiveStack
## Introduction

This lab shows how to run the LiveStack in your own environment using the portable stack package and Podman Compose.

Estimated Time: 30 minutes

### Objectives

In this lab, you will:
- Download the portable LiveStack package.
- Extract and prepare the local environment file.
- Start the full application stack with Podman Compose.
- Validate the app and stop the stack cleanly.

## Task 1: Download the portable package

1. Download the package named `livestack-healthcare.zip` from the provided LiveStack distribution location.
2. Save the file to your machine.

Expected result:
- You have `livestack-healthcare.zip` available on your machine.

## Task 2: Move the package and prepare environment settings

> **Note:** Do not extract or run the stack from your `Downloads` folder. Create a new working directory and move `livestack-healthcare.zip` there first.

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
mv ~/Downloads/livestack-healthcare.zip .
<copy>
```

5. Extract the package:
    ```bash
<copy>
unzip livestack-healthcare.zip
<copy>
```

6. Move into the extracted folder:
    ```bash
<copy>
cd healthcare
<copy>
```

7. Create your runtime environment file:
    ```bash
<copy>
cp .env.example .env
<copy>
```

Expected result:
- You are inside the `healthcare` directory.
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
- The health check returns a healthy response.
- The LiveStack UI loads locally.

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

A portable runbook is what turns a LiveStack demo into a repeatable field asset. Podman Compose startup, health checks, and clear folder layout instructions reduce setup drift and let users replay the same story in their own environment.

## Credits & Build Notes
- **Author** - Oracle LiveStack Team
- **Last Updated By/Date** - Oracle LiveStack Team, 2026-05-13
