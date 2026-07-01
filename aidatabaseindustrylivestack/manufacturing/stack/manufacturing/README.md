# Manufacturing Operations LiveStack

This is a manufacturing-focused variant of the mature source LiveStack baseline. It keeps the same portable runtime and Oracle-first architecture, but the demo story now centers on manufacturing operations:

- production and demand signal monitoring
- manufactured-part vector search
- supplier, plant, and line-supervisor graph analysis
- plant capacity and inventory routing
- work order JSON duality views
- OML demand, account segmentation, part margin, and capacity intelligence
- agent-assisted manufacturing operations over Oracle AI Database

The database object names remain compatible with the source baseline for portability and importer stability. User-facing pages and seeded data use manufacturing terminology and synthetic demo data only.

## Run locally

```bash
podman compose up -d --build
```

Open the app on `http://localhost:8508` and the API health endpoint on `http://localhost:8508/api/health`.

## Manufacturing transformation notes

See `input/working-prd.md` for the working scope and `output/role-ledger.md` for the role-by-role transformation ledger.
