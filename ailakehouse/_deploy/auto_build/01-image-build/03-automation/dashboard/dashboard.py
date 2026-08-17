#!/usr/bin/env python3
import base64
import hmac
import json
import os
import socket
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.error import HTTPError
from urllib.parse import urlsplit
from urllib.request import Request, urlopen


APP_ROOT = Path(__file__).resolve().parent
CATALOG_PATH = Path(os.environ.get("DASHBOARD_CATALOG", "/run/dashboard/services.json"))
DASHBOARD_TITLE = os.environ.get("DASHBOARD_TITLE", "OCI Runtime Services")
DASHBOARD_USERNAME = os.environ.get("DASHBOARD_USERNAME", "opc")
DASHBOARD_PASSWORD = os.environ.get("DASHBOARD_PASSWORD", "")
DASHBOARD_PORT = int(os.environ.get("DASHBOARD_PORT", "32180"))
CHECK_TIMEOUT = 4


def load_services():
    payload = json.loads(CATALOG_PATH.read_text(encoding="utf-8"))
    services = payload.get("services")
    if not isinstance(services, list) or not services:
        raise ValueError("Dashboard catalog must contain services.")
    return services


SERVICES = load_services()
if not DASHBOARD_PASSWORD:
    raise RuntimeError("DASHBOARD_PASSWORD is required.")


def base_result(service, status, detail):
    result = {
        "id": service["id"],
        "name": service["name"],
        "kind": service.get("kind", "container"),
        "description": service.get("description", "Runtime service"),
        "status": status,
        "detail": detail,
        "connection": service.get("connection", []),
        "credentials": service.get("credentials", []),
    }
    if isinstance(service.get("endpoint"), dict):
        result["endpoint"] = service["endpoint"]
    return result


def check_tcp(service, health):
    try:
        with socket.create_connection((health["host"], int(health["port"])), timeout=CHECK_TIMEOUT):
            return base_result(service, "up", "Connection accepted.")
    except (OSError, KeyError, TypeError, ValueError):
        return base_result(service, "down", "Connection failed.")


def check_http(service, health):
    expected = {int(code) for code in health.get("expected_status_codes", [200])}
    request = Request(health["url"], headers={"User-Agent": "oci-runtime-dashboard/1.0"})
    try:
        with urlopen(request, timeout=CHECK_TIMEOUT) as response:
            if response.status in expected:
                return base_result(service, "up", "Endpoint is responding.")
            return base_result(service, "down", "Unexpected HTTP status {0}.".format(response.status))
    except HTTPError as error:
        if error.code in expected:
            return base_result(service, "up", "Endpoint is responding.")
        return base_result(service, "down", "Unexpected HTTP status {0}.".format(error.code))
    except (OSError, KeyError, TypeError, ValueError):
        return base_result(service, "down", "Endpoint is not responding.")


def check_ollama(service, health):
    request = Request(health["url"], headers={"User-Agent": "oci-runtime-dashboard/1.0"})
    try:
        with urlopen(request, timeout=CHECK_TIMEOUT) as response:
            payload = json.loads(response.read().decode("utf-8"))
            models = payload.get("models")
            if response.status == 200 and isinstance(models, list):
                names = []
                for model in models:
                    if isinstance(model, dict):
                        name = model.get("name") or model.get("model")
                        if isinstance(name, str) and name:
                            names.append(name)
                result = base_result(
                    service,
                    "up",
                    "No models installed." if not names else "{0} model(s) installed.".format(len(names)),
                )
                result["models"] = names
                return result
    except (HTTPError, OSError, KeyError, TypeError, ValueError, json.JSONDecodeError):
        pass
    return base_result(service, "down", "Ollama API is not responding.")


def check_service(service):
    health = service.get("health", {})
    health_type = health.get("type")
    if health_type == "tcp":
        return check_tcp(service, health)
    if health_type == "http":
        return check_http(service, health)
    if health_type == "ollama":
        return check_ollama(service, health)
    return base_result(service, "down", "Unsupported health check.")


