"""Orchestration-only tests: no download, configure, compilation or signing."""
import importlib.util
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('prepare_app_crypto', Path(__file__).with_name('prepare-app-crypto.py'))
prepare = importlib.util.module_from_spec(spec); spec.loader.exec_module(prepare)


class PreparationTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(); self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name).resolve()
        self.output = self.root / 'result'
        self.ndk = self.root / 'ndk'; self.ndk.mkdir()
        (self.ndk / 'source.properties').write_text('Pkg.Revision = 28.2.13676358\n')
        self.pin = json.loads((prepare.CRYPTO / 'source-manifest.json').read_text())
        self.commands = []

    def write(self, path, value):
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(value))

    def fake(self, command, log):
        self.commands.append(command)
        log.write_text('synthetic orchestration test only\n')
        if 'prepare_source.py' in command[1]:
            Path(command[-1]).mkdir()
        elif 'verify_source.py' in command[1]:
            log.write_text(json.dumps({'archiveSha256': self.pin['archive']['sha256'], 'sourceTreeSha256': self.pin['sourceTree']['sha256']}))
        elif command[1].endswith('apple/build.py') or command[1].endswith('android/build.py'):
            native = self.output / 'native'; entries = []
            apple = command[1].endswith('apple/build.py')
            names = ['ios-arm64', 'ios-simulator-arm64'] if apple else ['arm64-v8a', 'armeabi-v7a', 'x86', 'x86_64']
            for name in names:
                library = native / name / ('install/lib/libsodium.a' if apple else 'lib/libsodium.a')
                library.parent.mkdir(parents=True); library.write_bytes(b'not a native library')
                entries.append({'name': name, 'artifacts': {'install/lib/libsodium.a': prepare.digest(library)}} if apple else {'abi': name, 'archiveSha256': prepare.digest(library)})
            self.write(native / ('build-report.json' if apple else 'build-result.json'),
                       {'status': 'passed', 'slices': entries} if apple else {'builds': entries, 'manifestSha256': prepare.digest(prepare.CRYPTO / 'source-manifest.json')})
        elif command[1].endswith('build_reference.py'):
            library = self.output / 'reference/install/lib/synthetic.so'
            library.parent.mkdir(parents=True); library.write_bytes(b'not an executable library')
            self.write(self.output / 'reference/build-result.json', {'library': str(library), 'librarySha256': prepare.digest(library)})
        elif 'materialize' in command:
            frame = command[1].endswith('/fixtures.py')
            folder = Path(command[-1]); folder.mkdir(parents=True)
            cases = []
            for index in range(28 if frame else 70):
                file = folder / f'{index}.public'; file.write_bytes(b'public test')
                cases.append({'file': file.name, 'ciphertextBytes' if frame else 'plaintextBytes': file.stat().st_size,
                              'ciphertextSha256' if frame else 'plaintextSha256': prepare.digest(file)})
            self.write(folder / ('negative-manifest.json' if frame else 'fixture-manifest.json'),
                       {'cases': cases} if frame else {'positives': cases[:10], 'negatives': cases[10:]})
        else:
            self.fail('Unexpected command')

    def test_ios_authentication_order_and_no_test_assets_by_default(self):
        with patch.object(prepare, 'run_logged', side_effect=self.fake):
            report = prepare.prepare('ios', self.output)
        self.assertEqual(report['status'], 'passed')
        self.assertEqual([Path(c[1]).name for c in self.commands], ['prepare_source.py', 'verify_source.py', 'build.py', 'verify_source.py'])
        self.assertIn('--download', self.commands[0]); self.assertIn('--deployment-target', self.commands[2])
        self.assertIsNone(report['paths']['testAssets'])
        self.assertFalse((self.output / 'reference').exists())
        self.assertEqual(len(report['results']['native']['libraries']), 2)
        self.assertEqual((self.output.stat().st_mode & 0o777), 0o700)

    def test_android_exact_paths_asset_counts_and_explicit_ndk(self):
        with patch.object(prepare, 'run_logged', side_effect=self.fake):
            report = prepare.prepare('android', self.output, self.ndk, True)
        self.assertIn(str(self.ndk), self.commands[2]); self.assertIn('--manifest', self.commands[2])
        self.assertIn('--check', self.commands[4])
        self.assertEqual(self.commands[5], prepare.materializer_commands(self.output / 'reference', self.output / 'test-assets', self.commands[6][0])[0])
        self.assertEqual(report['results']['testAssets']['frameNegatives'], 28)
        self.assertEqual(report['results']['testAssets']['logicalNegatives'], 60)
        self.assertEqual(report['paths']['native'], str(self.output / 'native'))
        self.assertEqual(len(report['results']['native']['libraries']), 4)

    def test_authentication_failure_stops_before_any_upstream_builder(self):
        def fail(command, log):
            self.fake(command, log)
            if command[1].endswith('verify_source.py'): raise ValueError('synthetic pin refusal')
        with patch.object(prepare, 'run_logged', side_effect=fail), self.assertRaises(ValueError):
            prepare.prepare('ios', self.output)
        self.assertEqual(len(self.commands), 2)
        report = json.loads((self.output / 'preparation-report.json').read_text())
        self.assertEqual(report['status'], 'failed'); self.assertTrue((self.output / 'source').exists())
        self.assertTrue((self.output / 'source-verify-before-native.log').exists())
        with self.assertRaises(ValueError): prepare.prepare('ios', self.output)

    def test_library_mismatch_failure_retains_partial_outputs(self):
        def tamper(command, log):
            self.fake(command, log)
            if command[1].endswith('apple/build.py'):
                (self.output / 'native/ios-arm64/install/lib/libsodium.a').write_bytes(b'changed')
        with patch.object(prepare, 'run_logged', side_effect=tamper), self.assertRaises(ValueError):
            prepare.prepare('ios', self.output)
        self.assertTrue((self.output / 'native/build-report.json').exists())
        self.assertEqual(json.loads((self.output / 'preparation-report.json').read_text())['status'], 'failed')

    def test_bad_paths_and_ndk_fail_before_output_or_command(self):
        for output in (Path('relative'), self.root / 'with space', self.root / 'no-parent/new', prepare.ROOT / 'new-source-dir'):
            with self.assertRaises(ValueError): prepare.validate_paths('ios', output, None)
        link = self.root / 'linked'; link.symlink_to(self.ndk, target_is_directory=True)
        for ndk in (None, link, self.root / 'missing'):
            with self.assertRaises(ValueError): prepare.validate_paths('android', self.output, ndk)
        with self.assertRaises(ValueError): prepare.validate_paths('ios', self.output, self.ndk)
        (self.ndk / 'source.properties').write_text('Pkg.Revision = 29.0.0')
        with self.assertRaises(ValueError): prepare.validate_paths('android', self.output, self.ndk)
        self.assertFalse(self.output.exists())

    def test_missing_node_and_existing_output_do_not_start_work(self):
        with patch.object(prepare.shutil, 'which', return_value=None), patch.object(prepare, 'run_logged') as run, self.assertRaises(ValueError):
            prepare.prepare('ios', self.output)
        run.assert_not_called(); self.assertFalse(self.output.exists())
        self.output.mkdir(); (self.output / 'keep').write_bytes(b'unchanged')
        with self.assertRaises(ValueError): prepare.prepare('ios', self.output)
        self.assertEqual((self.output / 'keep').read_bytes(), b'unchanged')

    def test_command_failure_timeout_and_actual_output_bound_keep_logs(self):
        for index, (script, kwargs) in enumerate([
            ('print("failure"); raise SystemExit(1)', {}),
            ('import time; time.sleep(10)', {'timeout': 0.05}),
            ('print("x"*100000)', {'byte_limit': 100}),
        ]):
            log = self.root / f'command{index}.log'
            with self.assertRaises(ValueError):
                prepare.run_logged([sys.executable, '-c', script], log, **kwargs)
            self.assertTrue(log.exists())
            self.assertLessEqual(log.stat().st_size, kwargs.get('byte_limit', 32 * 1024 * 1024))


if __name__ == '__main__': unittest.main()
