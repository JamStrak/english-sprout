"""Produce the v0.15 phrase pack as static MP3s, with immutable published URLs.

--plan audits exact legacy-text reuse; --english runs bounded local Qwen batches
through the existing shared GPU guard; --hints uses isolated edge-tts 7.3.1.
--check runs independent local CPU ASR without reference prompts; --export gates
every clip on decoded signal, source hash, and English content/Chinese boundaries.
Only generic public scripts enter production TTS. No child's data is read/uploaded.
English voices remain Aiden/Ryan (0.6B) and approved Pip/Serena (1.7B).
"""
from __future__ import annotations
import argparse
import asyncio
import datetime as dt
import hashlib
import importlib.metadata
import importlib.util
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import time
import traceback

ROOT = Path(__file__).resolve().parents[1]
SPEC_PATH = ROOT / 'design/xiaoya-phrases-v015/phrases.json'
PUBLIC = ROOT / 'public/xiaoya/audio/phrases-v015'
EVIDENCE = ROOT / 'test-results/xiaoya-phrase-pack-v015'
MANIFEST = ROOT / 'design/xiaoya-phrases-v015/audio-manifest.json'
WORKBENCH = Path('E:/AI新项目/游戏工具/配音工作台')
TINY_MODEL = Path('E:/AI新项目/其他实验/儿童英语练习/test-results/speech-check/models/whisper-tiny.en')
BASE_ASR_MODEL = Path('E:/AI新项目/商业化工作/marketing/jobs/V003/work/r002/asr-model')
BASE_ASR_PYTHON = BASE_ASR_MODEL.parent / 'asr-venv/Scripts/python.exe'
VOICE_IDS = ('aiden', 'ryan', 'pip')

def module(name, filename):
    spec = importlib.util.spec_from_file_location(name, ROOT / 'scripts' / filename)
    value = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(value)
    return value

BASE = module('phrase_base', 'generate-xiaoya-help.py')
EDGE = module('phrase_edge', 'generate-xiaoya-context.py')
PIP = module('phrase_pip', 'generate-pip-course.py')
CHECKS = BASE.checks()
read, save, sha = BASE.read, BASE.save, BASE.sha
EDGE.EVIDENCE = EVIDENCE / 'hints'

def phrases():
    rows = read(SPEC_PATH)
    ids = [row['id'] for row in rows]
    if len(rows) != 60 or len(set(ids)) != 60 or any(not re.fullmatch(r'[a-z0-9-]+', x) for x in ids):
        raise ValueError('Exactly sixty unique safe phrase IDs required')
    if any(not row.get('english') or not row.get('hint') for row in rows):
        raise ValueError('Empty English phrase or Chinese hint')
    return rows

def normalized(text):
    return re.sub(r"[^a-z0-9']", '', text.lower().replace('’', "'"))

def phrase_duration_limit(text):
    # Signal integrity alone cannot detect an eleven-second laugh after two words.
    # These are brief child-facing expressions, allowing generous natural pauses.
    return max(5.0, len(re.findall(r"[A-Za-z]+(?:'[A-Za-z]+)?", text)) * 1.2 + 1.0)

def hint_request(row):
    # Verification does not depend on which edge-tts version the caller has installed.
    return dict(id=row['id'], text=row['hint'] + '听我说。', speaker='zh-CN-XiaoxiaoNeural',
        language='Chinese', model='Microsoft Edge Neural TTS',
        source='free online synthesis of generic public text during production only',
        client='edge-tts ' + EDGE.CLIENT_VERSION, rate='+0%', pitch='+0Hz', volume='+0%',
        boundary='WordBoundary',
        encoder='mono 24000Hz MP3 48kbps; loudnorm I=-20 TP=-1.5 LRA=7; no tempo or pitch effects')

def legacy_sources():
    original = read(ROOT / 'public/audio/manifest.json')
    pip = read(ROOT / 'public/audio/pip-manifest.json')
    index = {}
    for clip in original['clips']:
        voice = clip['voice'].lower()
        if voice not in VOICE_IDS[:2]:
            continue
        index[(normalized(clip['text']), voice)] = dict(clip,
            source_manifest='public/audio/manifest.json', model=clip['engine'],
            source='Original locally produced Qwen3-TTS course clip; exact spoken text reused unchanged')
    for clip in pip['clips']:
        index[(normalized(clip['text']), 'pip')] = dict(clip, file='public/' + clip['file'],
            voice='Serena', source_manifest='public/audio/pip-manifest.json',
            model=pip['model'], modelRevision=pip['modelRevision'],
            source='Original Pip character course clip; exact spoken text and approved voice direction reused unchanged')
    return index

