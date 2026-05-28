# Scene 7 Subscriber Service Orders

## Introduction

A service operations manager, customer care lead, field dispatch coordinator, or API platform owner uses this page to understand a subscriber service order from multiple angles. This persona needs a reliable operational view for care and field teams, a transactional view for service-order management, an API-friendly document view for applications and partners, and dispatch visibility for field follow-up.

This is difficult when service-order headers, line items, subscriber data, network sites, dispatch records, and API payloads are handled in separate systems. Telecom teams often duplicate the same service-order data into a relational database, a document store, a search index, and integration payloads. Each copy creates synchronization risk, stale care answers, and extra engineering work whenever the service-order model changes.

Oracle AI Database helps address these challenges by keeping the service order in one governed data platform while exposing it through the shape each workflow needs. Relational tables provide ACID transactions, foreign keys, and operational SQL. JSON Relational Duality Views expose the same service order as a nested JSON document for application and API use cases. Oracle Spatial adds dispatch and distance context for field visibility, and VPD policies can control which orders each user can see.

Estimated Time: 10 minutes

![Subscriber Service Orders list with service order workspace](images/subscriber-service-orders.png)

### Objectives

In this scene, you will:
- Review the **Subscriber Service Orders** page and the active service-order workspace.
- Inspect a specific service-order row in the table.
- Open the same service order as relational operational detail.
- Compare that same order with the JSON document returned by `ORDERS_DV`.
- Review the field dispatch route and fulfillment context for the order.

## Task 1: Review the service-order workspace

![Subscriber Service Orders workspace and filters](images/service-order-workspace.png)

1. Click **Subscriber Service Orders** in the sidebar.
2. Review the VPD banner below the page subtitle. It shows the active demo user and whether the user has full access or a region-filtered order view.
3. Review the status filter and the service-order table.
4. Focus on service order **#52968**.

In the current demo dataset, service order **#52968** is for **Lisa Hernandez** in **Chicago, Illinois**. It is marked **Completed**, contains **3** line items, totals **$2,065**, and is fulfilled by **Dallas 5G Dispatch Center**. This service order will be the data point used through the rest of the scene.

## Task 2: Inspect the relational service-order detail

![Service order detail with relational service-order tables](images/service-order-detail-tables.png)

1. Click service order **#52968**.
2. Confirm the **Service Order Tables** tab is selected.
3. Review the subscriber, location, total, dispatch cost, and line-item table.
4. Review the services in the order, such as **Edge Compute Reservation**, **Fleet Telematics SIM Pack**, and **Network Congestion Plan Review**.

This view is useful for service operations and customer care because it shows normalized transactional data in a format that is easy to validate. The order header, subscriber, service, brand, category, quantity, unit price, and line total are connected through relational joins while preserving ACID consistency.

## Task 3: Compare the Service Order Document

![Service Order Document tab with JSON document for order 52968](images/service-order-document-tab.png)

1. Click **Service Order Document** in the expanded order panel.
2. Review the source label for the JSON Duality View.
3. Review the JSON document for service order **52968**.
4. Notice that the document contains order identity, subscriber identity, status, total, dispatch cost, demand score, created date, and nested line items.

This is the key point of the page. The JSON document is not a separate copy of the service order. It is the same order data exposed through an Oracle JSON Relational Duality View. Application teams and partner APIs can work with a service-order-shaped JSON document, while operations teams can continue to use relational tables and SQL. Both interfaces read from the same governed transaction model.

## Task 4: Review field dispatch context

![Field Dispatch Route tab with network site, subscriber location, and dispatch metrics](images/field-dispatch-route-tab.png)

1. Click **Field Dispatch Route** in the expanded order panel.
2. Review the network site and subscriber locations on the map.
3. Review the dispatch context below the map: distance, estimated transit time, dispatch cost, and status.
4. Review the dispatch progress timeline.

For order **#52968**, the page connects **Dallas 5G Dispatch Center** to **Lisa Hernandez** in Chicago. The operational detail includes a spatial distance of about **817 miles** and a dispatch cost of **$22.20**. This connects the service-order record to field visibility, not just API payloads or order totals.

The value of Oracle AI Database is that the same service order can support care, service operations, partner integration, and field dispatch analysis without splitting the story across separate persistence layers.

You can move to the next scene.

## Credits & Build Notes
- **Author** - Oracle LiveLabs Team
- **Last Updated By/Date** - Oracle LiveLabs Team, 2026-05-28
