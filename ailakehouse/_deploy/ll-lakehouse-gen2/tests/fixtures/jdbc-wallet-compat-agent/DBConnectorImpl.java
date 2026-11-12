package oracle.wlevs.strex.common.sourcetargettype.db;

import java.util.Map;

/** Test double for OSA's publication-time JDBC target validation boundary. */
public final class DBConnectorImpl {
  private DBConnectorImpl() {
  }

  public static String getADWConnectionString(Map<String, String> values) {
    return "untransformed";
  }

  public static String getWalletArchiveName(Map<String, String> values) {
    return values.get("wallet");
  }
}
