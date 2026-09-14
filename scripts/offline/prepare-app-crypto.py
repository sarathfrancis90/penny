#!/usr/bin/env python3
"""Explicit authenticated native dependency build; never run implicitly by Gradle.

Output is new/private and retained on failure. In-repo output must be ignored;
external CI scratch is allowed. Parents must already exist without symlinks.
The developer/CI host and its private output namespace are trusted. Native app
link/runtime validation remains separate from successful preparation.
"""
import argparse
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import re
import selectors
import shutil
import signal
import stat
import subprocess
import sys
import time

ROOT = Path(__file__).resolve().parents[2]
CRYPTO = ROOT / 'packages/offline-crypto'


def digest(path):
    value = hashlib.sha256()
    with path.open('rb') as stream:
        for chunk in iter(lambda: stream.read(65536), b''):
            value.update(chunk)
    return value.hexdigest()


def safe_path(value):
    path = Path(value)
    if not path.is_absolute() or not re.fullmatch(r'[A-Za-z0-9_./-]+', str(path)) or '..' in path.parts:
        raise ValueError('Supply an absolute safe ASCII path without traversal')
    for parent in (path, *path.parents):
        if parent.is_symlink():
            raise ValueError('Symbolic links in preparation paths are unsupported')
    return path


def validate_paths(platform, output, ndk):
    safe_path(ROOT)
    output = safe_path(output)
    if output.exists() or not output.parent.is_dir():
        raise ValueError('Output must be new and its parent must already exist')
    if output.is_relative_to(ROOT):
        result = subprocess.run(['git', 'check-ignore', '--no-index', '-q', '--', str(output)],
                                cwd=ROOT, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=10, check=False)
        if result.returncode != 0:
            raise ValueError('In-repository preparation output must be gitignored')
    if platform == 'android':
        if ndk is None:
            raise ValueError('Android requires explicit --ndk')
        ndk = safe_path(ndk)
        properties = ndk / 'source.properties'
        if not ndk.is_dir() or not properties.is_file() or properties.is_symlink():
            raise ValueError('An installed pinned NDK directory is required')
        if not re.search(r'^Pkg.Revision\s*=\s*28\.2\.13676358\s*$', properties.read_text(), re.M):
            raise ValueError('NDK must match the reviewed 28.2.13676358 pin')
    elif platform != 'ios' or ndk is not None:
        raise ValueError('Choose ios or android; --ndk applies only to Android')
    return output, ndk


def run_logged(command, log, *, timeout=1800, byte_limit=32 * 1024 * 1024):
    """Bound child runtime/output, kill its process group on failure, keep logs."""
    fd = os.open(log, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd, 'wb') as output:
        # Fixed reviewed scripts + validated path arguments, never shell input.
        process = subprocess.Popen(command, cwd=ROOT, stdin=subprocess.DEVNULL,
                                   stdout=subprocess.PIPE, stderr=subprocess.STDOUT, start_new_session=True, shell=False, umask=0o077)
        try:
            deadline, count = time.monotonic() + timeout, 0
            with selectors.DefaultSelector() as selector:
                selector.register(process.stdout, selectors.EVENT_READ)
                while selector.get_map():
                    if time.monotonic() >= deadline:
                        raise ValueError('Preparation command timed out; inspect private log')
                    for key, _ in selector.select(0.1):
                        chunk = os.read(key.fd, 65536)
                        if not chunk:
                            selector.unregister(key.fileobj)
                            continue
                        remaining = byte_limit - count
                        output.write(chunk[:remaining]); count += len(chunk)
                        if count > byte_limit:
                            raise ValueError('Preparation command exceeded log limit')
            if process.wait(timeout=max(0.01, deadline - time.monotonic())):
                raise ValueError('Preparation command failed; inspect private log')
        finally:
            if process.poll() is None:
                os.killpg(process.pid, signal.SIGKILL); process.wait()
            process.stdout.close()
            output.flush(); os.fsync(output.fileno())


