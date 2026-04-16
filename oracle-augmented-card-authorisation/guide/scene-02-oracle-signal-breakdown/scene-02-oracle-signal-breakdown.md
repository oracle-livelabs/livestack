# Scene 2: Oracle Signal Breakdown

## Introduction

This scene stays inside the live app and follows one pinned transaction into the Oracle explanation rail. You will open Oracle Internals, inspect the focused record, and confirm the same case carries cleanly from the Control Tower into Investigation.

Estimated Time: 10 minutes

### Objectives

In this lab, you will:
- Keep one Control Tower transaction in focus.
- Open Oracle Internals and inspect the focused record details.
- Follow the linked-case handoff into Investigation without losing context.

## Task 1: Keep one transaction in view

1. Return to `Control Tower` if you are not already there.
2. Click a transaction row in `Live transaction ledger`.
3. In the active case area above the ledger, review the case story and summary badges for the selected record.
4. Note the action buttons `Open linked case` and `Pin in Oracle Internals`.

![Control Tower with the active case summary ready for Oracle detail review](images/scene-02-signal-breakdown.png)

Expected result:
- The same transaction is now visible in the Control Tower brief and ready to be pushed into the Oracle evidence rail.

## Task 2: Open Oracle Internals for the same record

1. If the right rail is collapsed, click `Oracle Internals` on the far-right edge of the application.
2. In the active case summary, click `Pin in Oracle Internals`.
3. In the right rail, open `Focused Investigation Record`.
4. Confirm the rail shows the same transaction ID and review these cards:
    - `DRE/DRG recommendation`
    - `Authentic final response`
    - `Graph scope`
    - `Linked timeline`
5. Expand `In-Database AI Path` and review the `Engine`, `Model`, and `ORDS Route` cards.

![Oracle Internals rail showing the focused record and in-database AI path for the pinned transaction](images/scene-02-oracle-internals-rail.png)

Expected result:
- Oracle Internals refreshes to the same transaction you selected in the Control Tower, so the UI story and the Oracle evidence stay aligned.

## Task 3: Follow the linked-case handoff

1. Back in the active case summary, click `Open linked case`.
2. The app switches to `Investigation` with the same transaction already selected.
3. Confirm the transaction stays pinned while Oracle Internals continues to reference the same record.
4. Use the left rail to return to `Control Tower` when you are done.


Expected result:
- The linked-case handoff feels continuous: the user clicks once, the app changes scenes, and the same case remains in focus instead of being reopened from scratch.

## Task 4: Why this matters?

Operators need to trust that the case they see on screen is the same case Oracle is explaining underneath. This scene proves that the Control Tower summary, Oracle Internals rail, and Investigation handoff all stay synchronized around one transaction.

## Credits & Build Notes

- **Author** - The LiveLabs Team
- **Last Updated By/Date** - The LiveLabs Team, April 2026
