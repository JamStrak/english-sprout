"""Produce checked static v0.13 challenge and economy Chinese MP3 prompts.

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
EDGE.EVIDENCE = ROOT / 'test-results/xiaoya-challenge-voices-v013'
ROWS = [
    {'id': 'challenge-intro', 'text': '这里是花园挑战。把学过的四句话说给小芽听，一起打开大礼物吧！'},
    {'id': 'challenge-invite', 'text': '你已经练过这些话啦！点小旗子，试试花园挑战吧。'},
    {'id': 'challenge-question', 'text': '看看这幅画，这个时候，你会怎么说呢？想好了，就点话筒。想听一遍，也可以点小耳朵。'},
    {'id': 'challenge-practice', 'text': '这句我们再一起练练。刚才完成的小步，都帮你留下啦。'},
    {'id': 'challenge-step', 'text': '这一小步完成啦！我们接着试一试。'},
    {'id': 'challenge-return', 'text': '再来试试刚才那一句吧。'},
    {'id': 'challenge-clear', 'text': '挑战完成啦！四枚贝壳，还有六滴水，都是你的！带回花园吧！'},
    {'id': 'challenge-replay', 'text': '你又把这几句话说出来啦！我们去花园看看吧。'},
    {'id': 'challenge-seed', 'text': '这是挑战送给你的特别种子！种进花园，看看会开出什么花吧。'},
    {'id': 'challenge-wait', 'text': '先和小芽学学这几句话，再来挑战吧。'},
    {'id': 'challenge-saved', 'text': '已经完成的小步，都帮你留下啦。准备好了，随时回来接着玩。'},
    {'id': 'economy-water-v13', 'text': '两滴水，收好啦！去给小苗浇水吧。'},
    {'id': 'economy-starter-v13', 'text': '送你第一份小礼物！两枚贝壳，还有三滴水。去种下第一颗种子吧。'},
    {'id': 'flow-water-choice-v13', 'text': '水滴可以浇花。想要这两滴水，就点小礼物。'},
    {'id': 'flow-review-v13', 'text': '老朋友来啦！看看这幅画，你还记得怎么说吗？想听一遍，就点小耳朵。'},
]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--ids', nargs='+')
    parser.add_argument('--export', action='store_true')
    args = parser.parse_args()
    if importlib.metadata.version('edge-tts') != EDGE.CLIENT_VERSION:
        raise RuntimeError('Use the isolated edge-tts==' + EDGE.CLIENT_VERSION)
    if args.ids and set(args.ids) - {row['id'] for row in ROWS}:
        raise ValueError('Unknown challenge guide IDs')
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
            raise RuntimeError('Export requires the complete challenge guide batch')
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
        EDGE.BASE.save(EDGE.BASE.PUBLIC / 'challenge-voice-manifest.json', manifest)
        print('EXPORTED', len(clips), sum(clip['bytes'] for clip in clips), 'bytes', flush=True)


if __name__ == '__main__':
    main()
