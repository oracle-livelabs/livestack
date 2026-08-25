terraform {
  required_providers {
    local = {
      source  = "hashicorp/local"
      version = "~> 2.6"
    }
    oci = {
      source                = "oracle/oci"
      version               = "~> 8.21"
      configuration_aliases = [oci.home]
    }
    tls = {
      source  = "hashicorp/tls"
      version = "~> 4.1"
    }
  }
}

variable "context" {
  type = object({
    compartment_ocid     = string
    tenancy_ocid         = string
    user_ocid            = string
    region               = string
    resource_id          = string
    resource_name_prefix = string
  })
}

variable "admin_password" {
  type      = string
  sensitive = true
}

variable "settings" {
  type    = map(string)
  default = {}
}

variable "identity_credentials" {
  description = "Use managed credentials for Green Button-style runs, or existing credentials for local tests without IAM credential-management permission."
  type = object({
    mode                 = string
    api_fingerprint      = string
    api_private_key_path = string
    s3_access_key_id     = string
    s3_secret_access_key = string
  })
  sensitive = true

  validation {
    condition = (
      var.identity_credentials.mode == "managed" ||
      (
        var.identity_credentials.mode == "existing" &&
        trimspace(var.identity_credentials.api_fingerprint) != "" &&
        trimspace(var.identity_credentials.api_private_key_path) != "" &&
        fileexists(var.identity_credentials.api_private_key_path) &&
        can(regex("^[A-Fa-f0-9]{40}$", trimspace(var.identity_credentials.s3_access_key_id))) &&
        trimspace(var.identity_credentials.s3_secret_access_key) != ""
      )
    )
    error_message = "identity_credentials.mode must be managed, or existing with a valid API private-key path, fingerprint, 40-character Object Storage Access Key, and matching Secret Key. The Access Key is not an OCID."
  }
}

locals {
  compact_id                        = upper(substr(replace(var.context.resource_id, "-", ""), 0, 10))
  database_name                     = upper(lookup(var.settings, "database_name", "PG${local.compact_id}"))
  service_name                      = "${local.database_name}_high"
  object_prefix                     = lookup(var.settings, "object_storage_prefix", "iceberg")
  ai_region                         = lookup(var.settings, "ai_region", var.context.region)
  automation_root                   = abspath("${path.root}/../.automation")
  artifact_prefix                   = "${terraform.workspace}-peakgear"
  wallet_path                       = "${local.automation_root}/${local.artifact_prefix}-wallet.zip"
  generated_api_private_key_path    = "${local.automation_root}/${local.artifact_prefix}-oci-api-key.pem"
  use_existing_identity_credentials = var.identity_credentials.mode == "existing"
  api_private_key_source_path       = local.use_existing_identity_credentials ? abspath(var.identity_credentials.api_private_key_path) : local_sensitive_file.api_private_key[0].filename
  api_fingerprint                   = local.use_existing_identity_credentials ? var.identity_credentials.api_fingerprint : oci_identity_api_key.application[0].fingerprint
  s3_access_key_id                  = local.use_existing_identity_credentials ? var.identity_credentials.s3_access_key_id : oci_identity_customer_secret_key.gravitino[0].id
  s3_secret_access_key              = local.use_existing_identity_credentials ? var.identity_credentials.s3_secret_access_key : oci_identity_customer_secret_key.gravitino[0].key
  low_index                         = index(oci_database_autonomous_database.peak_gear.connection_strings[0].profiles.*.consumer_group, "LOW")
  low_connection                    = oci_database_autonomous_database.peak_gear.connection_strings[0].profiles[local.low_index].value
  ords_url                          = oci_database_autonomous_database.peak_gear.connection_urls[0].ords_url
  object_namespace                  = data.oci_objectstorage_namespace.current.namespace
  object_storage_s3_url             = "https://${local.object_namespace}.compat.objectstorage.${var.context.region}.oraclecloud.com"
}

resource "oci_database_autonomous_database" "peak_gear" {
  admin_password              = var.admin_password
  compartment_id              = var.context.compartment_ocid
  compute_model               = "ECPU"
  compute_count               = tonumber(lookup(var.settings, "compute_count", "2"))
  data_storage_size_in_tbs    = tonumber(lookup(var.settings, "storage_tbs", "1"))
  db_name                     = local.database_name
  db_version                  = lookup(var.settings, "db_version", "23ai")
  db_workload                 = "OLTP"
  display_name                = "${var.context.resource_name_prefix}-${var.context.resource_id}-adb"
  is_auto_scaling_enabled     = false
  is_free_tier                = false
  is_mtls_connection_required = true
  license_model               = "BRING_YOUR_OWN_LICENSE"

  freeform_tags = {
    CreatedBy = "peak-gear-livestack"
    Purpose   = "pre-marketplace-acceptance"
  }

  lifecycle {
    precondition {
      condition     = can(regex("^[A-Z][A-Z0-9]{0,13}$", local.database_name))
      error_message = "Peak Gear database_name must start with a letter and contain at most 14 alphanumeric characters."
    }
  }
}

resource "oci_database_autonomous_database_wallet" "peak_gear" {
  autonomous_database_id = oci_database_autonomous_database.peak_gear.id
  base64_encode_content  = true
  generate_type          = "SINGLE"
  password               = var.admin_password
}

resource "local_sensitive_file" "wallet" {
  content_base64       = oci_database_autonomous_database_wallet.peak_gear.content
  filename             = local.wallet_path
  file_permission      = "0600"
  directory_permission = "0700"
}

