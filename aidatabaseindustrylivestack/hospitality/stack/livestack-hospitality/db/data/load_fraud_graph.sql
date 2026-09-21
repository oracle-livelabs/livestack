/*
 * load_guest_risk_graph.sql
 * Deterministic guest-risk graph seed data for guest profile takeover, payment disputes,
 * channel discrepancies, and synthetic-booker investigation demos.
 */

SET SERVEROUTPUT ON
PROMPT Loading service recovery graph demo data...

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
    1, 'GUEST-8841', 'VIP suite guest 8841', 'guest_profile', 96.5, 'critical',
    'New York', 'New York', 'mobile', 18540.25, 34,
    SYSTIMESTAMP - INTERVAL '16' DAY, SYSTIMESTAMP - INTERVAL '2' HOUR, 1
);
INSERT INTO fraud_entities VALUES (2, 'GUEST-1190', 'Loyalty member folio 1190', 'guest_profile', 91.0, 'critical', 'New York', 'Brooklyn', 'web', 12420.00, 27, SYSTIMESTAMP - INTERVAL '14' DAY, SYSTIMESTAMP - INTERVAL '3' HOUR, 1);
INSERT INTO fraud_entities VALUES (3, 'GUEST-5077', 'Corporate booker profile 5077', 'guest_profile', 88.0, 'high', 'New Jersey', 'Jersey City', 'mobile', 9450.80, 21, SYSTIMESTAMP - INTERVAL '13' DAY, SYSTIMESTAMP - INTERVAL '4' HOUR, 0);
INSERT INTO fraud_entities VALUES (4, 'GUEST-3320', 'Campus group guest 3320', 'guest_profile', 81.5, 'high', 'New York', 'Queens', 'kiosk', 6810.00, 18, SYSTIMESTAMP - INTERVAL '9' DAY, SYSTIMESTAMP - INTERVAL '5' HOUR, 0);
INSERT INTO fraud_entities VALUES (5, 'GUEST-7712', 'Digital wallet guest 7712', 'guest_profile', 77.0, 'high', 'California', 'Los Angeles', 'mobile', 5240.50, 15, SYSTIMESTAMP - INTERVAL '7' DAY, SYSTIMESTAMP - INTERVAL '1' HOUR, 0);
INSERT INTO fraud_entities VALUES (6, 'GUEST-4455', 'Corporate travel coordinator 4455', 'guest_profile', 68.0, 'medium', 'Texas', 'Austin', 'property', 3220.00, 8, SYSTIMESTAMP - INTERVAL '22' DAY, SYSTIMESTAMP - INTERVAL '2' DAY, 0);
INSERT INTO fraud_entities VALUES (7, 'GUEST-9204', 'OTA guest profile 9204', 'guest_profile', 94.0, 'critical', 'Florida', 'Miami', 'web', 15120.00, 29, SYSTIMESTAMP - INTERVAL '10' DAY, SYSTIMESTAMP - INTERVAL '6' HOUR, 1);
INSERT INTO fraud_entities VALUES (8, 'GUEST-2188', 'Synthetic booker profile 2188', 'guest_profile', 86.0, 'high', 'Florida', 'Hialeah', 'contact_center', 7190.00, 17, SYSTIMESTAMP - INTERVAL '8' DAY, SYSTIMESTAMP - INTERVAL '8' HOUR, 0);
INSERT INTO fraud_entities VALUES (9, 'GUEST-6642', 'High-value suite guest 6642', 'guest_profile', 74.0, 'high', 'Nevada', 'Las Vegas', 'web', 4015.00, 12, SYSTIMESTAMP - INTERVAL '6' DAY, SYSTIMESTAMP - INTERVAL '7' HOUR, 0);
INSERT INTO fraud_entities VALUES (10, 'GUEST-3009', 'Employee-rate guest 3009', 'guest_profile', 62.0, 'medium', 'Georgia', 'Atlanta', 'mobile', 2360.00, 9, SYSTIMESTAMP - INTERVAL '18' DAY, SYSTIMESTAMP - INTERVAL '1' DAY, 0);

