# Healthcare LiveStack OCI Terraform Starter

This folder contains a Resource Manager-friendly Terraform starter for deploying the healthcare LiveStack on OCI. It creates cloud infrastructure only. It does not run `terraform plan`, `terraform apply`, OCI Resource Manager, or any live deployment from this repository.

## What This Stack Creates

- One VCN with a public app subnet and a private Ollama subnet.
- One public Compute VM for the healthcare app and optional local ORDS container.
- One private Compute VM for Ollama, started with the `llama3.2` model.
- One Autonomous AI Database for Developers using `db_version = "26ai"`, `is_dev_tier = true`, and `compute_count = 4`.
- Network security groups that expose only:
  - app HTTP port `8505` publicly,
  - SSH to the app VM from `ssh_ingress_cidr`,
  - ORDS on the app VM as localhost-only by default,
  - private app-to-Ollama traffic on `11434`,
  - app-to-Autonomous Database TCPS traffic on `1522`.

It intentionally does not create a load balancer, DNS records, TLS certificates, API Gateway, OKE, OCI Resource Manager jobs, generated wallets, private keys, `.env` files, `.tfvars`, or Terraform state files.

## Existing Compose Wiring Discovered

The current healthcare deployment is compose-based and uses four services:

| Compose service | Image/build | Exposed port | Purpose |
| --- | --- | --- | --- |
| `db` | `container-registry.oracle.com/database/free:latest` | `1521:1521` | Oracle AI Database Free, schema bootstrap, seed data, vector/graph/spatial objects |
| `ords` | `container-registry.oracle.com/database/ords:latest` | `8181:8080` | ORDS container, SQL Developer Web/schema enablement |
| `ollama` | `docker.io/ollama/ollama:latest` | `11434:11434` | Local model runtime, pulls `llama3.2` |
| `app` | local `Containerfile` | `8505:3001` | Node/Express API plus built React frontend |

Important environment defaults from `.env.example` and `compose.yml`:

- App: `NODE_ENV=production`, `PORT=3001`, `FRONTEND_URL=http://localhost:8505`
- Database: `ORACLE_USER=LIVESTACK`, `APP_SCHEMA_PASSWORD`, `ORACLE_CONNECTION_STRING=db:1521/FREEPDB1`
- ORDS: `CONN_STRING=db:1521/FREEPDB1`, `DBHOST=db`, `DBPORT=1521`, `DBSERVICENAME=FREEPDB1`
- Ollama: `OLLAMA_BASE_URL=http://ollama:11434`, `OLLAMA_MODEL=llama3.2`
- Pooling: `ORACLE_POOL_MIN=2`, `ORACLE_POOL_MAX=10`, `ORACLE_POOL_INCREMENT=1`
- Vector model: `ONNX_MODEL_FILENAME=all_MiniLM_L12_v2.onnx`

The React frontend uses same-origin `/api/*` calls. The Express app owns the API and connects directly to Oracle through `backend/config/database.js` using node-oracledb. ORDS is not in the normal app request path. ORDS is enabled separately by `scripts/enable_ords_schema.sh`.

Ask Healthcare Data is implemented in Express under `/api/selectai/*`. Despite the UI label, this path uses the local Ollama HTTP API for SQL generation and synthesis, with guarded Oracle SQL execution through the Express database pool. The default model is `llama3.2`.

## Database Bootstrap Flow

The local `db` container runs `scripts/bootstrap_db.sh` at startup. That script:

1. Waits for `FREEPDB1`.
2. Creates or refreshes the `LIVESTACK` schema.
3. Grants privileges for tables, views, procedures, roles, jobs, SODA, graph, spatial, VPD, auditing, and `DBMS_VECTOR`.
4. Downloads/stages `all_MiniLM_L12_v2.onnx` into `DATA_PUMP_DIR` when needed.
5. Runs core schema scripts: `01_tables.sql`, `02_json_collections.sql`, `03_graph.sql`, vector objects from `04_vector.sql`, `05_spatial.sql`, `10_care_pathway_graph.sql`, and `11_healthcare_semantic_views.sql`.
6. Runs the admin and schema sections from `06_security.sql`.
7. Loads seed data through `db/data/load_all_data.sql`.
8. Runs hydration for fulfillment zones, care pathway graph data, semantic views, and agent helper functions.

