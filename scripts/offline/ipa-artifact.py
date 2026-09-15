"""Bounded, private inspection of the exact exported IPA bytes (stdlib only).

This conservative ZIP profile accepts flat iOS frameworks, STORE/DEFLATE, and
ordinary non-ZIP64 single-disk archives. It is not a signing/distribution check.
The trusted caller must keep the private temporary namespace free of concurrent
mutation. Source changes after acquisition cannot change the inspected copy.
"""
from contextlib import contextmanager
import hashlib
import os
from pathlib import Path
import stat
import struct
import tempfile
from typing import NamedTuple
import unicodedata
import zipfile
import zlib


class IpaLimits(NamedTuple):
    artifact_bytes: int = 1024 * 1024 * 1024
    entries: int = 50_000
    central_directory_bytes: int = 16 * 1024 * 1024
    single_file_bytes: int = 512 * 1024 * 1024
    uncompressed_bytes: int = 2 * 1024 * 1024 * 1024
    path_bytes: int = 1024
    path_depth: int = 64


class InspectedIpa(NamedTuple):
    app: Path
    snapshot: Path
    sha256: str
    artifact_bytes: int
    entries: int
    files: int
    uncompressed_bytes: int


def _identity(value):
    return (value.st_dev, value.st_ino, value.st_size, value.st_mtime_ns, value.st_ctime_ns)


def _snapshot(source, destination, limit):
    flags = os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK
    fd = os.open(source, flags)
    try:
        before = os.fstat(fd)
        if not stat.S_ISREG(before.st_mode) or not 0 < before.st_size <= limit:
            raise ValueError("IPA input must be a bounded nonempty regular file")
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
                    raise ValueError("IPA input exceeds byte limit")
                digest.update(chunk)
                output.write(chunk)
            if count != before.st_size or _identity(before) != _identity(os.fstat(fd)):
                raise ValueError("IPA input changed during acquisition")
            current = source.lstat()
            if not stat.S_ISREG(current.st_mode) or _identity(before) != _identity(current):
                raise ValueError("IPA input path changed during acquisition")
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
        raise ValueError("IPA ZIP end record is missing")
    _, disk, cd_disk, disk_count, count, cd_size, cd_offset, comment = struct.unpack_from("<4s4H2IH", tail, offset)
    if offset + 22 + comment != len(tail):
        raise ValueError("IPA ZIP is truncated or has trailing bytes")
    if disk or cd_disk or disk_count != count or count == 65535 or cd_size == 0xffffffff or cd_offset == 0xffffffff:
        raise ValueError("IPA ZIP64/multidisk layout is unsupported")
    if not 0 < count <= limits.entries or cd_size > limits.central_directory_bytes:
        raise ValueError("IPA ZIP directory exceeds limits")
    if cd_offset + cd_size != size - tail_size + offset:
        raise ValueError("IPA ZIP directory extent is invalid")
    return count


def _parts(info, limits):
    name = info.orig_filename
    if not name or "\0" in name or "\\" in name or ":" in name or name.startswith("/"):
        raise ValueError("Unsafe IPA ZIP path")
    path = name[:-1] if name.endswith("/") else name
    parts = tuple(path.split("/"))
    if len(parts) > limits.path_depth or len(name.encode("utf-8")) > limits.path_bytes:
        raise ValueError("IPA ZIP path exceeds limits")
    if any(not part or part in (".", "..") or any(ord(c) < 32 or ord(c) == 127 for c in part) for part in parts):
        raise ValueError("Unsafe IPA ZIP component")
    return parts


def _validate_extra(extra):
    while extra:
        if len(extra) < 4:
            raise ValueError("Malformed IPA ZIP extra field")
        tag, length = struct.unpack_from("<HH", extra)
        if length > len(extra) - 4 or tag in (0x0001, 0x7075):
            raise ValueError("IPA ZIP64/alternate path or malformed extra field")
        extra = extra[4 + length:]


