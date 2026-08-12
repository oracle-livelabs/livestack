# Oracle Stream Analytics 26ai All-in-One Container

This repository builds a single `linux/amd64` Oracle Linux 8 container that bundles:

- Oracle Stream Analytics 26ai from an OSA distribution archive downloaded from `edelivery.oracle.com`
- Apache Kafka 4.1.x in single-node KRaft mode
- Apache Spark 4.0.1 with standalone master, workers, and history server
- MySQL 8.0 as the OSA metadata store

This project is intended for local development, demos, and sandboxing. It is not tuned for production, and it is not maintained or supported by Oracle.

## Instructions

### What you need

- A Docker-compatible container CLI:
  - Docker, or
  - Podman, including rootful Podman on Linux
- An OSA distribution archive in the repository root
  - `V1054826-01.zip` is one example filename
  - patch releases may use a different filename
- Enough memory for the full stack. OSA, Spark, Kafka, and MySQL together are heavy.

### Repository layout

- `Dockerfile`: image definition
- `build.sh`: builds the image and creates the named volumes
- `run.sh`: recreates and starts the container with persistent storage
- `container/entrypoint.sh`: launches and wires together MySQL, Kafka, Spark, and OSA

### Clone the repository

Use HTTPS:

```bash
git clone https://github.com/alexkotopoulis/ggsa_container.git
cd ggsa_container
```

Or SSH:

```bash
git clone git@github.com:alexkotopoulis/ggsa_container.git
cd ggsa_container
```

### Quick start on Linux

The helper scripts assume a working `docker` command. That may be Docker itself, or another runtime if your environment redirects `docker` to it.

Build the image:

```bash
./build.sh
```

If your OSA archive does not use the example filename from the `Dockerfile`, either rename it before building or run the build manually with a matching `--build-arg`.

If you are behind an HTTP proxy, export `HTTP_PROXY`, `HTTPS_PROXY`, and `NO_PROXY` before running `build.sh`.

Before starting the container, set the hostname and password used by `run.sh`:

```bash
export HOST=your-server-hostname
export PASSWORD=your-password
```

If you want to give Spark more resources on a larger machine, you can also set:

```bash
export SPARK_WORKER_INSTANCES=2
export SPARK_WORKER_CORES=8
export SPARK_WORKER_MEMORY=2g
```

You can also edit the variable defaults at the top of [run.sh](/Users/alex/projects/ggsa_container/run.sh) directly if you prefer.

Start the container:

```bash
./run.sh
```

`run.sh` publishes the OSA HTTPS UI directly on host port `9443`. Live Output in the pipeline editor only works when the OSA UI is mapped to container port `9443`.

### Default access points

With the current `run.sh` settings:

- OSA UI: `https://<HOST>:9443/osa/index.html`
- OSA login: `osaadmin` / `<PASSWORD>`
- Spark master UI: `http://<HOST>:28080`
- Spark worker UIs: `http://<HOST>:28081` and `http://<HOST>:28082`
- Spark history server: `http://<HOST>:28083`
- Spark master endpoint: `spark://<HOST>:7077`
- Spark REST submission endpoint: `http://<HOST>:6066/v1/submissions/create`
- Spark application UI: `http://<HOST>:4040` for the first active application
- Kafka bootstrap server: `<HOST>:9092`
- MySQL: `<HOST>:3306`, database `osa`

The OSA UI uses a self-signed certificate by default, so your browser will usually show a certificate warning on first access.

### Common operations

Follow logs:

```bash
docker logs -f ggsa-osa
```

Open a shell in the container:

```bash
docker exec -it ggsa-osa bash
```

Stop and remove the container:

```bash
docker rm -f ggsa-osa
```

### Helper scripts

Besides `build.sh` and `run.sh`, the repository also includes a few small convenience scripts for working with a running container:

- `logs.sh`
  - follows the container logs
  - equivalent to `docker logs --follow ggsa-osa`
- `dsh.sh`
  - opens an interactive shell in the container
  - equivalent to `docker exec -it ggsa-osa bash`
- `kafka_topics.sh`
  - lists Kafka topics from inside the container
  - equivalent to `docker exec ggsa-osa /u01/kafka/bin/kafka-topics.sh --bootstrap-server localhost:9092 --list`
- `kafka_listen.sh`
  - consumes messages from a Kafka topic inside the container
  - usage:

```bash
./kafka_listen.sh <topic-name>
```

- `docker_rmall.sh`
  - helper for cleaning up the local container environment
  - stops and removes the `ggsa-osa` container
  - prunes unused Docker volumes
  - attempts to remove the local `localhost/ggsa-osa:26ai` image

These helper scripts assume:

- the container name is `ggsa-osa`
- the command `docker` works in your environment

The named volumes created by `build.sh` are:

- `ggsa-mysql`
- `ggsa-kafka`
- `ggsa-spark-events`
- `ggsa-osa-files`

These volumes preserve the MySQL data directory, Kafka data, Spark event logs, and deployed OSA pipeline files across container recreation.

### Configuration knobs

The current helper scripts expose these user-facing settings directly in `run.sh`:

- `HOST`: hostname used by browsers to reach OSA
- `PASSWORD`: reused for the MySQL root account, MySQL OSA user, and OSA admin account
- `SPARK_WORKER_INSTANCES`: number of Spark worker processes to start
- `SPARK_WORKER_CORES`: cores assigned to each Spark worker
- `SPARK_WORKER_MEMORY`: memory assigned to each Spark worker

Example:

