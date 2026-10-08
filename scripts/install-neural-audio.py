"""Install complete checked voice sets into public/, preserving the prior bundle locally."""
from __future__ import annotations
import argparse
import hashlib
import json
from pathlib import Path
import shutil
import re
import tempfile
import uuid

ROOT=Path(__file__).resolve().parents[1]
def read(path): return json.loads(path.read_text(encoding='utf-8-sig'))
def digest(path): return hashlib.sha256(path.read_bytes()).hexdigest()
def atomic_bytes(path,data):
    path.parent.mkdir(parents=True,exist_ok=True)
    temporary=path.with_name(path.name+'.installing')
    temporary.write_bytes(data)
    temporary.replace(path)

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check-only',action='store_true')
    args=parser.parse_args()
    curriculum=read(ROOT/'public/data/curriculum.json')
    current=read(ROOT/'public/audio/manifest.json')
    report=read(ROOT/'test-results/speech-check/production.json')
    checked={item['sha256']:item for item in report['results'] if item.get('sha256')}
    sources=[]; clips=[]
    for voice in ['Aiden','Ryan']:
        staging=read(ROOT/'test-results/neural-audio'/voice/'progress.json')
        for lesson in curriculum['lessons']:
            if not re.fullmatch(r'[a-z]+-[0-9]{2}',lesson['id']) or lesson['audio']!=f'audio/{lesson["id"]}.mp3':
                raise ValueError('Unexpected course audio path')
            key=staging['selected'].get(lesson['id'])
            entry=staging['entries'].get(key,{})
            if entry.get('status')!='ready' or entry.get('text')!=lesson['english'] or entry.get('voice')!=voice:
                raise ValueError(f'Missing or stale ready clip: {voice} {lesson["id"]}')
            if entry.get('flags'): raise ValueError(f'Unresolved file checks: {voice} {lesson["id"]}: {entry["flags"]}')
            source=Path(entry['encoded_file']).resolve()
            if not source.is_relative_to((ROOT/'test-results/neural-audio'/voice).resolve()): raise ValueError('Unexpected staging source')
            stats=entry['encoded_metrics']; sha=digest(source)
            if sha!=stats['sha256'] or source.stat().st_size!=stats['bytes']: raise ValueError(f'File changed: {source}')
            check=checked.get(sha,{})
            if check.get('expected')!=lesson['english'] or not check.get('normalized_match') or check.get('error') or check.get('flags') or check.get('needs_human_listening'):
                raise ValueError(f'Speech content has not matched: {voice} {lesson["id"]}')
            relative='public/'+(lesson['audio'] if voice=='Aiden' else lesson['audio'].replace('audio/','audio/ryan/',1))
            destination=(ROOT/relative).resolve()
            if not destination.is_relative_to((ROOT/'public/audio').resolve()): raise ValueError('Unexpected destination path')
            sources.append((source,destination))
            params=entry['parameters']
            clips.append(dict(file=relative,text=lesson['english'],voice=voice,rate=1,
                seconds=round(stats['seconds'],3),bytes=stats['bytes'],sha256=sha,
                engine='Qwen3-TTS-12Hz-0.6B-CustomVoice',language='en',modelRevision=params['model_revision'],
                seed=params['seed'],sampling=params['sampling'],expression='natural'))
    ui=[entry for entry in current['clips'] if entry['file'].startswith('public/audio/ui/')]
    expected_ui={f'public/audio/ui/{name}.mp3' for name in ['listen','choose','speak','reveal','complete','review','record','welcome','try-again','well-done','checkup']}
    if len(ui)!=len(expected_ui) or {entry['file'] for entry in ui}!=expected_ui:
        raise ValueError('Expected all eleven distinct Chinese prompts before installation')
    for entry in ui:
        path=(ROOT/entry['file']).resolve()
        if not re.fullmatch(r'public/audio/ui/[a-z-]+\.mp3',entry['file']) or not path.is_relative_to((ROOT/'public/audio/ui').resolve()): raise ValueError('Unexpected Chinese prompt path')
        if digest(path)!=entry['sha256'] or path.stat().st_size!=entry['bytes']: raise ValueError('Chinese prompt hash or size mismatch')
    clips.extend(ui)
    manifest=dict(version=curriculum['version'],source='Offline local Qwen3-TTS English and Windows System.Speech Chinese; no runtime API',
        encoder='FFmpeg loudnorm I=-20 TP=-1.5 LRA=7; libmp3lame, mono, 24000 Hz, 48 kbps',
        englishVoice='Aiden',englishVoices=['Aiden','Ryan'],chineseVoice='Microsoft Huihui Desktop',
        lessons=len(curriculum['lessons']),uiPrompts=len(ui),totalBytes=sum(c['bytes'] for c in clips),clips=clips)
    if args.check_only:
        print(f'Validated {len(sources)} English clips and {len(ui)} Chinese clips; no public files changed.');return
    public_audio=(ROOT/'public/audio').resolve()
    old_hash=digest(public_audio/'manifest.json')[:12]
    archive=ROOT/'test-results/audio-archives'/(old_hash+'-'+uuid.uuid4().hex[:8])
    archive.parent.mkdir(parents=True,exist_ok=True)
    staging_root=ROOT/'test-results/audio-installs'
    staging_root.mkdir(parents=True,exist_ok=True)
    # Prepare the complete replacement before changing any public file. Both moves
    # stay on this project's volume; a failed final move restores the previous bundle.
    with tempfile.TemporaryDirectory(prefix='bundle-',dir=staging_root) as temporary:
        bundle=Path(temporary)/'audio'
        shutil.copytree(public_audio,bundle)
        for source,destination in sources: atomic_bytes(bundle/destination.relative_to(public_audio),source.read_bytes())
        atomic_bytes(bundle/'manifest.json',(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n').encode('utf-8'))
        for clip in clips:
            prepared=bundle/Path(clip['file']).relative_to('public/audio')
            if digest(prepared)!=clip['sha256'] or prepared.stat().st_size!=clip['bytes']:
                raise ValueError(f'Prepared audio changed during installation: {clip["file"]}')
        public_audio.rename(archive)
        try: bundle.rename(public_audio)
        except BaseException:
            archive.rename(public_audio)
            raise
    print(json.dumps({'installed':len(sources),'uiPrompts':len(ui),'totalBytes':manifest['totalBytes'],'backup':str(archive)},ensure_ascii=False))

if __name__=='__main__': main()
