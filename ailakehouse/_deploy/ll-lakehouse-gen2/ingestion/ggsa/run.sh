# Script to create container from existing image created through build.sh
# This script assumes that the command "docker" redirects to your actual container 
# runtime (podman, rancher, etc)

export HOST="${HOST:-ENTER_HOST_HERE}"
export PASSWORD="${PASSWORD:-ENTER_PASSWORD_HERE}"
export SPARK_WORKER_INSTANCES="${SPARK_WORKER_INSTANCES:-2}"
export SPARK_WORKER_CORES="${SPARK_WORKER_CORES:-8}"
export SPARK_WORKER_MEMORY="${SPARK_WORKER_MEMORY:-2g}"

# Increase the Spark worker values above when running on a larger machine.
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
