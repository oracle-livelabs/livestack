# Scene 10 Retail AI Agent Console

## Introduction

A retail operations leader, fulfillment manager, commerce analyst, or AI platform owner uses this page to see how agentic assistance can support day-to-day retail decisions. This persona is not only interested in whether an AI agent can answer a question. They need to know which team handled the request, which tools were called, what data was used, and whether the action was recorded for later review.

This is difficult to implement when AI agents operate as black boxes outside the operational data platform. Retail teams may get a recommendation, but not the routing decision, SQL or PL/SQL tool path, confidence, or audit record behind it. That makes it hard to trust agent output in fulfillment, demand, customer service, or commerce workflows.

Oracle AI Database helps address these challenges by keeping the source data, SQL execution, PL/SQL tools, and durable action logging in the database. In this LiveStack Demo, the app orchestrates the agent workflow, Ollama provides reasoning, and Oracle AI Database 26ai executes the governed data operations. Agent actions are written back to `agent_actions`, while the UI shows the response, tool badges, and recent audit trail.

Estimated Time: 10 minutes

![Retail AI Agent Console overview with runtime profile, examples, and recent actions highlighted](images/retail-ai-agent-console-overview.png)

### Objectives

In this scene, you will:
- Review the **Retail AI Agent Console** workspace and runtime profile.
- Select a concrete AllTerrain fulfillment agent question.
- Inspect the agent response and SQL/PLSQL tool badges.
- Review the **Recent Agent Actions** audit trail.
- Understand why observable agent behavior matters for enterprise retail workflows.

## Task 1: Review the agent console workspace

1. Click **Retail AI Agent Console** in the sidebar.
2. Review the runtime profile selector in the top right. The current demo uses **llama3.2** through an Ollama-backed runtime profile.
3. Review the example questions in the chat panel.
4. Review **Recent Agent Actions** below the chat panel.
5. Focus on the fulfillment example: **Check inventory for AllTerrain Hiking Boots**.

Use this opening view to explain the role of the page. The user is not looking at a generic chatbot. They are looking at an operational agent surface where retail questions are routed to specialist teams such as fulfillment, sporting-goods demand signals, or commerce intelligence.

## Task 2: Run the AllTerrain fulfillment agent question

![Fulfillment response for AllTerrain Hiking Boots](images/agent-fulfillment-route-response.png)

1. Click **Ask** on **Check inventory for AllTerrain Hiking Boots**.
2. Review the agent response at the top of the chat output.
3. Review the fulfillment-center inventory list.
4. Review the tool badges below the response.

In the current demo dataset, the agent routes the request to the **Fulfillment Optimization** path and returns inventory for **AllTerrain Hiking Boots** across **12** fulfillment centers, with **3,183** total units. The response lists centers such as **Honolulu Pacific**, **Memphis Logistics**, **Houston Gulf Coast**, **Anchorage Alaska**, **Chicago Midwest Hub**, and **Miami Southeast**, with on-hand and reserved quantities.

This is the data point to emphasize during the demo. The agent did more than answer a text question. It routed the request to the fulfillment team, called Oracle-backed tools, inspected product inventory, and returned operational stock context for the hero product.

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

1. Scroll to **Recent Agent Actions**.
2. Review the top action row.
3. Confirm that the row shows a **chat query** routed to the **fulfillment** agent path.
4. Review the confidence value.

In the current demo dataset, the completed chat action is logged with **90%** confidence and routed to the **fulfillment** path. This is the governance point of the scene: agent decisions should be observable after the conversation. The page shows that agent interactions are not just transient chat messages. They are written into the action history so an operator, architect, or auditor can understand what happened.

The value of Oracle AI Database is that the agent workflow stays connected to governed operational data. The AI runtime can reason and orchestrate, while Oracle remains responsible for data access, SQL and PL/SQL execution, spatial calculations, and durable audit records.

You can move to the next scene.

## Credits & Build Notes
- **Author** - Oracle LiveLabs Team
- **Last Updated By/Date** - Oracle LiveLabs Team, 2026-05-28
