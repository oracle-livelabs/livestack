package com.oracle.livelabs.osa;

import java.lang.instrument.*;
import java.security.ProtectionDomain;
import java.util.List;
import jdk.internal.org.objectweb.asm.*;

/** Fixes request-cookie parsing and restricts preview connections to startup-discovered origins. */
public final class OsaWebsocketCompatAgent {
  private static final String TARGET = "oracle/wlevs/strex/kafkaws/KafkaWebsocketEndpoint$Configurator";
  private static final String HELPER = "com/oracle/livelabs/osa/OsaWebsocketCompatAgent";
  private static volatile String[] allowedOrigins = new String[0];

  public static void premain(String args, Instrumentation instrumentation) throws Exception {
    install(args, instrumentation);
  }
  public static void agentmain(String args, Instrumentation instrumentation) throws Exception {
    install(args, instrumentation);
  }
  private static void install(String args, Instrumentation instrumentation) throws Exception {
    if (args == null || args.isBlank()) throw new IllegalArgumentException("Explicit origins required");
    String[] origins = args.split(",");
    for (String origin : origins) {
      java.net.URI uri = java.net.URI.create(origin);
      if (!("https".equals(uri.getScheme()) || "http".equals(uri.getScheme()))
          || uri.getHost() == null || uri.getPort() < 1 || uri.getPort() > 65535
          || uri.getRawUserInfo() != null || !uri.getRawPath().isEmpty()
          || uri.getRawQuery() != null || uri.getRawFragment() != null) {
        throw new IllegalArgumentException("Expected explicit HTTP(S) origin with port");
      }
    }
    allowedOrigins = origins;
    instrumentation.addTransformer(new Transformer(), true);
    for (Class<?> type : instrumentation.getAllLoadedClasses()) {
      if (type.getName().replace('.', '/').equals(TARGET)) instrumentation.retransformClasses(type);
    }
    System.err.println("[osa-websocket-compat] Installed cookie parser and exact origin allowlist");
  }

  public static String bearerCookie(List<String> headers) {
    if (headers == null) return null;
    String token = null;
    for (String header : headers) {
      if (header == null) continue;
      for (String cookie : header.split(";")) {
        int separator = cookie.indexOf('=');
        if (separator < 0 || !cookie.substring(0, separator).trim().equalsIgnoreCase("Bearer")) continue;
        String value = cookie.substring(separator + 1).trim();
        if (value.isEmpty() || (token != null && !token.equals(value))) return null;
        token = value;
      }
    }
    return token;
  }
  public static boolean allowedOrigin(String origin) {
    if (origin == null) return false;
    for (String allowed : allowedOrigins) if (allowed.equals(origin)) return true;
    return false;
  }

  private static final class Transformer implements ClassFileTransformer {
    public byte[] transform(Module module, ClassLoader loader, String name, Class<?> type,
        ProtectionDomain domain, byte[] bytes) {
      if (!TARGET.equals(name)) return null;
      ClassReader reader = new ClassReader(bytes);
      ClassWriter writer = new ClassWriter(reader, ClassWriter.COMPUTE_MAXS);
      reader.accept(new ClassVisitor(Opcodes.ASM8, writer) {
        public MethodVisitor visitMethod(int access, String name, String desc, String signature, String[] exceptions) {
          MethodVisitor mv = super.visitMethod(access, name, desc, signature, exceptions);
          String helper;
          int returnCode;
          if (name.equals("getBearerTokenFromCookies") && desc.equals("(Ljava/util/List;)Ljava/lang/String;")) {
            helper = "bearerCookie"; returnCode = Opcodes.ARETURN;
          } else if (name.equals("checkOrigin") && desc.equals("(Ljava/lang/String;)Z")) {
            helper = "allowedOrigin"; returnCode = Opcodes.IRETURN;
          } else return mv;
          mv.visitCode();
          mv.visitVarInsn(Opcodes.ALOAD, 1);
          mv.visitMethodInsn(Opcodes.INVOKESTATIC, HELPER, helper, desc, false);
          mv.visitInsn(returnCode);
          mv.visitMaxs(0, 0);
          mv.visitEnd();
          return null;
        }
      }, 0);
      System.err.println("[osa-websocket-compat] Patched " + name);
      return writer.toByteArray();
    }
  }
}
