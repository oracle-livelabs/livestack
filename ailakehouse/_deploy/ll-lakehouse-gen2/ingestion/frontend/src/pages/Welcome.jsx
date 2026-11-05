import { useEffect, useMemo, useState } from 'react';
import {
  BarChart3,
  BookOpen,
  Bot,
  Brain,
  CheckCircle2,
  ClipboardCheck,
  Clock,
  Database,
  FileSearch,
  Lock,
  Map,
  MessageSquare,
  Network,
  Package,
  Plug,
  RefreshCw,
  Share2,
  ShieldCheck,
  Sparkles,
  Tags,
  Wrench,
  X,
  Zap,
} from 'lucide-react';

const BATCH_FILE_LOADING_LABEL = 'Batch & File Loading (Data Studio)';
const REAL_TIME_STREAMING_LABEL = 'Real-Time Streaming';
const CHANGE_DATA_CAPTURE_LABEL = 'Change Data Capture (GoldenGate Studio)';
const DATA_PROCESSING_LABEL = 'Transform Iceberg Data';
const CONVERGED_QUERIES_LABEL = 'Converged Multi-Model Queries';
const GRAPH_ANALYTICS_LABEL = 'Graph Analytics';
const SPATIAL_ANALYTICS_LABEL = 'Spatial Analytics';
const NATURAL_LANGUAGE_SQL_LABEL = 'Natural Language to SQL';
const AI_AGENTS_LABEL = 'AI Agents';

const PEAKGEAR_RETAIL_CHALLENGES = [
  {
    title: 'Demand volatility',
    detail: 'Live demand signals show how trends can form before planning cycles catch up.',
  },
  {
    title: 'Inventory imbalance',
    detail: 'Forecasting and inventory intelligence surface stockout, capacity, and revenue-at-risk situations.',
  },
  {
    title: 'Fulfillment pressure',
    detail: 'Spatial service zones and store fulfillment sites show how location affects delivery decisions.',
  },
  {
    title: 'Returns relationship risk',
    detail: 'Graph analytics exposes suspicious customer, order, and return patterns that rows alone can hide.',
  },
  {
    title: 'Disconnected data and AI',
    detail: 'Bronze, Silver, Gold, vector search, NL2SQL, and agents all run on governed operational data.',
  },
];

const PEAKGEAR_ACTIONS = [
  'Spot trending products early',
  'Predict demand surges',
  'Identify inventory at risk',
  'Route fulfillment with spatial intelligence',
  'Detect suspicious return relationships through graph analytics',
  'Let shoppers search by intent instead of SKU',
  'Let business users ask questions in natural language',
  'Ground AI decisions in live operational data',
];