That flow does not translate perfectly to Autonomous Database because there is no local `SYSDBA` container bootstrap and wallet or server-TLS connection handling is different. This Terraform starter therefore provisions the database and writes app VM helper material, but leaves schema bootstrap as a reviewed operator step.

Do not run `db/schema/07_ai_profile.sql` as-is in OCI. The current file is a local demo artifact that includes a concrete credential block and OCIDs. Replace it with Resource Principal or a reviewed OCI credential workflow before using optional Select AI profiles.

## Compose-to-OCI Mapping

| Compose contract | OCI starter mapping |
| --- | --- |
| `db` service at `db:1521/FREEPDB1` | Autonomous AI Database for Developers 26ai public endpoint. The app uses the `autonomous_database_medium_connection_string` output as `ORACLE_CONNECTION_STRING`. |
| `ords` service at `ords:8080`, public host port `8181` | Optional ORDS container profile on the app VM. It is localhost-only in this simplified starter. Exposing port `8181` requires intentionally editing `local.expose_ords_public` after review. Autonomous Database managed ORDS URL is also output when available. |
| `ollama` service at `http://ollama:11434` | Private Ollama VM, reachable from the app VM as `http://<ollama_private_ip>:11434`. |
| `app` service at host `8505`, container `3001` | Public app VM writes a `compose.oci.yml` that builds the existing `Containerfile` and exposes `8505:3001`. |

The Terraform does not modify `compose.yml` or `compose.deploy.yml`.

## OCI Prerequisites

- An OCI tenancy and compartment where you can create VCN, subnet, NSG, Compute, NAT gateway, Internet gateway, and Autonomous Database resources.
- OCI Resource Manager or local Terraform with the OCI provider.
- A valid SSH public key for VM access.
- Compute shape quota for the selected app and Ollama shapes.
- Autonomous AI Database for Developers quota and regional support for `db_version = "26ai"`.
- A paid or upgraded tenancy. OCI rejects Autonomous AI Database for Developers and 26ai edition in Free-Tier-only accounts.
- Access to a clean healthcare source archive if you want cloud-init to download the app source automatically.
- A reviewed plan for ADB schema bootstrap, wallet handling if mTLS is required, and optional ORDS setup.

## Resource Manager Inputs

The Resource Manager form is intentionally small. Required inputs:

- `region`
- `compartment_ocid`
- `ssh_public_key`
- `adb_admin_password`

Optional inputs:

- `ssh_ingress_cidr`: default is open for convenience; narrow it.
- `app_ingress_cidr`: default exposes the app publicly; narrow it if possible.
- `stack_name`: display-name prefix; defaults to `healthcare-livestack`.
- `app_source_archive_url`: optional PAR or HTTPS URL for a clean healthcare source archive.

Everything else is fixed to the compose-compatible starter defaults: app port `8505`, ORDS port `8181` but localhost-only, Ollama port `11434`, model `llama3.2`, Oracle user `LIVESTACK`, Oracle Linux 9, app VM `2 OCPU / 16 GB`, Ollama VM `4 OCPU / 32 GB`, VCN `10.42.0.0/16`, Autonomous Database `HCSTACK26AI`, `26ai`, `OLTP`, ECPU, Developer tier, fixed 4 ECPUs and included developer storage, public endpoint, and server-TLS connections without wallet generation.

## Autonomous Database Profile

The default ADB profile intentionally targets Autonomous AI Database for Developers on 26ai:

- `adb_is_dev_tier = true`
- `adb_is_free_tier = false`
- `adb_private_endpoint_enabled = false`
- `adb_db_version = "26ai"`
- `adb_compute_model = "ECPU"`
- `adb_compute_count = 4`
- `adb_storage_gb = 20`

Do not run this profile in a Free-Tier-only account. The OCI API rejects Autonomous AI Database for Developers before the healthcare app VM can finish provisioning. Also do not add ADB private endpoint fields to this Developer profile; OCI documentation states this tier cannot be created inside a VCN. The storage value is still passed because the Terraform/API create call requires a `dataStorageSize` value for Autonomous AI Database.

## Local Terraform Validation

From this folder:

```bash
terraform fmt
terraform init -backend=false
terraform validate
```

`terraform init -backend=false` only initializes provider plugins for validation. Do not run `terraform plan` or `terraform apply` from this repository unless you intentionally want a live deployment.

## Manual Resource Manager Flow

