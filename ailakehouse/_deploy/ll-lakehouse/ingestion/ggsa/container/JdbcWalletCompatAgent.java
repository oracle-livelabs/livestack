package com.oracle.livelabs.osa;

import java.lang.instrument.ClassFileTransformer;
import java.lang.instrument.Instrumentation;
import java.security.ProtectionDomain;
import java.util.Properties;
import jdk.internal.org.objectweb.asm.ClassReader;
import jdk.internal.org.objectweb.asm.ClassVisitor;
import jdk.internal.org.objectweb.asm.ClassWriter;
import jdk.internal.org.objectweb.asm.MethodVisitor;
import jdk.internal.org.objectweb.asm.Opcodes;

/**
 * Repairs the OSA 26.1 wallet connector's legacy JDBC URL form.
 *
 * OSA generates jdbc:oracle:thin:user/password@service?TNS_ADMIN=... for a
 * wallet connection. Current Oracle JDBC drivers reject that form. The final
 * OracleDriver.connect boundary translates it to a standard service URL and
 * JDBC connection properties for Spark. OSA validates a new JDBC target
 * earlier through DBConnectorImpl and OracleDataSource, which bypasses the
 * driver boundary, so that one URL factory is rewritten as well.
 */
public final class JdbcWalletCompatAgent {
  private static final String ORACLE_DRIVER = "oracle/jdbc/driver/OracleDriver";
  private static final String OSA_DB_CONNECTOR =
      "oracle/wlevs/strex/common/sourcetargettype/db/DBConnectorImpl";
  private static final String ORACLE_DRIVER_CONNECT =
      "(Ljava/lang/String;Ljava/util/Properties;)Ljava/sql/Connection;";
  private static final String MAP_GET = "(Ljava/lang/Object;)Ljava/lang/Object;";
  private static final String LEGACY_PREFIX = "jdbc:oracle:thin:";
  private static final String STANDARD_PREFIX = "jdbc:oracle:thin:@";
  private static final String TNS_ADMIN_MARKER = "?TNS_ADMIN=";

  private JdbcWalletCompatAgent() {
  }

  public static void premain(String ignored, Instrumentation instrumentation) {
    WalletUrlTransformer transformer = new WalletUrlTransformer();
    instrumentation.addTransformer(transformer, true);
    for (Class<?> loadedClass : instrumentation.getAllLoadedClasses()) {
      if (!WalletUrlTransformer.isTargetClass(loadedClass.getName().replace('.', '/'))
          || !instrumentation.isModifiableClass(loadedClass)) {
        continue;
      }
      try {
        instrumentation.retransformClasses(loadedClass);
      } catch (Throwable ignoredFailure) {
        // A class loaded by a restricted OSA class loader remains eligible for
        // the normal first-load transform in later executor JVMs.
      }
    }
  }

  private static final class WalletUrlTransformer implements ClassFileTransformer {
    private static boolean isTargetClass(String className) {
      return ORACLE_DRIVER.equals(className) || OSA_DB_CONNECTOR.equals(className);
    }

    @Override
    public byte[] transform(
        Module module,
        ClassLoader loader,
        String className,
        Class<?> classBeingRedefined,
        ProtectionDomain protectionDomain,
        byte[] classfileBuffer) {
      if (!isTargetClass(className)) {
        return null;
      }

      ClassReader reader = new ClassReader(classfileBuffer);
      // The agent only prepends straight-line instructions. Recomputing frames
      // makes ASM resolve Oracle JDBC types through the agent class loader,
      // which cannot see all driver-internal classes in the executor.
      ClassWriter writer = new ClassWriter(reader, ClassWriter.COMPUTE_MAXS);
      reader.accept(new ClassVisitor(Opcodes.ASM9, writer) {
        @Override
        public MethodVisitor visitMethod(
            int access,
            String name,
            String descriptor,
            String signature,
            String[] exceptions) {
          MethodVisitor delegate = super.visitMethod(access, name, descriptor, signature, exceptions);
          if ("connect".equals(name) && ORACLE_DRIVER_CONNECT.equals(descriptor)) {
            return normalizeJdbcDriverConnect(delegate);
          }
          if (OSA_DB_CONNECTOR.equals(className)
              && "getADWConnectionString".equals(name)
              && "(Ljava/util/Map;)Ljava/lang/String;".equals(descriptor)) {
            return osaWalletUrlFactory(delegate);
          }
          return delegate;
        }
      }, 0);
      return writer.toByteArray();
    }

    private static MethodVisitor normalizeJdbcDriverConnect(MethodVisitor delegate) {
      return new MethodVisitor(Opcodes.ASM9, delegate) {
        @Override
        public void visitCode() {
          super.visitCode();
          visitVarInsn(Opcodes.ALOAD, 1);
          visitVarInsn(Opcodes.ALOAD, 2);
          visitMethodInsn(
              Opcodes.INVOKESTATIC,
              "com/oracle/livelabs/osa/JdbcWalletCompatAgent",
              "normalizeWalletUrlForDriver",
              "(Ljava/lang/String;Ljava/util/Properties;)Ljava/lang/String;",
              false);
          visitVarInsn(Opcodes.ASTORE, 1);
        }
      };
    }

