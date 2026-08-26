# Seer Comms Network Experience LiveStack

This is a telecommunications-focused LiveStack. It keeps the same portable Podman runtime and Oracle-first architecture, but the demo story centers on network experience operations:

- subscriber and network signal monitoring
- plan, device, and service-bundle vector search
- digital advocate and account relationship graph analysis
- coverage, capacity, and field-service routing
- service-order JSON duality views
- OML churn, demand, network-capacity, and service-value intelligence
- agent-assisted subscriber operations over Oracle AI Database

The database object names remain compatible with the source baseline for portability and importer stability. User-facing pages and seeded data use telecommunications terminology and synthetic demo data only; no real subscriber PII is included.

Dataset administration uses a signed same-origin demo session. Set `DEMO_SESSION_SECRET` for durable sessions in direct Node deployments; otherwise the app generates a process-local secret and invalidates sessions on app restart. Oracle remains the authority for whether that signed identity currently has the `admin` role.

## Run locally

```bash
podman compose up -d --build
```

Open the app on `http://localhost:8510` and the API health endpoint on `http://localhost:8510/api/health`.

## Telecommunications transformation notes

See `input/working-prd.md` for the working scope and `output/role-ledger.md` for the role-by-role transformation ledger.