data "oci_objectstorage_namespace" "current" {
  compartment_id = var.context.tenancy_ocid
}

resource "oci_objectstorage_bucket" "lakehouse" {
  compartment_id        = var.context.compartment_ocid
  name                  = lower("${var.context.resource_name_prefix}-${var.context.resource_id}-lakehouse")
  namespace             = data.oci_objectstorage_namespace.current.namespace
  object_events_enabled = true

  freeform_tags = {
    CreatedBy = "peak-gear-livestack"
    Purpose   = "pre-marketplace-acceptance"
  }
}

resource "oci_objectstorage_preauthrequest" "lakehouse" {
  access_type           = "AnyObjectReadWrite"
  bucket                = oci_objectstorage_bucket.lakehouse.name
  bucket_listing_action = "ListObjects"
  name                  = "${var.context.resource_name_prefix}-${var.context.resource_id}-par"
  namespace             = data.oci_objectstorage_namespace.current.namespace
  time_expires          = timeadd(timestamp(), "24h")
}

resource "oci_identity_customer_secret_key" "gravitino" {
  count = local.use_existing_identity_credentials ? 0 : 1

  provider     = oci.home
  display_name = "${var.context.resource_name_prefix}-${var.context.resource_id}-gravitino"
  user_id      = var.context.user_ocid
}

resource "tls_private_key" "application" {
  count = local.use_existing_identity_credentials ? 0 : 1

  algorithm = "RSA"
  rsa_bits  = 2048
}

resource "oci_identity_api_key" "application" {
  count = local.use_existing_identity_credentials ? 0 : 1

  provider  = oci.home
  key_value = trimspace(tls_private_key.application[0].public_key_pem)
  user_id   = var.context.user_ocid
}

resource "local_sensitive_file" "api_private_key" {
  count = local.use_existing_identity_credentials ? 0 : 1

  content              = tls_private_key.application[0].private_key_pem
  filename             = local.generated_api_private_key_path
  file_permission      = "0600"
  directory_permission = "0700"
}

output "runtime_metadata" {
  description = "Peak Gear values consumed at first boot. Private key and wallet files are staged separately."
  sensitive   = true
  value = {
    adb_ocid                                = oci_database_autonomous_database.peak_gear.id
    adb_service                             = local.service_name
    ai_endpoint_region                      = local.ai_region
    baseurl                                 = trimsuffix(replace(local.ords_url, "/ords//", ""), "/")
    bucket_name                             = oci_objectstorage_bucket.lakehouse.name
    bucket_par                              = "https://objectstorage.${var.context.region}.oraclecloud.com${oci_objectstorage_preauthrequest.lakehouse.access_uri}"
    compartment_ocid                        = var.context.compartment_ocid
    data_transforms_adb_auto_configure      = "true"
    data_transforms_adb_connection_name     = local.database_name
    data_transforms_adb_username            = "PG"
    data_transforms_iceberg_auto_create     = "true"
    data_transforms_iceberg_connection_name = "pg-iceberg"
    dbconnection                            = local.low_connection
    dbname                                  = local.database_name
    dbuser                                  = "ADMIN"
    endpoint                                = "https://inference.generativeai.${local.ai_region}.oci.oraclecloud.com"
    gravitino_jdbc_service_name             = local.service_name
    gravitino_jdbc_user                     = "PG"
    gravitino_object_storage_bucket         = oci_objectstorage_bucket.lakehouse.name
    gravitino_object_storage_prefix         = local.object_prefix
    gravitino_s3_access_key_id              = local.s3_access_key_id
    gravitino_s3_endpoint                   = local.object_storage_s3_url
    gravitino_s3_path_style_access          = "true"
    gravitino_s3_region                     = var.context.region
    gravitino_s3_secret_access_key          = local.s3_secret_access_key
    object_namespace                        = local.object_namespace
    oci_ai_profile_name                     = "PG_GENAI_PROFILE"
    oci_auth_type                           = "api_key"
    oci_genai_credential_name               = "PG_OCI_GENAI_CRED"
    oci_genai_embedding_model               = "cohere.embed-v4.0"
    oci_genai_model                         = "cohere.command-a-03-2025"
    ordsurl                                 = local.ords_url
    pem_key_fingerprint                     = local.api_fingerprint
    pg_ai_profile_auto_setup                = "true"
    region_identifier                       = var.context.region
    tenancy_ocid                            = var.context.tenancy_ocid
    user_ocid                               = var.context.user_ocid
    webshop_upload_object_prefix            = "webshop-uploads"
    webshop_upload_par_url                  = "https://objectstorage.${var.context.region}.oraclecloud.com${oci_objectstorage_preauthrequest.lakehouse.access_uri}"
  }
}

output "runtime_files" {
  description = "Protected files staged onto the test VM after SSH is available."
  value = [
    { source_path = local_sensitive_file.wallet.filename, target_name = "peakgear-wallet.zip", mode = "0600" },
    { source_path = local.api_private_key_source_path, target_name = "oci-api-key.pem", mode = "0600" }
  ]
}

output "summary" {
  value = {
    database_name = oci_database_autonomous_database.peak_gear.db_name
    database_ocid = oci_database_autonomous_database.peak_gear.id
    service_name  = local.service_name
    bucket_name   = oci_objectstorage_bucket.lakehouse.name
  }
}
