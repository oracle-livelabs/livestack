FROM docker.io/apache/kafka@sha256:d50ab7b5df612b3c303f9d8afe8fee59626a5de798addfd626fe1924e3205965 AS kafka-runtime
FROM docker.io/apache/spark@sha256:989054f2e005c50d4a2f78bd054b0a32de8ee7619a5658e5f4280c61241c9f6d AS spark-runtime
FROM oraclelinux:8

SHELL ["/bin/bash", "-o", "pipefail", "-c"]

ARG OSA_ARCHIVE=V1054826-01.zip
ARG MYSQL80_REPO_RPM=https://repo.mysql.com/mysql80-community-release-el8.rpm

ENV LANG=C.UTF-8 \
    LC_ALL=C.UTF-8 \
    JAVA_HOME=/usr/lib/jvm/java-21-openjdk \
    OSA_BASE=/u01/osa/osa-base \
    OSA_RUNTIME_DIR=/tmp \
    SPARK_HOME=/u01/spark \
    KAFKA_HOME=/u01/kafka \
    MYSQL_DATADIR=/var/lib/mysql \
    MYSQL_SOCKET=/var/lib/mysql/mysql.sock \
    MYSQL_PID_FILE=/var/run/mysqld/mysqld.pid \
    MYSQL_TCP_PORT=3306 \
    MYSQL_ROOT_USER=root \
    MYSQL_ROOT_PASSWORD=oracle \
    MYSQL_DATABASE=osa \
    MYSQL_USER=osa \
    MYSQL_PASSWORD=welcome1 \
    OSA_ADMIN_USER=osaadmin \
    OSA_ADMIN_PASSWORD=welcome1 \
    OSA_PUBLIC_HOST=localhost \
    OSA_ENABLE_SSL=true \
    OSA_API_SERVER_PORT=9080 \
    OSA_API_SERVER_SPORT=9443 \
    OSA_LOAD_SAMPLES=false \
    KAFKA_BROKER_PORT=9092 \
    KAFKA_CONTROLLER_PORT=9093 \
    KAFKA_ADVERTISED_LISTENERS=PLAINTEXT://localhost:9092 \
    SPARK_MASTER_HOST=localhost \
    SPARK_MASTER_PORT=7077 \
    SPARK_MASTER_REST_ENABLED=true \
    SPARK_MASTER_REST_PORT=6066 \
    SPARK_MASTER_WEBUI_PORT=28080 \
    SPARK_WORKER_WEBUI_PORT=28081 \
    SPARK_PUBLIC_DNS=$HOST \
    SPARK_WORKER_INSTANCES=2 \
    SPARK_WORKER_CORES=8 \
    SPARK_WORKER_MEMORY=2g \
    SPARK_WORKER_OPTS="-Dspark.executor.logs.rolling.strategy=size -Dspark.executor.logs.rolling.maxSize=52428800 -Dspark.executor.logs.rolling.maxRetainedFiles=5" \
    SPARK_HISTORY_PORT=28083 \
    OSA_KAFKA_URL=localhost:19092 \
    OSA_SPARK_URL=localhost \
    OSA_SPARK_STANDALONE_CONSOLE_PORT=28080 \
    PATH=/u01/kafka/bin:/u01/spark/bin:/u01/spark/sbin:/u01/osa/osa-base/bin:/usr/java/latest/bin:$PATH

RUN dnf -y install \
      ca-certificates \
      curl \
      findutils \
      gzip \
      hostname \
      jq \
      lsof \
      openssl \
      procps-ng \
      shadow-utils \
      tar \
      unzip \
      util-linux \
      which \
      xz \
      java-21-openjdk-devel \
 && rpm --import https://repo.mysql.com/RPM-GPG-KEY-mysql-2023 \
 && dnf -y module disable mysql \
 && dnf -y install "${MYSQL80_REPO_RPM}" \
 && dnf -y install mysql-community-server \
 && dnf clean all \
 && rm -rf /var/cache/dnf

COPY --from=kafka-runtime /opt/kafka /u01/kafka
COPY --from=spark-runtime /opt/spark /u01/spark

