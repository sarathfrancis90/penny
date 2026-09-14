#!/usr/bin/env python3
"""Boundary checks that must reject before a simulator or output mutation."""
import hashlib
import importlib.util
import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("frame_runner", HERE / "run.py")
runner = importlib.util.module_from_spec(spec)
spec.loader.exec_module(runner)


class RunnerBoundaries(unittest.TestCase):
    def test_extra_header_rejected_before_process_or_output(self):
        with tempfile.TemporaryDirectory(dir=HERE / ".build") as temporary:
            root = Path(temporary)
            build = root / "build"; install = build / "ios-simulator-arm64/install"
            (install / "include").mkdir(parents=True)
            header = install / "include/sodium.h"; header.write_text("verified header")
            # This header could shadow a system include even though sodium.h is unchanged.
            (install / "include/stdint.h").write_text("unrecorded compiler input")
            pin = json.loads((runner.REPO / "packages/offline-crypto/source-manifest.json").read_text())
            report = {"status": "passed", "deploymentTarget": "26.0", "sourceVerification": {
                "version": pin["version"], "archiveSha256": pin["archive"]["sha256"], "sourceTreeSha256": pin["sourceTree"]["sha256"]},
                "slices": [{"name": "ios-simulator-arm64", "artifacts": {"install/include/sodium.h": hashlib.sha256(header.read_bytes()).hexdigest()}}]}
            (build / "build-report.json").write_text(json.dumps(report))
            output = root / "output"
            with patch.object(runner, "run", side_effect=AssertionError("process must not run")):
                with self.assertRaisesRegex(ValueError, "header inventory mismatch"):
                    runner.verify_header_inventory(install.parent, report["slices"][0]["artifacts"])
            self.assertFalse(output.exists())

    def test_header_file_and_directory_symlinks_rejected(self):
        with tempfile.TemporaryDirectory(dir=HERE / ".build") as temporary:
            root = Path(temporary); include = root / "install/include"; include.mkdir(parents=True)
            target = root / "outside"; target.mkdir(); (target / "sodium.h").write_text("test")
            link = include / "sodium.h"; link.symlink_to(target / "sodium.h")
            with self.assertRaisesRegex(ValueError, "symlink"):
                runner.verify_header_inventory(root, {"install/include/sodium.h": "unused"})
            link.unlink(); link = include / "sodium"; link.symlink_to(target, target_is_directory=True)
            with self.assertRaisesRegex(ValueError, "symlink"):
                runner.verify_header_inventory(root, {"install/include/sodium/sodium.h": "unused"})

    def test_shell_text_cannot_execute_or_create_output(self):
        with tempfile.TemporaryDirectory(dir=HERE / ".build") as temporary:
            marker = Path(temporary) / "marker"
            unsafe = Path(temporary) / ("output;touch " + str(marker).replace("/", "_"))
            with patch.object(runner, "run", side_effect=AssertionError("process must not run")):
                with self.assertRaises(ValueError):
                    runner.safe_path(unsafe)
            self.assertFalse(marker.exists()); self.assertFalse(unsafe.exists())

    def test_symlink_to_unsupported_path_rejected(self):
        with tempfile.TemporaryDirectory(dir=HERE / ".build") as temporary:
            target = Path(temporary) / "has spaces"; target.mkdir()
            link = Path(temporary) / "link"; link.symlink_to(target)
            with self.assertRaises(ValueError):
                runner.safe_path(link)

    def test_reserved_simulator_rejected_before_io(self):
        output = HERE / ".build" / "must-not-exist-runner-test"
        self.assertFalse(output.exists())
        args = ["run.py", "--apple-build", "/nonexistent", "--negative-fixtures", "/nonexistent",
                "--output", str(output), "--simulator", "730A6A04-3E7B-4B48-928C-7FE76873010F"]
        with patch.object(sys, "argv", args), patch.object(runner, "run", side_effect=AssertionError("process must not run")):
            with self.assertRaisesRegex(ValueError, "reserved simulator"):
                runner.main()
        self.assertFalse(output.exists())


if __name__ == "__main__":
    (HERE / ".build").mkdir(exist_ok=True)
    unittest.main()
