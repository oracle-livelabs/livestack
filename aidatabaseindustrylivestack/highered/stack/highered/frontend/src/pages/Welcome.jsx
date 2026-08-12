import { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { JetButton } from '../components/JetControls';
import { CUSTOMER_NAME } from '../config/customer';
import { HigherEdStoryRail } from '../components/HigherEdStory';

const USE_CASES = [
  {
    label: 'Student Success Command Center',
    intro: 'Starts the fall-term enrollment and retention operating picture for:',
    bullets: [
      'Enrollment, persistence, and support-demand KPIs',
      'At-risk student request and case visibility',
      'Academic program, aid, and campus-service impact',
      'Executive-ready retention and resource context',
    ],
    outro: 'Use it to open the seller story: one term-level retention signal moves across the institution.',
    tone: '#C74634',
  },
  {
    label: 'Student Intent & Support Signals',
    intro: 'Triage student, advisor, financial aid, and alumni engagement activity to:',
    bullets: [
      'Identify emerging enrollment and persistence barriers',
      'Detect momentum around advising, aid, course access, and belonging',
      'Prioritize high-impact intervention themes',
      'Surface affected programs, cohorts, services, and advancement touchpoints',
    ],
    tone: '#4F7D7B',
  },
  {
    label: 'Advisor, Program & Support Network',
    intro: 'Demonstrates graph analytics for:',
    bullets: [
      'Advisor, advocate, program, alumni, and service relationships',
      'Referral paths, collaboration, and stewardship analysis',
      'Connected enrollment, retention, and advancement exposure',
      'Leader-ready network exploration',
    ],
    tone: '#796087',
  },
  {
    label: 'Campus Service Coverage',
    intro: 'Shows whether the institution can absorb term-start service demand across:',
    bullets: [
      'Campus service-site coverage',
      'Regional access and routing visibility',
      'Capacity pressure and response patterns',
      'Student services, advising, and operations decisions',
    ],
    tone: '#5F7D4F',
  },
  {
    label: 'Student Requests & Cases',
    intro: 'Connects students to governed support workflows for:',
    bullets: [
      'Signal-linked advising, aid, and support cases',
      'Audit-ready case workflows',
      'Partner, alumni, and campus integrations',
      'Modern API-driven higher-ed applications',
    ],
    tone: '#A36472',
  },
  {
    label: 'Predictive Student Success Analytics',
    intro: 'Forecasts downstream institutional impact on:',
    bullets: [
      'Enrollment conversion, retention risk, and service demand',
      'Student cohorts, support needs, and engagement patterns',
      'Academic program and service cohorts',
      'Predictive intervention and capacity recommendations',
    ],
    tone: '#4C825C',
  },
  {
    label: 'Ask Student Success Data',
    intro: 'Lets leaders and analysts ask scenario questions to:',
    bullets: [
      'Explain the term-level enrollment and retention story in plain English',
      'Query live governed higher-ed data',
      'Inspect evidence behind student success and fundraising decisions',
    ],
    tone: '#697778',
  },
  {
    label: 'Student Success Agent Console',
    intro: 'Shows governed AI agents coordinating:',
    bullets: [
      'Student support and service recommendations',
      'Cross-team operational actions',
      'Human-reviewable decisions',
      'Durable audit records for every recommendation',
    ],
    tone: '#6B7494',
  },
];

const STUDENT_SUCCESS_STORY = [
  {
    stage: '1',
    useCase: 'Student Success Command Center',
    summary: 'Spot term-level enrollment risk, persistence pressure, service demand, and request activity in one operating view.',
  },
  {
    stage: '2',
    useCase: 'Student Intent & Support Signals',
    summary: 'Use semantic search to understand student intent around advising, aid, wellness, course access, career support, and alumni engagement.',
  },
  {
    stage: '3',
    useCase: 'Advisor, Program & Support Network',
    summary: 'Trace which advisors, programs, support offices, and alumni relationships are amplifying or resolving student need.',
  },
  {
    stage: '4',
    useCase: 'Campus Service Coverage',
    summary: 'Locate available service capacity, evaluate regional coverage, and understand where students can be routed.',
  },
  {
    stage: '5',
    useCase: 'Student Requests & Cases',
    summary: 'Inspect how one connected request record supports operations, APIs, service routing, and case workflows.',
  },
  {
    stage: '6',
    useCase: 'Predictive Student Success Analytics',
    summary: 'Forecast enrollment and service demand, segment students, score capacity risk, and prioritize intervention decisions.',
  },
  {
    stage: '7',
    useCase: 'Ask Student Success Data',
    summary: 'Ask plain-language questions about enrollment, retention, service capacity, and advancement evidence.',
  },
  {
    stage: '8',
    useCase: 'Student Success Agent Console',
    summary: 'Turn insight into guided advising, service, and operational actions with governed AI agents.',
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
            {CUSTOMER_NAME} term enrollment and retention intelligence on one governed Oracle data platform.
          </h1>
          <div className="w-full space-y-4 text-base text-[var(--color-text-dim)] leading-7">
            <p>
              {CUSTOMER_NAME} shows how a higher education institution can respond when a fall-term enrollment and retention event exposes advising, financial aid, course access, wellness, alumni engagement, and career-readiness pressure. Leaders move from signal triage to program exposure, connected support-network investigation, campus-service capacity, predictive impact, advancement outreach, and governed AI action without leaving the trusted operational data foundation.
            </p>
            <p>
              Follow a term-level journey across {CUSTOMER_NAME}: enrollment leaders see the risk, advisors identify the students and cohorts, success teams trace relationships and referrals, service managers protect capacity, advancement teams engage alumni support, and AI agents recommend auditable next actions while Oracle AI Database 26ai keeps the evidence, access controls, and decision history governed.
            </p>
          </div>
          <HigherEdStoryRail />
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
          <h2 className="text-2xl font-semibold">Key Higher Education Use Cases Featured</h2>
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
