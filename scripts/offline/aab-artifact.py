"""Exact local AAB inspection; no Play, PKIX or sibling-APK acceptance claim.

Trusted caller supplies a JDK17+ java executable and standalone bundletool JAR.
Private temporary namespace must not be concurrently modified. ZIP safety is
self-contained; its conservative non-ZIP64 policy matches the IPA inspector,
but module rules and JAR authentication are AAB-specific. No extraction occurs.
"""
from contextlib import contextmanager
import hashlib
import os
import re
import selectors
import signal
import subprocess
import time
import xml.etree.ElementTree as ET
from pathlib import Path
import stat
import struct
import tempfile
from typing import NamedTuple
import unicodedata
import zipfile
import zlib


class AabLimits(NamedTuple):
    artifact_bytes: int = 1024 * 1024 * 1024
    entries: int = 50_000
    central_directory_bytes: int = 16 * 1024 * 1024
    single_file_bytes: int = 512 * 1024 * 1024
    uncompressed_bytes: int = 2 * 1024 * 1024 * 1024
    path_bytes: int = 1024
    path_depth: int = 64



def _identity(value):
    return (value.st_dev, value.st_ino, value.st_size, value.st_mtime_ns, value.st_ctime_ns)


def _snapshot(source, destination, limit):
    flags = os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK
    fd = os.open(source, flags)
    try:
        before = os.fstat(fd)
        if not stat.S_ISREG(before.st_mode) or not 0 < before.st_size <= limit:
            raise ValueError("AAB input must be a bounded nonempty regular file")
        digest = hashlib.sha256()
        count = 0
        with destination.open("xb") as output:
            os.fchmod(output.fileno(), 0o600)
            while True:
                chunk = os.read(fd, min(1024 * 1024, limit - count + 1))
                if not chunk:
                    break
                count += len(chunk)
                if count > limit:
                    raise ValueError("AAB input exceeds byte limit")
                digest.update(chunk)
                output.write(chunk)
            if count != before.st_size or _identity(before) != _identity(os.fstat(fd)):
                raise ValueError("AAB input changed during acquisition")
            current = source.lstat()
            if not stat.S_ISREG(current.st_mode) or _identity(before) != _identity(current):
                raise ValueError("AAB input path changed during acquisition")
            output.flush()
            os.fsync(output.fileno())
            os.fchmod(output.fileno(), 0o400)
        return digest.hexdigest(), count
    finally:
        os.close(fd)


def _directory_bounds(snapshot, size, limits):
    # Check before ZipFile allocates the complete central directory/ZipInfo list.
    with snapshot.open("rb") as stream:
        tail_size = min(size, 22 + 65535)
        stream.seek(size - tail_size)
        tail = stream.read(tail_size)
    offset = tail.rfind(b"PK\x05\x06")
    if offset < 0 or len(tail) - offset < 22:
        raise ValueError("AAB ZIP end record is missing")
    _, disk, cd_disk, disk_count, count, cd_size, cd_offset, comment = struct.unpack_from("<4s4H2IH", tail, offset)
    if offset + 22 + comment != len(tail):
        raise ValueError("AAB ZIP is truncated or has trailing bytes")
    if disk or cd_disk or disk_count != count or count == 65535 or cd_size == 0xffffffff or cd_offset == 0xffffffff:
        raise ValueError("AAB ZIP64/multidisk layout is unsupported")
    if not 0 < count <= limits.entries or cd_size > limits.central_directory_bytes:
        raise ValueError("AAB ZIP directory exceeds limits")
    if cd_offset + cd_size != size - tail_size + offset:
        raise ValueError("AAB ZIP directory extent is invalid")
    return count


