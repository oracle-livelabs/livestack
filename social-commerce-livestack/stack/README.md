# Social-Aware Commerce & Smart Fulfillment Demo

**Move from reactive commerce to socially intelligent, AI-orchestrated fulfillment.**

A retail vertical demo where social influence, demand forecasting, and drop shipment optimization all happen inside the Oracle 26ai Converged Autonomous Database.

## Business Problem

Retailers treat social buzz, inventory, and fulfillment as separate systems. By the time something goes viral, inventory is in the wrong place and shipping is suboptimal.

## What This Demo Shows

A real-time platform that:
- **Detects** emerging product momentum from social posts
- **Graph** — understands influencer networks and brand propagation
- **Vector** — identifies product mentions semantically (not just hashtags)
- **Spatial** — routes orders from the closest fulfillment center
- **Relational + JSON** — manages orders, inventory, and social payloads
- **Agents** — orchestrate decisions across all of it

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    React Dashboard (Vite)                     │
│  Trend Monitor │ Influencer Graph │ Fulfillment Map │ Orders │
└──────────────────────────┬──────────────────────────────────┘
                           │ REST API
┌──────────────────────────┴──────────────────────────────────┐
│                   Node.js / Express Backend                   │
│         OracleDB Driver  │  Agent Orchestrator               │
└──────────────────────────┬──────────────────────────────────┘
                           │ oracle-db 26ai
┌──────────────────────────┴──────────────────────────────────┐
│              Oracle Autonomous Database 26ai                  │
│                                                               │
│  ┌───────────┐ ┌────────┐ ┌─────────┐ ┌──────────────────┐  │
│  │Relational │ │  JSON  │ │  Graph  │ │     Vector       │  │
│  │ Orders    │ │ Social │ │Influencer│ │ Semantic Search  │  │
│  │ Inventory │ │Payloads│ │Networks │ │ Product Matching │  │
│  └───────────┘ └────────┘ └─────────┘ └──────────────────┘  │
│  ┌───────────┐ ┌────────────────────┐ ┌──────────────────┐  │
│  │  Spatial  │ │   PL/SQL Agents    │ │    Security      │  │
│  │Fulfillment│ │  Decision Engine   │ │  RBAC + VPD      │  │
│  │  Routing  │ │                    │ │                  │  │
│  └───────────┘ └────────────────────┘ └──────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Database | Oracle Autonomous Database 26ai (ATP) |
| Backend | Node.js 20+ / Express 4 / oracledb 6+ |
| Frontend | React 18 / Vite / Recharts / Leaflet / D3-force |
| Deployment | Oracle Linux VM on OCI |
| Process Mgr | PM2 |

## Quick Start

### Prerequisites
- Oracle Autonomous Database 26ai instance (ATP)
- Wallet credentials downloaded
- Node.js 20+ on your Oracle Linux VM
- Oracle Instant Client 23+ installed

### 1. Clone & Install
```bash
git clone <your-repo-url>
cd social-commerce-demo
npm install
cd frontend && npm install && cd ..
```

### 2. Configure Environment
```bash
cp .env.example .env
# Edit .env with your ADB connection details
```

### 3. Run Database Setup
```bash
# Connect to your ADB and run schema creation
cd db/schema
sqlplus admin/<password>@<tns_alias> @01_tables.sql
sqlplus admin/<password>@<tns_alias> @02_json_collections.sql
sqlplus admin/<password>@<tns_alias> @03_graph.sql
sqlplus admin/<password>@<tns_alias> @04_vector.sql
sqlplus admin/<password>@<tns_alias> @05_spatial.sql
sqlplus admin/<password>@<tns_alias> @06_security.sql
sqlplus admin/<password>@<tns_alias> @07_agents.sql

# Load sample data
cd ../data
sqlplus admin/<password>@<tns_alias> @load_all_data.sql
```

### 4. Start the App
```bash
# Development
npm run dev

# Production (on Oracle Linux VM)
npm run build
npm run start:prod
```

### 5. Deploy on OCI Oracle Linux VM
```bash
# On the VM
cd scripts
chmod +x deploy.sh
./deploy.sh
```

## Project Structure
```
social-commerce-demo/
├── db/
│   ├── schema/          # DDL scripts (tables, graph, vector, spatial, security, agents)
│   ├── data/            # Sample data loaders (5000+ social posts, 200+ products, etc.)
│   └── packages/        # PL/SQL packages (agent logic, scoring, routing)
├── backend/
│   ├── server.js        # Express app entry point
│   ├── config/          # DB connection config
│   ├── routes/          # API route handlers
│   ├── services/        # Business logic services
│   └── middleware/       # Auth, error handling
├── frontend/
│   ├── src/
│   │   ├── components/  # Reusable UI components
│   │   ├── pages/       # Dashboard pages
│   │   ├── hooks/       # Custom React hooks
│   │   └── utils/       # Helper functions
│   └── public/
├── scripts/             # Deployment & utility scripts
└── docs/                # Additional documentation
```

## Demo Walkthrough

1. **Trend Detection** — Watch as social posts stream in and the vector engine semantically matches product mentions
2. **Influencer Network** — Explore the graph showing how buzz propagates through influencer connections
3. **Demand Forecasting** — See AI-predicted demand surges before they hit, with explainable reasoning
4. **Smart Fulfillment** — Observe spatial routing optimize drop shipments from the nearest warehouse
5. **Agent Orchestration** — Watch the autonomous agent detect a trend, pre-position inventory, and fulfill orders — all within the database

## License

Demo / educational use. Not for production deployment.
