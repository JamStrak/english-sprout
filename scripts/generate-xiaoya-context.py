"""Make the 36 public Chinese context prompts with installed free Edge neural TTS.

Only the generic prompt text is sent during production. The app receives static
MP3 files and never connects to TTS. Does not send recordings or learning data.
Run --ids hello-morning for one probe; run without IDs for the context batch.
Use --export after checking staged audio/word coverage. No automatic retries.
Use the isolated interpreter at test-results/xiaoya-neural-help-20261016/edge-venv/
Scripts/python.exe, with edge-tts==7.3.1 installed there (not globally).
"""
from __future__ import annotations
import argparse
import asyncio
import hashlib
import html
import importlib.metadata
import importlib.util
import json
from pathlib import Path
import shutil
import subprocess
import time
import traceback

SPEC = importlib.util.spec_from_file_location('guide_assets', Path(__file__).with_name('generate-xiaoya-help.py'))
BASE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(BASE)
EVIDENCE = BASE.EVIDENCE / 'edge-contexts'
CLIENT_VERSION = '7.3.1'

def normalize(text):
    return ''.join(c for c in html.unescape(text) if c.isalnum())

def request(row):
    return dict(id=row['id'], text=row['text'], speaker='zh-CN-XiaoxiaoNeural', language='Chinese',
        model='Microsoft Edge Neural TTS', source='free online synthesis of generic public text during production only',
        client='edge-tts ' + importlib.metadata.version('edge-tts'),
        rate='+0%', pitch='+0Hz', volume='+0%', boundary='WordBoundary',
        encoder='mono 24000Hz MP3 48kbps; loudnorm I=-20 TP=-1.5 LRA=7; no tempo or pitch effects')

def intact(entry, req):
    return bool(entry and entry['request'] == req and not entry['metrics']['flags']
        and (EVIDENCE / entry['file']).is_file() and BASE.sha(EVIDENCE / entry['file']) == entry['metrics']['sha256'])

async def generate(rows, state):
    import edge_tts
    ffmpeg = BASE.WORKBENCH / 'runtime/ffmpeg/bin/ffmpeg.exe'
    ffprobe = ffmpeg.with_name('ffprobe.exe')
    if not ffmpeg.is_file():
        ffmpeg, ffprobe = Path(shutil.which('ffmpeg') or ''), Path(shutil.which('ffprobe') or '')
    if not ffmpeg.is_file() or not ffprobe.is_file():
        raise RuntimeError('Existing workbench ffmpeg required; no automatic installation')
    for row in rows:
        req = request(row)
        if intact(state['entries'].get(row['id']), req):
            print('SKIP ' + row['id'], flush=True)
            continue
        # Keep failed older client attempts as evidence; a new version has its own directory.
        key = hashlib.sha256(json.dumps(req, ensure_ascii=False, sort_keys=True).encode()).hexdigest()[:12]
        folder = EVIDENCE / 'clips' / row['id'] / key
        folder.mkdir(parents=True, exist_ok=True)
        source, encoded, boundary = folder / 'source.mp3', folder / 'guide.mp3', folder / 'words.jsonl'
        if source.exists() or encoded.exists():
            raise RuntimeError('Retained incomplete attempt needs review: ' + str(folder))
        BASE.save(folder / 'request.json', req)
        state.update(status='generating', current=row['id'])
        BASE.save(EVIDENCE / 'production.json', state)
        tick = time.monotonic()
        speech = edge_tts.Communicate(req['text'], req['speaker'], rate=req['rate'], pitch=req['pitch'],
            volume=req['volume'], boundary='WordBoundary', connect_timeout=10, receive_timeout=30)
        await asyncio.wait_for(speech.save(str(source), str(boundary)), timeout=60)
        words = [json.loads(line) for line in boundary.read_text(encoding='utf-8').splitlines() if line.strip()]
        spoken = ''.join(item['text'] for item in words)
        if not words or normalize(spoken) != normalize(req['text']):
            raise RuntimeError('Returned word metadata does not cover exact prompt: ' + row['id'])
        subprocess.run([str(ffmpeg), '-v', 'error', '-n', '-i', str(source), '-map_metadata', '-1',
            '-af', 'loudnorm=I=-20:TP=-1.5:LRA=7', '-ac', '1', '-ar', '24000',
            '-c:a', 'libmp3lame', '-b:a', '48k', str(encoded)], check=True, timeout=60)
        metrics = BASE.checks().media_metrics(encoded, str(ffmpeg), str(ffprobe))
        last_end = max((word['offset'] + word['duration']) / 10000000 for word in words)
        if last_end > metrics['seconds'] + .15 or metrics['seconds'] - last_end > 1.2:
            metrics['flags'].append('boundary_audio_duration_mismatch')
        entry = dict(request=req, file=encoded.relative_to(EVIDENCE).as_posix(), metrics=metrics,
            generation_seconds=round(time.monotonic() - tick, 3),
            word_coverage=dict(matches_prompt=True, text=spoken, final_end_seconds=last_end))
        BASE.save(folder / 'report.json', entry)
        if metrics['flags']:
            raise RuntimeError('Audio requires review: ' + row['id'] + ': ' + ', '.join(metrics['flags']))
        state['entries'][row['id']] = entry
        BASE.save(EVIDENCE / 'production.json', state)
        print(f"READY {row['id']} {metrics['seconds']:.2f}s audio / {entry['generation_seconds']:.2f}s production", flush=True)
    state.update(status='generated')
    state.pop('error', None)
    BASE.save(EVIDENCE / 'production.json', state)

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--ids', nargs='+')
    parser.add_argument('--export', action='store_true')
    args = parser.parse_args()
    if importlib.metadata.version('edge-tts') != CLIENT_VERSION:
        raise RuntimeError('Use isolated edge-tts==' + CLIENT_VERSION + '; the older 7.2.8 endpoint returns HTTP 403')
    rows = [row for row in BASE.read(BASE.PUBLIC / 'prompts.json')['prompts'] if row.get('engine') == 'edge-neural']
    if any(row['voice'] != 'zh-CN-XiaoxiaoNeural' for row in rows):
        raise ValueError('Unexpected voice')
    if args.ids:
        if set(args.ids) - {row['id'] for row in rows}:
            raise ValueError('Unknown context IDs')
        rows = [row for row in rows if row['id'] in args.ids]
    EVIDENCE.mkdir(parents=True, exist_ok=True)
    state_file = EVIDENCE / 'production.json'
    state = BASE.read(state_file) if state_file.exists() else dict(entries={})
    with BASE.checks().output_lock(EVIDENCE / '.production.lock'):
        if args.export:
            if any(not intact(state['entries'].get(row['id']), request(row)) for row in rows):
                raise RuntimeError('Incomplete or changed context batch; nothing exported')
            for row in rows:
                destination = BASE.PUBLIC / (row['id'] + '.mp3')
                temp = destination.with_suffix('.tmp')
                shutil.copyfile(EVIDENCE / state['entries'][row['id']]['file'], temp)
                temp.replace(destination)
            BASE.write_manifest()
            print(f'Published {len(rows)} checked neural context clips', flush=True)
        else:
            try:
                asyncio.run(generate(rows, state))
            except Exception as exc:
                state.update(status='failed', error=str(exc))
                BASE.save(state_file, state)
                with (EVIDENCE / 'error.log').open('a', encoding='utf-8') as log:
                    traceback.print_exc(file=log)
                raise

if __name__ == '__main__':
    main()