def dashboard_result():
    return {
        "id": "dashboard",
        "name": "Runtime service dashboard",
        "kind": "dashboard",
        "description": "Reserved platform status endpoint",
        "status": "up",
        "detail": "Dashboard API is responding.",
        "endpoint": {
            "label": "Open dashboard",
            "url": "http://{{host}}:{0}/".format(DASHBOARD_PORT),
        },
        "connection": [{"label": "Port", "value": str(DASHBOARD_PORT)}],
        "credentials": [
            {"label": "Username", "value": DASHBOARD_USERNAME, "secret": False},
            {"label": "Password", "value": DASHBOARD_PASSWORD, "secret": True},
        ],
    }


def current_status():
    workers = min(8, max(1, len(SERVICES)))
    with ThreadPoolExecutor(max_workers=workers) as executor:
        checked = list(executor.map(check_service, SERVICES))
    services = [dashboard_result(), *checked]
    return {
        "title": DASHBOARD_TITLE,
        "status": "healthy" if all(item["status"] == "up" for item in services) else "degraded",
        "checked_at": datetime.now(timezone.utc).isoformat(),
        "services": services,
    }


def authorized(header_value):
    if not isinstance(header_value, str) or not header_value.startswith("Basic "):
        return False
    try:
        decoded = base64.b64decode(header_value[6:], validate=True).decode("utf-8")
        username, password = decoded.split(":", 1)
    except (ValueError, UnicodeDecodeError):
        return False
    return hmac.compare_digest(username, DASHBOARD_USERNAME) and hmac.compare_digest(password, DASHBOARD_PASSWORD)


class DashboardHandler(BaseHTTPRequestHandler):
    server_version = "OCIRuntimeDashboard/1.0"

    def add_security_headers(self):
        self.send_header(
            "Content-Security-Policy",
            "default-src 'self'; img-src 'self'; style-src 'self'; script-src 'self'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'",
        )
        self.send_header("Referrer-Policy", "no-referrer")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("X-Frame-Options", "DENY")

    def send_content(self, status, content_type, body, cache_control="no-store", challenge=False):
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", cache_control)
        if challenge:
            self.send_header("WWW-Authenticate", 'Basic realm="OCI Runtime Dashboard", charset="UTF-8"')
        self.add_security_headers()
        self.end_headers()
        self.wfile.write(body)

    def send_json(self, status, payload, challenge=False):
        body = json.dumps(payload, separators=(",", ":")).encode("utf-8")
        self.send_content(status, "application/json; charset=utf-8", body, challenge=challenge)

    def do_GET(self):
        path = urlsplit(self.path).path

        static_files = {
            "/": ("index.html", "text/html; charset=utf-8", "no-store"),
            "/index.html": ("index.html", "text/html; charset=utf-8", "no-store"),
            "/styles.css": ("styles.css", "text/css; charset=utf-8", "public, max-age=300"),
            "/app.js": ("app.js", "text/javascript; charset=utf-8", "public, max-age=300"),
        }
        if path in static_files:
            name, content_type, cache_control = static_files[path]
            self.send_content(200, content_type, (APP_ROOT / name).read_bytes(), cache_control)
            return

        if path == "/health":
            self.send_json(200, {"status": "ok"})
            return

        if path == "/api/status":
            if not authorized(self.headers.get("Authorization")):
                self.send_json(401, {"error": "authentication_required"})
                return
            self.send_json(200, current_status())
            return

        if path == "/favicon.ico":
            self.send_content(204, "image/x-icon", b"")
            return

        self.send_json(404, {"error": "not_found"})

    def log_message(self, message_format, *args):
        print("[dashboard] {0} - {1}".format(self.client_address[0], message_format % args), flush=True)


if __name__ == "__main__":
    server = ThreadingHTTPServer(("0.0.0.0", DASHBOARD_PORT), DashboardHandler)
    print("[dashboard] listening on 0.0.0.0:{0}".format(DASHBOARD_PORT), flush=True)
    server.serve_forever()