const ARCHITECTURE_STAGES = [
  {
    title: 'Source Channels',
    elements: [
      {
        title: 'PeakGear Webshop',
        Icon: Package,
        info: 'Customer browsing, product discovery, image search, carts, and orders generate fast-moving commerce signals.',
      },
      {
        title: 'Demand Signals',
        Icon: Zap,
        info: 'Kafka-style live events represent social, product-page, and commerce activity that can reveal demand before batch reports.',
      },
      {
        title: 'Fulfillment Sites',
        Icon: Map,
        info: 'Store and fulfillment-center locations provide the spatial context for service zones, delivery options, and capacity pressure.',
      },
      {
        title: 'Returns Activity',
        Icon: Network,
        info: 'Customer, order, product, and relationship data support graph analysis for suspicious return patterns.',
      },
      {
        title: 'NetSuite Customers',
        Icon: Database,
        info: 'Operational customer records change in the source system and are replicated into Bronze for current customer context.',
      },
    ],
  },
  {
    title: 'Ingest & Prepare',
    elements: [
      {
        title: 'Kafka + OSA',
        Icon: RefreshCw,
        info: 'Real-time demand signals flow through streaming infrastructure and GoldenGate Stream Analytics into the lakehouse.',
      },
      {
        title: 'GoldenGate Studio CDC',
        Icon: RefreshCw,
        info: 'Source database changes are captured and applied into the Bronze customer mirror as they happen.',
      },
      {
        title: 'Bronze',
        Icon: Database,
        info: 'Raw product, order, inventory, image, and demand-signal data lands with source shape preserved for traceability.',
      },
      {
        title: 'Silver',
        Icon: Wrench,
        info: 'Data Transforms standardizes, deduplicates, types, and enriches Bronze data into analytics-ready tables.',
      },
      {
        title: 'Gold',
        Icon: CheckCircle2,
        info: 'Curated data products feed the catalog, webshop, dashboards, orders, fulfillment views, and analytics use cases.',
      },
    ],
  },
  {
    title: 'Oracle AI Lakehouse',
    elements: [
      {
        title: 'Autonomous Database',
        Icon: Database,
        info: 'The governed Oracle foundation stores operational, analytical, spatial, graph, JSON, and vector data in one platform.',
      },
      {
        title: 'JSON Duality',
        Icon: BookOpen,
        info: 'Relational data can be exposed as application-friendly JSON documents without duplicating records.',
      },
      {
        title: 'Spatial + Graph',
        Icon: Network,
        info: 'Location intelligence and relationship analytics help explain fulfillment options and returns risk.',
      },
      {
        title: 'Vector + ML',
        Icon: Brain,
        info: 'Embeddings, similarity search, forecasts, and ML outputs support intent search and demand intelligence.',
      },
    ],
  },
  {
    title: 'Serve & Act',
    elements: [
      {
        title: 'Apps + APIs',
        Icon: Plug,
        info: 'ORDS-backed APIs and app pages serve catalog, orders, webshop, dashboard, and fulfillment experiences.',
      },
      {
        title: 'Ask Data',
        Icon: MessageSquare,
        info: 'Natural language questions are translated into governed SQL over live business data.',
      },
      {
        title: 'AI Agents',
        Icon: Bot,
        info: 'Agents reason over live data, call tools, and record audit trails for explainable business actions.',
      },
      {
        title: 'Governance',
        Icon: ShieldCheck,
        info: 'Security, metadata, lineage, and policy controls keep data and AI use trustworthy across the workflow.',
      },
    ],
  },
];

const DEMO_TILE_ROUTES = {
  [REAL_TIME_STREAMING_LABEL]: {
    sectionId: 'ingest',
    pageId: 'streaming',
    expandGroup: 'ingest',
    enabledTitle: 'Open real-time streaming demo',
  },
  [CHANGE_DATA_CAPTURE_LABEL]: {
    sectionId: 'ingest',
    pageId: 'customer-cdc',
    expandGroup: 'ingest',
    enabledTitle: 'Open GoldenGate Studio CDC demo',
  },
  [BATCH_FILE_LOADING_LABEL]: {
    sectionId: 'ingest',
    pageId: 'bronze-load',
    expandGroup: 'ingest',
    enabledTitle: 'Open Bronze data load demo',
  },
  [DATA_PROCESSING_LABEL]: {
    sectionId: 'transform',
    pageId: 'silver-process',
    expandGroup: 'transform',
    enabledTitle: 'Open Silver process demo',
  },
  [CONVERGED_QUERIES_LABEL]: {
    sectionId: 'serve-data',
    pageId: 'dashboard',
    expandGroup: 'serve-data',
    enabledTitle: 'Open Operations Dashboard demo',
  },
  [GRAPH_ANALYTICS_LABEL]: {
    sectionId: 'serve-data',
    pageId: 'graph',
    expandGroup: 'serve-data',
    enabledTitle: 'Open Returns Risk Network demo',
  },
  [SPATIAL_ANALYTICS_LABEL]: {
    sectionId: 'serve-data',
    pageId: 'fulfillment',
    expandGroup: 'serve-data',
    enabledTitle: 'Open Store Fulfillment Map demo',
  },
  [NATURAL_LANGUAGE_SQL_LABEL]: {
    sectionId: 'serve-ai',
    pageId: 'askdata',
    expandGroup: 'serve-ai',
    enabledTitle: 'Open Ask Your Data demo',
  },
  [AI_AGENTS_LABEL]: {
    sectionId: 'serve-ai',
    pageId: 'agents',
    expandGroup: 'serve-ai',
    enabledTitle: 'Open Retail Operations Agents demo',
  },
};

