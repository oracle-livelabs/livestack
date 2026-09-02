/*
 * load_fraud_graph.sql
 * Deterministic fraud graph seed data for account-takeover, mule, card-testing,
 * and synthetic-identity investigation demos.
 */

SET SERVEROUTPUT ON
PROMPT Loading fraud graph demo data...

DELETE FROM fraud_case_entities;
DELETE FROM fraud_relationships;
DELETE FROM fraud_cases;
DELETE FROM fraud_entities;
COMMIT;

INSERT INTO fraud_entities (
    entity_id, entity_key, display_name, entity_type, risk_score, risk_level,
    region, city, channel, total_amount, event_count, first_seen, last_seen,
    is_confirmed_fraud
) VALUES (
    1, 'ACCT-8841', 'Premier Checking 8841', 'account', 96.5, 'critical',
    'New York', 'New York', 'mobile', 18540.25, 34,
    SYSTIMESTAMP - INTERVAL '16' DAY, SYSTIMESTAMP - INTERVAL '2' HOUR, 1
);
INSERT INTO fraud_entities VALUES (2, 'ACCT-1190', 'Rewards Credit 1190', 'account', 91.0, 'critical', 'New York', 'Brooklyn', 'web', 12420.00, 27, SYSTIMESTAMP - INTERVAL '14' DAY, SYSTIMESTAMP - INTERVAL '3' HOUR, 1);
INSERT INTO fraud_entities VALUES (3, 'ACCT-5077', 'Small Business 5077', 'account', 88.0, 'high', 'New Jersey', 'Jersey City', 'mobile', 9450.80, 21, SYSTIMESTAMP - INTERVAL '13' DAY, SYSTIMESTAMP - INTERVAL '4' HOUR, 0);
INSERT INTO fraud_entities VALUES (4, 'ACCT-3320', 'Student Checking 3320', 'account', 81.5, 'high', 'New York', 'Queens', 'atm', 6810.00, 18, SYSTIMESTAMP - INTERVAL '9' DAY, SYSTIMESTAMP - INTERVAL '5' HOUR, 0);
INSERT INTO fraud_entities VALUES (5, 'ACCT-7712', 'Digital Wallet 7712', 'account', 77.0, 'high', 'California', 'Los Angeles', 'mobile', 5240.50, 15, SYSTIMESTAMP - INTERVAL '7' DAY, SYSTIMESTAMP - INTERVAL '1' HOUR, 0);
INSERT INTO fraud_entities VALUES (6, 'ACCT-4455', 'Treasury Sweep 4455', 'account', 68.0, 'medium', 'Texas', 'Austin', 'branch', 3220.00, 8, SYSTIMESTAMP - INTERVAL '22' DAY, SYSTIMESTAMP - INTERVAL '2' DAY, 0);
INSERT INTO fraud_entities VALUES (7, 'ACCT-9204', 'New Deposit 9204', 'account', 94.0, 'critical', 'Florida', 'Miami', 'web', 15120.00, 29, SYSTIMESTAMP - INTERVAL '10' DAY, SYSTIMESTAMP - INTERVAL '6' HOUR, 1);
INSERT INTO fraud_entities VALUES (8, 'ACCT-2188', 'Synthetic Profile 2188', 'account', 86.0, 'high', 'Florida', 'Hialeah', 'contact_center', 7190.00, 17, SYSTIMESTAMP - INTERVAL '8' DAY, SYSTIMESTAMP - INTERVAL '8' HOUR, 0);
INSERT INTO fraud_entities VALUES (9, 'ACCT-6642', 'Credit Builder 6642', 'account', 74.0, 'high', 'Nevada', 'Las Vegas', 'web', 4015.00, 12, SYSTIMESTAMP - INTERVAL '6' DAY, SYSTIMESTAMP - INTERVAL '7' HOUR, 0);
INSERT INTO fraud_entities VALUES (10, 'ACCT-3009', 'Payroll Debit 3009', 'account', 62.0, 'medium', 'Georgia', 'Atlanta', 'mobile', 2360.00, 9, SYSTIMESTAMP - INTERVAL '18' DAY, SYSTIMESTAMP - INTERVAL '1' DAY, 0);