RUN test -x /u01/kafka/bin/kafka-server-start.sh \
 && test -x /u01/spark/bin/spark-submit \
 && test -x /u01/spark/sbin/start-master.sh \
 && install -d -m 0755 /u01/spark/conf

COPY ${OSA_ARCHIVE} /tmp/osa.zip

RUN unzip -q /tmp/osa.zip -d /u01 \
 && mv /u01/OSA-26.1.0.0.0 /u01/osa \
 && rm -f /tmp/osa.zip \
 && chmod +x /u01/osa/osa-base/bin/*.sh \
 && mkdir -p \
      /etc/kafka \
      /var/lib/kafka/data \
      /var/log/mysql \
      /var/run/mysqld \
      /u02 \
      /var/lib/spark/work \
      /var/lib/spark-events \
      /u01/app/osa/deployedpipelines \
      /tmp/coh_cache \
 && chown -R mysql:mysql /var/lib/mysql /var/run/mysqld /var/log/mysql

COPY container/entrypoint.sh /usr/local/bin/ggsa-entrypoint.sh
COPY container/JdbcWalletCompatAgent.java /tmp/JdbcWalletCompatAgent.java

RUN mkdir -p /tmp/jdbc-wallet-compat-agent /u01/osa/osa-base/compat \
 && javac \
      --add-exports java.base/jdk.internal.org.objectweb.asm=ALL-UNNAMED \
      -d /tmp/jdbc-wallet-compat-agent \
      /tmp/JdbcWalletCompatAgent.java \
 && printf 'Premain-Class: com.oracle.livelabs.osa.JdbcWalletCompatAgent\nCan-Retransform-Classes: true\n' \
      > /tmp/jdbc-wallet-compat-agent.mf \
 && jar --create \
      --file /u01/osa/osa-base/compat/jdbc-wallet-compat-agent.jar \
      --manifest /tmp/jdbc-wallet-compat-agent.mf \
      -C /tmp/jdbc-wallet-compat-agent . \
 && rm -rf /tmp/jdbc-wallet-compat-agent /tmp/JdbcWalletCompatAgent.java /tmp/jdbc-wallet-compat-agent.mf \
 && chmod +x /usr/local/bin/ggsa-entrypoint.sh

ENV JAVA_TOOL_OPTIONS="--add-exports=java.base/jdk.internal.org.objectweb.asm=ALL-UNNAMED -javaagent:/u01/osa/osa-base/compat/jdbc-wallet-compat-agent.jar"

COPY container/OsaWebsocketCompatAgent.java /tmp/OsaWebsocketCompatAgent.java
RUN mkdir -p /tmp/osa-websocket-compat-agent \
 && javac --add-exports java.base/jdk.internal.org.objectweb.asm=ALL-UNNAMED \
      -d /tmp/osa-websocket-compat-agent /tmp/OsaWebsocketCompatAgent.java \
 && printf 'Premain-Class: com.oracle.livelabs.osa.OsaWebsocketCompatAgent\nAgent-Class: com.oracle.livelabs.osa.OsaWebsocketCompatAgent\nCan-Retransform-Classes: true\n' \
      > /tmp/osa-websocket-compat-agent.mf \
 && jar --create --file /u01/osa/osa-base/compat/osa-websocket-compat-agent.jar \
      --manifest /tmp/osa-websocket-compat-agent.mf -C /tmp/osa-websocket-compat-agent . \
 && rm -rf /tmp/osa-websocket-compat-agent /tmp/OsaWebsocketCompatAgent.java /tmp/osa-websocket-compat-agent.mf

WORKDIR /u01/osa/osa-base

VOLUME ["/var/lib/mysql", "/var/lib/kafka/data", "/var/lib/spark-events", "/u01/app/osa/deployedpipelines"]

EXPOSE 3306 4040-4050 6066 7077 28080 28081 28082 28083 9080 9092 9443

STOPSIGNAL SIGTERM

ENTRYPOINT ["/usr/local/bin/ggsa-entrypoint.sh"]
