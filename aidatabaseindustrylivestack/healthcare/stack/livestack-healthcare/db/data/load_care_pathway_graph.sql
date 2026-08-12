/*
 * load_care_pathway_graph.sql
 * Synthetic healthcare property graph data.
 *
 * This replaces the awkward influencer-style graph demo with a care-pathway
 * graph that can answer healthcare-native questions: Which patients share a
 * care-team risk pattern? Which encounters led to readmission risk? Which
 * care gaps connect to diagnoses, medications, facilities, and providers?
 */

SET SERVEROUTPUT ON
SET SQLBLANKLINES ON

PROMPT Loading care pathway graph data...

BEGIN
  DELETE FROM care_case_entities;
  DELETE FROM care_pathway_cases;
  DELETE FROM care_graph_relationships;
  DELETE FROM care_graph_entities;
  COMMIT;
END;
/

-- Vertices: de-identified patients, encounters, conditions, care teams, and gaps.
INSERT INTO care_graph_entities (entity_id, entity_key, entity_type, display_name, clinical_domain, risk_score, volume_count, engagement_rate, city, region, is_verified, summary, created_at) VALUES (1,  'PAT-1001', 'patient',    'Patient 1001 - Sepsis Readmission Risk',       'Sepsis / Transitions',        96.5, 18, 0.3100, 'Boston',        'Northeast', 'Y', 'De-identified patient with recent sepsis admission, delayed follow-up, and medication reconciliation risk.', SYSTIMESTAMP);
INSERT INTO care_graph_entities (entity_id, entity_key, entity_type, display_name, clinical_domain, risk_score, volume_count, engagement_rate, city, region, is_verified, summary, created_at) VALUES (2,  'PAT-1002', 'patient',    'Patient 1002 - Diabetes Care Gap',             'Diabetes',                    82.0, 11, 0.2400, 'Raleigh',       'Southeast', 'Y', 'De-identified patient with overdue A1C and retinal screening follow-up.', SYSTIMESTAMP);
INSERT INTO care_graph_entities (entity_id, entity_key, entity_type, display_name, clinical_domain, risk_score, volume_count, engagement_rate, city, region, is_verified, summary, created_at) VALUES (3,  'PAT-1003', 'patient',    'Patient 1003 - COPD Readmission Risk',         'Pulmonary',                   88.0, 15, 0.2800, 'Miami',         'Southeast', 'Y', 'De-identified patient with COPD exacerbation and missed 48-hour follow-up.', SYSTIMESTAMP);
INSERT INTO care_graph_entities (entity_id, entity_key, entity_type, display_name, clinical_domain, risk_score, volume_count, engagement_rate, city, region, is_verified, summary, created_at) VALUES (4,  'PAT-1004', 'patient',    'Patient 1004 - CHF Medication Review',         'Cardiology',                  79.0, 12, 0.2200, 'Chicago',       'Midwest',   'Y', 'De-identified patient with CHF, CKD, and diuretic reconciliation needs.', SYSTIMESTAMP);
INSERT INTO care_graph_entities (entity_id, entity_key, entity_type, display_name, clinical_domain, risk_score, volume_count, engagement_rate, city, region, is_verified, summary, created_at) VALUES (5,  'PAT-1005', 'patient',    'Patient 1005 - Post-Acute Delay',              'Orthopedics',                 74.0, 10, 0.1800, 'Phoenix',       'West',      'Y', 'De-identified patient waiting on home health after hip surgery.', SYSTIMESTAMP);
INSERT INTO care_graph_entities (entity_id, entity_key, entity_type, display_name, clinical_domain, risk_score, volume_count, engagement_rate, city, region, is_verified, summary, created_at) VALUES (6,  'PAT-1006', 'patient',    'Patient 1006 - Oncology Device Risk',          'Oncology',                    91.0, 13, 0.2600, 'Los Angeles',  'West',      'Y', 'De-identified patient with oncology infusion and line-care infection risk.', SYSTIMESTAMP);
INSERT INTO care_graph_entities (entity_id, entity_key, entity_type, display_name, clinical_domain, risk_score, volume_count, engagement_rate, city, region, is_verified, summary, created_at) VALUES (7,  'PAT-1007', 'patient',    'Patient 1007 - Complex Diabetes / CKD',        'Diabetes',                    86.0, 14, 0.2700, 'Seattle',       'West',      'Y', 'De-identified patient with diabetes, CKD, and pharmacy follow-up gap.', SYSTIMESTAMP);
INSERT INTO care_graph_entities (entity_id, entity_key, entity_type, display_name, clinical_domain, risk_score, volume_count, engagement_rate, city, region, is_verified, summary, created_at) VALUES (8,  'PAT-1008', 'patient',    'Patient 1008 - ED Return Watch',               'Emergency Care',              68.0, 7,  0.1200, 'New York',      'Northeast', 'Y', 'De-identified patient with recent ED utilization and open care-navigation task.', SYSTIMESTAMP);

