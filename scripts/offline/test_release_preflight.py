"""Reject plausible but unsafe signed-artifact metadata; no signing credentials required."""
from copy import deepcopy
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
import importlib.util
import hashlib
from pathlib import Path
import unittest
import tempfile
from types import SimpleNamespace
import zipfile
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("release_preflight", Path(__file__).with_name("release-preflight.py"))
preflight = importlib.util.module_from_spec(spec)
spec.loader.exec_module(preflight)
NOW = datetime(2026, 9, 13, tzinfo=timezone.utc)
TEAM = "TESTTEAM01"
CONTAINER = "iCloud.test.penny"
CERT = "a1" * 32
CLIENT = "12345-test.apps.googleusercontent.com"


def ios():
    entitlements = {
        "application-identifier": "LEGACYPREF.com.penny.pennyMobile",
        "com.apple.developer.team-identifier": TEAM, "get-task-allow": False,
        "com.apple.developer.icloud-services": ["CloudKit"],
        "com.apple.developer.icloud-container-identifiers": [CONTAINER],
        "com.apple.developer.icloud-container-environment": "Production",
    }
    return {
        "bundle": "com.penny.pennyMobile", "version": "3.0.0", "build": "10015",
        "signatureVerified": True, "distributionSigner": True,
        "platforms": ["iPhoneOS"], "platformName": "iphoneos", "entitlements": entitlements,
        "profile": {"Entitlements": deepcopy(entitlements), "TeamIdentifier": [TEAM],
                    "ApplicationIdentifierPrefix": ["LEGACYPREF"], "ExpirationDate": NOW + timedelta(days=30),
                    "DeveloperCertificates": [b"synthetic-test-certificate"]},
        "signingCertificateSha256": hashlib.sha256(b"synthetic-test-certificate").hexdigest(),
        "cloudContainer": CONTAINER, "cloudSignedMarker": True,
        "iconName": "AppIcon", "assetCatalogPresent": True,
        "privacy": {"NSPrivacyTracking": False, "NSPrivacyTrackingDomains": [],
                    "NSPrivacyCollectedDataTypes": [], "NSPrivacyAccessedAPITypes": []},
        "legacyRuntime": False,
    }


def android():
    return {
        "bundle": "com.penny.penny_mobile", "version": "3.0.0", "build": "10015",
        "signatureVerified": True, "signers": [CERT], "debuggable": False, "testOnly": False,
        "allowBackup": "false", "cleartext": "false", "minSdk": 26, "targetSdk": 37,
        "permissions": ["android.permission.CAMERA", "android.permission.INTERNET"],
        "icon": "@mipmap/ic_launcher", "networkSecurityConfig": "@xml/network_security_config",
        "driveClientId": CLIENT, "driveSigningSha256": CERT,
    }


