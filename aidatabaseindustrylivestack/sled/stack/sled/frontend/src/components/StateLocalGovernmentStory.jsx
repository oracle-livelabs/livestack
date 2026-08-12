const STATE_LOCAL_GOVERNMENT_STORY_STEPS = [
  {
    stage: '2',
    useCase: 'Data Foundation',
    summary: 'Confirm one governed Colorado baseline for residents, service requests, partners, access centers, regions, forecasts, and audit evidence.',
  },
  {
    stage: '3',
    useCase: 'Public Service Command Center',
    summary: 'Read the 2.7% Medicaid Eligibility Error Rate against the 3.0% demo threshold, then connect that early-warning signal to statewide workload pressure.',
  },
  {
    stage: '4',
    useCase: 'Resident Demand Signals',
    summary: 'Test whether Colorado residents and caseworkers are signaling eligibility, access, or service-pressure issues before they become a larger backlog.',
  },
  {
    stage: '5',
    useCase: 'Community Partner Network',
    summary: 'Trace which Colorado agencies, programs, and community partners can coordinate the next resident-service response.',
  },
  {
    stage: '6',
    useCase: 'Service Access & Coverage Map',
    summary: 'Compare Colorado service regions, centers, capacity, routes, and resident access under global, regional, and restricted VPD states.',
  },
  {
    stage: '7',
    useCase: 'Service Request Workbench',
    summary: 'Inspect one Colorado request, its Request Line Items, in-state assignment, and Service Task Route through Field Resolution Underway.',
  },
  {
    stage: '8',
    useCase: 'Backlog, Risk & Capacity Analytics',
    summary: 'Compare demand, resident need, and processing capacity across Colorado service centers before choosing where to intervene.',
  },
  {
    stage: '9',
    useCase: 'Ask State and Local Government Data',
    summary: 'Ask a Colorado operating question in plain language and inspect the governed SQL and result path behind the answer.',
  },
  {
    stage: '10',
    useCase: 'Public Service AI Agent Console',
    summary: 'Turn the statewide findings into a governed recommendation while preserving tool use, evidence, and an auditable action history.',
  },
];

