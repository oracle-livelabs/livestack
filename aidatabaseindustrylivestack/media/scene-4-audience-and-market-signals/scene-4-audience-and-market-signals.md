# Scene 4 Audience and Market Signals

## Introduction

An audience engagement analyst, content personalization lead, programming manager, trust and safety analyst, or ad-sales strategist uses this page to understand what viewers, subscribers, fans, and players are signaling before demand is obvious in campaign orders alone. The persona is looking for patterns in watch-time comments, creator posts, moderation queues, social sentiment, churn risk, ARPU signals, and content mentions.

Semantic search is difficult to implement when audience signals, content catalogs, embeddings, search indexes, and access policies live in separate systems. Media teams often have to move audience text into external search services, synchronize vector indexes, and then rebuild governance outside the database.

Oracle AI Database helps address these challenges by keeping vector search close to the governed media data. In this LiveStack Demo, the page uses natural-language search over content and audience-signal embeddings, shows match evidence, and keeps the operating feed tied to database access policies.

Estimated Time: 10 minutes

![Audience Momentum and Safety Signals page with vector search and signal feed](images/audience-market-signals.png)

### Objectives

In this scene, you will:
- Review the **Audience Momentum & Safety Signals** workspace.
- Run semantic search for a media demand phrase.
- Inspect matched content assets.
- Review the audience signal feed and momentum cards.
- Understand why vector search and governed access matter for audience intelligence.

## Task 1: Review the signal feed

1. Click **Audience Momentum & Safety Signals** in the sidebar.
2. Review **Content Asset Vector Search** at the top of the page.
3. Review the example query chips, including **streaming demand for teen drama**, **sports rights highlight clips**, **FAST channel weekend binge**, **creator backlash on finale**, and **regional demand for live event**.
4. Review the audience signal feed below the search area.

    ![Audience signal workspace with vector search and media posts](images/audience-signal-feed.png)

In the current seeded dataset, the feed contains **5.0K** posts across platforms such as YouTube, Twitter, TikTok, Instagram, and Threads. Visible examples include signals about sports media buyers, moderation queues, in-game purchase demand, ARPU lift, churn risk, creator momentum, watch time, and live-event planning.

## Task 2: Run content asset vector search

1. Click the **sports rights highlight clips** example query chip, or enter that phrase in the search field.
2. Click **Search**.
3. Review the matched content assets returned above the signal feed.

    ![Content asset vector search results for sports rights highlight clips](images/content-asset-vector-search-results.png)

Use this moment to explain that the search is not simply matching a keyword. Oracle Vector Search compares embeddings so a programming manager can find related assets, rights windows, audience segments, or campaign opportunities by meaning.

## Task 3: Interpret audience signal cards

1. Scroll through the audience signal feed.
2. Review platform, virality, author, follower count, signal text, engagement metrics, views, and sentiment.
3. Connect specific signals to likely business actions: content recommendation, retention offer, moderation review, campaign optimization, or rights-capacity check.

    ![Audience signal cards with platform, virality, engagement, and sentiment evidence highlighted](images/audience-signal-cards-callout.png)

The value of Oracle AI Database is that audience text can become searchable media intelligence without leaving the governed data platform. Vector search helps users find related signals by meaning, while the Oracle-backed application still shows source, score, and operating context.

You can move to the next scene.

## Credits & Build Notes
- **Author** - Oracle LiveLabs Team
- **Last Updated By/Date** - Oracle LiveLabs Team, 2026-05-29
