# Scene 9 Ask Seer Media Data

## Introduction

This scene lets users ask plain-English questions over the governed Seer Media schema. Ollama drafts responses or SQL while Oracle AI Database executes the generated SQL against live data.

Estimated Time: 10 minutes

![Ask Seer Media Data](images/ask-seer-media-data.png)

### Objectives

In this lab, you will:
- Ask a natural-language question.
- Compare chat, Show SQL, and Run SQL modes.
- Inspect the Oracle execution path.

## Task 1: Ask a business question

1. Open **Ask Seer Media Data**.
2. Review the available tables and example questions.
3. Click **Ask** beside an example question, or enter a question such as `Show me content revenue by content category`.
4. Click **Send**.

Expected result:
- The app returns a grounded answer or tabular result.
- The response is tied to the selected runtime profile and Oracle schema context.

## Task 2: Compare SQL modes

1. Click **Show SQL**.
2. Ask a question that should return data.
3. Review the generated SQL.
4. Click **Run SQL** and submit the same question.

Expected result:
- **Show SQL** exposes the generated SQL for inspection.
- **Run SQL** executes the query and returns rows from Oracle.

## Task 3: Inspect the Oracle evidence

1. Open or review **How Oracle Powers This**.
2. Trace the flow: user question, prompt and schema context, Ollama SQL draft, Oracle SQL execution, UI answer.

Expected result:
- The user can explain which part is language-model reasoning and which part remains governed Oracle execution.

## Task 4: Why this matters?

Business users want answers without becoming SQL experts, but enterprises still need governed execution. This scene shows how natural-language access can be paired with inspectable SQL and live Oracle results.

## Credits & Build Notes
- **Author** - Oracle LiveStack Team
- **Last Updated By/Date** - Oracle LiveStack Team, 2026-05-13
