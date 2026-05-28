# Scene 2 Healthcare Data Foundation

## Introduction

This scene prepares the Seer Health Network dataset that powers the rest of the LiveStack Demo. The page loads or restores the governed Oracle AI Database 26ai data foundation, then shows the major healthcare domains and data types used across the application.

The scene is useful at the start of a customer walkthrough because it establishes that the later pages are not separate demos. Care services, signal bulletins, service requests, service vectors, signal vectors, semantic matches, spatial logistics data, graph relationships, machine learning outputs, and agent audit records are all prepared from the same Oracle-backed foundation.

Estimated Time: 5 minutes

![Healthcare Data Foundation page with dataset restore controls and loaded data domains](images/scene-2-healthcare-data-foundation.png)

### Objectives

In this scene, you will:
- Load or restore the Seer Health Network demo dataset.
- Review the live record counts that confirm the demo foundation is ready.
- Understand what healthcare data domains are prepared for downstream scenes.
- Use the **What Gets Loaded** carousel to connect each domain to the rest of the demo.
- Use the **Oracle Internals** sidebar to connect the page to Oracle AI Database capabilities.

## Task 1: Prepare the dataset

1. From the welcome page, click **Start the demo**, or click **Data Foundation** in the sidebar.
2. In **Prepare the Dataset**, click **Restore Demo Data** if the dataset needs to be reset to the seeded baseline.
3. Wait for the operation to complete.
4. Review the record counts below the action.

    ![Prepare the Dataset restore action and healthcare record counts highlighted](images/prepare-dataset-counts.png)

In the current demo dataset, the page shows **14,796** tracked records across the major demo layers, including **187** care services, **5,000** signal bulletins, **3,000** service requests, **187** service vectors, **5,000** signal vectors, and **1,422** semantic matches.

Use these counts to frame the demo. The user is not loading a single table for a dashboard. The page prepares the operational, analytical, spatial, graph, vector, and audit data that each later scene uses.

## Task 2: Review what gets loaded

1. Scroll to **What Gets Loaded**.
2. Review the first three carousel cards: **Healthcare Data Foundation**, **Healthcare Operations**, and **Quality and Capacity Signals**.
3. Use the right carousel arrow to review the remaining data groups.
4. Click the **Oracle Internals** icon on the far-right rail to expand the sidebar, then review the Oracle capability notes.

    ![What Gets Loaded carousel and Oracle Internals data foundation notes highlighted](images/what-gets-loaded-carousel.png)

The carousel explains the shared data model in business terms: provider networks, care services, care sites, service requests, quality signals, logistics geography, graph links, vectors, ML outputs, and agent actions. The sidebar ties that story to Oracle capabilities such as relational data, JSON Duality Views, property graph, Oracle Spatial, vector search, in-database ML, and the agent audit trail.

## Task 3: Connect the foundation to the rest of the demo

Use this page as the handoff into the operating story:

1. Explain that the command center will summarize the foundation as healthcare operating indicators.
2. Explain that quality and capacity signals will use vector search over the signal data prepared here.
3. Explain that care pathway, logistics, service request, analytics, Ask Data, and agent pages all read from the same governed foundation.

    ![Downstream healthcare scenes and loaded data domains highlighted from the Data Foundation page](images/foundation-downstream-handoff.png)

The value of Oracle AI Database is that the demo can move across these workloads without sending the audience to separate systems or asking them to trust copied data. The later scenes show different interfaces over one governed healthcare data platform.

You can move to the next scene.

## Credits & Build Notes
- **Author** - Oracle LiveLabs Team
- **Last Updated By/Date** - Oracle LiveLabs Team, 2026-05-22
