const MEDIA_STORY_STEPS = [
  {
    stage: '1',
    useCase: 'Data Foundation',
    summary: 'Load the Seer Media foundation that links subscribers, audience signals, content assets, campaign requests, rights capacity, forecasts, OML outputs, and agent audit history.',
  },
  {
    stage: '2',
    useCase: 'Executive Command Center',
    summary: 'Frame the Midnight Harbor premiere weekend: engagement, campaign value, content demand, retention risk, capacity, and AI actions in one executive view.',
  },
  {
    stage: '3',
    useCase: 'Audience Intelligence',
    summary: 'Use audience and community signals to understand which segments, channels, content themes, and safety issues are changing fastest.',
  },
  {
    stage: '4',
    useCase: 'Content Affinity Graph',
    summary: 'Trace how creators, studios, titles, audience communities, and campaign influence paths shape content discovery and engagement.',
  },
  {
    stage: '5',
    useCase: 'Rights and Ad Inventory',
    summary: 'Find where rights capacity, ad inventory, coverage hubs, and regional demand need to be rebalanced before the premiere window.',
  },
  {
    stage: '6',
    useCase: 'Campaign Requests',
    summary: 'Inspect campaign and rights requests as governed relational records and JSON duality documents for the same operating decision.',
  },
  {
    stage: '7',
    useCase: 'Personalization and Retention',
    summary: 'Score demand, audience value, campaign revenue, churn risk, content clusters, and capacity exposure with in-database OML.',
  },
  {
    stage: '8',
    useCase: 'Ask Media Data',
    summary: 'Ask natural-language questions about subscriber retention, content performance, campaign ROI, rights capacity, and audience signals.',
  },
  {
    stage: '9',
    useCase: 'AI Decisioning',
    summary: 'Turn the findings into audited programming, marketing, monetization, retention, and coverage actions through specialist agent workflows.',
  },
];

