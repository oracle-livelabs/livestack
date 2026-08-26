/*
 * load_telecom_network_graph.sql
 * Deterministic Seer Comms subscriber and network impact graph seed data.
 */

SET SERVEROUTPUT ON
PROMPT Loading Seer Comms telecom network graph demo data...

DELETE FROM telecom_case_entities;
DELETE FROM telecom_graph_relationships;
DELETE FROM telecom_experience_cases;
DELETE FROM telecom_graph_entities;
COMMIT;

INSERT INTO telecom_graph_entities VALUES (1, 'SUB-5G-1041', 'Stadium district family plan cluster', 'subscriber', 'Northeast', 'New York', 94.5, 42.0, 18420, 88, 1285000, SYSTIMESTAMP - INTERVAL '7' DAY, SYSTIMESTAMP - INTERVAL '1' HOUR);
INSERT INTO telecom_graph_entities VALUES (2, 'SITE-NY-5G-018', 'Hudson Yards 5G macro site', 'network_site', 'Northeast', 'New York', 91.0, 48.0, 31200, 74, 1880000, SYSTIMESTAMP - INTERVAL '8' DAY, SYSTIMESTAMP - INTERVAL '45' MINUTE);
INSERT INTO telecom_graph_entities VALUES (3, 'SVC-PULSE-5G', 'PulsePoint 5G unlimited service line', 'service_line', 'Northeast', 'New York', 87.5, 55.0, 22400, 63, 1650000, SYSTIMESTAMP - INTERVAL '10' DAY, SYSTIMESTAMP - INTERVAL '2' HOUR);
INSERT INTO telecom_graph_entities VALUES (4, 'TEAM-COVERAGE-NE', 'Coverage Assurance Team - Northeast', 'account_advocate', 'Northeast', 'New York', 76.0, 61.0, 9200, 42, 740000, SYSTIMESTAMP - INTERVAL '14' DAY, SYSTIMESTAMP - INTERVAL '4' HOUR);
INSERT INTO telecom_graph_entities VALUES (5, 'CREW-NY-FIBER-2', 'NY fiber field crew 2', 'field_crew', 'Northeast', 'New York', 62.0, 69.0, 4800, 18, 320000, SYSTIMESTAMP - INTERVAL '12' DAY, SYSTIMESTAMP - INTERVAL '3' HOUR);
INSERT INTO telecom_graph_entities VALUES (6, 'OUT-EVENT-501', 'Game-day 5G congestion spike', 'outage_event', 'Northeast', 'New York', 96.0, 35.0, 31200, 118, 2140000, SYSTIMESTAMP - INTERVAL '2' DAY, SYSTIMESTAMP - INTERVAL '20' MINUTE);
INSERT INTO telecom_graph_entities VALUES (7, 'CASE-CAP-501', 'Capacity reroute case CAP-501', 'support_case', 'Northeast', 'New York', 93.0, 41.0, 30100, 96, 2010000, SYSTIMESTAMP - INTERVAL '2' DAY, SYSTIMESTAMP - INTERVAL '20' MINUTE);
INSERT INTO telecom_graph_entities VALUES (8, 'CAP-NY-POOL-05', 'NYC midtown capacity pool', 'capacity_pool', 'Northeast', 'New York', 89.0, 50.0, 28600, 61, 1720000, SYSTIMESTAMP - INTERVAL '5' DAY, SYSTIMESTAMP - INTERVAL '2' HOUR);

