# Scene 2 Data Foundation

## Introduction

Before Jessica acts on the eligibility-risk signal, she verifies that residents, service requests, service centers, partner relationships, geographic layers, forecasts, and audit records come from one governed Colorado dataset. This is the evidence baseline for the entire operating decision.

Estimated Time: **5 minutes**

![Data Foundation with the governed Colorado service domains](images/scene-2-seer-26ai-data-foundation.png)

### Objectives

In this scene, you will confirm non-zero live records, connect Oracle workloads to later business steps, and avoid changing the dataset during the normal presentation.

## Task 1: Confirm the governed Colorado baseline

1. Click **Data Foundation** in the sidebar.
2. Review the live counts for Public Services, Resident Signals, Service Requests, Service Vectors, Signal Vectors, and Semantic Matches.
3. Confirm that the values are populated.
4. Do not click **Restore Demo Data** during the normal walkthrough. Use restoration only when intentionally resetting the seeded environment.

    ![Populated record counts for the governed Colorado baseline](images/prepare-dataset-counts.png)

The counts establish that later dashboards, vectors, graphs, maps, requests, and agents are different views of one prepared Colorado baseline.

## Task 2: Review the connected service domains

1. Scroll to **What Gets Loaded**.
2. Use the carousel to inspect all capability groups.
3. Call out benefits eligibility as one governed domain alongside permits, inspections, public works, emergency response, and other state services.

    ![What Gets Loaded carousel with connected Colorado service domains](images/what-gets-loaded-carousel.png)

The breadth of the foundation matters because the Medicaid metric is an early-warning signal inside a larger state-services operating model.

## Task 3: Trace the evidence into the operating workflow

1. Open **Oracle Internals** after the business story is clear.
2. Link relational records to requests, vectors to resident signals, graph data to partner coordination, Spatial data to coverage, OML to capacity, and audit records to agent action.
3. Transition to the command center to interpret the risk signal.

    ![Oracle capabilities connecting the Colorado baseline to downstream scenes](images/foundation-downstream-handoff.png)

Jessica has established data trust. She can now treat the 2.7% rate and the surrounding workload indicators as connected operational evidence rather than isolated dashboard values.

*You can move to the next scene.*

## Credits & Build Notes

- **Author** - Oracle LiveLabs Team
- **Last Updated By/Date** - Oracle LiveLabs Team, 2026-07-03
