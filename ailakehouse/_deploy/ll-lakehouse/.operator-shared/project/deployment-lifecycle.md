# Deployment lifecycle

Use the linked guides for procedures. This note records boundaries that are easy to confuse when changing bootstrap, configuration, or image behavior.

## Deployment modes and configuration

- OCI metadata and `/home/opc/.env` are both configuration inputs. In `init/variable.sh`, metadata values are preferred where a metadata key is defined; local environment values serve as fallback. Confirm each key's actual resolution before changing it.
- `AIHUB` is an image-time choice: `inst.sh` writes it to `/home/opc/init/aihub-image-default.env`, and runtime setup reads that file. It is deliberately not read from instance metadata in the current implementation. It selects the optional MongoDB Compose profile.
- ADB wallet provisioning is handled by `init/adb-wallet.sh`; the custom-image marker `.oci_wallet_required` prevents silently substituting a static/local wallet when metadata-driven wallet setup is required.
- LiveLabs first-boot integration is opt-in through `ENABLE_LIVELABS_FIRSTBOOT` and a trusted `LIVELABS_FIRSTBOOT_URL`; standalone setup does not imply it is enabled.

## Startup dependency outline

The installed user units encode the ordering. Check their current `After=`, `Before=`, and `Requires=` declarations before changing it:

1. `setenv` resolves configuration; `adb-wallet.service` provisions the wallet; `adb-load.service` prepares the external ADB schema/data.
2. `user-podman.service` starts the Compose stack after its configured prerequisites.
3. `iceberg-seed.service` seeds local Iceberg-related data and prepares the ADB external table; `pg-ai-catalog-bronze.service` and `pg-iceberg-connection.service` prepare related integration state.
4. `pg-medallion-project.service` depends on the Iceberg connection and AI catalog bronze setup.

The exact order is source-defined, not a promise that every unit runs in every deployment mode. See [`init/`](../../init/) and [`ingestion/compose.yml`](../../ingestion/compose.yml).

## Image and release boundaries

- `prepare-custom-image.sh` runs offline-artifact preflight before cleanup. Do not reorder cleanup ahead of successful preflight; the script preserves the local artifacts needed for offline boot while removing generated runtime state.
- Build release archives with `scripts/build-rc-zip.sh` and verify them with `scripts/verify-rc-zip.sh`. Environment files, wallets, OCI credentials, generated keys/runtime state, and both Operator partitions must remain outside the archive.
- For the complete image capture procedure see [`CREATE_BASE_IMAGE.MD`](../../CREATE_BASE_IMAGE.MD); for standalone OCI installation see [`INSTALLATION-GUIDE.md`](../../INSTALLATION-GUIDE.md); for Terraform deployment see [`terraform-readme.md`](../../terraform-readme.md).
