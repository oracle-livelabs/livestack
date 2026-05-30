# Scene 3 Risk & Operations Dashboard

## Introduction

The Risk & Operations Dashboard is built for a financial risk leader, operations executive, or product portfolio manager who needs a daily operating view of the business. This persona is watching transaction volume, revenue exposure, regulatory and market signal severity, monitored financial products, service-case pressure, and AI-assisted actions at the same time. The goal is to spot where client demand, product exposure, and operational risk are starting to move before they become separate escalations.

Dashboards like this are difficult to implement when finance data is split across core banking systems, compliance platforms, fraud tools, client service applications, and analytics pipelines. Teams often need copied data, ETL jobs, separate search indexes, and reconciliation logic before a dashboard can show a trustworthy view.

Oracle AI Database helps address that challenge by keeping operational, analytical, JSON, in-memory, and AI-ready data close to the same governed data foundation. In this scene, the dashboard brings together live finance KPIs, risk signal velocity, revenue exposure by product category, and product-level detail without sending the user to a different application.

Estimated Time: 10 minutes

![Risk and Operations Dashboard with KPI cards, charts, and monitored financial products highlighted](images/dashboard.png)

### Objectives

In this scene, you will:
- Review the Risk & Operations Dashboard as a risk or operations user.
- Interpret the KPI cards, risk signal velocity chart, revenue exposure chart, and financial products under risk review table.
- Click a monitored financial product to inspect case-processing capacity and signal details.
- Compare the operational detail view with the **JSON Duality View** to see how the same data can serve multiple application needs.

## Task 1: Review the risk and operations dashboard

1. Click **Risk & Operations Dashboard** in the sidebar.
2. Review the KPI cards across the top of the page. These summarize the current operating picture: client transactions, revenue exposure, critical fraud signals, products under risk review, and AI decisions logged.
3. Review **Risk Signal Velocity**. This chart measures the rate and intensity of regulatory, market, and operational risk activity.
4. Review **Revenue Exposure by Product Category** to see which finance categories are contributing most to exposure.
5. Open or review the **Oracle Internals** sidebar on the right. It shows the Oracle AI Database capabilities behind the page, including relational SQL, native JSON, Oracle Spatial, property graph, Select AI, vector search, and the in-memory column store.

Use the dashboard as a triage view. For example, a risk leader may notice elevated signal velocity, then move to the financial products table to see which products and institutions are driving that activity.

## Task 2: Review financial products under risk review

![Financial Products Under Risk Review table with high-severity product rows highlighted](images/financial-products-table.png)

1. Scroll to **Financial Products Under Risk Review**.
2. Review the product rows. The table ranks monitored financial products by recent regulatory and market signal severity and shows product name, institution, risk events, exposure, risk severity, and risk trend.
3. Review the highest-risk rows, such as **Secure Document Vault**, **Open Banking API Access Series B**, and **Digital Wallet Account**.
4. Click **Secure Document Vault**.

In the current live stack, the table surfaces products such as **Secure Document Vault**, **Open Banking API Access Series B**, and **Digital Wallet Account** with elevated risk severity. The table helps the user move from dashboard-level signals to product-level evidence. A high-ranking product may represent revenue exposure, compliance pressure, underwriting capacity risk, or a client-service action.

## Task 3: Inspect the financial product detail modal

![Financial product detail modal](images/financial-product-detail.png)

After you click a product, the detail modal opens. The default **Details** view shows the selected financial product, institution, category, product value metadata, operational throughput, active processing load, and compliance signal count.

Review the case-processing table to see where the product is supported, which regional operations centers are involved, how much **Case-Processing Capacity** is available, and how much active workload is already reserved. **Case-Processing Capacity** represents the number of product-related review or service cases an operations center can currently handle. **Active Workload** shows how many of those slots are already committed, and **Remaining Capacity** shows how many additional cases the center can still absorb.

For example, if **Secure Document Vault** shows **Lebanon Central Banking Center** with **455** case-processing capacity and **0** active workload, that center has **455** available case-processing slots for Secure Document Vault-related review or service work. Compare that row with lower-capacity centers to explain where work can be routed when risk, compliance, or client-service pressure increases.

The **Details** tab is the operational view of the same governed data. It presents relational product, case-processing, and signal records as a business interface for risk and operations users.

## Task 4: Review the JSON Duality View

![Financial product JSON Duality view](images/financial-product-json-duality.png)

1. In the product modal, click **JSON Duality View**.
2. Review the JSON document generated for the same financial product and case-processing data.

The point of this view is to show that the same data can support different application needs. The **Details** tab presents the data as an operational interface for business users. The **JSON Duality View** presents the same product and case-processing information as a nested JSON document that is useful for APIs and application developers. Oracle JSON Relational Duality lets the application expose document-style access without copying the data into a separate document store.

You can move to the next scene.

## Credits & Build Notes
- **Author** - Oracle LiveLabs Team
- **Last Updated By/Date** - Oracle LiveLabs Team, 2026-05-28
