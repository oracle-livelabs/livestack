#!/usr/bin/env python3
"""Reconcile PG's AI Catalog writer group without replacing other grants."""
import json
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

GROUP = "DT_WRITERS"
GRANTS = {
    "metalake/default": {"USE_METALAKE", "BROWSE_METALAKE"},
    "catalog/oadc_iceberg_rest_catalog": {
        "USE_CATALOG", "BROWSE_CATALOG", "USE_SCHEMA", "BROWSE_SCHEMA",
        "CREATE_SCHEMA", "CREATE_TABLE", "SELECT_TABLE",
    },
}


class ApiError(RuntimeError):
    def __init__(self, status, path):
        self.status = status
        super().__init__(f"AI Catalog HTTP {status} at {path}")


class Client:
    def __init__(self, root):
        self.root = root
        self.token = None

    def request(self, method, path, payload=None, form=False):
        data = None
        headers = {"Accept": "application/json"}
        if self.token:
            headers["Authorization"] = "Bearer " + self.token
        if payload is not None:
            data = (urllib.parse.urlencode(payload) if form else json.dumps(payload)).encode()
            headers["Content-Type"] = "application/x-www-form-urlencoded" if form else "application/json"
        for attempt in range(3):
            try:
                with urllib.request.urlopen(urllib.request.Request(
                        self.root + path, data=data, headers=headers, method=method), timeout=45) as response:
                    body = response.read()
                    return json.loads(body) if body else {}
            except urllib.error.HTTPError as error:
                status = error.code
                error.close()
                # Only retry reads/authentication. Reconcile uncertain writes on
                # the next run instead of blindly retrying a mutation.
                if (method == "GET" or form) and status in {429, 502, 503, 504} and attempt < 2:
                    time.sleep(5)
                    continue
                raise ApiError(status, path) from None

    def login(self, user, password):
        self.token = self.request("POST", "/v1/auth/token", {
            "grant_type": "client_credentials", "client_id": user,
            "client_secret": password, "scope": "PRINCIPAL_ROLE:ALL",
        }, form=True)["access_token"]


def privileges_for_group(payload):
    """Read only grants belonging to this group, never infer other users' rights."""
    found = set()
    def walk(value, selected=False):
        if isinstance(value, dict):
            selected = selected or (value.get("principalType") == "GROUP" and value.get("principalName") == GROUP)
            if selected and "privilegeName" in value:
                found.add(value["privilegeName"])
            for child in value.values():
                walk(child, selected)
        elif isinstance(value, list):
            for child in value:
                walk(child, selected)
    walk(payload)
    return found


def reconcile(client, user):
    path = "/v1/auth/groups/" + GROUP
    try:
        group = client.request("GET", path)
    except ApiError as error:
        if error.status != 404:
            raise
        client.request("POST", "/v1/auth/groups", {
            "groupName": GROUP, "description": "PeakGear Data Transforms and bronze catalog writers"})
        group = client.request("GET", path)
    # Group details omit members; use the dedicated membership endpoint.
    principals = client.request("GET", path + "/principals").get("principals", [])
    if not any(p.get("principalType") == "USER" and p.get("principalName") == user for p in principals):
        client.request("POST", path + "/principals:add", {
            "principals": [{"principalType": "USER", "principalName": user}],
            "description": "PeakGear catalog writer membership"})
    for scope, required in GRANTS.items():
        endpoint = "/v1/auth/grants/" + scope
        missing = required - privileges_for_group(client.request("GET", endpoint))
        if missing:
            client.request("POST", endpoint, {
                "principalType": "GROUP", "principalName": GROUP,
                "privileges": [{"privilegeName": p} for p in sorted(missing)],
                "description": "PeakGear catalog discovery and writer access"})
        print(f"[aicat-access] {scope}: checked {', '.join(sorted(required))}", flush=True)


def main():
    if os.environ.get("AI_DATA_CATALOG_ENABLED", "false").lower() not in {"1", "true", "yes", "on"}:
        print("[aicat-access] AI Catalog disabled; skipping.")
        return 0
    root = os.environ.get("AI_DATA_CATALOG_URL", "").rstrip("/")
    if not root:
        print("[aicat-access] Catalog URL unavailable; skipping.")
        return 0
    if not re.fullmatch(r"https://[^/\s]+/catalog", root):
        raise ValueError("Invalid catalog URL")
    user = os.environ.get("AI_DATA_CATALOG_SCHEMA", "PG").upper()
    client = Client(root)
    client.login("ADMIN", os.environ["DBPASSWORD"])
    reconcile(client, user)
    # Fresh user token verifies effective access rather than ADMIN's bypass.
    client.login(user, os.environ.get("ADB_STREAM_SCHEMA_PASSWORD") or os.environ["DBPASSWORD"])
    namespaces = client.request("GET", "/v1/namespaces").get("namespaces", [])
    for namespace in namespaces:
        encoded = urllib.parse.quote("\x1f".join(namespace), safe="")
        client.request("GET", f"/v1/namespaces/{encoded}/tables")
    print(f"[aicat-access] {user}: namespace/table listing verified; group={GROUP}", flush=True)
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as error:
        # Never emit REST bodies, tokens, or credential-bearing exception text.
        detail = str(error) if isinstance(error, ApiError) else type(error).__name__
        print(f"[aicat-access] ERROR: {detail}; access setup incomplete.", file=sys.stderr)
        sys.exit(1)
