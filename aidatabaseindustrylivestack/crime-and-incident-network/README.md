# Crime and Incident Network LiveStack

IncidentData demonstration runbook and OCI Resource Manager package. The
Deploy to Oracle Cloud button is prepared locally; its GitHub package link
becomes available after this folder is pushed to the repository's `main`
branch. LiveLabs Green Button provisioning is not configured yet.

## Deploy in your own OCI tenancy

[![Deploy to Oracle Cloud](https://oci-resourcemanager-plugin.plugins.oci.oraclecloud.com/latest/deploy-to-oracle-cloud.svg)](https://cloud.oracle.com/resourcemanager/stacks/create?zipUrl=https%3A%2F%2Fgithub.com%2Foracle-livelabs%2Flivestack%2Fraw%2Frefs%2Fheads%2Fmain%2Faidatabaseindustrylivestack%2Fcrime-and-incident-network%2Fstack%2Fincidentdata-resource-manager-root.zip)

Follow [Take It Home (OCI): Deploy IncidentData](deploy-livestack-terraform/deploy-livestack-terraform.md)
to configure a stack, run Apply, retrieve the private login
file, and destroy the deployment when finished. This creates billable resources.
Until the ZIP is published on GitHub, upload the local ZIP manually instead.

## Contents

- Fifteen core runbook chapters: Introduction, Workshop & Guides, Scenes 1–12,
  and Scene 14. Scene 13 is intentionally absent in the source edition.
- Optional deployment chapter in `deploy-livestack-terraform/`.
- Supporting illustrations in `images/` and browser explainers in `powtoons/`.
- LiveLabs entry point: [workshops/sandbox/index.html](workshops/sandbox/index.html).
- Resource Manager ZIP: [stack/incidentdata-resource-manager-root.zip](stack/incidentdata-resource-manager-root.zip).
- Expanded Terraform source in `stack/resource-manager/`; see
  [package notes](stack/README.md).

The runbook and its supporting files were initially copied from
`fucci/CrimeDataLiveStack`, branch `deployment/oci-resource-manager`, commit
`e448bf64f04bdacc192a86294e089b47a9eaae4e`. Login/city instructions were aligned
on 2 November 2026. The 15-chapter core order is unchanged, and the core lesson
estimates total 133 minutes. The deployment chapter is an optional extension.

## Resource Manager package

The shared-release package passed a fresh Resource Manager Apply and operator
browser login on 3 November 2026. The learner wrapper hides release inputs
without changing their pinned defaults. The user opened and saved that wrapper in Resource
Manager and confirmed that the Versioned release section no longer appears.
No additional Apply was run for that form-only check. The current ZIP also
refreshes the bundled maintainer runbook; no runtime files changed.

- Package: `stack/incidentdata-resource-manager-root.zip` (28,748 bytes).
- SHA-256: `884477d2f07b3bb1efe7b2b7084fa228ac1c0b184888bb0b3629a07a673be161`.
- Working directory: blank/default (ZIP root), not `terraform`.
- Terraform family used in the passed deployment: 1.5.x.
- Local checks passed: YAML/default checks, ZIP integrity, all 14 member byte
  comparisons, and confirmation that only `RUNBOOK.md` changed in this rebuild.
- No Terraform, runtime, release-file, credential, or permission change is
  included in the hidden-inputs wrapper.

The ZIP is preconfigured for the approved shared release in `c4u04/livelabsfiles`,
prefix `livestack/crime-and-incident-network/releases/team-20261102-f76416e0fcca`.
Its read-only download location is bundled internally, not a learner form input.
The sanitized password-free demonstration database export and other large
payloads remain in Object Storage, not in this folder or ZIP. Each deployment's
generated credentials and status remain in its own private destination bucket.

After Apply succeeds, use `application_url` and `application_username` from the
job outputs. Open `application_credentials_url` while signed into OCI, then
download the object named by `application_credentials_file`. That private JSON
contains the operator login, not database credentials.

The bundled [maintainer notes](stack/resource-manager/RUNBOOK.md) describe the
current shared release and hidden-input form. Learners should use
[the deployment chapter](deploy-livestack-terraform/deploy-livestack-terraform.md).

## Accounts and personas

The Terraform package creates five distinct application accounts:

| Account | Fixed persona |
| --- | --- |
| `operator` | Statewide administrator |
| `central` | Central analyst |
| `northern` | Northern analyst |
| `southern` | Southern analyst |
| `viewer` | Read-only viewer |

The downloadable login file contains only the `operator` account. Other account
passwords remain in protected Terraform state; the sensitive `participant_accounts`
output is not visible in the OCI Console Output screen. A reviewed credential
delivery flow is needed before teaching regional-account exercises.

In public deployment mode, the authenticated account determines the persona.
Users cannot switch to a broader persona through the browser's demo selector.
Follow the active city shown by the application rather than restoring another
city just to match a workshop example.

## Verification and remaining work

- The 3 November read-only smoke review covered the main pages and all seven
  built-in guides. Oracle Graph Explorer also loaded after a temporary browser
  debugger attachment was detached. A fresh native-browser check passed;
  no application or Terraform fix was required for that loading symptom.
- The GitHub-backed deployment button still needs an online launch test after
  the ZIP and documentation are pushed to `main`.
- Complete fresh-deployment checks for optional vector, AI, APEX, and additional
  sample-data exercises. Apply and browser login do not prove every feature.
- Adapt and test Green Button provisioning, login delivery, and cleanup.
  A `sandbox` manifest alone does not configure provisioning.

No database dump, wallet, private key, generated account password, Terraform
state, or environment file is included in this folder.
