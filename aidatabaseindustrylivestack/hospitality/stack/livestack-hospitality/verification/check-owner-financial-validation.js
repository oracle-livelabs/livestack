#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const checks = [
  {
    file: 'frontend/src/App.jsx',
    terms: ['OwnerFinancialValidation', "id: 'ownerfinancial'", 'ownerfinancial: OwnerFinancialValidation'],
  },
  {
    file: 'frontend/src/components/HospitalityStory.jsx',
    terms: ["stage: '10'", 'Owner Financial Validation Workbench', 'ownerfinancial:'],
  },
  {
    file: 'frontend/src/pages/OwnerFinancialValidation.jsx',
    terms: [
      'Run AI validation', 'Owner validates exception', 'Request correction',
      'Mark as timing difference', 'Escalate to finance', 'Add note',
      'How validation works', 'Room revenue formula', 'Fee validation rule',
      'AI rationale', 'Oracle evidence', 'Owner attestation',
      'Variance by metric category', 'Submitted vs Oracle expected',
      'Exception severity distribution', 'Reconciliation waterfall',
      'api.financialValidation', 'api.financialValidation.aiJobs', 'AI enriching',
      'deterministic-rule-fallback', 'Generate owner close note',
      'Governed close summary', 'financial-close-note-target', 'RegisterOraclePanel',
    ],
  },
  {
    file: 'backend/routes/financialValidation.js',
    terms: [
      "router.get('/summary'", "router.get('/exceptions'", "router.get('/exceptions/:id'",
      "router.post('/run'", "router.post('/exceptions/:id/action'", "router.get('/charts'",
      "router.get('/ai-jobs'", "router.get('/internals'", "router.post('/close-note'", 'owner_fin_validation_pkg',
      'enqueue_run_ai_rationales', 'financialAiWorker.wake()',
      'buildOwnerCloseNote', 'propertyName: summary.PROPERTY_NAME',
    ],
    absentTerms: ['Promise.all(rationaleCandidates', 'summarizeContext'],
  },
  {
    file: 'backend/lib/ownerCloseNote.js',
    terms: [
      'buildOwnerCloseNote', 'oracle-governed-summary',
      'no exception has been auto-attested', 'separate human action',
    ],
  },
  {
    file: 'db/schema/13_owner_financial_validation.sql',
    terms: [
      'hotel_owner_entities', 'hotel_property_owner_map', 'hotel_financial_submissions',
      'hotel_financial_submission_lines', 'hotel_financial_validation_rules',
      'hotel_financial_validation_runs', 'hotel_financial_validation_results',
      'hotel_financial_validation_actions', 'hotel_financial_ai_jobs',
      'hotel_financial_validation_summary_v', 'hotel_financial_ai_job_status_v',
      'hotel_financial_exception_queue_v', 'hotel_financial_variance_trend_v',
      'hotel_financial_metric_variance_v', 'hotel_financial_owner_status_v',
      'owner_fin_validation_pkg', 'run_financial_validation',
      'enqueue_run_ai_rationales', 'claim_financial_ai_job',
      'complete_financial_ai_job', 'fail_financial_ai_job',
      'recover_stale_financial_ai_jobs',
      'record_financial_validation_action', 'refresh_demo_data', 'DBMS_RLS.ADD_POLICY',
    ],
  },
  {
    file: 'backend/lib/financialAiWorker.js',
    terms: [
      'llama3.2:1b', 'FINANCIAL_AI_TIMEOUT_MS', '15000',
      'claim_financial_ai_job', 'complete_financial_ai_job',
      'fail_financial_ai_job', 'recover_stale_financial_ai_jobs',
      'keepAlive', 'concurrency: 1',
    ],
  },
  {
    file: 'backend/lib/ollamaAssistant.js',
    terms: ['keep_alive', 'includeMetrics', 'num_ctx', 'num_thread'],
  },
  {
    file: 'backend/server.js',
    terms: ['financialAiWorker.start()', 'financialAiWorker.stop()'],
  },
  {
    file: 'compose.yml',
    terms: ['OLLAMA_FINANCIAL_MODEL', 'llama3.2:1b', 'FINANCIAL_AI_TIMEOUT_MS', '15000', 'OLLAMA_NUM_PARALLEL'],
  },
  {
    file: 'scripts/pull_ollama.sh',
    terms: ['OLLAMA_FINANCIAL_MODEL', 'llama3.2:1b', 'Prewarming finance model', 'ollama-financial-ready'],
  },
  {
    file: 'scripts/bootstrap_db.sh',
    terms: ['13_owner_financial_validation.sql', 'load_owner_financial_validation.sql', '11_hospitality_views.sql'],
  },
];

const failures = [];
for (const check of checks) {
  const filePath = path.join(ROOT, check.file);
  if (!fs.existsSync(filePath)) {
    failures.push(`${check.file}: file is missing`);
    continue;
  }
  const content = fs.readFileSync(filePath, 'utf8');
  for (const term of check.terms) {
    if (!content.includes(term)) failures.push(`${check.file}: missing ${JSON.stringify(term)}`);
  }
  for (const term of check.absentTerms || []) {
    if (content.includes(term)) failures.push(`${check.file}: forbidden legacy term ${JSON.stringify(term)}`);
  }
}

if (failures.length) {
  console.error('Owner Financial Validation verification failed.');
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log('Owner Financial Validation verification passed: Scene 10 UI, durable Oracle AI jobs, sequential worker, tuned Ollama path, actions, overlays, analytics, and bootstrap wiring are present.');
