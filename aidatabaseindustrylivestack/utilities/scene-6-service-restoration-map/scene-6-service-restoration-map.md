# Scene 6 Field Crew Logistics Map

## Introduction

**Field Crew Logistics Map** helps teams decide where service demand, crew capacity, supply availability, route coverage, and customer risk intersect. The page gives a geographic operating view so users can compare service points, logistics sites, routes, zones, demand regions, and capacity alerts in one place.

Location-aware utility decisions are difficult when service points, logistics sites, routes, service zones, density grids, and demand regions live outside the operational data platform. Teams may export to a GIS tool, but then lose the connection to current service requests, capacity levels, access controls, and operational status.

Oracle AI Database helps address these challenges by keeping spatial geometry and operational records together. In this scene, Oracle Spatial powers field crew logistics sites, routes, service zones, service territory demand regions, and proximity context in the same application that manages the rest of the utility data.

Estimated Time: **10 minutes**

![Field Crew Logistics Map with spatial layers, logistics priorities, and site table](images/scene-06-restoration-map.png)

### Objectives

In this scene, you will learn what utility decision the page supports, what evidence the user should inspect, and what action the team may take next.

## Task 1: Review logistics priorities

Perform the following set of steps to understand where demand, capacity, field supply alerts, service territories, and route coverage may require attention.

1. Click **Field Crew Logistics Map** in the sidebar.
2. Review the stat cards across the top of the page.
3. Review **Logistics priorities** to the right of the cards.
4. Review the active user and VPD banner.

**Note:** Access controls help ensure users see only the utility data they are allowed to see, which matters for customer records, service requests, operational assets, grid-sensitive details, and AI governance.

    ![Field crew logistics priority cards, priority recommendations, and VPD context highlighted](images/logistics-priorities.png)

In the captured demo dataset, the page shows **12** active field crew logistics sites visible to the current user, about **62.8K** available capacity or supply units, **750** pending logistics requests, and **19** active capacity and supply alerts.

The priority panel flags high-priority alerts, demand concentration in **Bay Area (SF)** and **New York Metro**, and a recommendation to review capacity and supply alerts before checking route coverage.

**Note:** Sample values may change after data refreshes or rebuilds. Verify live output before presenting, then explain the business takeaway.

## Task 2: Toggle spatial layers

Perform the following set of steps to compare different field operations questions: where service points are located, where crews and logistics sites are available, how routes connect, which zones are covered, and where demand regions are active.

1. Review the map and its layer controls.
2. Toggle **Service Point Tiers**.
3. Toggle **Field Crew Logistics Sites**, **Field Crew Logistics Routes**, and **Field Crew Logistics Zones**.
4. Toggle **Service Point Density Grid** and **Service Territory Demand Regions**.
5. Review how the map changes as layers are added or removed.

    ![Field crew logistics map layer controls, spatial map context, and site table preview highlighted](images/field-crew-logistics-map-layers.png)

The layer controls let different users answer different operating questions, such as where demand is concentrated, which routes matter, which zones are covered, and which sites may need capacity attention

## Task 3: Compare site data with the map

Perform the following set of steps to connect visual location context with concrete operating records such as capacity, pending requests, alerts, current load, and status.

1. Scroll to the **Field Crew Logistics Sites** table.
2. Review columns for site location, site type, services supported, capacity or supply units, pending requests, alerts, current load, and status.
3. Focus on visible sites such as **Atlanta Field Dispatch Depot**, **Bay Area DERMS Hub**, **Boston Water Response Center**, **Chicago Midwest Restoration Hub**, and **Dallas Distribution Operations Center**.
4. Use the table to connect map markers to concrete operating records.

    ![Field crew logistics sites table and selected operating rows highlighted](images/field-crew-logistics-sites-table.png)

The business value is that teams can make the decision from connected, governed data. Oracle AI Database provides the shared foundation that keeps operational data, analytics, and AI workflows aligned.

Access controls help ensure users see only the utility data they are allowed to see, which matters for customer records, service requests, operational assets, grid-sensitive details, and AI governance.

*You can move to the next scene.*

## Credits & Build Notes
- **Author** - Oracle LiveLabs Team
- **Last Updated By/Date** - Oracle LiveLabs Team, 2026-05-26