def _plan(archive, limits, count):
    infos = archive.infolist()
    if len(infos) != count:
        raise ValueError("IPA ZIP directory entry count mismatch")
    explicit, nodes, aliases, apps = set(), {}, {}, set()
    expanded = 0
    plan = []
    for info in infos:
        parts = _parts(info, limits)
        directory = info.is_dir()
        mode = info.external_attr >> 16
        kind = stat.S_IFMT(mode)
        if kind not in (0, stat.S_IFREG, stat.S_IFDIR) or (kind == stat.S_IFDIR) != directory and kind != 0:
            raise ValueError("IPA ZIP links/special files/type mismatch are forbidden")
        if info.external_attr & 0x10 and not directory:
            raise ValueError("IPA ZIP directory attributes conflict")
        if info.flag_bits & ~0x080e or info.compress_type not in (zipfile.ZIP_STORED, zipfile.ZIP_DEFLATED):
            raise ValueError("IPA ZIP encryption/flags/compression are unsupported")
        _validate_extra(info.extra)
        if info.file_size > limits.single_file_bytes or directory and info.file_size != 0:
            raise ValueError("IPA ZIP entry exceeds size limits")
        expanded += info.file_size
        if expanded > limits.uncompressed_bytes:
            raise ValueError("IPA ZIP expanded bytes exceed limit")
        if parts in explicit:
            raise ValueError("Duplicate IPA ZIP entry")
        explicit.add(parts)
        for depth in range(1, len(parts) + 1):
            prefix = parts[:depth]
            alias = tuple(unicodedata.normalize("NFD", p).casefold() for p in prefix)
            if alias in aliases and aliases[alias] != prefix:
                raise ValueError("IPA ZIP case/Unicode path collision")
            aliases[alias] = prefix
            node_kind = "directory" if depth < len(parts) or directory else "file"
            if prefix in nodes and nodes[prefix] != node_kind:
                raise ValueError("IPA ZIP file/directory conflict")
            nodes[prefix] = node_kind
        if parts[0] == "Payload":
            if len(parts) == 1 and not directory:
                raise ValueError("IPA Payload must be a directory")
            if len(parts) > 1:
                if not parts[1].endswith(".app") or parts[1] == ".app" or len(parts) == 2 and not directory:
                    raise ValueError("IPA Payload contains an unexpected child")
                apps.add(parts[1])
        plan.append((info, parts, directory, bool(mode & 0o111)))
    if len(apps) != 1:
        raise ValueError("IPA requires exactly one direct Payload app")
    return plan, next(iter(apps))


def _chunks(archive, info, snapshot, byte_limit, entry_end):
    # ZipExtFile checks local names/overlap, but truncates decoded output to the
    # declared size. Decode directly so a forged size cannot hide extra bytes.
    with archive.open(info, "r"):
        start = archive.fp.tell()
    with snapshot.open("rb") as raw:
        raw.seek(info.header_offset)
        local = raw.read(30)
        if len(local) != 30 or struct.unpack_from("<HH", local, 6) != (info.flag_bits, info.compress_type):
            raise ValueError("IPA local header disagrees with directory")
        expected = (info.CRC, info.compress_size, info.file_size)
        local_values = struct.unpack_from("<III", local, 14)
        descriptor = bool(info.flag_bits & 8)
        if local_values != expected and (not descriptor or local_values != (0, 0, 0)):
            raise ValueError("IPA local CRC/sizes disagree with directory")
        name_length, extra_length = struct.unpack_from("<HH", local, 26)
        raw.seek(info.header_offset + 30 + name_length)
        extra = raw.read(extra_length)
        if len(extra) != extra_length:
            raise ValueError("Truncated IPA ZIP local extra field")
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
                raise ValueError("IPA data descriptor CRC/sizes disagree with directory")
            data_end += length
        if data_end != entry_end:
            raise ValueError("IPA entry extent has unclaimed or overlapping bytes")
        raw.seek(start)
        decoder = zlib.decompressobj(-15) if info.compress_type == zipfile.ZIP_DEFLATED else None
        left, count, crc = info.compress_size, 0, 0
        while left:
            compressed = raw.read(min(65536, left))
            if not compressed:
                raise ValueError("Truncated IPA compressed bytes")
            left -= len(compressed)
            pending = compressed
            while pending:
                chunk = decoder.decompress(pending, min(65536, byte_limit - count + 1)) if decoder else pending
                pending = decoder.unconsumed_tail if decoder else b""
                count += len(chunk)
                if count > byte_limit or count > info.file_size:
                    raise ValueError("IPA actual decoded bytes exceed limits/declaration")
                crc = zlib.crc32(chunk, crc)
                yield chunk
                if decoder and decoder.eof:
                    if decoder.unused_data or pending or left:
                        raise ValueError("Trailing IPA compressed data")
                    break
        if decoder and not decoder.eof or count != info.file_size or crc != info.CRC:
            raise ValueError("IPA decoded EOF/size/CRC mismatch")


