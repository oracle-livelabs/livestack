/*
 * 13_owner_financial_validation.sql
 * Scene 10 - Owner Financial Validation Workbench
 *
 * Synthetic Harborstone demo model for versioned, explainable, auditable close
 * validation.  The schema deliberately separates validation runs/results from
 * human actions: re-running validation never removes prior evidence or owner
 * attestations.
 */

SET SERVEROUTPUT ON
SET DEFINE OFF

-- ============================================================
-- TABLES (idempotent for container hydration)
-- ============================================================

BEGIN
  EXECUTE IMMEDIATE q'~
    CREATE TABLE hotel_owner_entities (
      owner_id       NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      owner_name     VARCHAR2(200) NOT NULL,
      owner_type     VARCHAR2(40) NOT NULL,
      region         VARCHAR2(100) NOT NULL,
      status         VARCHAR2(20) DEFAULT 'ACTIVE' NOT NULL,
      created_at     TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL,
      CONSTRAINT uq_hotel_owner_name UNIQUE (owner_name),
      CONSTRAINT ck_hotel_owner_status CHECK (status IN ('ACTIVE','INACTIVE'))
    )~';
EXCEPTION WHEN OTHERS THEN IF SQLCODE != -955 THEN RAISE; END IF;
END;
/

BEGIN
  EXECUTE IMMEDIATE q'~
    CREATE TABLE hotel_property_owner_map (
      property_owner_id    NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      property_id          NUMBER NOT NULL REFERENCES brands(brand_id),
      owner_id             NUMBER NOT NULL REFERENCES hotel_owner_entities(owner_id),
      ownership_model      VARCHAR2(40) NOT NULL,
      effective_start_date DATE NOT NULL,
      effective_end_date   DATE,
      created_at           TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL,
      CONSTRAINT uq_hotel_property_owner UNIQUE (property_id, owner_id, effective_start_date),
      CONSTRAINT ck_hotel_owner_dates CHECK (effective_end_date IS NULL OR effective_end_date >= effective_start_date)
    )~';
EXCEPTION WHEN OTHERS THEN IF SQLCODE != -955 THEN RAISE; END IF;
END;
/

BEGIN
  EXECUTE IMMEDIATE q'~
    CREATE TABLE hotel_financial_submissions (
      submission_id        NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      property_id          NUMBER NOT NULL REFERENCES brands(brand_id),
      owner_id             NUMBER NOT NULL REFERENCES hotel_owner_entities(owner_id),
      fiscal_period        DATE NOT NULL,
      close_version        NUMBER DEFAULT 1 NOT NULL,
      status               VARCHAR2(30) DEFAULT 'SUBMITTED' NOT NULL,
      submitted_by         VARCHAR2(200) NOT NULL,
      submitted_at         TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL,
      report_json          JSON,
      ai_summary           CLOB,
      close_readiness_score NUMBER(5,2) DEFAULT 0 NOT NULL,
      validation_run_no    NUMBER DEFAULT 0 NOT NULL,
      created_at           TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL,
      updated_at           TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL,
      CONSTRAINT uq_hotel_fin_submission UNIQUE (property_id, owner_id, fiscal_period, close_version),
      CONSTRAINT ck_hotel_fin_sub_status CHECK (status IN (
        'SUBMITTED','VALIDATED','OWNER_VALIDATED','CORRECTION_REQUESTED',
        'TIMING_REVIEW','FINANCE_REVIEW','READY_TO_CLOSE'
      ))
    )~';
EXCEPTION WHEN OTHERS THEN IF SQLCODE != -955 THEN RAISE; END IF;
END;
/

BEGIN
  EXECUTE IMMEDIATE q'~
    CREATE TABLE hotel_financial_submission_lines (
      line_id            NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      submission_id      NUMBER NOT NULL REFERENCES hotel_financial_submissions(submission_id),
      metric_code        VARCHAR2(60) NOT NULL,
      metric_category    VARCHAR2(40) NOT NULL,
      submitted_amount   NUMBER(18,2) NOT NULL,
      submitted_units    NUMBER(18,2),
      currency_code      VARCHAR2(3) DEFAULT 'USD' NOT NULL,
      source_label       VARCHAR2(120),
      note               VARCHAR2(1000),
      created_at         TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL,
      CONSTRAINT uq_hotel_fin_sub_line UNIQUE (submission_id, metric_code),
      CONSTRAINT ck_hotel_fin_metric_category CHECK (metric_category IN (
        'Room Revenue','Fees','Adjustments','Close Inputs'
      ))
    )~';
EXCEPTION WHEN OTHERS THEN IF SQLCODE != -955 THEN RAISE; END IF;
END;
/

BEGIN
  EXECUTE IMMEDIATE q'~
    CREATE TABLE hotel_financial_validation_rules (
      rule_id            NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      metric_code        VARCHAR2(60) NOT NULL,
      rule_name          VARCHAR2(200) NOT NULL,
      metric_category    VARCHAR2(40) NOT NULL,
      tolerance_amount   NUMBER(18,2) DEFAULT 0 NOT NULL,
      tolerance_pct      NUMBER(9,4) DEFAULT 0 NOT NULL,
      rate_pct           NUMBER(9,4),
      severity_floor     VARCHAR2(10) DEFAULT 'LOW' NOT NULL,
      basis_description  VARCHAR2(1000) NOT NULL,
      active_flag        NUMBER(1) DEFAULT 1 NOT NULL,
      created_at         TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL,
      CONSTRAINT uq_hotel_fin_rule_metric UNIQUE (metric_code),
      CONSTRAINT ck_hotel_fin_rule_sev CHECK (severity_floor IN ('CRITICAL','HIGH','MEDIUM','LOW')),
      CONSTRAINT ck_hotel_fin_rule_active CHECK (active_flag IN (0,1))
    )~';
EXCEPTION WHEN OTHERS THEN IF SQLCODE != -955 THEN RAISE; END IF;
END;
/

BEGIN
  EXECUTE IMMEDIATE q'~
    CREATE TABLE hotel_financial_validation_runs (
      run_id              NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      submission_id       NUMBER NOT NULL REFERENCES hotel_financial_submissions(submission_id),
      run_no              NUMBER NOT NULL,
      run_by              VARCHAR2(200) NOT NULL,
      tolerance_override_pct NUMBER(9,4),
      run_status          VARCHAR2(20) DEFAULT 'RUNNING' NOT NULL,
      exception_count     NUMBER DEFAULT 0 NOT NULL,
      auto_cleared_pct    NUMBER(5,2) DEFAULT 0 NOT NULL,
      summary_json        JSON,
      started_at          TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL,
      completed_at        TIMESTAMP,
      CONSTRAINT uq_hotel_fin_run UNIQUE (submission_id, run_no),
      CONSTRAINT ck_hotel_fin_run_status CHECK (run_status IN ('RUNNING','COMPLETED','FAILED'))
    )~';
EXCEPTION WHEN OTHERS THEN IF SQLCODE != -955 THEN RAISE; END IF;
END;
/

BEGIN
  EXECUTE IMMEDIATE q'~
    CREATE TABLE hotel_financial_validation_results (
      exception_id       NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      run_id             NUMBER NOT NULL REFERENCES hotel_financial_validation_runs(run_id),
      submission_id      NUMBER NOT NULL REFERENCES hotel_financial_submissions(submission_id),
      line_id            NUMBER NOT NULL REFERENCES hotel_financial_submission_lines(line_id),
      rule_id            NUMBER NOT NULL REFERENCES hotel_financial_validation_rules(rule_id),
      metric_code        VARCHAR2(60) NOT NULL,
      metric_category    VARCHAR2(40) NOT NULL,
      expected_amount    NUMBER(18,2) NOT NULL,
      submitted_amount   NUMBER(18,2) NOT NULL,
      variance_amount    NUMBER(18,2) NOT NULL,
      variance_pct       NUMBER(12,4),
      severity           VARCHAR2(10) NOT NULL,
      status             VARCHAR2(30) NOT NULL,
      is_exception       NUMBER(1) DEFAULT 1 NOT NULL,
      ai_rationale       CLOB,
      ai_generation_status VARCHAR2(20) DEFAULT 'NOT_REQUESTED' NOT NULL,
      ai_source          VARCHAR2(40) DEFAULT 'deterministic-rule-fallback' NOT NULL,
      ai_model           VARCHAR2(120),
      ai_requested_at    TIMESTAMP,
      ai_generated_at    TIMESTAMP,
      ai_latency_ms      NUMBER,
      evidence_json      JSON,
      created_at         TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL,
      updated_at         TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL,
      CONSTRAINT uq_hotel_fin_result UNIQUE (run_id, line_id),
      CONSTRAINT ck_hotel_fin_result_sev CHECK (severity IN ('CRITICAL','HIGH','MEDIUM','LOW')),
      CONSTRAINT ck_hotel_fin_result_flag CHECK (is_exception IN (0,1)),
      CONSTRAINT ck_hotel_fin_result_ai_status CHECK (ai_generation_status IN (
        'NOT_REQUESTED','PENDING','PROCESSING','COMPLETED','FAILED'
      )),
      CONSTRAINT ck_hotel_fin_result_status CHECK (status IN (
        'OPEN','AUTO_CLEARED','OWNER_VALIDATED','CORRECTION_REQUESTED',
        'TIMING_DIFFERENCE','ESCALATED_FINANCE','NOTED'
      ))
    )~';
EXCEPTION WHEN OTHERS THEN IF SQLCODE != -955 THEN RAISE; END IF;
END;
/

-- Upgrade an already-hydrated Scene 10 schema one column at a time so a
-- partially applied rerun remains repairable.
BEGIN
  EXECUTE IMMEDIATE q'~ALTER TABLE hotel_financial_validation_results
    ADD (ai_generation_status VARCHAR2(20) DEFAULT 'NOT_REQUESTED' NOT NULL)~';
EXCEPTION WHEN OTHERS THEN IF SQLCODE != -1430 THEN RAISE; END IF;
END;
/
BEGIN
  EXECUTE IMMEDIATE q'~ALTER TABLE hotel_financial_validation_results
    ADD (ai_source VARCHAR2(40) DEFAULT 'deterministic-rule-fallback' NOT NULL)~';
