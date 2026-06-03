# Scene 10 Media and Entertainment Action Console

## Introduction

**Media and Entertainment Action Console** shows how AI assistance can support media operations without becoming a black box. When an agent helps with audience intelligence, monetization, rights planning, retention, or campaign workflows, users need to see the routing decision, tools used, data returned, confidence level, and audit history.

This persona is not only interested in whether an AI agent can answer a question. They need to know which specialist path handled the request, which tools were used, what data was returned, and whether the action was recorded for later review.Media teams struggle when recommendations arrive without context. If users cannot see how an AI recommendation was generated, it becomes difficult to trust the result or explain the decision to stakeholders.

**Oracle AI Database** helps keep AI recommendations connected to governed operational data so users can understand not only the answer, but how the answer was produced. In this **LiveStack Demo**, the app orchestrates the agent workflow, Ollama provides reasoning, and Oracle AI Database 26ai executes the governed data operations.

Estimated Time: **10 minutes**

![Seer Media Agent Console overview with agent examples and recent actions](images/seer-media-agent-console.png)

### Objectives

In this scene, you will learn what operational decision the page supports, what evidence the user should inspect, and what action the business may take next.

## Task 1: Review the agent console workspace

Review the agent console as an operational workspace. The user should notice routing, runtime information, confidence indicators, tool usage, and action history before running an agent task.

1. Click **Media & Gaming Action Console** in the sidebar.
2. Review the runtime profile selector. The current demo uses **llama3.2** through Ollama-backed reasoning.
3. Review the example questions in the agent workspace.
4. Review **Recent Agent Actions** below the workspace.
5. Focus on the revenue example to show how AI can support monetization decisions while keeping the supporting data visible.

    ![Media agent console workspace with runtime profile, example questions, and recent actions highlighted](images/agent-console-workspace-callout.png)

This page is an operational agent console. Users can see routing, tools, confidence, evidence, and audit history rather than only a conversational response.

## Task 2: Run the content revenue agent question

Perform the following set of steps to show how the agent identifies monetization opportunities while exposing the supporting data and execution path.

1. Click **Ask** on **Show me content revenue by content category**.

    ![Content Revenue Agent response with revenue by category](images/agent-revenue-response.png)

2. Review the agent response at the top of the chat output.
3. Review the returned category, order count, and revenue table.
4. Review the tool and runtime badges below the response.

**Notes:**
- **Callout 1** highlights the agent response and returned revenue table.
- **Callout 2** highlights the runtime and tool evidence below the response.

In the current seeded dataset, the agent routes the request to the **Content Revenue Agent** path and returns the last 30 days of revenue by category. The visible response shows **513** orders, about **$145.6M** in revenue, and categories such as **Sports Rights**, **Gaming and Esports**, **Marketing Assets**, **Audience Activation**, **Creator Campaign**, **Live Event**, **Streaming Placement**, and **Ad Inventory**. The response exposes the Ollama runtime and media revenue SQL tool path.

**Note:** Sample values may change after data refreshes or rebuilds. Verify live output before presenting, then explain the business takeaway.

This is the data point to emphasize during the demo. After reviewing the revenue categories, explain what the business can do next: investigate performance, adjust campaign investment, review audience engagement, or identify monetization opportunities.

## Task 3: Review the agent action audit trail

Perform the following set of steps to show that AI actions do not disappear after the conversation. Operators, analysts, architects, and auditors can review what happened, which path was used, and how confident the system was.

1. Scroll to **Recent Agent Actions**.

    ![Recent Agent Actions audit trail after the revenue agent request](images/agent-action-audit-trail.png)

2. Review the newest action row.
3. Confirm that the row shows a **chat query** routed to the media revenue agent path.
4. Review the confidence value.

In the current seeded dataset, the completed chat action is logged with **90%** confidence and a route to `MEDIA_REVENUE_TEAM`. The governance point is that AI decisions remain observable after the conversation, with action history available for operators, managers, architects, and auditors.

**Note:** Sample values may change after data refreshes or rebuilds. Verify live output before presenting, then explain the business takeaway.

The business value is that teams can make decisions from connected, governed data while maintaining visibility into how AI recommendations are produced.

*You can move to the next scene.*

## Credits & Build Notes
- **Author** - Oracle LiveLabs Team
- **Last Updated By/Date** - Oracle LiveLabs Team, 2026-05-29