def _parts(info, limits):
    name = info.orig_filename
    if not name or "\0" in name or "\\" in name or ":" in name or name.startswith("/"):
        raise ValueError("Unsafe AAB ZIP path")
    path = name[:-1] if name.endswith("/") else name
    parts = tuple(path.split("/"))
    if len(parts) > limits.path_depth or len(name.encode("utf-8")) > limits.path_bytes:
        raise ValueError("AAB ZIP path exceeds limits")
    if any(not part or part in (".", "..") or any(ord(c) < 32 or ord(c) == 127 for c in part) for part in parts):
        raise ValueError("Unsafe AAB ZIP component")
    return parts


def _validate_extra(extra):
    while extra:
        if len(extra) < 4:
            raise ValueError("Malformed AAB ZIP extra field")
        tag, length = struct.unpack_from("<HH", extra)
        if length > len(extra) - 4 or tag in (0x0001, 0x7075):
            raise ValueError("AAB ZIP64/alternate path or malformed extra field")
        extra = extra[4 + length:]


def _plan(archive, limits, count):
    infos = archive.infolist()
    if len(infos) != count:
        raise ValueError("AAB ZIP directory entry count mismatch")
    explicit, nodes, aliases = set(), {}, {}
    expanded = 0
    plan = []
    for info in infos:
        parts = _parts(info, limits)
        directory = info.is_dir()
        mode = info.external_attr >> 16
        kind = stat.S_IFMT(mode)
        if kind not in (0, stat.S_IFREG, stat.S_IFDIR) or (kind == stat.S_IFDIR) != directory and kind != 0:
            raise ValueError("AAB ZIP links/special files/type mismatch are forbidden")
        if info.external_attr & 0x10 and not directory:
            raise ValueError("AAB ZIP directory attributes conflict")
        if info.flag_bits & ~0x080e or info.compress_type not in (zipfile.ZIP_STORED, zipfile.ZIP_DEFLATED):
            raise ValueError("AAB ZIP encryption/flags/compression are unsupported")
        _validate_extra(info.extra)
        if info.file_size > limits.single_file_bytes or directory and info.file_size != 0:
            raise ValueError("AAB ZIP entry exceeds size limits")
        expanded += info.file_size
        if expanded > limits.uncompressed_bytes:
            raise ValueError("AAB ZIP expanded bytes exceed limit")
        if parts in explicit:
            raise ValueError("Duplicate AAB ZIP entry")
        explicit.add(parts)
        for depth in range(1, len(parts) + 1):
            prefix = parts[:depth]
            alias = tuple(unicodedata.normalize("NFD", p).casefold() for p in prefix)
            if alias in aliases and aliases[alias] != prefix:
                raise ValueError("AAB ZIP case/Unicode path collision")
            aliases[alias] = prefix
            node_kind = "directory" if depth < len(parts) or directory else "file"
            if prefix in nodes and nodes[prefix] != node_kind:
                raise ValueError("AAB ZIP file/directory conflict")
            nodes[prefix] = node_kind
        if parts[0] not in ("base", "META-INF", "BUNDLE-METADATA", "BundleConfig.pb"):
            raise ValueError("Unexpected AAB module/global entry")
        if parts[0] == "BundleConfig.pb":
            if len(parts) != 1 or directory:
                raise ValueError("Invalid AAB BundleConfig entry")
        elif len(parts) == 1 and not directory:
            raise ValueError("AAB module/global root must be a directory")
        plan.append((info, parts, directory, bool(mode & 0o111)))
    required = {("BundleConfig.pb",), ("base", "manifest", "AndroidManifest.xml"), ("META-INF", "MANIFEST.MF")}
    if any(nodes.get(path) != "file" for path in required):
        raise ValueError("AAB is missing required config/base manifest/JAR manifest")
    return plan