def ff_tools():
    ffmpeg = WORKBENCH / 'runtime/ffmpeg/bin/ffmpeg.exe'
    ffprobe = ffmpeg.with_name('ffprobe.exe')
    if not ffmpeg.is_file() or not ffprobe.is_file():
        ffmpeg = Path(shutil.which('ffmpeg') or '')
        ffprobe = Path(shutil.which('ffprobe') or '')
    if not ffmpeg.is_file() or not ffprobe.is_file():
        raise RuntimeError('Existing FFmpeg/FFprobe required; no implicit installation')
    return str(ffmpeg), str(ffprobe)

def request(row, voice, seed_offset=0):
    lesson = dict(id=row['id'], english=row['english'])
    expressive = voice == 'pip'
    return dict(id=row['id'], text=row['english'], voiceId=voice,
        speaker='Serena' if expressive else voice.title(), language='English',
        model='Qwen/Qwen3-TTS-12Hz-' + ('1.7B' if expressive else '0.6B') + '-CustomVoice',
        revision=BASE.REVISION if expressive else BASE.SMALL_REVISION,
        seed=20261019 + int(hashlib.sha256((voice + row['id']).encode()).hexdigest()[:5], 16) + seed_offset,
        instruct=PIP.sample.COMMON + PIP.PIP['direction'] + ' ' + PIP.direction_for(lesson) if expressive else '',
        target_seconds=PIP.target_seconds(lesson) if expressive else None,
        sampling=dict(max_new_tokens=256 if expressive else 512, temperature=.9, subtalker_temperature=.9),
        source='Local offline Qwen3-TTS inference, existing shared GPU guard; no runtime synthesis',
        encoder='mono 24000 Hz MP3 48 kbps; loudnorm I=-20 TP=-1.5 LRA=7',
        tempo='pitch-preserving atempo 0.65-0.85, matching original Pip course' if expressive else 'natural speed')

def entry_path(voice, phrase_id):
    return EVIDENCE / 'english' / voice / phrase_id / 'selected.json'

def current_entry(row, voice):
    path = entry_path(voice, row['id'])
    if not path.exists():
        return None
    entry = read(path)
    source = ROOT / entry['file']
    req = entry['request']
    if req['text'] != row['english'] or req['voiceId'] != voice or not source.is_file() or sha(source) != entry['metrics']['sha256']:
        raise ValueError('Changed staged audio: ' + str(path))
    return entry