INSERT INTO fraud_entities VALUES (11, 'DEV-fp-91a7', 'Mobile Fingerprint 91a7', 'device', 98.0, 'critical', 'New York', 'New York', 'network', 42211.05, 76, SYSTIMESTAMP - INTERVAL '16' DAY, SYSTIMESTAMP - INTERVAL '1' HOUR, 1);
INSERT INTO fraud_entities VALUES (12, 'DEV-emulator-22', 'Android Emulator Cluster 22', 'device', 93.5, 'critical', 'Florida', 'Miami', 'network', 26325.00, 51, SYSTIMESTAMP - INTERVAL '11' DAY, SYSTIMESTAMP - INTERVAL '2' HOUR, 1);
INSERT INTO fraud_entities VALUES (13, 'DEV-browser-7c', 'Headless Browser 7c', 'device', 82.0, 'high', 'California', 'Los Angeles', 'network', 11940.50, 33, SYSTIMESTAMP - INTERVAL '9' DAY, SYSTIMESTAMP - INTERVAL '3' HOUR, 0);
INSERT INTO fraud_entities VALUES (14, 'IP-198.51.100.44', 'Residential Proxy 198.51.100.44', 'ip_address', 95.0, 'critical', 'New York', 'New York', 'network', 38200.25, 89, SYSTIMESTAMP - INTERVAL '17' DAY, SYSTIMESTAMP - INTERVAL '30' MINUTE, 1);
INSERT INTO fraud_entities VALUES (15, 'IP-203.0.113.17', 'Datacenter Exit 203.0.113.17', 'ip_address', 89.0, 'high', 'Florida', 'Miami', 'network', 20410.00, 48, SYSTIMESTAMP - INTERVAL '10' DAY, SYSTIMESTAMP - INTERVAL '90' MINUTE, 0);
INSERT INTO fraud_entities VALUES (16, 'PHONE-212-0199', 'Reused VOIP 212-0199', 'phone', 90.0, 'critical', 'New York', 'Brooklyn', 'contact_center', 25110.25, 42, SYSTIMESTAMP - INTERVAL '16' DAY, SYSTIMESTAMP - INTERVAL '6' HOUR, 1);
INSERT INTO fraud_entities VALUES (17, 'EMAIL-risk-drop-01', 'Disposable Email Cluster 01', 'email', 84.5, 'high', 'New York', 'New York', 'web', 18200.00, 38, SYSTIMESTAMP - INTERVAL '15' DAY, SYSTIMESTAMP - INTERVAL '5' HOUR, 0);

INSERT INTO fraud_entities VALUES (18, 'PAYEE-MULE-017', 'Mule Payee 017', 'payee', 97.0, 'critical', 'New York', 'Bronx', 'payments', 36110.75, 44, SYSTIMESTAMP - INTERVAL '15' DAY, SYSTIMESTAMP - INTERVAL '1' HOUR, 1);
INSERT INTO fraud_entities VALUES (19, 'PAYEE-MULE-044', 'Mule Payee 044', 'payee', 92.0, 'critical', 'Florida', 'Miami', 'payments', 21750.00, 31, SYSTIMESTAMP - INTERVAL '10' DAY, SYSTIMESTAMP - INTERVAL '3' HOUR, 1);
INSERT INTO fraud_entities VALUES (20, 'PAYEE-CRYPTO-3', 'Crypto Ramp Wallet 3', 'payee', 87.0, 'high', 'California', 'Los Angeles', 'payments', 14325.50, 22, SYSTIMESTAMP - INTERVAL '8' DAY, SYSTIMESTAMP - INTERVAL '4' HOUR, 0);
INSERT INTO fraud_entities VALUES (21, 'MRC-gift-card-hub', 'Gift Card Hub', 'merchant', 85.0, 'high', 'Nevada', 'Las Vegas', 'merchant', 18490.00, 66, SYSTIMESTAMP - INTERVAL '7' DAY, SYSTIMESTAMP - INTERVAL '1' HOUR, 0);
INSERT INTO fraud_entities VALUES (22, 'MRC-crypto-ramp', 'Crypto Ramp Merchant', 'merchant', 88.0, 'high', 'California', 'Los Angeles', 'merchant', 15475.50, 28, SYSTIMESTAMP - INTERVAL '8' DAY, SYSTIMESTAMP - INTERVAL '2' HOUR, 0);
INSERT INTO fraud_entities VALUES (23, 'CARD-BIN-481516', 'BIN 481516 Card Test Set', 'card', 83.0, 'high', 'Nevada', 'Las Vegas', 'payments', 7180.00, 120, SYSTIMESTAMP - INTERVAL '5' DAY, SYSTIMESTAMP - INTERVAL '40' MINUTE, 0);
INSERT INTO fraud_entities VALUES (24, 'BRANCH-NY-014', 'NY Midtown Branch 014', 'branch', 49.0, 'medium', 'New York', 'New York', 'branch', 2800.00, 6, SYSTIMESTAMP - INTERVAL '30' DAY, SYSTIMESTAMP - INTERVAL '4' DAY, 0);
INSERT INTO fraud_entities VALUES (25, 'BRANCH-FL-021', 'Miami Branch 021', 'branch', 58.0, 'medium', 'Florida', 'Miami', 'branch', 4900.00, 9, SYSTIMESTAMP - INTERVAL '20' DAY, SYSTIMESTAMP - INTERVAL '2' DAY, 0);

