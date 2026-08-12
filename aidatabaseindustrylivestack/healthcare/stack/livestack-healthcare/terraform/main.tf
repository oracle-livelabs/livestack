data "oci_identity_availability_domains" "ads" {
  compartment_id = var.compartment_ocid
}

data "oci_core_images" "app_oracle_linux" {
  compartment_id           = var.compartment_ocid
  operating_system         = local.instance_operating_system
  operating_system_version = local.instance_operating_system_version
  shape                    = local.app_instance_shape
  sort_by                  = "TIMECREATED"
  sort_order               = "DESC"
}

data "oci_core_images" "ollama_oracle_linux" {
  compartment_id           = var.compartment_ocid
  operating_system         = local.instance_operating_system
  operating_system_version = local.instance_operating_system_version
  shape                    = local.ollama_instance_shape
  sort_by                  = "TIMECREATED"
  sort_order               = "DESC"
}

locals {
  sanitized_stack_name = trim(replace(lower(var.stack_name), "/[^a-z0-9-]/", "-"), "-")
  name_prefix          = substr(local.sanitized_stack_name != "" ? local.sanitized_stack_name : "healthcare", 0, 24)
  availability_domain  = data.oci_identity_availability_domains.ads.availability_domains[0].name

  vcn_cidr                     = "10.42.0.0/16"
  public_app_subnet_cidr       = "10.42.10.0/24"
  private_ollama_subnet_cidr   = "10.42.20.0/24"

  app_port    = 8505
  ords_port   = 8181
  ollama_port = 11434

  instance_operating_system         = "Oracle Linux"
  instance_operating_system_version = "9"
  app_instance_shape                = "VM.Standard.E5.Flex"
  app_ocpus                         = 2
  app_memory_gbs                    = 16
  ollama_instance_shape             = "VM.Standard.E5.Flex"
  ollama_ocpus                      = 4
  ollama_memory_gbs                 = 32
  app_image_ocid                    = data.oci_core_images.app_oracle_linux.images[0].id
  ollama_image_ocid                 = data.oci_core_images.ollama_oracle_linux.images[0].id
  app_is_flex_shape                 = length(regexall("\\.Flex$", local.app_instance_shape)) > 0
  ollama_is_flex_shape              = length(regexall("\\.Flex$", local.ollama_instance_shape)) > 0

  expose_ords_public = false
  ords_bind_address  = "127.0.0.1"

  ollama_image = "docker.io/ollama/ollama:latest"
  ollama_model = "llama3.2"

  app_source_archive_sha256           = ""
  app_source_archive_strip_components = 0
  auto_start_app                      = false

  oracle_user           = "LIVESTACK"
  oracle_pool_min       = 2
  oracle_pool_max       = 10
  oracle_pool_increment = 1

  # Autonomous AI Database for Developers supports 26ai, but it is fixed shape
  # and cannot be provisioned with a private endpoint or inside a VCN.
  adb_private_endpoint_enabled    = false
  adb_db_name                     = "HCSTACK26AI"
  adb_display_name                = "${local.name_prefix}-adb-26ai"
  adb_db_version                  = "26ai"
  adb_workload                    = "OLTP"
  adb_compute_model               = "ECPU"
  adb_compute_count               = 4
  adb_storage_gb                  = 20
  adb_license_model               = "LICENSE_INCLUDED"
  adb_is_auto_scaling_enabled     = false
  adb_is_dev_tier                 = true
  adb_is_free_tier                = false
  adb_is_mtls_connection_required = false

  adb_medium_server_connection_strings = [
    for profile in try(oci_database_autonomous_database.healthcare.connection_strings[0].profiles, []) :
    profile.value
    if lower(profile.consumer_group) == "medium" && lower(profile.tls_authentication) == "server"
  ]

  adb_medium_connection_string = try(local.adb_medium_server_connection_strings[0], "")

  common_tags = merge(
    {
      "created-by" = "healthcare-livestack-terraform"
      "livestack"  = "healthcare"
      "purpose"    = "oci-resource-manager-starter"
    }
  )
}
