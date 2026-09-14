"""Bounded frame tests, never ledger admission or native lifecycle evidence."""
import hashlib
import io
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from frame_oracle import Sodium,FrameError,HERE,FIXTURES,CHUNK,PUBLIC_ROOT,verify_stream

class Fragmented(io.BytesIO):
    def __init__(self,data):super().__init__(data);self.i=0;self.maximumRequest=0
    def read(self,n=-1):
        self.maximumRequest=max(self.maximumRequest,n)
        limit=(1,3,7,65536)[self.i%4];self.i+=1
        return super().read(min(n,limit))

class Failing(io.BytesIO):
    def read(self,n=-1):
        if self.tell()>=70+16+CHUNK+17:raise OSError('injected input failure after first authenticated frame')
        return super().read(n)

class OracleTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.sodium=Sodium(HERE/'.build/host/build-result.json')
        cls.manifest=json.loads((FIXTURES/'fixture-manifest.json').read_text())
        cls.temporary=tempfile.TemporaryDirectory(prefix='penny-v4-frame-oracle-')
        cls.negative=Path(cls.temporary.name)/'negative'
        subprocess.run([sys.executable,str(HERE/'fixtures.py'),'materialize','--output',str(cls.negative)],check=True,capture_output=True,shell=False)
    @classmethod
    def tearDownClass(cls):cls.temporary.cleanup()
    def test_positive_files_fragmented_and_exact_hashes(self):
        for case in self.manifest['positives']:
            with self.subTest(case=case['name']):
                data=(FIXTURES/case['file']).read_bytes();self.assertEqual(hashlib.sha256(data).hexdigest(),case['ciphertextSha256'])
                source=Fragmented(data);result=verify_stream(self.sodium,source)
                for key in ('frames','plaintextBytes','plaintextSha256','ciphertextBytes','ciphertextSha256'):self.assertEqual(result[key],case[key])
                self.assertLessEqual(source.maximumRequest,CHUNK+17)
    def test_all_negative_recipes(self):
        for case in self.manifest['negativeRecipes']:
            with self.subTest(case=case['name']):
                data=(self.negative/(case['name']+'.pennyframe')).read_bytes()
                self.assertEqual(hashlib.sha256(data).hexdigest(),case['ciphertextSha256'])
                with self.assertRaisesRegex(FrameError,'^'+case['expectedError']+'$'):
                    verify_stream(self.sodium,io.BytesIO(data),bytes.fromhex(case['recoveryKey'][5:]))
    def test_oversized_declarations_do_not_read_body(self):
        for name in ('oversize-sequence','unsigned-sequence-overflow','oversize-ciphertext','unsigned-length-overflow'):
            with self.subTest(case=name):
                source=io.BytesIO((self.negative/(name+'.pennyframe')).read_bytes())
                with self.assertRaises(FrameError):verify_stream(self.sodium,source)
                self.assertEqual(source.tell(),86)
    def test_io_failure_never_returns_authenticated_prefix_as_success(self):
        source=Failing((FIXTURES/'multi-frame.pennyframe').read_bytes())
        with self.assertRaisesRegex(OSError,'injected input failure'):verify_stream(self.sodium,source)
    def test_zero_and_non_v4_inputs_fail_without_legacy_guessing(self):
        for data in (b'',b'{}',b'\xef\xbb\xbfPNYBKP4\n',b' PNYBKP4\n'):
            with self.subTest(data=data),self.assertRaisesRegex(FrameError,'^not-v4$'):verify_stream(self.sodium,io.BytesIO(data))
    def test_incomplete_reserved_prefixes(self):
        for data in (b'P',b'PN',b'PNY',b'PNYB',b'PNYBK',b'PNYBKP',b'PNYBKP4',b'PNYBKP5\n'):
            with self.subTest(data=data),self.assertRaisesRegex(FrameError,'^reserved-prefix$'):verify_stream(self.sodium,io.BytesIO(data))

if __name__=='__main__':unittest.main()