class ReleasePreflightTests(unittest.TestCase):
    def check_ios(self, value):
        return preflight.validate_ios(value, TEAM, CONTAINER, "3.0.0", 10014, NOW)

    def check_android(self, value):
        return preflight.validate_android(value, CERT, CLIENT, "3.0.0", 10014)

    def test_exact_aab_routes_verified_snapshot_manifest_and_preserves_signature_failure(self):
        closed = []
        observed = []
        xml = '<manifest xmlns:android="http://schemas.android.com/apk/res/android" package="com.penny.penny_mobile" android:versionName="3.0.0" android:versionCode="10015"><uses-sdk android:minSdkVersion="26" android:targetSdkVersion="37"/><application android:allowBackup="false" android:usesCleartextTraffic="false"/></manifest>'
        @contextmanager
        def inspect(path, **kwargs):
            observed.append((path, kwargs))
            try:
                yield SimpleNamespace(manifest_xml=xml, signature_verified=False, signer_sha256=CERT,
                                      sha256="d" * 64, entries=7, uncompressed_bytes=100,
                                      signed_content_entries=4, bundletool_sha256="e" * 64,
                                      bundletool_version="1.18.3")
            finally:
                closed.append(True)
        helper = SimpleNamespace(inspect_aab=inspect)
        spec = SimpleNamespace(name="test_helper", loader=SimpleNamespace(exec_module=lambda _: None))
        try:
            with patch.object(preflight.importlib.util, "spec_from_file_location", return_value=spec), \
                 patch.object(preflight.importlib.util, "module_from_spec", return_value=helper), \
                 patch.object(preflight, "android_evidence") as apk:
                result = preflight.android_bundle_evidence(Path("upload.aab"), ":".join(["A1"] * 32), "/trusted/java", "/trusted/bundletool.jar")
            apk.assert_not_called()
            self.assertEqual(closed, [True])
            self.assertEqual(observed[0][1]["expected_signer_sha256"], CERT)
            self.assertEqual(observed[0][1]["bundletool"], "/trusted/bundletool.jar")
            self.assertEqual(result["containerType"], "aab")
            self.assertEqual(result["artifactSha256"], "d" * 64)
            self.assertEqual(result["bundle"], "com.penny.penny_mobile")
            self.assertEqual(result["build"], "10015")
            self.assertIs(result["signatureVerified"], False)
            self.assertIn("Artifact signature verification failed", self.check_android(result))
        finally:
            preflight.sys.modules.pop("test_helper", None)

    def test_aab_inspection_failure_cannot_fall_back_to_sibling_apk(self):
        helper = SimpleNamespace(inspect_aab=lambda *a, **k: (_ for _ in ()).throw(ValueError("unsigned entry")))
        spec = SimpleNamespace(name="test_helper", loader=SimpleNamespace(exec_module=lambda _: None))
        try:
            with patch.object(preflight.importlib.util, "spec_from_file_location", return_value=spec), \
                 patch.object(preflight.importlib.util, "module_from_spec", return_value=helper), \
                 patch.object(preflight, "android_evidence") as apk, self.assertRaisesRegex(ValueError, "unsigned entry"):
                preflight.android_bundle_evidence(Path("upload.aab"), CERT, "/trusted/java", "/trusted/bundletool.jar")
            apk.assert_not_called()
        finally:
            preflight.sys.modules.pop("test_helper", None)

    def test_exported_ipa_routes_frozen_payload_and_preserves_signature_failure(self):
        with tempfile.TemporaryDirectory() as directory:
            ipa = Path(directory) / "Exported.ipa"
            with zipfile.ZipFile(ipa, "w", zipfile.ZIP_DEFLATED) as archive:
                archive.writestr("Payload/Exported.app/Info.plist", b"synthetic payload")
                archive.writestr("Payload/Exported.app/Executable", b"exported executable")
            original_digest = hashlib.sha256(ipa.read_bytes()).hexdigest()
            observed_paths = []
            def inspect(app, team):
                self.assertEqual(team, TEAM)
                observed_paths.append(app)
                self.assertEqual((app / "Executable").read_bytes(), b"exported executable")
                # Replacing the external input cannot replace this inspected payload.
                ipa.write_bytes(b"changed after private acquisition")
                return {"signatureVerified": False, "executableSha256": "a" * 64}
            with patch.object(preflight, "ios_evidence", side_effect=inspect):
                result = preflight.ios_export_evidence(ipa, TEAM)
            self.assertFalse(result["signatureVerified"])
            self.assertEqual(result["artifactSha256"], original_digest)
            self.assertEqual(result["containerType"], "ipa")
            self.assertEqual(result["archiveEntries"], 2)
            self.assertTrue(observed_paths)
            self.assertFalse(observed_paths[0].exists())

    def test_malformed_export_never_reaches_signed_app_inspector(self):
        with tempfile.TemporaryDirectory() as directory:
            ipa = Path(directory) / "Bad.ipa"
            with zipfile.ZipFile(ipa, "w") as archive:
                archive.writestr("Payload/../escaped", b"unsafe")
            with patch.object(preflight, "ios_evidence") as inspect, self.assertRaises(ValueError):
                preflight.ios_export_evidence(ipa, TEAM)
            inspect.assert_not_called()

    def test_valid_metadata_allows_legacy_app_id_prefix(self):
        self.assertEqual(self.check_ios(ios()), [])
        self.assertEqual(self.check_android(android()), [])

    def test_play_upload_and_installed_drive_certificates_are_distinct(self):
        candidate = android()
        installed = "b2" * 32
        candidate["driveSigningSha256"] = installed
        self.assertEqual(preflight.validate_android(candidate, CERT, CLIENT, "3.0.0", 10014, installed), [])
        self.assertTrue(preflight.validate_android(candidate, CERT, CLIENT, "3.0.0", 10014, CERT))
        self.assertTrue(preflight.validate_android(candidate, installed, CLIENT, "3.0.0", 10014, installed))

    def test_development_and_stale_builds_are_rejected(self):
        for factory, check in ((ios, self.check_ios), (android, self.check_android)):
            for field, values in {"bundle": ["ca.penny.offline.dev"], "version": ["0.1.0-dev"],
                                  "build": ["10014", "1", "10015.1", "01", ""], "signatureVerified": [False]}.items():
                for value in values:
                    with self.subTest(field=field, value=value):
                        candidate = factory()
                        candidate[field] = value
                        self.assertTrue(check(candidate))

    def test_ios_configuration_cannot_replace_signed_entitlements(self):
        for key in ("com.apple.developer.icloud-services", "com.apple.developer.icloud-container-identifiers"):
            for where in ("app", "profile"):
                candidate = ios()
                target = candidate["entitlements"] if where == "app" else candidate["profile"]["Entitlements"]
                target[key] = []
                self.assertTrue(self.check_ios(candidate))

    def test_ios_cloud_environment_and_markers_must_match(self):
        candidate = ios()
        candidate["entitlements"]["com.apple.developer.icloud-container-environment"] = "Development"
        self.assertTrue(self.check_ios(candidate))
        for key, value in (("cloudSignedMarker", "true"), ("cloudContainer", "iCloud.wrong")):
            candidate = ios()
            candidate[key] = value
            self.assertTrue(self.check_ios(candidate))
        candidate = ios()
        candidate["profile"]["Entitlements"]["com.apple.developer.icloud-container-environment"] = "Development"
        self.assertTrue(self.check_ios(candidate))
        candidate["profile"]["Entitlements"]["com.apple.developer.icloud-container-environment"] = ["Development", "Production"]
        self.assertEqual(self.check_ios(candidate), [])

    def test_ios_actual_leaf_must_be_authorized_by_profile(self):
        for certificates in ([], [b"wrong-certificate"], ["not-DER-bytes"], None):
            candidate = ios()
            candidate["profile"]["DeveloperCertificates"] = certificates
            self.assertTrue(self.check_ios(candidate))
        candidate = ios()
        candidate["signingCertificateSha256"] = None
        self.assertTrue(self.check_ios(candidate))

    def test_ios_team_profile_and_identity_must_match(self):
        for key, value in (("TeamIdentifier", ["WRONGTEAM1"]), ("ApplicationIdentifierPrefix", []),
                           ("ExpirationDate", NOW), ("ProvisionedDevices", []), ("ProvisionsAllDevices", True)):
            candidate = ios()
            candidate["profile"][key] = value
            self.assertTrue(self.check_ios(candidate))
        candidate = ios()
        candidate["profile"]["Entitlements"]["application-identifier"] = "LEGACYPREF.*"
        self.assertTrue(self.check_ios(candidate))

    def test_ios_simulator_developer_signing_and_debugger_rejected(self):
        for key, value in (("platforms", ["iPhoneSimulator"]), ("platformName", "iphonesimulator"),
                           ("distributionSigner", False), ("legacyRuntime", True)):
            candidate = ios()
            candidate[key] = value
            self.assertTrue(self.check_ios(candidate))
        for where in ("app", "profile"):
            candidate = ios()
            target = candidate["entitlements"] if where == "app" else candidate["profile"]["Entitlements"]
            target["get-task-allow"] = True
            self.assertTrue(self.check_ios(candidate))

    def test_ios_packaged_privacy_and_icon_required(self):
        for key, value in (("iconName", None), ("assetCatalogPresent", False), ("privacy", None),
                           ("privacy", {"NSPrivacyTracking": True}),
                           ("privacy", {"NSPrivacyTracking": False})):
            candidate = ios()
            candidate[key] = value
            self.assertTrue(self.check_ios(candidate))

    def test_android_certificate_is_not_inferred_from_artifact(self):
        for signers in ([], ["b2" * 32], [CERT, "b2" * 32]):
            candidate = android()
            candidate["signers"] = signers
            self.assertTrue(self.check_android(candidate))
        self.assertEqual(preflight.validate_android(android(), ":".join(["A1"] * 32), CLIENT, "3.0.0", 10014), [])

    def test_android_configuration_must_match_registered_signer(self):
        for key, value in (("driveClientId", ""), ("driveClientId", "12345-wrong.apps.googleusercontent.com"),
                           ("driveSigningSha256", ""), ("driveSigningSha256", "b2" * 32)):
            candidate = android()
            candidate[key] = value
            self.assertTrue(self.check_android(candidate))

    def test_android_backup_debug_cleartext_and_ad_id_are_rejected(self):
        for key, value in (("allowBackup", None), ("allowBackup", "true"), ("cleartext", None),
                           ("cleartext", "true"), ("debuggable", True), ("testOnly", True),
                           ("minSdk", 25), ("targetSdk", 36), ("icon", None), ("networkSecurityConfig", None)):
            candidate = android()
            candidate[key] = value
            self.assertTrue(self.check_android(candidate))
        candidate = android()
        candidate["permissions"].append("com.google.android.gms.permission.AD_ID")
        self.assertTrue(self.check_android(candidate))

    def test_android_manifest_parser_rejects_unresolved_debug_boolean_resources(self):
        for attributes, expected in (("", False), ('android:debuggable="false" android:testOnly="false"', False),
                                     ('android:debuggable="true" android:testOnly="true"', True),
                                     ('android:debuggable="@ref/0x7f010000" android:testOnly="@ref/0x7f010000"', True)):
            xml = f'<manifest xmlns:android="http://schemas.android.com/apk/res/android"><uses-sdk android:minSdkVersion="26" android:targetSdkVersion="36"/><application {attributes}/></manifest>'
            parsed = preflight.android_manifest_evidence(xml)
            self.assertEqual(parsed["debuggable"], expected)
            self.assertEqual(parsed["testOnly"], expected)


if __name__ == "__main__":
    unittest.main()
