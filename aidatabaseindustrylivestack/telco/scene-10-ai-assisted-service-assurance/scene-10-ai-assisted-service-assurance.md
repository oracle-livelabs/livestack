# Scene 10 AI-Assisted Service Assurance

## Introduction

**AI-Assisted Service Assurance** shows how an AI assistant can support telecom operations without becoming a black box. When an agent helps with network access, subscriber operations, signal analysis, or field capacity, users need to see the routing decision, tools used, data returned, confidence, and audit record.

Telecom teams struggle when the information needed for one service-assurance decision lives in separate OSS, BSS, care, NOC, field, and analytics tools. That separation slows action, increases reconciliation work, and makes it harder to trust the result.

Oracle AI Database helps address these challenges by keeping the source data, SQL execution, PL/SQL tools, and durable action logging in the database. In this LiveStack Demo, the app orchestrates the agent workflow, Ollama provides reasoning, and Oracle AI Database 26ai executes the governed data operations. Agent actions are written back to `agent_actions`, while the UI shows the response, tool badges, and recent audit trail.

Estimated Time: **10 minutes**

![AI-Assisted Service Assurance console with runtime profile, examples, and recent actions](images/ai-assisted-service-assurance.png)

### Objectives

In this scene, you will learn what telecom decision the page supports, what evidence the user should inspect, and what action the team may take next.

## Task 1: Review the agent console workspace

![AI-Assisted Service Assurance workspace](images/agent-console-workspace.png)

Review the agent console as an operational workspace. The user should notice the runtime profile, example questions, specialist routing, recent interventions, tool badges, and confidence information before running an agent task.

1. Click **AI-Assisted Service Assurance** in the sidebar.
2. Review the runtime profile selector in the top right. The current demo uses **llama3.2** through an Ollama-backed runtime profile.
3. Review the example questions in the chat panel.
4. Review **Recent AI-Assisted Interventions** below the chat panel.
5. Focus on a capacity example such as **Check capacity for 5G Unlimited Mobile Plan** or **Which telecom services have low capacity?**

Use this opening view to explain that the page is an operational agent console. The user can see routing, tools, results, confidence, and action history, not just a chat response.

## Task 2: Run a network access capacity question

![Network access capacity question tiles](images/capacity-question-tile.png)

Run a network access capacity question to show how the agent identifies capacity across network sites, connects the answer to a telecom service under demand pressure, and exposes the tool path behind the result.

1. Click **Ask** on **Which telecom services have low capacity?** or enter **Check capacity for Fixed Wireless Home Internet**.
2. Review the agent response at the top of the chat output.
3. Review the capacity or site list returned by the agent.
4. Review the tool badges below the response.

After showing the capacity response, explain what the business can decide: review site capacity, rebalance dispatch, prepare field support, or trigger customer outreach.

In the current demo dataset, the capacity question for **Fixed Wireless Home Internet** routes to the **Network Access Agent** path and returns capacity across **11** centers with **1,911** total units. The response identifies lower-capacity sites such as **Chicago Midwest NOC**, **Miami Connected Life Hub**, **Boston Family Plan Support Center**, and **Seattle Customer Experience Center**.

**Note:** These are sample values from the current demo dataset and may change after a refresh, seed update, or custom dataset import. Treat these numbers as an example of the current operating pattern. Verify the live values in the UI before presenting, then explain the business takeaway: what demand, subscriber impact, capacity, revenue, dispatch, or risk pattern the values reveal.

## Task 3: Interpret the operational story

Interpret the capacity result as an operational visibility story: teams can compare available capacity, reserved quantities, demand pressure, and possible actions such as field dispatch, capacity relief, or customer outreach.

1. The service request narrows the search to a telecom service.
2. Oracle data identifies network sites with available capacity.
3. The agent summarizes center-level capacity and reserved quantities.
4. The business user can compare whether capacity is deep enough to support the demand story from earlier scenes.
5. The audit trail records that the question was handled by the appropriate agent path.

The important story is operational visibility: teams can see whether capacity exists, whether reserved quantities matter, and whether the demand-surge story should trigger field dispatch, capacity relief, or customer outreach.

## Task 4: Review the agent action audit trail

![Recent AI-assisted interventions audit trail](images/recent-agent-actions.png)

Review the audit trail to show that AI-assisted actions do not disappear after the conversation. Operators, architects, and auditors can review what the agent did, which path it used, and how confident the system was.

1. Scroll to **Recent AI-Assisted Interventions**.
2. Review the top action row.
3. Confirm that the row shows a completed chat query routed to a specialist agent path.
4. Review the confidence value.

In the current demo dataset, the completed chat action is logged with **90%** confidence. This is the governance point of the scene: agent decisions should be observable after the conversation. The page shows that agent interactions are not just transient chat messages. They are written into the action history so an operator, architect, or auditor can understand what happened.

**Note:** These are sample values from the current demo dataset and may change after a refresh, seed update, or custom dataset import. Treat these numbers as an example of the current operating pattern. Verify the live values in the UI before presenting, then explain the business takeaway: what demand, subscriber impact, capacity, revenue, dispatch, or risk pattern the values reveal.

The business value is that teams can make the decision from connected, governed data. Oracle AI Database provides the shared foundation that keeps operational data, analytics, and AI workflows aligned.

**Congratulations! You have completed the LiveStack demo!** 

The walkthrough showed how connected telecom data can support demand detection, subscriber signal triage, impact investigation, field capacity planning, service-order visibility, predictive assurance, governed data access, and AI-assisted action.

## Credits & Build Notes
- **Author** - Oracle LiveLabs Team
- **Last Updated By/Date** - Oracle LiveLabs Team, 2026-05-28
