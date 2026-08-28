import { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { JetButton } from '../components/JetControls';
import { MediaStoryRail } from '../components/MediaStory';
import { CUSTOMER_NAME } from '../config/customer';

const USE_CASES = [
  {
    label: 'Data Foundation',
    intro: 'Establishes one governed Oracle AI Database 26ai foundation for:',
    bullets: [
      'Content assets, audience accounts, campaigns, and rights capacity',
      'Native JSON, vector, graph, spatial, and OML evidence',
      'Governed persona context and unified audit evidence',
      'One active data generation shared by every guided scene',
    ],
    tone: '#437C94',
  },
  {
    label: 'Launch Operations Command Center',
    intro: 'Centralizes the Midnight Harbor premiere weekend view of:',
    bullets: [
      'Launch KPIs and campaign performance',
      'Audience momentum and content demand',
      'Rights capacity and live-event readiness',
      'Studio, creator, publisher, and platform decisions',
    ],
    outro: 'Frames the business problem first: how to act while demand, monetization, and capacity are moving at once.',
    tone: '#C74634',
  },
  {
    label: 'Audience Momentum & Safety Signals',
    intro: 'Uses vector embeddings and similarity search to:',
    bullets: [
      'Detect breakout fan, viewer, and subscriber signals',
      'Analyze content sentiment and moderation risk',
      'Find related content, campaigns, and audience segments',
      'Surface churn, watch-time, ARPU, and offer-response signals',
    ],
    tone: '#4F7D7B',
  },
  {
    label: 'Creator & Community Graph',
    intro: 'Demonstrates graph analytics for:',
    bullets: [
      'Creator, studio, and fan-community ecosystems',
      'Studio, publisher, and platform relationships',
      'Content propagation and campaign influence paths',
      'Recommendation, affinity, and partnership analysis',
    ],
    tone: '#796087',
  },
  {
    label: 'Rights, Capacity & Live Event Coverage',
    intro: 'Uses Oracle Spatial capabilities to optimize:',
    bullets: [
      'Regional audience demand and coverage',
      'Rights capacity and distribution readiness',
      'Watch party, premiere, and live-event operations',
      'Hub proximity and activation route decisions',
    ],
    tone: '#5F7D4F',
  },
  {
    label: 'Campaign & Rights Requests',
    intro: 'Highlights JSON Duality and transactional workflows for:',
    bullets: [
      'Campaign and rights request management',
      'Audience-signal attribution',
      'Partner, sponsor, and platform integrations',
      'Modern API-driven media operations',
    ],
    tone: '#A36472',
  },
  {
    label: 'Engagement, Revenue & Retention Forecasts',
    intro: 'Embedded machine learning workflows for:',
    bullets: [
      'Audience demand forecasting',
      'Subscriber, viewer, and fan segmentation',
      'Churn, retention, ARPU, and LTV modeling',
      'Monetization and campaign optimization recommendations',
    ],
    tone: '#4C825C',
  },
  {
    label: 'Ask Media and Entertainment Data',
    intro: 'Natural-language SQL experience allowing users to:',
    bullets: [
      'Ask business questions conversationally',
      'Query live media and entertainment schemas',
      'Explore content, audience, campaign, and rights data',
      'Democratize governed data access for non-technical users',
    ],
    tone: '#697778',
  },
  {
    label: 'Media and Entertainment Action Console',
    intro: 'Demonstrates AI agents orchestrating:',
    bullets: [
      'SQL and PL/SQL tools',
      'Automated media and entertainment operations workflows',
      'Guided retention, moderation, monetization, and capacity actions',
      'Auditable recommendations and operational history',
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
            Media and Entertainment intelligence on one governed Oracle data platform.
          </h1>
          <div className="w-full space-y-4 text-base text-[var(--color-text-dim)] leading-7">
            <p>
              {CUSTOMER_NAME} shows how media companies, entertainment studios, streaming platforms, sports media teams, and content publishers unite content operations, audience insight, monetization, and AI analytics on one governed Oracle data platform. Built on Oracle AI Database 26ai, this demo combines relational, JSON, graph, spatial, vector, and machine learning capabilities to drive connected workflows from a single data foundation.
            </p>
            <p>
              Follow {CUSTOMER_NAME}, a fictional media and entertainment company, through the Midnight Harbor premiere weekend. Business users, analysts, and operations teams move from launch planning to audience engagement, rights capacity, campaign monetization, churn and retention forecasting, and AI-assisted actions with clear, data-driven decisions.
            </p>
          </div>
          <p className="text-sm font-semibold text-[var(--color-text)]">
            Nine guided scenes. One Midnight Harbor premiere story.
          </p>
          <MediaStoryRail />
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
          <h2 className="text-2xl font-semibold">Key Media and Entertainment Use Cases Featured</h2>
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
