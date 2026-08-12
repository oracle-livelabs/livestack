resource "oci_core_instance" "ollama" {
  availability_domain = local.availability_domain
  compartment_id      = var.compartment_ocid
  display_name        = "${local.name_prefix}-ollama"
  shape               = local.ollama_instance_shape
  freeform_tags       = local.common_tags

  dynamic "shape_config" {
    for_each = local.ollama_is_flex_shape ? [1] : []
    content {
      ocpus         = local.ollama_ocpus
      memory_in_gbs = local.ollama_memory_gbs
    }
  }

  create_vnic_details {
    subnet_id        = oci_core_subnet.ollama.id
    assign_public_ip = false
    display_name     = "${local.name_prefix}-ollama-vnic"
    hostname_label   = "ollama"
    nsg_ids          = [oci_core_network_security_group.ollama.id]
  }

  source_details {
    source_type = "image"
    source_id   = local.ollama_image_ocid
  }

  metadata = {
    ssh_authorized_keys = var.ssh_public_key
    user_data = base64encode(templatefile("${path.module}/cloud-init/ollama.yaml", {
      ollama_model               = local.ollama_model
      ollama_port                = local.ollama_port
      ollama_image               = local.ollama_image
      bootstrap_ollama_vm_script = indent(6, trimspace(file("${path.module}/scripts/bootstrap_ollama_vm.sh")))
    }))
  }
}
