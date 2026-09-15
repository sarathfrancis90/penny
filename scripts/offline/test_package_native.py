"""Packaging prerequisites must fail before a build or signing operation starts."""
import importlib.util
import os
from pathlib import Path
import sys
import subprocess
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

    def test_packaging_binds_exported_object_and_rejects_archive_or_changed_bytes(self):
        import hashlib
        with tempfile.TemporaryDirectory() as directory:
            ipa = Path(directory) / "Exported.ipa"
            ipa.write_bytes(b"synthetic exported object, not a signed IPA")
            digest = hashlib.sha256(ipa.read_bytes()).hexdigest()
            report = {"artifactSha256": digest, "containerType": "ipa"}
            self.assertEqual(packaging.verify_upload_object_binding(report, [ipa], "ios"), digest)
            with self.assertRaises(ValueError):
                packaging.verify_upload_object_binding({"artifactSha256": digest}, [ipa], "ios")
            with self.assertRaises(ValueError):
                packaging.verify_upload_object_binding(report, [], "ios")
            ipa.write_bytes(b"different exported object after preflight")
            with self.assertRaises(ValueError):
                packaging.verify_upload_object_binding(report, [ipa], "ios")
            apk = Path(directory) / "Upload.apk"
            apk.write_bytes(b"synthetic APK, not a signing proof")
            apk_report = {"artifactSha256": hashlib.sha256(apk.read_bytes()).hexdigest(), "containerType": "apk"}
            self.assertEqual(packaging.verify_product_binding(apk_report, apk, "apk"), apk_report["artifactSha256"])
            with self.assertRaises(ValueError):
                packaging.verify_upload_object_binding(apk_report, [apk], "android")
            with self.assertRaises(ValueError):
                packaging.verify_upload_object_binding(apk_report, [apk], "ios")
            aab = Path(directory) / "Upload.aab"
            aab.write_bytes(b"synthetic AAB, not a signing proof")
            aab_report = {"artifactSha256": hashlib.sha256(aab.read_bytes()).hexdigest(), "containerType": "aab"}
            self.assertEqual(packaging.verify_upload_object_binding(aab_report, [aab, apk], "android"), aab_report["artifactSha256"])
            with self.assertRaises(ValueError):
                packaging.verify_upload_object_binding({**aab_report, "containerType": "apk"}, [aab], "android")
            aab.write_bytes(b"substituted sibling bundle")
            with self.assertRaises(ValueError):
                packaging.verify_upload_object_binding(aab_report, [aab, apk], "android")

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
            bundletool = Path(directory) / "bundletool.jar"
            bundletool.write_bytes(b"synthetic tool path; not executed")
            config = {"version": "3.0.0", "build": 10015, "driveClientId": "123-test.apps.googleusercontent.com",
                      "uploadCertificateSha256": "ab" * 32, "driveSigningSha256": "cd" * 32,
                      "apksigner": sys.executable, "apkanalyzer": sys.executable,
                      "java": sys.executable, "bundletool": str(bundletool)}
            environment = {"PENNY_ANDROID_KEYSTORE": str(key), "PENNY_ANDROID_KEY_ALIAS": "test",
                           "PENNY_ANDROID_STORE_PASSWORD": "test", "PENNY_ANDROID_KEY_PASSWORD": "test"}
            with patch.dict(os.environ, environment, clear=True):
                self.assertEqual(packaging.configuration(config, "android", 10014), config)
                for changes in ({"java": "java"}, {"bundletool": "bundletool.jar"},
                                {"bundletool": str(Path(directory) / "absent.jar")}):
                    with self.assertRaises(ValueError):
                        packaging.configuration({**config, **changes}, "android", 10014)
            for missing in environment:
                with patch.dict(os.environ, {k: v for k, v in environment.items() if k != missing}, clear=True):
                    with self.assertRaises(ValueError):
                        packaging.configuration(config, "android", 10014)
            key.unlink()
            with patch.dict(os.environ, environment, clear=True), self.assertRaises(ValueError):
                packaging.configuration(config, "android", 10014)

    def test_android_selects_actual_bundle_and_retains_separate_apk(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            apk = root / "apps/android/app/build/outputs/apk/release/app.apk"
            aab = root / "apps/android/app/build/outputs/bundle/release/app.aab"
            for path, data in ((apk, b"apk bytes"), (aab, b"different bundle bytes")):
                path.parent.mkdir(parents=True)
                path.write_bytes(data)
            output = root / "output"
            output.mkdir()
            config = {"version": "3.0.0", "build": 10015, "driveClientId": "123-test.apps.googleusercontent.com",
                      "uploadCertificateSha256": "ab" * 32, "driveSigningSha256": "cd" * 32,
                      "apksigner": "/trusted/apksigner", "apkanalyzer": "/trusted/apkanalyzer",
                      "java": "/trusted/java", "bundletool": "/trusted/bundletool.jar"}
            with patch.dict(os.environ, {"ANDROID_HOME": "/trusted/sdk"}), patch.object(packaging, "run") as run:
                products, args = packaging.android_build(config, output, output / "build.log", root)
            self.assertEqual([p.suffix for p in products], [".aab", ".apk"])
            self.assertEqual([p.read_bytes() for p in products], [aab.read_bytes(), apk.read_bytes()])
            self.assertEqual(args[:2], ["android", str(products[0])])
            self.assertIn(config["bundletool"], args)
            self.assertIn(config["java"], args)
            self.assertIn("assembleRelease", run.call_args.args[0])
            self.assertIn("bundleRelease", run.call_args.args[0])
            self.assertIn(f"-PpennySodiumOutput={output / 'crypto/native'}", run.call_args.args[0])

    def test_isolated_snapshot_includes_shared_crypto_and_failed_preparation_stops_build(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            subprocess.run(["git", "init", "-q", str(root)], check=True)
            names = ["apps/ios/PennyOffline/Expense.swift", "packages/offline-crypto/apple/module/Reader.swift",
                     "packages/offline-crypto/source-manifest.json", "packages/offline-crypto/LICENSE.libsodium",
                     "scripts/offline/prepare-app-crypto.py"]
            for name in names:
                path = root / name
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_text("public synthetic source")
            (root / ".gitignore").write_text(".build/\n")
            ignored = root / "packages/offline-crypto/.build"
            ignored.mkdir()
            (ignored / "not-source.a").write_bytes(b"generated")
            with patch.object(packaging, "ROOT", root):
                self.assertEqual(set(packaging.sources()), set(names))
            output = root / "output"
            output.mkdir()
            with patch.object(packaging, "run", side_effect=ValueError("unverified dependency")) as run, self.assertRaisesRegex(ValueError, "unverified dependency"):
                packaging.ios_build({}, output, output / "build.log", root)
            self.assertEqual(run.call_count, 1)
            self.assertIn("prepare-app-crypto.py", run.call_args.args[0][1])
            self.assertEqual(list(output.iterdir()), [])

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
                artifacts, preflight = packaging.ios_build(config, output, output / "build.log")
            self.assertEqual(len(artifacts), 1)
            self.assertEqual(preflight[:2], ["ios", str(output / "export/PennyOffline.ipa")])
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
