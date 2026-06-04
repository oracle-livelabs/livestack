# Scene 10 Media and Entertainment Action Console

## Introduction

**Media and Entertainment Action Console** shows how AI assistance can support media operations without becoming a black box. When an agent helps with audience intelligence, monetization, rights planning, retention, or campaign workflows, users need to see the routing decision, tools used, data returned, confidence level, and audit history.

This persona is not only interested in whether an AI agent can answer a question. They need to know which specialist path handled the request, which tools were used, what data was returned, and whether the action was recorded for later review. Media teams struggle when recommendations arrive without context. If users cannot see how an AI recommendation was generated, it becomes difficult to trust the result or explain the decision to stakeholders.

**Oracle AI Database** helps keep AI recommendations connected to governed operational data so users can understand not only the answer, but how the answer was produced. In this **LiveStack Demo**, the app orchestrates the agent workflow, Ollama provides reasoning, and Oracle AI Database 26ai executes the governed data operations.

Estimated Time: **10 minutes**

![Seer Media Agent Console overview with agent examples and recent actions](images/seer-media-agent-console.png)

### Objectives

In this scene, you will learn what operational decision the page supports, what evidence the user should inspect, and what action the business may take next.

## Task 1: Review the agent console workspace

Perform the following set of steps to review the agent console as an operational workspace before running an agent task.

1. Click **Media and Entertainment Action Console** in the sidebar.
2. Review the runtime profile selector. The current demo uses **llama3.2** through Ollama-backed reasoning.
3. Review the example questions in the agent workspace.
4. Review **Recent Agent Actions** below the workspace.
5. Focus on the demand example to show how AI can identify high-pressure content assets while keeping the supporting data visible.

    ![Media agent console workspace with runtime profile, example questions, and recent actions highlighted](images/agent-console-workspace-callout.png)

This page is an operational agent console. Users can see routing, tools, confidence, evidence, and audit history rather than only a conversational response.

## Task 2: Run the high-demand content agent question

Perform the following set of steps to show how the agent identifies demand pressure while exposing the supporting data and execution path.

1. Click **Ask** on **Which content assets are seeing the highest demand right now?**.

    ![Media agent response with high-demand content assets](images/agent-revenue-response.png)

2. Review the agent response at the top of the chat output.
3. Review the returned content assets, urgency scores, demand signals, and recommended actions.
4. Review the tool and runtime badges below the response.

**Notes:**
- **Callout 1** highlights the agent response and returned high-demand asset table.
- **Callout 2** highlights the runtime and tool evidence below the response.

In the current seeded dataset, the agent routes the request through the media signal and trend evidence path. The visible response lists concrete content assets, urgency scores, demand indicators, and operational next steps. This is the corrected experience: the answer is not a generic incomplete-context response; it is grounded in live trend, forecast, campaign, and capacity rows.

**Note:** Sample values may change after data refreshes or rebuilds. Verify live output before presenting, then explain the business takeaway.

This is the data point to emphasize during the demo. After reviewing the high-demand content assets, explain what the business can do next: adjust campaign investment, review rights or capacity constraints, prioritize audience engagement, or route a follow-up task to the correct operations team.

## Task 3: Review the agent action audit trail

Perform the following set of steps to show that AI actions do not disappear after the conversation. Operators, analysts, architects, and auditors can review what happened, which path was used, and how confident the system was.

1. Scroll to **Recent Agent Actions**.

    ![Recent Agent Actions audit trail after the high-demand content agent request](images/agent-action-audit-trail.png)

2. Review the newest action row.
3. Confirm that the row shows the latest **chat query** from the Ask button click before the authoritative Oracle audit feed refreshes.
4. Review the confidence value.

In the current app, Ask-template clicks immediately update **Recent Agent Actions** with the question that was asked, then the page refreshes from the Oracle-backed action feed. The governance point is that AI decisions remain observable after the conversation, with action history available for operators, managers, architects, and auditors.

**Note:** Sample values may change after data refreshes or rebuilds. Verify live output before presenting, then explain the business takeaway.

The business value is that teams can make decisions from connected, governed data while maintaining visibility into how AI recommendations are produced.

*You can move to the next scene.*

## Credits & Build Notes
- **Author** - Oracle LiveLabs Team
- **Last Updated By/Date** - Oracle LiveLabs Team, 2026-06-04
