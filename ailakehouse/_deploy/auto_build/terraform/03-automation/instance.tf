data "oci_identity_availability_domain" "ad" {
  compartment_id = var.ociTenancyOcid
  ad_number      = 1
}

data "oci_core_subnet" "public" {
  subnet_id = var.ociPublicSubnetOcid
}

module "image_metadata" {
  source = "../02-edit-if-needed/metadata"

  app_user                         = var.app_user
  web_title                        = var.web_title
  db_password_override             = var.db_password_override
  additional_metadata              = var.additional_metadata
  generated_password_metadata_keys = var.generated_password_metadata_keys
}
module "peak_gear" {
  source = "../02-edit-if-needed/peak-gear"

  providers = {
    oci      = oci
    oci.home = oci.home
  }

  context = {
    compartment_ocid     = var.ociCompartmentOcid
    tenancy_ocid         = var.ociTenancyOcid
    user_ocid            = var.ociUserOcid
    region               = var.ociRegionIdentifier
    resource_id          = local.res_id
    resource_name_prefix = var.resource_name_prefix
  }
  admin_password       = module.image_metadata.db_password
  settings             = var.workshop_settings
  identity_credentials = var.peakgear_identity_credentials
}

resource "oci_core_network_security_group" "workshop_access" {
  count = var.enable_test_access_nsg ? 1 : 0

  compartment_id = var.ociCompartmentOcid
  display_name   = "${var.resource_name_prefix}-${local.res_id}-access"
  vcn_id         = data.oci_core_subnet.public.vcn_id

  freeform_tags = {
    "purpose" = "temporary-image-test-access"
  }

  lifecycle {
    precondition {
      condition     = var.tester_source_cidr != ""
      error_message = "tester_source_cidr is required when enable_test_access_nsg is true."
    }
  }
}

resource "oci_core_network_security_group_security_rule" "workshop_tcp_ingress" {
  for_each = var.enable_test_access_nsg ? {
    for port in var.allowed_tcp_ports : tostring(port) => port
    if !(var.enable_data_transforms_public_test_ingress && port == 1525)
  } : {}

  network_security_group_id = oci_core_network_security_group.workshop_access[0].id
  direction                 = "INGRESS"
  protocol                  = "6"
  source                    = var.tester_source_cidr
  source_type               = "CIDR_BLOCK"
  stateless                 = false
  description               = "Temporary image test access on TCP ${each.value}"

  tcp_options {
    destination_port_range {
      min = each.value
      max = each.value
    }
  }
}

# Oracle Data Transforms runs from an Oracle-managed agent, not the tester's
# workstation IP. This short-lived rule is intentionally opt-in and exists
# only to verify a custom image before its test resources are destroyed.
resource "oci_core_network_security_group_security_rule" "workshop_data_transforms_ingress" {
  count = var.enable_test_access_nsg && var.enable_data_transforms_public_test_ingress ? 1 : 0

  network_security_group_id = oci_core_network_security_group.workshop_access[0].id
  direction                 = "INGRESS"
  protocol                  = "6"
  source                    = "0.0.0.0/0"
  source_type               = "CIDR_BLOCK"
  stateless                 = false
  description               = "Temporary public Data Transforms test access on TCP 1525 only"

  tcp_options {
    destination_port_range {
      min = 1525
      max = 1525
    }
  }
}

resource "oci_core_instance" "workshop" {
  count               = var.instance_count
  availability_domain = data.oci_identity_availability_domain.ad.name
  compartment_id      = var.ociCompartmentOcid
  display_name        = "${var.resource_name_prefix}-${local.res_id}-${format("%02d", count.index + 1)}"
  shape               = local.instance_shape

  metadata = merge(
    module.image_metadata.instance_metadata,
    module.peak_gear.runtime_metadata,
    {
      ssh_authorized_keys = var.resUserPublicKey
      compartment_ocid    = var.ociCompartmentOcid
    }
  )

  dynamic "shape_config" {
    for_each = local.is_flex_shape
    content {
      ocpus         = var.instance_shape_config_ocpus
      memory_in_gbs = var.instance_shape_config_memory_in_gbs
    }
  }

  create_vnic_details {
    assign_public_ip = true
    display_name     = "${var.resource_name_prefix}-${local.res_id}-${format("%02d", count.index + 1)}-${local.timestamp}"
    hostname_label   = substr("${var.resource_name_prefix}-${local.timestamp}-${format("%02d", count.index + 1)}", 0, 63)
    nsg_ids          = var.enable_test_access_nsg ? [oci_core_network_security_group.workshop_access[0].id] : []
    subnet_id        = var.ociPublicSubnetOcid
  }

  source_details {
    source_id               = var.instance_image_id
    source_type             = "image"
    boot_volume_size_in_gbs = 250
  }

  depends_on = [oci_core_app_catalog_subscription.mp_image_subscription, module.peak_gear]

  lifecycle {
    ignore_changes = [
      display_name,
      create_vnic_details[0].display_name,
      create_vnic_details[0].hostname_label,
    ]
  }
}
