"""Produce checked static blind-box and flower-name Chinese MP3 prompts.

Only generic public prompts are sent to free Edge neural TTS during production.
There are no child recordings or learning records and no runtime TTS connection.
Use test-results/xiaoya-neural-help-20261016/edge-venv/Scripts/python.exe with
edge-tts==7.3.1. Run without arguments to stage, then --export after validation.
Existing published URLs are immutable; revised prompts use new versioned IDs.
"""
from __future__ import annotations
import argparse
import asyncio
import importlib.metadata
import importlib.util
from pathlib import Path
import shutil
import traceback

ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location('edge_guides', Path(__file__).with_name('generate-xiaoya-context.py'))
EDGE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(EDGE)
EDGE.EVIDENCE = ROOT / 'test-results/xiaoya-blindbox-voices-v019'
# Stable flower IDs match garden-meadow.js. Shared seed pictures do not merge
# flower identities. The accompanying test requires every current name/ID.
FLOWER_NAMES = [
    ('daisy', '雏菊'),
    ('tulip', '郁金香'),
    ('sunflower', '向日葵'),
    ('bellflower', '风铃花'),
    ('poppy', '虞美人'),
    ('violet', '紫罗兰'),
    ('bow-pink', '粉粉蝴蝶结花'),
    ('bow-blue', '蓝蓝蝴蝶结花'),
    ('bow-yellow', '金金蝴蝶结花'),
    ('bow-purple', '紫紫蝴蝶结花'),
    ('giant-daisy', '巨型雏菊'),
    ('giant-sunflower', '巨型向日葵'),
    ('bow-rainbow', '彩虹蝴蝶结花'),
    ('bow-starlight', '星光蝴蝶结花'),
]
ROWS = [
    {'id': 'blindbox-choose', 'text': '六个小袋子，选一个喜欢的吧。用两枚贝壳，就能打开它。'},
    {'id': 'blindbox-reveal', 'text': '惊喜种子来啦！带它去花园，种下看看吧。'},
    *[{'id': 'blindbox-seed-' + flower_id, 'text': '你找到' + name + '种子啦！'}
      for flower_id, name in FLOWER_NAMES],
]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--ids', nargs='+')
    parser.add_argument('--export', action='store_true')
    args = parser.parse_args()
    if importlib.metadata.version('edge-tts') != EDGE.CLIENT_VERSION:
        raise RuntimeError('Use the isolated edge-tts==' + EDGE.CLIENT_VERSION)
    if args.ids and set(args.ids) - {row['id'] for row in ROWS}:
        raise ValueError('Unknown blind-box guide IDs')
    rows = [row for row in ROWS if not args.ids or row['id'] in args.ids]
    EDGE.EVIDENCE.mkdir(parents=True, exist_ok=True)
    state_file = EDGE.EVIDENCE / 'production.json'
    state = EDGE.BASE.read(state_file) if state_file.exists() else {'entries': {}}
    with EDGE.BASE.checks().output_lock(EDGE.EVIDENCE / '.production.lock'):
        if not args.export:
            try:
                asyncio.run(EDGE.generate(rows, state))
            except Exception as exc:
                state.update(status='failed', error=str(exc))
                EDGE.BASE.save(state_file, state)
                with (EDGE.EVIDENCE / 'error.log').open('a', encoding='utf-8') as log:
                    traceback.print_exc(file=log)
                raise
            return
        if len(rows) != len(ROWS):
            raise RuntimeError('Export requires the complete blind-box guide batch')
        # Validate every clip before publishing any of the batch.
        for row in rows:
            entry = state['entries'].get(row['id'])
            if not EDGE.intact(entry, EDGE.request(row)) or not entry['word_coverage']['matches_prompt']:
                raise RuntimeError('Incomplete or changed clip: ' + row['id'])
            destination = EDGE.BASE.PUBLIC / (row['id'] + '.mp3')
            if destination.exists() and EDGE.BASE.sha(destination) != entry['metrics']['sha256']:
                raise RuntimeError('Refusing to overwrite a different published clip: ' + row['id'])
        clips = []
        for row in rows:
            entry = state['entries'][row['id']]
            req, metrics = entry['request'], entry['metrics']
            destination = EDGE.BASE.PUBLIC / (row['id'] + '.mp3')
            if not destination.exists():
                temp = destination.with_suffix('.tmp')
                shutil.copyfile(EDGE.EVIDENCE / entry['file'], temp)
                temp.replace(destination)
            clips.append(dict(id=row['id'], text=row['text'], file=destination.name,
                voice=req['speaker'], model=req['model'], client=req['client'], source=req['source'],
                bytes=destination.stat().st_size, seconds=metrics['seconds'], sha256=EDGE.BASE.sha(destination),
                flags=metrics['flags'], word_coverage=entry['word_coverage']))
        manifest = dict(version=1, language='Chinese',
            source='prerecorded during production; no runtime TTS connection',
            tempo_or_pitch_effects=False,
            review='decoded waveform and returned word-boundary coverage checked; subjective user acceptance pending',
            encoder=state['entries'][rows[0]['id']]['request']['encoder'],
            clip_count=len(clips), total_bytes=sum(clip['bytes'] for clip in clips),
            total_seconds=round(sum(clip['seconds'] for clip in clips), 3), clips=clips)
        EDGE.BASE.save(EDGE.BASE.PUBLIC / 'blindbox-voice-manifest.json', manifest)
        print('EXPORTED', len(clips), sum(clip['bytes'] for clip in clips), 'bytes', flush=True)


if __name__ == '__main__':
    main()
