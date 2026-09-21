/* Hydrate independent Native JSON evidence and expose database-derived proof. */
WHENEVER OSERROR EXIT FAILURE ROLLBACK
WHENEVER SQLERROR EXIT SQL.SQLCODE ROLLBACK
SET DEFINE OFF

MERGE INTO event_stream target
USING (
  SELECT 'retail_dataset_ready' event_type,
         'retail_bootstrap' event_source,
         JSON_OBJECT(
           'domain' VALUE 'sporting_goods_retail',
           'event' VALUE 'dataset_ready',
           'feature' VALUE 'native_json',
           'generationId' VALUE 'bootstrap-v1',
           'datasetFingerprint' VALUE
             RAWTOHEX(STANDARD_HASH('bootstrap-v1', 'SHA256'))
           RETURNING JSON
         ) event_data,
         'retail-native-json-bootstrap' correlation_id
  FROM dual
) source
ON (target.correlation_id = source.correlation_id)
WHEN MATCHED THEN UPDATE SET
  target.event_type = source.event_type,
  target.event_source = source.event_source,
  target.event_data = source.event_data,
  target.processed = 0
WHEN NOT MATCHED THEN INSERT (
  event_type, event_source, event_data, correlation_id, processed
) VALUES (
  source.event_type, source.event_source, source.event_data,
  source.correlation_id, 0
);

CREATE OR REPLACE VIEW retail_native_json_evidence_v AS
SELECT event_id,
       event_type,
       JSON_VALUE(event_data, '$.domain') domain_name,
       JSON_VALUE(event_data, '$.feature') feature_name,
       JSON_VALUE(event_data, '$.generationId') generation_id,
       JSON_VALUE(event_data, '$.jobId') job_id,
       JSON_VALUE(event_data, '$.datasetFingerprint') dataset_fingerprint,
       CASE WHEN JSON_EXISTS(event_data, '$.event') THEN 'YES' ELSE 'NO' END has_event,
       correlation_id,
       created_at
FROM event_stream
WHERE JSON_VALUE(event_data, '$.feature') = 'native_json';

DECLARE v_count PLS_INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM retail_native_json_evidence_v
  WHERE feature_name = 'native_json' AND has_event = 'YES';
  IF v_count = 0 THEN
    RAISE_APPLICATION_ERROR(-20440, 'Retail Native JSON evidence is empty');
  END IF;
END;
/
COMMIT;
