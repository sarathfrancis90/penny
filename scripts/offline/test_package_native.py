"""Packaging prerequisites must fail before a build or signing operation starts."""
import importlib.util
import os
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("package_native", Path(__file__).with_name("package-native.py"))
packaging = importlib.util.module_from_spec(spec)
spec.loader.exec_module(packaging)


class PackagingTests(unittest.TestCase):
    def test_packaging_rejects_a_different_newer_artifact_build(self):
        config = {"version": "3.0.0", "build": 10015}
        valid = {"platform": "android", "version": "3.0.0", "build": "10015", "passed": True}
        self.assertEqual(packaging.verified_metadata(valid, "android", config), valid)
        for changes in ({"build": "10016"}, {"build": None}, {"version": "3.0.1"}, {"platform": "ios"}, {"passed": False}):
            with self.assertRaises(ValueError):
                packaging.verified_metadata({**valid, **changes}, "android", config)

    def test_ios_rejects_unbounded_or_injected_release_metadata(self):
        config = {"version": "3.0.0", "build": 10015, "teamId": "TESTTEAM01", "container": "iCloud.test.penny",
                  "profileUUID": "00000000-0000-4000-8000-000000000001", "signingIdentity": "ab" * 20}
        self.assertEqual(packaging.configuration(config, "ios", 10014), config)
        for key, values in {"version": ["2.3.5", "3.0.0\nignored"], "build": [10014, True, 2_100_000_001],
                            "teamId": ['TESTTEAM01"'], "container": ["x"], "profileUUID": ["profile name"],
                            "signingIdentity": ["Apple Distribution"]}.items():
            for value in values:
                with self.subTest(key=key, value=value), self.assertRaises(ValueError):
                    packaging.configuration({**config, key: value}, "ios", 10014)
        with self.assertRaises(ValueError):
            packaging.configuration({**config, "password": "never accept passwords in JSON"}, "ios", 10014)

    def test_android_requires_complete_environment_and_real_keystore_path(self):
        with tempfile.TemporaryDirectory() as directory:
            key = Path(directory) / "test-store"
            key.write_bytes(b"synthetic, not a signing key")
            config = {"version": "3.0.0", "build": 10015, "driveClientId": "123-test.apps.googleusercontent.com",
                      "uploadCertificateSha256": "ab" * 32, "driveSigningSha256": "cd" * 32,
                      "apksigner": sys.executable, "apkanalyzer": sys.executable}
            environment = {"PENNY_ANDROID_KEYSTORE": str(key), "PENNY_ANDROID_KEY_ALIAS": "test",
                           "PENNY_ANDROID_STORE_PASSWORD": "test", "PENNY_ANDROID_KEY_PASSWORD": "test"}
            with patch.dict(os.environ, environment, clear=True):
                self.assertEqual(packaging.configuration(config, "android", 10014), config)
            for missing in environment:
                with patch.dict(os.environ, {k: v for k, v in environment.items() if k != missing}, clear=True):
                    with self.assertRaises(ValueError):
                        packaging.configuration(config, "android", 10014)
            key.unlink()
            with patch.dict(os.environ, environment, clear=True), self.assertRaises(ValueError):
                packaging.configuration(config, "android", 10014)

    def test_ios_profile_only_exports_and_does_not_mutate_source_plist(self):
        import plistlib
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = root / "apps/ios/PennyOffline/Info.plist"
            source.parent.mkdir(parents=True)
            source.write_bytes(plistlib.dumps({"CFBundleVersion": "1"}))
            original = source.read_bytes()
            output = root / "output"
            (output / "export").mkdir(parents=True)
            (output / "export/PennyOffline.ipa").write_bytes(b"synthetic build result")
            config = {"version": "3.0.0", "build": 10015, "teamId": "TESTTEAM01", "container": "iCloud.test.penny",
                      "profileUUID": "00000000-0000-4000-8000-000000000001", "signingIdentity": "ab" * 20}
            with patch.object(packaging, "ROOT", root), patch.object(packaging, "run") as run:
                artifacts, _ = packaging.ios_build(config, output, output / "build.log")
            self.assertEqual(len(artifacts), 1)
            self.assertEqual(source.read_bytes(), original)
            options = plistlib.loads((output / "ExportOptions.plist").read_bytes())
            self.assertEqual(options["destination"], "export")
            self.assertFalse(options["manageAppVersionAndBuildNumber"])
            info = plistlib.loads((output / "Info.plist").read_bytes())
            self.assertIs(info["PennyCloudKitSignedBuild"], True)
            self.assertEqual(info["CFBundleVersion"], "10015")
            for call in run.call_args_list:
                self.assertNotIn("-allowProvisioningUpdates", call.args[0])
                self.assertNotIn("DEBUG", " ".join(call.args[0]))


if __name__ == "__main__":
    unittest.main()
