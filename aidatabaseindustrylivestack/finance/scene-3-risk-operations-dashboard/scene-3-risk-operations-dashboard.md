# Scene 3: Risk & Operations Dashboard

## Introduction

A Seer Bank risk and operations executive needs a fast view of transaction activity, revenue exposure, compliance signal severity, monitored products, and AI decisions. The challenge is that those indicators usually come from separate reporting, case, data science, and application systems. This scene shows the executive control tower built on one Oracle data foundation.

Estimated Time: 10 minutes

![Risk and Operations Dashboard with live KPI cards](images/dashboard.png)

### Objectives

In this scene, you will:
- Open the **Risk & Operations Dashboard**.
- Read the top KPI cards as a finance control-room narrative.
- Search monitored financial products and institutions.
- Connect the dashboard to Oracle relational, JSON, graph, vector, spatial, and agent data.

## Task 1: Read the live control-room metrics

1. Click **Risk & Operations Dashboard** in the left navigation.
2. Start with the top KPI cards. In the verified deployment, the dashboard showed 3.0K client transactions, $4,213,387.74 in revenue exposure, 474 critical signals, 156 financial products monitored, and 3 AI decisions logged.
3. Interpret the secondary figures: 1.5K transactions in the last 30 days, $2,125,396.43 revenue exposure in the last 30 days, 1.2K elevated signals, and 375 active service cases.
4. Use the **Risk Signal Velocity** chart and **Revenue Exposure by Product Category** chart to explain where executive attention should go first.

These numbers are the visible executive summary of the data foundation established in Scene 2.

## Task 2: Search a monitored product or institution

1. Use the dashboard search box to search for a product, institution, or risk term.
2. Search examples that fit the live data include `Clearwater Credit Union`, `Merchant Acquiring Package`, and `Mortgage`.
3. Open a matching product detail when useful and point out that the product view can include inventory/service-center records and related signal mentions.

The demo action shows how an executive can move from a KPI to a product or institution without asking for a separate report.

## Task 3: Show the Oracle Internals story

1. Open **Oracle Internals** from the right rail if it is collapsed.
2. Point to the badges for relational SQL, native JSON, Oracle Spatial, property graph, Select AI, vector search, and In-Memory Column Store.
3. Explain that the dashboard issues Oracle-backed queries across transactions, signal payloads, graph edges, agent actions, and service-center data without an ETL handoff.

## Credits & Build Notes
- **Author** - Oracle LiveLabs Team
- **Last Updated By/Date** - Oracle LiveLabs Team, 2026-05-20
- **Build Notes** - KPI values were verified with `/api/dashboard/summary` after the live Agent Console check added a third logged AI decision.
