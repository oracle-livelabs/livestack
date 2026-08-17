# AILakehouse Terraform Acceptance

This embedded Terraform project is called by `../01-image-build`. It is not a
second repository and is not normally run directly.

## What It Does

For each acceptance or inspection run, Terraform creates the ADB and supporting
OCI resources required by this LiveStack, generates fresh runtime passwords,
starts a Compute VM from the specified custom image, and passes the generated
metadata to the VM. First boot writes that metadata into protected runtime files
and the existing `ll-lakehouse/init` scripts configure the application.

Normal acceptance destroys the temporary ADB, VM, temporary keys, generated
files, isolated state, and test NSG when the checks pass. Inspection keeps them
only until the printed cleanup command is run.

## Local Variables

`01-edit/terraform.tfvars` is ignored by Git. Create it from
`01-edit/terraform.tfvars.example` and supply only your tenancy, user,
compartment, OCI CLI profile, network, public SSH key, current tester `/32`, and
approved sizing. Set `additional_metadata.onnx_model_url` to the approved
private direct-download URL for `all_MiniLM_L12_v2.onnx`; keep that URL only in
the ignored file. Keep `use_marketplace_image = false` while testing a custom
image.

Never commit `.terraform/`, `.automation/`, state files, plans, generated
passwords, wallets, private keys, or the real `terraform.tfvars` file.

## Project-Specific Logic

`02-edit-if-needed/peak-gear/` contains the ADB, Object Storage, protected
runtime-file, and metadata logic specific to this LiveStack. A later LiveStack
copy replaces that folder and updates the matching service catalog and endpoint
checks. Shared files under `03-automation/` stay unchanged unless a verified
automation defect affects every LiveStack.
