const FINANCE_STORY_STEPS = [
  {
    stage: '1',
    useCase: 'Risk and Operations Dashboard',
    summary: 'See AML exposure, payment anomalies, case backlog, SLA pressure, product impact, and agent activity in one operating view.',
  },
  {
    stage: '2',
    useCase: 'Risk Monitor',
    summary: 'Search fraud, AML, market, compliance, and client-behavior signals to understand why a payment-risk pattern is accelerating.',
  },
  {
    stage: '3',
    useCase: 'Financial Crime Network',
    summary: 'Trace shared accounts, devices, payees, merchants, cases, and regions that explain the connected-risk path behind suspicious activity.',
  },
  {
    stage: '4',
    useCase: 'Client Service and SLA Coverage',
    summary: 'Find which branches, service centers, and regions can absorb investigation load while protecting high-value clients and SLA commitments.',
  },
  {
    stage: '5',
    useCase: 'Transaction and Case Operations',
    summary: 'Inspect transaction rows and JSON duality documents so fraud, risk, and operations teams work from the same case records.',
  },
  {
    stage: '6',
    useCase: 'Risk, Capacity and Revenue Forecasts',
    summary: 'Score risk exposure, case capacity, revenue impact, attrition, and client cohorts with in-database OML and Oracle-native analytics.',
  },
  {
    stage: '7',
    useCase: 'Finance Data Copilot',
    summary: 'Ask natural-language questions about AML alerts, payment exposure, client risk, service load, and forecasted impact using approved views.',
  },
  {
    stage: '8',
    useCase: 'Operations Agent Console',
    summary: 'Turn findings into fraud review, client outreach, compliance escalation, SLA protection, and audited AI-assisted next actions.',
  },
];

