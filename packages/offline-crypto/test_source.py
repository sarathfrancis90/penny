import hashlib
import io
import json
import os
from pathlib import Path
import tarfile
import tempfile
import unittest
from unittest.mock import patch

from prepare_source import extract_archive
from verify_source import tree_identity, verify_source


class SourceTrustTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary.name)
        self.source = self.root / 'source'
        self.source.mkdir()
        (self.source / 'configure').write_text('#!/bin/sh\nexit 0\n')
        (self.source / 'configure').chmod(0o755)
        (self.source / 'LICENSE').write_text('Synthetic public test source\n')
        self.manifest = {'schemaVersion': 1, 'name': 'libsodium', 'version': 'test',
                         'archive': {'sha256': '0' * 64, 'topLevel': 'libsodium-test'},
                         'sourceTree': {'algorithm': 'penny-tree-v1', **tree_identity(self.source)}}
        self.manifest_path = self.root / 'manifest.json'
        self.manifest_path.write_text(json.dumps(self.manifest))

    def tearDown(self):
        self.temporary.cleanup()

    def test_tree_pin_binds_bytes_members_and_executable_modes(self):
        self.assertEqual(verify_source(self.source, self.manifest_path)['fileCount'], 2)
        for mutation in ('bytes', 'extra', 'missing', 'mode'):
            with self.subTest(mutation=mutation):
                target = self.source / 'configure'
                original = target.read_bytes()
                if mutation == 'bytes': target.write_bytes(original + b'# changed')
                elif mutation == 'extra': (self.source / 'extra').write_text('unexpected')
                elif mutation == 'missing': target.unlink()
                else: target.chmod(0o644)
                with self.assertRaisesRegex(ValueError, 'does not match'):
                    verify_source(self.source, self.manifest_path)
                target.write_bytes(original)
                target.chmod(0o755)
                (self.source / 'extra').unlink(missing_ok=True)

    def test_source_file_and_directory_links_are_refused(self):
        for directory in (False, True):
            with self.subTest(directory=directory):
                link = self.source / 'link'
                link.symlink_to(self.root if directory else self.source / 'LICENSE')
                with self.assertRaisesRegex(ValueError, 'links'):
                    verify_source(self.source, self.manifest_path)
                link.unlink()
        hard_link = self.source / 'hard-link'
        os.link(self.source / 'LICENSE', hard_link)
        with self.assertRaisesRegex(ValueError, 'links'):
            verify_source(self.source, self.manifest_path)

    def archive(self, members):
        path = self.root / 'input.tar.gz'
        with tarfile.open(path, 'w:gz') as archive:
            for member in members:
                body = b'fixture'
                if member.isfile(): member.size = len(body)
                archive.addfile(member, io.BytesIO(body) if member.isfile() else None)
        manifest = {**self.manifest, 'archive': {'topLevel': 'libsodium-test', 'sizeBytes': path.stat().st_size,
                    'sha256': hashlib.sha256(path.read_bytes()).hexdigest()}}
        return path, manifest

    def test_tar_traversal_links_duplicate_and_special_entries_refused(self):
        cases = []
        cases.append([tarfile.TarInfo('libsodium-test/../escape')])
        cases.append([tarfile.TarInfo('/outside')])
        link = tarfile.TarInfo('libsodium-test/link'); link.type = tarfile.SYMTYPE; link.linkname = '/outside'
        cases.append([link])
        hard = tarfile.TarInfo('libsodium-test/hard'); hard.type = tarfile.LNKTYPE; hard.linkname = 'elsewhere'
        cases.append([hard])
        special = tarfile.TarInfo('libsodium-test/special'); special.type = tarfile.FIFOTYPE
        cases.append([special])
        cases.append([tarfile.TarInfo('libsodium-test/repeated'), tarfile.TarInfo('libsodium-test/repeated')])
        for number, members in enumerate(cases):
            with self.subTest(number=number):
                archive, manifest = self.archive(members)
                output = self.root / 'output'
                with self.assertRaises((ValueError, OSError)):
                    extract_archive(archive, output, manifest)
                self.assertFalse(output.exists())
                self.assertFalse((self.root / 'escape').exists())

    def test_existing_output_preserved_and_digest_checked_before_extract(self):
        archive, manifest = self.archive([tarfile.TarInfo('libsodium-test/file')])
        output = self.root / 'output'; output.mkdir(); marker = output / 'keep'; marker.write_text('unchanged')
        with self.assertRaisesRegex(ValueError, 'new directory'):
            extract_archive(archive, output, manifest)
        self.assertEqual(marker.read_text(), 'unchanged')
        archive.write_bytes(b'changed')
        with self.assertRaisesRegex(ValueError, 'pinned size'):
            extract_archive(archive, self.root / 'new-output', manifest)
        self.assertFalse((self.root / 'new-output').exists())

    def test_output_created_during_verification_is_not_replaced(self):
        archive, manifest = self.archive([tarfile.TarInfo('libsodium-test/file')])
        output = self.root / 'raced-output'
        def concurrent_creation(_):
            output.mkdir()
            (output / 'keep').write_text('other owner')
        with patch('prepare_source.verify_source', side_effect=concurrent_creation):
            with self.assertRaises(FileExistsError):
                extract_archive(archive, output, manifest)
        self.assertEqual((output / 'keep').read_text(), 'other owner')


if __name__ == '__main__':
    unittest.main()
