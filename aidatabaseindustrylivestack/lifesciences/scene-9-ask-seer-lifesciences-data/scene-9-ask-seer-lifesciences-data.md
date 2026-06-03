# Scene 9 Ask Seer Regulated Supply Data

## Introduction

**Ask Seer Regulated Supply Data** helps business users ask clinical supply and quality questions in plain language while keeping the query path visible. Users can inspect generated SQL, run it against trusted Oracle data, and review the returned rows, which makes self-service analytics faster without turning the answer into a black box.

Natural-language data access is difficult to implement safely because it can create governance risk. A language model may generate invalid SQL, reference the wrong tables, hide the logic behind an answer, or expose more data than the user should see.

Life sciences teams need self-service analytics, but data teams still need traceability, read-only execution, and a clear source of truth. **Oracle AI Database** helps address that challenge by grounding query execution in the live regulated supply schema.

In this LiveStack demo, the app sends the business question and schema context to the local reasoning runtime, validates the generated SQL path, and uses Oracle AI Database 26ai as the execution authority. The user can inspect generated SQL before execution, run the SQL to return rows, or use narrative modes when a summarized answer is more useful.

Estimated Time: **10 minutes**

![Ask Seer Regulated Supply Data workspace with modes, schema context, and example questions highlighted](images/ask-data.png)

### Objectives

In this scene, you will learn what life sciences decision natural-language analytics supports, what evidence the user should inspect, and what action the team may take next.

## Task 1: Review the Ask Seer Regulated Supply Data workspace

![Ask Data workspace with mode buttons, semantic schema, and example question tiles highlighted](images/ask-data.png)

Perform the following set of steps to review the workspace and show how business users can ask questions in plain language while keeping the query path visible and controlled.

1. Click **Ask Seer Regulated Supply Data** in the sidebar.
2. Review the runtime profile in the top right of the chat card. The current demo uses the local **llama3.2** runtime.
3. Review the four modes: **Explain**, **Chat**, **Show SQL**, and **Run SQL**.
4. Review the queryable Life Sciences schema panel.
5. Focus on the **Supply Exposure** question: **Show clinical supply exposure by regulated product category.**

Use this page to show the balance between speed and control: business users can ask questions in plain language, but the system still shows the query path and uses Oracle as the trusted data source.

## Task 2: Inspect generated SQL

![Generated SQL for clinical supply exposure by regulated product category](images/ask-data-generated-sql.png)

Perform the following set of steps to inspect the generated SQL and show that the answer is traceable.

1. Click **Show SQL**.
2. Enter **Show clinical supply exposure by regulated product category.**
3. Click **Send**.
4. Review the generated SQL.

The generated SQL groups clinical supply orders by regulated product category and calculates clinical supply exposure. This is the governance moment in the scene because the business user can inspect the query path before asking the database to return rows.

The value is not only convenience. A clinical supply or quality analyst can get faster answers while still seeing the SQL and data rows behind the result.

## Task 3: Run the SQL and inspect the returned data

![Run SQL results for clinical supply exposure by regulated product category](images/ask-data-run-sql-results.png)

Perform the following set of steps to run the SQL and inspect the returned rows for concrete exposure patterns across regulated product categories.

1. Click **Clear** if the generated SQL result is still visible.
2. Click **Run SQL**.
3. Enter **Show clinical supply exposure by regulated product category.**
4. Click **Send**.
5. Review the returned table.
6. Focus on the first row: **Cell and Gene Therapy**.

In the current demo dataset, the question returns **22** rows. The first row shows **Cell and Gene Therapy** with **406** clinical supply orders and **$25,313,800** in clinical supply exposure.

This is the data point to emphasize during the demo. The natural-language question surfaces a concrete regulated supply exposure pattern that could matter to clinical supply, quality, manufacturing, and executive operations teams.

**Note:** Sample values may change after data refreshes or rebuilds. Verify live output before presenting, then explain the business takeaway.

## Task 4: Explain the governance pattern

![Ask Data generated SQL and query controls highlighted](images/ask-data-generated-sql.png)

Perform the following set of steps to explain the governance pattern as speed with control, with the answer remaining visible and reviewable:

1. The user asks a regulated supply question in plain English.
2. The app builds prompt and schema context for the selected runtime profile.
3. The local reasoning runtime drafts SQL or a response plan.
4. Oracle AI Database executes the generated SQL against the live schema.
5. The UI returns either visible SQL, raw rows, or a narrated answer.

This pattern matters because regulated organizations want faster answers, but they also need governed access. Ask Seer Regulated Supply Data shows how natural-language analytics can be useful without hiding the query path or replacing the database as the trusted execution layer.

*You can move to the next scene.*

## Credits & Build Notes
- **Author** - Oracle LiveLabs Team
- **Last Updated By/Date** - Oracle LiveLabs Team, 2026-05-29
