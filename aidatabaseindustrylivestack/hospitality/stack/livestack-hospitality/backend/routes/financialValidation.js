/**
 * Scene 10 - Owner Financial Validation Workbench API.
 * All financial amounts, evidence, chart series, and actions originate in Oracle.
 */

const express = require('express');
const router = express.Router();
const db = require('../config/database');
const financialAiWorker = require('../lib/financialAiWorker');
const { buildOwnerCloseNote } = require('../lib/ownerCloseNote');

const ACTION_TYPES = new Set([
  'OWNER_VALIDATE',
  'REQUEST_CORRECTION',
  'TIMING_DIFFERENCE',
  'ESCALATE_FINANCE',
  'ADD_NOTE',
]);
const METRIC_CATEGORIES = new Set(['Room Revenue', 'Fees', 'Adjustments', 'Close Inputs']);
const SEVERITIES = new Set(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']);
const SUBMISSION_STATUSES = new Set([
  'SUBMITTED', 'VALIDATED', 'OWNER_VALIDATED', 'CORRECTION_REQUESTED',
  'TIMING_REVIEW', 'FINANCE_REVIEW', 'READY_TO_CLOSE',
]);

function firstOutBind(value) {
  return Array.isArray(value) ? value[0] : value;
}

function parseJson(value, fallback = null) {
  if (value == null) return fallback;
  if (typeof value === 'object') return value;
  try { return JSON.parse(value); } catch (_) { return fallback; }
}

function numberParam(value, name, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
  if (value == null || value === '') return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) {
    const error = new Error(`${name} must be a number between ${min} and ${max}.`);
    error.statusCode = 400;
    throw error;
  }
  return parsed;
}

function idListParam(value, name, maxItems = 100) {
  if (value == null || value === '') return [];
  const values = String(value).split(',').map((item) => item.trim()).filter(Boolean);
  if (values.length > maxItems) {
    const error = new Error(`${name} accepts at most ${maxItems} IDs.`);
    error.statusCode = 400;
    throw error;
  }
  return values.map((item) => numberParam(item, name, { min: 1 }));
}

function enumParam(value, allowed, name) {
  if (value == null || value === '') return null;
  const normalized = String(value).trim();
  if (!allowed.has(normalized)) {
    const error = new Error(`Unsupported ${name}: ${normalized}`);
    error.statusCode = 400;
    throw error;
  }
  return normalized;
}

function actorParam(value, fallback = 'admin_ava') {
  return String(value || '').trim() || fallback;
}

function queryFilters(query) {
  return {
    period: query.period ? String(query.period).trim() : null,
    region: query.region ? String(query.region).trim() : null,
    propertyId: numberParam(query.propertyId, 'propertyId'),
    ownerId: numberParam(query.ownerId, 'ownerId'),
    submissionId: numberParam(query.submissionId, 'submissionId'),
    status: enumParam(query.status, SUBMISSION_STATUSES, 'submission status'),
    severity: enumParam(query.severity ? String(query.severity).toUpperCase() : null, SEVERITIES, 'severity'),
    metricCategory: enumParam(query.metricCategory, METRIC_CATEGORIES, 'metric category'),
    threshold: numberParam(query.threshold, 'threshold', { min: 0, max: 50 }),
  };
}

function addWhere(clauses, binds, expression, bindName, value) {
  if (value == null || value === '') return;
  clauses.push(`${expression} = :${bindName}`);
  binds[bindName] = value;
}

