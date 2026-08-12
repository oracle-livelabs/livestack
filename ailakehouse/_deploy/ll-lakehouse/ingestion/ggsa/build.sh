# Script to create image and volumes from Dockerfile
# This script assumes that the command "docker" redirects to your actual container 
# runtime (podman, rancher, etc)

docker build --format docker --http-proxy=true -t localhost/ggsa-osa:26ai .

docker volume create ggsa-mysql
docker volume create ggsa-kafka
docker volume create ggsa-spark-events
docker volume create ggsa-osa-files
