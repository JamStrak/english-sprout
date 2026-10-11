"""Make bounded, directed 1.7B character auditions using the shared GPU guard.

Maintenance only. Existing course voices are never overwritten. Raw audio,
requests and technical checks stay under test-results. Export requires the
independent CPU ASR report to match every selected MP3 hash and exact phrase.
"""
from __future__ import annotations

import argparse
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import random
import shutil
import subprocess
import sys
import time

ROOT = Path(__file__).resolve().parents[1]
WORKBENCH = Path('E:/AI新项目/游戏工具/配音工作台')
MODEL = Path('E:/AI新项目/商业化工作/validation/voice-upgrade/qwen-1.7b-custom/model')
REVISION = 'f00cf133b78d3c2c35857faba3b1be9b98c4f971'
EVIDENCE = ROOT / 'test-results/character-voices-20261011'
IDS = ['family-07', 'meals-10', 'tidy-07', 'dress-09']
COMMON = ('Speak very slowly in clear American English, around 100 words per minute. '
          'This is a cartoon character teaching one short phrase to a four-year-old who will repeat it. '
          'Allow tiny natural pauses between phrase groups. Enunciate every word with playful emotion. '
          'Say only the exact phrase once, without laughter, extra words or sound effects. ')
TARGET_SECONDS = {'family-07': 2.4, 'meals-10': 2.7, 'tidy-07': 2.05, 'dress-09': 1.9}
PROFILES = [
    dict(id='pogo', name='Pogo 蹦蹦狐', gender='male', animal='fox', speaker='Aiden',
         tagline='明亮活泼 · 弹跳语调', description='阳光小狐狸的表演方向：带着笑意邀请，关键词轻轻弹起来。',
         direction='A bright, cheerful young male cartoon fox: bouncy pitch changes, a smiling voice, playful anticipation and a friendly upward lilt. Keep the pace leisurely, never rushed.'),
    dict(id='milo', name='Milo 淘气熊', gender='male', animal='bear', speaker='Ryan',
         tagline='温暖顽皮 · 小小戏剧感', description='淘气小熊的表演方向：温暖厚一点，带好奇、故作惊讶的小转折。',
         direction='A warm, mischievous male cartoon bear: rounded resonant tone, a cheeky conspiratorial smile and small theatrical surprises. Use warm low notes then a playful rise on the key word, slowly and clearly.'),
    dict(id='lulu', name='Lulu 甜甜兔', gender='female', animal='rabbit', speaker='Vivian',
         tagline='甜亮欢快 · 有笑意', description='甜甜小兔的表演方向：明亮轻盈，期待和开心写在语气里。',
         direction='A sweet, lively young female cartoon rabbit: bright sparkling tone, smiling musical intonation and delighted anticipation. A cute expressive voice, not shrill or breathy. Speak slowly enough to imitate.'),
    dict(id='pip', name='Pip 泡泡猫', gender='female', animal='cat', speaker='Serena',
         tagline='灵动好奇 · 俏皮小转折', description='泡泡小猫的表演方向：轻柔好奇，像发现了小秘密，句尾有俏皮变化。',
         direction='A curious, impish female cartoon kitten: light warm voice, an expressive questioning tilt, little delighted surprises and a playful secret-sharing quality. Clear speech with relaxed timing, never whisper.'),
]
SCENES = {
    'family-07': 'Invite a friend to play: hopeful, friendly and eager, with a gentle rise on the question.',
    'meals-10': 'Ask politely for delicious milk: sweet hopeful curiosity and a small expectant question at the end.',
    'tidy-07': 'Look for a lost toy: comically puzzled and mildly surprised, not sad or distressed. Clearly pronounce the negative word cannot or can\'t as written.',
    'dress-09': 'Invite a friend to get dressed for a fun outing: cheerful encouragement, as a little shared adventure.',
}


def read(path):
    return json.loads(path.read_text(encoding='utf-8-sig'))


