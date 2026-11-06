-- Run in a fresh PG connection after bootstrap (local Free or ADB).
WHENEVER SQLERROR EXIT SQL.SQLCODE ROLLBACK
SET SERVEROUTPUT ON
DECLARE
    n NUMBER;
    PROCEDURE check_centers(p_user VARCHAR2, p_expected NUMBER) IS
    BEGIN
        sc_security_ctx.set_user_context(p_user);
        -- Re-execute SQL as the application does after setting session context;
        -- avoid a PL/SQL static cursor parsed before that context was changed.
        EXECUTE IMMEDIATE 'SELECT COUNT(*) FROM fulfillment_centers' INTO n;
        IF n <> p_expected THEN
            RAISE_APPLICATION_ERROR(-20010, p_user || ': expected ' || p_expected || ', got ' || n);
        END IF;
    END;
BEGIN
    SELECT COUNT(*) INTO n FROM fulfillment_centers;
    IF n <> 0 THEN
        RAISE_APPLICATION_ERROR(-20011, 'Fresh session without context must see no centers.');
    END IF;
    check_centers('admin_jess', 50);
    check_centers('fm_west_maria', 12);
    check_centers('fm_east_dave', 4);
    check_centers('fm_south_keisha', 18);
    check_centers('unknown_bootstrap_test_user', 0);
    check_centers('admin_jess', 50);
    SELECT COUNT(*) INTO n FROM orders;
    IF n <> 5000 THEN RAISE_APPLICATION_ERROR(-20012, 'Expected 5000 seeded orders.'); END IF;
    SELECT COUNT(*) INTO n FROM user_constraints
    WHERE constraint_type = 'R' AND (status <> 'ENABLED' OR validated <> 'VALIDATED');
    IF n <> 0 THEN RAISE_APPLICATION_ERROR(-20013, 'Seed has disabled/unvalidated foreign keys.'); END IF;
    DBMS_OUTPUT.PUT_LINE('PASS: seed data, foreign keys, no-context denial and regional VPD.');
END;
/
