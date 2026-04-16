# Scene 1: Authorisation Control Tower

## Introduction

This scene introduces the Bank application shell and the Control Tower workflow. You will open the app, pin a live transaction, and use the case brief the same way an operator would during a live fraud review.

Estimated Time: 10 minutes

### Objectives

In this lab, you will:
- Open the Bank shell and confirm the main navigation.
- Pin a live transaction from the Control Tower.
- Expand the case brief and follow the first guided handoff into the rest of the app.

## Task 1: Open the Control Tower

1. Open the application
2. Confirm the left rail shows `Control Tower`, `Investigation`, `Scenario Lab`, `Audit Trail`, and `Operator Dataset Admin`.
3. In the top bar, confirm `Control Tower` is active and note the API status badge.
4. If the case brief is collapsed, click `Show case brief`.
5. Identify the three main working areas on screen:
    - `Oracle Case Spotlight`
    - `Analyst Attention Queue`
    - `Live transaction ledger`

![Authorisation Control Tower showing the left navigation, case brief, and live transaction queue](images/scene-01-control-tower.png)

Expected result:
- The app opens on `Control Tower`, the main navigation is visible, and the case brief is ready for use.

## Task 2: Pin a transaction from the live ledger

1. Scroll to `Live transaction ledger`.
2. Click any transaction row, ideally one already marked `Review` or `Decline`.
3. Watch the selected row highlight.
4. In the top bar, confirm the pill changes to `Pinned <transactionId>`.
5. Notice the pinned record now drives the Control Tower surfaces, matching the on-screen hint: `Click a row to pin the record across Investigation, Audit Trail, and Oracle Internals.`

![Close-up of the Control Tower brief and executive pulse cards after a transaction is pinned](images/scene-01-augmentation-brief.png)

Expected result:
- One transaction becomes the active record for the Control Tower, and the UI shows that the same case can now follow you across the rest of the app.

## Task 3: Expand the case brief and follow the handoff

1. In `Oracle Case Spotlight`, click `Show full brief`.
2. Review the expanded brief, especially the `Case Vitals` cards and the DRE/DRG versus Authentic summary.
3. Click `Open case`.
4. The app switches to `Investigation` with the same transaction already selected.
5. Click `Control Tower` in the left rail to return to the overview.

Expected result:
- The case brief expands into a fuller operator summary, and `Open case` carries the same pinned transaction into the next scene instead of forcing you to search for it again.

## Task 4: Why this matters?

The Control Tower is the fastest way to explain the fraud story to an operator. If you can pin a transaction, read the brief, and carry that same case into the next scene, the rest of the application becomes a guided workflow instead of a disconnected set of screens.

## Credits & Build Notes

- **Author** - The LiveLabs Team
- **Last Updated By/Date** - The LiveLabs Team, April 2026
