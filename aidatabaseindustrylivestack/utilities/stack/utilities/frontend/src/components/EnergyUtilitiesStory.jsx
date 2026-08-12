const ENERGY_UTILITIES_STORY_STEPS = [
  {
    stage: '1',
    useCase: 'Data Foundation',
    summary: 'Load one governed baseline for OUT-1042, GLK-2208, PIPE-17A, WMB-4417, WWC-9031, WELL-NB-014, RFY-HCU-02, LNG-7842, EMS-1190, WO-23891, MP-6082, and CMP-4420.',
  },
  {
    stage: '2',
    useCase: 'Energy Operations Command Center',
    summary: 'Spot the Gulf Coast resilience event before it becomes separate electric, gas, water, wastewater, upstream, midstream, and downstream escalations.',
  },
  {
    stage: '3',
    useCase: 'Reliability, Production & Compliance Signals',
    summary: 'Explain the evidence across SAIDI/SAIFI, feeder load, pipeline pressure, leak SLA, water pressure, wastewater limits, well output, refinery throughput, HSE, and emissions.',
  },
  {
    stage: '4',
    useCase: 'Operational Event Graph',
    summary: 'Trace how outages, leaks, breaks, overflows, production issues, refinery constraints, LNG delays, HSE incidents, work orders, and compliance records connect.',
  },
  {
    stage: '5',
    useCase: 'Field Operations Logistics Map',
    summary: 'Prioritize crews, depots, restricted-access areas, safety zones, environmental zones, priority customers, and repair areas with Oracle Spatial evidence.',
  },
  {
    stage: '6',
    useCase: 'Utility Service Requests',
    summary: 'Open the customer operations layer: outage reports, gas odor calls, water leaks, sewer complaints, billing, collections, DER, EV, streetlight, and industrial requests.',
  },
  {
    stage: '7',
    useCase: 'Asset Risk & Capacity Analytics',
    summary: 'Predict transformer, feeder, pipeline, corrosion, pump, treatment plant, well, refinery, compressor, LNG, emissions, HSE, maintenance, and crew capacity risk.',
  },
  {
    stage: '8',
    useCase: 'Ask Energy & Utilities Data',
    summary: 'Ask the resilience story in plain language and let Oracle generate governed SQL over the live cross-sector schema.',
  },
  {
    stage: '9',
    useCase: 'Energy & Utilities AI Agent Console',
    summary: 'Convert findings into auditable actions for grid, gas, water, wastewater, production, pipeline, refinery, LNG, HSE, emissions, maintenance, dispatch, customer, and regulatory teams.',
  },
];

