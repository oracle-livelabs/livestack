# Known rationale and documentation conflicts

This note records user-confirmed rationale, unresolved policy, and evidence-backed documentation/source conflicts. Check current code and tests before changing behavior; do not present an unconfirmed rationale as fact.

## User-confirmed rationale

- **Container image packaging:** LiveLabs cannot download container images from internet registries at provisioning time, so container images remain baked into the base VM image. Object Storage is always reachable and supplies the fixed-name host payload ZIP at first boot.
- **Gen2 database and AI boundary:** A fresh dedicated ADB hosts the `PG` app and lakehouse tables. Gen2 removes the local app Oracle Free database and Ollama; `netsuite-db` remains the CDC source and Private AI remains for embeddings. OCI GenAI supplies language generation.
- **OCI GenAI requirement:** Gen2 requires the OCI GenAI profile; absent or unsupported setup configuration fails before the app starts.
- **`AIHUB` image-time choice:** MongoDB is an image-level opt-in because some users may not want that third-party database included in their deployment.
- **Offline image artifacts:** Cached container images, model files, and dependency artifacts are retained mainly so new LiveLabs VMs can work without internet access.
- **Object Storage PAR roles:** The Gravitino archive PAR is maintained for development setup and custom-image builds. GGSA is licensed: users obtain its binary from Oracle eDelivery, upload it to their own Object Storage, and provide their own PAR URL. Do not copy any PAR values from `.env.example` into shared notes.

The existing design rationales were confirmed on 2026-10-16; Object Storage reachability and Gen2 scope were clarified on 2026-11-05.

## Unresolved rationale and policy

- The history behind removal of the Iceberg Catalog Server UI route remains unknown.
- ADB can leave a Retail Operations team execution in `RUNNING` after both tools succeed while the final OCI GenAI response stalls. The app returns a labeled direct-tool response on its own call timeout, but that does not cancel the ADB team execution. Monitor team history if this recurs; a database-side cancellation policy has not been established.
- The release flow has no complete SBOM and vulnerability scan for baked container images or externally staged Java archives. npm and PyPI advisory checks do not establish that the Oracle, GGSA, and Gravitino image contents are free of known CVEs.

## Verified documentation/source mismatches

- `DESIGN.md` describes an `IcebergCatalogServerGuide.jsx` page and `?page=iceberg-catalog-server` route. The referenced page is absent, and `tests/test-public-endpoint-urls.sh` asserts that the route remains absent.
- `README.md` labels a command as “Stop service” but invokes `systemctl --user restart user-podman`; the command does not match the label.
- `README.md` describes `.env.example` as a secret-free template, but it contains pre-authenticated Object Storage URL values. The user confirms the Gravitino PAR is project-maintained; users provide their own PAR for the licensed GGSA binary after uploading it to Object Storage. Treat the file cautiously and do not copy URL values into Operator notes.
- The user-confirmed Data Transforms target is one project named `peakgear`, with medallion objects folded into it (see [Data and application flow](data-flow.md)). `init/data-transforms/README.md`, `init/data-transforms/peakgear-medallion.json`, `init/provision-medallion.py`, `init/pg-medallion-project.service`, and tests still describe or create a separate `peakgear_medallion` project. Reconcile setup/reset behavior, packaged objects, tests, and guides before changing the implementation.
