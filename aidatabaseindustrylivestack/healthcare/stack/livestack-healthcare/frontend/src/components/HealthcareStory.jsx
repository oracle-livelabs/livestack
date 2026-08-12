const HEALTHCARE_STORY_STEPS = [
  {
    stage: '1',
    useCase: 'Healthcare Data Foundation',
    summary: 'Load the governed records that connect NorthStar Health System, CASE-SEPSIS-READMIT, encounters, care gaps, facilities, signals, logistics, analytics, and agent history.',
  },
  {
    stage: '2',
    useCase: 'Operations Command Center',
    summary: 'See patient flow, care demand, capacity pressure, quality risk, service activity, and agent actions in one operating view.',
  },
  {
    stage: '3',
    useCase: 'Quality & Capacity Signals',
    summary: 'Search quality updates, capacity alerts, and related care-service evidence to understand the pressure around the sepsis transition.',
  },
  {
    stage: '4',
    useCase: 'Care Pathway Graph',
    summary: 'Trace CASE-SEPSIS-READMIT from the index admission through the missed 48-hour follow-up, medication reconciliation gap, and 7-day readmission risk.',
  },
  {
    stage: '5',
    useCase: 'Care Logistics Map',
    summary: 'Compare care-site proximity, coverage, regional capacity, and service routes that shape the follow-up response.',
  },
  {
    stage: '6',
    useCase: 'Care Service Requests',
    summary: 'Inspect governed service-request rows and JSON duality documents so coordination teams work from the same operational record.',
  },
  {
    stage: '7',
    useCase: 'Risk and Capacity Analytics',
    summary: 'Score readmission exposure, care-gap risk, service demand, and capacity needs with analytics that run inside Oracle.',
  },
  {
    stage: '8',
    useCase: 'Ask Healthcare Data',
    summary: 'Ask natural-language questions about sepsis transitions, follow-up gaps, readmission risk, care demand, and capacity against governed Oracle views.',
  },
  {
    stage: '9',
    useCase: 'Healthcare AI Agent Console',
    summary: 'Turn the evidence into coordinated follow-up, care-navigation, capacity, and service actions through audited AI agent workflows.',
  },
];

