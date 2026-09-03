#!/usr/bin/env python3
"""Native macOS/Linux OCI custom-image build and acceptance pipeline.

This is the Unix implementation of build-and-test.ps1.  It intentionally uses
only Python's standard library plus the command-line tools installed by the
workstation setup scripts.  It never invokes PowerShell.
"""

from __future__ import annotations

import argparse
import base64
import configparser
import contextlib
import datetime as dt
import fcntl
import hashlib
import ipaddress
import json
import os
import pathlib
import re
import shlex
import shutil
import ssl
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid


IMAGE_OCID_RE = re.compile(r"^ocid1\.image\.[A-Za-z0-9.-]+\.[A-Za-z0-9]+$")
COMPARTMENT_OCID_RE = re.compile(r"^ocid1\.compartment\.[A-Za-z0-9.-]+\.[A-Za-z0-9]+$")
SUBNET_OCID_RE = re.compile(r"^ocid1\.subnet\.[A-Za-z0-9.-]+\.[A-Za-z0-9]+$")
INSPECTION_RE = re.compile(r"^inspection-[0-9]{14}-[0-9]+$")
FAILED_TEST_RE = re.compile(r"^packer-test-[0-9]{14}-[0-9]+$")
IMAGE_NAME_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,254}$")
READY_KIND = "oci-custom-image-marketplace-handoff"
READY_CORE_FIELDS = (
    "schema_version",
    "kind",
    "release_id",
    "image_name",
    "image_ocid",
    "region",
    "automated_test_status",
    "reboot_test_status",
    "cleanup_status",
    "inspection_id",
    "inspection_status",
    "created_utc",
    "updated_utc",
    "automated_test_completed_utc",
    "reboot_test_completed_utc",
    "cleanup_completed_utc",
    "inspection_started_utc",
    "inspection_completed_utc",
    "inspection_approved_utc",
)
APPROVED_KMS_ALGORITHM = "SHA_256_RSA_PKCS_PSS"


class PipelineError(RuntimeError):
    pass


def step(message: str) -> None:
    print(f"[image-pipeline] {message}", flush=True)


def passed(message: str) -> None:
    print(f"[image-pipeline] PASS: {message}", flush=True)


def warn(message: str) -> None:
    print(f"WARNING: {message}", file=sys.stderr, flush=True)


def utc_now() -> str:
    return dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")


def timestamp_id(prefix: str) -> str:
    stamp = dt.datetime.now(dt.timezone.utc).strftime("%Y%m%d%H%M%S")
    return f"{prefix}-{stamp}-{os.getpid()}"


def command_path(name: str) -> str:
    resolved = shutil.which(name)
    if not resolved:
        raise PipelineError(f"Required command was not found in PATH: {name}")
    return resolved


def display_command(arguments: list[str], sensitive: bool = False) -> str:
    if sensitive:
        return f"{pathlib.Path(arguments[0]).name} <sensitive arguments redacted>"
    return shlex.join(arguments)


def run(
    arguments: list[str],
    *,
    cwd: pathlib.Path | None = None,
    capture: bool = False,
    sensitive: bool = False,
    check: bool = True,
    env: dict[str, str] | None = None,
) -> subprocess.CompletedProcess[str]:
    step(display_command(arguments, sensitive=sensitive))
    result = subprocess.run(
        arguments,
        cwd=str(cwd) if cwd else None,
        text=True,
        stdout=subprocess.PIPE if capture else None,
        stderr=subprocess.PIPE if capture else None,
        env=env,
        check=False,
    )
    if check and result.returncode != 0:
        detail = ""
        if capture:
            detail = (result.stderr or result.stdout or "").strip()
        suffix = f": {detail}" if detail else ""
        raise PipelineError(
            f"Command failed with exit code {result.returncode}: "
            f"{display_command(arguments, sensitive=sensitive)}{suffix}"
        )
    return result


def run_stream(arguments: list[str], *, cwd: pathlib.Path) -> tuple[int, str]:
    step(display_command(arguments))
    process = subprocess.Popen(
        arguments,
        cwd=str(cwd),
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        bufsize=1,
    )
    collected: list[str] = []
    assert process.stdout is not None
    for line in process.stdout:
        print(line, end="", flush=True)
        collected.append(line)
    return process.wait(), "".join(collected)


def require_file(path: pathlib.Path, label: str) -> pathlib.Path:
    resolved = path.expanduser().resolve()
    if not resolved.is_file() or resolved.is_symlink():
        raise PipelineError(f"{label} does not exist or is not a regular file: {resolved}")
    return resolved


def require_directory(path: pathlib.Path, label: str) -> pathlib.Path:
    resolved = path.expanduser().resolve()
    if not resolved.is_dir() or resolved.is_symlink():
        raise PipelineError(f"{label} does not exist or is not a directory: {resolved}")
    return resolved


def atomic_json(path: pathlib.Path, value: object, mode: int = 0o600) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.is_symlink() or path.parent.is_symlink():
        raise PipelineError(f"Refusing to write through a symbolic link: {path}")
    fd, temporary = tempfile.mkstemp(prefix=f".{path.name}.", dir=str(path.parent))
    temporary_path = pathlib.Path(temporary)
    try:
        with os.fdopen(fd, "w", encoding="utf-8", newline="\n") as handle:
            json.dump(value, handle, indent=2, ensure_ascii=True)
            handle.write("\n")
        os.chmod(temporary_path, mode)
        os.replace(temporary_path, path)
    finally:
        temporary_path.unlink(missing_ok=True)


def read_json(path: pathlib.Path, label: str) -> object:
    require_file(path, label)
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise PipelineError(f"{label} is not valid JSON: {path}: {exc}") from exc


def strip_hcl_comment(line: str) -> str:
    quoted = False
    escaped = False
    output: list[str] = []
    for char in line:
        if escaped:
            output.append(char)
            escaped = False
            continue
        if char == "\\" and quoted:
            output.append(char)
            escaped = True
            continue
        if char == '"':
            quoted = not quoted
            output.append(char)
            continue
        if char == "#" and not quoted:
            break
        output.append(char)
    return "".join(output).strip()


def hcl_raw(path: pathlib.Path, name: str, default: str = "") -> str:
    matches: list[str] = []
    pattern = re.compile(rf"^\s*{re.escape(name)}\s*=\s*(.+?)\s*$")
    for line in path.read_text(encoding="utf-8").splitlines():
        clean = strip_hcl_comment(line)
        match = pattern.match(clean)
        if match:
            matches.append(match.group(1).strip())
    if not matches:
        return default
    if len(matches) != 1:
        raise PipelineError(f"{name} must be assigned exactly once in {path}.")
    return matches[0]


def hcl_string(path: pathlib.Path, name: str, default: str = "") -> str:
    raw = hcl_raw(path, name, "")
    if not raw:
        return default
    try:
        value = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise PipelineError(f"{name} must be a quoted string in {path}.") from exc
    if not isinstance(value, str):
        raise PipelineError(f"{name} must be a string in {path}.")
    return value


def hcl_string_list(path: pathlib.Path, name: str) -> list[str]:
    raw = hcl_raw(path, name, "")
    if not raw:
        return []
    try:
        value = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise PipelineError(f"{name} must be a JSON-compatible HCL string list in {path}.") from exc
    if not isinstance(value, list) or not all(isinstance(item, str) for item in value):
        raise PipelineError(f"{name} must be a string list in {path}.")
    return value


def active_placeholders(path: pathlib.Path) -> bool:
    return any(
        "<" in strip_hcl_comment(line) and ">" in strip_hcl_comment(line)
        for line in path.read_text(encoding="utf-8").splitlines()
        if strip_hcl_comment(line)
    )


def resolve_config_path(value: str, base: pathlib.Path) -> pathlib.Path:
    expanded = pathlib.Path(os.path.expandvars(os.path.expanduser(value)))
    if not expanded.is_absolute():
        expanded = base / expanded
    return require_file(expanded, "OCI configuration file")


def read_oci_profile(config_path: pathlib.Path, profile: str) -> dict[str, str]:
    parser = configparser.RawConfigParser(interpolation=None)
    try:
        parser.read(config_path, encoding="utf-8")
    except configparser.Error as exc:
        raise PipelineError(f"OCI configuration is invalid: {config_path}: {exc}") from exc
    if profile == "DEFAULT":
        values = dict(parser.defaults())
        if parser.has_section("DEFAULT"):
            values.update(dict(parser.items("DEFAULT")))
    elif parser.has_section(profile):
        values = dict(parser.items(profile))
    else:
        raise PipelineError(f"OCI profile '{profile}' was not found in {config_path}.")
    return {key.lower(): value.strip() for key, value in values.items()}


def normalize_auth(value: str) -> str:
    normalized = value.strip().lower().replace("_", "")
    if normalized in ("apikey", "api key"):
        return "APIKey"
    if normalized in ("securitytoken", "token", "security token"):
        return "SecurityToken"
    raise PipelineError("OCI authentication must be APIKey or SecurityToken.")


def profile_auth(profile_values: dict[str, str]) -> str:
    return "SecurityToken" if profile_values.get("security_token_file") else "APIKey"


def validate_profile(
    config_path: pathlib.Path,
    profile: str,
    auth: str,
    expected_tenancy: str = "",
    expected_user: str = "",
) -> dict[str, str]:
    values = read_oci_profile(config_path, profile)
    actual = profile_auth(values)
    if actual != auth:
        raise PipelineError(
            f"OCI profile '{profile}' uses {actual}, but the variables request {auth}."
        )
    for field, expected in (("tenancy", expected_tenancy), ("user", expected_user)):
        if expected and values.get(field) != expected:
            raise PipelineError(f"OCI profile '{profile}' {field} does not match the variables.")
    if auth == "APIKey":
        required = ("tenancy", "user", "fingerprint", "key_file")
        missing = [field for field in required if not values.get(field)]
        if missing:
            raise PipelineError(
                f"OCI API-key profile '{profile}' is missing: {', '.join(missing)}."
            )
        key_file = resolve_config_path(values["key_file"], config_path.parent)
        if key_file.stat().st_mode & 0o077:
            warn(f"OCI private key permissions are broader than 0600: {key_file}")
    else:
        token_file = values.get("security_token_file", "")
        if not token_file:
            raise PipelineError(f"OCI security-token profile '{profile}' has no token file.")
        resolve_config_path(token_file, config_path.parent)
    return values


def oci_common(config: pathlib.Path, profile: str, region: str, auth: str) -> list[str]:
    arguments = [
        "--profile",
        profile,
        "--config-file",
        str(config),
        "--region",
        region,
    ]
    if auth == "SecurityToken":
        arguments += ["--auth", "security_token"]
    return arguments


def refresh_token(config: pathlib.Path, profile: str, region: str, auth: str) -> None:
    if auth != "SecurityToken":
        return
    oci = command_path("oci")
    common = ["--profile", profile, "--config-file", str(config), "--region", region]
    run([oci, "session", "refresh"] + common)
    run([oci, "session", "validate"] + common)
    passed(f"OCI security-token profile '{profile}' was refreshed")


def oci_json(arguments: list[str], common: list[str]) -> object:
    oci = command_path("oci")
    result = run([oci] + arguments + common + ["--output", "json"], capture=True)
    try:
        return json.loads(result.stdout)
    except json.JSONDecodeError as exc:
        raise PipelineError("OCI CLI returned invalid JSON.") from exc


def current_public_ipv4() -> str:
    request = urllib.request.Request("https://api.ipify.org", headers={"User-Agent": "oci-image-pilot"})
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    try:
        with opener.open(request, timeout=15) as response:
            value = response.read(64).decode("ascii").strip()
    except (OSError, urllib.error.URLError) as exc:
        raise PipelineError(f"Could not determine the current public IP: {exc}") from exc
    try:
        address = ipaddress.ip_address(value)
    except ValueError as exc:
        raise PipelineError(f"Public-IP service returned an invalid address: {value}") from exc
    if address.version != 4:
        raise PipelineError("The current public address is not IPv4.")
    return str(address)


def confirm_tester_cidr(source_cidr: str) -> None:
    try:
        network = ipaddress.ip_network(source_cidr, strict=True)
    except ValueError as exc:
        raise PipelineError(f"tester_source_cidr is invalid: {source_cidr}") from exc
    if network.version != 4 or network.prefixlen != 32:
        raise PipelineError("tester_source_cidr must be exactly one IPv4 /32 address.")
    current = current_public_ipv4()
    if str(network.network_address) != current:
        raise PipelineError(
            f"Current public IP is {current}, but tester_source_cidr is {source_cidr}. "
            "Update 01-edit/terraform.tfvars and rerun. No OCI resources were created."
        )
    passed(f"Current public IP matches tester_source_cidr ({source_cidr})")


