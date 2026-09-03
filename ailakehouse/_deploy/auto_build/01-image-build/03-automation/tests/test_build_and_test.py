#!/usr/bin/env python3
"""Regression tests for the native OCI image pipeline."""

from __future__ import annotations

import importlib.util
from pathlib import Path
import sys
import tempfile
from types import SimpleNamespace
import unittest
from unittest import mock


SCRIPT = Path(__file__).resolve().parents[1] / "build-and-test.py"
SPEC = importlib.util.spec_from_file_location("native_build_and_test", SCRIPT)
if SPEC is None or SPEC.loader is None:
    raise RuntimeError(f"Could not load {SCRIPT}")
PIPELINE = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = PIPELINE
SPEC.loader.exec_module(PIPELINE)


class ConfirmPackerNsgTests(unittest.TestCase):
    def test_uses_oci_cli_nsg_id_option_for_get_and_rules(self) -> None:
        nsg_ocid = "ocid1.networksecuritygroup.oc1.iad.example"
        source_cidr = "192.0.2.10/32"
        calls: list[tuple[list[str], list[str]]] = []
        responses = [
            {"data": {"lifecycle-state": "AVAILABLE", "vcn-id": "vcn-example"}},
            {"data": {"lifecycle-state": "AVAILABLE", "vcn-id": "vcn-example"}},
            {
                "data": [
                    {
                        "direction": "INGRESS",
                        "protocol": "6",
                        "source": source_cidr,
                        "source-type": "CIDR_BLOCK",
                        "is-stateless": False,
                        "tcp-options": {"destination-port-range": {"min": 22, "max": 22}},
                    }
                ]
            },
        ]

        def fake_oci_json(arguments: list[str], common: list[str]) -> object:
            calls.append((arguments, common))
            return responses[len(calls) - 1]

        with tempfile.TemporaryDirectory() as temporary_directory:
            packer_vars = Path(temporary_directory) / "packer.auto.pkrvars.hcl"
            packer_vars.write_text(f'nsg_ocids = ["{nsg_ocid}"]\n', encoding="utf-8")
            context = SimpleNamespace(
                packer_vars=packer_vars,
                subnet="ocid1.subnet.oc1.iad.example",
                common=["--profile", "PEAKGEAR"],
                source_cidr=source_cidr,
            )
            with mock.patch.object(PIPELINE, "oci_json", side_effect=fake_oci_json), mock.patch.object(
                PIPELINE, "passed"
            ):
                PIPELINE.confirm_packer_nsg(context)

        self.assertEqual(
            calls[1][0],
            ["network", "nsg", "get", "--nsg-id", nsg_ocid],
        )
        self.assertEqual(
            calls[2][0],
            [
                "network",
                "nsg",
                "rules",
                "list",
                "--nsg-id",
                nsg_ocid,
                "--direction",
                "INGRESS",
                "--all",
            ],
        )


class ManualCapturePackerVariablesTests(unittest.TestCase):
    def test_includes_the_temporary_ssh_public_key(self) -> None:
        public_key = "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIExample"
        context = SimpleNamespace(
            packer_vars=Path("packer.auto.pkrvars.hcl"),
            args=SimpleNamespace(ImageName="ailakehouse-v9"),
        )

        variables = PIPELINE.packer_variables(
            context,
            manual=True,
            instance_name="ailakehouse-v9-manual-example",
            manual_capture_ssh_public_key=f"{public_key} workstation-comment",
        )

        self.assertIn(f"manual_capture_ssh_public_key={public_key}", variables)

    def test_rejects_an_empty_manual_capture_key(self) -> None:
        context = SimpleNamespace(
            packer_vars=Path("packer.auto.pkrvars.hcl"),
            args=SimpleNamespace(ImageName="ailakehouse-v9"),
        )

        with self.assertRaisesRegex(
            PIPELINE.PipelineError, "Manual capture requires a valid OpenSSH public key"
        ):
            PIPELINE.packer_variables(
                context,
                manual=True,
                instance_name="ailakehouse-v9-manual-example",
            )


class TerraformPlanVariableTests(unittest.TestCase):
    def test_accepts_terraform_cli_scalar_representations(self) -> None:
        self.assertTrue(PIPELINE.matches_approved_plan_variable("false", False))
        self.assertTrue(PIPELINE.matches_approved_plan_variable("true", True))
        self.assertTrue(PIPELINE.matches_approved_plan_variable("1", 1))

    def test_rejects_incorrect_terraform_cli_scalar_representations(self) -> None:
        self.assertFalse(PIPELINE.matches_approved_plan_variable("true", False))
        self.assertFalse(PIPELINE.matches_approved_plan_variable("2", 1))


class TerraformRepositoryResolutionTests(unittest.TestCase):
    def test_resolves_public_sibling_peak_gear_project(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            workspace = Path(temporary_directory)
            project = workspace / "livestack" / "ailakehouse" / "_deploy" / "auto_build" / "01-image-build"
            (workspace / "livestack" / ".git").mkdir(parents=True)
            project.mkdir(parents=True)
            expected = workspace / "Terraform-Repo-Oracle" / "peak-gear-livestack"
            expected.mkdir(parents=True)
            context = PIPELINE.PipelineContext.__new__(PIPELINE.PipelineContext)
            context.project_root = project

            self.assertEqual(context.resolve_terraform_root(""), expected.resolve())


if __name__ == "__main__":
    unittest.main()
