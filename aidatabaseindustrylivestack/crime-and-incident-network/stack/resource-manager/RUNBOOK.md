# IncidentData Resource Manager maintainer notes

## Purpose

This document describes the current Resource Manager package. Terraform and the installer do not execute this file. The learner guide is `deploy-livestack-terraform/deploy-livestack-terraform.md` in the repository.

## Package and shared release

- Use `incidentdata-resource-manager-root.zip` with Terraform 1.5.x and the working directory at the ZIP root.
- The archive contains 14 files, including Terraform, `schema.yaml`, the pinned release manifest, bootstrap helpers, and these notes.
- Shared assets use namespace `c4u04`, bucket `livelabsfiles`, and prefix `livestack/crime-and-incident-network/releases/team-20261102-f76416e0fcca`.
- The package includes the approved read-only download location. All six release variables and their form group are hidden.
- The sanitized database export is password-free: `database_encryption = NONE`. This release needs no AES unlock object or learner-supplied export password.
- Bulk assets stay in Object Storage. Each deployment keeps generated credentials and status in its own private bucket, not the shared release.

## Deploy and check

1. Create a Resource Manager stack from the ZIP. Select the destination compartment, region, and matching availability domain.
2. Review quota, permissions, and cost. Defaults create a paid 4-OCPU/32-GB VM, a 100-GB boot volume, and a paid 2-ECPU/100-GB Autonomous Database.
3. Leave SSH fields blank to disable SSH. Operator SSH requires both a public key and a trusted IPv4 CIDR.
4. Leave Run apply selected to deploy immediately. A separate Plan review is optional; clear Run apply before creating the stack if you want one.
5. Wait for Apply to show Succeeded. Setup downloads the pinned release, imports the synthetic data, starts services, and checks deployment readiness.
6. Open the job outputs. Follow `application_credentials_url` while signed into OCI and download the exact object named by `application_credentials_file`.
7. Open `application_url` and sign in with the private JSON credentials. The login file contains only the `operator` account, with Statewide administrator scope.
8. Check the active city and follow the workshop using that profile. Public deployment mode disables browser persona selection.

## Credentials and acceptance

- Downloading the login JSON requires bucket and object read permissions. A sensitive Terraform output is not an unlock control in the Console.
- Keep downloaded login files, Terraform state, database credentials, wallets, and private keys out of Git and shared release assets.
- Other account credentials remain in protected Terraform state. Regional-account exercises need a reviewed private delivery method.
- The application is internet-facing and authenticated. The database uses a public endpoint with mandatory mTLS and database credentials; it is not a private database endpoint.
- Apply readiness and operator login do not validate every AI, APEX, graph, media, or participant-account workflow.
- Preserve the pinned release manifest and its historical qualification flags. Change qualification claims only when matching acceptance evidence exists.

## Maintenance and cleanup

- Keep every ZIP member byte-identical to the expanded source. Rebuild the archive and update the outer README size and SHA-256 notes after a bundled document change.
- This runbook refresh changes documentation only. Terraform, providers, schema, release pins, bootstrap code, and runtime assets remain unchanged.
- Runtime or dataset updates need a separately reviewed, versioned release. Replacing the small ZIP alone does not publish new bulk assets.
- When finished, run Destroy on the deployment stack and wait for Succeeded. Check for resources left behind, and leave the shared release files untouched.
- Publish the ZIP to the official repository location used by the button, then test the online launch. LiveLabs Green Button provisioning remains separate work.

## Acknowledgements

Oracle LiveLabs Team, November 2026.
