#!/usr/bin/env bash
set -Eeuo pipefail

CHECK_ONLY=0
UPDATE_MODE=0
for argument in "$@"; do
  case "$argument" in
    --check) CHECK_ONLY=1 ;;
    --update) UPDATE_MODE=1 ;;
    *) printf 'Usage: bash ./setup-workstation-macos.sh [--check] [--update]\n' >&2; exit 2 ;;
  esac
done
if [[ $CHECK_ONLY -eq 1 && $UPDATE_MODE -eq 1 ]]; then
  printf 'Use either --check or --update, not both.\n' >&2
  exit 2
fi
if [[ "$(uname -s)" != "Darwin" ]]; then
  printf 'This setup script is for macOS. Linux users run setup-workstation-linux.sh.\n' >&2
  exit 2
fi

say() { printf '[setup:macos] %s\n' "$*"; }
has() { command -v "$1" >/dev/null 2>&1; }
fail() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }

check_tools() {
  local missing=()
  local tool
  for tool in git terraform packer ssh curl python3 oci jq unzip; do
    has "$tool" || missing+=("$tool")
  done
  if ! xcode-select -p >/dev/null 2>&1; then
    missing+=("macOS Command Line Tools")
  fi
  has brew || missing+=("Homebrew")
  if [[ ${#missing[@]} -gt 0 ]]; then
    printf 'Missing: %s\n' "${missing[*]}" >&2
    return 1
  fi
  printf 'PASS: Native macOS prerequisites are ready; PowerShell is not required.\n'
}

if [[ $CHECK_ONLY -eq 1 ]]; then
  check_tools
  exit $?
fi

if ! xcode-select -p >/dev/null 2>&1; then
  xcode-select --install || true
  fail 'Complete the macOS Command Line Tools installer, reopen Terminal, and rerun this script.'
fi

if ! has brew; then
  say 'Installing Homebrew from https://brew.sh.'
  /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
fi
if [[ -x /opt/homebrew/bin/brew ]]; then
  eval "$(/opt/homebrew/bin/brew shellenv)"
elif [[ -x /usr/local/bin/brew ]]; then
  eval "$(/usr/local/bin/brew shellenv)"
fi
has brew || fail 'Homebrew was installed but is not available in PATH.'

brew update
brew tap hashicorp/tap
packages=(git hashicorp/tap/terraform hashicorp/tap/packer python oci-cli jq)
for package in "${packages[@]}"; do
  if brew list --versions "$package" >/dev/null 2>&1; then
    [[ $UPDATE_MODE -eq 1 ]] && brew upgrade "$package" || true
  else
    brew install "$package"
  fi
done

check_tools
printf 'Next: fill the ignored project variable files, then use build-and-test-macos.sh.\n'
printf 'Use an existing OCI API-key profile, or create a separate token profile without reusing its name.\n'
