const STUDENT_SUCCESS_STORY_STEPS = [
  { stage: '1', useCase: 'Data Foundation', summary: 'Restore the governed student-success dataset that connects services, requests, student signals, support relationships, campus capacity, predictions, and agent history.' },
  { stage: '2', useCase: 'Student Success Command Center', summary: 'Spot fall-term retention pressure, student-service demand, urgent requests, and intervention activity in one operating view.' },
  { stage: '3', useCase: 'Student Intent & Support Signals', summary: 'Use semantic search to understand advising, financial-aid, wellness, course-access, career, and belonging concerns.' },
  { stage: '4', useCase: 'Advisor, Program & Support Network', summary: 'Trace how advisors, programs, support offices, advocates, and alumni relationships can amplify or resolve a student need.' },
  { stage: '5', useCase: 'Campus Service Coverage', summary: 'Locate available service capacity and routing options before term-start demand becomes an access barrier.' },
  { stage: '6', useCase: 'Student Requests & Cases', summary: 'Inspect the governed request and case record that turns a signal into coordinated student-support work.' },
  { stage: '7', useCase: 'Predictive Student Success Analytics', summary: 'Forecast demand and capacity risk, segment engagement patterns, and prioritize intervention decisions in Oracle.' },
  { stage: '8', useCase: 'Ask Student Success Data', summary: 'Ask plain-language questions about enrollment, retention, service capacity, and support evidence.' },
  { stage: '9', useCase: 'Student Success Agent Console', summary: 'Turn evidence into guided, human-reviewable student-support and service actions with an auditable history.' },
];

