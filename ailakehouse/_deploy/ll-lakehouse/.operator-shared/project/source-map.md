# Source and authority map

Use the existing procedure owner for operational steps, then inspect the current implementation and the narrow tests that protect it. The private source indexes provide more detailed navigation.

| Topic | Procedure or design authority | Implementation | Regression evidence |
| --- | --- | --- | --- |
| Project overview and settings | [`README.md`](../../README.md) | `inst.sh`, `init/` | Focused tests under `tests/` |
| Standalone OCI install | [`INSTALLATION-GUIDE.md`](../../INSTALLATION-GUIDE.md) | `inst.sh`, `init/variable.sh`, `init/setenv.sh`, user units in `init/` | `tests/test-provision-retry.py`, `tests/test-wallet-hardening.sh` and topic-specific tests |
| Terraform deployment | [`terraform-readme.md`](../../terraform-readme.md) | Terraform source is in a separate repository; VM behavior is implemented here under `init/` and `inst.sh` | This repository does not by itself verify every external Terraform producer/configuration |
| Custom image capture | [`CREATE_BASE_IMAGE.MD`](../../CREATE_BASE_IMAGE.MD) | [`prepare-custom-image.sh`](../../prepare-custom-image.sh) | [`tests/test-custom-image-preparation.sh`](../../tests/test-custom-image-preparation.sh) |
| Release archive | README packaging section | [`scripts/build-rc-zip.sh`](../../scripts/build-rc-zip.sh), [`scripts/verify-rc-zip.sh`](../../scripts/verify-rc-zip.sh) | Archive/package tests in `tests/` |
| Runtime services | README architecture and deployment guides | [`init/`](../../init/), [`ingestion/compose.yml`](../../ingestion/compose.yml) | Compose, source-database, retry, and service-specific tests in `tests/` |
| Application data/API | [`DESIGN.md`](../../DESIGN.md) as design history; verify routes against current code | `ingestion/backend/`, `ingestion/frontend/`, `ingestion/db/` | Backend/frontend tests under `tests/` and package-local test scripts |
| PeakGear scenario | Parent learner guides | App routes and `init/` data/seed scripts | Scenario-specific tests where present |

`DESIGN.md` can contain historical UI intent; it is not proof that a route or screen still exists. Current code and tests decide runtime behavior.
