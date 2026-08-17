packer {
  required_version = ">= 1.10.0"

  required_plugins {
    oracle = {
      source  = "github.com/hashicorp/oracle"
      version = "= 1.1.2"
    }
  }
}

variable "oci_config_file" {
  type        = string
  description = "Path to the OCI SDK/CLI configuration file."
  default     = "~/.oci/config"
}

variable "oci_profile" {
  type        = string
  description = "Profile in the OCI SDK/CLI configuration file."
  default     = "DEFAULT"
}

variable "region" {
  type        = string
  description = "OCI region where Packer creates the temporary VM and custom image."
}

variable "availability_domain" {
  type        = string
  description = "Availability domain used by the temporary build VM."
}

variable "compartment_ocid" {
  type        = string
  description = "Compartment for the temporary build VM."

  validation {
    condition     = startswith(var.compartment_ocid, "ocid1.compartment.")
    error_message = "The compartment_ocid value must be a compartment OCID."
  }
}

variable "image_compartment_ocid" {
  type        = string
  description = "Compartment for the resulting custom image. Empty means compartment_ocid."
  default     = ""
}

variable "subnet_ocid" {
  type        = string
  description = "Existing subnet that allows Packer to reach the temporary VM over SSH."

  validation {
    condition     = startswith(var.subnet_ocid, "ocid1.subnet.")
    error_message = "The subnet_ocid value must be a subnet OCID."
  }
}

variable "nsg_ocids" {
  type        = list(string)
  description = "Existing NSGs attached to the temporary build VM."
  default     = []
}

variable "base_image_ocid" {
  type        = string
  description = "Pinned Oracle Linux 9 platform image OCID."

  validation {
    condition     = startswith(var.base_image_ocid, "ocid1.image.")
    error_message = "The base_image_ocid value must be an image OCID."
  }
}

variable "shape" {
  type        = string
  description = "Shape for the temporary build VM."
  default     = "VM.Standard.E4.Flex"
}

variable "ocpus" {
  type        = number
  description = "OCPUs for a flexible build shape."
  default     = 2
}

variable "memory_in_gbs" {
  type        = number
  description = "Memory for a flexible build shape."
  default     = 16
}

variable "disk_size_gbs" {
  type        = number
  description = "Boot volume size for the temporary build VM."
  default     = 100
}

variable "assign_public_ip" {
  type        = bool
  description = "Assign a public IP to the temporary build VM."
  default     = true
}

variable "use_private_ip" {
  type        = bool
  description = "Tell Packer to connect to the temporary VM by private IP."
  default     = false
}

variable "image_name" {
  type        = string
  description = "Exact display name for the generated OCI custom image."
  default     = "peak-gear-livestack"

  validation {
    condition     = can(regex("^[A-Za-z0-9][A-Za-z0-9._-]{0,254}$", var.image_name))
    error_message = "The image_name value must start with a letter or number and use only letters, numbers, periods, underscores, or hyphens."
  }
}

variable "skip_create_image" {
  type        = bool
  description = "Create and provision the temporary VM without capturing an image."
  default     = false
}

variable "manual_capture_mode" {
  type        = bool
  description = "Stop after final image preparation so Packer can preserve the VM for manual OCI Console capture."
  default     = false
}

variable "manual_capture_ssh_public_key" {
  type        = string
  description = "Temporary OpenSSH public key installed only while a manual-capture VM is running."
  default     = ""

  validation {
    condition     = trimspace(var.manual_capture_ssh_public_key) == "" || can(regex("^(ssh-(rsa|ed25519)|ecdsa-sha2-[A-Za-z0-9-]+) [A-Za-z0-9+/=]+", trimspace(var.manual_capture_ssh_public_key)))
    error_message = "Manual capture SSH public key must be empty or a valid OpenSSH public key."
  }
}

variable "manual_capture_nsg_ocids" {
  type        = list(string)
  description = "Optional additional NSGs attached only to a manual-capture VM for restricted browser inspection."
  default     = []
}

variable "build_instance_name" {
  type        = string
  description = "Optional exact display name for the temporary build VM."
  default     = ""

  validation {
    condition     = var.build_instance_name == "" || can(regex("^[A-Za-z0-9][A-Za-z0-9._-]{0,254}$", var.build_instance_name))
    error_message = "The build_instance_name value must start with a letter or number and use only letters, numbers, periods, underscores, or hyphens."
  }
}

variable "peakgear_registry_username" {
  type        = string
  description = "Oracle Container Registry username used only while Packer preloads licensed images."
  sensitive   = true
  validation {
    condition     = length(trimspace(var.peakgear_registry_username)) > 0
    error_message = "Set peakgear_registry_username in the ignored Packer variable file."
  }
}

