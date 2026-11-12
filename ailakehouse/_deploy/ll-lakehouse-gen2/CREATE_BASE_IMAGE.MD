# Create the OCI Base Image

This runbook creates the reusable Oracle Linux 9 base image for the Lakehouse
LiveStack. The build VM uses temporary ADB, wallet, OCI, Object Storage, and PAR
credentials to install and validate the complete stack. Those credentials and
all environment-specific runtime state must be removed before image capture.

## Required Inputs

Prepare these files on your workstation:

- `inst.sh`
- `.env.kev`, populated with the build-environment values
- The ADB wallet ZIP referenced by `adbwallet` in `.env.kev`

Also have the following available:

- A fresh Oracle Linux 9 VM with at least 4 OCPUs, 44 GB RAM, and a 250 GB boot
  volume
- SSH access as `opc`
- Outbound HTTPS access for package, archive, and container-image downloads
- Oracle Container Registry credentials and an auth token
- OCI ingress for TCP `1525` so ADB Data Transforms can verify the Gravitino
  Iceberg REST connection

The installer configures the host firewall, but the OCI NSG or security list
must also allow required ingress.

## 1. Build and Upload the Application Archive

Run this from the repository root on your workstation:

```bash
scripts/build-rc-zip.sh
```

The script builds `peakgear-release.zip` and `peakgear-host.zip` from the same
staged files, verifies both, then uploads them by default, replacing the
previous objects at those names. It uses the write-capable PAR prefix in the
ignored `.par` file and verifies the uploaded bytes. Confirm that the command
finishes with these messages:
messages:

```text
RC archive verified
Uploaded peakgear-release.zip and verified its remote SHA-256.
Uploaded peakgear-host.zip and verified its remote SHA-256.
```

The `BUILD_ARCHIVE_URL` value in `.env.kev` must be the read-capable URL for the
uploaded full archive during image build. For provisioned instances, pass the
host ZIP's read URL as `release_zip_url` in Terraform instance metadata.

## 2. Check the Build Environment

Before copying `.env.kev`, confirm that it contains the build-server values for:

- `DBPASSWORD`
- `dbconnectionlocal`
- `dbnamelocal` or `SERVICE_NAME`
- `adbwallet`
- `BUILD_ARCHIVE_URL`
- `GGSA_OSA_ARCHIVE_URL`
- `GRAVITINO_ICEBERG_REST_SERVER_ARCHIVE_URL`
- `CON_USER` and `CON_TOK` for unattended Oracle Container Registry login
- `GRAVITINO_REST_PORT=1525`
- `GRAVITINO_HTTP_PORT=1525`
- `GRAVITINO_JDBC_USER=PG`
- The `GRAVITINO_OBJECT_STORAGE_*` and `GRAVITINO_S3_*` values
- `DATA_TRANSFORMS_ADB_AUTO_CONFIGURE=true`
- `DATA_TRANSFORMS_ADB_USERNAME=PG`
- `DATA_TRANSFORMS_ICEBERG_AUTO_CREATE=true`
- `DATA_TRANSFORMS_ICEBERG_CONNECTION_NAME=pg-iceberg`

The wallet filename and path must match `adbwallet` exactly, including case. For
example:

```bash
adbwallet="/home/opc/Wallet_lakehousepg.zip"
```

The wallet must belong to the configured ADB and its wallet password must match
`DBPASSWORD`.

The Data Transforms Oracle connection name is derived from the provisioned
`DBNAME`. Set `DATA_TRANSFORMS_ADB_CONNECTION_NAME` only when the platform-created
connection uses a different name. Its password is always taken from `DBPASSWORD`;
do not configure or preserve a second Data Transforms database password.

The `.par` file is needed only on the workstation for archive publishing. Do
not copy it to the build VM. The installer does not use it.

## 3. Copy the Build Inputs

Replace the IP address and wallet filename in this example:

```bash
scp inst.sh .env.kev Wallet_lakehousepg.zip opc@<BUILD_VM_IP>:/home/opc/
```

Only copy build inputs to a new, dedicated build VM. Do not reuse a provisioned
workshop VM as the image source.

## 4. Prepare the Files on the Build VM

Log in and rename `.env.kev` to the filename expected by `inst.sh`:

```bash
ssh opc@<BUILD_VM_IP>
cd /home/opc
mv .env.kev .env
chmod 600 .env Wallet_lakehousepg.zip
chmod 700 inst.sh
bash -n inst.sh
bash -n .env
```

Confirm that `adbwallet` references the wallet you copied:

```bash
grep '^adbwallet=' /home/opc/.env
ls -l /home/opc/Wallet_lakehousepg.zip
```

Do not print or copy the complete `.env` contents into logs, tickets, or chat.

## 5. Run the Installer

From `/home/opc`, execute:

```bash
./inst.sh
```

