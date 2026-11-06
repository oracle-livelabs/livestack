FROM docker.io/eclipse-temurin:17-jre

RUN apt-get update \
  && apt-get install -y --no-install-recommends bash curl unzip \
  && rm -rf /var/lib/apt/lists/*

RUN useradd --create-home --uid 10001 --shell /bin/bash gravitino \
  && mkdir -p /opt/gravitino/archive /opt/gravitino/conf /opt/gravitino/logs /opt/gravitino/server /opt/gravitino/tmp \
  && chown -R gravitino:gravitino /opt/gravitino

COPY dist/ /tmp/gravitino-dist/

RUN set -eux; \
  archive="$(find /tmp/gravitino-dist -maxdepth 1 -type f -name '*gravitino*iceberg*rest*server*.zip' | sort | head -1)"; \
  if [ -z "${archive}" ]; then \
    echo "Provide a staged Gravitino ZIP in ingestion/gravitino/dist." >&2; \
    exit 1; \
  fi; \
  extract_dir="/tmp/gravitino-extract"; \
  mkdir -p "${extract_dir}"; \
  unzip -q "${archive}" -d "${extract_dir}"; \
  payload_script="$(find "${extract_dir}" -mindepth 1 -maxdepth 3 -type f -path '*/bin/gravitino-iceberg-rest-server.sh' -print -quit)"; \
  if [ -z "${payload_script}" ]; then \
    echo "Archive does not contain bin/gravitino-iceberg-rest-server.sh: ${archive}" >&2; \
    exit 1; \
  fi; \
  payload_dir="$(dirname "$(dirname "${payload_script}")")"; \
  cp -R "${payload_dir}/." /opt/gravitino/server/; \
  chmod 755 /opt/gravitino/server/bin/gravitino-iceberg-rest-server.sh; \
  chown -R gravitino:gravitino /opt/gravitino; \
  rm -rf /tmp/gravitino-dist "${extract_dir}" "${archive}"

COPY entrypoint.sh /usr/local/bin/gravitino-entrypoint.sh
RUN chmod 755 /usr/local/bin/gravitino-entrypoint.sh

USER gravitino
WORKDIR /opt/gravitino
EXPOSE 1525

ENTRYPOINT ["/usr/local/bin/gravitino-entrypoint.sh"]
