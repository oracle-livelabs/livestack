# Scene 8 Retail OML Analytics

## Introduction

**Retail OML Analytics** helps business users decide which predictions should become action.
The page brings demand surge, customer segments, forecasts, product clusters, and inventory risk into one workspace so teams can plan promotions, replenishment, retention, and stock protection with better evidence.

This is difficult to implement when predictive work is split across notebooks, exported CSV files, BI extracts, external ML services, and separate operational systems. Retail teams can lose trust in predictions when model features are stale, scoring jobs run away from the live data, or the explanation behind a forecast is disconnected from the order, customer, product, and inventory records that business users rely on.

Oracle AI Database helps retailers turn governed data into timely decisions without moving that data into separate machine learning environments. Teams can forecast demand, segment customers, group similar products, and score inventory risk from the same connected foundation that powers the rest of the LiveStack Demo.

For technical implementation, Oracle Machine Learning models can be trained, persisted, and scored in the database with DBMS_DATA_MINING, PREDICTION(), PREDICTION_PROBABILITY(), and CLUSTER_ID().

Estimated Time: **10 minutes**

![Retail OML Analytics summary cards and mode tabs](images/retail-oml-analytics-overview.png)

### Objectives

In this scene, you will learn what retail decision the page supports, what evidence the user should inspect, and what action the business may take next.

## Task 1: Review the OML analytics workspace

Perform the following set of steps as a set of decision tools. Each tab supports a different business action, such as promotion planning, customer targeting, forecasting, product grouping, or inventory protection.

1. Click **Retail OML Analytics** in the sidebar.
2. Review the four summary cards at the top of the page: products with demand surge, customers segmented, revenue model R2, and active ML models.
3. Review the mode tabs: **Demand Surge**, **Customer Segments**, **Forecast**, **Vector K-Means**, and **Inventory**.

In the current demo dataset, the page shows **176** products with demand surge signals, **2.0K** customers segmented, a **5.1%** revenue model R2 for the 30-day fit, and **4** active in-database ML patterns.

**Note:** Sample values may change after data refreshes or rebuilds. Verify live output before presenting, then explain the business takeaway.

**Use this opening view to set the scene:** this page is not a separate data science notebook. It is a business-facing analytics surface backed by in-database scoring and SQL.

## Task 2: Inspect Demand Surge %

![Demand Surge table with action controls and top product row highlighted](images/demand-surge-data-point.png)

Perform the following set of steps to find products where predicted demand may require action. The business may need to check stock, adjust promotions, review pricing, or prepare fulfillment capacity.

1. Stay on the **Demand Surge** tab.
2. Use the scoring window selector if you want to change the time window, then click **Refresh**.
3. Review the bar chart and product table.
4. Focus on the first row, such as **Camp Chef Knife Set**.

In the current demo dataset, **Camp Chef Knife Set** shows a virality momentum score of **39.1**, a **+99.8%** uplift, **171** predicted units, a revenue opportunity of about **$51.2K**, and **100%** confidence. The same table also shows **AllTerrain Hiking Boots** with **205** predicted units, keeping the hero product visible in the analytics story.

**Note:** Sample values may change after data refreshes or rebuilds. Verify live output before presenting, then explain the business takeaway.

This gives the merchandising user a concrete question to answer: should the retailer increase inventory, adjust promotion timing, or brief customer service before demand pressure turns into a stock issue?

Demand surge matters because it can trigger a business action:
- Check stock
- Adjust promotion
- Prepare fulfillment
- Protect margin.
The score is useful because it is tied to governed product and demand data.

## Task 3: Filter Customer Segments

![RFM segment filter and customer list highlighted](images/rfm-segment-filter.png)

Perform the following set of steps to turn model results into usable customer lists. These segments can support loyalty, retention, reactivation, or personalized marketing actions.

1. Click **Customer Segments**.
2. Review the segment distribution and segment summary.
3. Click **Loyal (40)** or another segment button.
4. Review the filtered customer list on the right.

