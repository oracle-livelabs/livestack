docker stop ggsa-osa
docker rm ggsa-osa
docker volume prune -f
docker rmi localhost/ggsa-osa:26ai
