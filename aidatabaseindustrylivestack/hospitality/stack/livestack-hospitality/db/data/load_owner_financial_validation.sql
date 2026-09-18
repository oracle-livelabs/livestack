/* Seed the deterministic, synthetic Scene 10 owner-close dataset. */
SET SERVEROUTPUT ON
SET DEFINE OFF

BEGIN
  owner_fin_validation_pkg.refresh_demo_data(p_force => 0);
END;
/

COMMIT;

SELECT COUNT(*) AS financial_submissions FROM hotel_financial_submissions;
SELECT COUNT(*) AS current_exceptions FROM hotel_financial_exception_queue_v;
