# Take It Home: Run LiveStack with Podman Compose

## Introduction

This lab shows how to run the portable **Seer Tech High Tech Product Intelligence LiveStack** package in your own environment using Podman Compose.

Use this appendix when you want to take the same High Tech product-launch story home: Oracle Database, ORDS, Ollama, and the Seer Tech application run together so the local environment can support the same product, manufacturing, supply, commitment, analytics, Ask Data, and agent scenes from the guided runbook.

This guide is intended for technical users who can install Podman and run terminal commands. If you are new to containers, complete the Podman readiness checks before starting. If any readiness check fails, ask your workshop facilitator or system administrator for help before continuing.

Estimated Time: **30 minutes** for a local run, or **45 minutes** when deploying to an OCI Compute VM.

### Objectives

In this lab, you will:

- Download the portable LiveStack package.
- Confirm that Podman and Podman Compose are ready.
- Extract the package into a clean local working directory.
- Create a local runtime environment file from `.env.example`.
- Configure proxy settings only when your network requires them.
- Start Oracle Database, ORDS, Ollama, and the application with Podman Compose.
- Validate the application health endpoint and open the local LiveStack.
- Troubleshoot common startup, port, proxy, and first-run issues.
- Optionally deploy the same LiveStack package on an OCI Compute VM.
- Stop the stack cleanly when the demo is complete.

## Before you begin

Before starting, confirm that you have:

- Podman installed.
- Podman Compose support available.
  - On macOS or Windows, Podman Desktop is recommended.
  - On Linux, confirm that either `podman compose version` or `podman-compose version` works.
- A running Podman machine on macOS or Windows.
- Terminal access:
  - Terminal on macOS or Linux.
  - PowerShell on Windows.
- Internet access to pull container images and download required application or model assets.
- Enough local resources for database and model containers.
  - Recommended minimum: 8 CPU available for containers.
  - Recommended minimum: 16 GB RAM available for containers.
  - Recommended minimum: 150 GB free disk space.
  - Use larger limits if your package includes larger Ollama models or additional data.
- The required local application port available:
  - `8505` for the LiveStack application.


## New to Podman?

Podman is the local container runtime used by this LiveStack package. Podman Compose reads the `compose.yml` file and starts the required services together, including Oracle Database, ORDS, Ollama, and the LiveStack application.

If you are new to Podman, complete these checks before starting the lab.

### 1. Confirm Podman is installed

```bash
<copy>
podman --version
</copy>
```

Expected result:

- The command prints a Podman version.

### 2. Confirm compose support is available

```bash
<copy>
podman compose version
</copy>
```

If that command does not work, try:

```bash
<copy>
podman-compose version
</copy>
```

Expected result:

- One of the commands prints a compose version.

### 3. Start the Podman machine on macOS or Windows

Podman on macOS and Windows runs containers inside a lightweight Linux virtual machine. Start it before running the stack.

```bash
<copy>
podman machine start
</copy>
```

If the machine has not been created yet, create it first:

```bash
<copy>
podman machine init
podman machine start
</copy>
```

Expected result:

- The Podman machine starts successfully.

### 4. Run a quick container test

```bash
<copy>
podman run --rm hello-world
</copy>
```

Expected result:

- Podman pulls a small test image and prints a success message.

If this test fails, fix Podman setup before continuing with LiveStack.

## Task 1: Download the portable package

