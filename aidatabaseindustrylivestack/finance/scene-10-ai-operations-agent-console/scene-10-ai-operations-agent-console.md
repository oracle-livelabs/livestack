# Scene 10 AI Operations Agent Console

## Introduction

A finance operations leader, compliance manager, client-service lead, or AI platform owner uses this page to see how agentic assistance can support day-to-day financial services decisions. This persona is not only interested in whether an AI agent can answer a question. They need to know which team handled the request, which tools were called, what data was used, whether fallback behavior occurred, and whether the action was recorded for later review.

This is difficult to implement when AI agents operate as black boxes outside the operational data platform. Finance teams may get a recommendation, but not the routing decision, SQL or PL/SQL tool path, confidence, or audit record behind it. That makes it hard to trust agent output in compliance, service coverage, revenue, transaction, or risk workflows.

Oracle AI Database helps address these challenges by keeping the source data, SQL execution, PL/SQL tools, and durable action logging in the database. In this LiveStack Demo, the app orchestrates the agent workflow, Ollama provides reasoning, and Oracle AI Database 26ai executes the governed data operations. Agent actions are written back to `agent_actions`, while the UI shows the response, tool badges, and recent audit trail.

Estimated Time: 10 minutes

![AI Operations Agent Console overview with runtime profile, examples, and recent actions highlighted](images/agent-console-overview.png)

### Objectives

In this scene, you will:
- Review the **AI Operations Agent Console** workspace and runtime profile.
- Select a concrete fraud and Anti-Money Laundering (AML) signal-severity agent question.
- Inspect the agent response, result table, and SQL/PLSQL tool badges.
- Review the **Recent Agent Actions** audit trail.
- Understand why observable agent behavior matters for enterprise finance workflows.

## Task 1: Review the agent console workspace

1. Click **AI Operations Agent Console** in the sidebar.
2. Review the runtime profile selector in the top right. The current demo uses **llama3.2** through an Ollama-backed runtime profile.
3. Review the example questions in the chat panel.
4. Review **Recent Agent Actions** below the chat panel.
5. Focus on the fraud and AML example: **Which Seer financial products have the highest fraud and Anti-Money Laundering (AML) signal severity?**

Use this opening view to explain the role of the page. The user is not looking at a generic chatbot. They are looking at an operational agent surface where finance questions are routed to specialist teams such as market and compliance, client service routing, or transaction revenue.

## Task 2: Run the fraud and AML signal-severity agent question

![Fraud and AML signal-severity agent response with tool badges highlighted](images/agent-fraud-aml-severity-response.png)

1. Click **Ask** on **Which Seer financial products have the highest fraud and Anti-Money Laundering (AML) signal severity?**
2. Review the agent response at the top of the chat output.
3. Review the returned product table.
4. Review the tool badges below the result.

In the current demo dataset, the agent routes the request to the **SOCIAL_TREND_TEAM** with intent **trends** and returns **10** critical financial products from the last 48 hours. The top results include **Pension Liability Review** from **Continuity Risk Advisors**, **Home Equity Line of Credit Series B** from **Meridian Trust Bank**, **Priority Service Desk** from **PrimeCard Services**, and **Fraud Monitoring Add-On** from **Clearwater Credit Union**. These rows show critical risk severity, exposure, and severity-band context.

This is the data point to emphasize during the demo. The agent did more than answer a text question. It routed the request to a specialist team, called an approved risk-signal tool, returned structured Oracle-backed rows, and exposed tool badges such as **Ollama llama3.2** and **risk_signal_detector**.

## Task 3: Interpret the operational story

Use the fraud and AML signal-severity result to explain the decision:

1. The question creates a fraud, AML, compliance, and product-risk intent.
2. The app routes the request to the market and compliance agent path.
3. Oracle-backed tools identify financial products with severe risk signals.
4. The response returns product, institution, category, risk event, severity, exposure, and severity-band context.
5. The tool badges show whether the reasoning runtime or database-backed tool path completed the work.

The important story is observability. In the current run, the Ollama runtime is shown as a fallback path while **risk_signal_detector** succeeds. A finance user can still receive governed Oracle-backed evidence and see which tool produced the result.

## Task 4: Review the agent action audit trail

![Recent Agent Actions audit trail with fraud and AML chat query highlighted](images/agent-action-audit-trail.png)

1. Scroll to **Recent Agent Actions**.
2. Review the top action row.
3. Confirm that the row shows a completed **chat query** routed to a specialist finance agent team, such as **SOCIAL_TREND_TEAM** for risk signals or **FULFILLMENT_TEAM** for client service routing.
4. Review the confidence value.

In the current demo dataset, the completed chat action is logged with **90%** confidence. This is the governance point of the scene: agent decisions should be observable after the conversation. The page shows that agent interactions are not just transient chat messages. They are written into the action history so an operator, architect, or auditor can understand what happened.

The value of Oracle AI Database is that the agent workflow stays connected to governed operational data. The AI runtime can reason and orchestrate, while Oracle remains responsible for data access, SQL and PL/SQL execution, spatial calculations, and durable audit records.

You can move to the next scene.

## Credits & Build Notes
- **Author** - Oracle LiveLabs Team
- **Last Updated By/Date** - Oracle LiveLabs Team, 2026-05-28
