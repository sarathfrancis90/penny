"""Exact-container/JDK tests. Optional real bundletool smoke uses a public test app.

PENNY_TEST_JAVA points to JDK17+ java; PENNY_TEST_BUNDLETOOL to a trusted standalone
JAR. Missing tools are explicit skips, never evidence of AAB acceptance.
"""
import hashlib
import importlib.util
import os
from pathlib import Path
import shutil
import stat
import re
import struct
import subprocess
import tempfile
import unittest
from unittest.mock import patch
import warnings
import zipfile

spec = importlib.util.spec_from_file_location("aab_artifact", Path(__file__).with_name("aab-artifact.py"))
aab = importlib.util.module_from_spec(spec)
spec.loader.exec_module(aab)


def archive(path, extra=()):
    with warnings.catch_warnings(), zipfile.ZipFile(path, "w", zipfile.ZIP_DEFLATED) as bundle:
        warnings.simplefilter("ignore", UserWarning)
        for name, data in [("BundleConfig.pb", b"config"), ("base/manifest/AndroidManifest.xml", b"proto"),
                           ("META-INF/MANIFEST.MF", b"Manifest-Version: 1.0\r\n\r\n"), *extra]:
            bundle.writestr(name, data)


class ContainerTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.file = self.root / "app.aab"
        self.tool = self.root / "tool.jar"
        self.tool.write_bytes(b"fake tool (mocked execution only)")
        self.java = Path(shutil.which("true"))
        self.private = self.root / "private"
        self.private.mkdir(mode=0o700)
        archive(self.file)

    def inspect(self, **changes):
        return aab.inspect_aab(self.file, expected_signer_sha256="ab" * 32, java=self.java,
                               bundletool=self.tool, temporary_parent=self.private, **changes)

    def test_inventory_rejects_modules_paths_collisions_duplicates_and_symlinks(self):
        for names in (["feature/manifest/AndroidManifest.xml"], ["../escape"], ["/escape"], ["base/./file"],
                      ["base\\file"], ["base/X/a", "base/x/b"], ["base/caf\u00e9/a", "base/cafe\u0301/b"],
                      ["base/f", "base/f/x"], ["base/f", "base/f"], ["BundleConfig.pb/child"]):
            archive(self.file, [(name, b"x") for name in names])
            with self.assertRaises(ValueError):
                aab._inventory(self.file, self.file.stat().st_size, aab.AabLimits())
        link = zipfile.ZipInfo("base/link"); link.create_system = 3
        link.external_attr = (stat.S_IFLNK | 0o777) << 16
        archive(self.file, [(link, b"../../escape")])
        with self.assertRaises(ValueError):
            aab._inventory(self.file, self.file.stat().st_size, aab.AabLimits())

    def test_limits_local_mismatch_crc_and_truncation(self):
        original = self.file.read_bytes()
        for changes in ({"entries": 1}, {"single_file_bytes": 2}, {"uncompressed_bytes": 3},
                        {"central_directory_bytes": 1}, {"path_depth": 1}, {"path_bytes": 1}):
            with self.assertRaises(ValueError):
                aab._inventory(self.file, len(original), aab.AabLimits()._replace(**changes))
        corrupt = bytearray(original); corrupt[14] ^= 1
        for data in (bytes(corrupt), original[:-1], original + b"extra"):
            self.file.write_bytes(data)
            with self.assertRaises(ValueError):
                aab._inventory(self.file, len(data), aab.AabLimits())

    def test_frozen_wrapper_tool_failure_cleanup_and_sanitized_result(self):
        original = self.file.read_bytes()
        def verify(snapshot, expected, java, root, limits, entries, total):
            self.assertEqual(snapshot.read_bytes(), original)
            self.file.write_bytes(b"changed after acquisition")
            return 2
        with patch.object(aab, "verify_jar", side_effect=verify), patch.object(aab, "_run", side_effect=[b"1.18.3\n", b"", b'<manifest package="test.synthetic"/>']):
            with self.inspect() as result:
                self.assertEqual(result.sha256, hashlib.sha256(original).hexdigest())
                self.assertTrue(result.signature_verified)
                self.assertEqual(result.snapshot.read_bytes(), original)
                with self.assertRaises(AttributeError): result.sha256 = "other"
                saved = result.snapshot
        self.assertFalse(saved.exists()); self.assertEqual(list(self.private.iterdir()), [])
        archive(self.file)
        with patch.object(aab, "verify_jar", side_effect=ValueError("signature failure")), self.assertRaises(ValueError):
            with self.inspect(): pass
        self.assertEqual(list(self.private.iterdir()), [])
        for response in (b"not xml", b'<!DOCTYPE manifest><manifest/>'):
            with patch.object(aab, "verify_jar", return_value=2), patch.object(aab, "_run", side_effect=[b"1.18.3", b"", response]), self.assertRaises(ValueError):
                with self.inspect(): pass
        self.assertEqual(list(self.private.iterdir()), [])

    def test_source_links_mutation_and_invalid_identity_fail_before_tools(self):
        self.file.unlink(); self.file.symlink_to(self.tool)
        with self.assertRaises(OSError):
            with self.inspect(): pass
        self.file.unlink(); archive(self.file)
        read = os.read; changed = False
        def mutation(fd, count):
            nonlocal changed
            data = read(fd, count)
            if not changed:
                changed = True
                with self.file.open("ab") as output: output.write(b"mutation")
            return data
        with patch.object(aab.os, "read", side_effect=mutation), self.assertRaises(ValueError):
            with self.inspect(): pass
        self.assertEqual(list(self.private.iterdir()), [])

    def test_tool_output_and_timeout_are_bounded(self):
        import sys
        for program, kwargs in [("print('x'*10000)", {"output_limit": 100}), ("import time; time.sleep(10)", {"timeout": 0.05})]:
            with self.assertRaises(ValueError):
                aab._run([sys.executable, "-c", program], self.root, **kwargs)


class ActualJdkTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        java = os.environ.get("PENNY_TEST_JAVA") or shutil.which("java")
        if not java: raise unittest.SkipTest("Actual JDK17+ unavailable")
        cls.java = Path(java).resolve()
        version = subprocess.run([str(cls.java), "-version"], capture_output=True, timeout=10, check=False)
        match = re.search(rb'version "([0-9]+)', version.stderr + version.stdout)
        if version.returncode or not match or int(match[1]) < 17:
            raise unittest.SkipTest("Actual JDK17+ unavailable; source verifier tests unproved")
        cls.keytool, cls.jarsigner = cls.java.with_name("keytool"), cls.java.with_name("jarsigner")
        if not cls.keytool.is_file() or not cls.jarsigner.is_file():
            raise unittest.SkipTest("Actual JDK keytool/jarsigner unavailable; supply PENNY_TEST_JAVA")
        cls.temp = tempfile.TemporaryDirectory(); cls.addClassCleanup(cls.temp.cleanup)
        cls.root = Path(cls.temp.name); cls.key = cls.root / "ephemeral.p12"
        cls.run_tool([str(cls.keytool), "-genkeypair", "-alias", "fixture", "-keyalg", "RSA", "-keysize", "2048",
                      "-dname", "CN=Public Ephemeral Test Only", "-validity", "2", "-keystore", str(cls.key),
                      "-storepass", "public-test-only", "-keypass", "public-test-only", "-storetype", "PKCS12"])
        cert = cls.run_tool([str(cls.keytool), "-exportcert", "-alias", "fixture", "-keystore", str(cls.key), "-storepass", "public-test-only"])
        cls.expected = hashlib.sha256(cert).hexdigest()
        cls.signed = cls.root / "signed.aab"; archive(cls.signed)
        cls.sign(cls.signed)

    @classmethod
    def run_tool(cls, command):
        result = subprocess.run(command, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=30, check=False)
        if result.returncode: raise AssertionError("Public test-fixture JDK command failed")
        return result.stdout

    @classmethod
    def sign(cls, path):
        cls.run_tool([str(cls.jarsigner), "-keystore", str(cls.key), "-storepass", "public-test-only",
                      "-keypass", "public-test-only", str(path), "fixture"])

    def verify(self, path, expected=None):
        entries, total = aab._inventory(path, path.stat().st_size, aab.AabLimits())
        return aab.verify_jar(path, expected or self.expected, self.java, self.root, aab.AabLimits(), entries, total)

    def test_actual_self_signed_expected_certificate_and_wrong_expected(self):
        self.assertEqual(self.verify(self.signed), 2)
        with self.assertRaises(ValueError): self.verify(self.signed, "cd" * 32)

    def test_actual_unsigned_tampered_and_unsigned_meta_inf_content_reject(self):
        file = self.root / "unsigned.aab"; archive(file)
        with self.assertRaises(ValueError): self.verify(file)
        for name in ("base/added", "META-INF/extra.properties", "BUNDLE-METADATA/private/info"):
            shutil.copyfile(self.signed, file)
            with zipfile.ZipFile(file, "a") as bundle: bundle.writestr(name, b"unsigned")
            with self.assertRaises(ValueError): self.verify(file)
        with zipfile.ZipFile(self.signed) as source, zipfile.ZipFile(file, "w") as target:
            for entry in source.infolist():
                target.writestr(entry, b"tampered" if entry.filename == "BundleConfig.pb" else source.read(entry))
        with self.assertRaises(ValueError): self.verify(file)

    def test_actual_bundletool_validates_and_dumps_exact_base(self):
        configured = os.environ.get("PENNY_TEST_BUNDLETOOL")
        if not configured: self.skipTest("Explicit standalone bundletool unavailable; validation/dump unproved")
        tool = Path(configured).resolve()
        # Public fixture protobuf generated with bundletool's official AAPT model.
        builder = self.root / "MakeManifest.java"
        builder.write_text('''import java.nio.file.*; import com.android.aapt.Resources.*;
class MakeManifest { public static void main(java.lang.String[] a) throws Exception {
XmlElement manifest=XmlElement.newBuilder().setName("manifest")
.addNamespaceDeclaration(XmlNamespace.newBuilder().setPrefix("android").setUri("http://schemas.android.com/apk/res/android"))
.addAttribute(XmlAttribute.newBuilder().setName("package").setValue("test.public.fixture"))
.addAttribute(XmlAttribute.newBuilder().setNamespaceUri("http://schemas.android.com/apk/res/android")
.setName("versionCode").setValue("1").setResourceId(0x0101021b)
.setCompiledItem(Item.newBuilder().setPrim(Primitive.newBuilder().setIntDecimalValue(1))))
.addChild(XmlNode.newBuilder().setElement(XmlElement.newBuilder().setName("application")
.addAttribute(XmlAttribute.newBuilder().setNamespaceUri("http://schemas.android.com/apk/res/android")
.setName("hasCode").setValue("false").setResourceId(0x0101000c)
.setCompiledItem(Item.newBuilder().setPrim(Primitive.newBuilder().setBooleanValue(false)))))).build();
Files.write(Path.of(a[0]),XmlNode.newBuilder().setElement(manifest).build().toByteArray()); }}''')
        proto = self.root / "manifest.pb"
        self.run_tool([str(self.java), "-cp", str(tool), str(builder), str(proto)])
        module = self.root / "base.zip"
        with zipfile.ZipFile(module, "w") as output: output.writestr("manifest/AndroidManifest.xml", proto.read_bytes())
        bundle = self.root / "valid.aab"
        self.run_tool([str(self.java), "-jar", str(tool), "build-bundle", "--modules=" + str(module), "--output=" + str(bundle)])
        self.sign(bundle)
        original = hashlib.sha256(bundle.read_bytes()).hexdigest()
        with aab.inspect_aab(bundle, expected_signer_sha256=self.expected, java=self.java, bundletool=tool) as result:
            self.assertEqual(result.sha256, original)
            self.assertEqual(result.bundletool_version, "1.18.3")
            self.assertIn('package="test.public.fixture"', result.manifest_xml)
            self.assertTrue(result.signature_verified)
        # A valid JAR signature does not make invalid protobuf an Android bundle.
        with self.assertRaises(ValueError):
            with aab.inspect_aab(self.signed, expected_signer_sha256=self.expected, java=self.java, bundletool=tool): pass


if __name__ == "__main__": unittest.main()