INSERT INTO fraud_entities VALUES (11, 'STAY-CTX-91A7', 'Shared Stay Context 91A7', 'device', 98.0, 'critical', 'New York', 'New York', 'network', 42211.05, 76, SYSTIMESTAMP - INTERVAL '16' DAY, SYSTIMESTAMP - INTERVAL '1' HOUR, 1);
INSERT INTO fraud_entities VALUES (12, 'STAY-CTX-MIA-22', 'Shared Stay Context Miami 22', 'device', 93.5, 'critical', 'Florida', 'Miami', 'network', 26325.00, 51, SYSTIMESTAMP - INTERVAL '11' DAY, SYSTIMESTAMP - INTERVAL '2' HOUR, 1);
INSERT INTO fraud_entities VALUES (13, 'STAY-CTX-LAX-7C', 'Shared Stay Context Los Angeles 7C', 'device', 82.0, 'high', 'California', 'Los Angeles', 'network', 11940.50, 33, SYSTIMESTAMP - INTERVAL '9' DAY, SYSTIMESTAMP - INTERVAL '3' HOUR, 0);
INSERT INTO fraud_entities VALUES (14, 'ACCESS-CTX-NY-044', 'New York Access Context 044', 'ip_address', 95.0, 'critical', 'New York', 'New York', 'network', 38200.25, 89, SYSTIMESTAMP - INTERVAL '17' DAY, SYSTIMESTAMP - INTERVAL '30' MINUTE, 1);
INSERT INTO fraud_entities VALUES (15, 'ACCESS-CTX-MIA-017', 'Miami Access Context 017', 'ip_address', 89.0, 'high', 'Florida', 'Miami', 'network', 20410.00, 48, SYSTIMESTAMP - INTERVAL '10' DAY, SYSTIMESTAMP - INTERVAL '90' MINUTE, 0);
INSERT INTO fraud_entities VALUES (16, 'CONTACT-CTX-NY-0199', 'New York Guest Contact Context', 'phone', 90.0, 'critical', 'New York', 'Brooklyn', 'contact_center', 25110.25, 42, SYSTIMESTAMP - INTERVAL '16' DAY, SYSTIMESTAMP - INTERVAL '6' HOUR, 1);
INSERT INTO fraud_entities VALUES (17, 'CONTACT-CTX-EMAIL-01', 'Guest Email Context 01', 'email', 84.5, 'high', 'New York', 'New York', 'web', 18200.00, 38, SYSTIMESTAMP - INTERVAL '15' DAY, SYSTIMESTAMP - INTERVAL '5' HOUR, 0);

INSERT INTO fraud_entities VALUES (18, 'CHANNEL-OTA-017', 'Shared OTA settlement channel 017', 'booking_channel', 97.0, 'critical', 'New York', 'Bronx', 'payments', 36110.75, 44, SYSTIMESTAMP - INTERVAL '15' DAY, SYSTIMESTAMP - INTERVAL '1' HOUR, 1);
INSERT INTO fraud_entities VALUES (19, 'CHANNEL-OTA-044', 'Shared OTA settlement channel 044', 'booking_channel', 92.0, 'critical', 'Florida', 'Miami', 'payments', 21750.00, 31, SYSTIMESTAMP - INTERVAL '10' DAY, SYSTIMESTAMP - INTERVAL '3' HOUR, 1);
INSERT INTO fraud_entities VALUES (20, 'wallet-GIFTCARD-3', 'Gift-card settlement wallet 3', 'booking_channel', 87.0, 'high', 'California', 'Los Angeles', 'payments', 14325.50, 22, SYSTIMESTAMP - INTERVAL '8' DAY, SYSTIMESTAMP - INTERVAL '4' HOUR, 0);
INSERT INTO fraud_entities VALUES (21, 'VENUE-gift-card-hub', 'Gift Card Outlet Hub', 'venue_outlet', 85.0, 'high', 'Nevada', 'Las Vegas', 'venue', 18490.00, 66, SYSTIMESTAMP - INTERVAL '7' DAY, SYSTIMESTAMP - INTERVAL '1' HOUR, 0);
INSERT INTO fraud_entities VALUES (22, 'VENUE-payment-ramp', 'Third-Party Payment Venue', 'venue_outlet', 88.0, 'high', 'California', 'Los Angeles', 'venue', 15475.50, 28, SYSTIMESTAMP - INTERVAL '8' DAY, SYSTIMESTAMP - INTERVAL '2' HOUR, 0);
INSERT INTO fraud_entities VALUES (23, 'PAYMENT-TOKEN-481516', 'Payment Token Test Set', 'payment_card', 83.0, 'high', 'Nevada', 'Las Vegas', 'payments', 7180.00, 120, SYSTIMESTAMP - INTERVAL '5' DAY, SYSTIMESTAMP - INTERVAL '40' MINUTE, 0);
INSERT INTO fraud_entities VALUES (24, 'PROPERTY-NY-014', 'NY Midtown Property 014', 'property', 49.0, 'medium', 'New York', 'New York', 'property', 2800.00, 6, SYSTIMESTAMP - INTERVAL '30' DAY, SYSTIMESTAMP - INTERVAL '4' DAY, 0);
INSERT INTO fraud_entities VALUES (25, 'PROPERTY-FL-021', 'Miami Property 021', 'property', 58.0, 'medium', 'Florida', 'Miami', 'property', 4900.00, 9, SYSTIMESTAMP - INTERVAL '20' DAY, SYSTIMESTAMP - INTERVAL '2' DAY, 0);

