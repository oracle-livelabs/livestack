# Scene 11 Bring Your Own Utility Data

## Introduction

This operator workflow shows how a demo user can replace or restore the utility dataset through the application. The workflow supports downloading a template ZIP, selecting a completed ZIP, validating it, uploading it, and restoring the seeded demo data.

This scene matters because an Energy and Utilities LiveStack is most useful when teams can map the demo pattern to their own service territory, meter, customer, asset, outage, and field operations terminology. The application makes that workflow explicit while keeping the seeded Seer Utility Network data available as a known-good baseline.

Estimated Time: 10 minutes

![Bring Your Own Utility Data modal with template, upload, validation, and restore controls](images/scene-11-bring-your-own-utility-data.png)

### Objectives

In this scene, you will:
- Open the dataset tool from the application top bar.
- Review the active dataset label.
- Download the canonical utility dataset template.
- Review the completed ZIP upload and validation path.
- Preview or restore the seeded utility demo dataset.
- Explain the data safety expectation for synthetic or non-sensitive utility data.

## Task 1: Open the dataset tool

1. From any application scene, click **Use Your Own Utility Data** in the top bar.
2. Review the modal title and active dataset line.
3. Confirm that the modal warns users to use synthetic or non-sensitive utility data only and not to upload protected customer data, account secrets, grid security details, or regulated operational records.
4. Review the main sections: **Download Template ZIP**, **Select Completed ZIP**, **Validate or Restore**, and **Restore Utility Demo Data**.

    ![Use Your Own Utility Data top-bar control highlighted](images/open-dataset-tool.png)

In the current demo, the modal shows the active dataset as **Demo Data** and provides a workflow for a v1 ZIP that contains `manifest.json` and table CSV files.

## Task 2: Review the template and upload workflow

1. Click **Download Template ZIP** to download the canonical schema package.
2. Review **Select Completed ZIP**. The control expects a `.zip` containing `manifest.json` and table CSV files.
3. Review the **Validate Upload** and **Upload Data** actions.
4. Explain that validation should run before data replacement.

    ![Dataset template download, ZIP selection, validate, and upload controls highlighted](images/template-and-upload-workflow.png)

This workflow helps keep custom demos repeatable. The template sets the expected structure for utility customers, service accounts, meters, service requests, field logistics sites, demand forecasts, capacity records, signals, and graph relationships. Validation checks the completed ZIP before import, and upload remains an explicit action.

## Task 3: Preview or restore the seeded dataset

1. In **Restore Utility Demo Data**, click **Preview Restore**.
2. Review the row counts, warnings, or issues returned by the preview.
3. If you need to return the demo to the seeded baseline, click **Restore Utility Demo Data** after the preview enables the action.
4. Close the dataset manager when finished.

    ![Preview Restore, Restore Utility Demo Data, and validation result highlighted](images/preview-restore-seeded-dataset.png)

Use this scene to explain the operating guardrail. Teams can bring their own synthetic utility data into the LiveStack, but the seeded dataset remains available so the demo can always return to a known baseline.

You can move to the download lab when you want to run the Energy and Utilities LiveStack locally.

## Credits & Build Notes
- **Author** - Oracle LiveLabs Team
- **Last Updated By/Date** - Oracle LiveLabs Team, 2026-05-26
