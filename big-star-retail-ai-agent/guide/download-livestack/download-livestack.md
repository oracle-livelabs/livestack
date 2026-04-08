# Download the LiveStack
## Introduction

This lab shows how to run the Big Star demo in your own environment using the portable stack package and Podman Compose.

Estimated Time: 30 minutes

### Objectives

In this lab, you will:
- Download the portable demo package.
- Extract and prepare the local environment file.
- Start the full application stack with Podman Compose.
- Validate the app and stop the stack cleanly.

## Task 1: Download the portable package

1. Download the package from:
[ll-demo-agent.zip](https://c4u04.objectstorage.us-ashburn-1.oci.customer-oci.com/p/EcTjWk2IuZPZeNnD_fYMcgUhdNDIDA6rt9gaFj_WZMiL7VvxPBNMY60837hu5hga/n/c4u04/b/livelabsfiles/o/livestack/ll-demo-agent.zip)

2. Save the file to your machine.

Expected result:
- You have `ll-demo-agent.zip` available on your machine.

## Task 2: Move the package and prepare environment settings

> **Note:** Do not extract or run the stack from your `Downloads` folder. Create a new working directory and move `ll-demo-agent.zip` there first, because some container tools such as Podman may not behave reliably when run from `Downloads`.

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
    mv ~/Downloads/ll-demo-agent.zip .
    <copy>
    ```

5. Extract the package:
    ```bash
    <copy>
    unzip ll-demo-agent.zip
    <copy>
    ```

6. Move into the extracted folder:
    ```bash
    <copy>
    cd ll-demo-agent
    <copy>
    ```

7. Create your runtime environment file:
    ```bash
    <copy>
    cp .env.example .env
    <copy>
    ```

### For Windows

1. Open Command Prompt or PowerShell.

2. Create a new working directory outside of `Downloads`:
    ```bat
    <copy>
    mkdir %USERPROFILE%\livestack-demo
    <copy>
    ```

3. Move into the new working directory:
    ```bat
    <copy>
    cd %USERPROFILE%\livestack-demo
    <copy>
    ```

4. Move the downloaded package from `Downloads` into this directory:
    ```bat
    <copy>
    move %USERPROFILE%\Downloads\ll-demo-agent.zip .
    <copy>
    ```

5. Extract the package:
    ```bat
    <copy>
    tar -xf ll-demo-agent.zip
    <copy>
    ```

6. Move into the extracted folder:
    ```bat
    <copy>
    cd ll-demo-agent
    <copy>
    ```

7. Create your runtime environment file:
    ```bat
    <copy>
    copy .env.example .env
    <copy>
    ```

Expected result:
- You are inside the `ll-demo-agent` directory.
- The folder contains `compose.yaml`, `.env`, and all required app files.

## Task 3: Start the demo with Podman Compose

### For macOS or Linux

1. Start all services:
    ```bash
    <copy>
    podman compose up -d
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
    curl http://localhost:5500/api/health
    <copy>
    ```

4. Open the demo in a browser:
    `http://localhost:5500`

### For Windows

1. Start all services:
    ```bat
    <copy>
    podman compose up -d
    <copy>
    ```

2. Check service status:
    ```bat
    <copy>
    podman compose ps
    <copy>
    ```

3. Verify application health in PowerShell:
    ```powershell
    <copy>
    Invoke-RestMethod http://localhost:5500/api/health
    <copy>
    ```

4. Open the demo in a browser:
    `http://localhost:5500`

Expected result:
- Database, ORDS, Ollama, and app services start successfully.
- Health check returns `status: ok`.
- The Big Star UI loads locally.

## Task 4: Stop the stack when finished

1. Stop and remove running containers:
    ```bash
    <copy>
    podman compose down
    <copy>
    ```

Expected result:
- The local demo stack is stopped cleanly.

## Task 5: Why this matters?

A portable runbook is what turns a demo into a repeatable field asset. By packaging the application and startup flow into a Podman Compose stack, teams can reproduce the same scenario in customer-adjacent environments with less setup drift and fewer handoffs. This makes it easier to validate value quickly, support workshops consistently, and move from guided demo sessions to practical self-service enablement.

## Credits & Build Notes
- **Author** - LiveLabs Team
- **Last Updated By/Date** - LiveLabs Team, March 2026