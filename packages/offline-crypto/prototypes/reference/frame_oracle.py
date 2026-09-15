#!/usr/bin/env python3
"""PUBLIC-FIXTURE v4 frame oracle; NOT a ledger validator or application codec."""
import argparse
import ctypes as C
import hashlib
import io
import json
from pathlib import Path
import re
import struct

HERE = Path(__file__).resolve().parent
PACKAGE = HERE.parents[1]
REPO = PACKAGE.parents[1]
FIXTURES = REPO/'packages/offline-contract/fixtures/v4-frames'
MAGIC = b'PNYBKP4\n'
CONTEXT = b'PENNY-OFFLINE-BACKUP:4:SECRETSTREAM'
AAD = b'PENNY-OFFLINE-BACKUP:4:FRAME\0'
CHUNK = 1 << 20
MAX_FRAMES = 640
MAX_PLAIN = 640 * CHUNK
MAX_FILE = 768 * CHUNK
PUBLIC_ROOT = bytes([7]) * 32
PUBLIC_RECOVERY = 'pny1-' + PUBLIC_ROOT.hex()

class FrameError(ValueError):
    pass

class FixtureRandom:
    """Documented libsodium TEST RNG hook. Public bytes; NEVER use in an app."""
    def __init__(self):
        self.reset('initialization')
        self.name_buffer = C.create_string_buffer(b'penny-public-fixture-rng-v1')
        name_t = C.CFUNCTYPE(C.c_void_p)
        random_t = C.CFUNCTYPE(C.c_uint32)
        stir_t = C.CFUNCTYPE(None)
        uniform_t = C.CFUNCTYPE(C.c_uint32,C.c_uint32)
        buf_t = C.CFUNCTYPE(None,C.c_void_p,C.c_size_t)
        close_t = C.CFUNCTYPE(C.c_int)
        class Impl(C.Structure):
            _fields_ = [('name',name_t),('random',random_t),('stir',stir_t),('uniform',uniform_t),('buf',buf_t),('close',close_t)]
        self.callbacks = (name_t(lambda: C.addressof(self.name_buffer)),random_t(lambda: int.from_bytes(self.take(4),'little')),stir_t(),uniform_t(),buf_t(lambda out,n:C.memmove(out,self.take(n),n)),close_t())
        self.impl = Impl(*self.callbacks)
    def reset(self, name):
        self.seed = hashlib.sha256(b'PENNY-PUBLIC-V4-FIXTURE-RNG:1\0'+name.encode('ascii')).digest()
        self.counter = 0
    def take(self,n):
        # This is public test data expansion via standard SHA-256, not a CSPRNG.
        out=bytearray()
        while len(out)<n:
            out.extend(hashlib.sha256(self.seed+self.counter.to_bytes(8,'big')).digest());self.counter+=1
        return bytes(out[:n])