function summaryWhere(filters, alias = 's') {
  const clauses = [];
  const binds = {};
  if (filters.period) {
    clauses.push(`TO_CHAR(${alias}.fiscal_period, 'YYYY-MM') = :period`);
    binds.period = filters.period;
  }
  addWhere(clauses, binds, `${alias}.region`, 'region', filters.region);
  addWhere(clauses, binds, `${alias}.property_id`, 'propertyId', filters.propertyId);
  addWhere(clauses, binds, `${alias}.owner_id`, 'ownerId', filters.ownerId);
  addWhere(clauses, binds, `${alias}.submission_id`, 'submissionId', filters.submissionId);
  addWhere(clauses, binds, `${alias}.submission_status`, 'status', filters.status);
  if (filters.severity || filters.metricCategory || filters.threshold != null) {
    const child = [`q.submission_id = ${alias}.submission_id`];
    if (filters.severity) {
      child.push('q.severity = :severity');
      binds.severity = filters.severity;
    }
    if (filters.metricCategory) {
      child.push('q.metric_category = :metricCategory');
      binds.metricCategory = filters.metricCategory;
    }
    if (filters.threshold != null) {
      child.push('ABS(q.variance_pct) >= :threshold');
      binds.threshold = filters.threshold;
    }
    clauses.push(`EXISTS (SELECT 1 FROM hotel_financial_exception_queue_v q WHERE ${child.join(' AND ')})`);
  }
  return { sql: clauses.length ? `WHERE ${clauses.join(' AND ')}` : '', binds };
}

function exceptionWhere(filters, alias = 'q') {
  const clauses = [];
  const binds = {};
  if (filters.period) {
    clauses.push(`TO_CHAR(${alias}.fiscal_period, 'YYYY-MM') = :period`);
    binds.period = filters.period;
  }
  addWhere(clauses, binds, `${alias}.region`, 'region', filters.region);
  addWhere(clauses, binds, `${alias}.property_id`, 'propertyId', filters.propertyId);
  addWhere(clauses, binds, `${alias}.owner_id`, 'ownerId', filters.ownerId);
  addWhere(clauses, binds, `${alias}.submission_id`, 'submissionId', filters.submissionId);
  addWhere(clauses, binds, `${alias}.submission_status`, 'status', filters.status);
  addWhere(clauses, binds, `${alias}.severity`, 'severity', filters.severity);
  addWhere(clauses, binds, `${alias}.metric_category`, 'metricCategory', filters.metricCategory);
  if (filters.threshold != null) {
    clauses.push(`ABS(${alias}.variance_pct) >= :threshold`);
    binds.threshold = filters.threshold;
  }
  return { sql: clauses.length ? `WHERE ${clauses.join(' AND ')}` : '', binds };
}

async function fetchFilterOptions(demoUser) {
  const [periods, regions, properties, owners] = await Promise.all([
    db.executeAsUser(
      `SELECT DISTINCT fiscal_period_label AS value, fiscal_period_label AS label
         FROM hotel_financial_validation_summary_v
        ORDER BY value DESC`, {}, demoUser
    ),
    db.executeAsUser(
      `SELECT DISTINCT region AS value, region AS label
         FROM hotel_financial_validation_summary_v
        ORDER BY label`, {}, demoUser
    ),
    db.executeAsUser(
      `SELECT DISTINCT property_id AS value, property_name AS label
         FROM hotel_financial_validation_summary_v
        ORDER BY label`, {}, demoUser
    ),
    db.executeAsUser(
      `SELECT DISTINCT owner_id AS value, owner_name AS label
         FROM hotel_financial_validation_summary_v
        ORDER BY label`, {}, demoUser
    ),
  ]);
  return {
    periods: periods.rows,
    regions: regions.rows,
    properties: properties.rows,
    owners: owners.rows,
    statuses: [...SUBMISSION_STATUSES].map((value) => ({ VALUE: value, LABEL: value.replaceAll('_', ' ') })),
    severities: [...SEVERITIES].map((value) => ({ VALUE: value, LABEL: value })),
    metricCategories: [...METRIC_CATEGORIES].map((value) => ({ VALUE: value, LABEL: value })),
  };
}

