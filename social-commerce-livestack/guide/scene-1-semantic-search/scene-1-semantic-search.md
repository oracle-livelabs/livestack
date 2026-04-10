# Scene 1: Welcome & Navigation

## Introduction

This scene orients you to the application shell, navigation model, and Oracle Internals panel behavior before you move into feature-specific scenes.

Estimated Time: 8 minutes

### Objectives

In this lab, you will:
- Open the app and confirm all available scenes.
- Verify Oracle Internals panel behavior.
- Switch demo users to prepare for role-aware comparisons.

## Task 1: Open the application shell

1. Open:
    ```text
    http://localhost:5500
    ```
2. Confirm the navigation shows all scenes from `Welcome` through `Agent Console`.

    ![Social Commerce welcome scene with the full navigation rail visible](images/welcome-shell.png)

Expected result:
- The app loads successfully and all scene entries are visible in the left rail.

## Task 2: Inspect the Oracle Internals panel

1. Open `Schema & Data` or `Dashboard`.
2. Confirm the right-side Oracle Internals panel appears.
3. Collapse, expand, and resize the panel.

Expected result:
- Oracle Internals is interactive and tied to the active scene.

## Task 3: Switch demo users

1. Open `User Switcher` in the lower-left area.
2. Switch to a non-admin user and then back.
3. Note the role and region values shown.

Expected result:
- Demo user context changes successfully.

## Task 4: Why this matters?

This scene establishes the control plane for the entire demo. If your team cannot quickly navigate scenes, verify user context, and inspect Oracle Internals side-by-side, later findings on vector search, graph, fulfillment, and agent behavior are hard to trust operationally.

## Credits & Build Notes

- **Author** - LiveLabs Team
- **Last Updated By/Date** - LiveLabs Team, April 2026
