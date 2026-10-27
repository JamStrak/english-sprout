"""Produce the practice and reward flow guides as checked, static Chinese MP3 assets.

Only these generic public prompts are sent to the free Edge neural voice during
production. No child recordings or learning data are used, and the app has no
runtime TTS connection. Use the existing isolated interpreter at
test-results/xiaoya-neural-help-20261016/edge-venv/Scripts/python.exe, with
edge-tts==7.3.1. Run --ids flow-recall for a probe, without arguments to stage
the full batch, then --export to publish all checked clips and their manifest.
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
EDGE.EVIDENCE = ROOT / 'test-results/xiaoya-flow-voices'
ROWS = [
    {'id': 'flow-recall', 'text': '这句还记得吗？点耳朵听一遍，或者点话筒说。'},
    {'id': 'flow-choice', 'text': '贝壳可以买种子，水滴可以浇花。点一个，听听看。'},
    {'id': 'flow-shells', 'text': '贝壳可以买种子。想要贝壳，就点下面的小礼物。'},
    {'id': 'flow-water', 'text': '水滴可以浇花。想要水滴，就点下面的小礼物。'},
    {'id': 'flow-shell-use', 'text': '贝壳可以买种子。攒起来，买喜欢的种子吧。'},
    {'id': 'flow-water-use', 'text': '水滴可以浇花，让小苗慢慢长大。'},
    {'id': 'flow-pass', 'text': '我听懂啦！点亮小礼物，收下奖励吧。'},
]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--ids', nargs='+')
    parser.add_argument('--export', action='store_true')
    args = parser.parse_args()
    if importlib.metadata.version('edge-tts') != EDGE.CLIENT_VERSION:
        raise RuntimeError('Use the isolated edge-tts==' + EDGE.CLIENT_VERSION)
    if args.ids and set(args.ids) - {row['id'] for row in ROWS}:
        raise ValueError('Unknown flow guide IDs')
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
            raise RuntimeError('Export requires the complete flow guide batch')
        # Check the whole batch before publishing; different existing URLs are immutable.
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
        EDGE.BASE.save(EDGE.BASE.PUBLIC / 'flow-voice-manifest.json', manifest)
        print('EXPORTED', len(clips), sum(clip['bytes'] for clip in clips), 'bytes', flush=True)


if __name__ == '__main__':
    main()
