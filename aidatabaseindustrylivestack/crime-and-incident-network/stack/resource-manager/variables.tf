variable "tenancy_ocid" {
  type = string
}
variable "compartment_ocid" {
  type = string
}
variable "region" {
  type    = string
  default = "us-ashburn-1"
}
variable "availability_domain" {
  type = string
}
variable "stack_name" {
  type    = string
  default = "incidentdata-walkthrough"
  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{2,23}$", var.stack_name))
    error_message = "Use 3–24 lowercase letters, digits or hyphens, beginning with a letter."
  }
}
variable "ssh_public_key" {
  type        = string
  default     = ""
  description = "Optional operator SSH public key; leave blank to disable inbound SSH."
  validation {
    condition     = trimspace(var.ssh_public_key) == "" || can(regex("^(ssh-ed25519|ssh-rsa|ecdsa-sha2-nistp(256|384|521)) ", trimspace(var.ssh_public_key)))
    error_message = "Leave blank to disable SSH, or supply an SSH public key, never a private key."
  }
}
variable "ssh_ingress_cidr" {
  type    = string
  default = ""
  validation {
    condition     = var.ssh_ingress_cidr == "" || (can(cidrhost(var.ssh_ingress_cidr, 0)) && can(regex("/(2[4-9]|3[0-2])$", var.ssh_ingress_cidr)) && !strcontains(var.ssh_ingress_cidr, ":"))
    error_message = "Leave blank to disable inbound SSH, or use a trusted IPv4 /24 through /32."
  }
}
variable "public_hostname" {
  type    = string
  default = ""
  validation {
    condition     = var.public_hostname == "" || can(regex("^[a-z0-9][a-z0-9.-]+\\.[a-z]{2,}$", var.public_hostname))
    error_message = "Leave blank to use the reserved public IP, or supply a DNS hostname without a scheme, path or port."
  }
}
variable "vm_shape" {
  type    = string
  default = "VM.Standard.E4.Flex"
  validation {
    condition     = contains(["VM.Standard.E4.Flex", "VM.Standard.E5.Flex", "VM.Standard.E6.Flex"], var.vm_shape)
    error_message = "This worker release requires a supported x86_64 flexible shape."
  }
}
variable "vm_ocpus" {
  type    = number
  default = 4
  validation {
    condition     = var.vm_ocpus >= 4 && var.vm_ocpus <= 16
    error_message = "Use 4–16 OCPUs for the full media demo."
  }
}
variable "vm_memory_gbs" {
  type    = number
  default = 32
  validation {
    condition     = var.vm_memory_gbs >= 32 && var.vm_memory_gbs <= 128
    error_message = "Use 32–128 GB RAM for the application and media worker."
  }
}
variable "adb_compute_count" {
  type    = number
  default = 2
  validation {
    condition     = var.adb_compute_count >= 2 && var.adb_compute_count <= 8
    error_message = "Use 2–8 ECPUs for the initial test."
  }
}
variable "adb_storage_gbs" {
  type    = number
  default = 100
}
variable "boot_volume_gbs" {
  type    = number
  default = 100
}
variable "genai_region" {
  type    = string
  default = "us-chicago-1"
}
variable "release_manifest_path" {
  type        = string
  default     = "release-manifest.json"
  description = "Verified release manifest packaged with the Resource Manager configuration; not a URL or a secret."
}
variable "release_namespace" {
  type    = string
  default = "c4u04"
}
variable "release_bucket" {
  type    = string
  default = "livelabsfiles"
}
variable "release_download_base_url" {
  type        = string
  default     = "https://objectstorage.us-ashburn-1.oraclecloud.com/p/4Au3jJ-t8Wtw3LWyYsDMqQk2FdlXDvXCb1MYRS0J6P4QS-GCrv2YNOolWdtFMLZq/n/c4u04/b/livelabsfiles/o/livestack/crime-and-incident-network/releases/team-20261102-f76416e0fcca/"
  description = "Optional approved read-only OCI PAR base for non-secret release payloads, ending with the exact versioned release prefix and a slash. Never used for bootstrap credentials or status."
  validation {
    condition     = var.release_download_base_url == "" || (can(regex("^https://([a-z0-9]+\\.objectstorage\\.[a-z0-9-]+\\.oci\\.customer-oci\\.com|objectstorage\\.[a-z0-9-]+\\.oraclecloud\\.com)/p/[A-Za-z0-9_-]+/n/[a-z0-9]+/b/[A-Za-z0-9_-]+/o/[A-Za-z0-9/_-]+/$", var.release_download_base_url)) && !strcontains(var.release_download_base_url, ".."))
    error_message = "Use an HTTPS OCI read-only PAR base ending in the versioned release prefix and a slash, or leave blank for private IAM access."
  }
}
variable "release_prefix" {
  type    = string
  default = "livestack/crime-and-incident-network/releases/team-20261102-f76416e0fcca"
  validation {
    condition     = can(regex("^[a-zA-Z0-9][a-zA-Z0-9/_-]+$", var.release_prefix)) && !strcontains(var.release_prefix, "..")
    error_message = "Use a versioned object prefix with safe path characters."
  }
}
variable "ollama_image" {
  type        = string
  default     = "docker.io/ollama/ollama@sha256:b88c73ace3e115f8ec53dc8761ae1c0aabfa675406e3681786b98757ce050f42"
  description = "Verified x86_64 Ollama image pinned by digest."
  validation {
    condition     = can(regex("^docker.io/ollama/ollama@sha256:[a-f0-9]{64}$", var.ollama_image))
    error_message = "Pin the tested Ollama image digest."
  }
}
