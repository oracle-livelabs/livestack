# Search That Understands Shopper Intent

## Introduction

This workshop guides you through the Seer Sporting Goods storefront as a hands-on semantic search LiveStack. You will run searches, inspect Database X-Ray output, observe semantic cache reuse, and connect what you see in the UI to the Oracle AI Database capabilities behind it.

Estimated Workshop Time: 1 hour

> Note: If you also want to download the packaged LiveStack zip from Object Storage and run it locally, plan an additional 20 to 30 minutes for download time, container startup, and model initialization.

### Objectives

In this workshop, you will:
- Demonstrate semantic search with shopper phrases that do not depend on exact keyword matches.
- Connect meaning-based search results to practical discovery outcomes.
- Use Database X-Ray to inspect how each request is grounded.
- Observe how semantic cache lookups make repeated product-insight requests feel faster and more efficient.
- Relate the storefront behavior to the LiveStack components that support it.

### Prerequisites

This workshop assumes you have:
- Access to a running Seer Sporting Goods application LiveStack.
- A browser session available for the storefront.
- If you plan to run the stack locally, terminal access on your machine plus the ability to download the packaged LiveStack zip from OCI Object Storage.
- If you plan to run the stack locally, either **Podman** or **Docker** installed. The take-home lab uses `podman compose` commands because this LiveStack is container-based.
- Basic familiarity with Oracle AI Database, AI Vector Search, and following terminal-based setup steps.

## Workshop Flow

- Scene 1: Semantic Search (use natural-language search to explore the catalog)
- Scene 2: Database X-Ray (show the proof behind the experience)
- Scene 3: Semantic Cache (make repeated insight requests feel smarter)
- Scene 4: Under The Hood (connect the experience to the LiveStack)
- Conclusion and key takeaways
- Take it home: download the LiveStack zip and run it locally

## Learn More

- [Oracle AI Database documentation library](https://docs.oracle.com/en/database/oracle/oracle-database/) for the broader product documentation used throughout this LiveStack.
- [Overview of Oracle AI Vector Search](https://docs.oracle.com/en/database/oracle/oracle-database/26/vecse/overview-ai-vector-search.html) for the semantic search concepts behind the storefront experience.
- [Vector Search PL/SQL packages](https://docs.oracle.com/en/database/oracle/oracle-database/26/vecse/vector-search-pl-sql-packages-node.html) for the `DBMS_VECTOR` and `DBMS_VECTOR_CHAIN` APIs used in the stack.

## Credits & Build Notes

- **Author** - LiveLabs Team
- **Last Updated By/Date** - LiveLabs Team, March 2026