EXCEPTION WHEN OTHERS THEN IF SQLCODE != -1430 THEN RAISE; END IF;
END;
/
BEGIN
  EXECUTE IMMEDIATE 'ALTER TABLE hotel_financial_validation_results ADD (ai_model VARCHAR2(120))';
EXCEPTION WHEN OTHERS THEN IF SQLCODE != -1430 THEN RAISE; END IF;
END;
/
BEGIN
  EXECUTE IMMEDIATE 'ALTER TABLE hotel_financial_validation_results ADD (ai_requested_at TIMESTAMP)';
EXCEPTION WHEN OTHERS THEN IF SQLCODE != -1430 THEN RAISE; END IF;
END;
/
BEGIN
  EXECUTE IMMEDIATE 'ALTER TABLE hotel_financial_validation_results ADD (ai_generated_at TIMESTAMP)';
EXCEPTION WHEN OTHERS THEN IF SQLCODE != -1430 THEN RAISE; END IF;
END;
/
BEGIN
  EXECUTE IMMEDIATE 'ALTER TABLE hotel_financial_validation_results ADD (ai_latency_ms NUMBER)';
EXCEPTION WHEN OTHERS THEN IF SQLCODE != -1430 THEN RAISE; END IF;
END;
/
BEGIN
  EXECUTE IMMEDIATE q'~ALTER TABLE hotel_financial_validation_results
    ADD CONSTRAINT ck_hotel_fin_result_ai_status CHECK (ai_generation_status IN (
      'NOT_REQUESTED','PENDING','PROCESSING','COMPLETED','FAILED'
    ))~';
EXCEPTION WHEN OTHERS THEN IF SQLCODE != -2264 THEN RAISE; END IF;
END;
/

BEGIN
  EXECUTE IMMEDIATE q'~
    CREATE TABLE hotel_financial_validation_actions (
      action_id          NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      exception_id       NUMBER REFERENCES hotel_financial_validation_results(exception_id),
      submission_id      NUMBER NOT NULL REFERENCES hotel_financial_submissions(submission_id),
      action_type        VARCHAR2(40) NOT NULL,
      action_by          VARCHAR2(200) NOT NULL,
      action_note        VARCHAR2(2000),
      action_payload     JSON,
      created_at         TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL,
      CONSTRAINT ck_hotel_fin_action_type CHECK (action_type IN (
        'OWNER_VALIDATE','REQUEST_CORRECTION','TIMING_DIFFERENCE',
        'ESCALATE_FINANCE','ADD_NOTE','GENERATE_CLOSE_NOTE'
      ))
    )~';
EXCEPTION WHEN OTHERS THEN IF SQLCODE != -955 THEN RAISE; END IF;
END;
/

BEGIN
  EXECUTE IMMEDIATE q'~
    CREATE TABLE hotel_financial_ai_jobs (
      job_id              NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      run_id              NUMBER NOT NULL REFERENCES hotel_financial_validation_runs(run_id),
      submission_id       NUMBER NOT NULL REFERENCES hotel_financial_submissions(submission_id),
      exception_id        NUMBER REFERENCES hotel_financial_validation_results(exception_id) ON DELETE CASCADE,
      job_type            VARCHAR2(30) DEFAULT 'EXCEPTION_RATIONALE' NOT NULL,
      job_status          VARCHAR2(20) DEFAULT 'PENDING' NOT NULL,
      priority            NUMBER(4) DEFAULT 100 NOT NULL,
      attempt_count       NUMBER(3) DEFAULT 0 NOT NULL,
      max_attempts        NUMBER(3) DEFAULT 2 NOT NULL,
      requested_by        VARCHAR2(200) NOT NULL,
      model_name          VARCHAR2(120) NOT NULL,
      worker_id           VARCHAR2(200),
      fallback_text       CLOB,
      response_text       CLOB,
      request_json        JSON,
      result_json         JSON,
      last_error          VARCHAR2(2000),
      next_attempt_at     TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL,
      lease_expires_at    TIMESTAMP,
      requested_at        TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL,
      started_at          TIMESTAMP,
      completed_at        TIMESTAMP,
      updated_at          TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL,
      CONSTRAINT uq_hotel_fin_ai_job UNIQUE (exception_id, job_type),
      CONSTRAINT ck_hotel_fin_ai_job_type CHECK (job_type IN ('EXCEPTION_RATIONALE','OWNER_CLOSE_NOTE')),
      CONSTRAINT ck_hotel_fin_ai_job_status CHECK (job_status IN ('PENDING','PROCESSING','COMPLETED','FAILED')),
      CONSTRAINT ck_hotel_fin_ai_job_attempts CHECK (
        attempt_count >= 0 AND max_attempts BETWEEN 1 AND 10 AND attempt_count <= max_attempts
      ),
      CONSTRAINT ck_hotel_fin_ai_job_exception CHECK (
        job_type != 'EXCEPTION_RATIONALE' OR exception_id IS NOT NULL
      )
    )~';
EXCEPTION WHEN OTHERS THEN IF SQLCODE != -955 THEN RAISE; END IF;
END;
/

BEGIN EXECUTE IMMEDIATE 'CREATE INDEX idx_hotel_fin_sub_filter ON hotel_financial_submissions(fiscal_period, property_id, owner_id, status)';
EXCEPTION WHEN OTHERS THEN IF SQLCODE NOT IN (-955,-1408) THEN RAISE; END IF; END;
/
BEGIN EXECUTE IMMEDIATE 'CREATE INDEX idx_hotel_fin_line_cat ON hotel_financial_submission_lines(metric_category, metric_code)';
EXCEPTION WHEN OTHERS THEN IF SQLCODE NOT IN (-955,-1408) THEN RAISE; END IF; END;
/
BEGIN EXECUTE IMMEDIATE 'CREATE INDEX idx_hotel_fin_run_latest ON hotel_financial_validation_runs(submission_id, run_no DESC)';
EXCEPTION WHEN OTHERS THEN IF SQLCODE NOT IN (-955,-1408) THEN RAISE; END IF; END;
/
BEGIN EXECUTE IMMEDIATE 'CREATE INDEX idx_hotel_fin_result_queue ON hotel_financial_validation_results(submission_id, is_exception, severity, status)';
EXCEPTION WHEN OTHERS THEN IF SQLCODE NOT IN (-955,-1408) THEN RAISE; END IF; END;
/
BEGIN EXECUTE IMMEDIATE 'CREATE INDEX idx_hotel_fin_action_history ON hotel_financial_validation_actions(exception_id, created_at DESC)';
EXCEPTION WHEN OTHERS THEN IF SQLCODE NOT IN (-955,-1408) THEN RAISE; END IF; END;
/
BEGIN EXECUTE IMMEDIATE 'CREATE INDEX idx_hotel_fin_ai_queue ON hotel_financial_ai_jobs(job_status, next_attempt_at, priority DESC, requested_at, job_id)';
EXCEPTION WHEN OTHERS THEN IF SQLCODE NOT IN (-955,-1408) THEN RAISE; END IF; END;
/
BEGIN EXECUTE IMMEDIATE 'CREATE INDEX idx_hotel_fin_ai_lease ON hotel_financial_ai_jobs(job_status, lease_expires_at)';
EXCEPTION WHEN OTHERS THEN IF SQLCODE NOT IN (-955,-1408) THEN RAISE; END IF; END;
/
BEGIN EXECUTE IMMEDIATE 'CREATE INDEX idx_hotel_fin_ai_poll ON hotel_financial_ai_jobs(submission_id, run_id, requested_at DESC)';
EXCEPTION WHEN OTHERS THEN IF SQLCODE NOT IN (-955,-1408) THEN RAISE; END IF; END;
/

-- ============================================================
-- VERSIONED VALIDATION + HUMAN ACTION PACKAGE
-- ============================================================

CREATE OR REPLACE PACKAGE owner_fin_validation_pkg AS
  PROCEDURE run_financial_validation(
    p_submission_id       IN  hotel_financial_submissions.submission_id%TYPE,
    p_actor               IN  VARCHAR2,
    p_threshold_pct       IN  NUMBER DEFAULT NULL,
    p_run_id              OUT hotel_financial_validation_runs.run_id%TYPE,
    p_exception_count     OUT NUMBER
  );

  PROCEDURE record_financial_validation_action(
    p_exception_id IN  hotel_financial_validation_results.exception_id%TYPE,
    p_action_type  IN  VARCHAR2,
    p_action_by    IN  VARCHAR2,
    p_note         IN  VARCHAR2 DEFAULT NULL,
    p_action_id    OUT hotel_financial_validation_actions.action_id%TYPE
  );

  PROCEDURE record_close_note(
    p_submission_id IN  hotel_financial_submissions.submission_id%TYPE,
    p_actor         IN  VARCHAR2,
    p_note          IN  VARCHAR2,
    p_action_id     OUT hotel_financial_validation_actions.action_id%TYPE
  );

  PROCEDURE enqueue_run_ai_rationales(
    p_run_id        IN  hotel_financial_validation_runs.run_id%TYPE,
    p_actor         IN  VARCHAR2,
    p_model_name    IN  VARCHAR2,
    p_job_count     OUT NUMBER,
    p_limit         IN  NUMBER DEFAULT 1
  );

  PROCEDURE claim_financial_ai_job(
    p_worker_id     IN  VARCHAR2,
    p_job_id        OUT hotel_financial_ai_jobs.job_id%TYPE,
    p_lease_seconds IN  NUMBER DEFAULT 60
  );

  PROCEDURE complete_financial_ai_job(
    p_job_id       IN hotel_financial_ai_jobs.job_id%TYPE,
    p_worker_id    IN VARCHAR2,
    p_response     IN CLOB,
    p_result_json  IN CLOB,
    p_latency_ms   IN NUMBER
  );

  PROCEDURE fail_financial_ai_job(
    p_job_id             IN hotel_financial_ai_jobs.job_id%TYPE,
    p_worker_id          IN VARCHAR2,
    p_error              IN VARCHAR2,
    p_result_json        IN CLOB,
    p_latency_ms         IN NUMBER,
    p_retry_delay_seconds IN NUMBER DEFAULT 2
  );

  PROCEDURE recover_stale_financial_ai_jobs(
    p_recovered_count OUT NUMBER
  );

  PROCEDURE clear_demo_data;
  PROCEDURE refresh_demo_data(p_force IN NUMBER DEFAULT 0);
