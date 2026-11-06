# Project architecture

## Identity

This repository packages and deploys the PeakGear AI Lakehouse LiveStack demo, including OCI/LiveLabs provisioning support, a custom VM image path, first-boot setup, and the application stack. The parent `ailakehouse` project documents the learner-facing PeakGear scenario and broader lakehouse model.

## Boundaries

- Terraform provisions OCI infrastructure in a separate repository; this repository owns the VM installer, image preparation, runtime services, and release archive.
- `inst.sh` builds the reusable VM image. A baked first-boot service retrieves the current host deployment bundle; user systemd units then coordinate Podman Compose and setup jobs.
- The web app's primary database is wallet-backed Autonomous Database in the `PG` schema. The local Oracle Free service remains only as the NetSuite CDC source.
- PostgreSQL and MySQL source services are part of the standard Compose stack. MongoDB is profile-gated by the custom image's `AIHUB` choice.
- Iceberg/Gravitino, GoldenGate/OSA, Data Transforms, AI catalog, and model services connect the deployment to the lakehouse demo; consult the deployment lifecycle and data-flow notes before changing those boundaries.

## Service architecture

This diagram shows the deployment topology and the main runtime connections. The Compose service names come from [`ingestion/compose.yml`](../../ingestion/compose.yml); systemd ordering is defined by the current unit files in [`init/`](../../init/) and summarized in the [deployment lifecycle](deployment-lifecycle.md).

```mermaid
flowchart LR
    Terraform["Terraform<br/>(separate repository)"] -. provisions .-> Compute["OCI Compute<br/>Oracle Linux VM"]

    subgraph Cloud["OCI managed services"]
        Metadata["Instance metadata<br/>and wallet/config inputs"]
        ADB[("Wallet-backed Autonomous Database<br/>PG app and lakehouse data")]
        DataTransforms["Autonomous Database<br/>Data Transforms"]
        AICatalog["Oracle AI Data Catalog"]
        Storage[("OCI Object Storage<br/>release bundle and Iceberg data")]
        GenAI["OCI Generative AI"]
    end

    subgraph Host["Deployment on the OCI VM"]
        Bootstrap["Baked first-boot downloader<br/>then init scripts"]
        Units["User systemd units<br/>wallet / ADB bootstrap · Compose · setup jobs"]
        Bootstrap --> Units

        subgraph Compose["Podman Compose services · ingestion/compose.yml"]
            App["app<br/>Node API + built Vite UI"]
            NetSuiteDB[("netsuite-db<br/>Oracle CDC source")]
            SourceDBs["Other source databases<br/>postgres-source · loyalty-mysql<br/>mongodb-catalog (optional aihub profile)"]
            LocalAI["privateai<br/>image and text embeddings"]
            Studio["goldengate-cdc<br/>GoldenGate Studio"]
            Runtime["goldengate-runtime<br/>CDC capture and replication"]
            GGSA["ggsa<br/>OSA + Kafka + Spark + MySQL"]
            Signals["signal-generator<br/>demand events"]
            Gravitino["gravitino<br/>Iceberg REST catalog"]
            Seeder["iceberg-seeder<br/>(seed profile, one-shot)"]
        end
        DataSetup["Host integration setup units<br/>AI catalog · Iceberg · Data Transforms · medallion"]
    end

    Compute -. hosts .-> Bootstrap
    Metadata -. configuration .-> Bootstrap
    Storage -. current host bundle .-> Bootstrap
    Units -. starts the Compose stack .-> App
    Units -. runs applicable host setup jobs .-> DataSetup

    App -->|primary SQL| ADB
    App -->|embeddings| LocalAI
    App -->|OCI model requests| GenAI
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
- [Data flow](data-flow.md) for ADB and PeakGear data paths.
- [Source map](source-map.md) to find the procedure, implementation, and tests for a change.
- [Known gaps](known-gaps.md) before relying on unresolved rationale or conflicting documentation.
- Parent scenario: [Introduction](../../../../introduction/introduction.md) and [Quickstart](../../../../quickstart/quickstart.md).
