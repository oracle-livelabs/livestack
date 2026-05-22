# Scene 5 Financial Crime Network

## Introduction

A financial-crime investigator, fraud operations lead, cyber-risk analyst, or case manager uses this page to understand whether accounts, devices, IP addresses, payees, branches, and fraud cases are connected. This persona is not only looking for a high-risk account. They need to know which relationships are strong, which shared entities connect multiple accounts, where funds may flow, and which entities act as risk hubs across channels.

This is difficult to implement when transaction monitoring, device telemetry, IP intelligence, payee screening, branch activity, and case management live in separate systems. Financial-crime teams often end up with flat alerts or account-level reports that show suspicious activity, but not the multi-hop relationship pattern that explains why the activity matters.

Oracle AI Database helps address these challenges by modeling fraud entities and relationships as a property graph over governed finance data. SQL/PGQ graph queries can traverse suspicious paths, calculate degrees, expose shared infrastructure, and identify high-risk hubs without moving sensitive investigation data into a separate graph database. The same database security model can continue to govern which entities, cases, and relationships each user can see.

Estimated Time: 10 minutes

![Financial Crime Network page with the selected investigation graph highlighted](images/financial-crime-network.png)

### Objectives

In this scene, you will:
- Review the **Financial Crime Network** page and the selected fraud graph.
- Inspect a specific account data point, including risk score, exposure, connections, graph nodes, graph edges, and depth.
- Use the **Investigation Query Explorer** to run SQL/PGQ queries for fraud ring reach, shared device or IP clusters, money mule flow, cross-channel account takeover, and risk hub detection.
- Interpret how graph results help a financial institution move from isolated alerts to connected investigation evidence.

## Task 1: Review the Financial Crime Network page

1. Click **Financial Crime Network** in the sidebar.
2. Review the connected risk entity list on the left. The list includes risk score, exposure, channel, and number of graph links.
3. Set **Graph Depth (Hops)** to **2** for a compact investigation view.
4. Review the graph workspace. The graph connects accounts, devices, IP addresses, payees, branches, phones, emails, merchants, and cases through relationship types such as shared device, shared IP, uses payee, same phone, and opened with.

In the current demo dataset, the selected investigation account **ACCT-8841** is **Premier Checking 8841**. At 2 hops, its network contains **11** nodes and **16** edges. Use that account to set the scene: the investigator is not reviewing a single alert, but a connected account-takeover and mule-payment pattern.

## Task 2: Inspect the selected account data point

![Selected financial-crime data point for ACCT-8841](images/crime-network-data-point.png)

1. Select **ACCT-8841** if it is not already selected.
2. Review the account metrics above the graph. The selected account shows **$18,540.25** exposure, **96.5** risk score, **5** direct connections, **11** nodes, **16** edges, and **2** hops when the depth control is set to 2.
3. Compare the account row on the left with the graph on the right. The row tells you the account's direct risk context; the graph shows how that account connects to devices, payees, IP addresses, phone numbers, and a case.
4. Use the visible relationships as the demo evidence: **shared_device** to **DEV-fp-91a7** with strength **0.982**, **uses_payee** to **PAYEE-MULE-017** with strength **0.971**, **shared_ip** to **IP-198.51.100.44** with strength **0.963**, and **same_phone** to **PHONE-212-0199** with strength **0.934**.

This is the data point to focus on during the demo. **ACCT-8841** is suspicious because it is connected to shared infrastructure and mule-payment entities, not only because it has a high risk score. Oracle Property Graph makes that relationship context queryable, not just visual.

## Task 3: Run Fraud Ring Reach

![Fraud Ring Reach query results](images/fraud-ring-reach-results.png)

1. Scroll to **Investigation Query Explorer**.
2. Select **Fraud Ring Reach (N-Hop Traversal)**.
3. Use the default seed entity **ACCT-8841** and set **Max Hops** to **2**.
4. Click **Run Query**.
5. Review the returned entities.

Focus on the top results. In the current demo dataset, the query returns **6** reachable entities. The top result is **DEV-fp-91a7**, a device with risk score **98**, followed by **PAYEE-MULE-017** with risk score **97** and **IP-198.51.100.44** with risk score **95**. This is the point of the graph query: reach is not just a count of connected nodes. It shows which high-risk entities sit within the account's investigation radius.

## Task 4: Run Shared Device/IP Cluster

![Shared Device and IP Cluster query results](images/shared-device-cluster-results.png)

1. Click **Back to queries** if you are still viewing the previous query result.
2. Select **Shared Device/IP Cluster**.
3. Use the default **Minimum Risk Score** value of **70**.
4. Click **Run Query**.
5. Review the account pairs and shared entities returned by the graph query.

Focus on the first row. The query shows **ACCT-8841** sharing **DEV-fp-91a7** with **ACCT-1190**, with a combined risk score of **93.8**. This helps a financial-crime user identify a device fingerprint that connects multiple risky accounts and may justify account linking, escalation, or a case merge.

## Task 5: Run Money Mule Flow

![Money Mule Flow query results](images/money-mule-flow-results.png)

1. Click **Back to queries**.
2. Select **Money Mule Flow**.
3. Use the default **Minimum Amount** value of **2500**.
4. Click **Run Query**.
5. Review the source account, mule payee, related account, and amount columns.

Focus on the first row. In the current demo dataset, **ACCT-8841** connects to **PAYEE-MULE-017**, which is also connected to **ACCT-1190**. The source amount is **$14,120.00** and the related amount is **$11,130.75**. This gives the investigator a concrete money-mule pattern to explain: multiple risky accounts converge on the same payee destination.

## Task 6: Run Cross-Channel Account Takeover

![Cross-Channel Account Takeover query results](images/cross-channel-takeover-results.png)

1. Click **Back to queries**.
2. Select **Cross-Channel Account Takeover**.
3. Use the default **Minimum Channels** value of **2**.
4. Click **Run Query**.
5. Review the shared infrastructure, channel count, account count, average risk, and exposure columns.

Focus on **IP-198.51.100.44**. The query identifies this IP address as shared infrastructure across **3** channels and **3** accounts, with average risk **89.7** and exposure of **$37,770.25**. This result helps show how account-takeover evidence can span mobile, web, branch, ATM, or contact-center activity instead of staying inside one channel.

## Task 7: Run Risk Hub Detection

![Risk Hub Detection query results](images/risk-hub-detection-results.png)

1. Click **Back to queries**.
2. Select **Risk Hub Detection**.
3. Leave **Entity Type** blank so the query ranks all entity types.
4. Click **Run Query**.
5. Review the returned rows.

Focus on the top result. In the current demo dataset, **ACCT-8841** is ranked as a risk hub with **5** graph relationships, **5** relationship types, risk score **96.5**, total amount **$18,540.25**, and average relationship strength **0.909**. This result is useful because it turns the visual graph into an investigation priority signal.

The query runs against the `FRAUD_NETWORK` property graph using SQL/PGQ-style traversal and aggregation. A financial-crime team can use the same approach to identify shared devices, mule flows, cross-channel takeover infrastructure, and high-degree risk hubs from governed Oracle data.

You can move to the next scene.

## Credits & Build Notes
- **Author** - Oracle LiveLabs Team
- **Last Updated By/Date** - Oracle LiveLabs Team, 2026-05-21