END owner_fin_validation_pkg;
/

CREATE OR REPLACE PACKAGE BODY owner_fin_validation_pkg AS

  FUNCTION governed_room_revenue(
    p_property_id IN NUMBER,
    p_period      IN DATE
  ) RETURN NUMBER IS
    v_amount NUMBER;
  BEGIN
    SELECT NVL(SUM(oi.line_total), 0)
      INTO v_amount
      FROM orders o
      JOIN order_items oi ON oi.order_id = o.order_id
      JOIN products p ON p.product_id = oi.product_id
     WHERE p.brand_id = p_property_id
       AND TRUNC(CAST(o.created_at AS DATE), 'MM') = TRUNC(p_period, 'MM')
       AND o.order_status NOT IN ('cancelled','returned');

    IF v_amount = 0 THEN
      SELECT ROUND(GREATEST(NVL(SUM(unit_price), 0) * 18, NVL(MAX(b.annual_revenue), 0) / 600), 2)
        INTO v_amount
        FROM brands b
        LEFT JOIN products p ON p.brand_id = b.brand_id AND p.is_active = 1
       WHERE b.brand_id = p_property_id;
    END IF;
    RETURN NVL(v_amount, 0);
  END governed_room_revenue;

  FUNCTION governed_reservation_count(
    p_property_id IN NUMBER,
    p_period      IN DATE
  ) RETURN NUMBER IS
    v_count NUMBER;
  BEGIN
    SELECT COUNT(DISTINCT o.order_id)
      INTO v_count
      FROM orders o
      JOIN order_items oi ON oi.order_id = o.order_id
      JOIN products p ON p.product_id = oi.product_id
     WHERE p.brand_id = p_property_id
       AND TRUNC(CAST(o.created_at AS DATE), 'MM') = TRUNC(p_period, 'MM')
       AND o.order_status NOT IN ('cancelled','returned');
    IF v_count = 0 THEN
      v_count := 420 + MOD(p_property_id * 17 + TO_NUMBER(TO_CHAR(p_period, 'MM')), 180);
    END IF;
    RETURN v_count;
  END governed_reservation_count;

  FUNCTION expected_for_line(
    p_metric_code IN VARCHAR2,
    p_property_id IN NUMBER,
    p_period      IN DATE,
    p_rate_pct    IN NUMBER
  ) RETURN NUMBER IS
    v_room_revenue NUMBER;
  BEGIN
    v_room_revenue := governed_room_revenue(p_property_id, p_period);
    RETURN CASE p_metric_code
      WHEN 'ROOM_REVENUE' THEN v_room_revenue
      WHEN 'OWNER_FEE_BASIS' THEN v_room_revenue
      WHEN 'MANAGEMENT_FEE' THEN ROUND(v_room_revenue * NVL(p_rate_pct, 3) / 100, 2)
      WHEN 'CLOSE_ADJUSTMENT' THEN 0
      WHEN 'RESERVATION_COUNT' THEN governed_reservation_count(p_property_id, p_period)
      ELSE 0
    END;
  END expected_for_line;

  PROCEDURE run_financial_validation(
    p_submission_id       IN  hotel_financial_submissions.submission_id%TYPE,
    p_actor               IN  VARCHAR2,
    p_threshold_pct       IN  NUMBER DEFAULT NULL,
    p_run_id              OUT hotel_financial_validation_runs.run_id%TYPE,
    p_exception_count     OUT NUMBER
  ) IS
    v_property_id    NUMBER;
    v_period         DATE;
    v_run_no         NUMBER;
    v_total_lines    NUMBER := 0;
    v_auto_cleared   NUMBER := 0;
    v_critical       NUMBER := 0;
    v_high           NUMBER := 0;
    v_medium         NUMBER := 0;
    v_low            NUMBER := 0;
    v_readiness      NUMBER;
    v_expected       NUMBER;
    v_variance       NUMBER;
    v_variance_pct   NUMBER;
    v_effective_pct  NUMBER;
    v_is_exception   NUMBER;
    v_severity       VARCHAR2(10);
    v_status         VARCHAR2(30);
    v_rationale      VARCHAR2(2000);
    v_evidence_count NUMBER;
  BEGIN
    IF p_actor IS NULL OR TRIM(p_actor) IS NULL THEN
      RAISE_APPLICATION_ERROR(-20021, 'Validation actor is required.');
    END IF;
    IF p_threshold_pct IS NOT NULL AND (p_threshold_pct < 0 OR p_threshold_pct > 50) THEN
      RAISE_APPLICATION_ERROR(-20022, 'Tolerance threshold must be between 0 and 50 percent.');
    END IF;

    SELECT property_id, fiscal_period, validation_run_no + 1
      INTO v_property_id, v_period, v_run_no
      FROM hotel_financial_submissions
     WHERE submission_id = p_submission_id
       FOR UPDATE;

    INSERT INTO hotel_financial_validation_runs (
      submission_id, run_no, run_by, tolerance_override_pct, run_status
    ) VALUES (
      p_submission_id, v_run_no, SUBSTR(TRIM(p_actor), 1, 200), p_threshold_pct, 'RUNNING'
    ) RETURNING run_id INTO p_run_id;

    p_exception_count := 0;
    FOR rec IN (
      SELECT l.line_id, l.metric_code, l.metric_category, l.submitted_amount,
             r.rule_id, r.rule_name, r.tolerance_amount, r.tolerance_pct,
             r.rate_pct, r.severity_floor, r.basis_description
        FROM hotel_financial_submission_lines l
        JOIN hotel_financial_validation_rules r ON r.metric_code = l.metric_code
       WHERE l.submission_id = p_submission_id
         AND r.active_flag = 1
       ORDER BY l.line_id
    ) LOOP
      v_total_lines := v_total_lines + 1;
      v_expected := ROUND(expected_for_line(rec.metric_code, v_property_id, v_period, rec.rate_pct), 2);
      v_variance := ROUND(rec.submitted_amount - v_expected, 2);
      v_variance_pct := CASE
        WHEN ABS(v_expected) > 0.005 THEN ROUND(v_variance / ABS(v_expected) * 100, 4)
        WHEN ABS(v_variance) > 0.005 THEN 100
        ELSE 0
      END;
      v_effective_pct := NVL(p_threshold_pct, rec.tolerance_pct);
      v_is_exception := CASE
        WHEN ABS(v_variance) <= rec.tolerance_amount THEN 0
        WHEN ABS(v_variance_pct) <= v_effective_pct THEN 0
        ELSE 1
      END;

      IF v_is_exception = 0 THEN
        v_severity := 'LOW';
        v_status := 'AUTO_CLEARED';
        v_auto_cleared := v_auto_cleared + 1;
        v_rationale := 'Within the governed ' || TO_CHAR(v_effective_pct, 'FM990D00') ||
          '% tolerance. No owner action is required.';
      ELSE
        v_status := 'OPEN';
        v_severity := CASE
          WHEN ABS(v_variance_pct) >= 20 THEN 'CRITICAL'
          WHEN ABS(v_variance_pct) >= 10 THEN 'HIGH'
          WHEN ABS(v_variance_pct) >= 5 THEN 'MEDIUM'
          ELSE rec.severity_floor
        END;
        p_exception_count := p_exception_count + 1;
        IF v_severity = 'CRITICAL' THEN v_critical := v_critical + 1;
        ELSIF v_severity = 'HIGH' THEN v_high := v_high + 1;
        ELSIF v_severity = 'MEDIUM' THEN v_medium := v_medium + 1;
        ELSE v_low := v_low + 1;
        END IF;
        v_rationale := rec.rule_name || ' detected a ' ||
          CASE WHEN v_variance < 0 THEN 'shortfall of ' ELSE 'positive variance of ' END ||
          TO_CHAR(ABS(v_variance), 'FM999G999G999G990D00') || ' USD (' ||
          TO_CHAR(ABS(v_variance_pct), 'FM990D00') ||
          '%). Review the owner-reported line against the governed evidence before attestation.';
      END IF;

      SELECT COUNT(DISTINCT o.order_id)
        INTO v_evidence_count
        FROM orders o
        JOIN order_items oi ON oi.order_id = o.order_id
        JOIN products p ON p.product_id = oi.product_id
       WHERE p.brand_id = v_property_id
         AND TRUNC(CAST(o.created_at AS DATE), 'MM') = TRUNC(v_period, 'MM');
      v_evidence_count := GREATEST(v_evidence_count, 1);

      INSERT INTO hotel_financial_validation_results (
        run_id, submission_id, line_id, rule_id, metric_code, metric_category,
        expected_amount, submitted_amount, variance_amount, variance_pct,
        severity, status, is_exception, ai_rationale, evidence_json
      ) VALUES (
        p_run_id, p_submission_id, rec.line_id, rec.rule_id, rec.metric_code, rec.metric_category,
        v_expected, rec.submitted_amount, v_variance, v_variance_pct,
        v_severity, v_status, v_is_exception, v_rationale,
        JSON_OBJECT(
          'queryName' VALUE 'OWNER_FIN_GOVERNED_EXPECTATION_V1',
          'sourceObjects' VALUE JSON_ARRAY('ORDERS','ORDER_ITEMS','PRODUCTS','BRANDS','HOTEL_FINANCIAL_VALIDATION_RULES'),
          'formula' VALUE rec.basis_description,
          'ruleName' VALUE rec.rule_name,
          'toleranceAmount' VALUE rec.tolerance_amount,
          'tolerancePct' VALUE v_effective_pct,
          'evidenceCount' VALUE v_evidence_count,
          'propertyId' VALUE v_property_id,
          'fiscalPeriod' VALUE TO_CHAR(v_period, 'YYYY-MM'),
          'expectedAmount' VALUE v_expected,
          'submittedAmount' VALUE rec.submitted_amount
          RETURNING JSON
        )
      );
    END LOOP;

    v_readiness := GREATEST(0, 100 - (v_critical * 18) - (v_high * 10) - (v_medium * 5) - (v_low * 2));

    UPDATE hotel_financial_validation_runs
       SET run_status = 'COMPLETED',
           exception_count = p_exception_count,
           auto_cleared_pct = CASE WHEN v_total_lines = 0 THEN 0 ELSE ROUND(v_auto_cleared / v_total_lines * 100, 2) END,
           summary_json = JSON_OBJECT(
             'critical' VALUE v_critical,
             'high' VALUE v_high,
             'medium' VALUE v_medium,
             'low' VALUE v_low,
             'closeReadinessScore' VALUE v_readiness
             RETURNING JSON
           ),
           completed_at = SYSTIMESTAMP
     WHERE run_id = p_run_id;

    UPDATE hotel_financial_submissions
       SET validation_run_no = v_run_no,
           status = 'VALIDATED',
           close_readiness_score = v_readiness,
           updated_at = SYSTIMESTAMP
     WHERE submission_id = p_submission_id;

    INSERT INTO event_stream(event_type, event_source, event_data, correlation_id)
    VALUES (
      'OWNER_FINANCIAL_VALIDATION_COMPLETED', 'owner_fin_validation_pkg',
      JSON_OBJECT(
        'submissionId' VALUE p_submission_id,
        'runId' VALUE p_run_id,
        'actor' VALUE p_actor,
        'exceptionCount' VALUE p_exception_count,
        'closeReadinessScore' VALUE v_readiness
        RETURNING JSON
      ),
      'FIN-SUB-' || p_submission_id
    );
  EXCEPTION
    WHEN NO_DATA_FOUND THEN
      RAISE_APPLICATION_ERROR(-20023, 'Financial submission not found: ' || p_submission_id);
    WHEN OTHERS THEN
      IF p_run_id IS NOT NULL THEN
        UPDATE hotel_financial_validation_runs
           SET run_status = 'FAILED', completed_at = SYSTIMESTAMP
         WHERE run_id = p_run_id;
      END IF;
      RAISE;
  END run_financial_validation;

  PROCEDURE record_financial_validation_action(
    p_exception_id IN  hotel_financial_validation_results.exception_id%TYPE,
    p_action_type  IN  VARCHAR2,
    p_action_by    IN  VARCHAR2,
    p_note         IN  VARCHAR2 DEFAULT NULL,
    p_action_id    OUT hotel_financial_validation_actions.action_id%TYPE
  ) IS
    v_submission_id NUMBER;
    v_action_type   VARCHAR2(40) := UPPER(TRIM(p_action_type));
    v_result_status VARCHAR2(30);
    v_sub_status    VARCHAR2(30);
    v_open_count    NUMBER;
  BEGIN
    IF v_action_type NOT IN ('OWNER_VALIDATE','REQUEST_CORRECTION','TIMING_DIFFERENCE','ESCALATE_FINANCE','ADD_NOTE') THEN
      RAISE_APPLICATION_ERROR(-20024, 'Unsupported financial validation action.');
    END IF;
    IF p_action_by IS NULL OR TRIM(p_action_by) IS NULL THEN
      RAISE_APPLICATION_ERROR(-20025, 'Action actor is required.');
    END IF;

    SELECT vr.submission_id
      INTO v_submission_id
     FROM hotel_financial_validation_results vr
      JOIN hotel_financial_submissions s ON s.submission_id = vr.submission_id
     WHERE vr.exception_id = p_exception_id
       AND vr.is_exception = 1;

    v_result_status := CASE v_action_type
      WHEN 'OWNER_VALIDATE' THEN 'OWNER_VALIDATED'
      WHEN 'REQUEST_CORRECTION' THEN 'CORRECTION_REQUESTED'
      WHEN 'TIMING_DIFFERENCE' THEN 'TIMING_DIFFERENCE'
      WHEN 'ESCALATE_FINANCE' THEN 'ESCALATED_FINANCE'
      ELSE 'NOTED'
    END;
    v_sub_status := CASE v_action_type
      WHEN 'OWNER_VALIDATE' THEN 'OWNER_VALIDATED'
      WHEN 'REQUEST_CORRECTION' THEN 'CORRECTION_REQUESTED'
      WHEN 'TIMING_DIFFERENCE' THEN 'TIMING_REVIEW'
      WHEN 'ESCALATE_FINANCE' THEN 'FINANCE_REVIEW'
      ELSE NULL
    END;

    INSERT INTO hotel_financial_validation_actions (
      exception_id, submission_id, action_type, action_by, action_note, action_payload
    ) VALUES (
      p_exception_id, v_submission_id, v_action_type, SUBSTR(TRIM(p_action_by), 1, 200),
      SUBSTR(p_note, 1, 2000),
      JSON_OBJECT(
        'decision' VALUE v_action_type,
        'source' VALUE 'Scene 10 - Owner Financial Validation Workbench',
        'humanAttestation' VALUE CASE WHEN v_action_type = 'OWNER_VALIDATE' THEN 'true' ELSE 'false' END
        RETURNING JSON
      )
    ) RETURNING action_id INTO p_action_id;

    UPDATE hotel_financial_validation_results
       SET status = v_result_status, updated_at = SYSTIMESTAMP
     WHERE exception_id = p_exception_id;

    IF v_action_type = 'OWNER_VALIDATE' THEN
      SELECT COUNT(*)
        INTO v_open_count
        FROM hotel_financial_validation_results vr
        JOIN hotel_financial_validation_runs run ON run.run_id = vr.run_id
       WHERE vr.submission_id = v_submission_id
         AND vr.is_exception = 1
         AND vr.status = 'OPEN'
         AND run.run_no = (
           SELECT MAX(run2.run_no)
             FROM hotel_financial_validation_runs run2
            WHERE run2.submission_id = v_submission_id
              AND run2.run_status = 'COMPLETED'
         );
      v_sub_status := CASE WHEN v_open_count = 0 THEN 'OWNER_VALIDATED' ELSE 'VALIDATED' END;
    END IF;

    IF v_sub_status IS NOT NULL THEN
      UPDATE hotel_financial_submissions
         SET status = v_sub_status, updated_at = SYSTIMESTAMP
       WHERE submission_id = v_submission_id;
    END IF;

    INSERT INTO agent_actions (
      agent_name, action_type, entity_type, entity_id, decision_payload,
      confidence, execution_status, executed_at
    ) VALUES (
      'OWNER_FINANCIAL_VALIDATION_ASSISTANT', v_action_type,
      'financial_validation_exception', p_exception_id,
      JSON_SERIALIZE(JSON_OBJECT(
        'submissionId' VALUE v_submission_id,
        'actor' VALUE p_action_by,
        'note' VALUE p_note,
        'humanDecision' VALUE 'true'
        RETURNING JSON
      ) RETURNING CLOB),
      1, 'completed', SYSTIMESTAMP
    );

    INSERT INTO event_stream(event_type, event_source, event_data, correlation_id)
    VALUES (
      'OWNER_FINANCIAL_VALIDATION_ACTION', 'owner_fin_validation_pkg',
      JSON_OBJECT(
        'actionId' VALUE p_action_id,
        'exceptionId' VALUE p_exception_id,
        'submissionId' VALUE v_submission_id,
        'actionType' VALUE v_action_type,
        'actor' VALUE p_action_by
        RETURNING JSON
      ),
      'FIN-SUB-' || v_submission_id
    );
  EXCEPTION
    WHEN NO_DATA_FOUND THEN
      RAISE_APPLICATION_ERROR(-20026, 'Open financial exception not found: ' || p_exception_id);
    WHEN OTHERS THEN RAISE;
  END record_financial_validation_action;

  PROCEDURE record_close_note(
    p_submission_id IN  hotel_financial_submissions.submission_id%TYPE,
    p_actor         IN  VARCHAR2,
    p_note          IN  VARCHAR2,
    p_action_id     OUT hotel_financial_validation_actions.action_id%TYPE
  ) IS
    v_exists NUMBER;
  BEGIN
    SELECT COUNT(*) INTO v_exists FROM hotel_financial_submissions WHERE submission_id = p_submission_id;
    IF v_exists = 0 THEN RAISE_APPLICATION_ERROR(-20027, 'Financial submission not found.'); END IF;
    IF p_note IS NULL OR TRIM(p_note) IS NULL THEN RAISE_APPLICATION_ERROR(-20028, 'Close note is required.'); END IF;

    INSERT INTO hotel_financial_validation_actions (
      exception_id, submission_id, action_type, action_by, action_note, action_payload
    ) VALUES (
      NULL, p_submission_id, 'GENERATE_CLOSE_NOTE', SUBSTR(TRIM(p_actor), 1, 200),
      SUBSTR(p_note, 1, 2000),
      JSON_OBJECT('generatedBy' VALUE 'AI-assisted reasoning with deterministic fallback' RETURNING JSON)
    ) RETURNING action_id INTO p_action_id;

    UPDATE hotel_financial_submissions
       SET ai_summary = p_note, updated_at = SYSTIMESTAMP
     WHERE submission_id = p_submission_id;

    INSERT INTO event_stream(event_type, event_source, event_data, correlation_id)
    VALUES (
      'OWNER_FINANCIAL_CLOSE_NOTE_GENERATED', 'owner_fin_validation_pkg',
      JSON_OBJECT('submissionId' VALUE p_submission_id, 'actionId' VALUE p_action_id, 'actor' VALUE p_actor RETURNING JSON),
      'FIN-SUB-' || p_submission_id
    );
  END record_close_note;

  PROCEDURE enqueue_run_ai_rationales(
    p_run_id        IN  hotel_financial_validation_runs.run_id%TYPE,
    p_actor         IN  VARCHAR2,
    p_model_name    IN  VARCHAR2,
    p_job_count     OUT NUMBER,
    p_limit         IN  NUMBER DEFAULT 1
  ) IS
    v_run_exists NUMBER;
    v_job_id     NUMBER;
  BEGIN
    p_job_count := 0;
    IF NVL(TRUNC(p_limit), 0) <= 0 THEN RETURN; END IF;
    IF p_actor IS NULL OR TRIM(p_actor) IS NULL THEN
      RAISE_APPLICATION_ERROR(-20029, 'AI job actor is required.');
    END IF;
    IF p_model_name IS NULL OR TRIM(p_model_name) IS NULL THEN
      RAISE_APPLICATION_ERROR(-20030, 'AI model name is required.');
    END IF;

    SELECT COUNT(*) INTO v_run_exists
      FROM hotel_financial_validation_runs
     WHERE run_id = p_run_id
       AND run_status = 'COMPLETED';
    IF v_run_exists = 0 THEN
      RAISE_APPLICATION_ERROR(-20031, 'Completed financial validation run not found.');
    END IF;

    FOR rec IN (
      SELECT ranked.*
        FROM (
          SELECT vr.exception_id, vr.run_id, vr.submission_id, vr.metric_code,
                 vr.metric_category, vr.submitted_amount, vr.expected_amount,
                 vr.variance_amount, vr.variance_pct, vr.severity,
                 vr.ai_rationale, vr.evidence_json,
                 ROW_NUMBER() OVER (
                   ORDER BY CASE vr.severity
                     WHEN 'CRITICAL' THEN 1 WHEN 'HIGH' THEN 2
                     WHEN 'MEDIUM' THEN 3 ELSE 4 END,
                     ABS(vr.variance_amount) DESC,
                     vr.exception_id
                 ) AS candidate_rank
            FROM hotel_financial_validation_results vr
           WHERE vr.run_id = p_run_id
             AND vr.is_exception = 1
        ) ranked
       WHERE ranked.candidate_rank <= LEAST(GREATEST(TRUNC(p_limit), 1), 10)
       ORDER BY ranked.candidate_rank
    ) LOOP
      BEGIN
        INSERT INTO hotel_financial_ai_jobs (
          run_id, submission_id, exception_id, job_type, job_status, priority,
          requested_by, model_name, fallback_text, request_json
        ) VALUES (
          rec.run_id, rec.submission_id, rec.exception_id,
          'EXCEPTION_RATIONALE', 'PENDING',
          CASE rec.severity WHEN 'CRITICAL' THEN 400 WHEN 'HIGH' THEN 300 WHEN 'MEDIUM' THEN 200 ELSE 100 END,
          SUBSTR(TRIM(p_actor), 1, 200), SUBSTR(TRIM(p_model_name), 1, 120), rec.ai_rationale,
          JSON_OBJECT(
            'schemaVersion' VALUE 1,
            'metricCode' VALUE rec.metric_code,
            'metricCategory' VALUE rec.metric_category,
            'submittedAmount' VALUE rec.submitted_amount,
            'expectedAmount' VALUE rec.expected_amount,
            'varianceAmount' VALUE rec.variance_amount,
            'variancePct' VALUE rec.variance_pct,
            'severity' VALUE rec.severity,
            'evidenceCount' VALUE NVL(JSON_VALUE(rec.evidence_json, '$.evidenceCount' RETURNING NUMBER), 0)
            RETURNING JSON
          )
        ) RETURNING job_id INTO v_job_id;

        UPDATE hotel_financial_validation_results
           SET ai_generation_status = 'PENDING',
               ai_source = 'deterministic-rule-fallback',
               ai_model = SUBSTR(TRIM(p_model_name), 1, 120),
               ai_requested_at = SYSTIMESTAMP,
               ai_generated_at = NULL,
               ai_latency_ms = NULL,
               updated_at = SYSTIMESTAMP
         WHERE exception_id = rec.exception_id;

        INSERT INTO event_stream(event_type, event_source, event_data, correlation_id)
        VALUES (
          'OWNER_FINANCIAL_AI_QUEUED', 'owner_fin_validation_pkg',
          JSON_OBJECT(
            'jobId' VALUE v_job_id,
            'runId' VALUE rec.run_id,
            'submissionId' VALUE rec.submission_id,
            'exceptionId' VALUE rec.exception_id,
            'model' VALUE p_model_name,
            'humanAttestation' VALUE 'false'
            RETURNING JSON
          ),
          'FIN-SUB-' || rec.submission_id
        );
        p_job_count := p_job_count + 1;
      EXCEPTION
        WHEN DUP_VAL_ON_INDEX THEN NULL;
      END;
    END LOOP;
  END enqueue_run_ai_rationales;

  PROCEDURE claim_financial_ai_job(
    p_worker_id     IN  VARCHAR2,
    p_job_id        OUT hotel_financial_ai_jobs.job_id%TYPE,
    p_lease_seconds IN  NUMBER DEFAULT 60
  ) IS
    CURSOR c_next_job IS
      SELECT job_id, exception_id, submission_id
        FROM hotel_financial_ai_jobs
       WHERE job_status = 'PENDING'
         AND next_attempt_at <= SYSTIMESTAMP
         AND attempt_count < max_attempts
       ORDER BY priority DESC, requested_at, job_id
       FOR UPDATE SKIP LOCKED;
    v_job_id        NUMBER;
    v_exception_id  NUMBER;
    v_submission_id NUMBER;
  BEGIN
    p_job_id := NULL;
    IF p_worker_id IS NULL OR TRIM(p_worker_id) IS NULL THEN
      RAISE_APPLICATION_ERROR(-20032, 'AI worker ID is required.');
    END IF;

    OPEN c_next_job;
    FETCH c_next_job INTO v_job_id, v_exception_id, v_submission_id;
    IF c_next_job%NOTFOUND THEN
      CLOSE c_next_job;
      RETURN;
    END IF;

    UPDATE hotel_financial_ai_jobs
       SET job_status = 'PROCESSING',
           attempt_count = attempt_count + 1,
           worker_id = SUBSTR(TRIM(p_worker_id), 1, 200),
           started_at = SYSTIMESTAMP,
           lease_expires_at = SYSTIMESTAMP + NUMTODSINTERVAL(GREATEST(NVL(p_lease_seconds, 60), 30), 'SECOND'),
           updated_at = SYSTIMESTAMP
     WHERE job_id = v_job_id;

    UPDATE hotel_financial_validation_results
       SET ai_generation_status = 'PROCESSING', updated_at = SYSTIMESTAMP
     WHERE exception_id = v_exception_id;
    CLOSE c_next_job;

    INSERT INTO event_stream(event_type, event_source, event_data, correlation_id)
    VALUES (
      'OWNER_FINANCIAL_AI_CLAIMED', 'owner_fin_validation_pkg',
      JSON_OBJECT(
        'jobId' VALUE v_job_id,
        'exceptionId' VALUE v_exception_id,
        'workerId' VALUE p_worker_id,
        'humanAttestation' VALUE 'false'
        RETURNING JSON
      ),
      'FIN-SUB-' || v_submission_id
    );
    p_job_id := v_job_id;
  END claim_financial_ai_job;

  PROCEDURE complete_financial_ai_job(
    p_job_id       IN hotel_financial_ai_jobs.job_id%TYPE,
    p_worker_id    IN VARCHAR2,
    p_response     IN CLOB,
    p_result_json  IN CLOB,
    p_latency_ms   IN NUMBER
  ) IS
    v_exception_id  NUMBER;
    v_submission_id NUMBER;
    v_run_id        NUMBER;
    v_model_name    VARCHAR2(120);
  BEGIN
    IF p_response IS NULL OR DBMS_LOB.GETLENGTH(p_response) = 0 THEN
      RAISE_APPLICATION_ERROR(-20033, 'AI response text is required.');
    END IF;

    SELECT exception_id, submission_id, run_id, model_name
      INTO v_exception_id, v_submission_id, v_run_id, v_model_name
      FROM hotel_financial_ai_jobs
     WHERE job_id = p_job_id
       AND job_status = 'PROCESSING'
       AND worker_id = SUBSTR(TRIM(p_worker_id), 1, 200)
       FOR UPDATE;

    UPDATE hotel_financial_ai_jobs
       SET job_status = 'COMPLETED',
           response_text = p_response,
           last_error = NULL,
           lease_expires_at = NULL,
           completed_at = SYSTIMESTAMP,
           updated_at = SYSTIMESTAMP
     WHERE job_id = p_job_id;
    IF p_result_json IS NOT NULL THEN
      UPDATE hotel_financial_ai_jobs
         SET result_json = JSON(p_result_json)
       WHERE job_id = p_job_id;
    END IF;

    UPDATE hotel_financial_validation_results
       SET ai_rationale = p_response,
           ai_generation_status = 'COMPLETED',
           ai_source = 'ollama',
           ai_model = v_model_name,
           ai_generated_at = SYSTIMESTAMP,
           ai_latency_ms = GREATEST(NVL(p_latency_ms, 0), 0),
           updated_at = SYSTIMESTAMP
     WHERE exception_id = v_exception_id;

    INSERT INTO agent_actions(
      agent_name, action_type, entity_type, entity_id, decision_payload,
      confidence, execution_status, executed_at
    ) VALUES (
      'OWNER_FINANCIAL_VALIDATION_ASSISTANT', 'EXPLAIN_EXCEPTION',
      'financial_validation_exception', v_exception_id,
      JSON_SERIALIZE(JSON_OBJECT(
        'source' VALUE 'ollama',
        'model' VALUE v_model_name,
        'jobId' VALUE p_job_id,
        'runId' VALUE v_run_id,
        'latencyMs' VALUE GREATEST(NVL(p_latency_ms, 0), 0),
        'humanAttestation' VALUE 'false'
        RETURNING JSON
      ) RETURNING CLOB),
      0.85, 'completed', SYSTIMESTAMP
    );

    INSERT INTO event_stream(event_type, event_source, event_data, correlation_id)
    VALUES (
      'OWNER_FINANCIAL_AI_ENRICHED', 'owner_fin_validation_pkg',
      JSON_OBJECT(
        'jobId' VALUE p_job_id,
        'runId' VALUE v_run_id,
        'submissionId' VALUE v_submission_id,
        'exceptionId' VALUE v_exception_id,
        'model' VALUE v_model_name,
        'latencyMs' VALUE GREATEST(NVL(p_latency_ms, 0), 0),
        'humanAttestation' VALUE 'false'
        RETURNING JSON
      ),
      'FIN-SUB-' || v_submission_id
    );
  EXCEPTION
    WHEN NO_DATA_FOUND THEN
      RAISE_APPLICATION_ERROR(-20034, 'Claimed financial AI job not found for this worker.');
  END complete_financial_ai_job;

  PROCEDURE fail_financial_ai_job(
    p_job_id              IN hotel_financial_ai_jobs.job_id%TYPE,
    p_worker_id           IN VARCHAR2,
    p_error               IN VARCHAR2,
    p_result_json         IN CLOB,
    p_latency_ms          IN NUMBER,
    p_retry_delay_seconds IN NUMBER DEFAULT 2
  ) IS
    v_exception_id  NUMBER;
    v_submission_id NUMBER;
    v_run_id        NUMBER;
    v_attempt_count NUMBER;
    v_max_attempts  NUMBER;
    v_terminal      NUMBER;
  BEGIN
    SELECT exception_id, submission_id, run_id, attempt_count, max_attempts
      INTO v_exception_id, v_submission_id, v_run_id, v_attempt_count, v_max_attempts
      FROM hotel_financial_ai_jobs
     WHERE job_id = p_job_id
       AND job_status = 'PROCESSING'
       AND worker_id = SUBSTR(TRIM(p_worker_id), 1, 200)
       FOR UPDATE;

    v_terminal := CASE WHEN v_attempt_count >= v_max_attempts THEN 1 ELSE 0 END;
    UPDATE hotel_financial_ai_jobs
       SET job_status = CASE WHEN v_terminal = 1 THEN 'FAILED' ELSE 'PENDING' END,
           last_error = SUBSTR(NVL(p_error, 'Unknown Ollama generation error'), 1, 2000),
           worker_id = CASE WHEN v_terminal = 1 THEN worker_id ELSE NULL END,
           lease_expires_at = NULL,
           next_attempt_at = CASE
             WHEN v_terminal = 1 THEN next_attempt_at
             ELSE SYSTIMESTAMP + NUMTODSINTERVAL(GREATEST(NVL(p_retry_delay_seconds, 2), 1), 'SECOND')
           END,
           completed_at = CASE WHEN v_terminal = 1 THEN SYSTIMESTAMP ELSE NULL END,
           updated_at = SYSTIMESTAMP
     WHERE job_id = p_job_id;
    IF p_result_json IS NOT NULL THEN
      UPDATE hotel_financial_ai_jobs
         SET result_json = JSON(p_result_json)
       WHERE job_id = p_job_id;
    END IF;

    UPDATE hotel_financial_validation_results
       SET ai_generation_status = CASE WHEN v_terminal = 1 THEN 'FAILED' ELSE 'PENDING' END,
           ai_source = 'deterministic-rule-fallback',
           ai_generated_at = CASE WHEN v_terminal = 1 THEN SYSTIMESTAMP ELSE ai_generated_at END,
           ai_latency_ms = GREATEST(NVL(p_latency_ms, 0), 0),
           updated_at = SYSTIMESTAMP
     WHERE exception_id = v_exception_id;

    INSERT INTO event_stream(event_type, event_source, event_data, correlation_id)
    VALUES (
      CASE WHEN v_terminal = 1 THEN 'OWNER_FINANCIAL_AI_FALLBACK' ELSE 'OWNER_FINANCIAL_AI_RETRY' END,
      'owner_fin_validation_pkg',
      JSON_OBJECT(
        'jobId' VALUE p_job_id,
        'runId' VALUE v_run_id,
        'submissionId' VALUE v_submission_id,
        'exceptionId' VALUE v_exception_id,
        'attempt' VALUE v_attempt_count,
        'maxAttempts' VALUE v_max_attempts,
        'willRetry' VALUE CASE WHEN v_terminal = 1 THEN 'false' ELSE 'true' END,
        'error' VALUE SUBSTR(NVL(p_error, 'Unknown Ollama generation error'), 1, 1000),
        'humanAttestation' VALUE 'false'
        RETURNING JSON
      ),
      'FIN-SUB-' || v_submission_id
    );
  EXCEPTION
    WHEN NO_DATA_FOUND THEN
      RAISE_APPLICATION_ERROR(-20035, 'Claimed financial AI job not found for failure recording.');
  END fail_financial_ai_job;

  PROCEDURE recover_stale_financial_ai_jobs(
    p_recovered_count OUT NUMBER
  ) IS
    v_terminal NUMBER;
  BEGIN
    p_recovered_count := 0;
    FOR rec IN (
      SELECT job_id, exception_id, submission_id, run_id, attempt_count, max_attempts
        FROM hotel_financial_ai_jobs
       WHERE job_status = 'PROCESSING'
         AND NVL(lease_expires_at, updated_at) <= SYSTIMESTAMP
       ORDER BY job_id
       FOR UPDATE SKIP LOCKED
    ) LOOP
      v_terminal := CASE WHEN rec.attempt_count >= rec.max_attempts THEN 1 ELSE 0 END;
      UPDATE hotel_financial_ai_jobs
         SET job_status = CASE WHEN v_terminal = 1 THEN 'FAILED' ELSE 'PENDING' END,
             worker_id = NULL,
             lease_expires_at = NULL,
             next_attempt_at = SYSTIMESTAMP,
             completed_at = CASE WHEN v_terminal = 1 THEN SYSTIMESTAMP ELSE NULL END,
             last_error = 'Recovered after an expired worker lease.',
             updated_at = SYSTIMESTAMP
       WHERE job_id = rec.job_id;
      UPDATE hotel_financial_validation_results
         SET ai_generation_status = CASE WHEN v_terminal = 1 THEN 'FAILED' ELSE 'PENDING' END,
             ai_source = 'deterministic-rule-fallback',
             updated_at = SYSTIMESTAMP
       WHERE exception_id = rec.exception_id;
      INSERT INTO event_stream(event_type, event_source, event_data, correlation_id)
      VALUES (
        'OWNER_FINANCIAL_AI_LEASE_RECOVERED', 'owner_fin_validation_pkg',
        JSON_OBJECT(
          'jobId' VALUE rec.job_id,
          'runId' VALUE rec.run_id,
          'exceptionId' VALUE rec.exception_id,
          'terminalFallback' VALUE CASE WHEN v_terminal = 1 THEN 'true' ELSE 'false' END,
          'humanAttestation' VALUE 'false'
          RETURNING JSON
        ),
        'FIN-SUB-' || rec.submission_id
      );
      p_recovered_count := p_recovered_count + 1;
    END LOOP;
  END recover_stale_financial_ai_jobs;

  PROCEDURE clear_demo_data IS
  BEGIN
    DELETE FROM hotel_financial_ai_jobs;
    DELETE FROM hotel_financial_validation_actions;
    DELETE FROM hotel_financial_validation_results;
    DELETE FROM hotel_financial_validation_runs;
    DELETE FROM hotel_financial_submission_lines;
    DELETE FROM hotel_financial_submissions;
    DELETE FROM hotel_property_owner_map;
    DELETE FROM hotel_financial_validation_rules;
    DELETE FROM hotel_owner_entities;
  END clear_demo_data;

  PROCEDURE refresh_demo_data(p_force IN NUMBER DEFAULT 0) IS
    v_count           NUMBER;
    v_owner_ids       SYS.ODCINUMBERLIST := SYS.ODCINUMBERLIST();
    v_submission_id   NUMBER;
    v_expected        NUMBER;
    v_reservations    NUMBER;
    v_period          DATE;
    v_scenario        NUMBER;
    v_submitted       NUMBER;
    v_run_id          NUMBER;
    v_exception_count NUMBER;
  BEGIN
    SELECT COUNT(*) INTO v_count FROM hotel_owner_entities;
    IF v_count > 0 AND NVL(p_force, 0) = 0 THEN
      DBMS_OUTPUT.PUT_LINE('Owner financial validation demo data already present.');
      RETURN;
    END IF;
    IF NVL(p_force, 0) = 1 THEN clear_demo_data; END IF;

    INSERT INTO hotel_owner_entities(owner_name, owner_type, region)
    VALUES ('Harbor Lodging Partners', 'Institutional Owner', 'Texas') RETURNING owner_id INTO v_count;
    v_owner_ids.EXTEND; v_owner_ids(v_owner_ids.COUNT) := v_count;
    INSERT INTO hotel_owner_entities(owner_name, owner_type, region)
    VALUES ('Canyon Hospitality Holdings', 'Private Owner', 'New Jersey') RETURNING owner_id INTO v_count;
    v_owner_ids.EXTEND; v_owner_ids(v_owner_ids.COUNT) := v_count;
    INSERT INTO hotel_owner_entities(owner_name, owner_type, region)
    VALUES ('Lakeside Hotel Ventures', 'Joint Venture', 'California') RETURNING owner_id INTO v_count;
    v_owner_ids.EXTEND; v_owner_ids(v_owner_ids.COUNT) := v_count;
    INSERT INTO hotel_owner_entities(owner_name, owner_type, region)
    VALUES ('Summit Owner Group', 'Franchise Owner', 'Georgia') RETURNING owner_id INTO v_count;
    v_owner_ids.EXTEND; v_owner_ids(v_owner_ids.COUNT) := v_count;

    FOR prop IN (
      SELECT brand_id, ROW_NUMBER() OVER (ORDER BY brand_id) AS property_rank
        FROM (
          SELECT brand_id
            FROM brands
           ORDER BY brand_id
           FETCH FIRST 8 ROWS ONLY
        )
       ORDER BY brand_id
    ) LOOP
      INSERT INTO hotel_property_owner_map(
        property_id, owner_id, ownership_model, effective_start_date
      ) VALUES (
        prop.brand_id,
        v_owner_ids(MOD(prop.property_rank - 1, v_owner_ids.COUNT) + 1),
        CASE MOD(prop.property_rank, 3) WHEN 0 THEN 'Franchised' WHEN 1 THEN 'Managed' ELSE 'Joint Venture' END,
        DATE '2024-01-01'
      );
    END LOOP;

    INSERT INTO hotel_financial_validation_rules(metric_code, rule_name, metric_category, tolerance_amount, tolerance_pct, rate_pct, severity_floor, basis_description)
    VALUES ('ROOM_REVENUE', 'Governed room and folio revenue match', 'Room Revenue', 250, 1.50, NULL, 'MEDIUM',
      'SUM(ORDER_ITEMS.LINE_TOTAL) for non-cancelled reservations by property and fiscal month; property run-rate fallback for months without folio activity.');
    INSERT INTO hotel_financial_validation_rules(metric_code, rule_name, metric_category, tolerance_amount, tolerance_pct, rate_pct, severity_floor, basis_description)
    VALUES ('OWNER_FEE_BASIS', 'Owner fee basis equals governed room revenue', 'Fees', 250, 1.00, NULL, 'HIGH',
      'Owner-reported fee basis must reconcile to governed room revenue before fee application.');
    INSERT INTO hotel_financial_validation_rules(metric_code, rule_name, metric_category, tolerance_amount, tolerance_pct, rate_pct, severity_floor, basis_description)
    VALUES ('MANAGEMENT_FEE', 'Synthetic management fee at governed rate', 'Fees', 100, 2.00, 3.00, 'HIGH',
      'Expected management fee = governed room revenue x synthetic 3.00% demo rule.');
    INSERT INTO hotel_financial_validation_rules(metric_code, rule_name, metric_category, tolerance_amount, tolerance_pct, rate_pct, severity_floor, basis_description)
    VALUES ('CLOSE_ADJUSTMENT', 'Duplicate close adjustment check', 'Adjustments', 50, 0.50, NULL, 'MEDIUM',
      'Owner adjustments are compared with the governed close baseline; unexplained duplicates should resolve to zero.');
    INSERT INTO hotel_financial_validation_rules(metric_code, rule_name, metric_category, tolerance_amount, tolerance_pct, rate_pct, severity_floor, basis_description)
    VALUES ('RESERVATION_COUNT', 'Reservation population completeness', 'Close Inputs', 2, 1.00, NULL, 'LOW',
      'COUNT(DISTINCT ORDERS.ORDER_ID) represented by property folio lines for the fiscal month.');

    FOR prop IN (
      SELECT m.property_id, m.owner_id,
             ROW_NUMBER() OVER (ORDER BY m.property_id) AS property_rank
        FROM hotel_property_owner_map m
       ORDER BY m.property_id
    ) LOOP
      FOR period_offset IN 1..4 LOOP
        v_period := ADD_MONTHS(TRUNC(SYSDATE, 'MM'), -period_offset);
        v_expected := governed_room_revenue(prop.property_id, v_period);
        v_reservations := governed_reservation_count(prop.property_id, v_period);
        v_scenario := MOD(prop.property_rank + period_offset, 7);

        INSERT INTO hotel_financial_submissions(
          property_id, owner_id, fiscal_period, close_version, status,
          submitted_by, submitted_at, report_json
        ) VALUES (
          prop.property_id, prop.owner_id, v_period, 1, 'SUBMITTED',
          'owner.close@synthetic.example',
          SYSTIMESTAMP - NUMTODSINTERVAL((period_offset * 5) + prop.property_rank, 'HOUR'),
          JSON_OBJECT(
            'synthetic' VALUE 'true',
            'source' VALUE 'deterministic owner close seed',
            'scenarioCode' VALUE v_scenario,
            'fiscalPeriod' VALUE TO_CHAR(v_period, 'YYYY-MM')
            RETURNING JSON
          )
        ) RETURNING submission_id INTO v_submission_id;

        v_submitted := ROUND(v_expected * CASE v_scenario
          WHEN 0 THEN 0.68 WHEN 1 THEN 0.88 WHEN 6 THEN 1.006 ELSE 1 END, 2);
        INSERT INTO hotel_financial_submission_lines(submission_id, metric_code, metric_category, submitted_amount, currency_code, source_label, note)
        VALUES (v_submission_id, 'ROOM_REVENUE', 'Room Revenue', v_submitted, 'USD', 'Owner close workbook',
          CASE v_scenario WHEN 0 THEN 'Critical revenue outlier intentionally injected.' WHEN 1 THEN 'Underreported room revenue intentionally injected.' WHEN 6 THEN 'Within tolerance control case.' END);

        v_submitted := ROUND(v_expected * CASE v_scenario WHEN 2 THEN 1.14 ELSE 1 END, 2);
        INSERT INTO hotel_financial_submission_lines(submission_id, metric_code, metric_category, submitted_amount, currency_code, source_label, note)
        VALUES (v_submission_id, 'OWNER_FEE_BASIS', 'Fees', v_submitted, 'USD', 'Owner fee schedule',
          CASE v_scenario WHEN 2 THEN 'Overreported fee basis intentionally injected.' END);

        v_submitted := ROUND(v_expected * 0.03 * CASE v_scenario WHEN 3 THEN 0 ELSE 1 END, 2);
        INSERT INTO hotel_financial_submission_lines(submission_id, metric_code, metric_category, submitted_amount, currency_code, source_label, note)
        VALUES (v_submission_id, 'MANAGEMENT_FEE', 'Fees', v_submitted, 'USD', 'Owner fee schedule',
          CASE v_scenario WHEN 3 THEN 'Missing fee line intentionally injected.' END);

        v_submitted := CASE v_scenario WHEN 4 THEN 24000 WHEN 5 THEN -7500 ELSE 0 END;
        INSERT INTO hotel_financial_submission_lines(submission_id, metric_code, metric_category, submitted_amount, currency_code, source_label, note)
        VALUES (v_submission_id, 'CLOSE_ADJUSTMENT', 'Adjustments', v_submitted, 'USD', 'Owner close journal',
          CASE v_scenario WHEN 4 THEN 'Duplicate adjustment intentionally injected.' WHEN 5 THEN 'Timing difference candidate intentionally injected.' END);

        v_submitted := ROUND(v_reservations * CASE v_scenario WHEN 5 THEN 1.08 ELSE 1 END, 0);
        INSERT INTO hotel_financial_submission_lines(submission_id, metric_code, metric_category, submitted_amount, submitted_units, currency_code, source_label, note)
        VALUES (v_submission_id, 'RESERVATION_COUNT', 'Close Inputs', v_submitted, v_submitted, 'USD', 'Owner close control totals',
          CASE v_scenario WHEN 5 THEN 'Close population mismatch intentionally injected.' END);

        run_financial_validation(v_submission_id, 'DEMO_SEED', NULL, v_run_id, v_exception_count);
      END LOOP;
    END LOOP;

    DBMS_OUTPUT.PUT_LINE('Seeded deterministic owner financial submissions, validation runs, and exceptions.');
  END refresh_demo_data;