INSERT INTO fraud_cases VALUES (1, 'CASE-ATO-2026-014', 'Account takeover mule ring', 'escalated', 97.0, 61250.25, 118, SYSTIMESTAMP - INTERVAL '12' DAY, SYSTIMESTAMP - INTERVAL '1' HOUR);
INSERT INTO fraud_cases VALUES (2, 'CASE-CARD-2026-022', 'Card testing merchant burst', 'investigating', 86.0, 22340.00, 142, SYSTIMESTAMP - INTERVAL '5' DAY, SYSTIMESTAMP - INTERVAL '40' MINUTE);
INSERT INTO fraud_cases VALUES (3, 'CASE-SYN-2026-031', 'Synthetic identity onboarding cluster', 'monitoring', 89.0, 28720.00, 55, SYSTIMESTAMP - INTERVAL '8' DAY, SYSTIMESTAMP - INTERVAL '2' HOUR);

INSERT INTO fraud_relationships VALUES (1, 1, 11, 'shared_device', 0.982, 18, 18540.25, SYSTIMESTAMP - INTERVAL '16' DAY, SYSTIMESTAMP - INTERVAL '2' HOUR);
INSERT INTO fraud_relationships VALUES (2, 2, 11, 'shared_device', 0.941, 14, 12420.00, SYSTIMESTAMP - INTERVAL '14' DAY, SYSTIMESTAMP - INTERVAL '3' HOUR);
INSERT INTO fraud_relationships VALUES (3, 3, 11, 'shared_device', 0.886, 9, 9450.80, SYSTIMESTAMP - INTERVAL '13' DAY, SYSTIMESTAMP - INTERVAL '4' HOUR);
INSERT INTO fraud_relationships VALUES (4, 1, 14, 'shared_ip', 0.963, 22, 18540.25, SYSTIMESTAMP - INTERVAL '16' DAY, SYSTIMESTAMP - INTERVAL '1' HOUR);
INSERT INTO fraud_relationships VALUES (5, 2, 14, 'shared_ip', 0.922, 19, 12420.00, SYSTIMESTAMP - INTERVAL '14' DAY, SYSTIMESTAMP - INTERVAL '2' HOUR);
INSERT INTO fraud_relationships VALUES (6, 4, 14, 'shared_ip', 0.801, 8, 6810.00, SYSTIMESTAMP - INTERVAL '9' DAY, SYSTIMESTAMP - INTERVAL '5' HOUR);
INSERT INTO fraud_relationships VALUES (7, 1, 16, 'same_phone', 0.934, 7, 18540.25, SYSTIMESTAMP - INTERVAL '15' DAY, SYSTIMESTAMP - INTERVAL '6' HOUR);
INSERT INTO fraud_relationships VALUES (8, 2, 16, 'same_phone', 0.901, 6, 12420.00, SYSTIMESTAMP - INTERVAL '14' DAY, SYSTIMESTAMP - INTERVAL '6' HOUR);
INSERT INTO fraud_relationships VALUES (9, 3, 17, 'same_email', 0.842, 5, 9450.80, SYSTIMESTAMP - INTERVAL '13' DAY, SYSTIMESTAMP - INTERVAL '5' HOUR);
INSERT INTO fraud_relationships VALUES (10, 4, 17, 'same_email', 0.781, 4, 6810.00, SYSTIMESTAMP - INTERVAL '9' DAY, SYSTIMESTAMP - INTERVAL '4' HOUR);
INSERT INTO fraud_relationships VALUES (11, 1, 18, 'uses_payee', 0.971, 5, 14120.00, SYSTIMESTAMP - INTERVAL '8' DAY, SYSTIMESTAMP - INTERVAL '1' HOUR);
INSERT INTO fraud_relationships VALUES (12, 2, 18, 'uses_payee', 0.944, 4, 11130.75, SYSTIMESTAMP - INTERVAL '7' DAY, SYSTIMESTAMP - INTERVAL '2' HOUR);
INSERT INTO fraud_relationships VALUES (13, 3, 18, 'uses_payee', 0.872, 3, 6820.00, SYSTIMESTAMP - INTERVAL '7' DAY, SYSTIMESTAMP - INTERVAL '3' HOUR);
INSERT INTO fraud_relationships VALUES (14, 4, 18, 'uses_payee', 0.801, 2, 4040.00, SYSTIMESTAMP - INTERVAL '6' DAY, SYSTIMESTAMP - INTERVAL '5' HOUR);
INSERT INTO fraud_relationships VALUES (15, 18, 20, 'transfers_to', 0.850, 6, 16980.50, SYSTIMESTAMP - INTERVAL '5' DAY, SYSTIMESTAMP - INTERVAL '3' HOUR);
INSERT INTO fraud_relationships VALUES (16, 20, 22, 'cashout_at', 0.812, 4, 14325.50, SYSTIMESTAMP - INTERVAL '4' DAY, SYSTIMESTAMP - INTERVAL '2' HOUR);
INSERT INTO fraud_relationships VALUES (17, 7, 12, 'shared_device', 0.955, 17, 15120.00, SYSTIMESTAMP - INTERVAL '10' DAY, SYSTIMESTAMP - INTERVAL '6' HOUR);
INSERT INTO fraud_relationships VALUES (18, 8, 12, 'shared_device', 0.884, 11, 7190.00, SYSTIMESTAMP - INTERVAL '8' DAY, SYSTIMESTAMP - INTERVAL '8' HOUR);
INSERT INTO fraud_relationships VALUES (19, 7, 15, 'shared_ip', 0.904, 13, 15120.00, SYSTIMESTAMP - INTERVAL '10' DAY, SYSTIMESTAMP - INTERVAL '5' HOUR);
INSERT INTO fraud_relationships VALUES (20, 8, 15, 'shared_ip', 0.843, 8, 7190.00, SYSTIMESTAMP - INTERVAL '8' DAY, SYSTIMESTAMP - INTERVAL '6' HOUR);
INSERT INTO fraud_relationships VALUES (21, 7, 19, 'uses_payee', 0.927, 4, 12780.00, SYSTIMESTAMP - INTERVAL '5' DAY, SYSTIMESTAMP - INTERVAL '2' HOUR);
INSERT INTO fraud_relationships VALUES (22, 8, 19, 'uses_payee', 0.806, 3, 4870.00, SYSTIMESTAMP - INTERVAL '5' DAY, SYSTIMESTAMP - INTERVAL '3' HOUR);
INSERT INTO fraud_relationships VALUES (23, 12, 15, 'login_from', 0.901, 22, 0, SYSTIMESTAMP - INTERVAL '10' DAY, SYSTIMESTAMP - INTERVAL '1' HOUR);
INSERT INTO fraud_relationships VALUES (24, 5, 13, 'shared_device', 0.771, 10, 5240.50, SYSTIMESTAMP - INTERVAL '7' DAY, SYSTIMESTAMP - INTERVAL '1' HOUR);
INSERT INTO fraud_relationships VALUES (25, 5, 20, 'uses_payee', 0.734, 2, 3180.00, SYSTIMESTAMP - INTERVAL '5' DAY, SYSTIMESTAMP - INTERVAL '1' HOUR);
INSERT INTO fraud_relationships VALUES (26, 9, 13, 'shared_device', 0.744, 9, 4015.00, SYSTIMESTAMP - INTERVAL '6' DAY, SYSTIMESTAMP - INTERVAL '7' HOUR);
INSERT INTO fraud_relationships VALUES (27, 9, 21, 'card_testing_at', 0.812, 54, 4015.00, SYSTIMESTAMP - INTERVAL '5' DAY, SYSTIMESTAMP - INTERVAL '1' HOUR);
INSERT INTO fraud_relationships VALUES (28, 10, 21, 'card_testing_at', 0.706, 32, 2360.00, SYSTIMESTAMP - INTERVAL '5' DAY, SYSTIMESTAMP - INTERVAL '4' HOUR);
INSERT INTO fraud_relationships VALUES (29, 23, 21, 'merchant_velocity', 0.936, 120, 7180.00, SYSTIMESTAMP - INTERVAL '5' DAY, SYSTIMESTAMP - INTERVAL '40' MINUTE);
INSERT INTO fraud_relationships VALUES (30, 6, 24, 'branch_origin', 0.612, 4, 2800.00, SYSTIMESTAMP - INTERVAL '20' DAY, SYSTIMESTAMP - INTERVAL '4' DAY);
INSERT INTO fraud_relationships VALUES (31, 1, 24, 'opened_with', 0.694, 1, 0, SYSTIMESTAMP - INTERVAL '30' DAY, SYSTIMESTAMP - INTERVAL '30' DAY);
INSERT INTO fraud_relationships VALUES (32, 7, 25, 'opened_with', 0.711, 1, 0, SYSTIMESTAMP - INTERVAL '20' DAY, SYSTIMESTAMP - INTERVAL '20' DAY);
INSERT INTO fraud_relationships VALUES (33, 8, 25, 'opened_with', 0.702, 1, 0, SYSTIMESTAMP - INTERVAL '20' DAY, SYSTIMESTAMP - INTERVAL '20' DAY);
INSERT INTO fraud_relationships VALUES (34, 19, 22, 'cashout_at', 0.787, 5, 10670.00, SYSTIMESTAMP - INTERVAL '4' DAY, SYSTIMESTAMP - INTERVAL '2' HOUR);
INSERT INTO fraud_relationships VALUES (35, 14, 11, 'login_from', 0.923, 40, 0, SYSTIMESTAMP - INTERVAL '16' DAY, SYSTIMESTAMP - INTERVAL '1' HOUR);