INSERT INTO telecom_graph_entities VALUES (9, 'ENT-FIBER-7782', 'Metro healthcare enterprise fiber account', 'enterprise_account', 'Southeast', 'Atlanta', 92.0, 45.0, 4300, 51, 3420000, SYSTIMESTAMP - INTERVAL '6' DAY, SYSTIMESTAMP - INTERVAL '1' HOUR);
INSERT INTO telecom_graph_entities VALUES (10, 'SITE-ATL-FIBER-04', 'Atlanta east fiber hub', 'network_site', 'Southeast', 'Atlanta', 88.0, 58.0, 7600, 39, 960000, SYSTIMESTAMP - INTERVAL '11' DAY, SYSTIMESTAMP - INTERVAL '90' MINUTE);
INSERT INTO telecom_graph_entities VALUES (11, 'SVC-FIBERPATH', 'FiberPath Broadband SLA service line', 'service_line', 'Southeast', 'Atlanta', 82.0, 63.0, 6500, 27, 1450000, SYSTIMESTAMP - INTERVAL '15' DAY, SYSTIMESTAMP - INTERVAL '2' HOUR);
INSERT INTO telecom_graph_entities VALUES (12, 'OUT-FIBER-224', 'Fiber cut affecting enterprise corridor', 'outage_event', 'Southeast', 'Atlanta', 95.0, 38.0, 7100, 82, 2180000, SYSTIMESTAMP - INTERVAL '1' DAY, SYSTIMESTAMP - INTERVAL '30' MINUTE);
INSERT INTO telecom_graph_entities VALUES (13, 'CREW-ATL-FIELD-7', 'Atlanta field restoration crew 7', 'field_crew', 'Southeast', 'Atlanta', 66.0, 70.0, 4200, 15, 410000, SYSTIMESTAMP - INTERVAL '9' DAY, SYSTIMESTAMP - INTERVAL '2' HOUR);
INSERT INTO telecom_graph_entities VALUES (14, 'DEV-ONT-ROUTER-A', 'Enterprise edge router group A', 'device', 'Southeast', 'Atlanta', 79.0, 59.0, 3800, 21, 520000, SYSTIMESTAMP - INTERVAL '13' DAY, SYSTIMESTAMP - INTERVAL '3' HOUR);