END owner_fin_validation_pkg;
/

-- ============================================================
-- API VIEWS - latest validation run per submission
-- ============================================================

CREATE OR REPLACE VIEW hotel_financial_validation_summary_v AS
WITH latest_run AS (
  SELECT r.*, ROW_NUMBER() OVER (PARTITION BY r.submission_id ORDER BY r.run_no DESC) AS rn
    FROM hotel_financial_validation_runs r
   WHERE r.run_status = 'COMPLETED'
), result_totals AS (
  SELECT vr.run_id,
         SUM(CASE WHEN vr.metric_code = 'ROOM_REVENUE' THEN vr.submitted_amount ELSE 0 END) AS submitted_room_revenue,
         SUM(CASE WHEN vr.metric_code = 'ROOM_REVENUE' THEN vr.expected_amount ELSE 0 END) AS expected_room_revenue,
         SUM(CASE WHEN vr.metric_code = 'ROOM_REVENUE' THEN vr.variance_amount ELSE 0 END) AS room_revenue_variance,
         SUM(CASE WHEN vr.is_exception = 1 THEN 1 ELSE 0 END) AS exception_count,
         COUNT(*) AS metric_count
    FROM hotel_financial_validation_results vr
   GROUP BY vr.run_id
)
SELECT s.submission_id, s.property_id, b.brand_name AS property_name,
       s.owner_id, oe.owner_name, oe.region, s.fiscal_period,
       TO_CHAR(s.fiscal_period, 'YYYY-MM') AS fiscal_period_label,
       s.close_version, s.status AS submission_status, s.submitted_by,
       s.submitted_at, s.ai_summary, s.close_readiness_score,
       lr.run_id, lr.run_no, lr.run_by, lr.completed_at AS last_validated_at,
       lr.auto_cleared_pct,
       NVL(rt.submitted_room_revenue, 0) AS submitted_room_revenue,
       NVL(rt.expected_room_revenue, 0) AS expected_room_revenue,
       NVL(rt.room_revenue_variance, 0) AS variance_amount,
       NVL(rt.exception_count, 0) AS exception_count,
       NVL(rt.metric_count, 0) AS metric_count
  FROM hotel_financial_submissions s
  JOIN brands b ON b.brand_id = s.property_id
  JOIN hotel_owner_entities oe ON oe.owner_id = s.owner_id
  LEFT JOIN latest_run lr ON lr.submission_id = s.submission_id AND lr.rn = 1
  LEFT JOIN result_totals rt ON rt.run_id = lr.run_id;

