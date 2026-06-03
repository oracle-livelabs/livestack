# Scene 11 Use Your Own Utility Data

## Introduction

**Use Your Own Utility Data** shows how a team can map the LiveStack pattern to its own Energy and Utilities operating data while preserving the seeded Seer Utility Network baseline as a known-good demo state.

This workflow matters because customers may bring electric utility, gas utility, water/wastewater, upstream, midstream, downstream, customer, field, HSE, emissions, maintenance, and regulatory data. The dataset tool makes the import path explicit while keeping destructive actions controlled and reinforcing that demo uploads should use synthetic, de-identified, or anonymized data.

Estimated Time: **8 minutes**

![Use Your Own Utility Data entry point in the current Energy and Utilities app shell](images/scene-11-bring-your-own-utility-data.png)

### Objectives

In this scene, you will learn how the dataset tool supports template ZIP download, completed ZIP upload/replace, validation, restore-demo preview, restore-demo execution, active dataset state, and data-safety expectations.

## Task 1: Open the dataset tool

Perform the following steps to open the dataset workflow from the app shell.

1. Click **Use Your Own Utility Data** in the top bar.
2. In the live application, review the active dataset state when the tool opens.
3. In the live application, review the available actions for template ZIP download, completed ZIP upload/replace, validation, and restore-demo.

    ![Use Your Own Utility Data top-bar entry point highlighted](images/open-dataset-tool.png)

Use this first view to explain that the dataset tool is part of the demo workflow, not a separate admin-only appendix.

## Task 2: Review the template and upload workflow

Perform the following steps to explain what a customer would replace when they bring their own data.

1. Review the template ZIP download action.
2. Review the completed ZIP upload area.
3. Explain that replacement data should preserve the required schema shape while using synthetic or de-identified customer-specific Energy and Utilities records.
4. Emphasize that the same workflow can represent electric assets, gas pipeline records, water/wastewater facilities, oil and gas production data, refinery or LNG records, customer accounts, service requests, work orders, maintenance plans, HSE incidents, emissions events, and compliance records.

    ![Dataset workflow entry context highlighted for template and upload discussion](images/template-and-upload-workflow.png)

The key point is that customers can map their own terminology to the same Oracle AI Database capability pattern without changing the runbook story, while preserving data-safety expectations for demo environments.

## Task 3: Preview or restore the seeded dataset

Perform the following steps to show the demo-safe reset path.

1. Review the restore-demo preview or validation action.
2. Confirm that the restore action describes what will be replaced.
3. Run the restore only when the demo should return to the seeded Seer Utility Network baseline.
4. Confirm the active dataset state after the operation completes.

    ![Seeded dataset state and dataset tool entry highlighted for restore discussion](images/preview-restore-seeded-dataset.png)

Use this scene to close the runbook with a practical adoption point: the same LiveStack can tell the seeded Gulf Coast story or help customers reason about their own Energy and Utilities operating data.

## Credits & Build Notes
- **Author** - Oracle LiveLabs Team
- **Last Updated By/Date** - Oracle LiveLabs Team, 2026-06-03