def _chunks(archive, info, snapshot, byte_limit, entry_end):
    # ZipExtFile checks local names/overlap, but truncates decoded output to the
    # declared size. Decode directly so a forged size cannot hide extra bytes.
    with archive.open(info, "r"):
        start = archive.fp.tell()
    with snapshot.open("rb") as raw:
        raw.seek(info.header_offset)
        local = raw.read(30)
        if len(local) != 30 or struct.unpack_from("<HH", local, 6) != (info.flag_bits, info.compress_type):
            raise ValueError("AAB local header disagrees with directory")
        expected = (info.CRC, info.compress_size, info.file_size)
        local_values = struct.unpack_from("<III", local, 14)
        descriptor = bool(info.flag_bits & 8)
        if local_values != expected and (not descriptor or local_values != (0, 0, 0)):
            raise ValueError("AAB local CRC/sizes disagree with directory")
        name_length, extra_length = struct.unpack_from("<HH", local, 26)
        raw.seek(info.header_offset + 30 + name_length)
        extra = raw.read(extra_length)
        if len(extra) != extra_length:
            raise ValueError("Truncated AAB ZIP local extra field")
        _validate_extra(extra)
        data_end = start + info.compress_size
        # APPNOTE 4.3.9 permits signed and unsigned 32-bit data descriptors.
        # https://pkware.cachefly.net/webdocs/casestudies/APPNOTE.TXT
        if descriptor:
            raw.seek(data_end)
            descriptor_bytes = raw.read(min(16, max(0, entry_end - data_end)))
            signed = descriptor_bytes.startswith(b"PK\x07\x08")
            offset, length = (4, 16) if signed else (0, 12)
            if len(descriptor_bytes) < length or struct.unpack_from("<III", descriptor_bytes, offset) != expected:
                raise ValueError("AAB data descriptor CRC/sizes disagree with directory")
            data_end += length
        if data_end != entry_end:
            raise ValueError("AAB entry extent has unclaimed or overlapping bytes")
        raw.seek(start)
        decoder = zlib.decompressobj(-15) if info.compress_type == zipfile.ZIP_DEFLATED else None
        left, count, crc = info.compress_size, 0, 0
        while left:
            compressed = raw.read(min(65536, left))
            if not compressed:
                raise ValueError("Truncated AAB compressed bytes")
            left -= len(compressed)
            pending = compressed
            while pending:
                chunk = decoder.decompress(pending, min(65536, byte_limit - count + 1)) if decoder else pending
                pending = decoder.unconsumed_tail if decoder else b""
                count += len(chunk)
                if count > byte_limit or count > info.file_size:
                    raise ValueError("AAB actual decoded bytes exceed limits/declaration")
                crc = zlib.crc32(chunk, crc)
                yield chunk
                if decoder and decoder.eof:
                    if decoder.unused_data or pending or left:
                        raise ValueError("Trailing AAB compressed data")
                    break
        if decoder and not decoder.eof or count != info.file_size or crc != info.CRC:
            raise ValueError("AAB decoded EOF/size/CRC mismatch")



class InspectedAab(NamedTuple):
    snapshot: Path
    sha256: str
    artifact_bytes: int
    entries: int
    uncompressed_bytes: int
    signed_content_entries: int
    signer_sha256: str
    signature_verified: bool
    manifest_xml: str
    bundletool_sha256: str
    bundletool_version: str


