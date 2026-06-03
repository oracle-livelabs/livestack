# Scene 7 Utility Service Requests

## Introduction

**Utility Service Requests** shows how customer operations fit the Gulf Coast event. The page can represent electric outage reports, billing inquiries, collections or payment arrangements, high-usage concerns, move-in and move-out requests, gas odor reports, gas leak safety calls, water leak reports, low-pressure complaints, sewer overflow complaints, streetlight repairs, solar interconnection requests, EV charger service upgrades, vegetation management requests, industrial customer requests, and retail energy plan inquiries.

Oracle AI Database keeps the service request record in one governed platform while exposing it through the shape each workflow needs. Relational tables provide operational detail. JSON Relational Duality Views expose the same request as a nested JSON document. Oracle Spatial adds field route and distance context.

Estimated Time: **10 minutes**

![Utility Service Requests page with VPD banner, status filter, and request table](images/scene-07-service-tickets.png)

### Objectives

In this scene, you will learn how one customer or service request can support customer operations, field dispatch, compliance follow-up, and application integration without creating disconnected copies of the record.

## Task 1: Review the service request workspace

Perform the following steps to establish customer impact: who requested help, what status the request is in, which subsector is affected, what priority or value is involved, and which field operations site is responsible.

1. Click **Utility Service Requests** in the sidebar.
2. Review the active user banner and VPD context.
3. Review the status filter.
4. Review the request table columns for request id, customer or service point, location, status, line items, priority value, related signal, field site, and created time.
5. Focus on a visible request such as **SR-77120** when available, or use the first visible request as the example.

    ![Utility Service Requests workspace with active user banner, status filter, and request table highlighted](images/service-request-workspace.png)

Use visible rows to explain how customer operations connect to the broader event. A gas odor call, water leak report, billing concern, outage report, or industrial service request can become part of the same governed operating story.

**Note:** Sample values may change after data refreshes or rebuilds. Verify live output before presenting, then explain the business takeaway.

## Task 2: Inspect the relational request detail

Perform the following steps to validate the request header, customer or service point, line items, priority value, field cost, and item-level information that operations teams need for follow-up.

1. Click a visible request row.
2. Confirm the **Relational** tab is selected.
3. Review customer or service point, location, request priority value, field or logistics cost, and line items when the detail panel loads.

    ![Utility service request relational detail with request header fields and line items](images/utility-request-relational-detail.png)

**Expected result:** The UI returns the same type of result shown here. Exact rows, scores, or counts may vary by dataset, so verify the current values and focus the explanation on the operational pattern.

## Task 3: Compare the JSON Duality View

Perform the following steps to show that the same governed request can support both operations users and application teams without creating a separate document store.

1. Click **JSON Duality View** in the expanded request panel.
2. Review the source label for the utility service request duality view.
3. Review the JSON document for the selected request.
4. Notice that the document should include identifiers, customer or service point context, request status, request value, logistics or field cost, demand or risk score, created timestamp, and nested line items.

    ![Utility service request JSON Duality View document for the selected request](images/utility-request-json-duality.png)

The key point is that the request is not copied into a separate document store. The same governed request can appear as operational detail or as a JSON document shape for applications.

## Task 4: Review field route context

Perform the following steps to connect the service request to the field operations site, service point, distance, travel time, field cost, route status, and request progress.

1. Click **Logistics Route** in the expanded request panel.
2. Review the field operations site and service point.
3. Review distance, estimated transit, logistics cost, route status, and request progress.
4. Review the Oracle Spatial SQL example.

    ![Utility service request route context with field operations site and route metrics](images/utility-request-logistics-route.png)

The business value is that customer operations, field execution, JSON application access, and spatial context stay connected to the same governed service request.

*You can move to the next scene.*

## Credits & Build Notes
- **Author** - Oracle LiveLabs Team
- **Last Updated By/Date** - Oracle LiveLabs Team, 2026-06-03
