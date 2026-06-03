# Scene 3 Quality and Supply Operations Dashboard

## Introduction

**Quality and Supply Operations Dashboard** helps life sciences leaders answer a daily operating question: where does regulated supply need attention right now? The page brings together clinical supply orders, supply exposure, critical quality signals, products under watch, and AI decision activity so teams can decide where to investigate first.

Quality, clinical supply, and operations teams need to see shifts in quality pressure, regulated product exposure, and supply continuity before they become trial interruptions, batch release delays, or compliance escalations. The dashboard helps leaders spot patterns early, act faster, and keep those functions aligned.

Dashboards like this are difficult to implement when life sciences data is split across trial supply systems, quality event records, regulatory notices, depot inventory, service routing, and analytics pipelines. Teams often need copied data, reconciliation logic, and multiple supporting systems before they can trust the operating picture.

**Oracle AI Database** helps address that challenge by keeping operational, analytical, JSON, in-memory, and AI-ready data close to the same governed foundation. In this scene, the dashboard brings together live regulated supply KPIs, quality signal velocity, product category exposure, and product-level detail without sending the user to a different application.

Use the **Labeling Change Impact Review** row as an opening example. It gives the seller a clear way to show how a regulated product is visible at the dashboard level and then traceable down to inventory, quality signals, and application-ready JSON detail.

Estimated Time: **10 minutes**

![Quality and Supply Operations Dashboard with KPI cards, charts, and products under watch highlighted](images/operations-dashboard.png)

### Objectives

In this scene, you will learn what life sciences decision the dashboard supports, what evidence the user should inspect, and what action the team may take next.

## Task 1: Review the operations dashboard

![Operations dashboard with KPI cards, charts, and product table highlighted](images/operations-dashboard.png)

Perform the following set of steps to use the dashboard as a triage view for regulated supply pressure and exposure.

1. Click **Quality & Supply Operations Dashboard** in the sidebar.
2. Review the KPI cards across the top of the page.
3. Review **Quality Signal Velocity**. This chart measures the rate and intensity of regulated quality, logistics, and compliance activity.
4. Review **Clinical Supply Exposure by Product Category** to see which categories carry the most supply value.
5. Connect the visible operating outcome to the database capabilities behind the page after the business flow is clear.

In the current demo dataset, the opening KPI row shows **3,000** clinical supply orders, about **$79.0M** in clinical supply exposure, **488** critical quality signals, **77** products under watch, and the current agent decision count.

A quality or supply leader can start with those metrics, then move to the products table to see which regulated products are driving the story.

**Note:** Sample values may change after data refreshes or rebuilds. Verify live output before presenting, then explain the business takeaway.

## Task 2: Review products under watch

![Products under watch table with the leading regulated product highlighted](images/operations-dashboard.png)

Perform the following set of steps to move from dashboard-level signals to product-level evidence in the Products Under Watch table.

1. Scroll to **Products Under Watch**.
2. Review the product rows. The table ranks regulated products by recent quality and regulatory momentum and shows product name, manufacturer, mentions, reach, criticality, and momentum label.
3. Use the search field or manufacturer chips if you want to narrow the table.
4. Click the **Labeling Change Impact Review** row.

The table helps the user move from dashboard-level signals to product-level evidence. In the current demo dataset, **Labeling Change Impact Review** appears as a leading SafeGx Quality Labs regulated service with **12** recent mentions, about **1.9M** reach, and **viral** momentum.

**Note:** Sample values may change after data refreshes or rebuilds. Verify live output before presenting, then explain the business takeaway.

## Task 3: Inspect the product detail modal

![Product detail modal with inventory and quality signal evidence highlighted](images/product-detail.png)

Perform the following set of steps to open the product detail modal and connect quality momentum with operational readiness.

1. Open the product **Details** modal to connect quality momentum with operational readiness. The user can see whether controlled inventory is available and whether recent signals support further action.
2. After you click **Labeling Change Impact Review**, the detail modal opens. The default **Details** view shows the selected product, SafeGx Quality Labs manufacturer, Regulatory Services category, $1,950.00 unit supply value, total on-hand inventory, reserved inventory, and signal mention count.
3. Review the inventory table to see where the product is stocked, how many units are on hand, how many are reserved, and how many are still available by cold-chain site.
4. Review the inventory table to show where the product is stocked, how many units are on hand, how many are reserved, and how many remain available by cold-chain site. Then connect that inventory picture to the recent compliance and market signals so the product's operational status is tied to business evidence.

**Note:** Sample values may change after data refreshes or rebuilds. Verify live output before presenting, then explain the business takeaway.

## Task 4: Review the JSON Duality View

![Product JSON Duality View with document structure highlighted](images/product-json-duality.png)

Perform the following set of steps to review the JSON Duality View and show how the same trusted regulated product data can support different users.

1. In the product modal, click **JSON Duality View**.
2. Review the JSON document for **Labeling Change Impact Review**.
3. Explain that Oracle JSON Relational Duality lets the app expose product and inventory data as a document while preserving the relational source of truth.

Business users see product details in the interface, while applications can use the same information as a structured document.

*You can move to the next scene.*

## Credits & Build Notes
- **Author** - Oracle LiveLabs Team
- **Last Updated By/Date** - Oracle LiveLabs Team, 2026-05-29
