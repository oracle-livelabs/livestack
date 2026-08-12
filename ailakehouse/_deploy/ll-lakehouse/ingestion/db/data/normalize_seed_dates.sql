/*
 * normalize_seed_dates.sql
 *
 * Keep the deterministic generated seed set useful for fresh deployments in
 * future years. load_gold_seed.sql is intentionally static, so this step shifts
 * the loaded business timelines to the deployment date.
 */

SET SERVEROUTPUT ON

DECLARE
  v_shift_days NUMBER;
BEGIN
  SELECT TRUNC(SYSDATE) - TRUNC(CAST(MAX(created_at) AS DATE))
    INTO v_shift_days
    FROM orders;

  IF v_shift_days IS NOT NULL THEN
    UPDATE orders
       SET created_at = created_at + NUMTODSINTERVAL(v_shift_days, 'DAY'),
           updated_at = updated_at + NUMTODSINTERVAL(v_shift_days, 'DAY'),
           estimated_delivery = estimated_delivery + v_shift_days,
           actual_delivery = CASE
             WHEN actual_delivery IS NULL THEN NULL
             ELSE actual_delivery + v_shift_days
           END;

    UPDATE shipments
       SET routed_at = CASE
             WHEN routed_at IS NULL THEN NULL
             ELSE routed_at + NUMTODSINTERVAL(v_shift_days, 'DAY')
           END,
           completed_at = CASE
             WHEN completed_at IS NULL THEN NULL
             ELSE completed_at + NUMTODSINTERVAL(v_shift_days, 'DAY')
           END,
           created_at = created_at + NUMTODSINTERVAL(v_shift_days, 'DAY');

    DBMS_OUTPUT.PUT_LINE('Shifted order and shipment dates by ' || v_shift_days || ' days.');
  END IF;
END;
/

DECLARE
  v_shift_days NUMBER;
BEGIN
  SELECT TRUNC(SYSDATE) - TRUNC(CAST(MAX(posted_at) AS DATE))
    INTO v_shift_days
    FROM social_posts;

  IF v_shift_days IS NOT NULL THEN
    UPDATE social_posts
       SET posted_at = posted_at + NUMTODSINTERVAL(v_shift_days, 'DAY'),
           processed_at = processed_at + NUMTODSINTERVAL(v_shift_days, 'DAY');

    DBMS_OUTPUT.PUT_LINE('Shifted demand-signal dates by ' || v_shift_days || ' days.');
  END IF;
END;
/

DECLARE
  v_shift_days NUMBER;
BEGIN
  SELECT TRUNC(SYSDATE) - MIN(forecast_date)
    INTO v_shift_days
    FROM demand_forecasts;

  IF v_shift_days IS NOT NULL THEN
    UPDATE demand_forecasts
       SET forecast_date = forecast_date + v_shift_days;

    DBMS_OUTPUT.PUT_LINE('Shifted demand forecast dates by ' || v_shift_days || ' days.');
  END IF;
END;
/

DECLARE
  v_shift_days NUMBER;
BEGIN
  SELECT TRUNC(SYSDATE) - TRUNC(MAX(last_restock_date))
    INTO v_shift_days
    FROM inventory
   WHERE last_restock_date IS NOT NULL;

  IF v_shift_days IS NOT NULL THEN
    UPDATE inventory
       SET last_restock_date = last_restock_date + v_shift_days
     WHERE last_restock_date IS NOT NULL;

    DBMS_OUTPUT.PUT_LINE('Shifted inventory restock dates by ' || v_shift_days || ' days.');
  END IF;
END;
/

DECLARE
  v_shift_days NUMBER;
BEGIN
  SELECT TRUNC(SYSDATE) - TRUNC(MAX(launch_date))
    INTO v_shift_days
    FROM products
   WHERE launch_date IS NOT NULL;

  IF v_shift_days IS NOT NULL THEN
    UPDATE products
       SET launch_date = launch_date + v_shift_days
     WHERE launch_date IS NOT NULL;

    DBMS_OUTPUT.PUT_LINE('Shifted product launch dates by ' || v_shift_days || ' days.');
  END IF;
END;
/

COMMIT;