export const LAKEHOUSE_SECTIONS = [
  {
    id: 'ingest',
    navLabel: 'Ingest',
    tag: 'Step 1',
    title: 'Connect & Ingest',
    subtitle: 'Bring enterprise data together from every source - streaming, operational, and batch - into one unified platform without building separate pipelines.',
    accent: '#437C94',
    Icon: Zap,
    capabilities: [
      {
        Icon: Zap,
        title: REAL_TIME_STREAMING_LABEL,
        desc: 'Ingest high-velocity event streams from IoT sensors, clickstreams, transactions, and application logs in real time with Apache Kafka integration.',
      },
      {
        Icon: RefreshCw,
        title: CHANGE_DATA_CAPTURE_LABEL,
        desc: 'Design and review operational database change capture flows with Oracle GoldenGate Studio Free.',
      },
      {
        Icon: Package,
        title: 'Batch & File Loading (Data Studio)',
        desc: 'Load structured and semi-structured files such as CSV, JSON, and Parquet through ADB Data Studio Load with a guided no-code experience.',
      },
    ],
    outcome: 'Customers can unify live, operational, and historical data without building separate pipelines, reducing integration complexity and time to value.',
  },
  {
    id: 'transform',
    navLabel: 'Process',
    tag: 'Step 2',
    title: 'Process & Prepare',
    subtitle: 'Turn raw ingested data into trusted, analytics-ready and AI-ready datasets through built-in processing, quality, and enrichment capabilities.',
    accent: '#AA643B',
    Icon: Wrench,
    capabilities: [
      {
        Icon: Wrench,
        title: 'Transform Iceberg Data',
        desc: 'Use Oracle Data Transforms to read PeakGear\'s Iceberg-backed Bronze data, apply a business transformation, and write a new Gold product table without changing the original source.',
      },
      {
        Icon: CheckCircle2,
        title: 'Data Quality & Enrichment',
        desc: 'Apply validation rules, deduplication, and enrichment to ensure data integrity before issues reach downstream consumers.',
      },
      {
        Icon: BarChart3,
        title: 'Analytics-Ready Datasets',
        desc: 'Produce clean, aggregated, and modeled datasets optimized for BI dashboards, ad-hoc analysis, and interactive reporting.',
      },
      {
        Icon: Bot,
        title: 'Feature-Ready Datasets',
        desc: 'Prepare feature stores and curated datasets for machine learning training and inference directly inside the database.',
      },
    ],
    outcome: 'Raw data becomes reliable business data that can support dashboards, applications, machine learning, and GenAI from one governed layer.',
  },
  {
    id: 'catalog',
    navLabel: 'Catalog',
    tag: 'Step 3',
    title: 'Catalog & Understand',
    subtitle: 'Make every trusted data product discoverable, explainable, and reusable through cataloging, metadata, lineage, and shared business context.',
    accent: '#8067A9',
    Icon: FileSearch,
    capabilities: [
      {
        Icon: FileSearch,
        title: 'Data Catalog',
        desc: 'Discover and explore lakehouse assets through a centralized catalog so teams can quickly understand what data exists and where it lives.',
      },
      {
        Icon: Tags,
        title: 'Business Annotations & Metadata',
        desc: 'Add business definitions, tags, ownership, and usage context so technical and non-technical users interpret data the same way.',
      },
      {
        Icon: Network,
        title: 'Lineage & Impact Analysis',
        desc: 'Trace where datasets come from, how they are processed, and which reports, apps, and AI workflows depend on them.',
      },
      {
        Icon: Database,
        title: 'Curated Data Products',
        desc: 'Publish reusable, trusted data products with clear descriptions, freshness signals, and ownership before downstream teams consume them.',
      },
    ],
    outcome: 'Teams can find, understand, and reuse trusted data faster because lakehouse assets carry shared business context before they are served to applications and AI.',
  },
  {
    id: 'metadata',
    navLabel: 'Metadata Enrichment',
    tag: 'Governance',
    title: 'Metadata Enrichment',
    subtitle: 'Add business context, classifications, and AI-assisted descriptions so lakehouse assets are understandable before they are reused across analytics and AI.',
    accent: '#6F6F99',
    Icon: Tags,
    capabilities: [
      {
        Icon: Tags,
        title: 'AI-Assisted Tagging',
        desc: 'Suggest business tags, domain labels, and product-family context from raw table and column metadata.',
      },
      {
        Icon: Sparkles,
        title: 'Business Term Suggestions',
        desc: 'Generate draft glossary terms and descriptions so technical assets can be mapped to retail concepts faster.',
      },
    ],
    outcome: 'Data assets become easier to discover, explain, and govern because metadata carries shared business meaning.',
  },
  {
    id: 'serve-data',
    navLabel: 'Serve Data',
    tag: 'Step 4',
    title: 'Serve Data Products',
    subtitle: 'Turn governed, trusted data into consumable data products for business teams, developers, and partners through reports, apps, APIs, and advanced analytics.',
    accent: '#4F7D7B',
    Icon: Database,
    capabilities: [
      {
        Icon: Database,
        title: 'Converged Multi-Model Queries',
        desc: 'Query across relational, JSON, graph, spatial, and vector data using a single converged engine without moving data between specialized systems.',
      },
      {
        Icon: Network,
        title: 'Graph Analytics',
        desc: 'Uncover hidden relationships, suspicious return patterns, linked accounts, and product affinity signals with graph analytics.',
      },
      {
        Icon: Map,
        title: 'Spatial Analytics',
        desc: 'Use location intelligence to evaluate store coverage, customer proximity, inventory readiness, and fulfillment options.',
      },
      {
        Icon: Share2,
        title: 'Data Sharing',
        desc: 'Share curated datasets securely with internal teams or external partners, with governance and audit controls in place.',
      },
      {
        Icon: Plug,
        title: 'REST Access to Data',
        desc: 'Expose any table, view, or procedure as a RESTful API endpoint so developers and external systems can consume data programmatically.',
      },
    ],
    outcome: 'Business teams, developers, and partners can consume the same trusted data through reports, apps, APIs, and advanced analytics without data duplication.',
  },
  {
    id: 'serve-ai',
    navLabel: 'Serve AI',
    tag: 'Step 5',
    title: 'Serve AI Products',
    subtitle: 'Turn enterprise data into actionable intelligence with built-in AI capabilities, from machine learning models to autonomous AI agents grounded in fresh governed data.',
    accent: '#A36472',
    Icon: Sparkles,
    capabilities: [
      {
        Icon: Brain,
        title: 'Machine Learning Models',
        desc: 'Train, deploy, and score ML models directly inside the database with Oracle Machine Learning. No data movement or separate infrastructure required.',
      },
      {
        Icon: MessageSquare,
        title: 'Natural Language to SQL',
        desc: 'Enable business users to query data using natural language while the platform translates questions into optimized SQL.',
      },
      {
        Icon: BookOpen,
        title: 'Retrieval-Augmented Generation',
        desc: 'Combine vector search over enterprise documents with LLM generation to produce grounded, accurate, and context-aware AI responses.',
      },
      {
        Icon: Bot,
        title: 'AI Agents',
        desc: 'Deploy autonomous AI agents that reason, plan, and take action over live enterprise data through multi-step workflows.',
      },
      {
        Icon: Clock,
        title: 'AI for Live Operational Data',
        desc: 'Apply AI models to streaming and operational data for anomaly detection, predictive alerts, and intelligent automation.',
      },
    ],
    outcome: 'Customers can build AI experiences grounded in fresh, governed enterprise data instead of disconnected copies, improving accuracy, relevance, and trust.',
  },
  {
    id: 'govern',
    navLabel: 'Security',
    tag: 'Governance',
    title: 'Security & Governance',
    subtitle: 'Maintain complete control, compliance, and trust as analytics and AI scale across the enterprise with built-in governance and security capabilities.',
    accent: '#5F7D4F',
    Icon: ShieldCheck,
    capabilities: [
      {
        Icon: Lock,
        title: 'Security & Access Control',
        desc: 'Enforce fine-grained access controls, row-level security, data masking, and encryption to protect sensitive data.',
      },
      {
        Icon: ClipboardCheck,
        title: 'Policy Enforcement & Compliance',
        desc: 'Define and enforce data governance policies, retention rules, and regulatory compliance requirements across all data products.',
      },
    ],
    outcome: 'Customers can scale analytics and AI while maintaining control, compliance, and trust because governance is built in from the start.',
  },
];