router.get('/summary', async (req, res, next) => {
  try {
    const filters = queryFilters(req.query);
    const where = summaryWhere(filters);
    const matchingExceptions = exceptionWhere(filters);
    const [aggregate, submissions, options] = await Promise.all([
      db.executeAsUser(
         `WITH selected_submissions AS (
           SELECT s.* FROM hotel_financial_validation_summary_v s ${where.sql}
         ), selected_exceptions AS (
           SELECT q.exception_id FROM hotel_financial_exception_queue_v q ${matchingExceptions.sql}
         ), exception_totals AS (
           SELECT COUNT(*) AS exception_count FROM selected_exceptions
         )
         SELECT ROUND(NVL(SUM(s.submitted_room_revenue), 0), 2) AS submitted_room_revenue,
                ROUND(NVL(SUM(s.expected_room_revenue), 0), 2) AS expected_room_revenue,
                ROUND(NVL(SUM(s.variance_amount), 0), 2) AS variance_amount,
                MAX(ec.exception_count) AS exception_count,
                ROUND(NVL(AVG(s.auto_cleared_pct), 0), 2) AS auto_cleared_pct,
                ROUND(NVL(AVG(s.close_readiness_score), 0), 2) AS close_readiness_score,
                COUNT(*) AS submission_count,
                CASE
                  WHEN COUNT(*) = 0 THEN 'NO SUBMISSION'
                  WHEN SUM(CASE WHEN s.submission_status = 'OWNER_VALIDATED' THEN 0 ELSE 1 END) = 0 THEN 'OWNER VALIDATED'
                  WHEN SUM(CASE WHEN s.submission_status = 'FINANCE_REVIEW' THEN 1 ELSE 0 END) > 0 THEN 'FINANCE REVIEW'
                  WHEN SUM(CASE WHEN s.submission_status = 'CORRECTION_REQUESTED' THEN 1 ELSE 0 END) > 0 THEN 'CORRECTION REQUESTED'
                  ELSE 'EXCEPTIONS TO REVIEW'
                END AS owner_validation_status
           FROM selected_submissions s
           CROSS JOIN exception_totals ec`,
        { ...where.binds, ...matchingExceptions.binds }, req.demoUser
      ),
      db.executeAsUser(
        `SELECT s.* FROM hotel_financial_validation_summary_v s
         ${where.sql}
         ORDER BY s.fiscal_period DESC, s.exception_count DESC, s.property_name
         FETCH FIRST 100 ROWS ONLY`,
        where.binds, req.demoUser
      ),
      fetchFilterOptions(req.demoUser),
    ]);
    res.json({ summary: aggregate.rows[0], submissions: submissions.rows, filters: options, synthetic: true });
  } catch (error) { next(error); }
});

router.get('/exceptions', async (req, res, next) => {
  try {
    const filters = queryFilters(req.query);
    const where = exceptionWhere(filters);
    const result = await db.executeAsUser(
      `SELECT q.* FROM hotel_financial_exception_queue_v q
       ${where.sql}
       ORDER BY CASE q.severity WHEN 'CRITICAL' THEN 1 WHEN 'HIGH' THEN 2 WHEN 'MEDIUM' THEN 3 ELSE 4 END,
                ABS(q.variance_amount) DESC, q.property_name
       FETCH FIRST 250 ROWS ONLY`,
      where.binds, req.demoUser
    );
    res.json({ exceptions: result.rows, count: result.rows.length, synthetic: true });
  } catch (error) { next(error); }
});