def worker(job_path):
    def stage(message):
        with job_path.with_name('worker-status.log').open('a', encoding='utf-8') as log:
            log.write(dt.datetime.now(dt.timezone.utc).isoformat() + ' ' + message + '\n')
        print(message, flush=True)
    stage('Worker started')
    job = read(job_path)
    rows = job['rows']
    voice = job['voice']
    if voice not in VOICE_IDS or not 1 <= len(rows) <= 20:
        raise ValueError('Guarded worker requires 1-20 clips of one known voice')
    sys.path[:0] = [str(WORKBENCH / 'upstream/voicebox'), str(WORKBENCH / 'scripts')]
    from backend.services.local_runtime import configure_process_tools, require_cuda
    from emotion_resources import require_synthesis_vram, available_physical_memory
    configure_process_tools(WORKBENCH)
    os.environ.update(HF_HOME=str(WORKBENCH / 'cache/huggingface'), HF_HUB_OFFLINE='1',
        TRANSFORMERS_OFFLINE='1', HF_HUB_DISABLE_TELEMETRY='1', DO_NOT_TRACK='1')
    import random
    import numpy as np
    import soundfile as sf
    import torch
    from qwen_tts import Qwen3TTSModel
    stage('Model libraries imported')
    from transformers import StoppingCriteria, StoppingCriteriaList
    torch.set_num_threads(4)
    require_cuda(torch)
    free, total = torch.cuda.mem_get_info()
    global_free = subprocess.run(['nvidia-smi', '--query-gpu=memory.free', '--format=csv,noheader,nounits'],
        capture_output=True, text=True, check=True, timeout=10, creationflags=subprocess.CREATE_NO_WINDOW)
    free = min(free, int(global_free.stdout.strip().splitlines()[0]) * 1024**2)
    if voice == 'pip':
        require_synthesis_vram(free, total)
    elif free < 2816 * 1024**2 or available_physical_memory() < 2048 * 1024**2:
        raise RuntimeError('Local 0.6B worker requires 2816 MiB free GPU and 2048 MiB RAM')
    model_path = BASE.MODEL if voice == 'pip' else BASE.SMALL_MODEL
    stage('Loading ' + str(model_path))
    model = Qwen3TTSModel.from_pretrained(str(model_path), device_map='cuda:0', dtype=torch.bfloat16,
        attn_implementation='sdpa', local_files_only=True, low_cpu_mem_usage=True)
    if model.model.tts_model_size != ('1b7' if voice == 'pip' else '0b6'):
        raise ValueError('Unexpected model size')
    stage('Model ready')
    ffmpeg, ffprobe = ff_tools()
    class Bound(StoppingCriteria):
        def __init__(self): self.start, self.stopped = time.monotonic(), False
        def __call__(self, input_ids, scores, **kwargs):
            self.stopped = time.monotonic() - self.start > 180
            return self.stopped
    original_talker = model.model.talker.generate
    active = None
    def bounded(*args, **kwargs):
        kwargs['stopping_criteria'] = StoppingCriteriaList([active])
        return original_talker(*args, **kwargs)
    model.model.talker.generate = bounded
    lengths = []
    original_generate = model.model.generate
    def capture(*args, **kwargs):
        value = original_generate(*args, **kwargs)
        lengths.extend(int(x.shape[0]) for x in value[0])
        return value
    model.model.generate = capture
    for row in rows:
        req = request(row, voice, job['seed_offset'])
        folder = entry_path(voice, row['id']).parent / str(req['seed'])
        folder.mkdir(parents=True, exist_ok=True)
        raw, encoded = folder / 'raw.wav', folder / 'speech.mp3'
        if raw.exists() or encoded.exists():
            raise ValueError('Retained attempt already exists; use an explicit new --seed-offset')
        save(folder / 'request.json', req)
        random.seed(req['seed']); np.random.seed(req['seed']); torch.manual_seed(req['seed']); torch.cuda.manual_seed_all(req['seed'])
        active = Bound(); lengths.clear(); tick = time.monotonic()
        kwargs = dict(text=req['text'], language='English', speaker=req['speaker'], **req['sampling'])
        if voice == 'pip': kwargs.update(instruct=req['instruct'], non_streaming_mode=True)
        with torch.inference_mode(): wavs, rate = model.generate_custom_voice(**kwargs)
        data = np.asarray(wavs[0])
        if not data.size or not np.isfinite(data).all() or np.max(np.abs(data)) < .0001:
            raise RuntimeError('Invalid synthesized signal: ' + row['id'])
        sf.write(raw, data, rate, subtype='PCM_24')
        if active.stopped or max(lengths, default=req['sampling']['max_new_tokens']) >= req['sampling']['max_new_tokens']:
            raise RuntimeError('Generation hit safety bound: ' + row['id'])
        tempo = round(min(.85, max(.65, len(data) / rate / req['target_seconds'])), 4) if voice == 'pip' else 1
        filters = ('atempo=' + str(tempo) + ',' if voice == 'pip' else '') + 'loudnorm=I=-20:TP=-1.5:LRA=7'
        subprocess.run([ffmpeg, '-v', 'error', '-n', '-i', str(raw), '-map_metadata', '-1', '-af', filters,
            '-ac', '1', '-ar', '24000', '-c:a', 'libmp3lame', '-b:a', '48k', str(encoded)], check=True, timeout=60)
        metrics = CHECKS.media_metrics(encoded, ffmpeg, ffprobe)
        entry = dict(request=req, file=encoded.relative_to(ROOT).as_posix(), metrics=metrics,
            raw_sha256=sha(raw), applied_atempo=tempo, code_lengths=list(lengths),
            generation_seconds=round(time.monotonic() - tick, 3))
        save(folder / 'report.json', entry)
        save(entry_path(voice, row['id']), entry)
        stage('READY ' + voice + ' ' + row['id'] + ' ' + str(metrics['seconds']) + ' ' + str(metrics['flags']))