INSERT INTO care_graph_entities (entity_id, entity_key, entity_type, display_name, clinical_domain, risk_score, volume_count, engagement_rate, city, region, is_verified, summary, created_at) VALUES (20, 'ENC-IP-4412', 'encounter', 'Inpatient Sepsis Admission',                  'Acute Care',                  93.0, 1,  0.0000, 'Boston',        'Northeast', 'Y', 'Index admission for sepsis bundle monitoring and discharge planning.', SYSTIMESTAMP);
INSERT INTO care_graph_entities (entity_id, entity_key, entity_type, display_name, clinical_domain, risk_score, volume_count, engagement_rate, city, region, is_verified, summary, created_at) VALUES (21, 'ENC-DC-4419', 'encounter', 'Discharge to Home Health',                    'Transitions',                 89.0, 1,  0.0000, 'Boston',        'Northeast', 'Y', 'Discharge transition requiring 48-hour contact and medication reconciliation.', SYSTIMESTAMP);
INSERT INTO care_graph_entities (entity_id, entity_key, entity_type, display_name, clinical_domain, risk_score, volume_count, engagement_rate, city, region, is_verified, summary, created_at) VALUES (22, 'ENC-ED-4430', 'encounter', 'ED Return - Dyspnea',                         'Emergency Care',              87.0, 1,  0.0000, 'Miami',         'Southeast', 'Y', 'Emergency return after COPD exacerbation.', SYSTIMESTAMP);
INSERT INTO care_graph_entities (entity_id, entity_key, entity_type, display_name, clinical_domain, risk_score, volume_count, engagement_rate, city, region, is_verified, summary, created_at) VALUES (23, 'ENC-OP-4438', 'encounter', 'Diabetes Follow-up Visit',                    'Ambulatory Care',             76.0, 1,  0.0000, 'Raleigh',       'Southeast', 'Y', 'Ambulatory visit where A1C and eye-screening gaps were detected.', SYSTIMESTAMP);
INSERT INTO care_graph_entities (entity_id, entity_key, entity_type, display_name, clinical_domain, risk_score, volume_count, engagement_rate, city, region, is_verified, summary, created_at) VALUES (24, 'ENC-SURG-4450','encounter','Hip Surgery Admission',                      'Surgery',                     72.0, 1,  0.0000, 'Phoenix',       'West',      'Y', 'Orthopedic surgical encounter requiring post-acute physical therapy.', SYSTIMESTAMP);
INSERT INTO care_graph_entities (entity_id, entity_key, entity_type, display_name, clinical_domain, risk_score, volume_count, engagement_rate, city, region, is_verified, summary, created_at) VALUES (25, 'ENC-ONC-4462','encounter', 'Oncology Infusion Visit',                     'Oncology',                    86.0, 1,  0.0000, 'Los Angeles',  'West',      'Y', 'Infusion visit with central-line care and infection surveillance.', SYSTIMESTAMP);
INSERT INTO care_graph_entities (entity_id, entity_key, entity_type, display_name, clinical_domain, risk_score, volume_count, engagement_rate, city, region, is_verified, summary, created_at) VALUES (26, 'ENC-TEL-4471','encounter', 'Telehealth Transition Call',                  'Transitions',                 78.0, 1,  0.0000, 'Chicago',       'Midwest',   'Y', 'Care coordinator telehealth check-in after CHF discharge.', SYSTIMESTAMP);

INSERT INTO care_graph_entities (entity_id, entity_key, entity_type, display_name, clinical_domain, risk_score, volume_count, engagement_rate, city, region, is_verified, summary, created_at) VALUES (40, 'COND-SEPSIS',   'condition', 'Sepsis',                         'Infection',       98.0, 41, 0.0000, 'Boston',       'Northeast', 'Y', 'High-acuity diagnosis requiring bundle compliance and rapid follow-up.', SYSTIMESTAMP);
INSERT INTO care_graph_entities (entity_id, entity_key, entity_type, display_name, clinical_domain, risk_score, volume_count, engagement_rate, city, region, is_verified, summary, created_at) VALUES (41, 'COND-DIABETES', 'condition', 'Type 2 Diabetes',                'Endocrinology',   83.0, 320,0.0000, 'Raleigh',      'Southeast', 'Y', 'Chronic condition with A1C and retinal-screening care gaps.', SYSTIMESTAMP);
INSERT INTO care_graph_entities (entity_id, entity_key, entity_type, display_name, clinical_domain, risk_score, volume_count, engagement_rate, city, region, is_verified, summary, created_at) VALUES (42, 'COND-COPD',     'condition', 'COPD Exacerbation',              'Pulmonary',       90.0, 96, 0.0000, 'Miami',        'Southeast', 'Y', 'Pulmonary diagnosis with high ED-return sensitivity.', SYSTIMESTAMP);
INSERT INTO care_graph_entities (entity_id, entity_key, entity_type, display_name, clinical_domain, risk_score, volume_count, engagement_rate, city, region, is_verified, summary, created_at) VALUES (43, 'COND-CHF',      'condition', 'Congestive Heart Failure',       'Cardiology',      84.0, 125,0.0000, 'Chicago',      'Midwest',   'Y', 'Cardiac condition requiring medication reconciliation and weight monitoring.', SYSTIMESTAMP);
INSERT INTO care_graph_entities (entity_id, entity_key, entity_type, display_name, clinical_domain, risk_score, volume_count, engagement_rate, city, region, is_verified, summary, created_at) VALUES (44, 'COND-CKD',      'condition', 'Chronic Kidney Disease',         'Nephrology',      81.0, 88, 0.0000, 'Seattle',      'West',      'Y', 'Comorbidity that changes medication and lab follow-up urgency.', SYSTIMESTAMP);
INSERT INTO care_graph_entities (entity_id, entity_key, entity_type, display_name, clinical_domain, risk_score, volume_count, engagement_rate, city, region, is_verified, summary, created_at) VALUES (45, 'COND-LINE-INF', 'condition', 'Central Line Infection Risk',    'Oncology Safety', 92.0, 22, 0.0000, 'Los Angeles', 'West',      'Y', 'Device-associated infection risk for oncology patients.', SYSTIMESTAMP);
INSERT INTO care_graph_entities (entity_id, entity_key, entity_type, display_name, clinical_domain, risk_score, volume_count, engagement_rate, city, region, is_verified, summary, created_at) VALUES (46, 'COND-HIP-FX',   'condition', 'Hip Fracture Recovery',          'Orthopedics',     70.0, 37, 0.0000, 'Phoenix',      'West',      'Y', 'Post-surgical recovery condition sensitive to post-acute delays.', SYSTIMESTAMP);

INSERT INTO care_graph_entities (entity_id, entity_key, entity_type, display_name, clinical_domain, risk_score, volume_count, engagement_rate, city, region, is_verified, summary, created_at) VALUES (60, 'MED-PIPTAZO',   'medication', 'Broad-Spectrum Antibiotic',      'Medication Safety', 89.0, 54, 0.0000, 'Boston',       'Northeast', 'Y', 'Antibiotic therapy tied to sepsis bundle timing.', SYSTIMESTAMP);
INSERT INTO care_graph_entities (entity_id, entity_key, entity_type, display_name, clinical_domain, risk_score, volume_count, engagement_rate, city, region, is_verified, summary, created_at) VALUES (61, 'MED-INSULIN',   'medication', 'Insulin Titration Plan',         'Medication Safety', 78.0, 63, 0.0000, 'Raleigh',      'Southeast', 'Y', 'Medication plan that depends on current A1C and CKD status.', SYSTIMESTAMP);
INSERT INTO care_graph_entities (entity_id, entity_key, entity_type, display_name, clinical_domain, risk_score, volume_count, engagement_rate, city, region, is_verified, summary, created_at) VALUES (62, 'MED-INHALER',   'medication', 'Maintenance Inhaler',            'Medication Safety', 75.0, 44, 0.0000, 'Miami',        'Southeast', 'Y', 'Pulmonary medication linked to COPD readmission prevention.', SYSTIMESTAMP);
INSERT INTO care_graph_entities (entity_id, entity_key, entity_type, display_name, clinical_domain, risk_score, volume_count, engagement_rate, city, region, is_verified, summary, created_at) VALUES (63, 'MED-DIURETIC',  'medication', 'Loop Diuretic Review',           'Medication Safety', 76.0, 31, 0.0000, 'Chicago',      'Midwest',   'Y', 'Medication review for CHF and CKD patients.', SYSTIMESTAMP);
INSERT INTO care_graph_entities (entity_id, entity_key, entity_type, display_name, clinical_domain, risk_score, volume_count, engagement_rate, city, region, is_verified, summary, created_at) VALUES (64, 'MED-ANTICOAG',  'medication', 'Anticoagulation Restart Plan',   'Medication Safety', 73.0, 19, 0.0000, 'Phoenix',      'West',      'Y', 'Post-operative medication decision requiring follow-up.', SYSTIMESTAMP);

