# Scene 5: Dataset Admin & Audit Trail

## Introduction

Scene 5 covers the supporting operator and governance surfaces that sit beside the core fraud story. Dataset Admin remains a side utility for data stewardship, while Audit Trail is the place where the same transaction becomes a governed case record with Oracle event history.

Estimated Time: 15 minutes

### Objectives

In this lab, you will:
- Open the Dataset Admin overlay from the application shell.
- Review active dataset state and recent Oracle job history without interrupting the main fraud story.
- Review one transaction in Audit Trail and inspect its chronological Oracle event history.

## Task 1: Open Dataset Admin

1. Click `Operator Dataset Admin` in the lower-left rail.
2. Confirm the overlay opens as a modal utility without forcing you out of the main app narrative.
3. Review the main sections inside the overlay:
    - `Active Dataset State`
    - `Import Controls`
    - `Restore Demo Baseline`
    - `Oracle Job Ledger`
    - `Activity Feed`

![Dataset Admin overlay showing the operator utility surface, live dataset state, and restore controls](images/scene-05-dataset-admin.png)

![Dataset Admin detail showing the active dataset state and import controls tracked by Oracle](images/scene-05-dataset-state-detail.png)

Expected result:
- The overlay opens directly, and the operator can inspect current data state without leaving the guided fraud story.

## Task 2: Review the data-control surfaces

1. In `Active Dataset State`, review the current dataset label, version, transaction count, and last update time.
2. In `Import Controls`, note that `Template`, `Validate`, and `Upload` are available for operator use, but they are intentionally kept outside the primary case journey.
3. In `Restore Demo Baseline`, note that the demo can be reset when needed.
4. Scroll to `Oracle Job Ledger` and review the latest recorded import or restore job.

![Oracle Job Ledger detail showing recent dataset operations tracked and replayed through Oracle](images/scene-05-job-ledger-detail.png)

Expected result:
- Dataset Admin reads as a controlled side utility: operators can inspect, validate, upload, or reset data, but the main fraud story remains elsewhere.

## Task 3: Review the Audit Trail for the same case

1. Close the overlay.
2. Click `Audit Trail` in the left navigation.
3. In `Transaction Governance Ledger`, click a transaction row such as `TXN-SEED-0023`.
4. Review the KPI strip at the top of the page, then confirm the selected row drives `Focused Audit Case`.
5. In the focused case, review:
    - `Latest stage`
    - `Scenario`
    - `Disposition`
    - `Amount`
6. Click `Open in Investigation` if you want to pivot the same case back into the graph workbench.
7. Scroll to `Chronological Audit Steps` and expand one `Raw audit payload` section to inspect the recorded event body.

![Audit Trail showing the governance ledger, focused case, and Oracle event history for the selected transaction](images/scene-05-audit-trail.png)

![Chronological audit detail showing parsed event steps and raw payload expansion for the selected case](images/scene-05-audit-chronology-detail.png)

Expected result:
- Audit Trail turns the same transaction into a readable governance record, with ledger filters, a focused-case summary, and raw Oracle event payloads all available from one screen.

## Task 4: Why this matters?

Dataset controls and governance evidence are both necessary, but they should not compete with the core fraud journey. Scene 5 proves the app can keep data stewardship on the side while still closing the main story with a readable Oracle-backed audit record.

## Credits & Build Notes

- **Author** - The LiveLabs Team
- **Last Updated By/Date** - The LiveLabs Team, April 2026
