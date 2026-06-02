# Scene 5 Service Restoration Graph

## Introduction

**Service Restoration Graph** helps users understand grid relationships that are hard to see in isolated rows. The page connects service points, outage events, substations, feeders, meter events, field crews, reliability gaps, and root causes so teams can reason across the restoration pathway, not just one record at a time.

Utility teams struggle when the information needed for one decision lives in separate tools. That separation slows action, increases reconciliation work, and makes it harder to trust the result.

Oracle AI Database helps answer relationship questions, such as how service points connect to outages, feeders, crews, root causes, and restoration risks.

Estimated Time: **10 minutes**

![Service Restoration Graph page with graph depth controls and utility restoration nodes](images/scene-05-field-crew-graph.png)

### Objectives

In this scene, you will learn what utility decision the page supports, what evidence the user should inspect, and what action the team may take next.

## Task 1: Review the graph workspace

Perform the following set of steps to see how restoration relationships connect service points, outage events, feeders, substations, meter events, field crews, root causes, and reliability gaps.

1. Click **Service Restoration Graph** in the sidebar.
2. Review the graph depth controls: **1 Hop**, **2 Hops**, **3 Hops**, **4 Hops**, and **5 Hops**.
3. Review the search field for service point, outage event, asset, root cause, or field crew lookup.
4. Review **Restoration Graph Nodes**.
5. Review the **Oracle Internals** sidebar after the business flow is clear. Use it to connect the visible utility operations outcome to the database capabilities behind the page.

    ![Service Restoration Graph workspace with search, graph depth controls, node list, selected node metrics, and graph canvas highlighted](images/graph-workspace-controls.png)

In the captured demo dataset, the page shows **50** restoration graph nodes. Visible nodes include **Feeder Fault on NV-12**, **7-Day Repeat Outage Risk**, **North Valley Critical Pump Station**, **Restoration ETA Outreach Gap**, **North Valley Feeder Lockout OUT-1042**, **Feeder NV-12**, **Regional Field Supervisor Team**, and **AMI Voltage Event 5582**.

**Note:** Sample values may change after data refreshes or rebuilds. Verify live output before presenting, then explain the business takeaway.

## Task 2: Explore a restoration-risk example

Perform the following set of steps to show how connected evidence can reveal repeat-outage risk, asset context, crew involvement, and root-cause relationships that are hard to understand from isolated records.

1. In the node list, locate **7-Day Repeat Outage Risk** or another high-risk restoration node.
2. Review the node type, identifier, pathway volume, risk score, and link count.
3. Compare it with nearby reliability-gap and asset nodes such as **7-Day Repeat Outage Risk**, **Feeder NV-12**, and **North Valley Feeder Lockout OUT-1042**.
4. Change the graph depth from **1 Hop** to **2 Hops** or **3 Hops** to explain how relationship scope changes.

    ![Service point restoration-risk node, graph depth control, and graph relationships highlighted](images/restoration-risk-node-example.png)

Use this example to show why graph context matters: a service point, feeder, substation, meter event, crew, and root cause are more informative together than as isolated records.

## Task 3: Explain the Oracle graph pattern

1. Review the **Graph Query Explorer** area.
2. Review the Oracle Internals content that references property graph and SQL/PGQ.
3. Explain that the graph is an analysis view over governed utility data rather than a disconnected copy.

    ![Graph relationship canvas, edge type legend, and Graph Query Explorer options highlighted](images/graph-query-explorer.png)

The business value is that teams can make the decision from connected, governed data. **Oracle AI Database** provides the shared foundation that keeps operational data, analytics, and AI workflows aligned.

*You can move to the next scene.*

## Credits & Build Notes
- **Author** - Oracle LiveLabs Team
- **Last Updated By/Date** - Oracle LiveLabs Team, 2026-05-26