INSERT INTO care_graph_entities (entity_id, entity_key, entity_type, display_name, clinical_domain, risk_score, volume_count, engagement_rate, city, region, is_verified, summary, created_at) VALUES (80, 'PROC-LACTATE',  'procedure', 'Repeat Lactate Lab',              'Diagnostics',     86.0, 27, 0.0000, 'Boston',       'Northeast', 'Y', 'Sepsis-bundle lab used to confirm improvement.', SYSTIMESTAMP);
INSERT INTO care_graph_entities (entity_id, entity_key, entity_type, display_name, clinical_domain, risk_score, volume_count, engagement_rate, city, region, is_verified, summary, created_at) VALUES (81, 'PROC-A1C',      'procedure', 'A1C Lab Overdue',                 'Diagnostics',     80.0, 93, 0.0000, 'Raleigh',      'Southeast', 'Y', 'Overdue diabetes monitoring lab.', SYSTIMESTAMP);
INSERT INTO care_graph_entities (entity_id, entity_key, entity_type, display_name, clinical_domain, risk_score, volume_count, engagement_rate, city, region, is_verified, summary, created_at) VALUES (82, 'PROC-HOMEHLTH', 'procedure', 'Home Health Start of Care',       'Post-Acute Care',  88.0, 48, 0.0000, 'Phoenix',      'West',      'Y', 'Post-acute service required after discharge.', SYSTIMESTAMP);
INSERT INTO care_graph_entities (entity_id, entity_key, entity_type, display_name, clinical_domain, risk_score, volume_count, engagement_rate, city, region, is_verified, summary, created_at) VALUES (83, 'PROC-LINECARE', 'procedure', 'Central Line Dressing Check',     'Oncology Safety',  87.0, 21, 0.0000, 'Los Angeles', 'West',      'Y', 'Line-care process connected to infection risk.', SYSTIMESTAMP);

INSERT INTO care_graph_entities (entity_id, entity_key, entity_type, display_name, clinical_domain, risk_score, volume_count, engagement_rate, city, region, is_verified, summary, created_at) VALUES (100,'PRV-LEE',       'provider', 'Dr. Hannah Lee - Hospitalist',     'Care Team',       88.0, 42, 0.0000, 'Boston',       'Northeast', 'Y', 'Hospitalist leading sepsis transition planning.', SYSTIMESTAMP);
INSERT INTO care_graph_entities (entity_id, entity_key, entity_type, display_name, clinical_domain, risk_score, volume_count, engagement_rate, city, region, is_verified, summary, created_at) VALUES (101,'PRV-PATEL',     'provider', 'Dr. Arjun Patel - Pulmonology',    'Care Team',       82.0, 38, 0.0000, 'Miami',        'Southeast', 'Y', 'Pulmonologist connected to COPD follow-up.', SYSTIMESTAMP);
INSERT INTO care_graph_entities (entity_id, entity_key, entity_type, display_name, clinical_domain, risk_score, volume_count, engagement_rate, city, region, is_verified, summary, created_at) VALUES (102,'PRV-NURSE-CARE','provider', 'Nurse Care Coordinator Team',      'Care Team',       91.0, 76, 0.0000, 'Raleigh',      'Southeast', 'Y', 'Care coordination team managing follow-up and outreach.', SYSTIMESTAMP);
INSERT INTO care_graph_entities (entity_id, entity_key, entity_type, display_name, clinical_domain, risk_score, volume_count, engagement_rate, city, region, is_verified, summary, created_at) VALUES (103,'PRV-PHARM',     'provider', 'Clinical Pharmacy Review',         'Care Team',       84.0, 55, 0.0000, 'Chicago',      'Midwest',   'Y', 'Pharmacy team resolving medication reconciliation gaps.', SYSTIMESTAMP);
INSERT INTO care_graph_entities (entity_id, entity_key, entity_type, display_name, clinical_domain, risk_score, volume_count, engagement_rate, city, region, is_verified, summary, created_at) VALUES (104,'PRV-ONC-NAV',   'provider', 'Oncology Nurse Navigator',         'Care Team',       86.0, 24, 0.0000, 'Los Angeles', 'West',      'Y', 'Oncology navigator monitoring line-care and infusion risk.', SYSTIMESTAMP);

INSERT INTO care_graph_entities (entity_id, entity_key, entity_type, display_name, clinical_domain, risk_score, volume_count, engagement_rate, city, region, is_verified, summary, created_at) VALUES (120,'FAC-NORTH-ED',  'facility', 'NorthStar Medical Center ED',      'Facility',        89.0, 210,0.0000, 'Boston',       'Northeast', 'Y', 'Emergency department and inpatient admission site.', SYSTIMESTAMP);
INSERT INTO care_graph_entities (entity_id, entity_key, entity_type, display_name, clinical_domain, risk_score, volume_count, engagement_rate, city, region, is_verified, summary, created_at) VALUES (121,'FAC-CAREPATH',  'facility', 'CarePath Community Clinic',        'Facility',        74.0, 180,0.0000, 'Raleigh',      'Southeast', 'Y', 'Ambulatory clinic managing chronic care gaps.', SYSTIMESTAMP);
INSERT INTO care_graph_entities (entity_id, entity_key, entity_type, display_name, clinical_domain, risk_score, volume_count, engagement_rate, city, region, is_verified, summary, created_at) VALUES (122,'FAC-REHAB-WEST','facility', 'West Valley Rehab Network',        'Facility',        70.0, 95, 0.0000, 'Phoenix',      'West',      'Y', 'Post-acute rehab and home health coordination partner.', SYSTIMESTAMP);
INSERT INTO care_graph_entities (entity_id, entity_key, entity_type, display_name, clinical_domain, risk_score, volume_count, engagement_rate, city, region, is_verified, summary, created_at) VALUES (123,'FAC-ONC-INF',   'facility', 'Regional Oncology Infusion Center','Facility',        83.0, 68, 0.0000, 'Los Angeles', 'West',      'Y', 'Infusion center with line-care safety protocols.', SYSTIMESTAMP);