def flatten_state_resources(module: object) -> list[dict[str, object]]:
    if not isinstance(module, dict):
        return []
    resources = [item for item in module.get("resources", []) if isinstance(item, dict)]
    for child in module.get("child_modules", []):
        resources.extend(flatten_state_resources(child))
    return resources


class FileLock:
    def __init__(self, path: pathlib.Path, label: str):
        self.path = path
        self.label = label
        self.handle: object | None = None

    def __enter__(self) -> "FileLock":
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.handle = self.path.open("a+", encoding="utf-8")
        try:
            fcntl.flock(self.handle.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
        except OSError as exc:
            self.handle.close()
            raise PipelineError(f"Another {self.label} process is active: {self.path}") from exc
        self.handle.seek(0)
        self.handle.truncate()
        self.handle.write(f"pid={os.getpid()}\nstarted_utc={utc_now()}\n")
        self.handle.flush()
        return self

    def __exit__(self, exc_type: object, exc: object, traceback: object) -> None:
        assert self.handle is not None
        fcntl.flock(self.handle.fileno(), fcntl.LOCK_UN)
        self.handle.close()
        self.path.unlink(missing_ok=True)


def parse_arguments() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Native macOS/Linux OCI custom-image build and test pipeline.",
        allow_abbrev=False,
    )
    parser.add_argument("-ImageName", default="web-jupyter")
    parser.add_argument("-PackerVariableFile", default="")
    parser.add_argument("-TerraformDirectory", default="")
    parser.add_argument("-TerraformVariableFile", default="")
    parser.add_argument("-MarketplaceAttestationFile", default="")
    parser.add_argument("-SshPrivateKeyPath", default="")
    parser.add_argument("-WaitSeconds", type=int, default=1800)
    parser.add_argument("-ValidateOnly", action="store_true")
    parser.add_argument("-KeepTestResources", action="store_true")
    parser.add_argument("-PrepareManualCapture", action="store_true")
    parser.add_argument("-ResumeManualCaptureInstance", default="")
    parser.add_argument("-ExistingImageOcid", default="")
    parser.add_argument("-InspectionMode", action="store_true")
    parser.add_argument("-CleanupInspection", default="")
    parser.add_argument("-CleanupFailedTest", default="")
    parser.add_argument("-ShowInspectionInfo", default="")
    parser.add_argument("-ApproveForMarketplace", action="store_true")
    args = parser.parse_args()
    if not IMAGE_NAME_RE.fullmatch(args.ImageName):
        parser.error("-ImageName contains unsupported characters.")
    if not 60 <= args.WaitSeconds <= 7200:
        parser.error("-WaitSeconds must be from 60 through 7200.")
    if args.ExistingImageOcid and not IMAGE_OCID_RE.fullmatch(args.ExistingImageOcid):
        parser.error("-ExistingImageOcid must be a complete custom image OCID.")
    if args.InspectionMode and not args.ExistingImageOcid:
        parser.error("-InspectionMode requires -ExistingImageOcid.")
    if args.CleanupInspection and not INSPECTION_RE.fullmatch(args.CleanupInspection):
        parser.error("-CleanupInspection must use inspection-YYYYMMDDHHMMSS-PID.")
    if args.ShowInspectionInfo and not INSPECTION_RE.fullmatch(args.ShowInspectionInfo):
        parser.error("-ShowInspectionInfo must use inspection-YYYYMMDDHHMMSS-PID.")
    if args.CleanupFailedTest and not FAILED_TEST_RE.fullmatch(args.CleanupFailedTest):
        parser.error("-CleanupFailedTest must use packer-test-YYYYMMDDHHMMSS-PID.")
    primary_modes = sum(
        bool(value)
        for value in (
            args.ValidateOnly,
            args.PrepareManualCapture,
            args.ResumeManualCaptureInstance,
            args.InspectionMode,
            args.CleanupInspection,
            args.CleanupFailedTest,
            args.ShowInspectionInfo,
        )
    )
    if primary_modes > 1:
        parser.error("Build, validation, inspection, resume, and cleanup modes cannot be combined.")
    if args.ExistingImageOcid and (args.ValidateOnly or args.PrepareManualCapture or args.KeepTestResources):
        parser.error("-ExistingImageOcid cannot be combined with validation, manual preparation, or kept resources.")
    return args


class PipelineContext:
    def __init__(self, args: argparse.Namespace):
        self.args = args
        self.script_root = pathlib.Path(__file__).resolve().parent
        self.project_root = self.script_root.parent
        self.automation = self.project_root / ".automation"
        self.manual_receipt = self.automation / "manual-image-capture.json"
        self.ready_receipt = self.automation / "ready-for-marketplace.json"
        self.ready_lock = self.automation / "ready-for-marketplace.lock"
        self.manifest = self.script_root / "packer-manifest.json"
        self.is_lakehouse = (self.project_root.parent / "terraform").is_dir()
        self.packer_vars = require_file(
            pathlib.Path(args.PackerVariableFile)
            if args.PackerVariableFile
            else self.project_root / "01-edit" / "packer.auto.pkrvars.hcl",
            "Packer variable file",
        )
        self.terraform_root = self.resolve_terraform_root(args.TerraformDirectory)
        self.terraform_work = require_directory(
            self.terraform_root / "03-automation", "Terraform automation directory"
        )
        self.terraform_automation = self.terraform_root / ".automation"
        self.terraform_vars = require_file(
            pathlib.Path(args.TerraformVariableFile)
            if args.TerraformVariableFile
            else self.terraform_root / "01-edit" / "terraform.tfvars",
            "Terraform variable file",
        )
        self.public_endpoints = require_file(
            self.project_root / "01-edit" / "public-endpoints.json", "Public endpoints file"
        )
        self.platform_endpoints = require_file(
            self.script_root / "dashboard" / "public-endpoints.json",
            "Platform endpoints file",
        )
        self.service_catalog = require_file(
            self.project_root / "01-edit" / "service-catalog.json", "Service catalog file"
        )
        self.oci_config = resolve_config_path(
            hcl_string(self.packer_vars, "oci_config_file"), self.packer_vars.parent
        )
        self.packer_profile = hcl_string(self.packer_vars, "oci_profile")
        self.region = hcl_string(self.packer_vars, "region")
        self.compartment = hcl_string(self.packer_vars, "compartment_ocid")
        self.image_compartment = hcl_string(
            self.packer_vars, "image_compartment_ocid", self.compartment
        )
        self.subnet = hcl_string(self.packer_vars, "subnet_ocid")
        self.base_image = hcl_string(self.packer_vars, "base_image_ocid")
        required_values = {
            "oci_profile": self.packer_profile,
            "region": self.region,
            "compartment_ocid": self.compartment,
            "image_compartment_ocid": self.image_compartment,
            "subnet_ocid": self.subnet,
            "base_image_ocid": self.base_image,
        }
        missing = [name for name, value in required_values.items() if not value]
        if missing:
            raise PipelineError(f"Packer variables are missing: {', '.join(missing)}.")
        if not COMPARTMENT_OCID_RE.fullmatch(self.compartment):
            raise PipelineError("Packer compartment_ocid is invalid.")
        if not COMPARTMENT_OCID_RE.fullmatch(self.image_compartment):
            raise PipelineError("Packer image_compartment_ocid is invalid.")
        if not SUBNET_OCID_RE.fullmatch(self.subnet):
            raise PipelineError("Packer subnet_ocid is invalid.")
        if not IMAGE_OCID_RE.fullmatch(self.base_image):
            raise PipelineError("Packer base_image_ocid is invalid.")

        self.terraform_profile = hcl_string(self.terraform_vars, "ociConfigProfile")
        self.terraform_region = hcl_string(self.terraform_vars, "ociRegionIdentifier")
        self.terraform_tenancy = hcl_string(self.terraform_vars, "ociTenancyOcid")
        self.terraform_user = hcl_string(self.terraform_vars, "ociUserOcid")
        self.terraform_auth = normalize_auth(
            hcl_string(self.terraform_vars, "ociAuthMethod", "APIKey")
        )
        self.source_cidr = hcl_string(self.terraform_vars, "tester_source_cidr")
        if not self.terraform_profile or not self.terraform_region or not self.source_cidr:
            raise PipelineError(
                "Terraform variables must define ociConfigProfile, ociRegionIdentifier, "
                "and tester_source_cidr."
            )
        self.packer_profile_values = read_oci_profile(self.oci_config, self.packer_profile)
        self.packer_auth = profile_auth(self.packer_profile_values)
        validate_profile(
            self.oci_config,
            self.packer_profile,
            self.packer_auth,
            self.terraform_tenancy,
            self.terraform_user,
        )
        self.terraform_config = require_file(
            pathlib.Path.home() / ".oci" / "config", "OCI configuration file"
        )
        validate_profile(
            self.terraform_config,
            self.terraform_profile,
            self.terraform_auth,
            self.terraform_tenancy,
            self.terraform_user,
        )
        self.common = oci_common(
            self.oci_config, self.packer_profile, self.region, self.packer_auth
        )

    def resolve_terraform_root(self, requested: str) -> pathlib.Path:
        if requested:
            return require_directory(pathlib.Path(requested), "Terraform test directory")
        git_root = self.project_root
        while git_root.parent != git_root and not (git_root / ".git").exists():
            git_root = git_root.parent
        terraform_play = (
            git_root.parent
            / "demo-code"
            / "imagebuild"
            / "terraform-play"
            / "peak-gear-livestack"
        )
        if terraform_play.is_dir():
            step(
                "Using Terraform Play folder 'peak-gear-livestack' from the "
                "sibling demo-code checkout"
            )
            return terraform_play.resolve()
        raise PipelineError(
            f"Peak Gear Terraform Play folder was not found at {terraform_play}. "
            "Keep livestack and demo-code beside each other, or pass "
            "-TerraformDirectory explicitly for a nonstandard layout."
        )

    def refresh_auth(self) -> None:
        seen: set[tuple[str, str, str]] = set()
        targets = (
            (self.oci_config, self.packer_profile, self.region, self.packer_auth),
            (
                self.terraform_config,
                self.terraform_profile,
                self.terraform_region,
                self.terraform_auth,
            ),
        )
        for config, profile, region, auth in targets:
            key = (str(config), profile, region)
            if key not in seen:
                refresh_token(config, profile, region, auth)
                seen.add(key)


def stage_lakehouse_source(context: PipelineContext) -> None:
    if not context.is_lakehouse:
        return
    deploy_root = context.project_root.parent.parent
    source_root = deploy_root / "ll-lakehouse"
    ingestion = require_directory(source_root / "ingestion", "LiveStack ingestion source")
    require_directory(source_root / "init", "LiveStack init source")
    require_file(source_root / "prepare-custom-image.sh", "LiveStack cleanup script")
    override = require_file(
        context.project_root
        / "02-edit-if-needed"
        / "hooks"
        / "peakgear-init"
        / "create-pg-iceberg-connection.sh",
        "Peak Gear Data Transforms override",
    )
    source = override.read_text(encoding="utf-8")
    if "http://127.0.0.1:${port}/iceberg/v1/config" not in source:
        raise PipelineError("Peak Gear must probe /iceberg/v1/config as its health endpoint.")
    required_iceberg_connection_fields = (
        '"s3AccessID": os.environ["S3_ACCESS_ID"]',
        '"s3SecretKey": os.environ["S3_SECRET_KEY"]',
        '"s3Region": os.environ["S3_REGION"]',
    )
    if not all(field in source for field in required_iceberg_connection_fields):
        raise PipelineError(
            "Peak Gear Data Transforms override must supply the Iceberg S3 credentials and region."
        )
    for relative in (
        ".env",
        ".oci",
        "wallet",
        "logs",
        "runtime",
        "state",
        ".adb_load_done",
        ".oci_wallet_required",
    ):
        candidate = ingestion / relative
        if candidate.exists():
            raise PipelineError(f"Remove local runtime material before building: {candidate}")
    step("Verified direct LiveStack ingestion and init sources without local runtime data")