def english(args, rows):
    sources = legacy_sources()
    guard = Path(read(WORKBENCH / 'local_config.json')['resource_guard'])
    for voice in args.voices:
        selected = [row for row in rows if (normalized(row['english']), voice) not in sources
            and (args.redo or current_entry(row, voice) is None)]
        for offset in range(0, len(selected), 20):
            batch = selected[offset:offset + 20]
            directory = EVIDENCE / 'jobs' / f'{voice}-{time.time_ns()}'
            job = directory / 'request.json'
            save(job, dict(voice=voice, rows=batch, seed_offset=args.seed_offset))
            command = [sys.executable, str(guard), '--owner', '小芽英语-v015-' + voice, '--timeout', '900', '--',
                str(WORKBENCH / '.venv/Scripts/python.exe'), '-u', '-X', 'faulthandler', str(Path(__file__).resolve()), '--worker', str(job)]
            print('BATCH', voice, offset + 1, '/', len(selected), flush=True)
            with (directory / 'worker.log').open('a', encoding='utf-8') as log:
                result = subprocess.run(command, cwd=ROOT, stdout=log, stderr=log,
                    creationflags=subprocess.CREATE_NO_WINDOW, timeout=3600)
            if result.returncode:
                raise RuntimeError('Worker stopped with exit ' + str(result.returncode) + '; inspect ' + str(directory / 'worker.log'))

def hints(rows):
    if importlib.metadata.version('edge-tts') != EDGE.CLIENT_VERSION:
        raise RuntimeError('Use existing isolated edge-tts==' + EDGE.CLIENT_VERSION)
    EDGE.EVIDENCE.mkdir(parents=True, exist_ok=True)
    state_path = EDGE.EVIDENCE / 'production.json'
    state = read(state_path) if state_path.exists() else dict(entries={})
    with CHECKS.output_lock(EDGE.EVIDENCE / '.production.lock'):
        asyncio.run(EDGE.generate([dict(id=row['id'], text=row['hint'] + '听我说。') for row in rows], state))

def check(rows):
    records = []
    for row in rows:
        for voice in VOICE_IDS:
            entry = current_entry(row, voice)
            if entry:
                records.append(dict(file=entry['file'], text=row['english'], voice=voice, lesson_id=row['id']))
    if not records: raise ValueError('No newly produced English clips to check')
    source = EVIDENCE / 'asr-input.json'
    save(source, records)
    command = [str(WORKBENCH / '.venv/Scripts/python.exe'), str(ROOT / 'scripts/check-neural-speech.py'),
        '--input', str(source), '--audio-root', str(ROOT), '--model-dir', str(TINY_MODEL),
        '--report-name', 'xiaoya-phrases-v015']
    subprocess.run(command, cwd=ROOT, check=True, timeout=1800, creationflags=subprocess.CREATE_NO_WINDOW)

