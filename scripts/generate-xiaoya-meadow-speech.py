"""Produce the garden feedback and seed-pack cues as static MP3 assets.

Only these generic public prompts are sent to the free Edge neural voice during
production. The app has no runtime TTS dependency. Use the existing isolated
test-results/xiaoya-neural-help-20261016/edge-venv/Scripts/python.exe with
edge-tts==7.3.1. Run without arguments to stage, then --export to publish the
complete checked batch. --ids permits a single probe without exporting it.
"""
from __future__ import annotations
import argparse
import asyncio
import importlib.metadata
import importlib.util
from pathlib import Path
import shutil

ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location('edge_guides', Path(__file__).with_name('generate-xiaoya-context.py'))
EDGE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(EDGE)
EDGE.EVIDENCE = ROOT / 'test-results/xiaoya-meadow-voices'
ROWS = [
    {'id':'meadow-reward','text':'三枚贝壳，五滴水，送给你！去小花园玩吧。'},
    {'id':'meadow-seed','text':'拿起小种子，再点草地。想种在哪里，就种在哪里。'},
    {'id':'meadow-water','text':'拿起小水壶，再点小苗。浇一次水，它就长大一点。'},
    {'id':'meadow-growing','text':'又长大一点啦！再用小水壶，给它浇水吧。'},
    {'id':'meadow-bloom','text':'哇，花开啦！这是你亲手照顾的小花。'},
    {'id':'meadow-giant','text':'哇，是巨型花种子！它要喝十次水，才能开出大大的花。'},
    {'id':'meadow-empty','text':'小水壶空啦。再玩一个故事，就能带水回来。'},
    {'id':'meadow-collection','text':'看，这是你已经种出来的小花。蝴蝶结花，还有不同的颜色呢。'},
    {'id':'meadow-water-drops','text':'点一下小水壶，再点小苗头上的水滴。点一次，浇一滴水。'},
]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--ids', nargs='+')
    parser.add_argument('--export', action='store_true')
    args = parser.parse_args()
    if importlib.metadata.version('edge-tts') != EDGE.CLIENT_VERSION:
        raise RuntimeError('Use the isolated edge-tts==' + EDGE.CLIENT_VERSION)
    if args.ids and set(args.ids) - {row['id'] for row in ROWS}:
        raise ValueError('Unknown garden feedback IDs')
    rows = [row for row in ROWS if not args.ids or row['id'] in args.ids]
    EDGE.EVIDENCE.mkdir(parents=True, exist_ok=True)
    state_file = EDGE.EVIDENCE / 'production.json'
    state = EDGE.BASE.read(state_file) if state_file.exists() else {'entries': {}}
    with EDGE.BASE.checks().output_lock(EDGE.EVIDENCE / '.production.lock'):
        if not args.export:
            asyncio.run(EDGE.generate(rows, state))
            return
        if len(rows) != len(ROWS):
            raise RuntimeError('Export requires the complete garden feedback batch')
        # Validate every staged clip and any previous export before changing public.
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
            encoder=state['entries'][rows[0]['id']]['request']['encoder'], clips=clips)
        EDGE.BASE.save(EDGE.BASE.PUBLIC / 'meadow-voice-manifest.json', manifest)
        print('EXPORTED', len(clips), sum(clip['bytes'] for clip in clips), 'bytes', flush=True)


if __name__ == '__main__':
    main()
