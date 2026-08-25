# Create A Full LiveStack Image With Codex

Fill in the values below, then paste the complete prompt into a new Codex task.
Do not include passwords, OCI tokens, private keys, wallets, or generated
credentials.

```text
Create and validate one AILakehouse LiveStack image from the approved local
template. Read the two specified READMEs before changing anything.

INPUTS

AUTO_BUILD_ROOT = [absolute path to _deploy/auto_build]
IMAGE_NAME = [OCI custom image display name]
WHAT_TO_CHANGE = [plain description of the app, containers, database resources, and expected behavior]
PUBLIC_ENDPOINTS = [URLs and ports a user must reach]
PRIVATE_PORTS = [ports that must stay internal]
TERRAFORM_METADATA = [values Terraform must generate for each VM, or NONE]
DATABASE_REQUIREMENTS = [ADB version, users, schemas, data loader, and checks]
PASS_CONDITIONS = [specific HTTP checks, login checks, queries, or application behavior]
BAKED_ASSETS = [models, archives, images, or packages to preload, or NONE]
EXTRA_SOURCE_PATHS = [exact application or artifact paths that may be read, or NONE]
RUN_FULL_TEST = [NO for local validation only, or YES for the OCI build and acceptance test]

AUTHORITATIVE FILES

ROOT_GUIDE = AUTO_BUILD_ROOT/README.md
IMAGE_GUIDE = AUTO_BUILD_ROOT/01-image-build/README.md
TERRAFORM_GUIDE = AUTO_BUILD_ROOT/terraform/README.md
APPLICATION_SOURCE = dirname(AUTO_BUILD_ROOT)/ll-lakehouse/ingestion
BOOTSTRAP_SOURCE = dirname(AUTO_BUILD_ROOT)/ll-lakehouse/init

RULES

1. Read ROOT_GUIDE, IMAGE_GUIDE, and TERRAFORM_GUIDE first.
2. Search and edit only AUTO_BUILD_ROOT, APPLICATION_SOURCE, BOOTSTRAP_SOURCE,
   and EXTRA_SOURCE_PATHS. Do not search a drive, home folder, whole repository,
   or web for alternatives.
3. APPLICATION_SOURCE owns Compose files and application code. BOOTSTRAP_SOURCE
   owns the existing first-boot scripts. Do not reintroduce the old ZIP installer
   or create a copied application folder under 01-image-build.
4. Update AUTO_BUILD_ROOT/01-image-build/01-edit/public-endpoints.json for every
   public application URL. Update service-catalog.json for every Compose service,
   its health check, useful non-secret connection details, and any credential that
   Terraform supplies at boot. The shared dashboard on port 32180 is automatic.
5. Put only LiveStack-specific packages, preload work, metadata handling,
   capture cleanup, and behavioral tests under 01-image-build/02-edit-if-needed.
6. Put only this LiveStack's ADB, Object Storage, loader, protected runtime-file,
   and metadata logic under terraform/02-edit-if-needed. Keep shared terraform
   automation unchanged unless a proven shared defect requires a narrow fix.
7. Create local ignored values only by copying the two provided examples:
   01-image-build/01-edit/packer.auto.pkrvars.hcl.example and
   terraform/01-edit/terraform.tfvars.example. Never print, commit, or copy
   their secret values into tracked files.
8. The Packer NSG must have exactly TCP 22 from the current tester IPv4 /32.
   Terraform creates the temporary test NSG for declared app ports.
9. Run only the documented ValidateOnly command when RUN_FULL_TEST is NO.
   It must not create OCI resources. When RUN_FULL_TEST is YES, use the normal
   Packer-to-Terraform path, then report the exact inspection command. Do not
   create a Marketplace listing or Resource Manager ZIP.
10. Do not commit, push, open a pull request, or create OCI resources unless
    explicitly requested.

FINAL RESPONSE

Return only: files changed, the conditions verified, missing local values, and
the next exact command to run from AUTO_BUILD_ROOT/01-image-build.
```

The normal local validation commands are listed in
[README.md](README.md). The same README also explains the automatic build,
manual image-capture fallback, Terraform test of an existing image, and visual
inspection modes.
