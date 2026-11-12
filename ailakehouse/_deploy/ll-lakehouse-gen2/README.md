# LAKEHOUSE IMAGE BUILD

> **Experimental — use at your own risk.** This deployment is provided for
> experimentation and demonstration only. It is not a supported product or
> production reference architecture. You are responsible for validating the
> configuration, security, costs, data handling, and operational impact in your
> own environment. No support is provided.

Gen2 separates the stable VM image from host application releases. The image
contains container images and dependency caches; the host `init/` and
`ingestion/` trees are installed from the Object Storage host ZIP on first boot.

## Project Overview

**Purpose:** Automate setup and deployment of a fully functional LiveLabs workshop base image used for Demo Factory

For the complete base-image build and cleanup procedure, see
[`CREATE_BASE_IMAGE.MD`](CREATE_BASE_IMAGE.MD).

**Technology Stack:**
- Container Runtime: Podman/Podman Compose
- Base OS: Oracle Linux 9
- Ingestion directory
---

## Directory Structure

```
ll-lakehouse-gen2/
├── .env.example                # Secret-free standalone configuration template
├── inst.sh                     # Image-build installer
├── prepare-custom-image.sh     # Offline preflight and capture cleanup
├── bootstrap/                  # Baked first-boot downloader and system unit
├── scripts/                    # Release packaging and verification
├── ingestion/                  # Host Compose application and data scripts
│   └── compose.yml
└── init/                       # Host setup scripts and user units

```
---

## Bootstrap Workflow

Execution order when provisioning a new VM:

```
1. Copy .env.example          → /home/opc/.env and provide its values (standalone mode only)
2. inst.sh (image build)     → Install packages, bake all container images and Node dependencies
3. prepare-custom-image.sh  → Verify offline artifacts and remove init/ and ingestion/
4. peakgear-release.service → Fetch host ZIP, validate its contents, install host payload, start user units

```

---

## Key Files Reference

### Entry Points
| File | Description |
|------|-------------|
| `inst.sh` | Run first on fresh OCI VM - installs all dependencies |

## RC Packaging Helpers

Use these helpers from this directory before building a release-candidate image:

1. `scripts/build-rc-zip.sh`
2. `scripts/verify-rc-zip.sh`

The build script creates `peakgear-release.zip` for **building the reusable image** and `peakgear-host.zip` for first boot from the same staged files. It excludes environment files, wallets, credentials, dependency folders, and generated runtime state, verifies both archives, then uploads both. Each upload replaces the previous object at that name.

The host ZIP contains only `init/` and `ingestion/`. A provisioned instance validates it before installing either directory. A later host-only update can use `python3 scripts/build-host-payload-zip.py --upload`, provided its container image and dependency requirements remain compatible with the captured image.

Archive upload is enabled by default. The release build uses the write-capable
Object Storage PAR prefix in the ignored `.par` file and reads both uploaded ZIPs
back to verify they match the local files. Set `PAR_FILE` to use another PAR file.
Set `UPLOAD_ARCHIVE=false` to build both ZIPs locally without uploading. Never commit a PAR URL to
this repository or store it in the custom image. Uploading only writes the ZIP:
for an image build, `/home/opc/.env` or OCI metadata must provide
`BUILD_ARCHIVE_URL`, a read-capable URL for the full image-build ZIP. Provisioned
instances need `release_zip_url` metadata for the host payload ZIP. The URL
is an HTTPS Object Storage read PAR; keep it out of source control and logs.
With the fixed object name, a new VM receives whichever ZIP is at that URL when it boots. A failed download or unsafe ZIP member stops startup before user units are enabled.



## Environment Variables

## Deployment configuration

### Terraform, OCI Marketplace, and LiveLabs

No host-local object storage values are required for metadata-driven deployment. `init/variable.sh` uses OCI instance metadata first and only falls back to `/home/opc/.env` when metadata is unavailable. Terraform should provide the Gravitino bucket, warehouse prefix, S3-compatible endpoint, region, OCI customer-secret key values, and the Gravitino server archive URL as `gravitino_*` metadata keys.

### Image-build `.env` fallback

Copy `.env.example` to `/home/opc/.env`, replace every required build value,
and run `bash inst.sh` on the image-build VM. The installer protects the file
with owner-only permissions and stages offline container assets. It enables
only the system first-boot release unit. The provisioned VM needs Terraform
metadata for the release ZIP and ADB before application user units start.

