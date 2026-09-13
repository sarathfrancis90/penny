import importlib.util
from pathlib import Path
import tempfile
import unittest

spec = importlib.util.spec_from_file_location("avd_metadata", Path(__file__).with_name("check-avd-metadata.py"))
avd = importlib.util.module_from_spec(spec)
spec.loader.exec_module(avd)


class AvdMetadataTests(unittest.TestCase):
    def fixture(self, root, api, target):
        avds, sdk = root / "avds", root / "sdk"
        config = avds / "test.avd"
        image = sdk / "system-images/test-image"
        config.mkdir(parents=True)
        image.mkdir(parents=True)
        (avds / "test.ini").write_text(f"path={config}\ntarget={target}\n")
        (config / "config.ini").write_text("image.sysdir.1=system-images/test-image/\n")
        (image / "source.properties").write_text(f"AndroidVersion.ApiLevel={api}\n")
        return avds, sdk

    def test_repairs_zero_only_after_verifying_installed_37_image(self):
        with tempfile.TemporaryDirectory() as directory:
            avds, sdk = self.fixture(Path(directory), "37.0", "android-0")
            self.assertTrue(avd.check(avds, sdk, "test", 37)["repairedAndroidZero"])
            self.assertIn("target=android-37\n", (avds / "test.ini").read_text())
            self.assertFalse(avd.check(avds, sdk, "test", 37)["repairedAndroidZero"])

    def test_wrong_image_or_unrelated_target_is_not_rewritten(self):
        for api, target, expected in (("36", "android-0", 37), ("37.0", "android-26", 37), ("26", "android-0", 26)):
            with tempfile.TemporaryDirectory() as directory:
                avds, sdk = self.fixture(Path(directory), api, target)
                original = (avds / "test.ini").read_bytes()
                with self.assertRaises(ValueError):
                    avd.check(avds, sdk, "test", expected)
                self.assertEqual((avds / "test.ini").read_bytes(), original)


if __name__ == "__main__":
    unittest.main()
