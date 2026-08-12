# Healthcare LiveStack

## Purpose

Healthcare LiveStack is a synthetic-data demonstration for exploring provider networks, care services, care sites, service requests, quality signals, capacity, logistics, and care pathways in one governed application experience. It is designed for demo exploration and decision support, not clinical use or a production deployment.

## What is included

The application presents operational dashboards, care-service requests, a care-pathway graph, care logistics mapping, data exploration, and a dataset restore workflow. Oracle capability labels in the current source are implementation targets and are **not yet independently accepted** as end-to-end feature evidence.

## Architecture

The stack runs a React/Oracle JET-style frontend with a Node.js API and Oracle AI Database services through Podman. The app uses domain-facing healthcare language while retaining some compatibility-oriented physical schema names behind its API contracts.

## Prerequisites

- Podman with Compose support
- Ports `8505` and the supporting local service ports available
- A local copy of this complete stack directory, including `.env.example`

## Quick start

```sh
cp .env.example .env
podman compose up -d --build
```

Open `http://localhost:8505`. The API health endpoint is `http://localhost:8505/api/health`. Wait for the application readiness state before using a scenario; a running container alone is not feature readiness.

Stop the local stack with:

```sh
podman compose down
```

## Configuration

Start from `.env.example` and keep local credentials out of source control. Use only synthetic or de-identified data in this demo.

## Restore demo data

Select the Admin persona, open **Data Foundation**, choose **Restore Demo Data**, and confirm the action. The server revalidates that the signed actor is an active Oracle `admin` for every destructive request, and the mounted browser must also supply same-origin demo-control intent and the route-specific confirmation. No dataset-admin token is exposed to browser code. The page shows the Restore job state and reloads the current governed view after completion. If the job reports an error or the live status is unavailable, do not treat old counts as current; retry only after reviewing the on-screen message and restoring connectivity.

Dataset upload uses the same Admin boundary. After validation, choose **Upload Data**, then choose **Confirm Replace Active Dataset**. Separately provisioned non-browser automation may use `X-Dataset-Admin-Token` when `DATASET_ADMIN_TOKEN` is injected through a local `.env` or deployment secret manager; it must still send the route-specific destructive confirmation. Never commit, expose to browser code, or log that token.

## Access and security

The demo exposes governed persona views for illustrating data-scope behavior. The mounted UI establishes a short-lived, actor-bound session through a same-origin server endpoint before it loads governed data. The server signs the session and returns only an API-scoped `HttpOnly`, `SameSite=Strict` cookie; browser code never receives bearer mappings or signing secrets. Every governed request sends that cookie, and a missing, tampered, expired, unknown, inactive, or mismatched actor fails closed. Server-side bearer mapping remains available for separately provisioned non-browser checks.

This is an isolated local demo convenience boundary, not a production authentication system and not authorization for a shared deployment. Put shared or remotely exposed deployments behind trusted enterprise authentication and bind each caller to allowed personas. Dataset replacement and Restore retain their separate dataset-admin role validation, same-origin control, and explicit destructive-confirmation requirements; only an Oracle-revalidated signed Admin session or separately provisioned server-side automation token can satisfy that stronger guard.

A persona switch establishes the next signed session before making its UI state current, then clears the previous view before the next scope is loaded. Authorization and feature acceptance are validated separately from the UI and must not be inferred from a visible label or screen.

## Validation and release

This working source has not yet completed the Wave 2 acceptance gates. A release may describe a feature only after clean deployment, database, API, browser, failure-path, restart, Restore, and documentation checks have passed.

## Troubleshooting

- If the API health endpoint is unavailable, verify that the local services are started and wait for database readiness.
- If a page says its live status is unavailable, reload after the governed API is reachable; the UI intentionally withholds stale counts.
- If Restore does not complete, review the displayed job message before retrying.

## Deferred capabilities

ORDS ownership migration, native Select AI, and native Agents are not Wave 2 acceptance items.