const SCENE_STORIES = {
  datamodel: {
    eyebrow: 'Scene 1 — establish the record',
    title: 'Build the fall-term student-success baseline.',
    body: 'The journey starts with one governed foundation for the fall-term enrollment and retention event. The restore connects student services, requests, support signals, relationships, campus capacity, vectors, predictive outputs, and agent history before any team acts on the issue.',
    beats: ['Restore the synthetic student-success data foundation.', 'Confirm the live footprint for services, signals, requests, vectors, and semantic matches.', 'Use the same Oracle AI Database data in every downstream scene.'],
  },
  dashboard: {
    eyebrow: 'Scene 2 — detect the operating issue',
    title: 'Spot retention pressure before students lose momentum.',
    body: 'The command center turns the fall-term event into a live operating picture: rising demand for advising and financial aid, urgent support signals, active student requests, service-capacity pressure, and intervention activity all come from the same Oracle foundation.',
    beats: ['Watch service demand, requests, and student signals move together.', 'Look for retention pressure, urgent needs, and constrained support capacity.', 'Use the dashboard as the handoff into signals, network, coverage, analytics, and agents.'],
  },
  social: {
    eyebrow: 'Scene 3 — explain the signals',
    title: 'Find the student concerns behind the retention risk.',
    body: 'Student Intent & Support Signals is the evidence-gathering chapter. Vector search and urgency scoring connect advising, FAFSA verification, emergency aid, course access, wellness, career support, and belonging concerns to the services that can respond.',
    beats: ['Search for a student-support concern such as emergency aid or advising.', 'Use semantic matches to connect signals to relevant student services.', 'Carry the strongest evidence into the network and action workflows.'],
  },
  graph: {
    eyebrow: 'Scene 4 — trace the support path',
    title: 'Follow the relationships behind a student-support need.',
    body: 'The network scene traces the advisor, program, support office, advocate, and alumni relationships that shape a student response. Its findings turn live relationship paths into coordinated referral, stewardship, and intervention decisions.',
    beats: ['Select advisors, programs, services, advocates, or student-support signals.', 'Increase graph depth to expose multi-hop referral and collaboration paths.', 'Use the connected evidence to decide where an intervention should begin.'],
  },
  fulfillment: {
    eyebrow: 'Scene 5 — protect access',
    title: 'Find the service-capacity path that keeps support available.',
    body: 'Campus Service Coverage turns the same story into access operations. Service sites, coverage zones, demand regions, routes, and capacity indicators show where students can be served, rerouted, or queued before term-start pressure becomes a barrier.',
    beats: ['Compare service sites, available capacity, demand regions, and active routes.', 'Toggle spatial layers to see coverage and demand together.', 'Use proximity and capacity evidence to support a service-routing decision.'],
  },
  orders: {
    eyebrow: 'Scene 6 — inspect the intervention record',
    title: 'Open the request behind the support decision.',
    body: 'Student Requests & Cases shows the governed execution layer. Teams can inspect request rows, supporting line items, service-routing state, and JSON duality documents for the same student-service record without creating a separate application data store.',
    beats: ['Filter requests by status and active access context.', 'Open a request to compare relational rows with its JSON duality payload.', 'Use the record as the operational handoff into analytics or agent action.'],
  },
  oml: {
    eyebrow: 'Scene 7 — predict the next constraint',
    title: 'Prioritize student demand and service-capacity risk inside Oracle.',
    body: 'OML turns the fall-term event into predictive student-success operations. In-database models forecast service demand and value, segment engagement patterns, and surface capacity risk without moving governed student-success data out of Oracle.',
    beats: ['Review active models and their persisted readiness.', 'Use demand, engagement, forecast, and capacity views to prioritize intervention.', 'Carry predictions into Ask Data or agent workflows for action.'],
  },
  askdata: {
    eyebrow: 'Scene 8 — ask the investigation questions',
    title: 'Interrogate the student-success story in plain language.',
    body: 'Ask Student Success Data lets leaders investigate enrollment, retention, advising, financial aid, service capacity, and advancement evidence. The assistant drafts governed SQL, Oracle executes it, and the answer remains grounded in live schema metadata.',
    beats: ['Ask a story-specific question in explain, chat, show SQL, or run SQL mode.', 'Review generated SQL before executing governed queries.', 'Use the result as context for a human-reviewed action.'],
  },
  agents: {
    eyebrow: 'Scene 9 — coordinate the response',
    title: 'Convert evidence into auditable student-success action.',
    body: 'The agent console closes the loop. Specialist agents route signal, capacity, campus-service, and student-success tasks through approved Oracle tools, then write each recommendation and action to the audit trail for human review.',
    beats: ['Ask agents to check a student-service need or capacity context.', 'Route work across signal, campus-service, and student-success teams.', 'Review recent actions so intervention decisions remain auditable.'],
  },
};

export function HigherEdStoryRail() {
  return <div className="welcome-story-rail" aria-label="Fall-term student success story across nine use cases">
    <div className="welcome-story-rail__intro">
      <span className="welcome-story-rail__kicker">Nine use cases, one fall-term student-success story</span>
      <p>The demo follows a fall-term enrollment and retention event from its governed data foundation through signals, support networks, campus capacity, student requests, predictive analysis, natural-language investigation, and AI-assisted action.</p>
    </div>
    <ol className="welcome-story-rail__steps">
      {STUDENT_SUCCESS_STORY_STEPS.map((step) => <li key={step.useCase} className="welcome-story-step"><span className="welcome-story-step__stage">{step.stage}</span><span className="welcome-story-step__use-cases">{step.useCase}</span><span className="welcome-story-step__summary">{step.summary}</span></li>)}
    </ol>
  </div>;
}

export function SceneStoryPanel({ scene }) {
  const story = SCENE_STORIES[scene];
  if (!story) return null;
  return <section className="highered-story-panel" aria-label={`${story.title} story context`}>
    <div className="highered-story-panel__copy"><span className="highered-story-panel__eyebrow">{story.eyebrow}</span><h3>{story.title}</h3><p>{story.body}</p></div>
    <ol className="highered-story-panel__beats">{story.beats.map((beat, index) => <li key={beat}><span>{index + 1}</span><p>{beat}</p></li>)}</ol>
  </section>;
}
