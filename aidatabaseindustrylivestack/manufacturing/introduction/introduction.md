# Seer Manufacturing LiveStack Guide

## Introduction

Manufacturing teams need to coordinate plant performance, work orders, supplier risk, quality inspections, machine telemetry, inventory constraints, predictive maintenance, production variance, and AI-assisted decisions while keeping operational data governed. 

Those workflows often live in separate execution systems, planning tools, quality systems, spreadsheets, analytics marts, search services, mapping tools, notebooks, and AI experiments. The result is a slower operating model: users can see part of the factory picture, but they cannot easily trace a corrective action back to the same trusted manufacturing data foundation.

This runbook supports the **Seer Manufacturing LiveStack Demo**. The demo shows how **Oracle AI Database 26ai** can bring manufacturing operations workloads together on one connected data platform. Instead of splitting relational work orders, JSON documents, supplier and production-risk graphs, plant spatial analysis, vector search, in-database machine learning, natural-language SQL, and AI agent workflows across different systems, the LiveStack shows how those capabilities can work against the same governed Oracle data model.

In the demo, **Seer Manufacturing** uses Oracle AI Database to recover the **Servo Drive Controller AX-400** production plan from constrained PCB material, work-order schedule variance, supplier delay, plant-capacity pressure, scrap risk, and machine telemetry signals. Each scene is designed to help you explain a practical manufacturing operations challenge and then show how a converged Oracle database capability supports a clearer decision path.

Estimated Demo Time: **90 minutes**

Each scene is designed to take between **5 and 10 minutes**.

![Manufacturing LiveStack welcome page](images/welcome-and-demo-orientation.png)

### Objectives

In this LiveStack demo, you will see how connected manufacturing data helps teams identify production pressure, trace supplier and quality risk, evaluate plant capacity, analyze work orders, forecast demand and capacity constraints, and apply AI-assisted workflows with stronger governance.

### Prerequisites

Before you begin, confirm that you can open the running Seer Manufacturing LiveStack in a modern browser. No database or coding knowledge is required for the guided business workflow.
Podman and Podman Compose are required only if you plan to run the portable LiveStack locally in the Take It Home lab.

## Demo Flow

- **Scene 1:** Manufacturing Control Tower Orientation.
- **Scene 2:** Manufacturing Data Foundation.
- **Scene 3:** Operations Command Center.
- **Scene 4:** Production Signal Monitor.
- **Scene 5:** Supplier and Signal Network Graph.
- **Scene 6:** Plant Capacity and Routing Map.
- **Scene 7:** Work Orders and JSON Duality.
- **Scene 8:** OML Demand and Capacity Analytics.
- **Scene 9:** Ask Manufacturing Data.
- **Scene 10:** Manufacturing Agent Console.
- **Scene 11:** Use Your Own Manufacturing Data.
- Download and run the portable Manufacturing LiveStack.

## Learn More

- [Oracle AI Database 26ai documentation](https://docs.oracle.com/en/database/oracle/oracle-database/26/index.html)
- [Oracle AI Agent Memory](https://www.oracle.com/database/ai-agent-memory/)
- [Oracle AI Vector Search](https://www.oracle.com/database/ai-vector-search/)
- Oracle Spatial and Graph documentation: [Oracle Spatial](https://docs.oracle.com/en/database/oracle/oracle-database/26/spatl/toc.htm) and [Oracle Property Graph](https://docs.oracle.com/en/database/oracle/property-graph/26.2/index.html)
- [Oracle Machine Learning for SQL documentation](https://docs.oracle.com/en/database/oracle/machine-learning/oml4sql/tasks.html)
- [Oracle REST Data Services documentation](https://docs.oracle.com/en/database/oracle/oracle-rest-data-services/25.4/orddg/index.html)
- [Oracle LiveLabs catalog](https://livelabs.oracle.com/)

## Credits & Build Notes
- **Author** - Oracle LiveLabs Team
- **Last Updated By/Date** - Oracle LiveLabs Team, 2026-06-22
