import { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { JetButton } from '../components/JetControls';
import { ManufacturingStoryRail } from '../components/ManufacturingStory';

const USE_CASES = [
  {
    label: 'Data Foundation',
    intro: 'Shows how Oracle AI Database 26ai provides:',
    bullets: [
      'A governed manufacturing data layer',
      'Connected production and operational entities',
      'JSON documents and relational work orders',
      'Graph relationships for supplier and production risk',
    ],
    tone: '#437C94',
  },
  {
    label: 'Operations Command Center',
    intro: 'Gives factory operations teams visibility into:',
    bullets: [
      'Plant performance',
      'Work order status and schedule risk',
      'Production throughput and capacity',
      'Supplier and line coordination',
    ],
    tone: '#C74634',
  },
  {
    label: 'Production and Quality Signals',
    intro: 'Uses vector-powered analysis across:',
    bullets: [
      'Machine telemetry',
      'Quality inspection findings',
      'Supplier delay signals',
      'Related work order evidence',
    ],
    tone: '#4F7D7B',
  },
  {
    label: 'Production Risk Graph',
    intro: 'Demonstrates graph analysis of relationships among:',
    bullets: [
      'Suppliers and constrained materials',
      'Plants, lines, and machines',
      'Work orders and production batches',
      'Quality escapes and downtime signals',
    ],
    tone: '#796087',
  },
  {
    label: 'Plant Logistics Map',
    intro: 'Applies spatial analysis to understand:',
    bullets: [
      'Plant coverage',
      'Production capacity centers',
      'Route and service-region proximity',
      'Regional demand and supply risk',
    ],
    tone: '#5F7D4F',
  },
  {
    label: 'Manufacturing Work Orders',
    intro: 'Shows operational work-order workflows using:',
    bullets: [
      'JSON document views',
      'Relational duality views',
      'Line-item and manufactured-part context',
      'Governed production records',
    ],
    tone: '#A36472',
  },
  {
    label: 'Risk and Capacity Analytics',
    intro: 'Uses in-database analytics and ML for:',
    bullets: [
      'Demand forecasting',
      'Supplier delay risk',
      'Downtime and defect risk',
      'Capacity planning',
    ],
    tone: '#4C825C',
  },
  {
    label: 'Ask Manufacturing Data',
    intro: 'Lets users ask manufacturing questions over:',
    bullets: [
      'The live manufacturing schema',
      'Work order and plant-capacity data',
      'Natural-language SQL workflows',
      'Governed query results',
    ],
    tone: '#697778',
  },
  {
    label: 'Manufacturing AI Agent Console',
    intro: 'Demonstrates AI-assisted workflows with:',
    bullets: [
      'Governed manufacturing data',
      'SQL and PL/SQL tools',
      'Guided production actions',
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
            Manufacturing intelligence on one governed Oracle data platform.
          </h1>
          <div className="w-full space-y-4 text-base text-[var(--color-text-dim)] leading-7">
            <p>
              This manufacturing demo shows how Oracle AI Database 26ai can serve as the intelligent control tower for factory operations. It connects production planning, shop floor signals, plant capacity, supplier risk, quality inspection, predictive maintenance, and AI workflows in one governed platform, helping users improve throughput, reduce downtime, prioritize work orders, and make faster data-driven decisions.
            </p>
            <p>
              Follow Seer Manufacturing as production supervisors, planners, quality teams, supplier managers, and AI agents recover the Servo Drive Controller AX-400 production plan from constrained PCB material, work-order schedule variance, and plant capacity pressure.
            </p>
          </div>
          <ManufacturingStoryRail />
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
          <h2 className="text-2xl font-semibold">Key Manufacturing Use Cases Featured</h2>
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
