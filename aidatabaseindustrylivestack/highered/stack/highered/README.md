# Higher Education Student Success LiveStack

This is a higher education-focused variant of the mature source LiveStack baseline. It keeps the same portable runtime and Oracle-first architecture, but the demo story now centers on student success:

- student and community signal monitoring
- student-service vector search
- success advocate graph analysis
- campus services and capacity routing
- student request JSON duality views
- OML demand, student segmentation, service value, and capacity intelligence
- agent-assisted student-success operations over Oracle AI Database

The database object names remain compatible with the source baseline for portability and importer stability. User-facing pages and seeded data use higher education terminology and synthetic demo data only; no student PII is included.

## Run locally

```bash
podman compose up -d --build
```

Open the app on `http://localhost:8506` and the API health endpoint on `http://localhost:8506/api/health`.

## Higher Education transformation notes

See `input/working-prd.md` for the working scope and `output/role-ledger.md` for the role-by-role transformation ledger.
