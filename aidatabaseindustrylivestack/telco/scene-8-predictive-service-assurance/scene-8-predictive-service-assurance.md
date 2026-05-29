# Scene 8 Predictive Service Assurance

## Introduction

**Predictive Service Assurance** helps telecom teams decide which predictive signals should become action. The page brings together demand surge, retention segments, service revenue forecasts, service behavior clusters, and network access risk so teams can plan capacity, outreach, dispatch, and care response before pressure turns into churn.

Telecom teams struggle when the information needed for one service-assurance decision lives in separate OSS, BSS, care, NOC, field, and analytics tools. That separation slows action, increases reconciliation work, and makes it harder to trust the result.

Oracle AI Database helps address these challenges by keeping machine learning close to governed telecom data. Oracle Machine Learning models can be trained, persisted, and scored in the database with `DBMS_DATA_MINING`, `PREDICTION()`, `PREDICTION_PROBABILITY()`, and `CLUSTER_ID()`. Demand surge prediction, retention segmentation, service revenue forecasting, service behavior clustering, and network access risk scoring can run from the same connected data foundation that powers the rest of the LiveStack Demo. The demand-surge model uses 13 telecom service features, including subscriber signals, service-order activity, service value, and a demand-pressure score.

Estimated Time: **10 minutes**

![Predictive Service Assurance summary cards and mode tabs](images/predictive-service-assurance.png)

### Objectives

In this scene, you will learn what telecom decision the page supports, what evidence the user should inspect, and what action the team may take next.

## Task 1: Review the predictive assurance workspace

![Predictive Service Assurance summary cards and mode tabs](images/predictive-summary-and-tabs.png)

Review the predictive assurance workspace as a set of decision tools for demand surge, retention, revenue forecasting, service behavior grouping, and network access risk.

1. Click **Predictive Service Assurance** in the sidebar.
2. Review the four summary cards at the top of the page: services with demand surge, subscribers segmented, revenue model R2, and active ML models.
3. Review the mode tabs: **Demand Surge**, **Retention**, **Forecast**, **Service Clusters**, and **Access Risk**.

This page is a business-facing analytics surface, not a separate data science notebook. The predictions are shown next to the operational context needed to act on them.

## Task 2: Inspect mobile demand surge prediction

![Mobile Demand Surge Prediction results](images/demand-surge-results.png)

Inspect mobile demand surge prediction to identify services where predicted demand may require capacity planning, field dispatch, care outreach, or retention action.

1. Stay on the **Demand Surge** tab.
2. Use the scoring window selector if you want to change the time window, then click **Refresh**.
3. Review the bar chart and service table.
4. Focus on a top surge row, such as **Device Upgrade Enrollment** or **Fixed Wireless Home Internet**.

In the current demo dataset, **Fixed Wireless Home Internet** shows **131** recent mentions, **290** recent service orders, **1,008** predicted demand, **90%** demand surge, and about **$70.6K** service revenue opportunity. The same table also shows services such as **Premium International Roaming Pass**, **Device Upgrade Enrollment**, and **Fleet Telematics SIM Pack**. 

This gives the service assurance user a concrete question to answer: should the provider add capacity, adjust field dispatch, prioritize outreach, or prepare care teams before demand pressure turns into churn?

**Note:** These are sample values from the current demo dataset and may change after a refresh, seed update, or custom dataset import. Treat these numbers as an example of the current operating pattern. Verify the live values in the UI before presenting, then explain the business takeaway: what demand, subscriber impact, capacity, revenue, dispatch, or risk pattern the values reveal.

## Task 3: Filter retention segments

![Retention segment filter and filtered subscriber list](images/retention-segment-results.png)

Filter retention segments to turn model output into groups of subscribers who may need outreach, plan optimization, retention action, or service follow-up.

1. Click **Retention**.
2. Review the segment distribution and segment summary.
3. Click **Loyal (10)**, **Potential (59)**, or another segment button.
4. Review the filtered subscriber list on the right.

Segmentation becomes operational when teams can turn subscriber groups into retention campaigns, plan optimization, service follow-up, or care outreach.

In the current demo dataset, the visible segment distribution includes **Lost (79)**, **Potential (59)**, **Promising (34)**, **New Customer (18)**, and **Loyal (10)**. Selecting a segment filters the subscriber list so the user can inspect the people behind that score, including spend, location, churn risk, and predicted lifetime value.

**Note:** These are sample values from the current demo dataset and may change after a refresh, seed update, or custom dataset import. Treat these numbers as an example of the current operating pattern. Verify the live values in the UI before presenting, then explain the business takeaway: what demand, subscriber impact, capacity, revenue, dispatch, or risk pattern the values reveal.

## Task 4: Change the service revenue forecast horizon

![Forecast horizon selector, model quality cards, and service revenue forecast chart](images/forecast-horizon-results.png)

Change the service revenue forecast horizon to understand both the projected revenue trend and how much confidence planners should place in it.

1. Click **Forecast**.
2. Change the forecast horizon to **+14 day forecast**.
3. Click **Refresh** if the page does not update automatically.
4. Review the model quality cards and the forecast chart.

A low model-quality score tells planners to treat the forecast as directional, not certain. This builds trust because the demo does not hide weak predictions.

In the current demo dataset, the 14-day forecast view shows a low trend R2 of **0.01%**, a daily slope of about **+$9.63/day**, mean daily service revenue of about **$30.6K**, and **31** observations.

**Note:** These are sample values from the current demo dataset and may change after a refresh, seed update, or custom dataset import. Treat these numbers as an example of the current operating pattern. Verify the live values in the UI before presenting, then explain the business takeaway: what demand, subscriber impact, capacity, revenue, dispatch, or risk pattern the values reveal.


## Task 5: Review service behavior clusters

![Service Behavior Clustering K control and cluster assignments](images/service-clusters-results.png)

Review service behavior clusters to see how related telecom services group together by usage and demand patterns, which can support bundling, recommendation design, plan optimization, and lookalike service analysis.

1. Click **Service Clusters**.
2. Change the **K =** control if you want to compare cluster counts.
3. Review the cluster summary cards and distribution bar.
4. Review one cluster card and its service assignments.

This helps a telecom analyst understand how AI-assisted grouping can support service bundling, plan optimization, recommendation design, and lookalike service exploration.

In the current demo dataset, **K = 5** clusters group **32** telecom services. One visible cluster has **5G Unlimited Mobile Plan**, **Gigabit Fiber Install**, and **Premium International Roaming Pass** in the same behavior group.

**Note:** These are sample values from the current demo dataset and may change after a refresh, seed update, or custom dataset import. Treat these numbers as an example of the current operating pattern. Verify the live values in the UI before presenting, then explain the business takeaway: what demand, subscriber impact, capacity, revenue, dispatch, or risk pattern the values reveal.


## Task 6: Review network access risk

![Network Access Risk summary and capacity risks by demand surge probability](images/access-risk-results.png)

Review network access risk to connect predicted demand with site capacity, available units, capacity status, and revenue or churn exposure.

1. Click **Access Risk**.
2. Review the access-risk summary cards.
3. Scroll to **Capacity Risks by Demand Surge Probability**.
4. Focus on a high-risk service and site combination.

The business value is that teams can make the decision from connected, governed data. Oracle AI Database provides the shared foundation that keeps operational data, analytics, and AI workflows aligned.

You can move to the next scene.

## Credits & Build Notes
- **Author** - Oracle LiveLabs Team
- **Last Updated By/Date** - Oracle LiveLabs Team, 2026-05-28
