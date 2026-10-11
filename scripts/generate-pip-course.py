"""Complete the approved Pip voice offline, resuming checked work in <=20-clip batches.

Uses the existing character worker, shared GPU guard, file metrics and independent
CPU ASR checker. Never writes the original Aiden/Ryan/UI package. Run with --export
only after the complete independent content report passes all 120 files.
"""
from __future__ import annotations

import argparse
import copy
import importlib.util
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import time
from types import SimpleNamespace

ROOT = Path(__file__).resolve().parents[1]
EVIDENCE = ROOT / 'test-results/pip-course-20261011'
STATE_PATH = EVIDENCE / 'production.json'
REPORT_PATH = ROOT / 'test-results/speech-check/pip-course-20261011.json'
BASE_MODEL_SHA256 = 'd01c3014881c9c6f3133c182f3d2887eb6ca1c789a7538c5c007196857a0a6a9'


def load_module(name, filename):
    spec = importlib.util.spec_from_file_location(name, ROOT / 'scripts' / filename)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


sample = load_module('character_samples', 'generate-character-samples.py')
audio = load_module('course_audio', 'generate-neural-audio.py')
read, save, sha = sample.read, sample.save, sample.sha
PIP = next(p for p in sample.PROFILES if p['id'] == 'pip')
APPROVED_IDS = tuple(sample.IDS)


def curriculum():
    return read(ROOT / 'public/data/curriculum.json')['lessons']


def direction_for(lesson):
    """Keep the selected character identity; adapt only the phrase's situation."""
    text = lesson['english'].lower()
    if lesson['id'] == 'meals-04':
        return ('A warm polite request from the curious kitten. Use especially clear English diction: '
                'make a tiny natural pause after Pass, then clearly say the spoon as a connected group. '
                'Keep the article the audible, with its voiced th sound, and articulate the initial sp '
                'consonant cluster of spoon crisply. Keep the voice warm and lightly playful, with no extra words.')
    if lesson['id'] in sample.SCENES:
        return sample.SCENES[lesson['id']]
    if any(word in text for word in ['hurt', 'sick', 'scared', 'sad', 'angry', 'tired']):
        return 'Express the feeling with gentle, childlike sincerity and clear words. Keep it reassuring, without distress, exaggerated crying or loudness.'
    if any(word in text for word in ["don't", "can't", ' not ', 'stop', 'help']):
        return 'Make the meaning clear with a gentle but definite emphasis, especially any negative word. A friendly playful character, not a scolding adult.'
    if lesson['english'].endswith('?'):
        return 'Ask with friendly curiosity and an expressive, playful question at the end. Be polite, with a small expectant smile.'
    if text.startswith(("let's", 'come ', 'look ', 'watch ')):
        return 'Invite a friend with a cheerful little discovery, encouraging and gently playful, without rushing.'
    if 'thank' in text or 'please' in text or 'sorry' in text:
        return 'Use warm sincere politeness, with the character\'s friendly smile and soft expressive intonation.'
    return 'Say this everyday phrase with friendly curiosity, clear meaning and a little playful warmth. Keep the voice consistent with the curious kitten.'


def target_seconds(lesson):
    if lesson['id'] in sample.TARGET_SECONDS:
        return sample.TARGET_SECONDS[lesson['id']]
    words = len(re.findall(r"[A-Za-z]+(?:'[A-Za-z]+)?", lesson['english']))
    return round(max(1.55, min(4.6, words * 0.43 + 0.25)), 2)


def configure_worker(job):
    """Configuration stays inside this guarded child process."""
    all_lessons = curriculum()
    allowed = {l['id'] for l in all_lessons} - set(APPROVED_IDS)
    ids = job['ids']
    if not 1 <= len(ids) <= 20 or len(set(ids)) != len(ids) or not set(ids) <= allowed:
        raise ValueError('Worker accepts at most twenty distinct, unapproved lesson IDs')
    output = Path(job['directory']).resolve()
    if output.parent != (EVIDENCE / 'batches').resolve():
        raise ValueError('Batch output escaped the dedicated evidence directory')
    sample.EVIDENCE = output
    sample.IDS = [l['id'] for l in all_lessons]
    sample.PROFILES = [PIP]
    sample.SCENES = {l['id']: direction_for(l) for l in all_lessons}
    sample.TARGET_SECONDS = {l['id']: target_seconds(l) for l in all_lessons}
    sample.lessons = lambda: all_lessons
    return SimpleNamespace(only=['pip/' + x for x in ids], seed_offset=job['seed_offset'])


