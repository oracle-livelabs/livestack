# Project architecture

## Identity

This repository packages and deploys the PeakGear AI Lakehouse LiveStack demo, including OCI/LiveLabs provisioning support, a custom VM image path, first-boot setup, and the application stack. The parent `ailakehouse` project documents the learner-facing PeakGear scenario and broader lakehouse model.

## Boundaries

- Terraform provisions OCI infrastructure in a separate repository; this repository owns the VM installer, image preparation, runtime services, and release archive.
- `inst.sh` bootstraps the VM. User systemd units coordinate Podman Compose services and follow-on setup jobs.
- The web app's primary database is the local Oracle AI Database Free Compose service. Wallet-backed Autonomous Database connectivity is a separate cloud integration used by ADB loaders and streaming/analytics workflows.
- PostgreSQL and MySQL source services are part of the standard Compose stack. MongoDB is profile-gated by the custom image's `AIHUB` choice.
- Iceberg/Gravitino, GoldenGate/OSA, Data Transforms, AI catalog, and model services connect the deployment to the lakehouse demo; consult the deployment lifecycle and data-flow notes before changing those boundaries.

## Service architecture

This diagram shows the deployment topology and the main runtime connections. The Compose service names come from [`ingestion/compose.yml`](../../ingestion/compose.yml); systemd ordering is defined by the current unit files in [`init/`](../../init/) and summarized in the [deployment lifecycle](deployment-lifecycle.md).

```mermaid
flowchart LR
    Terraform["Terraform<br/>(separate repository)"] -. provisions .-> Compute["OCI Compute<br/>Oracle Linux VM"]

    subgraph Cloud["OCI managed services"]
        Metadata["Instance metadata<br/>and wallet/config inputs"]
        ADB[("Wallet-backed Autonomous Database<br/>SQLcl loads and integration target")]
        DataTransforms["Autonomous Database<br/>Data Transforms"]
        AICatalog["Oracle AI Data Catalog"]
        Storage[("OCI Object Storage<br/>Iceberg warehouse and table files")]
        GenAI["OCI Generative AI"]
    end

    subgraph Host["Deployment on the OCI VM"]
        Bootstrap["inst.sh + init scripts<br/>resolve configuration and prepare host"]
        Units["User systemd units<br/>wallet / ADB bootstrap · Compose · setup jobs"]
        Bootstrap --> Units

        subgraph Compose["Podman Compose services · ingestion/compose.yml"]
            App["app<br/>Node API + built Vite UI"]
            LocalDB[("db<br/>Oracle AI Database Free<br/>app primary database")]
            ORDS["ords<br/>local REST / Database Actions"]
            NetSuiteDB[("netsuite-db<br/>Oracle CDC source")]
            SourceDBs["Other source databases<br/>postgres-source · loyalty-mysql<br/>mongodb-catalog (optional aihub profile)"]
            LocalAI["ollama + privateai<br/>local model endpoints"]
            Studio["goldengate-cdc<br/>GoldenGate Studio"]
            Runtime["goldengate-runtime<br/>CDC capture and replication"]
            GGSA["ggsa<br/>OSA + Kafka + Spark + MySQL"]
            Signals["signal-generator<br/>demand events"]
            Gravitino["gravitino<br/>Iceberg REST catalog"]
            Seeder["iceberg-seeder<br/>(seed profile, one-shot)"]
            ORDSSetup["ords-pg-setup<br/>(one-shot)"]
        end
        DataSetup["Host integration setup units<br/>AI catalog · Iceberg · Data Transforms · medallion"]
    end

    Compute -. hosts .-> Bootstrap
    Metadata -. configuration .-> Bootstrap
    Units -. starts the Compose stack .-> App
    Units -. runs applicable host setup jobs .-> DataSetup

    App -->|primary SQL| LocalDB
    ORDS -->|serves local database| LocalDB
    ORDSSetup -. configures .-> LocalDB
    App -->|local inference| LocalAI
    App -->|OCI model requests| GenAI
    App -->|wallet-backed features| ADB
    App -->|source access| SourceDBs

    App -. CDC and OSA APIs .-> Studio
    Studio -. configures .-> Runtime
    NetSuiteDB -->|source changes| Runtime
    Runtime -->|CDC target| ADB
    App -. OSA control / status .-> GGSA
    Signals -->|Kafka demand events| GGSA
    GGSA -->|streaming pipeline target| ADB

    Seeder -->|Iceberg REST| Gravitino
    Gravitino -->|Iceberg warehouse| Storage
    Seeder -->|table data / metadata| Storage
    ADB -->|external Iceberg table| Storage
    DataSetup -. configures .-> DataTransforms
    DataSetup -. configures .-> AICatalog
    DataSetup -. Iceberg catalog connection .-> Gravitino
    DataTransforms -->|configured Oracle connection| ADB
    DataTransforms -->|configured Iceberg connection| Gravitino
    DataTransforms -->|configured catalog connection| AICatalog
    ADB -->|catalog mount / storage access| AICatalog
```

`mongodb-catalog` is enabled only when the `aihub` profile is selected. `iceberg-seeder` runs as a one-shot service through the `seed` profile. OCI metadata and local configuration are resolved by the host setup scripts; this picture is a topology view, not a guarantee that every optional service or setup job runs in every deployment mode.

## Business scenario

PeakGear connects shopper/product discovery and order activity with operations, data preparation, and streaming scenarios. The parent guide describes the general Bronze → Silver → Gold model; an individual walkthrough may exercise only part of that model.

## Read next

- [Deployment lifecycle](deployment-lifecycle.md) for deployment modes, configuration, and service ordering.
- [Data flow](data-flow.md) for local database versus ADB and PeakGear data paths.
- [Source map](source-map.md) to find the procedure, implementation, and tests for a change.
- [Known gaps](known-gaps.md) before relying on unresolved rationale or conflicting documentation.
- Parent scenario: [Introduction](../../../../introduction/introduction.md) and [Quickstart](../../../../quickstart/quickstart.md).
