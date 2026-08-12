resource "oci_core_instance" "app" {
  availability_domain = local.availability_domain
  compartment_id      = var.compartment_ocid
  display_name        = "${local.name_prefix}-app"
  shape               = local.app_instance_shape
  freeform_tags       = local.common_tags

  dynamic "shape_config" {
    for_each = local.app_is_flex_shape ? [1] : []
    content {
      ocpus         = local.app_ocpus
      memory_in_gbs = local.app_memory_gbs
    }
  }

  create_vnic_details {
    subnet_id        = oci_core_subnet.app.id
    assign_public_ip = true
    display_name     = "${local.name_prefix}-app-vnic"
    hostname_label   = "app"
    nsg_ids          = [oci_core_network_security_group.app.id]
  }

  source_details {
    source_type = "image"
    source_id   = local.app_image_ocid
  }

  metadata = {
    ssh_authorized_keys = var.ssh_public_key
    user_data = base64encode(templatefile("${path.module}/cloud-init/app.yaml", {
      app_port                            = local.app_port
      ords_port                           = local.ords_port
      ords_bind_address                   = local.ords_bind_address
      expose_ords_public                  = tostring(local.expose_ords_public)
      ollama_private_ip                   = oci_core_instance.ollama.private_ip
      ollama_port                         = local.ollama_port
      ollama_model                        = local.ollama_model
      app_source_archive_url              = var.app_source_archive_url
      app_source_archive_sha256           = local.app_source_archive_sha256
      app_source_archive_strip_components = local.app_source_archive_strip_components
      auto_start_app                      = tostring(local.auto_start_app)
      oracle_user                         = local.oracle_user
      oracle_connection_string            = local.adb_medium_connection_string
      oracle_pool_min                     = local.oracle_pool_min
      oracle_pool_max                     = local.oracle_pool_max
      oracle_pool_increment               = local.oracle_pool_increment
      adb_db_name                         = local.adb_db_name
      adb_id                              = oci_database_autonomous_database.healthcare.id
      adb_is_mtls_connection_required     = tostring(local.adb_is_mtls_connection_required)
      bootstrap_app_vm_script             = indent(6, trimspace(file("${path.module}/scripts/bootstrap_app_vm.sh")))
    }))
  }
}
