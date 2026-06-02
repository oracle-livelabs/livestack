# Scene 2 Seer 26ai Media Data Foundation

## Introduction

This scene prepares the Seer Media dataset that powers the rest of the LiveStack Demo. The page loads or restores the governed Oracle AI Database 26ai data foundation, then shows the major media domains and data types used across the application.

The scene is useful at the start of a customer walkthrough because it establishes that the later pages are not separate demos. Players, viewers, subscribers, fans, creators, content assets, campaign requests, live events, audience momentum signals, trust and safety signals, coverage geography, vector embeddings, ML outputs, and agent audit history are all prepared from the same Oracle-backed foundation.

Estimated Time: 5 minutes

![Seer 26ai Media Data Foundation page with dataset controls and loaded domains](images/media-data-foundation.png)

### Objectives

In this scene, you will:
- Load or restore the Seer Media demo dataset.
- Review the live record counts that confirm the demo foundation is ready.
- Understand which media data domains are prepared for downstream scenes.
- Use the **What Gets Loaded** carousel to connect each data domain to the rest of the demo.
- Use the collapsed **Oracle Internals** rail as the implementation reference when needed.

## Task 1: Prepare the dataset

1. From the welcome page, click **Start the demo**, or click **Data Foundation** in the sidebar.
2. In **Prepare the Dataset**, click **Restore Demo Data** only when the hosted or local demo needs to return to the seeded baseline.
3. Wait for the operation to complete.
4. Review the record counts below the action.

    ![Prepare the Dataset action and Seer Media record counts](images/prepare-dataset-counts.png)

In the current seeded dataset, the page shows **14,796** tracked records across the major demo layers, including **187** content assets, **5,000** audience signals, **3,000** campaign requests, **187** content vectors, **5,000** signal vectors, and **1,422** semantic matches.

Use these counts to frame the demo. The user is not loading a single table for a dashboard. The page prepares the operational, analytical, spatial, graph, vector, and audit data that each later scene uses.

## Task 2: Review what gets loaded

1. Scroll to **What Gets Loaded**.
2. Review the first carousel cards: **Gaming & Media Data Foundation**, **Launch Operations Intelligence**, and **Audience Momentum & Safety Signals**.
3. Use the carousel arrow to review the remaining data groups.
4. If you discuss implementation details live, open the **Oracle Internals** rail, then collapse it again before continuing the screenshot-oriented walkthrough.

    ![What Gets Loaded carousel for Seer Media data domains](images/what-gets-loaded-carousel.png)

The carousel explains the shared data model in business terms: content assets, audience accounts, campaign requests, creators, live events, moderation and engagement signals, rights capacity, spatial coverage, vectors, ML forecasts, and agent actions. The Oracle implementation reference ties that story to relational data, JSON Duality Views, property graph, Oracle Spatial, vector search, in-database ML, and the agent audit trail.

## Task 3: Connect the foundation to downstream scenes

Use this page as the handoff into the operating story:

1. Explain that the command center will summarize the foundation as launch, campaign, revenue, and demand indicators.
2. Explain that audience signals will use vector search over content and signal embeddings prepared here.
3. Explain that creator graph, rights coverage, campaign requests, analytics, Ask Data, and agent pages all read from the same governed foundation.

    ![Downstream Seer Media data groups in the foundation carousel](images/foundation-downstream-handoff.png)

The value of Oracle AI Database is that the demo can move across these workloads without sending the audience to separate systems or asking them to trust copied data. The later scenes show different interfaces over one governed media data platform.

You can move to the next scene.

## Credits & Build Notes
- **Author** - Oracle LiveLabs Team
- **Last Updated By/Date** - Oracle LiveLabs Team, 2026-05-29
