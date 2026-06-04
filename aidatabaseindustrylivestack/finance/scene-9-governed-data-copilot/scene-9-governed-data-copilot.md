# Scene 9 Governed Data Copilot

## Introduction

**Ask Seer Bank Data** helps business users ask finance questions in plain language while keeping the answer path visible. Users can inspect generated SQL, run it against governed Oracle data, and review the returned rows, making self-service analytics faster and easier to trust.

Finance teams struggle when the information needed for one decision lives in separate tools. That separation slows action, increases reconciliation work, and makes it harder to trust the result.

**Oracle AI Database** helps address these challenges by keeping query execution grounded in the live finance schema. In this LiveStack Demo, the app sends the business question and schema context to the local Ollama runtime, validates the generated SQL path, and uses Oracle AI Database 26ai as the execution authority. The user can inspect generated SQL before execution, run the SQL to return rows, or use narrative modes when they want a summarized answer.

Estimated Time: **10 minutes**

![Governed Data Copilot workspace with modes and finance question examples highlighted](images/ask-seer-bank-data-overview.png)

### Objectives

In this scene, you will learn what finance decision the page supports, what evidence the user should inspect, and what action the business may take next.

## Task 1: Review the Governed Data Copilot workspace

Perform the following set of steps to show how business users can ask questions in plain language while still keeping the query path visible and controlled.

1. Click **Governed Data Copilot** in the sidebar.
2. Review the runtime profile in the top right of the chat card. The current demo uses the local **llama3.2** runtime through the **SC_LLAMA_PROFILE** profile.
3. Review the four modes: **Explain**, **Chat**, **Show SQL**, and **Run SQL**.
4. Review the example question tiles.
5. Focus on the **Signals** question: **Which fraud and Anti-Money Laundering (AML) signals are driving the most Seer Bank transaction exposure?**

Use this page to show a balance: business users can ask questions in plain language, but the system still shows the query path and uses Oracle as the trusted data source.

## Task 2: Inspect generated SQL

![Generated SQL for the fraud and AML exposure question](images/ask-seer-bank-data-generated-sql.png)

Perform the following set of steps to show that the answer is traceable. Even if the user does not read every line, the query can be reviewed instead of trusting a hidden AI response.

1. Click **Show SQL**.
2. Click **Ask** on **Which fraud and Anti-Money Laundering (AML) signals are driving the most Seer Bank transaction exposure?**
3. Review the generated SQL.

The generated SQL searches authorized risk-signal data, joins monitoring sources to signal evidence, classifies risk severity, counts signal-linked transactions, sums signal-linked value, and calculates an AI risk score. This is the governance moment in the scene: the business user can inspect the query path before asking the database to return rows.

The value is not only convenience. A finance analyst can get faster answers while still seeing the SQL and data rows behind the result.

## Task 3: Run the SQL and inspect the returned data

![Run SQL results for fraud and AML exposure signals](images/ask-seer-bank-data-run-sql-results.png)

Perform the following set of steps to identify concrete revenue patterns that may matter to product management, finance operations, service planning, or reporting.

1. Click **Clear** if the generated SQL result is still visible.
2. Click **Run SQL**.
3. Click **Ask** on the same fraud and AML exposure question.
4. Review the returned table.
5. Focus on the first row: **Fraud Detection Pipeline 13**.

In the current demo dataset, the question returns **5** rows. The first row is **Fraud Detection Pipeline 13** on the **tiktok** monitoring channel, classified as **Elevated**, linked to **3** transactions, with about **$17.5K** signal-linked value and an AI risk score of **63.9**. Other visible rows include **Market Activity Monitor - Payments 04** and **Regulatory Intelligence Stream - FDIC 05**.

**Note:** Sample values may change after data refreshes or rebuilds. Verify live output before presenting, then explain the business takeaway.

This is the data point to emphasize during the demo. The natural-language question surfaces concrete fraud and AML monitoring sources tied to transaction exposure. A business user can discover the exposure pattern without writing SQL, while the SQL and database result remain visible for trust.

## Task 4: Explain the governance pattern

Explain the governance pattern as speed with control: the user asks in plain language, the system shows or runs SQL, Oracle returns trusted data, and the answer remains reviewable.

1. The user asks a finance question in plain English.
2. The app builds prompt and schema context for the selected runtime profile.
3. Ollama drafts SQL or a response plan.
4. Oracle AI Database executes the generated SQL against the live schema.
5. The UI returns either visible SQL, raw rows, or a narrated answer.

This pattern matters because financial institutions want faster answers, but they also need governed access. Governed Data Copilot shows how natural-language analytics can be useful without hiding the query path or replacing the database as the trusted execution layer.

*You can move to the next scene.*

## Credits & Build Notes
- **Author** - Oracle LiveLabs Team
- **Last Updated By/Date** - Oracle LiveLabs Team, 2026-05-28
