import { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { JetButton } from '../components/JetControls';
import { TelcoStoryRail } from '../components/TelcoStory';

const USE_CASES = [
  {
    label: 'Telecom Data Foundation',
    intro: 'Establishes the shared operational record for:',
    bullets: [
      'Subscribers, accounts, services, and service orders',
      'Network sites, capacity, coverage, and field operations',
      'Subscriber signals, graph relationships, and spatial evidence',
      'Predictive outputs and auditable agent actions',
    ],
    tone: '#437C94',
  },
  {
    label: 'Detect Service Assurance Risk',
    intro: 'A centralized operations dashboard for:',
    bullets: [
      'Mobile network and subscriber KPIs',
      'Service-impact and service-order visibility',
      'SLA, capacity, revenue, and churn exposure',
      'Cross-domain telecom operations analytics',
    ],
    outro: 'Uses converged SQL and in-memory capabilities for real-time service assurance intelligence.',
    tone: '#C74634',
  },
  {
    label: 'Prioritize Subscriber Signals',
    intro: 'Uses vector embeddings and similarity search to:',
    bullets: [
      'Identify urgent mobile subscriber and network signals',
      'Detect 5G service-impact shifts',
      'Analyze care, outage, app, and NPS pressure',
      'Surface related plans, services, and field actions',
    ],
    tone: '#4F7D7B',
  },
  {
    label: 'Investigate Subscriber Impact',
    intro: 'Demonstrates graph analytics for:',
    bullets: [
      'Subscriber, service, account, and network-site relationships',
      'Shared account, RAN, and infrastructure impact analysis',
      'Case propagation and connected exposure views',
      'Operations-ready relationship exploration',
    ],
    tone: '#796087',
  },
  {
    label: 'Locate Capacity and Field Constraints',
    intro: 'Uses Oracle Spatial capabilities to optimize:',
    bullets: [
      'Coverage-zone visibility',
      'Network site and field-service capacity',
      'Subscriber proximity and crew routing',
      'Regional subscriber-impact and service planning',
    ],
    tone: '#5F7D4F',
  },
  {
    label: 'Act on Subscriber Service Orders',
    intro: 'Highlights JSON Duality and ACID transactions for:',
    bullets: [
      'Mobile plan, device, and service-order management',
      'Partner, RAN, and field-service integrations',
      'Subscriber workflow orchestration',
      'Modern API-driven telco applications',
    ],
    tone: '#A36472',
  },
  {
    label: 'Predict Churn and Revenue Exposure',
    intro: 'Embedded machine learning workflows for:',
    bullets: [
      'Service-impact risk and churn forecasting',
      'Subscriber retention segmentation',
      'Service behavior and capacity clustering',
      'Predictive network and revenue recommendations',
    ],
    tone: '#4C825C',
  },
  {
    label: 'Ask Telecom Operations Data',
    intro: 'Natural-language SQL experience allowing users to:',
    bullets: [
      'Ask business questions conversationally',
      'Query live governed telco schemas',
      'Democratize data access for non-technical users',
    ],
    tone: '#697778',
  },
  {
    label: 'Automate Governed Interventions',
    intro: 'Demonstrates AI agents orchestrating:',
    bullets: [
      'SQL and PL/SQL tools',
      'Automated service assurance workflows',
      'Subscriber, service, capacity, and retention recommendations',
      'Guided operational actions with logged decisions',
    ],
    tone: '#6B7494',
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
            Telecom service assurance on one governed Oracle data platform.
          </h1>
          <p className="w-full text-base text-[var(--color-text-dim)] leading-7">
            This LiveStack follows a single game-day 5G congestion incident across network operations, subscriber
            care, service assurance, field operations, service orders, predictive analytics, natural-language data
            access, and governed AI-assisted intervention.
          </p>
          <TelcoStoryRail />
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
          <h2 className="text-2xl font-semibold">Key Telecom Service Assurance Use Cases Featured</h2>
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
