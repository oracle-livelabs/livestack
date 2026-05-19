# Scene 10 AI Agent Console

## Introduction

The AI Agent Console demonstrates application-layer agents that use Oracle SQL, PL/SQL tools, vector retrieval, in-database scoring, and JSON audit events to support product operations.

Estimated Time: 8 minutes

![AI Agent Console rendered in the LiveStack app](images/scene-10-ai-agent-console.png)

### Objectives

In this lab, you will:
- Review available agent teams and runtime profile controls.
- Ask agent questions about buyer signals, availability, and product operations.
- Inspect recent agent actions and the audited event stream.

## Task 1: Review Agent Runtime Context

1. Open **AI Agent Console** from the left navigation.
2. Review the Oracle internals panel for Ollama Runtime, Oracle SQL / PL/SQL Tools, Application Orchestration, agent_actions, event_stream, Vector RAG Retrieval, and In-DB ML Scoring.
3. Inspect the runtime profile selector and recent actions table.

Expected result:
- The console shows how agent behavior is grounded in explicit database tools and audited records.
- The presenter can explain the three agent teams: Signal Agent, Product Availability Agent, and Product Operations Agent.

## Task 2: Ask an Agent Question

1. Select an example question or type a question about trending products, capacity risk, or operations response.
2. Click **Ask** or **Send**.
3. Review the response and compare it with the recent action log.

Expected result:
- When Ollama and the database are connected, the agent produces a grounded answer and records actions or events.
- The action log provides an audit trail for decisions made through the agent workflow.

## Task 3: Why this matters?

Agentic workflows need grounding and traceability. This scene shows how Seer Tech can let AI assist product operations while keeping data access, tools, and decisions tied to Oracle-backed audit evidence.

## Credits & Build Notes
- **Author** - Oracle LiveStack Team
- **Last Updated By/Date** - Oracle LiveStack Team, 2026-05-13
- **Source Bundle** - `livestack-hightech.zip`