CREATE OR REPLACE VIEW hotel_financial_exception_queue_v AS
WITH latest_run AS (
  SELECT r.*, ROW_NUMBER() OVER (PARTITION BY r.submission_id ORDER BY r.run_no DESC) AS rn
    FROM hotel_financial_validation_runs r
   WHERE r.run_status = 'COMPLETED'
), last_action AS (
  SELECT a.*,
         ROW_NUMBER() OVER (PARTITION BY a.exception_id ORDER BY a.created_at DESC, a.action_id DESC) AS rn
    FROM hotel_financial_validation_actions a
   WHERE a.exception_id IS NOT NULL
)
SELECT vr.exception_id, vr.run_id, vr.submission_id, s.property_id,
       b.brand_name AS property_name, s.owner_id, oe.owner_name, oe.region,
       s.fiscal_period, TO_CHAR(s.fiscal_period, 'YYYY-MM') AS fiscal_period_label,
       s.status AS submission_status, vr.line_id, vr.rule_id, vr.metric_code,
       vr.metric_category, vr.submitted_amount, vr.expected_amount,
       vr.variance_amount, vr.variance_pct, vr.severity, vr.status,
       vr.ai_rationale, vr.ai_generation_status AS ai_status,
       vr.ai_source, vr.ai_model, vr.ai_requested_at, vr.ai_generated_at,
       vr.ai_latency_ms, j.job_id AS ai_job_id, j.attempt_count AS ai_attempt_count,
       j.max_attempts AS ai_max_attempts, j.last_error AS ai_last_error,
       vr.evidence_json,
       NVL(JSON_VALUE(vr.evidence_json, '$.evidenceCount' RETURNING NUMBER), 0) AS evidence_count,
       la.action_type AS last_action, la.action_by AS last_action_by,
       la.action_note AS last_action_note, la.created_at AS last_action_at,
       vr.created_at, vr.updated_at
  FROM latest_run lr
  JOIN hotel_financial_validation_results vr ON vr.run_id = lr.run_id AND vr.is_exception = 1
  JOIN hotel_financial_submissions s ON s.submission_id = vr.submission_id
  JOIN brands b ON b.brand_id = s.property_id
  JOIN hotel_owner_entities oe ON oe.owner_id = s.owner_id
  LEFT JOIN hotel_financial_ai_jobs j
    ON j.exception_id = vr.exception_id
   AND j.job_type = 'EXCEPTION_RATIONALE'
  LEFT JOIN last_action la ON la.exception_id = vr.exception_id AND la.rn = 1
 WHERE lr.rn = 1;

