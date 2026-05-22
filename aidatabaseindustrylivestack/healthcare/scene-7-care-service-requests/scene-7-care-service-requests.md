# Scene 7 Care Service Requests

## Introduction

A service request operations manager, care logistics coordinator, customer support lead, or application architect uses this page to understand the same healthcare transaction from multiple angles. The persona needs a reliable operational list, relational line-item detail, API-friendly JSON document access, and spatial route context.

This is difficult to implement when request headers, line items, care sites, logistics sites, shipment state, and API payloads are handled in separate systems. Each copy creates synchronization risk and extra engineering work when the request model changes.

Oracle AI Database helps address these challenges by keeping the service request record in one governed platform while exposing it through the shape each workflow needs. Relational tables provide transactional detail. JSON Relational Duality Views expose the same request as a nested JSON document. Oracle Spatial adds logistics route and distance context.

Estimated Time: 10 minutes

![Care Service Requests page with VPD banner, status filter, and request table](images/scene-7-care-service-requests.png)

### Objectives

In this scene, you will:
- Review the **Care Service Requests** page and active request table.
- Inspect a specific request row.
- Open the same request as relational operational detail.
- Compare that same request with the JSON document returned by `CARE_SERVICE_REQUESTS_DV`.
- Review the logistics route and spatial context for the request.

## Task 1: Review the service request workspace

1. Click **Care Service Requests** in the sidebar.
2. Review the active user banner. The current demo user is **Jessica Chen**, with **Admin** access and **20** visible service requests on the page.
3. Review the status filter.
4. Review the request table columns: request id, requesting care site, location, status, line items, value, quality or capacity signal, logistics site, and created time.
5. Focus on request **#170104**.

    ![Care Service Requests workspace with active user banner, status filter, request table, and request 170104 highlighted](images/service-request-workspace.png)

In the current demo dataset, request **#170104** is for **Penelope Mendoza** in **Charlotte, North Carolina**. It is **Delivered**, has **5** line items, totals **$943.89**, and is fulfilled by **Etna Midwest Specialty Warehouse**. This request will be the data point used through the rest of the scene.

## Task 2: Inspect the relational request detail

1. Click request **#170104**.

    ![Relational detail for care service request 170104](images/care-request-relational-detail.png)

2. Confirm the **Relational** tab is selected.
3. Review requesting care site, care site location, request value, and logistics cost.
4. Review the line-item table.

For request **#170104**, the relational view shows line items such as **New Clinic Activation Kit - Continuity Lot 3**, **Digital Pathology Slide Batch - Continuity Lot 3**, **ELISA Cytokine Monitoring Kit - Continuity Lot 2**, **Antioxidant Excipient Blend**, and **Sodium Chloride USP Buffer Component - Continuity Lot 2**. This view is useful for operations because the request header and item detail remain normalized and easy to validate.

## Task 3: Compare the JSON Duality View

1. Click **JSON Duality View** in the expanded request panel.

    ![JSON Duality View for care service request 170104](images/care-request-json-duality.png)

2. Review the source label **CARE_SERVICE_REQUESTS_DV**.
3. Review the JSON document for request **170104**.
4. Notice that the document contains `serviceRequestId`, `requestingCareSiteId`, `requestStatus`, `requestValue`, `logisticsCost`, `demandScore`, `createdAt`, and nested `lineItems`.

This is the key point of the page. The JSON document is not a separate copy of the request. It is the same governed request data exposed through an Oracle JSON Relational Duality View. Application teams can use document-shaped access while operations teams continue to work with relational tables and SQL.

## Task 4: Review logistics route context

1. Click **Logistics Route** in the expanded request panel.

    ![Logistics route for care service request 170104](images/care-request-logistics-route.png)

2. Review the logistics site and care site.
3. Review distance, estimated transit, logistics cost, route status, and request progress.
4. Review the Oracle Spatial SQL example.

For request **#170104**, the page shows a route from **Etna Midwest Specialty Warehouse** to **Penelope Mendoza - Charlotte, North Carolina**. The route is delivered, the distance is about **340 miles**, the estimated transit time is **6.2 hours**, and the logistics cost is **$18.69**. The page explains that Oracle Spatial calculates distance between governed `SDO_GEOMETRY` points.

The value of Oracle AI Database is that the same request can support operations, API access, and logistics analysis without splitting the story across separate persistence layers.

You can move to the next scene.

## Credits & Build Notes
- **Author** - Oracle LiveLabs Team
- **Last Updated By/Date** - Oracle LiveLabs Team, 2026-05-22
