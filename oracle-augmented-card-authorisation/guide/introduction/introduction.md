# Oracle-Augmented Card Authorisation LiveStack

## Introduction

LiveLabs LiveStacks are real-working demos! 

In this LiveStacks watch as Oracle AI Database 26ai transforms real-time card payment processing with in-database AI that augments fraud and risk decisioning using graph relationships, vector search, behavioral patterns, and historical transaction intelligence. This LiveStack demonstrates how payment providers can enhance live authorization flows with richer fraud context, improved explainability, and faster AI-driven insights—all from a single converged database. The result is a more scalable and governed architecture that reduces complexity, improves fraud outcomes, and modernizes card payment intelligence without disrupting existing authorization and decisioning systems.

Estimated Workshop Time: 1 hour 20 minutes

![Lloyds Bank Control Tower showing Oracle augmentation, DRE/DRG recommendation, and Authentic response](images/lloyds-control-tower.png)

### Objectives

In this workshop, you will:
- Navigate the full Augmented Card Authorization scene flow: Authorisation Control Tower, Oracle Signal Breakdown, Scenario Lab, Investigation Workbench, and Dataset Admin & Audit.
- Connect each scene to the Oracle evidence surfaced through ORDS, PL/SQL, Oracle Internals, and the dataset-admin job ledger.
- Run the LiveStack locally with Podman Compose and bootstrap the required Ollama models.
- Validate the augmentation contract end to end: Oracle signal, DRE/DRG recommendation, Authentic final response, and analyst overlay.

### Prerequisites (If run locally)

This workshop assumes you have:
- Podman Compose 2.x+ with local `podman` access.
- Browser access to `http://localhost:8505`.
- Terminal access for service verification commands such as `podman compose`, `curl`, and `jq`.
- Enough local CPU, memory, and disk to run `db`, `ords`, `ollama`, and `app`.

## Workshop Flow

- Run the LiveStack locally with Podman Compose.
- Scene 1: Authorisation Control Tower
- Scene 2: Oracle Signal Breakdown
- Scene 3: Scenario Lab
- Scene 4: Investigation Workbench
- Scene 5: Dataset Admin & Audit
- Conclusion and key takeaways

## Learn More

- [Oracle Database documentation](https://docs.oracle.com/en/database/oracle/oracle-database/)
- [Overview of Oracle AI Vector Search](https://docs.oracle.com/en/database/oracle/oracle-database/26/vecse/overview-ai-vector-search.html)
- [Oracle REST Data Services](https://docs.oracle.com/en/database/oracle/oracle-database/26/rest-data-services/index.html)

## Credits & Build Notes

- **Author** - The LiveLabs Team
- **Last Updated By/Date** - The LiveLabs Team, April 2026
