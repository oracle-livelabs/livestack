# Manufacturing Operations LiveStack Demo Guide

## Introduction

This guide is the scene-by-scene runbook for the Manufacturing Operations LiveStack. The demo follows Acme Precision Manufacturing as operators connect production signals, plant capacity, supplier networks, work orders, machine learning, and agent-assisted decisions in one Oracle AI Database 26ai backed application.

Estimated Demo Time: 1 hour 30 minutes

![Manufacturing Operations LiveStack control tower](../scene-1-control-tower-orientation/images/scene-1-control-tower-orientation.png)

### Objectives

In this workshop, you will:
- Orient the audience to the Acme Precision Manufacturing control tower and the converged Oracle architecture behind it.
- Walk through each visible operator workflow in the LiveStack navigation.
- Demonstrate how relational, JSON, graph, vector, spatial, OML, Select AI style natural language, and PL/SQL agent workflows support one manufacturing operations story.
- Use expected results and business signals to narrate what changed on screen and why it matters.
- Download and run the portable LiveStack bundle with Podman Compose.

### Prerequisites

This workshop assumes you have:
- Access to the running Manufacturing Operations LiveStack application.
- A browser session open to the application.
- Podman and Podman Compose available if you plan to run the downloadable stack locally.
- Enough local resources for Oracle Database Free, ORDS, Ollama, and the Node application containers when running the full stack.

## Workshop Flow

- Scene 1: Control Tower Orientation.
- Scene 2: Manufacturing Data Foundation.
- Scene 3: Operations Command Center.
- Scene 4: Production Signal Monitor.
- Scene 5: Supplier and Signal Network Graph.
- Scene 6: Plant Capacity and Routing Map.
- Scene 7: Work Orders and JSON Duality.
- Scene 8: OML Demand and Capacity Analytics.
- Scene 9: Ask Manufacturing Data.
- Scene 10: Manufacturing Agent Console.
- Conclusion and stakeholder narrative.
- Download the LiveStack and run the portable stack with Podman Compose.

## Learn More

- Oracle AI Database
- Oracle Database JSON Duality Views
- Oracle Property Graph and SQL/PGQ
- Oracle AI Vector Search
- Oracle Spatial
- Oracle Machine Learning for SQL
- Oracle REST Data Services

## Credits & Build Notes
- **Author** - LiveLabs Team
- **Last Updated By/Date** - LiveLabs Team, 2026-05-13
- **Source package** - `livestack-manufacturing.zip`
- **Screenshot note** - Screenshots were captured from the local React application shell at `http://127.0.0.1:5173`. The full database-backed compose stack was not started during guide authoring, so some captured data panels show empty, loading, or fallback states.