# JarFile verification activates while reading each entry, before getCodeSigners:
# https://docs.oracle.com/en/java/javase/17/docs/api/java.base/java/util/jar/JarFile.html
# This is platform signature verification, not a new cryptographic implementation.
JAR_VERIFIER = r'''
import java.io.*;
import java.util.*;
import java.util.jar.*;
import java.security.*;
public class VerifyAab {
  public static void main(String[] args) {
    try (JarFile jar = new JarFile(new File(args[0]), true)) {
      int entries = 0, signed = 0;
      long total = 0;
      long maximum = Long.parseLong(args[2]);
      byte[] buffer = new byte[65536];
      Set<String> signatureFiles = new HashSet<>(), blocks = new HashSet<>();
      for (JarEntry entry : Collections.list(jar.entries())) {
        entries++;
        if (entries > Integer.parseInt(args[3])) throw new SecurityException();
        try (InputStream input = jar.getInputStream(entry)) {
          for (int n; (n = input.read(buffer)) != -1;) {
            total += n;
            if (total > maximum) throw new SecurityException();
          }
        }
        if (entry.isDirectory()) continue;
        String name = entry.getName();
        boolean control = name.equals("META-INF/MANIFEST.MF");
        if (name.matches("META-INF/[A-Z0-9_-]{1,8}\\.SF")) {
          signatureFiles.add(name.substring(9, name.length()-3)); control = true;
        }
        if (name.matches("META-INF/[A-Z0-9_-]{1,8}\\.(RSA|DSA|EC)")) {
          blocks.add(name.substring(9, name.lastIndexOf('.'))); control = true;
        }
        if (control) continue;
        CodeSigner[] signers = entry.getCodeSigners();
        if (signers == null || signers.length != 1) throw new SecurityException();
        byte[] certificate = signers[0].getSignerCertPath().getCertificates().get(0).getEncoded();
        String actual = HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(certificate));
        if (!actual.equals(args[1])) throw new SecurityException();
        signed++;
      }
      if (signed == 0 || signatureFiles.size() != 1 || !signatureFiles.equals(blocks)) throw new SecurityException();
      System.out.println("OK " + entries + " " + total + " " + signed);
    } catch (Exception failure) {
      System.err.println("AAB JAR content signature verification failed");
      System.exit(1);
    }
  }
}
'''


def _run(command, directory, *, timeout=120, output_limit=4 * 1024 * 1024):
    """Bound both pipes as they arrive; never echo tool output or profile data."""
    env = {k: v for k, v in os.environ.items() if k not in (
        "JAVA_TOOL_OPTIONS", "_JAVA_OPTIONS", "JDK_JAVA_OPTIONS", "CLASSPATH")}
    process = subprocess.Popen(command, cwd=directory, env=env, stdin=subprocess.DEVNULL,
                               stdout=subprocess.PIPE, stderr=subprocess.PIPE, start_new_session=True)
    try:
        with selectors.DefaultSelector() as selector:
            selector.register(process.stdout, selectors.EVENT_READ, "out")
            selector.register(process.stderr, selectors.EVENT_READ, "err")
            output, count = bytearray(), 0
            deadline = time.monotonic() + timeout
            while selector.get_map():
                if time.monotonic() >= deadline:
                    raise ValueError("AAB verification tool timed out")
                for key, _ in selector.select(min(0.1, max(0, deadline - time.monotonic()))):
                    chunk = os.read(key.fileobj.fileno(), 65536)
                    if not chunk:
                        selector.unregister(key.fileobj)
                        continue
                    count += len(chunk)
                    if count > output_limit:
                        raise ValueError("AAB verification tool output exceeds limit")
                    if key.data == "out":
                        output.extend(chunk)
            if process.wait(timeout=max(0.01, deadline - time.monotonic())) != 0:
                raise ValueError("AAB verification tool failed")
            return bytes(output)
    finally:
        if process.poll() is None:
            os.killpg(process.pid, signal.SIGKILL)
            process.wait()
        process.stdout.close()
        process.stderr.close()


def _inventory(snapshot, size, limits):
    count = _directory_bounds(snapshot, size, limits)
    with zipfile.ZipFile(snapshot) as archive:
        plan = _plan(archive, limits, count)
        offsets = sorted(info.header_offset for info, _, _, _ in plan)
        if not offsets or offsets[0] != 0 or len(set(offsets)) != len(offsets):
            raise ValueError("AAB local header offsets are ambiguous")
        ends = dict(zip(offsets, offsets[1:] + [archive.start_dir]))
        total = 0
        for info, _, directory, _ in plan:
            limit = 0 if directory else min(limits.single_file_bytes, limits.uncompressed_bytes - total)
            for chunk in _chunks(archive, info, snapshot, limit, ends[info.header_offset]):
                total += len(chunk)
    return count, total


