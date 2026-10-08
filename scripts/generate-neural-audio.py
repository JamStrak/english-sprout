"""Stage offline neural lesson audio; never modifies public assets.

Maintenance usage (default: isolated local worker through the shared GPU guard):
  python scripts/generate-neural-audio.py --voice Aiden
  python scripts/generate-neural-audio.py --voice Ryan --ids family-07 meals-10
  python scripts/generate-neural-audio.py --voice Ryan --limit 4
Each local batch loads once for at most 20 lessons. The --backend api fallback
requires the existing Voice Workbench service. Interrupted API jobs resume known IDs.
Failed jobs are only
resubmitted with --retry-failed; an ambiguous POST is never automatically retried.
"""
from __future__ import annotations

import argparse
import array
import contextlib
import hashlib
import json
import math
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import time
import urllib.error
import urllib.request
import uuid

ROOT = Path(__file__).resolve().parents[1]
WORKBENCH = Path(r"E:\AI新项目\游戏工具\配音工作台")
ENCODER = "loudnorm=I=-20:TP=-1.5:LRA=7;mono;24000Hz;libmp3lame;48kbps;v1"


class Incomplete(RuntimeError):
    """Retain state and stop safely, without guessing whether a job was created."""


class Damaged(RuntimeError):
    """A downloaded artifact cannot be decoded or has no usable signal."""


def read_json(path):
    return json.loads(Path(path).read_text(encoding="utf-8-sig"))


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def atomic_json(path, value):
    temporary = path.with_name(path.name + ".tmp")
    with temporary.open("w", encoding="utf-8") as handle:
        json.dump(value, handle, ensure_ascii=False, indent=2)
        handle.flush()
        os.fsync(handle.fileno())
    temporary.replace(path)


@contextlib.contextmanager
def output_lock(path):
    """Only one writer per voice; the Workbench handles the shared GPU lock."""
    with path.open("a+b") as handle:
        if handle.tell() == 0:
            handle.write(b"0")
            handle.flush()
        handle.seek(0)
        try:
            if os.name == "nt":
                import msvcrt
                msvcrt.locking(handle.fileno(), msvcrt.LK_NBLCK, 1)
            else:
                import fcntl
                fcntl.flock(handle, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except OSError as exc:
            raise Incomplete("This voice already has a running batch; reuse that process.") from exc
        try:
            yield
        finally:
            handle.seek(0)
            if os.name == "nt":
                msvcrt.locking(handle.fileno(), msvcrt.LK_UNLCK, 1)
            else:
                fcntl.flock(handle, fcntl.LOCK_UN)


def parameters(revision, seed, token_limit=3072):
    return {"engine":"qwen_custom_voice", "model_size":"0.6B", "language":"en",
            "seed":seed, "expression":{"mode":"natural"}, "normalize":False,
            "effects_chain":[], "model_revision":revision, "encoder":ENCODER,
            "sampling":{"temperature":0.9,"subtalker_temperature":0.9,"max_new_tokens":token_limit}}


def fingerprint(lesson, voice, params):
    value = {"lesson_id":lesson["id"], "text":lesson["english"], "voice":voice, "parameters":params}
    return hashlib.sha256(json.dumps(value, sort_keys=True, ensure_ascii=False).encode()).hexdigest()


def choose_lessons(curriculum, ids=None, limit=None):
    lessons = curriculum["lessons"]
    seen = set()
    for lesson in lessons:
        if not re.fullmatch(r"[a-z]+-[0-9]{2}", lesson["id"]) or lesson["id"] in seen:
            raise ValueError("Invalid or duplicate lesson ID")
        if not isinstance(lesson.get("english"), str) or not lesson["english"].strip():
            raise ValueError("Empty lesson text")
        seen.add(lesson["id"])
    if ids:
        selected = {part for value in ids for part in value.split(",") if part}
        if selected - seen:
            raise ValueError("Unknown lesson IDs: " + ", ".join(sorted(selected - seen)))
        lessons = [item for item in lessons if item["id"] in selected]
    if limit is not None:
        if limit < 1:
            raise ValueError("--limit must be positive")
        lessons = lessons[:limit]
    return lessons


class API:
    def __init__(self, base, timeout):
        self.base, self.timeout = base.rstrip("/"), timeout
        self.opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))

    def request(self, path, data=None, binary=False):
        request = urllib.request.Request(self.base + path,
            data=json.dumps(data).encode() if data is not None else None,
            headers={"Content-Type":"application/json"})
        with self.opener.open(request, timeout=self.timeout) as response:
            body = response.read(50 * 1024 * 1024 + 1)
        if len(body) > 50 * 1024 * 1024:
            raise Incomplete("Response exceeds 50 MiB; retained job ID for investigation")
        return body if binary else json.loads(body)


