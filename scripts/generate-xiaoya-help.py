"""Local Chinese neural guides. No cloud calls, downloads, tempo or pitch changes.

First run node scripts/xiaoya-help.mjs. Use --ids for a priority batch; --export
copies checked MP3s to public. Raw WAVs/logs stay under test-results. Technical
signal checks are not a claim of human listening acceptance.
"""
from __future__ import annotations
import argparse
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import random
import re
import shutil
import subprocess
import sys
import time
import traceback

ROOT = Path(__file__).resolve().parents[1]
WORKBENCH = Path('E:/AI新项目/游戏工具/配音工作台')
MODEL = Path('E:/AI新项目/商业化工作/validation/voice-upgrade/qwen-1.7b-custom/model')
REVISION = 'f00cf133b78d3c2c35857faba3b1be9b98c4f971'
SMALL_MODEL = Path('E:/AI新项目/商业化工作/validation/voice-upgrade/local-qwen/model')
SMALL_REVISION = '85e237c12c027371202489a0ec509ded67b5e4b5'
PUBLIC = ROOT / 'public/xiaoya/audio'
EVIDENCE = ROOT / 'test-results/xiaoya-neural-help-20261016'
DIRECTION = ('用自然、温暖、清晰的普通话，像一位有耐心的年轻姐姐，面对一个三四岁的小朋友，'
             '轻松地邀请他一起玩。声音柔和但清楚，带一点微笑，音高自然，不尖细，不装婴儿。'
             '短句之间自然停顿，语速从容，不拖长音，不像播报通知。'
             '只说给定台词一遍，不添加词句、笑声或音效。')

def read(path):
    return json.loads(path.read_text(encoding='utf-8-sig'))

