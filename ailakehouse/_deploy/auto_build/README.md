# AILakehouse Auto Build

This is the build-and-test automation for the AILakehouse LiveStack. It replaces
the old manual ZIP-to-VM image-build loop.

## 1. Prepare The Workstation

Run the setup script for the workstation operating system before selecting an
OCI profile or filling any local variable file. Windows uses PowerShell;
macOS and Linux use separate native Bash/Python implementations.

Windows PowerShell:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\setup-workstation.ps1
```

macOS Terminal:

```bash
bash ./setup-workstation-macos.sh
```

Linux Terminal:

```bash
bash ./setup-workstation-linux.sh
```

After setup completes, open a new terminal if requested. Prefer an existing
OCI API-key profile from `~/.oci/config`; it does not expire and the automation
uses it without changing it. Set that profile name in both ignored variable
files and set `ociAuthMethod = "APIKey"` in Terraform.

A browser security-token profile remains supported for short-lived testing.
Create it under a new, unused profile name and set
`ociAuthMethod = "SecurityToken"`. Never pass the name of an existing API-key
profile to `oci session authenticate`, because OCI CLI creates or replaces that
profile section.

To check a workstation without installing anything, use `-CheckOnly` on
Windows or `--check` with the matching macOS/Linux script. PowerShell is not
installed or used by either Unix workflow.

## 2. Build And Test

```text
ll-lakehouse/ingestion  -> application and Compose source
ll-lakehouse/init       -> first-boot configuration scripts
auto_build/01-image-build -> Packer build, test orchestration, dashboard
auto_build/terraform    -> ADB, supporting OCI resources, metadata, test VM
```

Packer copies the two sibling `ll-lakehouse` source folders directly to a
temporary build VM. The embedded Terraform project then creates a clean ADB and
test VM, passes fresh metadata to it, checks the services, reboots it, and
removes the test resources. It does not use `ll-lakehouse/inst.sh` or create a
manual ZIP.

Read [01-image-build/README.md](01-image-build/README.md) before running a
build. Marketplace publishing and Resource Manager packaging are separate later
stages and are not part of this folder.
