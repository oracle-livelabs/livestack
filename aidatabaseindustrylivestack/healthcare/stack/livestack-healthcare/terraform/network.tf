resource "oci_core_vcn" "healthcare" {
  compartment_id = var.compartment_ocid
  cidr_block     = local.vcn_cidr
  display_name   = "${local.name_prefix}-vcn"
  dns_label      = "hclive"
  freeform_tags  = local.common_tags
}

resource "oci_core_internet_gateway" "healthcare" {
  compartment_id = var.compartment_ocid
  vcn_id         = oci_core_vcn.healthcare.id
  display_name   = "${local.name_prefix}-igw"
  enabled        = true
  freeform_tags  = local.common_tags
}

resource "oci_core_nat_gateway" "healthcare" {
  compartment_id = var.compartment_ocid
  vcn_id         = oci_core_vcn.healthcare.id
  display_name   = "${local.name_prefix}-nat"
  freeform_tags  = local.common_tags
}

resource "oci_core_route_table" "public" {
  compartment_id = var.compartment_ocid
  vcn_id         = oci_core_vcn.healthcare.id
  display_name   = "${local.name_prefix}-public-rt"
  freeform_tags  = local.common_tags

  route_rules {
    destination       = "0.0.0.0/0"
    destination_type  = "CIDR_BLOCK"
    network_entity_id = oci_core_internet_gateway.healthcare.id
  }
}

resource "oci_core_route_table" "private" {
  compartment_id = var.compartment_ocid
  vcn_id         = oci_core_vcn.healthcare.id
  display_name   = "${local.name_prefix}-private-rt"
  freeform_tags  = local.common_tags

  route_rules {
    destination       = "0.0.0.0/0"
    destination_type  = "CIDR_BLOCK"
    network_entity_id = oci_core_nat_gateway.healthcare.id
  }
}

resource "oci_core_security_list" "empty" {
  compartment_id = var.compartment_ocid
  vcn_id         = oci_core_vcn.healthcare.id
  display_name   = "${local.name_prefix}-empty-sl"
  freeform_tags  = local.common_tags
}

resource "oci_core_network_security_group" "app" {
  compartment_id = var.compartment_ocid
  vcn_id         = oci_core_vcn.healthcare.id
  display_name   = "${local.name_prefix}-app-nsg"
  freeform_tags  = local.common_tags
}

resource "oci_core_network_security_group" "ollama" {
  compartment_id = var.compartment_ocid
  vcn_id         = oci_core_vcn.healthcare.id
  display_name   = "${local.name_prefix}-ollama-nsg"
  freeform_tags  = local.common_tags
}

resource "oci_core_network_security_group_security_rule" "app_ingress_http" {
  network_security_group_id = oci_core_network_security_group.app.id
  direction                 = "INGRESS"
  protocol                  = "6"
  source                    = var.app_ingress_cidr
  source_type               = "CIDR_BLOCK"
  description               = "Public access to the healthcare application."

  tcp_options {
    destination_port_range {
      min = local.app_port
      max = local.app_port
    }
  }
}

resource "oci_core_network_security_group_security_rule" "app_ingress_ssh" {
  network_security_group_id = oci_core_network_security_group.app.id
  direction                 = "INGRESS"
  protocol                  = "6"
  source                    = var.ssh_ingress_cidr
  source_type               = "CIDR_BLOCK"
  description               = "SSH access to the public app VM."

  tcp_options {
    destination_port_range {
      min = 22
      max = 22
    }
  }
}

resource "oci_core_network_security_group_security_rule" "app_ingress_ords" {
  count = local.expose_ords_public ? 1 : 0

  network_security_group_id = oci_core_network_security_group.app.id
  direction                 = "INGRESS"
  protocol                  = "6"
  source                    = var.app_ingress_cidr
  source_type               = "CIDR_BLOCK"
  description               = "Optional public access to ORDS. Disabled by default."

  tcp_options {
    destination_port_range {
      min = local.ords_port
      max = local.ords_port
    }
  }
}

resource "oci_core_network_security_group_security_rule" "app_egress_http" {
  network_security_group_id = oci_core_network_security_group.app.id
  direction                 = "EGRESS"
  protocol                  = "6"
  destination               = "0.0.0.0/0"
  destination_type          = "CIDR_BLOCK"
  description               = "Outbound HTTP for package and source downloads."

  tcp_options {
    destination_port_range {
      min = 80
      max = 80
    }
  }
}