def ensure_approved(state):
    original = read(ROOT / 'test-results/character-voices-20261011/production.json')['entries']
    public_manifest = read(ROOT / 'public/data/character-voices.json')
    manifest_clips = {c['lessonId']: c for c in public_manifest['clips'] if c['candidateId'] == 'pip'}
    for lesson_id in APPROVED_IDS:
        path = ROOT / 'public' / manifest_clips[lesson_id]['file']
        expected_hash = manifest_clips[lesson_id]['sha256']
        if sha(path) != expected_hash:
            raise ValueError('Approved public audition has changed: ' + lesson_id)
        entry = copy.deepcopy(original['pip/' + lesson_id])
        if entry['metrics']['sha256'] != expected_hash:
            raise ValueError('Approved source evidence differs from public audition')
        entry.update(file=str(path.relative_to(ROOT)).replace('\\', '/'), reused_approved_sample=True)
        state['entries']['pip/' + lesson_id] = entry
        state['approved_hashes'][lesson_id] = expected_hash


def check_original(state):
    original_manifest = ROOT / 'public/audio/manifest.json'
    current = sha(original_manifest)
    if state.get('original_manifest_sha256', current) != current:
        raise ValueError('Original course manifest changed during this production')
    for clip in read(original_manifest)['clips']:
        path = ROOT / clip['file']
        if not path.is_file() or sha(path) != clip['sha256'] or path.stat().st_size != clip['bytes']:
            raise ValueError('Original course audio changed: ' + clip['file'])
    state['original_manifest_sha256'] = current


def collect_batches(state):
    for status in sorted((EVIDENCE / 'batches').glob('*/production.json')):
        batch = read(status)
        for key, entry in batch.get('entries', {}).items():
            if entry['request']['lesson_id'] in APPROVED_IDS:
                raise ValueError('A batch attempted to replace a user-approved audition')
            source = ROOT / entry['file']
            if not source.is_file() or sha(source) != entry['metrics']['sha256']:
                continue
            old = state['entries'].get(key)
            if old and old['metrics']['sha256'] != entry['metrics']['sha256']:
                state['history'].append(old)
            state['entries'][key] = entry
    override_path = EVIDENCE / 'content-overrides.json'
    if override_path.exists():
        override = read(override_path)
        for key, entry in override['entries'].items():
            source = ROOT / entry['file']
            if key != 'pip/meals-04' or not source.is_file() or sha(source) != entry['metrics']['sha256']:
                raise ValueError('The recorded one-phrase postprocessing override is invalid')
            state['entries'][key] = entry
        state['content_crosschecks'] = override['content_crosschecks']
    save(STATE_PATH, state)


def asr_input(state):
    records = [dict(file=e['file'], text=e['request']['text'], voice='pip',
                    lesson_id=e['request']['lesson_id'], language='en') for e in state['entries'].values()]
    save(EVIDENCE / 'asr-input.json', records)


def run_asr(state):
    asr_input(state)
    command = [str(sample.WORKBENCH / '.venv/Scripts/python.exe'), str(ROOT / 'scripts/check-neural-speech.py'),
               '--input', str(EVIDENCE / 'asr-input.json'), '--audio-root', str(ROOT),
               '--report-name', 'pip-course-20261011']
    with (EVIDENCE / 'asr.log').open('a', encoding='utf-8') as log:
        subprocess.run(command, stdout=log, stderr=log, check=True, timeout=600,
                       creationflags=subprocess.CREATE_NO_WINDOW)
    result = read(REPORT_PATH)
    state['asr_summary'] = result['summary']
    state['asr'] = {r['lesson_id']: r for r in result['results']}
    save(STATE_PATH, state)


def flagged_ids(state):
    flagged = []
    for key, entry in state['entries'].items():
        lesson_id = entry['request']['lesson_id']
        check = state.get('asr', {}).get(lesson_id, {})
        if (entry['metrics']['flags'] or (not crosscheck_matches(state, lesson_id, entry, entry['request']['text'])
                and (check.get('sha256') != entry['metrics']['sha256']
                or not check.get('normalized_match') or check.get('flags')))):
            flagged.append(lesson_id)
    return flagged


def crosscheck_matches(state, lesson_id, entry, expected):
    check = state.get('content_crosschecks', {}).get(lesson_id, {})
    return bool(lesson_id == 'meals-04' and check.get('model') == 'Systran/faster-whisper-base'
                and check.get('modelWeightSHA256') == BASE_MODEL_SHA256
                and check.get('referencePrompt') is False and check.get('device') == 'cpu'
                and check.get('normalized_match') is True and check.get('raw_normalized_match') is True
                and check.get('expected') == expected and check.get('sha256') == entry['metrics']['sha256']
                and re.fullmatch(r'[0-9a-f]{64}', check.get('sourceRawSHA256', '')) is not None
                and check.get('sourceRawSHA256') == entry.get('raw_metrics', {}).get('sha256'))