def save(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    temp = path.with_suffix('.tmp')
    temp.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    temp.replace(path)

def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

def checks():
    spec = importlib.util.spec_from_file_location('audio_checks', ROOT / 'scripts/generate-neural-audio.py')
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module

def prompts(args):
    spec = read(PUBLIC / 'prompts.json')
    if spec['language'] != 'Chinese':
        raise ValueError('Expected Chinese prompt manifest')
    rows = [p for p in spec['prompts'] if p.get('engine', 'qwen-custom-voice') == 'qwen-custom-voice']
    if any(p.get('voice', 'Serena') != 'Serena' for p in rows):
        raise ValueError('Expected explicit Serena voice')
    ids = [p['id'] for p in rows]
    if len(set(ids)) != len(ids) or any(not re.fullmatch(r'[a-z0-9-]+', i) for i in ids):
        raise ValueError('Prompt IDs must be unique safe filenames')
    if any(not isinstance(p['text'], str) or not p['text'].strip() or len(p['text']) > 100 for p in rows):
        raise ValueError('Each guide must be a short nonempty Chinese sentence')
    if args.ids:
        if set(args.ids) - set(ids):
            raise ValueError('Unknown prompt IDs')
        rows = [p for p in rows if p['id'] in args.ids]
    return rows

def request_for(row, offset, size='1.7B'):
    return dict(id=row['id'], text=row['text'], speaker='Serena', language='Chinese',
        model=f'Qwen/Qwen3-TTS-12Hz-{size}-CustomVoice',
        revision=REVISION if size == '1.7B' else SMALL_REVISION,
        instruct=DIRECTION if size == '1.7B' else '',
        seed=20261016 + int(hashlib.sha256(row['id'].encode()).hexdigest()[:5], 16) + offset,
        sampling=dict(max_new_tokens=384, temperature=0.9, subtalker_temperature=0.9),
        encoder='mono 24000Hz MP3 48kbps; loudnorm I=-20 TP=-1.5 LRA=7; no tempo or pitch effects')

def intact(entry, req):
    if not entry or entry['request'] != req:
        return False
    clip = EVIDENCE / entry['file']
    return clip.is_file() and sha(clip) == entry['metrics']['sha256'] and not entry['metrics']['flags']

def stored_request(row, entry, args):
    """Validate current text/settings while retaining a checked retry's seed/model."""
    old = entry['request'] if entry else {}
    size = args.model_size or ('0.6B' if '0.6B' in old.get('model', '') else '1.7B')
    base = request_for(row, 0, size)
    offset = args.seed_offset if args.seed_offset is not None else old.get('seed', base['seed']) - base['seed']
    return request_for(row, offset, size)

def worker(args):
    rows = prompts(args)
    args.model_size = args.model_size or '1.7B'
    if not 1 <= len(rows) <= 20:
        raise ValueError('A guarded batch must contain 1-20 clips')
    sys.path.insert(0, str(WORKBENCH / 'upstream/voicebox'))
    sys.path.insert(0, str(WORKBENCH / 'scripts'))
    from backend.services.local_runtime import configure_process_tools, require_cuda
    from emotion_resources import require_synthesis_vram, available_physical_memory
    configure_process_tools(WORKBENCH)
    os.environ.update(HF_HOME=str(WORKBENCH / 'cache/huggingface'), HF_HUB_OFFLINE='1',
        TRANSFORMERS_OFFLINE='1', HF_HUB_DISABLE_TELEMETRY='1', DO_NOT_TRACK='1')
    import numpy as np
    import soundfile as sf
    import torch
    from qwen_tts import Qwen3TTSModel
    from transformers import StoppingCriteria, StoppingCriteriaList
    torch.set_num_threads(4)
    require_cuda(torch)
    free, total = torch.cuda.mem_get_info()
    # WDDM's CUDA figure may omit another program's residency. Use the lower
    # global driver reading; never accept CUDA's larger number as extra headroom.
    global_free = subprocess.run(['nvidia-smi', '--query-gpu=memory.free', '--format=csv,noheader,nounits'],
        capture_output=True, text=True, check=True, timeout=10, creationflags=subprocess.CREATE_NO_WINDOW)
    free = min(free, int(global_free.stdout.strip().splitlines()[0]) * 1024**2)
    compact = args.model_size == '0.6B'
    ram = available_physical_memory()
    if compact:
        # Existing workbench natural-voice batch reserved 2488 MiB. Leave
        # another 328 MiB for these short (< 100 character) prompts.
        if free < 2816 * 1024**2 or ram < 2048 * 1024**2:
            raise RuntimeError(f'0.6B Qwen needs 2816 MiB free GPU and 2048 MiB RAM; got {free/1024**2:.0f}/{ram/1024**2:.0f}')
    else:
        require_synthesis_vram(free, total)
    state_file = EVIDENCE / 'production.json'
    state = read(state_file) if state_file.exists() else dict(entries={}, history=[])
    state.update(status='loading', listening_review='not yet approved by user')
    state.pop('error', None)
    state['runtime'] = dict(model_size=args.model_size, decoder='cuda-bf16',
        free_gpu_mib=round(free/1024**2), free_ram_mib=round(ram/1024**2))
    save(state_file, state)
    tick = time.monotonic()
    model = Qwen3TTSModel.from_pretrained(str(SMALL_MODEL if compact else MODEL), device_map='cuda:0', dtype=torch.bfloat16,
        attn_implementation='sdpa', local_files_only=True, low_cpu_mem_usage=True)
    if model.model.tts_model_size != ('0b6' if compact else '1b7'):
        raise RuntimeError('Unexpected cached model size')
    state['load_seconds'] = round(time.monotonic() - tick, 3)
    measure = checks().media_metrics
    ffmpeg, ffprobe = shutil.which('ffmpeg'), shutil.which('ffprobe')
    if not ffmpeg or not ffprobe:
        raise RuntimeError('Existing ffmpeg and ffprobe required')
    class Bound(StoppingCriteria):
        def __init__(self):
            self.start, self.stopped = time.monotonic(), False
        def __call__(self, input_ids, scores, **kwargs):
            self.stopped = time.monotonic() - self.start > 180
            return self.stopped
    active = None
    original = model.model.talker.generate
    def bounded(*a, **kw):
        kw['stopping_criteria'] = StoppingCriteriaList([active])
        return original(*a, **kw)
    model.model.talker.generate = bounded
    lengths = []
    original_generate = model.model.generate
    def captured(*a, **kw):
        result = original_generate(*a, **kw)
        lengths.extend(int(x.shape[0]) for x in result[0])
        return result
    model.model.generate = captured
    for row in rows:
        old = state['entries'].get(row['id'])
        req = stored_request(row, old, args)
        if intact(old, req):
            print('SKIP ' + row['id'], flush=True)
            continue
        key = hashlib.sha256(json.dumps(req, sort_keys=True, ensure_ascii=False).encode()).hexdigest()[:16]
        folder = EVIDENCE / 'clips' / row['id'] / key
        folder.mkdir(parents=True, exist_ok=True)
        raw, encoded = folder / 'raw.wav', folder / 'guide.mp3'
        if raw.exists() or encoded.exists():
            raise RuntimeError('Retained incomplete attempt; use --seed-offset: ' + row['id'])
        save(folder / 'request.json', req)
        state.update(status='generating', current=row['id'])
        save(state_file, state)
        random.seed(req['seed']); np.random.seed(req['seed']); torch.manual_seed(req['seed']); torch.cuda.manual_seed_all(req['seed'])
        torch.cuda.reset_peak_memory_stats()
        active = Bound(); lengths.clear(); tick = time.monotonic()
        with torch.inference_mode():
            wavs, rate = model.generate_custom_voice(text=req['text'], speaker=req['speaker'],
                language='Chinese', instruct=req['instruct'], non_streaming_mode=True, **req['sampling'])
        data = np.asarray(wavs[0])
        if not data.size or not np.isfinite(data).all() or np.max(np.abs(data)) < 0.0001:
            raise RuntimeError('Invalid generated waveform: ' + row['id'])
        sf.write(raw, data, rate, subtype='PCM_24')
        if active.stopped or max(lengths, default=384) >= 384:
            raise RuntimeError('Generation reached a bound; attempt retained for review')
        subprocess.run([ffmpeg, '-v', 'error', '-n', '-i', str(raw), '-map_metadata', '-1',
            '-af', 'loudnorm=I=-20:TP=-1.5:LRA=7', '-ac', '1', '-ar', '24000',
            '-c:a', 'libmp3lame', '-b:a', '48k', str(encoded)], check=True, timeout=60)
        metrics = measure(encoded, ffmpeg, ffprobe)
        entry = dict(request=req, file=encoded.relative_to(EVIDENCE).as_posix(), metrics=metrics,
            generation_seconds=round(time.monotonic() - tick, 3), code_lengths=list(lengths),
            runtime=state['runtime'],
            peak_allocated_mib=round(torch.cuda.max_memory_allocated()/1024**2, 1))
        save(folder / 'report.json', entry)
        if metrics['flags']:
            raise RuntimeError('Audio needs review: ' + row['id'] + ': ' + ', '.join(metrics['flags']))
        if old:
            state['history'].append(old)
        state['entries'][row['id']] = entry
        save(state_file, state)
        print(f"READY {row['id']} {metrics['seconds']:.2f}s {entry['generation_seconds']:.2f}s production", flush=True)
    state.update(status='generated')
    save(state_file, state)

def export(args):
    rows, state = prompts(args), read(EVIDENCE / 'production.json')
    selected = []
    for row in rows:
        entry = state['entries'].get(row['id'])
        if not intact(entry, stored_request(row, entry, args)):
            raise RuntimeError('Missing, changed, or unresolved audio: ' + row['id'])
        selected.append((row, entry))
    for row, entry in selected:
        destination = PUBLIC / (row['id'] + '.mp3')
        temp = destination.with_suffix('.tmp')
        shutil.copyfile(EVIDENCE / entry['file'], temp)
        temp.replace(destination)
    write_manifest()
    print(f'Published {len(selected)} checked local clips', flush=True)

def write_manifest():
    """List only current checked bytes, including the separately staged contexts."""
    entries = {}
    for source in [EVIDENCE / 'production.json', EVIDENCE / 'edge-contexts/production.json']:
        if source.exists():
            entries.update(read(source).get('entries', {}))
    clips = []
    for row in read(PUBLIC / 'prompts.json')['prompts']:
        entry, destination = entries.get(row['id']), PUBLIC / (row['id'] + '.mp3')
        if (entry and entry['request']['text'] == row['text'] and not entry['metrics']['flags']
                and destination.is_file() and sha(destination) == entry['metrics']['sha256']):
            clips.append(dict(id=row['id'], text=row['text'], file=row['id'] + '.mp3',
                voice=entry['request']['speaker'], model=entry['request']['model'],
                revision=entry['request'].get('revision'),
                client=entry['request'].get('client'),
                source=entry['request'].get('source', 'local guarded inference'),
                bytes=entry['metrics']['bytes'], seconds=entry['metrics']['seconds'], sha256=entry['metrics']['sha256']))
    models = sorted({clip['model'] for clip in clips})
    voices = sorted({clip['voice'] for clip in clips})
    save(PUBLIC / 'voice-manifest.json', dict(version=2, voices=voices, language='Chinese',
        model=models[0] if len(models) == 1 else 'multiple neural sources; see each clip',
        source='prerecorded at production time; no runtime TTS or network dependency',
        tempo_or_pitch_effects=False, review='technical signal checks; subjective listening acceptance pending', clips=clips))

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--ids', nargs='+')
    parser.add_argument('--seed-offset', type=int)
    parser.add_argument('--model-size', choices=['1.7B', '0.6B'])
    parser.add_argument('--export', action='store_true')
    parser.add_argument('--worker', action='store_true', help=argparse.SUPPRESS)
    args = parser.parse_args()
    if args.worker:
        EVIDENCE.mkdir(parents=True, exist_ok=True)
        with (EVIDENCE / 'worker.log').open('a', encoding='utf-8', buffering=1) as log:
            sys.stdout = sys.stderr = log
            try:
                return worker(args)
            except Exception as exc:
                state_file = EVIDENCE / 'production.json'
                state = read(state_file) if state_file.exists() else {}
                state.update(status='failed', error=str(exc))
                save(state_file, state)
                traceback.print_exc()
                return 1
    if args.export:
        return export(args)
    rows, config = prompts(args), read(WORKBENCH / 'local_config.json')
    if (EVIDENCE / 'production.json').exists():
        state = read(EVIDENCE / 'production.json')
        rows = [row for row in rows if not intact(state['entries'].get(row['id']), stored_request(row, state['entries'].get(row['id']), args))]
    guard, python = Path(config['resource_guard']), WORKBENCH / '.venv/Scripts/python.exe'
    if not guard.is_file() or not python.is_file() or not (MODEL / 'model.safetensors').is_file():
        raise RuntimeError('Existing runtime/model/guard missing; no automatic installation or download')
    EVIDENCE.mkdir(parents=True, exist_ok=True)
    with checks().output_lock(EVIDENCE / '.production.lock'):
        for start in range(0, len(rows), 20):
            command = [sys.executable, str(guard), '--owner', '小芽英语-中文引导', '--timeout', '900', '--',
                str(python), str(Path(__file__).resolve()), '--worker',
                '--ids', *[r['id'] for r in rows[start:start+20]]]
            if args.seed_offset is not None:
                command.extend(['--seed-offset', str(args.seed_offset)])
            if args.model_size:
                command.extend(['--model-size', args.model_size])
            with (EVIDENCE / 'generation.log').open('a', encoding='utf-8', buffering=1) as log:
                result = subprocess.run(command, cwd=ROOT, stdout=log, stderr=log,
                    creationflags=subprocess.CREATE_NO_WINDOW, timeout=4500)
            if result.returncode:
                raise RuntimeError(f'Generation failed ({result.returncode}); see {EVIDENCE / "generation.log"}')
    print('Local generation finished; use --export after reviewing evidence.', flush=True)

if __name__ == '__main__':
    sys.exit(main())