def crosscheck(rows):
    """Resolve tiny.en discrepancies with an existing larger CPU recognizer.

    Both the untouched raw take and final encoded MP3 must independently match;
    neither recognizer receives expected text, a vocabulary hint or a prompt.
    """
    os.environ.update(HF_HUB_OFFLINE='1', TRANSFORMERS_OFFLINE='1', OMP_NUM_THREADS='2')
    if sha(BASE_ASR_MODEL / 'model.bin') != PIP.BASE_MODEL_SHA256:
        raise ValueError('Existing base ASR model checksum differs')
    from faster_whisper import WhisperModel
    normalizer = module('phrase_asr_normalizer', 'check-neural-speech.py')
    tiny_report = read(ROOT / 'test-results/speech-check/xiaoya-phrases-v015.json')
    tiny = {result.get('sha256'): result for result in tiny_report['results']}
    path = EVIDENCE / 'base-crosscheck.json'
    state = read(path) if path.exists() else dict(model='Systran/faster-whisper-base',
        modelWeightSHA256=PIP.BASE_MODEL_SHA256, device='cpu', computeType='int8',
        referencePrompt=False, beamSize=5, entries={})
    model = None
    for row in rows:
        for voice in VOICE_IDS:
            entry = current_entry(row, voice)
            if not entry: continue
            digest = entry['metrics']['sha256']
            previous = tiny.get(digest, {})
            if previous.get('normalized_match') and not previous.get('flags'): continue
            key = voice + '/' + row['id']
            old = state['entries'].get(key, {})
            if old.get('sha256') == digest and old.get('expected') == row['english']:
                continue
            if model is None:
                model = WhisperModel(str(BASE_ASR_MODEL), device='cpu', compute_type='int8',
                    cpu_threads=2, local_files_only=True)
            result = dict(voice=voice, phraseId=row['id'], expected=row['english'], sha256=digest,
                sourceRawSHA256=entry['raw_sha256'], tinyRecognized=previous.get('recognized'), readings={})
            for kind, audio in [('raw', (ROOT / entry['file']).with_name('raw.wav')),
                                ('mp3', ROOT / entry['file'])]:
                expected_hash = entry['raw_sha256'] if kind == 'raw' else digest
                if sha(audio) != expected_hash: raise ValueError('Changed crosscheck input')
                segments, info = model.transcribe(str(audio), language='en', beam_size=5,
                    vad_filter=False, condition_on_previous_text=False, temperature=0.0, word_timestamps=True)
                segments = list(segments)
                recognized = ''.join(segment.text for segment in segments).strip()
                result['readings'][kind] = dict(recognized=recognized,
                    normalized_match=normalizer.normalized_words(row['english']) == normalizer.normalized_words(recognized),
                    segment_log_probabilities=[segment.avg_logprob for segment in segments],
                    words=[dict(word=word.word, probability=word.probability) for segment in segments for word in segment.words])
            result['passed'] = all(part['normalized_match'] for part in result['readings'].values())
            state['entries'][key] = result
            save(path, state)
            print('CROSSCHECK', key, result['passed'], result['readings']['mp3']['recognized'], flush=True)

def valid_crosscheck(state, row, voice, entry):
    result = state.get('entries', {}).get(voice + '/' + row['id'], {})
    return bool(state.get('modelWeightSHA256') == PIP.BASE_MODEL_SHA256
        and state.get('referencePrompt') is False and state.get('device') == 'cpu'
        and result.get('sha256') == entry['metrics']['sha256']
        and result.get('sourceRawSHA256') == entry['raw_sha256']
        and result.get('expected') == row['english'] and result.get('passed') is True
        and all(result.get('readings', {}).get(kind, {}).get('normalized_match') for kind in ('raw', 'mp3')))

