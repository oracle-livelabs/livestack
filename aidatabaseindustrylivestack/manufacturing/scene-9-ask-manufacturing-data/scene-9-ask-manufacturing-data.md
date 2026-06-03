# Scene 9 Ask Manufacturing Data

## Introduction

A manufacturing business analyst, operations leader, plant manager, production supervisor, quality engineer, maintenance planner, or data steward uses this page when they need an answer before a custom report can be built. The persona may understand the production question clearly but not know the exact schema, joins, filters, or SQL required to answer it.

Natural-language data access can create governance risk if the language model generates invalid SQL, references the wrong tables, hides the query path, or exposes more data than the user should see. Manufacturing teams need self-service analytics, but data teams still need traceability, read-only execution, and a clear source of truth.

Oracle AI Database helps address these challenges by keeping query execution grounded in the live manufacturing schema. In this LiveStack Demo, the app sends the question and schema context to the local Ollama runtime, validates the generated SQL path, and uses Oracle AI Database 26ai as the execution authority.

Estimated Time: 10 minutes

![Ask Manufacturing Data workspace with modes, schema metadata, and example questions](images/scene-9-ask-manufacturing-data.png)

### Objectives

In this scene, you will:
- Review the **Ask Manufacturing Data** workspace, runtime profile, and modes.
- Compare **Explain**, **Chat**, **Show SQL**, and **Run SQL** against the same manufacturing question.
- Use **Explain** to return a plain-English answer without foregrounding SQL.
- Use **Chat** to return a conversational answer with follow-up prompts.
- Use **Show SQL** to inspect generated SQL before execution.
- Use **Run SQL** to return live rows from Oracle AI Database.
- Explore a production-risk graph question grounded in AX-400 recovery evidence.
- Understand how natural-language analytics can remain transparent and database-governed.

## Task 1: Use Explain mode for a narrated answer

1. Click **Ask Manufacturing Data** in the sidebar.
2. Review the runtime profile in the top right of the assistant card. The current demo uses **llama3.2** through the local Ollama runtime.
3. Review the queryable schema summary. The current page shows **8** domains and **26** queryable objects.
4. Click **Explain**.
5. Click **Ask** on the **Production Risk Graph** question: **Which production-risk graph findings have the highest risk score?**

    ![Explain mode response for the manufacturing production-risk graph question](images/ask-manufacturing-data-explain-mode.png)

Expected result: The assistant returns a narrated answer and key findings without making the generated SQL the main artifact. Use this mode when the user wants a business-readable answer first. The system still uses governed SQL behind the scenes, but the presentation is optimized for a plant manager, production supervisor, or operations analyst.

## Task 2: Use Chat mode for a conversational answer

1. Click **Clear** if the Explain result is still visible.
2. Click **Chat**.
3. Click **Ask** on the same **Production Risk Graph** question.

    ![Chat mode response for the manufacturing production-risk graph question](images/ask-manufacturing-data-chat-mode.png)

Expected result: The assistant returns a conversational response and follow-up prompts. Use this mode when the user is exploring the data interactively. Chat mode keeps the answer grounded in the live manufacturing schema, but it is shaped for follow-up questions such as breaking the result down by work order, supplier, production line, or risk case.

## Task 3: Use Show SQL mode to inspect the query path

1. Click **Clear** if the Chat result is still visible.
2. Click **Show SQL**.
3. Click **Ask** on the same **Production Risk Graph** question.

    ![Generated SQL for the manufacturing production-risk graph question](images/ask-manufacturing-data-generated-sql.png)

4. Review the generated SQL.

The generated SQL reads from `manufacturing_graph_production_findings`, orders by `risk_score DESC NULLS LAST`, then by graph depth and finding type, and limits the result with `FETCH FIRST 5 ROWS ONLY`. This is the governance moment in the scene: the user can inspect the query path before asking the database to return rows.

Use this mode when the user, data steward, or technical reviewer wants to verify what will run before rows are returned. The language model proposes the SQL, but the query path remains visible and reviewable.

## Task 4: Use Run SQL mode to inspect returned rows

1. Click **Clear** if the generated SQL result is still visible.
2. Click **Run SQL**.
3. Click **Ask** on the same **Production Risk Graph** question.

    ![Run SQL results for the manufacturing production-risk graph question](images/ask-manufacturing-data-run-sql-results.png)

4. Review the returned table.

In the current demo dataset, the question returns **5** rows. The top risk findings are tied to **CircuitForge Electronics Supplier Desk**, **Servo Drive Controller PCB Rev C**, **WO-4501 - AX-400 Servo Drive Build**, **Central Production Scheduling Team**, and **Line A - Servo Drive Assembly**, each with a **97.4** risk score and case-evidence recommendations.

This is the data point to emphasize during the demo. A plain-English question surfaces specific operating risk by supplier, material, work order, scheduling team, production line, score, and recommended action. The business user can discover the issue without writing SQL, while the SQL and database result remain visible for trust.

Use the four completed mode examples to explain the governance pattern behind the page:

1. The user asks a manufacturing question in plain English.
2. The app builds prompt and schema context for the selected runtime profile.
3. Ollama drafts SQL or a response plan.
4. Oracle AI Database executes authorized SQL against the live schema.
5. The UI returns visible SQL, rows, or a narrated answer depending on the selected mode.

This pattern matters because manufacturing users want faster answers, but they also need governed access. Ask Manufacturing Data shows how natural-language analytics can support self-service exploration without hiding the query path or replacing the database as the trusted execution layer.

You can move to the next scene.

## Credits & Build Notes
- **Author** - Oracle LiveLabs Team
- **Last Updated By/Date** - Oracle LiveLabs Team, 2026-06-02
- **Screenshot source** - Captured from `http://143.47.191.163:8505/`.
