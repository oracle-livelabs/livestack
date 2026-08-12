import { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { JetButton } from '../components/JetControls';
import { HealthcareStoryRail } from '../components/HealthcareStory';

const USE_CASES = [
  {
    label: 'Healthcare Data Foundation',
    intro: 'Shows how Oracle AI Database 26ai provides:',
    bullets: [
      'A governed healthcare data layer',
      'Connected clinical and operational entities',
      'JSON documents and relational records',
      'Graph relationships for care context',
    ],
    tone: '#437C94',
  },
  {
    label: 'Operations Command Center',
    intro: 'Gives care operations teams visibility into:',
    bullets: [
      'Patient flow',
      'Capacity and service demand',
      'Operational status',
      'Provider-network coordination',
    ],
    tone: '#C74634',
  },
  {
    label: 'Quality & Capacity Signals',
    intro: 'Uses vector-powered analysis across:',
    bullets: [
      'Quality updates',
      'Capacity alerts',
      'Operational signals',
      'Related care-service evidence',
    ],
    tone: '#4F7D7B',
  },
  {
    label: 'Care Pathway Graph',
    intro: 'Demonstrates graph analysis of relationships among:',
    bullets: [
      'Patients and encounters',
      'Providers and facilities',
      'Care gaps',
      'Quality signals',
    ],
    tone: '#796087',
  },
  {
    label: 'Care Logistics Map',
    intro: 'Applies spatial analysis to understand:',
    bullets: [
      'Care access',
      'Facility proximity',
      'Logistics routing',
      'Regional capacity',
    ],
    tone: '#5F7D4F',
  },
  {
    label: 'Care Service Requests',
    intro: 'Shows operational service-request workflows using:',
    bullets: [
      'JSON document views',
      'Relational duality views',
      'Request status and line-item context',
      'Governed operational records',
    ],
    tone: '#A36472',
  },
  {
    label: 'Risk and Capacity Analytics',
    intro: 'Uses in-database analytics and ML for:',
    bullets: [
      'Readmission risk',
      'Care-gap risk',
      'Demand forecasting',
      'Capacity planning',
    ],
    tone: '#4C825C',
  },
  {
    label: 'Ask Healthcare Data',
    intro: 'Lets users ask healthcare questions over:',
    bullets: [
      'The live healthcare schema',
      'Operational and quality data',
      'Natural-language SQL workflows',
      'Governed query results',
    ],
    tone: '#697778',
  },
  {
    label: 'Healthcare AI Agent Console',
    intro: 'Demonstrates AI-assisted workflows with:',
    bullets: [
      'Governed healthcare data',
      'SQL and PL/SQL tools',
      'Guided operational actions',
      'Auditable agent history',
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
            Healthcare intelligence on one governed Oracle data platform.
          </h1>
          <p className="w-full text-base text-[var(--color-text-dim)] leading-7">
            This healthcare demo shows how Oracle AI Database 26ai can serve as the intelligent control tower for a provider network. It connects clinical, operational, logistics, quality, and AI workflows in one governed platform, helping users explore how healthcare organizations can improve coordination, manage capacity, surface risks, and make faster data-driven decisions.
          </p>
          <p className="w-full text-base text-[var(--color-text-dim)] leading-7">
            Follow NorthStar Health System&apos;s sepsis readmission prevention investigation across all nine use cases, from the governed data foundation through care-pathway evidence and an audited response.
          </p>
          <HealthcareStoryRail />
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
          <h2 className="text-2xl font-semibold">Key Healthcare Use Cases Featured</h2>
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
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
