#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TEST_DIR="$(mktemp -d)"
trap 'rm -rf "${TEST_DIR}"' EXIT
source "${ROOT}/ingestion/ggsa/container/entrypoint.sh"
trap 'rm -rf "${TEST_DIR}"' EXIT

OSA_PUBLIC_HOST=osa.example.com
OSA_ENABLE_SSL=true
OSA_API_SERVER_SPORT=8085
OSA_API_SERVER_PORT=9080
detect_public_host() { printf '%s' 192.0.2.7; }
origins="$(osa_websocket_origins)"
[[ "$origins" == 'https://osa.example.com:8085,https://192.0.2.7:8085' ]]
OSA_ENABLE_SSL=false
[[ "$(osa_websocket_origins)" == 'http://osa.example.com:9080,http://192.0.2.7:9080' ]]
OSA_ENABLE_SSL=true
OSA_PUBLIC_HOST=192.0.2.7
[[ "$(osa_websocket_origins)" == 'https://192.0.2.7:8085' ]]
OSA_PUBLIC_HOST=osa.example.com
detect_public_host() { return 1; }
[[ "$(osa_websocket_origins)" == 'https://osa.example.com:8085' ]]
detect_public_host() { printf '%s' '192.0.2.999'; }
[[ "$(osa_websocket_origins)" == 'https://osa.example.com:8085' ]]

cat > "$TEST_DIR/KafkaWebsocketEndpoint.java" <<'JAVA'
package oracle.wlevs.strex.kafkaws;
import java.util.List;
public class KafkaWebsocketEndpoint {
  public static class Configurator {
    public String getBearerTokenFromCookies(List<String> cookies) { throw new AssertionError("Not patched"); }
    public boolean checkOrigin(String origin) { throw new AssertionError("Not patched"); }
    public boolean validateToken(String token) { return "valid".equals(token); }
  }
}
JAVA
cat > "$TEST_DIR/Probe.java" <<'JAVA'
import java.util.*;
import oracle.wlevs.strex.kafkaws.KafkaWebsocketEndpoint.Configurator;
public class Probe {
  public static void main(String[] args) {
    Configurator c = new Configurator();
    for (var headers : List.of(List.of("Bearer=valid"), List.of("a=1; Bearer=valid; z=2"), List.of("a=1", "Bearer=valid"))) {
      if (!"valid".equals(c.getBearerTokenFromCookies(headers))) throw new AssertionError("Cookie order");
    }
    for (var headers : List.of(List.of("a=1"), List.of("Bearer="), List.of("Bearer=one; Bearer=two"))) {
      if (c.getBearerTokenFromCookies(headers) != null) throw new AssertionError("Invalid cookie");
    }
    if (c.getBearerTokenFromCookies(null) != null) throw new AssertionError("Null cookies");
    for (String origin : args) if (!c.checkOrigin(origin)) throw new AssertionError("Expected origin");
    for (String origin : List.of("https://evil.example:8085", args[0]+".evil.example", "null", args[0]+"/", args[0].replace("https:","http:"))) {
      if (c.checkOrigin(origin)) throw new AssertionError("Unexpected origin");
    }
    if (c.checkOrigin(null) || c.validateToken("invalid") || !c.validateToken("valid")) throw new AssertionError("Authentication changed");
    System.out.println("WebSocket transformation, cookie, origin and authentication checks passed.");
  }
}
JAVA
JAVA_BIN="${JAVA_HOME:+${JAVA_HOME}/bin/}java"
JAVAC_BIN="${JAVA_HOME:+${JAVA_HOME}/bin/}javac"
JAR_BIN="${JAVA_HOME:+${JAVA_HOME}/bin/}jar"
mkdir "$TEST_DIR/classes"
"$JAVAC_BIN" --add-exports java.base/jdk.internal.org.objectweb.asm=ALL-UNNAMED -d "$TEST_DIR/classes" \
  "$ROOT/ingestion/ggsa/container/OsaWebsocketCompatAgent.java" "$TEST_DIR/KafkaWebsocketEndpoint.java" "$TEST_DIR/Probe.java"
printf 'Premain-Class: com.oracle.livelabs.osa.OsaWebsocketCompatAgent\nCan-Retransform-Classes: true\n' > "$TEST_DIR/manifest"
"$JAR_BIN" --create --file "$TEST_DIR/agent.jar" --manifest "$TEST_DIR/manifest" -C "$TEST_DIR/classes" com
"$JAVA_BIN" --add-exports java.base/jdk.internal.org.objectweb.asm=ALL-UNNAMED \
  "-javaagent:$TEST_DIR/agent.jar=$origins" -cp "$TEST_DIR/classes" Probe https://osa.example.com:8085 https://192.0.2.7:8085