INSERT INTO telecom_graph_entities VALUES (15, 'SUB-ROAM-3301', 'Travel corridor roaming subscriber cluster', 'subscriber', 'West', 'Los Angeles', 84.0, 54.0, 15800, 47, 910000, SYSTIMESTAMP - INTERVAL '4' DAY, SYSTIMESTAMP - INTERVAL '1' HOUR);
INSERT INTO telecom_graph_entities VALUES (16, 'SVC-ROAMFLOW', 'RoamFlow Mobility service line', 'service_line', 'West', 'Los Angeles', 78.0, 64.0, 15100, 42, 870000, SYSTIMESTAMP - INTERVAL '16' DAY, SYSTIMESTAMP - INTERVAL '2' HOUR);
INSERT INTO telecom_graph_entities VALUES (17, 'CASE-ROAM-109', 'Roaming billing surge case', 'support_case', 'West', 'Los Angeles', 86.0, 49.0, 12600, 59, 1120000, SYSTIMESTAMP - INTERVAL '3' DAY, SYSTIMESTAMP - INTERVAL '80' MINUTE);
INSERT INTO telecom_graph_entities VALUES (18, 'TEAM-ROAM-WEST', 'Roaming Assurance Team - West', 'account_advocate', 'West', 'Los Angeles', 72.0, 68.0, 8800, 36, 650000, SYSTIMESTAMP - INTERVAL '18' DAY, SYSTIMESTAMP - INTERVAL '4' HOUR);
INSERT INTO telecom_graph_entities VALUES (19, 'ENT-PRIVATE5G-42', 'Manufacturing private 5G account', 'enterprise_account', 'West', 'San Francisco', 81.0, 60.0, 2900, 19, 2260000, SYSTIMESTAMP - INTERVAL '12' DAY, SYSTIMESTAMP - INTERVAL '5' HOUR);
INSERT INTO telecom_graph_entities VALUES (20, 'CASE-CHURN-772', 'High-value family churn-risk case', 'support_case', 'Central', 'Dallas', 90.0, 46.0, 9700, 66, 980000, SYSTIMESTAMP - INTERVAL '2' DAY, SYSTIMESTAMP - INTERVAL '1' HOUR);
INSERT INTO telecom_graph_entities VALUES (21, 'SUB-FAM-5570', 'Family plan churn-risk subscriber cluster', 'subscriber', 'Central', 'Dallas', 88.0, 47.0, 9300, 61, 940000, SYSTIMESTAMP - INTERVAL '2' DAY, SYSTIMESTAMP - INTERVAL '1' HOUR);
INSERT INTO telecom_graph_entities VALUES (22, 'SITE-DAL-5G-09', 'Dallas 5G dispatch center', 'network_site', 'Central', 'Dallas', 74.0, 62.0, 7600, 23, 610000, SYSTIMESTAMP - INTERVAL '20' DAY, SYSTIMESTAMP - INTERVAL '6' HOUR);
INSERT INTO telecom_graph_entities VALUES (23, 'CREW-DAL-RET-3', 'Dallas retention and device support crew', 'field_crew', 'Central', 'Dallas', 69.0, 66.0, 4100, 17, 385000, SYSTIMESTAMP - INTERVAL '13' DAY, SYSTIMESTAMP - INTERVAL '3' HOUR);
INSERT INTO telecom_graph_entities VALUES (24, 'ANCHOR-SEER-COMMS', 'Seer Comms network experience command case anchor', 'case_anchor', 'National', 'Reston', 85.0, 57.0, 64500, 226, 8240000, SYSTIMESTAMP - INTERVAL '30' DAY, SYSTIMESTAMP);
INSERT INTO telecom_graph_entities VALUES (25, 'SITE-NY-CELL-044', 'Queensboro cell site 044', 'network_site', 'Northeast', 'New York', 92.0, 46.0, 13800, 71, 1320000, SYSTIMESTAMP - INTERVAL '6' DAY, SYSTIMESTAMP - INTERVAL '35' MINUTE);
INSERT INTO telecom_graph_entities VALUES (26, 'NODE-NY-FIBER-12', 'Queens metro fiber node 12', 'network_site', 'Northeast', 'New York', 87.0, 52.0, 11200, 54, 1060000, SYSTIMESTAMP - INTERVAL '9' DAY, SYSTIMESTAMP - INTERVAL '50' MINUTE);
INSERT INTO telecom_graph_entities VALUES (27, 'QUEUE-NOC-NE-CAP', 'Northeast capacity triage NOC queue', 'case_anchor', 'Northeast', 'New York', 91.0, 44.0, 13800, 39, 1320000, SYSTIMESTAMP - INTERVAL '5' DAY, SYSTIMESTAMP - INTERVAL '28' MINUTE);
INSERT INTO telecom_graph_entities VALUES (28, 'TKT-NY-77831', 'Trouble ticket NY-77831 - 5G sector saturation', 'support_case', 'Northeast', 'New York', 94.0, 39.0, 13800, 74, 1320000, SYSTIMESTAMP - INTERVAL '2' DAY, SYSTIMESTAMP - INTERVAL '22' MINUTE);
INSERT INTO telecom_graph_entities VALUES (29, 'SEG-NY-PREMIUM-5G', 'Premium 5G commuter subscriber segment', 'subscriber', 'Northeast', 'New York', 90.0, 49.0, 12400, 67, 1185000, SYSTIMESTAMP - INTERVAL '6' DAY, SYSTIMESTAMP - INTERVAL '40' MINUTE);
INSERT INTO telecom_graph_entities VALUES (30, 'CREW-NY-RAN-4', 'New York RAN field crew 4', 'field_crew', 'Northeast', 'New York', 68.0, 72.0, 5100, 14, 410000, SYSTIMESTAMP - INTERVAL '8' DAY, SYSTIMESTAMP - INTERVAL '1' HOUR);
INSERT INTO telecom_graph_entities VALUES (31, 'SITE-ATL-CELL-021', 'East Atlanta cell site 021', 'network_site', 'Southeast', 'Atlanta', 86.0, 57.0, 6200, 31, 880000, SYSTIMESTAMP - INTERVAL '10' DAY, SYSTIMESTAMP - INTERVAL '70' MINUTE);
INSERT INTO telecom_graph_entities VALUES (32, 'NODE-ATL-FIBER-09', 'Atlanta metro fiber node 09', 'network_site', 'Southeast', 'Atlanta', 93.0, 41.0, 6900, 62, 2080000, SYSTIMESTAMP - INTERVAL '4' DAY, SYSTIMESTAMP - INTERVAL '25' MINUTE);
INSERT INTO telecom_graph_entities VALUES (33, 'QUEUE-NOC-SE-FIBER', 'Southeast enterprise fiber NOC queue', 'case_anchor', 'Southeast', 'Atlanta', 89.0, 50.0, 6900, 28, 2080000, SYSTIMESTAMP - INTERVAL '4' DAY, SYSTIMESTAMP - INTERVAL '30' MINUTE);
INSERT INTO telecom_graph_entities VALUES (34, 'TKT-ATL-77109', 'Trouble ticket ATL-77109 - fiber node loss', 'support_case', 'Southeast', 'Atlanta', 95.0, 37.0, 7100, 82, 2180000, SYSTIMESTAMP - INTERVAL '1' DAY, SYSTIMESTAMP - INTERVAL '32' MINUTE);
INSERT INTO telecom_graph_entities VALUES (35, 'SEG-LA-ROAM-IOS', 'International roaming subscriber segment', 'subscriber', 'West', 'Los Angeles', 83.0, 55.0, 9900, 44, 760000, SYSTIMESTAMP - INTERVAL '5' DAY, SYSTIMESTAMP - INTERVAL '75' MINUTE);
INSERT INTO telecom_graph_entities VALUES (36, 'QUEUE-NOC-WEST-ROAM', 'West roaming assurance NOC queue', 'case_anchor', 'West', 'Los Angeles', 84.0, 58.0, 12600, 33, 1120000, SYSTIMESTAMP - INTERVAL '3' DAY, SYSTIMESTAMP - INTERVAL '65' MINUTE);