def compose_services_and_images(root: pathlib.Path) -> tuple[set[str], list[str]]:
    services: set[str] = set()
    images: list[str] = []
    compose_files = [
        path
        for path in root.rglob("*")
        if path.is_file()
        and path.name.lower()
        in ("compose.yml", "compose.yaml", "docker-compose.yml", "docker-compose.yaml")
        and ".automation" not in path.parts
        and ".terraform" not in path.parts
    ]
    for path in compose_files:
        in_services = False
        service_indent = 0
        for line in path.read_text(encoding="utf-8", errors="replace").splitlines():
            if re.match(r"^services:\s*(?:#.*)?$", line):
                in_services = True
                service_indent = len(line) - len(line.lstrip())
                continue
            image_match = re.match(r"^\s*image:\s*['\"]?([^'\"\s#]+)", line)
            if image_match:
                images.append(image_match.group(1))
            if not in_services or not line.strip() or line.lstrip().startswith("#"):
                continue
            indent = len(line) - len(line.lstrip())
            match = re.match(r"^\s*([A-Za-z0-9][A-Za-z0-9_.-]*):\s*(?:#.*)?$", line)
            if indent <= service_indent and line.strip():
                in_services = False
            elif match and indent == service_indent + 2:
                services.add(match.group(1))
    return services, images


def fully_qualified_image(image: str) -> bool:
    first = image.split("/", 1)[0]
    return "/" in image and ("." in first or ":" in first or first == "localhost")


def validate_local_contract(context: PipelineContext) -> None:
    stage_lakehouse_source(context)
    for path in (context.packer_vars, context.terraform_vars):
        if active_placeholders(path):
            raise PipelineError(f"Variable file still contains placeholder values: {path}")
    application_root = (
        context.project_root.parent.parent / "ll-lakehouse" / "ingestion"
        if context.is_lakehouse
        else context.project_root / "01-edit" / "application"
    )
    services, images = compose_services_and_images(application_root)
    bad_images = sorted({image for image in images if not fully_qualified_image(image)})
    if bad_images:
        raise PipelineError(
            "Container image references must use explicit registries: " + ", ".join(bad_images)
        )
    passed("Container image references use explicit registries")
    catalog = read_json(context.service_catalog, "Service catalog")
    if not isinstance(catalog, dict) or not isinstance(catalog.get("services"), list):
        raise PipelineError("Service catalog must contain a services array.")
    catalog_ids = {
        item.get("id") for item in catalog["services"] if isinstance(item, dict) and item.get("id")
    }
    missing = sorted(services - catalog_ids)
    if missing:
        raise PipelineError("Service catalog is missing Compose services: " + ", ".join(missing))
    passed("Service catalog covers every application Compose service")
    bash = command_path("bash")
    shell_roots = [context.project_root, context.terraform_root]
    for root in shell_roots:
        for script in root.rglob("*.sh"):
            if ".automation" not in script.parts and ".terraform" not in script.parts:
                run([bash, "-n", str(script)], capture=True)
    passed("Native Bash syntax validation completed")
    native_tests = context.script_root / "tests"
    if native_tests.is_dir():
        run(
            [
                sys.executable,
                "-m",
                "unittest",
                "discover",
                "-s",
                str(native_tests),
                "-p",
                "test_*.py",
            ],
            cwd=context.script_root,
            capture=True,
            env={**os.environ, "PYTHONDONTWRITEBYTECODE": "1"},
        )
        passed("Native Python regression tests completed")


def source_digest(context: PipelineContext) -> str:
    if context.is_lakehouse:
        roots = [
            context.project_root.parent.parent / "ll-lakehouse" / "ingestion",
            context.project_root.parent.parent / "ll-lakehouse" / "init",
            context.project_root.parent.parent / "ll-lakehouse" / "prepare-custom-image.sh",
            context.project_root / "01-edit" / "public-endpoints.json",
            context.project_root / "01-edit" / "service-catalog.json",
            context.project_root / "02-edit-if-needed" / "hooks",
            context.project_root / "02-edit-if-needed" / "service-tests",
            context.script_root / "configure-instance.sh",
            context.script_root / "dashboard",
            context.script_root / "image.pkr.hcl",
            context.script_root / "install-image.sh",
            context.script_root / "prepare-image.sh",
            context.script_root / "run-tests.sh",
            context.script_root / "systemd",
        ]
    else:
        roots = [
            context.project_root / "01-edit" / "application",
            context.project_root / "01-edit" / "public-endpoints.json",
            context.project_root / "01-edit" / "service-catalog.json",
            context.project_root / "02-edit-if-needed" / "hooks",
            context.project_root / "02-edit-if-needed" / "service-tests",
            context.project_root / "02-edit-if-needed" / "local-runtime.env.example",
            context.script_root / "configure-instance.sh",
            context.script_root / "dashboard",
            context.script_root / "image.pkr.hcl",
            context.script_root / "install-image.sh",
            context.script_root / "prepare-image.sh",
            context.script_root / "run-tests.sh",
            context.script_root / "systemd",
        ]
    digest = hashlib.sha256()
    files: list[pathlib.Path] = []
    for root in roots:
        if root.is_file():
            files.append(root)
        elif root.is_dir():
            files.extend(path for path in root.rglob("*") if path.is_file())
    for path in sorted(set(files), key=lambda item: str(item).lower()):
        try:
            relative = path.relative_to(context.project_root.parent.parent)
        except ValueError:
            relative = path
        digest.update(str(relative).replace(os.sep, "/").encode("utf-8"))
        digest.update(b"\0")
        digest.update(path.read_bytes())
        digest.update(b"\0")
    return digest.hexdigest()


def confirm_packer_nsg(context: PipelineContext) -> None:
    nsgs = hcl_string_list(context.packer_vars, "nsg_ocids")
    if len(nsgs) != 1:
        raise PipelineError("Packer nsg_ocids must contain exactly one dedicated NSG.")
    subnet_doc = oci_json(["network", "subnet", "get", "--subnet-id", context.subnet], context.common)
    nsg_doc = oci_json(
        ["network", "nsg", "get", "--nsg-id", nsgs[0]], context.common
    )
    subnet = subnet_doc.get("data", {}) if isinstance(subnet_doc, dict) else {}
    nsg = nsg_doc.get("data", {}) if isinstance(nsg_doc, dict) else {}
    if subnet.get("lifecycle-state") != "AVAILABLE" or nsg.get("lifecycle-state") != "AVAILABLE":
        raise PipelineError("The Packer subnet and NSG must both be AVAILABLE.")
    if subnet.get("vcn-id") != nsg.get("vcn-id"):
        raise PipelineError("The Packer NSG is not in the build subnet's VCN.")
    rules_doc = oci_json(
        [
            "network",
            "nsg",
            "rules",
            "list",
            "--nsg-id",
            nsgs[0],
            "--direction",
            "INGRESS",
            "--all",
        ],
        context.common,
    )
    rules = rules_doc.get("data", []) if isinstance(rules_doc, dict) else []
    valid = []
    for rule in rules:
        tcp = rule.get("tcp-options") or {}
        destination = tcp.get("destination-port-range") or {}
        valid.append(
            rule.get("direction") == "INGRESS"
            and rule.get("protocol") == "6"
            and rule.get("source") == context.source_cidr
            and rule.get("source-type", "CIDR_BLOCK") == "CIDR_BLOCK"
            and rule.get("is-stateless") is not True
            and destination.get("min") == 22
            and destination.get("max") == 22
        )
    if len(rules) != 1 or valid != [True]:
        raise PipelineError(
            f"Persistent Packer NSG '{nsgs[0]}' must contain only one valid ingress "
            f"rule: TCP 22 from {context.source_cidr}."
        )
    passed("Persistent Packer NSG is restricted to the current tester /32 on TCP 22")


def read_endpoints(path: pathlib.Path) -> list[dict[str, object]]:
    document = read_json(path, "Public endpoints file")
    if not isinstance(document, dict) or not isinstance(document.get("public_endpoints"), list):
        raise PipelineError(f"Public endpoints file must contain public_endpoints: {path}")
    endpoints: list[dict[str, object]] = []
    pattern = re.compile(r"^https?://\{host\}:([0-9]+)/[^\r\n\t ]*$")
    for item in document["public_endpoints"]:
        if not isinstance(item, dict):
            raise PipelineError(f"Every public endpoint must be an object: {path}")
        name = item.get("name")
        url = item.get("url")
        codes = item.get("expected_status_codes")
        if not isinstance(name, str) or not name or any(char in name for char in "\r\n\t"):
            raise PipelineError("Every public endpoint must have a safe name.")
        if not isinstance(url, str) or not (match := pattern.fullmatch(url)):
            raise PipelineError(
                f"Public endpoint URL must look like http://{{host}}:8080/path: {name}"
            )
        port = int(match.group(1))
        if not 1 <= port <= 65535:
            raise PipelineError(f"Public endpoint has an invalid port: {name}")
        if not isinstance(codes, list) or not codes:
            raise PipelineError(f"Public endpoint must declare expected status codes: {name}")
        normalized_codes: list[int] = []
        for code in codes:
            if isinstance(code, bool) or not isinstance(code, int) or not 100 <= code <= 599:
                raise PipelineError(f"Public endpoint has an invalid status code: {name}")
            normalized_codes.append(code)
        insecure = item.get("insecure_tls", False)
        if not isinstance(insecure, bool):
            raise PipelineError(f"Public endpoint insecure_tls must be true or false: {name}")
        endpoints.append(
            {
                "name": name,
                "url": url,
                "port": port,
                "codes": normalized_codes,
                "insecure_tls": insecure,
            }
        )
    return endpoints


def all_endpoints(context: PipelineContext) -> list[dict[str, object]]:
    endpoints = read_endpoints(context.public_endpoints) + read_endpoints(
        context.platform_endpoints
    )
    names = [str(item["name"]) for item in endpoints]
    if len(names) != len(set(names)):
        raise PipelineError("Application and platform endpoint names must be unique.")
    return endpoints


def endpoint_ports(endpoints: list[dict[str, object]]) -> list[int]:
    ports = sorted({22, *(int(item["port"]) for item in endpoints)})
    passed("Restricted test ports derived from SSH and public endpoints: " + ", ".join(map(str, ports)))
    return ports


def ssh_public_identity(value: str) -> str:
    match = re.fullmatch(
        r"(ssh-(?:rsa|ed25519)|ecdsa-sha2-[A-Za-z0-9-]+)\s+"
        r"([A-Za-z0-9+/=]+)(?:\s+[^\r\n]*)?",
        value.strip(),
    )
    if not match:
        return ""
    return f"{match.group(1)} {match.group(2)}"


def resolve_ssh_private_key(requested: str, terraform_vars: pathlib.Path) -> pathlib.Path:
    if requested:
        return require_file(pathlib.Path(requested), "SSH private key")
    public_value = hcl_string(terraform_vars, "resUserPublicKey")
    expected = ssh_public_identity(public_value)
    if not expected:
        raise PipelineError(
            "Terraform variables must define a supported resUserPublicKey, or pass "
            "-SshPrivateKeyPath explicitly."
        )
    ssh_directory = pathlib.Path.home() / ".ssh"
    if ssh_directory.is_dir():
        for public_path in sorted(ssh_directory.glob("*.pub"), key=lambda path: path.name):
            try:
                candidate = ssh_public_identity(public_path.read_text(encoding="utf-8"))
            except OSError:
                continue
            private_path = public_path.with_suffix("")
            if candidate == expected and private_path.is_file() and not private_path.is_symlink():
                step(f"Selected SSH private key matching resUserPublicKey: {private_path}")
                return private_path.resolve()
    raise PipelineError(
        f"No private key under {ssh_directory} matches resUserPublicKey. "
        "Pass -SshPrivateKeyPath with the matching private-key path."
    )


def resolve_manual_capture_ssh_public_key(context: PipelineContext) -> str:
    private_key = resolve_ssh_private_key(
        context.args.SshPrivateKeyPath, context.terraform_vars
    )
    public_key_path = require_file(
        pathlib.Path(f"{private_key}.pub"), "Manual-capture SSH public key"
    )
    public_key = public_key_path.read_text(encoding="utf-8").strip()
    expected = ssh_public_identity(hcl_string(context.terraform_vars, "resUserPublicKey"))
    actual = ssh_public_identity(public_key)
    if not expected or actual != expected:
        raise PipelineError(
            f"{public_key_path} does not match resUserPublicKey in {context.terraform_vars}."
        )
    return actual


def ssh_options(private_key: pathlib.Path, known_hosts: pathlib.Path) -> list[str]:
    return [
        "-i",
        str(private_key),
        "-o",
        "BatchMode=yes",
        "-o",
        "IdentitiesOnly=yes",
        "-o",
        "StrictHostKeyChecking=accept-new",
        "-o",
        f"UserKnownHostsFile={known_hosts}",
        "-o",
        "ConnectTimeout=10",
        "-o",
        "ServerAliveInterval=15",
        "-o",
        "ServerAliveCountMax=3",
    ]


