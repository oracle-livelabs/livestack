# Scene 9 Ask Retail Data

## Introduction

A retail business analyst, merchandising operations lead, customer service analyst, or store operations manager uses this page when they need an answer before a custom report can be built. This persona may know the business question clearly, but not the exact schema, joins, filters, or SQL needed to answer it.

This is difficult to implement safely because natural-language data access can create governance risk. A language model may generate invalid SQL, reference the wrong tables, hide the logic behind an answer, or expose more data than the user should see. Retail teams need self-service analytics, but data teams still need traceability, read-only execution, and a clear source of truth.

Oracle AI Database helps address these challenges by keeping query execution grounded in the live retail schema. In this LiveStack Demo, the app sends the business question and schema context to the local Ollama runtime, validates the generated SQL path, and uses Oracle AI Database 26ai as the execution authority. The user can inspect generated SQL before execution, run the SQL to return rows, or use narrative modes when they want a summarized answer.

Estimated Time: 10 minutes

![Ask Retail Data workspace with modes and example question highlighted](images/ask-retail-data-overview.png)

### Objectives

In this scene, you will:
- Review the **Ask Retail Data** workspace, runtime profile, and query modes.
- Use **Show SQL** to inspect generated SQL before execution.
- Use **Run SQL** to return live rows from Oracle AI Database.
- Explore a specific data point about damaged packaging and sizing complaint signals for hiking and footwear products.
- Understand how natural-language access can remain transparent and database-governed.

## Task 1: Review the Ask Retail Data workspace

1. Click **Ask Retail Data** in the sidebar.
2. Review the runtime profile in the top right of the chat card. The current demo uses the local **llama3.2** runtime through the **SC_LLAMA_PROFILE** profile.
3. Review the four modes: **Narrate**, **Chat**, **Show SQL**, and **Run SQL**.
4. Review the example question tiles.
5. Focus on the **Signals** question: **Which demand signals mention damaged packaging or sizing complaints for hiking or footwear products?**

Use this page to explain the balance between business access and technical governance. The user starts with plain English, but the system still exposes SQL and keeps Oracle as the execution engine.

## Task 2: Inspect generated SQL

![Generated SQL for the demand signal question](images/ask-retail-data-generated-sql.png)

1. Click **Show SQL**.
2. Click **Ask** on **Which demand signals mention damaged packaging or sizing complaints for hiking or footwear products?**
3. Review the generated SQL.

The generated SQL searches across multiple signal sources and classifies matching rows as **Damaged packaging** or **Sizing complaint**. It uses Oracle SQL against retail signals, service-case records, evidence snippets, and product context. This is the governance moment in the scene: the business user can inspect the query path before asking the database to return rows.

The value is not only convenience. The page makes the generated SQL visible, uses read-only query execution, and keeps the answer grounded in Oracle data rather than treating the language model response as the source of truth.

## Task 3: Run the SQL and inspect the returned data

![Run SQL results for damaged packaging and sizing complaint signals](images/ask-retail-data-run-sql-results.png)

1. Click **Clear** if the generated SQL result is still visible.
2. Click **Run SQL**.
3. Click **Ask** on the same **Signals** question.
4. Review the returned table.
5. Focus on the first row: **RaceDay Docking Hub**.

In the current demo dataset, the question returns **25** rows. The first row is a **Service case** for **RaceDay Docking Hub** in the **Sports Tech** category. It is classified as **Damaged packaging**, has a signal strength of **209.97**, and includes evidence that the package is missing a charging cable and has a serial-number mismatch with the original outbound scan.

This is the data point to emphasize during the demo. The natural-language question surfaces a concrete operational issue that could matter to merchandising, fulfillment, and customer service: a product-level complaint signal points to packaging, accessories, and evidence quality. A business user can discover the issue without writing SQL, while the SQL and database result remain visible for trust.

## Task 4: Explain the governance pattern

Use the completed query to explain the pattern behind the page:

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