INSERT INTO care_graph_entities (entity_id, entity_key, entity_type, display_name, clinical_domain, risk_score, volume_count, engagement_rate, city, region, is_verified, summary, created_at) VALUES (140,'GAP-48H-FOLLOWUP', 'care_gap', '48-Hour Follow-up Not Completed',       'Transitions',      95.0, 62, 0.0000, 'Boston',       'Northeast', 'Y', 'Post-discharge outreach missed inside the expected 48-hour window.', SYSTIMESTAMP);
INSERT INTO care_graph_entities (entity_id, entity_key, entity_type, display_name, clinical_domain, risk_score, volume_count, engagement_rate, city, region, is_verified, summary, created_at) VALUES (141,'GAP-MED-RECON',    'care_gap', 'Medication Reconciliation Open',        'Medication Safety',88.0, 57, 0.0000, 'Chicago',      'Midwest',   'Y', 'Medication list has not been reconciled after discharge.', SYSTIMESTAMP);
INSERT INTO care_graph_entities (entity_id, entity_key, entity_type, display_name, clinical_domain, risk_score, volume_count, engagement_rate, city, region, is_verified, summary, created_at) VALUES (142,'GAP-A1C-OVERDUE',  'care_gap', 'A1C Monitoring Overdue',                'Diabetes',         84.0, 74, 0.0000, 'Raleigh',      'Southeast', 'Y', 'Chronic-care monitoring interval exceeded.', SYSTIMESTAMP);
INSERT INTO care_graph_entities (entity_id, entity_key, entity_type, display_name, clinical_domain, risk_score, volume_count, engagement_rate, city, region, is_verified, summary, created_at) VALUES (143,'GAP-HOMEHLTH',     'care_gap', 'Home Health Start Delayed',             'Post-Acute Care',  90.0, 31, 0.0000, 'Phoenix',      'West',      'Y', 'Home health start of care delayed after discharge.', SYSTIMESTAMP);
INSERT INTO care_graph_entities (entity_id, entity_key, entity_type, display_name, clinical_domain, risk_score, volume_count, engagement_rate, city, region, is_verified, summary, created_at) VALUES (144,'GAP-READMIT-RISK', 'care_gap', '7-Day Readmission Risk',                'Transitions',      97.0, 43, 0.0000, 'Boston',       'Northeast', 'Y', 'Multi-factor readmission risk derived from encounter, diagnosis, medication, and follow-up signals.', SYSTIMESTAMP);
INSERT INTO care_graph_entities (entity_id, entity_key, entity_type, display_name, clinical_domain, risk_score, volume_count, engagement_rate, city, region, is_verified, summary, created_at) VALUES (145,'GAP-LINECARE',     'care_gap', 'Line-Care Dressing Check Due',          'Oncology Safety',  87.0, 18, 0.0000, 'Los Angeles', 'West',      'Y', 'Central-line safety task is due after oncology infusion.', SYSTIMESTAMP);

INSERT INTO care_graph_entities (entity_id, entity_key, entity_type, display_name, clinical_domain, risk_score, volume_count, engagement_rate, city, region, is_verified, summary, created_at) VALUES (160,'DEV-PICC-2207', 'device', 'PICC Line 2207',                         'Oncology Safety',  85.0, 1,  0.0000, 'Los Angeles', 'West',      'Y', 'Synthetic device vertex for line-care infection-risk traversal.', SYSTIMESTAMP);
INSERT INTO care_graph_entities (entity_id, entity_key, entity_type, display_name, clinical_domain, risk_score, volume_count, engagement_rate, city, region, is_verified, summary, created_at) VALUES (161,'LAB-LACTATE-44','lab_result', 'Elevated Lactate Result',              'Diagnostics',      91.0, 1,  0.0000, 'Boston',       'Northeast', 'Y', 'Synthetic lab-result vertex tied to sepsis risk.', SYSTIMESTAMP);

UPDATE care_graph_entities
SET clinical_label = CASE entity_type
      WHEN 'patient' THEN 'Patient Journey: ' || entity_key
      WHEN 'encounter' THEN 'Encounter: ' || display_name
      WHEN 'condition' THEN 'Condition: ' || display_name
      WHEN 'medication' THEN 'Medication: ' || display_name
      WHEN 'procedure' THEN 'Procedure: ' || display_name
      WHEN 'provider' THEN 'Provider: ' || display_name
      WHEN 'facility' THEN 'Facility: ' || display_name
      WHEN 'care_gap' THEN 'Care Gap: ' || display_name
      WHEN 'device' THEN 'Device: ' || display_name
      WHEN 'lab_result' THEN 'Lab Result: ' || display_name
      ELSE display_name
    END,
    description = summary;

MERGE INTO care_graph_entities e
USING (
  SELECT 'COND-SEPSIS' AS entity_key, 'Sepsis' AS display_name, 'Condition: Sepsis' AS clinical_label,
         'De-identified condition node for sepsis-related care pathways' AS description FROM dual
  UNION ALL SELECT 'GAP-READMIT-RISK', 'Readmission Risk', 'Care Gap: Readmission Risk',
         'Synthetic care gap node for readmission-risk pathways in the demo graph' FROM dual
  UNION ALL SELECT 'GAP-48H-FOLLOWUP', '48-Hour Follow-Up', 'Care Gap: 48-Hour Follow-Up',
         'Synthetic care gap node for post-discharge outreach within the expected 48-hour window' FROM dual
  UNION ALL SELECT 'PAT-1007', 'De-identified Patient 1007', 'Patient Journey: PAT-1007',
         'De-identified patient journey node for diabetes, chronic kidney disease, and pharmacy follow-up pathways' FROM dual
  UNION ALL SELECT 'ENC-IP-4412', 'Inpatient Encounter 4412', 'Encounter: Inpatient 4412',
         'Synthetic inpatient encounter node for sepsis admission and discharge planning pathways' FROM dual
  UNION ALL SELECT 'PRV-NURSE-CARE', 'Nurse Care Team', 'Provider: Nurse Care Team',
         'Fictional care coordination team node for follow-up and outreach ownership' FROM dual
  UNION ALL SELECT 'PROC-LACTATE', 'Lactate Procedure', 'Procedure: Lactate',
         'Synthetic procedure node for lactate testing in sepsis-related care pathways' FROM dual
  UNION ALL SELECT 'LAB-LACTATE-44', 'Lactate Lab Result', 'Lab Result: Lactate 44',
         'Synthetic lab-result node connected to lactate monitoring in the demo graph' FROM dual
  UNION ALL SELECT 'MED-PIPTAZO', 'Piperacillin/Tazobactam', 'Medication: Piperacillin/Tazobactam',
         'Synthetic medication node for broad-spectrum antibiotic therapy in sepsis-related care pathways' FROM dual
) m
ON (e.entity_key = m.entity_key)
WHEN MATCHED THEN UPDATE SET
  e.display_name = m.display_name,
  e.clinical_label = m.clinical_label,
  e.description = m.description;