router.get('/exceptions/:id', async (req, res, next) => {
  try {
    const exceptionId = numberParam(req.params.id, 'exception id', { min: 1 });
    const detailResult = await db.executeAsUser(
      `SELECT q.*, r.rule_name, r.tolerance_amount, r.tolerance_pct,
              r.rate_pct, r.basis_description,
              s.submitted_by, s.submitted_at, s.ai_summary, s.close_readiness_score
         FROM hotel_financial_exception_queue_v q
         JOIN hotel_financial_validation_rules r ON r.rule_id = q.rule_id
         JOIN hotel_financial_submissions s ON s.submission_id = q.submission_id
        WHERE q.exception_id = :exceptionId`,
      { exceptionId }, req.demoUser
    );
    if (!detailResult.rows.length) return res.status(404).json({ error: 'Financial validation exception not found.' });
    const detail = detailResult.rows[0];
    const suggestedOwnerAction = detail.SEVERITY === 'CRITICAL'
      ? 'Escalate to finance and request source correction before close attestation.'
      : detail.METRIC_CATEGORY === 'Adjustments'
        ? 'Confirm whether this is a timing difference or a duplicate close adjustment.'
        : detail.VARIANCE_AMOUNT < 0
          ? 'Review the owner source schedule and request correction if the shortfall is not timing-related.'
          : 'Validate the supporting owner schedule against the sampled Oracle evidence.';

    const [actions, lines, samples] = await Promise.all([
      db.executeAsUser(
        `SELECT action_id, action_type, action_by, action_note, action_payload, created_at
           FROM hotel_financial_validation_actions
          WHERE exception_id = :exceptionId
          ORDER BY created_at DESC, action_id DESC`,
        { exceptionId }, req.demoUser
      ),
      db.executeAsUser(
        `SELECT l.line_id, l.metric_code, l.metric_category, l.submitted_amount,
                l.submitted_units, l.currency_code, l.source_label, l.note
           FROM hotel_financial_submission_lines l
          WHERE l.submission_id = :submissionId
          ORDER BY l.metric_category, l.metric_code`,
        { submissionId: detail.SUBMISSION_ID }, req.demoUser
      ),
      db.executeAsUser(
        `SELECT o.order_id AS reservation_id, o.order_status AS reservation_status,
                TO_CHAR(CAST(o.created_at AS DATE), 'YYYY-MM-DD') AS booked_date,
                p.product_name AS folio_line, p.category AS revenue_center,
                oi.quantity, oi.unit_price, oi.line_total
           FROM orders o
           JOIN order_items oi ON oi.order_id = o.order_id
           JOIN products p ON p.product_id = oi.product_id
          WHERE p.brand_id = :propertyId
            AND TRUNC(CAST(o.created_at AS DATE), 'MM') = TRUNC(:fiscalPeriod, 'MM')
          ORDER BY o.created_at DESC, o.order_id DESC
          FETCH FIRST 8 ROWS ONLY`,
        { propertyId: detail.PROPERTY_ID, fiscalPeriod: detail.FISCAL_PERIOD }, req.demoUser
      ),
    ]);

    res.json({
      exception: { ...detail, EVIDENCE_JSON: parseJson(detail.EVIDENCE_JSON, {}) },
      suggestedOwnerAction,
      actions: actions.rows.map((row) => ({ ...row, ACTION_PAYLOAD: parseJson(row.ACTION_PAYLOAD, {}) })),
      submissionLines: lines.rows,
      sourceRecords: samples.rows,
      synthetic: true,
    });
  } catch (error) { next(error); }
});

