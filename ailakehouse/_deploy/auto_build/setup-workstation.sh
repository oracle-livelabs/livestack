#!/usr/bin/env bash
set -euo pipefail

CHECK_ONLY=0
UPDATE_MODE=0
for argument in "$@"; do
  case "$argument" in
    --check) CHECK_ONLY=1 ;;
    --update) UPDATE_MODE=1 ;;
    *) printf 'Usage: bash ./setup-workstation.sh [--check] [--update]\n' >&2; exit 2 ;;
  esac
done
if [[ $CHECK_ONLY -eq 1 && $UPDATE_MODE -eq 1 ]]; then
  printf 'Use either --check or --update, not both.\n' >&2
  exit 2
fi

say() {
  printf '[setup] %s\n' "$*"
}

fail() {
  printf 'ERROR: %s\n' "$*" >&2
  exit 1
}

has() {
  command -v "$1" >/dev/null 2>&1
}

ensure_local_bin() {
  mkdir -p "$HOME/.local/bin"
  case ":${PATH}:" in
    *":$HOME/.local/bin:"*) ;;
    *) export PATH="$HOME/.local/bin:$PATH" ;;
  esac
}

persist_local_bin() {
  local profile_file="$HOME/.profile"
  local path_line='export PATH="$HOME/.local/bin:$PATH"'
  touch "$profile_file"
  if ! grep -Fqx "$path_line" "$profile_file"; then
    printf '\n# OCI image workflow tools\n%s\n' "$path_line" >> "$profile_file"
  fi
}

run_privileged() {
  if [[ "$(id -u)" -eq 0 ]]; then
    "$@"
  elif has sudo; then
    sudo "$@"
  else
    fail "Administrator access is required to install system packages. Install sudo or rerun as root."
  fi
}

install_macos() {
  if ! xcode-select -p >/dev/null 2>&1; then
    [[ $CHECK_ONLY -eq 1 ]] && { printf 'MISSING: macOS Command Line Tools\n'; return; }
    xcode-select --install || true
    fail 'Complete the macOS Command Line Tools installer, reopen Terminal, and rerun this script.'
  fi

  if ! has brew; then
    [[ $CHECK_ONLY -eq 1 ]] && { printf 'MISSING: Homebrew\n'; return; }
    say 'Homebrew is missing. Installing it from https://brew.sh.'
    /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
    if [[ -x /opt/homebrew/bin/brew ]]; then
      eval "$(/opt/homebrew/bin/brew shellenv)"
    elif [[ -x /usr/local/bin/brew ]]; then
      eval "$(/usr/local/bin/brew shellenv)"
    fi
  fi

  [[ $CHECK_ONLY -eq 1 ]] && return
  brew update
  brew tap hashicorp/tap
  brew install git hashicorp/tap/terraform hashicorp/tap/packer python@3.12 oci-cli
  brew install --cask powershell
  if [[ $UPDATE_MODE -eq 1 ]]; then
    brew upgrade git hashicorp/tap/terraform hashicorp/tap/packer python@3.12 oci-cli
    brew upgrade --cask powershell
  fi
}

install_linux_system_tools() {
  [[ $CHECK_ONLY -eq 1 ]] && return
  [[ -r /etc/os-release ]] || fail 'Unsupported Linux distribution: /etc/os-release is missing.'
  # shellcheck disable=SC1091
  source /etc/os-release

  case "${ID:-}" in
    ubuntu|debian)
      run_privileged apt-get update
      run_privileged apt-get install -y ca-certificates curl git unzip openssh-client python3 python3-pip python3-venv pipx
      ;;
    rhel|rocky|almalinux|ol|fedora)
      local package_tool='dnf'
      has dnf || package_tool='yum'
      run_privileged "$package_tool" install -y ca-certificates curl git unzip openssh-clients python3 python3-pip pipx
      ;;
    arch|manjaro)
      run_privileged pacman -Sy --noconfirm ca-certificates curl git unzip openssh python python-pipx
      ;;
    *)
      fail "Unsupported Linux distribution '${ID:-unknown}'. Install git, curl, unzip, openssh-client, Python 3.10+, pipx, Terraform, Packer, OCI CLI, and PowerShell 7, then rerun with --check."
      ;;
  esac
}

hashicorp_version() {
  local tool="$1"
  python3 - "$tool" <<'PY'
import json
import sys
from urllib.request import urlopen

with urlopen(f"https://checkpoint-api.hashicorp.com/v1/check/{sys.argv[1]}", timeout=30) as response:
    print(json.load(response)["current_version"])
PY
}

