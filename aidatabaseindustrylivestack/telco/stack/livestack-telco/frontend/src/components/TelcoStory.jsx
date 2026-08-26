const TELCO_STORY_STEPS = [
  {
    stage: '1',
    useCase: 'Data Foundation',
    summary: 'Load one governed baseline for subscribers, services, network sites, service orders, signals, capacity, ML outputs, and agent actions.',
  },
  {
    stage: '2',
    useCase: 'Service Assurance Dashboard',
    summary: 'Detect case TEL-5G-2026-501: a game-day 5G congestion spike affecting 31,200 subscribers and $2.14M in exposed revenue.',
  },
  {
    stage: '3',
    useCase: 'Subscriber Signals',
    summary: 'Explain the incident through care contacts, outage reports, app feedback, NPS pressure, and semantically related service signals.',
  },
  {
    stage: '4',
    useCase: 'Subscriber & Network Impact Graph',
    summary: 'Trace the event through subscriber clusters, PulsePoint 5G, network sites, capacity dependencies, trouble tickets, and assigned crews.',
  },
  {
    stage: '5',
    useCase: 'Network Access & Field Operations',
    summary: 'Locate constrained coverage, compare service zones and dispatch capacity, and prioritize the field response with spatial evidence.',
  },
  {
    stage: '6',
    useCase: 'Subscriber Service Orders',
    summary: 'Inspect the activations, upgrades, repairs, and dispatch commitments that may miss their promise while the incident remains active.',
  },
  {
    stage: '7',
    useCase: 'Predictive Service Assurance',
    summary: 'Score service-impact, churn, revenue, and capacity exposure so teams can intervene before the next wave of subscriber harm.',
  },
  {
    stage: '8',
    useCase: 'Ask Telecom Operations Data',
    summary: 'Ask incident questions in plain language and inspect governed SQL over the same live telecom operations schema.',
  },
  {
    stage: '9',
    useCase: 'AI-Assisted Service Assurance',
    summary: 'Convert the evidence into reviewable actions for network, care, field service, service-order, and retention teams.',
  },
];

