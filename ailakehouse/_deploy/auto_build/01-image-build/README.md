# AILakehouse Image Build

This is Stage 1: create a reusable OCI custom image, prove it works with fresh
Terraform-provisioned resources, then optionally inspect it. It does not create
a Marketplace listing or a Resource Manager ZIP.

## Folder Ownership

| Location | What belongs there |
| --- | --- |
| `../../ll-lakehouse/ingestion/` | Application code, Compose services, and application data. Edit this to change the demo. |
| `../../ll-lakehouse/init/` | First-boot scripts. They turn Terraform metadata into `/home/opc/ingestion/.env` and run the ADB bootstrap. |
| `01-edit/` | Public endpoint and dashboard-service declarations, plus ignored local Packer values. |
| `02-edit-if-needed/` | Extra installation, runtime configuration, cleanup, and behavior checks needed only by this LiveStack. |
| `03-automation/` | Shared Packer launcher, dashboard, build installer, and verification. Do not change it for normal application work. |
| `Terraform-Repo-Oracle/peak-gear-livestack/` | The paired Terraform project. It creates the ADB, protected runtime files, metadata, and clean test VM. |

Packer reads `ll-lakehouse/ingestion` and `ll-lakehouse/init` directly. It first
refuses local runtime material such as `.env`, wallets, OCI configuration, or
logs, so those values cannot enter a reusable image.

## Before Running

### Choose OCI Authentication

Use an existing API-key profile for builds that must run longer than a browser
session. This profile does not expire, and the automation validates it without
editing `~/.oci/config`:

```hcl
# 01-edit/packer.auto.pkrvars.hcl
oci_profile = "<existing-api-key-profile>"

# Terraform-Repo-Oracle/peak-gear-livestack/01-edit/terraform.tfvars
ociAuthMethod    = "APIKey"
ociConfigProfile = "<existing-api-key-profile>"
```

The selected profile must match `ociTenancyOcid` and `ociUserOcid`. It must
contain `tenancy`, `user`, `fingerprint`, and `key_file`, and must not contain
`security_token_file`.

Short-lived browser authentication is optional. Create it with a new profile
name that does not already exist, use that name in both files, and set
`ociAuthMethod = "SecurityToken"`. `oci session authenticate` creates or
replaces the named profile, so never give it the name of an API-key profile.

Create the two ignored local variable files from their templates:

```powershell
Copy-Item .\01-edit\packer.auto.pkrvars.hcl.example .\01-edit\packer.auto.pkrvars.hcl
Copy-Item ..\terraform\01-edit\terraform.tfvars.example ..\terraform\01-edit\terraform.tfvars
```

Packer requires an existing public subnet and a dedicated persistent Packer NSG.
That NSG must have exactly one ingress rule: TCP `22` from the runner's current
public IPv4 address with `/32`. It must not allow `0.0.0.0/0`. Terraform creates
and removes its separate test NSG for the application ports declared in
`terraform.tfvars`.

The Terraform variables must also set `additional_metadata.onnx_model_url` to
an approved direct-download URL for `all_MiniLM_L12_v2.onnx`. Keep the real URL
only in ignored `terraform.tfvars`; a pre-authenticated Object Storage URL is a
bearer credential and must never be committed.

## Run The Build

Run every command below from this `01-image-build` folder.

### 1. Validate Only

This checks the application source, Packer, Terraform, service catalog, and
endpoint declarations. It creates no OCI resources.

Windows:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\03-automation\build-and-test.ps1 -ImageName "my-livestack-v1" -ValidateOnly
```

macOS:

```bash
bash ./03-automation/build-and-test-macos.sh -ImageName "my-livestack-v1" -ValidateOnly
```

Linux:

```bash
bash ./03-automation/build-and-test-linux.sh -ImageName "my-livestack-v1" -ValidateOnly
```

### 2. Automatic Build And Acceptance Test

This is the normal path. Packer creates the image; Terraform launches it with
fresh ADB and VM metadata, verifies endpoints and application behavior, reboots
it, then removes the temporary test resources.

Windows:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\03-automation\build-and-test.ps1 -ImageName "my-livestack-v1"
```

macOS:

```bash
bash ./03-automation/build-and-test-macos.sh -ImageName "my-livestack-v1"
```

Linux:

```bash
bash ./03-automation/build-and-test-linux.sh -ImageName "my-livestack-v1"
```

### 3. Manual Capture Fallback

Use this only when Packer reports its OCI image-capture MIME error. It prepares
and preserves a running build VM so you can create a custom image in the OCI
Console. The VM is reachable by SSH using the private key whose public key is
set as `resUserPublicKey` in the paired Terraform Play `terraform.tfvars`. The
launcher finds that key under `~/.ssh`, or you can add `-SshPrivateKeyPath`.
Its temporary SSH access is removed automatically when you stop the VM for
image capture. This is not visual inspection and it does not yet have fresh
Terraform metadata.

Windows:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\03-automation\build-and-test.ps1 -ImageName "my-livestack-v1" -PrepareManualCapture
```

macOS:

```bash
bash ./03-automation/build-and-test-macos.sh -ImageName "my-livestack-v1" -PrepareManualCapture
```

Linux:

```bash
bash ./03-automation/build-and-test-linux.sh -ImageName "my-livestack-v1" -PrepareManualCapture
```

After the Console image is `Available`, test its image OCID through the normal
Terraform acceptance path:

Windows:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\03-automation\build-and-test.ps1 -ExistingImageOcid "ocid1.image..." -ImageName "my-livestack-v1"
```

macOS:

```bash
bash ./03-automation/build-and-test-macos.sh -ExistingImageOcid "ocid1.image..." -ImageName "my-livestack-v1"
```

Linux:

```bash
bash ./03-automation/build-and-test-linux.sh -ExistingImageOcid "ocid1.image..." -ImageName "my-livestack-v1"
```

### 4. Visual Inspection

Run this only after the image has passed the normal acceptance test. It creates
a separate VM using fresh Terraform metadata and leaves it running. The output
prints the application URLs, dashboard URL, generated login values, SSH command,
inspection ID, and the exact cleanup command.

Windows:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\03-automation\build-and-test.ps1 -ExistingImageOcid "ocid1.image..." -ImageName "my-livestack-v1" -InspectionMode
```

macOS:

```bash
bash ./03-automation/build-and-test-macos.sh -ExistingImageOcid "ocid1.image..." -ImageName "my-livestack-v1" -InspectionMode
```

Linux:

```bash
bash ./03-automation/build-and-test-linux.sh -ExistingImageOcid "ocid1.image..." -ImageName "my-livestack-v1" -InspectionMode
```

Use the command printed by inspection to remove the VM when finished. Keep the
inspection only as long as necessary; its saved Terraform state contains fresh
generated credentials.

The inspection VM is created by the paired Terraform project at
`Terraform-Repo-Oracle/peak-gear-livestack`. The Windows runner
uses the `.ps1` implementation; the macOS and Linux runners use
`build-and-test.py` through their native Bash launchers. Both implementations
resolve the same sibling `demo-code` checkout, and `-TerraformDirectory` remains
available for a nonstandard checkout layout.
