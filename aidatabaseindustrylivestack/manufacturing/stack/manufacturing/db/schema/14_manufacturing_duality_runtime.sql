/*
 * 14_manufacturing_duality_runtime.sql
 * Revalidate the read-only JSON Relational Duality Views after VPD policies
 * are installed. DBMS_RLS policy changes invalidate dependent views, so this
 * is a canonical initial-provisioning phase rather than a migration or patch.
 */

WHENEVER OSERROR EXIT FAILURE ROLLBACK
WHENEVER SQLERROR EXIT SQL.SQLCODE ROLLBACK
SET SERVEROUTPUT ON
SET DEFINE OFF

ALTER VIEW manufacturing_work_order_documents_dv COMPILE;
ALTER VIEW products_inventory_dv COMPILE;
ALTER VIEW manufactured_part_capacity_dv COMPILE;
ALTER VIEW manufacturing_plant_capacity_dv COMPILE;

DECLARE
    v_valid_read_only_views PLS_INTEGER;
BEGIN
    SELECT COUNT(*)
    INTO v_valid_read_only_views
    FROM user_json_duality_views
    WHERE view_name IN (
        'MANUFACTURING_WORK_ORDER_DOCUMENTS_DV',
        'PRODUCTS_INVENTORY_DV',
        'MANUFACTURED_PART_CAPACITY_DV',
        'MANUFACTURING_PLANT_CAPACITY_DV'
    )
      AND status = 'VALID'
      AND read_only = TRUE
      AND allow_insert = FALSE
      AND allow_update = FALSE
      AND allow_delete = FALSE;

    IF v_valid_read_only_views <> 4 THEN
        RAISE_APPLICATION_ERROR(
            -20074,
            'Four VPD-compatible read-only JSON Relational Duality Views are required after VPD installation'
        );
    END IF;
END;
/

PROMPT Manufacturing JSON Relational Duality Views revalidated after VPD installation.