MERGE INTO care_graph_edge_metadata m
USING (
  SELECT 'had_encounter' AS edge_type, 'Had Encounter' AS display_name, 'Clinical Events' AS category,
         'Connects a de-identified patient journey to an encounter in the care pathway graph.' AS description FROM dual
  UNION ALL SELECT 'diagnosed_with', 'Diagnosed With', 'Clinical Events',
         'Connects an encounter or patient journey to a diagnosis or condition node.' FROM dual
  UNION ALL SELECT 'ordered_procedure', 'Ordered Procedure', 'Clinical Events',
         'Connects an encounter to a diagnostic, procedural, or care-service action ordered during the pathway.' FROM dual
  UNION ALL SELECT 'lab_indicates', 'Lab Indicates', 'Clinical Events',
         'Connects a procedure or lab order to a lab-result signal used for demo pathway context.' FROM dual
  UNION ALL SELECT 'received_medication', 'Received Medication', 'Clinical Events',
         'Connects an encounter or patient journey to a medication used in the synthetic care pathway.' FROM dual
  UNION ALL SELECT 'treated_by', 'Treated By', 'Care Coordination',
         'Connects an encounter or patient journey to a provider or care team involved in care delivery.' FROM dual
  UNION ALL SELECT 'shares_provider', 'Shares Provider', 'Care Coordination',
         'Connects care entities that share a provider, care team, or coordination pattern.' FROM dual
  UNION ALL SELECT 'assigned_to', 'Assigned To', 'Care Coordination',
         'Connects a patient journey, gap, or service need to its assigned care owner.' FROM dual
  UNION ALL SELECT 'followed_by', 'Followed By', 'Care Coordination',
         'Connects sequential events such as an inpatient encounter followed by discharge or outreach.' FROM dual
  UNION ALL SELECT 'occurred_at', 'Occurred At', 'Care Coordination',
         'Connects an encounter or activity to the facility where it occurred in the demo graph.' FROM dual
  UNION ALL SELECT 'has_care_gap', 'Has Care Gap', 'Risk ' || CHR(38) || ' Gaps',
         'Connects a patient journey, encounter, procedure, or service to an open care-gap node.' FROM dual
  UNION ALL SELECT 'readmitted_after', 'Readmitted After', 'Risk ' || CHR(38) || ' Gaps',
         'Connects a readmission-risk pattern to a later or comparable return encounter in the demo graph.' FROM dual
  UNION ALL SELECT 'escalated_to', 'Escalated To', 'Risk ' || CHR(38) || ' Gaps',
         'Connects a care gap or risk signal to the team, facility, or partner responsible for follow-up.' FROM dual
  UNION ALL SELECT 'case_signal', 'Case Signal', 'Risk ' || CHR(38) || ' Gaps',
         'Connects a device, service, or event to a risk or quality signal in the synthetic pathway.' FROM dual
  UNION ALL SELECT 'uses_device', 'Uses Device', 'Risk ' || CHR(38) || ' Gaps',
         'Connects an encounter or patient journey to a device involved in the synthetic care pathway.' FROM dual
) src
ON (m.edge_type = src.edge_type)
WHEN MATCHED THEN UPDATE SET
  m.display_name = src.display_name,
  m.category = src.category,
  m.description = src.description
WHEN NOT MATCHED THEN INSERT (edge_type, display_name, category, description)
  VALUES (src.edge_type, src.display_name, src.category, src.description);