def ssh_run(
    private_key: pathlib.Path,
    known_hosts: pathlib.Path,
    target: str,
    remote_command: str,
    *,
    check: bool = True,
    sensitive: bool = False,
    capture: bool = False,
) -> subprocess.CompletedProcess[str]:
    return run(
        [command_path("ssh")]
        + ssh_options(private_key, known_hosts)
        + [target, remote_command],
        check=check,
        sensitive=sensitive,
        capture=capture,
    )


def scp_file(
    private_key: pathlib.Path,
    known_hosts: pathlib.Path,
    source: pathlib.Path,
    target: str,
) -> None:
    run(
        [command_path("scp")]
        + ssh_options(private_key, known_hosts)[:-6]
        + [str(source), target],
        sensitive=True,
    )


def ssh_available(private_key: pathlib.Path, known_hosts: pathlib.Path, target: str) -> bool:
    result = ssh_run(private_key, known_hosts, target, "true", check=False, capture=True)
    return result.returncode == 0


def wait_for_ssh(
    private_key: pathlib.Path,
    known_hosts: pathlib.Path,
    target: str,
    timeout_seconds: int,
) -> None:
    deadline = time.monotonic() + timeout_seconds
    while time.monotonic() < deadline:
        if ssh_available(private_key, known_hosts, target):
            return
        time.sleep(10)
    raise PipelineError(f"SSH did not become available within {timeout_seconds} seconds: {target}")


def wait_for_ssh_shutdown(
    private_key: pathlib.Path, known_hosts: pathlib.Path, target: str
) -> None:
    deadline = time.monotonic() + 180
    while time.monotonic() < deadline:
        if not ssh_available(private_key, known_hosts, target):
            return
        time.sleep(5)
    raise PipelineError("The test VM did not go offline during the reboot check.")


def terraform_run(
    context: PipelineContext,
    arguments: list[str],
    *,
    capture: bool = False,
    check: bool = True,
    sensitive: bool = False,
) -> subprocess.CompletedProcess[str]:
    return run(
        [command_path("terraform")] + arguments,
        cwd=context.terraform_work,
        capture=capture,
        check=check,
        sensitive=sensitive,
    )


def terraform_json(context: PipelineContext, arguments: list[str], label: str) -> object:
    result = terraform_run(context, arguments, capture=True, sensitive=True)
    try:
        return json.loads(result.stdout)
    except json.JSONDecodeError as exc:
        raise PipelineError(f"{label} is not valid JSON.") from exc


def terraform_output(context: PipelineContext, name: str, *, optional: bool = False) -> object:
    result = terraform_run(
        context,
        ["output", "-json", name],
        capture=True,
        check=False,
        sensitive=True,
    )
    if result.returncode != 0:
        if optional and "No output named" in (result.stderr or ""):
            return None
        raise PipelineError(f"Terraform output '{name}' could not be read: {(result.stderr or '').strip()}")
    try:
        return json.loads(result.stdout)
    except json.JSONDecodeError as exc:
        raise PipelineError(f"Terraform output '{name}' is not valid JSON.") from exc


def single_output(context: PipelineContext, name: str) -> str:
    value = terraform_output(context, name)
    values = value if isinstance(value, list) else [value]
    if len(values) != 1 or not isinstance(values[0], str) or not values[0].strip():
        raise PipelineError(f"Terraform output '{name}' must contain exactly one value.")
    return values[0]


def terraform_variable_declared(context: PipelineContext, name: str) -> bool:
    declaration = re.compile(rf'variable\s+"{re.escape(name)}"\s*\{{')
    return any(
        declaration.search(path.read_text(encoding="utf-8", errors="replace"))
        for path in context.terraform_root.rglob("*.tf")
        if ".terraform" not in path.parts and ".automation" not in path.parts
    )


def terraform_arguments(
    context: PipelineContext, variable_file: pathlib.Path, image_ocid: str, ports: list[int]
) -> list[str]:
    arguments = [
        f"-var-file={variable_file}",
        f"-var=instance_image_id={image_ocid}",
        "-var=use_marketplace_image=false",
        "-var=instance_count=1",
        f"-var=allowed_tcp_ports={json.dumps(ports, separators=(',', ':'))}",
    ]
    if terraform_variable_declared(context, "enable_test_access_nsg"):
        arguments.append("-var=enable_test_access_nsg=true")
    if terraform_variable_declared(context, "expose_login_outputs"):
        arguments.append("-var=expose_login_outputs=false")
    return arguments


def list_workspaces(context: PipelineContext) -> set[str]:
    result = terraform_run(context, ["workspace", "list", "-no-color"], capture=True)
    return {
        line.strip().lstrip("*").strip()
        for line in result.stdout.splitlines()
        if line.strip().lstrip("*").strip()
    }


def validate_terraform(context: PipelineContext) -> None:
    context.terraform_automation.mkdir(parents=True, exist_ok=True)
    terraform_run(context, ["init", "-input=false"])
    terraform_run(context, ["fmt", "-check", "-recursive", str(context.terraform_root)])
    terraform_run(context, ["validate"])
    passed("Terraform initialization, formatting, and validation completed")


def assert_direct_image_state(context: PipelineContext, image_ocid: str) -> None:
    state = terraform_json(context, ["show", "-json"], "Terraform state")
    values = state.get("values", {}) if isinstance(state, dict) else {}
    resources = flatten_state_resources(values.get("root_module", {}))
    instances = [item for item in resources if item.get("type") == "oci_core_instance"]
    if len(instances) != 1:
        raise PipelineError("Terraform state must contain exactly one test VM.")
    instance_values = instances[0].get("values", {})
    source_details = instance_values.get("source_details", []) if isinstance(instance_values, dict) else []
    if (
        not isinstance(source_details, list)
        or len(source_details) != 1
        or source_details[0].get("source_id") != image_ocid
    ):
        raise PipelineError("Terraform test VM does not use the requested custom image.")
    passed("Terraform state proves the requested custom image and one test VM")


def write_workspace_receipt(
    context: PipelineContext,
    workspace: str,
    image_ocid: str,
    snapshot: pathlib.Path,
    ports: list[int],
    inspection: bool,
) -> pathlib.Path:
    path = context.terraform_automation / (
        f"{workspace}.json" if inspection else f"{workspace}.failed-test.json"
    )
    value: dict[str, object] = {
        "schema_version": 1,
        "workspace_name": workspace,
        "image_ocid": image_ocid,
        "image_name": context.args.ImageName,
        "variable_snapshot": snapshot.name,
        "allowed_tcp_ports": ports,
    }
    if inspection:
        value.update(
            {
                "inspection_id": workspace,
                "created_utc": utc_now(),
                "status": "provisioning",
                "public_ip": "",
            }
        )
    atomic_json(path, value)
    return path


def ensure_path_inside(path: pathlib.Path, root: pathlib.Path, label: str) -> pathlib.Path:
    resolved = require_file(path, label)
    try:
        resolved.relative_to(root.resolve())
    except ValueError as exc:
        raise PipelineError(f"{label} must stay under the project automation directory: {resolved}") from exc
    return resolved


def install_standard_runtime_files(
    context: PipelineContext,
    files: list[object],
    private_key: pathlib.Path,
    known_hosts: pathlib.Path,
    target: str,
) -> None:
    commands: list[str] = []
    post_restart: list[str] = []
    for item in files:
        if not isinstance(item, dict):
            raise PipelineError("Terraform runtime_files entries must be objects.")
        source_value = item.get("source_path")
        target_name = item.get("target_name")
        mode = item.get("mode")
        if not isinstance(source_value, str) or not isinstance(target_name, str):
            raise PipelineError("Terraform runtime file is missing source_path or target_name.")
        if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._-]{0,127}", target_name):
            raise PipelineError(f"Runtime target_name is unsafe: {target_name}")
        if mode != "0600":
            raise PipelineError(f"Runtime files must use mode 0600: {target_name}")
        source = ensure_path_inside(
            pathlib.Path(source_value), context.terraform_automation, "Runtime source file"
        )
        remote = f"/home/opc/oci-image-pilot/runtime/{target_name}"
        scp_file(private_key, known_hosts, source, f"{target}:{remote}")
        extract_to = item.get("extract_to", "")
        container_uid = item.get("container_uid", "")
        container_name = item.get("container_name", "")
        container_read_path = item.get("container_read_path", "")
        if not extract_to:
            if container_uid or container_name or container_read_path:
                raise PipelineError(
                    f"A runtime file without extract_to cannot declare container access: {target_name}"
                )
            commands.append(f"chmod 0600 {shlex.quote(remote)}")
            continue
        if (
            not isinstance(extract_to, str)
            or not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._-]{0,127}", extract_to)
            or not target_name.endswith(".zip")
        ):
            raise PipelineError(f"Runtime archive definition is unsafe: {target_name}")
        destination = f"/home/opc/oci-image-pilot/runtime/{extract_to}"
        commands.append(
            f"chmod 0600 {shlex.quote(remote)} && rm -rf {shlex.quote(destination)} && "
            f"install -d -m 0700 {shlex.quote(destination)} && "
            f"unzip -oq {shlex.quote(remote)} -d {shlex.quote(destination)} && "
            f"chmod -R go-rwx {shlex.quote(destination)}"
        )
        if container_uid:
            uid = str(container_uid)
            if not re.fullmatch(r"[1-9][0-9]{0,8}", uid):
                raise PipelineError(f"Runtime archive container_uid is unsafe: {target_name}")
            if not isinstance(container_name, str) or not re.fullmatch(
                r"[A-Za-z0-9][A-Za-z0-9_.-]{0,127}", container_name
            ):
                raise PipelineError(f"Runtime archive container_name is unsafe: {target_name}")
            if not isinstance(container_read_path, str) or not re.fullmatch(
                r"/[A-Za-z0-9][A-Za-z0-9._/-]{0,255}", container_read_path
            ):
                raise PipelineError(f"Runtime archive container_read_path is unsafe: {target_name}")
            wait = (
                f"for attempt in {{1..60}}; do podman inspect --format='{{{{.State.Running}}}}' "
                f"{shlex.quote(container_name)} 2>/dev/null | grep -qx true && break; "
                "sleep 2; done"
            )
            acl = (
                f"podman unshare setfacl -m u:{uid}:rx {shlex.quote(destination)} && "
                f"podman unshare find {shlex.quote(destination)} -type d -exec setfacl -m u:{uid}:rx {{}} + && "
                f"podman unshare find {shlex.quote(destination)} -type f -exec setfacl -m u:{uid}:r {{}} + && "
                f"podman exec --user {uid} {shlex.quote(container_name)} test -r "
                f"{shlex.quote(container_read_path)}"
            )
            post_restart.append(f"{wait} && sleep 3 && {acl} && sleep 2 && {acl}")

    remote_command = " && ".join(commands)
    if post_restart:
        helper = "#!/usr/bin/env bash\nset -Eeuo pipefail\n" + "\n".join(post_restart) + "\n"
        drop_in = "[Service]\nExecStartPost=/home/opc/.local/libexec/oci-image-pilot/grant-container-access.sh\n"
        helper64 = base64.b64encode(helper.encode()).decode()
        drop64 = base64.b64encode(drop_in.encode()).decode()
        suffix = (
            "rm -f /home/opc/oci-image-pilot/runtime/grant-container-access.sh && "
            "install -d -m 0700 /home/opc/.local/libexec/oci-image-pilot && "
            f"printf %s {shlex.quote(helper64)} | base64 -d > "
            "/home/opc/.local/libexec/oci-image-pilot/grant-container-access.sh && "
            "chmod 0700 /home/opc/.local/libexec/oci-image-pilot/grant-container-access.sh && "
            "install -d -m 0700 /home/opc/.config/systemd/user/oci-image-pilot.service.d && "
            f"printf %s {shlex.quote(drop64)} | base64 -d > "
            "/home/opc/.config/systemd/user/oci-image-pilot.service.d/runtime-container-access.conf && "
            "chmod 0600 /home/opc/.config/systemd/user/oci-image-pilot.service.d/runtime-container-access.conf && "
            "systemctl --user daemon-reload"
        )
        remote_command = f"{remote_command} && {suffix}" if remote_command else suffix
    remote_command = (
        f"{remote_command} && systemctl --user restart oci-image-pilot.service"
        if remote_command
        else "systemctl --user restart oci-image-pilot.service"
    )
    ssh_run(private_key, known_hosts, target, remote_command, sensitive=True)


