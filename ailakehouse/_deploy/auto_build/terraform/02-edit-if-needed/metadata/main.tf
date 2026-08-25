terraform {
  required_providers {
    random = {
      source  = "hashicorp/random"
      version = "~> 3.9"
    }
  }
}

variable "app_user" {
  type = string
}

variable "web_title" {
  type = string
}

variable "db_password_override" {
  type      = string
  sensitive = true
}

variable "additional_metadata" {
  type      = map(string)
  default   = {}
  sensitive = true
}

variable "generated_password_metadata_keys" {
  type    = set(string)
  default = []

  validation {
    condition = alltrue([
      for key in var.generated_password_metadata_keys :
      can(regex("^[a-z][a-z0-9_]{0,63}$", key)) &&
      !contains(["dbpassword", "vncpwd", "app_user", "app_user_pwd", "web_title", "compartment_ocid", "ssh_authorized_keys"], key)
    ])
    error_message = "Generated metadata keys must be lowercase identifiers and cannot replace built-in metadata keys."
  }
}

resource "random_password" "db_password" {
  length           = 20
  special          = true
  override_special = "_"
  min_upper        = 1
  min_lower        = 1
  min_numeric      = 1
  min_special      = 1
}

resource "random_password" "app_password" {
  length      = 20
  special     = false
  min_upper   = 1
  min_lower   = 1
  min_numeric = 1
}

resource "random_password" "vnc_password" {
  length      = 20
  special     = false
  min_upper   = 1
  min_lower   = 1
  min_numeric = 1
}

resource "random_password" "additional" {
  for_each = var.generated_password_metadata_keys

  length      = 20
  special     = false
  min_upper   = 1
  min_lower   = 1
  min_numeric = 1
}

locals {
  db_password  = var.db_password_override != "" ? var.db_password_override : random_password.db_password.result
  app_password = var.db_password_override != "" ? var.db_password_override : random_password.app_password.result
  vnc_password = var.db_password_override != "" ? var.db_password_override : random_password.vnc_password.result
  generated_passwords = {
    for key, password in random_password.additional : key => password.result
  }
  instance_metadata = merge(
    var.additional_metadata,
    local.generated_passwords,
    {
      dbpassword   = local.db_password
      vncpwd       = local.vnc_password
      app_user     = var.app_user
      app_user_pwd = local.app_password
      web_title    = var.web_title
    }
  )
}

output "instance_metadata" {
  value     = local.instance_metadata
  sensitive = true
}

output "db_password" {
  value     = local.db_password
  sensitive = true
}

output "app_password" {
  value     = local.app_password
  sensitive = true
}

output "vnc_password" {
  value     = local.vnc_password
  sensitive = true
}

output "generated_passwords" {
  value     = local.generated_passwords
  sensitive = true
}
