# Scene 3 Retail Command Center

## Introduction

The Retail Command Center is built for a retail operations leader, merchandising analyst, or digital commerce manager who needs a daily operating view of the business. This persona is watching revenue, open returns, demand spikes, social momentum, inventory exposure, and AI-assisted actions at the same time. The goal is to spot where customer demand, product availability, and operational risk are starting to move before they become separate escalations.

Dashboards like this are difficult to implement when retail data is split across commerce systems, fulfillment platforms, social listening tools, customer service applications, and analytics pipelines. Teams often need copied data, ETL jobs, separate search indexes, and reconciliation logic before a dashboard can show a trustworthy view.

Oracle AI Database helps address that challenge by keeping operational, analytical, JSON, in-memory, and AI-ready data close to the same governed data foundation. In this scene, the dashboard brings together live retail KPIs, customer signal velocity, product trend data, and product-level detail without sending the user to a different application.

Estimated Time: 12 minutes

![Retail Command Center dashboard with KPI cards, charts, and trending products highlighted](images/retail-command-center.png)

### Objectives

In this scene, you will:
- Review the Retail Command Center as an operations or merchandising user.
- Interpret the KPI cards, customer signal velocity chart, revenue category chart, and trending products table.
- Click a trending product to inspect inventory and customer signal details.
- Compare the operational detail view with the **JSON Duality View** to see how the same data can serve multiple application needs.

## Task 1: Review the command center dashboard

1. Click **Retail Command Center** in the sidebar.
2. Review the KPI cards across the top of the page. These summarize the current operating picture: total orders, retail revenue, open returns, return value exposure, demand signal spikes, demand signals, and AI agent actions.
3. Review **Customer Signal Velocity**. This chart measures the rate and intensity of customer activity across social posts, product mentions, reviews, and retail demand signals.
4. Review **Revenue by Category** to see which categories are contributing most to sales.
5. Open or review the **Oracle Internals** sidebar on the right. It shows the Oracle AI Database capabilities behind the page, including relational SQL, native JSON, Oracle Spatial, property graph, Select AI, vector search, and the in-memory column store.

Use the dashboard as a triage view. For example, a merchandising user may notice a high number of demand signal spikes, then move to the trending products table to see which products are driving that momentum.

## Task 2: Review trending products

![Trending products table with a product row highlighted](images/trending-products-table.png)

1. Scroll to **Trending Products**.
2. Review the product rows. The table ranks products by recent social momentum and shows product name, brand, mentions, views, average momentum score, and momentum label.
3. Use the search field or brand chips if you want to narrow the table.
4. Click a product row, such as **AllTerrain Hiking Boots**.

The table helps the user move from dashboard-level signals to product-level evidence. A high-ranking product may represent a sales opportunity, an inventory risk, a merchandising action, or a fulfillment priority.

## Task 3: Inspect the product detail modal

![Trending product detail modal](images/trending-product-detail.png)

After you click a product, the detail modal opens. The default **Details** view shows the selected product, brand, category, price, total on-hand inventory, reserved inventory, and social mention count.

Review the inventory table to see where the product is stocked, how many units are on hand, how many are reserved, and how many are still available by fulfillment center. Then review the recent social mentions to connect the product's operational status with customer activity and sentiment.

## Task 4: Review the JSON Duality View

![Trending product JSON Duality view](images/trending-product-json-duality.png)

1. In the product modal, click **JSON Duality View**.
2. Review the JSON document generated for the same product and inventory data.

The point of this view is to show that the same data can support different application needs. The **Details** tab presents the data as an operational user interface for business users. The **JSON Duality View** presents the same product and inventory information as a nested JSON document that is useful for APIs and application developers. Oracle JSON Relational Duality lets the application expose document-style access without copying the data into a separate document store.

You can move to the next scene.

## Credits & Build Notes
- **Author** - Oracle LiveStack Team
- **Last Updated By/Date** - Oracle LiveStack Team, 2026-05-19
