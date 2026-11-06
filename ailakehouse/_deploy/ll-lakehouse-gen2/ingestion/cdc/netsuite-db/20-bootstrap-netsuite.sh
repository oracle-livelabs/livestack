#!/bin/bash
set -euo pipefail

MARKER_FILE="/opt/oracle/oradata/.netsuite_bootstrap_done"
PASSWORD_MARKER_FILE="/opt/oracle/oradata/.netsuite_bootstrap_password.sha256"
BOOTSTRAP_SQL="/tmp/bootstrap_netsuite_cdc.sql"
NETSUITE_PASSWORD="${NETSUITE_DB_PASSWORD:-${DBPASSWORD:-peakgear}}"
GG_SOURCE_PASSWORD="${GOLDENGATE_SOURCE_PASSWORD:-${NETSUITE_PASSWORD}}"
NETSUITE_PASSWORD_SQL="${NETSUITE_PASSWORD//\"/\"\"}"
GG_SOURCE_PASSWORD_SQL="${GG_SOURCE_PASSWORD//\"/\"\"}"

password_fingerprint() {
  if command -v sha256sum >/dev/null 2>&1; then
    printf '%s:%s' "${NETSUITE_PASSWORD}" "${GG_SOURCE_PASSWORD}" | sha256sum | awk '{print $1}'
  else
    printf '%s:%s' "${NETSUITE_PASSWORD}" "${GG_SOURCE_PASSWORD}" | cksum | awk '{print $1}'
  fi
}

PASSWORD_FINGERPRINT="$(password_fingerprint)"

echo "Waiting for FREEPDB1 before bootstrapping NetSuite CDC source"
for attempt in $(seq 1 80); do
  if echo "SELECT 1 FROM dual;" | sqlplus -L -s "system/${ORACLE_PWD:-oracle}@localhost:1521/FREEPDB1" >/dev/null 2>&1; then
    break
  fi
  if [ "${attempt}" = "80" ]; then
    echo "FREEPDB1 did not become available for NetSuite CDC bootstrap"
    exit 1
  fi
  sleep 10
done

if [ -f "${MARKER_FILE}" ]; then
  if [ -f "${PASSWORD_MARKER_FILE}" ] && [ "$(cat "${PASSWORD_MARKER_FILE}")" = "${PASSWORD_FINGERPRINT}" ]; then
    if sqlplus -L -s "/ as sysdba" >/dev/null <<'SQL'
WHENEVER SQLERROR EXIT SQL.SQLCODE
ALTER SESSION SET CONTAINER=FREEPDB1;
DECLARE
  l_open_users NUMBER;
  l_customer_tables NUMBER;
BEGIN
  SELECT COUNT(*) INTO l_open_users
  FROM dba_users
  WHERE username IN ('NETSUITE', 'GGADMIN')
    AND account_status = 'OPEN';

  SELECT COUNT(*) INTO l_customer_tables
  FROM dba_tables
  WHERE owner = 'NETSUITE'
    AND table_name = 'CUSTOMERS';

  IF l_open_users != 2 OR l_customer_tables != 1 THEN
    RAISE_APPLICATION_ERROR(-20000, 'NetSuite CDC bootstrap state is incomplete');
  END IF;
END;
/
EXIT
SQL
    then
      echo "NetSuite CDC source bootstrap already completed"
      exit 0
    fi
  fi

  echo "NetSuite CDC source bootstrap marker is stale; reapplying users, grants, and seed data"
fi

cat > "${BOOTSTRAP_SQL}" <<SQL
WHENEVER SQLERROR EXIT SQL.SQLCODE
SET SERVEROUTPUT ON
SET DEFINE OFF

ALTER SYSTEM SET enable_goldengate_replication=TRUE SCOPE=BOTH;
ALTER SYSTEM SET streams_pool_size=512M SCOPE=BOTH;

DECLARE
  l_min_logging VARCHAR2(8);
BEGIN
  SELECT supplemental_log_data_min INTO l_min_logging FROM v\$database;
  IF l_min_logging <> 'YES' THEN
    EXECUTE IMMEDIATE 'ALTER DATABASE ADD SUPPLEMENTAL LOG DATA';
  END IF;
END;
/

BEGIN
  EXECUTE IMMEDIATE 'ALTER DATABASE FORCE LOGGING';
EXCEPTION
  WHEN OTHERS THEN
    IF SQLCODE != -12920 THEN
      RAISE;
    END IF;
    DBMS_OUTPUT.PUT_LINE('Force logging already enabled');
END;
/

ALTER SESSION SET CONTAINER=FREEPDB1;

DECLARE
  l_count NUMBER;