const SCENE_STORIES = {
  datamodel: {
    eyebrow: 'Scene 1 - establish the record',
    title: 'Build the sepsis readmission prevention baseline.',
    body: 'The journey begins by loading one governed healthcare foundation for NorthStar Health System and CASE-SEPSIS-READMIT. It connects the index sepsis admission, follow-up and medication care gaps, facilities, quality signals, logistics, analytics, and agent history before the investigation moves to any downstream scene.',
    beats: [
      'Restore the Seer Health Network data foundation.',
      'Confirm the live database footprint for care services, requests, signals, graph evidence, vectors, analytics, and agent actions.',
      'Use the same governed Oracle AI Database 26ai data throughout the nine-scene investigation.',
    ],
  },
  dashboard: {
    eyebrow: 'Scene 2 - detect the operating issue',
    title: 'See care risk and capacity pressure before the follow-up window closes.',
    body: 'The command center turns the NorthStar investigation into a live operating picture. Patient flow, service demand, capacity, quality signals, care activity, and audited agent actions provide the operational context surrounding a missed transition-of-care follow-up.',
    beats: [
      'Review care activity, capacity, quality, and service demand together.',
      'Look for the operational pressure that can delay outreach and coordination.',
      'Use the command center as the handoff into signals, pathways, logistics, analytics, and agents.',
    ],
  },
  'quality-signals': {
    eyebrow: 'Scene 3 - explain the signals',
    title: 'Find the quality and capacity evidence behind the care risk.',
    body: 'Quality & Capacity Signals is the evidence-gathering chapter. Vector search connects quality updates, capacity alerts, operational signals, and related care-service evidence so the team can understand the conditions surrounding the sepsis transition.',
    beats: [
      'Search for sepsis follow-up, medication reconciliation, readmission, or capacity pressure.',
      'Use semantic matches to connect the strongest signals to relevant care services.',
      'Carry the evidence into the pathway graph and coordinated response.',
    ],
  },
  graph: {
    eyebrow: 'Scene 4 - trace the care pathway',
    title: 'Follow CASE-SEPSIS-READMIT from admission to open care gaps.',
    body: 'The care pathway graph traces the de-identified case from the inpatient sepsis admission through discharge, the missed 48-hour follow-up, the open medication reconciliation gap, and the 7-day readmission risk. It makes the relationships between the patient journey, encounters, conditions, teams, facilities, procedures, and gaps visible.',
    beats: [
      'Open CASE-SEPSIS-READMIT or its de-identified anchor patient.',
      'Follow the multi-hop pathway from encounter evidence to care gaps and ownership.',
      'Use the graph findings to decide which follow-up action needs attention first.',
    ],
  },
  fulfillment: {
    eyebrow: 'Scene 5 - locate the care response',
    title: 'Find the care-site and logistics options that support timely follow-up.',
    body: 'The logistics map turns the same investigation into a spatial care-access view. Care sites, service zones, regional demand, routes, and capacity show where follow-up services can be coordinated and which nearby locations can support the response.',
    beats: [
      'Compare active care sites, current load, pending requests, and regional demand.',
      'Toggle spatial layers to inspect coverage, service zones, and care routes.',
      'Use proximity and capacity evidence to support a practical coordination decision.',
    ],
  },
  'service-requests': {
    eyebrow: 'Scene 6 - inspect the coordination record',
    title: 'Open the service requests behind the care response.',
    body: 'Care Service Requests shows the governed execution layer. Teams can inspect request rows, service items, status, routing context, and JSON duality documents without creating a separate application data store.',
    beats: [
      'Filter service requests by status and active VPD context.',
      'Open a request to compare relational details with its JSON duality document.',
      'Use the governed record as the operational handoff into analytics or agent action.',
    ],
  },
  oml: {
    eyebrow: 'Scene 7 - quantify the next risk',
    title: 'Score readmission exposure, demand, and capacity inside Oracle.',
    body: 'Risk and Capacity Analytics turns the investigation into predictive care operations. In-database models surface readmission and care-gap risk, forecast demand, and assess capacity needs without moving governed healthcare data out of Oracle.',
    beats: [
      'Review the active in-database models and persisted readiness evidence.',
      'Use risk and capacity results to prioritize the most exposed care scenarios.',
      'Carry those findings into Ask Healthcare Data or the agent workflow.',
    ],
  },
  askdata: {
    eyebrow: 'Scene 8 - ask the investigation questions',
    title: 'Interrogate the sepsis transition story in plain language.',
    body: 'Ask Healthcare Data lets care operations users ask about CASE-SEPSIS-READMIT, sepsis transitions, missed follow-up, medication reconciliation, readmission risk, service demand, and capacity. The assistant drafts governed SQL, Oracle executes it, and the answer stays grounded in live schema metadata.',
    beats: [
      'Ask story-specific questions in explain, chat, show SQL, or run SQL mode.',
      'Review generated SQL before executing governed queries.',
      'Use the answer as context for the Healthcare AI Agent Console.',
    ],
  },
  agents: {
    eyebrow: 'Scene 9 - coordinate the response',
    title: 'Convert the care-pathway evidence into audited action.',
    body: 'The Healthcare AI Agent Console closes the loop. Specialist agents route follow-up, care-navigation, capacity, and service tasks, call approved Oracle SQL and PL/SQL tools, and write each coordinated action to the agent audit trail.',
    beats: [
      'Ask the agents to review the sepsis follow-up and readmission-risk context.',
      'Let specialist teams coordinate work across care, logistics, and operational tools.',
      'Review recent actions so every response remains visible and auditable.',
    ],
  },
};

export function HealthcareStoryRail() {
  return (
    <div className="welcome-story-rail" aria-label="Sepsis readmission prevention story across the healthcare use cases">
      <div className="welcome-story-rail__intro">
        <span className="welcome-story-rail__kicker">Nine use cases, one sepsis readmission prevention story</span>
        <p>
          The demo follows NorthStar Health System&apos;s CASE-SEPSIS-READMIT from an inpatient sepsis admission through a missed
          48-hour follow-up, an open medication reconciliation gap, 7-day readmission risk, care-site and capacity decisions,
          governed analysis, and AI-assisted coordination. Each scene uses the same Oracle AI Database 26ai foundation.
        </p>
      </div>
      <ol className="welcome-story-rail__steps">
        {HEALTHCARE_STORY_STEPS.map((step) => (
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
    <section className="healthcare-story-panel" aria-label={`${story.title} story context`}>
      <div className="healthcare-story-panel__copy">
        <span className="healthcare-story-panel__eyebrow">{story.eyebrow}</span>
        <h3>{story.title}</h3>
        <p>{story.body}</p>
      </div>
      <ol className="healthcare-story-panel__beats">
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