When both `CON_USER` and `CON_TOK` are populated, the installer uses them for a
non-interactive login to `container-registry.oracle.com`. The token is passed to
Podman through standard input and is not printed. If either value is absent, the
installer stops at the normal interactive login prompt and waits for your Oracle
email address and auth token.

The installer writes detailed output to `/home/opc/inst.log` and returns before
every container and one-shot bootstrap service has necessarily finished.

If installation fails, inspect the log before rerunning:

```bash
tail -n 200 /home/opc/inst.log
```

## 6. Wait for and Verify the Complete Stack

Monitor the services and containers:

```bash
systemctl --user status user-podman.service --no-pager
systemctl --user status pg-iceberg-connection.service --no-pager
systemctl --user status iceberg-seed.service --no-pager
systemctl --user --failed --no-pager
podman ps
```

Expected results:

- `user-podman.service` is active and the expected containers are running.
- `pg-iceberg-connection.service` completed successfully, updated the
  platform-created Oracle connection to use `PG`, verified `PG` as its default
  schema, and created or updated the `pg-iceberg` Data Transforms connection.
- `iceberg-seed.service` completed successfully and seeded
  `default.product_master_raw`, then created the ADB external table on top of it.
- No relevant unit appears in `systemctl --user --failed`.

Check the service logs when a one-shot service is still running or failed:

```bash
journalctl --user -u pg-iceberg-connection.service -n 200 --no-pager
journalctl --user -u iceberg-seed.service -n 200 --no-pager
```

Run the local smoke tests:

```bash
curl -fsS http://127.0.0.1:8505/api/health
curl -fsS http://127.0.0.1:8505/api/lakehouse/auto
curl -fsS http://127.0.0.1:1525/iceberg/v1/config
```

The application health request must succeed, the Lakehouse response must report
`"ok":true` and `"connected":true`, and the Gravitino request must return the
Iceberg REST configuration. Do not clean the VM until all required build and
bootstrap checks pass.

## 7. Immediately Before Image Capture

This is the destructive final step. Before deleting anything, the script verifies
that every rendered Compose image is local, the Iceberg seeder image is built,
the Node dependency volumes contain
OracleDB, Vite, and KafkaJS. If any artifact is missing, it exits without running
Compose cleanup or removing credentials.

After the preflight passes, it removes the build `.env`, wallet, generated OCI
and TLS keys, logs, compose containers, sensitive runtime volumes, attached
anonymous volumes, and environment-specific bootstrap markers. It also removes
persistent Podman and Docker-compatible registry authentication files. It
retains the built container images and exactly these three
offline dependency volumes:

- `ingestion_app-node-modules`
- `ingestion_frontend-node-modules`
- `ingestion_signal-generator-node-modules`

Run exactly:

```bash
systemctl --user stop pg-iceberg-connection.service iceberg-seed.service user-podman.service adb-load.service adb-wallet.service
cd /home/opc
./prepare-custom-image.sh
```

The cleanup must finish with:

```text
Done. Offline images and dependency volumes are retained; host payload and sensitive runtime state are removed.
```

Verify the cleaned state:

```bash
test ! -e /home/opc/init
test ! -e /home/opc/ingestion
test -e /home/opc/bootstrap/firstboot.py
test ! -e /home/opc/.env
test ! -e /home/opc/inst.log
test ! -e /home/opc/.oci
test ! -e /home/opc/.config/containers/auth.json
test ! -e /home/opc/.docker/config.json
podman image exists localhost/iceberg-seeder:latest
test -z "$(podman ps --all --filter label=io.podman.compose.project=ingestion -q)"
podman volume exists ingestion_app-node-modules
podman volume exists ingestion_frontend-node-modules
podman volume exists ingestion_signal-generator-node-modules
podman volume ls --filter label=io.podman.compose.project=ingestion --format '{{.Name}}' | sort
```

The `test` commands produce no output when successful. The final command must
show exactly the three dependency volumes listed above and no runtime volume.
The cleanup script also verifies that no project container or unexpected
project-labeled volume remains.

Do not restart the services, rerun `inst.sh`, or boot the application after this
cleanup. Stop the VM and create the OCI custom image immediately. Newly
provisioned VMs must receive their real ADB, wallet, password, OCI, Object
Storage, and Data Transforms values through Terraform and OCI instance metadata.
The retained images and dependency volumes allow the application,
signal generator, and Iceberg seeder to start without public registry access.

Provisioning must supply OCI instance metadata `release_zip_url` for the host ZIP.
The image's `peakgear-release.service` downloads it, rejects unsafe ZIP
members, installs `init/` and `ingestion/`, then starts the user units. A failed
fetch or archive validation leaves the application stopped and is retried by systemd.

After the image has been captured, revoke or rotate all disposable build
credentials, customer secret keys, wallet material, passwords, and PAR URLs.
