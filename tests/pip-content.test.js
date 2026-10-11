import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {voiceAudioPath} from '../src/voices.js';

const curriculum=JSON.parse(fs.readFileSync(new URL('../public/data/curriculum.json',import.meta.url)));
const auditions=JSON.parse(fs.readFileSync(new URL('../public/data/character-voices.json',import.meta.url)));
const readManifest=()=>JSON.parse(fs.readFileSync(new URL('../public/audio/pip-manifest.json',import.meta.url)));

test('Pip independently supplies exactly 120 course clips with matching text and verified bytes',()=>{
  const manifest=readManifest();
  assert.equal(manifest.version,1);assert.equal(manifest.voiceId,'pip');assert.match(manifest.voiceName,/^Pip(?:\s|$)/);
  assert.equal(manifest.clips.length,120);
  assert.deepEqual(manifest.clips.map(clip=>clip.lessonId).sort(),curriculum.lessons.map(lesson=>lesson.id).sort());
  assert.equal(new Set(manifest.clips.map(clip=>clip.file)).size,120);
  let totalBytes=0;
  for(const lesson of curriculum.lessons){
    const clip=manifest.clips.find(candidate=>candidate.lessonId===lesson.id);
    assert.equal(clip.text,lesson.english,lesson.id);
    assert.equal(clip.file,`audio/characters/pip/${lesson.id}.mp3`);
    assert.equal(voiceAudioPath(lesson.audio,'pip'),clip.file);
    const bytes=fs.readFileSync(new URL('../public/'+clip.file,import.meta.url));
    assert.ok(bytes.length>1000,clip.file);assert.equal(clip.bytes,bytes.length,clip.file);
    assert.equal(clip.sha256,crypto.createHash('sha256').update(bytes).digest('hex'),clip.file);
    assert.ok(Number.isFinite(clip.seconds)&&clip.seconds>0.3&&clip.seconds<20,clip.file);
    totalBytes+=bytes.length;
  }
  if(manifest.totalBytes!==undefined)assert.equal(manifest.totalBytes,totalBytes);
  assert.doesNotMatch(JSON.stringify(manifest),/[A-Z]:[\\/]|Users[\\/]|test-results[\\/]/);
});

test('the four approved Pip auditions are the same files and bytes used in its full course',()=>{
  const manifest=readManifest();
  const samples=auditions.clips.filter(clip=>clip.candidateId==='pip');assert.equal(samples.length,4);
  for(const sample of samples){
    const full=manifest.clips.find(clip=>clip.lessonId===sample.lessonId);
    assert.ok(full,sample.lessonId);
    for(const field of ['file','sha256','bytes','seconds'])assert.equal(full[field],sample[field],sample.lessonId+' '+field);
  }
});
