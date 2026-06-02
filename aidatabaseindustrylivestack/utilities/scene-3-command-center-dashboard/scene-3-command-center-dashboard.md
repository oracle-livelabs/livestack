# Scene 3 Grid Operations Command Center

## Introduction

The **Grid Operations Command Center** helps utility leaders answer a daily operating question: *Where does the service territory need attention right now?*

The page brings together service demand, operational value, reliability signals, watched services, and AI activity so teams can decide where to investigate first.

Dashboards like this are difficult to implement when customer accounts, service points, smart meter events, reliability bulletins, service requests, field crew capacity, and agent activity live in different systems. Teams often need copied extracts, separate BI models, and reconciliation logic before a dashboard can show a trustworthy view.

Oracle AI Database helps address that challenge by keeping operational, analytical, JSON, in-memory, and AI-ready data close to the same governed data foundation. In this scene, the dashboard brings together utility KPIs, signal velocity, operational value, and watched services without sending the user to another application.

Estimated Time: **10 minutes**

![Grid Operations Command Center with KPI cards, signal velocity, value chart, and watched services](images/scene-03-dashboard.png)

### Objectives

In this scene, you will learn what utility decision the page supports, what evidence the user should inspect, and what action the team may take next.

**Note:** Review the **Oracle Internals** sidebar after the business flow is clear. Use it to connect the visible utility operations outcome to the database capabilities behind the page.

## Task 1: Review the command center dashboard

Use the dashboard as a daily triage view. The goal is to see where service demand, operational value, reliability signals, watched services, or AI activity suggests the territory needs attention.

1. Click **Grid Operations Command Center** in the sidebar.
2. Review the KPI cards across the top of the page.
3. Review **Grid Operations Signal Velocity**.
4. Review **Operational Value by Utility Category**.
5. Review **Watched Services and Supplies - Quality and Capacity Trend**.

    ![Grid Operations Command Center KPI cards, signal velocity, and service value areas highlighted](images/command-center-kpis-overview.png)

6. Open or review the **Oracle Internals** sidebar on the right.

The user can see service request volume, operational value, critical reliability signals, watched utility services, and AI activity in one place. In the captured hosted app, the dashboard shows service request volume, more than **$4.9M** in operational value tracked, **459** critical signals, seven watched utility services, and five completed agent actions.

**Note:** Sample values may change after data refreshes or rebuilds. Verify live output before presenting, then explain the business takeaway.

## Task 2: Interpret signal velocity and operational value

Perform the following set of steps to understand where utility importance and reliability pressure are moving at the same time. This helps leaders decide which categories may need investigation, crew planning, customer follow-up, or asset review.

1. Click a signal velocity time range such as **24h**, **48h**, **7d**, **30d**, or **1y**.
2. Review how the signal chart changes by time bucket.
3. Review the operational value chart by utility category.
4. Focus the conversation on utility categories such as advanced metering, distribution automation, reliability, field operations, gas utility, and critical load support.

    ![Signal velocity time controls and operational value chart highlighted](images/signal-velocity-and-operational-value.png)

The key business story is that utility users need to know where value, volume, and reliability risk are moving together so they can choose the right operating response.

## Task 3: Review watched services and supplies

Perform the following set of steps to move from dashboard-level pressure to the specific service, asset program, field partner, or customer operation that may need attention.

1. Scroll to **Watched Services and Supplies**.
2. Use the watched services search box when rows are available.
3. Review the table columns for utility service, operator or partner, signal count, network impact, trend, and next step.

    ![Watched services table with search filters and current utility service state highlighted](images/watched-services-and-supplies.png)

The watched services table turns the KPI story into a set of operating decisions. A utility leader can move from "critical signals are high" to the specific service, asset program, field partner, or customer operation that needs review.

*You can move to the next scene.*

## Credits & Build Notes
- **Author** - Oracle LiveLabs Team
- **Last Updated By/Date** - Oracle LiveLabs Team, 2026-05-26
