#!/usr/bin/env python3
"""Verify the complete extracted tree against the reviewed source pin; no network."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import stat

DEFAULT_MANIFEST = Path(__file__).with_name('source-manifest.json')
MAX_FILES = 5000
MAX_BYTES = 64 * 1024 * 1024


def tree_identity(source: Path) -> dict:
    source = Path(source)
    if source.is_symlink() or not source.is_dir():
        raise ValueError('Source must be a real directory, not a symbolic link')
    entries = []
    total = 0
    for directory, names, files in os.walk(source, followlinks=False):
        for name in names:
            item = Path(directory) / name
            if item.is_symlink() or not stat.S_ISDIR(item.lstat().st_mode):
                raise ValueError('Source directory links and special nodes are forbidden')
        for name in files:
            item = Path(directory) / name
            info = item.lstat()
            if not stat.S_ISREG(info.st_mode) or info.st_nlink != 1 or info.st_mode & 0o7000:
                raise ValueError('Source links, special nodes and privileged modes are forbidden')
            total += info.st_size
            if len(entries) >= MAX_FILES or total > MAX_BYTES or info.st_size > MAX_BYTES:
                raise ValueError('Source tree exceeds verification bounds')
            digest = hashlib.sha256()
            remaining = info.st_size
            with item.open('rb') as handle:
                while remaining:
                    chunk = handle.read(min(65536, remaining))
                    if not chunk:
                        raise ValueError('Source changed during verification')
                    digest.update(chunk)
                    remaining -= len(chunk)
                if handle.read(1):
                    raise ValueError('Source changed during verification')
            entries.append([item.relative_to(source).as_posix(), info.st_mode & 0o777,
                            info.st_size, digest.hexdigest()])
    digest = hashlib.sha256()
    for entry in sorted(entries, key=lambda entry: entry[0]):
        digest.update((json.dumps(entry, ensure_ascii=True, separators=(',', ':')) + '\n').encode('ascii'))
    return {'sha256': digest.hexdigest(), 'fileCount': len(entries)}


def verify_source(source: Path, manifest_path: Path = DEFAULT_MANIFEST) -> dict:
    manifest = json.loads(Path(manifest_path).read_text())
    if manifest.get('schemaVersion') != 1 or manifest.get('name') != 'libsodium':
        raise ValueError('Unsupported source manifest')
    expected = manifest['sourceTree']
    if expected.get('algorithm') != 'penny-tree-v1':
        raise ValueError('Unsupported source tree algorithm')
    actual = tree_identity(source)
    if actual['sha256'] != expected['sha256'] or actual['fileCount'] != expected['fileCount']:
        raise ValueError('Source tree does not match the reviewed manifest')
    return {'name': manifest['name'], 'version': manifest['version'],
            'archiveSha256': manifest['archive']['sha256'],
            'sourceTreeSha256': actual['sha256'], 'fileCount': actual['fileCount'],
            'sourcePath': str(Path(source).resolve())}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', type=Path, required=True)
    parser.add_argument('--manifest', type=Path, default=DEFAULT_MANIFEST)
    args = parser.parse_args()
    try:
        print(json.dumps(verify_source(args.source, args.manifest), sort_keys=True))
    except (ValueError, KeyError, OSError) as error:
        parser.exit(1, f'Source verification failed: {error}\n')


if __name__ == '__main__':
    main()