router.get('/ai-jobs', async (req, res, next) => {
  try {
    const jobIds = idListParam(req.query.jobIds, 'jobIds');
    const runId = numberParam(req.query.runId, 'runId', { min: 1 });
    const submissionId = numberParam(req.query.submissionId, 'submissionId', { min: 1 });
    const clauses = [];
    const binds = {};
    if (jobIds.length) {
      const placeholders = jobIds.map((jobId, index) => {
        const bindName = `jobId${index}`;
        binds[bindName] = jobId;
        return `:${bindName}`;
      });
      clauses.push(`j.job_id IN (${placeholders.join(', ')})`);
    }
    if (runId != null) {
      clauses.push('j.run_id = :runId');
      binds.runId = runId;
    }
    if (submissionId != null) {
      clauses.push('j.submission_id = :submissionId');
      binds.submissionId = submissionId;
    }
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const result = await db.executeAsUser(
      `SELECT j.*
         FROM hotel_financial_ai_job_status_v j
         ${where}
        ORDER BY j.requested_at DESC, j.job_id DESC
        FETCH FIRST 100 ROWS ONLY`,
      binds,
      req.demoUser
    );
    const statusCounts = { PENDING: 0, PROCESSING: 0, COMPLETED: 0, FAILED: 0 };
    result.rows.forEach((job) => {
      if (Object.prototype.hasOwnProperty.call(statusCounts, job.JOB_STATUS)) {
        statusCounts[job.JOB_STATUS] += 1;
      }
    });
    res.json({
      jobs: result.rows,
      count: result.rows.length,
      statusCounts,
      allTerminal: result.rows.length > 0 && statusCounts.PENDING + statusCounts.PROCESSING === 0,
      worker: financialAiWorker.getStatus(),
      synthetic: true,
    });
  } catch (error) { next(error); }
});

router.post('/run', async (req, res, next) => {
  try {
    const threshold = numberParam(req.body?.threshold, 'threshold', { min: 0, max: 50 });
    const actor = actorParam(req.body?.actor || req.demoUser);
    let submissionIds = [];
    if (req.body?.submissionId) {
      submissionIds = [numberParam(req.body.submissionId, 'submissionId', { min: 1 })];
    } else {
      const filters = queryFilters(req.body?.filters || {});
      const where = summaryWhere(filters);
      const candidates = await db.executeAsUser(
        `SELECT s.submission_id
           FROM hotel_financial_validation_summary_v s
           ${where.sql}
          ORDER BY s.fiscal_period DESC, s.exception_count DESC
          FETCH FIRST 12 ROWS ONLY`,
        where.binds, req.demoUser
      );
      submissionIds = candidates.rows.map((row) => row.SUBMISSION_ID);
    }
    if (!submissionIds.length) return res.status(404).json({ error: 'No financial submissions matched the validation request.' });

    const runs = [];
    for (const submissionId of submissionIds) {
      const enqueueLimit = runs.length < 3 ? 1 : 0;
      const result = await db.executeAsUser(
        `DECLARE
           l_run_id NUMBER;
           l_exception_count NUMBER;
           l_job_count NUMBER;
         BEGIN
           owner_fin_validation_pkg.run_financial_validation(
             p_submission_id => :submissionId,
             p_actor => :actor,
             p_threshold_pct => :threshold,
             p_run_id => l_run_id,
             p_exception_count => l_exception_count
           );
           owner_fin_validation_pkg.enqueue_run_ai_rationales(
             p_run_id => l_run_id,
             p_actor => :actor,
             p_model_name => :modelName,
             p_job_count => l_job_count,
             p_limit => :enqueueLimit
           );
           :runId := l_run_id;
           :exceptionCount := l_exception_count;
           :jobCount := l_job_count;
         END;`,
        {
          submissionId,
          actor,
          threshold: { val: threshold, type: db.oracledb.NUMBER },
          modelName: financialAiWorker.FINANCIAL_MODEL,
          enqueueLimit,
          runId: { dir: db.oracledb.BIND_OUT, type: db.oracledb.NUMBER },
          exceptionCount: { dir: db.oracledb.BIND_OUT, type: db.oracledb.NUMBER },
          jobCount: { dir: db.oracledb.BIND_OUT, type: db.oracledb.NUMBER },
        },
        req.demoUser
      );
      runs.push({
        submissionId,
        runId: firstOutBind(result.outBinds.runId),
        exceptionCount: firstOutBind(result.outBinds.exceptionCount),
        aiJobCount: firstOutBind(result.outBinds.jobCount),
      });
    }

    const runBinds = {};
    const runPlaceholders = runs.map((run, index) => {
      const bindName = `run${index}`;
      runBinds[bindName] = run.runId;
      return `:${bindName}`;
    });
    const jobsResult = await db.executeAsUser(
      `SELECT j.*
         FROM hotel_financial_ai_job_status_v j
        WHERE j.run_id IN (${runPlaceholders.join(', ')})
        ORDER BY j.priority DESC, j.requested_at, j.job_id`,
      runBinds,
      req.demoUser
    );
    financialAiWorker.wake();

    res.json({
      validated: runs.length,
      runs,
      aiJobs: jobsResult.rows,
      aiStatus: jobsResult.rows.length ? 'QUEUED' : 'NOT_REQUESTED',
      message: jobsResult.rows.length
        ? `Oracle validation completed; ${jobsResult.rows.length} AI explanation job(s) queued. Human attestation remains required.`
        : 'Oracle validation completed. Human attestation remains required.',
      synthetic: true,
    });
  } catch (error) { next(error); }
});

