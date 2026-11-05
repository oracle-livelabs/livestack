# PeakGear AI Lakehouse 90-Second Promo Video Script

Production target: a 85-90 second screen recording with calm background music, polished voiceover, and a walkthrough of the strongest PeakGear AI Lakehouse demo moments.

Live app: http://145.241.245.191:8505/

## Storyline

PeakGear is a sporting goods retailer with fast-moving demand, inventory, order, return, and social signal data. The demo shows how Oracle Autonomous Database and the AI Lakehouse workflow bring that data together, govern it, and serve it back through real-time operations, customer-facing search, and grounded AI assistants.

Keep the video outcome-focused. Show the app and the decisions it enables. Mention Autonomous Database as the trust and processing layer, but do not dwell on bootstrap steps, SQL scripts, or internal setup.

## Timed Recording Script

| Time | Voiceover | Screen direction |
| --- | --- | --- |
| 0:00-0:08 | PeakGear is growing fast, but its data is moving even faster. Product demand, customer orders, inventory, returns, and social signals all arrive from different systems. | Start on **AI Lakehouse Workflow** or **Operations Dashboard**. Show PeakGear branding, top navigation, and high-level KPIs. Use a slow pan only if the recording tool supports it cleanly. |
| 0:08-0:18 | This demo shows how an AI Lakehouse brings those signals together, from raw streaming events to curated, trusted data products ready for analytics and AI. | Move to **LiveStack Configuration** or the workflow view. Briefly frame readiness indicators such as Autonomous Database, GoldenGate Stream Analytics, OCI GenAI, demo data load, or Bronze/Silver/Gold flow. |
| 0:18-0:32 | Here, live demand signals stream into the lakehouse in real time. Instead of waiting for yesterday's batch report, teams can see emerging product trends as they happen. | Open **Real-Time Streaming**. Show the Signal Generator, GoldenGate Stream Analytics, AI Lakehouse Bronze Target, OSA Pipeline, event counts, recent events, or Lakehouse Rows. Zoom once on a changing count or newest event. |
| 0:32-0:42 | Behind the scenes, Autonomous Database lands raw events, standardizes them, and joins them with product, inventory, and customer context, so every AI answer is grounded in governed data. | Return briefly to the lakehouse/status flow or a Bronze/Silver/Gold visual. Avoid long SQL or admin screens. |
| 0:42-0:58 | The same lakehouse powers a customer-facing webshop. Shoppers can search by meaning, not just keywords, and even use an image to find visually similar products. | Open **PeakGear Webshop**. Search `white performance tee` or `trail running gear`. If available, upload a product-style image and run **Find Similar**. Zoom once on ranked product cards, match sources, or visual embeddings count. |
| 0:58-1:10 | Ask PeakGear turns product, order, return, and troubleshooting data into a guided service experience, helping customers resolve issues without agents inventing answers. | Click **Ask PeakGear**. Use one prompt, preferably **I want to return a product**, or ask: `My order 7820 arrived damaged. What should I do?` Show the answer and any visible agent flow or order/status context. |
| 1:10-1:24 | For operators, the dashboard combines operational data, demand signals, inventory, and AI insights in one converged query view, so teams can decide where to move stock, protect margin, or respond to demand. | Open **Operations Dashboard**. Show trending products, inventory risk, demand windows, fulfillment context, or the strongest table/chart on screen. Use the final zoom here, on the insight a business user would act on. |
| 1:24-1:30 | PeakGear AI Lakehouse is the full journey: stream the data, govern it, serve it to applications, and use AI to act on it. | Return to a stable full-app view with PeakGear branding visible. Hold for one beat before cutting. |

## Recorder Shot List

1. **Opening:** AI Lakehouse Workflow or Operations Dashboard, with top navigation visible.
2. **Lakehouse readiness:** LiveStack Configuration or workflow/status section showing connected services and governed data flow.
3. **Streaming:** Real-Time Streaming page with status cards and recent/live event evidence.
4. **ADB trust layer:** quick Bronze/Silver/Gold or lakehouse status shot, no deep admin walkthrough.
5. **Serve Data:** PeakGear Webshop meaning search and, if available, visual image search.
6. **Ask PeakGear:** open chat panel, send one return/product issue prompt, show grounded response.
7. **Serve AI / operations:** Operations Dashboard table or chart that clearly suggests an operational decision.
8. **Close:** full app view, no modal, no loading state.

## Capture Notes

- Keep the final video under 90 seconds. If timing runs long, shorten the opening and ADB processing sections before cutting feature shots.
- Use at most three zooms: streaming evidence, webshop ranked results, and operations insight.
- Avoid recording secrets, passwords, OCI identifiers, SSH sessions, admin bootstrap logs, or long SQL blocks.
- If a live feature is unavailable, keep the narration and show the closest seeded evidence: status cards, existing product results, existing dashboard data, or the Ask PeakGear availability message.
- Background music should stay subtle. Voiceover should remain intelligible over product names: PeakGear, AI Lakehouse, Autonomous Database, Real-Time Streaming, PeakGear Webshop, Ask PeakGear, and Operations Dashboard.

## Suggested Search And Prompt Inputs

- Webshop meaning search: `white performance tee`
- Webshop alternate search: `trail running gear`
- Ask PeakGear prompt: `I want to return a product`
- Ask PeakGear alternate prompt: `My order 7820 arrived damaged. What should I do?`
- Ask Your Data optional fallback prompt: `Which store fulfillment sites have the most inventory?`

## Final Voiceover Only

PeakGear is growing fast, but its data is moving even faster. Product demand, customer orders, inventory, returns, and social signals all arrive from different systems.

This demo shows how an AI Lakehouse brings those signals together, from raw streaming events to curated, trusted data products ready for analytics and AI.

Here, live demand signals stream into the lakehouse in real time. Instead of waiting for yesterday's batch report, teams can see emerging product trends as they happen.

Behind the scenes, Autonomous Database lands raw events, standardizes them, and joins them with product, inventory, and customer context, so every AI answer is grounded in governed data.

The same lakehouse powers a customer-facing webshop. Shoppers can search by meaning, not just keywords, and even use an image to find visually similar products.

Ask PeakGear turns product, order, return, and troubleshooting data into a guided service experience, helping customers resolve issues without agents inventing answers.

For operators, the dashboard combines operational data, demand signals, inventory, and AI insights in one converged query view, so teams can decide where to move stock, protect margin, or respond to demand.

PeakGear AI Lakehouse is the full journey: stream the data, govern it, serve it to applications, and use AI to act on it.
