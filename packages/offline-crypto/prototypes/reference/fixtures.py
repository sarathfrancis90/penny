#!/usr/bin/env python3
"""Generate/verify public v4 frame goldens and compact invalid-file recipes."""
import argparse
import hashlib
import io
import json
from pathlib import Path
from frame_oracle import (Sodium,FrameError,HERE,FIXTURES,PACKAGE,CHUNK,AAD,PUBLIC_ROOT,
                          PUBLIC_RECOVERY,plaintext,encrypt_fixture,verify_stream,materialize)

def digest(data):return hashlib.sha256(data).hexdigest()

def build(sodium):
    positives={};entries=[]
    specifications=[('empty-ledger',{'kind':'layout','name':'empty'}),('one-receipt',{'kind':'layout','name':'one-expense-one-receipt'}),('full-final',{'kind':'pattern-mod-251','bytes':CHUNK}),('multi-frame',{'kind':'pattern-mod-251','bytes':2*CHUNK+37})]
    for name,desc in specifications:
        plain=plaintext(desc);parts=[plain[i:i+CHUNK] for i in range(0,len(plain),CHUNK)]
        sealed=encrypt_fixture(sodium,[(part,3 if i==len(parts)-1 else 0) for i,part in enumerate(parts)],name)
        verified=verify_stream(sodium,io.BytesIO(sealed))
        assert verified['plaintextSha256']==digest(plain)
        positives[name]=sealed
        entries.append(dict(name=name,file=name+'.pennyframe',plaintext=desc,recoveryKey=PUBLIC_RECOVERY,**verified))
    cases=[]
    def case(name,error,recipe):cases.append(dict(name=name,expectedError=error,recipe=recipe))
    case('wrong-key','authentication',dict(op='reader-key',base='empty-ledger'))
    case('wrong-aad','authentication',dict(op='encrypt-invalid',chunks=[dict(bytes=37,tag=3)],aadHex=(AAD[:-1]+b'!').hex()))
    case('salt-tamper','authentication',dict(op='flip',base='empty-ledger',offset=14,xor=1))
    case('stream-header-tamper','authentication',dict(op='flip',base='empty-ledger',offset=46,xor=1))
    case('ciphertext-tamper','authentication',dict(op='flip',base='empty-ledger',offset=86,xor=1))
    case('tag-tamper','authentication',dict(op='flip',base='empty-ledger',offset=len(positives['empty-ledger'])-1,xor=1))
    case('truncated-ciphertext','truncated-ciphertext',dict(op='truncate',base='empty-ledger',bytes=len(positives['empty-ledger'])-1))
    case('missing-final','missing-final-or-frame-header',dict(op='blocks',base='multi-frame',order=[0,1]))
    case('reordered','sequence',dict(op='blocks',base='multi-frame',order=[1,0,2]))
    case('duplicated','sequence',dict(op='blocks',base='multi-frame',order=[0,0,1,2]))
    case('spliced','authentication',dict(op='splice',base='multi-frame',donor='full-final',index=0,donorIndex=0))
    case('trailing-data','trailing-data',dict(op='append',base='full-final',hex='00'))
    case('push-tag','unsupported-tag',dict(op='encrypt-invalid',chunks=[dict(bytes=CHUNK,tag=1)]))
    case('rekey-tag','unsupported-tag',dict(op='encrypt-invalid',chunks=[dict(bytes=CHUNK,tag=2)]))
    case('short-message','short-message',dict(op='encrypt-invalid',chunks=[dict(bytes=37,tag=0),dict(bytes=23,tag=3)]))
    case('empty-final','ciphertext-length',dict(op='encrypt-invalid',chunks=[dict(bytes=0,tag=3)]))
    case('full-message-without-final','missing-final-or-frame-header',dict(op='encrypt-invalid',chunks=[dict(bytes=CHUNK,tag=0)]))
    case('oversize-sequence','sequence',dict(op='set-u64',base='empty-ledger',offset=70,value='640'))
    case('unsigned-sequence-overflow','sequence',dict(op='set-u64',base='empty-ledger',offset=70,value='18446744073709551615'))
    case('oversize-ciphertext','ciphertext-length',dict(op='set-u64',base='empty-ledger',offset=78,value=str(CHUNK+18)))
    case('unsigned-length-overflow','ciphertext-length',dict(op='set-u64',base='empty-ledger',offset=78,value='18446744073709551615'))
    case('below-minimum-ciphertext','ciphertext-length',dict(op='set-u64',base='empty-ledger',offset=78,value='17'))
    case('wrong-envelope-version','header-constant',dict(op='flip',base='empty-ledger',offset=9,xor=1))
    case('wrong-chunk-limit','header-constant',dict(op='flip',base='empty-ledger',offset=13,xor=1))
    case('reserved-magic-version','reserved-prefix',dict(op='flip',base='empty-ledger',offset=6,xor=1))
    case('truncated-magic','reserved-prefix',dict(op='truncate',base='empty-ledger',bytes=5))
    case('truncated-header','truncated-header',dict(op='truncate',base='empty-ledger',bytes=69))
    case('truncated-frame-header','missing-final-or-frame-header',dict(op='truncate',base='empty-ledger',bytes=85))
    for c in cases:
        data,root=materialize(sodium,c,positives);c['ciphertextBytes']=len(data);c['ciphertextSha256']=digest(data)
        c['recoveryKey']='pny1-'+root.hex()
        try:verify_stream(sodium,io.BytesIO(data),root)
        except FrameError as error:
            if str(error)!=c['expectedError']:raise AssertionError((c['name'],str(error),c['expectedError']))
        else:raise AssertionError('Invalid fixture accepted: '+c['name'])
    pin=json.loads((PACKAGE/'source-manifest.json').read_text())
    manifest=dict(schemaVersion=1,scope='Experimental v4 FRAME ONLY; not complete ledger admission or frozen format',generator='packages/offline-crypto/prototypes/reference/fixtures.py',source=dict(version=pin['version'],upstreamCommit=pin['upstreamCommit'],archiveSha256=pin['archive']['sha256'],sourceTreeSha256=pin['sourceTree']['sha256']),randomness='PUBLIC deterministic test RNG via upstream randombytes_set_implementation; never use in applications',positives=entries,negativeRecipes=cases)
    return manifest,positives