router.post('/exceptions/:id/action', async (req, res, next) => {
  try {
    const exceptionId = numberParam(req.params.id, 'exception id', { min: 1 });
    const actionType = String(req.body?.actionType || '').trim().toUpperCase();
    if (!ACTION_TYPES.has(actionType)) return res.status(400).json({ error: 'Unsupported owner validation action.' });
    const actor = actorParam(req.body?.actor || req.demoUser);
    const note = req.body?.note == null ? null : String(req.body.note).trim();
    const result = await db.executeAsUser(
      `BEGIN
         owner_fin_validation_pkg.record_financial_validation_action(
           p_exception_id => :exceptionId,
           p_action_type => :actionType,
           p_action_by => :actor,
           p_note => :note,
           p_action_id => :actionId
         );
       END;`,
      {
        exceptionId, actionType, actor, note,
        actionId: { dir: db.oracledb.BIND_OUT, type: db.oracledb.NUMBER },
      },
      req.demoUser
    );
    res.json({ actionId: firstOutBind(result.outBinds.actionId), exceptionId, actionType, persisted: true });
  } catch (error) { next(error); }
});

router.post('/close-note', async (req, res, next) => {
  try {
    const submissionId = numberParam(req.body?.submissionId, 'submissionId', { min: 1 });
    const actor = actorParam(req.body?.actor || req.demoUser);
    const summaryResult = await db.executeAsUser(
      `SELECT s.*,
              CASE
                WHEN s.submission_status = 'OWNER_VALIDATED' THEN 'owner validated'
                WHEN s.submission_status = 'FINANCE_REVIEW' THEN 'escalated to finance'
                WHEN s.submission_status = 'CORRECTION_REQUESTED' THEN 'correction requested'
                ELSE 'exceptions to review'
              END AS owner_validation_status
         FROM hotel_financial_validation_summary_v s
        WHERE s.submission_id = :submissionId`,
      { submissionId }, req.demoUser
    );
    if (!summaryResult.rows.length) return res.status(404).json({ error: 'Financial submission not found.' });
    const summary = summaryResult.rows[0];
    const generated = buildOwnerCloseNote(summary);
    const actionResult = await db.executeAsUser(
      `BEGIN
         owner_fin_validation_pkg.record_close_note(
           p_submission_id => :submissionId,
           p_actor => :actor,
           p_note => :note,
           p_action_id => :actionId
         );
       END;`,
      {
        submissionId, actor, note: generated.note,
        actionId: { dir: db.oracledb.BIND_OUT, type: db.oracledb.NUMBER },
      },
      req.demoUser
    );
    res.json({
      ...generated,
      submissionId,
      propertyName: summary.PROPERTY_NAME,
      fiscalPeriodLabel: summary.FISCAL_PERIOD_LABEL,
      actionId: firstOutBind(actionResult.outBinds.actionId),
      persisted: true,
    });
  } catch (error) { next(error); }
});