BEGIN
  SELECT COUNT(*) INTO l_count FROM dba_users WHERE username = 'NETSUITE';
  IF l_count = 0 THEN
    EXECUTE IMMEDIATE 'CREATE USER NETSUITE IDENTIFIED BY "${NETSUITE_PASSWORD_SQL}" DEFAULT TABLESPACE USERS TEMPORARY TABLESPACE TEMP QUOTA UNLIMITED ON USERS';
  ELSE
    EXECUTE IMMEDIATE 'ALTER USER NETSUITE IDENTIFIED BY "${NETSUITE_PASSWORD_SQL}" ACCOUNT UNLOCK';
  END IF;

  SELECT COUNT(*) INTO l_count FROM dba_users WHERE username = 'GGADMIN';
  IF l_count = 0 THEN
    EXECUTE IMMEDIATE 'CREATE USER GGADMIN IDENTIFIED BY "${GG_SOURCE_PASSWORD_SQL}" DEFAULT TABLESPACE USERS TEMPORARY TABLESPACE TEMP QUOTA UNLIMITED ON USERS';
  ELSE
    EXECUTE IMMEDIATE 'ALTER USER GGADMIN IDENTIFIED BY "${GG_SOURCE_PASSWORD_SQL}" ACCOUNT UNLOCK';
  END IF;
END;
/

GRANT CREATE SESSION, CREATE TABLE, CREATE SEQUENCE, CREATE TRIGGER TO NETSUITE;
GRANT UNLIMITED TABLESPACE TO NETSUITE;
GRANT CREATE SESSION, CONNECT, RESOURCE TO GGADMIN;
GRANT SELECT ANY TABLE, FLASHBACK ANY TABLE, SELECT ANY TRANSACTION, SELECT ANY DICTIONARY TO GGADMIN;
GRANT ALTER SYSTEM, ALTER USER TO GGADMIN;
GRANT SELECT_CATALOG_ROLE, OGG_CAPTURE, EXP_FULL_DATABASE, DATAPUMP_EXP_FULL_DATABASE TO GGADMIN;
GRANT LOGMINING TO GGADMIN;
GRANT UNLIMITED TABLESPACE TO GGADMIN;

BEGIN
  DBMS_GOLDENGATE_AUTH.GRANT_ADMIN_PRIVILEGE('GGADMIN');
EXCEPTION
  WHEN OTHERS THEN
    DBMS_OUTPUT.PUT_LINE('GoldenGate admin privilege grant warning: ' || SQLERRM);
END;
/

DECLARE
  l_count NUMBER;
BEGIN
  SELECT COUNT(*) INTO l_count FROM dba_tables WHERE owner = 'NETSUITE' AND table_name = 'CUSTOMERS';
  IF l_count = 0 THEN
    EXECUTE IMMEDIATE q'[
      CREATE TABLE NETSUITE.CUSTOMERS (
        SOURCE_CUSTOMER_ID VARCHAR2(50) PRIMARY KEY,
        CUSTOMER_NAME      VARCHAR2(200) NOT NULL,
        CUSTOMER_TYPE      VARCHAR2(30) NOT NULL,
        EMAIL              VARCHAR2(300),
        PHONE              VARCHAR2(40),
        LOYALTY_TIER       VARCHAR2(40),
        MARKET_SEGMENT     VARCHAR2(120),
        AGE                NUMBER(3),
        INCOME             NUMBER(12,2),
        REGISTRATION_DATE  TIMESTAMP,
        SOURCE_SYSTEM      VARCHAR2(40) DEFAULT 'NetSuite' NOT NULL,
        CREATED_AT         TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL,
        UPDATED_AT         TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL
      )
    ]';
  END IF;
END;
/

CREATE OR REPLACE TRIGGER NETSUITE.CUSTOMERS_BIU
BEFORE INSERT OR UPDATE ON NETSUITE.CUSTOMERS
FOR EACH ROW
BEGIN
  IF INSERTING THEN
    :NEW.CREATED_AT := COALESCE(:NEW.CREATED_AT, SYSTIMESTAMP);
  END IF;
  :NEW.UPDATED_AT := SYSTIMESTAMP;
  :NEW.SOURCE_SYSTEM := COALESCE(:NEW.SOURCE_SYSTEM, 'NetSuite');
END;
/

