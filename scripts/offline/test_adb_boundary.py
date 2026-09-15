"""Reject unsafe emulator selectors and SDK executables before spawning a process."""
import importlib.util
from pathlib import Path
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[2]
SPEC = importlib.util.spec_from_file_location("scale_process", ROOT / "apps/android/verify-scale-process.py")
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class AdbBoundaryTests(unittest.TestCase):
    def test_invalid_selector_and_relative_sdk(self):
        for serial in ("device123", "-e", "emulator-5554;id", "emulator-5554\n", "emulator-5554 extra"):
            with self.subTest(serial=serial), self.assertRaises(ValueError):
                MODULE.adb_command("/nonexistent", serial)
        with self.assertRaises(ValueError):
            MODULE.adb_command("relative/sdk", "emulator-5554")

    def test_sdk_permissions_metadata_and_symlink_escape(self):
        with tempfile.TemporaryDirectory() as directory:
            sdk = Path(directory).resolve()
            platform = sdk / "platform-tools"
            platform.mkdir(mode=0o755)
            binary = platform / "adb"
            binary.write_text("fixture only; never executed")
            binary.chmod(0o755)
            metadata = platform / "source.properties"
            metadata.write_text("Pkg.Revision=37.0.1\n")
            self.assertEqual(MODULE.adb_command(str(sdk), "emulator-5554"), [str(binary), "-s", "emulator-5554"])
            binary.chmod(0o777)
            with self.assertRaises(ValueError):
                MODULE.adb_command(str(sdk), "emulator-5554")
            binary.chmod(0o755)
            metadata.write_text("not installed SDK metadata")
            with self.assertRaises(ValueError):
                MODULE.adb_command(str(sdk), "emulator-5554")
            binary.unlink()
            other = sdk / "outside-adb"
            other.write_text("fixture only")
            other.chmod(0o755)
            binary.symlink_to(other)
            with self.assertRaises(ValueError):
                MODULE.adb_command(str(sdk), "emulator-5554")


if __name__ == "__main__":
    unittest.main()