def connect(workbench, timeout):
    config = read_json(workbench / "local_config.json")
    preferred = int(config.get("preferred_port", 23164))
    ports = list(range(preferred, preferred + 20))
    record = workbench / "data/server.json"
    if record.exists():
        saved = read_json(record).get("port")
        if saved in ports:
            ports.remove(saved)
            ports.insert(0, saved)
    for port in ports:
        client = API(f"http://127.0.0.1:{port}", min(timeout, 0.5))
        try:
            identity = client.request("/local/identity")
        except (OSError, ValueError):
            continue
        if (identity.get("app") == "voice-workbench"
                and Path(identity.get("root", "")).resolve() == workbench.resolve()):
            client.timeout = timeout
            return client, config
    raise Incomplete("请先双击配音工作台的“打开配音工作台.vbs”，待服务就绪后重跑；不会启动重复服务。")


def media_metrics(path, ffmpeg, ffprobe):
    try:
        probe = subprocess.run([ffprobe,"-v","error","-show_entries","format=duration",
            "-of","default=noprint_wrappers=1:nokey=1",str(path)], capture_output=True, check=True, timeout=30)
        seconds = float(probe.stdout.strip())
        if not math.isfinite(seconds) or seconds <= 0 or seconds > 30:
            raise Damaged(f"Unsupported duration {seconds}: {path}")
        decoded = subprocess.run([ffmpeg,"-v","error","-i",str(path),"-f","f32le",
            "-ac","1","-ar","24000","pipe:1"],capture_output=True,check=True,timeout=60)
        values = array.array("f", decoded.stdout)
    except (subprocess.SubprocessError, ValueError) as exc:
        raise Damaged(f"Audio decode failed: {path}: {exc}") from exc
    if not values or any(not math.isfinite(x) for x in values):
        raise Damaged(f"Invalid decoded signal: {path}")
    peak = max(abs(x) for x in values)
    rms = math.sqrt(sum(x*x for x in values)/len(values))
    active = [i for i,x in enumerate(values) if abs(x)>10**(-45/20)]
    if not active or rms < 0.0001:
        raise Damaged(f"Silent or near-silent output: {path}")
    lead, tail = active[0]/24000, (len(values)-1-active[-1])/24000
    clipped = sum(abs(x)>=0.99997 for x in values)
    flags = []
    if seconds < 0.3 or seconds > 20: flags.append("unexpected_duration")
    if lead > 0.8: flags.append("long_leading_silence")
    if tail > 0.8: flags.append("long_trailing_silence")
    if clipped: flags.append("clipping")
    return {"file":str(path),"bytes":path.stat().st_size,"sha256":sha(path),"seconds":seconds,
        "decoded_seconds":len(values)/24000,"decode_ok":True,"peak_dbfs":20*math.log10(peak),
        "rms_dbfs":20*math.log10(rms),"clipped_samples":clipped,
        "leading_below_minus45db_seconds":lead,"trailing_below_minus45db_seconds":tail,"flags":flags}


def intact(path, metric):
    return bool(metric and path.is_file() and path.stat().st_size == metric.get("bytes")
                and sha(path) == metric.get("sha256"))