INSERT INTO telecom_experience_cases VALUES (1, 'TEL-5G-2026-501', '5G congestion spike around event venues', 'escalated', 'critical', 96, 31200, 2140000, SYSTIMESTAMP - INTERVAL '2' DAY, SYSTIMESTAMP - INTERVAL '20' MINUTE);
INSERT INTO telecom_experience_cases VALUES (2, 'TEL-FIBER-2026-224', 'Fiber outage affecting enterprise accounts', 'routed', 'critical', 95, 7100, 2180000, SYSTIMESTAMP - INTERVAL '1' DAY, SYSTIMESTAMP - INTERVAL '30' MINUTE);
INSERT INTO telecom_experience_cases VALUES (3, 'TEL-ROAM-2026-109', 'Roaming billing surge linked to travel corridors', 'investigating', 'high', 86, 12600, 1120000, SYSTIMESTAMP - INTERVAL '3' DAY, SYSTIMESTAMP - INTERVAL '80' MINUTE);
INSERT INTO telecom_experience_cases VALUES (4, 'TEL-CHURN-2026-772', 'High-value family churn-risk cluster', 'monitoring', 'high', 90, 9700, 980000, SYSTIMESTAMP - INTERVAL '2' DAY, SYSTIMESTAMP - INTERVAL '1' HOUR);