INSERT INTO fraud_cases VALUES (1, 'CASE-ATO-2026-014', 'Guest profile takeover settlement cluster', 'escalated', 97.0, 61250.25, 118, SYSTIMESTAMP - INTERVAL '12' DAY, SYSTIMESTAMP - INTERVAL '1' HOUR);
INSERT INTO fraud_cases VALUES (2, 'CASE-PAY-2026-022', 'Payment testing venue burst', 'investigating', 86.0, 22340.00, 142, SYSTIMESTAMP - INTERVAL '5' DAY, SYSTIMESTAMP - INTERVAL '40' MINUTE);
INSERT INTO fraud_cases VALUES (3, 'CASE-SYN-2026-031', 'Synthetic booker onboarding cluster', 'monitoring', 89.0, 28720.00, 55, SYSTIMESTAMP - INTERVAL '8' DAY, SYSTIMESTAMP - INTERVAL '2' HOUR);

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
INSERT INTO fraud_relationships VALUES (11, 1, 18, 'uses_channel', 0.971, 5, 14120.00, SYSTIMESTAMP - INTERVAL '8' DAY, SYSTIMESTAMP - INTERVAL '1' HOUR);
INSERT INTO fraud_relationships VALUES (12, 2, 18, 'uses_channel', 0.944, 4, 11130.75, SYSTIMESTAMP - INTERVAL '7' DAY, SYSTIMESTAMP - INTERVAL '2' HOUR);
INSERT INTO fraud_relationships VALUES (13, 3, 18, 'uses_channel', 0.872, 3, 6820.00, SYSTIMESTAMP - INTERVAL '7' DAY, SYSTIMESTAMP - INTERVAL '3' HOUR);
INSERT INTO fraud_relationships VALUES (14, 4, 18, 'uses_channel', 0.801, 2, 4040.00, SYSTIMESTAMP - INTERVAL '6' DAY, SYSTIMESTAMP - INTERVAL '5' HOUR);
INSERT INTO fraud_relationships VALUES (15, 18, 20, 'transfers_to', 0.850, 6, 16980.50, SYSTIMESTAMP - INTERVAL '5' DAY, SYSTIMESTAMP - INTERVAL '3' HOUR);
INSERT INTO fraud_relationships VALUES (16, 20, 22, 'folio_settlement_at', 0.812, 4, 14325.50, SYSTIMESTAMP - INTERVAL '4' DAY, SYSTIMESTAMP - INTERVAL '2' HOUR);
INSERT INTO fraud_relationships VALUES (17, 7, 12, 'shared_device', 0.955, 17, 15120.00, SYSTIMESTAMP - INTERVAL '10' DAY, SYSTIMESTAMP - INTERVAL '6' HOUR);
INSERT INTO fraud_relationships VALUES (18, 8, 12, 'shared_device', 0.884, 11, 7190.00, SYSTIMESTAMP - INTERVAL '8' DAY, SYSTIMESTAMP - INTERVAL '8' HOUR);
INSERT INTO fraud_relationships VALUES (19, 7, 15, 'shared_ip', 0.904, 13, 15120.00, SYSTIMESTAMP - INTERVAL '10' DAY, SYSTIMESTAMP - INTERVAL '5' HOUR);
INSERT INTO fraud_relationships VALUES (20, 8, 15, 'shared_ip', 0.843, 8, 7190.00, SYSTIMESTAMP - INTERVAL '8' DAY, SYSTIMESTAMP - INTERVAL '6' HOUR);
INSERT INTO fraud_relationships VALUES (21, 7, 19, 'uses_channel', 0.927, 4, 12780.00, SYSTIMESTAMP - INTERVAL '5' DAY, SYSTIMESTAMP - INTERVAL '2' HOUR);
INSERT INTO fraud_relationships VALUES (22, 8, 19, 'uses_channel', 0.806, 3, 4870.00, SYSTIMESTAMP - INTERVAL '5' DAY, SYSTIMESTAMP - INTERVAL '3' HOUR);
INSERT INTO fraud_relationships VALUES (23, 12, 15, 'login_from', 0.901, 22, 0, SYSTIMESTAMP - INTERVAL '10' DAY, SYSTIMESTAMP - INTERVAL '1' HOUR);
INSERT INTO fraud_relationships VALUES (24, 5, 13, 'shared_device', 0.771, 10, 5240.50, SYSTIMESTAMP - INTERVAL '7' DAY, SYSTIMESTAMP - INTERVAL '1' HOUR);
INSERT INTO fraud_relationships VALUES (25, 5, 20, 'uses_channel', 0.734, 2, 3180.00, SYSTIMESTAMP - INTERVAL '5' DAY, SYSTIMESTAMP - INTERVAL '1' HOUR);
INSERT INTO fraud_relationships VALUES (26, 9, 13, 'shared_device', 0.744, 9, 4015.00, SYSTIMESTAMP - INTERVAL '6' DAY, SYSTIMESTAMP - INTERVAL '7' HOUR);
INSERT INTO fraud_relationships VALUES (27, 9, 21, 'payment_testing_at', 0.812, 54, 4015.00, SYSTIMESTAMP - INTERVAL '5' DAY, SYSTIMESTAMP - INTERVAL '1' HOUR);
INSERT INTO fraud_relationships VALUES (28, 10, 21, 'payment_testing_at', 0.706, 32, 2360.00, SYSTIMESTAMP - INTERVAL '5' DAY, SYSTIMESTAMP - INTERVAL '4' HOUR);
INSERT INTO fraud_relationships VALUES (29, 23, 21, 'venue_velocity', 0.936, 120, 7180.00, SYSTIMESTAMP - INTERVAL '5' DAY, SYSTIMESTAMP - INTERVAL '40' MINUTE);
INSERT INTO fraud_relationships VALUES (30, 6, 24, 'property_origin', 0.612, 4, 2800.00, SYSTIMESTAMP - INTERVAL '20' DAY, SYSTIMESTAMP - INTERVAL '4' DAY);
INSERT INTO fraud_relationships VALUES (31, 1, 24, 'opened_with', 0.694, 1, 0, SYSTIMESTAMP - INTERVAL '30' DAY, SYSTIMESTAMP - INTERVAL '30' DAY);
INSERT INTO fraud_relationships VALUES (32, 7, 25, 'opened_with', 0.711, 1, 0, SYSTIMESTAMP - INTERVAL '20' DAY, SYSTIMESTAMP - INTERVAL '20' DAY);
INSERT INTO fraud_relationships VALUES (33, 8, 25, 'opened_with', 0.702, 1, 0, SYSTIMESTAMP - INTERVAL '20' DAY, SYSTIMESTAMP - INTERVAL '20' DAY);
INSERT INTO fraud_relationships VALUES (34, 19, 22, 'folio_settlement_at', 0.787, 5, 10670.00, SYSTIMESTAMP - INTERVAL '4' DAY, SYSTIMESTAMP - INTERVAL '2' HOUR);
INSERT INTO fraud_relationships VALUES (35, 14, 11, 'login_from', 0.923, 40, 0, SYSTIMESTAMP - INTERVAL '16' DAY, SYSTIMESTAMP - INTERVAL '1' HOUR);

