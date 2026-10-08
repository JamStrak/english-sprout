"""Isolated installer safety checks; all audio is synthetic fixture bytes in temp dirs.

These tests never call FFmpeg, a speech model, a live service, or the real installer
root. They verify package integrity and failure recovery, not media decoding.
"""

import contextlib
import hashlib
import importlib.util
import io
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch


SPEC = importlib.util.spec_from_file_location(
    "english_sprout_audio_install",
    Path(__file__).resolve().parents[1] / "scripts" / "install-neural-audio.py",
)
installer = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(installer)

UI_NAMES = [
    "listen", "choose", "speak", "reveal", "complete", "review", "record", "welcome",
    "try-again", "well-done", "checkup",
]


def sha(data):
    return hashlib.sha256(data).hexdigest()


class AudioInstallTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="sprout-audio-install-test-")
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name).resolve()
        root_patch = patch.object(installer, "ROOT", self.root)
        root_patch.start()
        self.addCleanup(root_patch.stop)
        self.lessons = [
            {"id": "hello-01", "english": "Hello, everyone.", "audio": "audio/hello-01.mp3"},
            {"id": "needs-01", "english": "I need water.", "audio": "audio/needs-01.mp3"},
        ]
        self.curriculum = {"version": "1.1", "lessons": self.lessons}
        self.write_json("public/data/curriculum.json", self.curriculum)
        self.public_audio = self.root / "public/audio"
        old_clips = []
        self.old_english = {}
        self.ui_bytes = {}
        for lesson in self.lessons:
            payload = ("ID3 isolated old Zira fixture " + lesson["id"]).encode()
            relative = "public/" + lesson["audio"]
            self.write_bytes(relative, payload)
            self.old_english[relative] = payload
            old_clips.append(self.clip(relative, lesson["english"], "Microsoft Zira Desktop", payload))
        for name in UI_NAMES:
            payload = ("ID3 isolated Chinese prompt fixture " + name).encode()
            relative = f"public/audio/ui/{name}.mp3"
            self.write_bytes(relative, payload)
            self.ui_bytes[relative] = payload
            old_clips.append(self.clip(relative, name, "Microsoft Huihui Desktop", payload))
        self.old_manifest = {
            "version": "1.1", "englishVoice": "Microsoft Zira Desktop",
            "chineseVoice": "Microsoft Huihui Desktop", "lessons": 2, "uiPrompts": 11,
            "totalBytes": sum(c["bytes"] for c in old_clips), "clips": old_clips,
        }
        self.write_json("public/audio/manifest.json", self.old_manifest)
        self.staging = {}
        self.new_bytes = {}
        checks = []
        for voice in ("Aiden", "Ryan"):
            entries, selected = {}, {}
            for lesson in self.lessons:
                key = voice + ":" + lesson["id"]
                relative = f"test-results/neural-audio/{voice}/encoded/{lesson['id']}.mp3"
                payload = ("ID3 isolated new fixture " + key + " " + lesson["english"]).encode()
                self.write_bytes(relative, payload)
                source = self.root / relative
                entries[key] = {
                    "lesson_id": lesson["id"], "status": "ready", "voice": voice,
                    "text": lesson["english"], "encoded_file": str(source), "flags": [],
                    "encoded_metrics": {"sha256": sha(payload), "bytes": len(payload), "seconds": 1.75},
                    "parameters": {"model_revision": "0" * 40, "seed": 20261008,
                                   "sampling": {"max_new_tokens": 3072, "do_sample": True}},
                }
                selected[lesson["id"]] = key
                target = "public/" + (lesson["audio"] if voice == "Aiden" else lesson["audio"].replace("audio/", "audio/ryan/", 1))
                self.new_bytes[target] = payload
                checks.append({"file": str(source), "voice": voice, "lesson_id": lesson["id"],
                               "expected": lesson["english"], "recognized": lesson["english"],
                               "sha256": sha(payload), "normalized_match": True,
                               "needs_human_listening": False, "flags": []})
            self.staging[voice] = {"schema_version": 1, "voice": voice, "entries": entries, "selected": selected}
            self.save_staging(voice)
        self.report = {"results": checks}
        self.save_report()

    @staticmethod
    def clip(relative, text, voice, payload):
        return {"file": relative, "text": text, "voice": voice, "rate": 0,
                "seconds": 1.0, "bytes": len(payload), "sha256": sha(payload)}

    def write_bytes(self, relative, payload):
        path = self.root / relative
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(payload)

    def write_json(self, relative, payload):
        self.write_bytes(relative, (json.dumps(payload, ensure_ascii=False, indent=2) + "\n").encode())

    def save_staging(self, voice="Aiden"):
        self.write_json(f"test-results/neural-audio/{voice}/progress.json", self.staging[voice])

    def save_report(self):
        self.write_json("test-results/speech-check/production.json", self.report)

    def entry(self, voice="Aiden", lesson_id="hello-01"):
        state = self.staging[voice]
        return state["entries"][state["selected"][lesson_id]]

    @staticmethod
    def snapshot(directory):
        return {str(p.relative_to(directory)): p.read_bytes() if p.is_file() else None
                for p in sorted(directory.rglob("*"))} if directory.exists() else {}

    def run_installer(self, check_only=False):
        output = io.StringIO()
        argv = ["install-neural-audio.py"] + (["--check-only"] if check_only else [])
        with patch("sys.argv", argv), contextlib.redirect_stdout(output):
            installer.main()
        return output.getvalue()

    def assert_refused_without_public_changes(self, error=ValueError):
        before = self.snapshot(self.root / "public")
        with self.assertRaises(error):
            self.run_installer()
        self.assertEqual(before, self.snapshot(self.root / "public"))
        self.assertFalse((self.root / "test-results/audio-archives").exists())

    def test_check_only_complete_package_does_not_write_public_or_create_backup(self):
        before = self.snapshot(self.root)
        mtimes = {p: p.stat().st_mtime_ns for p in (self.root / "public").rglob("*") if p.is_file()}
        output = self.run_installer(check_only=True)
        self.assertIn("4 English clips", output)
        self.assertEqual(before, self.snapshot(self.root))
        self.assertEqual(mtimes, {p: p.stat().st_mtime_ns for p in mtimes})

    def test_complete_install_preserves_chinese_and_archives_exact_old_bundle(self):
        before = self.snapshot(self.public_audio)
        output = json.loads(self.run_installer())
        self.assertEqual(output["installed"], 4)
        archive = Path(output["backup"])
        self.assertTrue(archive.is_relative_to(self.root / "test-results/audio-archives"))
        self.assertEqual(before, self.snapshot(archive))
        for relative, payload in self.new_bytes.items():
            self.assertEqual((self.root / relative).read_bytes(), payload)
        for relative, payload in self.ui_bytes.items():
            self.assertEqual((self.root / relative).read_bytes(), payload)
        manifest = json.loads((self.public_audio / "manifest.json").read_text(encoding="utf-8"))
        self.assertEqual(manifest["englishVoices"], ["Aiden", "Ryan"])
        self.assertEqual(manifest["uiPrompts"], 11)
        self.assertEqual(len(manifest["clips"]), 15)
        self.assertEqual({c["file"] for c in manifest["clips"]}, set(self.new_bytes) | set(self.ui_bytes))
        for clip in manifest["clips"]:
            payload = (self.root / clip["file"]).read_bytes()
            self.assertEqual(clip["sha256"], sha(payload))
            self.assertEqual(clip["bytes"], len(payload))
        self.assertEqual(manifest["totalBytes"], sum(len(p) for p in [*self.new_bytes.values(), *self.ui_bytes.values()]))

    def test_missing_voice_clip_refuses_before_any_public_write(self):
        del self.staging["Ryan"]["selected"]["needs-01"]
        self.save_staging("Ryan")
        self.assert_refused_without_public_changes()

    def test_missing_encoded_file_refuses_before_any_public_write(self):
        Path(self.entry()["encoded_file"]).unlink()
        self.assert_refused_without_public_changes(FileNotFoundError)

    def test_stale_selected_text_refuses_before_any_public_write(self):
        self.entry()["text"] = "This is the previous course text."
        self.save_staging()
        self.assert_refused_without_public_changes()

    def test_changed_audio_hash_refuses_before_any_public_write(self):
        source = Path(self.entry()["encoded_file"])
        original = source.read_bytes()
        source.write_bytes(b"X" + original[1:])  # Same length, different content.
        self.assert_refused_without_public_changes()

    def test_incorrect_encoded_size_refuses_before_any_public_write(self):
        self.entry()["encoded_metrics"]["bytes"] += 1
        self.save_staging()
        self.assert_refused_without_public_changes()

    def test_unresolved_media_flags_refuse_installation(self):
        self.entry()["flags"] = ["clipped_samples"]
        self.save_staging()
        self.assert_refused_without_public_changes()

    def test_unchecked_audio_refuses_installation(self):
        self.report["results"] = self.report["results"][1:]
        self.save_report()
        self.assert_refused_without_public_changes()

    def test_failed_transcript_match_refuses_installation(self):
        self.report["results"][0]["normalized_match"] = False
        self.save_report()
        self.assert_refused_without_public_changes()

    def test_stale_asr_reference_refuses_installation(self):
        self.report["results"][0]["expected"] = "Good morning."
        self.save_report()
        self.assert_refused_without_public_changes()

    def test_asr_error_refuses_even_when_match_flag_is_true(self):
        self.report["results"][0]["error"] = "Recognition did not complete."
        self.save_report()
        self.assert_refused_without_public_changes()

    def test_asr_review_required_refuses_even_when_text_matches(self):
        self.report["results"][0]["needs_human_listening"] = True
        self.save_report()
        self.assert_refused_without_public_changes()

    def test_unresolved_asr_flags_refuse_even_when_text_matches(self):
        self.report["results"][0]["flags"] = ["low_asr_token_confidence_heuristic"]
        self.save_report()
        self.assert_refused_without_public_changes()

    def test_staging_file_outside_voice_directory_refuses_installation(self):
        original = Path(self.entry()["encoded_file"])
        foreign = self.root / "foreign.mp3"
        foreign.write_bytes(original.read_bytes())
        self.entry()["encoded_file"] = str(foreign)
        self.save_staging()
        self.assert_refused_without_public_changes()

    def test_course_audio_path_cannot_escape_public_audio(self):
        sentinel = self.root / "outside.mp3"
        sentinel.write_bytes(b"Must remain unchanged")
        self.lessons[0]["audio"] = "audio/../../outside.mp3"
        self.write_json("public/data/curriculum.json", self.curriculum)
        self.assert_refused_without_public_changes()
        self.assertEqual(sentinel.read_bytes(), b"Must remain unchanged")

    def test_changed_chinese_prompt_refuses_installation(self):
        self.write_bytes("public/audio/ui/listen.mp3", b"Changed Chinese prompt")
        self.assert_refused_without_public_changes()

    def test_missing_chinese_prompt_manifest_entry_refuses_installation(self):
        self.old_manifest["clips"] = self.old_manifest["clips"][:-1]
        self.write_json("public/audio/manifest.json", self.old_manifest)
        self.assert_refused_without_public_changes()

    def test_duplicate_chinese_prompt_is_not_a_complete_eleven_prompt_set(self):
        self.old_manifest["clips"][-1] = dict(self.old_manifest["clips"][2])
        self.write_json("public/audio/manifest.json", self.old_manifest)
        self.assert_refused_without_public_changes()

    def test_source_change_after_validation_cannot_install_unverified_bytes(self):
        before = self.snapshot(self.root / "public")
        source = Path(self.entry()["encoded_file"])
        verified = source.read_bytes()
        original_copytree = installer.shutil.copytree
        changed = []
        def change_source_after_bundle_copy(source_dir, destination, *args, **kwargs):
            result = original_copytree(source_dir, destination, *args, **kwargs)
            if Path(source_dir) == self.public_audio:
                source.write_bytes(b"X" + verified[1:])
                changed.append(source)
            return result
        with patch.object(installer.shutil, "copytree", side_effect=change_source_after_bundle_copy):
            try:
                self.run_installer()
            except ValueError:
                self.assertEqual(before, self.snapshot(self.root / "public"))
            else:
                # Freezing the originally verified bytes is also safe. Installing
                # the later modified source without rechecking it is not.
                self.assertEqual((self.public_audio / "hello-01.mp3").read_bytes(), verified)
                manifest = json.loads((self.public_audio / "manifest.json").read_text(encoding="utf-8"))
                for clip in manifest["clips"]:
                    self.assertEqual(clip["sha256"], sha((self.root / clip["file"]).read_bytes()))
        self.assertEqual(changed, [source])

    def test_stage_write_failure_keeps_the_old_public_bundle_intact(self):
        before = self.snapshot(self.root / "public")
        original_write = installer.atomic_bytes
        attempts = []
        def fail_second_stage_write(path, data):
            attempts.append(path)
            self.assertTrue(path.is_relative_to(self.root / "test-results/audio-installs"))
            if len(attempts) == 2:
                raise OSError("Injected staging disk write failure")
            return original_write(path, data)
        with patch.object(installer, "atomic_bytes", side_effect=fail_second_stage_write):
            with self.assertRaisesRegex(OSError, "Injected staging"):
                self.run_installer()
        self.assertEqual(len(attempts), 2)
        self.assertEqual(before, self.snapshot(self.root / "public"))
        self.assertEqual(list((self.root / "test-results/audio-installs").iterdir()), [])
        self.assertEqual(list((self.root / "test-results/audio-archives").iterdir()), [])

    def test_final_bundle_rename_failure_restores_the_old_public_bundle(self):
        before = self.snapshot(self.root / "public")
        original_rename = Path.rename
        failed_moves = []
        def fail_final_move(source, target):
            if source.is_relative_to(self.root / "test-results/audio-installs") and Path(target) == self.public_audio:
                failed_moves.append(source)
                raise OSError("Injected final bundle rename failure")
            return original_rename(source, target)
        with patch.object(Path, "rename", new=fail_final_move):
            with self.assertRaisesRegex(OSError, "Injected final bundle"):
                self.run_installer()
        self.assertEqual(len(failed_moves), 1)
        self.assertEqual(before, self.snapshot(self.root / "public"))
        self.assertEqual(list((self.root / "test-results/audio-installs").iterdir()), [])
        self.assertEqual(list((self.root / "test-results/audio-archives").iterdir()), [])

    def test_locked_live_bundle_refuses_without_changing_old_files(self):
        before = self.snapshot(self.root / "public")
        original_rename = Path.rename
        def fail_first_move(source, target):
            if source == self.public_audio:
                raise PermissionError("Injected live directory lock")
            return original_rename(source, target)
        with patch.object(Path, "rename", new=fail_first_move):
            with self.assertRaisesRegex(PermissionError, "Injected live directory lock"):
                self.run_installer()
        self.assertEqual(before, self.snapshot(self.root / "public"))
        self.assertEqual(list((self.root / "test-results/audio-installs").iterdir()), [])


if __name__ == "__main__":
    unittest.main()
