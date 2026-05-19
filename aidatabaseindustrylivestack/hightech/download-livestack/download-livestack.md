# Download the LiveStack

## Introduction

This lab prepares the High Tech Product Intelligence LiveStack from the portable archive and starts the full local runtime: Oracle Database Free, ORDS, Ollama, and the application container.

Estimated Time: 20 minutes

### Objectives

In this lab, you will:
- Confirm the archive name and extracted layout.
- Start the stack with Podman Compose.
- Verify the health endpoint and open the app.
- Stop the stack cleanly after the demo.

## Task 1: Prepare the Working Directory

1. Place livestack-hightech.zip in your preferred working directory.
2. Extract the archive.
3. Change into the extracted hightech folder and confirm that compose.yml, Containerfile, backend, frontend, db, and scripts are present.

```bash
<copy>
unzip livestack-hightech.zip
cd hightech
ls
<copy>
```

Expected result:
- The extracted folder contains the complete LiveStack bundle.
- The compose.yml file is at the solution root.

## Task 2: Review Runtime Ports

1. Open .env or .env.example.
2. Confirm the default application route uses APP_PORT=8505.
3. Confirm ORDS, database, and Ollama ports are set for the local runtime.

Expected result:
- The app URL is http://localhost:8505.
- The health check is http://localhost:8505/api/health.
- The Compose file maps the app container to APP_PORT and runs the internal Node service on port 3001.

## Task 3: Start the LiveStack

1. From the extracted hightech directory, start the stack.

```bash
<copy>
podman compose up -d --build
<copy>
```

2. Wait for the database, ORDS, Ollama, and app containers to become healthy.
3. Check the app health route.

```bash
<copy>
curl http://localhost:8505/api/health
<copy>
```

Expected result:
- Compose builds the app image and starts all services.
- The health route returns a healthy response after the database pool is ready.

## Task 4: Open the Application

1. Open http://localhost:8505.
2. Confirm the left navigation includes Seer Tech Control Tower, Seer Tech 26ai Data Foundation, Product Intelligence Command Center, Enterprise Buyer Signal Monitor, Developer Ecosystem Graph, Product Availability and Capacity Map, Solution Orders, OML Product Intelligence, Ask Seer Tech Data, and AI Agent Console.
3. Continue to the scene labs in this guide.

Expected result:
- The Seer Tech Product Intelligence LiveStack opens in the browser.
- The visible navigation matches the guide sequence.

## Task 5: Stop the LiveStack

1. When the demo is complete, stop the runtime.

```bash
<copy>
podman compose down
<copy>
```

2. If you want to remove persisted database, ORDS, and Ollama volumes, run the volume-removal form only after confirming you no longer need the local state.

```bash
<copy>
podman compose down -v
<copy>
```

Expected result:
- The containers stop cleanly.
- Persistent state remains unless the -v option is used.

## Task 6: Why this matters?

The download lab proves that the guide is tied to a portable LiveStack bundle, not only a hosted environment. A customer or field team can rebuild the same product-intelligence story locally and inspect the app, APIs, database scripts, and runtime containers together.

## Credits & Build Notes
- **Author** - Oracle LiveStack Team
- **Last Updated By/Date** - Oracle LiveStack Team, 2026-05-13
- **Source Bundle** - `livestack-hightech.zip`