variable "peakgear_registry_token" {
  type        = string
  description = "Oracle Container Registry auth token used only during the image build."
  sensitive   = true
  validation {
    condition     = length(var.peakgear_registry_token) > 0
    error_message = "Set peakgear_registry_token in the ignored Packer variable file."
  }
}

variable "peakgear_ggsa_archive_url" {
  type        = string
  description = "Read-only URL for the licensed GoldenGate Stream Analytics installer archive."
  sensitive   = true
  validation {
    condition     = can(regex("^https://", var.peakgear_ggsa_archive_url))
    error_message = "Set peakgear_ggsa_archive_url to an approved HTTPS URL."
  }
}

variable "peakgear_gravitino_archive_url" {
  type        = string
  description = "Read-only URL for the Gravitino Iceberg REST server archive."
  sensitive   = true
  validation {
    condition     = can(regex("^https://", var.peakgear_gravitino_archive_url))
    error_message = "Set peakgear_gravitino_archive_url to an approved HTTPS URL."
  }
}

locals {
  build_stamp            = formatdate("YYYYMMDD-hhmmss", timestamp())
  image_compartment_ocid = var.image_compartment_ocid != "" ? var.image_compartment_ocid : var.compartment_ocid
  build_instance_name    = var.build_instance_name != "" ? var.build_instance_name : "${var.image_name}-build-${local.build_stamp}"
  build_nsg_ocids        = var.manual_capture_mode ? distinct(concat(var.nsg_ocids, var.manual_capture_nsg_ocids)) : var.nsg_ocids
}

source "oracle-oci" "pilot" {
  access_cfg_file         = var.oci_config_file
  access_cfg_file_account = var.oci_profile
  region                  = var.region

  availability_domain    = var.availability_domain
  base_image_ocid        = var.base_image_ocid
  compartment_ocid       = var.compartment_ocid
  image_compartment_ocid = local.image_compartment_ocid
  subnet_ocid            = var.subnet_ocid

  shape = var.shape
  shape_config {
    ocpus         = var.ocpus
    memory_in_gbs = var.memory_in_gbs
  }

  create_vnic_details {
    assign_public_ip = var.assign_public_ip
    nsg_ids          = local.build_nsg_ocids
  }

  disk_size         = var.disk_size_gbs
  image_name        = var.image_name
  instance_name     = local.build_instance_name
  skip_create_image = var.skip_create_image
  use_private_ip    = var.use_private_ip

  ssh_username = "opc"
  ssh_timeout  = "20m"

  instance_options_are_legacy_imds_endpoints_disabled = true

  instance_tags = {
    "built-by" = "packer"
    "purpose"  = "custom-image-build"
  }

  tags = {
    "built-by" = "packer"
    "workload" = "oci-image-pilot"
  }

}

