# Deploy Manufacturing LiveStack with OCI Resource Manager

## Introduction

This lab deploys the Seer Manufacturing LiveStack through **OCI Resource Manager** using its Terraform configuration. The deployment creates an Oracle Autonomous AI Database 26ai instance, an Oracle Linux application VM, private delivery storage, and the network resources needed for the demo.

The application uses native `DBMS_CLOUD_AI` and `DBMS_CLOUD_AI_AGENT` with OCI Generative AI. It does not use a local model or a substitute AI response path.

Estimated time: 45-90 minutes, including Autonomous Database provisioning and application bootstrap.

### Objectives

In this lab, you will:

- Obtain the approved Manufacturing Resource Manager ZIP.
- Create and configure a Resource Manager stack.
- Run Plan and review the proposed resources before Apply.
- Deploy the Manufacturing LiveStack and verify its native-AI health.
- Open the application and validate governed Ask Manufacturing Data and Agent Console paths.
- Destroy the stack and verify that its billable resources are removed.

## Before you begin

You need:

- An OCI account and a compartment where you can create Resource Manager, Networking, Compute, Autonomous Database, and Object Storage resources.
- Permission to use OCI Generative AI in the selected compartment and selected Generative AI region.
- An OCI identity domain that contains the user running Plan, Apply, and Destroy. That user must have self-service API-key capability enabled and at least one free API-key slot.
- An SSH public key for the `opc` user on the application VM.
- Your trusted public IPv4 CIDRs for SSH and the unauthenticated demo application. Use a workstation or VPN egress address with `/32` where possible.
- Capacity for the selected flexible VM shape and Autonomous Database configuration.

This is a demo deployment. The application is HTTP-only and does not provide production authentication. Restrict application access to a trusted IPv4 CIDR and do not use sensitive production data.

> **Important:** Apply creates chargeable resources. Run Destroy when the demonstration is complete, including after a failed deployment that created resources.

## Architecture

Resource Manager creates the following topology:

```text
OCI Resource Manager
  |-- VCN, public subnet, internet gateway, route table, and NSGs
  |-- Autonomous AI Database 26ai with mTLS wallet
  |-- private Object Storage bucket for application delivery and callbacks
  |-- Oracle Linux 9 VM running the Manufacturing application in Podman
  `-- temporary public API-key registration for native Select AI bootstrap

