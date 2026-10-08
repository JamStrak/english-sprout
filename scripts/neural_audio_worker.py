"""Isolated Qwen batch worker. Invoke ONLY through the configured shared guard."""
from __future__ import annotations

import importlib.util
import json
import os
from pathlib import Path
import random
import sys
import time
import traceback
from types import SimpleNamespace


def main(request_path):
    request_path = Path(request_path).resolve()
    request = json.loads(request_path.read_text(encoding="utf-8"))
    if not 1 <= len(request["keys"]) <= 20:
        raise ValueError("Each guarded batch must contain 1-20 lessons")
    workbench = Path(request["workbench"]).resolve()
    directory = Path(request["directory"]).resolve()
    root = Path(__file__).resolve().parents[1]
    expected = (root/"test-results/neural-audio"/request["voice"]).resolve()
    if request["voice"] not in {"Aiden","Ryan"} or directory != expected:
        raise ValueError("Output must stay in the selected voice staging directory")
    sys.path.insert(0,str(workbench/"upstream/voicebox"))
    sys.path.insert(0,str(workbench/"scripts"))
    from backend.services.local_runtime import configure_process_tools, load_configuration, qwen_files_ready, require_cuda
    configure_process_tools(workbench)
    config = load_configuration(workbench)
    if config != request["config"]:
        raise ValueError("Workbench configuration changed after staging; rerun coordinator")
    model_path = Path(config["custom_voice_model"])
    if not model_path.is_absolute(): model_path = workbench/model_path
    if not qwen_files_ready(model_path,"custom_voice_model"):
        raise RuntimeError("Existing local CustomVoice model is incomplete; no download attempted")
    os.environ.update(HF_HOME=str(workbench/"cache/huggingface"),HF_HUB_OFFLINE="1",
        TRANSFORMERS_OFFLINE="1",HF_HUB_DISABLE_TELEMETRY="1",DO_NOT_TRACK="1")
    spec = importlib.util.spec_from_file_location("neural_audio_coordinator",root/"scripts/generate-neural-audio.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    batch = module.Batch(directory,request["voice"],{},None,SimpleNamespace(),request["ffmpeg"],request["ffprobe"])
    # Reuse the existing Voice Workbench natural-library CUDA and VRAM admission.
    import numpy as np
    import torch
    import soundfile as sf
    from emotion_resources import require_synthesis_vram
    require_cuda(torch)
    torch.set_num_threads(4)
    require_synthesis_vram(*torch.cuda.mem_get_info())
    torch.cuda.reset_peak_memory_stats()
    from qwen_tts import Qwen3TTSModel
    started = time.perf_counter()
    model = Qwen3TTSModel.from_pretrained(str(model_path),device_map="cuda:0",
        torch_dtype=torch.bfloat16,attn_implementation="sdpa")
    loaded = time.perf_counter()
    failed = []
    for key in request["keys"]:
        entry = batch.state["entries"][key]
        raw = Path(entry["raw_file"])
        if raw.parent.resolve() != (directory/"raw").resolve():
            raise ValueError("Unexpected raw output location")
        params = entry["parameters"]
        if (params["model_revision"] != config["custom_voice_revision"] or params["language"] != "en"
            or entry["voice"] != request["voice"] or params["sampling"]["max_new_tokens"] != 512):
            raise ValueError("Unexpected model/voice/language/sampling parameters")
        if module.intact(raw,entry.get("raw_metrics")):
            module.finish_local_entry(batch,entry,raw)
            continue
        if raw.exists():
            raw = raw.with_name(raw.stem+"--retry-"+str(time.time_ns())+".wav")
            entry["raw_file"] = str(raw)
        tick = time.perf_counter()
        attempt = {"backend":"guarded-local","status":"generating","started_at_epoch":time.time(),
            "parameters":params,"job_request":str(request_path)}
        entry["attempts"].append(attempt)
        entry["status"] = "generating_local"
        batch.save()
        try:
            seed = params["seed"]
            random.seed(seed)
            np.random.seed(seed)
            torch.manual_seed(seed)
            torch.cuda.manual_seed_all(seed)
            wavs, sr = model.generate_custom_voice(text=entry["text"],language="English",speaker=entry["voice"],
                max_new_tokens=512,temperature=0.9,subtalker_temperature=0.9)
            values = np.asarray(wavs[0])
            if not np.isfinite(values).all() or not values.size:
                raise module.Damaged("Nonfinite or empty synthesis result")
            # Preserve the original PCM even if subsequent duration/clipping checks flag it.
            sf.write(raw,values,sr,subtype="PCM_16")
            entry["source"] = {"kind":"guarded-local","job_request":str(request_path),
                "sample_rate":sr,"production_seconds":round(time.perf_counter()-tick,3)}
            module.finish_local_entry(batch,entry,raw)
            attempt.update(status="completed",seconds=round(time.perf_counter()-tick,3))
        except Exception as exc:
            entry.update(status="failed",error=str(exc))
            attempt.update(status="failed",error=str(exc))
            failed.append(entry["lesson_id"])
            traceback.print_exc()
            if "out of memory" in str(exc).lower():
                batch.save()
                raise
        batch.save()
        print(f"{entry['lesson_id']} {entry['status']} {time.perf_counter()-tick:.2f}s",flush=True)
    report = {"voice":request["voice"],"model_revision":config["custom_voice_revision"],
        "load_seconds":round(loaded-started,3),"total_seconds":round(time.perf_counter()-started,3),
        "peak_reserved_mib":torch.cuda.max_memory_reserved()/1024**2,"device":torch.cuda.get_device_name(),
        "torch":torch.__version__,"attempted":len(request["keys"]),"failed":failed}
    module.atomic_json(request_path.parent/"report.json",report)
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1]))
