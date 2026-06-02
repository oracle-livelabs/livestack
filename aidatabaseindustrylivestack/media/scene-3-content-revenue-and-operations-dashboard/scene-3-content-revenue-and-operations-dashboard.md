# Scene 3 Content Revenue and Operations Dashboard

## Introduction

The Launch Operations Command Center is built for a media operations leader, content strategist, programming manager, ad-sales analyst, or streaming-platform executive who needs a daily operating view of launch demand, campaign value, audience momentum, rights capacity, retention pressure, and AI-assisted actions.

Dashboards like this are difficult to implement when content catalogs, audience signals, campaign orders, rights capacity, revenue data, and agent activity live in different systems. Teams often need copied extracts, separate BI models, and reconciliation logic before a dashboard can show a trustworthy view.

Oracle AI Database helps address that challenge by keeping operational, analytical, JSON, in-memory, and AI-ready data close to the same governed data foundation. In this scene, the dashboard brings together live media KPIs, audience signal velocity, content revenue by category, and content demand alerts without sending the user to another application.

Estimated Time: 10 minutes

![Launch Operations Command Center with media KPI cards and demand alerts](images/content-revenue-operations-dashboard.png)

### Objectives

In this scene, you will:
- Review the command center as a media operations user.
- Interpret the KPI cards, audience signal velocity chart, content revenue chart, and content demand alerts table.
- Change the signal velocity time window.
- Connect content demand alerts to content recommendation, campaign, and rights decisions.
- Use the collapsed **Oracle Internals** rail as the implementation reference when needed.

## Task 1: Review the command center dashboard

1. Click **Launch Operations Command Center** in the sidebar.
2. Review the KPI cards across the top of the page.
3. Review **Audience Signal Velocity**.
4. Review **Content Revenue by Category**.
5. Review **Content Demand Alerts - Audience Momentum**.

    ![Command center KPI cards, signal velocity, and revenue summary](images/command-center-kpis-overview.png)

In the current seeded dataset, the page shows **3.0K** campaign requests, about **$854.5M** in tracked content revenue, **474** audience momentum signals, **187** launch demand alerts, and the current AI action count. Use those numbers to frame the command center as a triage surface: the user can see demand, value, signal pressure, rights capacity, and AI activity in one place.

## Task 2: Interpret signal velocity and content revenue

1. Click a signal velocity time range such as **24h**, **48h**, **7d**, or **30d**.
2. Review how the signal chart changes by time bucket.
3. Review the content revenue chart by category.
4. Focus on visible categories such as **Sports Rights**, **Gaming and Esports**, **Marketing Assets**, **Audience Activation**, **Creator Campaign**, **Live Event**, **Streaming Placement**, and **Ad Inventory**.

    ![Audience signal velocity controls and content revenue breakdown](images/audience-signal-velocity-and-revenue.png)

This is the business story to emphasize: media teams need to know where attention, revenue, and risk are moving together. A category with high revenue and rising audience signals may need a different operating response than a category with stable demand and ample rights capacity.

## Task 3: Review content demand alerts

1. Scroll to **Content Demand Alerts - Audience Momentum**.
2. Review the content asset, studio or label, mentions, views, virality, and momentum columns.
3. Focus on visible examples such as **Pulse Arena Creator Clip Flight**, **Echo Valley FAST Channel Breakout Package**, **WideAngle Matchday In-Game Purchase Offer**, and **Family Animation Premiere**.
4. Use the row data to connect audience behavior to programming, content recommendation, campaign, or rights-capacity decisions.

    ![Content demand alerts table with high-momentum media assets](images/content-demand-alerts.png)

The demand alerts table turns the KPI story into a set of operating decisions. A media leader can move from "audience momentum is rising" to a specific content asset, campaign, partner, or audience segment that needs action.

You can move to the next scene.

## Credits & Build Notes
- **Author** - Oracle LiveLabs Team
- **Last Updated By/Date** - Oracle LiveLabs Team, 2026-05-29
