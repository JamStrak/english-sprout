"""Publication gates and approved-sample preservation; no GPU/model dependency."""
import copy
import importlib.util
from pathlib import Path
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location('pip_production', ROOT / 'scripts/generate-pip-course.py')
PRODUCTION = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(PRODUCTION)


class PipPublicationTests(unittest.TestCase):
    def setUp(self):
        self.folder = tempfile.TemporaryDirectory()
        self.addCleanup(self.folder.cleanup)
        self.root = Path(self.folder.name)
        self.lessons = [dict(id=f'lesson-{i:03d}', english="I can't find it.") for i in range(120)]
        self.state = dict(entries={}, approved_hashes={})
        self.asr = dict(results=[])
        for lesson in self.lessons:
            relative = lesson['id'] + '.mp3'
            path = self.root / relative
            path.write_bytes(('fixture-' + lesson['id']).encode())
            digest = PRODUCTION.sha(path)
            entry = dict(file=relative, request=dict(text=lesson['english'], lesson_id=lesson['id'],
                         speaker='Serena', candidate='pip', language='English', revision=PRODUCTION.sample.REVISION),
                         metrics=dict(sha256=digest, bytes=path.stat().st_size, decode_ok=True,
                                      clipped_samples=0, flags=[]))
            self.state['entries']['pip/' + lesson['id']] = entry
            self.asr['results'].append(dict(lesson_id=lesson['id'], expected=lesson['english'], sha256=digest,
                                           normalized_match=True, flags=[]))

    def gate(self):
        return PRODUCTION.checked_records(self.state, self.asr, self.lessons, self.root)

    def test_complete_matching_course_passes_without_writes(self):
        before = sorted(self.root.iterdir())
        self.assertEqual(len(self.gate()), 120)
        self.assertEqual(before, sorted(self.root.iterdir()))

    def test_missing_lesson_rejected(self):
        self.state['entries'].pop('pip/lesson-003')
        with self.assertRaises(ValueError): self.gate()

    def test_changed_source_rejected(self):
        (self.root / 'lesson-004.mp3').write_bytes(b'changed')
        with self.assertRaises(ValueError): self.gate()

    def test_lost_negative_word_asr_rejected(self):
        self.asr['results'][0].update(normalized_match=False, recognized='I can find it.')
        with self.assertRaises(ValueError): self.gate()

    def test_low_confidence_matching_text_rejected(self):
        self.asr['results'][0]['flags'] = ['low_asr_token_confidence_heuristic']
        with self.assertRaises(ValueError): self.gate()

    def test_asr_from_older_file_rejected(self):
        self.asr['results'][0]['sha256'] = '0' * 64
        with self.assertRaises(ValueError): self.gate()

    def test_clipping_rejected(self):
        self.state['entries']['pip/lesson-000']['metrics']['clipped_samples'] = 1
        with self.assertRaises(ValueError): self.gate()

    def test_wrong_voice_rejected(self):
        self.state['entries']['pip/lesson-000']['request']['speaker'] = 'Ryan'
        with self.assertRaises(ValueError): self.gate()

    def test_replaced_approved_sample_rejected(self):
        self.state['approved_hashes']['lesson-000'] = 'f' * 64
        with self.assertRaises(ValueError): self.gate()

    def test_stale_course_text_rejected(self):
        self.lessons[0]['english'] = 'I need help.'
        with self.assertRaises(ValueError): self.gate()

    def test_batch_limit_checked_before_model_import(self):
        job = dict(ids=[x['id'] for x in PRODUCTION.curriculum()[:21]], directory=str(PRODUCTION.EVIDENCE/'batches/001'))
        with self.assertRaises(ValueError): PRODUCTION.configure_worker(job)

    def test_approved_sample_never_regenerated(self):
        job = dict(ids=[PRODUCTION.APPROVED_IDS[0]], directory=str(PRODUCTION.EVIDENCE/'batches/001'))
        with self.assertRaises(ValueError): PRODUCTION.configure_worker(job)

    def add_one_phrase_crosscheck(self):
        entry = self.state['entries'].pop('pip/lesson-000')
        self.lessons[0]['id'] = 'meals-04'
        entry['request']['lesson_id'] = 'meals-04'
        entry['raw_metrics'] = dict(sha256='b'*64)
        self.state['entries']['pip/meals-04'] = entry
        self.asr['results'][0].update(lesson_id='meals-04', normalized_match=False,
                                      flags=['transcript_differs_from_reference'])
        cross = dict(model='Systran/faster-whisper-base', modelWeightSHA256=PRODUCTION.BASE_MODEL_SHA256,
                     referencePrompt=False, device='cpu', normalized_match=True, raw_normalized_match=True,
                     expected=self.lessons[0]['english'], sha256=entry['metrics']['sha256'], sourceRawSHA256='b'*64)
        self.state['content_crosschecks'] = {'meals-04': cross}
        return cross

    def test_crosscheck_preserves_original_tiny_failure(self):
        self.add_one_phrase_crosscheck()
        self.assertEqual(len(self.gate()), 120)
        self.assertFalse(self.asr['results'][0]['normalized_match'])
        self.assertEqual(self.asr['results'][0]['flags'], ['transcript_differs_from_reference'])

    def test_crosscheck_wrong_final_hash_rejected(self):
        self.add_one_phrase_crosscheck()['sha256'] = '0'*64
        with self.assertRaises(ValueError): self.gate()

    def test_crosscheck_requires_raw_match_without_prompt(self):
        cross = self.add_one_phrase_crosscheck()
        cross['raw_normalized_match'] = False
        with self.assertRaises(ValueError): self.gate()
        cross.update(raw_normalized_match=True, referencePrompt=True)
        with self.assertRaises(ValueError): self.gate()

    def test_crosscheck_requires_pinned_model(self):
        self.add_one_phrase_crosscheck()['modelWeightSHA256'] = '0'*64
        with self.assertRaises(ValueError): self.gate()


if __name__ == '__main__':
    unittest.main()