def export(rows):
    all_rows = phrases()
    if rows != all_rows: raise ValueError('Export requires the complete sixty-phrase pack')
    ffmpeg, ffprobe = ff_tools()
    sources = legacy_sources()
    hints_state = read(EDGE.EVIDENCE / 'production.json')['entries']
    asr = read(ROOT / 'test-results/speech-check/xiaoya-phrases-v015.json')
    checker = module('phrase_export_checker', 'check-neural-speech.py')
    settings = asr.get('settings', {})
    if (settings.get('model_weight_sha256') != checker.MODEL_WEIGHT_SHA256
            or settings.get('reference_prompt') is not False or settings.get('device') != 'cpu'):
        raise ValueError('Expected independent local CPU recognizer without reference prompts')
    by_hash = {r['sha256']: r for r in asr['results'] if r.get('sha256')}
    cross_path = EVIDENCE / 'base-crosscheck.json'
    cross_state = read(cross_path) if cross_path.exists() else {}
    clips, copies, failures, mapping = [], [], [], {}
    for row in rows:
        mapping[row['id']] = dict(english={}, hint='xiaoya/audio/phrases-v015/' + row['id'] + '/hint.mp3')
        for voice in (*VOICE_IDS, 'hint'):
            reused = voice != 'hint' and sources.get((normalized(row['english']), voice))
            if reused:
                source = ROOT / reused['file']
                text, speaker = row['english'], reused['voice']
                provenance = reused
                expected_hash = reused['sha256']
                content_check = dict(method='Exact text and hash match against original published course manifest',
                    sourceText=reused['text'], passed=True)
            elif voice == 'hint':
                hint_row = dict(id=row['id'], text=row['hint'] + '听我说。')
                entry = hints_state.get(row['id'])
                if (not EDGE.intact(entry, hint_request(row)) or not entry.get('word_coverage', {}).get('matches_prompt')
                        or EDGE.normalize(entry['word_coverage']['text']) != EDGE.normalize(hint_row['text'])):
                    failures.append(row['id'] + '/hint incomplete'); continue
                source = EDGE.EVIDENCE / entry['file']
                text, speaker = hint_row['text'], entry['request']['speaker']
                provenance, expected_hash = entry['request'], entry['metrics']['sha256']
                content_check = dict(method='Returned WordBoundary sequence matches complete Chinese prompt', **entry['word_coverage'])
            else:
                entry = current_entry(row, voice)
                if not entry:
                    failures.append(row['id'] + '/' + voice + ' missing'); continue
                source = ROOT / entry['file']
                text, speaker = row['english'], entry['request']['speaker']
                provenance, expected_hash = dict(entry['request'], appliedAtempo=entry['applied_atempo']), entry['metrics']['sha256']
                content_check = by_hash.get(expected_hash, {})
                if not content_check.get('normalized_match') or content_check.get('flags'):
                    if valid_crosscheck(cross_state, row, voice, entry):
                        content_check = dict(method='Independent base ASR matched both raw WAV and final MP3',
                            model=cross_state['model'], modelWeightSHA256=PIP.BASE_MODEL_SHA256,
                            referencePrompt=False, device='cpu',
                            **cross_state['entries'][voice + '/' + row['id']])
                    else:
                        failures.append(row['id'] + '/' + voice + ' unresolved content ' + str(content_check.get('recognized')))
            metrics = CHECKS.media_metrics(source, ffmpeg, ffprobe)
            if metrics['sha256'] != expected_hash or metrics['flags']:
                failures.append(row['id'] + '/' + voice + ' integrity/signal ' + str(metrics['flags']))
            if voice != 'hint' and metrics['seconds'] > phrase_duration_limit(text):
                failures.append(row['id'] + '/' + voice + ' excessive short-phrase duration ' + str(metrics['seconds']))
            destination = PUBLIC / row['id'] / (voice + '.mp3')
            if destination.exists() and sha(destination) != expected_hash:
                raise ValueError('Published immutable URL would change: ' + str(destination))
            url = 'xiaoya/audio/phrases-v015/' + row['id'] + '/' + voice + '.mp3'
            if voice != 'hint': mapping[row['id']]['english'][voice] = url
            clips.append(dict(phraseId=row['id'], voiceId=voice, voice=speaker, text=text,
                url=url, file=destination.relative_to(ROOT).as_posix(), reused=bool(reused),
                source=provenance['source'], sourceFile=source.relative_to(ROOT).as_posix(),
                provenance=provenance, contentCheck=content_check,
                bytes=metrics['bytes'], seconds=metrics['seconds'], sha256=metrics['sha256'], metrics=metrics))
            copies.append((source, destination))
    if failures:
        save(EVIDENCE / 'export-blockers.json', failures)
        raise RuntimeError('Export blocked: ' + '; '.join(failures))
    if len(clips) != 240: raise ValueError('Exactly 240 checked clips required')
    for source, destination in copies:
        destination.parent.mkdir(parents=True, exist_ok=True)
        if not destination.exists():
            temporary = destination.with_suffix('.tmp')
            shutil.copyfile(source, temporary)
            temporary.replace(destination)
    save(MANIFEST, dict(version=1, pack='phrases-v015', status='complete',
        createdAt=dt.datetime.now(dt.timezone.utc).isoformat(), phraseSpecSHA256=sha(SPEC_PATH),
        phraseCount=60, clipCount=len(clips), totalBytes=sum(c['bytes'] for c in clips),
        reusedEnglishClips=sum(c['reused'] for c in clips), runtimeSynthesis=False,
        newEnglishClips=sum(c['voiceId'] != 'hint' and not c['reused'] for c in clips),
        newChineseHints=sum(c['voiceId'] == 'hint' for c in clips),
        childDataUploaded=False, voiceMapping=mapping,
        productionSources=[
            dict(provider='Alibaba Qwen3-TTS', model='Qwen3-TTS-12Hz-0.6B-CustomVoice',
                revision=BASE.SMALL_REVISION, voices=['Aiden', 'Ryan'], runtime='Local offline inference',
                sourceURL='https://huggingface.co/Qwen/Qwen3-TTS-12Hz-0.6B-CustomVoice'),
            dict(provider='Alibaba Qwen3-TTS', model='Qwen3-TTS-12Hz-1.7B-CustomVoice',
                revision=BASE.REVISION, voices=['Serena, original Pip character direction'], runtime='Local offline inference',
                sourceURL='https://huggingface.co/Qwen/Qwen3-TTS-12Hz-1.7B-CustomVoice'),
            dict(provider='Microsoft Edge Neural TTS', voice='zh-CN-XiaoxiaoNeural', client='edge-tts 7.3.1',
                sourceURL='https://github.com/rany2/edge-tts',
                usage='Generic public hint text sent during production only; app receives static MP3',
                rightsNote='Third-party service synthesis; this production record is not an independent distribution-rights review')],
        validation='All 240 final MP3s decoded; hashes and non-silent signal checked; new English independently recognized without reference prompts; Chinese word boundaries matched',
        englishRecognizer=settings,
        subjectiveListeningApproved=False, clips=clips))
    print('EXPORTED', len(clips), 'clips;', sum(c['bytes'] for c in clips), 'bytes', flush=True)

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--plan', action='store_true')
    parser.add_argument('--english', action='store_true')
    parser.add_argument('--hints', action='store_true')
    parser.add_argument('--check', action='store_true')
    parser.add_argument('--crosscheck', action='store_true')
    parser.add_argument('--crosscheck-worker', action='store_true', help=argparse.SUPPRESS)
    parser.add_argument('--export', action='store_true')
    parser.add_argument('--worker', type=Path, help=argparse.SUPPRESS)
    parser.add_argument('--ids', nargs='+')
    parser.add_argument('--voices', nargs='+', choices=VOICE_IDS, default=list(VOICE_IDS))
    parser.add_argument('--redo', action='store_true')
    parser.add_argument('--seed-offset', type=int, default=0)
    args = parser.parse_args()
    if args.worker:
        try:
            return worker(args.worker)
        except BaseException:
            args.worker.with_name('worker-error.log').write_text(traceback.format_exc(), encoding='utf-8')
            raise
    rows = phrases()
    if args.ids:
        if set(args.ids) - {row['id'] for row in rows}: raise ValueError('Unknown phrase IDs')
        rows = [row for row in rows if row['id'] in args.ids]
    EVIDENCE.mkdir(parents=True, exist_ok=True)
    if args.plan:
        sources = legacy_sources()
        reused = [dict(id=row['id'], voice=voice, file=sources[(normalized(row['english']), voice)]['file'])
            for row in rows for voice in VOICE_IDS if (normalized(row['english']), voice) in sources]
        result = dict(phraseSpecSHA256=sha(SPEC_PATH), phrases=len(rows), english=len(rows)*3,
            reused=len(reused), newEnglish=len(rows)*3-len(reused), hints=len(rows), reuse=reused)
        save(EVIDENCE / 'plan.json', result)
        print(json.dumps(result, ensure_ascii=False), flush=True)
    if args.english: english(args, rows)
    if args.hints: hints(rows)
    if args.check: check(rows)
    if args.crosscheck:
        if not BASE_ASR_PYTHON.is_file():
            raise RuntimeError('Existing isolated faster-whisper interpreter required')
        command = [str(BASE_ASR_PYTHON), '-u', str(Path(__file__).resolve()), '--crosscheck-worker']
        if args.ids: command.extend(['--ids', *args.ids])
        EVIDENCE.mkdir(parents=True, exist_ok=True)
        with (EVIDENCE / 'crosscheck.log').open('a', encoding='utf-8') as log:
            subprocess.run(command, cwd=ROOT, check=True, timeout=1800, stdout=log, stderr=log,
                creationflags=subprocess.CREATE_NO_WINDOW)
    if args.crosscheck_worker: crosscheck(rows)
    if args.export: export(rows)

if __name__ == '__main__': main()
