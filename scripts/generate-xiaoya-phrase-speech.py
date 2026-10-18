"""Build static Chinese help for the 13 core expression scenes and their alternate contexts.
Only generic public lesson text is synthesized; the app never calls TTS.
Use the existing isolated Edge 7.3.1 interpreter. Stage first, then --export.
Existing public files are never replaced with different bytes.
"""
from __future__ import annotations
import argparse
import asyncio
import importlib.metadata
import importlib.util
import json
from pathlib import Path
import shutil
import subprocess
ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location('edge_guides', Path(__file__).with_name('generate-xiaoya-context.py'))
EDGE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(EDGE)
EDGE.EVIDENCE = ROOT / 'test-results/xiaoya-phrase-speech'

def rows():
    script = "import {EVENTS} from './xiaoya/content.js'; console.log(JSON.stringify(EVENTS.filter(e=>e.illustration==='phrase').flatMap(e=>e.contexts.map(c=>({id:c.id,text:c.help+'听我说。'})))));"
    result = subprocess.run(['node','--input-type=module','-e',script], cwd=ROOT, check=True, capture_output=True, encoding='utf-8')
    return json.loads(result.stdout)

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--export', action='store_true')
    args=parser.parse_args()
    if importlib.metadata.version('edge-tts')!=EDGE.CLIENT_VERSION:
        raise RuntimeError('Use isolated edge-tts=='+EDGE.CLIENT_VERSION)
    prompts=rows()
    EDGE.EVIDENCE.mkdir(parents=True,exist_ok=True)
    state_file=EDGE.EVIDENCE/'production.json'
    state=EDGE.BASE.read(state_file) if state_file.exists() else {'entries':{}}
    with EDGE.BASE.checks().output_lock(EDGE.EVIDENCE/'.production.lock'):
        if not args.export:
            asyncio.run(EDGE.generate(prompts,state))
            return
        for row in prompts:
            entry=state['entries'].get(row['id'])
            if not EDGE.intact(entry,EDGE.request(row)):
                raise RuntimeError('Unverified help clip: '+row['id'])
            dest=EDGE.BASE.PUBLIC/(row['id']+'.mp3')
            if dest.exists() and EDGE.BASE.sha(dest)!=entry['metrics']['sha256']:
                raise RuntimeError('Refusing to overwrite published clip: '+row['id'])
        clips=[]
        for row in prompts:
            entry=state['entries'][row['id']]
            dest=EDGE.BASE.PUBLIC/(row['id']+'.mp3')
            if not dest.exists():
                temp=dest.with_suffix('.tmp')
                shutil.copyfile(EDGE.EVIDENCE/entry['file'],temp)
                temp.replace(dest)
            clips.append(dict(id=row['id'],text=row['text'],file=dest.name,voice=entry['request']['speaker'],
                bytes=dest.stat().st_size,seconds=entry['metrics']['seconds'],sha256=EDGE.BASE.sha(dest),
                flags=entry['metrics']['flags'],word_coverage=entry['word_coverage']))
        EDGE.BASE.save(EDGE.BASE.PUBLIC/'phrase-voice-manifest.json',dict(version=1,language='Chinese',
            source='generic public lesson text synthesized during production; no runtime TTS connection',
            review='decoded waveform and exact word-boundary coverage checked; real-child acceptance pending',
            clips=clips))
        print('EXPORTED',len(clips),sum(c['bytes'] for c in clips),'bytes',flush=True)
if __name__=='__main__':
    main()
