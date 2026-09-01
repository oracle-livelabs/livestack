#!/usr/bin/env bash
set -Eeuo pipefail

CHECK_ONLY=0
UPDATE_MODE=0
for argument in "$@"; do
  case "$argument" in
    --check) CHECK_ONLY=1 ;;
    --update) UPDATE_MODE=1 ;;
    *) printf 'Usage: bash ./setup-workstation-linux.sh [--check] [--update]\n' >&2; exit 2 ;;
  esac
done
if [[ $CHECK_ONLY -eq 1 && $UPDATE_MODE -eq 1 ]]; then
  printf 'Use either --check or --update, not both.\n' >&2
  exit 2
fi
if [[ "$(uname -s)" != "Linux" ]]; then
  printf 'This setup script is for Linux. macOS users run setup-workstation-macos.sh.\n' >&2
  exit 2
fi

say() { printf '[setup:linux] %s\n' "$*"; }
has() { command -v "$1" >/dev/null 2>&1; }
fail() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }

ensure_local_bin() {
  mkdir -p "$HOME/.local/bin"
  export PATH="$HOME/.local/bin:$PATH"
  local profile_file="$HOME/.profile"
  local path_line='export PATH="$HOME/.local/bin:$PATH"'
  touch "$profile_file"
  grep -Fqx "$path_line" "$profile_file" || printf '\n# OCI image workflow tools\n%s\n' "$path_line" >> "$profile_file"
}

run_privileged() {
  if [[ "$(id -u)" -eq 0 ]]; then
    "$@"
  elif has sudo; then
    sudo "$@"
  else
    fail 'Administrator access is required to install system packages.'
  fi
}

check_tools() {
  local missing=()
  local tool
  for tool in git terraform packer ssh curl python3 oci jq unzip; do
    has "$tool" || missing+=("$tool")
  done
  if [[ ${#missing[@]} -gt 0 ]]; then
    printf 'Missing: %s\n' "${missing[*]}" >&2
    return 1
  fi
  printf 'PASS: Native Linux prerequisites are ready; PowerShell is not required.\n'
}

if [[ $CHECK_ONLY -eq 1 ]]; then
  check_tools
  exit $?
fi

[[ -r /etc/os-release ]] || fail 'Unsupported Linux distribution: /etc/os-release is missing.'
# shellcheck disable=SC1091
source /etc/os-release
case "${ID:-}" in
  ubuntu|debian)
    run_privileged apt-get update
    run_privileged apt-get install -y ca-certificates curl git jq unzip openssh-client python3 python3-pip python3-venv pipx
    ;;
  rhel|rocky|almalinux|ol|fedora)
    package_tool='dnf'
    has dnf || package_tool='yum'
    run_privileged "$package_tool" install -y ca-certificates curl git jq unzip openssh-clients python3 python3-pip pipx
    ;;
  arch|manjaro)
    run_privileged pacman -Sy --noconfirm ca-certificates curl git jq unzip openssh python python-pipx
    ;;
  *)
    fail "Unsupported Linux distribution '${ID:-unknown}'. Install Git, curl, jq, unzip, OpenSSH, Python 3.10+, pipx, Terraform, Packer, and OCI CLI."
    ;;
esac

ensure_local_bin

hashicorp_version() {
  python3 - "$1" <<'PY'
import json
import sys
from urllib.request import urlopen

with urlopen(f"https://checkpoint-api.hashicorp.com/v1/check/{sys.argv[1]}", timeout=30) as response:
    print(json.load(response)["current_version"])
PY
}

install_hashicorp_tool() {
  local tool="$1"
  if has "$tool" && [[ $UPDATE_MODE -eq 0 ]]; then
    return
  fi
  local machine version archive temp_dir
  case "$(uname -m)" in
    x86_64|amd64) machine='amd64' ;;
    aarch64|arm64) machine='arm64' ;;
    *) fail "Unsupported Linux CPU architecture: $(uname -m)" ;;
  esac
  version="$(hashicorp_version "$tool")"
  archive="${tool}_${version}_linux_${machine}.zip"
  temp_dir="$(mktemp -d)"
  say "Installing $tool $version to ~/.local/bin."
  curl -fsSL --retry 3 "https://releases.hashicorp.com/${tool}/${version}/${archive}" -o "$temp_dir/$archive"
  unzip -qo "$temp_dir/$archive" -d "$HOME/.local/bin"
  chmod 0755 "$HOME/.local/bin/$tool"
  rm -rf "$temp_dir"
}

install_hashicorp_tool terraform
install_hashicorp_tool packer
if ! has oci; then
  say 'Installing OCI CLI for the current user with pipx.'
  pipx install oci-cli
elif [[ $UPDATE_MODE -eq 1 ]]; then
  pipx upgrade oci-cli || true
fi

check_tools
printf 'Next: fill the ignored project variable files, then use build-and-test-linux.sh.\n'
printf 'Use an existing OCI API-key profile, or create a separate token profile without reusing its name.\n'
