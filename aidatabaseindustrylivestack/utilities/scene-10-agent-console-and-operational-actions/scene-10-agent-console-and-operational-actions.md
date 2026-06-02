# Scene 10 Utilities AI Agent Console

## Introduction

**Utilities AI Agent Console** shows how AI assistance can support operational decisions without becoming a black box. When an agent helps with outage signals, field crew logistics, service requests, or capacity planning, users need to see the specialist path, tools used, data returned, confidence, fallback status, and audit record.

Utility teams struggle when the information needed for one decision lives in separate tools. That separation slows action, increases reconciliation work, and makes it harder to trust the result.

**Oracle AI Database** helps address these challenges by keeping the source data, SQL execution, PL/SQL tools, graph and spatial context, in-database analytics, and durable action logging connected to the same governed utility data foundation. In this LiveStack Demo, the app orchestrates the agent workflow, Ollama provides reasoning, and **Oracle AI Database 26ai** executes the governed data operations.

Estimated Time: **10 minutes**

![Agent Console page showing agent runtime, chat, workflow diagram, and action audit controls.](images/scene-10-agent-console.png)

### Objectives

In this scene, you will learn what utility decision the page supports, what evidence the user should inspect, and what action the team may take next.

## Task 1: Review the agent console workspace

Review the agent console as an operational workspace. The user should notice the runtime profile, example questions, specialist routing, recent actions, confidence information, and fallback context before running an agent task.

1. Click **Agent Console** in the sidebar.
2. Review the runtime profile selector. The captured hosted demo uses **llama3.2** through Ollama-backed reasoning.
3. Review the example questions in the agent workspace.
4. Review **Recent Agent Actions** below the workspace.
5. Focus on a logistics or outage-response question, such as a question about the nearest field crew logistics sites, critical outage signals, or demand-risk follow-up.

Use this opening view to explain that the page is an operational agent console. The user can see routing, tools, results, confidence, fallback status, and action history, not just a chat response.

## Task 2: Run a utility operations agent question

Perform the following set of steps to show how the agent identifies field crew or restoration support while exposing the data, tool path, runtime status, and fallback context behind the answer.

1. Type or select an example question that asks the agent to find field crew or restoration support for a utility service area.
2. Click **Send**.
3. Review the agent response at the top of the chat output.
4. Review any returned table, site list, tool badge, runtime badge, or fallback status.

    ![Utilities AI Agent Console response with field crew logistics site table](images/agent-utility-operations-response.png)

In the captured hosted app, use the displayed values as an example of the current operating picture. Before presenting, verify the live values, then explain what the pattern shows about demand, reliability pressure, capacity, or field response needs.

If the runtime shows a timeout or fallback, use it as an observability example: the operator can see whether the answer came from a complete tool path or from fallback behavior.

## Task 3: Review the agent action audit trail

Perform the following set of steps to show that AI-assisted actions do not disappear after the conversation. Operators, supervisors, architects, and auditors can review what the agent did, which route it used, and how confident the system was.

1. Scroll to **Recent Agent Actions**.
2. Review the newest action row when the action list is populated.
3. Confirm that the row captures the agent action type, operational intent, confidence, and related evidence.
4. Compare the visible action trail with the Oracle Internals diagram.

    ![Recent Agent Actions audit trail after the field crew logistics agent request](images/agent-action-audit-trail.png)

The governance point is that agent decisions should remain observable after the conversation, with action history available for incident review, customer follow-up, regulatory response, and continuous improvement.

The business value is that teams can make the decision from connected, governed data. **Oracle AI Database** provides the shared foundation that keeps operational data, analytics, and AI workflows aligned.

*You can move to the next scene.*

## Credits & Build Notes
- **Author** - Oracle LiveLabs Team
- **Last Updated By/Date** - Oracle LiveLabs Team, 2026-05-26
