/* Remove obsolete package-global VPD artifacts after all policies are migrated. */

BEGIN
  FOR object_row IN (
    SELECT object_name, object_type
      FROM user_objects
     WHERE object_type = 'FUNCTION'
       AND object_name IN (
         'VPD_FULFILLMENT_REGION',
         'VPD_ORDERS_REGION',
         'VPD_GRAPH_INFLUENCERS',
         'VPD_GRAPH_SOCIAL_POSTS',
         'VPD_GRAPH_CONNECTIONS',
         'VPD_GRAPH_BRAND_LINKS',
         'VPD_GRAPH_MENTIONS'
       )
  ) LOOP
    EXECUTE IMMEDIATE 'DROP FUNCTION ' || DBMS_ASSERT.SIMPLE_SQL_NAME(object_row.object_name);
  END LOOP;

  FOR package_row IN (
    SELECT object_name
      FROM user_objects
     WHERE object_type = 'PACKAGE'
       AND object_name = 'SC_SECURITY_CTX'
  ) LOOP
    EXECUTE IMMEDIATE 'DROP PACKAGE ' || DBMS_ASSERT.SIMPLE_SQL_NAME(package_row.object_name);
  END LOOP;
END;
/

SELECT 'Legacy package-global VPD artifacts removed.' AS status FROM dual;
