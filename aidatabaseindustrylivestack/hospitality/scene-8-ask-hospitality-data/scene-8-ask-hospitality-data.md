# Scene 8 Ask Hospitality Data

## Introduction

Dev needs an answer that crosses dashboards, reservations, and forecasts. He asks the database directly, reviews the generated SQL, then asks a follow-up without starting over.

Estimated time: 10 minutes.

![Dev asks a follow-up question while keeping the first result in context](images/story-ask-hospitality-data.png)

### Objectives

Ask an operating question, review how the application reached its answer, and continue with a follow-up based on the same Oracle data.

## Task 1 Ask an operating question

![Ask Hospitality Data navigation, runtime profile, Explain mode, and question field highlighted](images/ask-operating-question.png)

1. Select **Ask Hospitality Data** from the navigation menu.
2. Confirm the runtime profile.
3. Select **Explain** for a business interpretation of the result.
4. Enter `Which properties have the highest reservation revenue?`, then submit the question.

## Task 2 Continue the conversation

![Prior context, follow-up question, retained context, and persistence notice highlighted](images/conversation-follow-up.png)

1. Confirm that the first response retains its supporting context.
2. Enter the follow-up `What about by room type?`.
3. Confirm that the follow-up response shows **Context kept** and remains tied to the prior result.
4. Review the persistence notice. The conversation is saved for the active user across scene changes and browser restarts.

## Task 3 Inspect SQL when appropriate

![Generated SQL disclosure, SQL statement, and copy control highlighted](images/inspect-generated-sql.png)

1. Open **View generated SQL** beneath the response.
2. Review the selected columns, joins, conditional aggregates, grouping, and ordering before using the query.
3. Select **Copy SQL** only when the statement is needed for an authorized review or execution workflow.

**Next:** Continue with **Scene 9: Hospitality Agent Console**.

## Credits and Build Notes

- Author: Matt Kowalik, Principal Product Manager
- Last updated: September 2026
