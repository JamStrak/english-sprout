"""Local, CPU-only ASR triage for generated course audio; never pronunciation scoring.

Maintenance use (requires existing torch, transformers, soundfile and scipy):
  python scripts/check-neural-speech.py --input test-results/voice-audit/samples.json \
    --audio-root test-results/voice-audit --report-name candidates

Input is a list, or an object containing samples/clips/records. Every English
record needs file and text; voice and lesson_id/id are optional. For the packaged
manifest use --audio-root . because its file paths start with public/.
The model must already exist locally: no model download or audio upload occurs.
The reference text is NEVER passed to the recognizer as a prompt.
"""

from __future__ import annotations

import argparse
import collections
import datetime as dt
import hashlib
import json
import math
import os
from pathlib import Path
import re
import sys
import time
import unicodedata


ROOT = Path(__file__).resolve().parents[1]
CHECK_ROOT = ROOT / "test-results" / "speech-check"
MODEL_REVISION = "87c7102498dcde7456f24cfd30239ca606ed9063"
MODEL_WEIGHT_SHA256 = "db59695928ded6043adaef491a53ef4e12da9611184d77c53baa691a60b958ad"
CHECK_VERSION = "1.0"
CONTRACTIONS = {
    "i'm": "i am", "you're": "you are", "we're": "we are", "they're": "they are",
    "it's": "it is", "that's": "that is", "here's": "here is", "where's": "where is",
    "what's": "what is", "who's": "who is", "there's": "there is", "let's": "let us",
    "i'll": "i will", "you'll": "you will", "we'll": "we will", "they'll": "they will",
    "he'll": "he will", "she'll": "she will", "it'll": "it will",
    "don't": "do not", "doesn't": "does not", "didn't": "did not",
    "can't": "can not", "cannot": "can not", "won't": "will not",
    "isn't": "is not", "aren't": "are not", "wasn't": "was not", "weren't": "were not",
    "couldn't": "could not", "wouldn't": "would not", "shouldn't": "should not",
    "haven't": "have not", "hasn't": "has not", "hadn't": "had not",
    "i've": "i have", "you've": "you have", "we've": "we have", "they've": "they have",
}
NUMBERS = dict(enumerate("zero one two three four five six seven eight nine ten".split()))


def normalized_words(text):
    text = unicodedata.normalize("NFKC", text).lower().replace("’", "'").replace("‘", "'")
    result = []
    for token in re.findall(r"[a-z]+(?:'[a-z]+)?|\d+", text):
        if token.isdigit() and int(token) in NUMBERS:
            result.append(NUMBERS[int(token)])
        else:
            result.extend(CONTRACTIONS.get(token, token).split())
    return result


def word_edits(expected, recognized):
    """Levenshtein alignment; retains deletions and repetitions for human review."""
    rows, cols = len(expected) + 1, len(recognized) + 1
    cost = [[0] * cols for _ in range(rows)]
    for i in range(rows):
        cost[i][0] = i
    for j in range(cols):
        cost[0][j] = j
    for i in range(1, rows):
        for j in range(1, cols):
            cost[i][j] = min(cost[i - 1][j] + 1, cost[i][j - 1] + 1,
                             cost[i - 1][j - 1] + (expected[i - 1] != recognized[j - 1]))
    edits, i, j = [], len(expected), len(recognized)
    while i or j:
        if i and j and expected[i - 1] == recognized[j - 1] and cost[i][j] == cost[i - 1][j - 1]:
            i, j = i - 1, j - 1
        elif i and j and cost[i][j] == cost[i - 1][j - 1] + 1:
            edits.append({"operation": "substitution", "expected": expected[i - 1], "recognized": recognized[j - 1]})
            i, j = i - 1, j - 1
        elif i and cost[i][j] == cost[i - 1][j] + 1:
            edits.append({"operation": "missing_in_asr", "expected": expected[i - 1]})
            i -= 1
        else:
            edits.append({"operation": "extra_in_asr", "recognized": recognized[j - 1]})
            j -= 1
    return list(reversed(edits))


