#!/usr/bin/env python3
"""Verify bad source/configuration never reach source-owned configure code."""
import argparse
import os
from pathlib import Path
import shlex
import shutil
import subprocess
import sys
import tempfile

HERE = Path(__file__).resolve().parent


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, required=True)
    args = parser.parse_args()
    original = args.source.resolve()
    # Current Python and fixed local verifier; source is a separate argument, never code.
    # nosemgrep: python.lang.security.audit.dangerous-subprocess-use-tainted-env-args.dangerous-subprocess-use-tainted-env-args
    subprocess.run([sys.executable, str(HERE.parent / "verify_source.py"), "--source", str(original),
                    "--manifest", str(HERE.parent / "source-manifest.json")], shell=False, check=True, capture_output=True)
    with tempfile.TemporaryDirectory(prefix="penny-apple-source-rejection-") as folder:
        root = Path(folder)
        altered = root / "source"
        shutil.copytree(original, altered)
        marker = root / "configure-executed"
        configure = altered / "configure"
        configure.write_text("#!/bin/sh\ntouch " + shlex.quote(str(marker)) + "\nexit 0\n")
        cases = [(altered, "26.0", "altered-source", {}, None),
                 (original, "25.0", "wrong-deployment", {}, None),
                 (original, "26.0", "output with spaces", {}, "unsupported output path"),
                 (original, "26.0", "output;metacharacter", {}, "unsupported output path"),
                 (root / "source with spaces", "26.0", "bad-source-path", {}, "unsupported source path"),
                 (original, "26.0", "bad-toolchain-path", {"DEVELOPER_DIR": "/tmp/Unsupported Xcode.app/Contents/Developer"}, "unsupported DEVELOPER_DIR path")]
        for source, deployment, name, override, expected in cases:
            output = root / name
            # Deliberately malformed test paths go to fixed local build.py as argv, without a shell.
            # nosemgrep: python.lang.security.audit.dangerous-subprocess-use-tainted-env-args.dangerous-subprocess-use-tainted-env-args
            result = subprocess.run([sys.executable, str(HERE / "build.py"), "--source", str(source),
                                     "--output", str(output), "--deployment-target", deployment],
                                    shell=False, env={**os.environ, **override}, capture_output=True, text=True)
            if result.returncode == 0 or marker.exists() or output.exists():
                raise RuntimeError(f"{name} was not rejected before configure/output mutation")
            if expected and expected not in result.stderr:
                raise RuntimeError(f"{name} did not report its actual unsupported-path reason")
            print(f"PASS {name}: rejected before configure and output creation")


if __name__ == "__main__":
    main()
