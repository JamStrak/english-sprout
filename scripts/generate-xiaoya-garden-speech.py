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
EDGE.EVIDENCE = ROOT / 'test-results/xiaoya-garden-speech-voices'
ROWS = [
    {'id': 'garden-speech-pass', 'text': '我听懂啦！点亮闪闪的贝壳，收下小礼物吧。'},
    {'id': 'garden-speech-retry', 'text': '再试试看。点小耳朵，听一听，再点话筒跟我说。'},
    {'id': 'garden-speech-partial', 'text': '已经有一点像啦！点小耳朵，再听一遍，一起试试。'},
    {'id': 'garden-speech-silent', 'text': '等话筒亮起来，再开口说哦。也可以点小耳朵，先听一听。'},
    {'id': 'garden-speech-wait', 'text': '小耳朵还没准备好。可以点下面的小三角，先听伙伴说。'},
    {'id': 'garden-speech-saved', 'text': '我听懂啦！点小勾勾，收好这次练习吧。'},
    {'id': 'garden-open-pack', 'text': '点一下种子袋，看看里面藏着什么种子！'},
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
            if not EDGE.intact(entry, EDGE.request(row)):
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
        EDGE.BASE.save(EDGE.BASE.PUBLIC / 'garden-speech-voice-manifest.json', manifest)
        print('EXPORTED', len(clips), sum(clip['bytes'] for clip in clips), 'bytes', flush=True)


if __name__ == '__main__':
    main()
