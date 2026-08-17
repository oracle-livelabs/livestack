# AILakehouse Auto Build

This is the build-and-test automation for the AILakehouse LiveStack. It replaces
the old manual ZIP-to-VM image-build loop.

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
