# Scene 7 Transaction & Case Operations

## Introduction

**Client Transactions & Cases** shows how one transaction can serve several finance workflows at once. Service teams need operational detail, case teams need transaction context, applications need a document-shaped view, and operations teams need route and service visibility.

Finance teams struggle when the information needed for one decision lives in separate tools. That separation slows action, increases reconciliation work, and makes it harder to trust the result.

**Oracle AI Database** helps address these challenges by keeping the transaction record in one governed data platform while exposing it through the shape each workflow needs. Relational tables provide ACID transactions, foreign keys, and operational SQL.

**JSON Relational Duality Views** expose the same transaction as a nested JSON document for application and API use cases. Oracle Spatial adds route and distance context for service visibility, and VPD policies can control which transactions each user can see.

Estimated Time: **10 minutes**

![Transaction and Case Operations list with transaction 270764 highlighted](images/client-transactions-cases.png)

### Objectives

In this scene, you will learn what finance decision the page supports, what evidence the user should inspect, and what action the business may take next.

## Task 1: Review the transaction workspace

 Perform the following set of steps to establish the transaction context and confirm that the user can inspect operational detail, access controls, and service status from one place.

1. Click **Transaction & Case Operations** in the sidebar.
2. Review the VPD banner below the page subtitle. It shows the active demo user and whether the user has full access or a region-filtered transaction view.
3. Review the status filter and the transaction table.
4. Focus on transaction **#270764**.

In the current demo dataset, transaction **#270764** is for **Penelope Mendoza** in **Charlotte, North Carolina**. It is marked **completed**, contains **5** service line items, totals **$943.89**, and is handled by **Etna Midwest Specialty Finance Desk**. This transaction will be the data point used through the rest of the scene.

**Note:** Sample values may change after data refreshes or rebuilds. Verify live output before presenting, then explain the business takeaway.

## Task 2: Inspect the relational transaction detail

![Operational transaction detail for transaction 270764](images/transaction-relational-detail.png)

Perform the following set of steps to see the precise client, product, quantity, price, and line-item information that service and operations teams need for validation.

1. Click transaction **#270764**.
2. Confirm the **Operational View** tab is selected.
3. Review the client, location, total, processing fee, and line-item table.
4. Review the services in the transaction, such as **Loan Portfolio Review Series B**, **Robo Advisory Portfolio Series C**, **AML Screening Package Series C**, **Escrow Account Service**, and **Wire Transfer Service Series B**.

This view helps service teams answer client and case questions quickly because transaction header, client, product, quantity, price, and line-item details are visible in one place.

## Task 3: Compare the API Document View

![API Document View for transaction 270764](images/transaction-json-duality-view.png)

Perform the following set of steps to show that the same transaction can support internal operations and application or partner needs without creating separate versions of the record.

1. Click **API Document View** in the expanded transaction panel.
2. Review the source label **ORDERS_DV**.
3. Review the JSON document for transaction **270764**.
4. Notice that the document contains the transaction id, client id, status, total, service cost, demand score, created date, nested line items, and metadata.

The key point is that the transaction is not copied into a separate document store. The same trusted transaction can appear as operational detail or as a document shape for applications.

## Task 4: Review service route and fulfillment context

![Transaction routing and service-center context for transaction 270764](images/transaction-routing-context.png)

Perform the following set of steps to connect the transaction record to service location, distance, processing time, cost, and status.

1. Click **Transaction Routing** in the expanded transaction panel.
2. Review the service center and client locations on the map.
3. Review the route context below the map: distance, estimated completion time, processing cost, and transaction status.
4. Review the service route progress timeline.

For transaction **#270764**, the page shows a route context from **Etna Midwest Specialty Finance Desk** to **Penelope Mendoza** in **Charlotte, North Carolina**. The transaction is completed, the spatial distance is about **340 miles**, and the processing cost is **$18.69**. The transaction detail also shows a **$7.99** processing fee. This connects the transaction record to service visibility, not just API payloads or transaction totals.

**Note:** Sample values may change after data refreshes or rebuilds. Verify live output before presenting, then explain the business takeaway.

The business value is that teams can make the decision from connected, governed data. Oracle AI Database provides the shared foundation that keeps the data, analytics, and AI workflow aligned.

Relational data, JSON Duality documents, spatial distance, route state, and row-level access controls all work from the same connected finance data foundation.

*You can move to the next scene.*

## Credits & Build Notes
- **Author** - Oracle LiveLabs Team
- **Last Updated By/Date** - Oracle LiveLabs Team, 2026-05-28