INSERT INTO telecom_graph_relationships VALUES (1, 1, 3, 'subscribes_to', 0.944, 18420, 18420, SYSTIMESTAMP - INTERVAL '7' DAY, SYSTIMESTAMP - INTERVAL '1' HOUR);
INSERT INTO telecom_graph_relationships VALUES (2, 1, 2, 'served_by', 0.921, 112, 18420, SYSTIMESTAMP - INTERVAL '7' DAY, SYSTIMESTAMP - INTERVAL '1' HOUR);
INSERT INTO telecom_graph_relationships VALUES (3, 1, 6, 'impacted_by', 0.982, 118, 18420, SYSTIMESTAMP - INTERVAL '2' DAY, SYSTIMESTAMP - INTERVAL '20' MINUTE);
INSERT INTO telecom_graph_relationships VALUES (4, 6, 7, 'escalates_case', 0.965, 96, 30100, SYSTIMESTAMP - INTERVAL '2' DAY, SYSTIMESTAMP - INTERVAL '20' MINUTE);
INSERT INTO telecom_graph_relationships VALUES (5, 7, 5, 'assigned_crew', 0.841, 18, 4800, SYSTIMESTAMP - INTERVAL '2' DAY, SYSTIMESTAMP - INTERVAL '2' HOUR);
INSERT INTO telecom_graph_relationships VALUES (6, 2, 8, 'capacity_dependency', 0.913, 61, 28600, SYSTIMESTAMP - INTERVAL '5' DAY, SYSTIMESTAMP - INTERVAL '2' HOUR);
INSERT INTO telecom_graph_relationships VALUES (7, 4, 1, 'reports_signal', 0.772, 42, 9200, SYSTIMESTAMP - INTERVAL '4' DAY, SYSTIMESTAMP - INTERVAL '4' HOUR);
INSERT INTO telecom_graph_relationships VALUES (8, 4, 7, 'escalates_case', 0.731, 16, 6100, SYSTIMESTAMP - INTERVAL '2' DAY, SYSTIMESTAMP - INTERVAL '2' HOUR);
INSERT INTO telecom_graph_relationships VALUES (9, 3, 8, 'service_path', 0.784, 53, 17400, SYSTIMESTAMP - INTERVAL '8' DAY, SYSTIMESTAMP - INTERVAL '2' HOUR);
INSERT INTO telecom_graph_relationships VALUES (10, 2, 5, 'shares_site', 0.684, 11, 3700, SYSTIMESTAMP - INTERVAL '6' DAY, SYSTIMESTAMP - INTERVAL '4' HOUR);

INSERT INTO telecom_graph_relationships VALUES (11, 9, 11, 'subscribes_to', 0.937, 48, 4300, SYSTIMESTAMP - INTERVAL '6' DAY, SYSTIMESTAMP - INTERVAL '1' HOUR);
INSERT INTO telecom_graph_relationships VALUES (12, 9, 10, 'served_by', 0.902, 39, 4300, SYSTIMESTAMP - INTERVAL '6' DAY, SYSTIMESTAMP - INTERVAL '90' MINUTE);
INSERT INTO telecom_graph_relationships VALUES (13, 12, 9, 'impacted_by', 0.891, 82, 4300, SYSTIMESTAMP - INTERVAL '1' DAY, SYSTIMESTAMP - INTERVAL '30' MINUTE);
INSERT INTO telecom_graph_relationships VALUES (14, 12, 13, 'assigned_crew', 0.834, 15, 4200, SYSTIMESTAMP - INTERVAL '1' DAY, SYSTIMESTAMP - INTERVAL '2' HOUR);
INSERT INTO telecom_graph_relationships VALUES (15, 10, 14, 'uses_device', 0.806, 21, 3800, SYSTIMESTAMP - INTERVAL '12' DAY, SYSTIMESTAMP - INTERVAL '3' HOUR);
INSERT INTO telecom_graph_relationships VALUES (16, 14, 11, 'service_path', 0.741, 18, 3600, SYSTIMESTAMP - INTERVAL '9' DAY, SYSTIMESTAMP - INTERVAL '4' HOUR);
INSERT INTO telecom_graph_relationships VALUES (17, 9, 12, 'reports_signal', 0.787, 33, 4200, SYSTIMESTAMP - INTERVAL '1' DAY, SYSTIMESTAMP - INTERVAL '1' HOUR);

