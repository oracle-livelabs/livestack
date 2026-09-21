/*
 * load_app_users.sql
 * Demo app users with different roles for RBAC demonstration
 */

PROMPT Loading app users...

-- Password hash is bcrypt of 'demo123' — in production, use proper hashing
INSERT INTO app_users (username, password_hash, full_name, email, role, region) VALUES ('admin_ava', '$2b$10$demohashadminjess000000000000000000000000000000', 'Ava Chen', 'ava.chen@harborstone-international.demo', 'admin', NULL);
INSERT INTO app_users (username, password_hash, full_name, email, role, region) VALUES ('rev_raj', '$2b$10$demohashanalystraj000000000000000000000000000000', 'Raj Patel', 'raj.patel@harborstone-international.demo', 'analyst', NULL);
INSERT INTO app_users (username, password_hash, full_name, email, role, region) VALUES ('ops_west_maria', '$2b$10$demohashfmwestmaria00000000000000000000000000000', 'Maria Santos', 'maria.santos@harborstone-international.demo', 'fulfillment_mgr', 'California');
INSERT INTO app_users (username, password_hash, full_name, email, role, region) VALUES ('ops_east_dave', '$2b$10$demohashfmeastdave000000000000000000000000000000', 'Dave Johnson', 'dave.johnson@harborstone-international.demo', 'fulfillment_mgr', 'New Jersey');
INSERT INTO app_users (username, password_hash, full_name, email, role, region) VALUES ('ops_south_keisha', '$2b$10$demohashfmsouthkeisha000000000000000000000000000', 'Keisha Brown', 'keisha.brown@harborstone-international.demo', 'fulfillment_mgr', 'Georgia');
INSERT INTO app_users (username, password_hash, full_name, email, role, region) VALUES ('guestexp_tom', '$2b$10$demohashmertchtom00000000000000000000000000000000', 'Tom Williams', 'tom.williams@harborstone-international.demo', 'merchandiser', NULL);
INSERT INTO app_users (username, password_hash, full_name, email, role, region) VALUES ('corp_sam', '$2b$10$demohashviewersam00000000000000000000000000000000', 'Sam Taylor', 'sam.taylor@harborstone-international.demo', 'viewer', NULL);

COMMIT;
PROMPT App users loaded: 7 (admin, revenue manager, 3x operations manager, guest experience manager, corporate analyst)
