output "application_url" {
  value       = "https://${var.public_hostname != "" ? var.public_hostname : oci_core_public_ip.demo.ip_address}"
  description = "Open IncidentData after Apply succeeds; get the password from the private application_credentials_url location."
  depends_on  = [terraform_data.readiness]
}
output "application_username" {
  value       = "operator"
  description = "Browser login for the statewide administrator demo account."
  depends_on  = [terraform_data.readiness]
}
output "application_credentials_url" {
  value       = "https://cloud.oracle.com/object-storage/buckets/${urlencode(oci_objectstorage_bucket.status.namespace)}/${urlencode(oci_objectstorage_bucket.status.name)}/objects?region=${urlencode(var.region)}"
  description = "OCI Console location for the private login file; sign in with an OCI identity that can read this deployment's bucket and objects. This is not a public download link."
  depends_on  = [oci_objectstorage_object.application_login]
}
output "application_credentials_file" {
  value       = oci_objectstorage_object.application_login.object
  description = "Find this exact object in application_credentials_url, then select Download from its Actions menu."
  depends_on  = [oci_objectstorage_object.application_login]
}
output "application_credentials_instructions" {
  value       = "After Apply succeeds, open application_credentials_url while signed into your OCI account. Find ${oci_objectstorage_object.application_login.object} (open the deployment folder if objects are grouped), then use Actions > View object details > Download. The private JSON file contains the app URL, operator username and existing operator password only. You need bucket/object read permissions; Resource Manager access alone may not grant them. Keep the downloaded file private."
  description = "How to retrieve the browser login without exposing it in Terraform outputs or logs."
  depends_on  = [oci_objectstorage_object.application_login]
}
output "database_id" { value = oci_database_autonomous_database.demo.id }
output "apex_service_urls" {
  value       = oci_database_autonomous_database.demo.connection_urls
  description = "Managed APEX/ORDS service URLs; actual imported application aliases need bootstrap verification."
}
