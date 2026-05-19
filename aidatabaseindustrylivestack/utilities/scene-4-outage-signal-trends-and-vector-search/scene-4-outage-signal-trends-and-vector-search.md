# Scene 4 Outage Signal Trends and Vector Search

## Introduction

This scene demonstrates semantic search across outage and grid-service signals. The operator can search by business meaning, then filter signal posts by momentum, platform, or field crew.

Estimated Time: 8 minutes

![Outage Signal Trends page showing vector search controls and signal filters.](images/scene-04-outage-signals.png)

### Objectives

In this lab, you will:
- Open the outage signal trends workflow.
- Run a grid-service vector search.
- Filter posts to identify rising customer or community signals.

## Task 1: Run semantic search

1. Click **Outage Signal Trends** in the sidebar.
2. Type a phrase such as `storm outage restoration priority` into **Grid Service Vector Search**.
3. Click **Search** and review the ranked results when the backend is available.

Expected result:
- The page submits a vector-search request over embedded utilities service and signal text.
- With the full stack running, the result list ranks semantically related services instead of relying only on exact keywords.
## Task 2: Filter signal momentum

1. Select a momentum value such as **Viral** or **Rising**.
2. Select a platform or field crew when those filters are populated.
3. Search posts by embedding to compare broad semantic search with post-level search.

Expected result:
- The operator can narrow signal investigation from broad search to actionable posts.
- The right panel connects the scene to VECTOR_EMBEDDING, VECTOR_DISTANCE, ANN indexing, and row-level security.

## Task 3: Why this matters?

Utilities teams often hear the problem before structured tickets catch up. Vector search helps turn noisy community signals into a prioritization surface.

## Credits & Build Notes
- **Author** - Oracle LiveStack Team
- **Last Updated By/Date** - Oracle LiveStack Team, 2026-05-13
