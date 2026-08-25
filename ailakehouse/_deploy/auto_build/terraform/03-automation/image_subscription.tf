locals {
  marketplace_enabled = var.use_marketplace_image && var.mp_listing_id != "" && var.mp_listing_resource_version != ""
}

resource "oci_core_app_catalog_listing_resource_version_agreement" "mp_image_agreement" {
  count                    = local.marketplace_enabled ? 1 : 0
  listing_id               = var.mp_listing_id
  listing_resource_version = var.mp_listing_resource_version
}

resource "oci_core_app_catalog_subscription" "mp_image_subscription" {
  count                    = local.marketplace_enabled ? 1 : 0
  compartment_id           = var.ociCompartmentOcid
  eula_link                = oci_core_app_catalog_listing_resource_version_agreement.mp_image_agreement[0].eula_link
  listing_id               = oci_core_app_catalog_listing_resource_version_agreement.mp_image_agreement[0].listing_id
  listing_resource_version = oci_core_app_catalog_listing_resource_version_agreement.mp_image_agreement[0].listing_resource_version
  oracle_terms_of_use_link = oci_core_app_catalog_listing_resource_version_agreement.mp_image_agreement[0].oracle_terms_of_use_link
  signature                = oci_core_app_catalog_listing_resource_version_agreement.mp_image_agreement[0].signature
  time_retrieved           = oci_core_app_catalog_listing_resource_version_agreement.mp_image_agreement[0].time_retrieved

  timeouts {
    create = "20m"
  }
}
