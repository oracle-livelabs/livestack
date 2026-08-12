import { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { EnergyUtilitiesStoryRail } from '../components/EnergyUtilitiesStory';
import { JetButton } from '../components/JetControls';

const USE_CASES = [
  {
    label: 'Energy & Utilities Data Foundation',
    intro: 'Shows how Oracle AI Database 26ai provides:',
    bullets: [
      'A governed cross-sector data layer',
      'Electric, gas, water, wastewater, and oil & gas entities',
      'JSON documents, relational records, vectors, graph, and spatial data',
      'Compliance, HSE, emissions, and regulatory records',
    ],
    tone: '#437C94',
  },
  {
    label: 'Energy Operations Command Center',
    intro: 'Gives cross-sector operations teams visibility into:',
    bullets: [
      'Electric outages and gas leak response',
      'Water main breaks and wastewater alerts',
      'Pipeline, refinery, LNG, and production exceptions',
      'Field crew status and critical asset alerts',
    ],
    tone: '#C74634',
  },
  {
    label: 'Reliability, Production & Compliance Signals',
    intro: 'Uses vector-powered analysis across:',
    bullets: [
      'SAIDI, SAIFI, feeder utilization, and outage risk',
      'Pipeline pressure, leak SLA, and integrity signals',
      'Well production, refinery throughput, and LNG logistics',
      'Emissions, HSE, and wastewater compliance alerts',
    ],
    tone: '#4F7D7B',
  },
  {
    label: 'Operational Event Graph',
    intro: 'Demonstrates graph analysis of relationships among:',
    bullets: [
      'Outages, gas leaks, water breaks, and wastewater overflows',
      'Pipeline anomalies, well issues, refinery constraints, and LNG delays',
      'Affected customers, assets, inspections, work orders, and root causes',
      'Compliance records and resolution milestones',
    ],
    tone: '#796087',
  },
  {
    label: 'Field Operations Logistics Map',
    intro: 'Applies spatial analysis to understand:',
    bullets: [
      'Outage, leak, main-break, and overflow locations',
      'Pipeline, pump, compressor, refinery, well, and LNG assets',
      'Crew, depot, restricted-access, safety, and environmental zones',
      'Travel time and repair-priority areas',
    ],
    tone: '#5F7D4F',
  },
  {
    label: 'Utility Service Requests',
    intro: 'Shows operational service-request workflows using:',
    bullets: [
      'Outage, gas odor, water leak, and sewer overflow reports',
      'Billing, collections, move-in, high-usage, and retail plan inquiries',
      'DER, EV charger, vegetation, streetlight, and industrial requests',
      'JSON Relational Duality over governed operational records',
    ],
    tone: '#A36472',
  },
  {
    label: 'Asset Risk & Capacity Analytics',
    intro: 'Uses in-database analytics and ML for:',
    bullets: [
      'Transformer, feeder, pipeline, corrosion, and regulator risk',
      'Pump station, treatment plant, and wastewater compliance capacity',
      'Well decline, refinery constraints, LNG logistics, and turnaround readiness',
      'Maintenance, emissions, HSE, crew capacity, and replacement priority',
    ],
    tone: '#4C825C',
  },
  {
    label: 'Ask Energy & Utilities Data',
    intro: 'Lets users ask industry-wide questions over:',
    bullets: [
      'The live Energy & Utilities schema',
      'Electric, gas, water/wastewater, and oil & gas data',
      'Natural-language SQL workflows',
      'Governed query results',
    ],
    tone: '#697778',
  },
  {
    label: 'Energy & Utilities AI Agent Console',
    intro: 'Demonstrates AI-assisted workflows with:',
    bullets: [
      'Governed cross-sector operations data',
      'SQL and PL/SQL tools',
      'Specialist agents for grid, gas, water, oil & gas, HSE, and customers',
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
            Energy & Utilities intelligence on one governed Oracle data platform.
          </h1>
          <p className="w-full text-base text-[var(--color-text-dim)] leading-7">
            This LiveStack demonstrates Oracle AI Database 26ai for Energy & Utilities across electric utilities, gas utilities, water and wastewater utilities, and oil & gas upstream, midstream, and downstream operations. It connects operational resilience, asset integrity, field execution, customer operations, production optimization, regulatory compliance, HSE, emissions reporting, and AI-assisted decision-making in one governed platform.
          </p>
          <EnergyUtilitiesStoryRail />
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
          <h2 className="text-2xl font-semibold">Key Energy & Utilities Use Cases Featured</h2>
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