resource "oci_core_network_security_group_security_rule" "app_egress_https" {
  network_security_group_id = oci_core_network_security_group.app.id
  direction                 = "EGRESS"
  protocol                  = "6"
  destination               = "0.0.0.0/0"
  destination_type          = "CIDR_BLOCK"
  description               = "Outbound HTTPS for package, container image, source, and ADB public service metadata downloads."

  tcp_options {
    destination_port_range {
      min = 443
      max = 443
    }
  }
}

resource "oci_core_network_security_group_security_rule" "app_egress_ollama" {
  network_security_group_id = oci_core_network_security_group.app.id
  direction                 = "EGRESS"
  protocol                  = "6"
  destination               = oci_core_network_security_group.ollama.id
  destination_type          = "NETWORK_SECURITY_GROUP"
  description               = "App VM to private Ollama API."

  tcp_options {
    destination_port_range {
      min = local.ollama_port
      max = local.ollama_port
    }
  }
}

resource "oci_core_network_security_group_security_rule" "app_egress_adb" {
  network_security_group_id = oci_core_network_security_group.app.id
  direction                 = "EGRESS"
  protocol                  = "6"
  destination               = "0.0.0.0/0"
  destination_type          = "CIDR_BLOCK"
  description               = "App VM to Autonomous AI Database for Developers public TCPS endpoint."

  tcp_options {
    destination_port_range {
      min = 1522
      max = 1522
    }
  }
}

resource "oci_core_network_security_group_security_rule" "ollama_ingress_app" {
  network_security_group_id = oci_core_network_security_group.ollama.id
  direction                 = "INGRESS"
  protocol                  = "6"
  source                    = oci_core_network_security_group.app.id
  source_type               = "NETWORK_SECURITY_GROUP"
  description               = "Only the app VM can call the private Ollama API."

  tcp_options {
    destination_port_range {
      min = local.ollama_port
      max = local.ollama_port
    }
  }
}

resource "oci_core_network_security_group_security_rule" "ollama_ingress_ssh_from_app" {
  network_security_group_id = oci_core_network_security_group.ollama.id
  direction                 = "INGRESS"
  protocol                  = "6"
  source                    = oci_core_network_security_group.app.id
  source_type               = "NETWORK_SECURITY_GROUP"
  description               = "SSH to the private Ollama VM from the app VM for troubleshooting."

  tcp_options {
    destination_port_range {
      min = 22
      max = 22
    }
  }
}

resource "oci_core_network_security_group_security_rule" "ollama_egress_http" {
  network_security_group_id = oci_core_network_security_group.ollama.id
  direction                 = "EGRESS"
  protocol                  = "6"
  destination               = "0.0.0.0/0"
  destination_type          = "CIDR_BLOCK"
  description               = "Outbound HTTP for package and model metadata downloads through NAT."

  tcp_options {
    destination_port_range {
      min = 80
      max = 80
    }
  }
}

resource "oci_core_network_security_group_security_rule" "ollama_egress_https" {
  network_security_group_id = oci_core_network_security_group.ollama.id
  direction                 = "EGRESS"
  protocol                  = "6"
  destination               = "0.0.0.0/0"
  destination_type          = "CIDR_BLOCK"
  description               = "Outbound HTTPS for package, container image, and model downloads through NAT."

  tcp_options {
    destination_port_range {
      min = 443
      max = 443
    }
  }
}

resource "oci_core_subnet" "app" {
  compartment_id             = var.compartment_ocid
  vcn_id                     = oci_core_vcn.healthcare.id
  cidr_block                 = local.public_app_subnet_cidr
  display_name               = "${local.name_prefix}-app-public-subnet"
  dns_label                  = "app"
  route_table_id             = oci_core_route_table.public.id
  security_list_ids          = [oci_core_security_list.empty.id]
  prohibit_public_ip_on_vnic = false
  freeform_tags              = local.common_tags
}

resource "oci_core_subnet" "ollama" {
  compartment_id             = var.compartment_ocid
  vcn_id                     = oci_core_vcn.healthcare.id
  cidr_block                 = local.private_ollama_subnet_cidr
  display_name               = "${local.name_prefix}-ollama-private-subnet"
  dns_label                  = "ollama"
  route_table_id             = oci_core_route_table.private.id
  security_list_ids          = [oci_core_security_list.empty.id]
  prohibit_public_ip_on_vnic = true
  freeform_tags              = local.common_tags
}
