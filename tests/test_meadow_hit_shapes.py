"""Optional v2 plant discovery must not invent or overwrite missing art."""
import hashlib
import importlib.util
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch


ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('meadow_hit_shapes', ROOT / 'scripts/generate-meadow-hit-shapes.py')
generator = importlib.util.module_from_spec(spec)
spec.loader.exec_module(generator)


class MeadowHitShapeTests(unittest.TestCase):
    def test_missing_optional_directory_leaves_only_required_growth_paths(self):
        with tempfile.TemporaryDirectory() as directory:
            files = generator.discover_assets(Path(directory))
            self.assertEqual(set(files), {'seed-in-soil', 'sprout', 'bud'})
            self.assertTrue(all('/v1/' in path.as_posix() for path in files.values()))

    def test_delivered_v2_flower_overrides_same_key_without_assuming_other_files(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            original = root / 'public/xiaoya/paper/v1/flowers'
            updated = root / 'public/xiaoya/paper/v2/flowers'
            original.mkdir(parents=True)
            updated.mkdir(parents=True)
            # Discovery uses filenames only. No image generation or source-art edits.
            for path in [original / 'daisy.webp', original / 'bow-rainbow.webp',
                         updated / 'bow-rainbow.webp', updated / 'unlisted.webp']:
                path.touch()
            files = generator.discover_assets(root)
            self.assertEqual(files['flower-daisy'], original / 'daisy.webp')
            self.assertEqual(files['flower-bow-rainbow'], updated / 'bow-rainbow.webp')
            self.assertNotIn('flower-bow-starlight', files)
            self.assertNotIn('flower-unlisted', files)
            (updated / 'bow-starlight.webp').touch()
            self.assertEqual(generator.discover_assets(root)['flower-bow-starlight'], updated / 'bow-starlight.webp')

    def test_shape_keeps_requested_key_and_real_source_hash_without_writing_module(self):
        source = ROOT / 'public/xiaoya/paper/v1/flowers/daisy.webp'
        with patch.object(Path, 'write_text', side_effect=AssertionError('building shapes must not write output')):
            shapes = generator.build_shapes({'flower-bow-rainbow': source})
        self.assertEqual(list(shapes), ['flower-bow-rainbow'])
        shape = shapes['flower-bow-rainbow']
        self.assertEqual(shape['sha256'], hashlib.sha256(source.read_bytes()).hexdigest())
        self.assertTrue(shape['path'].startswith('M'))
        self.assertTrue(shape['path'].endswith('Z'))
        self.assertGreater(len(shape['path']), 100)


if __name__ == '__main__':
    unittest.main()
