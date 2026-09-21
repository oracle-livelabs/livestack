package oracle.jdbc.driver;

import java.sql.Connection;
import java.util.Properties;

/** Test double for the Oracle JDBC driver boundary transformed by the agent. */
public final class OracleDriver {
  public static String lastUrl;
  public static Properties lastProperties;

  public Connection connect(String url, Properties properties) {
    lastUrl = url;
    lastProperties = new Properties();
    lastProperties.putAll(properties);
    return null;
  }
}