def verify_jar(snapshot, expected, java, directory, limits, entries, total):
    """Internal independently testable actual JDK content-verification boundary."""
    source = directory / "VerifyAab.java"
    source.write_text(JAR_VERIFIER, encoding="utf-8")
    source.chmod(0o600)
    output = _run([str(java), "-Xmx512m", str(source), str(snapshot), expected,
                   str(limits.uncompressed_bytes), str(limits.entries)], directory)
    match = re.fullmatch(rb"OK ([0-9]+) ([0-9]+) ([0-9]+)\s*", output)
    if not match or int(match[1]) != entries or int(match[2]) != total:
        raise ValueError("AAB JDK verified inventory differs from bounded ZIP inventory")
    return int(match[3])


@contextmanager
def inspect_aab(path, *, expected_signer_sha256, java, bundletool, limits=AabLimits(), temporary_parent=None):
    """Yield frozen artifact evidence and actual base manifest XML; fail closed.

    Bundletool invocation is from its official CLI: validate --bundle and
    dump manifest --bundle --module=base (google/bundletool DumpCommand).
    Tool paths are trusted configuration, not values read from the bundle.
    """
    if any(type(value) is not int or value <= 0 for value in limits):
        raise ValueError("AAB limits must be positive integers")
    if not isinstance(expected_signer_sha256, str) or not re.fullmatch(r"(?:[0-9a-fA-F]{64}|(?:[0-9a-fA-F]{2}:){31}[0-9a-fA-F]{2})", expected_signer_sha256):
        raise ValueError("Independent expected upload signer SHA256 is required")
    expected = expected_signer_sha256.replace(":", "").lower()
    java = Path(java)
    if not java.is_absolute() or not java.is_file() or not os.access(java, os.X_OK):
        raise ValueError("An explicit installed JDK java executable is required")
    java = java.resolve(strict=True)
    tool = Path(bundletool)
    if not tool.is_absolute():
        raise ValueError("An explicit standalone bundletool JAR is required")
    source = Path(path).absolute()
    if source.suffix != ".aab":
        raise ValueError("Expected an exported .aab file")
    with tempfile.TemporaryDirectory(prefix="penny-aab-", dir=temporary_parent) as temporary:
        root = Path(temporary)
        root_info = root.lstat()
        if not stat.S_ISDIR(root_info.st_mode) or root_info.st_uid != os.geteuid() or root_info.st_mode & 0o077:
            raise ValueError("AAB temporary directory is not owner-only")
        snapshot = root / "artifact.aab"
        digest, size = _snapshot(source, snapshot, limits.artifact_bytes)
        tool_copy = root / "bundletool.jar"
        tool_digest, _ = _snapshot(tool, tool_copy, 128 * 1024 * 1024)
        try:
            entries, total = _inventory(snapshot, size, limits)
            signed = verify_jar(snapshot, expected, java, root, limits, entries, total)
            prefix = [str(java), "-Xmx512m", "-jar", str(tool_copy)]
            version = _run(prefix + ["version"], root, output_limit=65536).decode("ascii").strip()
            if not re.fullmatch(r"[0-9]+\.[0-9]+\.[0-9]+(?:[-.][A-Za-z0-9.-]+)?", version):
                raise ValueError("Unrecognized bundletool version response")
            _run(prefix + ["validate", "--bundle=" + str(snapshot)], root)
            xml = _run(prefix + ["dump", "manifest", "--bundle=" + str(snapshot), "--module=base"], root).decode("utf-8")
            if "<!DOCTYPE" in xml.upper() or "<!ENTITY" in xml.upper() or ET.fromstring(xml).tag != "manifest":
                raise ValueError("Invalid bundletool base manifest XML")
        except (zipfile.BadZipFile, NotImplementedError, RuntimeError, EOFError, UnicodeError,
                struct.error, zlib.error, ET.ParseError, subprocess.SubprocessError) as error:
            raise ValueError("Invalid AAB container/signature/tool result") from error
        yield InspectedAab(snapshot, digest, size, entries, total, signed, expected, True, xml, tool_digest, version)