def install_lakehouse_runtime_files(
    context: PipelineContext,
    files: list[object],
    private_key: pathlib.Path,
    known_hosts: pathlib.Path,
    target: str,
) -> None:
    remotes: list[str] = []
    for item in files:
        if not isinstance(item, dict):
            raise PipelineError("Terraform runtime_files entries must be objects.")
        source_value = item.get("source_path")
        target_name = item.get("target_name")
        if not isinstance(source_value, str) or not isinstance(target_name, str):
            raise PipelineError("Terraform runtime file is missing source_path or target_name.")
        if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._-]{0,127}", target_name):
            raise PipelineError(f"Runtime target_name is unsafe: {target_name}")
        if item.get("mode") != "0600":
            raise PipelineError(f"Runtime files must use mode 0600: {target_name}")
        source = ensure_path_inside(
            pathlib.Path(source_value), context.terraform_automation, "Runtime source file"
        )
        remote = f"/home/opc/oci-image-pilot/runtime/{target_name}"
        scp_file(private_key, known_hosts, source, f"{target}:{remote}")
        remotes.append(remote)
    chmod = " && ".join(f"chmod 0600 {shlex.quote(path)}" for path in remotes)
    command = (
        f"{chmod} && " if chmod else ""
    ) + (
        "sed -i 's/\\r$//' /home/opc/init/*.sh && "
        "if test -e /home/opc/oci-image-pilot/ingestion/.oci_wallet_required; then "
        "sudo chown opc:opc /home/opc/oci-image-pilot/ingestion/.oci_wallet_required && "
        "sudo chmod 0600 /home/opc/oci-image-pilot/ingestion/.oci_wallet_required; fi && "
        "systemctl --user reset-failed oci-image-pilot.service && "
        "systemctl --user restart --no-block oci-image-pilot.service"
    )
    ssh_run(private_key, known_hosts, target, command, sensitive=True)


def stage_lakehouse_verifier(
    context: PipelineContext,
    private_key: pathlib.Path,
    known_hosts: pathlib.Path,
    target: str,
) -> None:
    verifier = require_file(context.script_root / "run-tests.sh", "Acceptance verifier")
    tests = require_directory(
        context.project_root / "02-edit-if-needed" / "service-tests", "Service tests folder"
    )
    scripts = sorted(tests.glob("*.sh"), key=lambda path: path.name)
    if not scripts:
        raise PipelineError(f"Acceptance service-tests folder contains no shell tests: {tests}")
    ssh_run(
        private_key,
        known_hosts,
        target,
        "mkdir -p /home/opc/oci-image-pilot/tests/service-tests && "
        "rm -f /home/opc/oci-image-pilot/tests/service-tests/*.sh",
    )
    scp_file(
        private_key,
        known_hosts,
        verifier,
        f"{target}:/home/opc/oci-image-pilot/tests/run-tests.sh",
    )
    for script in scripts:
        if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._-]{0,127}\.sh", script.name):
            raise PipelineError(f"Acceptance service-test filename is unsafe: {script.name}")
        scp_file(
            private_key,
            known_hosts,
            script,
            f"{target}:/home/opc/oci-image-pilot/tests/service-tests/{script.name}",
        )
    ssh_run(
        private_key,
        known_hosts,
        target,
        "chmod 0755 /home/opc/oci-image-pilot/tests/run-tests.sh "
        "/home/opc/oci-image-pilot/tests/service-tests/*.sh && "
        "sed -i 's/\\r$//' /home/opc/oci-image-pilot/tests/run-tests.sh "
        "/home/opc/oci-image-pilot/tests/service-tests/*.sh",
    )
    step("Staged the current acceptance verification harness and service tests")


def install_runtime_files(
    context: PipelineContext,
    private_key: pathlib.Path,
    known_hosts: pathlib.Path,
    target: str,
) -> None:
    value = terraform_output(context, "runtime_files", optional=True)
    if value is None:
        return
    files = value if isinstance(value, list) else [value]
    if not files:
        return
    if context.is_lakehouse:
        install_lakehouse_runtime_files(context, files, private_key, known_hosts, target)
        stage_lakehouse_verifier(context, private_key, known_hosts, target)
        ssh_run(
            private_key,
            known_hosts,
            target,
            "sudo systemctl disable oci-manual-capture-remove-ssh-key.service 2>/dev/null || true; "
            "sudo rm -f /etc/oci-manual-capture-ssh-public-key "
            "/etc/systemd/system/oci-manual-capture-remove-ssh-key.service "
            "/usr/local/libexec/oci-manual-capture-remove-ssh-key.sh; "
            "sudo systemctl daemon-reload",
        )
    else:
        install_standard_runtime_files(context, files, private_key, known_hosts, target)
    passed("Protected runtime files were staged and the image service was restarted")


def remote_verification(
    context: PipelineContext,
    private_key: pathlib.Path,
    known_hosts: pathlib.Path,
    target: str,
) -> None:
    if context.is_lakehouse:
        command = (
            f"/home/opc/oci-image-pilot/tests/run-tests.sh --wait {context.args.WaitSeconds} "
            "--expect-source oci"
        )
    else:
        command = (
            "bash -lc 'for attempt in {1..90}; do "
            "if systemctl --user is-active --quiet oci-image-pilot.service; then "
            f"exec /home/opc/oci-image-pilot/tests/run-tests.sh --wait {context.args.WaitSeconds} "
            "--expect-source oci; fi; sleep 2; done; exit 1'"
        )
    ssh_run(private_key, known_hosts, target, command)
    if not context.is_lakehouse:
        baseline = (
            "command -v sql >/dev/null 2>&1 && test -x /usr/local/bin/sql && "
            "test -x /opt/sqlcl/bin/sql && rpm -q jdk-21-headless >/dev/null 2>&1 && "
            "rpm -q jdk-26-headless >/dev/null 2>&1"
        )
        ssh_run(private_key, known_hosts, target, baseline)
        passed("SQLcl launcher plus JDK 21 and JDK 26 baseline verified on the test VM")


def http_status(url: str, insecure_tls: bool) -> int:
    context = ssl._create_unverified_context() if insecure_tls else ssl.create_default_context()
    request = urllib.request.Request(url, method="GET", headers={"User-Agent": "oci-image-pilot"})
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    if url.startswith("https://"):
        opener = urllib.request.build_opener(
            urllib.request.ProxyHandler({}), urllib.request.HTTPSHandler(context=context)
        )
    try:
        with opener.open(request, timeout=15) as response:
            return response.status
    except urllib.error.HTTPError as exc:
        return exc.code
    except (OSError, urllib.error.URLError):
        return 0


def wait_for_endpoints(
    public_ip: str, endpoints: list[dict[str, object]], timeout_seconds: int
) -> None:
    for endpoint in endpoints:
        deadline = time.monotonic() + timeout_seconds
        url = str(endpoint["url"]).replace("{host}", public_ip)
        codes = set(int(code) for code in endpoint["codes"])
        status = 0
        while time.monotonic() < deadline:
            status = http_status(url, bool(endpoint["insecure_tls"]))
            if status in codes:
                passed(f"{endpoint['name']} is externally reachable at {url}")
                break
            time.sleep(10)
        if status not in codes:
            raise PipelineError(
                f"{endpoint['name']} did not return an expected HTTP status at {url}. "
                f"Last status: {status or '000'}"
            )


def matches_approved_plan_variable(actual: object, expected: object) -> bool:
    """Accept Terraform's scalar CLI-input representation without weakening the check."""
    if isinstance(expected, bool):
        return actual is expected or actual == str(expected).lower()
    if isinstance(expected, int):
        return actual == expected or actual == str(expected)
    return actual == expected


def assert_direct_image_plan(
    context: PipelineContext, plan_path: pathlib.Path, image_ocid: str, ports: list[int]
) -> None:
    plan = terraform_json(context, ["show", "-json", str(plan_path)], "Terraform plan")
    variables = plan.get("variables", {}) if isinstance(plan, dict) else {}
    expected_variables: dict[str, object] = {
        "instance_image_id": image_ocid,
        "use_marketplace_image": False,
        "instance_count": 1,
    }
    if terraform_variable_declared(context, "enable_test_access_nsg"):
        expected_variables["enable_test_access_nsg"] = True
    if terraform_variable_declared(context, "expose_login_outputs"):
        expected_variables["expose_login_outputs"] = False
    for name, expected in expected_variables.items():
        actual = variables.get(name, {}).get("value") if isinstance(variables.get(name), dict) else None
        if not matches_approved_plan_variable(actual, expected):
            raise PipelineError(f"Terraform plan variable {name} does not match the approved test value.")
    planned_ports = variables.get("allowed_tcp_ports", {}).get("value", [])
    if sorted(planned_ports) != ports:
        raise PipelineError("Terraform plan allowed_tcp_ports does not match declared endpoints.")
    planned = plan.get("planned_values", {}) if isinstance(plan, dict) else {}
    resources = flatten_state_resources(planned.get("root_module", {}))
    instances = [item for item in resources if item.get("type") == "oci_core_instance"]
    if len(instances) != 1:
        raise PipelineError("Terraform plan must contain exactly one test VM.")
    values = instances[0].get("values", {})
    source = values.get("source_details", []) if isinstance(values, dict) else []
    if not isinstance(source, list) or len(source) != 1 or source[0].get("source_id") != image_ocid:
        raise PipelineError("Terraform plan test VM does not use the requested custom image.")
    rules = [
        item
        for item in resources
        if item.get("type") == "oci_core_network_security_group_security_rule"
    ]
    if len(rules) != len(ports):
        raise PipelineError("Terraform plan must contain one temporary NSG ingress rule per port.")
    passed("Terraform plan is restricted to the requested image, VM, NSG, and declared ports")


def terraform_state_resources(context: PipelineContext) -> list[dict[str, object]]:
    state = terraform_json(context, ["show", "-json"], "Terraform state")
    values = state.get("values", {}) if isinstance(state, dict) else {}
    return flatten_state_resources(values.get("root_module", {}))


def clear_lakehouse_buckets(context: PipelineContext, *, allow_missing: bool = False) -> None:
    if not context.is_lakehouse:
        return
    try:
        resources = terraform_state_resources(context)
    except PipelineError:
        if allow_missing:
            return
        raise
    buckets = [item for item in resources if item.get("type") == "oci_objectstorage_bucket"]
    for bucket in buckets:
        values = bucket.get("values", {})
        if not isinstance(values, dict):
            continue
        name = values.get("name")
        namespace = values.get("namespace")
        if not isinstance(name, str) or not isinstance(namespace, str) or not name or not namespace:
            if allow_missing:
                continue
            raise PipelineError("Terraform bucket state is missing name or namespace.")
        common = oci_common(
            context.terraform_config,
            context.terraform_profile,
            context.terraform_region,
            context.terraform_auth,
        )
        result = run(
            [command_path("oci"), "os", "object", "bulk-delete", "--namespace", namespace,
             "--bucket-name", name, "--force"] + common,
            check=not allow_missing,
            sensitive=True,
            capture=allow_missing,
        )
        if result.returncode == 0:
            step(f"Emptied disposable acceptance bucket '{name}' before Terraform destroy")


def assert_destroyed_state(context: PipelineContext) -> None:
    resources = terraform_state_resources(context)
    managed = [item for item in resources if item.get("mode", "managed") == "managed"]
    if managed:
        raise PipelineError("Terraform destroy completed but managed resources remain in state.")


def delete_workspace(context: PipelineContext, workspace: str) -> None:
    terraform_run(context, ["workspace", "delete", workspace])
    if workspace in list_workspaces(context):
        raise PipelineError(f"Terraform workspace still exists after deletion: {workspace}")


def receipt_snapshot(context: PipelineContext, receipt: dict[str, object]) -> pathlib.Path:
    name = receipt.get("variable_snapshot")
    if not isinstance(name, str) or pathlib.Path(name).name != name:
        raise PipelineError("Terraform cleanup receipt contains an invalid variable snapshot name.")
    return require_file(context.terraform_automation / name, "Terraform variable snapshot")