def save(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    temp = path.with_suffix('.tmp')
    temp.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    temp.replace(path)


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def lessons():
    by_id = {x['id']: x for x in read(ROOT / 'public/data/curriculum.json')['lessons']}
    return [by_id[x] for x in IDS]


def existing_metrics():
    spec = importlib.util.spec_from_file_location('course_audio', ROOT / 'scripts/generate-neural-audio.py')
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module.media_metrics


def request_for(profile, lesson, seed):
    return dict(candidate=profile['id'], speaker=profile['speaker'], language='English',
                lesson_id=lesson['id'], text=lesson['english'], seed=seed,
                model='Qwen/Qwen3-TTS-12Hz-1.7B-CustomVoice', revision=REVISION,
                instruct=COMMON + profile['direction'] + ' ' + SCENES[lesson['id']],
                atempo_min=0.65, atempo_max=0.85, target_seconds=TARGET_SECONDS[lesson['id']], preserve_pitch=True,
                sampling=dict(max_new_tokens=256, temperature=0.9, subtalker_temperature=0.9),
                normalization='loudnorm I=-20 TP=-1.5 LRA=7; mono 24kHz MP3 48kbps')


def worker(args):
    """Internal mode: invoked by main only as the child of resource_guard.py."""
    # The full-course producer reuses this worker with a single approved profile.
    priority = {'pogo': 0, 'lulu': 1, 'milo': 2, 'pip': 3}
    ordered_profiles = sorted(PROFILES, key=lambda p: priority.get(p['id'], 99))
    pairs = [(p, l) for l in lessons() for p in ordered_profiles]
    if args.only:
        pairs = [(p,l) for p,l in pairs if f"{p['id']}/{l['id']}" in args.only]
    if not 1 <= len(pairs) <= 20:
        raise ValueError('A guarded batch must contain between one and twenty clips')
    EVIDENCE.mkdir(parents=True, exist_ok=True)
    sys.path.insert(0, str(WORKBENCH / 'upstream/voicebox'))
    sys.path.insert(0, str(WORKBENCH / 'scripts'))
    from backend.services.local_runtime import configure_process_tools, require_cuda
    from emotion_resources import require_synthesis_vram
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
    require_synthesis_vram(*torch.cuda.mem_get_info())
    started = time.monotonic()
    state_path = EVIDENCE / 'production.json'
    state = read(state_path) if state_path.exists() else dict(entries={}, history=[])
    state.update(status='loading', model=str(MODEL), revision=REVISION)
    save(state_path, state)
    model = Qwen3TTSModel.from_pretrained(str(MODEL), device_map='cuda:0', dtype=torch.bfloat16,
                                        attn_implementation='sdpa', local_files_only=True,
                                        low_cpu_mem_usage=True)
    if model.model.tts_model_size != '1b7':
        raise RuntimeError('Expressive audition requires the instruction-capable 1.7B model')
    state['load_seconds'] = round(time.monotonic() - started, 3)
    save(state_path, state)
    measure = existing_metrics()
    ffmpeg, ffprobe = shutil.which('ffmpeg'), shutil.which('ffprobe')
    if not ffmpeg or not ffprobe:
        raise RuntimeError('Existing ffmpeg/ffprobe required')

    class TimeBound(StoppingCriteria):
        def __init__(self):
            self.started = time.monotonic()
            self.stopped = False
        def __call__(self, input_ids, scores, **kwargs):
            self.stopped = time.monotonic() - self.started > 180
            return self.stopped

    original_talker = model.model.talker.generate
    active = None
    def bounded(*a, **kw):
        kw['stopping_criteria'] = StoppingCriteriaList([active])
        return original_talker(*a, **kw)
    model.model.talker.generate = bounded
    lengths = []
    original_generate = model.model.generate
    def captured(*a, **kw):
        result = original_generate(*a, **kw)
        lengths.extend(int(x.shape[0]) for x in result[0])
        return result
    model.model.generate = captured

    for index, (profile, lesson) in enumerate(pairs):
        key = f"{profile['id']}/{lesson['id']}"
        seed = 20261011 + PROFILES.index(profile) * 100 + IDS.index(lesson['id']) + args.seed_offset
        request = request_for(profile, lesson, seed)
        folder = EVIDENCE / profile['id'] / lesson['id'] / str(seed)
        folder.mkdir(parents=True, exist_ok=True)
        raw, encoded = folder / 'raw.wav', folder / 'sample.mp3'
        old = state['entries'].get(key)
        if old and old.get('request') == request and encoded.exists() and sha(encoded) == old.get('metrics', {}).get('sha256'):
            print('SKIP ' + key, flush=True)
            continue
        if raw.exists() or encoded.exists():
            raise RuntimeError('Existing attempt retained; use --seed-offset to make a fresh attempt: ' + key)
        save(folder / 'request.json', request)
        state.update(status='generating', current=key)
        save(state_path, state)
        random.seed(seed); np.random.seed(seed); torch.manual_seed(seed); torch.cuda.manual_seed_all(seed)
        torch.cuda.reset_peak_memory_stats()
        active = TimeBound(); lengths.clear(); tick = time.monotonic()
        with torch.inference_mode():
            wavs, sr = model.generate_custom_voice(text=request['text'], speaker=request['speaker'],
                language='English', instruct=request['instruct'], non_streaming_mode=True, **request['sampling'])
        data = np.asarray(wavs[0])
        if not data.size or not np.isfinite(data).all() or np.max(np.abs(data)) < 0.0001:
            raise RuntimeError('Invalid synthesized waveform: ' + key)
        sf.write(raw, data, sr, subtype='PCM_24')
        if active.stopped or max(lengths, default=256) >= 256:
            raise RuntimeError('Generation reached a bound; retained but not accepted: ' + key)
        atempo = round(min(request['atempo_max'], max(request['atempo_min'], len(data)/sr/request['target_seconds'])), 4)
        subprocess.run([ffmpeg, '-v', 'error', '-n', '-i', str(raw), '-map_metadata', '-1',
            '-af', f'atempo={atempo},loudnorm=I=-20:TP=-1.5:LRA=7', '-ac', '1', '-ar', '24000',
            '-b:a', '48k', str(encoded)], check=True, timeout=60)
        entry = dict(request=request, file=str(encoded.relative_to(ROOT)).replace('\\','/'),
                     raw_metrics=measure(raw, ffmpeg, ffprobe), metrics=measure(encoded, ffmpeg, ffprobe),
                     generation_seconds=round(time.monotonic()-tick, 3), audio_code_lengths=list(lengths),
                     peak_allocated_mib=round(torch.cuda.max_memory_allocated()/1024**2, 1),
                     applied_atempo=atempo, subjective_quality_approved=False)
        save(folder / 'report.json', entry)
        if old:
            state['history'].append(old)
        state['entries'][key] = entry
        save(state_path, state)
        print(f"READY {key} {entry['metrics']['seconds']:.2f}s flags={entry['metrics']['flags']}", flush=True)
    state.update(status='generated', total_seconds=round(time.monotonic()-started, 3))
    save(state_path, state)
    write_asr_input(state)


def write_asr_input(state):
    save(EVIDENCE / 'asr-input.json', [dict(file=e['file'], text=e['request']['text'],
         voice=e['request']['candidate'], lesson_id=e['request']['lesson_id'], language='en')
         for e in state['entries'].values()])


def export(asr_path):
    state = read(EVIDENCE / 'production.json')
    asr = read(asr_path)
    lesson_list = lessons()
    expected = {f"{p['id']}/{l['id']}" for p in PROFILES for l in lesson_list}
    if set(state['entries']) != expected:
        raise ValueError('All sixteen auditions must be present before publication')
    by_hash = {r['sha256']: r for r in asr['results'] if r.get('sha256')}
    clips, rows = [], []
    measure = existing_metrics()
    ffmpeg, ffprobe = shutil.which('ffmpeg'), shutil.which('ffprobe')
    original = {}
    for voice in ['aiden', 'ryan']:
        original[voice] = {}
        for lesson in lesson_list:
            original[voice][lesson['id']] = measure(ROOT / 'public/audio' /
                (('ryan/' if voice == 'ryan' else '') + lesson['id'] + '.mp3'), ffmpeg, ffprobe)['seconds']
    # Validate the entire batch before writing any public files.
    for profile in PROFILES:
        for lesson in lesson_list:
            e = state['entries'][f"{profile['id']}/{lesson['id']}"]
            source = ROOT / e['file']
            metrics = e['metrics']
            check = by_hash.get(metrics['sha256'], {})
            if (e['request']['text'] != lesson['english'] or not source.is_file()
                    or sha(source) != metrics['sha256'] or source.stat().st_size != metrics['bytes']
                    or metrics['flags'] or not check.get('normalized_match') or check.get('flags')
                    or check.get('expected') != lesson['english']):
                raise ValueError('Audition has missing, changed or unresolved content: ' + e['file'])
            destination = f"audio/characters/{profile['id']}/{lesson['id']}.mp3"
            clips.append(dict(candidateId=profile['id'], lessonId=lesson['id'], file=destination,
                              sha256=metrics['sha256'], bytes=metrics['bytes'], seconds=metrics['seconds'],
                              seed=e['request']['seed'], atempo=e.get('applied_atempo', e['request'].get('atempo'))))
            rows.append((source, ROOT / 'public' / destination))
    for source, dest in rows:
        dest.parent.mkdir(parents=True, exist_ok=True)
        if dest.exists() and sha(dest) == sha(source):
            continue
        tmp = dest.with_suffix('.tmp')
        shutil.copyfile(source, tmp)
        tmp.replace(dest)
    candidates = []
    for profile in PROFILES:
        candidate = {k:profile[k] for k in ['id','name','gender','animal','tagline','description']}
        candidate.update(sourceSpeaker=profile['speaker'],
                         samples={l['id']:f"audio/characters/{profile['id']}/{l['id']}.mp3" for l in lesson_list})
        candidates.append(candidate)
    manifest = dict(version=1, createdAt='2026-10-11',
                    lessons=[{k:l[k] for k in ['id','english','chinese']} for l in lesson_list],
                    candidates=candidates, clips=clips,
                    production=dict(model='Qwen/Qwen3-TTS-12Hz-1.7B-CustomVoice', revision=REVISION,
                                    method='New instruction-directed performances; pitch-preserving atempo 0.65 to 0.85, chosen per phrase',
                                    technicalReview='16 decoded clips and independent CPU ASR text checks',
                                    subjectiveApproval=False, originalCourseAudioUnchanged=True))
    save(ROOT / 'public/data/character-voices.json', manifest)
    comparison = dict(original_seconds=original, candidates=[])
    for profile in PROFILES:
        durations = {c['lessonId']:c['seconds'] for c in clips if c['candidateId']==profile['id']}
        total = sum(durations.values())
        comparison['candidates'].append(dict(id=profile['id'], seconds=durations, total=total,
            duration_ratio_to_original_aiden=round(total/sum(original['aiden'].values()),3),
            duration_ratio_to_original_ryan=round(total/sum(original['ryan'].values()),3)))
    save(EVIDENCE / 'duration-comparison.json', comparison)
    print(json.dumps(comparison, ensure_ascii=False, indent=2), flush=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--worker', action='store_true', help=argparse.SUPPRESS)
    parser.add_argument('--seed-offset', type=int, default=0)
    parser.add_argument('--only', nargs='+')
    parser.add_argument('--export', action='store_true')
    parser.add_argument('--asr-report', type=Path, default=ROOT / 'test-results/speech-check/character-voices-20261011.json')
    args = parser.parse_args()
    if args.only and not set(args.only) <= {f"{p['id']}/{l}" for p in PROFILES for l in IDS}:
        parser.error('Unknown candidate/lesson key')
    if args.worker:
        return worker(args)
    if args.export:
        return export(args.asr_report)
    config = read(WORKBENCH / 'local_config.json')
    guard = Path(config['resource_guard'])
    python = WORKBENCH / '.venv/Scripts/python.exe'
    if not guard.is_file() or not python.is_file() or not (MODEL / 'model.safetensors').is_file():
        raise RuntimeError('Existing model/runtime/shared GPU guard is missing; no implicit download')
    EVIDENCE.mkdir(parents=True, exist_ok=True)
    command = [sys.executable, str(guard), '--owner', '英语小芽-角色表演试听', '--timeout', '900', '--',
               str(python), str(Path(__file__).resolve()), '--worker', '--seed-offset', str(args.seed_offset)]
    if args.only:
        command += ['--only', *args.only]
    with (EVIDENCE / 'generation.log').open('a', encoding='utf-8', buffering=1) as log:
        code = subprocess.run(command, cwd=ROOT, stdout=log, stderr=log,
                              creationflags=subprocess.CREATE_NO_WINDOW, timeout=3600).returncode
    print(f'Guarded generation exit {code}; evidence: {EVIDENCE}', flush=True)
    raise SystemExit(code)


if __name__ == '__main__':
    main()
