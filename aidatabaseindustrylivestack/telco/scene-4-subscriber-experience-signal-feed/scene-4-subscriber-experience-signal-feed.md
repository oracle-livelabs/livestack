# Scene 4 Subscriber Experience Signal Feed

## Introduction

A care operations leader, network experience analyst, digital support manager, or service assurance analyst uses this page to understand what subscribers are reporting before the issue is fully visible in traditional network KPIs. This persona is looking for patterns in care chats, mobile app feedback, outage-portal reports, call-center notes, NPS verbatims, community posts, and field observations. The goal is to connect subscriber language to services, regions, and emerging demand pressure quickly enough to act.

Secure semantic search is difficult to implement when service data, subscriber conversations, embeddings, search indexes, and security policies live in separate systems. Telecom teams often have to move sensitive text into external AI services, synchronize vector indexes, duplicate service catalogs, and then rebuild access control outside the database.

Oracle AI Database helps address these challenges by keeping vector search, SQL, row-level security, and operational telecom data together. In this scene, Oracle AI Database can create embeddings inside the database, so sensitive subscriber-signal data does not need to be sent to external AI services or exposed through another processing layer. Oracle Vector Search can embed a business query, compare it against service or signal embeddings, and return ranked matches while Oracle security policies continue to govern which data the user can see.

Estimated Time: 10 minutes

![Subscriber Experience Signal Feed with signal search, filters, and signal cards](images/subscriber-experience-signal-feed.png)

### Objectives

In this scene, you will:
- Review the two main areas of **Subscriber Signals**: **Mobile Service Signal Search** and **Subscriber Experience Signal Feed**.
- Use a demo query in **Mobile Service Signal Search** to see how subscriber intent returns similar telecom services.
- Use a demo query in the signal feed to see how subscriber signals are ranked by semantic similarity.

## Task 1: Review the Subscriber Signals page

![Subscriber Signals search and feed workspace](images/mobile-service-signal-search.png)

1. Click **Subscriber Signals** in the sidebar.
2. Review **Mobile Service Signal Search** at the top of the page. This section searches the telecom service catalog by meaning, not only by exact keywords.
3. Review **Subscriber Experience Signal Feed** below it. This section searches and filters subscriber signals across operational signal sources such as mobile app feedback, care chat, call-center notes, outage portal, and community forum.
4. Review the filters for **All Signal Severity**, **All Signal Sources**, and **All Signal Owners**.

## Task 2: Search telecom service intent

![Mobile Service Signal Search demo queries](images/mobile-service-signal-search.png)

1. In **Mobile Service Signal Search**, click one of the demo query buttons or enter a query such as **5G coverage and fixed wireless capacity pressure**.
2. Review the returned service matches.
3. Compare the service name, service line, category, and similarity score.

The demo query is embedded at runtime and compared against service embeddings stored in Oracle AI Database. This helps care and network teams search by subscriber intent instead of relying only on exact service names.

## Task 3: Review high-priority subscriber signals

![Signal feed filters](images/signal-feed-filters.png)

1. In the feed filters, select **Critical Escalation** or **High Priority**.
2. Review the visible signal cards.
3. Focus on a high-priority signal such as **Connected life teams need better outreach after recent storm-related service events**.

![High-priority subscriber signal card](images/high-priority-signal-card.png)

In the current demo dataset, the feed includes **5,000** subscriber signals. The visible high-priority signal from **Outage Portal** carries a signal urgency of **97.9**, more than **3M** affected reach, and escalation activity. This is the data point to emphasize: the page is not a social-media wall. It is an operational signal feed that lets service assurance teams find urgent subscriber pain before it becomes churn.

## Task 4: Explain the governance pattern

Use the page to explain the pattern behind the demo:

1. Subscriber signal text is stored in Oracle AI Database.
2. Embeddings are generated and stored with governed operational data.
3. Semantic search finds similar services and signals by meaning.
4. VPD-aware access keeps data scoped to the active demo user.
5. Business users can triage subscriber experience without copying the signal corpus into a separate vector-only system.

You can move to the next scene.

## Credits & Build Notes
- **Author** - Oracle LiveLabs Team
- **Last Updated By/Date** - Oracle LiveLabs Team, 2026-05-28
