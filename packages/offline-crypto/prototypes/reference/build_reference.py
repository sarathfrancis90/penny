#!/usr/bin/env python3
"""Build a host-only ctypes oracle library from the shared verified source tree."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import platform
import re
import subprocess
import sys

HERE = Path(__file__).resolve().parent
PACKAGE = HERE.parents[1]

def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--source', required=True, type=Path)
    p.add_argument('--output', required=True, type=Path)
    p.add_argument('--check', action='store_true', help='Run upstream make check and record exact summary')
    args = p.parse_args()
    source, output = args.source.resolve(), args.output.resolve()
    if not args.source.is_absolute() or not args.output.is_absolute():
        raise ValueError('Absolute paths required')
    if output.exists() or args.output.is_symlink() or source in output.parents or output in source.parents:
        raise ValueError('Output must be new and outside source')
    if any(not re.fullmatch(r'[A-Za-z0-9_./+\-]+', str(x)) for x in (source, output)):
        raise ValueError('Unsupported configure path characters')
    def verify():
        return json.loads(subprocess.check_output([sys.executable,str(PACKAGE/'verify_source.py'),'--source',str(source)],text=True,shell=False))
    before = verify()
    output.mkdir(parents=True)
    work = output/'work'; work.mkdir()
    env = {k: os.environ[k] for k in ('HOME','TMPDIR') if k in os.environ}
    env.update(PATH='/usr/bin:/bin:/usr/sbin:/sbin',LC_ALL='C',CONFIG_SITE='/dev/null',CC='clang',CFLAGS='-Os -fPIC')
    commands = [[str(source/'configure'),'--enable-minimal','--disable-static','--enable-shared','--prefix='+str(output/'install')],['make','-j4','install']]
    with (output/'build.log').open('w') as log:
        for cmd in commands:
            # The configure executable is verified against the pinned source tree;
            # other argv entries are constants or absolute paths restricted above.
            # No shell parses argv, and the child receives only the explicit env.
            subprocess.run(cmd,cwd=work,env=env,stdout=log,stderr=subprocess.STDOUT,check=True,shell=False)  # nosemgrep: python.lang.security.audit.dangerous-subprocess-use-tainted-env-args.dangerous-subprocess-use-tainted-env-args
    upstream = {'run': False}
    if args.check:
        with (output/'upstream-check.log').open('w') as log:
            subprocess.run(['make','-j4','check'],cwd=work,env=env,stdout=log,stderr=subprocess.STDOUT,check=True,shell=False)
        commands.append(['make','-j4','check'])
        summary = dict(re.findall(r'^# (TOTAL|PASS|SKIP|XFAIL|FAIL|XPASS|ERROR):\s*(\d+)\s*$',(output/'upstream-check.log').read_text(),re.M))
        if not summary or int(summary.get('PASS','0')) != int(summary.get('TOTAL','-1')) or any(int(summary.get(k,'-1')) != 0 for k in ('SKIP','XFAIL','FAIL','XPASS','ERROR')):
            raise ValueError('Upstream check did not pass every test without skips')
        upstream = {'run': True, **{k.lower():int(v) for k,v in summary.items()}}
    if verify() != before:
        raise ValueError('Source changed during build')
    name = 'libsodium.dylib' if platform.system() == 'Darwin' else 'libsodium.so'
    lib = (output/'install/lib'/name).resolve()
    report = dict(source=before,library=str(lib),librarySha256=hashlib.sha256(lib.read_bytes()).hexdigest(),host=platform.platform(),commands=commands,upstreamCheck=upstream,scope='host frame oracle only; not native distribution')
    (output/'build-result.json').write_text(json.dumps(report,indent=2)+'\n')
    print(json.dumps(report))

if __name__ == '__main__':
    main()