const SCENE_STORIES = {
  datamodel: {
    eyebrow: 'Scene 1 - establish the record',
    title: 'Build the Seer Bank risk baseline.',
    body: 'Start by loading the finance data for an AML and payments-risk investigation. The restore connects products, clients, transactions, warning signs, service geography, graph links, OML models, and agent history before you open the dashboard.',
    beats: [
      'Restore the Seer Bank demo data.',
      'Confirm the live footprint across products, clients, transactions, fraud signals, graph links, and model outputs.',
      'Use the same Oracle AI Database 26ai data in every risk, service, and agent workflow.',
    ],
  },
  dashboard: {
    eyebrow: 'Scene 2 - detect the operating issue',
    title: 'Spot financial-crime exposure before it becomes customer and compliance fallout.',
    body: 'The dashboard shows suspicious payment activity, affected products, case volume, regional service pressure, revenue exposure, and agent activity from the same Oracle database.',
    beats: [
      'Watch exposure, client activity, case backlog, and service load move together.',
      'Look for AML pressure, fraud concentration, SLA risk, and product-level impact.',
      'Use the dashboard as the handoff into signals, graph, service coverage, OML, and agents.',
    ],
  },
  social: {
    eyebrow: 'Scene 3 - explain the signals',
    title: 'Find the AML and payments signals driving the investigation.',
    body: 'The risk monitor helps explain the warnings. Vector search and urgency scoring connect transaction alerts, compliance bulletins, client-behavior changes, fraud notes, product exposure, and service pressure.',
    beats: [
      'Search for payment anomaly, AML escalation, or high-value client exposure.',
      'Use semantic matches to connect signals to products, cases, and clients.',
      'Send the strongest matches to the graph and agent workflows.',
    ],
  },
  graph: {
    eyebrow: 'Scene 4 - trace the risk path',
    title: 'Follow connected accounts, devices, payees, and cases.',
    body: 'The graph scene shows how clients, accounts, devices, IP addresses, merchants, payees, regions, and fraud cases are connected. The findings panel turns those paths into investigator-ready financial-crime actions.',
    beats: [
      'Select accounts, clients, devices, merchants, payees, or cases.',
      'Increase graph depth to expose multi-hop fraud and exposure paths.',
      'Use connected-risk findings to decide where investigation work should start.',
    ],
  },
  fulfillment: {
    eyebrow: 'Scene 5 - protect service capacity',
    title: 'Route investigation load while protecting client SLAs.',
    body: 'The coverage map shows service capacity. Branches, service centers, regions, case queues, high-value client coverage, and SLA pressure show where reviews can be routed or protected.',
    beats: [
      'Compare service centers, case load, SLA exposure, and regional coverage.',
      'Toggle spatial layers to see branches, client regions, and service-risk routes.',
      'Use distance and capacity data to support case routing and client-service decisions.',
    ],
  },
  orders: {
    eyebrow: 'Scene 6 - inspect the execution record',
    title: 'Open the transaction and case details behind the risk decision.',
    body: 'Transaction and Case Operations shows the records behind each decision. Inspect transaction rows, case state, service routing, and JSON duality documents without creating a separate application store.',
    beats: [
      'Filter transactions and cases by status, risk, and active VPD context.',
      'Open a case to compare relational rows with JSON duality payloads.',
      'Use the record as the operational handoff into analytics or agent action.',
    ],
  },
  oml: {
    eyebrow: 'Scene 7 - predict the next exposure',
    title: 'Score risk, case pressure, revenue impact, and client cohorts inside Oracle.',
    body: 'OML adds forecasts to the investigation. In-database models score fraud exposure, operational capacity, client attrition, product risk, revenue impact, and customer segments without moving data out of Oracle.',
    beats: [
      'Review active model status and SQL fallback details.',
      'Use risk, capacity, and revenue tabs to prioritize exposed products and client groups.',
      'Carry predictions into Ask Data or agent workflows for action.',
    ],
  },
  askdata: {
    eyebrow: 'Scene 8 - ask the investigation questions',
    title: 'Ask finance risk questions in plain language.',
    body: 'Finance Data Copilot lets analysts ask about AML alerts, payment exposure, high-risk clients, service capacity, revenue impact, and case backlog. The assistant drafts SQL, Oracle runs it, and the answer uses the live finance schema.',
    beats: [
      'Ask focused questions in Explain, Chat, Show SQL, or Run SQL mode.',
      'Review generated SQL before running a query.',
      'Use the answer as context for the AI Operations Agent Console.',
    ],
  },
  agents: {
    eyebrow: 'Scene 9 - coordinate the response',
    title: 'Convert risk findings into audited finance actions.',
    body: 'The agent console turns findings into action. Specialist agents route fraud review, compliance escalation, client outreach, service protection, and case follow-up through approved Oracle SQL and PL/SQL tools, then record each recommendation in the agent audit trail.',
    beats: [
      'Ask agents to check payment exposure, client impact, or SLA risk.',
      'Let specialist teams route work across signal, graph, service, and operations tools.',
      'Review recent actions so finance decisions remain explainable and auditable.',
    ],
  },
};

export function FinanceStoryRail() {
  return (
    <div className="welcome-story-rail" aria-label="Financial crime and operations story across the finance use cases">
      <div className="welcome-story-rail__intro">
        <span className="welcome-story-rail__kicker">Eight use cases for one fraud and compliance response</span>
        <p>
          The demo follows one AML and payments-risk pattern from signal detection through graph investigation,
          service-capacity protection, predictive risk scoring, natural-language analysis, and AI-recommended action.
          Each scene uses the same Oracle AI Database 26ai data for the finance operations workflow.
        </p>
      </div>
      <ol className="welcome-story-rail__steps">
        {FINANCE_STORY_STEPS.map((step) => (
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
    <section className="finance-story-panel" aria-label={`${story.title} story context`}>
      <div className="finance-story-panel__copy">
        <span className="finance-story-panel__eyebrow">{story.eyebrow}</span>
        <h3>{story.title}</h3>
        <p>{story.body}</p>
      </div>
      <ol className="finance-story-panel__beats">
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
