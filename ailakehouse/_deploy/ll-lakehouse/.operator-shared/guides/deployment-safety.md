# Deployment Safety and Source of Truth

## Procedure owners

- [`CREATE_BASE_IMAGE.MD`](../../CREATE_BASE_IMAGE.MD) owns the custom-image build and cleanup procedure.
- [`INSTALLATION-GUIDE.md`](../../INSTALLATION-GUIDE.md) owns the standalone OCI installation procedure.
- [`README.md`](../../README.md) owns the package overview, deployment modes, and configuration reference.
- [`terraform-readme.md`](../../terraform-readme.md) owns the Terraform deployment and cleanup checklist.

Keep detailed procedure steps in those files; update this note only when a durable safety contract or source-of-truth link changes.

## Durable safety contracts

- Build release archives with `scripts/build-rc-zip.sh`; it verifies the generated archive before upload.
- Keep environment files, ADB wallet files, OCI credentials, generated keys, and transient runtime state out of release archives and captured images.
- Stop the user services and complete the cleanup preflight with `/home/opc/prepare-custom-image.sh` before capturing a custom image. The cleanup flow preserves required offline artifacts and aborts before deletion when its preflight fails.
- The release archive excludes `.operator/` and `.operator-shared/`; `scripts/verify-rc-zip.sh` rejects either partition if it appears in the archive.
