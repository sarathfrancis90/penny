#!/usr/bin/env python3
"""Tamper actual validated build copies; reject before compiler invocation."""
import argparse
import json
import shutil
import tempfile
from pathlib import Path
from unittest.mock import patch
import verify_build as verifier


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--build', required=True); parser.add_argument('--source', required=True)
    args = parser.parse_args()
    build, source = verifier.safe_path(args.build), verifier.safe_path(args.source)
    verifier.verify_build(build, source)
    cases = ['extra-header', 'header-symlink', 'changed-library', 'wrong-platform', 'wrong-deployment']
    for case in cases:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary) / 'build'; root.mkdir()
            report = json.loads((build / 'build-report.json').read_text())
            for row in report['slices']:
                shutil.copytree(build / row['name'] / 'install', root / row['name'] / 'install')
            install = root / 'ios-arm64/install'
            if case == 'extra-header': (install / 'include/stdint.h').write_text('unrecorded')
            if case == 'header-symlink':
                (install / 'include/sodium.h').unlink()
                (install / 'include/sodium.h').symlink_to(build / 'ios-arm64/install/include/sodium.h')
            if case == 'changed-library':
                with (install / 'lib/libsodium.a').open('ab') as stream: stream.write(b'changed')
            if case == 'wrong-platform':
                shutil.copyfile(build / 'ios-simulator-arm64/install/lib/libsodium.a', install / 'lib/libsodium.a')
                report['slices'][0]['artifacts']['install/lib/libsodium.a'] = verifier.digest(install / 'lib/libsodium.a')
            if case == 'wrong-deployment': report['deploymentTarget'] = '25.0'
            (root / 'build-report.json').write_text(json.dumps(report))
            # Platform case reaches read-only Mach-O inspection; every other case
            # must reject before even that process runs, with no output creation.
            def reject():
                try: verifier.verify_build(root, source)
                except ValueError: return
                raise AssertionError('accepted ' + case)
            if case == 'wrong-platform': reject()
            else:
                with patch.object(verifier, 'inspect', side_effect=AssertionError('process must not run')): reject()
    print(json.dumps({'status': 'passed', 'positive': 1, 'rejections': cases}))


if __name__ == '__main__': main()