MERGE INTO NETSUITE.CUSTOMERS target
USING (
  SELECT 'NS10001' SOURCE_CUSTOMER_ID, 'Maya Chen' CUSTOMER_NAME, 'B2C' CUSTOMER_TYPE, 'maya.chen@peakgear.example' EMAIL, '+1-415-555-0101' PHONE, 'GOLD' LOYALTY_TIER, 'Trail Running' MARKET_SEGMENT, 34 AGE, 118500 INCOME, TIMESTAMP '2024-01-12 09:30:00' REGISTRATION_DATE FROM dual UNION ALL
  SELECT 'NS10002', 'Jordan Ellis', 'B2C', 'jordan.ellis@trailmail.example', '+1-503-555-0184', 'SILVER', 'Outdoor Fitness', 41, 94200, TIMESTAMP '2023-11-03 14:15:00' FROM dual UNION ALL
  SELECT 'NS10003', 'Priya Nair', 'B2B', 'priya.nair@summitco.example', '+1-650-555-0128', 'PLATINUM', 'Corporate Wellness', 38, 164000, TIMESTAMP '2022-08-19 10:45:00' FROM dual UNION ALL
  SELECT 'NS10004', 'Diego Ramirez', 'B2C', 'diego.ramirez@outdoorhub.example', '+1-512-555-0142', 'BRONZE', 'Cycling', 29, 72000, TIMESTAMP '2025-02-07 16:20:00' FROM dual UNION ALL
  SELECT 'NS10005', 'Avery Brooks', 'B2C', 'avery.brooks@peakgear.example', '+1-206-555-0193', 'GOLD', 'Hiking', 46, 132750, TIMESTAMP '2023-04-22 11:10:00' FROM dual UNION ALL
  SELECT 'NS10006', 'Noah Stein', 'B2B', 'noah.stein@northclub.example', '+1-312-555-0165', 'SILVER', 'Team Sports', 52, 109400, TIMESTAMP '2021-12-14 13:05:00' FROM dual UNION ALL
  SELECT 'NS10007', 'Lina Okafor', 'B2C', 'lina.okafor@trailmail.example', '+1-404-555-0119', 'PLATINUM', 'Performance Training', 31, 151200, TIMESTAMP '2024-07-09 08:55:00' FROM dual UNION ALL
  SELECT 'NS10008', 'Sofia Martinez', 'B2C', 'sofia.martinez@peakgear.example', '+1-786-555-0136', 'SILVER', 'Yoga', 27, 68500, TIMESTAMP '2025-01-28 15:40:00' FROM dual UNION ALL
  SELECT 'NS10009', 'Ethan Park', 'B2C', 'ethan.park@outdoorhub.example', '+1-213-555-0181', 'GOLD', 'Climbing', 36, 124300, TIMESTAMP '2022-10-05 12:25:00' FROM dual UNION ALL
  SELECT 'NS10010', 'Amara Johnson', 'B2B', 'amara.johnson@urbanfit.example', '+1-646-555-0177', 'BRONZE', 'Retail Partner', 44, 98750, TIMESTAMP '2023-06-17 09:05:00' FROM dual UNION ALL
  SELECT 'NS10011', 'Felix Weber', 'B2C', 'felix.weber@summitco.example', '+1-720-555-0123', 'SILVER', 'Skiing', 39, 116800, TIMESTAMP '2024-12-02 17:30:00' FROM dual UNION ALL
  SELECT 'NS10012', 'Nora Haddad', 'B2C', 'nora.haddad@peakgear.example', '+1-617-555-0162', 'GOLD', 'Running', 33, 105600, TIMESTAMP '2023-09-25 10:00:00' FROM dual UNION ALL
  SELECT 'NS10013', 'Kai Thompson', 'B2C', 'kai.thompson@trailmail.example', '+1-808-555-0149', 'BRONZE', 'Surf Training', 25, 59300, TIMESTAMP '2025-03-18 14:50:00' FROM dual UNION ALL
  SELECT 'NS10014', 'Elena Rossi', 'B2B', 'elena.rossi@alpineworks.example', '+1-303-555-0198', 'PLATINUM', 'Wholesale', 48, 188200, TIMESTAMP '2022-05-31 11:35:00' FROM dual UNION ALL
  SELECT 'NS10015', 'Marcus Green', 'B2C', 'marcus.green@outdoorhub.example', '+1-901-555-0115', 'SILVER', 'Basketball', 42, 87400, TIMESTAMP '2021-07-16 13:45:00' FROM dual UNION ALL
  SELECT 'NS10016', 'Tessa Morgan', 'B2C', 'tessa.morgan@peakgear.example', '+1-602-555-0188', 'GOLD', 'Triathlon', 37, 143900, TIMESTAMP '2024-03-08 09:25:00' FROM dual UNION ALL
  SELECT 'NS10017', 'Ravi Shah', 'B2B', 'ravi.shah@fitfleet.example', '+1-214-555-0166', 'SILVER', 'Corporate Fitness', 45, 129500, TIMESTAMP '2023-01-20 12:10:00' FROM dual UNION ALL
  SELECT 'NS10018', 'Isla Campbell', 'B2C', 'isla.campbell@trailmail.example', '+1-801-555-0172', 'BRONZE', 'Camping', 28, 64100, TIMESTAMP '2025-04-04 16:05:00' FROM dual UNION ALL
  SELECT 'NS10019', 'Owen Miller', 'B2C', 'owen.miller@summitco.example', '+1-314-555-0131', 'GOLD', 'Golf', 54, 158700, TIMESTAMP '2022-09-13 10:30:00' FROM dual UNION ALL
  SELECT 'NS10020', 'Grace Turner', 'B2C', 'grace.turner@peakgear.example', '+1-704-555-0191', 'SILVER', 'Women Fitness', 32, 93400, TIMESTAMP '2024-05-27 08:40:00' FROM dual UNION ALL
  SELECT 'NS10021', 'Leo Svensson', 'B2B', 'leo.svensson@nordictrail.example', '+1-971-555-0157', 'PLATINUM', 'Outdoor Retail', 50, 201600, TIMESTAMP '2021-11-11 15:55:00' FROM dual UNION ALL
  SELECT 'NS10022', 'Hannah Bauer', 'B2C', 'hannah.bauer@outdoorhub.example', '+1-414-555-0124', 'BRONZE', 'Family Recreation', 40, 81200, TIMESTAMP '2023-08-06 11:50:00' FROM dual UNION ALL
  SELECT 'NS10023', 'Mateo Alvarez', 'B2C', 'mateo.alvarez@trailmail.example', '+1-915-555-0186', 'GOLD', 'Soccer', 30, 101900, TIMESTAMP '2024-10-21 14:35:00' FROM dual UNION ALL
  SELECT 'NS10024', 'Chloe Bennett', 'B2C', 'chloe.bennett@peakgear.example', '+1-615-555-0169', 'SILVER', 'Pilates', 35, 97750, TIMESTAMP '2022-02-24 09:15:00' FROM dual
) source
ON (target.SOURCE_CUSTOMER_ID = source.SOURCE_CUSTOMER_ID)
WHEN MATCHED THEN UPDATE SET
  target.CUSTOMER_NAME = source.CUSTOMER_NAME,
  target.CUSTOMER_TYPE = source.CUSTOMER_TYPE,
  target.EMAIL = source.EMAIL,
  target.PHONE = source.PHONE,
  target.LOYALTY_TIER = source.LOYALTY_TIER,
  target.MARKET_SEGMENT = source.MARKET_SEGMENT,
  target.AGE = source.AGE,
  target.INCOME = source.INCOME,
  target.REGISTRATION_DATE = source.REGISTRATION_DATE