class Batch:
    def __init__(self, directory, voice, params, api, args, ffmpeg, ffprobe):
        self.directory, self.voice, self.params, self.api, self.args = directory, voice, params, api, args
        self.ffmpeg, self.ffprobe = ffmpeg, ffprobe
        self.path = directory / "progress.json"
        self.state = read_json(self.path) if self.path.exists() else {
            "schema_version":1,"voice":voice,"entries":{},"selected":{},"profile":{}}
        if self.state.get("schema_version") != 1 or self.state.get("voice") != voice:
            raise ValueError("Progress schema/voice mismatch")

    def save(self):
        self.state["updated_at_epoch"] = time.time()
        atomic_json(self.path, self.state)

    def profile(self):
        existing = self.api.request("/profiles")
        names = {f"English Sprout - {self.voice}", f"English Sprout audit 20261008 - {self.voice}"}
        for item in existing:
            if (item.get("name") in names and item.get("language") == "en"
                and item.get("voice_type") == "preset" and item.get("preset_voice_id") == self.voice
                and item.get("preset_engine") == "qwen_custom_voice"):
                self.state["profile"] = {"id":item["id"],"status":"resolved"}
                self.save()
                return item["id"]
        if self.state["profile"].get("status") == "submission_unknown":
            raise Incomplete("Profile POST outcome is unknown; inspect Workbench before creating another profile")
        self.state["profile"] = {"status":"submission_unknown","submitted_at_epoch":time.time()}
        self.save()
        item = self.api.request("/profiles",{"name":f"English Sprout - {self.voice}","language":"en",
            "voice_type":"preset","preset_engine":"qwen_custom_voice","preset_voice_id":self.voice})
        self.state["profile"] = {"id":item["id"],"status":"resolved"}
        self.save()
        return item["id"]

    def submit(self, entry):
        profile_id = self.profile()
        payload = {k:v for k,v in self.params.items() if k not in {"model_revision","encoder","sampling"}}
        payload.update(profile_id=profile_id, text=entry["text"])
        attempt = {"status":"submission_unknown","submitted_at_epoch":time.time(),"request":payload}
        entry["attempts"].append(attempt)
        entry["status"] = "submission_unknown"
        self.save()  # Durable intent BEFORE POST; crash/timeout cannot silently duplicate it.
        try:
            result = self.api.request("/generate", payload)
            generation_id = str(uuid.UUID(result["id"]))
        except urllib.error.HTTPError as exc:
            # 404 profile-not-found and 422 validation happen before generation creation.
            if exc.code in (404, 422):
                attempt.update(status="rejected", error=f"HTTP {exc.code}")
                entry["status"] = "rejected"
            else:
                attempt["error"] = f"Ambiguous HTTP {exc.code}; do not resubmit automatically"
            self.save()
            raise Incomplete(attempt.get("error", "Generation POST failed")) from exc
        except (OSError, ValueError, KeyError) as exc:
            attempt["error"] = str(exc)
            self.save()
            raise Incomplete("Generation POST outcome is unknown; retained intent. Inspect Workbench history before retrying.") from exc
        attempt.update(generation_id=generation_id,status="submitted")
        entry["status"] = "submitted"
        self.save()
        return attempt

    def wait(self, entry, attempt):
        deadline, next_log = time.monotonic()+self.args.job_timeout, 0
        while time.monotonic() < deadline:
            status = self.api.request("/generations/status", {"ids":[attempt["generation_id"]]})[0]
            state = status.get("status")
            attempt["last_server_status"] = status
            if state in ("completed", "failed", "cancelled", "canceled"):
                attempt["status"] = state
                entry["status"] = state
                self.save()
                return state
            if state == "not_found":
                self.save()
                raise Incomplete("Known job ID is missing; inspect Workbench history. No new job was submitted.")
            if time.monotonic() >= next_log:
                print(f"WAIT {self.voice} {entry['lesson_id']} {state}", flush=True)
                self.save()
                next_log = time.monotonic()+30
            time.sleep(self.args.poll_interval)
        self.save()
        raise Incomplete("Job wait timed out; existing job was not cancelled. Rerun to resume its ID.")

    def reuse_sample(self, entry, raw):
        manifest = ROOT / "test-results/voice-audit/samples.json"
        if not manifest.exists(): return False
        audit = read_json(manifest)
        if audit.get("model_revision") != self.params["model_revision"]: return False
        for sample in audit.get("samples", []):
            payload = sample.get("payload", {})
            if (sample.get("voice") != self.voice or sample.get("lesson_id") != entry["lesson_id"]
                or sample.get("text") != entry["text"]): continue
            if any(payload.get(k) != v for k,v in entry["parameters"].items() if k not in {"model_revision","encoder","sampling"}): continue
            if entry["parameters"]["sampling"]["max_new_tokens"] != 3072: continue
            source = (manifest.parent/sample["file"]).resolve()
            if source.parent != manifest.parent.resolve() or not intact(source, sample.get("metrics")): continue
            if raw.exists():
                raw = raw.with_name(raw.stem+"--import-"+str(time.time_ns())+".wav")
                entry["raw_file"] = str(raw)
            shutil.copy2(source, raw)
            entry["source"] = {"kind":"voice-audit","file":str(source),"generation_id":sample["generation_id"],"sha256":sha(source)}
            entry["attempts"].append({"status":"completed","generation_id":sample["generation_id"],"reused":True})
            self.save()
            return True
        return False

    def process(self, lesson):
        key = fingerprint(lesson, self.voice, self.params)
        entry = self.state["entries"].setdefault(key, {"lesson_id":lesson["id"],"text":lesson["english"],
            "voice":self.voice,"fingerprint":key,"parameters":self.params,"status":"new","attempts":[]})
        self.state["selected"][lesson["id"]] = key
        # Each attempt gets a new filename. Existing outputs (including damaged ones) stay intact.
        index = max(1,len(entry["attempts"]))
        if entry["status"] in {"failed","rejected","damaged"}:
            if not self.args.retry_failed:
                print(f"FAILED {lesson['id']}: use --retry-failed after reviewing the saved error",flush=True)
                return False
            entry["status"] = "new"
            index = len(entry["attempts"])+1
        raw = Path(entry.get("raw_file",self.directory/"raw"/f"{lesson['id']}--{key[:12]}--{index}.wav"))
        encoded = Path(entry.get("encoded_file",self.directory/"encoded"/f"{lesson['id']}--{key[:12]}--{index}.mp3"))
        if entry["status"] == "new" and entry["attempts"]:
            raw = self.directory/"raw"/f"{lesson['id']}--{key[:12]}--{index}.wav"
            encoded = self.directory/"encoded"/f"{lesson['id']}--{key[:12]}--{index}.mp3"
        entry.update(raw_file=str(raw),encoded_file=str(encoded))
        self.save()
        if entry["status"] == "submission_unknown":
            raise Incomplete(f"{lesson['id']}: previous POST outcome is unknown. Inspect Workbench history; no automatic resubmission.")
        if intact(raw,entry.get("raw_metrics")) and intact(encoded,entry.get("encoded_metrics")):
            print(f"REUSE {self.voice} {lesson['id']}",flush=True)
            return True
        if entry["status"] == "new":
            if not entry["attempts"] and self.reuse_sample(entry,raw):
                entry["status"] = "completed"
            else:
                self.submit(entry)
        attempt = entry["attempts"][-1]
        if attempt.get("status") not in {"completed"}:
            if self.wait(entry,attempt) != "completed": return False
        try:
            if not raw.exists() or (entry.get("raw_metrics") and not intact(raw,entry["raw_metrics"])):
                body = self.api.request(f"/audio/{attempt['generation_id']}",binary=True)
                if raw.exists():
                    raw = raw.with_name(raw.stem+"--recovered-"+str(time.time_ns())+".wav")
                    entry["raw_file"] = str(raw)
                raw.write_bytes(body)
            entry["raw_metrics"] = media_metrics(raw,self.ffmpeg,self.ffprobe)
            if not intact(encoded,entry.get("encoded_metrics")):
                if encoded.exists():
                    encoded = encoded.with_name(encoded.stem+"--recovered-"+str(time.time_ns())+".mp3")
                    entry["encoded_file"] = str(encoded)
                subprocess.run([self.ffmpeg,"-hide_banner","-loglevel","error","-n","-i",str(raw),
                    "-map_metadata","-1","-af","loudnorm=I=-20:TP=-1.5:LRA=7","-ac","1","-ar","24000",
                    "-c:a","libmp3lame","-b:a","48k","-metadata",f"title={entry['text']}",str(encoded)],check=True,timeout=60)
            entry["encoded_metrics"] = media_metrics(encoded,self.ffmpeg,self.ffprobe)
        except Damaged as exc:
            entry.update(status="damaged",error=str(exc))
            attempt["status"] = "damaged"
            self.save()
            return False
        entry["flags"] = sorted(set(entry["raw_metrics"]["flags"]+entry["encoded_metrics"]["flags"]))
        entry.update(status="ready",completed_at_epoch=time.time())
        self.save()
        print(f"READY {self.voice} {lesson['id']} {entry['encoded_metrics']['seconds']:.2f}s flags={entry['flags']}",flush=True)
        return True


