# Changelog

This is the shared release record for OCI Resource Manager ZIPs in this
directory. Add an entry for every published package change with its industry,
source commit or PR, ZIP SHA-256, static checks, live Apply evidence, and WMS
asset status.

## Unreleased

- **October 9, 2026 — Terraform release ZIP refresh (13 industries).** Rebuilt
  the Finance, Healthcare, HigherEd, High Tech, Hospitality, Life Sciences,
  Manufacturing, Media, Retail, State & Local, Telco, Transportation, and
  Utilities Resource Manager ZIPs from the current per-industry source
  snapshots. The ZIPs include their Terraform files and nested application
  source payloads. Source base: `main` at `445c85da99d37d7e5a86bd694f7c9c6372ad150a`,
  plus the local source snapshot used for packaging; final commit pending.
  - Oracle Internals read-only SQL cards were executed against the respective
    live ADBs during the Oct 6–8 stack-validation cycle; failing cards were
    corrected and rechecked. No new Apply was run after packaging.
  - Static checks: all 13 stack package verifiers passed; `unzip -tq` passed
    for all 13 archives; the forbidden-content scan found no packaged
    credentials, wallets, `.env`, Terraform state, or build/dependency output.
  - Additional `terraform fmt -check -recursive` reported formatting
    differences in Finance `source/select-ai-key.tf` and SLED `source/main.tf`;
    those files were not reformatted in this release.
  - WMS: no Terraform asset was uploaded or overwritten as part of this Git
    release.
  - ZIP SHA-256:

    | Industry | ZIP | SHA-256 |
    | --- | --- | --- |
    | Finance | `finance-livestack-terraform.zip` | `86df0160e1448939920734aec2e1c40b6249aa28d9e08bf8eeaf6d7a55aa64a7` |
    | Healthcare | `healthcare-livestack-terraform.zip` | `ec5b430d964da414eefa8ed999c41a897510c668a4970d306b5b624e53b9f57a` |
    | HigherEd | `highered-livestack-terraform.zip` | `04a5518af6e691555a2a5514136c6fdc6885f1bbd613c211d50927e721a48818` |
    | High Tech | `hightech-livestack-terraform.zip` | `74fb4f2797d63a1e2a4a91d6eaf2a5532d70b2fb64e041ba1e3dc9402c67dab2` |
    | Hospitality | `hospitality-livestack-terraform.zip` | `b1ae46e23156a64fa1d59a59039e958db9ababbb0f9a935ce0a1ef724dbeb880` |
    | Life Sciences | `lifesciences-livestack-terraform.zip` | `e992655013d7971f162a499d1252ba7ee77b8cd943f31bcdde4726ebcf3520c5` |
    | Manufacturing | `manufacturing-livestack-terraform.zip` | `1f8c5bd1594322152d1b032ec97eb538a0ca8596a2797b8f2f2dbea13c24912e` |
    | Media | `media-livestack-terraform.zip` | `f8ae4d71dc2021bf9d334611f7634f4cbbbb53dc030d4acbe32c61adf916ac2c` |
    | Retail | `retail-livestack-terraform.zip` | `cb1584b775f6ce8b9f4db904a5ab35a9e81631cd96943dab85756846269775be` |
    | State & Local | `state-local-livestack-terraform.zip` | `2f3eb39804056447419d9b3c0a19b5585033274a3d3a799badcb2b3ad665937c` |
    | Telco | `telco-livestack-terraform.zip` | `27d62022751f3698b5e14e6014a53a63da8fc58393141e52e14fb1dc190522c6` |
    | Transportation | `transportation-livestack-terraform.zip` | `91c50a82ce44b61f6bbec3b78fbc07fc5bc5a554a6b0c7c75325d7f9ca7a10d8` |
    | Utilities | `utilities-livestack-terraform.zip` | `c2abaf92f414bff08e1c1d6044535037ce72483127e3f4fb9ecd8ca56466b4ad` |
  - Also included in the planned Git change: the Finance and Healthcare
    `OMLAnalytics.jsx` source updates at the repository's top-level industry
    paths. The Healthcare counterpart in `demo-code` remains a separate,
    older source and is not changed by this release.
- Release documentation baseline added. No package artifact is changed by this
  entry.
- Portable-package coordination note: the temporary longer Ollama readiness
  allowance in the matching Podman / Green Button packages was rolled back
  after the direct model-download block from Ollama was confirmed. This was
  never a Terraform ZIP change; any previously uploaded WMS asset must be
  replaced separately if it needs the reverted local package.
- Finance and Utilities Terraform ZIPs: corrected the displayed Oracle
  Internals vector query for `APP_USER`. The embedding model is created under
  `ADMIN`, so the query now explicitly uses `ADMIN.ALL_MINILM_L12_V2` instead
  of failing with “model does not exist.” Both corrected cards were verified
  through the deployed application runtime.

## September 2026

- Finance, Healthcare, HigherEd, Life Sciences, Media, Retail, State & Local,
  Telco, Transportation, and Utilities: refreshed English-specific UI wording
  to natural-language wording in the Terraform release ZIPs.
- Media: refreshed the packaged frontend/runtime identity and removed a
  stochastic model-generated SHOWSQL install probe while keeping deterministic
  SQL and runtime safety gates. The stack was deployed and tested.
- Finance, Healthcare, High Tech, Life Sciences, Manufacturing, Retail, State
  & Local, Telco, and Transportation: stabilized AI bootstrap by removing the
  stochastic SHOWSQL provisioning gate and retaining deterministic validation.
- Retail: refreshed the visible Ask Retail Data SQL cards, follow-up handling,
  grounded agent-answer checks, and embedded frontend identity. The stack was
  deployed and tested.

## Recording template

- Date / industry / delivery path:
- Source commit or PR:
- ZIP filename and SHA-256:
- Static verification:
- Live Resource Manager evidence:
- WMS asset status:
- Known limitations or follow-up:
