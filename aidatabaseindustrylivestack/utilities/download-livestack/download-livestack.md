# Download the LiveStack

## Introduction

This lab explains how to run the **Seer Utility Network Energy and Utilities LiveStack** locally using the portable package and Podman Compose. It is intended for users who want to replay the demo outside the hosted environment and are comfortable running local container commands.

Estimated Time: **30 minutes**

### Objectives

In this lab, you will prepare and run the portable Energy and Utilities LiveStack locally, validate that the services are healthy, open the UI, and stop the stack cleanly when finished.

## Task 1: Download the portable package

Perform the following set of steps so the **Energy and Utilities LiveStack** can be run locally with the application, compose configuration, database initialization assets, and supporting runtime files.

1. Download the package named `livestack-utilities.zip` from the provided LiveStack distribution location.
2. Save the file to your machine.

The package contains the **Energy and Utilities LiveStack **application, compose configuration, database initialization assets, and supporting runtime files needed to run the demo locally.

## Task 2: Prepare the working directory

Do not extract or run the stack from your `Downloads` folder. Create a new working directory and move `livestack-utilities.zip` there first.

### For macOS or Linux

1. Open a terminal.

2. Create a new working directory outside of `Downloads`:
    ```bash
    <copy>
    mkdir -p ~/livestack-utilities-demo
    </copy>
    ```

3. Move into the new working directory:
    ```bash
    <copy>
    cd ~/livestack-utilities-demo
    </copy>
    ```

4. Move the downloaded package from `Downloads` into this directory:
    ```bash
    <copy>
    mv ~/Downloads/livestack-utilities.zip .
    </copy>
    ```

5. Extract the package:
    ```bash
    <copy>
    unzip livestack-utilities.zip
    </copy>
    ```

6. Move into the extracted folder:
    ```bash
    <copy>
    cd utilities
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

Start the stack with **Podman Compose** to launch the database, ORDS, Ollama runtime, and web application services needed for the local Energy and Utilities LiveStack.

1. Start the stack:
    ```bash
    <copy>
    podman compose up -d --build
    </copy>
    ```

2. Check container status:
    ```bash
    <copy>
    podman compose ps
    </copy>
    ```

3. Validate application health:
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

A successful local start means the UI loads, the Energy & Utilities scenes appear in the sidebar, the active dataset shows demo data, and the Ask Energy & Utilities Data page reports the configured runtime profile.

## Task 4: Stop the stack when finished

Stop the stack cleanly when the demo is finished so local containers and network resources are removed in an orderly way.

1. Stop and remove the running containers:
    ```bash
    <copy>
    podman compose down
    </copy>
    ```

The local LiveStack is stopped cleanly.

## Task 5: Why this matters?

1. Use the download lab to turn the guide into a repeatable field asset.
2. Confirm that every presenter can use the same archive name, extracted layout, app URL, health routes, startup command, and clean shutdown command.
3. Restore or reset the demo dataset from the application if you need to return the local environment to a known baseline after a custom utility-data walkthrough.

## Credits & Build Notes
- **Author** - Oracle LiveLabs Team
- **Last Updated By/Date** - Oracle LiveLabs Team, 2026-06-03
