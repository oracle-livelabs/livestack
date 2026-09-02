FROM oraclelinux:8

SHELL ["/bin/bash", "-o", "pipefail", "-c"]

ARG OSA_ARCHIVE=V1054826-01.zip
ARG KAFKA_VERSION=4.1.2
ARG KAFKA_SCALA_VERSION=2.13
ARG SPARK_VERSION=4.0.1
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

RUN mkdir -p /u01 \
 && curl -fsSL "https://downloads.apache.org/kafka/${KAFKA_VERSION}/kafka_${KAFKA_SCALA_VERSION}-${KAFKA_VERSION}.tgz" -o /tmp/kafka.tgz \
 && tar -xzf /tmp/kafka.tgz -C /u01 \
 && mv "/u01/kafka_${KAFKA_SCALA_VERSION}-${KAFKA_VERSION}" /u01/kafka \
 && curl -fsSL "https://archive.apache.org/dist/spark/spark-${SPARK_VERSION}/spark-${SPARK_VERSION}-bin-hadoop3.tgz" -o /tmp/spark.tgz \
 && tar -xzf /tmp/spark.tgz -C /u01 \
 && mv "/u01/spark-${SPARK_VERSION}-bin-hadoop3" /u01/spark \
 && rm -f /tmp/kafka.tgz /tmp/spark.tgz

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
 && printf 'Premain-Class: com.oracle.livelabs.osa.JdbcWalletCompatAgent\n' \
      > /tmp/jdbc-wallet-compat-agent.mf \
 && jar --create \
      --file /u01/osa/osa-base/compat/jdbc-wallet-compat-agent.jar \
      --manifest /tmp/jdbc-wallet-compat-agent.mf \
      -C /tmp/jdbc-wallet-compat-agent . \
 && rm -rf /tmp/jdbc-wallet-compat-agent /tmp/JdbcWalletCompatAgent.java /tmp/jdbc-wallet-compat-agent.mf \
 && chmod +x /usr/local/bin/ggsa-entrypoint.sh

ENV JAVA_TOOL_OPTIONS="--add-exports=java.base/jdk.internal.org.objectweb.asm=ALL-UNNAMED -javaagent:/u01/osa/osa-base/compat/jdbc-wallet-compat-agent.jar"

WORKDIR /u01/osa/osa-base

VOLUME ["/var/lib/mysql", "/var/lib/kafka/data", "/var/lib/spark-events", "/u01/app/osa/deployedpipelines"]

EXPOSE 3306 4040-4050 6066 7077 28080 28081 28082 28083 9080 9092 9443

STOPSIGNAL SIGTERM

ENTRYPOINT ["/usr/local/bin/ggsa-entrypoint.sh"]
