# Shared Partition Catalog

## Tree

- `operator.md`
  - Description: Shared project-wide rules and placement policy.
  - Read If: Auto-injected.
- `catalog.md`
  - Description: Catalog of Shared Partition files.
  - Read If: Auto-injected.
- `README.md`
  - Description: Codex setup and day-to-day contributor workflow for the project Operator brain.
  - Read If: Setting up or understanding the shared Operator partition.

### `guides/` - Durable deployment guidance that points to the repository's procedure owners

- `deployment-safety.md`
  - Description: Release archive and custom-image safety contracts with links to the detailed deployment guides.
  - Read If: Building, verifying, uploading, or capturing a lakehouse deployment image.

### `project/` - Progressive project context

- `architecture.md`
  - Description: System identity, major subsystem boundaries, and their relationships.
  - Read If: Orienting in the project or making a cross-subsystem change.
- `deployment-lifecycle.md`
  - Description: Deployment modes, configuration precedence, and first-boot dependency order.
  - Read If: Changing installation, OCI metadata, wallet setup, systemd, or image lifecycle.
- `data-flow.md`
  - Description: App database versus ADB responsibilities and the PeakGear data/medallion paths.
  - Read If: Changing application data, ADB integration, Iceberg, streaming, CDC, or Data Transforms.
- `source-map.md`
  - Description: Authoritative documentation, source, and tests by engineering topic.
  - Read If: Looking for the source of truth or deciding where a behavior is implemented and tested.
- `known-gaps.md`
  - Description: User-confirmed design rationale, unresolved deployment policy, and evidence-backed documentation/source conflicts.
  - Read If: Changing behavior with recorded trade-offs, interpreting inconsistent guides, resolving known conflicts, or deciding what requires clarification.
