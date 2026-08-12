# Utilities LiveStack

This Oracle-first LiveStack demonstrates nine connected Energy & Utilities use cases across electric, gas, water/wastewater, and oil and gas operations. The existing Utilities story, terminology, seeded data, and navigation are retained while the stack adopts the accepted Manufacturing and High Tech behavior contracts.

The bundled data is synthetic. Do not upload customer personal information, real outage reports, safety events, production records, emissions records, or regulatory submissions.

## Quick start

Keep the project directory named `utilities` and run the normal Compose project without a permanent project-name override:

```bash
podman compose up -d --build
```

The default project identity is `utilities`; the normal containers therefore use the `utilities-*` prefix. Temporary `-p` overrides may be used for isolated validation only and must not be written into the project or release archive.

The application and API share one port. Use `/api/health` to check basic service readiness.

## Governed demo identities

The mounted UI establishes a short-lived, actor-bound session through a same-origin server endpoint before loading governed data. The server signs the session and returns only an API-scoped `HttpOnly`, `SameSite=Strict` cookie; browser code never receives bearer mappings or signing secrets. Missing, altered, expired, unknown, inactive, or mismatched actors fail closed. Server-side bearer mapping remains available for separately provisioned non-browser checks.

This is an isolated local demo convenience boundary, not a production authentication system or authorization model for a shared deployment. Put shared or remotely exposed deployments behind trusted enterprise authentication and bind each caller to allowed identities.

## Restore demo data

Select the Admin persona, open **Data Foundation**, choose **Restore Demo Data**, and confirm the replacement. The server revalidates the signed actor as an active Oracle administrator for every destructive request and requires both same-origin demo-control intent and the route-specific confirmation.

Restore uses a durable job, lease, generation journal, rollback snapshot, serving fence, and required-feature checks. If a job reports an error or current status is unavailable, the UI withholds stale counts rather than presenting them as current.

## Use your own data

The dataset tool downloads the v1 template, validates an uploaded ZIP, and requires a second confirmation before replacing the active dataset. Use only synthetic or de-identified Utilities data.

## Feature behavior

Feature readiness is evidence-based:

- Vector Search reports live model, index, and execution readiness.
- Property Graph reports the exact `SERVICE_RESTORATION_NETWORK` artifact and SQL/PGQ probe.
- Spatial nearest-site ranking uses the indexed candidate path and exact distance calculation.
- JSON Relational Duality uses only `UTILITY_SERVICE_REQUESTS_DV` and fails closed if it is unavailable.
- OML scores persisted lifecycle-owned models and does not fabricate fallbacks.
- Database In-Memory reports declaration evidence only and does not claim runtime population.
- Native JSON and Unified Audit expose read-only catalog readiness.
- Oracle Internals starts collapsed and resets to collapsed for each scene.

## Deferred capabilities

Source, unit, build, Oracle-runtime, HTTP, and package checks are separate acceptance lanes. A rendered-browser inspection is not yet independently accepted in this environment because browser automation has not been authorized. Do not treat source checks alone as proof of rendered layout or interaction behavior.