In the current demo dataset, the visible segment distribution includes **Lost (60)**, **Potential (58)**, **Promising (41)**, **Loyal (40)**, and **New Customer (1)**. Selecting **Loyal (40)** filters the customer list so the user can inspect the people behind that segment, including spend, location, and churn risk.

**Note:** Sample values may change after data refreshes or rebuilds. Verify live output before presenting, then explain the business takeaway.

This is useful for loyalty and marketing teams because a segment can become an action list, such as a retention campaign for at-risk customers or a special offer for loyal customers.

## Task 4: Change the Forecast horizon

![Revenue forecast horizon, model quality cards, and chart highlighted](images/revenue-forecast-action.png)

Perform the following set of steps to see how the outlook changes over time. Planners need both the forecast and the model quality signals before deciding how much confidence to place in the result.

1. Click **Forecast**.
2. Change the forecast horizon to **+14 day forecast**.
3. Click **Refresh** if the page does not update automatically.
4. Review the model quality cards and the forecast chart.

In the current demo dataset, the 14-day forecast view shows **5.1%** R2, a daily slope of about **-$521.58/day**, mean daily revenue of about **$68.2K**, and **31** observations. A low model-quality score is important because it tells the planner to treat the forecast as directional, not certain. This builds trust because the demo does not hide weak predictions.

**Note:** Sample values may change after data refreshes or rebuilds. Verify live output before presenting, then explain the business takeaway.

The chart separates actual revenue, forecast revenue, trend, moving average, and confidence bands. This helps a retail planner explain the difference between observed revenue history and projected revenue instead of presenting a single unexplained number.

## Task 5: Change Vector K-Means clusters

![Vector K-Means controls, cluster metrics, and cluster assignments highlighted](images/vector-kmeans-action.png)

Perform the following set of steps to explore groups of similar products. This can support assortment planning, recommendations, product discovery, and lookalike analysis.

1. Click **Vector K-Means**.
2. Click **10** in the **K =** control.
3. Review the cluster summary cards and distribution bar.
4. Review one cluster card and its product assignments.

In the current demo dataset, switching to **K = 10** clusters groups **187** products. Visible examples include single-product clusters such as **SummitPulse GPS Watch** in Sports Tech and **PowerRack Home Gym** in Fitness. The cluster cards show centroid products, cluster size, average similarity, category mix, and product assignments.

**Note:** Sample values may change after data refreshes or rebuilds. Verify live output before presenting, then explain the business takeaway.

This helps a merchandising user understand how AI-assisted grouping can support product discovery, recommendations, assortment analysis, and lookalike product exploration. Oracle AI Database can combine vector similarity and SQL analytics without copying product data into a separate vector-only system.

## Task 6: Review Inventory Intelligence

![Inventory Intelligence alert table with high-risk rows highlighted](images/inventory-intelligence-data-point.png)

Perform the following set of steps to connect predicted demand with units on hand and revenue at risk. This helps the business act before a stockout or missed sales opportunity occurs.

1. Click **Inventory**.
2. Review the inventory summary cards.
3. Scroll to **Inventory Alerts - Sorted by OML Surge Probability**.
4. Focus on a high-risk row, such as **PowerRack Home Gym**.

In the current demo dataset, **PowerRack Home Gym** shows **17** units on hand, **74** predicted units, **100%** surge probability, **critical** status, about **1.6** days of supply, and about **$85.5K** revenue at risk. This turns the model output into an operational action: the user can identify where demand is stronger than available supply and prioritize replenishment or transfer decisions.

**Note:** Sample values may change after data refreshes or rebuilds. Verify live output before presenting, then explain the business takeaway.

Retail teams can spot demand surges early and decide which products, inventory positions, and fulfillment centers need action before service levels are affected.

Oracle AI Database supports this by combining the DEMAND_SURGE_MODEL, demand_forecasts, inventory, products, and fulfillment centers in one governed system, using the same data foundation for predictive scoring, operational joins, and business-facing workflow decisions.

*You can move to the next scene.*

## Credits & Build Notes
- **Author** - Oracle LiveLabs Team
- **Last Updated By/Date** - Oracle LiveLabs Team, 2026-05-28