INSERT INTO telecom_graph_relationships VALUES (18, 15, 16, 'subscribes_to', 0.812, 15100, 15100, SYSTIMESTAMP - INTERVAL '4' DAY, SYSTIMESTAMP - INTERVAL '1' HOUR);
INSERT INTO telecom_graph_relationships VALUES (19, 15, 17, 'impacted_by', 0.842, 59, 12600, SYSTIMESTAMP - INTERVAL '3' DAY, SYSTIMESTAMP - INTERVAL '80' MINUTE);
INSERT INTO telecom_graph_relationships VALUES (20, 18, 15, 'reports_signal', 0.761, 36, 8800, SYSTIMESTAMP - INTERVAL '3' DAY, SYSTIMESTAMP - INTERVAL '2' HOUR);
INSERT INTO telecom_graph_relationships VALUES (21, 17, 16, 'service_path', 0.734, 42, 12600, SYSTIMESTAMP - INTERVAL '3' DAY, SYSTIMESTAMP - INTERVAL '80' MINUTE);
INSERT INTO telecom_graph_relationships VALUES (22, 19, 16, 'enterprise_contact', 0.622, 12, 2900, SYSTIMESTAMP - INTERVAL '6' DAY, SYSTIMESTAMP - INTERVAL '4' HOUR);
INSERT INTO telecom_graph_relationships VALUES (23, 21, 20, 'churn_risk_link', 0.904, 66, 9300, SYSTIMESTAMP - INTERVAL '2' DAY, SYSTIMESTAMP - INTERVAL '1' HOUR);
INSERT INTO telecom_graph_relationships VALUES (24, 21, 22, 'served_by', 0.743, 23, 7600, SYSTIMESTAMP - INTERVAL '10' DAY, SYSTIMESTAMP - INTERVAL '6' HOUR);
INSERT INTO telecom_graph_relationships VALUES (25, 20, 23, 'assigned_crew', 0.711, 17, 4100, SYSTIMESTAMP - INTERVAL '2' DAY, SYSTIMESTAMP - INTERVAL '3' HOUR);
INSERT INTO telecom_graph_relationships VALUES (26, 22, 23, 'shares_site', 0.665, 9, 3500, SYSTIMESTAMP - INTERVAL '7' DAY, SYSTIMESTAMP - INTERVAL '5' HOUR);
INSERT INTO telecom_graph_relationships VALUES (27, 24, 6, 'escalates_case', 0.700, 118, 31200, SYSTIMESTAMP - INTERVAL '2' DAY, SYSTIMESTAMP - INTERVAL '20' MINUTE);
INSERT INTO telecom_graph_relationships VALUES (28, 24, 12, 'escalates_case', 0.690, 82, 7100, SYSTIMESTAMP - INTERVAL '1' DAY, SYSTIMESTAMP - INTERVAL '30' MINUTE);
INSERT INTO telecom_graph_relationships VALUES (29, 24, 17, 'escalates_case', 0.620, 59, 12600, SYSTIMESTAMP - INTERVAL '3' DAY, SYSTIMESTAMP - INTERVAL '80' MINUTE);
INSERT INTO telecom_graph_relationships VALUES (30, 24, 20, 'escalates_case', 0.650, 66, 9700, SYSTIMESTAMP - INTERVAL '2' DAY, SYSTIMESTAMP - INTERVAL '1' HOUR);
INSERT INTO telecom_graph_relationships VALUES (31, 29, 3, 'subscribes_to', 0.918, 12400, 12400, SYSTIMESTAMP - INTERVAL '6' DAY, SYSTIMESTAMP - INTERVAL '40' MINUTE);
INSERT INTO telecom_graph_relationships VALUES (32, 3, 25, 'served_by', 0.887, 77, 12400, SYSTIMESTAMP - INTERVAL '6' DAY, SYSTIMESTAMP - INTERVAL '35' MINUTE);
INSERT INTO telecom_graph_relationships VALUES (33, 25, 26, 'capacity_dependency', 0.852, 54, 11200, SYSTIMESTAMP - INTERVAL '6' DAY, SYSTIMESTAMP - INTERVAL '35' MINUTE);
INSERT INTO telecom_graph_relationships VALUES (34, 25, 6, 'impacted_by', 0.941, 93, 13800, SYSTIMESTAMP - INTERVAL '2' DAY, SYSTIMESTAMP - INTERVAL '22' MINUTE);
INSERT INTO telecom_graph_relationships VALUES (35, 6, 28, 'escalates_case', 0.932, 74, 13800, SYSTIMESTAMP - INTERVAL '2' DAY, SYSTIMESTAMP - INTERVAL '22' MINUTE);
INSERT INTO telecom_graph_relationships VALUES (36, 28, 30, 'assigned_crew', 0.809, 12, 5100, SYSTIMESTAMP - INTERVAL '2' DAY, SYSTIMESTAMP - INTERVAL '1' HOUR);
INSERT INTO telecom_graph_relationships VALUES (37, 27, 28, 'reports_signal', 0.776, 22, 13800, SYSTIMESTAMP - INTERVAL '2' DAY, SYSTIMESTAMP - INTERVAL '30' MINUTE);
INSERT INTO telecom_graph_relationships VALUES (38, 11, 32, 'served_by', 0.873, 41, 6500, SYSTIMESTAMP - INTERVAL '5' DAY, SYSTIMESTAMP - INTERVAL '45' MINUTE);
INSERT INTO telecom_graph_relationships VALUES (39, 32, 12, 'impacted_by', 0.936, 82, 6900, SYSTIMESTAMP - INTERVAL '1' DAY, SYSTIMESTAMP - INTERVAL '32' MINUTE);
INSERT INTO telecom_graph_relationships VALUES (40, 12, 34, 'escalates_case', 0.917, 82, 7100, SYSTIMESTAMP - INTERVAL '1' DAY, SYSTIMESTAMP - INTERVAL '32' MINUTE);
INSERT INTO telecom_graph_relationships VALUES (41, 33, 34, 'reports_signal', 0.763, 28, 6900, SYSTIMESTAMP - INTERVAL '1' DAY, SYSTIMESTAMP - INTERVAL '35' MINUTE);
INSERT INTO telecom_graph_relationships VALUES (42, 34, 13, 'assigned_crew', 0.842, 15, 4200, SYSTIMESTAMP - INTERVAL '1' DAY, SYSTIMESTAMP - INTERVAL '2' HOUR);
INSERT INTO telecom_graph_relationships VALUES (43, 35, 16, 'subscribes_to', 0.801, 9900, 9900, SYSTIMESTAMP - INTERVAL '5' DAY, SYSTIMESTAMP - INTERVAL '75' MINUTE);
INSERT INTO telecom_graph_relationships VALUES (44, 35, 17, 'impacted_by', 0.827, 44, 9900, SYSTIMESTAMP - INTERVAL '3' DAY, SYSTIMESTAMP - INTERVAL '75' MINUTE);
INSERT INTO telecom_graph_relationships VALUES (45, 36, 17, 'reports_signal', 0.744, 33, 12600, SYSTIMESTAMP - INTERVAL '3' DAY, SYSTIMESTAMP - INTERVAL '65' MINUTE);
INSERT INTO telecom_graph_relationships VALUES (46, 17, 36, 'escalates_case', 0.716, 19, 12600, SYSTIMESTAMP - INTERVAL '3' DAY, SYSTIMESTAMP - INTERVAL '65' MINUTE);
INSERT INTO telecom_graph_relationships VALUES (47, 31, 32, 'service_path', 0.684, 18, 5200, SYSTIMESTAMP - INTERVAL '9' DAY, SYSTIMESTAMP - INTERVAL '2' HOUR);
INSERT INTO telecom_graph_relationships VALUES (48, 10, 31, 'shares_site', 0.638, 14, 3600, SYSTIMESTAMP - INTERVAL '8' DAY, SYSTIMESTAMP - INTERVAL '3' HOUR);
INSERT INTO telecom_graph_relationships VALUES (49, 4, 27, 'reports_signal', 0.702, 17, 9200, SYSTIMESTAMP - INTERVAL '2' DAY, SYSTIMESTAMP - INTERVAL '1' HOUR);
INSERT INTO telecom_graph_relationships VALUES (50, 18, 36, 'reports_signal', 0.695, 14, 8800, SYSTIMESTAMP - INTERVAL '3' DAY, SYSTIMESTAMP - INTERVAL '2' HOUR);

