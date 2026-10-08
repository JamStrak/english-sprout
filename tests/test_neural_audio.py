"""Focused safeguards for resumable neural-audio maintenance, without a GPU."""
import importlib.util
from pathlib import Path
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import Mock

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("neural",ROOT/"scripts/generate-neural-audio.py")
neural = importlib.util.module_from_spec(spec)
spec.loader.exec_module(neural)


class NeuralAudioTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.directory = Path(self.temp.name)
        self.args = SimpleNamespace(retry_failed=False,job_timeout=0.01,poll_interval=0.001)
        self.params = neural.parameters("revision",20261008)
        self.api = Mock()
        self.batch = neural.Batch(self.directory,"Aiden",self.params,self.api,self.args,"ffmpeg","ffprobe")
        self.lesson = {"id":"hello-01","english":"Hello, everyone."}

    def tearDown(self):
        self.temp.cleanup()

    def test_fingerprint_changes_with_content_voice_seed_or_sampling(self):
        baseline = neural.fingerprint(self.lesson,"Aiden",self.params)
        variants = [neural.fingerprint(dict(self.lesson,english="Good morning."),"Aiden",self.params),
            neural.fingerprint(self.lesson,"Ryan",self.params),
            neural.fingerprint(self.lesson,"Aiden",neural.parameters("revision",1)),
            neural.fingerprint(self.lesson,"Aiden",neural.parameters("revision",20261008,512))]
        self.assertNotIn(baseline,variants)
        self.assertEqual(baseline,neural.fingerprint(self.lesson,"Aiden",self.params))

    def test_unknown_ids_and_unsafe_ids_rejected(self):
        with self.assertRaises(ValueError): neural.choose_lessons({"lessons":[self.lesson]},["other-01"])
        with self.assertRaises(ValueError): neural.choose_lessons({"lessons":[dict(self.lesson,id="../hello")]})
        with self.assertRaises(ValueError): neural.choose_lessons({"lessons":[self.lesson]},limit=0)

    def test_subset_remains_curriculum_order(self):
        second = dict(self.lesson,id="hello-02")
        chosen = neural.choose_lessons({"lessons":[self.lesson,second]},["hello-02,hello-01"],1)
        self.assertEqual(chosen,[self.lesson])

    def test_ambiguous_post_persists_intent_and_cannot_repeat(self):
        key = neural.fingerprint(self.lesson,"Aiden",self.params)
        entry = {"lesson_id":"hello-01","text":self.lesson["english"],"status":"new","attempts":[]}
        self.batch.state["entries"][key] = entry
        profile = {"id":"profile","name":"English Sprout - Aiden","language":"en",
            "voice_type":"preset","preset_voice_id":"Aiden","preset_engine":"qwen_custom_voice"}
        self.api.request.side_effect = [[profile],TimeoutError("response lost")]
        with self.assertRaises(neural.Incomplete): self.batch.submit(entry)
        stored = neural.read_json(self.batch.path)["entries"][key]
        self.assertEqual(stored["status"],"submission_unknown")
        self.assertEqual(len(stored["attempts"]),1)
        self.assertEqual(self.api.request.call_count,2)
        resumed = neural.Batch(self.directory,"Aiden",self.params,self.api,self.args,"ffmpeg","ffprobe")
        with self.assertRaises(neural.Incomplete): resumed.process(self.lesson)
        self.assertEqual(self.api.request.call_count,2)

    def test_known_id_resumes_status_without_generate(self):
        entry = {"status":"submitted"}
        attempt = {"generation_id":"existing-id","status":"submitted"}
        self.api.request.return_value = [{"status":"completed","id":"existing-id"}]
        self.assertEqual(self.batch.wait(entry,attempt),"completed")
        self.api.request.assert_called_once_with("/generations/status",{"ids":["existing-id"]})

    def test_missing_known_id_does_not_trigger_generation(self):
        self.api.request.return_value = [{"status":"not_found"}]
        with self.assertRaises(neural.Incomplete):
            self.batch.wait({}, {"generation_id":"existing-id"})
        self.assertEqual(self.api.request.call_count,1)

    def test_hash_corruption_invalidates_ready_file(self):
        path = self.directory/"clip.wav"
        path.write_bytes(b"original")
        metric = {"bytes":8,"sha256":neural.sha(path)}
        self.assertTrue(neural.intact(path,metric))
        path.write_bytes(b"modified")
        self.assertFalse(neural.intact(path,metric))

    def test_output_lock_blocks_concurrent_writer(self):
        with neural.output_lock(self.directory/"batch.lock"):
            with self.assertRaises(neural.Incomplete):
                with neural.output_lock(self.directory/"batch.lock"): pass


if __name__ == "__main__":
    unittest.main()
