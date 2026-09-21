import { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { JetButton } from '../components/JetControls';
import { CUSTOMER_NAME } from '../config/customer';

const USE_CASES = [
  {
    label: 'Quality & Supply Operations Dashboard',
    intro: 'Starts the regulated operations picture for:',
    bullets: [
      'Clinical supply exposure and quality KPIs',
      'Watched products, manufacturers, and trial-site activity',
      'Signal impact on regulated products and cold-chain regions',
      'Executive-ready supply, quality, and service context',
    ],
    outro: 'Use it to open the seller story: one critical quality signal is moving through regulated supply.',
    tone: '#C74634',
  },
  {
    label: 'Regulatory & Quality Signals',
    intro: 'Triage regulatory, GxP, quality, and logistics activity to:',
    bullets: [
      'Identify emerging product and lot-risk indicators',
      'Detect critical signal velocity and exposure shifts',
      'Prioritize quality and compliance alerts by severity',
      'Surface affected manufacturers, products, and trial workflows',
    ],
    tone: '#4F7D7B',
  },
  {
    label: 'Signal Propagation Network',
    intro: 'Demonstrates graph analytics for:',
    bullets: [
      'Manufacturer, signal-source, product, and partner relationships',
      'Quality-event propagation across connected entities',
      'Shared exposure between products and regulatory bulletins',
      'Investigator-ready network exploration',
    ],
    tone: '#796087',
  },
  {
    label: 'Cold-Chain Service Coverage',
    intro: 'Shows whether operations can absorb clinical supply demand across:',
    bullets: [
      'Cold-chain depot and GMP warehouse coverage',
      'Regional service-zone visibility',
      'Trial-site demand and controlled inventory capacity',
      'Routing, replenishment, and service-network decisions',
    ],
    tone: '#5F7D4F',
  },
  {
    label: 'Clinical Supply Orders & Deviations',
    intro: 'Connects clinical supply orders to governed quality workflows for:',
    bullets: [
      'Signal-linked order review',
      'Audit-ready deviation and allocation workflows',
      'Partner and site integrations',
      'Modern API-driven regulated supply applications',
    ],
    tone: '#A36472',
  },
  {
    label: 'Predictive Quality & Supply Analytics',
    intro: 'Forecasts downstream impact from regulatory and supply pressure on:',
    bullets: [
      'Demand and controlled-inventory forecasting',
      'Trial-site and product risk segments',
      'Quality-signal product cohorts',
      'Predictive replenishment and allocation recommendations',
    ],
    tone: '#4C825C',
  },
  {
    label: 'Ask Regulated Supply Data',
    intro: 'Lets sellers and analysts ask scenario questions to:',
    bullets: [
      'Explain the quality-led storyline using natural language',
      'Query live governed life-sciences data',
      'Inspect SQL evidence behind operational decisions',
    ],
    tone: '#697778',
  },
  {
    label: 'Governed Agent Console',
    intro: 'Shows governed AI agents coordinating:',
    bullets: [
      'Quality, regulatory, and cold-chain recommendations',
      'Cross-team operational actions',
      'Human-reviewable decisions',
      'Durable audit records for every recommendation',
    ],
    tone: '#6B7494',
  },
];

const QUALITY_SIGNAL_STORY = [
  {
    stage: '1',
    useCase: 'Operations Dashboard',
    summary: 'Spot the product exposure, quality pressure, clinical supply value, and service risk in one operating view.',
  },
  {
    stage: '2',
    useCase: 'Signal Intelligence',
    summary: 'Use semantic search to understand regulatory bulletins, GxP updates, cold-chain notices, and affected products.',
  },
  {
    stage: '3',
    useCase: 'Signal Network',
    summary: 'Trace which manufacturers, signal sources, products, and partner relationships amplify the quality event.',
  },
  {
    stage: '4',
    useCase: 'Cold-Chain Coverage',
    summary: 'Locate controlled inventory, evaluate regional service zones, and understand how fulfillment can respond.',
  },
  {
    stage: '5',
    useCase: 'Orders & Deviations',
    summary: 'Inspect how connected order records support allocation review, APIs, fulfillment, and audit workflows.',
  },
  {
    stage: '6',
    useCase: 'Predictive Analytics',
    summary: 'Forecast demand, score supply risk, segment trial sites, and prioritize replenishment decisions.',
  },
  {
    stage: '7',
    useCase: 'Ask Data',
    summary: 'Ask plain-language questions about the quality event and generate SQL against live governed data.',
  },
  {
    stage: '8',
    useCase: 'Agent Console',
    summary: 'Turn the insight into guided quality, allocation, and cold-chain actions with governed AI agents.',
  },
];

const USE_CASES_PER_PAGE = 3;

export default function Welcome({ onNavigate }) {
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
      <section className="glass-card p-7">
        <div className="space-y-4">
          <h1 className="text-4xl font-semibold tracking-tight leading-tight">
            Welcome
          </h1>
          <p className="text-xl font-semibold text-[var(--color-text)]">
            A regulated supply and quality intelligence workspace for clinical operations.
          </p>
          <div className="w-full space-y-4 text-base text-[var(--color-text-dim)] leading-7">
            <p>
              {CUSTOMER_NAME} shows how a life-sciences organization responds when a quality, regulatory, or cold-chain signal exposes risk across a clinical supply program, regulated products, manufacturers, depots, and trial sites. Business users move from signal triage to lot and product exposure, network investigation, service coverage, predictive impact, and governed AI action without leaving the trusted operational data foundation.
            </p>
            <p>
              Follow a clinical-supply journey across {CUSTOMER_NAME}: quality teams identify the signal, operations teams trace affected products and manufacturers, cold-chain managers protect controlled inventory, and AI agents recommend auditable next actions while Oracle AI Database 26ai keeps the evidence, access controls, and decision history governed.
            </p>
          </div>
          <div className="welcome-story-rail" aria-label="Quality signal journey across the eight use cases">
            <div className="welcome-story-rail__intro">
              <span className="welcome-story-rail__kicker">Eight use cases, one clinical supply risk story</span>
              <p>
                The demo follows a critical clinical-supply signal from quality triage to semantic search, manufacturer and source relationships, cold-chain coverage, clinical supply orders, forecasting, natural-language analysis, and AI-assisted action. Each use case proves how the same governed Oracle AI Database foundation supports a complete regulated-supply seller conversation.
              </p>
            </div>
            <ol className="welcome-story-rail__steps">
              {QUALITY_SIGNAL_STORY.map((step) => (
                <li key={step.useCase} className="welcome-story-step">
                  <span className="welcome-story-step__stage">{step.stage}</span>
                  <span className="welcome-story-step__use-cases">{step.useCase}</span>
                  <span className="welcome-story-step__summary">{step.summary}</span>
                </li>
              ))}
            </ol>
          </div>
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
          <h2 className="text-2xl font-semibold">Key Life Sciences Use Cases Featured</h2>
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
                borderTopColor: useCase.tone,
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