def cleanup_workspace(
    context: PipelineContext,
    workspace: str,
    receipt_path: pathlib.Path,
    *,
    inspection: bool,
) -> None:
    value = read_json(receipt_path, "Terraform cleanup receipt")
    if not isinstance(value, dict) or value.get("schema_version") != 1:
        raise PipelineError(f"Terraform cleanup receipt is invalid: {receipt_path}")
    if value.get("workspace_name") != workspace:
        raise PipelineError(f"Terraform cleanup receipt does not match '{workspace}'.")
    image_ocid = value.get("image_ocid")
    raw_ports = value.get("allowed_tcp_ports")
    if not isinstance(image_ocid, str) or not IMAGE_OCID_RE.fullmatch(image_ocid):
        raise PipelineError("Terraform cleanup receipt contains an invalid image OCID.")
    if (
        not isinstance(raw_ports, list)
        or not raw_ports
        or any(isinstance(port, bool) or not isinstance(port, int) or not 1 <= port <= 65535 for port in raw_ports)
    ):
        raise PipelineError("Terraform cleanup receipt contains invalid TCP ports.")
    snapshot = receipt_snapshot(context, value)
    workspaces = list_workspaces(context)
    if workspace not in workspaces:
        raise PipelineError(f"Terraform workspace was not found: {workspace}")
    original = terraform_run(context, ["workspace", "show"], capture=True).stdout.strip()
    return_to = "default" if original == workspace else original
    selected = False
    try:
        terraform_run(context, ["workspace", "select", workspace])
        selected = True
        clear_lakehouse_buckets(context, allow_missing=True)
        context.refresh_auth()
        terraform_run(
            context,
            ["destroy", "-auto-approve", "-input=false"]
            + terraform_arguments(context, snapshot, image_ocid, sorted(set(raw_ports))),
            sensitive=True,
        )
        assert_destroyed_state(context)
    finally:
        if selected:
            terraform_run(context, ["workspace", "select", return_to], check=False)
    delete_workspace(context, workspace)
    for path in (
        receipt_path,
        snapshot,
        context.terraform_automation / f"{workspace}.tfplan",
        context.terraform_automation / f"{workspace}.known_hosts",
    ):
        path.unlink(missing_ok=True)
    label = "Inspection" if inspection else "Failed-test"
    passed(f"{label} resources and workspace '{workspace}' were removed")


def show_inspection(context: PipelineContext, inspection_id: str) -> None:
    receipt_path = context.terraform_automation / f"{inspection_id}.json"
    value = read_json(receipt_path, "Inspection receipt")
    if not isinstance(value, dict) or value.get("workspace_name") != inspection_id:
        raise PipelineError(f"Inspection receipt does not match '{inspection_id}'.")
    original = terraform_run(context, ["workspace", "show"], capture=True).stdout.strip()
    try:
        terraform_run(context, ["workspace", "select", inspection_id])
        image_ocid = str(value.get("image_ocid", ""))
        assert_direct_image_state(context, image_ocid)
        output_names = (
            "test_instance_public_ips",
            "application_url",
            "dashboard_url",
            "jupyter_url",
            "dashboard_user",
            "vnc_password",
            "database_user",
            "app_user_password",
            "jupyter_password",
            "ssh_command",
        )
        outputs: dict[str, str] = {}
        for name in output_names:
            result = terraform_output(context, name, optional=True)
            if result is None:
                outputs[name] = ""
            else:
                values = result if isinstance(result, list) else [result]
                outputs[name] = str(values[0]) if values else ""
        value["status"] = "ready"
        value["public_ip"] = outputs["test_instance_public_ips"]
        atomic_json(receipt_path, value)
        print("\nINSPECTION LOGIN INFO")
        print(f"Inspection ID: {inspection_id}")
        print(f"Image name: {value.get('image_name', '')}")
        print(f"Image OCID: {image_ocid}")
        print(f"Public IP: {outputs['test_instance_public_ips']}")
        print(f"Application: {outputs['application_url']}")
        print(f"Runtime service dashboard: {outputs['dashboard_url']}")
        print(f"JupyterLab: {outputs['jupyter_url']}")
        print(f"Dashboard username: {outputs['dashboard_user']}")
        print(f"Dashboard password: {outputs['vnc_password']}")
        print(f"Database username: {outputs['database_user']}")
        print(f"Database password: {outputs['app_user_password']}")
        print(f"JupyterLab password: {outputs['jupyter_password']}")
        print(f"SSH: {outputs['ssh_command']}")
        print("Treat the displayed login values as sensitive.")
    finally:
        terraform_run(context, ["workspace", "select", original], check=False)


def terraform_acceptance(
    context: PipelineContext,
    image_ocid: str,
    endpoints: list[dict[str, object]],
    *,
    inspection: bool,
) -> str:
    ports = endpoint_ports(endpoints)
    private_key = resolve_ssh_private_key(context.args.SshPrivateKeyPath, context.terraform_vars)
    workspace = timestamp_id("inspection" if inspection else "packer-test")
    snapshot = context.terraform_automation / f"{workspace}.tfvars"
    plan = context.terraform_automation / f"{workspace}.tfplan"
    known_hosts = context.terraform_automation / f"{workspace}.known_hosts"
    context.terraform_automation.mkdir(parents=True, exist_ok=True)
    if any(path.exists() for path in (snapshot, plan, known_hosts)):
        raise PipelineError(f"Workspace '{workspace}' already has local automation files.")
    shutil.copyfile(context.terraform_vars, snapshot)
    os.chmod(snapshot, 0o600)
    receipt = write_workspace_receipt(context, workspace, image_ocid, snapshot, ports, inspection)
    original = terraform_run(context, ["workspace", "show"], capture=True).stdout.strip()
    workspace_created = False
    apply_started = False
    destroyed = False
    tests_passed = False
    public_ip = ""
    variable_arguments = terraform_arguments(context, snapshot, image_ocid, ports)
    try:
        terraform_run(context, ["workspace", "new", workspace])
        workspace_created = True
        terraform_run(
            context,
            ["plan", "-input=false", f"-out={plan}"] + variable_arguments,
            sensitive=True,
        )
        assert_direct_image_plan(context, plan, image_ocid, ports)
        apply_started = True
        context.refresh_auth()
        terraform_run(context, ["apply", "-input=false", str(plan)], sensitive=True)
        assert_direct_image_state(context, image_ocid)
        public_ips = terraform_output(context, "test_instance_public_ips")
        if not isinstance(public_ips, list) or len(public_ips) != 1:
            raise PipelineError("Terraform did not return exactly one test VM public IP.")
        public_ip = str(ipaddress.IPv4Address(public_ips[0]))
        target = f"opc@{public_ip}"
        step(f"Waiting for SSH before staging protected runtime files on {target}")
        wait_for_ssh(private_key, known_hosts, target, context.args.WaitSeconds)
        install_runtime_files(context, private_key, known_hosts, target)
        if inspection:
            value = read_json(receipt, "Inspection receipt")
            assert isinstance(value, dict)
            value["status"] = "ready"
            value["public_ip"] = public_ip
            atomic_json(receipt, value)
            print("\nINSPECTION VM DEPLOYED")
            print(f"Inspection ID: {workspace}")
            print(f"Image name: {context.args.ImageName}")
            print(f"Image OCID: {image_ocid}")
            print(f"Public IP: {public_ip}")
            for endpoint in endpoints:
                print(f"{endpoint['name']}: {str(endpoint['url']).replace('{host}', public_ip)}")
            print(f"SSH: ssh -i {shlex.quote(str(private_key))} opc@{public_ip}")
            print("Acceptance tests, reboot, and automatic cleanup: SKIPPED FOR INSPECTION")
            passed("Inspection VM was deployed with fresh Terraform metadata")
            return workspace
        step(f"Waiting for first boot on {target}")
        remote_verification(context, private_key, known_hosts, target)
        wait_for_endpoints(public_ip, endpoints, context.args.WaitSeconds)
        passed("Initial boot verification completed")
        step("Rebooting the test VM")
        ssh_run(private_key, known_hosts, target, "sudo systemctl reboot", check=False)
        wait_for_ssh_shutdown(private_key, known_hosts, target)
        wait_for_ssh(private_key, known_hosts, target, context.args.WaitSeconds)
        remote_verification(context, private_key, known_hosts, target)
        wait_for_endpoints(public_ip, endpoints, context.args.WaitSeconds)
        tests_passed = True
        passed("Clean boot, metadata, every Compose service, every endpoint, and reboot persistence passed")
        if context.args.KeepTestResources:
            warn(f"Terraform workspace '{workspace}' was kept by request and contains generated secrets.")
            return workspace
        step("Destroying the isolated test VM and temporary NSG")
        clear_lakehouse_buckets(context, allow_missing=True)
        context.refresh_auth()
        terraform_run(
            context,
            ["destroy", "-auto-approve", "-input=false"] + variable_arguments,
            sensitive=True,
        )
        assert_destroyed_state(context)
        destroyed = True
        passed("Terraform test resources were destroyed")
    finally:
        plan.unlink(missing_ok=True)
        known_hosts.unlink(missing_ok=True)
        if workspace_created:
            terraform_run(context, ["workspace", "select", original], check=False)
            if destroyed or not apply_started:
                delete_workspace(context, workspace)
                snapshot.unlink(missing_ok=True)
                receipt.unlink(missing_ok=True)
            elif not inspection and not tests_passed:
                warn(f"Terraform workspace '{workspace}' was preserved for inspection. Its state contains generated secrets.")
                warn(f"Rerun with -CleanupFailedTest '{workspace}' after diagnosing the failure.")
        elif not apply_started:
            snapshot.unlink(missing_ok=True)
            receipt.unlink(missing_ok=True)
    if not tests_passed:
        raise PipelineError("Custom image verification did not complete.")
    return workspace


def get_instance(context: PipelineContext, name: str) -> dict[str, object]:
    response = oci_json(
        [
            "compute",
            "instance",
            "list",
            "--compartment-id",
            context.compartment,
            "--display-name",
            name,
            "--all",
        ],
        context.common,
    )
    instances = response.get("data", []) if isinstance(response, dict) else []
    if not isinstance(instances, list) or len(instances) != 1 or not isinstance(instances[0], dict):
        raise PipelineError(
            f"Expected exactly one OCI Compute instance named '{name}', but found {len(instances)}."
        )
    instance = instances[0]
    if instance.get("display-name") != name or not str(instance.get("id", "")).startswith(
        "ocid1.instance."
    ):
        raise PipelineError(f"OCI returned invalid data for build instance '{name}'.")
    return instance


def instance_public_ip(context: PipelineContext, instance_ocid: str) -> str:
    response = oci_json(
        ["compute", "instance", "list-vnics", "--instance-id", instance_ocid, "--all"],
        context.common,
    )
    vnics = response.get("data", []) if isinstance(response, dict) else []
    if not isinstance(vnics, list) or not vnics:
        return ""
    primary = next((item for item in vnics if item.get("is-primary") is True), vnics[0])
    return str(primary.get("public-ip") or "")


def image_document(context: PipelineContext, image_ocid: str) -> dict[str, object]:
    response = oci_json(
        ["compute", "image", "get", "--image-id", image_ocid], context.common
    )
    image = response.get("data") if isinstance(response, dict) else None
    if not isinstance(image, dict):
        raise PipelineError("OCI image lookup returned no image data.")
    return image


def verify_existing_image(context: PipelineContext, image_ocid: str) -> None:
    image = image_document(context, image_ocid)
    if (
        image.get("id") != image_ocid
        or image.get("display-name") != context.args.ImageName
        or image.get("compartment-id") != context.image_compartment
        or image.get("lifecycle-state") != "AVAILABLE"
    ):
        raise PipelineError(
            f"The supplied image must be AVAILABLE, named '{context.args.ImageName}', "
            "and stored in the configured image compartment."
        )
    passed(f"Verified existing image '{context.args.ImageName}' ({image_ocid})")


def manual_receipt_fields() -> set[str]:
    return {
        "schema_version",
        "kind",
        "image_name",
        "build_instance_name",
        "build_instance_ocid",
        "build_instance_public_ip",
        "compartment_ocid",
        "image_compartment_ocid",
        "base_image_ocid",
        "source_sha256",
        "region",
        "created_utc",
    }


def read_manual_receipt(context: PipelineContext) -> dict[str, object]:
    value = read_json(context.manual_receipt, "Manual capture receipt")
    if not isinstance(value, dict) or set(value) != manual_receipt_fields():
        raise PipelineError(f"Manual capture receipt contains unsupported fields: {context.manual_receipt}")
    if (
        value.get("schema_version") != 1
        or value.get("kind") != "oci-manual-image-capture"
        or not isinstance(value.get("image_name"), str)
        or not IMAGE_NAME_RE.fullmatch(str(value["image_name"]))
        or not str(value.get("build_instance_ocid", "")).startswith("ocid1.instance.")
        or not COMPARTMENT_OCID_RE.fullmatch(str(value.get("compartment_ocid", "")))
        or not COMPARTMENT_OCID_RE.fullmatch(str(value.get("image_compartment_ocid", "")))
        or not IMAGE_OCID_RE.fullmatch(str(value.get("base_image_ocid", "")))
        or not re.fullmatch(r"[a-f0-9]{64}", str(value.get("source_sha256", "")))
    ):
        raise PipelineError(f"Manual capture receipt contains invalid values: {context.manual_receipt}")
    return value


