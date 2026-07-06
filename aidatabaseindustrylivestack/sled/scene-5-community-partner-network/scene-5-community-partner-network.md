# Scene 5 Community Partner Network

## Introduction

Eligibility and resident-service resolution can cross program, county, partner, and case-management boundaries. Jessica uses the Community Partner Network to identify which Colorado organizations and handoff paths can respond to the demand evidence found in Scene 4.

Estimated Time: **10 minutes**

![Colorado Community Partner Network and coordination workspace](images/scene-5-community-partner-network.png)

### Objectives

In this scene, you will trace an in-state partner network, inspect program and handoff evidence, and validate the coordination path with SQL/PGQ.

## Task 1: Trace the Colorado eligibility partner network

1. Click **Community Partner Network** in the sidebar.
2. Search for `Benefits Eligibility`.
3. Select a matching community partner from the current results.
4. Set graph depth to **2 Hops**.
5. Review connected Colorado partners, relationship types, coordination score, and constituent reach.

    ![Colorado eligibility partner graph at two hops](images/partner-graph-workspace.png)

Jessica can see an operational coordination path rather than an unstructured list of organizations. Two-hop evidence reveals where a resident issue may require more than one handoff.

## Task 2: Inspect program and handoff evidence

1. Select the center node or a connected node.
2. Review source channel, service domain, city, relationship types, and **Public Program Relationships**.
3. Identify the partner or program most relevant to the eligibility demand signal.

    ![Colorado partner and public program relationship evidence](images/partner-program-relationships.png)

The relationship evidence explains why the selected organization is relevant and which governed service path connects it to the operating decision.

## Task 3: Validate the coordination path with SQL/PGQ

1. Open **Public Sector Graph Query Explorer**.
2. Select **Community Service Hub Detection**.
3. Enter `Benefits Eligibility` for Service Domain.
4. Click **Run Query**.
5. Review returned rows, elapsed time, and the expanded SQL/PGQ statement.

    ![SQL PGQ evidence for a Colorado eligibility coordination path](images/graph-query-explorer.png)

Jessica now has a defensible coordination candidate backed by graph relationships and query evidence. Scene 6 tests whether the response is geographically and operationally feasible within Colorado.

*You can move to the next scene.*

## Credits & Build Notes

- **Author** - Oracle LiveLabs Team
- **Last Updated By/Date** - Oracle LiveLabs Team, 2026-07-03