def finish_local_entry(batch, entry, raw):
    entry["raw_metrics"] = media_metrics(raw,batch.ffmpeg,batch.ffprobe)
    if entry["raw_metrics"]["seconds"] > 15:
        raise Damaged("Generated lesson exceeds 15 seconds; retained for review/retry")
    encoded = Path(entry["encoded_file"])
    if not intact(encoded,entry.get("encoded_metrics")):
        if encoded.exists():
            encoded = encoded.with_name(encoded.stem+"--recovered-"+str(time.time_ns())+".mp3")
            entry["encoded_file"] = str(encoded)
        subprocess.run([batch.ffmpeg,"-v","error","-n","-i",str(raw),"-map_metadata","-1",
            "-af","loudnorm=I=-20:TP=-1.5:LRA=7","-ac","1","-ar","24000","-c:a","libmp3lame",
            "-b:a","48k","-metadata",f"title={entry['text']}",str(encoded)],check=True,timeout=60)
    entry["encoded_metrics"] = media_metrics(encoded,batch.ffmpeg,batch.ffprobe)
    entry["flags"] = sorted(set(entry["raw_metrics"]["flags"]+entry["encoded_metrics"]["flags"]))
    entry.update(status="ready",completed_at_epoch=time.time())
    batch.save()


def local_batches(directory, lessons, args, ffmpeg, ffprobe):
    sys.path.insert(0,str(args.workbench/"upstream/voicebox"))
    from backend.services.local_runtime import load_configuration, resource_guard_path
    config = load_configuration(args.workbench)
    guard = resource_guard_path(args.workbench,config)
    python = args.workbench/".venv/Scripts/python.exe"
    if not python.is_file(): raise Incomplete("Workbench Python environment is missing")
    params = parameters(config["custom_voice_revision"],args.seed,512)
    batch = Batch(directory,args.voice,params,None,args,ffmpeg,ffprobe)
    audit_path = ROOT/"test-results/voice-audit/samples.json"
    audit = read_json(audit_path) if audit_path.exists() else {}
    keys = []
    for lesson in lessons:
        # Existing human-auditioned samples ended normally below the old token cap.
        # Keep their ACTUAL 3072-token parameters, never label them as new 512-token runs.
        reused_params = parameters(config["custom_voice_revision"],args.seed,3072)
        audit_sample = next((s for s in audit.get("samples",[]) if s.get("voice")==args.voice
            and s.get("lesson_id")==lesson["id"] and s.get("text")==lesson["english"]
            and s.get("payload",{}).get("seed")==args.seed
            and audit.get("model_revision")==config["custom_voice_revision"]
            and all(s.get("payload",{}).get(k)==v for k,v in reused_params.items()
                    if k not in {"model_revision","encoder","sampling"})
            and Path(s.get("file","")).name == s.get("file")
            and intact(audit_path.parent/s["file"],s.get("metrics"))),None)
        selected_params = reused_params if audit_sample else params
        key = fingerprint(lesson,args.voice,selected_params)
        entry = batch.state["entries"].setdefault(key,{"lesson_id":lesson["id"],"text":lesson["english"],
            "voice":args.voice,"fingerprint":key,"parameters":selected_params,"status":"new","attempts":[]})
        batch.state["selected"][lesson["id"]] = key
        raw = Path(entry.get("raw_file",directory/"raw"/f"{lesson['id']}--{key[:12]}--1.wav"))
        encoded = Path(entry.get("encoded_file",directory/"encoded"/f"{lesson['id']}--{key[:12]}--1.mp3"))
        entry.update(raw_file=str(raw),encoded_file=str(encoded))
        if entry["status"] not in {"failed","damaged","rejected"} and intact(raw,entry.get("raw_metrics")):
            finish_local_entry(batch,entry,raw)
            print(f"REUSE {args.voice} {lesson['id']}",flush=True)
            continue
        if entry["status"] in {"failed","damaged","rejected"} and not args.retry_failed:
            continue
        if entry["status"] == "submission_unknown":
            raise Incomplete("Unknown API submission must be resolved before local replacement")
        if audit_sample and batch.reuse_sample(entry,raw):
            finish_local_entry(batch,entry,Path(entry["raw_file"]))
            print(f"IMPORT AUDITION {args.voice} {lesson['id']}",flush=True)
            continue
        # Preserve orphaned/damaged files, and use a distinct attempt filename.
        index = len(entry["attempts"])+1
        entry["raw_file"] = str(directory/"raw"/f"{lesson['id']}--{key[:12]}--{index}.wav")
        entry["encoded_file"] = str(directory/"encoded"/f"{lesson['id']}--{key[:12]}--{index}.mp3")
        entry["status"] = "queued_local"
        keys.append(key)
    batch.save()
    for offset in range(0,len(keys),args.batch_size):
        job = directory/"jobs"/f"{time.time_ns()}"
        job.mkdir(parents=True)
        request = {"workbench":str(args.workbench.resolve()),"directory":str(directory),"voice":args.voice,
            "keys":keys[offset:offset+args.batch_size],"config":config,"ffmpeg":ffmpeg,"ffprobe":ffprobe}
        atomic_json(job/"request.json",request)
        command = [str(python),str(guard),"--owner",f"英语小芽-{args.voice}","--timeout","900","--",
            str(python),str(ROOT/"scripts/neural_audio_worker.py"),str(job/"request.json")]
        print(f"BATCH {args.voice} {offset+1}-{min(offset+args.batch_size,len(keys))}/{len(keys)}; log={job/'worker.log'}",flush=True)
        with (job/"worker.log").open("a",encoding="utf-8") as log:
            proc = subprocess.Popen(command,cwd=args.workbench,stdout=log,stderr=log,
                creationflags=subprocess.CREATE_NO_WINDOW if os.name=="nt" else 0)
            try:
                code = proc.wait(timeout=args.job_timeout+900)
            finally:
                if proc.poll() is None:
                    proc.terminate()
                    proc.wait(timeout=15)
        batch.state = read_json(batch.path)
        if code: raise Incomplete(f"Guarded batch stopped with exit {code}; inspect {job/'worker.log'} and rerun missing entries")
    batch.state = read_json(batch.path)
    entries = [batch.state["entries"][batch.state["selected"][x["id"]]] for x in lessons]
    ready = sum(x["status"]=="ready" for x in entries)
    print(f"Finished {ready}/{len(entries)}; flagged: {sum(bool(x.get('flags')) for x in entries)}; progress: {batch.path}",flush=True)
    return 0 if ready==len(entries) else 2


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__,formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--voice",required=True,choices=["Aiden","Ryan"])
    parser.add_argument("--ids",nargs="+")
    parser.add_argument("--limit",type=int)
    parser.add_argument("--seed",type=int,default=20261008)
    parser.add_argument("--workbench",type=Path,default=WORKBENCH)
    parser.add_argument("--request-timeout",type=float,default=30)
    parser.add_argument("--job-timeout",type=float,default=1800)
    parser.add_argument("--poll-interval",type=float,default=2)
    parser.add_argument("--retry-failed",action="store_true")
    parser.add_argument("--backend",choices=["local","api"],default="local")
    parser.add_argument("--batch-size",type=int,default=20)
    args = parser.parse_args(argv)
    if args.seed < 0 or min(args.request_timeout,args.job_timeout,args.poll_interval)<=0:
        parser.error("seed must be nonnegative; timeout and interval values must be positive")
    if not 1 <= args.batch_size <= 20: parser.error("--batch-size must be between 1 and 20")
    ffmpeg, ffprobe = shutil.which("ffmpeg"), shutil.which("ffprobe")
    if not ffmpeg or not ffprobe: raise Incomplete("FFmpeg and FFprobe must be installed for maintenance generation")
    lessons = choose_lessons(read_json(ROOT/"public/data/curriculum.json"),args.ids,args.limit)
    directory = ROOT/"test-results/neural-audio"/args.voice
    for folder in (directory,directory/"raw",directory/"encoded"): folder.mkdir(parents=True,exist_ok=True)
    with output_lock(directory/"batch.lock"):
        if args.backend == "local":
            return local_batches(directory,lessons,args,ffmpeg,ffprobe)
        api, config = connect(args.workbench,args.request_timeout)
        params = parameters(config["custom_voice_revision"],args.seed)
        batch = Batch(directory,args.voice,params,api,args,ffmpeg,ffprobe)
        ok = 0
        for lesson in lessons:
            ok += bool(batch.process(lesson))
        flagged = [x for x in lessons if batch.state["entries"][batch.state["selected"][x["id"]]].get("flags")]
        print(f"Finished {ok}/{len(lessons)}; flagged for listening: {len(flagged)}; progress: {batch.path}",flush=True)
        return 0 if ok==len(lessons) else 2


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (Incomplete,OSError,ValueError,subprocess.SubprocessError,KeyError) as exc:
        print(f"Stopped safely: {exc}",file=sys.stderr,flush=True)
        raise SystemExit(2)