CREATE OR REPLACE VIEW hotel_financial_ai_job_status_v AS
SELECT j.job_id, j.run_id, j.submission_id, j.exception_id, j.job_type,
       j.job_status, j.priority, j.attempt_count, j.max_attempts,
       j.requested_by, j.model_name, j.worker_id, j.last_error,
       j.next_attempt_at, j.lease_expires_at, j.requested_at,
       j.started_at, j.completed_at, j.updated_at,
       vr.metric_code, vr.metric_category, vr.severity,
       vr.ai_generation_status, vr.ai_source, vr.ai_generated_at,
       vr.ai_latency_ms
  FROM hotel_financial_ai_jobs j
  LEFT JOIN hotel_financial_validation_results vr
    ON vr.exception_id = j.exception_id;

CREATE OR REPLACE VIEW hotel_financial_variance_trend_v AS
SELECT fiscal_period, fiscal_period_label,
       SUM(submitted_room_revenue) AS submitted_room_revenue,
       SUM(expected_room_revenue) AS expected_room_revenue,
       SUM(variance_amount) AS variance_amount,
       SUM(exception_count) AS exception_count
  FROM hotel_financial_validation_summary_v
 GROUP BY fiscal_period, fiscal_period_label;

CREATE OR REPLACE VIEW hotel_financial_metric_variance_v AS
SELECT q.metric_category,
       SUM(q.submitted_amount) AS submitted_amount,
       SUM(q.expected_amount) AS expected_amount,
       SUM(q.variance_amount) AS variance_amount,
       COUNT(*) AS exception_count
  FROM hotel_financial_exception_queue_v q
 GROUP BY q.metric_category;

