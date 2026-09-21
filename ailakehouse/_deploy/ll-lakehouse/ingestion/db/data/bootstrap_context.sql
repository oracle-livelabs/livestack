-- Bootstrap connections are separate from HTTP sessions. Keep VPD enabled,
-- but explicitly select the seeded administrator for maintenance/verification.
BEGIN
    sc_security_ctx.set_user_context('admin_jess');
    IF NVL(sc_security_ctx.get_role(), 'unknown') <> 'admin' THEN
        RAISE_APPLICATION_ERROR(-20002, 'Bootstrap requires the active admin_jess seed user.');
    END IF;
END;
/