class Sodium:
    def __init__(self, build_report, fixture_rng=False):
        report=json.loads(Path(build_report).read_text());pin=json.loads((PACKAGE/'source-manifest.json').read_text())
        if report['source']['archiveSha256']!=pin['archive']['sha256'] or report['source']['sourceTreeSha256']!=pin['sourceTree']['sha256']:
            raise ValueError('Oracle source provenance does not match reviewed pin')
        lib=Path(report['library'])
        if hashlib.sha256(lib.read_bytes()).hexdigest()!=report['librarySha256']:
            raise ValueError('Oracle library digest mismatch')
        self.report=report;self.lib=C.CDLL(str(lib));self.rng=None
        def bind(name,args,ret):
            f=getattr(self.lib,name);f.argtypes=args;f.restype=ret;return f
        ptr=C.c_void_p;size=C.c_size_t;ull=C.c_ulonglong
        self.version=bind('sodium_version_string',[],C.c_char_p)
        if self.version()!=b'1.0.22':raise ValueError('Unsupported libsodium version')
        if fixture_rng:
            self.rng=FixtureRandom();setter=bind('randombytes_set_implementation',[ptr],C.c_int)
            if setter(C.byref(self.rng.impl))!=0:raise ValueError('Fixture RNG setup failed')
        if bind('sodium_init',[],C.c_int)()<0:raise ValueError('sodium_init failed')
        self.zero=bind('sodium_memzero',[ptr,size],None)
        self.random=bind('randombytes_buf',[ptr,size],None)
        self.extract=bind('crypto_kdf_hkdf_sha256_extract',[ptr,ptr,size,ptr,size],C.c_int)
        self.expand=bind('crypto_kdf_hkdf_sha256_expand',[ptr,size,ptr,size,ptr],C.c_int)
        self.init_push=bind('crypto_secretstream_xchacha20poly1305_init_push',[ptr,ptr,ptr],C.c_int)
        self.init_pull=bind('crypto_secretstream_xchacha20poly1305_init_pull',[ptr,ptr,ptr],C.c_int)
        self.push=bind('crypto_secretstream_xchacha20poly1305_push',[ptr,ptr,ptr,ptr,ull,ptr,ull,C.c_ubyte],C.c_int)
        self.pull=bind('crypto_secretstream_xchacha20poly1305_pull',[ptr,ptr,ptr,ptr,ptr,ull,ptr,ull],C.c_int)
        self.state_bytes=bind('crypto_secretstream_xchacha20poly1305_statebytes',[],size)()
        sizes=[bind('crypto_secretstream_xchacha20poly1305_'+x,[],size)() for x in ('keybytes','headerbytes','abytes')]
        if sizes!=[32,24,17] or not 1<=self.state_bytes<=256:raise ValueError('Unexpected library ABI')
    def state(self):return (C.c_uint64*((self.state_bytes+7)//8))()
    def derive(self,root,salt):
        if len(root)!=32 or len(salt)!=32:raise ValueError('Root/salt width')
        prk=C.create_string_buffer(32);key=C.create_string_buffer(32)
        try:
            if self.extract(prk,buf(salt),32,buf(root),32)!=0 or self.expand(key,32,buf(CONTEXT),len(CONTEXT),prk)!=0:raise FrameError('hkdf')
            return key
        finally:self.zero(prk,32)

def buf(data):return C.create_string_buffer(data,max(1,len(data)))

def pattern(count,offset=0):
    if not 0<=count<=3*CHUNK:raise ValueError('Fixture pattern allocation bound')
    seed=bytes(range(251));start=offset%251
    return (seed*((start+count+250)//251))[start:start+count]

def plaintext(descriptor):
    if descriptor['kind']=='pattern-mod-251':return pattern(descriptor['bytes'])
    if descriptor['kind']=='layout':
        layouts=json.loads((FIXTURES.parent/'v4-design/layout-vectors.json').read_text())
        return bytes.fromhex(next(x for x in layouts['records'] if x['name']==descriptor['name'])['logicalHex'])
    raise ValueError('Unsupported public plaintext descriptor')

def encrypt_fixture(sodium,chunks,name,*,aad_domain=AAD):
    """Only public fixtures; deliberately permits malformed tag/shape test cases."""
    if sodium.rng is None:raise ValueError('Fixture-only generator requires explicit test RNG')
    if not re.fullmatch(r'[a-z0-9-]+',name):raise ValueError('Fixture name')
    if len(chunks)>4 or any(len(p)>CHUNK for p,_ in chunks):raise ValueError('Fixture allocation bound')
    sodium.rng.reset(name)
    salt=C.create_string_buffer(32);ss_header=C.create_string_buffer(24)
    sodium.random(salt,32);key=sodium.derive(PUBLIC_ROOT,salt.raw);state=sodium.state()
    try:
        if sodium.init_push(state,ss_header,key)!=0:raise FrameError('init-push')
        header=MAGIC+struct.pack('>HI',4,CHUNK)+salt.raw+ss_header.raw;out=bytearray(header)
        for sequence,(plain,tag) in enumerate(chunks):
            fh=struct.pack('>QQ',sequence,len(plain)+17);ad=aad_domain+header+fh
            sealed=C.create_string_buffer(len(plain)+17);n=C.c_ulonglong()
            if sodium.push(state,sealed,C.byref(n),buf(plain),len(plain),buf(ad),len(ad),tag)!=0 or n.value!=len(plain)+17:raise FrameError('push')
            out.extend(fh);out.extend(sealed.raw)
        return bytes(out)
    finally:sodium.zero(state,C.sizeof(state));sodium.zero(key,32)

def verify_stream(sodium,source,root=PUBLIC_ROOT):
    """Returns a summary only after complete frame authentication and strict EOF."""
    consumed=0;digest=hashlib.sha256();file_digest=hashlib.sha256();total=0;state=None;key=None
    def read(n):
        nonlocal consumed
        out=bytearray()
        while len(out)<n:
            part=source.read(n-len(out))
            if not isinstance(part,bytes):raise FrameError('io-contract')
            if not part:break
            if len(part)>n-len(out):raise FrameError('io-contract')
            consumed+=len(part)
            if consumed>MAX_FILE:raise FrameError('file-limit')
            file_digest.update(part);out.extend(part)
        return bytes(out)
    def exact(n,code):
        result=read(n)
        if len(result)!=n:raise FrameError(code)
        return result
    try:
        prefix=read(8)
        if prefix!=MAGIC:
            if (prefix and b'PNYBKP'.startswith(prefix)) or prefix.startswith(b'PNYBKP'):raise FrameError('reserved-prefix')
            raise FrameError('not-v4')
        header=prefix+exact(62,'truncated-header')
        version,chunk=struct.unpack('>HI',header[8:14])
        if version!=4 or chunk!=CHUNK:raise FrameError('header-constant')
        key=sodium.derive(root,header[14:46]);state=sodium.state()
        if sodium.init_pull(state,buf(header[46:70]),key)!=0:raise FrameError('init-pull')
        for expected in range(MAX_FRAMES):
            fh=exact(16,'missing-final-or-frame-header');sequence,n=struct.unpack('>QQ',fh)
            if sequence>=MAX_FRAMES or sequence!=expected:raise FrameError('sequence')
            if not 18<=n<=CHUNK+17:raise FrameError('ciphertext-length')
            ciphertext=exact(n,'truncated-ciphertext');plain=C.create_string_buffer(n-17);size=C.c_ulonglong();tag=C.c_ubyte();ad=AAD+header+fh
            try:
                if sodium.pull(state,plain,C.byref(size),C.byref(tag),buf(ciphertext),n,buf(ad),len(ad))!=0:raise FrameError('authentication')
                if size.value!=n-17:raise FrameError('plaintext-length')
                if tag.value not in (0,3):raise FrameError('unsupported-tag')
                if tag.value==0 and size.value!=CHUNK:raise FrameError('short-message')
                total+=size.value
                if total>MAX_PLAIN:raise FrameError('plaintext-limit')
                digest.update(plain.raw)
            finally:
                sodium.zero(plain,n-17)
            if tag.value==3:
                if read(1):raise FrameError('trailing-data')
                return dict(scope='frame-only; no logical ledger admission',frames=expected+1,plaintextBytes=total,plaintextSha256=digest.hexdigest(),ciphertextBytes=consumed,ciphertextSha256=file_digest.hexdigest())
        raise FrameError('frame-limit')
    finally:
        if state is not None:sodium.zero(state,C.sizeof(state))
        if key is not None:sodium.zero(key,32)

def file_blocks(data):
    """Trusted fixture recipe helper, not the admission parser."""
    result=[];at=70
    while at<len(data):
        n=struct.unpack('>Q',data[at+8:at+16])[0];result.append(data[at:at+16+n]);at+=16+n
    if at!=len(data):raise ValueError('Recipe base is not framed')
    return result

def materialize(sodium,case,positives):
    recipe=case['recipe'];op=recipe['op'];base=positives.get(recipe.get('base'))
    if op=='reader-key':return base,bytes([8])*32
    if op=='flip':
        data=bytearray(base);data[recipe['offset']]^=recipe['xor'];return bytes(data),PUBLIC_ROOT
    if op=='truncate':return base[:recipe['bytes']],PUBLIC_ROOT
    if op=='append':return base+bytes.fromhex(recipe['hex']),PUBLIC_ROOT
    if op=='set-u64':
        data=bytearray(base);data[recipe['offset']:recipe['offset']+8]=int(recipe['value']).to_bytes(8,'big');return bytes(data),PUBLIC_ROOT
    if op=='blocks':
        blocks=file_blocks(base);return base[:70]+b''.join(blocks[i] for i in recipe['order']),PUBLIC_ROOT
    if op=='splice':
        blocks=file_blocks(base);donor=file_blocks(positives[recipe['donor']]);blocks[recipe['index']]=donor[recipe['donorIndex']];return base[:70]+b''.join(blocks),PUBLIC_ROOT
    if op=='encrypt-invalid':
        offset=0;chunks=[]
        for item in recipe['chunks']:
            n=item['bytes'];chunks.append((pattern(n,offset),item['tag']));offset+=n
        return encrypt_fixture(sodium,chunks,case['name'],aad_domain=bytes.fromhex(recipe['aadHex']) if 'aadHex' in recipe else AAD),PUBLIC_ROOT
    raise ValueError('Unknown fixture recipe')

def main():
    ap=argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--build-report',type=Path,default=HERE/'.build/host/build-result.json')
    sub=ap.add_subparsers(dest='command',required=True)
    p=sub.add_parser('verify');p.add_argument('file',type=Path);p.add_argument('--expected-bytes',type=int);p.add_argument('--expected-sha256')
    args=ap.parse_args();sodium=Sodium(args.build_report)
    with args.file.open('rb') as source:summary=verify_stream(sodium,source)
    if args.expected_bytes is not None and summary['plaintextBytes']!=args.expected_bytes:raise FrameError('expected-size')
    if args.expected_sha256 is not None and summary['plaintextSha256']!=args.expected_sha256:raise FrameError('expected-digest')
    print(json.dumps(summary,sort_keys=True))

if __name__=='__main__':main()
