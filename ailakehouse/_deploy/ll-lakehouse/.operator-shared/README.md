# Contribute with Operator in Codex

Operator gives Codex durable project context from the repository. The shared brain is checked in under `.operator-shared/`; a contributor's private project notes and code index live under `.operator/` and stay local to that checkout.

## Set up Codex

Install the Operator Helper and its Codex plugin:

```sh
npm install --global @aerovato/operator-helper
operator-helper install codex
```

Open the deployment checkout in Codex: it is the directory containing `inst.sh`, `ingestion/`, and `.operator-shared/`.

The plugin loads the shared Operator instructions and [catalog](catalog.md) into project work. The detailed topic notes are listed there and should be opened when their `Read If` description matches the task.

## Initialize a contributor's private brain

Run the status check from the project directory:

```sh
operator-helper project status
```

If the Private partition is missing, invoke `$operator-project-init` in Codex and follow its setup guide. The existing `.operator-shared/` is already the team brain; keep it and do not replace it during local setup.

Then create or refresh the local code navigation index by invoking `$operator-index` in Codex. It will guide the index workflow. This project's Private index is ignored by Git, so each contributor can maintain their own navigation without publishing local notes.

Check that Operator can load the brain:

```sh
operator-helper memory check
operator-helper index lint
```

`memory check` should report Shared as loaded. `index lint` checks the local Project Index when one has been initialized.

## Use the brain while contributing

At the start of a task, use the loaded instructions and catalog, then read only the topic notes that fit the change. Start with [architecture](project/architecture.md) for orientation, or use the [source map](project/source-map.md) to find the procedure owner, implementation, and relevant tests. The catalog points to deployment, data-flow, and known-gap notes for narrower work.

Existing deployment procedures remain authoritative: use the repository [README](../README.md), [installation guide](../INSTALLATION-GUIDE.md), [custom image guide](../CREATE_BASE_IMAGE.MD), and [Terraform guide](../terraform-readme.md) for their respective workflows. When a guide conflicts with current behavior, inspect the scripts, service units, Compose files, and tests. Record an unresolved rationale as a gap rather than guessing.

## When updating code or adding features

### Before coding

- Read the relevant Operator topic note. Use [architecture](project/architecture.md) for cross-system changes and the [source map](project/source-map.md) to find the procedure owner, implementation, and tests.
- Identify which deployment path owns the behavior. Terraform is maintained separately; this repository owns VM bootstrap, systemd services, Compose, application code, image preparation, and release packaging.
- Identify the data boundary. The web app uses local Oracle AI Database Free; wallet-backed Autonomous Database is a separate integration. Do not assume their data, credentials, or behavior are interchangeable.
- Check configuration precedence and scope. OCI metadata and `/home/opc/.env` can provide settings; `AIHUB` is selected at image build time. Confirm the exact input path before changing a setting.

### While implementing

- Trace effects across connected layers, such as frontend → API → database or bootstrap → systemd → Compose.
- State which deployment modes the feature supports. Account for startup ordering, retries, idempotency, and offline-image behavior when relevant.
- Keep credentials, wallets, generated keys, and tenant-specific values out of `.operator-shared/`, release archives, and captured images.
- Update Shared memory only for durable rules, boundaries, or constraints. Record unknown rationale in [known gaps](project/known-gaps.md) instead of guessing.

### Before marking the work complete

- Run focused tests for changed behavior and the applicable lint, build, or packaging checks.
- For release changes, use `scripts/build-rc-zip.sh` and `scripts/verify-rc-zip.sh`.
- Match evidence to the claim: a passing test or local build does not establish that a deployed image or live OCI service works. Verify the deployed artifact and runtime when the change requires it.
- Check [known documentation conflicts](project/known-gaps.md) before relying on the stale `DESIGN.md` route, the repository README's “Stop service” command, or the documented `PG_AI_PROFILE_AUTO_SETUP` default.

For a Codex task prompt, specify the behavior to change and ask Codex to identify the implementation owner, affected database and deployment boundaries, and tests before editing. Afterward, ask it to validate the supported paths and update Shared memory only if the work revealed durable project knowledge.

Put contributor-specific preferences, machine details, and private notes in `.operator/`; never put credentials, wallet material, or tenant-specific secrets in Shared.

Changes under `.operator-shared/` are normal repository changes for review and commit. Release archive scripts exclude both Operator partitions, so project memory is not included in deployment packages.

## Useful commands

```sh
operator-helper project status
operator-helper memory check
operator-helper index lint
operator-helper help
```