const SCENE_STORIES = {
  datamodel: {
    eyebrow: 'Scene 1 - establish the audience record',
    title: 'Unify the signals before making launch decisions.',
    body: 'The journey starts with one governed Media and Entertainment foundation for the Midnight Harbor premiere weekend. The restore connects subscribers, audience accounts, content assets, campaigns, rights capacity, audience signals, vectors, graph relationships, forecasts, OML artifacts, and agent history before the executive story begins.',
    beats: [
      'Restore the Seer Media demo dataset.',
      'Confirm the footprint across content, audience, campaign, capacity, graph, vector, and analytics domains.',
      'Use the same Oracle AI Database 26ai foundation in every downstream decision scene.',
    ],
  },
  dashboard: {
    eyebrow: 'Scene 2 - frame the executive question',
    title: 'See whether Midnight Harbor can convert attention into revenue.',
    body: 'The command center turns the premiere weekend into an executive operating view. Audience momentum, campaign value, content demand, rights capacity, retention risk, and AI actions show where programming, marketing, and monetization teams need to focus.',
    beats: [
      'Compare engagement, campaign value, launch demand, capacity, and AI action volume.',
      'Watch the year-long audience signal arc instead of isolated dashboard snapshots.',
      'Use the executive view as the handoff into audience, graph, rights, analytics, and agent workflows.',
    ],
  },
  social: {
    eyebrow: 'Scene 3 - understand the audience',
    title: 'Find the audience signals that explain engagement change.',
    body: 'Audience Momentum and Safety Signals is the evidence-gathering chapter. Vector search and urgency scoring connect subscriber sentiment, creator reactions, moderation pressure, watch-time changes, campaign interest, and content demand.',
    beats: [
      'Search for retention risk, content demand, safety pressure, or campaign momentum.',
      'Use semantic matches to connect audience signals to titles and campaign packages.',
      'Carry the strongest signal evidence into graph, personalization, and agent decisions.',
    ],
  },
  graph: {
    eyebrow: 'Scene 4 - map influence paths',
    title: 'Trace how creators, titles, and audience communities drive discovery.',
    body: 'The graph scene shows how creators, studios, labels, communities, platforms, titles, and campaign relationships shape the Midnight Harbor launch. The findings panel turns influence paths into partnership, programming, and campaign targeting decisions.',
    beats: [
      'Select creators, studios, communities, titles, or campaign relationships.',
      'Increase graph depth to expose multi-hop affinity and influence paths.',
      'Use the graph findings to decide which audience and creator paths deserve action.',
    ],
  },
  fulfillment: {
    eyebrow: 'Scene 5 - protect monetization capacity',
    title: 'Rebalance rights, ad inventory, and coverage before demand peaks.',
    body: 'The spatial chapter turns the same story into coverage operations. Rights desks, ad inventory pools, live-event hubs, regional demand, and activation routes show where the company can protect launch monetization.',
    beats: [
      'Compare coverage hubs, rights capacity, pending requests, and capacity alerts.',
      'Toggle spatial layers to see launch markets, coverage zones, and activation routes.',
      'Use proximity and capacity evidence to support ad inventory and rights decisions.',
    ],
  },
  orders: {
    eyebrow: 'Scene 6 - inspect the operating record',
    title: 'Open the campaign and rights requests behind the decision.',
    body: 'Campaign and Rights Requests shows the governed execution layer. Teams can inspect request rows, line items, activation routes, and JSON duality documents for the same records without creating a separate application data store.',
    beats: [
      'Filter requests by status and active VPD context.',
      'Open a request to compare relational rows with JSON duality payloads.',
      'Use the record as the operational handoff into analytics or agent action.',
    ],
  },
  oml: {
    eyebrow: 'Scene 7 - predict and personalize',
    title: 'Score demand, value, churn, and content clusters inside Oracle.',
    body: 'OML turns the launch story into predictive media operations. In-database models score demand surges, audience value segments, campaign revenue, retention risk, content clusters, and capacity exposure without moving data out of Oracle.',
    beats: [
      'Review active DBMS_DATA_MINING models and current-generation native model and scoring readiness.',
      'Use demand, segment, revenue, retention, and capacity tabs to prioritize action.',
      'Carry predictions into Ask Data or agent workflows for business decisions.',
    ],
  },
  askdata: {
    eyebrow: 'Scene 8 - ask the business questions',
    title: 'Interrogate the launch story in plain language.',
    body: 'Ask Media and Entertainment Data lets business users ask about subscriber retention, content performance, campaign value, audience segments, rights capacity, ad inventory, and launch risk. The assistant drafts governed SQL, Oracle executes it, and the answer stays grounded in live schema metadata.',
    beats: [
      'Ask scene-specific questions in explain, chat, show SQL, or run SQL mode.',
      'Review generated SQL before executing governed queries.',
      'Use the answer as context for the AI Decisioning Console.',
    ],
  },
  agents: {
    eyebrow: 'Scene 9 - coordinate the response',
    title: 'Convert audience and revenue findings into audited actions.',
    body: 'The agent console closes the loop. Specialist agents route audience, coverage, retention, and monetization tasks, call approved Oracle SQL and PL/SQL tools, and write each recommendation to the agent audit trail.',
    beats: [
      'Ask agents to check content demand, retention risk, campaign value, or coverage capacity.',
      'Let specialist teams route work across signal, rights, revenue, and campaign tools.',
      'Review recent actions so programming, marketing, and monetization decisions remain auditable.',
    ],
  },
};

export function MediaStoryRail() {
  return (
    <div className="welcome-story-rail" aria-label="Midnight Harbor premiere story across the Media and Entertainment use cases">
      <div className="welcome-story-rail__intro">
        <span className="welcome-story-rail__kicker">Nine scenes, one Midnight Harbor launch story</span>
        <p>
          The demo follows Seer Media from audience and content data readiness through engagement intelligence,
          content affinity, rights and ad inventory coverage, campaign requests, predictive retention and monetization,
          natural-language analysis, and AI-assisted decisions. Each scene answers a concrete business question using
          the same governed Oracle AI Database 26ai foundation.
        </p>
      </div>
      <ol className="welcome-story-rail__steps">
        {MEDIA_STORY_STEPS.map((step) => (
          <li key={step.useCase} className="welcome-story-step">
            <span className="welcome-story-step__stage">{step.stage}</span>
            <span className="welcome-story-step__use-cases">{step.useCase}</span>
            <span className="welcome-story-step__summary">{step.summary}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

export function SceneStoryPanel({ scene }) {
  const story = SCENE_STORIES[scene];
  if (!story) return null;

  return (
    <section className="media-story-panel" aria-label={`${story.title} story context`}>
      <div className="media-story-panel__copy">
        <span className="media-story-panel__eyebrow">{story.eyebrow}</span>
        <h3>{story.title}</h3>
        <p>{story.body}</p>
      </div>
      <ol className="media-story-panel__beats">
        {story.beats.map((beat, index) => (
          <li key={beat}>
            <span>{index + 1}</span>
            <p>{beat}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}
