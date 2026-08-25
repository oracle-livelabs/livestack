#!/usr/bin/env bash

# This file is sourced by configure-instance.sh after the application hook.

configure_dashboard() {
  local source_catalog="${PILOT_ROOT}/dashboard/service-catalog.json"
  local runtime_catalog="${RUNTIME_DIR}/dashboard-services.json"
  local dashboard_env="${RUNTIME_DIR}/dashboard.env"
  local dashboard_password
  local dashboard_title
  local metadata_json='{}'
  local metadata_key
  local metadata_value
  local catalog_tmp
  local env_tmp

  [[ -f "${source_catalog}" ]] || fail "Missing dashboard service catalog: ${source_catalog}"

  jq -e '
    type == "object"
    and ((.services | type) == "array")
    and ((.services | length) > 0)
    and (([.services[].id] | length) == ([.services[].id] | unique | length))
    and all(.services[];
      ((.id | type) == "string")
      and (.id | test("^[a-z][a-z0-9_-]{0,63}$"))
      and (.id != "dashboard")
      and ((.name | type) == "string") and ((.name | length) > 0)
      and ((.kind | type) == "string") and (.kind | test("^[a-z][a-z0-9_-]{0,31}$"))
      and ((.description | type) == "string")
      and ((.health | type) == "object")
      and (.health.type == "http" or .health.type == "tcp" or .health.type == "ollama")
      and (if .health.type == "tcp" then
        ((.health.host | type) == "string") and ((.health.port | type) == "number")
      elif .health.type == "http" then
        ((.health.url | type) == "string")
        and ((.health.expected_status_codes | type) == "array")
        and all(.health.expected_status_codes[]; (type == "number") and (. >= 100 and . <= 599))
      else
        ((.health.url | type) == "string")
      end)
      and ((.connection // []) | type == "array")
      and all((.connection // [])[]; ((.label | type) == "string") and ((.value | type) == "string"))
      and ((.credentials // []) | type == "array")
      and all((.credentials // [])[];
        ((.label | type) == "string")
        and ((.secret | type) == "boolean")
        and ((has("metadata_key") and (has("value") | not)) or (has("value") and (has("metadata_key") | not)))
        and ((has("metadata_key") | not) or (.metadata_key | test("^[a-z][a-z0-9_]{0,63}$")))
        and ((.secret | not) or has("metadata_key"))
      )
      and ((has("endpoint") | not) or (
        ((.endpoint.label | type) == "string")
        and ((.endpoint.url | type) == "string")
        and (.endpoint.url | test("^https?://\\{host\\}:[0-9]+/"))
      ))
    )
  ' "${source_catalog}" >/dev/null || fail "Dashboard service catalog is invalid."

  while IFS= read -r metadata_key; do
    [[ -n "${metadata_key}" ]] || continue
    metadata_value="$(config_value "${metadata_key}")"
    [[ -n "${metadata_value}" ]] || fail "Dashboard metadata value is missing: ${metadata_key}"
    safe_text "dashboard metadata ${metadata_key}" "${metadata_value}"
    metadata_json="$(
      jq -cn \
        --argjson current "${metadata_json}" \
        --arg key "${metadata_key}" \
        --arg value "${metadata_value}" \
        '$current + {($key): $value}'
    )"
  done < <(jq -r '[.services[].credentials[]? | .metadata_key // empty] | unique[]' "${source_catalog}")

  dashboard_password="$(config_value vncpwd)"
  dashboard_title="$(config_value web_title)"
  [[ -n "${dashboard_password}" ]] || fail "Required value vncpwd is missing for dashboard authentication."
  dashboard_title="${dashboard_title:-OCI Runtime Services}"
  safe_password dashboard_password "${dashboard_password}"
  safe_text dashboard_title "${dashboard_title}"

  catalog_tmp="$(mktemp "${RUNTIME_DIR}/dashboard-services.json.XXXXXX")"
  jq --argjson values "${metadata_json}" '
    .services |= map(
      .connection = (.connection // [])
      | .credentials = ((.credentials // []) | map(
          if has("metadata_key") then
            . + {value: ($values[.metadata_key] // "")} | del(.metadata_key)
          else
            .
          end
        ))
    )
  ' "${source_catalog}" > "${catalog_tmp}"
  mv -f "${catalog_tmp}" "${runtime_catalog}"

  env_tmp="$(mktemp "${RUNTIME_DIR}/dashboard.env.XXXXXX")"
  cat > "${env_tmp}" <<EOF
DASHBOARD_TITLE=${dashboard_title}
DASHBOARD_USERNAME=opc
DASHBOARD_PASSWORD=${dashboard_password}
DASHBOARD_PORT=32180
EOF
  mv -f "${env_tmp}" "${dashboard_env}"

  chmod 0600 "${runtime_catalog}" "${dashboard_env}"
  unset dashboard_password metadata_value metadata_json
}
