"""Container safety and exact-artifact tests; no signing/distribution assertions."""
import hashlib
import importlib.util
import io
import os
from pathlib import Path
import stat
import struct
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch
import warnings
import zipfile
import zlib

spec = importlib.util.spec_from_file_location("ipa_artifact", Path(__file__).with_name("ipa-artifact.py"))
ipa = importlib.util.module_from_spec(spec)
spec.loader.exec_module(ipa)
APP = "Payload/Test.app/"


def info(name, mode=stat.S_IFREG | 0o644, method=zipfile.ZIP_DEFLATED):
    value = zipfile.ZipInfo(name)
    value.create_system = 3
    value.external_attr = mode << 16
    value.compress_type = method
    return value


class IpaArtifactTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.source = self.root / "exported.ipa"
        self.scratch = self.root / "private"
        self.scratch.mkdir(mode=0o700)

    def archive(self, entries=None):
        entries = entries if entries is not None else [(info(APP + "Info.plist"), b"plist"),
                  (info(APP + "Test", stat.S_IFREG | 0o6755), b"executable")]
        with warnings.catch_warnings(), zipfile.ZipFile(self.source, "w") as archive:
            warnings.simplefilter("ignore", UserWarning)
            for entry, body in entries:
                archive.writestr(entry, body)
        return self.source.read_bytes()

    def reject(self, limits=ipa.IpaLimits()):
        with self.assertRaises((ValueError, OSError)):
            with ipa.inspect_ipa(self.source, limits=limits, temporary_parent=self.scratch):
                self.fail("malformed archive was yielded")
        self.assertEqual(list(self.scratch.iterdir()), [])

    def test_exact_hash_private_permissions_frozen_source_and_context_cleanup(self):
        original = self.archive()
        with ipa.inspect_ipa(self.source, temporary_parent=self.scratch) as result:
            self.assertEqual(result.sha256, hashlib.sha256(original).hexdigest())
            self.assertEqual(result.artifact_bytes, len(original))
            self.assertEqual((result.entries, result.files, result.uncompressed_bytes), (2, 2, 15))
            self.assertEqual((result.app / "Test").read_bytes(), b"executable")
            with self.assertRaises(AttributeError):
                result.sha256 = "changed"
            self.source.write_bytes(b"changed after snapshot")
            self.assertEqual(result.snapshot.read_bytes(), original)
            self.assertEqual((result.app / "Test").stat().st_mode & 0o7777, 0o700)
            for path in result.snapshot.parent.rglob("*"):
                self.assertEqual(path.stat().st_mode & 0o077, 0)
        self.assertFalse(result.app.exists())
        self.assertEqual(list(self.scratch.iterdir()), [])

    def test_cleanup_when_inspector_or_writer_fails(self):
        self.archive()
        with self.assertRaisesRegex(RuntimeError, "consumer"):
            with ipa.inspect_ipa(self.source, temporary_parent=self.scratch):
                raise RuntimeError("consumer")
        self.assertEqual(list(self.scratch.iterdir()), [])
        with patch.object(ipa.os, "fsync", side_effect=OSError("injected sync failure")):
            self.reject()

    def test_nonregular_symlink_and_fifo_input(self):
        self.source.mkdir()
        self.reject()
        self.source.rmdir()
        other = self.root / "other"
        other.write_bytes(b"data")
        self.source.symlink_to(other)
        self.reject()
        self.source.unlink()
        os.mkfifo(self.source)
        command = "import runpy,sys; m=runpy.run_path(sys.argv[1]);\ntry:\n with m['inspect_ipa'](sys.argv[2], temporary_parent=sys.argv[3]): pass\nexcept (ValueError,OSError): sys.exit(0)\nsys.exit(1)"
        completed = subprocess.run([sys.executable, "-c", command, str(Path(ipa.__file__)), str(self.source), str(self.scratch)],
                                   capture_output=True, timeout=2, check=False)
        self.assertEqual(completed.returncode, 0)
        self.assertEqual(list(self.scratch.iterdir()), [])

    def test_source_mutation_during_copy_is_rejected(self):
        for replace in (False, True):
            self.archive()
            real_read = os.read
            mutated = False
            def mutate(fd, count):
                nonlocal mutated
                value = real_read(fd, count)
                if not mutated:
                    mutated = True
                    if replace:
                        replacement = self.root / "replacement"
                        replacement.write_bytes(self.source.read_bytes())
                        replacement.replace(self.source)
                    else:
                        with self.source.open("ab") as stream:
                            stream.write(b"extra")
                return value
            with patch.object(ipa.os, "read", side_effect=mutate):
                self.reject()

    def test_unsafe_paths_and_payload_shapes(self):
        bad = ["/escape", "../escape", "Payload/../escape", "Payload//Test.app/file", "Payload/./Test.app/file",
               "C:/escape", "Payload\\Test.app\\file", "Payload/Test.app/line\nfile", "Payload/.app/file"]
        for name in bad:
            with self.subTest(name=name):
                self.archive([(info(APP + "ok"), b"x"), (info(name), b"x")])
                self.reject()
        for names in (["Elsewhere/A.app/file"], [APP + "x", "Payload/Other.app/x"],
                      [APP + "x", "Payload/other"], ["Payload"], ["Payload/Test.app"]):
            self.archive([(info(name), b"x") for name in names])
            self.reject()
        # ZipInfo truncates NUL at construction: mutate both raw names instead.
        data = self.archive([(info(APP + "fooXbar"), b"x")])
        self.source.write_bytes(data.replace(b"fooXbar", b"foo\0bar"))
        self.reject()

    def test_duplicates_unicode_case_and_file_directory_conflicts(self):
        pairs = [(APP + "x", APP + "x"), (APP + "X/a", APP + "x/b"),
                 (APP + "caf\u00e9/a", APP + "cafe\u0301/b"), (APP + "x", APP + "x/y"),
                 (APP + "x/y", APP + "x"), (APP + "x", "payload/Test.app/y")]
        for first, second in pairs:
            self.archive([(info(first), b"x"), (info(second), b"y")])
            self.reject()
        self.archive([(info(APP, stat.S_IFDIR | 0o755), b""), (info(APP, stat.S_IFDIR | 0o755), b"")])
        self.reject()

    def test_symlink_special_type_compression_and_encryption(self):
        for kind in (stat.S_IFLNK, stat.S_IFIFO, stat.S_IFCHR, stat.S_IFSOCK, stat.S_IFDIR):
            self.archive([(info(APP + "file", kind | 0o755), b"x")])
            self.reject()
        self.archive([(info(APP + "file", method=zipfile.ZIP_BZIP2), b"x")])
        self.reject()
        data = bytearray(self.archive())
        local, central = data.index(b"PK\x03\x04"), data.index(b"PK\x01\x02")
        for position in (local + 6, central + 8):
            struct.pack_into("<H", data, position, 1)
        self.source.write_bytes(data)
        self.reject()

    def test_limits_and_bounded_central_directory_before_open(self):
        self.archive([(info(APP + "a"), b"a" * 30), (info(APP + "b"), b"b" * 30)])
        for changes in ({"artifact_bytes": 20}, {"entries": 1}, {"central_directory_bytes": 1},
                        {"single_file_bytes": 29}, {"uncompressed_bytes": 59}, {"path_bytes": 5}, {"path_depth": 2}):
            self.reject(ipa.IpaLimits()._replace(**changes))
        with patch.object(ipa.zipfile, "ZipFile", side_effect=AssertionError("directory must be bounded first")):
            self.reject(ipa.IpaLimits(central_directory_bytes=1))

    def test_stored_deflated_directories_frameworks_and_top_level_support(self):
        self.archive([(info("Payload/", stat.S_IFDIR | 0o755), b""),
                      (info(APP + "Frameworks/A.framework/A", stat.S_IFREG | 0o755, zipfile.ZIP_STORED), b"binary"),
                      (info("SwiftSupport/iphoneos/library"), b"support")])
        with ipa.inspect_ipa(self.source, temporary_parent=self.scratch) as result:
            self.assertEqual((result.entries, result.files, result.uncompressed_bytes), (3, 2, 13))

    def test_truncation_crc_and_extra_decoded_bytes(self):
        valid = self.archive([(info(APP + "file", method=zipfile.ZIP_STORED), b"abcdef")])
        for data in (valid[:-1], valid + b"trailing", valid.replace(b"abcdef", b"abcdeX", 1)):
            self.source.write_bytes(data)
            self.reject()
        data = bytearray(self.archive([(info(APP + "file"), b"abcdefgh")]))
        # Even a correct CRC for the declared prefix must not hide decoded bytes.
        for start, crc_offset, size_offset in ((data.index(b"PK\x03\x04"), 14, 22), (data.index(b"PK\x01\x02"), 16, 24)):
            struct.pack_into("<I", data, start + crc_offset, zlib.crc32(b"abcd"))
            struct.pack_into("<I", data, start + size_offset, 4)
        self.source.write_bytes(data)
        self.reject()

    def test_large_stream_exact_limits_and_local_header_mismatch(self):
        body = b"x" * 200_000
        valid = self.archive([(info(APP + "file"), body)])
        with ipa.inspect_ipa(self.source, limits=ipa.IpaLimits(single_file_bytes=len(body), uncompressed_bytes=len(body)),
                             temporary_parent=self.scratch) as result:
            self.assertEqual((result.app / "file").read_bytes(), body)
        data = bytearray(valid)
        struct.pack_into("<H", data, data.index(b"PK\x03\x04") + 8, zipfile.ZIP_STORED)
        self.source.write_bytes(data)
        self.reject()
        with zipfile.ZipFile(self.source, "w") as archive:
            with archive.open(APP + "file", "w", force_zip64=True) as stream:
                stream.write(b"x")
        self.reject()

    def test_local_crc_sizes_extras_and_data_descriptors(self):
        valid = self.archive([(info(APP + "file"), b"body")])
        for field in (14, 18, 22):
            data = bytearray(valid)
            data[field] ^= 1
            self.source.write_bytes(data)
            self.reject()
        # Central directory extra stays innocuous; local-only path alias fails.
        value = info(APP + "file")
        value.extra = struct.pack("<HH", 0xbeef, 1) + b"x"
        data = bytearray(self.archive([(value, b"body")]))
        name_length = struct.unpack_from("<H", data, 26)[0]
        struct.pack_into("<H", data, 30 + name_length, 0x7075)
        self.source.write_bytes(data)
        self.reject()
        class StreamingOutput(io.BytesIO):
            def seek(self, *args):
                raise OSError("not seekable")
        output = StreamingOutput()
        with zipfile.ZipFile(output, "w") as archive:
            archive.writestr(info(APP + "file"), b"body")
        signed = output.getvalue()
        dd = signed.index(b"PK\x07\x08")
        for signed_descriptor in (True, False):
            data = bytearray(signed)
            if not signed_descriptor:
                del data[dd:dd + 4]
                end = data.index(b"PK\x05\x06")
                struct.pack_into("<I", data, end + 16, struct.unpack_from("<I", data, end + 16)[0] - 4)
            self.source.write_bytes(data)
            with ipa.inspect_ipa(self.source, temporary_parent=self.scratch) as result:
                self.assertEqual((result.app / "file").read_bytes(), b"body")
            for field in (0, 4, 8):
                broken = data.copy()
                broken[dd + (4 if signed_descriptor else 0) + field] ^= 1
                self.source.write_bytes(broken)
                self.reject()
        data = bytearray(signed)
        data[14] = 1  # Nonzero local placeholder must match completely.
        self.source.write_bytes(data)
        self.reject()
        # Remove the descriptor, preserving the central directory location.
        data = bytearray(signed)
        del data[dd:dd + 16]
        end = data.index(b"PK\x05\x06")
        struct.pack_into("<I", data, end + 16, struct.unpack_from("<I", data, end + 16)[0] - 16)
        self.source.write_bytes(data)
        self.reject()

    def test_directory_data_and_alternate_name_extra_rejected(self):
        self.archive([(info(APP, stat.S_IFDIR | 0o755), b"not empty")])
        self.reject()
        value = info(APP + "file")
        value.extra = struct.pack("<HH", 0x7075, 1) + b"x"
        self.archive([(value, b"x")])
        self.reject()


if __name__ == "__main__":
    unittest.main()
