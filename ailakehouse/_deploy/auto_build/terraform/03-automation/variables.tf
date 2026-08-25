variable "ociTenancyOcid" {
  default = ""
}

variable "ociUserOcid" {
  default = ""
}

variable "ociCompartmentOcid" {
  default = ""
}

variable "ociUserPassword" {
  default = ""
}

variable "ociRegionIdentifier" {
  default = ""
}
variable "ociHomeRegionIdentifier" {
  description = "OCI tenancy home region used for temporary IAM credentials. Leave empty when it matches ociRegionIdentifier."
  default     = ""
}

variable "ociAuthMethod" {
  description = "OCI provider authentication method. Green Button uses APIKey; local browser-session testing uses SecurityToken."
  default     = "APIKey"
}

variable "ociConfigProfile" {
  description = "OCI CLI configuration profile used for local Terraform runs."
  default     = "DEFAULT"
}

variable "resId" {
  default = ""
}

variable "resource_name_prefix" {
  type        = string
  description = "Portable display-name prefix for resources created by this stack."
  default     = "oci-image-test"

  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{1,30}$", var.resource_name_prefix))
    error_message = "resource_name_prefix must start with a lowercase letter and contain only lowercase letters, numbers, or hyphens."
  }
}

variable "ociPrivateSubnetOcid" {
  default = ""
}

variable "ociPublicSubnetOcid" {
  default = ""
}

variable "ociVcnOcid" {
  default = ""
}

variable "resUserPublicKey" {
  default = ""
}

variable "use_marketplace_image" {
  description = "Use Marketplace listing subscription before launching the image. Keep false while testing a custom image OCID directly."
  default     = false
}

variable "mp_listing_id" {
  description = "Marketplace listing OCID. Populate after the Marketplace listing exists."
  default     = ""
}

variable "mp_listing_resource_version" {
  description = "Marketplace listing resource version. Populate after the Marketplace artifact/version exists."
  default     = ""
}

variable "instance_image_id" {
  description = "Custom image OCID for local testing, or Marketplace image resource OCID after publication."
  default     = ""
}

variable "shape_use_flex" {
  default = true
}

variable "flex_instance_shape" {
  default = "VM.Standard.E4.Flex"
}

variable "fixed_instance_shape" {
  default = "VM.Standard.E4.Flex"
}

variable "instance_count" {
  default = 1
}

variable "enable_test_access_nsg" {
  type        = bool
  description = "Create a temporary NSG for direct image testing. Leave false for the normal Green Button network flow."
  default     = false
}

variable "expose_login_outputs" {
  type        = bool
  description = "Expose Green Button login outputs. The local automation sets this false so passwords are not printed."
  default     = true
}

variable "tester_source_cidr" {
  type        = string
  description = "Trusted CIDR allowed to reach the temporary test VM. Use the tester's current public IP with /32."
  default     = ""

  validation {
    condition = (
      var.tester_source_cidr == "" || (
        can(cidrhost(var.tester_source_cidr, 0)) &&
        !contains(["0.0.0.0/0", "::/0"], var.tester_source_cidr)
      )
    )
    error_message = "tester_source_cidr must be empty or a restricted CIDR such as 203.0.113.10/32; public all-address CIDRs are not allowed."
  }
}

variable "enable_data_transforms_public_test_ingress" {
  type        = bool
  description = "Temporarily allow Oracle Data Transforms to reach TCP 1525 during a disposable local custom-image acceptance test. Keep false for all normal deployments."
  default     = false

  validation {
    condition     = !var.enable_data_transforms_public_test_ingress || var.enable_test_access_nsg
    error_message = "enable_data_transforms_public_test_ingress requires enable_test_access_nsg = true."
  }
}

variable "allowed_tcp_ports" {
  type        = list(number)
  description = "Fallback ports for a manual Terraform test. The automated runner derives SSH plus public endpoint ports from demo-code 01-edit/public-endpoints.json."
  default     = [22]

  validation {
    condition = (
      length(var.allowed_tcp_ports) > 0 &&
      length(distinct(var.allowed_tcp_ports)) == length(var.allowed_tcp_ports) &&
      alltrue([
        for port in var.allowed_tcp_ports :
        port >= 1 && port <= 65535 && floor(port) == port
      ])
    )
    error_message = "allowed_tcp_ports must contain unique whole-number ports from 1 through 65535."
  }
}

variable "instance_shape_config_ocpus" {
  default = 4
}

variable "instance_shape_config_memory_in_gbs" {
  default = 44
}

variable "web_title" {
  default = "Peak Gear LiveStack"
}

variable "app_user" {
  default = "PG"
}

variable "additional_metadata" {
  type        = map(string)
  description = "Optional static OCI metadata consumed by an application configuration hook."
  default     = {}
  sensitive   = true
}

variable "generated_password_metadata_keys" {
  type        = set(string)
  description = "Optional metadata keys that receive generated passwords for each VM."
  default     = []
}

variable "db_password_override" {
  description = "Optional fixed database/app password for repeatable tests. Leave empty to generate one."
  default     = ""
  sensitive   = true
}

locals {
  timestamp      = formatdate("YYYY-MM-DD-hhmmss", timestamp())
  res_id         = var.resId != "" ? var.resId : "test"
  instance_shape = var.shape_use_flex ? var.flex_instance_shape : var.fixed_instance_shape
  is_flex_shape  = var.shape_use_flex ? [var.instance_shape_config_ocpus] : []
}

variable "workshop_settings" {
  type        = map(string)
  description = "Peak Gear ADB, Object Storage, and AI-region settings."
  default     = {}
}

variable "peakgear_identity_credentials" {
  description = "Peak Gear runtime credentials. managed preserves the Green Button flow; existing is a local-test fallback when the operator cannot create IAM credentials."
  type = object({
    mode                 = string
    api_fingerprint      = string
    api_private_key_path = string
    s3_access_key_id     = string
    s3_secret_access_key = string
  })
  sensitive = true
  default = {
    mode                 = "managed"
    api_fingerprint      = ""
    api_private_key_path = ""
    s3_access_key_id     = ""
    s3_secret_access_key = ""
  }

  validation {
    condition     = contains(["managed", "existing"], var.peakgear_identity_credentials.mode)
    error_message = "peakgear_identity_credentials.mode must be managed or existing."
  }
}
