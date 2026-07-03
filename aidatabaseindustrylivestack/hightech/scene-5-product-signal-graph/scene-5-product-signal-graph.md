# Scene 5 Product Signal Graph

## Introduction

The **Product Signal Graph** helps users understand relationships that are difficult to see in isolated rows. It connects product lifecycle records, suppliers, **BOM** dependencies, launch blockers, fab capacity, wafer lots, test programs, quality cases, warranty exposure, service activity, and customer commitments.

**High Tech** teams struggle when the evidence needed for one decision is split across **PLM**, **MES**, **ERP**, quality, service, warranty, and customer systems. **Oracle AI Database** helps answer relationship questions across structured, graph, vector, spatial, and operational data from the same governed foundation.

Estimated Time: **10 minutes**

![Product Signal Graph page with selected node, graph metrics, and relationship view](images/scene-5-product-signal-graph.png)

### Objectives

In this scene, you will learn how graph relationships connect products, components, suppliers, manufacturing steps, ECOs, NPI milestones, quality programs, service cases, and customer commitments across the launch-risk story.

## Task 1: Review the graph workspace

Perform the following set of steps to see how the product graph connects records across High Tech domains:

1. Click **Product Signal Graph** in the sidebar.
2. Review the graph depth controls: **1 Hop**, **2 Hops**, **3 Hops**, **4 Hops**, and **5 Hops**.
3. Review the search field for product, component, supplier, fab, quality, warranty, service, or customer commitment lookup.
4. Review **Product Signal Graph Nodes** and the selected node summary.
5. Expand **Oracle Internals** after the business flow is clear and review the property graph and SQL/PGQ-style evidence.

    ![Product Signal Graph controls and metrics highlighted](images/graph-workspace-controls.png)

The graph should include **High Tech** relationships such as commitment blockers, **BOM** changes, manufacturing sites, component dependencies, yield impact, warranty exposure, **ECO** mitigation, order promise support, wafer-start consumption, and capacity reservations.

**Note:** Sample values may change after data refreshes or rebuilds. Verify live output before presenting, then explain the business takeaway.

## Task 2: Explore a lifecycle-risk example

Perform the following set of steps to show how connected evidence can reveal shared root causes, supplier exposure, yield risk, ECO impact, customer commitment exposure, and service follow-up:

1. In the node list, locate a visible product, component, supplier, launch blocker, quality case, or customer commitment node.
2. Review the node type, identifier, signal volume, risk score, hop coverage, lifecycle edges, and connected cases.
3. Change the graph depth from **1 Hop** to **2 Hops**, **3 Hops**, or **5 Hops** to explain how relationship scope changes.
4. Compare nearby product, BOM, supplier, fab, quality, warranty, service, and customer commitment nodes.

    ![Product lifecycle node example highlighted in the graph workspace](images/product-lifecycle-node-example.png)

Use this example to show why graph context matters: a component shortage, wafer-start constraint, **ECO** delay, quality signal, customer commitment, and service exposure are more useful together than as isolated records.

## Task 3: Run the graph query explorer

Perform the following set of steps to explain how the graph remains an analysis view over governed High Tech data rather than a disconnected copy:

1. Scroll to **Graph Query Explorer**.
2. Review the example query cards.
3. Select a graph query and click **Run Query**.
4. Review returned rows and the SQL/PGQ-style query path.

    ![Graph Query Explorer cards highlighted](images/graph-query-explorer.png)

    ![Graph query results and executed SQL highlighted](images/graph-query-results.png)

Use the query explorer to make the Oracle graph pattern tangible. The graph is not a static visualization; it is a queryable view of product lifecycle relationships built on governed Oracle records.

The business value is that teams can make the decision from connected, governed data. **Oracle AI Database** provides the shared foundation that keeps operational data, analytics, graph evidence, and AI workflows aligned.

*You can move to the next scene.*

## Credits & Build Notes
- **Author** - Oracle LiveLabs Team
- **Last Updated By/Date** - Oracle LiveLabs Team, 2026-06-16
- **Source Bundle** - `livestack-hightech.zip`
