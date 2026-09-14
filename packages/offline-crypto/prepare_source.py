#!/usr/bin/env python3
"""Prepare the pinned, verified source into a new directory; never overwrite it."""
import argparse
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import tarfile
import tempfile
import urllib.request
import urllib.parse
from verify_source import DEFAULT_MANIFEST, verify_source, MAX_FILES, MAX_BYTES


class HTTPSRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, request, response, code, message, headers, new_url):
        if urllib.parse.urlsplit(new_url).scheme != 'https':
            raise ValueError('Source download redirect must remain HTTPS')
        return super().redirect_request(request, response, code, message, headers, new_url)


def verify_archive(archive: Path, manifest: dict):
    if archive.is_symlink() or not archive.is_file() or archive.stat().st_size != manifest['archive']['sizeBytes']:
        raise ValueError('Archive must be a regular file of the pinned size')
    if hashlib.sha256(archive.read_bytes()).hexdigest() != manifest['archive']['sha256']:
        raise ValueError('Archive does not match the reviewed digest')


def extract_archive(archive: Path, output: Path, manifest: dict):
    """Manual extraction refuses links, duplicate names, traversal and special files."""
    verify_archive(archive, manifest)
    output = Path(output).absolute()
    if output.exists() or output.is_symlink() or not output.parent.is_dir():
        raise ValueError('Output must be a new directory with an existing parent')
    with tempfile.TemporaryDirectory(prefix='.penny-source-', dir=output.parent) as temporary:
        staging = Path(temporary) / 'source'
        staging.mkdir()
        with tarfile.open(archive, mode='r:gz') as contents:
            seen = set()
            size = 0
            files = 0
            for member in contents:
                parts = Path(member.name).parts
                if not parts or Path(member.name).is_absolute() or '..' in parts or '\\' in member.name or parts[0] != manifest['archive']['topLevel']:
                    raise ValueError('Unsafe archive path')
                relative = Path(*parts[1:])
                if relative.as_posix() in seen:
                    raise ValueError('Duplicate archive path')
                seen.add(relative.as_posix())
                if not (member.isdir() or member.isfile()) or member.mode & 0o7000:
                    raise ValueError('Archive links, special nodes and privileged modes are forbidden')
                if len(seen) > MAX_FILES * 2:
                    raise ValueError('Too many archive entries')
                target = staging / relative
                if member.isdir():
                    target.mkdir(parents=True, exist_ok=True)
                    continue
                files += 1
                size += member.size
                if files > MAX_FILES or member.size < 0 or size > MAX_BYTES:
                    raise ValueError('Archive exceeds extraction bounds')
                target.parent.mkdir(parents=True, exist_ok=True)
                with contents.extractfile(member) as source, target.open('xb') as destination:
                    remaining = member.size
                    while remaining:
                        chunk = source.read(min(65536, remaining))
                        if not chunk:
                            raise ValueError('Truncated archive member')
                        destination.write(chunk)
                        remaining -= len(chunk)
                target.chmod(member.mode & 0o777)
        verify_source(staging)
        # Reserve exclusively: rename() could otherwise replace an empty directory
        # that appeared after the earlier check. An interrupted copy is unverified
        # and will fail the complete-tree check; it is never reused or cleaned here.
        output.mkdir(mode=0o700)
        for item in staging.iterdir():
            if (output / item.name).exists():
                raise ValueError('Unexpected file in newly reserved output')
            item.rename(output / item.name)
    return verify_source(output)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    choice = parser.add_mutually_exclusive_group(required=True)
    choice.add_argument('--archive', type=Path)
    choice.add_argument('--download', action='store_true', help='Fetch only the fixed reviewed HTTPS archive')
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    manifest = json.loads(DEFAULT_MANIFEST.read_text())
    try:
        with tempfile.TemporaryDirectory(prefix='penny-archive-') as temporary:
            archive = args.archive
            if args.download:
                archive = Path(temporary) / 'libsodium.tar.gz'
                expected = manifest['archive']['sizeBytes']
                if not 0 < expected <= 3 * 1024 * 1024:
                    raise ValueError('Unsupported archive download size')
                opener = urllib.request.build_opener(HTTPSRedirect())
                with opener.open(manifest['archive']['url'], timeout=30) as response, archive.open('xb') as destination:
                    observed = 0
                    while chunk := response.read(65536):
                        observed += len(chunk)
                        if observed > expected:
                            raise ValueError('Source download exceeds pinned size')
                        destination.write(chunk)
            verify_archive(archive, manifest)
            node = shutil.which('node')
            if not node:
                raise ValueError('Node.js is required for independent release signature verification')
            # Installed Node runs a fixed reviewed script; absolute archive path is data, not JS/shell.
            # nosemgrep: python.lang.security.audit.dangerous-subprocess-use-tainted-env-args.dangerous-subprocess-use-tainted-env-args
            subprocess.run([node, str(Path(__file__).with_name('verify-release.mjs').resolve()), str(archive.resolve())], shell=False, check=True, capture_output=True, text=True)
            print(json.dumps(extract_archive(archive, args.output, manifest), sort_keys=True))
    except (ValueError, OSError, tarfile.TarError, subprocess.CalledProcessError) as error:
        parser.exit(1, f'Source preparation failed: {error}\n')


if __name__ == '__main__':
    main()
