const os = require('os');
const { randomUUID } = require('crypto');
const db = require('../config/database');
const { getActiveOperation } = require('./datasetOperationLock');
const { generateText } = require('./ollamaAssistant');

function boundedInteger(value, fallback, min, max) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

const FINANCIAL_MODEL = process.env.OLLAMA_FINANCIAL_MODEL || 'llama3.2:1b';
const FINANCIAL_TIMEOUT_MS = boundedInteger(process.env.FINANCIAL_AI_TIMEOUT_MS, 15000, 3000, 120000);
const FINANCIAL_NUM_PREDICT = boundedInteger(process.env.FINANCIAL_AI_NUM_PREDICT, 8, 6, 64);
const FINANCIAL_NUM_CTX = boundedInteger(process.env.FINANCIAL_AI_NUM_CTX, 512, 512, 2048);
const FINANCIAL_NUM_THREAD = boundedInteger(process.env.FINANCIAL_AI_NUM_THREAD, 8, 1, 64);
const FINANCIAL_POLL_MS = boundedInteger(process.env.FINANCIAL_AI_POLL_MS, 2000, 250, 30000);
const FINANCIAL_LEASE_SECONDS = boundedInteger(process.env.FINANCIAL_AI_LEASE_SECONDS, 60, 30, 600);
const FINANCIAL_KEEP_ALIVE = process.env.FINANCIAL_AI_KEEP_ALIVE || '30m';
const RECOVERY_INTERVAL_MS = 30000;
const WORKER_ID = `finance-ai-${os.hostname()}-${process.pid}-${randomUUID().slice(0, 8)}`;

let started = false;
let stopping = false;
let timer = null;
let currentDrain = null;
let wakeRequested = false;
let lastRecoveryAt = 0;

function firstOutBind(value) {
  return Array.isArray(value) ? value[0] : value;
}

function parseJson(value, fallback = {}) {
  if (value == null) return fallback;
  if (typeof value === 'object') return value;
  try { return JSON.parse(value); } catch (_) { return fallback; }
}

async function recoverStaleJobs() {
  const result = await db.executeAsUser(
    `BEGIN
       owner_fin_validation_pkg.recover_stale_financial_ai_jobs(
         p_recovered_count => :recoveredCount
       );
     END;`,
    {
      recoveredCount: { dir: db.oracledb.BIND_OUT, type: db.oracledb.NUMBER },
    },
    'admin_ava'
  );
  const recovered = Number(firstOutBind(result.outBinds.recoveredCount) || 0);
  if (recovered > 0) console.log(`[financial-ai] Recovered ${recovered} expired job lease(s).`);
  lastRecoveryAt = Date.now();
  return recovered;
}

async function claimJob() {
  const result = await db.executeAsUser(
    `BEGIN
       owner_fin_validation_pkg.claim_financial_ai_job(
         p_worker_id => :workerId,
         p_job_id => :jobId,
         p_lease_seconds => :leaseSeconds
       );
     END;`,
    {
      workerId: WORKER_ID,
      jobId: { dir: db.oracledb.BIND_OUT, type: db.oracledb.NUMBER },
      leaseSeconds: FINANCIAL_LEASE_SECONDS,
    },
    'admin_ava'
  );
  return Number(firstOutBind(result.outBinds.jobId) || 0) || null;
}

async function loadJob(jobId) {
  const result = await db.executeAsUser(
    `SELECT j.job_id, j.run_id, j.submission_id, j.exception_id,
            j.requested_by, j.model_name, j.attempt_count, j.max_attempts,
            j.fallback_text, j.request_json,
            vr.metric_code, vr.metric_category, vr.submitted_amount,
            vr.expected_amount, vr.variance_amount, vr.variance_pct,
            vr.severity, vr.evidence_json,
            rule.rule_name, rule.basis_description,
            s.fiscal_period, b.brand_name AS property_name,
            oe.owner_name
       FROM hotel_financial_ai_jobs j
       JOIN hotel_financial_validation_results vr ON vr.exception_id = j.exception_id
       JOIN hotel_financial_validation_rules rule ON rule.rule_id = vr.rule_id
       JOIN hotel_financial_submissions s ON s.submission_id = j.submission_id
       JOIN brands b ON b.brand_id = s.property_id
       JOIN hotel_owner_entities oe ON oe.owner_id = s.owner_id
      WHERE j.job_id = :jobId
        AND j.job_status = 'PROCESSING'
        AND j.worker_id = :workerId`,
    { jobId, workerId: WORKER_ID },
    'admin_ava'
  );
  if (!result.rows.length) {
    const error = new Error(`Claimed financial AI job ${jobId} is no longer available.`);
    error.code = 'FINANCIAL_AI_JOB_NOT_FOUND';
    throw error;
  }
  return result.rows[0];
}

async function completeJob(jobId, response, metrics, latencyMs) {
  await db.executeAsUser(
    `BEGIN
       owner_fin_validation_pkg.complete_financial_ai_job(
         p_job_id => :jobId,
         p_worker_id => :workerId,
         p_response => :response,
         p_result_json => :resultJson,
         p_latency_ms => :latencyMs
       );
     END;`,
    {
      jobId,
      workerId: WORKER_ID,
      response,
      resultJson: JSON.stringify({ source: 'ollama', ...metrics }),
      latencyMs,
    },
    'admin_ava'
  );
}