Browser --> Manufacturing application :8505 --> ADB 26ai --> OCI Generative AI
```

During Apply, the VM installs its prerequisites, loads the Manufacturing schema and demo data, configures the `MANUFACTURING_SELECTAI_V1` profile, creates native advisory teams, builds the application container, and waits for `/api/health` to report database and native-AI readiness.

## Task 1: Obtain the approved Terraform package

The Manufacturing Resource Manager package is released as `manufacturing-livestack-terraform.zip`.

The public download URL will be added in a later release. Until then, obtain the approved ZIP from the workshop release owner and retain its published SHA-256 checksum with the file.

1. Save the ZIP in a clean working directory.

2. Confirm its checksum before uploading it.

    ```bash
    <copy>
    shasum -a 256 manufacturing-livestack-terraform.zip
    </copy>
    ```

3. Optionally inspect the archive without extracting it.

    ```bash
    <copy>
    unzip -l manufacturing-livestack-terraform.zip
    </copy>
    ```

Expected result:

- The archive contains root-level Terraform files, `schema.yaml`, cloud-init and bootstrap scripts, verification assets, and the nested Manufacturing application payload.

## Task 2: Create the Resource Manager stack

1. In the OCI Console, open **Developer Services**, then **Resource Manager**, then **Stacks**.

2. Select **Create stack**.

3. Select **My configuration** and upload `manufacturing-livestack-terraform.zip`.

4. Choose the OCI region and compartment for the stack resources, then create the stack.

5. On the stack details page, open the variable form generated from `schema.yaml`.

Expected result:

- Resource Manager recognizes the uploaded configuration and displays grouped inputs for location/access, compute sizing, and database/AI settings.

## Task 3: Configure deployment inputs

Provide the values requested by the Resource Manager form.

| Input | Guidance |
| --- | --- |
| Compartment | Use the compartment approved for this demonstration and OCI Generative AI access. |
| Operator identity domain | Select the domain containing the user who runs the jobs. Plan verifies the user and API-key capacity. |
| Availability domain | Select an availability domain with capacity for the application VM. |
| Resource name prefix | Use a unique, three-to-30-character prefix beginning with a letter. |
| SSH public key | Provide the OpenSSH public key that allows `opc` access to the VM. |
| SSH source CIDR | Restrict port 22 to a trusted IPv4 `/24` through `/32`; prefer your public egress `/32`. |
| Application source CIDR | Restrict port 8505 to trusted users; this is the main access boundary for the demo. |
| Bootstrap repair generation | Leave at `1` for a first deployment. Increment only for a planned repair that replaces the one-shot VM and bootstrap callbacks. |
| VM shape and sizing | Select a supported flexible shape and capacity appropriate for the application container. |
| ADB license, ECPUs, and storage | Choose values available to the tenancy. The default two ECPUs does not enable ADB In-Memory; the application reports declaration evidence separately from runtime availability. |
| ADB ADMIN password | Leave blank to generate one, or provide a compliant value without quotes, spaces, or `admin`. |
| Embedding model URI | Keep the approved prefilled value unless an approved replacement has been supplied. Treat it as sensitive. |
| OCI Generative AI region | Select a supported Command A region, such as `us-chicago-1` or `eu-frankfurt-1`. |

For a typical public Internet client, identify the public egress address before entering the CIDRs:

```bash
<copy>
curl -4 https://api.ipify.org
</copy>
```

Append `/32` to the returned address. A private RFC1918 address only works when browser traffic reaches OCI through a connected private network.

## Task 4: Run and review Plan

1. From the stack page, select **Plan**.

2. Wait for the job to complete, then review its log and proposed resources.

3. Confirm that the planned graph includes networking, an application VM, Autonomous AI Database 26ai, delivery storage, and the temporary public API-key registration.

4. Stop and correct the inputs if Plan reports identity-domain, API-key-capacity, quota, shape-capacity, CIDR, or OCI Generative AI access errors.

Expected result:

- Plan succeeds before any chargeable resources are created.
- The user, identity domain, and API-key preconditions are validated against the Resource Manager execution identity.

## Task 5: Apply the stack

1. Select **Apply** from the successful Plan.

2. Keep the job page open while the stack provisions. Apply can take 20-45 minutes and allows up to 90 minutes for full bootstrap readiness.

3. Do not treat a running job as a completed deployment. Apply succeeds only after the VM reports its deployment callback and the application health endpoint returns HTTP 200.

4. If Apply fails, use the stack outputs described in Task 7 to inspect the bootstrap state. Run Destroy before retrying a failed initial deployment that created resources.

Expected result:

- Resource Manager reports Apply as successful only after the database, native Select AI, native Agent Console dependencies, and application are ready.

## Task 6: Verify the deployed application

1. Open the stack **Outputs** tab.

2. Open `application_health_url`. It should return an HTTP 200 response that confirms database connectivity and native-AI readiness.

3. Open `application_url` in a browser. The URL includes port `8505`.

4. In **Ask Manufacturing Data**, ask: `Which open work orders have the greatest production risk?`

5. Use Show SQL, then Run SQL or narrative mode. Confirm that the generated SQL is a read-only query over a curated `MANUFACTURING_*_V` view and that the response identifies its model, region, and evidence.

6. Switch demo users and repeat a work-order or production-signal question. Confirm that results follow the selected user's VPD scope.

7. In **Manufacturing Agent Console**, run `MANUFACTURING_OPERATIONS_TEAM`. Confirm that the response identifies `DBMS_CLOUD_AI_AGENT`, `RUN_TEAM`, the selected model/region, and advisory/read-only status.

Expected result:

- The application is reachable only from the trusted application CIDR.
- Ask Data and Agent Console use native Oracle AI services and do not substitute local-model or deterministic responses when native services are unavailable.

## Task 7: Troubleshoot safely

Use the following Resource Manager outputs first:

- `first_boot_status_command` for the terminal bootstrap phase.
- `bootstrap_log_command` for recent cloud-init, database, native-AI, and application bootstrap messages.
- `application_ssh_command` for VM access from the trusted SSH CIDR.
- `select_ai_api_key_fingerprint` to identify the API key created by this stack.

Common recovery guidance:

- **Plan fails:** Verify the selected identity domain contains the applying user, self-service API-key access is enabled, a key slot is free, and the selected compartment permits OCI Generative AI.
- **No VM capacity:** Change the availability domain or select an approved flexible shape/sizing, then run a fresh Plan.
- **Application is unreachable:** Confirm the browser's public egress address matches `app_ingress_cidr`; do not broaden the CIDR beyond trusted users just to test access.
- **Bootstrap callback or health check fails:** Review the provided status and log commands. Do not paste passwords, wallet files, PAR URLs, or private keys into tickets or chat.
- **State is healthy but a repair is required:** Increment `bootstrap_generation`, review a new Plan, and Apply. This replaces the VM, rotates the temporary key/callbacks, and reloads the demo database.

If a failed Apply registered an API key, Resource Manager Destroy removes the Terraform-managed key. If Resource Manager state is unavailable, use the reported fingerprint and your organization's approved recovery procedure; never remove an API key based only on its age.

## Task 8: Destroy the demonstration stack

1. When the demo is complete, select **Destroy** from the Resource Manager stack.

2. Wait for the Destroy job to complete successfully.

3. Confirm that the stack no longer manages the application VM, ADB, network resources, delivery bucket/objects/PARs, or the temporary API key.

Expected result:

- The demonstration resources are removed and no longer accrue charges.

## Why this matters

The Terraform package makes the Manufacturing LiveStack reproducible as a managed OCI deployment. It replaces the local multi-container database and model topology with ADB 26ai, OCI Generative AI, native Select AI, native agents, and a single application VM while retaining the governed Manufacturing application experience.

## Credits & Build Notes

- **Author** - LiveLabs Team
- **Last Updated By/Date** - Oracle LiveLabs Team, 2026-07-30
