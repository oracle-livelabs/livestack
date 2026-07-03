const MANUFACTURING_STORY_STEPS = [
  {
    stage: '1',
    useCase: 'Data Foundation',
    summary: 'Load the Seer Manufacturing dataset that links AX-400 parts, WO-4501, CircuitForge, PCB Rev C, plants, signals, graph evidence, OML outputs, and agent audit history.',
  },
  {
    stage: '2',
    useCase: 'Operations Command Center',
    summary: 'Spot reduced throughput, rising quality defects, AX-400 schedule variance, supplier pressure, capacity exposure, and agent activity in one operating view.',
  },
  {
    stage: '3',
    useCase: 'Production Signal Monitor',
    summary: 'Search telemetry, quality bulletins, supplier updates, and demand signals to understand why Servo Drive Controller AX-400 is under pressure.',
  },
  {
    stage: '4',
    useCase: 'Supplier and Production-Risk Graph',
    summary: 'Trace the path from CircuitForge to PCB Rev C, AX-400, WO-4501, Detroit Line A, scrap risk, and schedule recovery actions.',
  },
  {
    stage: '5',
    useCase: 'Plant Capacity and Routing Map',
    summary: 'Find which plants and production lines can absorb AX-400 demand, where OEE and line capacity are tight, and how work-order routes affect recovery options.',
  },
  {
    stage: '6',
    useCase: 'Work Orders',
    summary: 'Inspect governed work-order rows and JSON duality documents so production teams see the same AX-400 context through both interfaces.',
  },
  {
    stage: '7',
    useCase: 'OML Demand and Capacity Analytics',
    summary: 'Score demand, capacity planning, scrap exposure, downtime risk, customer commitments, and manufactured-part clusters with in-database OML.',
  },
  {
    stage: '8',
    useCase: 'Ask Manufacturing Data',
    summary: 'Ask natural-language questions about WO-4501, AX-400, supplier delay, scrap, downtime, and plant capacity against governed Oracle views.',
  },
  {
    stage: '9',
    useCase: 'Manufacturing Agent Console',
    summary: 'Turn findings into supplier follow-up, line-balancing, maintenance windows, quality containment, and corrective actions through audited AI agent workflows.',
  },
];

