# This is not the bootstrap credential object. Only the human operator's
# existing OCI bucket/object permissions provide access: no public URL or PAR.
resource "oci_objectstorage_object" "application_login" {
  namespace = oci_objectstorage_bucket.status.namespace
  bucket    = oci_objectstorage_bucket.status.name
  object    = "${local.deployment_id}/application-login.json"
  content = sensitive(jsonencode({
    version         = 1
    application_url = "https://${var.public_hostname != "" ? var.public_hostname : oci_core_public_ip.demo.ip_address}"
    username        = "operator"
    password        = random_password.participant["operator"].result
  }))
  content_type               = "application/json"
  cache_control              = "no-store"
  content_disposition        = "attachment; filename=\"incidentdata-login.json\""
  delete_all_object_versions = true
  depends_on                 = [terraform_data.readiness]
}
