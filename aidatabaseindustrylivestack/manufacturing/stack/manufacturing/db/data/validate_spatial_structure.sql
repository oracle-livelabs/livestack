/* Validate Oracle Spatial catalog state after point, route, and zone DML. */

SET SERVEROUTPUT ON

DECLARE
    v_spatial_index_count PLS_INTEGER;
    v_constraint_count    PLS_INTEGER;
BEGIN
    SELECT COUNT(*)
    INTO v_spatial_index_count
    FROM user_indexes index_state
    JOIN user_ind_columns index_column
      ON index_column.index_name = index_state.index_name
     AND index_column.table_name = index_state.table_name
     AND index_column.column_position = 1
    WHERE index_state.ityp_owner = 'MDSYS'
      AND index_state.ityp_name = 'SPATIAL_INDEX_V2'
      AND index_state.status = 'VALID'
      AND index_state.domidx_status = 'VALID'
      AND index_state.domidx_opstatus = 'VALID'
      AND (
           (index_state.index_name = 'IDX_FC_SPATIAL'
            AND index_state.table_name = 'FULFILLMENT_CENTERS'
            AND index_column.column_name = 'LOCATION')
        OR (index_state.index_name = 'IDX_CUST_SPATIAL'
            AND index_state.table_name = 'CUSTOMERS'
            AND index_column.column_name = 'LOCATION')
        OR (index_state.index_name = 'IDX_ZONES_BOUNDARY'
            AND index_state.table_name = 'FULFILLMENT_ZONES'
            AND index_column.column_name = 'ZONE_BOUNDARY')
      );

    SELECT COUNT(*)
    INTO v_constraint_count
    FROM user_constraints constraint_state
    WHERE constraint_state.table_name = 'FULFILLMENT_ZONES'
      AND constraint_state.constraint_name = 'UK_FULFILLMENT_ZONE_TIER'
      AND constraint_state.constraint_type = 'U'
      AND constraint_state.status = 'ENABLED'
      AND constraint_state.validated = 'VALIDATED';

    IF v_spatial_index_count <> 3 OR v_constraint_count <> 1 THEN
        RAISE_APPLICATION_ERROR(
            -20091,
            'Manufacturing Spatial catalog validation requires three valid indexes and one zone-tier constraint'
        );
    END IF;

    DBMS_OUTPUT.PUT_LINE('Manufacturing Spatial catalog state verified.');
END;
/
