import { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { StateLocalGovernmentStoryRail } from '../components/StateLocalGovernmentStory';
import { JetButton } from '../components/JetControls';
import { STATE_LOCAL_SCENARIO } from '../config/stateLocalScenario';

const USE_CASES = [
  {
    label: 'State and Local Government Data Foundation',
    intro: 'Shows how Oracle AI Database 26ai provides:',
    bullets: [
      'A governed public-sector operating data layer',
      'Constituent services, agency operations, programs, cases, permits, inspections, and service requests',
      'JSON documents, relational records, vectors, graph, spatial, audit, and policy-compliance data',
      'Responsible AI foundations for accessibility, transparency, auditability, and regulatory requirements',
    ],
    tone: '#437C94',
  },
  {
    label: 'Public Service Command Center',
    intro: 'Gives agency operations teams visibility into:',
    bullets: [
      'Constituent-service demand and service-level agreement risk',
      'Benefits eligibility, permits and licensing, inspections, and case-management queues',
      'Backlog reduction, resident experience, compliance exposure, and workload pressure',
      'Emergency response, public works, transportation services, and interagency coordination status',
    ],
    tone: '#C74634',
  },
  {
    label: 'Resident Demand Signals',
    intro: 'Uses vector-powered analysis across:',
    bullets: [
      'Citizen-facing digital-service feedback and resident experience signals',
      'Public assistance, health and human services, permits, licensing, and inspection updates',
      'Policy compliance, legislative and regulatory requirements, and service-delay evidence',
      'Fraud, waste, and abuse indicators linked to programs, cases, and agency actions',
    ],
    tone: '#4F7D7B',
  },
  {
    label: 'Community Partner Network',
    intro: 'Demonstrates graph analysis of relationships among:',
    bullets: [
      'Agencies, programs, community partners, residents, cases, and service requests',
      'Permits, inspections, code enforcement, records management, and policy evidence',
      'Grants management, public assistance programs, health and human services, and partner referrals',
      'Interagency workflows that drive escalation, compliance, and next-best agency action',
    ],
    tone: '#796087',
  },
  {
    label: 'Service Access and Coverage Map',
    intro: 'Applies spatial analysis to understand:',
    bullets: [
      'Public works depots, transportation services, service centers, and inspection routes',
      'Emergency operations center coverage and service-response zones',
      'Health and human services access, public assistance demand, and resident-service proximity',
      'Coverage gaps, capacity pressure, routing constraints, and equitable service delivery',
    ],
    tone: '#5F7D4F',
  },
  {
    label: 'Service Request Workbench',
    intro: 'Shows operational request workflows using:',
    bullets: [
      'Permits and licensing, business licensing, inspections, code enforcement, and case-management records',
      'Benefits eligibility, public assistance programs, tax and revenue operations, and grants management',
      'JSON Relational Duality over governed constituent-service records',
      'SLA risk, status, next-best action, and audit-ready service history',
    ],
    tone: '#A36472',
  },
  {
    label: 'Backlog, Risk and Capacity Analytics',
    intro: 'Uses in-database analytics and ML for:',
    bullets: [
      'Backlog pressure, service-delay risk, and agency capacity planning',
      'Fraud, waste, and abuse detection across benefits, tax, revenue, and grants workflows',
      'Inspection, code-enforcement, public works, transportation, and emergency-response readiness',
      'Responsible AI evidence, policy-compliance gaps, and SLA prioritization',
    ],
    tone: '#4C825C',
  },
  {
    label: 'Ask State and Local Government Data',
    intro: 'Lets users ask public-sector questions over:',
    bullets: [
      'The live State and Local Government schema',
      'Constituent services, agency operations, service requests, programs, cases, and compliance data',
      'Natural-language SQL workflows',
      'Governed query results that support transparency and auditability',
    ],
    tone: '#697778',
  },
  {
    label: 'Public Service AI Agent Console',
    intro: 'Demonstrates AI-assisted workflows with:',
    bullets: [
      'Governed constituent, program, service, policy, records, and operations data',
      'SQL and PL/SQL tools',
      'Specialist agents for constituent services, permitting, benefits, inspections, public works, tax, grants, and compliance',
      'Auditable agent history for responsible AI in government',
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
          <div>
            <p className="text-sm font-semibold tone-ocean">{STATE_LOCAL_SCENARIO.residentScopeLabel}</p>
            <h1 className="text-4xl font-semibold tracking-tight leading-tight mt-1">
              {STATE_LOCAL_SCENARIO.operatingViewLabel}
            </h1>
            <p className="mt-2 text-sm text-[var(--color-text-dim)]">
              State and Local Government service intelligence on one governed Oracle data platform.
            </p>
          </div>
          <p className="w-full text-base text-[var(--color-text-dim)] leading-7">
            This single-state operating scenario demonstrates Oracle AI Database 26ai for {STATE_LOCAL_SCENARIO.state} state and local government agencies across constituent
            services, agency operations, public sector modernization, permits and licensing, benefits eligibility,
            case management, inspections, code enforcement, public works, transportation services, tax and revenue
            operations, grants management, health and human services, emergency response, responsible AI, and
            audit-ready digital government transformation. Every resident, service center, service region, and
            operational comparison in the workflow is scoped to {STATE_LOCAL_SCENARIO.state}.
          </p>
          <p className="w-full text-sm text-[var(--color-text-dim)] leading-6">
            Jessica Chen begins with one statewide operating question: where should Colorado intervene while the
            Medicaid Eligibility Error Rate is 2.7%, within but approaching the stakeholder-provided 3.0% demo
            threshold? The live metric appears in Scene 3, and the remaining scenes trace the governed evidence into
            an in-state response.
          </p>
          <StateLocalGovernmentStoryRail />
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
          <h2 className="text-2xl font-semibold">Key State and Local Government Use Cases Featured</h2>
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