CREATE OR REPLACE VIEW hotel_financial_owner_status_v AS
SELECT owner_id, owner_name, region, submission_status,
       COUNT(*) AS submission_count,
       SUM(exception_count) AS exception_count,
       ROUND(AVG(close_readiness_score), 2) AS average_readiness_score
  FROM hotel_financial_validation_summary_v
 GROUP BY owner_id, owner_name, region, submission_status;

-- Regional demo security. The application sets HOSPITALITY_APP_CTX on the same
-- pooled connection before every protected query and clears it before release.
CREATE OR REPLACE FUNCTION vpd_owner_financial_region(
  p_schema IN VARCHAR2,
  p_table  IN VARCHAR2
) RETURN VARCHAR2 AS
  v_role   VARCHAR2(30);
  v_region VARCHAR2(100);
  v_scope  VARCHAR2(20);
BEGIN
  v_role := SYS_CONTEXT('HOSPITALITY_APP_CTX', 'ROLE');
  v_region := SYS_CONTEXT('HOSPITALITY_APP_CTX', 'REGION');
  v_scope := SYS_CONTEXT('HOSPITALITY_APP_CTX', 'ACCESS_SCOPE');
  IF SYS_CONTEXT('HOSPITALITY_APP_CTX', 'AUTHENTICATED') != 'Y' THEN RETURN '1=0'; END IF;
  IF v_scope = 'GLOBAL' AND v_role IN ('admin','analyst','merchandiser') THEN RETURN NULL; END IF;
  IF v_scope = 'REGION' AND v_role = 'fulfillment_mgr' AND v_region IS NOT NULL THEN
    RETURN 'owner_id IN (SELECT owner_id FROM hotel_owner_entities '
      || 'WHERE region = SYS_CONTEXT(''HOSPITALITY_APP_CTX'', ''REGION''))';
  END IF;
  RETURN '1=0';
