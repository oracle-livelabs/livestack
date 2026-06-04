# Scene 4 Reliability, Production & Compliance Signal Intelligence

## Introduction

**Reliability, Production & Compliance Signal Intelligence** helps teams understand why the Gulf Coast event matters before the risk is obvious in service request volume alone.

The page connects SAIDI/SAIFI, feeder utilization, gas pipeline pressure variance, leak response SLA, water pressure anomalies, wastewater discharge compliance, well production variance, refinery throughput, equipment vibration and temperature anomalies, emissions threshold alerts, HSE incident rates, maintenance backlog, crew capacity, and regulatory reporting status.

Semantic search is difficult when bulletins, sensor notes, asset descriptions, production updates, regulatory records, embeddings, search indexes, and access policies live in separate systems. Oracle AI Database keeps vector search close to governed operational data so the search stays tied to live schema context and database access policies.

Estimated Time: **10 minutes**

![Reliability, Production & Compliance Signals page with semantic search controls and signal feed](images/scene-04-outage-signals.png)

### Objectives

In this scene, you will learn how vector search connects operating signals to affected Energy and Utilities services, assets, facilities, customers, and compliance records.

## Task 1: Review the signal feed

Perform the following set of steps to see how reliability, production, compliance, safety, emissions, field, and customer signals are summarized for the operator:

1. Click **Reliability, Production & Compliance Signals** in the sidebar.
2. Review **Semantic Reliability, Production & Compliance Signal Search** at the top of the page.
3. Review example query chips such as pipeline pressure anomaly, water leak recurrence, wastewater compliance threshold, refinery throughput constraint, well production variance, emissions follow-up, HSE incident triage, and storm outage risk.
4. Review the **Signal Summary** cards.
5. Review the matched signal feed below the summary.

    ![Reliability, production, and compliance signal search workspace with summary and feed highlighted](images/signal-feed-overview.png)

Use this opening view as the bridge between raw operational text and governed Energy and Utilities intelligence. The same search pattern can support electric reliability, gas safety, water/wastewater operations, upstream production, midstream integrity, downstream throughput, HSE, emissions, and regulatory status.

## Task 2: Run semantic signal search

Perform the following set of steps to show how an operator can search by operational intent, not only by exact service names or keywords:

1. Click an example query chip such as **gas pipeline pressure variance and leak response SLA**, or enter a similar phrase in the search field.
2. Click **Search** when the search action is enabled.

    ![Semantic search example for pipeline pressure, leak response, and compliance evidence](images/semantic-utility-service-results.png)

3. Review the service, asset, facility, or signal match count returned above the signal summary.
4. Review matched signal cards below the filters.
5. Use examples such as **PIPE-17A**, **GLK-2208**, **WMB-4417**, **WWC-9031**, **WELL-NB-014**, **RFY-HCU-02**, **LNG-7842**, **EMS-1190**, and **HSE-3364** to explain semantic matching across subsectors.

**Notes:**
- Sample values may change after data refreshes or rebuilds. Verify live output before presenting, then explain the business takeaway.
- The operator can search using real operational language and still find related records even when the source records use different wording.

## Task 3: Interpret the signal cards

Perform the following set of steps to identify affected services, severity, evidence, and possible next actions, such as opening the operational event graph, checking logistics impact, routing compliance follow-up, or preparing an agent action:

1. Scroll to the matched signal cards.
2. Review signal type, criticality, source, operating impact, match score, related signals, affected services or assets, and open follow-ups when cards are populated.
3. Use action labels to explain where the operator could go next.

    ![Matched reliability, production, and compliance signal cards with current signal state highlighted](images/matched-load-signal-cards.png)

The business value is that teams can make the decision from connected, governed data. Oracle AI Database provides the shared foundation that keeps operational data, analytics, search, and AI workflows aligned.

*You can move to the next scene.*

## Credits & Build Notes
- **Author** - Oracle LiveLabs Team
- **Last Updated By/Date** - Oracle LiveLabs Team, 2026-06-03