def write_manual_receipt(
    context: PipelineContext,
    instance: dict[str, object],
    public_ip: str,
    digest: str,
) -> None:
    atomic_json(
        context.manual_receipt,
        {
            "schema_version": 1,
            "kind": "oci-manual-image-capture",
            "image_name": context.args.ImageName,
            "build_instance_name": str(instance["display-name"]),
            "build_instance_ocid": str(instance["id"]),
            "build_instance_public_ip": public_ip,
            "compartment_ocid": context.compartment,
            "image_compartment_ocid": context.image_compartment,
            "base_image_ocid": context.base_image,
            "source_sha256": digest,
            "region": context.region,
            "created_utc": utc_now(),
        },
    )


def parse_utc(value: str) -> dt.datetime:
    return dt.datetime.fromisoformat(value.replace("Z", "+00:00"))


def verify_manual_capture(context: PipelineContext, image_ocid: str) -> None:
    receipt = read_manual_receipt(context)
    if receipt["image_name"] != context.args.ImageName:
        raise PipelineError(
            f"ImageName '{context.args.ImageName}' does not match the pending manual capture "
            f"'{receipt['image_name']}'."
        )
    if receipt["source_sha256"] != source_digest(context):
        step(f"Local image sources changed after manual capture. Continuing to test immutable image '{image_ocid}'.")
    response = oci_json(
        [
            "compute",
            "instance",
            "list",
            "--compartment-id",
            str(receipt["compartment_ocid"]),
            "--display-name",
            str(receipt["build_instance_name"]),
            "--all",
        ],
        context.common,
    )
    instances = response.get("data", []) if isinstance(response, dict) else []
    if instances:
        if (
            len(instances) != 1
            or instances[0].get("id") != receipt["build_instance_ocid"]
            or instances[0].get("lifecycle-state") != "TERMINATED"
        ):
            raise PipelineError(
                f"The preserved build instance '{receipt['build_instance_name']}' is not TERMINATED. "
                "Terminate it and its boot volume after the image becomes AVAILABLE."
            )
    image = image_document(context, image_ocid)
    if (
        image.get("id") != image_ocid
        or image.get("display-name") != context.args.ImageName
        or image.get("compartment-id") != receipt["image_compartment_ocid"]
        or image.get("lifecycle-state") != "AVAILABLE"
    ):
        raise PipelineError("The manually captured image name, compartment, or lifecycle state is invalid.")
    try:
        if parse_utc(str(image["time-created"])) < parse_utc(str(receipt["created_utc"])):
            raise PipelineError("The supplied image predates this manual-capture build.")
    except (KeyError, ValueError) as exc:
        raise PipelineError("OCI image or manual receipt has an invalid creation timestamp.") from exc
    passed(
        f"Verified manually captured image '{context.args.ImageName}' ({image_ocid}) and terminated build VM"
    )


def manual_instance_name(image_name: str) -> str:
    suffix = f"-manual-{dt.datetime.now(dt.timezone.utc).strftime('%Y%m%d%H%M%S')}-{os.getpid()}"
    return f"{image_name[:255-len(suffix)]}{suffix}"


def packer_variables(
    context: PipelineContext,
    *,
    manual: bool,
    instance_name: str = "",
    manual_capture_ssh_public_key: str = "",
) -> list[str]:
    values = [f"-var-file={context.packer_vars}", "-var", f"image_name={context.args.ImageName}"]
    if manual:
        public_key = ssh_public_identity(manual_capture_ssh_public_key)
        if not public_key:
            raise PipelineError("Manual capture requires a valid OpenSSH public key.")
        values += [
            "-var",
            "skip_create_image=true",
            "-var",
            "manual_capture_mode=true",
            "-var",
            f"build_instance_name={instance_name}",
            "-var",
            f"manual_capture_ssh_public_key={public_key}",
        ]
    else:
        values += ["-var", "skip_create_image=false", "-var", "manual_capture_mode=false"]
    return values


def validate_packer(
    context: PipelineContext,
    *,
    manual: bool,
    instance_name: str = "",
    manual_capture_ssh_public_key: str = "",
) -> None:
    packer = command_path("packer")
    run([packer, "init", "."], cwd=context.script_root)
    run([packer, "fmt", "-check", "."], cwd=context.script_root)
    run(
        [packer, "validate"]
        + packer_variables(
            context,
            manual=manual,
            instance_name=instance_name,
            manual_capture_ssh_public_key=manual_capture_ssh_public_key,
        )
        + ["."],
        cwd=context.script_root,
    )
    passed("Packer initialization, formatting, and validation completed")


def print_manual_instructions(
    context: PipelineContext, instance: dict[str, object], public_ip: str
) -> None:
    print("\nMANUAL IMAGE CAPTURE VM READY")
    print(f"Build instance name: {instance['display-name']}")
    print(f"Build instance OCID: {instance['id']}")
    if public_ip:
        print(f"Build instance public IP: {public_ip}")
    print(f"Target custom image name: {context.args.ImageName}")
    print(f"Target image compartment: {context.image_compartment}")
    print("\nOCI Console steps:")
    print("1. Open this exact Compute instance and stop it.")
    print("2. Choose More actions > Create custom image.")
    print(f"3. Name the image exactly '{context.args.ImageName}' and use the target image compartment above.")
    print("4. Wait until the custom image is AVAILABLE.")
    print("5. Terminate this preserved build instance and delete its boot volume.")
    print("6. Run the same native script with -ExistingImageOcid <new-image-ocid>.")
    print("\nThe next command runs Terraform metadata, service, endpoint, reboot, and cleanup tests.")


def prepare_manual_capture(
    context: PipelineContext,
    instance_name: str,
    manual_capture_ssh_public_key: str,
) -> None:
    digest_before = source_digest(context)
    code, output = run_stream(
        [command_path("packer"), "build", "-on-error=abort"]
        + packer_variables(
            context,
            manual=True,
            instance_name=instance_name,
            manual_capture_ssh_public_key=manual_capture_ssh_public_key,
        )
        + ["."],
        cwd=context.script_root,
    )
    marker = f"OCI_MANUAL_CAPTURE_READY:{instance_name}"
    if code == 0 or marker not in output:
        raise PipelineError(
            f"Packer did not reach the final manual-capture marker. Inspect and terminate "
            f"'{instance_name}' before retrying."
        )
    passed(f"Packer completed provisioning and deliberately preserved '{instance_name}' before image capture")
    if digest_before != source_digest(context):
        raise PipelineError(
            f"Image source files changed while Packer prepared '{instance_name}'. "
            "Terminate it and rerun so the local contract matches the image."
        )
    context.refresh_auth()
    instance = get_instance(context, instance_name)
    if instance.get("lifecycle-state") != "RUNNING":
        raise PipelineError(f"The preserved build instance '{instance_name}' is not RUNNING.")
    public_ip = instance_public_ip(context, str(instance["id"]))
    write_manual_receipt(context, instance, public_ip, digest_before)
    print_manual_instructions(context, instance, public_ip)


def resume_manual_capture(context: PipelineContext, instance_name: str) -> None:
    if context.manual_receipt.exists():
        receipt = read_manual_receipt(context)
        raise PipelineError(
            f"A manual image capture receipt already exists for '{receipt['build_instance_name']}'."
        )
    confirm_tester_cidr(context.source_cidr)
    context.refresh_auth()
    instance = get_instance(context, instance_name)
    if instance.get("lifecycle-state") != "RUNNING":
        raise PipelineError(f"The preserved build instance '{instance_name}' is not RUNNING.")
    public_ip = instance_public_ip(context, str(instance["id"]))
    if not public_ip:
        raise PipelineError(f"The preserved build instance '{instance_name}' has no public IP.")
    private_key = resolve_ssh_private_key(context.args.SshPrivateKeyPath, context.terraform_vars)
    known_hosts = context.automation / "manual-capture-resume.known_hosts"
    wrapper = require_file(context.script_root / "prepare-image.sh", "Manual cleanup wrapper")
    wait_for_ssh(private_key, known_hosts, f"opc@{public_ip}", context.args.WaitSeconds)
    scp_file(private_key, known_hosts, wrapper, f"opc@{public_ip}:/tmp/oci-image-pilot-prepare-image.sh")
    ssh_run(
        private_key,
        known_hosts,
        f"opc@{public_ip}",
        "sudo install -m 0755 /tmp/oci-image-pilot-prepare-image.sh "
        "/home/opc/oci-image-pilot/scripts/prepare-image.sh && "
        "sudo /home/opc/oci-image-pilot/scripts/prepare-image.sh --final && "
        "rm -f /tmp/oci-image-pilot-prepare-image.sh",
    )
    write_manual_receipt(context, instance, public_ip, source_digest(context))
    passed(f"Recovered the manual-capture receipt for '{instance_name}'")
    print_manual_instructions(context, instance, public_ip)


def packer_artifact(context: PipelineContext) -> str:
    document = read_json(context.manifest, "Packer manifest")
    builds = document.get("builds", []) if isinstance(document, dict) else []
    if not isinstance(builds, list) or len(builds) != 1:
        raise PipelineError("Packer manifest must contain exactly one build.")
    artifact = str(builds[0].get("artifact_id", ""))
    candidates = re.findall(r"ocid1\.image\.[A-Za-z0-9.-]+\.[A-Za-z0-9]+", artifact)
    if len(candidates) != 1:
        raise PipelineError("Packer manifest did not contain exactly one image OCID.")
    return candidates[0]


def new_ready_receipt(context: PipelineContext, image_ocid: str) -> dict[str, object]:
    completed = utc_now()
    release = (
        f"release-{dt.datetime.now(dt.timezone.utc).strftime('%Y%m%d%H%M%S')}-"
        f"{uuid.uuid4().hex[:12]}"
    )
    return {
        "schema_version": 2,
        "kind": READY_KIND,
        "release_id": release,
        "image_name": context.args.ImageName,
        "image_ocid": image_ocid,
        "region": context.region,
        "automated_test_status": "passed",
        "reboot_test_status": "passed",
        "cleanup_status": "passed",
        "inspection_id": "",
        "inspection_status": "pending",
        "created_utc": completed,
        "updated_utc": completed,
        "automated_test_completed_utc": completed,
        "reboot_test_completed_utc": completed,
        "cleanup_completed_utc": completed,
        "inspection_started_utc": "",
        "inspection_completed_utc": "",
        "inspection_approved_utc": "",
        "attestation": None,
    }


def validate_ready_receipt(value: object) -> dict[str, object]:
    if not isinstance(value, dict) or set(value) != set(READY_CORE_FIELDS) | {"attestation"}:
        raise PipelineError("Ready-for-Marketplace receipt contains missing or unsupported fields.")
    if value.get("schema_version") != 2 or value.get("kind") != READY_KIND:
        raise PipelineError("Ready-for-Marketplace receipt schema or kind is invalid.")
    if not re.fullmatch(r"release-[0-9]{14}-[a-f0-9]{12}", str(value.get("release_id", ""))):
        raise PipelineError("Ready-for-Marketplace release_id is invalid.")
    if not IMAGE_NAME_RE.fullmatch(str(value.get("image_name", ""))):
        raise PipelineError("Ready-for-Marketplace image_name is invalid.")
    if not IMAGE_OCID_RE.fullmatch(str(value.get("image_ocid", ""))):
        raise PipelineError("Ready-for-Marketplace image_ocid is invalid.")
    for name in ("automated_test_status", "reboot_test_status", "cleanup_status"):
        if value.get(name) != "passed":
            raise PipelineError(f"Ready-for-Marketplace {name} must be passed.")
    status = value.get("inspection_status")
    if status not in ("pending", "deployed", "cleaned_not_approved", "approved"):
        raise PipelineError("Ready-for-Marketplace inspection_status is invalid.")
    inspection_id = str(value.get("inspection_id", ""))
    if status == "pending" and inspection_id:
        raise PipelineError("A pending handoff cannot contain an inspection ID.")
    if status != "pending" and not INSPECTION_RE.fullmatch(inspection_id):
        raise PipelineError("Ready-for-Marketplace inspection ID is invalid.")
    if status == "approved" and not isinstance(value.get("attestation"), dict):
        raise PipelineError("An approved handoff must contain a KMS attestation.")
    if status != "approved" and value.get("attestation") is not None:
        raise PipelineError("An unapproved handoff cannot contain an attestation.")
    return value


def read_ready_receipt(context: PipelineContext, *, required: bool = False) -> dict[str, object] | None:
    if not context.ready_receipt.is_file():
        if required:
            raise PipelineError(f"Ready-for-Marketplace receipt was not found: {context.ready_receipt}")
        return None
    return validate_ready_receipt(read_json(context.ready_receipt, "Ready-for-Marketplace receipt"))


def write_ready_receipt(context: PipelineContext, value: dict[str, object]) -> None:
    validate_ready_receipt(value)
    atomic_json(context.ready_receipt, value)