def repeated_phrases(words):
    found = set()
    for width in range(1, min(6, len(words) // 2) + 1):
        for start in range(len(words) - 2 * width + 1):
            left = words[start:start + width]
            if left == words[start + width:start + 2 * width]:
                found.add(" ".join(left))
    return sorted(found)


def self_test():
    assert normalized_words("I can’t find it.") == normalized_words("I cannot find it!")
    assert normalized_words("Let's get dressed.") == normalized_words("Let us get dressed")
    assert normalized_words("There are 2.") == normalized_words("There are two.")
    assert normalized_words("I can't find it.") != normalized_words("I can find it.")
    assert normalized_words("Can you zip this up, please?") != normalized_words("Can you zip this up?")
    assert word_edits(["do", "not", "touch"], ["do", "touch"]) == [{"operation": "missing_in_asr", "expected": "not"}]
    assert word_edits(["my", "turn"], ["my", "my", "turn"]) == [{"operation": "extra_in_asr", "recognized": "my"}]
    assert repeated_phrases(["let", "us", "play", "let", "us", "play"]) == ["let us play"]
    print("Normalization and discrepancy checks passed (8 assertions).", flush=True)


def memory_peak_bytes():
    if sys.platform == "win32":
        import ctypes
        from ctypes import wintypes
        class Counters(ctypes.Structure):
            _fields_ = [("cb", wintypes.DWORD), ("PageFaultCount", wintypes.DWORD)] + [
                (name, ctypes.c_size_t) for name in (
                    "PeakWorkingSetSize", "WorkingSetSize", "QuotaPeakPagedPoolUsage", "QuotaPagedPoolUsage",
                    "QuotaPeakNonPagedPoolUsage", "QuotaNonPagedPoolUsage", "PagefileUsage", "PeakPagefileUsage")]
        counters = Counters()
        counters.cb = ctypes.sizeof(counters)
        kernel = ctypes.WinDLL("kernel32", use_last_error=True)
        kernel.GetCurrentProcess.restype = wintypes.HANDLE
        psapi = ctypes.WinDLL("psapi", use_last_error=True)
        psapi.GetProcessMemoryInfo.argtypes = [wintypes.HANDLE, ctypes.POINTER(Counters), wintypes.DWORD]
        if psapi.GetProcessMemoryInfo(kernel.GetCurrentProcess(), ctypes.byref(counters), counters.cb):
            return int(counters.PeakWorkingSetSize)
    return None


def atomic_json(path, payload):
    temporary = path.with_suffix(".tmp")
    temporary.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    temporary.replace(path)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path)
    parser.add_argument("--audio-root", type=Path)
    parser.add_argument("--model-dir", type=Path, default=CHECK_ROOT / "models" / "whisper-tiny.en")
    parser.add_argument("--report-name", default="speech-report")
    parser.add_argument("--cpu-threads", type=int, default=4)
    parser.add_argument("--limit", type=int)
    parser.add_argument("--force", action="store_true", help="Ignore prior results for the same files/settings")
    parser.add_argument("--self-test", action="store_true")
    args = parser.parse_args()
    if args.self_test:
        self_test()
        return
    if not args.input:
        parser.error("--input is required unless --self-test is used")
    if not re.fullmatch(r"[a-zA-Z0-9_-]+", args.report_name):
        parser.error("--report-name must contain only letters, digits, underscores or hyphens")
    if args.cpu_threads < 1 or (args.limit is not None and args.limit < 1):
        parser.error("--cpu-threads and --limit must be positive")
    model_path = args.model_dir.resolve()
    if not (model_path / "model.safetensors").is_file():
        parser.error("Local model.safetensors is missing; the checker never downloads models implicitly")
    if hashlib.sha256((model_path / "model.safetensors").read_bytes()).hexdigest() != MODEL_WEIGHT_SHA256:
        parser.error("Local model weight checksum differs from the verified OpenAI tiny.en revision")
    CHECK_ROOT.mkdir(parents=True, exist_ok=True)
    input_path = args.input.resolve()
    audio_root = args.audio_root.resolve() if args.audio_root else input_path.parent
    data = json.loads(input_path.read_text(encoding="utf-8-sig"))
    records = data if isinstance(data, list) else next((data[k] for k in ("samples", "clips", "records") if k in data), None)
    if not isinstance(records, list):
        parser.error("Expected a record list or samples/clips/records list")
    selected, skipped = [], []
    for record in records:
        if not isinstance(record, dict) or not record.get("text") or not record.get("file"):
            parser.error("Every record needs non-empty text and file")
        if re.search(r"[\u3400-\u9fff]", record["text"]) or record.get("language", "en").startswith("zh"):
            skipped.append(record["file"])
        else:
            selected.append(record)
    if args.limit:
        selected = selected[:args.limit]
    if not selected:
        parser.error("No English audio records found")

    # No HTTP/audio upload code, explicit local-only loads, CPU even on CUDA hosts.
    os.environ["HF_HUB_OFFLINE"] = "1"
    os.environ["TRANSFORMERS_OFFLINE"] = "1"
    os.environ["HF_HUB_DISABLE_TELEMETRY"] = "1"
    os.environ["CUDA_VISIBLE_DEVICES"] = ""
    os.environ["TOKENIZERS_PARALLELISM"] = "false"
    started = time.monotonic()
    import numpy as np
    import scipy.signal
    import soundfile as sf
    import torch
    import transformers
    from transformers import WhisperForConditionalGeneration, WhisperProcessor
    torch.set_num_threads(args.cpu_threads)
    torch.set_num_interop_threads(1)
    processor = WhisperProcessor.from_pretrained(model_path, local_files_only=True)
    model = WhisperForConditionalGeneration.from_pretrained(model_path, local_files_only=True,
                                                            use_safetensors=True, torch_dtype=torch.float32).to("cpu").eval()
    model_load_seconds = time.monotonic() - started
    print(f"Loaded English-only Whisper on CPU ({args.cpu_threads} threads) in {model_load_seconds:.2f}s", flush=True)
    special_ids = set(processor.tokenizer.all_special_ids)
    settings = {
        "checker_version": CHECK_VERSION, "model": "openai/whisper-tiny.en", "revision": MODEL_REVISION,
        "model_weight_sha256": MODEL_WEIGHT_SHA256,
        "device": "cpu", "dtype": "float32", "threads": args.cpu_threads,
        "num_beams": 1, "do_sample": False, "max_new_tokens": 96,
        "reference_prompt": False, "vad": False,
        "low_confidence_heuristics": {"mean_token_log_probability_below": -0.7, "minimum_token_probability_below": 0.2},
        "normalization": "case/punctuation, explicit contractions, digits 0-10; negations and all other words retained",
    }
    settings_key = hashlib.sha256(json.dumps(settings, sort_keys=True).encode()).hexdigest()
    report_path = CHECK_ROOT / (args.report_name + ".json")
    previous = {}
    if report_path.exists() and not args.force:
        old = json.loads(report_path.read_text(encoding="utf-8"))
        if old.get("settings_key") == settings_key:
            previous = {r["cache_key"]: r for r in old.get("results", []) if r.get("cache_key") and not r.get("error")}
    report = {
        "created_at": dt.datetime.now(dt.timezone.utc).isoformat(), "input": str(input_path),
        "purpose": "Generated-audio content triage only; ASR can omit, hallucinate or normalize words. No pronunciation, accent, stress, fluency or teaching-quality score.",
        "settings": settings, "settings_key": settings_key,
        "cuda_initialized": torch.cuda.is_initialized(),
        "dependencies": {"python": sys.version.split()[0], "torch": torch.__version__, "transformers": transformers.__version__},
        "model_load_seconds": round(model_load_seconds, 3), "planned_clips": len(selected), "skipped_non_english_files": skipped,
        "results": [],
    }
    for index, record in enumerate(selected, 1):
        clip_start = time.monotonic()
        audio_path = (audio_root / record["file"]).resolve()
        result = {"file": record["file"], "resolved_file": str(audio_path), "lesson_id": record.get("lesson_id", record.get("id", audio_path.stem)),
                  "voice": record.get("voice"), "expected": record["text"]}
        try:
            result["sha256"] = hashlib.sha256(audio_path.read_bytes()).hexdigest()
            key = hashlib.sha256((str(audio_path) + result["sha256"] + record["text"] + settings_key).encode()).hexdigest()
            result["cache_key"] = key
            if key in previous:
                result = dict(previous[key], reused=True)
            else:
                audio, sample_rate = sf.read(audio_path, dtype="float32", always_2d=True)
                duration = audio.shape[0] / sample_rate
                if not 0.05 <= duration <= 30:
                    raise ValueError(f"Clip duration {duration:.3f}s outside the supported 0.05-30s range")
                audio = np.mean(audio, axis=1)
                if sample_rate != 16000:
                    divisor = math.gcd(sample_rate, 16000)
                    audio = scipy.signal.resample_poly(audio, 16000 // divisor, sample_rate // divisor)
                inputs = processor(audio, sampling_rate=16000, return_tensors="pt", return_attention_mask=True)
                with torch.inference_mode():
                    output = model.generate(inputs.input_features, attention_mask=inputs.attention_mask,
                                            do_sample=False, num_beams=1, max_new_tokens=96,
                                            return_dict_in_generate=True, output_scores=True, return_timestamps=False)
                    token_scores = model.compute_transition_scores(output.sequences, output.scores, normalize_logits=True)[0]
                recognized = processor.batch_decode(output.sequences, skip_special_tokens=True)[0].strip()
                generated_ids = output.sequences[0, -len(token_scores):].tolist()
                scores = [float(score) for token, score in zip(generated_ids, token_scores.tolist()) if token not in special_ids and math.isfinite(score)]
                expected_words, recognized_words = normalized_words(record["text"]), normalized_words(recognized)
                edits = word_edits(expected_words, recognized_words)
                mean_log = sum(scores) / len(scores) if scores else None
                minimum_probability = math.exp(min(scores)) if scores else None
                flags = []
                if edits:
                    flags.append("transcript_differs_from_reference")
                if not scores or mean_log < -0.7 or minimum_probability < 0.2:
                    flags.append("low_asr_token_confidence_heuristic")
                repeats = repeated_phrases(recognized_words)
                if set(repeats) - set(repeated_phrases(expected_words)):
                    flags.append("repeated_phrase_in_asr")
                if output.sequences.shape[-1] >= 96:
                    flags.append("possible_output_length_limit")
                result.update({"recognized": recognized, "normalized_expected": " ".join(expected_words),
                               "normalized_recognized": " ".join(recognized_words), "normalized_match": not edits,
                               "edits": edits, "asr_repeated_phrases": repeats,
                               "token_confidence_diagnostic": {"mean_log_probability": mean_log, "minimum_probability": minimum_probability,
                                                               "note": "Uncalibrated recognizer diagnostics, not a correctness or pronunciation probability"},
                               "duration_seconds": round(duration, 3), "needs_human_listening": bool(flags), "flags": flags,
                               "wall_seconds": round(time.monotonic() - clip_start, 3), "reused": False})
        except Exception as exc:
            result.update({"error": f"{type(exc).__name__}: {exc}", "needs_human_listening": True, "flags": ["check_failed"]})
        report["results"].append(result)
        counts = collections.Counter(flag for r in report["results"] for flag in r["flags"])
        report["summary"] = {"checked": len(report["results"]), "normalized_matches": sum(r.get("normalized_match", False) for r in report["results"]),
                             "needs_human_listening": sum(r["needs_human_listening"] for r in report["results"]),
                             "errors": sum(bool(r.get("error")) for r in report["results"]), "flag_counts": dict(counts),
                             "elapsed_seconds": round(time.monotonic() - started, 3), "peak_working_set_bytes": memory_peak_bytes(),
                             "cuda_initialized": torch.cuda.is_initialized()}
        atomic_json(report_path, report)
        state = "REVIEW" if result["needs_human_listening"] else "MATCH"
        print(f"{index}/{len(selected)} {state} {record.get('voice', '')} {result['lesson_id']}: {result.get('recognized', result.get('error'))}", flush=True)

    def cell(value):
        return str(value or "").replace("|", "\\|").replace("\n", " ")
    lines = ["# Generated speech: local ASR triage", "", report["purpose"], "",
             "Reference text was not given to the recognizer. All inference used the CPU and local model files.", "",
             "A match does not prove a flawless recording. A difference does not prove a speech error; listen to flagged clips.", "",
             "| Voice / lesson | Reference | ASR | Review reasons |", "| --- | --- | --- | --- |"]
    for row in report["results"]:
        lines.append("| " + " | ".join(cell(x) for x in (f"{row.get('voice', '')} / {row['lesson_id']}", row["expected"],
                                                           row.get("recognized", row.get("error")), ", ".join(row["flags"]) or "No content discrepancy flagged")) + " |")
    lines += ["", "```json", json.dumps(report["summary"], indent=2), "```", ""]
    report_path.with_suffix(".md").write_text("\n".join(lines), encoding="utf-8")
    print(json.dumps(report["summary"], ensure_ascii=False), flush=True)
    if report["summary"]["errors"]:
        raise SystemExit(2)


if __name__ == "__main__":
    main()
