# Known rationale and documentation conflicts

This note records user-confirmed rationale, unresolved policy, and evidence-backed documentation/source conflicts. Check current code and tests before changing behavior; do not present an unconfirmed rationale as fact.

## User-confirmed rationale

- **Gravitino and Iceberg image packaging:** LiveLabs does not provide full internet access during provisioning, so these components cannot be downloaded at boot. Baking them into the custom image is intentional; rebuilding and redistributing the image to update them is an accepted cost.
- **Local Oracle Free and wallet-backed ADB:** The local Free database already supported the Serve AI and Serve Data demos, and migrating that data was undesirable at the time. The eventual direction is to move the data from Free to ADB and simplify the Compose stack. No migration schedule or exact dataset scope is established.
- **`AIHUB` image-time choice:** MongoDB is an image-level opt-in because some users may not want that third-party database included in their deployment.
- **Offline image artifacts:** Cached container images, model files, and dependency artifacts are retained mainly so new LiveLabs VMs can work without internet access.
- **Object Storage PAR roles:** The Gravitino archive PAR is maintained for development setup and custom-image builds. GGSA is licensed: users obtain its binary from Oracle eDelivery, upload it to their own Object Storage, and provide their own PAR URL. Do not copy any PAR values from `.env.example` into shared notes.

These rationales were confirmed by the user on 2026-10-16. They describe intent and accepted trade-offs; they do not by themselves approve implementation changes.

## Unresolved rationale and policy

- The intended absent-value behavior for `PG_AI_PROFILE_AUTO_SETUP` across standalone and Terraform deployments remains unknown. The user tentatively recalled that Ollama might be used when OCI Generative AI is unavailable, but was unsure and identified this as possible future cleanup. Do not treat that recollection as a confirmed default. Current code and guides disagree on the absent-value behavior.
- The history behind removal of the Iceberg Catalog Server UI route remains unknown.

## Verified documentation/source mismatches

- `DESIGN.md` describes an `IcebergCatalogServerGuide.jsx` page and `?page=iceberg-catalog-server` route. The referenced page is absent, and `tests/test-public-endpoint-urls.sh` asserts that the route remains absent.
- `README.md` labels a command as “Stop service” but invokes `systemctl --user restart user-podman`; the command does not match the label.
- `terraform-readme.md` says an absent `PG_AI_PROFILE_AUTO_SETUP` defaults to `true`; `init/variable.sh` falls back to `false` when metadata is unavailable and no environment value is set. The Compose default is normally superseded by the generated environment file. Resolve the intended deployment policy before changing either source or guide.
- `README.md` describes `.env.example` as a secret-free template, but it contains pre-authenticated Object Storage URL values. The user confirms the Gravitino PAR is project-maintained; users provide their own PAR for the licensed GGSA binary after uploading it to Object Storage. Treat the file cautiously and do not copy URL values into Operator notes.
- The user-confirmed Data Transforms target is one project named `peakgear`, with medallion objects folded into it (see [Data and application flow](data-flow.md)). `init/data-transforms/README.md`, `init/data-transforms/peakgear-medallion.json`, `init/provision-medallion.py`, `init/pg-medallion-project.service`, and tests still describe or create a separate `peakgear_medallion` project. Reconcile setup/reset behavior, packaged objects, tests, and guides before changing the implementation.
