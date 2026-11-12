# Deployment Safety and Source of Truth

## Procedure owners

- [`CREATE_BASE_IMAGE.MD`](../../CREATE_BASE_IMAGE.MD) owns the custom-image build and cleanup procedure.
- [`INSTALLATION-GUIDE.md`](../../INSTALLATION-GUIDE.md) owns the standalone OCI installation procedure.
- [`README.md`](../../README.md) owns the package overview, deployment modes, and configuration reference.
- [`terraform-readme.md`](../../terraform-readme.md) owns the Terraform deployment and cleanup checklist.

Keep detailed procedure steps in those files; update this note only when a durable safety contract or source-of-truth link changes.

## Durable safety contracts

- Build both deployment ZIPs from one staged source snapshot with `scripts/build-rc-zip.sh`. It verifies the full image-build archive and the `init/` plus `ingestion/` host ZIP before uploading through the ignored `.par` prefix, then checks both remote digests. Use `scripts/build-host-payload-zip.py --upload` only for a deliberate host-only update compatible with the captured image.
- Keep environment files, ADB wallet files, OCI credentials, generated keys, and transient runtime state out of release archives and captured images.
- Stop the user services and complete the cleanup preflight with `/home/opc/prepare-custom-image.sh` before capturing a custom image. The cleanup flow preserves required offline artifacts and aborts before deletion when its preflight fails.
- The release archive excludes `.operator/` and `.operator-shared/`; `scripts/verify-rc-zip.sh` rejects either partition if it appears in the archive.
- The copied Oracle JET runtime under `ingestion/frontend/public/jet/libs/oj/20.0.2/` is generated from locked frontend npm dependencies. Keep it out of source and release ZIPs; the frontend prebuild recreates it from dependencies cached in the image.
- First boot downloads the fixed-name host ZIP from `release_zip_url` metadata and rejects malformed, unsafe, or incomplete archives before installing host scripts or starting user services. The fixed object may be replaced for future VMs; already provisioned VMs do not update automatically. Keep PAR values out of source, image, and logs.
