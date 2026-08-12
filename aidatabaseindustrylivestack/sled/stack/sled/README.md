# State and Local Government Service Operations LiveStack

This is a state-and-local-government-focused variant of the mature source LiveStack baseline. It keeps the same portable runtime and Oracle-first architecture, but the demo story now centers on public service coordination:

- resident and community signal monitoring
- civic-service vector search
- community partner graph analysis
- service access and capacity routing
- service request JSON duality views
- OML demand, resident segmentation, service value, and capacity intelligence
- agent-assisted civic operations over Oracle AI Database

The database object names remain compatible with the source baseline for portability and importer stability. User-facing pages and seeded data use state and local government terminology and synthetic demo data only; no regulated personal data is included.

## Run locally

```bash
podman compose up -d --build
```

This checkout includes a local `.env` that avoids the currently occupied ports on this host. Open the app on `http://localhost:8508` and the API health endpoint on `http://localhost:8508/api/health`.

## SLED transformation notes

See `input/working-prd.md` for the working scope and `output/role-ledger.md` for the role-by-role transformation ledger.