INSERT INTO fraud_case_entities VALUES (1, 1, 1, 'seed', 98.0);
INSERT INTO fraud_case_entities VALUES (2, 1, 2, 'suspect', 94.0);
INSERT INTO fraud_case_entities VALUES (3, 1, 3, 'suspect', 88.0);
INSERT INTO fraud_case_entities VALUES (4, 1, 11, 'shared_infrastructure', 99.0);
INSERT INTO fraud_case_entities VALUES (5, 1, 14, 'shared_infrastructure', 96.0);
INSERT INTO fraud_case_entities VALUES (6, 1, 18, 'cashout', 97.0);
INSERT INTO fraud_case_entities VALUES (7, 2, 9, 'seed', 86.0);
INSERT INTO fraud_case_entities VALUES (8, 2, 10, 'suspect', 70.0);
INSERT INTO fraud_case_entities VALUES (9, 2, 21, 'merchant', 85.0);
INSERT INTO fraud_case_entities VALUES (10, 2, 23, 'shared_infrastructure', 83.0);
INSERT INTO fraud_case_entities VALUES (11, 3, 7, 'seed', 94.0);
INSERT INTO fraud_case_entities VALUES (12, 3, 8, 'suspect', 86.0);
INSERT INTO fraud_case_entities VALUES (13, 3, 12, 'shared_infrastructure', 94.0);
INSERT INTO fraud_case_entities VALUES (14, 3, 15, 'shared_infrastructure', 89.0);
INSERT INTO fraud_case_entities VALUES (15, 3, 19, 'cashout', 92.0);

COMMIT;

SELECT
    (SELECT COUNT(*) FROM fraud_entities) AS fraud_entities,
    (SELECT COUNT(*) FROM fraud_relationships) AS fraud_relationships,
    (SELECT COUNT(*) FROM fraud_cases) AS fraud_cases
FROM dual;
