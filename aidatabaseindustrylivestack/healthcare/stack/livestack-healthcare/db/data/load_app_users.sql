/*
 * load_app_users.sql
 * Demo app users with different roles for RBAC demonstration
 */

PROMPT Loading app users...

-- Password hash is bcrypt of 'demo123' — in production, use proper hashing
INSERT INTO app_users (username, password_hash, full_name, email, role, region) VALUES ('admin_jess', '$2b$10$demohashadminjess000000000000000000000000000000', 'Jessica Chen', 'jess.chen@healthcare.demo', 'admin', NULL);
INSERT INTO app_users (username, password_hash, full_name, email, role, region) VALUES ('analyst_raj', '$2b$10$demohashanalystraj000000000000000000000000000000', 'Raj Patel', 'raj.patel@healthcare.demo', 'analyst', NULL);
INSERT INTO app_users (username, password_hash, full_name, email, role, region) VALUES ('fm_west_maria', '$2b$10$demohashfmwestmaria00000000000000000000000000000', 'Maria Santos', 'maria.santos@healthcare.demo', 'fulfillment_mgr', 'California');
INSERT INTO app_users (username, password_hash, full_name, email, role, region) VALUES ('fm_east_dave', '$2b$10$demohashfmeastdave000000000000000000000000000000', 'Dave Johnson', 'dave.johnson@healthcare.demo', 'fulfillment_mgr', 'New Jersey');
INSERT INTO app_users (username, password_hash, full_name, email, role, region) VALUES ('fm_south_keisha', '$2b$10$demohashfmsouthkeisha000000000000000000000000000', 'Keisha Brown', 'keisha.brown@healthcare.demo', 'fulfillment_mgr', 'Georgia');
INSERT INTO app_users (username, password_hash, full_name, email, role, region) VALUES ('care_tom', '$2b$10$demohashmertchtom00000000000000000000000000000000', 'Tom Garcia', 'tom.williams@healthcare.demo', 'care_coordinator', NULL);
INSERT INTO app_users (username, password_hash, full_name, email, role, region) VALUES ('viewer_sam', '$2b$10$demohashviewersam00000000000000000000000000000000', 'Sam Taylor', 'sam.taylor@healthcare.demo', 'viewer', NULL);

COMMIT;
PROMPT App users loaded: 7 (admin, analyst, 3x fulfillment_mgr, care_coordinator, viewer)