const SCENE_STORIES = {
  datamodel: {
    eyebrow: 'Scene 1 - establish the shared record',
    title: 'Build the cross-sector resilience baseline.',
    body: 'The demo starts by loading one Energy & Utilities foundation for a Gulf Coast storm and operating-stress event. Electric outage OUT-1042, gas leak GLK-2208, pipeline segment PIPE-17A, water main break WMB-4417, wastewater compliance event WWC-9031, well WELL-NB-014, production facility FAC-DELTA-03, refinery unit RFY-HCU-02, LNG cargo LNG-7842, emissions event EMS-1190, HSE incident HSE-3364, work order WO-23891, maintenance plan MP-6082, and compliance record CMP-4420 become the common records used downstream.',
    beats: [
      'Restore the governed Energy & Utilities demo foundation.',
      'Confirm electric, gas, water/wastewater, upstream, midstream, downstream, customer, field, HSE, emissions, and regulatory data are present.',
      'Use the same Oracle AI Database 26ai records in every scene.',
    ],
  },
  dashboard: {
    eyebrow: 'Scene 2 - detect the operating event',
    title: 'Spot the resilience event before it becomes six separate incidents.',
    body: 'The command center turns the storm into one operating view: an electric outage, gas leak response, water main break, wastewater compliance alert, pipeline pressure anomaly, refinery exception, LNG logistics risk, HSE incident, emissions alert, critical asset status, and field crew capacity all surface together.',
    beats: [
      'Start with the cross-sector status cards and exception lists.',
      'Look for linked customer, asset, field, and compliance pressure.',
      'Use the dashboard as the handoff into signals, graph, map, analytics, Ask Data, and agents.',
    ],
  },
  social: {
    eyebrow: 'Scene 3 - explain the signals',
    title: 'Find the reliability, production, and compliance evidence.',
    body: 'The signal scene explains why the event matters. Vector search links SAIDI/SAIFI, feeder utilization, gas pressure variance, leak response SLA, water pressure anomalies, wastewater discharge limits, well production variance, refinery throughput, vibration and temperature anomalies, emissions thresholds, HSE rates, maintenance backlog, crew capacity, and regulatory reporting status.',
    beats: [
      'Search for pipeline pressure, water leaks, emissions follow-up, or refinery constraints.',
      'Use semantic matches to connect bulletins to services, assets, and operating events.',
      'Carry the strongest signal evidence into the graph and agent workflows.',
    ],
  },
  graph: {
    eyebrow: 'Scene 4 - trace the event path',
    title: 'Connect events, assets, customers, work orders, and compliance.',
    body: 'The graph scene shows how OUT-1042, GLK-2208, WMB-4417, WWC-9031, PIPE-17A, WELL-NB-014, RFY-HCU-02, LNG-7842, EMS-1190, HSE-3364, affected customers, affected assets, crews, inspections, root causes, work orders, and compliance records interact as one operational event graph.',
    beats: [
      'Select an event, asset, crew, compliance record, or customer impact node.',
      'Increase graph depth to expose multi-hop root cause and shared-crew relationships.',
      'Use pathway findings to decide which resolution milestone needs attention first.',
    ],
  },
  fulfillment: {
    eyebrow: 'Scene 5 - coordinate the field response',
    title: 'Prioritize crews, depots, safety zones, and repair areas.',
    body: 'The logistics map turns the event into field execution. Electric outage locations, gas leak locations, water main break sites, wastewater overflow sites, pipeline segments, pump stations, substations, compressor stations, refineries, wells, LNG terminals, crews, depots, restricted access areas, priority customers, environmental zones, and safety zones are compared spatially.',
    beats: [
      'Review active field sites, crew locations, supply capacity, and pending logistics requests.',
      'Toggle spatial layers for service zones, demand regions, and repair-priority areas.',
      'Use proximity and safety evidence to support dispatch and restoration priorities.',
    ],
  },
  orders: {
    eyebrow: 'Scene 6 - inspect customer impact',
    title: 'Open the service-request record behind the incident.',
    body: 'Utility Service Requests shows how customer operations fit the event. Operators can inspect electric outage reports, billing inquiries, collections arrangements, high-usage concerns, move-in and move-out requests, gas odor and leak safety calls, water leak reports, low-pressure complaints, sewer overflow complaints, streetlight repairs, solar interconnection, EV upgrades, vegetation requests, industrial requests, and retail energy plan inquiries.',
    beats: [
      'Filter service requests by status and active VPD context.',
      'Compare relational rows with JSON duality documents for the same request.',
      'Use the record as the customer handoff into analytics or agent action.',
    ],
  },
  oml: {
    eyebrow: 'Scene 7 - predict the next constraint',
    title: 'Score asset risk, capacity, production, and compliance exposure.',
    body: 'Asset analytics turns the event into forward-looking decisions. In-database models score transformer overload, feeder congestion, pipeline integrity, corrosion, regulator station risk, pump station and treatment plant capacity, wastewater compliance, well production decline, refinery unit constraints, compressor reliability, LNG logistics capacity, turnaround readiness, emissions compliance, HSE risk, crew capacity, and replacement priority.',
    beats: [
      'Review active DBMS_DATA_MINING models and SQL fallback status.',
      'Use demand, forecast, cluster, and capacity views to prioritize exposed assets.',
      'Carry predictions into Ask Data or the agent console for auditable action.',
    ],
  },
  askdata: {
    eyebrow: 'Scene 8 - ask the investigation questions',
    title: 'Interrogate the resilience story in plain language.',
    body: 'Ask Energy & Utilities Data lets teams ask which electric feeders have the highest outage risk, which gas pipeline segments show pressure anomalies, which water zones have recurring leaks, which wastewater facilities are near compliance thresholds, which wells are underperforming, which refinery units constrain throughput, which LNG shipments are at risk, which emissions events need follow-up, and which service requests are breaching SLA.',
    beats: [
      'Use explain, chat, show SQL, or run SQL mode for story-specific questions.',
      'Review generated SQL before executing governed live-schema queries.',
      'Use the answer as context for specialist agent actions.',
    ],
  },
  agents: {
    eyebrow: 'Scene 9 - coordinate audited action',
    title: 'Turn cross-sector findings into operating actions.',
    body: 'The agent console closes the loop. Electric Grid Operations, Gas Operations, Water Network Operations, Wastewater Compliance, Oil & Gas Production, Pipeline Integrity, Refinery Operations, LNG Logistics, HSE & Emissions, Asset Maintenance, Field Dispatch, Customer Operations, and Regulatory Reporting agents summarize events, assess risk, triage incidents, prioritize work orders, recommend dispatch, and prepare regulated follow-up.',
    beats: [
      'Ask agents to summarize GLK-2208, assess PIPE-17A, explain WELL-NB-014, or prepare EMS-1190 follow-up.',
      'Let specialist teams call approved Oracle SQL and PL/SQL tools.',
      'Review recent actions so operational decisions remain auditable.',
    ],
  },
};

export function EnergyUtilitiesStoryRail() {
  return (
    <div className="energy-story-rail" aria-label="One resilience event across Energy and Utilities use cases">
      <div className="energy-story-rail__intro">
        <span className="energy-story-rail__kicker">Nine use cases, one cross-sector resilience story</span>
        <p>
          The demo follows a severe Gulf Coast operating event across electric reliability, gas safety, water and
          wastewater continuity, upstream production, midstream pipeline and LNG logistics, downstream refinery
          throughput, customer operations, HSE, emissions, field dispatch, and regulatory reporting. Each scene
          uses the same governed Oracle AI Database 26ai foundation so the story stays connected from data load
          through AI-assisted action.
        </p>
      </div>
      <ol className="energy-story-rail__steps">
        {ENERGY_UTILITIES_STORY_STEPS.map((step) => (
          <li key={step.useCase} className="energy-story-step">
            <span className="energy-story-step__stage">{step.stage}</span>
            <span className="energy-story-step__use-case">{step.useCase}</span>
            <span className="energy-story-step__summary">{step.summary}</span>
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
    <section className="energy-story-panel" aria-label={`${story.title} story context`}>
      <div className="energy-story-panel__copy">
        <span className="energy-story-panel__eyebrow">{story.eyebrow}</span>
        <h3>{story.title}</h3>
        <p>{story.body}</p>
      </div>
      <ol className="energy-story-panel__beats">
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
