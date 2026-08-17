terraform {
  required_version = ">= 1.5"

  required_providers {
    oci = {
      source  = "oracle/oci"
      version = "~> 8.21"
    }
    local = {
      source  = "hashicorp/local"
      version = "~> 2.6"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.9"
    }
    tls = {
      source  = "hashicorp/tls"
      version = "~> 4.1"
    }
  }
}

provider "oci" {
  region              = var.ociRegionIdentifier
  auth                = var.ociAuthMethod
  config_file_profile = var.ociConfigProfile
}

provider "oci" {
  alias               = "home"
  region              = var.ociHomeRegionIdentifier != "" ? var.ociHomeRegionIdentifier : var.ociRegionIdentifier
  auth                = var.ociAuthMethod
  config_file_profile = var.ociConfigProfile
}