def ready_payload(value: dict[str, object]) -> bytes:
    lines: list[str] = []
    for name in READY_CORE_FIELDS:
        item = value.get(name)
        if name == "schema_version":
            text_value = "2"
        elif isinstance(item, str):
            text_value = item
        else:
            raise PipelineError(f"Ready receipt field {name} must be a string.")
        if any(character in text_value for character in ("\r", "\n", "\0")):
            raise PipelineError(f"Ready receipt field {name} contains control characters.")
        lines.append(f"{name}={text_value}")
    return ("\n".join(lines) + "\n").encode()


def resolve_relative_file(value: str, base: pathlib.Path, label: str) -> pathlib.Path:
    path = pathlib.Path(os.path.expandvars(os.path.expanduser(value)))
    if not path.is_absolute():
        path = base / path
    return require_file(path, label)


def sign_ready_receipt(context: PipelineContext, value: dict[str, object]) -> None:
    requested = context.args.MarketplaceAttestationFile
    path = pathlib.Path(requested) if requested else context.project_root / "01-edit" / "marketplace-attestation.json"
    configuration = read_json(path, "Marketplace attestation configuration")
    expected = {
        "schema_version",
        "config_file",
        "profile",
        "auth",
        "region",
        "crypto_endpoint",
        "key_ocid",
        "signing_algorithm",
    }
    if not isinstance(configuration, dict) or set(configuration) != expected:
        raise PipelineError("Marketplace attestation configuration has missing or unsupported fields.")
    if configuration.get("schema_version") != 1:
        raise PipelineError("Marketplace attestation schema_version must be 1.")
    auth_value = str(configuration.get("auth", ""))
    if auth_value not in ("api_key", "security_token"):
        raise PipelineError("Marketplace attestation auth must be api_key or security_token.")
    auth = "APIKey" if auth_value == "api_key" else "SecurityToken"
    profile = str(configuration.get("profile", ""))
    region = str(configuration.get("region", ""))
    config_file = resolve_relative_file(
        str(configuration.get("config_file", "")), path.resolve().parent, "Attestation OCI config"
    )
    validate_profile(config_file, profile, auth)
    refresh_token(config_file, profile, region, auth)
    endpoint = str(configuration.get("crypto_endpoint", "")).rstrip("/")
    parsed = urllib.parse.urlparse(endpoint)
    if (
        parsed.scheme != "https"
        or parsed.port not in (None, 443)
        or parsed.path not in ("", "/")
        or parsed.query
        or parsed.fragment
        or "-crypto.kms." not in (parsed.hostname or "")
        or not (parsed.hostname or "").endswith(".oraclecloud.com")
    ):
        raise PipelineError("Attestation crypto_endpoint must be a direct OCI KMS HTTPS endpoint.")
    key_ocid = str(configuration.get("key_ocid", ""))
    algorithm = str(configuration.get("signing_algorithm", ""))
    if not key_ocid.startswith("ocid1.key.") or algorithm != APPROVED_KMS_ALGORITHM:
        raise PipelineError("Attestation KMS key or signing algorithm is invalid.")
    digest = hashlib.sha256(ready_payload(value)).digest()
    response = oci_json(
        [
            "kms",
            "crypto",
            "signed-data",
            "sign",
            "--endpoint",
            endpoint,
            "--key-id",
            key_ocid,
            "--message",
            base64.b64encode(digest).decode(),
            "--message-type",
            "DIGEST",
            "--signing-algorithm",
            algorithm,
        ],
        oci_common(config_file, profile, region, auth),
    )
    data = response.get("data", response) if isinstance(response, dict) else {}
    signature = str(data.get("signature", ""))
    key_version = str(
        data.get("key-version-id", data.get("keyVersionId", data.get("key_version_id", "")))
    )
    response_key = str(data.get("key-id", data.get("keyId", data.get("key_id", ""))))
    response_algorithm = str(
        data.get("signing-algorithm", data.get("signingAlgorithm", data.get("signing_algorithm", "")))
    )
    try:
        signature_bytes = base64.b64decode(signature, validate=True)
    except ValueError as exc:
        raise PipelineError("OCI KMS returned an invalid signature.") from exc
    if (
        response_key != key_ocid
        or not key_version.startswith("ocid1.keyversion.")
        or response_algorithm != algorithm
        or not 64 <= len(signature_bytes) <= 2048
    ):
        raise PipelineError("OCI KMS response did not match the pinned key and algorithm.")
    value["attestation"] = {
        "type": "oci-kms-asymmetric-signature",
        "digest_algorithm": "SHA-256",
        "key_id": key_ocid,
        "key_version_id": key_version,
        "signing_algorithm": algorithm,
        "payload_sha256": digest.hex(),
        "signature": signature,
    }


def cleanup_inspection_and_receipt(context: PipelineContext, inspection_id: str) -> None:
    disposable = context.terraform_automation / f"{inspection_id}.json"
    ready = read_ready_receipt(context)
    correlated = bool(
        ready
        and ready.get("inspection_id") == inspection_id
        and ready.get("inspection_status") == "deployed"
    )
    cleanup_workspace(context, inspection_id, disposable, inspection=True)
    if correlated and ready is not None:
        completed = utc_now()
        ready["inspection_status"] = "cleaned_not_approved"
        ready["inspection_completed_utc"] = completed
        ready["inspection_approved_utc"] = ""
        ready["updated_utc"] = completed
        ready["attestation"] = None
        if context.args.ApproveForMarketplace:
            ready["inspection_status"] = "approved"
            ready["inspection_approved_utc"] = utc_now()
            ready["updated_utc"] = ready["inspection_approved_utc"]
            sign_ready_receipt(context, ready)
        write_ready_receipt(context, ready)
        passed(
            "Inspection cleanup completed"
            + (" and Marketplace handoff was approved" if context.args.ApproveForMarketplace else "")
        )
    elif context.args.ApproveForMarketplace:
        raise PipelineError("Inspection cleanup succeeded, but no correlated handoff receipt was found.")


def approve_ready_receipt(context: PipelineContext) -> None:
    ready = read_ready_receipt(context, required=True)
    assert ready is not None
    if ready["inspection_status"] == "approved":
        passed(f"Release '{ready['release_id']}' is already approved")
        return
    if ready["inspection_status"] != "cleaned_not_approved":
        raise PipelineError("Marketplace approval requires a completed and cleaned inspection.")
    ready["inspection_status"] = "approved"
    ready["inspection_approved_utc"] = utc_now()
    ready["updated_utc"] = ready["inspection_approved_utc"]
    sign_ready_receipt(context, ready)
    write_ready_receipt(context, ready)
    passed(f"Release '{ready['release_id']}' was signed and approved for Marketplace handoff")


def print_inspection_commands(inspection_id: str) -> None:
    script = "./03-automation/build-and-test-macos.sh" if sys.platform == "darwin" else "./03-automation/build-and-test-linux.sh"
    print("\nNative recovery command to show login information again:")
    print(f"bash {script} -ShowInspectionInfo {shlex.quote(inspection_id)}")
    print("Native cleanup-only command:")
    print(f"bash {script} -CleanupInspection {shlex.quote(inspection_id)}")
    print("Native cleanup-and-approval command:")
    print(
        f"bash {script} -CleanupInspection {shlex.quote(inspection_id)} "
        "-ApproveForMarketplace"
    )


def run_pipeline() -> None:
    args = parse_arguments()
    started = time.monotonic()
    context = PipelineContext(args)
    lock_context: contextlib.AbstractContextManager[object]
    lock_context = contextlib.nullcontext() if args.ValidateOnly else FileLock(
        context.ready_lock, "build, inspection, cleanup, or approval"
    )
    with lock_context:
        validate_local_contract(context)
        endpoints = all_endpoints(context)
        validate_terraform(context)
        if args.ShowInspectionInfo:
            show_inspection(context, args.ShowInspectionInfo)
            return
        if args.CleanupInspection:
            cleanup_inspection_and_receipt(context, args.CleanupInspection)
            return
        if args.CleanupFailedTest:
            cleanup_workspace(
                context,
                args.CleanupFailedTest,
                context.terraform_automation / f"{args.CleanupFailedTest}.failed-test.json",
                inspection=False,
            )
            return
        if args.ApproveForMarketplace and not args.ExistingImageOcid:
            approve_ready_receipt(context)
            return
        if args.InspectionMode:
            ready = read_ready_receipt(context)
            if ready and ready["image_ocid"] != args.ExistingImageOcid:
                raise PipelineError("Inspection image does not match the Ready-for-Marketplace receipt.")
            confirm_tester_cidr(context.source_cidr)
            context.refresh_auth()
            verify_existing_image(context, args.ExistingImageOcid)
            inspection_id = terraform_acceptance(
                context, args.ExistingImageOcid, endpoints, inspection=True
            )
            if ready:
                ready["inspection_id"] = inspection_id
                ready["inspection_status"] = "deployed"
                ready["inspection_started_utc"] = utc_now()
                ready["inspection_completed_utc"] = ""
                ready["inspection_approved_utc"] = ""
                ready["updated_utc"] = ready["inspection_started_utc"]
                ready["attestation"] = None
                write_ready_receipt(context, ready)
                passed(f"Inspection '{inspection_id}' was correlated with release '{ready['release_id']}'")
            print_inspection_commands(inspection_id)
            return

        if args.ResumeManualCaptureInstance:
            resume_manual_capture(context, args.ResumeManualCaptureInstance)
            return
        manual_capture_ssh_public_key = (
            resolve_manual_capture_ssh_public_key(context) if args.PrepareManualCapture else ""
        )
        instance_name = manual_instance_name(args.ImageName) if args.PrepareManualCapture else ""
        validate_packer(
            context,
            manual=args.PrepareManualCapture,
            instance_name=instance_name,
            manual_capture_ssh_public_key=manual_capture_ssh_public_key,
        )
        if args.ValidateOnly:
            passed("Validation-only mode created no OCI resources")
            return
        if args.ExistingImageOcid:
            context.ready_receipt.unlink(missing_ok=True)
            confirm_tester_cidr(context.source_cidr)
            context.refresh_auth()
            if context.manual_receipt.is_file():
                verify_manual_capture(context, args.ExistingImageOcid)
            else:
                step("No manual-capture receipt was found. Verifying the supplied existing image directly.")
                verify_existing_image(context, args.ExistingImageOcid)
            terraform_acceptance(context, args.ExistingImageOcid, endpoints, inspection=False)
            if not args.KeepTestResources:
                write_ready_receipt(context, new_ready_receipt(context, args.ExistingImageOcid))
                context.manual_receipt.unlink(missing_ok=True)
                print("\nREADY FOR MARKETPLACE")
                print(f"Image name: {args.ImageName}")
                print(f"Image OCID: {args.ExistingImageOcid}")
                print("Terraform clean-VM deployment, endpoints, reboot, and cleanup: PASS")
                print("Inspection status: pending")
                print(f"Sanitized handoff receipt: {context.ready_receipt}")
            return

        if context.manual_receipt.is_file():
            pending = read_manual_receipt(context)
            raise PipelineError(
                f"A manual image capture is already pending for build instance "
                f"'{pending['build_instance_name']}'. Finish it or remove the stale receipt after cleanup."
            )
        context.ready_receipt.unlink(missing_ok=True)
        confirm_tester_cidr(context.source_cidr)
        context.refresh_auth()
        confirm_packer_nsg(context)
        context.manifest.unlink(missing_ok=True)
        if args.PrepareManualCapture:
            prepare_manual_capture(context, instance_name, manual_capture_ssh_public_key)
            return
        run(
            [command_path("packer"), "build"]
            + packer_variables(context, manual=False)
            + ["."],
            cwd=context.script_root,
        )
        image_ocid = packer_artifact(context)
        passed(f"Packer created custom image '{args.ImageName}' ({image_ocid})")
        context.refresh_auth()
        terraform_acceptance(context, image_ocid, endpoints, inspection=False)
        if not args.KeepTestResources:
            write_ready_receipt(context, new_ready_receipt(context, image_ocid))
            print("\nREADY FOR MARKETPLACE")
            print(f"Image name: {args.ImageName}")
            print(f"Image OCID: {image_ocid}")
            print("Packer, Terraform, endpoints, reboot, and cleanup: PASS")
            print(f"Sanitized handoff receipt: {context.ready_receipt}")
        elapsed = int(time.monotonic() - started)
        print(f"Total elapsed time: {elapsed // 3600:02d}h {(elapsed % 3600) // 60:02d}m {elapsed % 60:02d}s")


def main() -> int:
    try:
        run_pipeline()
        return 0
    except KeyboardInterrupt:
        print("Interrupted. Any active Terraform workspace or manual build VM was preserved.", file=sys.stderr)
        return 130
    except PipelineError as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
