# IncidentData Resource Manager package

## Current package

Use [incidentdata-resource-manager-root.zip](incidentdata-resource-manager-root.zip).

- Working directory: blank/default (ZIP root). Do not select `terraform`;
  that subfolder does not exist in this ZIP.
- Terraform family used in the passed deployment: 1.5.x.
- Size: 28,808 bytes.
- SHA-256: `d3971a4f859ebec77348b7ca9fa8a455b7caadcdb2d8d942d4cd94b79d2b1ee9`.
- Expanded source: `resource-manager/`. All 14 ZIP members match this source
  byte-for-byte, including the provider lock file.

The preceding shared-release ZIP, SHA-256
`9680fd917ae73322fce243da5a5cc896ec3d2ed76f70dd991a554a5915cb534e`,
passed fresh Apply and operator browser login on 3 November 2026. The learner
wrapper adds five schema visibility lines. The user opened and saved it in
Resource Manager and confirmed that Versioned release inputs are hidden.
No additional Apply was run for that form-only check. This ZIP additionally
refreshes `RUNBOOK.md`; all other members match the preceding local ZIP.

Local checks passed: YAML parsing, schema/Terraform release-default parity,
ZIP integrity, and all 14 member byte comparisons. The archive diff confirms
that only `RUNBOOK.md` changed in this documentation rebuild. The preceding
folder audit passed Terraform validation in an isolated copy; this rebuild
does not change Terraform files, provider selections, or runtime code.

## Deploy and test

Follow the [Take It Home deployment chapter](../deploy-livestack-terraform/deploy-livestack-terraform.md).
Its button references this ZIP's future raw GitHub URL, using the same
repository-hosted pattern as the other industry demos. The link becomes
available after the files are pushed to `main`; until then, upload this ZIP
manually in Resource Manager.

1. Use a fresh stack and leave the working directory at the ZIP root.
2. Choose the destination compartment, region, and availability domain.
   Review capacity and optional SSH access. Versioned release fields are
   hidden; the package already contains its approved release settings:

    ```text
    release_namespace = c4u04
    release_bucket = livelabsfiles
    release_prefix = livestack/crime-and-incident-network/releases/team-20261102-f76416e0fcca
    ```

3. Review the settings, leave Run apply selected, and create the stack.
   For an optional Plan review first, clear Run apply instead.
4. Wait for Apply to show Succeeded. This release needs no
   database-export unlock key or learner-supplied password.
5. Open `application_url`. Use `application_credentials_url` and the exact
   `application_credentials_file` to download the private operator login JSON.
6. When finished, run Destroy on your deployment stack and wait for Succeeded.
   Leave the shared `c4u04/livelabsfiles` release assets untouched.

Replacing a ZIP in an old stack can retain saved variable values. Do not reuse
stale release coordinates or a `terraform` working directory. An update Plan
that unexpectedly replaces the VM/database or rotates credentials needs review.

## What stays separate

- The small ZIP and expanded Terraform source belong in this repository.
- Bulk demo assets, including the sanitized database export, stay in the
  approved shared Object Storage release. The ZIP fetches them during setup.
- Generated credentials and status go to each deployment's own private bucket,
  not the shared release bucket. The release download link cannot retrieve them.
- [resource-manager/RUNBOOK.md](resource-manager/RUNBOOK.md) contains the current
  maintainer notes, including the password-free shared release and hidden inputs.

No runtime rebuild, new database export, or release-asset upload is needed for
this documentation-only rebuild. Maintenance scripts and historical test receipts
are not part of the publishable workshop folder.

## Verification limits

The standard case graph and Oracle Graph Explorer loaded in the 3 November
browser review. The earlier Oracle renderer failure was caused by a temporary
browser debugger attachment; no source or package change was required.

Apply and browser login passed on the schema-equivalent package. The hidden
form was separately confirmed. The GitHub button still needs an online launch
test after publication, and optional AI/APEX workflows and LiveLabs Green Button
provisioning need their own acceptance checks.