WHEN NOT MATCHED THEN INSERT (
  SOURCE_CUSTOMER_ID,
  CUSTOMER_NAME,
  CUSTOMER_TYPE,
  EMAIL,
  PHONE,
  LOYALTY_TIER,
  MARKET_SEGMENT,
  AGE,
  INCOME,
  REGISTRATION_DATE
) VALUES (
  source.SOURCE_CUSTOMER_ID,
  source.CUSTOMER_NAME,
  source.CUSTOMER_TYPE,
  source.EMAIL,
  source.PHONE,
  source.LOYALTY_TIER,
  source.MARKET_SEGMENT,
  source.AGE,
  source.INCOME,
  source.REGISTRATION_DATE
);

GRANT SELECT, INSERT, UPDATE, DELETE ON NETSUITE.CUSTOMERS TO GGADMIN;

DECLARE
  l_count NUMBER;
BEGIN
  SELECT COUNT(*) INTO l_count
  FROM dba_log_groups
  WHERE owner = 'NETSUITE'
    AND table_name = 'CUSTOMERS'
    AND log_group_type = 'ALL COLUMN LOGGING';

  IF l_count = 0 THEN
    EXECUTE IMMEDIATE 'ALTER TABLE NETSUITE.CUSTOMERS ADD SUPPLEMENTAL LOG DATA (ALL) COLUMNS';
  END IF;
END;
/

COMMIT;
SQL

echo "Bootstrapping NETSUITE.CUSTOMERS and GoldenGate privileges"
sqlplus -L -s "/ as sysdba" @"${BOOTSTRAP_SQL}"
touch "${MARKER_FILE}"
printf '%s\n' "${PASSWORD_FINGERPRINT}" > "${PASSWORD_MARKER_FILE}"
echo "NetSuite CDC source bootstrap completed"