const LAKEHOUSE_SECTION_LOOKUP = Object.fromEntries(LAKEHOUSE_SECTIONS.map((section) => [section.id, section]));
const PRIMARY_WORKFLOW_SECTIONS = ['ingest', 'transform', 'serve-ai', 'serve-data']
  .map((sectionId) => LAKEHOUSE_SECTION_LOOKUP[sectionId])
  .filter(Boolean);
const GOVERNANCE_WORKFLOW_SECTIONS = ['catalog', 'metadata', 'govern']
  .map((sectionId) => LAKEHOUSE_SECTION_LOOKUP[sectionId])
  .filter(Boolean);

export default function Welcome({ onNavigate, hasLakehouseConnection = false }) {
  const [activeSectionId, setActiveSectionId] = useState(LAKEHOUSE_SECTIONS[0].id);
  const [showArchitecture, setShowArchitecture] = useState(false);
  const [showStoryDetails, setShowStoryDetails] = useState(false);
  const activeSection = useMemo(
    () => LAKEHOUSE_SECTIONS.find((section) => section.id === activeSectionId) || LAKEHOUSE_SECTIONS[0],
    [activeSectionId],
  );
  const ActiveIcon = activeSection.Icon;

  useEffect(() => {
    if (!showArchitecture && !showStoryDetails) return undefined;
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') setShowArchitecture(false);
      if (event.key === 'Escape') setShowStoryDetails(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showArchitecture, showStoryDetails]);

  const renderWorkflowTile = (section, variantClass = '') => {
    const SectionIcon = section.Icon;
    const isActive = section.id === activeSection.id;
    return (
      <button
        key={section.id}
        type="button"
        className={`lakehouse-workflow-tab ${variantClass} ${isActive ? 'is-active' : ''}`}
        style={{ '--tab-accent': section.accent }}
        aria-current={isActive ? 'step' : undefined}
        onClick={() => setActiveSectionId(section.id)}
      >
        <span className="lakehouse-workflow-step-marker">
          <SectionIcon size={18} aria-hidden="true" />
        </span>
        <span className="lakehouse-workflow-step-copy">
          <span className="lakehouse-workflow-step-label">{section.navLabel}</span>
        </span>
      </button>
    );
  };

  return (
    <div className="space-y-6 fade-in max-w-[1700px] mx-auto">
      <section className="peakgear-story-panel" aria-labelledby="peakgear-story-title">
        <div className="peakgear-story-panel__header">
          <div>
            <p className="section-kicker">PeakGear Demo Story</p>
            <h2 id="peakgear-story-title">Welcome at PeakGear Sporting Goods</h2>
          </div>
        </div>

        <div className="peakgear-story-panel__body">
          <div className="peakgear-story-panel__narrative">
            <p>
              PeakGear Sporting Goods sells through a fast-moving webshop and a network of store fulfillment sites.
              The company manages products across activewear, outdoor gear, running, strength training, cycling,
              climbing, water sports, team sports, footwear, and fitness devices.
            </p>
            <p>
              PeakGear faces a familiar retail problem: demand shifts faster than operations can respond. A product
              can go viral overnight through social channels or supplier activity, but the business still must
              coordinate inventory, fulfillment capacity, routing, customer demand, returns risk, and catalog data
              before it can act.
            </p>
            <p>
              Without a single governed platform, teams face slow decisions, stockouts, duplicate pipelines,
              synchronization delays, and AI responses disconnected from live business data.
            </p>
            <button
              type="button"
              className="peakgear-story-panel__read-more"
              onClick={() => setShowStoryDetails(true)}
            >
              Read more
            </button>
          </div>

          <div className="peakgear-story-panel__visual" aria-label="PeakGear Sporting Goods">
            <img
              src="/peakgear-hero.png"
              alt="PeakGear Sporting Goods mountain and outdoor retail illustration"
              loading="eager"
            />
          </div>
        </div>

        {showStoryDetails && (
          <div
            className="story-detail-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="story-detail-modal-title"
          >
            <button
              type="button"
              className="story-detail-modal__backdrop"
              onClick={() => setShowStoryDetails(false)}
              aria-label="Close PeakGear story"
            />
            <div className="story-detail-modal__panel">
              <div className="story-detail-modal__header">
                <div>
                  <p className="section-kicker">PeakGear Demo Story</p>
                  <h3 id="story-detail-modal-title">PeakGear retail operations story</h3>
                </div>
                <button
                  type="button"
                  className="story-detail-modal__close"
                  onClick={() => setShowStoryDetails(false)}
                  aria-label="Close PeakGear story"
                >
                  <X size={18} aria-hidden="true" />
                </button>
              </div>

              <div className="story-detail-modal__content">
                <section className="story-detail-modal__narrative" aria-label="PeakGear challenge">
                  <p>
                    PeakGear Sporting Goods sells through a fast-moving webshop and a network of store fulfillment sites.
                    The company manages products across activewear, outdoor gear, running, strength training, cycling,
                    climbing, water sports, team sports, footwear, and fitness devices.
                  </p>
                  <p>
                    PeakGear faces a familiar retail problem: demand shifts faster than operations can respond. A product
                    can go viral overnight through social channels or supplier activity, but the business still must
                    coordinate inventory, fulfillment capacity, routing, customer demand, returns risk, and catalog data
                    before it can act.
                  </p>
                  <p>
                    Without a single governed platform, teams face slow decisions, stockouts, duplicate pipelines,
                    synchronization delays, and AI responses disconnected from live business data.
                  </p>
                </section>

                <section className="peakgear-story-panel__lakehouse-summary" aria-label="Oracle AI Lakehouse story">
                  <h3>Oracle AI Lakehouse connects the entire data lifecycle in one flow.</h3>
                  <p>
                    PeakGear ingests raw product, order, inventory, image, and demand-signal data into Bronze. It transforms
                    that data into standardized Silver tables, then curates business-ready data products for the catalog, webshop,
                    dashboards, orders, fulfillment, and analytics. The same governed Oracle foundation powers both business
                    applications and AI experiences.
                  </p>
                </section>

                <section className="peakgear-story-panel__challenge-list" aria-label="PeakGear retail challenges">
                  <h3>Retail challenges in the demo</h3>
                  {PEAKGEAR_RETAIL_CHALLENGES.map((challenge) => (
                    <article key={challenge.title}>
                      <strong>{challenge.title}</strong>
                      <span>{challenge.detail}</span>
                    </article>
                  ))}
                </section>

                <section className="peakgear-story-panel__lakehouse" aria-label="PeakGear operating model outcomes">
                  <div>
                    <h3>The result is a smarter retail operating model.</h3>
                    <ul className="peakgear-story-panel__action-list">
                      {PEAKGEAR_ACTIONS.map((action) => (
                        <li key={action}>{action}</li>
                      ))}
                    </ul>
                  </div>
                </section>

                <figure className="story-detail-modal__architecture-flow">
                  <img
                    src="https://objectstorage.us-ashburn-1.oraclecloud.com/p/BLGnG9scPeB_z2ruM-xirgDXNfBMuYjTRciZG8jcwgu68oCodk_vFq1vySIDG-F_/n/c4u04/b/ai-lh-build/o/pg-info.png"
                    alt="Oracle AI Lakehouse flow from PeakGear customer signals through retail challenges, Bronze, Silver, Gold and AI, to smarter retail operations"
                    loading="lazy"
                  />
                </figure>
              </div>
            </div>
          </div>
        )}

        {showArchitecture && (
          <div
            className="architecture-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="architecture-modal-title"
          >
            <button
              type="button"
              className="architecture-modal__backdrop"
              onClick={() => setShowArchitecture(false)}
              aria-label="Close architecture review"
            />
            <div className="architecture-modal__panel">
              <div className="architecture-modal__header">
                <div>
                  <p className="section-kicker">PeakGear Architecture</p>
                  <h3 id="architecture-modal-title">How the demo fits together</h3>
                </div>
                <button
                  type="button"
                  className="architecture-modal__close"
                  onClick={() => setShowArchitecture(false)}
                  aria-label="Close architecture review"
                >
                  <X size={18} aria-hidden="true" />
                </button>
              </div>

              <div className="architecture-modal__stage-grid">
                {ARCHITECTURE_STAGES.map((stage) => (
                  <section className="architecture-stage" key={stage.title}>
                    <h4>{stage.title}</h4>
                    <div className="architecture-stage__nodes">
                      {stage.elements.map((element) => {
                        const ElementIcon = element.Icon;
                        return (
                          <button
                            type="button"
                            className="architecture-node"
                            key={element.title}
                            aria-label={`${element.title}: ${element.info}`}
                          >
                            <span className="architecture-node__icon">
                              <ElementIcon size={17} aria-hidden="true" />
                            </span>
                            <span>{element.title}</span>
                            <span className="architecture-node__info" role="tooltip">
                              {element.info}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </section>
                ))}
              </div>
            </div>
          </div>
        )}

      </section>

      <section
        className="lakehouse-workflow"
        aria-labelledby="lakehouse-workflow-title"
        style={{ '--workflow-accent': activeSection.accent }}
      >
        <div className="lakehouse-workflow-header">
          <div className="lakehouse-workflow-heading">
            <p className="section-kicker">AI Lakehouse Workflow</p>
            <h2 id="lakehouse-workflow-title">One platform for data, analytics, and AI.</h2>
            <p>
              Move from ingestion to intelligence through one connected workflow. Each stage below
              exposes the capabilities that support the current lakehouse step.
            </p>
          </div>

          <nav className="lakehouse-workflow-nav" aria-label="AI Lakehouse workflow stages">
            <div className="lakehouse-workflow-primary-row">
              {PRIMARY_WORKFLOW_SECTIONS.map((section) => renderWorkflowTile(section, 'lakehouse-workflow-tab--primary'))}
            </div>
            <div className="lakehouse-workflow-governance-shell">
              <div className="lakehouse-workflow-governance-tiles">
                {GOVERNANCE_WORKFLOW_SECTIONS.map((section) => renderWorkflowTile(section, 'lakehouse-workflow-tab--governance'))}
              </div>
              <div className="lakehouse-workflow-governance-label" aria-hidden="true">
                Governance
              </div>
            </div>
          </nav>
        </div>

        <div className="lakehouse-detail-shell">
          <div className="lakehouse-detail-intro">
            <div className="lakehouse-detail-icon">
              <ActiveIcon size={24} aria-hidden="true" />
            </div>
            <div>
              <h3>{activeSection.title}</h3>
              <p>{activeSection.subtitle}</p>
            </div>
          </div>

          <div className="lakehouse-capability-grid">
            {activeSection.capabilities.map((capability) => {
              const CapabilityIcon = capability.Icon;
              const demoTileRoute = DEMO_TILE_ROUTES[capability.title];
              const isDemoTile = demoTileRoute?.sectionId === activeSection.id;
              const tileBody = (
                <>
                  {isDemoTile && (
                    <span className="lakehouse-capability-run-tag">Run Demo</span>
                  )}
                  <div className="lakehouse-capability-icon">
                    <CapabilityIcon size={18} aria-hidden="true" />
                  </div>
                  <div>
                    <h4>{capability.title}</h4>
                    <p>{capability.desc}</p>
                  </div>
                </>
              );

              if (isDemoTile) {
                return (
                  <button
                    type="button"
                    className={`lakehouse-capability-tile lakehouse-capability-tile--demo ${hasLakehouseConnection ? 'is-enabled' : 'is-disabled'}`}
                    key={capability.title}
                    disabled={!hasLakehouseConnection}
                    onClick={() => onNavigate(demoTileRoute.pageId, { expandGroup: demoTileRoute.expandGroup })}
                    title={hasLakehouseConnection ? demoTileRoute.enabledTitle : 'Connect to ADB first'}
                  >
                    {tileBody}
                  </button>
                );
              }

              return (
                <article className="lakehouse-capability-tile" key={capability.title}>
                  {tileBody}
                </article>
              );
            })}
          </div>

          <div className="lakehouse-outcome-panel">
            <CheckCircle2 size={18} aria-hidden="true" />
            <div>
              <h4>Business Outcome</h4>
              <p>{activeSection.outcome}</p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