-- Edges: care-pathway traversal paths.
INSERT INTO care_graph_relationships VALUES (1, 1, 20, 'had_encounter',       0.970, 1,  'Patient had inpatient sepsis admission.', SYSTIMESTAMP - INTERVAL '6' DAY, SYSTIMESTAMP - INTERVAL '6' DAY);
INSERT INTO care_graph_relationships VALUES (2, 20, 40, 'diagnosed_with',     0.980, 1,  'Admission diagnosis: sepsis.', SYSTIMESTAMP - INTERVAL '6' DAY, SYSTIMESTAMP - INTERVAL '6' DAY);
INSERT INTO care_graph_relationships VALUES (3, 20, 60, 'received_medication',0.890, 2,  'Broad-spectrum antibiotic administered.', SYSTIMESTAMP - INTERVAL '6' DAY, SYSTIMESTAMP - INTERVAL '5' DAY);
INSERT INTO care_graph_relationships VALUES (4, 20, 80, 'ordered_procedure',  0.860, 2,  'Repeat lactate ordered per sepsis bundle.', SYSTIMESTAMP - INTERVAL '6' DAY, SYSTIMESTAMP - INTERVAL '5' DAY);
INSERT INTO care_graph_relationships VALUES (5, 80, 161,'lab_indicates',      0.910, 1,  'Lactate remained elevated.', SYSTIMESTAMP - INTERVAL '6' DAY, SYSTIMESTAMP - INTERVAL '5' DAY);
INSERT INTO care_graph_relationships VALUES (6, 20, 100,'treated_by',         0.870, 5,  'Hospitalist managed index stay.', SYSTIMESTAMP - INTERVAL '6' DAY, SYSTIMESTAMP - INTERVAL '3' DAY);
INSERT INTO care_graph_relationships VALUES (7, 20, 120,'occurred_at',        0.940, 1,  'Encounter occurred at NorthStar Medical Center ED.', SYSTIMESTAMP - INTERVAL '6' DAY, SYSTIMESTAMP - INTERVAL '6' DAY);
INSERT INTO care_graph_relationships VALUES (8, 20, 21, 'followed_by',        0.840, 1,  'Discharge transition followed inpatient stay.', SYSTIMESTAMP - INTERVAL '3' DAY, SYSTIMESTAMP - INTERVAL '3' DAY);
INSERT INTO care_graph_relationships VALUES (9, 21, 140,'has_care_gap',       0.950, 1,  '48-hour outreach not completed.', SYSTIMESTAMP - INTERVAL '2' DAY, SYSTIMESTAMP - INTERVAL '1' DAY);
INSERT INTO care_graph_relationships VALUES (10,21, 141,'has_care_gap',       0.880, 1,  'Medication reconciliation remains open.', SYSTIMESTAMP - INTERVAL '2' DAY, SYSTIMESTAMP - INTERVAL '1' DAY);
INSERT INTO care_graph_relationships VALUES (11,21, 144,'has_care_gap',       0.970, 1,  'Readmission model flagged high risk.', SYSTIMESTAMP - INTERVAL '1' DAY, SYSTIMESTAMP);
INSERT INTO care_graph_relationships VALUES (12,144,22, 'readmitted_after',   0.790, 1,  'High-risk pattern is similar to dyspnea ED return.', SYSTIMESTAMP - INTERVAL '1' DAY, SYSTIMESTAMP);
INSERT INTO care_graph_relationships VALUES (13,1, 100, 'assigned_to',        0.800, 4,  'Assigned transition owner.', SYSTIMESTAMP - INTERVAL '6' DAY, SYSTIMESTAMP);
INSERT INTO care_graph_relationships VALUES (14,1, 102, 'assigned_to',        0.910, 3,  'Care coordinator owns outreach gap.', SYSTIMESTAMP - INTERVAL '3' DAY, SYSTIMESTAMP);
INSERT INTO care_graph_relationships VALUES (15,20,140, 'has_care_gap',       0.900, 1,  'Index sepsis stay inherited missed 48-hour outreach risk.', SYSTIMESTAMP - INTERVAL '2' DAY, SYSTIMESTAMP);
INSERT INTO care_graph_relationships VALUES (16,20,144, 'has_care_gap',       0.960, 1,  'Index sepsis stay contributes directly to 7-day readmission risk.', SYSTIMESTAMP - INTERVAL '1' DAY, SYSTIMESTAMP);

INSERT INTO care_graph_relationships VALUES (20,2, 23, 'had_encounter',       0.910, 1,  'Diabetes follow-up visit.', SYSTIMESTAMP - INTERVAL '4' DAY, SYSTIMESTAMP - INTERVAL '4' DAY);
INSERT INTO care_graph_relationships VALUES (21,23,41, 'diagnosed_with',      0.920, 1,  'Type 2 diabetes diagnosis.', SYSTIMESTAMP - INTERVAL '4' DAY, SYSTIMESTAMP - INTERVAL '4' DAY);
INSERT INTO care_graph_relationships VALUES (22,23,81, 'ordered_procedure',   0.870, 1,  'A1C due.', SYSTIMESTAMP - INTERVAL '4' DAY, SYSTIMESTAMP - INTERVAL '4' DAY);
INSERT INTO care_graph_relationships VALUES (23,81,142,'has_care_gap',        0.940, 1,  'A1C monitoring overdue.', SYSTIMESTAMP - INTERVAL '4' DAY, SYSTIMESTAMP);
INSERT INTO care_graph_relationships VALUES (24,23,61, 'received_medication', 0.760, 1,  'Insulin titration requires current A1C.', SYSTIMESTAMP - INTERVAL '4' DAY, SYSTIMESTAMP);
INSERT INTO care_graph_relationships VALUES (25,2, 102,'assigned_to',         0.880, 3,  'Care coordinator assigned chronic-care gap.', SYSTIMESTAMP - INTERVAL '4' DAY, SYSTIMESTAMP);
INSERT INTO care_graph_relationships VALUES (26,23,121,'occurred_at',         0.810, 1,  'Visit occurred at CarePath Community Clinic.', SYSTIMESTAMP - INTERVAL '4' DAY, SYSTIMESTAMP);

INSERT INTO care_graph_relationships VALUES (30,3, 22, 'had_encounter',       0.900, 1,  'ED return for dyspnea.', SYSTIMESTAMP - INTERVAL '2' DAY, SYSTIMESTAMP - INTERVAL '2' DAY);
INSERT INTO care_graph_relationships VALUES (31,22,42, 'diagnosed_with',      0.910, 1,  'COPD exacerbation.', SYSTIMESTAMP - INTERVAL '2' DAY, SYSTIMESTAMP - INTERVAL '2' DAY);
INSERT INTO care_graph_relationships VALUES (32,22,62, 'received_medication', 0.770, 2,  'Maintenance inhaler reviewed.', SYSTIMESTAMP - INTERVAL '2' DAY, SYSTIMESTAMP);
INSERT INTO care_graph_relationships VALUES (33,22,101,'treated_by',          0.820, 2,  'Pulmonology follow-up required.', SYSTIMESTAMP - INTERVAL '2' DAY, SYSTIMESTAMP);
INSERT INTO care_graph_relationships VALUES (34,22,140,'has_care_gap',        0.860, 1,  '48-hour follow-up missed after ED return.', SYSTIMESTAMP - INTERVAL '1' DAY, SYSTIMESTAMP);
INSERT INTO care_graph_relationships VALUES (35,3, 101,'assigned_to',         0.790, 2,  'Pulmonary follow-up owner.', SYSTIMESTAMP - INTERVAL '2' DAY, SYSTIMESTAMP);

INSERT INTO care_graph_relationships VALUES (40,4, 26, 'had_encounter',       0.780, 1,  'CHF transition call.', SYSTIMESTAMP - INTERVAL '5' DAY, SYSTIMESTAMP - INTERVAL '5' DAY);
INSERT INTO care_graph_relationships VALUES (41,26,43, 'diagnosed_with',      0.830, 1,  'CHF follow-up.', SYSTIMESTAMP - INTERVAL '5' DAY, SYSTIMESTAMP);
INSERT INTO care_graph_relationships VALUES (42,26,44, 'diagnosed_with',      0.790, 1,  'CKD comorbidity.', SYSTIMESTAMP - INTERVAL '5' DAY, SYSTIMESTAMP);
INSERT INTO care_graph_relationships VALUES (43,26,63, 'received_medication', 0.800, 2,  'Loop diuretic review required.', SYSTIMESTAMP - INTERVAL '5' DAY, SYSTIMESTAMP);
INSERT INTO care_graph_relationships VALUES (44,26,141,'has_care_gap',        0.870, 1,  'Medication reconciliation still open.', SYSTIMESTAMP - INTERVAL '2' DAY, SYSTIMESTAMP);
INSERT INTO care_graph_relationships VALUES (45,4, 103,'assigned_to',         0.860, 2,  'Clinical pharmacy assigned medication review.', SYSTIMESTAMP - INTERVAL '5' DAY, SYSTIMESTAMP);