INSERT INTO telecom_case_entities VALUES (1, 1, 6, 'seed_signal', 0.982, SYSTIMESTAMP);
INSERT INTO telecom_case_entities VALUES (2, 1, 1, 'subscriber_cluster', 0.944, SYSTIMESTAMP);
INSERT INTO telecom_case_entities VALUES (3, 1, 2, 'network_site', 0.921, SYSTIMESTAMP);
INSERT INTO telecom_case_entities VALUES (4, 1, 3, 'service_line', 0.881, SYSTIMESTAMP);
INSERT INTO telecom_case_entities VALUES (5, 1, 5, 'assigned_crew', 0.841, SYSTIMESTAMP);
INSERT INTO telecom_case_entities VALUES (6, 2, 12, 'seed_signal', 0.963, SYSTIMESTAMP);
INSERT INTO telecom_case_entities VALUES (7, 2, 9, 'affected_account', 0.891, SYSTIMESTAMP);
INSERT INTO telecom_case_entities VALUES (8, 2, 10, 'network_site', 0.902, SYSTIMESTAMP);
INSERT INTO telecom_case_entities VALUES (9, 2, 13, 'assigned_crew', 0.834, SYSTIMESTAMP);
INSERT INTO telecom_case_entities VALUES (10, 3, 17, 'support_case', 0.842, SYSTIMESTAMP);
INSERT INTO telecom_case_entities VALUES (11, 3, 15, 'subscriber_cluster', 0.812, SYSTIMESTAMP);
INSERT INTO telecom_case_entities VALUES (12, 3, 16, 'service_line', 0.734, SYSTIMESTAMP);
INSERT INTO telecom_case_entities VALUES (13, 4, 20, 'support_case', 0.904, SYSTIMESTAMP);
INSERT INTO telecom_case_entities VALUES (14, 4, 21, 'subscriber_cluster', 0.904, SYSTIMESTAMP);
INSERT INTO telecom_case_entities VALUES (15, 4, 23, 'assigned_crew', 0.711, SYSTIMESTAMP);
INSERT INTO telecom_case_entities VALUES (16, 1, 25, 'network_site', 0.941, SYSTIMESTAMP);
INSERT INTO telecom_case_entities VALUES (17, 1, 27, 'case_anchor', 0.776, SYSTIMESTAMP);
INSERT INTO telecom_case_entities VALUES (18, 1, 28, 'support_case', 0.932, SYSTIMESTAMP);
INSERT INTO telecom_case_entities VALUES (19, 1, 29, 'subscriber_cluster', 0.918, SYSTIMESTAMP);
INSERT INTO telecom_case_entities VALUES (20, 1, 30, 'assigned_crew', 0.809, SYSTIMESTAMP);
INSERT INTO telecom_case_entities VALUES (21, 2, 31, 'network_site', 0.873, SYSTIMESTAMP);
INSERT INTO telecom_case_entities VALUES (22, 2, 32, 'network_site', 0.936, SYSTIMESTAMP);
INSERT INTO telecom_case_entities VALUES (23, 2, 33, 'case_anchor', 0.763, SYSTIMESTAMP);
INSERT INTO telecom_case_entities VALUES (24, 2, 34, 'support_case', 0.917, SYSTIMESTAMP);
INSERT INTO telecom_case_entities VALUES (25, 3, 35, 'subscriber_cluster', 0.827, SYSTIMESTAMP);
INSERT INTO telecom_case_entities VALUES (26, 3, 36, 'case_anchor', 0.744, SYSTIMESTAMP);

COMMIT;

SELECT
  (SELECT COUNT(*) FROM telecom_graph_entities) AS telecom_graph_entities,
  (SELECT COUNT(*) FROM telecom_graph_relationships) AS telecom_graph_relationships,
  (SELECT COUNT(*) FROM telecom_experience_cases) AS telecom_experience_cases
FROM dual;
