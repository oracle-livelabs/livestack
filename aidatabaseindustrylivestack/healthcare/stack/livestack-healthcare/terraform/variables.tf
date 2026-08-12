variable "region" {
  description = "OCI region where Resource Manager will create the healthcare LiveStack resources."
  type        = string
}

variable "compartment_ocid" {
  description = "Compartment OCID where the VCN, compute instances, and Autonomous Database will be created."
  type        = string
}

variable "ssh_public_key" {
  description = "OpenSSH public key for opc access to the compute instances."
  type        = string
}

variable "adb_admin_password" {
  description = "ADMIN password for the Autonomous Database. Enter this in Resource Manager; do not commit it to source."
  type        = string
  sensitive   = true

  validation {
    condition = (
      length(var.adb_admin_password) >= 12 &&
      length(var.adb_admin_password) <= 30 &&
      can(regex("[A-Z]", var.adb_admin_password)) &&
      can(regex("[a-z]", var.adb_admin_password)) &&
      can(regex("[0-9]", var.adb_admin_password)) &&
      !can(regex("\"", var.adb_admin_password)) &&
      !can(regex("(?i)admin", var.adb_admin_password))
    )
    error_message = "adb_admin_password must be 12-30 chars, include uppercase, lowercase, and numeric characters, and must not contain a double quote or the word admin."
  }
}

variable "stack_name" {
  description = "Short deployment name used as an OCI display-name prefix."
  type        = string
  default     = "healthcare-livestack"
}

variable "ssh_ingress_cidr" {
  description = "CIDR allowed to SSH to the public app VM. Use your workstation or bastion CIDR instead of 0.0.0.0/0 before apply."
  type        = string
  default     = "0.0.0.0/0"
}

variable "app_ingress_cidr" {
  description = "CIDR allowed to access the healthcare web application on port 8505."
  type        = string
  default     = "0.0.0.0/0"
}

variable "app_source_archive_url" {
  description = "Optional HTTPS or Object Storage PAR URL for a clean healthcare source archive. Leave empty to copy source manually after deployment."
  type        = string
  default     = ""
}
