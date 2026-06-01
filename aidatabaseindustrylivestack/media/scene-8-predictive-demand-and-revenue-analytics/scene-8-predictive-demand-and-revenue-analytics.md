# Scene 8 Predictive Demand and Revenue Analytics

## Introduction

A media analytics manager, revenue strategist, retention lead, programming planner, or data science stakeholder uses this page to understand which predictive signals should drive action. This persona needs to know which content assets have demand-surge risk, how audience accounts segment by value, whether content revenue is trending, which assets cluster semantically, and where rights or capacity risk needs attention.

This is difficult when predictive work is split across notebooks, exported CSV files, BI extracts, external ML services, and separate operational systems. Media teams can lose trust in predictions when model features are stale, scoring jobs run away from live data, or the explanation behind a forecast is disconnected from the campaign and rights records that business users rely on.

Oracle AI Database helps address these challenges by keeping machine learning close to governed media data. Oracle Machine Learning models and SQL analytics can run from the same connected data foundation that powers the rest of the LiveStack Demo.

Estimated Time: 12 minutes

![Engagement, Revenue and Retention Forecasts page with KPI cards and analytics tabs](images/predictive-demand-revenue-analytics.png)

### Objectives

In this scene, you will:
- Review the **Engagement, Revenue & Retention Forecasts** workspace, KPI cards, and analytics tabs.
- Inspect **Audience Demand Predictions**.
- Review **Audience Value Segments**.
- Interpret the **Content Revenue Forecast**.
- Explore **Vector K-Means** clusters.
- Review **Rights & Capacity** intelligence and risk indicators.

## Task 1: Inspect Audience Demand Predictions

1. Click **Engagement, Revenue & Retention Forecasts** in the sidebar.
2. Review the four KPI cards at the top of the page: **Content Assets with Signal Surge**, **Audience Accounts Segmented**, **Content Revenue Model R-squared**, and **Active ML Models**.
3. Review the analytics tabs: **Signal Surge**, **Value Segments**, **Forecast**, **Vector K-Means**, and **Rights & Capacity**.
4. Confirm that **Signal Surge** is selected.
5. Review the scoring control, chart, and prediction table.

    ![Audience demand predictions with model scoring and predicted campaign requests](images/audience-demand-predictions.png)

Callout 1 highlights the KPI cards. Callout 2 highlights the analytics tabs. Callout 3 highlights the signal-surge scoring output and prediction table.

In the current seeded dataset, the page shows **151** content assets with signal surge, **2.0K** audience accounts segmented, a **20.5%** content revenue model R-squared, and **4** active ML models. Use this opening view to set the scene: this page is not a separate data science notebook. It is a business-facing analytics surface backed by in-database analytics.

In the prediction table, focus on rows such as **Echo Valley FAST Channel Breakout Package**, **Family Animation Premiere**, **Beta Realm FAST Channel Breakout Package**, **Mosaic Crimes Live Ops Quest Reset**, and **Championship Highlights Rights**. These are the data points to emphasize: model output becomes operational questions about campaign timing, content recommendation, audience activation, and rights capacity.

## Task 2: Review Audience Value Segments

1. Click **Value Segments**.
2. Review the segment distribution chart.
3. Review the segment summary and top audience accounts by value score.
4. Use the segment filters to focus on high-value or at-risk audiences.

    ![Audience value segment tab with segment distribution and account scores](images/audience-value-segments.png)

Callout 1 highlights the active **Value Segments** tab. Callout 2 highlights the segment distribution and segment summary. Callout 3 highlights audience-account score detail.

Segmentation is useful because it becomes operational. A retention lead can move from a model result to the audience accounts or households that need a save journey, personalized recommendation, subscriber offer, campaign review, or programming action.

## Task 3: Interpret Content Revenue Forecast

1. Click **Forecast**.
2. Review the forecast horizon selector and **Refresh** control.
3. Review the model quality cards.
4. Review the content revenue trend chart and forecast band.

    ![Content revenue forecast tab with model quality cards and forecast chart](images/content-revenue-forecast.png)

Callout 1 highlights the active **Forecast** tab. Callout 2 highlights the forecast controls. Callout 3 highlights the quality cards and revenue trend chart.

Use this tab to explain that forecast quality is visible to the user. The demo does not hide model quality or treat the forecast as an oracle. It shows trend context so a planner can use the result as decision support.

## Task 4: Explore Vector K-Means clusters

1. Click **Vector K-Means**.
2. Review the cluster controls.
3. Review cluster count, clustered assets, embedding dimensions, and distance metric.
4. Review cluster cards and related content assets.

    ![Vector K-Means tab with content asset clusters](images/vector-k-means-clusters.png)

Callout 1 highlights the active **Vector K-Means** tab. Callout 2 highlights the vector clustering controls and model summary. Callout 3 highlights content-affinity cluster results.

This view helps users understand how vector similarity can group content and audience signals without leaving the governed data platform. Programming and personalization teams can use the clusters to reason about affinity and recommendation strategy.

## Task 5: Review Rights and Capacity intelligence

1. Click **Rights & Capacity**.
2. Review summary cards for capacity risk and at-risk media assets.
3. Scan the highest-priority rows for content assets that need rights or activation attention.
4. Connect the prediction back to the coverage scene.

    ![Rights and capacity intelligence tab with risk indicators](images/rights-capacity-intelligence.png)

Callout 1 highlights the active **Rights & Capacity** tab. Callout 2 highlights the capacity-risk indicators. Callout 3 highlights the ranked media assets that need rights or activation attention.

Predictive analytics are most useful when they appear where operators already make decisions. This scene ties demand forecasts, revenue projections, segmentation, clustering, and rights-capacity risk directly to content and campaign operations.

You can move to the next scene.

## Credits & Build Notes
- **Author** - Oracle LiveLabs Team
- **Last Updated By/Date** - Oracle LiveLabs Team, 2026-05-29
