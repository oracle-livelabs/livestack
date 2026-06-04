# Scene 7 Unified Order Intelligence

## Introduction

**Unified Order Intelligence** gives service, operations, fulfillment, and application teams one consistent order story.
The same order can be reviewed as operational detail, used as an application-friendly JSON document, and connected to shipment context without creating separate, conflicting copies.

Retail teams struggle when this information lives in separate tools. That separation makes it harder to act quickly and trust the result.

Oracle AI Database helps address these challenges by keeping the order record in one governed data platform while exposing it through the shape each workflow needs. Relational tables provide ACID transactions, foreign keys, and operational SQL.

JSON Relational Duality Views expose the same order as a nested JSON document for application and API use cases. Oracle Spatial adds route and distance context for fulfillment visibility, and VPD policies can control which orders each user can see.

Estimated Time: **10 minutes**

![Unified Order Intelligence order list with order 334424 highlighted](images/unified-order-intelligence.png)

### Objectives

In this scene, you will learn what retail decision the page supports, what evidence the user should inspect, and what action the business may take next.

## Task 1: Review the order workspace

Perform the following set of steps to confirm both order visibility and access control. Retailers need fast order insight, but users should only see the orders they are allowed to view.

1. Click **Unified Order Intelligence** in the sidebar.
2. Review the VPD banner below the page subtitle. It shows the active demo user and whether the user has full access or a region-filtered order view.
3. Review the status filter and the order table.
4. Focus on order **#334424**.

In the current demo dataset, order **#334424** is for **Penelope Mendoza** in **Charlotte, North Carolina**. It is marked **delivered**, contains **5** line items, totals **$943.89**, and is fulfilled by **Columbus Midwest**. This order will be the data point used through the rest of the scene.

**Note:** Sample values may change after data refreshes or rebuilds. Verify live output before presenting, then explain the business takeaway.

## Task 2: Inspect the relational order detail

![Relational order detail for order 334424](images/order-relational-detail.png)

Perform the following set of steps to see the precise customer, product, quantity, price, and line-item information that service and operations teams need for validation.

1. Click order **#334424**.
2. Confirm the **Relational** tab is selected.
3. Review the customer, location, total, shipping cost, and line-item table.
4. Review the products in the order, such as **BlueShield Training Glasses**, **TrailRun Sport Earbuds**, **Organic Protein Bars 12pk**, **Bike Shop Impact Driver 20V**, and **Smart Grill Thermometer**.

This view helps service and operations teams answer customer questions quickly because order header, customer, product, quantity, price, and shipment context are visible from one place.

## Task 3: Compare the JSON Duality View

![JSON Duality View for order 334424](images/order-json-duality-view.png)

Perform the following set of steps to show that the same order can support both internal operations and application needs without creating separate versions of the order.

1. Click **JSON Duality View** in the expanded order panel.
2. Review the source label **ORDERS_DV**.
3. Review the JSON document for order **334424**.
4. Notice that the document contains the order id, customer id, status, total, shipping cost, demand score, created date, and nested line items.

The key point is that the order is not copied into a separate document store. The same trusted order can be shown as operational detail or as a document shape for applications.

## Task 4: Review shipment and fulfillment context

![Shipment route and fulfillment context for order 334424](images/order-shipment-route.png)

Perform the following set of steps to connect the order record to delivery distance, cost, progress, and status. This helps the retailer understand the customer promise behind the order.

1. Click **Shipment Route** in the expanded order panel.
2. Review the fulfillment center and customer locations on the map.
3. Review the shipment context below the map: distance, estimated transit time, ship cost, and shipment status.
4. Review the shipment progress timeline.

For order **#334424**, the page shows a route from **Columbus Midwest** to **Penelope Mendoza** in **Charlotte, North Carolina**. The shipment is delivered, the straight-line spatial distance is about **340 miles**, the estimated transit time is about **6.2 hours**, and the ship cost is **$18.69**. This connects the order record to fulfillment visibility, not just API payloads or order totals.

**Note:** Sample values may change after data refreshes or rebuilds. Verify live output before presenting, then explain the business takeaway.

Retail teams can see which products, brands, and locations need attention before availability or fulfillment suffers. Oracle AI Database supports this by combining inventory, fulfillment center, forecast, spatial coverage, center load, and social signal data in one governed data platform, then presenting the alert in the same operational interface.

*You can move to the next scene.*

## Credits & Build Notes
- **Author** - Oracle LiveLabs Team
- **Last Updated By/Date** - Oracle LiveLabs Team, 2026-05-28
