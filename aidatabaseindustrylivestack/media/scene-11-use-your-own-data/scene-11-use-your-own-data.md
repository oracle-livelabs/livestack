# Scene 11 Use Your Own Media Data

## Introduction

This operator workflow shows how a demo user can replace or restore the media dataset through the application. The workflow supports downloading a template ZIP, selecting a completed ZIP, validating it, uploading it, previewing the seeded restore, and restoring the bundled demo data.

This scene matters because a media LiveStack is most useful when teams can map the demo pattern to their own terminology and sample data. A streaming platform might bring content titles, subscriber segments, and viewing signals. A studio might bring release windows, campaign orders, and rights regions. A sports network might bring highlight packages, ad inventory, and market demand. The application makes that workflow explicit while keeping the seeded Seer Media data available as a known-good baseline.

Estimated Time: 10 minutes

![Use Your Own Media Data modal with template, upload, validation, and restore controls](images/use-your-own-data.png)

### Objectives

In this scene, you will:
- Open the dataset tool from the application top bar.
- Review the active dataset label.
- Download the canonical media dataset template.
- Review the completed ZIP upload and validation path.
- Preview or restore the seeded media demo dataset.
- Explain the data safety expectation for synthetic, masked, or approved sample media data.

## Task 1: Open the dataset tool

1. From any application scene, click **Use Your Own Media Data** in the top bar.
2. Review the modal title and active dataset line.
3. Review the main sections: **Download Template ZIP**, **Select Completed ZIP**, **Validate or Restore**, and **Restore Demo Data**.

    ![Use Your Own Media Data modal opened from the application top bar](images/open-dataset-tool.png)

In the current demo, the modal shows the active dataset as **Demo Data** and provides a workflow for a v1 ZIP that contains `manifest.json` and media table CSV files.

## Task 2: Review the template and upload workflow

1. Click **Download Template ZIP** to download the canonical schema package.
2. Review **Select Completed ZIP**. The control expects a `.zip` containing `manifest.json` and media table CSV files.
3. Review the **Validate Upload** and **Import Media Data** actions.
4. Explain that validation should run before data replacement.

    ![Dataset template download, ZIP selection, validate, and import controls](images/template-and-upload-workflow.png)

The template includes required and optional CSV structures for content assets, audience accounts, campaign requests, distribution hubs, audience signals, creator relationships, and demand forecasts. This workflow helps keep custom demos repeatable: the template sets the expected structure, validation checks the completed ZIP before import, and import remains an explicit action.

## Task 3: Preview or restore the seeded dataset

1. In **Restore Demo Data**, click **Preview Restore**.
2. Review the dry-run validation result.
3. If you need to return the demo to the seeded baseline, click **Restore Demo Data** only in a disposable or demo environment.
4. Close the dataset manager when finished.

    ![Preview Restore result for the seeded media demo dataset](images/preview-restore-seeded-dataset.png)

In the hosted demo captured for this runbook, **Preview Restore** returned **Validation passed. Dry run completed successfully.** The restore preview validates the seeded media package before replacing anything.

Use this scene to explain the operating guardrail. Teams can bring their own synthetic, masked, or approved sample media data into the LiveStack, but the seeded dataset remains available so the demo can always return to a known baseline.

You can move to the conclusion or the download lab when you want to run the Media LiveStack locally.

## Credits & Build Notes
- **Author** - Oracle LiveLabs Team
- **Last Updated By/Date** - Oracle LiveLabs Team, 2026-05-29
- **Screenshot source** - Captured from `http://141.148.236.195:8505/`.