def _extract(snapshot, target, limits, expected_count):
    with zipfile.ZipFile(snapshot) as archive:
        plan, app = _plan(archive, limits, expected_count)
        offsets = sorted(info.header_offset for info, _, _, _ in plan)
        if not offsets or offsets[0] != 0 or len(set(offsets)) != len(offsets):
            raise ValueError("IPA local header offsets are ambiguous")
        ends = dict(zip(offsets, offsets[1:] + [archive.start_dir]))
        total, files = 0, 0
        for info, parts, directory, executable in plan:
            destination = target.joinpath(*parts)
            parent = target
            for component in parts[:-1]:
                parent = parent / component
                parent.mkdir(mode=0o700, exist_ok=True)
            if directory:
                destination.mkdir(mode=0o700, exist_ok=True)
                for chunk in _chunks(archive, info, snapshot, 0, ends[info.header_offset]):
                    if chunk:
                        raise ValueError("IPA directory contains bytes")
                continue
            fd = os.open(destination, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
            with os.fdopen(fd, "wb") as output:
                limit = min(limits.single_file_bytes, limits.uncompressed_bytes - total)
                for chunk in _chunks(archive, info, snapshot, limit, ends[info.header_offset]):
                    total += len(chunk)
                    output.write(chunk)
                output.flush()
                os.fsync(output.fileno())
                os.fchmod(output.fileno(), 0o700 if executable else 0o600)
            files += 1
    return target / "Payload" / app, files, total


@contextmanager
def inspect_ipa(path, *, limits=IpaLimits(), temporary_parent=None):
    """Yield InspectedIpa while its private frozen snapshot and app exist.

    `.sha256`/`.artifact_bytes` describe the copied upload object; `.entries`
    counts central records, `.files` regular files, `.uncompressed_bytes` actual
    decoded bytes. No claim of valid signing or store acceptance is made. Limits
    can be made smaller for tests. The caller must inspect `.app` inside `with`.
    All temporary data is removed on preparation failure or context exit.
    """
    if any(type(value) is not int or value <= 0 for value in limits):
        raise ValueError("IPA limits must be positive integers")
    source = Path(path).absolute()
    if source.suffix != ".ipa":
        raise ValueError("Expected an exported .ipa file")
    with tempfile.TemporaryDirectory(prefix="penny-ipa-", dir=temporary_parent) as temporary:
        root = Path(temporary)
        # TemporaryDirectory creates a private directory. Verify that contract
        # instead of changing permissions on a path after creation.
        owner = root.lstat()
        if not stat.S_ISDIR(owner.st_mode) or owner.st_uid != os.geteuid() or owner.st_mode & 0o077:
            raise ValueError("IPA temporary namespace is not private and owned")
        snapshot = root / "artifact.ipa"
        digest, size = _snapshot(source, snapshot, limits.artifact_bytes)
        try:
            count = _directory_bounds(snapshot, size, limits)
            target = root / "extracted"
            target.mkdir(mode=0o700)
            app, files, total = _extract(snapshot, target, limits, count)
        except (zipfile.BadZipFile, NotImplementedError, RuntimeError, EOFError, UnicodeError, struct.error, zlib.error) as error:
            raise ValueError("Invalid or unsupported IPA ZIP data") from error
        yield InspectedIpa(app, snapshot, digest, size, count, files, total)
