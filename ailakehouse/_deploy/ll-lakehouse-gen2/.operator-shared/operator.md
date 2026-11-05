# Shared Operator Instructions

## Workflow

- Use the repository's deployment guides as the detailed procedures; link to them rather than copying their steps into the brain.
- Load only the project topic notes relevant to the task from `catalog.md`; start with `project/architecture.md` for orientation.
- When documentation conflicts with executable behavior, check the current scripts, service units, compose configuration, and regression tests; record unresolved rationale as a gap instead of guessing.

## Rules

- Keep release archives free of Operator knowledge, credentials, environment files, and wallet or key material.
- Preserve the existing build and archive verification flow when changing packaged deployment content.
- Do not copy URL values from `.env.example` into shared notes; the current file contains pre-authenticated Object Storage URLs whose validity is unknown.

## Style

- Keep shared notes concise, present-tense, and limited to durable project-wide guidance.
- Link to the canonical repository guide for detailed procedures.

## Private / Shared Policy

- Share project-wide rules and durable deployment references through `.operator-shared/`.
- Keep local credentials, tenant or VM-specific values, and transient build artifacts in `.operator/` or their existing ignored local files.