const SCENE_STORIES = {
  datamodel: {
    eyebrow: 'Scene 2 - establish the governed Colorado record',
    title: 'Confirm one trusted statewide operating baseline.',
    body: 'Before Jessica interprets the Medicaid eligibility risk signal, she verifies that Colorado residents, requests, service centers, partner relationships, geographic layers, forecasts, and audit records come from the same governed Oracle AI Database 26ai foundation.',
    beats: [
      'Confirm the governed Colorado demo foundation is populated.',
      'Connect resident, request, partner, map, capacity, and audit records to later scenes.',
      'Use the same Oracle AI Database 26ai evidence throughout the decision.',
    ],
  },
  dashboard: {
    eyebrow: 'Scene 3 - detect the statewide operating pressure',
    title: 'Read the eligibility-risk signal before operating margin narrows.',
    body: 'The command center reports a 2.7% Medicaid Eligibility Error Rate against the stakeholder-provided 3.0% demo threshold. The rate is within threshold but marked Approaching Threshold, giving Jessica a reason to investigate resident demand, service pressure, and regional capacity before potential exposure increases.',
    beats: [
      'Interpret 2.7% as within the 3.0% limit, not above threshold.',
      'Connect the risk indicator to workload, service value, urgent signals, and capacity pressure.',
      'Choose a Colorado investigation thread for the remaining scenes.',
    ],
  },
  social: {
    eyebrow: 'Scene 4 - explain the Colorado resident signals',
    title: 'Test the eligibility-pressure hypothesis against resident evidence.',
    body: 'Resident Demand Signals uses vector search to connect plain-language Colorado resident and caseworker concerns to governed services. Jessica can test whether eligibility, appointment, access, or follow-up issues are emerging before they become a larger backlog or accuracy risk.',
    beats: [
      'Search for benefits eligibility appointment backlog.',
      'Compare semantic matches with the Colorado resident signal summary.',
      'Carry the strongest evidence into partner coordination.',
    ],
  },
  graph: {
    eyebrow: 'Scene 5 - trace the in-state coordination path',
    title: 'Connect Colorado agencies, programs, partners, and cases.',
    body: 'Eligibility and resident-service resolution can cross program, county, partner, and case-management boundaries. The Community Partner Network identifies which Colorado organizations and relationship paths can respond to the demand evidence found in the prior scene.',
    beats: [
      'Select the Benefits Eligibility service domain and inspect connected partners.',
      'Use two-hop evidence to expose the relevant handoff path.',
      'Validate the coordination candidate with SQL/PGQ.',
    ],
  },
  fulfillment: {
    eyebrow: 'Scene 6 - coordinate Colorado access and coverage',
    title: 'Compare in-state service regions, centers, routes, and capacity.',
    body: 'The map turns the statewide operating question into a geographic decision. Jessica compares Colorado service centers, resident locations, service regions, task routes, access tiers, and processing capacity without introducing out-of-state operational records.',
    beats: [
      'Review Colorado centers, pending tasks, and capacity signals.',
      'Compare the global view with regional and restricted VPD states.',
      'Use proximity and workload evidence to choose an in-state response option.',
    ],
  },
  orders: {
    eyebrow: 'Scene 7 - inspect the Colorado service request',
    title: 'Follow one resident request from intake into active resolution.',
    body: 'The Service Request Workbench connects one Colorado resident, an in-state service center, Request Line Items, route cost, relational and JSON views, and the Service Task Route. Field Resolution Underway means the assigned in-state team is actively resolving the request in the resident service area.',
    beats: [
      'Choose a Colorado request whose status supports the operating decision.',
      'Compare relational, JSON Duality, and Service Task Route views.',
      'Distinguish the request lifecycle from the field service-task lifecycle.',
    ],
  },
  oml: {
    eyebrow: 'Scene 8 - predict the next Colorado service constraint',
    title: 'Compare resident need, request demand, and in-state capacity.',
    body: 'Analytics turns the investigated request and resident signals into a forward-looking Colorado decision. In-database models compare demand risk, resident need segments, service value forecasts, clusters, and processing capacity across in-state service centers.',
    beats: [
      'Review active DBMS_DATA_MINING models and persisted outputs.',
      'Compare counties, service regions, and centers instead of states or national hubs.',
      'Choose where Colorado should monitor or rebalance capacity.',
    ],
  },
  askdata: {
    eyebrow: 'Scene 9 - ask the Colorado operations question',
    title: 'Interrogate the same operating decision in plain language.',
    body: 'Ask State and Local Government Data lets Jessica ask which Colorado service regions have the most eligibility-related request and capacity pressure, then compare a narrated answer, conversational response, generated SQL, and authorized result rows.',
    beats: [
      'Use Narrate, Chat, Show SQL, and Run SQL for the same Colorado question.',
      'Inspect generated SQL before authorized execution.',
      'Use Oracle result rows as the governed source of truth.',
    ],
  },
  agents: {
    eyebrow: 'Scene 10 - coordinate an audited Colorado action',
    title: 'Turn the statewide findings into a governed recommendation.',
    body: 'The agent console closes the loop. Jessica asks for an in-state response to the identified request and capacity pressure, then verifies that the recommendation is grounded in authorized Colorado data and recorded in the action audit trail.',
    beats: [
      'Ask which Colorado service centers have low capacity or need follow-up.',
      'Review tool calls, status, and source evidence.',
      'Keep human review and the audit trail visible before action.',
    ],
  },
};

export function StateLocalGovernmentStoryRail() {
  return (
    <div className="industry-story-rail" aria-label="One State and Local Government modernization story across use cases">
      <div className="industry-story-rail__intro">
        <span className="industry-story-rail__kicker">Nine operational use cases, one Colorado decision</span>
        <p>
          The eleven-scene runbook adds Welcome and the final data workflow around these nine operating scenes.
          Jessica follows a Colorado eligibility-risk signal through resident evidence, partner coordination, access,
          requests, capacity, governed questions, and audited action on one Oracle AI Database 26ai foundation.
        </p>
      </div>
      <ol className="industry-story-rail__steps">
        {STATE_LOCAL_GOVERNMENT_STORY_STEPS.map((step) => (
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
