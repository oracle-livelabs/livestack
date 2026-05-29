# Scene 4 Regulatory and Quality Signals

## Introduction

**Regulatory and Quality Signals** helps life sciences teams find affected products when quality, regulatory, cold-chain, or manufacturing language does not match the exact product catalog terms. The page uses semantic search to match bulletins and signal text to regulated products by meaning.

This is important because regulated supply teams rarely receive perfectly structured alerts. A bulletin may mention sterility, labeling, protocol deviation, temperature excursion, import delay, component resin, or fill-finish capacity without naming every impacted product or order.

Oracle AI Database helps address these challenges with Oracle AI Vector Search. The app stores product and signal embeddings in Oracle, compares meaning with vector distance, and returns ranked product evidence that a quality or supply user can inspect.

Estimated Time: 10 minutes

![Regulatory and Quality Signals page with vector search and signal stream highlighted](images/quality-signals.png)

### Objectives

In this scene, you will learn what life sciences decision the page supports, what evidence the user should inspect, and what action the business may take next.

## Task 1: Review the Regulatory and Quality Signals page

![Regulatory and Quality Signals page with semantic search controls and signal stream highlighted](images/quality-signals.png)

Review the page to show how semantic search helps triage ambiguous regulated supply signals.

1. Click **Regulatory & Quality Signals** in the sidebar.
2. Review **Match bulletins to affected products with Vector Search** at the top of the page.
3. Review the default quality signal stream below the search panel.
4. Explain first that the system ranks results by meaning similarity. Then mention VECTOR_DISTANCE only as the database capability that performs that comparison.

The page helps quality and clinical supply users decide which products may need impact assessment, replenishment review, or route protection after a signal appears.

## Task 2: Run Semantic Product Matching

![Vector search results for sterility deviation affecting biologics lots](images/quality-signal-vector-results.png)

Run a semantic search to show how a plain-language quality concern becomes ranked product evidence.

1. In **Match bulletins to affected products with Vector Search**, click **sterility deviation affecting biologics lots**.
2. Review the returned product matches.
3. Focus on **Sterility Assurance Swab Pack** and **Bioburden Rapid Test Cartridge** at the top of the results.

In the current demo dataset, the search returns **8** matched products. **Sterility Assurance Swab Pack** appears with a **55.0%** similarity score, while **Bioburden Rapid Test Cartridge** appears with a **43.9%** score. This gives the seller a concrete way to explain semantic matching in a regulated supply context.

## Task 3: Review the quality signal stream

![Quality signal stream with critical signal evidence highlighted](images/quality-signals.png)

Review the stream to connect ranked product matches with live operational signals.

1. Scroll to the signal stream if needed.
2. Use the severity and source filters if you want to narrow the list.
3. Review the top critical signal, such as the customs hold advisory for **SafeGx Quality Labs FDA IND Submission Pack**.
4. Compare the filtered signal evidence to the ranked vector results above.

The value is not only finding similar text. The seller should emphasize that quality and supply teams can use semantic matching to connect ambiguous language to governed product and order data.

You can move to the next scene.

## Credits & Build Notes
- **Author** - Oracle LiveLabs Team
- **Last Updated By/Date** - Oracle LiveLabs Team, 2026-05-29
