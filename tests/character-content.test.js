import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {VOICES} from '../src/voices.js';

const catalog=JSON.parse(fs.readFileSync(new URL('../public/data/character-voices.json',import.meta.url)));
const course=JSON.parse(fs.readFileSync(new URL('../public/data/curriculum.json',import.meta.url)));

test('character auditions compare the same four course phrases, with two male and two female candidates',()=>{
  assert.equal(catalog.version,1);
  assert.equal(catalog.lessons.length,4);
  assert.equal(new Set(catalog.lessons.map(l=>l.id)).size,4);
  for(const lesson of catalog.lessons){
    const source=course.lessons.find(l=>l.id===lesson.id);
    assert.ok(source);assert.equal(lesson.english,source.english);assert.equal(lesson.chinese,source.chinese);
  }
  assert.equal(catalog.candidates.length,4);
  assert.equal(new Set(catalog.candidates.map(c=>c.id)).size,4);
  for(const gender of ['male','female'])assert.equal(catalog.candidates.filter(c=>c.gender===gender).length,2);
  for(const candidate of catalog.candidates){
    assert.match(candidate.id,/^[a-z-]+$/);
    assert.ok(candidate.name&&candidate.tagline&&candidate.description);
    assert.deepEqual(Object.keys(candidate.samples).sort(),catalog.lessons.map(l=>l.id).sort());
    for(const lesson of catalog.lessons)assert.equal(candidate.samples[lesson.id],`audio/characters/${candidate.id}/${lesson.id}.mp3`);
  }
  assert.deepEqual(VOICES.map(v=>v.id),['aiden','ryan','pip'],'only the selected complete Pip course joins Aiden and Ryan');
});

test('every new audition has a complete, verifiable audio manifest without exposing local production paths',()=>{
  const expected=catalog.candidates.flatMap(c=>Object.values(c.samples)).sort();
  assert.equal(expected.length,16);assert.equal(new Set(expected).size,16);
  assert.deepEqual(catalog.clips.map(c=>c.file).sort(),expected);
  const auditionBaseline=catalog.clips.map(clip=>clip.file+' '+clip.sha256).sort().join('\n');
  assert.equal(crypto.createHash('sha256').update(auditionBaseline).digest('hex'),'afed15ffe9bc9cc9e468711189abca58f618d66f4433b9a799e60336fdba68e3','the original 16 audition hashes remain unchanged');
  for(const clip of catalog.clips){
    const candidate=catalog.candidates.find(c=>c.id===clip.candidateId);
    assert.ok(candidate);assert.equal(candidate.samples[clip.lessonId],clip.file);
    const bytes=fs.readFileSync(new URL('../public/'+clip.file,import.meta.url));
    assert.ok(bytes.length>1000);assert.equal(clip.bytes,bytes.length);
    assert.equal(clip.sha256,crypto.createHash('sha256').update(bytes).digest('hex'));
    assert.ok(clip.seconds>0.3&&clip.seconds<20);
  }
  assert.doesNotMatch(JSON.stringify(catalog),/[A-Z]:[\\/]|Users[\\/]|test-results[\\/]/);
});
