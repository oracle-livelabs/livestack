const HOSPITALITY_STORY_STEPS = [
  {
    stage: '1',
    useCase: 'Data Foundation',
    summary: 'Load portfolio properties, brand tiers, rooms, Guest Rewards guests, reservations, group blocks, folios, property hotels, OML outputs, and agent audit history.',
  },
  {
    stage: '2',
    useCase: 'Portfolio Performance Command Center',
    summary: 'See occupancy, ADR, RevPAR, booking pace, guest satisfaction, owner exposure, open service work, revenue mix, and agent activity in one governed view.',
  },
  {
    stage: '3',
    useCase: 'Guest Rewards and Demand Signal Intelligence',
    summary: 'Search Guest Rewards member signals, reviews, channel discrepancies, demand spikes, event pressure, and operational alerts to understand why performance is changing.',
  },
  {
    stage: '4',
    useCase: 'Guest Experience Network',
    summary: 'Trace relationships among Guest Rewards members, reservations, rooms, service requests, venues, departments, owners, and properties behind recurring issues.',
  },
  {
    stage: '5',
    useCase: 'Arrival Readiness and Engineering Coverage',
    summary: 'Find which properties, floors, rooms, venues, and crews can absorb cleaning, event setup, and repair work while protecting arrival readiness.',
  },
  {
    stage: '6',
    useCase: 'Reservation and Folio Operations',
    summary: 'Inspect Guest Rewards reservations, folio charges, service routing, event blocks, and JSON duality documents from the same shared hospitality records.',
  },
  {
    stage: '7',
    useCase: 'Predictive RevPAR, Labor and Owner Value',
    summary: 'Score booking pace, cancellation risk, service capacity, ADR opportunity, labor pressure, owner economics, and guest cohorts with in-database OML.',
  },
  {
    stage: '8',
    useCase: 'Governed Hospitality Data Copilot',
    summary: 'Ask natural-language questions about occupancy, RevPAR, guest issues, channel mix, service load, and forecasted impact against governed views.',
  },
  {
    stage: '9',
    useCase: 'Hospitality Agent Console',
    summary: 'Turn findings into service recovery, housekeeping dispatch, maintenance routing, loyalty care, revenue actions, and audited AI-assisted next steps.',
  },
  {
    stage: '10',
    useCase: 'Owner Financial Validation Workbench',
    summary: 'Compare owner-reported property close revenue, fees, adjustments, and close inputs with governed Oracle evidence so owners review only explainable exceptions.',
  },
];

