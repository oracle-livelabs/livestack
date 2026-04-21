# Conclusion: Key Takeaways

## Introduction

This closing lab summarizes what you validated across the Bank scenes and how to continue from a stable, Oracle-backed LiveStack baseline.

Estimated Time: 6 minutes

### Objectives

In this lab, you will:
- Recap the full scene-by-scene learning path.
- Confirm the runtime and data-management components behind the scenes.
- Define practical next steps for continued exploration.

## Task 1: Recap the scene sequence

1. Confirm you completed scene labs for:
    - Authorisation Control Tower
    - Oracle Internals Evidence Rail
    - Investigation Workbench
    - Scenario Lab
    - Dataset Admin & Audit Trail

2. Use `Ctrl/Cmd+K` to confirm the same scenes and operator tools are available from the application shell.

Expected result:
- You have validated each scene as an independent lab aligned to the live application navigation.

## Task 2: Recap runtime and data services

1. Confirm the compose stack includes:
    - `db`
    - `ords`
    - `ollama`
    - `app`

2. Confirm the default local runtime ports:
    - `8505` application
    - `8181` ORDS
    - `11434` Ollama
    - `1521` database

3. Confirm the dataset-admin workflow you exercised:
    - template download
    - active dataset-state review
    - restore and upload controls
    - job status and ledger review

Expected result:
- You can explain both the runtime topology and the Oracle-backed dataset workflow without leaving the workshop context.

## Task 3: Plan your next iteration

1. If your focus is fraud-story clarity, spend more time in Control Tower and Oracle Internals until the case handoff feels effortless.
2. If your focus is investigation depth, use the Investigation Workbench to compare `Text`, `Vector`, and `Hybrid` search modes against the same case.
3. If your focus is fraud-strategy rehearsal, rerun Scenario Lab and compare how `dreRecommendation` and `authenticResponse` shift across different variants.
4. If your focus is customer onboarding, validate a richer customer archive through Dataset Admin, then restore the demo baseline when finished.
5. Remember that a demo restore resets `/api/analytics/scenario-replay` to an empty queue until a new scenario is run.

Expected result:
- You have a clear next-step path based on the part of the LiveStack you want to deepen.

## Task 4: Why this matters?

The value of this workshop is not only feature coverage, but story integrity. When the documentation follows the same case-led path as the app, operators, builders, and stakeholders can all understand the system without mentally stitching together disconnected screens.

## Credits & Build Notes

- **Author** - The LiveLabs Team
- **Last Updated By/Date** - The LiveLabs Team, April 2026