router.get('/charts', async (req, res, next) => {
  try {
    const filters = queryFilters(req.query);
    const summary = summaryWhere(filters, 's');
    const exceptions = exceptionWhere(filters, 'q');
    const [trend, metricVariance, severity, statuses, recentActions, waterfallTotals] = await Promise.all([
      db.executeAsUser(
        `SELECT s.fiscal_period_label AS period,
                ROUND(SUM(s.submitted_room_revenue), 2) AS submitted,
                ROUND(SUM(s.expected_room_revenue), 2) AS expected
           FROM hotel_financial_validation_summary_v s
           ${summary.sql}
          GROUP BY s.fiscal_period, s.fiscal_period_label
          ORDER BY s.fiscal_period`, summary.binds, req.demoUser
      ),
      db.executeAsUser(
        `SELECT q.metric_category AS category,
                ROUND(SUM(q.variance_amount), 2) AS variance,
                ROUND(SUM(ABS(q.variance_amount)), 2) AS absolute_variance,
                COUNT(*) AS exception_count
           FROM hotel_financial_exception_queue_v q
           ${exceptions.sql}
          GROUP BY q.metric_category
          ORDER BY q.metric_category`, exceptions.binds, req.demoUser
      ),
      db.executeAsUser(
        `SELECT q.severity, COUNT(*) AS exception_count
           FROM hotel_financial_exception_queue_v q
           ${exceptions.sql}
          GROUP BY q.severity`, exceptions.binds, req.demoUser
      ),
      db.executeAsUser(
        `SELECT s.property_name, s.submission_status AS status,
                COUNT(*) AS submission_count,
                ROUND(AVG(s.close_readiness_score), 2) AS readiness_score
           FROM hotel_financial_validation_summary_v s
           ${summary.sql}
          GROUP BY s.property_name, s.submission_status
          ORDER BY s.property_name`, summary.binds, req.demoUser
      ),
      db.executeAsUser(
        `SELECT a.action_id, a.action_type, a.action_by, a.action_note, a.created_at,
                s.property_name, s.fiscal_period_label
           FROM hotel_financial_validation_actions a
           JOIN hotel_financial_validation_summary_v s ON s.submission_id = a.submission_id
           ${summary.sql.replaceAll('s.', 's.')}
          ORDER BY a.created_at DESC, a.action_id DESC
          FETCH FIRST 12 ROWS ONLY`, summary.binds, req.demoUser
      ),
      db.executeAsUser(
        `WITH selected_submissions AS (
           SELECT s.*
             FROM hotel_financial_validation_summary_v s
             ${summary.sql}
         ), decision_totals AS (
           SELECT ROUND(NVL(SUM(CASE WHEN q.status = 'TIMING_DIFFERENCE' THEN q.variance_amount ELSE 0 END), 0), 2) AS timing_differences,
                  ROUND(NVL(SUM(CASE WHEN q.status = 'OWNER_VALIDATED' THEN q.variance_amount ELSE 0 END), 0), 2) AS owner_validated,
                  ROUND(NVL(SUM(CASE WHEN q.status = 'CORRECTION_REQUESTED' THEN q.variance_amount ELSE 0 END), 0), 2) AS corrections_requested
             FROM hotel_financial_exception_queue_v q
             JOIN selected_submissions ss ON ss.submission_id = q.submission_id
         )
         SELECT (SELECT ROUND(NVL(SUM(submitted_room_revenue), 0), 2) FROM selected_submissions) AS submitted,
                (SELECT ROUND(NVL(SUM(expected_room_revenue), 0), 2) FROM selected_submissions) AS expected,
                d.timing_differences, d.owner_validated, d.corrections_requested
           FROM decision_totals d`,
        summary.binds, req.demoUser
      ),
    ]);
    const wf = waterfallTotals.rows[0] || {};
    res.json({
      varianceByMetric: metricVariance.rows,
      revenueTrend: trend.rows,
      severityDistribution: severity.rows,
      ownerStatus: statuses.rows,
      reconciliationWaterfall: [
        { STEP: 'Submitted total', VALUE: wf.SUBMITTED || 0, KIND: 'total' },
        { STEP: 'Timing differences', VALUE: wf.TIMING_DIFFERENCES || 0, KIND: 'adjustment' },
        { STEP: 'Validated exceptions', VALUE: wf.OWNER_VALIDATED || 0, KIND: 'adjustment' },
        { STEP: 'Corrections requested', VALUE: wf.CORRECTIONS_REQUESTED || 0, KIND: 'adjustment' },
        { STEP: 'Oracle expected total', VALUE: wf.EXPECTED || 0, KIND: 'total' },
      ],
      recentActions: recentActions.rows,
      synthetic: true,
    });
  } catch (error) { next(error); }
});

