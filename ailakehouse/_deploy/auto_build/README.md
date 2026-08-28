# AILakehouse Auto Build

This is the build-and-test automation for the AILakehouse LiveStack. It replaces
the old manual ZIP-to-VM image-build loop.

## 1. Prepare The Workstation

Run the setup script before creating the OCI profile or filling any local
variable file. It installs the required Git, Terraform, Packer, PowerShell 7,
Python, OCI CLI, OpenSSH, and curl tools.

Windows PowerShell:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\setup-workstation.ps1
```

macOS or Linux Terminal:

```bash
bash ./setup-workstation.sh
```

After setup completes, open a new terminal if requested. Then create the local
OCI security-token profile and continue with the variable files documented in
`01-image-build/README.md`.

To check a workstation without installing anything, use `-CheckOnly` on
Windows or `--check` on macOS/Linux.

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
