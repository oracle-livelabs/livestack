# Scene 7 Clinical Supply Orders and Deviations

## Introduction

**Clinical Supply Orders and Deviations** connects the risk journey to trial-site and order impact. The operational event is a clinical supply order with status, trial-site, signal-linkage, fulfillment, line-item, and route evidence. The business risk is that a delayed, cancelled, or signal-linked order affects trial continuity before the team can trace the impact.

Clinical supply teams need to answer practical questions quickly: Which trial site is affected? Which products are in the order? What is the exposure value? Which fulfillment site and route are involved? Is there signal linkage or deviation context that should trigger follow-up?

The page helps the user decide whether to investigate the order, contact a site, review fulfillment options, or open a deviation or quality follow-up. Oracle JSON Relational Duality supports the workflow by letting the app show the same governed order evidence as relational detail and as a JSON document for application access.

**Oracle AI Database** helps address that challenge by keeping relational order data and JSON document access aligned through JSON Relational Duality. Business users can inspect structured order detail while applications and APIs can use the same order as a document.

Estimated Time: **10 minutes**

![Clinical Supply Orders table with filter, order rows, and selected order area highlighted](images/orders-deviations.png)

### Objectives

In this scene, you will learn how order evidence connects to trial continuity, what details the user should inspect, and what operational action may happen next.

## Task 1: Review the order workspace

![Clinical Supply Orders table with status filter and order rows highlighted](images/orders-deviations.png)

Perform the following set of steps to review how regulated supply records stay connected to trial sites, signal linkage, and fulfillment evidence.

1. Click **Clinical Supply Orders & Deviations** in the sidebar.
2. Review the VPD banner below the page subtitle. It shows the active demo user and whether the user has full access or a region-filtered order view.
3. Review the status filter and the order table.
4. Focus on order **#72491**.

In the current demo dataset, order **#72491** is a cancelled clinical supply order for **Richard Miller** in **Austin, Texas**, with **\$6,360.00** supply exposure and a signal-linked status. The decision is whether this order needs site follow-up, route review, replacement supply, or deviation investigation.

**Note:** Sample values may change after data refreshes or rebuilds. Verify live output before relying on specific sample values.

## Task 2: Inspect the relational order detail

![Relational order detail with selected order and line items highlighted](images/order-relational-detail.png)

Open the relational detail to inspect the connected operational evidence.

1. Click order **#72491**.
2. Confirm the **Relational** tab is selected.
3. Review the trial site, location, supply exposure, shipping cost, and line-item table.
4. Review the products in the order, including **Endotoxin Removal Cartridge** and **High-Concentration Formulation Buffer**.

This view is useful for clinical supply operations because the order, line items, fulfillment site, and signal linkage are visible in one place. The user can decide whether the issue is isolated to one order or whether it should be compared with quality signals and cold-chain evidence from the earlier scenes.

## Task 3: Compare the JSON Duality View

![Order JSON Duality View with source and JSON document highlighted](images/order-json-duality-view.png)

Compare the JSON Duality View to confirm that the same trusted order evidence can support application and API access.

1. Click **JSON Duality View** in the expanded order panel.
2. Review the source label **ORDERS_DV**.
3. Review the JSON document for order **72491**.
4. Notice that the document contains the order id, trial site, status, total, shipping cost, created date, and nested line items.

This is a traceability point, not a source-system replacement story. The demo shows how order evidence can be presented consistently across interfaces while source systems continue to manage their specialized transaction workflows.

## Task 4: Review shipment and cold-chain route context

![Cold-chain route tab with shipment context highlighted](images/order-shipment-route.png)

Perform the following set of steps to review the route tab and connect the order to cold-chain execution.

1. Click **Cold-Chain Route** in the expanded order panel.
2. Review the fulfillment site and trial-site context.
3. Review the shipment context: route status, distance, estimated transit time, route cost, and delivery timing.
4. Review the shipment progress timeline if it is visible.

The operational handoff is the key point: the same order can be reviewed through line items, JSON shape, and route evidence, making it easier to decide whether to reroute, replenish, contact a site, or document a deviation.

*You can move to the next scene.*

## Credits & Build Notes
- **Author** - Oracle LiveLabs Team
- **Last Updated By/Date** - Oracle LiveLabs Team, 2026-06-04
