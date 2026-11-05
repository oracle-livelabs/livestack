#!/bin/bash

set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="${ENV_FILE:-$PROJECT_ROOT/.env}"

detect_public_host() {
  if [ "${1:-}" != "" ]; then
    printf '%s\n' "$1"
    return 0
  fi

  if [ "${PUBLIC_HOST:-}" != "" ]; then
    printf '%s\n' "$PUBLIC_HOST"
    return 0
  fi

  local host=""

  # OCI instances expose publicIp through the metadata service.
  host="$(
    curl -fsS --connect-timeout 2 --max-time 5 \
      -H "Authorization: Bearer Oracle" \
      http://169.254.169.254/opc/v2/vnics/ 2>/dev/null \
      | awk -F'"' '/"publicIp"[[:space:]]*:/ && $4 != "" { print $4; exit }' || true
  )"
  if [ "$host" != "" ]; then
    printf '%s\n' "$host"
    return 0
  fi

  for endpoint in \
    https://api.ipify.org \
    https://ifconfig.me/ip \
    https://checkip.amazonaws.com
  do
    host="$(curl -fsS --connect-timeout 3 --max-time 8 "$endpoint" 2>/dev/null | tr -d '[:space:]' || true)"
    if [ "$host" != "" ]; then
      printf '%s\n' "$host"
      return 0
    fi
  done

  hostname -I 2>/dev/null | awk '{ print $1 }'
}

set_env_value() {
  local key="$1"
  local value="$2"
  local tmp

  tmp="$(mktemp)"
  if [ -f "$ENV_FILE" ] && grep -q "^${key}=" "$ENV_FILE"; then
    awk -v key="$key" -v value="$value" '
      BEGIN { replaced = 0 }
      $0 ~ "^" key "=" {
        print key "=" value
        replaced = 1
        next
      }
      { print }
      END {
        if (!replaced) {
          print key "=" value
        }
      }
    ' "$ENV_FILE" > "$tmp"
  else
    [ -f "$ENV_FILE" ] && cat "$ENV_FILE" > "$tmp"
    printf '%s=%s\n' "$key" "$value" >> "$tmp"
  fi

  mv "$tmp" "$ENV_FILE"
}

public_host="$(detect_public_host "${1:-}")"
if [ "$public_host" = "" ]; then
  echo "ERROR: Could not determine public host. Pass it explicitly: scripts/configure_public_host.sh <public-ip-or-dns>" >&2
  exit 1
fi

case "$public_host" in
  *[!A-Za-z0-9.:-]*)
    echo "ERROR: Refusing invalid public host value: $public_host" >&2
    exit 1
    ;;
esac

if [ ! -f "$ENV_FILE" ]; then
  cp "$PROJECT_ROOT/.env.example" "$ENV_FILE"
fi

set_env_value PUBLISH_HOST "$public_host"
set_env_value GGSA_PUBLIC_HOST "$public_host"

echo "Configured PUBLISH_HOST and GGSA_PUBLIC_HOST as $public_host in $ENV_FILE"
