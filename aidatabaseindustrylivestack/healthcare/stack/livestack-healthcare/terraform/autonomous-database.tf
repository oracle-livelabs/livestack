resource "oci_database_autonomous_database" "healthcare" {
  compartment_id              = var.compartment_ocid
  db_name                     = local.adb_db_name
  display_name                = local.adb_display_name
  admin_password              = var.adb_admin_password
  db_version                  = local.adb_db_version
  db_workload                 = local.adb_workload
  compute_model               = local.adb_compute_model
  compute_count               = local.adb_compute_count
  data_storage_size_in_gb     = local.adb_storage_gb
  license_model               = local.adb_license_model
  is_auto_scaling_enabled     = local.adb_is_auto_scaling_enabled
  is_dev_tier                 = local.adb_is_dev_tier
  is_free_tier                = local.adb_is_free_tier
  is_mtls_connection_required = local.adb_is_mtls_connection_required
  freeform_tags               = local.common_tags
}
