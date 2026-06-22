# Scene 10 Manufacturing Agent Console

## Introduction

**Manufacturing Agent Console** shows how AI-assisted workflows can support day-to-day manufacturing decisions without becoming a black box. Users can see the specialist path, tools used, data returned, confidence, runtime evidence, and action history behind the answer.

This is difficult to implement when AI agents operate as black boxes outside the operational data platform. Manufacturing teams may get a recommendation, but not the routing decision, SQL or PL/SQL tool path, confidence, or audit record behind it.

**Oracle AI Database** helps address these challenges by keeping the source data, SQL execution, PL/SQL tools, and durable action logging in the database. In this LiveStack Demo, the app orchestrates the agent workflow, Ollama provides reasoning, and Oracle AI Database 26ai executes the governed data operations.

Estimated Time: **10 minutes**

![Manufacturing Agent Console overview with agent examples and recent actions](images/scene-10-manufacturing-agent-console.png)

### Objectives

In this scene, you will learn what manufacturing decision the agent console supports, what evidence the user should inspect, and what action the team may take next.

## Task 1: Review the agent console workspace

Perform the following set of steps to review the agent console as an operational workspace before running an agent task:

1. Click **Manufacturing Agent Console** in the sidebar.
2. Review the runtime profile selector. The current demo uses **llama3.2** through Ollama-backed reasoning.
3. Review the example questions in the agent workspace.
4. Review **Recent Agent Actions** below the workspace.
5. Focus on the plant-capacity example: **Check capacity for Servo Drive Controller AX-400**.

    ![Manufacturing Agent Console workspace with runtime profile, example questions, and Recent Agent Actions highlighted](images/agent-console-workspace.png)

Use this opening view to explain that the page is an operational agent console. The user can see routing, tools, results, confidence, fallback status, and action history, not just a chat response.

## Task 2: Run the plant-capacity agent question

Perform the following set of steps to run the plant-capacity agent question and show how the agent exposes the data, tool path, runtime status, and returned table behind the answer:

1. Click **Ask** on **Check capacity for Servo Drive Controller AX-400**.

    ![Manufacturing plant-capacity agent response with active plant table](images/agent-capacity-response.png)

2. Review the agent response at the top of the chat output.
3. Review the returned plant capacity table.
4. Review the tool and runtime badges below the response.

In the current demo dataset, the agent routes the request to the **Plant Capacity** path and returns a capacity overview with **10** active plants. The visible table includes **Fremont Flexible Manufacturing Cell**, **Ontario Flexible Manufacturing Cell**, **Minneapolis Flexible Manufacturing Cell**, **Reno MRO Distribution Hub**, and **Milwaukee Precision Machining Plant**. The response exposes the Ollama runtime and SQL tool path.

**Note:** Sample values may change after data refreshes or rebuilds. Verify live output before presenting, then explain the business takeaway.

This is the data point to emphasize during the demo. The agent did more than answer a text question. It classified the manufacturing capacity intent, queried governed plant data, returned a structured table, and exposed enough runtime information for an operator to understand the path.

## Task 3: Review the agent action audit trail

Perform the following set of steps to review the agent action audit trail and show that AI-assisted actions do not disappear after the conversation:

1. Scroll to **Recent Agent Actions**.

    ![Recent Agent Actions audit trail after the manufacturing capacity agent request](images/agent-action-audit-trail.png)

2. Review the panel as the audit surface for completed action-cycle records.
3. If action rows are present, confirm the action type, routed agent path, execution status, and confidence value.
4. If the panel is empty after a chat-only response, explain that the answer still exposes runtime and tool badges in the chat result, while action-cycle records appear when the application writes them to the event history.

The governance point is that agent decisions should remain observable after the conversation or action cycle. The page separates the live chat response from durable action history so operators can distinguish immediate assistance from recorded operational actions.

The value of Oracle AI Database is that the agent workflow stays connected to governed operational data. The AI runtime can reason and orchestrate, while Oracle remains responsible for data access, SQL and PL/SQL execution, spatial and operational calculations, and durable audit records.

You can move to the next scene.

## Credits & Build Notes
- **Author** - Oracle LiveLabs Team
- **Last Updated By/Date** - Oracle LiveLabs Team, 2026-06-09