const SCENE_STORIES = {
  datamodel: {
    eyebrow: 'Scene 1 - establish the shared incident record',
    title: 'Build one governed operating baseline for the response.',
    body: 'The story starts by loading the Seer Comms foundation used by every team responding to the game-day 5G congestion event. Subscriber, service, network-site, service-order, signal, capacity, revenue, spatial, graph, ML, and agent-audit records become one shared source of operational truth.',
    beats: [
      'Restore the governed Seer Comms demo foundation.',
      'Confirm subscriber, service, site, signal, order, capacity, and graph records are ready.',
      'Use the same Oracle AI Database 26ai evidence in every scene that follows.',
    ],
  },
  dashboard: {
    eyebrow: 'Scene 2 - detect the game-day service risk',
    title: 'See the 5G congestion event before it fragments across teams.',
    body: 'The service assurance dashboard surfaces case TEL-5G-2026-501 as one operating picture. A game-day congestion spike around New York event venues affects 31,200 subscribers, exposes $2.14M in revenue, increases service-order pressure, and puts restoration and SLA performance at risk.',
    beats: [
      'Start with incident severity, subscriber reach, ticket aging, and restoration status.',
      'Identify the services where signal velocity and capacity exposure are rising together.',
      'Use the dashboard as the handoff into signals, graph, field operations, analytics, and action.',
    ],
  },
  social: {
    eyebrow: 'Scene 3 - explain the subscriber signals',
    title: 'Find the experience evidence behind the network alarm.',
    body: 'The signal scene explains what affected subscribers are experiencing. Vector search connects care contacts, outage reports, app feedback, NPS comments, activation friction, and coverage complaints to the services and operational records involved in the congestion event.',
    beats: [
      'Search for game-day congestion, 5G latency, outage follow-up, or technician capacity.',
      'Use semantic matches to separate the incident pattern from routine service noise.',
      'Carry the strongest subscriber evidence into the impact graph and response workflow.',
    ],
  },
  graph: {
    eyebrow: 'Scene 4 - trace the service-impact path',
    title: 'Connect the outage event to subscribers, sites, cases, and crews.',
    body: 'The graph scene starts with OUT-EVENT-501 and follows the impact through the stadium-district subscriber cluster, PulsePoint 5G service, Hudson Yards and Queensboro network sites, capacity pool dependencies, trouble ticket NY-77831, and the field crews assigned to restore service.',
    beats: [
      'Open OUT-EVENT-501 or case TEL-5G-2026-501 as the investigation anchor.',
      'Increase graph depth to expose served-by, impacted-by, capacity, ticket, and crew relationships.',
      'Use the highest-risk path to decide which infrastructure and subscriber segment needs attention first.',
    ],
  },
  fulfillment: {
    eyebrow: 'Scene 5 - coordinate network and field capacity',
    title: 'Turn the impact path into a spatial restoration plan.',
    body: 'The field-operations scene compares network sites, service zones, demand pressure, available dispatch capacity, and subscriber proximity. The team can see where congestion exposure and limited restoration capacity overlap before assigning the next crew or rerouting work.',
    beats: [
      'Review affected network sites, coverage zones, and available dispatch capacity.',
      'Toggle spatial layers to compare subscriber demand pressure with restoration coverage.',
      'Use proximity and capacity evidence to prioritize crew routing and service recovery.',
    ],
  },
  orders: {
    eyebrow: 'Scene 6 - protect subscriber commitments',
    title: 'Open the service orders exposed by the active incident.',
    body: 'Subscriber Service Orders shows the commercial and operational commitments behind the alarm. Teams inspect activations, upgrades, repairs, plan changes, and field dispatches whose promised completion or subscriber experience may be affected by the congestion and restoration response.',
    beats: [
      'Filter service orders by status, region, and active VPD context.',
      'Compare relational records with JSON duality documents for the same commitment.',
      'Use the impacted order as the handoff into prediction, retention, or agent action.',
    ],
  },
  oml: {
    eyebrow: 'Scene 7 - predict the next wave of exposure',
    title: 'Score service impact, churn, revenue, and capacity risk.',
    body: 'Predictive Service Assurance turns the current event into forward-looking decisions. In-database models score which services and subscriber segments are most likely to create additional workload, churn, revenue loss, or network-access pressure as the incident continues.',
    beats: [
      'Review active DBMS_DATA_MINING models and live scoring status.',
      'Compare service-impact probability with churn, revenue, and capacity exposure.',
      'Carry the highest-risk cohort into Ask Data or the agent console for intervention.',
    ],
  },
  askdata: {
    eyebrow: 'Scene 8 - ask the incident questions',
    title: 'Interrogate the service-assurance story in plain language.',
    body: 'Ask Telecom Operations Data lets leaders ask which subscribers, services, sites, orders, and revenue are exposed; which crews are assigned; and where churn or SLA risk is highest. Oracle generates governed SQL over the same live schema used throughout the response.',
    beats: [
      'Ask a question about TEL-5G-2026-501, affected subscribers, sites, orders, or capacity.',
      'Inspect the generated SQL before running it against governed operational data.',
      'Use the answer as context for a specialist agent or human decision.',
    ],
  },
  agents: {
    eyebrow: 'Scene 9 - coordinate governed action',
    title: 'Turn the incident evidence into an accountable response.',
    body: 'The agent console closes the loop. Network, care, access, service-order, field-operations, and retention agents summarize the event, assess risk, recommend mitigation, call approved Oracle tools, and record each proposed or completed action for review.',
    beats: [
      'Ask agents to summarize the incident, check capacity, or prepare a subscriber intervention.',
      'Let specialist teams call approved Oracle SQL and PL/SQL tools.',
      'Review recent actions so operational and subscriber decisions remain auditable.',
    ],
  },
};

export function TelcoStoryRail() {
  return (
    <div className="industry-story-rail" aria-label="One telecom service assurance story across use cases">
      <div className="industry-story-rail__intro">
        <span className="industry-story-rail__kicker">Nine scenes, one game-day 5G service assurance story</span>
        <p>
          The demo follows case TEL-5G-2026-501 from a game-day congestion alarm through subscriber evidence,
          network impact, field response, exposed service orders, predictive risk, natural-language investigation,
          and governed AI-assisted action. Every scene uses the same Oracle AI Database 26ai foundation, so the
          story stays connected from data load through accountable response.
        </p>
      </div>
      <ol className="industry-story-rail__steps">
        {TELCO_STORY_STEPS.map((step) => (
          <li key={step.useCase} className="industry-story-step">
            <span className="industry-story-step__stage">{step.stage}</span>
            <span className="industry-story-step__use-case">{step.useCase}</span>
            <span className="industry-story-step__summary">{step.summary}</span>
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
    <section className="industry-story-panel" aria-label={`${story.title} story context`}>
      <div className="industry-story-panel__copy">
        <span className="industry-story-panel__eyebrow">{story.eyebrow}</span>
        <h3>{story.title}</h3>
        <p>{story.body}</p>
      </div>
      <ol className="industry-story-panel__beats">
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