INSERT INTO care_graph_relationships VALUES (50,5, 24, 'had_encounter',       0.740, 1,  'Hip surgery admission.', SYSTIMESTAMP - INTERVAL '7' DAY, SYSTIMESTAMP - INTERVAL '7' DAY);
INSERT INTO care_graph_relationships VALUES (51,24,46, 'diagnosed_with',      0.760, 1,  'Hip fracture recovery.', SYSTIMESTAMP - INTERVAL '7' DAY, SYSTIMESTAMP);
INSERT INTO care_graph_relationships VALUES (52,24,64, 'received_medication', 0.650, 1,  'Anticoagulation restart plan.', SYSTIMESTAMP - INTERVAL '7' DAY, SYSTIMESTAMP);
INSERT INTO care_graph_relationships VALUES (53,24,82, 'ordered_procedure',   0.830, 1,  'Home health start of care ordered.', SYSTIMESTAMP - INTERVAL '6' DAY, SYSTIMESTAMP);
INSERT INTO care_graph_relationships VALUES (54,82,143,'has_care_gap',        0.930, 1,  'Home health start delayed.', SYSTIMESTAMP - INTERVAL '4' DAY, SYSTIMESTAMP);
INSERT INTO care_graph_relationships VALUES (55,24,122,'occurred_at',         0.780, 1,  'Post-acute referral to rehab network.', SYSTIMESTAMP - INTERVAL '6' DAY, SYSTIMESTAMP);
INSERT INTO care_graph_relationships VALUES (56,5, 102,'assigned_to',         0.720, 1,  'Care coordination escalated post-acute gap.', SYSTIMESTAMP - INTERVAL '4' DAY, SYSTIMESTAMP);

INSERT INTO care_graph_relationships VALUES (60,6, 25, 'had_encounter',       0.860, 1,  'Oncology infusion visit.', SYSTIMESTAMP - INTERVAL '3' DAY, SYSTIMESTAMP - INTERVAL '3' DAY);
INSERT INTO care_graph_relationships VALUES (61,25,160,'uses_device',         0.900, 1,  'PICC line active during infusion.', SYSTIMESTAMP - INTERVAL '3' DAY, SYSTIMESTAMP);
INSERT INTO care_graph_relationships VALUES (62,160,45,'case_signal',         0.920, 1,  'Central-line device raises infection surveillance risk.', SYSTIMESTAMP - INTERVAL '3' DAY, SYSTIMESTAMP);
INSERT INTO care_graph_relationships VALUES (63,25,83, 'ordered_procedure',   0.850, 1,  'Line dressing check due.', SYSTIMESTAMP - INTERVAL '3' DAY, SYSTIMESTAMP);
INSERT INTO care_graph_relationships VALUES (64,83,145,'has_care_gap',        0.870, 1,  'Line-care dressing check open.', SYSTIMESTAMP - INTERVAL '2' DAY, SYSTIMESTAMP);
INSERT INTO care_graph_relationships VALUES (65,25,104,'treated_by',          0.880, 2,  'Oncology navigator assigned.', SYSTIMESTAMP - INTERVAL '3' DAY, SYSTIMESTAMP);
INSERT INTO care_graph_relationships VALUES (66,25,123,'occurred_at',         0.820, 1,  'Encounter occurred at oncology infusion center.', SYSTIMESTAMP - INTERVAL '3' DAY, SYSTIMESTAMP);
INSERT INTO care_graph_relationships VALUES (67,6, 104,'assigned_to',         0.830, 2,  'Navigator owns line-care follow-up.', SYSTIMESTAMP - INTERVAL '3' DAY, SYSTIMESTAMP);

INSERT INTO care_graph_relationships VALUES (70,7, 23, 'had_encounter',       0.720, 1,  'Complex diabetes visit shares chronic-care pattern.', SYSTIMESTAMP - INTERVAL '8' DAY, SYSTIMESTAMP - INTERVAL '8' DAY);
INSERT INTO care_graph_relationships VALUES (71,7, 41, 'diagnosed_with',      0.810, 1,  'Diabetes diagnosis.', SYSTIMESTAMP - INTERVAL '8' DAY, SYSTIMESTAMP);
INSERT INTO care_graph_relationships VALUES (72,7, 44, 'diagnosed_with',      0.790, 1,  'CKD comorbidity.', SYSTIMESTAMP - INTERVAL '8' DAY, SYSTIMESTAMP);
INSERT INTO care_graph_relationships VALUES (73,7, 61, 'received_medication', 0.760, 1,  'Insulin plan affected by CKD.', SYSTIMESTAMP - INTERVAL '8' DAY, SYSTIMESTAMP);
INSERT INTO care_graph_relationships VALUES (74,7, 102,'assigned_to',         0.840, 2,  'Care coordinator assigned chronic-care outreach.', SYSTIMESTAMP - INTERVAL '8' DAY, SYSTIMESTAMP);
INSERT INTO care_graph_relationships VALUES (75,7, 103,'assigned_to',         0.760, 1,  'Pharmacy review requested for insulin and CKD.', SYSTIMESTAMP - INTERVAL '8' DAY, SYSTIMESTAMP);

INSERT INTO care_graph_relationships VALUES (80,8, 120,'occurred_at',         0.620, 1,  'Recent ED utilization at NorthStar.', SYSTIMESTAMP - INTERVAL '1' DAY, SYSTIMESTAMP);
INSERT INTO care_graph_relationships VALUES (81,8, 102,'assigned_to',         0.700, 1,  'Care navigation task assigned.', SYSTIMESTAMP - INTERVAL '1' DAY, SYSTIMESTAMP);
INSERT INTO care_graph_relationships VALUES (82,8, 140,'has_care_gap',        0.680, 1,  'ED return watch requires timely outreach.', SYSTIMESTAMP - INTERVAL '1' DAY, SYSTIMESTAMP);

