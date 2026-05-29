# Scene 9 Ask Retail Data

## Introduction

**Ask Retail Data** helps business users ask retail questions in plain language without losing transparency. Users can inspect the generated SQL, run it against trusted Oracle data, and review the returned rows, which makes self-service analytics faster and easier to trust.

This is difficult to implement safely because natural-language data access can create governance risk. A language model may generate invalid SQL, reference the wrong tables, hide the logic behind an answer, or expose more data than the user should see. Retail teams need self-service analytics, but data teams still need traceability, read-only execution, and a clear source of truth.

Oracle AI Database helps address these challenges by keeping query execution grounded in the live retail schema. In this LiveStack Demo, the app sends the business question and schema context to the local Ollama runtime, validates the generated SQL path, and uses Oracle AI Database 26ai as the execution authority. The user can inspect generated SQL before execution, run the SQL to return rows, or use narrative modes when they want a summarized answer.

Estimated Time: 10 minutes

![Ask Retail Data workspace with modes and example question highlighted](images/ask-retail-data-overview.png)

### Objectives

In this scene, you will learn what retail decision the page supports, what evidence the user should inspect, and what action the business may take next.

## Task 1: Review the Ask Retail Data workspace

Review the workspace to show how business users can ask questions in plain language while still keeping the query path visible and controlled.

1. Click **Ask Retail Data** in the sidebar.
2. Review the runtime profile in the top right of the chat card. The current demo uses the local **llama3.2** runtime through the **SC_LLAMA_PROFILE** profile.
3. Review the four modes: **Narrate**, **Chat**, **Show SQL**, and **Run SQL**.
4. Review the example question tiles.
5. Focus on the **Signals** question: **Which demand signals mention damaged packaging or sizing complaints for hiking or footwear products?**

Use this page to show a balance: business users can ask questions in plain language, but the system still shows the query path and uses Oracle as the trusted data source.

## Task 2: Inspect generated SQL

![Generated SQL for the demand signal question](images/ask-retail-data-generated-sql.png)

Inspect the generated SQL to show that the answer is traceable. Even if the user does not read every line, the query can be reviewed instead of trusting a hidden AI response.

1. Click **Show SQL**.
2. Click **Ask** on **Which demand signals mention damaged packaging or sizing complaints for hiking or footwear products?**
3. Review the generated SQL.

The generated SQL searches across multiple signal sources and classifies matching rows as **Damaged packaging** or **Sizing complaint**. It uses Oracle SQL against retail signals, service-case records, evidence snippets, and product context. This is the governance moment in the scene: the business user can inspect the query path before asking the database to return rows.

The value is not only convenience. A merchandiser or operations analyst can get faster answers while still seeing the SQL and data rows behind the result.

## Task 3: Run the SQL and inspect the returned data

![Run SQL results for damaged packaging and sizing complaint signals](images/ask-retail-data-run-sql-results.png)

Run the SQL and inspect the returned rows to find concrete operational issues, such as damaged packaging, sizing complaints, return evidence, or product-level complaint patterns.

1. Click **Clear** if the generated SQL result is still visible.
2. Click **Run SQL**.
3. Click **Ask** on the same **Signals** question.
4. Review the returned table.
5. Focus on the first row: **RaceDay Docking Hub**.

In the current demo dataset, the question returns **25** rows. The first row is a **Service case** for **RaceDay Docking Hub** in the **Sports Tech** category. It is classified as **Damaged packaging**, has a signal strength of **209.97**, and includes evidence that the package is missing a charging cable and has a serial-number mismatch with the original outbound scan.

This is the data point to emphasize during the demo. The natural-language question surfaces a concrete operational issue that could matter to merchandising, fulfillment, and customer service: a product-level complaint signal points to packaging, accessories, and evidence quality.

A business user can discover the issue without writing SQL, while the SQL and database result remain visible for trust.

## Task 4: Explain the governance pattern

Explain the governance pattern as speed with control: the user asks in plain language, the system shows or runs SQL, Oracle returns trusted data, and the answer remains reviewable:

1. The user asks a retail question in plain English.
2. The app builds prompt and schema context for the selected runtime profile.
3. Ollama drafts SQL or a response plan.
4. Oracle AI Database executes the generated SQL against the live schema.
5. The UI returns either visible SQL, raw rows, or a narrated answer.

This pattern matters because retailers want faster answers, but they also need governed access. Ask Retail Data shows how natural-language analytics can be useful without hiding the query path or replacing the database as the trusted execution layer.

You can move to the next scene.

## Credits & Build Notes
- **Author** - Oracle LiveLabs Team
- **Last Updated By/Date** - Oracle LiveLabs Team, 2026-05-28
