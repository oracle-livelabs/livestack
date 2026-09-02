package com.oracle.livelabs.osa;

import java.lang.instrument.ClassFileTransformer;
import java.lang.instrument.Instrumentation;
import java.security.ProtectionDomain;
import jdk.internal.org.objectweb.asm.ClassReader;
import jdk.internal.org.objectweb.asm.ClassVisitor;
import jdk.internal.org.objectweb.asm.ClassWriter;
import jdk.internal.org.objectweb.asm.MethodVisitor;
import jdk.internal.org.objectweb.asm.Opcodes;

/**
 * Repairs the OSA 26.1 wallet connector's legacy JDBC URL form.
 *
 * OSA generates jdbc:oracle:thin:user/password@service?TNS_ADMIN=... for a
 * wallet connection. Current Oracle JDBC drivers reject that form. The agent
 * changes only the wallet URL factory to the supported URL/query-property
 * form while preserving the OSA-managed local wallet path replacement.
 */
public final class JdbcWalletCompatAgent {
  private static final String TARGET =
      "oracle/wlevs/strex/common/sourcetargettype/db/DBConnectorImpl";
  private static final String SPARK_DB_REFERENCE =
      "oracle/wlevs/strex/spark/model/DbReferenceBuilder";
  private static final String MAP_GET = "(Ljava/lang/Object;)Ljava/lang/Object;";

  private JdbcWalletCompatAgent() {
  }

  public static void premain(String ignored, Instrumentation instrumentation) {
    instrumentation.addTransformer(new WalletUrlTransformer(), false);
  }

  private static final class WalletUrlTransformer implements ClassFileTransformer {
    @Override
    public byte[] transform(
        Module module,
        ClassLoader loader,
        String className,
        Class<?> classBeingRedefined,
        ProtectionDomain protectionDomain,
        byte[] classfileBuffer) {
      if (!TARGET.equals(className) && !SPARK_DB_REFERENCE.equals(className)) {
        return null;
      }

      ClassReader reader = new ClassReader(classfileBuffer);
      ClassWriter writer = new ClassWriter(reader, ClassWriter.COMPUTE_FRAMES | ClassWriter.COMPUTE_MAXS);
      reader.accept(new ClassVisitor(Opcodes.ASM9, writer) {
        @Override
        public MethodVisitor visitMethod(
            int access,
            String name,
            String descriptor,
            String signature,
            String[] exceptions) {
          MethodVisitor delegate = super.visitMethod(access, name, descriptor, signature, exceptions);
          if (TARGET.equals(className)
              && "getADWConnectionString".equals(name)
              && "(Ljava/util/Map;)Ljava/lang/String;".equals(descriptor)) {
            return walletUrlFactory(delegate);
          }
          if (SPARK_DB_REFERENCE.equals(className)
              && "getConnectionString".equals(name)
              && "()Ljava/lang/String;".equals(descriptor)) {
            return sparkConnectionString(delegate);
          }
          return delegate;
        }
      }, 0);
      return writer.toByteArray();
    }

    private static MethodVisitor walletUrlFactory(MethodVisitor delegate) {
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
              TARGET,
              "getWalletArchiveName",
              "(Ljava/util/Map;)Ljava/lang/String;",
              false);
          delegate.visitVarInsn(Opcodes.ASTORE, 4);

          delegate.visitTypeInsn(Opcodes.NEW, "java/lang/StringBuilder");
          delegate.visitInsn(Opcodes.DUP);
          delegate.visitLdcInsn("jdbc:oracle:thin:@");
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

    private static MethodVisitor sparkConnectionString(MethodVisitor delegate) {
      return new MethodVisitor(Opcodes.ASM9) {
        @Override
        public void visitEnd() {
          delegate.visitCode();
          delegate.visitVarInsn(Opcodes.ALOAD, 0);
          delegate.visitFieldInsn(
              Opcodes.GETFIELD,
              SPARK_DB_REFERENCE,
              "connectionString",
              "Ljava/lang/String;");
          delegate.visitMethodInsn(
              Opcodes.INVOKESTATIC,
              "oracle/wlevs/strex/common/utils/Cryptor",
              "decrypt",
              "(Ljava/lang/String;)Ljava/lang/String;",
              false);
          delegate.visitMethodInsn(
              Opcodes.INVOKESTATIC,
              "com/oracle/livelabs/osa/JdbcWalletCompatAgent",
              "normalizeLegacyWalletUrl",
              "(Ljava/lang/String;)Ljava/lang/String;",
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

  public static String normalizeLegacyWalletUrl(String value) {
    String prefix = "jdbc:oracle:thin:";
    if (value == null || !value.startsWith(prefix) || value.startsWith(prefix + "@")) {
      return value;
    }

    int at = value.indexOf('@', prefix.length());
    int slash = value.indexOf('/', prefix.length());
    if (slash < prefix.length() || at < slash + 1) {
      return value;
    }

    String credentials = value.substring(prefix.length(), at);
    int credentialSlash = credentials.indexOf('/');
    if (credentialSlash <= 0 || credentialSlash == credentials.length() - 1) {
      return value;
    }

    String endpoint = value.substring(at + 1);
    int tns = endpoint.indexOf("?TNS_ADMIN=");
    if (tns <= 0) {
      return value;
    }

    String service = endpoint.substring(0, tns);
    String walletAndOptions = endpoint.substring(tns + "?TNS_ADMIN=".length());
    int optionStart = walletAndOptions.indexOf('&');
    String wallet = optionStart < 0 ? walletAndOptions : walletAndOptions.substring(0, optionStart);
    String options = optionStart < 0 ? "" : walletAndOptions.substring(optionStart);
    String user = credentials.substring(0, credentialSlash);
    String password = credentials.substring(credentialSlash + 1);

    return prefix + "@" + service + "?TNS_ADMIN=" + wallet
        + options + "&user=" + java.net.URLEncoder.encode(user, java.nio.charset.StandardCharsets.UTF_8)
        + "&password=" + java.net.URLEncoder.encode(password, java.nio.charset.StandardCharsets.UTF_8)
        + "&oracle.net.ssl_server_dn_match=false";
  }
}