build {
  name    = "oci-image-pilot"
  sources = ["source.oracle-oci.pilot"]

  provisioner "shell" {
    execute_command = "sed -i 's/\\r$//' '{{ .Path }}'; chmod 0700 '{{ .Path }}'; {{ .Vars }} /bin/bash '{{ .Path }}'"
    inline = [
      "mkdir -p /tmp/oci-image-pilot/01-edit /tmp/oci-image-pilot/02-edit-if-needed /tmp/oci-image-pilot/03-automation",
    ]
  }

  provisioner "file" {
    source      = "${path.root}/../../../ll-lakehouse/ingestion"
    destination = "/tmp/oci-image-pilot/01-edit/"
  }

  provisioner "file" {
    source      = "${path.root}/../../../ll-lakehouse/init"
    destination = "/tmp/oci-image-pilot/01-edit/"
  }

  provisioner "file" {
    source      = "${path.root}/../../../ll-lakehouse/prepare-custom-image.sh"
    destination = "/tmp/oci-image-pilot/01-edit/prepare-custom-image.sh"
  }

  provisioner "file" {
    source      = "${path.root}/../01-edit/public-endpoints.json"
    destination = "/tmp/oci-image-pilot/01-edit/public-endpoints.json"
  }

  provisioner "file" {
    source      = "${path.root}/../01-edit/service-catalog.json"
    destination = "/tmp/oci-image-pilot/01-edit/service-catalog.json"
  }

  provisioner "file" {
    source      = "${path.root}/../02-edit-if-needed/hooks"
    destination = "/tmp/oci-image-pilot/02-edit-if-needed/"
  }

  provisioner "file" {
    source      = "${path.root}/../02-edit-if-needed/service-tests"
    destination = "/tmp/oci-image-pilot/02-edit-if-needed/"
  }

  provisioner "file" {
    source      = "${path.root}/../02-edit-if-needed/local-runtime.env.example"
    destination = "/tmp/oci-image-pilot/02-edit-if-needed/local-runtime.env.example"
  }

  provisioner "file" {
    source      = "${path.root}/run-tests.sh"
    destination = "/tmp/oci-image-pilot/03-automation/run-tests.sh"
  }

  provisioner "file" {
    source      = "${path.root}/install-image.sh"
    destination = "/tmp/oci-image-pilot/03-automation/install-image.sh"
  }

  provisioner "file" {
    source      = "${path.root}/configure-instance.sh"
    destination = "/tmp/oci-image-pilot/03-automation/configure-instance.sh"
  }

  provisioner "file" {
    source      = "${path.root}/prepare-image.sh"
    destination = "/tmp/oci-image-pilot/03-automation/prepare-image.sh"
  }

  # These are copied into the payload before install-image.sh normalizes every
  # shell file to LF. Manual capture then invokes the normalized copies instead
  # of asking Packer to transfer a Windows-formatted hook at the final step.
  provisioner "file" {
    source      = "${path.root}/manual-capture-access.sh"
    destination = "/tmp/oci-image-pilot/03-automation/manual-capture-access.sh"
  }

  provisioner "file" {
    source      = "${path.root}/manual-capture-ready.sh"
    destination = "/tmp/oci-image-pilot/03-automation/manual-capture-ready.sh"
  }

  provisioner "file" {
    source      = "${path.root}/systemd"
    destination = "/tmp/oci-image-pilot/03-automation/"
  }

  provisioner "file" {
    source      = "${path.root}/dashboard"
    destination = "/tmp/oci-image-pilot/03-automation/"
  }

  provisioner "shell" {
    timeout         = "3h"
    execute_command = "sed -i 's/\\r$//' '{{ .Path }}'; chmod 0700 '{{ .Path }}'; {{ .Vars }} sudo -E /bin/bash '{{ .Path }}'"
    environment_vars = [
      "PEAKGEAR_REGISTRY_USERNAME=${var.peakgear_registry_username}",
      "PEAKGEAR_REGISTRY_TOKEN=${var.peakgear_registry_token}",
      "PEAKGEAR_GGSA_ARCHIVE_URL=${var.peakgear_ggsa_archive_url}",
      "PEAKGEAR_GRAVITINO_ARCHIVE_URL=${var.peakgear_gravitino_archive_url}",
    ]
    inline = [
      "/bin/bash /tmp/oci-image-pilot/03-automation/install-image.sh /tmp/oci-image-pilot",
    ]
  }

  provisioner "shell" {
    execute_command = "sed -i 's/\\r$//' '{{ .Path }}'; chmod 0700 '{{ .Path }}'; {{ .Vars }} sudo -E /bin/bash '{{ .Path }}'"
    environment_vars = [
      "OCI_MANUAL_CAPTURE_MODE=${var.manual_capture_mode}",
      "OCI_MANUAL_CAPTURE_SSH_PUBLIC_KEY=${var.manual_capture_ssh_public_key}",
    ]
    inline = [
      "/bin/bash /tmp/oci-image-pilot/03-automation/manual-capture-access.sh",
    ]
  }

  provisioner "shell" {
    execute_command = "sed -i 's/\\r$//' '{{ .Path }}'; chmod 0700 '{{ .Path }}'; {{ .Vars }} /bin/bash '{{ .Path }}'"
    inline = [
      "/home/opc/oci-image-pilot/tests/run-tests.sh --build",
    ]
  }

  provisioner "shell" {
    execute_command = "sed -i 's/\\r$//' '{{ .Path }}'; chmod 0700 '{{ .Path }}'; {{ .Vars }} /bin/bash '{{ .Path }}'"
    inline = [
      "sudo /home/opc/oci-image-pilot/scripts/prepare-image.sh --final",
    ]
  }

  provisioner "shell" {
    execute_command = "sed -i 's/\\r$//' '{{ .Path }}'; chmod 0700 '{{ .Path }}'; {{ .Vars }} sudo -E /bin/bash '{{ .Path }}'"
    environment_vars = [
      "OCI_MANUAL_CAPTURE_MODE=${var.manual_capture_mode}",
      "OCI_MANUAL_CAPTURE_SSH_PUBLIC_KEY=${var.manual_capture_ssh_public_key}",
      "OCI_MANUAL_CAPTURE_INSTANCE=${local.build_instance_name}",
    ]
    inline = [
      "/bin/bash /tmp/oci-image-pilot/03-automation/manual-capture-access.sh",
    ]
  }

  provisioner "shell" {
    execute_command = "sed -i 's/\\r$//' '{{ .Path }}'; chmod 0700 '{{ .Path }}'; {{ .Vars }} /bin/bash '{{ .Path }}'"
    environment_vars = [
      "OCI_MANUAL_CAPTURE_MODE=${var.manual_capture_mode}",
      "OCI_MANUAL_CAPTURE_INSTANCE=${local.build_instance_name}",
    ]
    inline = [
      "/bin/bash /tmp/oci-image-pilot/03-automation/manual-capture-ready.sh",
    ]
  }

  post-processor "manifest" {
    output = "${path.root}/packer-manifest.json"
  }
}