1. Download the LiveStack package using this [link](https://c4u04.objectstorage.us-ashburn-1.oci.customer-oci.com/p/EcTjWk2IuZPZeNnD_fYMcgUhdNDIDA6rt9gaFj_WZMiL7VvxPBNMY60837hu5hga/n/c4u04/b/livelabsfiles/o/livestack/livestack-hightech.zip).

2. Save or rename the file as `livestack.zip`.

Expected result:

- You have `livestack.zip` available on your machine.

## Task 2: Prepare the working directory

Do not extract or run the stack from your `Downloads` folder. Create a new empty working directory first. The package extracts its files into the current folder, so a clean directory keeps the LiveStack contents organized and avoids Podman issues caused by working from `Downloads`.

### For macOS or Linux

1. Open a terminal.

2. Create a new working directory outside of `Downloads`.

    ```bash
    <copy>
    mkdir -p ~/livestack
    </copy>
    ```

3. Move into the new working directory.

    ```bash
    <copy>
    cd ~/livestack
    </copy>
    ```

4. Move the downloaded package from `Downloads` into this directory.

    ```bash
    <copy>
    mv ~/Downloads/livestack.zip .
    </copy>
    ```

5. Extract the package.

    ```bash
    <copy>
    unzip livestack.zip
    </copy>
    ```

6. Confirm that you are in the directory that contains the compose file.

    ```bash
    <copy>
    ls
    </copy>
    ```

    Expected result:

    - You see `compose.yml` or `compose.yaml` in the current directory.

7. Create or refresh the runtime environment file.

    ```bash
    <copy>
    cp .env.example .env
    </copy>
    ```

### For Windows

1. Open PowerShell.

2. Create a new working directory outside of `Downloads`.

    ```powershell
    <copy>
    New-Item -ItemType Directory -Force -Path "$HOME\livestack" | Out-Null
    </copy>
    ```

3. Move into the new working directory.

    ```powershell
    <copy>
    Set-Location "$HOME\livestack"
    </copy>
    ```

4. Move the downloaded package from `Downloads` into this directory.

    ```powershell
    <copy>
    Move-Item "$HOME\Downloads\livestack.zip" .
    </copy>
    ```

5. Extract the package.

    ```powershell
    <copy>
    tar -xf .\livestack.zip
    </copy>
    ```

6. Move into the extracted LiveStack application folder.

    The High Tech package is expected to be extracted into a folder named `hightech`. If your archive tooling creates a different folder name, use that generated folder instead.

    ```powershell
    <copy>
    Set-Location .\hightech
    </copy>
    ```

    Example:

    ```powershell
    <copy>
    Set-Location .\hightech
    </copy>
    ```

7. Confirm that you are in the directory that contains the compose file.

    ```powershell
    <copy>
    Get-ChildItem
    </copy>
    ```

    Expected result:

    - You see `compose.yml` or `compose.yaml` in the current directory.

8. Create or refresh the runtime environment file.

    ```powershell
    <copy>
    Copy-Item .env.example .env -Force
    </copy>
    ```

Expected result:

- You are in a clean working directory outside `Downloads`.
- The extracted package contains `compose.yml` or `compose.yaml`, `.env.example`, application source files, database setup files, and supporting scripts.
- You created a local `.env` file from `.env.example`.

## Task 3: Configure proxy settings, if your network requires them

Most home, cloud VM, and unrestricted corporate networks do not need this step. Skip this task when your network allows direct access to container registries, npm, Object Storage, and Ollama model downloads.

1. If your network requires a proxy, configure the proxy in Podman or Podman Desktop before starting the stack. Image pulls happen before the compose containers exist, so Podman itself must be able to reach external registries.

2. Open `.env` and add proxy values if your environment requires them.

    ```env
    <copy>
    HTTP_PROXY=http://proxy.example.com:8080
    HTTPS_PROXY=http://proxy.example.com:8080
    http_proxy=http://proxy.example.com:8080
    https_proxy=http://proxy.example.com:8080
    </copy>
    ```

3. Keep local service names in `NO_PROXY` and `no_proxy`.

    ```env
    <copy>
    NO_PROXY=localhost,127.0.0.1,::1,db,ords,ollama,app,host.containers.internal
    no_proxy=localhost,127.0.0.1,::1,db,ords,ollama,app,host.containers.internal
    </copy>
    ```

Expected result:

- Podman can pull external images through the network proxy when one is required.
- Local compose services still talk to `db`, `ords`, `ollama`, and `app` directly on the internal Podman network.

## Task 4: Start the LiveStack with Podman Compose

1. If you are using Podman on macOS or Windows and your Podman machine is not already running, start it now.

    ```bash
    <copy>
    podman machine start
    </copy>
    ```

2. Confirm that you are in the directory that contains the compose file.

    ```bash
    <copy>
    ls compose.yml compose.yaml 2>/dev/null
    </copy>
    ```

    On Windows PowerShell, use:

    ```powershell
    <copy>
    Get-ChildItem compose.yml,compose.yaml -ErrorAction SilentlyContinue
    </copy>
    ```

3. Start all services.

    ```bash
    <copy>
    podman compose up -d --build
    </copy>
    ```

    If your environment uses the standalone `podman-compose` command, use:

    ```bash
    <copy>
    podman-compose up -d --build
    </copy>
    ```

4. Watch the service state.

    ```bash
    <copy>
    podman compose ps
    </copy>
    ```

    If your environment uses the standalone `podman-compose` command, use:

    ```bash
    <copy>
    podman-compose ps
    </copy>
    ```

Expected result:

- `db`, `ords`, `ollama`, and `app` move toward a healthy state.
- The initialization containers complete successfully.
- The application listens on the host port defined by the LiveStack package.

## Task 5: Understand first-run downloads

On a clean install, the first startup can take several minutes. The stack pulls container images, installs application dependencies, downloads and warms the configured Ollama models, and loads the ONNX embedding model used by Oracle vector search when the package includes one.

To avoid downloading the ONNX model at first run, place `all_MiniLM_L12_v2.onnx` in `db/data/onnx/` before starting the stack. The database bootstrap uses the packaged file before falling back to the configured `ONNX_MODEL_URL`.

Expected result:

- First-run startup time is expected to be longer than later restarts.
- Subsequent starts reuse the Podman volumes for Oracle data and Ollama models unless you remove the volumes.

## Task 6: Validate health and open the application

1. Check the application health endpoint.

    ```bash
    <copy>
    curl http://localhost:8505/api/health
    </copy>
    ```

2. Open the LiveStack UI in a browser.

    ```bash
    <copy>
    open http://localhost:8505
    </copy>
    ```

3. If you are not on macOS, open this URL manually in your browser:

    ```text
    <copy>
    http://localhost:8505
    </copy>
    ```

Expected result:

- The health check returns a healthy JSON response after Oracle is ready.
- The browser opens the LiveStack locally.

## Task 7: Stop the stack when finished

1. Stop and remove running containers while preserving volumes.

    ```bash
    <copy>
    podman compose down
    </copy>
    ```

    If your environment uses the standalone `podman-compose` command, use:

    ```bash
    <copy>
    podman-compose down
    </copy>
    ```

2. Use this command only when you intentionally want to delete the local Oracle and Ollama volumes for a complete reset.

    ```bash
    <copy>
    podman compose down -v
    </copy>
    ```

    If your environment uses the standalone `podman-compose` command, use:

    ```bash
    <copy>
    podman-compose down -v
    </copy>
    ```

Expected result:

- `podman compose down` stops the local LiveStack cleanly.
- Demo data and downloaded models remain available on the next startup unless you use the explicit volume-removal command.

## Troubleshooting

Use this section when the stack does not start, a service is unhealthy, the application does not open, or first startup appears to be slow.

### Check service status

```bash
<copy>
podman compose ps
</copy>
```

If your environment uses the standalone `podman-compose` command, use:

```bash
<copy>
podman-compose ps
</copy>
```

### View service logs

Database logs:

```bash
<copy>
podman compose logs db
</copy>
```

ORDS logs:

```bash
<copy>
podman compose logs ords
</copy>
```

Ollama logs:

```bash
<copy>
podman compose logs ollama
</copy>
```

Application logs:

```bash
<copy>
podman compose logs app
</copy>
```

Follow application logs in real time:

```bash
<copy>
podman compose logs -f app
</copy>
```

If your environment uses `podman-compose`, replace `podman compose` with `podman-compose` in the commands above.

### Port 8505 is already in use

The LiveStack application uses local port `8505`. If the application does not start or the browser opens another application, check whether another process is already using that port.

For macOS or Linux:

```bash
<copy>
lsof -i :8505
</copy>
```

For Windows PowerShell:

```powershell
<copy>
netstat -ano | Select-String ":8505"
</copy>
```

Stop the conflicting process or update the compose port mapping if your package supports changing it.

### First startup takes a long time

The first run can take several minutes because Podman may need to pull images, install dependencies, download Ollama models, initialize Oracle Database, and load model files. Later starts are usually faster because container images and volumes are reused.

Check progress with:

```bash
<copy>
podman compose logs -f db
podman compose logs -f ollama
podman compose logs -f app
</copy>
```

### Image pulls fail

If image pulls fail, check these items:

- Confirm that your machine has internet access.
- Confirm that Podman can pull a small public test image with `podman run --rm hello-world`.
- If your network requires a proxy, configure the proxy in Podman or Podman Desktop and update `.env` as described in Task 3.
- If you are on a corporate network or VPN, ask your network administrator whether container registry access is allowed.

### Health check is not ready

If `curl http://localhost:8505/api/health` does not return a healthy response immediately, wait for the database and application startup to finish, then try again.

Check logs with:

```bash
<copy>
podman compose logs db
podman compose logs app
</copy>
```

### Reset the stack

Stop containers but keep data and downloaded models:

```bash
<copy>
podman compose down
</copy>
```

Completely reset local data and downloaded models:

```bash
<copy>
podman compose down -v
</copy>
```

Use the volume-removal command only when you intentionally want a clean reset.

## Task 8: Deploy the LiveStack on an OCI Compute VM with Podman (Optional)

Use this task when you want to run the LiveStack on an OCI Compute VM instead of your laptop.

Prerequisites:

- A created Virtual Cloud Network (VCN).
- Security rules configured for the VM subnet.
- Ingress to TCP port `8505` allowed from your approved client CIDR.
- An OCI Compute VM running Oracle Linux 9.
- SSH access to the VM, using the private key paired with the public key added during VM creation.
- The LiveStack package download URL for your workshop.

1. SSH into the OCI VM from your local terminal.

    ```bash
    <copy>
    ssh -i ~/.ssh/<private-key-file> opc@<vm-public-ip>
    </copy>
    ```

2. Update the VM and install Podman plus common download tools.

    ```bash
    <copy>
    sudo dnf update -y
    sudo dnf install -y container-tools podman-docker unzip curl dnf-plugins-core
    podman --version
    </copy>
    ```

3. Install and enable Podman Compose support on Oracle Linux 9.

    ```bash
    <copy>
    sudo dnf install -y oracle-epel-release-el9
    sudo dnf config-manager --enable ol9_developer_EPEL
    sudo dnf install -y podman-compose
    podman compose version || podman-compose version
    </copy>
    ```

4. If the VM firewall is running, allow the LiveStack application port.

    ```bash
    <copy>
    if sudo systemctl is-active --quiet firewalld; then
      sudo firewall-cmd --permanent --add-port=8505/tcp
      sudo firewall-cmd --reload
    fi
    </copy>
    ```

5. Create a working directory on the VM.

    ```bash
    <copy>
    mkdir -p ~/livestack
    cd ~/livestack
    </copy>
    ```

6. Download the LiveStack package to the VM.

    ```bash
    <copy>
    curl -L -o livestack.zip "<livestack-package-url>"
    </copy>
    ```

7. Extract the package and move into the directory that contains the compose file.

    ```bash
    <copy>
    unzip livestack.zip
    COMPOSE_FILE="$(find . -maxdepth 3 \( -name compose.yml -o -name compose.yaml \) | head -n 1)"
    cd "$(dirname "$COMPOSE_FILE")"
    </copy>
    ```

8. Create the runtime environment file.

    ```bash
    <copy>
    cp .env.example .env
    </copy>
    ```

9. Confirm that the compose file exposes the application on port `8505`.

    ```bash
    <copy>
    grep -n "8505" compose.yml compose.yaml 2>/dev/null
    </copy>
    ```

    The application should be exposed on port `8505`. To reach it from your browser, both the OCI subnet security rules and the VM firewall must allow inbound TCP traffic on port `8505` from your approved client CIDR.

10. Start the LiveStack with Podman Compose.

    ```bash
    <copy>
    podman compose up -d --build || podman-compose up -d --build
    </copy>
    ```

11. Watch the service state from the VM.

    ```bash
    <copy>
    podman compose ps || podman-compose ps
    </copy>
    ```

12. Validate the application health endpoint from the VM.

    ```bash
    <copy>
    curl http://localhost:8505/api/health
    </copy>
    ```

13. Open the public LiveStack URL from your browser.

    ```text
    <copy>
    http://<vm-public-ip>:8505
    </copy>
    ```

Expected result:

- The OCI VM is running the LiveStack with Podman Compose.
- The application health endpoint responds locally on the VM.
- The LiveStack UI is reachable from your browser at `http://<vm-public-ip>:8505`.

## Why this matters

A portable LiveStack runbook turns this guide into something teams can reproduce instead of just read. By shipping the application as a Podman Compose package with a clear startup flow, you reduce environment drift, make scene validation repeatable, and give teams a practical way to explore the same Oracle-backed experience on macOS, Linux, Windows, and OCI Compute.

This guide is self-service for technical users who can install Podman and run terminal commands. Users who are new to containers should complete the Podman readiness checks before starting and ask for help if those checks fail.

## Credits and build notes

- **Author** - LiveLabs Team
- **Last Updated By/Date** - LiveLabs Team, 2026-06-04
