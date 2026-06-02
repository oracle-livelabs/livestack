# Scene 10 Retail AI Agent Console

## Introduction

**Retail AI Agent Console** shows how an AI assistant can support operational decisions while staying observable.

For retail workflows such as fulfillment, demand investigation, and customer-impacting actions, the user needs to see the recommendation, the data used, the tools invoked, and the audit trail behind the response.

This is difficult to implement when AI agents operate as black boxes outside the operational data platform. Retail teams may get a recommendation, but not the routing decision, SQL or PL/SQL tool path, confidence, or audit record behind it. That makes it hard to trust agent output in fulfillment, demand, customer service, or commerce workflows.

Oracle AI Database helps address these challenges by keeping the source data, SQL execution, PL/SQL tools, and durable action logging in the database.

In this LiveStack Demo, the app orchestrates the agent workflow, Ollama provides reasoning, and Oracle AI Database 26ai executes the governed data operations. Agent actions are written back to `agent_actions`, while the UI shows the response, tool badges, and recent audit trail.

Estimated Time: **10 minutes**

![Retail AI Agent Console overview with runtime profile, examples, and recent actions highlighted](images/retail-ai-agent-console-overview.png)

### Objectives

In this scene, you will learn what retail decision the page supports, what evidence the user should inspect, and what action the business may take next.

## Task 1: Review the agent console workspace

Review the agent console as an operational workspace. The user should notice the runtime profile, example questions, routing behavior, recent actions, and confidence information before running an agent task.

1. Click **Retail AI Agent Console** in the sidebar.
2. Review the runtime profile selector in the top right. The current demo uses **llama3.2** through an Ollama-backed runtime profile.
3. Review the example questions in the chat panel.
4. Review **Recent Agent Actions** below the chat panel.
5. Focus on the fulfillment example: **Check inventory for AllTerrain Hiking Boots**.

Use this opening view to explain that the page is an operational agent console. The user can see routing, tools, results, confidence, and action history, not just a chat response.

## Task 2: Run the AllTerrain fulfillment agent question

![Fulfillment response for AllTerrain Hiking Boots](images/agent-fulfillment-route-response.png)

Perform the following set of steps to show how the agent compares customer location, product inventory, route distance, transit time, and available alternatives before recommending a fulfillment option.

1. Click **Ask** on **Check inventory for AllTerrain Hiking Boots**.
2. Review the agent response at the top of the chat output.
3. Review the fulfillment-center inventory list.
4. Review the tool badges below the response.

In the current demo dataset, the agent routes the request to the **Fulfillment Optimization** path and returns inventory for **AllTerrain Hiking Boots** across **12** fulfillment centers, with **3,183** total units. The response lists centers such as **Honolulu Pacific**, **Memphis Logistics**, **Houston Gulf Coast**, **Anchorage Alaska**, **Chicago Midwest Hub**, and **Miami Southeast**, with on-hand and reserved quantities.

**Note:** Sample values may change after data refreshes or rebuilds. Verify live output before presenting, then explain the business takeaway.

This is the data point to emphasize during the demo. The agent did more than answer a text question: it looked up a customer in Miami, found fulfillment centers with available AirBud inventory, calculated route options, rendered the map, and exposed tool badges such as customer_lookup and find_best_fulfillment().

The business can then decide whether to ship from the best viable center, compare alternative centers, reserve stock for the customer, or investigate whether inventory should be rebalanced.

## Task 3: Interpret the operational story

Use the AllTerrain inventory result to explain the decision:

1. The product request narrows the inventory search to AllTerrain Hiking Boots.
2. Oracle data identifies fulfillment centers with available stock.
3. The agent summarizes center-level on-hand and reserved quantities.
4. The business user can compare whether stock is deep enough to support the demand story from earlier scenes.
5. The audit trail records that the question was handled by the fulfillment path.

The important story is operational visibility. A fulfillment manager can see whether inventory exists across the network, whether reserved quantities are starting to matter, and whether the AllTerrain demand story should trigger replenishment, transfer planning, or deeper routing analysis.

## Task 4: Review the agent action audit trail

![Recent Agent Actions audit trail with fulfillment chat query highlighted](images/agent-action-audit-trail.png)

Review the audit trail to show that AI actions do not disappear after the chat. Retail leaders can review what the agent did, which path it used, and how confident the system was.

1. Scroll to **Recent Agent Actions**.
2. Review the top action row.
3. Confirm that the row shows a **chat query** routed to the **fulfillment** agent path.
4. Review the confidence value.

In the current demo dataset, the completed chat action is logged with **90%** confidence and routed to the **fulfillment** path.

**Note:** Sample values may change after data refreshes or rebuilds. Verify live output before presenting, then explain the business takeaway.

This is the governance point of the scene: agent decisions should be observable after the conversation. The page shows that agent interactions are not just transient chat messages. They are written into the action history so an operator, architect, or auditor can understand what happened.

The value of Oracle AI Database is that the agent workflow stays connected to governed operational data. The AI runtime can reason and orchestrate, while Oracle remains responsible for data access, SQL and PL/SQL execution, spatial calculations, and durable audit records.

*You can move to the next scene.*

## Credits & Build Notes
- **Author** - Oracle LiveLabs Team
- **Last Updated By/Date** - Oracle LiveLabs Team, 2026-05-28
