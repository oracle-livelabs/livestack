import java.util.Properties;
import oracle.jdbc.driver.OracleDriver;
import oracle.wlevs.strex.common.sourcetargettype.db.DBConnectorImpl;

public final class JdbcWalletCompatAgentHarness {
  public static void main(String[] args) throws Exception {
    Properties legacyProperties = new Properties();
    new OracleDriver().connect(
        "jdbc:oracle:thin:PG/pass@word@atp_example_high?TNS_ADMIN=/tmp/wallet",
        legacyProperties);

    assertEquals("jdbc:oracle:thin:@atp_example_high", OracleDriver.lastUrl, "rewritten URL");
    assertEquals("/tmp/wallet", legacyProperties.getProperty("oracle.net.tns_admin"), "TNS admin");
    assertEquals("PG", legacyProperties.getProperty("user"), "user");
    assertEquals("pass@word", legacyProperties.getProperty("password"), "password");
    assertEquals(
        "false",
        legacyProperties.getProperty("oracle.net.ssl_server_dn_match"),
        "SSL DN match");

    Properties standardProperties = new Properties();
    standardProperties.setProperty("marker", "keep");
    new OracleDriver().connect("jdbc:oracle:thin:@already_standard", standardProperties);
    assertEquals("jdbc:oracle:thin:@already_standard", OracleDriver.lastUrl, "standard URL");
    assertEquals("keep", standardProperties.getProperty("marker"), "unchanged property");
    if (standardProperties.size() != 1) {
      throw new AssertionError("Standard JDBC URL properties were unexpectedly changed");
    }

    java.util.Map<String, String> targetValues = new java.util.HashMap<>();
    targetValues.put("serviceNameOrSIDInput", "atp_example_high");
    targetValues.put("userName", "PG");
    targetValues.put("password", "pass@word");
    targetValues.put("wallet", "/tmp/wallet");
    assertEquals(
        "jdbc:oracle:thin:@atp_example_high?TNS_ADMIN=/tmp/wallet&user=PG&password=pass%40word"
            + "&oracle.net.ssl_server_dn_match=false",
        DBConnectorImpl.getADWConnectionString(targetValues),
        "OSA target validation URL");
  }

  private static void assertEquals(String expected, String actual, String label) {
    if (!expected.equals(actual)) {
      throw new AssertionError(label + ": expected " + expected + ", got " + actual);
    }
  }
}