-- Shared context edges make graph traversal clinically meaningful.
INSERT INTO care_graph_relationships VALUES (90,140,102,'escalated_to',       0.910, 6,  'Follow-up gaps escalate to care coordination team.', SYSTIMESTAMP - INTERVAL '2' DAY, SYSTIMESTAMP);
INSERT INTO care_graph_relationships VALUES (91,141,103,'escalated_to',       0.860, 4,  'Medication gaps escalate to pharmacy review.', SYSTIMESTAMP - INTERVAL '2' DAY, SYSTIMESTAMP);
INSERT INTO care_graph_relationships VALUES (92,143,122,'escalated_to',       0.830, 3,  'Post-acute gap escalated to rehab partner.', SYSTIMESTAMP - INTERVAL '3' DAY, SYSTIMESTAMP);
INSERT INTO care_graph_relationships VALUES (93,145,104,'escalated_to',       0.870, 2,  'Line-care gaps escalate to oncology navigator.', SYSTIMESTAMP - INTERVAL '2' DAY, SYSTIMESTAMP);

COMMIT;

-- Case vertices and case-to-entity evidence edges.
INSERT INTO care_pathway_cases VALUES (1, 'CASE-SEPSIS-READMIT', 'Sepsis readmission prevention', 'critical', 'open', 1, 97.2, 'Patient 1001 connects to sepsis admission, elevated lactate, missed follow-up, open medication reconciliation, and 7-day readmission risk.', SYSTIMESTAMP);
INSERT INTO care_pathway_cases VALUES (2, 'CASE-DIABETES-GAP',   'Diabetes care-gap closure',     'high',     'open', 2, 84.5, 'Patients 1002 and 1007 share diabetes, overdue A1C, CKD-sensitive medication review, and care-coordinator ownership.', SYSTIMESTAMP);
INSERT INTO care_pathway_cases VALUES (3, 'CASE-POSTACUTE-DELAY','Post-acute delay mitigation',   'high',     'open', 5, 90.1, 'Patient 1005 connects surgery, rehab, home-health start delay, and care coordination escalation.', SYSTIMESTAMP);
INSERT INTO care_pathway_cases VALUES (4, 'CASE-LINECARE-RISK',  'Oncology line-care safety',     'high',     'monitoring', 6, 88.7, 'Patient 1006 connects oncology infusion, PICC line, central-line infection risk, and due dressing check.', SYSTIMESTAMP);

INSERT INTO care_case_entities VALUES (1, 1, 1,   'anchor_patient', 97.0, 'Patient anchors sepsis readmission case.');
INSERT INTO care_case_entities VALUES (2, 1, 20,  'index_encounter',94.0, 'Sepsis admission.');
INSERT INTO care_case_entities VALUES (3, 1, 40,  'diagnosis',      98.0, 'Sepsis diagnosis.');
INSERT INTO care_case_entities VALUES (4, 1, 140, 'care_gap',       95.0, '48-hour follow-up gap.');
INSERT INTO care_case_entities VALUES (5, 1, 141, 'care_gap',       88.0, 'Medication reconciliation gap.');
INSERT INTO care_case_entities VALUES (6, 1, 144, 'risk_signal',    97.0, 'Readmission risk vertex.');
INSERT INTO care_case_entities VALUES (7, 1, 102, 'owner',          91.0, 'Care coordinator owns outreach.');

INSERT INTO care_case_entities VALUES (10, 2, 2,   'anchor_patient', 84.0, 'Patient with chronic-care gap.');
INSERT INTO care_case_entities VALUES (11, 2, 7,   'related_patient',82.0, 'Related patient shares diabetes care-team pattern.');
INSERT INTO care_case_entities VALUES (12, 2, 41,  'diagnosis',      83.0, 'Diabetes diagnosis.');
INSERT INTO care_case_entities VALUES (13, 2, 81,  'procedure',      80.0, 'A1C lab overdue.');
INSERT INTO care_case_entities VALUES (14, 2, 142, 'care_gap',       84.0, 'A1C monitoring gap.');
INSERT INTO care_case_entities VALUES (15, 2, 102, 'owner',          91.0, 'Care coordination team.');
INSERT INTO care_case_entities VALUES (16, 2, 103, 'owner',          76.0, 'Pharmacy support for CKD-sensitive medication plan.');

INSERT INTO care_case_entities VALUES (20, 3, 5,   'anchor_patient', 90.0, 'Post-acute delay patient.');
INSERT INTO care_case_entities VALUES (21, 3, 24,  'index_encounter',76.0, 'Hip surgery admission.');
INSERT INTO care_case_entities VALUES (22, 3, 82,  'procedure',      88.0, 'Home health start of care.');
INSERT INTO care_case_entities VALUES (23, 3, 143, 'care_gap',       90.0, 'Home health start delayed.');
INSERT INTO care_case_entities VALUES (24, 3, 122, 'facility',       70.0, 'Rehab network partner.');
INSERT INTO care_case_entities VALUES (25, 3, 102, 'owner',          72.0, 'Care coordination escalation.');

INSERT INTO care_case_entities VALUES (30, 4, 6,   'anchor_patient', 88.0, 'Oncology patient.');
INSERT INTO care_case_entities VALUES (31, 4, 25,  'index_encounter',86.0, 'Oncology infusion visit.');
INSERT INTO care_case_entities VALUES (32, 4, 160, 'device',         85.0, 'PICC line.');
INSERT INTO care_case_entities VALUES (33, 4, 45,  'diagnosis',      92.0, 'Central-line infection risk.');
INSERT INTO care_case_entities VALUES (34, 4, 145, 'care_gap',       87.0, 'Line-care dressing due.');
INSERT INTO care_case_entities VALUES (35, 4, 104, 'owner',          86.0, 'Oncology navigator.');

COMMIT;

DECLARE
  v_entities NUMBER;
  v_edges    NUMBER;
  v_cases    NUMBER;
BEGIN
  SELECT COUNT(*) INTO v_entities FROM care_graph_entities;
  SELECT COUNT(*) INTO v_edges    FROM care_graph_relationships;
  SELECT COUNT(*) INTO v_cases    FROM care_pathway_cases;
  DBMS_OUTPUT.PUT_LINE('Care graph loaded: ' || v_entities || ' entities, ' || v_edges || ' relationships, ' || v_cases || ' cases.');
END;
/