def checked_records(state, asr, lessons, root=ROOT):
    """Pure gate apart from file reads; publication happens only after all pass."""
    expected = {l['id']: l['english'] for l in lessons}
    if len(expected) != 120 or set(state['entries']) != {'pip/' + x for x in expected}:
        raise ValueError('The complete 120-lesson Pip course is required')
    checks = {r['lesson_id']: r for r in asr['results']}
    result = []
    for lesson in lessons:
        entry = state['entries']['pip/' + lesson['id']]
        metrics, request = entry['metrics'], entry['request']
        source = root / entry['file']
        check = checks.get(lesson['id'], {})
        crosschecked = crosscheck_matches(state, lesson['id'], entry, lesson['english'])
        tiny_checked = (check.get('normalized_match') and not check.get('flags')
                        and check.get('expected') == lesson['english'] and check.get('sha256') == metrics['sha256'])
        if (request['text'] != lesson['english'] or request['speaker'] != 'Serena'
                or request['lesson_id'] != lesson['id']
                or request.get('candidate') != 'pip' or request.get('language') != 'English'
                or request['revision'] != sample.REVISION or not source.is_file()
                or sha(source) != metrics['sha256'] or source.stat().st_size != metrics['bytes']
                or not metrics.get('decode_ok') or metrics.get('clipped_samples') != 0
                or metrics['flags'] or not (tiny_checked or crosschecked)):
            raise ValueError('Unresolved audio/content evidence: ' + lesson['id'])
        if lesson['id'] in state['approved_hashes'] and metrics['sha256'] != state['approved_hashes'][lesson['id']]:
            raise ValueError('Approved sample cannot be replaced: ' + lesson['id'])
        result.append((entry, source))
    return result