1. Review the Terraform files in this folder.
2. Zip the contents of `healthcare/terraform` only. Do not include `.env`, wallets, private keys, `.tfvars`, `.terraform`, or state files.
3. In OCI Console, go to Developer Services > Resource Manager > Stacks.
4. Create a stack from the local zip.
5. Enter the four required Resource Manager variables. Optionally narrow the ingress CIDRs and set `app_source_archive_url`.
6. Run a Plan job and review all resources.
7. Run Apply only after manual review.

## After Apply

Use Terraform outputs:

- `healthcare_app_url`
- `app_ssh_command`
- `ollama_private_endpoint`
- `autonomous_database_name`
- `autonomous_database_ocid`
- `autonomous_database_medium_connection_string`
- `autonomous_database_public_endpoint`
- `autonomous_database_ords_url` when the provider returns it

On the app VM, cloud-init writes:

- `/opt/healthcare-livestack/oci-runtime.env`
- `/opt/healthcare-livestack/runtime/healthcare.env.template`
- `/opt/healthcare-livestack/runtime/compose.oci.yml`
- `/opt/healthcare-livestack/README-OCI-NEXT-STEPS.txt`

If `app_source_archive_url` was set, cloud-init extracts it to `/opt/healthcare-livestack/source/current`, copies `compose.oci.yml` there, and creates a placeholder `.env` from the template.

Before starting the app:

1. Bootstrap the `LIVESTACK` schema in Autonomous Database.
2. Copy or generate the ADB wallet only if you intentionally change the starter to require mTLS.
3. Fill `/opt/healthcare-livestack/source/current/.env` with `APP_SCHEMA_PASSWORD` and wallet settings if needed.
4. Start the app from the app VM:

```bash
cd /opt/healthcare-livestack/source/current
podman compose -f compose.oci.yml up -d --build app
```

Start local ORDS only after reviewing its ADB connection configuration:

```bash
podman compose -f compose.oci.yml --profile ords up -d ords
```

## Wallet and Credential Handling

This starter does not create `oci_database_autonomous_database_wallet` and does not write wallet content to Terraform state. If mTLS is required, generate the wallet from the OCI Console, OCI CLI, or a controlled post-apply process, then copy it to the app VM under `/opt/healthcare-livestack/wallet`.

The app already supports wallet-based connections through:

- `ORACLE_WALLET_LOCATION`
- `ORACLE_WALLET_PASSWORD`
- `ORACLE_CLIENT_DIR`

The simplified starter defaults to server-TLS connections without generated wallet material. Use the server-TLS MEDIUM connection string output as `ORACLE_CONNECTION_STRING`.

## Known Limitations and TODOs

- Terraform provisions infrastructure and bootstrap scaffolding, not a fully running healthcare app by default.
- ADB schema bootstrap requires review because the local compose bootstrap assumes a container-local `SYSDBA` path.
- The optional `scripts/bootstrap_adb_schema.sh` is a starter helper only; inspect it before running.
- ORDS on the app VM is provided as an optional compose profile. Autonomous Database managed ORDS may be preferable for SQL Developer Web.
- The default ADB profile requires a paid or upgraded tenancy that supports Autonomous AI Database for Developers and 26ai.
- Autonomous AI Database for Developers cannot be created inside a VCN, so this starter uses its public endpoint for ADB while keeping Ollama private.
- The local `07_ai_profile.sql` must be sanitized or replaced before optional Select AI profile use.
- ONNX model loading into ADB `DATA_PUMP_DIR` may require a manual file upload or Object Storage-based load path.
- The default architecture has no load balancer, DNS, TLS, autoscaling, backup policy customization, bastion service, or monitoring alarms.

## Deployment Validation After Apply

From the app VM after app startup:

```bash
curl -fsS http://127.0.0.1:8505/api/health
curl -fsS http://127.0.0.1:8505/api/selectai/health
curl -fsS http://<ollama-private-ip>:11434/api/tags
podman ps
```

From your workstation, after opening only the intended public access:

```bash
curl -fsS http://<app-public-ip>:8505/api/health
```

Then use the browser to check the healthcare scenes, Ask Healthcare Data, Agent Console, and Restore Demo flow.

## Destroy

Use Resource Manager Destroy from the same stack, or run `terraform destroy` only from a deliberate local Terraform workflow. Destroy removes the VCN, compute instances, NAT/Internet gateways, NSGs, and Autonomous Database created by this starter.