install_hashicorp_tool() {
  local tool="$1"
  local machine
  local version
  local archive
  local temp_dir

  if has "$tool" && [[ $UPDATE_MODE -eq 0 ]]; then
    say "$tool is already available."
    return
  fi
  [[ $CHECK_ONLY -eq 1 ]] && { printf 'MISSING: %s\n' "$tool"; return; }

  case "$(uname -m)" in
    x86_64|amd64) machine='amd64' ;;
    aarch64|arm64) machine='arm64' ;;
    *) fail "Unsupported Linux CPU architecture: $(uname -m)" ;;
  esac

  version="$(hashicorp_version "$tool")"
  archive="${tool}_${version}_linux_${machine}.zip"
  temp_dir="$(mktemp -d)"
  trap 'rm -rf "$temp_dir"' RETURN
  say "Installing $tool $version to ~/.local/bin."
  curl -fsSL --retry 3 "https://releases.hashicorp.com/${tool}/${version}/${archive}" -o "$temp_dir/$archive"
  unzip -qo "$temp_dir/$archive" -d "$HOME/.local/bin"
  chmod 0755 "$HOME/.local/bin/$tool"
  rm -rf "$temp_dir"
  trap - RETURN
}

install_linux_pwsh() {
  local machine asset release_json temp_dir url
  if has pwsh && [[ $UPDATE_MODE -eq 0 ]]; then
    say 'pwsh is already available.'
    return
  fi
  [[ $CHECK_ONLY -eq 1 ]] && { printf 'MISSING: pwsh\n'; return; }

  case "$(uname -m)" in
    x86_64|amd64) asset='linux-x64.tar.gz' ;;
    aarch64|arm64) asset='linux-arm64.tar.gz' ;;
    *) fail "Unsupported Linux CPU architecture: $(uname -m)" ;;
  esac

  release_json="$(curl -fsSL --retry 3 https://api.github.com/repos/PowerShell/PowerShell/releases/latest)"
  url="$(printf '%s' "$release_json" | python3 -c '
import json
import sys

asset = sys.argv[1]
for item in json.load(sys.stdin)["assets"]:
    if item["name"].endswith(asset):
        print(item["browser_download_url"])
        break
' "$asset")"
  [[ -n "$url" ]] || fail "Could not find a PowerShell release asset ending in $asset."

  temp_dir="$(mktemp -d)"
  trap 'rm -rf "$temp_dir"' RETURN
  say 'Installing PowerShell 7 to ~/.local/pwsh.'
  curl -fsSL --retry 3 "$url" -o "$temp_dir/pwsh.tar.gz"
  rm -rf "$HOME/.local/pwsh"
  mkdir -p "$HOME/.local/pwsh"
  tar -xzf "$temp_dir/pwsh.tar.gz" -C "$HOME/.local/pwsh"
  chmod 0755 "$HOME/.local/pwsh/pwsh"
  ln -sf "$HOME/.local/pwsh/pwsh" "$HOME/.local/bin/pwsh"
  rm -rf "$temp_dir"
  trap - RETURN
}

install_linux() {
  install_linux_system_tools
  ensure_local_bin
  if [[ $CHECK_ONLY -eq 0 ]]; then
    persist_local_bin
  fi
  install_hashicorp_tool terraform
  install_hashicorp_tool packer
  install_linux_pwsh

  if ! has oci; then
    [[ $CHECK_ONLY -eq 1 ]] && printf 'MISSING: oci\n' || {
      say 'Installing OCI CLI for the current user with pipx.'
      pipx install oci-cli || pipx upgrade oci-cli
    }
  elif [[ $UPDATE_MODE -eq 1 && $CHECK_ONLY -eq 0 ]]; then
    say 'Updating OCI CLI for the current user with pipx.'
    pipx upgrade oci-cli
  else
    say 'oci is already available.'
  fi
}

ensure_local_bin
if [[ $CHECK_ONLY -eq 0 ]]; then
  persist_local_bin
fi

case "$(uname -s)" in
  Darwin) install_macos ;;
  Linux) install_linux ;;
  *) fail "Unsupported operating system: $(uname -s). Windows users run setup-workstation.ps1." ;;
esac

required=(git terraform packer pwsh ssh curl python3 oci)
missing=()
for tool in "${required[@]}"; do
  has "$tool" || missing+=("$tool")
done

if [[ ${#missing[@]} -gt 0 ]]; then
  printf 'Missing after setup: %s\n' "${missing[*]}" >&2
  exit 1
fi

printf 'PASS: Git, Terraform, Packer, PowerShell 7, OpenSSH, OCI CLI, Python, and curl are ready.\n'
printf 'Next: create a local OCI security-token profile, then fill the ignored project variable files.\n'
printf 'Example: oci session authenticate --profile-name WORKSHOP_TEST --region <your-region>\n'