def export_course(state):
    check_original(state)
    rows = checked_records(state, read(REPORT_PATH), curriculum())
    clips = []
    for entry, source in rows:
        request, metrics = entry['request'], entry['metrics']
        lesson_id = request['lesson_id']
        relative = f'audio/characters/pip/{lesson_id}.mp3'
        dest = ROOT / 'public' / relative
        if dest.exists() and sha(dest) != metrics['sha256']:
            raise ValueError('Refusing to overwrite an unexpected published Pip file: ' + lesson_id)
        if not dest.exists():
            dest.parent.mkdir(parents=True, exist_ok=True)
            temp = dest.with_suffix('.tmp')
            shutil.copyfile(source, temp)
            temp.replace(dest)
        clips.append(dict(lessonId=lesson_id, file=relative, text=request['text'], sha256=metrics['sha256'],
                          bytes=metrics['bytes'], seconds=metrics['seconds'], seed=request['seed'],
                          atempo=entry['applied_atempo'], instruct=request['instruct'],
                          tempoProcessor=entry.get('tempoProcessor', 'atempo'),
                          contentCheck='base-crosscheck' if crosscheck_matches(state, lesson_id, entry, request['text']) else 'tiny.en',
                          reusedApprovedSample=bool(entry.get('reused_approved_sample'))))
    manifest = dict(version=1, voiceId='pip', voiceName='Pip 泡泡猫', createdAt='2026-10-11',
                    model='Qwen/Qwen3-TTS-12Hz-1.7B-CustomVoice', modelRevision=sample.REVISION,
                    sourceSpeaker='Serena', language='en', clips=clips,
                    totalBytes=sum(c['bytes'] for c in clips), totalSeconds=sum(c['seconds'] for c in clips),
                    production=dict(characterDirection=PIP['direction'], instructionPrefix=sample.COMMON,
                                    atempoRange=[min(c['atempo'] for c in clips), max(c['atempo'] for c in clips)],
                                    sampleRate=24000, channels=1, bitrate=48000,
                                    sampling=dict(max_new_tokens=256, temperature=0.9, subtalker_temperature=0.9),
                                    nonStreamingMode=True,
                                    normalization='loudnorm I=-20 TP=-1.5 LRA=7',
                                    contentCheck='119 phrases checked by tiny.en; meals-04 by independent faster-whisper-base on original WAV and final MP3, without reference prompts',
                                    contentCheckCounts=dict(tinyEn=sum(c['contentCheck']=='tiny.en' for c in clips),
                                                           baseCrosscheck=sum(c['contentCheck']=='base-crosscheck' for c in clips)),
                                    crosscheckNotes=[dict(lessonId=key, model=value['model'],
                                                        modelWeightSHA256=value['modelWeightSHA256'],
                                                        recognized=value['recognized'], tinyRecognized=value['tinyRecognized'],
                                                        reason='The original take and final natural-speed MP3 match with base; tiny.en remains discrepant. Preserve natural speed 1.0 for consonant clarity.')
                                                    for key,value in state.get('content_crosschecks', {}).items()],
                                    originalCourseAudioUnchanged=True, fullCourseHumanListeningApproved=False))
    save(ROOT / 'public/audio/pip-manifest.json', manifest)
    state.update(status='exported', exportedCount=len(clips), totalBytes=manifest['totalBytes'], totalSeconds=manifest['totalSeconds'])
    save(STATE_PATH, state)
    print(json.dumps({k:manifest[k] for k in ['voiceId','totalBytes','totalSeconds']}, ensure_ascii=False), flush=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--worker-request', type=Path, help=argparse.SUPPRESS)
    parser.add_argument('--export', action='store_true')
    parser.add_argument('--batch-size', type=int, default=20)
    parser.add_argument('--max-retries', type=int, default=4)
    args = parser.parse_args()
    if args.worker_request:
        job = read(args.worker_request)
        return sample.worker(configure_worker(job))
    if not 1 <= args.batch_size <= 20:
        parser.error('--batch-size must be 1 to 20')
    EVIDENCE.mkdir(parents=True, exist_ok=True)
    with audio.output_lock(EVIDENCE / 'coordinator.lock'):
        state = read(STATE_PATH) if STATE_PATH.exists() else dict(version=1, entries={}, history=[], approved_hashes={}, attempts={})
        check_original(state)
        ensure_approved(state)
        collect_batches(state)
        if args.export:
            return export_course(state)
        config = read(sample.WORKBENCH / 'local_config.json')
        guard = Path(config['resource_guard'])
        if not guard.is_file():
            raise RuntimeError('Shared GPU guard is missing')
        run_asr(state)
        all_lessons = curriculum()
        while True:
            missing = [l['id'] for l in all_lessons if 'pip/' + l['id'] not in state['entries']]
            flagged = flagged_ids(state)
            if set(flagged) & set(APPROVED_IDS):
                raise ValueError('Previously approved sample failed integrity/content check; inspect without replacing it')
            selected = (missing + [x for x in flagged if x not in missing])[:args.batch_size]
            if not selected:
                break
            for lesson_id in selected:
                if state['attempts'].get(lesson_id, 0) >= 1 + args.max_retries:
                    raise RuntimeError('Bounded retries exhausted for ' + lesson_id + '; evidence retained')
            batch_num = len(list((EVIDENCE / 'batches').glob('*/request.json'))) + 1
            directory = EVIDENCE / 'batches' / f'{batch_num:03d}'
            job = dict(ids=selected, directory=str(directory), seed_offset=10000 + batch_num * 1000)
            save(directory / 'request.json', job)
            for lesson_id in selected:
                state['attempts'][lesson_id] = state['attempts'].get(lesson_id, 0) + 1
            state.update(status='generating_batch', batch=batch_num, batchIds=selected)
            save(STATE_PATH, state)
            command = [sys.executable, str(guard), '--owner', '英语小芽-Pip全课程', '--timeout', '900', '--',
                       str(sample.WORKBENCH / '.venv/Scripts/python.exe'), str(Path(__file__).resolve()),
                       '--worker-request', str(directory / 'request.json')]
            print(f'BATCH {batch_num}: ready {len(state["entries"])}/120, flagged {len(flagged)}, creating {len(selected)}', flush=True)
            with (directory / 'worker.log').open('a', encoding='utf-8') as log:
                code = subprocess.run(command, stdout=log, stderr=log, cwd=ROOT, timeout=1800,
                                      creationflags=subprocess.CREATE_NO_WINDOW).returncode
            collect_batches(state)
            if code:
                state.update(status='worker_stopped', workerExitCode=code)
                save(STATE_PATH, state)
                raise RuntimeError(f'Guarded batch exited {code}; completed files retained, inspect worker.log')
            run_asr(state)
            print(f'CHECKED {len(state["entries"])}/120; flagged {len(flagged_ids(state))}', flush=True)
        state.update(status='all_checked')
        save(STATE_PATH, state)
        export_course(state)


if __name__ == '__main__':
    main()
