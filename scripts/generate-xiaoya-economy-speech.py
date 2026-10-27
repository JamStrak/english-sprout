"""Produce the B meadow economy guides as checked, static Chinese MP3 assets.

Only these generic public prompts are sent to the free Edge neural voice during
production. No child recordings or learning data are used, and the app has no
runtime TTS connection. Use the existing isolated interpreter at
test-results/xiaoya-neural-help-20261016/edge-venv/Scripts/python.exe, with
edge-tts==7.3.1. Run --ids economy-choice for a probe, without arguments to stage
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
EDGE.EVIDENCE = ROOT / 'test-results/xiaoya-economy-voices'
ROWS = [
    {'id': 'economy-choice', 'text': '这次想带回什么？点贝壳，或者点水滴。'},
    {'id': 'economy-shells', 'text': '两枚小贝壳，收好啦！攒起来，可以买喜欢的种子。'},
    {'id': 'economy-water', 'text': '五滴水，收好啦！去给小苗浇水吧。'},
    {'id': 'economy-starter', 'text': '送你第一份小礼物！两枚贝壳，还有五滴水。去种一朵小花吧。'},
    {'id': 'economy-shop', 'text': '这里有两种种子包。问号包，打开有惊喜。旁边这包，可以看到会长出什么花。'},
    {'id': 'economy-reserve', 'text': '先帮你留下来。攒够贝壳，再来带它回家。'},
    {'id': 'economy-replace', 'text': '要换成这包吗？原来留下的那包，就放回商店啦。'},
    {'id': 'economy-short', 'text': '贝壳还不够。可以先帮你留下来，再去玩一会儿英语。'},
    {'id': 'economy-pack', 'text': '用两枚贝壳，打开一包惊喜种子。'},
    {'id': 'economy-earned', 'text': '小礼物还在这里。点贝壳，或者点水滴，选一份带回家。'},
    {'id': 'economy-shop-ready', 'text': '去看看种子吧。可以开惊喜包，也可以攒贝壳买喜欢的花。'},
    {'id': 'economy-water-short', 'text': '水用完啦。再玩一会儿英语，带些水回来吧。'},
    {'id': 'economy-shells-short', 'text': '贝壳还不够。再和小芽玩一会儿，带些贝壳回来吧。'},
]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--ids', nargs='+')
    parser.add_argument('--export', action='store_true')
    args = parser.parse_args()
    if importlib.metadata.version('edge-tts') != EDGE.CLIENT_VERSION:
        raise RuntimeError('Use the isolated edge-tts==' + EDGE.CLIENT_VERSION)
    if args.ids and set(args.ids) - {row['id'] for row in ROWS}:
        raise ValueError('Unknown economy guide IDs')
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
            raise RuntimeError('Export requires the complete economy guide batch')
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
        EDGE.BASE.save(EDGE.BASE.PUBLIC / 'economy-voice-manifest.json', manifest)
        print('EXPORTED', len(clips), sum(clip['bytes'] for clip in clips), 'bytes', flush=True)


if __name__ == '__main__':
    main()
