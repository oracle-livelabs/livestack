# PeakGear AI Lakehouse LiveStack Guide

## Introduction

PeakGear Sporting Goods sells through a fast-moving webshop and a network of store fulfillment sites. The company manages products across activewear, outdoor gear, running, strength training, cycling, climbing, water sports, team sports, footwear, and fitness devices.

PeakGear faces a familiar retail problem: demand shifts faster than operations can respond. A product can go viral overnight through social channels or supplier activity, but the business still must coordinate inventory, fulfillment capacity, routing, customer demand, returns risk, and catalog data before it can act.

Without a single governed platform, teams face slow decisions, stockouts, duplicate pipelines, synchronization delays, and AI responses disconnected from live business data.

By the end of this LiveStack Demo, you will understand how Oracle's AI Lakehouse architecture combines streaming data, vector search, graph analytics, spatial intelligence, machine learning, and AI agents into a single governed platform that helps retailers sense demand faster, optimize operations, and make decisions using live business data.

Estimated Demo Time: **100 minutes**

Each scene is designed to take between **5 and 10 minutes**.

### Objectives

In this LiveStack Demo, you will see how PeakGear can:

* Reduce stockouts
* Improve product discovery
* Lower fulfillment costs
* Reduce returns risk
* Accelerate business decision-making
* Enable trusted AI automation

### Prerequisites

Before you begin, confirm that you can open the running PeakGear Sporting Goods LiveStack in a modern browser. No coding or database administration knowledge is required to follow the business workflow.

## Architecture of PeakFlow

PeakFlow is the source-to-outcome architecture used by the PeakGear demo. It shows how an AI Lakehouse starts with operational data sources and ends with business outcomes delivered through data products and AI products.

![Oracle Autonomous AI Lakehouse source-to-outcome architecture](images/pg-info.png)

The flow starts with source data such as product master data, orders, customer records, inventory snapshots, product images, demand signals, fulfillment sites, and returns activity. The demo shows several ways that data can enter the lakehouse:

- **Streaming ingest** for demand signals through Kafka and GoldenGate Stream Analytics.
- **Change data capture** from a NetSuite-style operational database through GoldenGate Studio.
- **Batch and object-storage loading** for product master, POS order, inventory, and product image manifest files through Data Studio.

The core AI Lakehouse process is the medallion flow from **Bronze** to **Silver** to **Gold**. Bronze preserves raw, source-shaped data. Silver standardizes, deduplicates, validates, and enriches that data. Gold publishes curated data products that are ready for applications, analytics, machine learning, and AI.

The business outcomes in the later scenes come from those curated products. Serve Data demonstrates dashboards, catalog views, demand sensing, graph-based return analysis, spatial fulfillment, order flow, and predictions. Serve AI demonstrates semantic product discovery, natural-language data access, and retail agents grounded in governed operational data.

## Demo Flow

- **Scene 1:** Confirm LiveStack Readiness.
- **Scene 2:** Real-Time Streaming Ingest.
- **Scene 3:** Change Data Capture Ingest.
- **Scene 4:** Batch and File Loading Ingest.
- **Scene 5:** Data Processing and Pipelines.
- **Scene 6:** Operations Dashboard.
- **Scene 7:** PeakGear Webshop and Product Discovery.
- **Scene 8:** Retail Demand Sensing.
- **Scene 9:** Returns Risk Network.
- **Scene 10:** Fulfillment, Orders, and Predictions.
- **Scene 11:** Ask Data and Retail Agents.

## Learn More

- [Oracle AI Database 26ai documentation](https://docs.oracle.com/en/database/oracle/oracle-database/26/index.html)
- [Oracle AI Vector Search](https://www.oracle.com/database/ai-vector-search/)
- [Oracle Machine Learning for SQL documentation](https://docs.oracle.com/en/database/oracle/machine-learning/oml4sql/tasks.html)
- [Oracle Spatial and Graph documentation](https://docs.oracle.com/en/database/oracle/property-graph/)
- [Oracle GoldenGate Stream Analytics](https://www.oracle.com/integration/goldengate/stream-analytics/)
- [Oracle LiveLabs catalog](https://livelabs.oracle.com/)

## Credits & Build Notes
- **Author** - Oracle LiveLabs Team
- **Last Updated By/Date** - Oracle LiveLabs Team, 2026-06-05
