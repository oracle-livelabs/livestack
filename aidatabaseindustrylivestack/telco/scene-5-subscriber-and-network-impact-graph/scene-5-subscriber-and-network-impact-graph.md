# Scene 5 Subscriber and Network Impact Graph

## Introduction

**Subscriber and Network Impact Graph** helps teams understand how a subscriber-impact event propagates through services, sites, tickets, enterprise accounts, and field crews. Instead of reviewing one incident or ticket at a time, users can see connected impact and prioritize response based on subscriber reach, dependencies, and intervention value.

**Important:** The user is not only asking whether an incident exists; they need to know who is affected, which dependencies matter, and where action will reduce the most impact.

Telecom teams struggle when the information needed for one service-assurance decision lives in separate OSS, BSS, care, NOC, field, and analytics tools. That separation slows action, increases reconciliation work, and makes it harder to trust the result.

Oracle AI Database helps address these challenges with property graph and SQL/PGQ on top of the same governed operational data. SQL/PGQ helps answer relationship questions, such as how an outage connects to subscribers, service lines, network sites, support cases, and crews.


In this scene, the graph uses telecom impact entities and relationships to let users explore connected impact and run business-facing graph queries without moving the data into a separate graph-only platform. The detail panel also exposes network evidence so the graph reads like a service-assurance investigation, not just a relationship visualization.


Estimated Time: **10 minutes**

![Subscriber and Network Impact Graph with impact entities and SQL/PGQ explorer](images/subscriber-and-network-impact-graph.png)

### Objectives

In this scene, you will learn what telecom decision the page supports, what evidence the user should inspect, and what action the team may take next.

## Task 1: Review the graph workspace

![Impact entity workspace and graph canvas](images/impact-entity-workspace.png)

Review the graph workspace to see how subscriber-impact relationships connect outage events, service lines, network sites, cases, accounts, and field crews.

1. Click **Subscriber and Network Impact Graph** in the sidebar.
2. Review the search field, **Impact Radius** control, **Impact Entities** list, relationship legend, and graph canvas.
3. Review the metric labels in the selected entity panel: **Affected Subscribers**, **Impact Risk**, **Experience Score**, and **Impact Radius**.

In this example, the graph contains **36** telecom impact entities and **50** telecom graph relationships. The top entities include **Game-day 5G congestion spike**, **Fiber cut affecting enterprise corridor**, and trouble tickets such as **ATL-77109** and **NY-77831**.

**Note:** These are sample values from the current demo dataset and may change after a refresh, seed update, or custom dataset import. Treat these numbers as an example of the current operating pattern. Review the live values in the UI and connect them to the operational pattern: subscriber impact, capacity exposure, SLA risk, revenue exposure, dispatch load, or restoration status.

## Task 2: Investigate a high-impact outage event

![High-impact outage event detail](images/high-impact-entity.png)

Investigate a high-impact outage event to show how teams can move from a named incident to affected subscribers, connected dependencies, related cases, and response priorities.

1. Search for or select **Game-day 5G congestion spike**.
2. Review the entity detail panel.
3. Note the affected subscribers, impact risk, experience score, region, connected relationships, and network evidence.
4. Click **Explore** if the graph is not already centered on that entity.

In the current demo dataset, **Game-day 5G congestion spike** affects **31,200** subscribers, carries **96** impact risk, and has a low **35** experience score. The network evidence panel adds service-assurance context such as cells and sectors, PRB utilization, RRC setup failures, handover failures, throughput, latency, packet loss, backhaul state, and restoration status. That is the data point to emphasize: the graph lets the operator move from a named event to subscriber impact, technical evidence, and connected operational dependencies.

**Note:** These are sample values from the current demo dataset and may change after a refresh, seed update, or custom dataset import. Treat these numbers as an example of the current operating pattern. Review the live values in the UI and connect them to the operational pattern: subscriber impact, capacity exposure, SLA risk, revenue exposure, dispatch load, or restoration status.

## Task 3: Run a SQL/PGQ impact query

![SQL/PGQ Impact Query Explorer](images/sql-pgq-query-explorer.png)

Run a SQL/PGQ impact query to show how service assurance teams can trace subscriber, service, site, case, and crew relationships from an outage or signal seed.

1. Scroll to **SQL/PGQ Impact Query Explorer**.
2. Select **Subscriber Impact Reach**.
3. Keep the seed entity **OUT-EVENT-501** and the default max hops.
4. Click **Run Query**.
5. Review the query result table.

The query helps service assurance teams trace who and what is affected from a signal or outage seed, including subscribers, service lines, sites, cases, and crews.

## Task 4: Explain the investigation pattern

Explain the investigation pattern as connected impact analysis: the graph helps teams prioritize response based on subscriber reach and operational dependencies, not only ticket order.

1. Impact entities are stored as governed telecom data.
2. SQL/PGQ traverses relationships among subscribers, service lines, sites, cases, and crews.
3. The UI turns graph results into operational labels such as affected subscribers and impact risk.
4. The graph helps teams prioritize response based on connected impact, not only ticket order.

You can move to the next scene.

## Credits & Build Notes
- **Author** - Oracle LiveLabs Team
- **Last Updated By/Date** - Oracle LiveLabs Team, 2026-06-29
