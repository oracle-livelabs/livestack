import { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { JetButton } from '../components/JetControls';
import { HospitalityStoryRail } from '../components/HospitalityStory';
import { CUSTOMER_NAME } from '../config/customer';

const USE_CASES = [
  {
    label: 'Hospitality LiveStack Portfolio Performance Command Center',
    intro: 'Opens the executive operating picture for a global multi-brand portfolio:',
    bullets: [
      'Occupancy, ADR, RevPAR, and total revenue by region, brand tier, and property',
      'Room revenue, food and beverage revenue, event revenue, and ancillary revenue',
      'Guest Rewards, direct, OTA, corporate, group, and wholesale demand visibility',
      'Guest satisfaction, NPS, service recovery, and brand-standard pressure',
      'Executive-ready property, owner, and portfolio context',
    ],
    outro: 'Use it to open the response story: one Guest Rewards-led demand and service pattern is moving through the hospitality operation.',
    tone: '#A73529',
  },
  {
    label: 'Guest Rewards & Demand Signal Intelligence',
    intro: 'Triage member, guest, channel, and operational activity to:',
    bullets: [
      'Identify emerging guest-experience issues across luxury, premium, select, and longer-stay brands',
      'Detect booking pace, cancellation, and channel shifts',
      'Prioritize service alerts by revenue, loyalty, and owner impact',
      'Surface affected properties, room types, group blocks, and guest workflows',
    ],
    tone: '#4F7D7B',
  },
  {
    label: 'Connected Guest Experience Network',
    intro: 'Demonstrates graph analytics for:',
    bullets: [
      'Guest Rewards member, reservation, room, venue, service, and property relationships',
      'Recurring complaint, shared-service-failure, and brand-standard detection',
      'Issue propagation and connected revenue impact analysis',
      'Executive and operator-ready network exploration',
    ],
    tone: '#796087',
  },
  {
    label: 'Arrival Readiness & Engineering Coverage',
    intro: 'Shows whether operations can absorb arrival and service pressure across:',
    bullets: [
      'Property, tower, floor, room, venue, and outlet coverage',
      'Arrival-readiness, out-of-order room, and maintenance response visibility',
      'Task distribution and crew capacity',
      'Housekeeping, engineering, front-office, and event-setup decisions',
    ],
    tone: '#5F7D4F',
  },
  {
    label: 'Reservation, Folio & Group Operations',
    intro: 'Connects reservations to governed service and revenue workflows for:',
    bullets: [
      'Signal-linked reservation, Guest Rewards stay, and room-block review',
      'Audit-ready service-recovery workflows',
      'OTA, direct, corporate, group, meetings, and events channel integrations',
      'Modern API-driven hospitality applications for managed and franchised properties',
    ],
    tone: '#A36472',
  },
  {
    label: 'Predictive RevPAR, Labor & Owner Value',
    intro: 'Forecasts the downstream impact of demand and service pressure on:',
    bullets: [
      'Occupancy, ADR, RevPAR, and booking pace',
      'Cancellation rate, no-show rate, and average length of stay',
      'Brand tier, room type, revenue-center, channel, and owner cohorts',
      'Predictive housekeeping, labor cost, and cost per occupied room recommendations',
    ],
    tone: '#3E6F4D',
  },
  {
    label: 'Governed Data Copilot',
    intro: 'Lets managers and analysts ask scenario questions to:',
    bullets: [
      'Explain the hospitality performance storyline in plain English',
      'Query live governed hospitality data',
      'Inspect evidence behind revenue and operations decisions',
    ],
    tone: '#697778',
  },
  {
    label: 'Hospitality Agent Console',
    intro: 'Shows governed AI agents coordinating:',
    bullets: [
      'Revenue, loyalty, service, brand-standard, and operations recommendations',
      'Cross-team operational actions',
      'Human-reviewable decisions',
      'Durable audit records for every recommendation',
    ],
    tone: '#6B7494',
  },
  {
    label: 'Owner Financial Validation Workbench',
    intro: 'Moves synthetic property close review from manual reconciliation to governed exception handling for:',
    bullets: [
      'Owner-reported room revenue, fee basis, management fee, adjustments, and close inputs',
      'Oracle-backed comparisons to reservation, folio-line, property, and validation-rule evidence',
      'AI-assisted rationale and owner close-note generation with deterministic fallback',
      'Human owner validation, correction requests, timing treatment, finance escalation, and durable audit IDs',
    ],
    tone: '#A73529',
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
            Portfolio performance and hotel operations on one governed Oracle data platform.
          </h1>
          <div className="w-full space-y-4 text-base text-[var(--color-text-dim)] leading-7">
            <p>
              This demo represents a multi-brand hospitality operator spanning luxury, premium, select-service, extended-stay, resort, and convention properties. Leaders can see how loyalty demand, channel mix, room readiness, group blocks, food and beverage, events, labor, and owner value move together before a performance pattern becomes a guest-experience issue.
            </p>
            <p>
              Follow a fictional portfolio from demand detection through guest-experience investigation, arrival-readiness protection, revenue analysis, and owner-close validation. Oracle AI Database 26ai keeps operational evidence, access controls, analytics, and decision history together throughout the journey.
            </p>
          </div>
          <HospitalityStoryRail />
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
          <h2 className="text-2xl font-semibold">Hospitality Executive Use Cases</h2>
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
                  background: useCasePage === index ? '#8A4E2F' : 'var(--color-border)',
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