const SCENE_STORIES = {
  datamodel: {
    eyebrow: 'Scene 1 - establish the record',
    title: 'Build the AX-400 recovery baseline.',
    body: 'The journey starts by loading one governed manufacturing foundation for Servo Drive Controller AX-400. The restore connects work orders, suppliers, constrained materials, plant capacity, production signals, vectors, graph evidence, OML artifacts, and agent history before any scene is explored.',
    beats: [
      'Restore the Seer Manufacturing data foundation.',
      'Confirm the live footprint from the database-reported counts for parts, signals, work orders, vectors, and semantic matches.',
      'Use the same Oracle AI Database 26ai data in every downstream workflow.',
    ],
  },
  dashboard: {
    eyebrow: 'Scene 2 - detect the operating issue',
    title: 'Spot reduced throughput and quality defects before they become missed output.',
    body: 'The command center turns the AX-400 recovery story into a live operating picture: reduced throughput on Detroit Line A, rising scrap and quality defects, supplier pressure for PCB Rev C, work-order schedule variance, high-demand manufactured parts, routed work, and audited agent actions all come from the same Oracle foundation.',
    beats: [
      'Watch throughput, work-order activity, and production signals move together.',
      'Look for AX-400 demand pressure, line-capacity exposure, OEE degradation, and scrap risk.',
      'Use the dashboard as the handoff into signals, graph, capacity, OML, and agents.',
    ],
  },
  'production-signals': {
    eyebrow: 'Scene 3 - explain the signals',
    title: 'Find the production and quality signals driving AX-400 risk.',
    body: 'Production Signal Monitor is the evidence-gathering chapter. Vector search and urgency scoring connect servo controller demand, supplier updates, machine telemetry, quality inspection notes, scrap-rate alerts, predictive maintenance findings, and schedule recovery signals.',
    beats: [
      'Search for servo controller shortage, PCB constraint, or AX-400 scrap risk.',
      'Use semantic matches to connect production signals to manufactured parts.',
      'Escalate the strongest signal evidence into graph and agent workflows.',
    ],
  },
  graph: {
    eyebrow: 'Scene 4 - trace the risk path',
    title: 'Follow the supplier-to-work-order chain behind WO-4501.',
    body: 'The graph scene rebuilds current supplier-to-part-to-work-order-to-plant paths and connects production signals to the parts and work orders they support. The findings panel turns those live relational paths into supplier, capacity, and schedule actions.',
    beats: [
      'Select suppliers, parts, plants, work orders, production signals, or risk cases.',
      'Increase graph depth to expose multi-hop supplier, capacity, signal, and schedule paths.',
      'Use production-risk findings to decide where recovery work should start.',
    ],
  },
  fulfillment: {
    eyebrow: 'Scene 5 - rebalance capacity',
    title: 'Find the production-line capacity path that keeps AX-400 output moving.',
    body: 'The map chapter turns the same recovery story into spatial plant operations. Plant sites, production lines, capacity centers, maintenance windows, demand regions, routes, and customer-account risk tiers show where AX-400 production can be shifted, protected, or queued for capacity planning.',
    beats: [
      'Compare active plants, line capacity, OEE, pending work orders, maintenance windows, and capacity alerts.',
      'Toggle spatial layers to see plant coverage, production demand regions, and work-order production routes.',
      'Use proximity and capacity evidence to support line-balancing and throughput recovery decisions.',
    ],
  },
  'work-orders': {
    eyebrow: 'Scene 6 - inspect the execution record',
    title: 'Open the work-order details behind the recovery decision.',
    body: 'Work Orders shows the governed execution layer. Operators can inspect rows, line items, routing state, and JSON duality documents for the same manufacturing records without creating a separate application data store.',
    beats: [
      'Filter work orders by status and active VPD context.',
      'Open a work order to compare relational rows with JSON duality payloads.',
      'Use the record as the operational handoff into analytics or agent action.',
    ],
  },
  oml: {
    eyebrow: 'Scene 7 - predict the next constraint',
    title: 'Score demand, scrap, downtime, and capacity risk inside Oracle.',
    body: 'OML turns the AX-400 recovery story into predictive manufacturing operations. In-database models score demand, customer commitments, order value, manufactured-part clusters, scrap exposure, downtime risk, and capacity planning signals without moving data out of Oracle.',
    beats: [
      'Review active DBMS_DATA_MINING models and persisted model readiness.',
      'Use demand and capacity tabs to prioritize exposed manufactured parts.',
      'Carry predictions into Ask Data or agent workflows for action.',
    ],
  },
  askdata: {
    eyebrow: 'Scene 8 - ask the investigation questions',
    title: 'Interrogate the AX-400 recovery story in plain language.',
    body: 'Ask Manufacturing Data lets production supervisors ask about WO-4501, AX-400, supplier delay, downtime, scrap, OEE, throughput, capacity, and schedule variance. The assistant drafts governed SQL, Oracle executes it, and the answer stays grounded in live schema metadata.',
    beats: [
      'Ask story-specific questions in explain, chat, show SQL, or run SQL mode.',
      'Review generated SQL before executing governed queries.',
      'Use the answer as context for the Manufacturing Agent Console.',
    ],
  },
  agents: {
    eyebrow: 'Scene 9 - coordinate the response',
    title: 'Convert AX-400 findings into audited manufacturing actions.',
    body: 'The agent console closes the loop. Specialist agents route signal, capacity, maintenance, quality, and work-order tasks, call approved Oracle SQL and PL/SQL tools, and write each root cause review, containment step, and corrective action to the agent audit trail.',
    beats: [
      'Ask agents to check AX-400 capacity or supplier-risk context.',
      'Let specialist teams route work across signal, plant capacity, and operations tools.',
      'Review recent actions so recovery decisions remain auditable.',
    ],
  },
};

export function ManufacturingStoryRail() {
  return (
    <div className="welcome-story-rail" aria-label="AX-400 production recovery story across the manufacturing use cases">
      <div className="welcome-story-rail__intro">
        <span className="welcome-story-rail__kicker">Nine use cases, one AX-400 recovery story</span>
        <p>
          The demo follows Servo Drive Controller AX-400 from supplier delay and constrained PCB material through production signals,
          work-order schedule risk, plant capacity decisions, OML scoring, natural-language analysis, and AI-assisted corrective action.
          Each scene proves how the same governed Oracle AI Database 26ai foundation supports a complete manufacturing operations conversation.
        </p>
      </div>
      <ol className="welcome-story-rail__steps">
        {MANUFACTURING_STORY_STEPS.map((step) => (
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
    <section className="manufacturing-story-panel" aria-label={`${story.title} story context`}>
      <div className="manufacturing-story-panel__copy">
        <span className="manufacturing-story-panel__eyebrow">{story.eyebrow}</span>
        <h3>{story.title}</h3>
        <p>{story.body}</p>
      </div>
      <ol className="manufacturing-story-panel__beats">
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
