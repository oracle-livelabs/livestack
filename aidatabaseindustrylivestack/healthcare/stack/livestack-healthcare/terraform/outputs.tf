output "healthcare_app_url" {
  description = "Public healthcare app URL."
  value       = "http://${oci_core_instance.app.public_ip}:${local.app_port}"
}

output "app_public_ip" {
  description = "Public IP address of the app and optional ORDS VM."
  value       = oci_core_instance.app.public_ip
}

output "app_private_ip" {
  description = "Private IP address of the app and optional ORDS VM."
  value       = oci_core_instance.app.private_ip
}

output "app_ssh_command" {
  description = "SSH command for the app VM."
  value       = "ssh opc@${oci_core_instance.app.public_ip}"
}

output "ords_url_if_exposed" {
  description = "ORDS URL on the app VM only when expose_ords_public=true and the ORDS profile has been started."
  value       = local.expose_ords_public ? "http://${oci_core_instance.app.public_ip}:${local.ords_port}/ords/" : "ORDS is not publicly exposed; SSH to the app VM and use http://127.0.0.1:${local.ords_port}/ords/ if ORDS is started."
}

output "autonomous_database_ords_url" {
  description = "Autonomous Database managed ORDS URL when the provider returns one."
  value       = try(oci_database_autonomous_database.healthcare.connection_urls[0].ords_url, "")
}

output "ollama_private_endpoint" {
  description = "Private Ollama endpoint reachable from the app VM."
  value       = "http://${oci_core_instance.ollama.private_ip}:${local.ollama_port}"
}

output "ollama_private_ip" {
  description = "Private IP address of the Ollama VM."
  value       = oci_core_instance.ollama.private_ip
}

output "autonomous_database_name" {
  description = "Autonomous Database name."
  value       = oci_database_autonomous_database.healthcare.db_name
}

output "autonomous_database_ocid" {
  description = "Autonomous Database OCID."
  value       = oci_database_autonomous_database.healthcare.id
}

output "autonomous_database_private_endpoint" {
  description = "Autonomous Database private endpoint hostname when available. Empty for Autonomous AI Database for Developers."
  value       = try(oci_database_autonomous_database.healthcare.private_endpoint, "")
}

output "autonomous_database_private_endpoint_ip" {
  description = "Autonomous Database private endpoint IP address when available. Empty for Autonomous AI Database for Developers."
  value       = try(oci_database_autonomous_database.healthcare.private_endpoint_ip, "")
}

output "autonomous_database_public_endpoint" {
  description = "Autonomous Database public endpoint hostname when available."
  value       = try(oci_database_autonomous_database.healthcare.public_endpoint, "")
}

output "autonomous_database_medium_connection_string" {
  description = "Server-TLS MEDIUM connection string for ORACLE_CONNECTION_STRING."
  value       = local.adb_medium_connection_string
  sensitive   = true
}

output "runtime_notes" {
  description = "Where cloud-init writes the app VM runtime templates."
  value       = "App VM runtime files are under /opt/healthcare-livestack. Copy runtime/healthcare.env.template to source/current/.env and fill secrets before starting the app."
}
