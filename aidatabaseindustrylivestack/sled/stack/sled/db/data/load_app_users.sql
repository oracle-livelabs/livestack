/*
 * load_app_users.sql
 * State and Local Government demo users with different roles for RBAC/VPD demonstration
 */

PROMPT Loading app users...

-- Password hash is bcrypt of 'demo123' - in production, use proper hashing
INSERT INTO app_users (username, password_hash, full_name, email, role, access_scope, region) VALUES ('admin_jess', '$2b$10$demohashadminjess000000000000000000000000000000', 'Jessica Chen', 'jess.chen@state-local-government.demo', 'admin', 'GLOBAL', NULL);
INSERT INTO app_users (username, password_hash, full_name, email, role, access_scope, region) VALUES ('analyst_raj', '$2b$10$demohashanalystraj000000000000000000000000000000', 'Raj Patel', 'raj.patel@state-local-government.demo', 'analyst', 'GLOBAL', NULL);
INSERT INTO app_users (username, password_hash, full_name, email, role, access_scope, region) VALUES ('fm_west_maria', '$2b$10$demohashfmwestmaria00000000000000000000000000000', 'Maria Santos', 'maria.santos@state-local-government.demo', 'fulfillment_mgr', 'REGIONAL', 'Western Slope');
INSERT INTO app_users (username, password_hash, full_name, email, role, access_scope, region) VALUES ('fm_east_dave', '$2b$10$demohashfmeastdave000000000000000000000000000000', 'Dave Johnson', 'dave.johnson@state-local-government.demo', 'fulfillment_mgr', 'REGIONAL', 'Front Range');
INSERT INTO app_users (username, password_hash, full_name, email, role, access_scope, region) VALUES ('fm_south_keisha', '$2b$10$demohashfmsouthkeisha000000000000000000000000000', 'Keisha Brown', 'keisha.brown@state-local-government.demo', 'fulfillment_mgr', 'REGIONAL', 'Southern Colorado');
INSERT INTO app_users (username, password_hash, full_name, email, role, access_scope, region) VALUES ('merch_tom', '$2b$10$demohashmertchtom00000000000000000000000000000000', 'Tom Williams', 'tom.williams@state-local-government.demo', 'merchandiser', 'RESTRICTED', NULL);
INSERT INTO app_users (username, password_hash, full_name, email, role, access_scope, region) VALUES ('viewer_sam', '$2b$10$demohashviewersam00000000000000000000000000000000', 'Sam Taylor', 'sam.taylor@state-local-government.demo', 'viewer', 'RESTRICTED', NULL);
INSERT INTO app_users (username, password_hash, full_name, email, role, access_scope, region, is_active) VALUES ('inactive_audit', '$2b$10$inactiveidentitycannotlogin000000000000000000000000000', 'Inactive Security Fixture', 'inactive.audit@state-local-government.demo', 'viewer', 'RESTRICTED', NULL, 0);

COMMIT;
PROMPT App users loaded: 8 (two global, three Colorado regional, two restricted, one inactive fixture)
