# Design

## Source of truth

- Status: Active
- Last refreshed: 2026-08-10
- Primary product surfaces: PeakGear AI Lakehouse frontend guide pages
- Evidence reviewed: `ingestion/frontend/src/pages/SilverProcessGuide.jsx`, `ingestion/frontend/src/pages/IcebergCatalogServerGuide.jsx`, and `ingestion/frontend/src/styles/index.css`

## Brand

- Personality: Practical Oracle/PeakGear workshop guidance
- Trust signals: Clear environment values, explicit actions, and copy controls
- Avoid: Hiding setup values behind secondary navigation

## Product goals

- Goals: Keep the demo explanation and primary action visible before setup details.
- Non-goals: Change the established Data Processing & Pipelines layout.
- Success signals: Iceberg catalog credentials are easy to scan and copy without crowding the hero actions.

## Information architecture

- Primary navigation: Process → Add Iceberg Catalog Server
- Core route: `?page=iceberg-catalog-server`
- Content hierarchy: Demo context and actions first; full-width login/configuration information second; embedded guide last.

## Design principles

- Reuse the existing guide hero and credential-card visual language.
- Make the wide credential layout an explicit page variant, not a global behavior change.

## Visual language

- Spacing/layout rhythm: Existing hero grid; a full-width second grid row for the credential card.
- Shape/radius/elevation: Existing `streaming-osa-credentials` and guide-card tokens.

## Components

- Existing components to reuse: `SilverProcessGuide`, `CopySecretButton`, `ImportanceButton`, and `JetButton`.
- New/changed components: `fullWidthCredentials` guide variant.

## Accessibility

- Keyboard/focus behavior: Preserve existing buttons and copy controls.
- Screen-reader semantics: Retain the login credential panel label.

## Responsive behavior

- Supported breakpoints/devices: Existing guide breakpoint behavior.
- Layout adaptations: The full-width card remains one grid row on desktop and naturally stacks with the hero at smaller widths.

## Interaction states

- Loading: Existing guide and configuration loading states.
- Disabled: Existing unavailable-copy states.

## Content voice

- Tone: Direct workshop guidance.
- Terminology: Keep “Login information”, “Data Transforms”, and “OCI” labels exact.

## Implementation constraints

- Framework/styling system: React and the existing CSS classes/tokens.
- Test expectations: Production build and direct-route smoke check after deployment.

## Open questions

- [ ] None for this scoped layout change.