INSERT INTO fraud_case_entities VALUES (1, 1, 1, 'seed', 98.0);
INSERT INTO fraud_case_entities VALUES (2, 1, 2, 'suspect', 94.0);
INSERT INTO fraud_case_entities VALUES (3, 1, 3, 'suspect', 88.0);
INSERT INTO fraud_case_entities VALUES (4, 1, 11, 'shared_infrastructure', 99.0);
INSERT INTO fraud_case_entities VALUES (5, 1, 14, 'shared_infrastructure', 96.0);
INSERT INTO fraud_case_entities VALUES (6, 1, 18, 'settlement', 97.0);
INSERT INTO fraud_case_entities VALUES (7, 2, 9, 'seed', 86.0);
INSERT INTO fraud_case_entities VALUES (8, 2, 10, 'suspect', 70.0);
INSERT INTO fraud_case_entities VALUES (9, 2, 21, 'venue_outlet', 85.0);
INSERT INTO fraud_case_entities VALUES (10, 2, 23, 'shared_infrastructure', 83.0);
INSERT INTO fraud_case_entities VALUES (11, 3, 7, 'seed', 94.0);
INSERT INTO fraud_case_entities VALUES (12, 3, 8, 'suspect', 86.0);
INSERT INTO fraud_case_entities VALUES (13, 3, 12, 'shared_infrastructure', 94.0);
INSERT INTO fraud_case_entities VALUES (14, 3, 15, 'shared_infrastructure', 89.0);
INSERT INTO fraud_case_entities VALUES (15, 3, 19, 'settlement', 92.0);

COMMIT;

SELECT
    (SELECT COUNT(*) FROM fraud_entities) AS guest_risk_entities,
    (SELECT COUNT(*) FROM fraud_relationships) AS guest_risk_relationships,
    (SELECT COUNT(*) FROM fraud_cases) AS guest_risk_cases
FROM dual;
