# Create the OCI Base Image

This runbook creates the reusable Oracle Linux 9 base image for the Lakehouse
LiveStack. The build VM stages the application files, container images, and
offline dependencies. Application services and database setup run later when a
VM is provisioned from the image. Image preparation removes build credentials
and environment-specific runtime state before capture.

## Required Inputs

Prepare these files on your workstation:

- `inst.sh`
- `.env.kev`, populated with the build-environment values

Also have the following available:

- A fresh Oracle Linux 9 VM with at least 4 OCPUs, 44 GB RAM, and a 250 GB boot
  volume
- SSH access as `opc`
- Outbound HTTPS access for package, archive, and container-image downloads
- Oracle Container Registry credentials and an auth token

The installer configures the host firewall. Provisioned VMs also need the
appropriate OCI NSG or security list ingress for the services they use.

## 1. Build the Application Archives

Run this from the repository root on your workstation:

```bash
scripts/build-rc-zip.sh
```

The script builds `peakgear-release.zip` and `peakgear-host.zip` from the same
staged files and verifies both. Confirm that the command finishes with these
messages:

```text
RC archive verified
Manual upload required to Object Storage bucket livelabsfiles, folder peakgear/ai-lh-data/:
```

Manually upload `peakgear-release.zip` and `peakgear-host.zip` to that folder
using those exact filenames. The `BUILD_ARCHIVE_URL` value in `.env.kev` must
be the read-capable URL for the uploaded full archive during image build. For
provisioned instances, pass the host ZIP's read URL as `release_zip_url` in
Terraform instance metadata.

## 2. Check the Build Environment

Before copying `.env.kev`, check these build inputs:

- `BUILD_ARCHIVE_URL`: a working read URL for `peakgear-release.zip`.
- `GGSA_OSA_ARCHIVE_URL`: a working read URL for the GGSA/OSA installer ZIP.
- `GRAVITINO_ICEBERG_REST_SERVER_ARCHIVE_URL`: a working read URL or local path
  for the Gravitino archive.
- `CON_USER` and `CON_TOK`: valid Oracle Container Registry credentials for
  unattended login. Otherwise the installer prompts for interactive login.
- If `ENABLE_LIVELABS_FIRSTBOOT=true`, `LIVELABS_FIRSTBOOT_URL` must point to a
  reachable script. That optional script is executed during the build.

The following local OCI identity values may remain placeholders for image
staging: `pem_key_fingerprintlocal`, `user_ocidlocal`, `tenancy_ocidlocal`,
`compartment_ocidlocal`, `region_identifierlocal`, and `ai_endpoint_regionlocal`.
Keep `oci_auth_typelocal=api_key`. The installer does not validate these values
for staging; a deployed VM needs working runtime settings from metadata.

An ADB connection, wallet, and working GenAI credentials are not needed to
stage the image. If you separately start the stack on the build VM for a live
integration test, those services need valid configuration and credentials.

## 3. Copy the Build Inputs

Replace the IP address in this example:

```bash
scp inst.sh .env.kev opc@<BUILD_VM_IP>:/home/opc/
```

Only copy build inputs to a new, dedicated build VM. Do not reuse a provisioned
workshop VM as the image source.

## 4. Prepare the Files on the Build VM

Log in and rename `.env.kev` to the filename expected by `inst.sh`:

```bash
ssh opc@<BUILD_VM_IP>
cd /home/opc
mv .env.kev .env
chmod 600 .env
chmod 700 inst.sh
bash -n inst.sh
bash -n .env
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

The installer writes detailed output to `/home/opc/inst.log`. It builds and
caches the container images and Node dependencies, then installs and enables
`peakgear-release.service` for provisioned VMs. It does not start the
application stack as part of image staging.

If installation fails, inspect the log before rerunning:

```bash
tail -n 200 /home/opc/inst.log
```

## 6. Verify the Staged Image Inputs

After the installer succeeds, check the first-boot service, seeder image, and
three offline dependency volumes:

```bash
systemctl is-enabled peakgear-release.service
podman image exists localhost/iceberg-seeder:latest
podman volume exists ingestion_app-node-modules
podman volume exists ingestion_frontend-node-modules
podman volume exists ingestion_signal-generator-node-modules
```

The service should report `enabled`; the `podman` commands should exit
successfully. The preparation script performs the complete local preflight,
including all rendered Compose images and the required dependency files, before
it removes any runtime state. These checks do not test database connectivity,
GenAI, Data Transforms, or the running application. Verify those on a VM
provisioned from the captured image.

## 7. Immediately Before Image Capture

This is the destructive final step. Before deleting anything, the script checks
that every rendered Compose image is local, the Iceberg seeder image is built,
and the Node dependency volumes contain OracleDB, Vite, and KafkaJS. If any
artifact is missing, it exits without running Compose cleanup or removing
credentials.

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
For the HTTPS Terraform configuration, provide a valid `ociGenAiRegion`; its
default is empty. Confirm the relevant OCI API identity and key have the access
needed by the provisioned services.
The retained images and dependency volumes allow the application,
signal generator, and Iceberg seeder to start without public registry access.

Provisioning must supply OCI instance metadata `release_zip_url` for the host ZIP.
The image's `peakgear-release.service` downloads it, rejects unsafe ZIP
members, installs `init/` and `ingestion/`, then starts the user units. A failed
fetch or archive validation leaves the application stopped and is retried by systemd.

After capture, handle any disposable build credentials according to their
lifecycle. Retain the read-only URLs needed by provisioned VMs.