def main():
    ap=argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--build-report',type=Path,default=HERE/'.build/host/build-result.json')
    ap.add_argument('command',choices=['generate','verify','materialize'])
    ap.add_argument('--output',type=Path,help='new directory for temporary malformed files')
    args=ap.parse_args();sodium=Sodium(args.build_report,fixture_rng=True);manifest,files=build(sodium)
    encoded=json.dumps(manifest,indent=2)+'\n'
    if args.command=='generate':
        FIXTURES.mkdir(parents=True,exist_ok=True)
        for name,data in files.items():(FIXTURES/(name+'.pennyframe')).write_bytes(data)
        (FIXTURES/'fixture-manifest.json').write_text(encoded)
    else:
        if (FIXTURES/'fixture-manifest.json').read_text()!=encoded:raise AssertionError('Manifest differs from reproducible generator')
        for name,data in files.items():
            if (FIXTURES/(name+'.pennyframe')).read_bytes()!=data:raise AssertionError('Golden differs: '+name)
    if args.command=='materialize':
        if args.output is None or args.output.exists():raise ValueError('Supply new --output directory')
        args.output.mkdir(parents=True)
        for c in manifest['negativeRecipes']:
            data,_=materialize(sodium,c,files);(args.output/(c['name']+'.pennyframe')).write_bytes(data)
        (args.output/'fixture-manifest.json').write_text(encoded)
        small=[dict(name=c['name'],file=c['name']+'.pennyframe',recoveryKey=c['recoveryKey'],ciphertextBytes=c['ciphertextBytes'],ciphertextSha256=c['ciphertextSha256'],expected='reject',expectedError=c['expectedError']) for c in manifest['negativeRecipes']]
        (args.output/'negative-manifest.json').write_text(json.dumps(dict(scope=manifest['scope'],cases=small),indent=2)+'\n')
    print(json.dumps(dict(positiveCases=len(manifest['positives']),negativeCases=len(manifest['negativeRecipes']),committedCiphertextBytes=sum(map(len,files.values())),scope=manifest['scope'],reproducible=True)))

if __name__=='__main__':main()
