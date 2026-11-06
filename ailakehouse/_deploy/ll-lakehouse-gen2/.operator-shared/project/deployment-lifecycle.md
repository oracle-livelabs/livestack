# Deployment lifecycle

Use the linked guides for procedures. This note records boundaries that are easy to confuse when changing bootstrap, configuration, or image behavior.

## Deployment modes and configuration

- OCI metadata and `/home/opc/.env` are both configuration inputs. In `init/variable.sh`, metadata values are preferred where a metadata key is defined; local environment values serve as fallback. Confirm each key's actual resolution before changing it.
- `AIHUB` is an image-time choice: `inst.sh` writes it to `/home/opc/bootstrap/aihub-image-default.env`, and runtime setup reads that file. It selects the optional MongoDB Compose profile.
- A reusable image retains its container images and dependency caches. At first boot, the root release service obtains the fixed-name host ZIP URL from OCI instance metadata, validates the ZIP, and installs `init/` and `ingestion/` before user setup units run. Replacing the Object Storage object does not update an already provisioned VM; new VMs receive the current object at boot.
- ADB wallet provisioning is handled by `init/adb-wallet.sh`; the custom-image marker `.oci_wallet_required` prevents silently substituting a static/local wallet when metadata-driven wallet setup is required.
- LiveLabs first-boot integration is opt-in through `ENABLE_LIVELABS_FIRSTBOOT` and a trusted `LIVELABS_FIRSTBOOT_URL`; standalone setup does not imply it is enabled.

## Startup dependency outline

The installed user units encode the ordering. Check their current `After=`, `Before=`, and `Requires=` declarations before changing it:

1. `peakgear-release.service` installs the validated host payload; `setenv` resolves configuration; `adb-wallet.service` provisions the wallet; `adb-load.service` prepares the dedicated ADB `PG` schema/data and required OCI GenAI profile.
2. `user-podman.service` starts the Compose stack after its configured prerequisites.
3. `iceberg-seed.service` seeds local Iceberg-related data and prepares the ADB external table; `pg-ai-catalog-bronze.service` and `pg-iceberg-connection.service` prepare related integration state.
4. `pg-medallion-project.service` depends on the Iceberg connection and AI catalog bronze setup.

The exact order is source-defined, not a promise that every unit runs in every deployment mode. See [`init/`](../../init/) and [`ingestion/compose.yml`](../../ingestion/compose.yml).

## Image and release boundaries

- `prepare-custom-image.sh` runs offline-artifact preflight before cleanup. Do not reorder cleanup ahead of successful preflight; the script preserves baked container images and dependency caches while removing generated runtime state and the host payload to be fetched on first boot.
- `scripts/build-rc-zip.sh` builds `peakgear-release.zip` and the smaller first-boot `init/` plus `ingestion/` host ZIP from one staged snapshot, verifies both, and uploads both by default. Both object names are fixed and uploads replace the prior object. Object Storage does not publish the two objects atomically; stop on a failed upload and retry the whole build before provisioning. Environment files, wallets, OCI credentials, generated keys/runtime state, and both Operator partitions must remain outside either archive.
- For the complete image capture procedure see [`CREATE_BASE_IMAGE.MD`](../../CREATE_BASE_IMAGE.MD); for standalone OCI installation see [`INSTALLATION-GUIDE.md`](../../INSTALLATION-GUIDE.md); for Terraform deployment see [`terraform-readme.md`](../../terraform-readme.md).