The standalone permanent-deployment configuration must provide `adbwallet`,
`BUILD_ARCHIVE_URL`, `GGSA_OSA_ARCHIVE_URL`, and
`GRAVITINO_ICEBERG_REST_SERVER_ARCHIVE_URL`. The example supplies the global
Gravitino distribution; provide your own read-only build and GoldenGate URLs.
A base-image build uses the same artifact inputs, but LiveLabs initialization is
now explicit rather than implicit.
The custom image fixes the AIHUB choice made in `/home/opc/.env` during
`inst.sh`; Terraform metadata does not override it. PostgreSQL, Loyalty MySQL,
Data Sources, and the AWS Glue catalog integration are always included.
Set `AIHUB=true` only to include the optional MongoDB catalog source. With the
default `false`, MongoDB is neither started nor returned by Data Sources.
When OCI metadata is unavailable, `adbwallet` may be either a read-only HTTPS
PAR URL (recommended for unattended installs) or an absolute path to a wallet ZIP
already copied to the server, such as `/home/opc/Wallet_lakehousepg.zip`. The
fallback wallet's `ewallet.p12` must use `DBPASSWORD`; when `SERVICE_NAME` or
`dbnamelocal` is available, the wallet must also contain that service alias.
Setup fails and removes extracted state when a required check fails.
Metadata-driven custom images never use this fallback, including during a
temporary metadata outage.
The Gravitino archive must be the ADW-enabled Iceberg REST server distribution that
includes `org.apache.iceberg.adw.ADWCatalog`; it is staged during base-image
creation and baked into the `localhost/gravitino-iceberg-rest:adw` container
image. Public service URLs continue to use the existing `ifconfig.me` discovery;
no public-host value is required.

Before capturing a custom image, run
`/home/opc/prepare-custom-image.sh`. The script removes the build and generated
environment files, OCI and generated TLS private keys, ADB wallet state, and
compose containers and sensitive runtime volumes. It retains the built images
and Node dependency volumes required for an offline first boot, then removes
`init/` and `ingestion/`. Cleanup aborts before deleting anything if those offline
artifacts are incomplete. See `terraform-readme.md` for the exact cleanup and
verification checklist.

### Standalone fallback variables

### OCI Credentials
- `pem_keylocal` - Private key content
- `user_ocidlocal` - OCI user OCID
- `tenancy_ocidlocal` - Tenancy OCID
- `compartment_ocidlocal` - Compartment OCID
- `adb_ocidlocal` - Autonomous Database OCID

### Database
- `dbconnectionlocal` - Full connection string
- `DBPASSWORD` - Database password
- `dbnamelocal` - Database name
- `SERVICE_NAME` - Oracle service name
- `ordsurllocal` - ORDS endpoint URL

### External Services
- `mongodbapilocal` - MongoDB API endpoint
- `graphurllocal` - Oracle Graph endpoint
- `ai_endpoint_regionlocal` - OCI AI service region
- `GGSA_OSA_ARCHIVE_URL` - GoldenGate OSA installer archive URL (required by `inst.sh`)
- `BUILD_ARCHIVE_URL` - Read-only `peakgear-release.zip` URL for image build only
- `CON_USER` / `CON_TOK` - Optional Oracle Container Registry email and auth token; set both for unattended login, otherwise `inst.sh` prompts interactively
- `GRAVITINO_ICEBERG_REST_SERVER_ARCHIVE_URL` - ADW-enabled Gravitino Iceberg REST server archive URL (required by `inst.sh`)
- `GRAVITINO_JDBC_USER` / `GRAVITINO_JDBC_PASSWORD` - ADB catalog user for Gravitino, defaults to `PG` with `DBPASSWORD`
- `GRAVITINO_OBJECT_STORAGE_BUCKET`, `GRAVITINO_S3_ENDPOINT`, `GRAVITINO_S3_REGION`, `GRAVITINO_S3_ACCESS_KEY_ID`, `GRAVITINO_S3_SECRET_ACCESS_KEY` - OCI Object Storage S3-compatible warehouse settings for Iceberg
- `DATA_TRANSFORMS_ADB_AUTO_CONFIGURE` / `DATA_TRANSFORMS_ADB_USERNAME` - Update the platform-created Data Transforms Oracle connection to use `PG`; the password defaults to `DBPASSWORD` and can be overridden with `DATA_TRANSFORMS_PASSWORD`
- `DATA_TRANSFORMS_ADB_CONNECTION_NAME` - Optional override for the platform-created Oracle connection name; defaults to `DBNAME` and is also validated against the provisioned wallet JDBC alias
- `DATA_TRANSFORMS_ICEBERG_CONNECTION_NAME` - Data Transforms Apache Iceberg connection name, defaults to `pg-iceberg`
- `DATA_TRANSFORMS_BASE_URL` / `DATA_TRANSFORMS_ICEBERG_REST_URL` - Optional overrides when the Data Transforms base URL or public Gravitino REST URL cannot be derived
- `baseurllocal` - Oracle Database Actions base URL fallback used when Data Transforms URL derivation needs help
- `ENABLE_LIVELABS_FIRSTBOOT` / `LIVELABS_FIRSTBOOT_URL` - Disabled-by-default LiveLabs-only bootstrap; generic own-tenancy installs must leave it disabled
- `adbwallet` - Read-only HTTPS ADB wallet ZIP PAR URL, or an absolute path to a readable ZIP staged on the server (required when metadata is unavailable)

---


## Managing Services
```bash
# Check status
systemctl --user status user-podman
systemctl --user status pg-iceberg-connection.service

# Restart containers
systemctl --user restart user-podman

# Stop service
systemctl --user restart user-podman

# View logs
podman-compose -f /home/opc/ingestion/compose.yml logs -f
```

---