    private static MethodVisitor osaWalletUrlFactory(MethodVisitor delegate) {
      return new MethodVisitor(Opcodes.ASM9) {
        @Override
        public void visitEnd() {
          delegate.visitCode();
          mapValue(delegate, "serviceNameOrSIDInput", 1);
          mapValue(delegate, "userName", 2);
          mapValue(delegate, "password", 3);
          delegate.visitVarInsn(Opcodes.ALOAD, 0);
          delegate.visitMethodInsn(
              Opcodes.INVOKESTATIC,
              OSA_DB_CONNECTOR,
              "getWalletArchiveName",
              "(Ljava/util/Map;)Ljava/lang/String;",
              false);
          delegate.visitVarInsn(Opcodes.ASTORE, 4);

          delegate.visitTypeInsn(Opcodes.NEW, "java/lang/StringBuilder");
          delegate.visitInsn(Opcodes.DUP);
          delegate.visitLdcInsn(STANDARD_PREFIX);
          delegate.visitMethodInsn(
              Opcodes.INVOKESPECIAL,
              "java/lang/StringBuilder",
              "<init>",
              "(Ljava/lang/String;)V",
              false);
          append(delegate, 1, false);
          delegate.visitLdcInsn("?TNS_ADMIN=");
          delegate.visitMethodInsn(
              Opcodes.INVOKEVIRTUAL,
              "java/lang/StringBuilder",
              "append",
              "(Ljava/lang/String;)Ljava/lang/StringBuilder;",
              false);
          append(delegate, 4, false);
          delegate.visitLdcInsn("&user=");
          delegate.visitMethodInsn(
              Opcodes.INVOKEVIRTUAL,
              "java/lang/StringBuilder",
              "append",
              "(Ljava/lang/String;)Ljava/lang/StringBuilder;",
              false);
          append(delegate, 2, true);
          delegate.visitLdcInsn("&password=");
          delegate.visitMethodInsn(
              Opcodes.INVOKEVIRTUAL,
              "java/lang/StringBuilder",
              "append",
              "(Ljava/lang/String;)Ljava/lang/StringBuilder;",
              false);
          append(delegate, 3, true);
          delegate.visitLdcInsn("&oracle.net.ssl_server_dn_match=false");
          delegate.visitMethodInsn(
              Opcodes.INVOKEVIRTUAL,
              "java/lang/StringBuilder",
              "append",
              "(Ljava/lang/String;)Ljava/lang/StringBuilder;",
              false);
          delegate.visitMethodInsn(
              Opcodes.INVOKEVIRTUAL,
              "java/lang/StringBuilder",
              "toString",
              "()Ljava/lang/String;",
              false);
          delegate.visitInsn(Opcodes.ARETURN);
          delegate.visitMaxs(0, 0);
          delegate.visitEnd();
        }
      };
    }

    private static void mapValue(MethodVisitor visitor, String key, int localVariable) {
      visitor.visitVarInsn(Opcodes.ALOAD, 0);
      visitor.visitLdcInsn(key);
      visitor.visitMethodInsn(
          Opcodes.INVOKEINTERFACE,
          "java/util/Map",
          "get",
          MAP_GET,
          true);
      visitor.visitTypeInsn(Opcodes.CHECKCAST, "java/lang/String");
      visitor.visitVarInsn(Opcodes.ASTORE, localVariable);
    }

    private static void append(MethodVisitor visitor, int localVariable, boolean encode) {
      visitor.visitVarInsn(Opcodes.ALOAD, localVariable);
      if (encode) {
        visitor.visitFieldInsn(
            Opcodes.GETSTATIC,
            "java/nio/charset/StandardCharsets",
            "UTF_8",
            "Ljava/nio/charset/Charset;");
        visitor.visitMethodInsn(
            Opcodes.INVOKESTATIC,
            "java/net/URLEncoder",
            "encode",
            "(Ljava/lang/String;Ljava/nio/charset/Charset;)Ljava/lang/String;",
            false);
      }
      visitor.visitMethodInsn(
          Opcodes.INVOKEVIRTUAL,
          "java/lang/StringBuilder",
          "append",
          "(Ljava/lang/String;)Ljava/lang/StringBuilder;",
          false);
    }
  }

  public static String normalizeWalletUrlForDriver(String value, Properties properties) {
    if (value == null
        || properties == null
        || !value.startsWith(LEGACY_PREFIX)
        || value.startsWith(STANDARD_PREFIX)) {
      return value;
    }
    int tns = value.indexOf(TNS_ADMIN_MARKER, LEGACY_PREFIX.length());
    int slash = value.indexOf('/', LEGACY_PREFIX.length());
    if (tns < 0 || slash < 0 || slash >= tns) {
      return value;
    }
    // The password can contain @, so the final @ before TNS_ADMIN separates
    // the credentials from the service name.
    int at = value.lastIndexOf('@', tns);
    if (at < 0 || slash > at) {
      return value;
    }
    String user = value.substring(LEGACY_PREFIX.length(), slash);
    String password = value.substring(slash + 1, at);
    String service = value.substring(at + 1, tns);
    String wallet = value.substring(tns + TNS_ADMIN_MARKER.length());
    // Only modify the exact legacy OSA form. Future URL variants remain for
    // the driver rather than risking a partial interpretation here.
    if (user.isEmpty() || password.isEmpty() || service.isEmpty() || wallet.isEmpty()
        || wallet.indexOf('&') >= 0) {
      return value;
    }
    properties.setProperty("oracle.net.tns_admin", wallet);
    properties.setProperty("user", user);
    properties.setProperty("password", password);
    properties.setProperty("oracle.net.ssl_server_dn_match", "false");
    return STANDARD_PREFIX + service;
  }
}