END;
/

BEGIN
  DBMS_RLS.ADD_POLICY(
    object_schema => USER,
    object_name => 'HOTEL_FINANCIAL_SUBMISSIONS',
    policy_name => 'VPD_OWNER_FINANCIAL_REGION',
    function_schema => USER,
    policy_function => 'VPD_OWNER_FINANCIAL_REGION',
    statement_types => 'SELECT,UPDATE',
    update_check => TRUE,
    enable => TRUE,
    policy_type => DBMS_RLS.CONTEXT_SENSITIVE
  );
EXCEPTION
  WHEN OTHERS THEN
    IF SQLCODE = -28101 THEN
      DBMS_RLS.DROP_POLICY(USER, 'HOTEL_FINANCIAL_SUBMISSIONS', 'VPD_OWNER_FINANCIAL_REGION');
      DBMS_RLS.ADD_POLICY(
        object_schema => USER,
        object_name => 'HOTEL_FINANCIAL_SUBMISSIONS',
        policy_name => 'VPD_OWNER_FINANCIAL_REGION',
        function_schema => USER,
        policy_function => 'VPD_OWNER_FINANCIAL_REGION',
        statement_types => 'SELECT,UPDATE',
        update_check => TRUE,
        enable => TRUE,
        policy_type => DBMS_RLS.CONTEXT_SENSITIVE
      );
    ELSE RAISE;
    END IF;
END;
/

CREATE OR REPLACE FUNCTION vpd_owner_financial_child(
  p_schema IN VARCHAR2,
  p_table  IN VARCHAR2
) RETURN VARCHAR2 AS
  v_role   VARCHAR2(30);
  v_region VARCHAR2(100);
  v_scope  VARCHAR2(20);
BEGIN
  v_role := SYS_CONTEXT('HOSPITALITY_APP_CTX', 'ROLE');
  v_region := SYS_CONTEXT('HOSPITALITY_APP_CTX', 'REGION');
  v_scope := SYS_CONTEXT('HOSPITALITY_APP_CTX', 'ACCESS_SCOPE');
  IF SYS_CONTEXT('HOSPITALITY_APP_CTX', 'AUTHENTICATED') != 'Y' THEN RETURN '1=0'; END IF;
  IF v_scope = 'GLOBAL' AND v_role IN ('admin','analyst','merchandiser') THEN RETURN NULL; END IF;
  IF v_scope = 'REGION' AND v_role = 'fulfillment_mgr' AND v_region IS NOT NULL THEN
    RETURN 'submission_id IN (
      SELECT s.submission_id
      FROM hotel_financial_submissions s
      JOIN hotel_owner_entities oe ON oe.owner_id = s.owner_id
      WHERE oe.region = SYS_CONTEXT(''HOSPITALITY_APP_CTX'', ''REGION''))';
  END IF;
  RETURN '1=0';
END;
/

BEGIN
  FOR obj IN (
    SELECT 'HOTEL_FINANCIAL_SUBMISSION_LINES' AS object_name FROM dual UNION ALL
    SELECT 'HOTEL_FINANCIAL_VALIDATION_RUNS' FROM dual UNION ALL
    SELECT 'HOTEL_FINANCIAL_VALIDATION_RESULTS' FROM dual UNION ALL
    SELECT 'HOTEL_FINANCIAL_AI_JOBS' FROM dual UNION ALL
    SELECT 'HOTEL_FINANCIAL_VALIDATION_ACTIONS' FROM dual
  ) LOOP
    BEGIN
      DBMS_RLS.ADD_POLICY(
        object_schema => USER,
        object_name => obj.object_name,
        policy_name => 'VPD_OWNER_FIN_CHILD',
        function_schema => USER,
        policy_function => 'VPD_OWNER_FINANCIAL_CHILD',
        statement_types => 'SELECT,UPDATE',
        update_check => TRUE,
        enable => TRUE,
        policy_type => DBMS_RLS.CONTEXT_SENSITIVE
      );
    EXCEPTION
      WHEN OTHERS THEN
        IF SQLCODE = -28101 THEN
          DBMS_RLS.DROP_POLICY(USER, obj.object_name, 'VPD_OWNER_FIN_CHILD');
          DBMS_RLS.ADD_POLICY(
            object_schema => USER,
            object_name => obj.object_name,
            policy_name => 'VPD_OWNER_FIN_CHILD',
            function_schema => USER,
            policy_function => 'VPD_OWNER_FINANCIAL_CHILD',
            statement_types => 'SELECT,UPDATE',
            update_check => TRUE,
            enable => TRUE,
            policy_type => DBMS_RLS.CONTEXT_SENSITIVE
          );
        ELSE RAISE;
        END IF;
    END;
  END LOOP;
END;
/

COMMENT ON TABLE hotel_financial_validation_runs IS
  'Immutable validation run headers. Reruns append a new version and preserve prior evidence.';
COMMENT ON TABLE hotel_financial_validation_actions IS
  'Human owner/finance decisions and generated close notes for Scene 10 auditability.';
COMMENT ON TABLE hotel_financial_ai_jobs IS
  'Durable, lease-based queue for sequential Scene 10 AI enrichment; model output never changes human attestation state.';
COMMENT ON COLUMN hotel_financial_validation_results.ai_rationale IS
  'AI-assisted or deterministic rule-grounded explanation; never an automatic attestation.';
COMMENT ON COLUMN hotel_financial_validation_results.ai_generation_status IS
  'Persisted enrichment lifecycle; validation status and owner attestation remain separate.';

SELECT '13_owner_financial_validation.sql complete.' AS status FROM dual;