async function failJob(jobId, error, latencyMs) {
  const errorMessage = String(error?.message || error || 'Unknown Ollama generation error').slice(0, 2000);
  await db.executeAsUser(
    `BEGIN
       owner_fin_validation_pkg.fail_financial_ai_job(
         p_job_id => :jobId,
         p_worker_id => :workerId,
         p_error => :errorMessage,
         p_result_json => :resultJson,
         p_latency_ms => :latencyMs,
         p_retry_delay_seconds => :retryDelaySeconds
       );
     END;`,
    {
      jobId,
      workerId: WORKER_ID,
      errorMessage,
      resultJson: JSON.stringify({
        source: 'deterministic-rule-fallback',
        errorCode: error?.code || error?.name || 'GENERATION_ERROR',
        timeoutMs: FINANCIAL_TIMEOUT_MS,
      }),
      latencyMs,
      retryDelaySeconds: 2,
    },
    'admin_ava'
  );
}

async function processJob(jobId) {
  const startedAt = Date.now();
  try {
    const job = await loadJob(jobId);
    const generated = await generateText({
      systemPrompt: 'Review only; never attest.',
      userPrompt: `${job.METRIC_CODE}: submitted ${job.SUBMITTED_AMOUNT}, Oracle ${job.EXPECTED_AMOUNT}, variance ${job.VARIANCE_AMOUNT}. Rule: ${job.RULE_NAME}. Give an 8-word owner action using Oracle evidence.`,
    }, {
      model: job.MODEL_NAME || FINANCIAL_MODEL,
      timeoutMs: FINANCIAL_TIMEOUT_MS,
      numPredict: FINANCIAL_NUM_PREDICT,
      numCtx: FINANCIAL_NUM_CTX,
      numThread: FINANCIAL_NUM_THREAD,
      keepAlive: FINANCIAL_KEEP_ALIVE,
      includeMetrics: true,
      temperature: 0.1,
    });

    const suggestedAction = String(generated?.text || '')
      .trim()
      .replace(/^["']+|["']+$/g, '')
      .replace(/\s+/g, ' ');
    if (!suggestedAction) throw new Error('Ollama returned an empty finance rationale.');
    const actionSentence = /[.!?]$/.test(suggestedAction) ? suggestedAction : `${suggestedAction}.`;
    const evidence = parseJson(job.EVIDENCE_JSON);
    const evidenceCount = Number(evidence.evidenceCount || 0);
    const signedVariance = `${Number(job.VARIANCE_AMOUNT) >= 0 ? '+' : '-'}$${Math.abs(Number(job.VARIANCE_AMOUNT || 0)).toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
    const response = `${job.METRIC_CODE.replaceAll('_', ' ')} is ${signedVariance} versus the Oracle expected amount under ${job.RULE_NAME}, supported by ${evidenceCount} governed evidence record${evidenceCount === 1 ? '' : 's'}. AI-suggested owner action: ${actionSentence} Human attestation is still required.`;
    const latencyMs = Date.now() - startedAt;
    await completeJob(jobId, response, generated.metrics || {}, latencyMs);
    console.log(`[financial-ai] Job ${jobId} completed with ${job.MODEL_NAME || FINANCIAL_MODEL} in ${latencyMs}ms.`);
  } catch (error) {
    const latencyMs = Date.now() - startedAt;
    try {
      await failJob(jobId, error, latencyMs);
      console.warn(`[financial-ai] Job ${jobId} retained deterministic fallback after ${latencyMs}ms: ${error.message}`);
    } catch (persistError) {
      console.error(`[financial-ai] Could not persist failure for job ${jobId}:`, persistError.message || persistError);
    }
  }
}

async function drainOne() {
  if (getActiveOperation()) return false;
  if (Date.now() - lastRecoveryAt >= RECOVERY_INTERVAL_MS) await recoverStaleJobs();
  const jobId = await claimJob();
  if (!jobId) return false;
  await processJob(jobId);
  return true;
}

function schedule(delayMs) {
  if (!started || stopping || timer || currentDrain) return;
  timer = setTimeout(() => {
    timer = null;
    currentDrain = drainOne()
      .catch((error) => console.error('[financial-ai] Worker cycle failed:', error.message || error))
      .finally(() => {
        currentDrain = null;
        if (!started || stopping) return;
        const delay = wakeRequested ? 0 : FINANCIAL_POLL_MS;
        wakeRequested = false;
        schedule(delay);
      });
  }, delayMs);
  timer.unref?.();
}

async function start() {
  if (started) return;
  started = true;
  stopping = false;
  try {
    await recoverStaleJobs();
  } catch (error) {
    console.warn('[financial-ai] Initial lease recovery failed; polling will retry:', error.message || error);
  }
  console.log(`[financial-ai] Sequential worker ready (${FINANCIAL_MODEL}, ${FINANCIAL_TIMEOUT_MS}ms timeout, ${FINANCIAL_KEEP_ALIVE} keep-alive).`);
  schedule(0);
}

function wake() {
  if (!started || stopping) return;
  wakeRequested = true;
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  schedule(0);
}

async function stop() {
  if (!started) return;
  stopping = true;
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  if (currentDrain) await currentDrain;
  started = false;
  stopping = false;
  wakeRequested = false;
  console.log('[financial-ai] Worker stopped.');
}

function getStatus() {
  return {
    started,
    stopping,
    busy: Boolean(currentDrain),
    workerId: WORKER_ID,
    model: FINANCIAL_MODEL,
    timeoutMs: FINANCIAL_TIMEOUT_MS,
    keepAlive: FINANCIAL_KEEP_ALIVE,
    concurrency: 1,
  };
}

module.exports = {
  FINANCIAL_MODEL,
  getStatus,
  start,
  stop,
  wake,
};