const SCENE_STORIES = {
  datamodel: {
    eyebrow: 'Scene 1 - load and check the demo data',
    title: 'Load the hospitality demo data.',
    body: 'Start by restoring the data used throughout the workshop. The dataset includes brand tiers, managed and franchised properties, room types, Guest Rewards members, reservations, group blocks, folios, demand signals, service areas, graph links, OML results, and agent audit records.',
    beats: [
      'Restore the Hospitality LiveStack demo data.',
      'Check the counts for properties, room types, guests, reservations, guest signals, graph links, and model results.',
      'Continue to Property Performance, which queries the same Oracle AI Database 26ai records.',
    ],
  },
  dashboard: {
    eyebrow: 'Scene 2 - detect the multi-brand portfolio issue',
    title: 'Spot RevPAR opportunity and guest-experience pressure before it becomes operational fallout.',
    body: 'The command center turns the portfolio story into a live operating picture: occupancy, ADR, RevPAR, affected brands, room types, arrival pressure, guest satisfaction, housekeeping load, maintenance backlog, revenue exposure, owner impact, and audited agent activity all come from the same Oracle foundation.',
    beats: [
      'Watch Guest Rewards booking pace, occupancy, room revenue, guest issues, and service load move together.',
      'Look for overbooking pressure, cancellation spikes, room-readiness risk, and revenue-center impact by brand tier.',
      'Use the dashboard as the handoff into signals, graph, service coverage, OML, and agents.',
    ],
  },
  social: {
    eyebrow: 'Scene 3 - explain the Guest Rewards and channel signals',
    title: 'Find the guest, channel, and demand signals driving the portfolio review.',
    body: 'Guest Rewards and Demand Signal Intelligence is the evidence-gathering chapter. Vector search and urgency scoring connect member feedback, OTA channel discrepancies, service complaints, event blocks, F&B demand, room-type exposure, and staffing pressure so executives can see why the pattern matters.',
    beats: [
      'Search for housekeeping delay, overbooking, cancellation spike, loyalty-care issue, or high-value guest impact.',
      'Use semantic matches to connect signals to portfolio properties, room types, reservations, member tiers, and guest segments.',
      'Escalate the strongest evidence into graph and agent workflows.',
    ],
  },
  graph: {
    eyebrow: 'Scene 4 - trace the Hospitality LiveStack experience path',
    title: 'Follow connected Guest Rewards members, reservations, rooms, venues, and service requests.',
    body: 'The graph scene shows how Guest Rewards members, reservations, rooms, event blocks, service requests, maintenance issues, channels, departments, owners, and properties are connected. The findings panel turns those paths into guest-experience and operations actions.',
    beats: [
      'Select members, reservations, rooms, channels, properties, owners, or service cases.',
      'Increase graph depth to expose multi-hop complaint and service-failure paths.',
      'Use connected-experience findings to decide where service recovery should start.',
    ],
  },
  fulfillment: {
    eyebrow: 'Scene 5 - protect arrival readiness',
    title: 'Route housekeeping, event setup, and engineering work while protecting guest commitments.',
    body: 'The coverage map turns the same portfolio story into operating capacity. Properties, room blocks, service zones, crew capacity, out-of-order rooms, event rooms, arrival windows, high-value guest coverage, and SLA pressure show where work can be routed or protected.',
    beats: [
      'Compare portfolio properties, room-readiness load, event setup work, service requests, and regional coverage.',
      'Toggle spatial layers to see properties, guest regions, and service-risk routes.',
      'Use proximity and capacity evidence to support housekeeping dispatch and maintenance decisions.',
    ],
  },
  orders: {
    eyebrow: 'Scene 6 - inspect the reservation record',
    title: 'Open the Guest Rewards reservation, folio, group block, and service details behind the operating decision.',
    body: 'Reservation and Folio Operations shows the governed execution layer. Operators can inspect reservation rows, folio state, loyalty attributes, service routing, event-block attribution, and JSON duality documents for the same shared hospitality records without creating a separate application store.',
    beats: [
      'Filter reservations and folios by status, channel, issue severity, and active VPD context.',
      'Open a reservation to compare relational rows with JSON duality payloads.',
      'Use the record as the operational handoff into analytics or agent action.',
    ],
  },
  oml: {
    eyebrow: 'Scene 7 - predict the next operating pressure',
    title: 'Score occupancy, booking pace, ADR opportunity, labor pressure, owner value, and guest cohorts inside Oracle.',
    body: 'OML turns the review into predictive hospitality operations. In-database models score demand, cancellation risk, housekeeping capacity, guest value, owner value, revenue impact, and brand/property segments without moving data out of Oracle.',
    beats: [
      'Review active model status and SQL fallback evidence.',
      'Use occupancy, capacity, revenue, owner-value, and cohort tabs to prioritize exposed properties and guest groups.',
      'Carry predictions into Ask Data or agent workflows for action.',
    ],
  },
  askdata: {
    eyebrow: 'Scene 8 - ask the operating questions',
    title: 'Interrogate the hospitality performance story in plain language.',
    body: 'Governed Hospitality Data Copilot lets executives and analysts ask about occupancy, ADR, RevPAR, Guest Rewards demand, channel mix, cancellations, guest issues, service capacity, labor pressure, owner exposure, and event impact. The assistant drafts governed SQL, Oracle executes it, and the answer stays grounded in live schema metadata.',
    beats: [
      'Ask story-specific questions in explain, chat, show SQL, or run SQL mode.',
      'Review generated SQL before executing governed queries.',
      'Use the answer as context for the Hospitality Agent Console.',
    ],
  },
  agents: {
    eyebrow: 'Scene 9 - coordinate the hospitality response',
    title: 'Convert portfolio findings into audited hospitality actions.',
    body: 'The agent console closes the loop. Specialist agents route service recovery, housekeeping dispatch, maintenance escalation, pricing review, loyalty care, event coordination, and guest follow-up through approved Oracle SQL and PL/SQL tools, then write every recommendation to the agent audit trail.',
    beats: [
      'Ask agents to check occupancy exposure, guest impact, room-readiness pressure, or revenue variance.',
      'Let specialist teams route work across signal, graph, service, reservation, loyalty, and operations tools.',
      'Review recent actions so hospitality decisions remain explainable and auditable.',
    ],
  },
  ownerfinancial: {
    eyebrow: 'Scene 10 - validate the owner-reported close',
    title: 'Move the owner from manual reconciliation to exception validation.',
    body: 'The final scene extends the governed hospitality journey into property finance. Oracle compares each synthetic owner-reported close line with reservation, folio, property, and rule evidence; AI explains the likely exceptions; and the owner validates, requests correction, marks timing, escalates, or adds a note without rebuilding the reconciliation.',
    beats: [
      'Filter the synthetic close population by period, region, property, owner, status, severity, metric, or tolerance.',
      'Run a versioned PL/SQL validation and inspect the exact rule, formula, sample records, JSON evidence, and AI rationale behind each exception.',
      'Record an explicit owner or finance decision so the action, actor, note, timestamp, and audit ID remain durable in Oracle.',
    ],
  },
};

export function HospitalityStoryRail() {
  return (
    <div className="welcome-story-rail" aria-label="hospitality performance and operations story across the use cases">
      <div className="welcome-story-rail__intro">
        <span className="welcome-story-rail__kicker">Ten use cases, one hospitality executive response story</span>
        <p>
          The demo follows one Guest Rewards-led demand surge and group-event arrival window from signal detection through
          guest-network investigation, room-readiness protection, predictive RevPAR, labor, and owner-value scoring,
          natural-language analysis, AI-assisted action, and owner close validation. The scenario proves how the same governed Oracle AI Database
          26ai foundation supports a complete hospitality performance conversation at global scale.
        </p>
      </div>
      <ol className="welcome-story-rail__steps">
        {HOSPITALITY_STORY_STEPS.map((step) => (
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

export function SceneStoryPanel({ scene, headingLevel = 3 }) {
  const story = SCENE_STORIES[scene];
  if (!story) return null;
  const Heading = headingLevel === 2 ? 'h2' : 'h3';

  return (
    <section className="hospitality-story-panel" aria-label={`${story.title} story context`}>
      <div className="hospitality-story-panel__copy">
        <span className="hospitality-story-panel__eyebrow">{story.eyebrow}</span>
        <Heading>{story.title}</Heading>
        <p>{story.body}</p>
      </div>
      <ol className="hospitality-story-panel__beats">
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