def json_file(path):
    if path.is_symlink() or not path.is_file() or path.stat().st_size > 8 * 1024 * 1024:
        raise ValueError('Required bounded build/fixture report is absent or unsafe')
    return json.loads(path.read_text())


def record_file(path):
    if path.is_symlink() or not path.is_file():
        raise ValueError('Required generated artifact is absent or unsafe')
    return {'path': str(path), 'sha256': digest(path), 'bytes': path.stat().st_size}


def materializer_commands(reference, assets, node):
    return [
        [sys.executable, str(CRYPTO / 'prototypes/reference/fixtures.py'), '--build-report', str(reference / 'build-result.json'),
         'materialize', '--output', str(assets / 'v4-frame-negatives')],
        [node, str(CRYPTO / 'prototypes/reference/logical_fixtures.mjs'), 'materialize', str(assets / 'v4-logical-materialized')],
    ]


def prepare(platform, output, ndk=None, with_test_assets=False):
    output, ndk = validate_paths(platform, output, ndk)
    node = shutil.which('node')
    if not node:
        raise ValueError('Installed Node is required for independent source signature verification')
    pin_path = CRYPTO / 'source-manifest.json'; pin = json_file(pin_path)
    source, native, reference, assets = (output / p for p in ('source', 'native', 'reference', 'test-assets'))
    output.mkdir(mode=0o700)
    info = output.lstat()
    if not stat.S_ISDIR(info.st_mode) or info.st_uid != os.geteuid() or info.st_mode & 0o077:
        raise ValueError('Preparation output is not an owned private directory')
    report_path = output / 'preparation-report.json'
    report = {'platform': platform, 'status': 'preparing', 'startedAt': datetime.now(timezone.utc).isoformat(),
              'scope': 'Dependency/fixture preparation only; not app linkage, runtime, capacity or release acceptance.',
              'sourcePins': {'manifestSha256': digest(pin_path), 'archiveSha256': pin['archive']['sha256'],
                             'sourceTreeSha256': pin['sourceTree']['sha256']},
              'paths': {'output': str(output), 'source': str(source), 'native': str(native),
                        'reference': str(reference) if with_test_assets else None,
                        'testAssets': str(assets) if with_test_assets else None}, 'commands': [], 'results': {}}
    def save():
        temporary = output / 'preparation-report.tmp'
        fd = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(fd, 'w') as stream:
            stream.write(json.dumps(report, indent=2) + '\n'); stream.flush(); os.fsync(stream.fileno())
        temporary.replace(report_path)
    def step(name, command):
        log = output / (name + '.log')
        entry = {'name': name, 'argv': command, 'log': str(log), 'status': 'running'}
        report['commands'].append(entry); save()
        run_logged(command, log)
        entry.update(status='passed', logSha256=digest(log)); save()
    def verify(name):
        step(name, [sys.executable, str(CRYPTO / 'verify_source.py'), '--source', str(source)])
        verified = json_file(output / (name + '.log'))
        if verified['archiveSha256'] != pin['archive']['sha256'] or verified['sourceTreeSha256'] != pin['sourceTree']['sha256']:
            raise ValueError('Verified source differs from pinned identity')
        return verified
    try:
        save()
        step('source-prepare', [sys.executable, str(CRYPTO / 'prepare_source.py'), '--download', '--output', str(source)])
        report['results']['source'] = verify('source-verify-before-native')
        command = [sys.executable, str(CRYPTO / ('apple/build.py' if platform == 'ios' else 'android/build.py')),
                   '--source', str(source), '--output', str(native)]
        command += ['--deployment-target', '26.0'] if platform == 'ios' else ['--ndk', str(ndk), '--manifest', str(pin_path)]
        step('native-build', command)
        native_report = native / ('build-report.json' if platform == 'ios' else 'build-result.json')
        built = json_file(native_report)
        libraries = []
        if platform == 'ios':
            if built.get('status') != 'passed' or {s['name'] for s in built['slices']} != {'ios-arm64', 'ios-simulator-arm64'} or len(built['slices']) != 2:
                raise ValueError('Incomplete Apple build report')
            pairs = [(native / s['name'] / 'install/lib/libsodium.a', s['artifacts']['install/lib/libsodium.a']) for s in built['slices']]
        else:
            if {b['abi'] for b in built['builds']} != {'arm64-v8a', 'armeabi-v7a', 'x86', 'x86_64'} or len(built['builds']) != 4 or built['manifestSha256'] != digest(pin_path):
                raise ValueError('Incomplete Android build report')
            pairs = [(native / b['abi'] / 'lib/libsodium.a', b['archiveSha256']) for b in built['builds']]
        for path, expected in pairs:
            record = record_file(path)
            if record['sha256'] != expected:
                raise ValueError('Generated library digest differs from builder report')
            libraries.append(record)
        report['results']['native'] = {'report': record_file(native_report), 'libraries': libraries}
        verify('source-verify-after-native')
        if with_test_assets:
            step('reference-build', [sys.executable, str(CRYPTO / 'prototypes/reference/build_reference.py'),
                                     '--source', str(source), '--output', str(reference), '--check'])
            ref = json_file(reference / 'build-result.json')
            library = safe_path(ref['library']).resolve(strict=True)
            if not library.is_relative_to(reference) or record_file(library)['sha256'] != ref['librarySha256']:
                raise ValueError('Reference library identity mismatch')
            report['results']['reference'] = {'report': record_file(reference / 'build-result.json'), 'library': record_file(library)}
            assets.mkdir(mode=0o700)
            for name, command in zip(('frame-materialize', 'logical-materialize'), materializer_commands(reference, assets, node)):
                step(name, command)
            frame = assets / 'v4-frame-negatives/negative-manifest.json'
            logical = assets / 'v4-logical-materialized/fixture-manifest.json'
            fm, lm = json_file(frame), json_file(logical)
            if len(fm['cases']) != 28 or len(lm['positives']) != 10 or len(lm['negatives']) != 60:
                raise ValueError('Shared generated fixture inventory changed')
            for folder, cases, size, sha in ((frame.parent, fm['cases'], 'ciphertextBytes', 'ciphertextSha256'),
                                           (logical.parent, lm['positives'] + lm['negatives'], 'plaintextBytes', 'plaintextSha256')):
                for case in cases:
                    if Path(case['file']).name != case['file']:
                        raise ValueError('Unexpected generated fixture path')
                    actual = record_file(folder / case['file'])
                    if actual['sha256'] != case[sha] or actual['bytes'] != case[size]:
                        raise ValueError('Generated fixture bytes differ from manifest')
            report['results']['testAssets'] = {'frameManifest': record_file(frame), 'logicalManifest': record_file(logical),
                                             'frameNegatives': 28, 'logicalPositives': 10, 'logicalNegatives': 60}
            verify('source-verify-final')
        report['status'] = 'passed'; save()
        return report
    except BaseException as error:
        report['status'] = 'failed'; report['error'] = type(error).__name__ + ': ' + str(error)
        if report['commands'] and report['commands'][-1]['status'] == 'running':
            report['commands'][-1]['status'] = 'failed'
        save()
        raise


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('platform', choices=['ios', 'android'])
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--ndk', type=Path)
    parser.add_argument('--with-test-assets', action='store_true')
    args = parser.parse_args()
    try:
        prepare(args.platform, args.output, args.ndk, args.with_test_assets)
        print(json.dumps({'status': 'passed', 'report': str(args.output / 'preparation-report.json')}))
    except (ValueError, OSError, KeyError, subprocess.SubprocessError) as error:
        print(json.dumps({'status': 'failed', 'error': str(error)}))
        return 1
    return 0


if __name__ == '__main__':
    sys.exit(main())
