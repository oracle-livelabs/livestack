import { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { JetButton } from '../components/JetControls';
import { RetailStoryRail } from '../components/RetailStory';
import { useRetailerName } from '../context/RetailerContext';
import { FeatureBadge, SqlBlock } from '../components/OracleInfoPanel';
import { RegisterOraclePanel } from '../context/OraclePanelContext';

const USE_CASES = [
  {
    label: 'Retail Command Center',
    intro: 'A live operating view for sporting-goods sellers tracking:',
    bullets: [
      'AllTerrain Hiking Boots demand',
      'Inventory and fulfillment risk',
      'Sales, orders, and service exposure',
      'Cross-domain operational analytics',
    ],
    outro: 'Uses converged SQL and in-memory capabilities for real-time retail operations intelligence.',
    tone: '#C74634',
  },
  {
    label: 'Customer Trend Signals',
    intro: 'Uses vector embeddings and similarity search to understand shopper intent for:',
    bullets: [
      'Trail and outdoor gear discovery',
      'Emerging sporting-goods demand',
      'Product sentiment and buying signals',
      'Lookalike products and shopper communities',
    ],
    tone: '#4F7D7B',
  },
  {
    label: 'Creator Influence Network',
    intro: 'Demonstrates graph analytics for sporting-goods creator ecosystems:',
    bullets: [
      'Outdoor and fitness creator networks',
      'Customer-product-community relationships',
      'AllTerrain demand propagation',
      'Recommendation and affinity modeling',
    ],
    tone: '#796087',
  },
  {
    label: 'Intelligent Fulfillment Network',
    intro: 'Uses Oracle Spatial capabilities to optimize sporting-goods fulfillment:',
    bullets: [
      'Fulfillment routing',
      'Regional delivery coverage',
      'Distribution efficiency',
      'Store, warehouse, and trail-market proximity',
    ],
    tone: '#5F7D4F',
  },
  {
    label: 'Unified Order Intelligence',
    intro: 'Highlights JSON Duality and ACID transactions for sporting-goods order workflows:',
    bullets: [
      'Flexible order management',
      'Marketplace and partner integrations',
      'Omnichannel pickup, ship, and return flows',
      'Modern API-driven retail applications',
    ],
    tone: '#A36472',
  },
  {
    label: 'Returns Intelligence',
    intro: 'Connects governed return decisions to order and service context:',
    bullets: [
      'Return request triage',
      'Policy and order context',
      'Regional visibility controls',
      'Admin-authorized decisions',
    ],
    tone: '#A36472',
  },
  {
    label: 'Retail OML Analytics',
    intro: 'Embedded machine learning workflows for sporting-goods planning:',
    bullets: [
      'AllTerrain demand forecasting',
      'Customer segmentation',
      'Predictive retail modeling',
      'Intelligent operational recommendations',
    ],
    tone: '#4C825C',
  },
  {
    label: 'Ask Retail Data',
    intro: 'Natural-language SQL experience allowing sellers to:',
    bullets: [
      'Ask business questions conversationally',
      'Query live sporting-goods schemas',
      'Democratize data access for non-technical users',
    ],
    tone: '#697778',
  },
  {
    label: 'Retail AI Agent Console',
    intro: 'Coordinates governed specialist agents across the complete retail journey:',
    bullets: [
      'Deterministic demand, fulfillment, commerce, and returns routing',
      'VPD-scoped Oracle SQL, Spatial, and Vector Search tools',
      'Grounded Ollama summaries with deterministic fallback',
      'Admin-confirmed review proposals and visible provenance',
    ],
    tone: '#796087',
  },
];

const USE_CASES_PER_PAGE = 3;

export default function Welcome({ onNavigate }) {
  const { retailerName } = useRetailerName();
  const [useCasePage, setUseCasePage] = useState(0);
  const pageCount = Math.ceil(USE_CASES.length / USE_CASES_PER_PAGE);
  const carouselStart = useCasePage * USE_CASES_PER_PAGE;
  const visibleUseCases = USE_CASES.slice(carouselStart, carouselStart + USE_CASES_PER_PAGE);
  const carouselEnd = Math.min(carouselStart + visibleUseCases.length, USE_CASES.length);
  const canGoPrevious = useCasePage > 0;
  const canGoNext = useCasePage < pageCount - 1;

  const goToPreviousUseCases = () => {
    setUseCasePage((page) => Math.max(0, page - 1));
  };

  const goToNextUseCases = () => {
    setUseCasePage((page) => Math.min(pageCount - 1, page + 1));
  };

  return (
    <div className="space-y-6 fade-in max-w-[1700px] mx-auto">
      <RegisterOraclePanel title="Welcome">
        <div className="space-y-4">
          <div>
            <p className="text-xs font-semibold text-[var(--color-text-dim)] uppercase tracking-wider mb-2">Runtime boundary</p>
            <p className="text-sm text-[var(--color-text)] leading-relaxed">
              Welcome is an orientation scene and does not execute a business query. The scenes it introduces share one Oracle schema and one trusted application identity boundary; their own Oracle Internals panels show the SQL that each scene actually runs.
            </p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <FeatureBadge label="Orientation only" color="blue" />
            <FeatureBadge label="Shared Oracle schema" color="orange" />
            <FeatureBadge label="Per-scene execution proof" color="green" />
          </div>
          <SqlBlock code={`-- No SQL is issued by the Welcome scene.
-- Dataset state is read when Data Foundation opens:
SELECT dataset_source, dataset_version, job_id,
       status, readiness, activated_at, updated_at
FROM app_dataset_readiness
WHERE readiness_id = 1;`} />
          <p className="text-xs text-[var(--color-text-dim)] leading-relaxed">
            The downstream workloads are relational SQL, Native JSON and JSON Relational Duality, SQL/PGQ, Oracle Spatial, AI Vector Search, DBMS_DATA_MINING, VPD-scoped transactions, and application-side Ollama routing. A capability is claimed only in the scene that invokes or verifies it.
          </p>
        </div>
      </RegisterOraclePanel>
      <section className="glass-card p-7">
        <div className="space-y-4">
          <h1 className="text-4xl font-semibold tracking-tight leading-tight">
            {retailerName} retail intelligence on one governed Oracle data platform.
          </h1>
          <div className="w-full space-y-4 text-base text-[var(--color-text-dim)] leading-7">
            <p>
              {retailerName} shows how a sporting-goods retailer can move from fragmented product, order, inventory, creator, and customer signal data to one governed Oracle data platform. Built on Oracle AI Database 26ai, this demo follows AllTerrain Hiking Boots as demand builds, inventory pressure appears, orders move, and AI-assisted teams make grounded decisions from the same connected data foundation.
            </p>
            <p>
              Follow {retailerName}, a fictional sporting-goods retailer, as sellers, analysts, and operations teams manage planning, buying, moving, selling, servicing, replenishing, and governed agent coordination across nine connected use cases.
            </p>
          </div>
          <RetailStoryRail />
          <div className="flex flex-wrap gap-3 pt-1">
            <JetButton
              label="Start the demo"
              iconClass="oj-fwk-icon oj-fwk-icon-folderhierarchy"
              chroming="callToAction"
              className="welcome-jet-button welcome-start-demo-button"
              onAction={() => onNavigate('datamodel')}
            />
          </div>
        </div>
      </section>

      <section className="glass-card p-7">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-2xl font-semibold">Key Retail Use Cases Featured</h2>
          <div className="flex items-center gap-2" aria-label="Use case carousel controls">
            <button
              type="button"
              aria-label="Show previous use cases"
              onClick={goToPreviousUseCases}
              disabled={!canGoPrevious}
              className="inline-flex h-9 w-9 items-center justify-center rounded-md border transition-colors disabled:cursor-not-allowed disabled:opacity-40"
              style={{
                borderColor: 'var(--color-border)',
                background: 'var(--color-surface)',
                color: 'var(--color-text)',
              }}
            >
              <ChevronLeft size={18} aria-hidden="true" />
            </button>
            <button
              type="button"
              aria-label="Show next use cases"
              onClick={goToNextUseCases}
              disabled={!canGoNext}
              className="inline-flex h-9 w-9 items-center justify-center rounded-md border transition-colors disabled:cursor-not-allowed disabled:opacity-40"
              style={{
                borderColor: 'var(--color-border)',
                background: 'var(--color-surface)',
                color: 'var(--color-text)',
              }}
            >
              <ChevronRight size={18} aria-hidden="true" />
            </button>
          </div>
        </div>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-[var(--color-text-dim)]">
            Showing {carouselStart + 1}-{carouselEnd} of {USE_CASES.length}
          </p>
          <div className="flex items-center gap-1.5" aria-label="Use case groups">
            {Array.from({ length: pageCount }).map((_, index) => (
              <button
                key={index}
                type="button"
                aria-label={`Show use case group ${index + 1}`}
                aria-current={useCasePage === index ? 'true' : undefined}
                onClick={() => setUseCasePage(index)}
                className="h-2.5 rounded-full transition-all"
                style={{
                  width: useCasePage === index ? '22px' : '10px',
                  background: useCasePage === index ? '#AA643B' : 'var(--color-border)',
                }}
              />
            ))}
          </div>
        </div>
        <div
          className="grid gap-3 mt-4 lg:grid-cols-3"
          aria-live="polite"
          aria-label={`Use cases ${carouselStart + 1} through ${carouselEnd}`}
        >
          {visibleUseCases.map((useCase) => (
            <div
              key={useCase.label}
              className="border p-3.5 flex flex-col gap-2.5"
              style={{
                borderColor: 'var(--color-border)',
                borderRadius: '6px',
                background: 'var(--color-surface-muted)',
                borderTopWidth: '3px',
                borderTopColor: useCase.tone
              }}
            >
              <div className="text-[15px] font-semibold leading-snug">{useCase.label}</div>
              <p className="text-sm text-[var(--color-text-dim)] leading-5">{useCase.intro}</p>
              <ul className="list-disc pl-4 space-y-1 text-sm text-[var(--color-text-dim)] leading-5">
                {useCase.bullets.map((bullet) => (
                  <li key={bullet}>{bullet}</li>
                ))}
              </ul>
              {useCase.outro ? (
                <p className="text-sm text-[var(--color-text-dim)] leading-5">{useCase.outro}</p>
              ) : null}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
