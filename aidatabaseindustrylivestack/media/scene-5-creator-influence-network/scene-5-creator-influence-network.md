# Scene 5 Creator & Community Graph

## Introduction

**Creator & Community Graph** helps teams understand how creators, communities, platforms, studios, and content assets connect so they can see influence pathways instead of isolated metrics.

Media teams struggle when creator data, audience communities, campaign activity, and content performance live in separate systems. That separation makes it harder to understand who is influencing whom and where audience attention is moving.

**Oracle AI Database** helps address that challenge by supporting graph analysis over the operational media schema. Graph analysis helps answer relationship questions such as which creators influence the same audience, which communities amplify content, and where campaigns spread across platforms.

In this scene, the application exposes creator and community relationships while the implementation reference explains the Oracle Property Graph and SQL/PGQ pattern behind the view.

Estimated Time: **10 minutes**

![Creator Influence Network with creator list and graph workspace](images/creator-influence-network.png)

### Objectives

In this scene, you will learn what creator or audience decision the page supports, what evidence the user should inspect, and what action the business may take next.

## Task 1: Review the graph workspace

Perform the following set of steps to see how creators, communities, studios, labels, campaigns, and audience groups connect through influence relationships.

1. Click **Creator & Community Graph** in the sidebar.
2. Review the graph depth controls: **1 Hop**, **2 Hops**, **3 Hops**, **4 Hops**, and **5 Hops**.
3. Review the creator list and influence metrics.
4. Review the selected creator summary and graph canvas.

    ![Creator graph workspace with depth controls, creator list, metrics, and graph canvas](images/graph-workspace-controls.png)

**Notes:**
- **Callout 1** highlights the search, graph-depth controls, and creator list.
- **Callout 2** highlights the selected creator metrics.
- **Callout 3** highlights the rendered creator relationship graph.

In the current seeded dataset, the page shows **50** visible creators in the list. Visible examples include **@fanbase_020**, **@streaming_482**, **@premiere_461**, **@fanbase_440**, **@sportsreel_419**, and **@fastchannel_398**. The selected creator **@fanbase_020** has about **170.4K** followers, an influence score around **82.6**, **13** connections, and a connected creator neighborhood.

**Note:** Sample values may change after data refreshes or rebuilds. Verify live output before presenting, then explain the business takeaway.

## Task 2: Explore a creator-network example

Perform the following set of steps to show how influence travels across communities, content assets, platforms, and campaigns.

1. Select a creator such as **@retention_314**.
2. Review the platform, niche, follower count, influence score, engagement, and connection count.
3. Change graph depth from **1 Hop** to **2 Hops** or **3 Hops**.
4. Review how the visible neighborhood changes as the relationship scope expands.

    ![Selected creator node and connected community network](images/creator-node-network-example.png)

**Notes:**
- **Callout 1** highlights the selected **@retention_314** creator row and hop control.
- **Callout 2** highlights the selected creator metrics.
- **Callout 3** highlights the recalculated creator network for that selection.

A creator, platform, studio, label, community, and campaign are more informative together than as isolated records. The graph helps teams see influence as connected evidence rather than disconnected social metrics.

## Task 3: Explain the Oracle graph pattern

Perform the following set of steps to explain that the graph is an analysis view over governed media data. It helps users answer relationship-aware questions without moving data into another system.

1. Scroll to **Graph Query Explorer**.
2. Review the edge-type legend, graph query area, and SQL/PGQ reference.
3. Explain that the graph is an analysis view over governed media data rather than a disconnected copy.

    ![Graph Query Explorer and creator relationship evidence](images/graph-query-explorer.png)

**Notes:**
- **Callout 1** highlights relationship evidence and edge context for the selected creator.
- **Callout 2** highlights studio, label, and content-line relationship evidence. 
- **Callout 3** highlights the SQL/PGQ query templates in **Graph Query Explorer**.

The business value is that teams can understand audience reach, creator influence, and campaign propagation from connected, governed data.

*You can move to the next scene.*

## Credits & Build Notes
- **Author** - Oracle LiveLabs Team
- **Last Updated By/Date** - Oracle LiveLabs Team, 2026-06-04
