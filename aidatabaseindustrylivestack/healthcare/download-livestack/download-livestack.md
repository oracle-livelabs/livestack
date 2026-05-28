# Download the LiveStack

## Introduction

This lab shows how to run the Seer Health Network Healthcare LiveStack in your own environment using the portable stack package and Podman Compose. The local stack starts the database, ORDS, Ollama, and web application services so you can replay the same healthcare operations demo outside the hosted environment.

Estimated Time: 30 minutes

### Objectives

In this lab, you will:
- Download the portable Healthcare LiveStack package.
- Extract the package into a clean working directory.
- Prepare the runtime environment file.
- Start the full application stack with Podman Compose.
- Validate the application health endpoint and open the UI.
- Stop the stack cleanly after the demo.

## Task 1: Download the portable package

1. Download the package named `livestack-healthcare.zip` from the provided LiveStack distribution location.
2. Save the file to your machine.

The package contains the Healthcare LiveStack application, compose configuration, database initialization assets, and supporting runtime files needed to run the demo locally.

## Task 2: Prepare the working directory

Do not extract or run the stack from your `Downloads` folder. Create a new working directory and move `livestack-healthcare.zip` there first.

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
    mv ~/Downloads/livestack-healthcare.zip .
    </copy>
    ```

5. Extract the package:
    ```bash
    <copy>
    unzip livestack-healthcare.zip
    </copy>
    ```

6. Move into the extracted folder:
    ```bash
    <copy>
    cd healthcare
    </copy>
    ```

7. Create your runtime environment file:
    ```bash
    <copy>
    cp .env.example .env
    </copy>
    ```

Confirm that the folder contains `compose.yml` or `compose.yaml`, `.env`, and the required application files.

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

The UI should load as **Seer Health Network LiveStack**. The sidebar should show the Healthcare scenes, the active dataset should show demo data, and the Ask Healthcare Data page should report the configured runtime profile.

## Task 4: Stop the stack when finished

1. Stop and remove running containers:
    ```bash
    <copy>
    podman compose down
    </copy>
    ```

The local LiveStack is stopped cleanly.

## Credits & Build Notes
- **Author** - Oracle LiveLabs Team
- **Last Updated By/Date** - Oracle LiveLabs Team, 2026-05-22
