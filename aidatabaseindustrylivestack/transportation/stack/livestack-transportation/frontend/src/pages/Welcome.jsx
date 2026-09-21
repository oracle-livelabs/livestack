import { useState } from 'react';
import { ChevronLeft, ChevronRight, FolderTree } from 'lucide-react';
import { CUSTOMER_NAME } from '../config/customer';

const USE_CASES = [
  {
    label: 'Transportation Data Foundation',
    intro: 'Shows how Oracle AI Database 26ai provides:',
    bullets: [
      'A governed transportation data layer',
      'Connected shipper, service, terminal, route, and shipment records',
      'Relational, JSON, graph, spatial, similarity, and predictive evidence',
      'One trusted foundation for the full logistics journey',
    ],
    tone: '#437C94',
  },
  {
    label: 'Fleet Risk & Operations Dashboard',
    intro: 'Open with the Northeast Corridor disruption and show:',
    bullets: [
      'Freight value at risk, SLA exposure, and constrained terminal capacity',
      'High-demand transportation services and impacted logistics lanes',
      'Shipper activity, shipment orders, and exception exposure',
      'Executive-ready operating context for the recovery decision',
    ],
    outro: 'Operations can see the customer promise, the network pressure, and the value at risk in one place.',
    tone: '#C74634',
  },
  {
    label: 'Disruption & Demand Signals',
    intro: 'Explain why the surge is happening by reviewing:',
    bullets: [
      'Shipper tenders, port alerts, weather notices, and lane-pressure indicators',
      'Detect service momentum across transportation offerings',
      'Prioritize signals by urgency, SLA impact, and freight value',
      'Surface affected services, regions, shippers, and terminals',
    ],
    tone: '#4F7D7B',
  },
  {
    label: 'Transportation Risk Network',
    intro: 'Trace how risk propagates across:',
    bullets: [
      'Signal-source, service-line, and logistics partner relationships',
      'Exception propagation across shippers, ports, and routes',
      'Connected exposure analysis for constrained lanes',
      'Planner-ready network exploration',
    ],
    tone: '#796087',
  },
  {
    label: 'Network Capacity & Rerouting',
    intro: 'Decide where the network can absorb overflow across:',
    bullets: [
      'Terminal coverage and service zones',
      'Regional service pressure and demand overlays',
      'Capacity, equipment availability, and routing constraints',
      'Dispatch and terminal access decisions',
    ],
    tone: '#5F7D4F',
  },
  {
    label: 'Shipment Orders & Exceptions',
    intro: 'Inspect the shipment execution record for:',
    bullets: [
      'Signal-linked shipment order review',
      'Audit-ready exception workflows',
      'Partner and channel integrations',
      'Modern API-driven transportation applications',
    ],
    tone: '#A36472',
  },
  {
    label: 'Predictive Service Risk & Capacity',
    intro: 'Forecast the operational impact across:',
    bullets: [
      'Service demand and disruption forecasting',
      'Shipper health and account risk',
      'Transportation service risk cohorts',
      'Predictive capacity recommendations',
    ],
    tone: '#4C825C',
  },
  {
    label: 'Ask Seer Transport Data',
    intro: 'Ask scenario questions that:',
    bullets: [
      'Explain the Northeast Corridor logistics storyline using natural language',
      'Query live governed transportation data',
      'Inspect evidence behind operational decisions',
    ],
    tone: '#697778',
  },
  {
    label: 'Operations Agent Console',
    intro: 'Show governed AI agents coordinating:',
    bullets: [
      'Capacity, routing, and service recommendations',
      'Cross-team operational actions',
      'Human-reviewable decisions',
      'Durable audit records for every recommendation',
    ],
    tone: '#6B7494',
  },
];

const TRANSPORT_USE_CASE_STORY = [
  {
    stage: '1',
    useCase: 'Data Foundation',
    summary: 'Confirm the governed demo data is loaded before the logistics story starts; keep technical proof in Oracle Internals.',
  },
  {
    stage: '2',
    useCase: 'Fleet Risk & Operations Dashboard',
    summary: 'Spot the Northeast Corridor demand spike, constrained terminals, service exposure, and freight value at risk.',
  },
  {
    stage: '3',
    useCase: 'Disruption & Demand Signals',
    summary: 'Use operational signal search to understand shipper intent, port disruption, lane urgency, and related services.',
  },
  {
    stage: '4',
    useCase: 'Transportation Risk Network',
    summary: 'Trace which signal sources, logistics partners, service lines, and routes are amplifying the issue.',
  },
  {
    stage: '5',
    useCase: 'Network Capacity & Rerouting',
    summary: 'Locate available capacity, evaluate regional coverage, and understand how dispatch can respond.',
  },
  {
    stage: '6',
    useCase: 'Shipment Orders & Exceptions',
    summary: 'Inspect how one connected shipment order supports operations, APIs, dispatch, and service workflows.',
  },
  {
    stage: '7',
    useCase: 'Predictive Service Risk & Capacity',
    summary: 'Forecast demand, score capacity risk, assess shipper health, and prioritize service decisions.',
  },
  {
    stage: '8',
    useCase: 'Ask Seer Transport Data',
    summary: 'Ask plain-language questions about the logistics story and generate SQL against live transportation data.',
  },
  {
    stage: '9',
    useCase: 'Operations Agent Console',
    summary: 'Turn the insight into guided routing, capacity, and operational actions with governed AI agents.',
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
            {CUSTOMER_NAME} logistics control tower for a live Northeast Corridor disruption.
          </h1>
          <div className="w-full space-y-4 text-base text-[var(--color-text-dim)] leading-7">
            <p>
              A strategic shipper has an expedited dock-to-dock commitment moving from Chicago Midwest Rail Hub to NYC Intermodal Gateway. Port congestion, weather disruption, and a tender spike are compressing terminal capacity, raising SLA risk, and putting freight value at risk across the Northeast Corridor.
            </p>
            <p>
              Follow Seer Transport as planners, dispatch teams, terminal managers, and operations leaders move through a logistics-first journey: prepare the governed data, sense the disruption, assess network exposure, find capacity, inspect the shipment exception, forecast service risk, ask trusted questions, and trigger governed AI action.
            </p>
          </div>
          <div className="welcome-story-rail" aria-label="Seer Transport journey across the nine use cases">
            <div className="welcome-story-rail__intro">
              <span className="welcome-story-rail__kicker">Logistics journey</span>
              <p>
                The story follows one disruption from governed data readiness to operational signals, network exposure, terminal capacity, shipment exception handling, predictive risk, trusted questions, and AI-assisted recovery. Each page leads with the logistics decision; the Oracle Internals sidebar carries the deeper technical explanation.
              </p>
            </div>
            <ol className="welcome-story-rail__steps">
              {TRANSPORT_USE_CASE_STORY.map((step) => (
                <li key={step.useCase} className="welcome-story-step">
                  <span className="welcome-story-step__stage">{step.stage}</span>
                  <span className="welcome-story-step__use-cases">{step.useCase}</span>
                  <span className="welcome-story-step__summary">{step.summary}</span>
                </li>
              ))}
            </ol>
          </div>
          <div className="flex flex-wrap gap-3 pt-1">
            <button
              type="button"
              className="welcome-start-demo-native-button"
              onClick={() => onNavigate?.('datamodel')}
            >
              <FolderTree size={16} aria-hidden="true" />
              <span>Start the demo</span>
            </button>
          </div>
        </div>
      </section>

      <section className="glass-card p-7">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-2xl font-semibold">Key Transportation Use Cases Featured</h2>
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
