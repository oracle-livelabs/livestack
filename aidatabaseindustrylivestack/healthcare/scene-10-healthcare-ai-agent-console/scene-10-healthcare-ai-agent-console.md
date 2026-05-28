# Scene 10 Healthcare AI Agent Console

## Introduction

A healthcare operations leader, logistics coordinator, quality analyst, or AI platform owner uses this page to see how agentic assistance can support day-to-day healthcare decisions. This persona is not only interested in whether an AI agent can answer a question. They need to know which specialist path handled the request, which tools were used, what data was returned, and whether the action was recorded for later review.

This is difficult to implement when AI agents operate as black boxes outside the operational data platform. Healthcare teams may get a recommendation, but not the routing decision, SQL or PL/SQL tool path, confidence, or audit record behind it.

Oracle AI Database helps address these challenges by keeping the source data, SQL execution, PL/SQL tools, and durable action logging in the database. In this LiveStack Demo, the app orchestrates the agent workflow, Ollama provides reasoning, and Oracle AI Database 26ai executes the governed data operations.

Estimated Time: 10 minutes

![Healthcare AI Agent Console overview with agent examples and recent actions](images/scene-10-healthcare-ai-agent-console.png)

### Objectives

In this scene, you will:
- Review the **Healthcare AI Agent Console** workspace and runtime profile.
- Review the signal, request, and logistics example questions.
- Run a logistics agent question.
- Inspect the agent response and returned care logistics site table.
- Review the **Recent Agent Actions** audit trail.
- Understand why observable agent behavior matters for enterprise healthcare workflows.

## Task 1: Review the agent console workspace

1. Click **Healthcare AI Agent Console** in the sidebar.
2. Review the runtime profile selector. The current demo uses **llama3.2** through Ollama-backed reasoning.
3. Review the example questions in the agent workspace.
4. Review **Recent Agent Actions** below the workspace.
5. Focus on the logistics example: **Find nearest compliant care logistics site with qPCR Respiratory Panel for a care site in Miami**.

Use this opening view to explain the role of the page. The user is not looking at a generic chatbot. They are looking at an operational agent surface where healthcare questions are routed to specialist teams such as signal review, care logistics, and service request follow-up.

## Task 2: Run the logistics agent question

1. Click **Ask** on **Find nearest compliant care logistics site with qPCR Respiratory Panel for a care site in Miami**.

    ![Care Logistics Agent response with capacity table](images/agent-logistics-capacity-response.png)

2. Review the agent response at the top of the chat output.
3. Review the returned care logistics site table.
4. Review the tool and runtime badges below the response.

In the current demo dataset, the agent routes the request to the **Care Logistics Agent** path and returns a care logistics overview with **10** active care logistics sites. The visible table includes **Hialeah Import Compliance Site** in Florida, **Concord Southeast Micro Site** in North Carolina, **Romulus Great Lakes Bioprocess Hub** in Michigan, **Lebanon Central Specialty Care Warehouse** in Tennessee, and **Aurora Mountain West Repack Hub** in Colorado. The response exposes the Ollama runtime and service request SQL tool path.

This is the data point to emphasize during the demo. The agent did more than answer a text question. It classified the healthcare logistics intent, queried governed care logistics data, returned a structured table, and exposed enough runtime information for an operator to understand the path.

## Task 3: Review the agent action audit trail

1. Scroll to **Recent Agent Actions**.

    ![Recent Agent Actions audit trail after the logistics agent request](images/agent-action-audit-trail.png)

2. Review the newest action row.
3. Confirm that the row shows a **chat query** routed to the logistics-oriented agent path. In the current UI, the compatibility audit label may appear as `FULFILLMENT_TEAM`, but the runbook context is healthcare care logistics.
4. Review the confidence value.

In the current demo dataset, the completed chat action is logged with **90%** confidence. The audit row appears above the earlier service request attribution action. This is the governance point of the scene: agent decisions should be observable after the conversation. The page shows that interactions are not just transient chat messages; they are written into the action history.

The value of Oracle AI Database is that the agent workflow stays connected to governed operational data. The AI runtime can reason and orchestrate, while Oracle remains responsible for data access, SQL and PL/SQL execution, spatial and operational calculations, and durable audit records.

You can move to the next scene.

## Credits & Build Notes
- **Author** - Oracle LiveLabs Team
- **Last Updated By/Date** - Oracle LiveLabs Team, 2026-05-22
