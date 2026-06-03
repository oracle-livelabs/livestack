# Scene 8 Asset Risk & Capacity Analytics

## Introduction

**Asset Risk & Capacity Analytics** helps teams decide which predictive signals should become operational action. The page brings together transformer overload risk, feeder congestion, pipeline integrity risk, corrosion risk, gas regulator station risk, pump station capacity, treatment plant capacity, wastewater compliance risk, well production decline, refinery unit constraints, compressor station reliability, LNG logistics capacity, maintenance backlog, turnaround readiness, emissions compliance risk, HSE risk, crew capacity forecast, and replacement priority.

Oracle AI Database keeps machine learning close to governed Energy and Utilities data. Oracle Machine Learning models and SQL analytics can run from the same connected foundation that powers the rest of the LiveStack demo.

Estimated Time: **12 minutes**

![Asset Risk and Capacity Analytics page with KPI cards and analytics tabs](images/scene-08-oml-analytics.png)

### Objectives

In this scene, you will learn how in-database analytics can score asset, capacity, production, compliance, HSE, emissions, maintenance, and crew exposure across Energy and Utilities workflows.

## Task 1: Inspect demand and asset risk

Perform the following steps to identify services, assets, or facilities where predicted demand or risk may require field capacity planning, supply review, customer outreach, maintenance planning, production follow-up, or compliance response.

1. Click **Asset Risk & Capacity Analytics** in the sidebar.
2. Review the KPI cards at the top of the page.
3. Review the analytics tabs for demand risk, service or customer segments, operational value forecast, signal clusters, and capacity or supply intelligence.
4. Confirm the first analytics tab is selected.
5. Review the scoring window, **Refresh** control, and prediction output when the model returns rows.

    ![Asset and demand risk predictions with active tab and model evidence highlighted](images/service-demand-risk.png)

Use the visible predictions to explain how the same analytics pattern can support transformer overload, pipeline integrity, water pressure, wastewater compliance, well production, refinery throughput, LNG logistics, emissions, HSE, maintenance, and crew capacity decisions.

**Note:** Sample values may change after data refreshes or rebuilds. Verify live output before presenting, then explain the business takeaway.

## Task 2: Review service or customer segments

Perform the following steps to turn model output into groups of service points, customers, or assets that may need follow-up, targeted outreach, maintenance planning, demand response, billing support, or regulatory attention.

1. Click the segmentation tab.
2. Review the segmentation model note for K-Means and pattern quartiles.
3. Review the segment distribution and highest-scoring service points or customers when the output is populated.

    ![Service point or customer segments tab with segmentation model evidence highlighted](images/service-point-segments.png)

Segmentation becomes operational when teams can turn groups into follow-up actions, such as outage outreach, gas safety calls, water leak response, billing support, industrial customer coordination, or field maintenance planning.

## Task 3: Interpret operational value forecast

Perform the following steps to understand the expected value trend and how much confidence planners should place in it.

1. Click **Operational Value Forecast**.
2. Review the forecast horizon selector and **Refresh** control.
3. Review the model quality cards and forecast chart.
4. Explain that a weak model fit tells planners to treat the forecast as directional, not certain.

    ![Operational Value Forecast tab with model quality and forecast controls highlighted](images/operational-value-forecast.png)

This page helps a user connect business value and operational volume to a governed forecast path. The model output is near the service, asset, facility, and request data it uses, not in a disconnected notebook.

## Task 4: Explore signal clusters

Perform the following steps to see how related services, assets, facilities, and signals group together by meaning.

1. Click the signal cluster tab.
2. Review the **K =** controls.
3. Review the cluster count, services clustered, embedding dimensions, and distance metric when clustering completes.
4. Review a cluster card and its related services or assets.

    ![Signal clusters tab with vector K-Means controls and cluster cards highlighted](images/service-signal-clusters.png)

Use this tab to explain how vector similarity can group Energy and Utilities records by operational meaning. Pipeline pressure variance, gas leak response, water main repairs, wastewater compliance notices, refinery unit constraints, and emissions events may cluster by meaning even when they use different text.

## Task 5: Review capacity and supply intelligence

Perform the following steps to connect predicted demand with available capacity, supply status, surge probability, site pressure, crew availability, and operational value at risk.

1. Click **Capacity and Supply** or the equivalent capacity tab.
2. Review the summary cards.
3. Review the capacity and supply status distribution.
4. Review monitored capacity by field operations site.
5. Scan the highest surge probability chart for services, assets, facilities, or supplies that need attention.

    ![Capacity and supply intelligence tab with risk counts and monitored sites highlighted](images/capacity-supply-intelligence.png)

The business value is that teams can move from predictive scoring to operating action before a capacity issue affects reliability, production, customer response, compliance, HSE, or emissions outcomes.

*You can move to the next scene.*

## Credits & Build Notes
- **Author** - Oracle LiveLabs Team
- **Last Updated By/Date** - Oracle LiveLabs Team, 2026-06-03
