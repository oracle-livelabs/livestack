# Scene 9 Ask Telecom Operations Data

## Introduction

A telecom business analyst, network operations lead, care operations analyst, or service assurance manager uses this page when they need an answer before a custom report can be built. This persona may know the business question clearly, but not the exact schema, joins, filters, or SQL needed to answer it.

This is difficult to implement safely because natural-language data access can create governance risk. A language model may generate invalid SQL, reference the wrong tables, hide the logic behind an answer, or expose more data than the user should see. Telecom teams need self-service analytics, but data teams still need traceability, read-only execution, and a clear source of truth.

Oracle AI Database helps address these challenges by keeping query execution grounded in the live telecom schema. In this LiveStack Demo, the app sends the business question and schema context to the local Ollama runtime, validates the generated SQL path, and uses Oracle AI Database 26ai as the execution authority. The user can inspect generated SQL before execution, run the SQL to return rows, or use narrative modes when they want a summarized answer.

Estimated Time: 10 minutes

![Ask Telecom Operations Data workspace with modes and example questions](images/ask-telecom-operations-data.png)

### Objectives

In this scene, you will:
- Review the **Ask Telecom Operations Data** workspace, runtime profile, and query modes.
- Use **Show SQL** to inspect generated SQL before execution.
- Use **Run SQL** to return live rows from Oracle AI Database.
- Explore a specific data point about service revenue, high-urgency subscriber signals, or network-site capacity.
- Understand how natural-language access can remain transparent and database-governed.

## Task 1: Review the Ask Telecom Operations Data workspace

![Ask Data modes and example questions](images/ask-data-modes-and-examples.png)

1. Click **Ask Telecom Operations Data** in the sidebar.
2. Review the runtime profile in the top right of the chat card. The current demo uses the local **llama3.2** runtime through the **SC_LLAMA_PROFILE** profile.
3. Review the four modes: **Narrate**, **Chat**, **Show SQL**, and **Run SQL**.
4. Review the example question tiles.
5. Focus on a concrete question such as **What are the top 5 telecom services by service revenue?** or **How many subscriber signals have urgency score above 80?**

Use this page to explain the balance between business access and technical governance. The user starts with plain English, but the system still exposes SQL and keeps Oracle as the execution engine.

## Task 2: Inspect generated SQL

![Show SQL mode button](images/show-sql-mode.png)

1. Click **Show SQL**.
2. Click **Ask** on **What are the top 5 telecom services by service revenue?**
3. Review the generated SQL.

The generated SQL joins telecom service and service-order data to answer a business question. This is the governance moment in the scene: the business user can inspect the query path before asking the database to return rows.

The value is not only convenience. The page makes the generated SQL visible, uses read-only query execution, and keeps the answer grounded in Oracle data rather than treating the language model response as the source of truth.

## Task 3: Run SQL and inspect returned data

![Run SQL mode button](images/run-sql-mode.png)

1. Click **Clear** if the generated SQL result is still visible.
2. Click **Run SQL**.
3. Click **Ask** on the same service revenue question.
4. Review the returned table.

This is the data point to emphasize during the demo. The natural-language question surfaces a concrete telecom operations answer from live service-order data. A business user can discover which services contribute most to revenue without writing SQL, while the SQL and database result remain visible for trust.

## Task 4: Explain the governance pattern

Use the completed query to explain the pattern behind the page:

1. The user asks a telecom operations question in plain English.
2. The app builds prompt and schema context for the selected runtime profile.
3. Ollama drafts SQL or a response plan.
4. Oracle AI Database executes the generated SQL against the live schema.
5. The UI returns either visible SQL, raw rows, or a narrated answer.

This pattern matters because communications providers want faster answers, but they also need governed access. Ask Telecom Operations Data shows how natural-language analytics can be useful without hiding the query path or replacing the database as the trusted execution layer.

You can move to the next scene.

## Credits & Build Notes
- **Author** - Oracle LiveLabs Team
- **Last Updated By/Date** - Oracle LiveLabs Team, 2026-05-28