router.get('/internals', async (req, res, next) => {
  try {
    const counts = await db.executeAsUser(
      `SELECT
         (SELECT COUNT(*) FROM hotel_financial_submissions) AS submissions,
         (SELECT COUNT(*) FROM hotel_financial_validation_runs r
           JOIN hotel_financial_submissions s ON s.submission_id = r.submission_id) AS validation_runs,
         (SELECT COUNT(*) FROM hotel_financial_validation_results vr
           JOIN hotel_financial_submissions s ON s.submission_id = vr.submission_id) AS validation_results,
         (SELECT COUNT(*) FROM hotel_financial_ai_jobs j
           JOIN hotel_financial_submissions s ON s.submission_id = j.submission_id) AS ai_jobs,
         (SELECT COUNT(*) FROM hotel_financial_validation_actions a
           JOIN hotel_financial_submissions s ON s.submission_id = a.submission_id) AS human_actions
       FROM dual`, {}, req.demoUser
    );
    res.json({
      objects: {
        tables: [
          'HOTEL_OWNER_ENTITIES', 'HOTEL_PROPERTY_OWNER_MAP', 'HOTEL_FINANCIAL_SUBMISSIONS',
          'HOTEL_FINANCIAL_SUBMISSION_LINES', 'HOTEL_FINANCIAL_VALIDATION_RULES',
          'HOTEL_FINANCIAL_VALIDATION_RUNS', 'HOTEL_FINANCIAL_VALIDATION_RESULTS',
          'HOTEL_FINANCIAL_AI_JOBS', 'HOTEL_FINANCIAL_VALIDATION_ACTIONS',
        ],
        views: [
          'HOTEL_FINANCIAL_VALIDATION_SUMMARY_V', 'HOTEL_FINANCIAL_EXCEPTION_QUEUE_V',
          'HOTEL_FINANCIAL_AI_JOB_STATUS_V',
          'HOTEL_FINANCIAL_VARIANCE_TREND_V', 'HOTEL_FINANCIAL_METRIC_VARIANCE_V',
          'HOTEL_FINANCIAL_OWNER_STATUS_V',
        ],
        package: 'OWNER_FIN_VALIDATION_PKG',
        audit: ['HOTEL_FINANCIAL_VALIDATION_ACTIONS', 'AGENT_ACTIONS', 'EVENT_STREAM'],
      },
      counts: counts.rows[0],
      worker: financialAiWorker.getStatus(),
      featureTags: ['Relational', 'JSON', 'PL/SQL validation', 'Persistent AI queue', 'Audit', 'AI-assisted reasoning', 'VPD / roles'],
      synthetic: true,
    });
  } catch (error) { next(error); }
});

router.use((error, req, res, next) => {
  if (res.headersSent) return next(error);
  const oracleBusinessError = /ORA-20\d{3}/.test(error.message || '');
  const status = error.statusCode || (oracleBusinessError ? 400 : 500);
  console.error('Financial validation API error:', error.message || error);
  return res.status(status).json({
    error: status === 500 ? 'Owner financial validation request failed.' : error.message,
    message: process.env.NODE_ENV === 'development' ? error.message : undefined,
  });
});

module.exports = router;
