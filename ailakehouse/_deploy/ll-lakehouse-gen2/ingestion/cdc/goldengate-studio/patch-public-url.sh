#!/usr/bin/env bash
set -euo pipefail

public_url="${OGGF_API_SERVER_SSL_URL:-${GOLDENGATE_PUBLIC_URL:-https://localhost:8501}}"
config_file="/etc/runit/artifacts/oggf/ui/config/config.js"
bundle_file="/etc/runit/artifacts/oggf/ui/bundle.js"
api_client_file="/etc/runit/artifacts/oggf/ui/utils/apiClient.js"
app_file="/etc/runit/artifacts/oggf/ui/components/app.js"
index_file="/etc/runit/artifacts/oggf/ui/index.html"

escaped_url="$(printf '%s' "${public_url}" | sed 's/[|&]/\\&/g')"

for file in "${config_file}" "${bundle_file}"; do
  if [ -f "${file}" ]; then
    sed -i -E \
      -e "s|api_server:\"[^\"]*\"|api_server:\"${escaped_url}\"|g" \
      -e "s|api_ssl_server:\"[^\"]*\"|api_ssl_server:\"${escaped_url}\"|g" \
      "${file}"
  fi
done

for file in "${api_client_file}" "${bundle_file}"; do
  if [ -f "${file}" ]; then
    sed -i \
      -e 's|return 401===t.status|return false\&\&401===t.status|g' \
      -e 's|return false&&false&&401===t.status|return false\&\&401===t.status|g' \
      "${file}"
  fi
done

if command -v python3 >/dev/null 2>&1; then
  python3 - <<'PY'
from pathlib import Path

api_client = r'''define(["require","exports"],function(require,exports){"use strict";Object.defineProperty(exports,"__esModule",{value:true});const API_ROOT="/01012025/v2/";function readHeader(headers,name){if(!headers)return null;if(typeof Headers!=="undefined"&&headers instanceof Headers)return headers.get(name);const key=Object.keys(headers).find(key=>key.toLowerCase()===name.toLowerCase());return key?headers[key]:null}function withToken(options,token){const next=Object.assign({},options||{});if(typeof Headers!=="undefined"&&next.headers instanceof Headers){const headers=new Headers(next.headers);headers.set("Authorization","Bearer "+token);next.headers=headers}else{next.headers=Object.assign({},next.headers||{},{Authorization:"Bearer "+token})}return next}function parseBearer(value){const match=String(value||"").match(/^Bearer\s+(.+)$/i);return match?match[1]:null}function currentUser(){try{return JSON.parse(sessionStorage.getItem("user")||"null")}catch(error){return null}}function apiBase(url){const text=String(url);const index=text.indexOf(API_ROOT);return index>=0?text.slice(0,index+API_ROOT.length-1):""}async function storeUser(response){const user=await response.json();if(user&&user.token){sessionStorage.setItem("user",JSON.stringify(user));return user.token}return null}async function extendToken(url,token){const base=apiBase(url);if(!base||!token)return null;const response=await fetch(base+"/auth/actions/extend",{method:"POST",headers:{Authorization:"Bearer "+token,"Content-Type":"application/json"},body:JSON.stringify({token,userid:localStorage.getItem("username")})});return response.ok?storeUser(response):null}async function loginAgain(url){const base=apiBase(url);const deploymentUsername=localStorage.getItem("username");const deploymentPassword=sessionStorage.getItem("deploymentPassword");if(!base||!deploymentUsername||!deploymentPassword)return null;const response=await fetch(base+"/auth/token",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({connectionName:"LocalGoldenGate",deploymentUsername,deploymentPassword})});return response.ok?storeUser(response):null}async function retryUnauthorized(url,options,originalToken){const user=currentUser();if(user&&user.token&&user.token!==originalToken){const response=await fetch(url,withToken(options,user.token));if(response.status!==401)return response}const token=(user&&user.token)||originalToken;try{const extended=await extendToken(url,token);if(extended)return await fetch(url,withToken(options,extended))}catch(error){console.warn("GoldenGate Studio token extension failed",error)}try{const fresh=await loginAgain(url);if(fresh)return await fetch(url,withToken(options,fresh))}catch(error){console.warn("GoldenGate Studio re-auth failed",error)}return null}exports.default=async function(url,options={}){const response=await fetch(url,options);if(response.status===500||response.status===400){const clone=response.clone();try{await clone.json()}catch(error){throw new Error("Internal Server Error")}}const authorization=readHeader(options.headers,"Authorization");const originalToken=parseBearer(authorization);if(response.status===401&&originalToken){const retry=await retryUnauthorized(url,options,originalToken);if(retry)return retry}return response}});'''

named_api_client = api_client.replace('define(["require","exports"]', "define('utils/apiClient',[\"require\",\"exports\"]", 1)

api_path = Path("/etc/runit/artifacts/oggf/ui/utils/apiClient.js")
if api_path.exists():
    api_path.write_text(api_client)

bundle_path = Path("/etc/runit/artifacts/oggf/ui/bundle.js")
if bundle_path.exists():
    bundle = bundle_path.read_text()
    marker = "define('utils/apiClient'"
    marker_index = bundle.find(marker)
    if marker_index >= 0:
        start = bundle.rfind("var __awaiter=", 0, marker_index)
        if start < 0:
            start = marker_index
        end = bundle.find("\ndefine('services/authService'", marker_index)
        if end < 0:
            end = bundle.find("\nvar __awaiter=", marker_index)
        if start >= 0 and end >= 0:
            bundle = bundle[:start] + named_api_client + "\n" + bundle[end + 1:]
            bundle_path.write_text(bundle)
PY
fi

for file in "${app_file}" "${bundle_file}"; do
  if [ -f "${file}" ] && ! grep -q "error.code) === 'OGGOS-50003'" "${file}"; then
    sed -i "/const showErrorMessage = (errorDispatch, error) => {/a\\
        if ((error === null || error === void 0 ? void 0 : error.code) === 'OGGOS-50003' || /Unauthorized request/i.test(((error === null || error === void 0 ? void 0 : error.message) || '') + ' ' + ((error === null || error === void 0 ? void 0 : error.cause) || ''))) { return; }
" "${file}"
  fi
done

for file in "${bundle_file}" "/etc/runit/artifacts/oggf/ui/hooks/useAuth.js"; do
  if [ -f "${file}" ]; then
    sed -i \
      -e 's|sessionStorage.setItem("user",JSON.stringify(r)),localStorage.setItem("username",t)|sessionStorage.setItem("user",JSON.stringify(r)),sessionStorage.setItem("deploymentPassword",n),localStorage.setItem("username",t)|g' \
      -e 's|sessionStorage.removeItem("user"),localStorage.removeItem("sessionStartTime")|sessionStorage.removeItem("user"),sessionStorage.removeItem("deploymentPassword"),localStorage.removeItem("sessionStartTime")|g' \
      "${file}"
  fi
done

if [ -f "${index_file}" ]; then
  sed -i -E \
    -e "s|src='\\./bundle\\.js(\\?v=[^']*)?'|src='./bundle.js?v=cdcfix20260609e'|g" \
    -e 's|src="\\./bundle\\.js(\\?v=[^"]*)?"|src="./bundle.js?v=cdcfix20260609e"|g' \
    "${index_file}"
fi
