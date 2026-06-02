# Scene 5 Signal Propagation Network

## Introduction

**Signal Propagation Network** helps life sciences teams look beyond a single quality signal. The page shows how signal sources, manufacturers, products, logistics partners, and regulated communities are connected, so teams can understand where a quality event or supply constraint may propagate.

Quality and supply teams struggle when this information lives in separate systems. That separation makes it harder to understand whether one bulletin is isolated or connected to a wider manufacturer, product, source, or cold-chain pattern.

Oracle AI Database helps address these challenges by modeling signal, source, product, and manufacturer relationships as a property graph over governed life sciences data. SQL/PGQ helps answer relationship questions, such as which signal sources are community hubs or how quality signals may travel through connected sources.

Estimated Time: 10 minutes

![Signal Propagation Network page with graph workspace highlighted](images/propagation-network.png)

### Objectives

In this scene, you will learn what life sciences decision the page supports, what evidence the user should inspect, and what action the business may take next.

## Task 1: Review the Signal Propagation Network page

![Signal Propagation Network page with source list, metrics, and graph highlighted](images/propagation-network.png)

Review the network to move beyond a simple list of signal sources. The graph helps the organization see relationships, communities, and possible paths for quality or supply signal propagation.

1. Click **Signal Propagation Network** in the sidebar.
2. Review the regulatory and quality source list on the left.
3. Review the graph depth control. Increasing the hop count expands the network from direct relationships to broader propagation paths.
4. Review the graph workspace. The graph connects regulated signal sources through relationship types such as follows, collaborates, reshared, inspired by, tagged, co-creator, and mentions.

The page helps the user decide which sources, manufacturers, or communities may need closer monitoring after a quality signal appears.

## Task 2: Inspect the selected source data point

![Signal network selected source and manufacturer relationships highlighted](images/signal-network-query-explorer.png)

Inspect the selected source to compare direct authority metrics with network position. This helps the business decide whether a source may amplify risk beyond one isolated message.

1. Use the selected source at the top of the list, such as **@stability_risk**.
2. Review the source metrics above the graph, including regulated reach, authority, signal rate, connections, nodes, edges, and graph depth.
3. Compare the source row on the left with the graph on the right.
4. Review **Manufacturer and Signal Relationships** below the graph.

This is the data point to focus on during the demo: **@stability_risk** is the selected source, and the visible manufacturer relationships connect the source to organizations such as CitrateSource Pharma, ElectrolyteWorks Clinical, GreenLab Reagents, and PurePAC Clinical.

## Task 3: Run Community Hub Detection

![Community Hub Detection query result with returned rows highlighted](images/community-hub-results.png)

Run **Community Hub Detection** to find sources that sit near the center of active signal communities. These sources may be useful for quality surveillance, supply risk monitoring, or regulatory follow-up.

1. Scroll to **Graph Query Explorer**.
2. Select **Community Hub Detection (Degree Centrality)**.
3. Click **Run Query**.
4. Review the returned rows.

Focus on the result count and the first hub. In the current demo dataset, the query returns **20** rows and identifies **@import_alerts** as a high-degree hub with **15** graph connections, **6** edge types, and an average relationship strength of about **0.610**.

This result is useful because it shows a graph-based decision signal: the most important source is not determined only by one message, but by how many meaningful relationship paths it can activate.

You can move to the next scene.

## Credits & Build Notes
- **Author** - Oracle LiveLabs Team
- **Last Updated By/Date** - Oracle LiveLabs Team, 2026-05-29