```bash
HOST=phoenix254903.dev3sub3phx.databasede3phx.oraclevcn.com \
PASSWORD=welcome1 \
SPARK_WORKER_INSTANCES=2 \
SPARK_WORKER_CORES=8 \
SPARK_WORKER_MEMORY=2g \
./run.sh
```

### Manual build and run commands

If you prefer not to use the helper scripts, the current build command is:

```bash
docker build --format docker --http-proxy=true -t localhost/ggsa-osa:26ai .
```

The current run command is:

```bash
docker run -d \
  --name ggsa-osa \
  --platform linux/amd64 \
  -p 3306:3306 \
  -p 4040-4050:4040-4050 \
  -p 6066:6066 \
  -p 7077:7077 \
  -p 28080:28080 \
  -p 28081:28081 \
  -p 28082:28082 \
  -p 28083:28083 \
  -p 9443:9443 \
  -p 19080:9080 \
  -p 9092:9092 \
  -v ggsa-mysql:/var/lib/mysql \
  -v ggsa-kafka:/var/lib/kafka/data \
  -v ggsa-spark-events:/var/lib/spark-events \
  -v ggsa-osa-files:/u01/app/osa/deployedpipelines \
  -e MYSQL_ROOT_PASSWORD=$PASSWORD \
  -e MYSQL_DATABASE=osa \
  -e MYSQL_USER=osa \
  -e MYSQL_PASSWORD=$PASSWORD \
  -e OSA_ADMIN_USER=osaadmin \
  -e OSA_ADMIN_PASSWORD=$PASSWORD \
  -e OSA_PUBLIC_HOST=$HOST \
  -e SPARK_PUBLIC_DNS=$HOST \
  -e SPARK_WORKER_INSTANCES=$SPARK_WORKER_INSTANCES \
  -e SPARK_WORKER_CORES=$SPARK_WORKER_CORES \
  -e SPARK_WORKER_MEMORY=$SPARK_WORKER_MEMORY \
  -e OSA_READY_TIMEOUT=600 \
  localhost/ggsa-osa:26ai
```

If you need a different OSA archive filename, build manually with:

```bash
docker build --format docker --http-proxy=true --build-arg OSA_ARCHIVE=YourOSAArchive.zip -t localhost/ggsa-osa:26ai .
```

## Implementation Notes

### Overall design

- The image is intentionally single-container and single-node.
- The stack runs MySQL, Kafka, Spark, and OSA in one container via `container/entrypoint.sh`.
- The image targets `linux/amd64`.

### Build choices

- The image uses `oraclelinux:8` as its base.
- JDK 21 is installed because OSA 26ai requires it.
- Kafka 4.1.x and Spark 4.0.1 are downloaded during the image build.
- MySQL 8.0 is installed in the image and initialized on first container start.
- The helper build script runs `docker build --format docker`.
- The Dockerfile default `OSA_ARCHIVE` value is an example filename. If your downloaded archive has a different name, rename it or build manually with `--build-arg OSA_ARCHIVE=...`.

### Runtime configuration

- OSA, Kafka, and Spark are installed under `/u01` for a more conventional Oracle-style layout.
- Mutable OSA runtime configuration is still generated under `/tmp`.
- OSA is started with Oracle's supported `--extFolder` mechanism, using `/tmp` as the runtime overlay.
- The runtime overlay `logs` path is linked back to `${OSA_BASE}/logs`, so the OSA app log stays under the familiar `osa-base/logs` directory.
- `osa-datasource.xml` is generated at startup instead of baking environment-specific values into the image.
- The datasource password is generated with `/u01/osa/osa-base/bin/osa-secure-tool.sh`.
- OSA creates or reuses its AES key at `/u01/osa/osa-base/etc/osa_aes.key`.
- A self-signed PKCS#12 certificate is generated at startup and SSL is enabled by default.

### OSA UI access

- `OSA_PUBLIC_HOST` controls the browser-visible host used by the UI and certificate defaults.
- `run.sh` publishes the OSA HTTPS UI on host port `9443`.
- Live Output in the pipeline editor only works when the OSA UI is mapped to container port `9443`.

### Spark and Kafka behavior

- Kafka runs in KRaft mode, not ZooKeeper mode.
- Spark runs one master, one history server, and two workers by default.
- The default Spark worker settings are controlled through `run.sh` and passed as container environment variables:
  - `SPARK_WORKER_INSTANCES=2`
  - `SPARK_WORKER_CORES=8`
  - `SPARK_WORKER_MEMORY=2g`
- Spark REST submission is enabled by default.
- Kafka topic auto-creation is enabled in the generated Kafka config.

### Persistence

- MySQL data is stored in `ggsa-mysql`
- Kafka data is stored in `ggsa-kafka`
- Spark event logs are stored in `ggsa-spark-events`
- Deployed OSA pipeline files are stored in `ggsa-osa-files`

### Logs and troubleshooting

Useful runtime logs:

- OSA app log: `/u01/osa/osa-base/logs/osa-api-server.log`
- OSA launcher log: `/u01/osa/osa-base/logs/osa.log`
- MySQL log: `/var/log/mysql/error.log`
- Spark logs: `/u01/spark/logs`
- Kafka logs: `/u01/kafka/logs`

If OSA seems up but the UI still does not work correctly, check:

- the container logs with `docker logs -f ggsa-osa`
- the browser-visible hostname passed through `HOST`
- that the OSA UI is being accessed on host port `9443`
- whether the OSA UI is still mapped to container port `9443`

### Validation history

- The image has been exercised on Apple Silicon with Rancher Desktop using an amd64 build.
- The helper scripts in this repository are aimed at Linux environments with a Docker-compatible CLI.
