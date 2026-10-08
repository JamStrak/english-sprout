import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {VOICES,UI_PROMPTS,englishAudioFiles,voiceAudioPath} from '../src/voices.js';
const curriculum=JSON.parse(fs.readFileSync(new URL('../public/data/curriculum.json',import.meta.url)));
test('120 practical phrases are unique with balanced themes and matching quiz meanings',()=>{
  const {lessons,themes}=curriculum;
  assert.equal(lessons.length,120);assert.equal(themes.length,12);
  assert.equal(new Set(lessons.map(l=>l.id)).size,120);assert.equal(new Set(lessons.map(l=>l.english.toLowerCase())).size,120);
  for(const t of themes)assert.equal(lessons.filter(l=>l.theme===t.id).length,10);
  for(const l of lessons){
    for(const field of ['english','chinese','scene','parentTip','action','emoji','audio'])assert.ok(l[field]?.trim(),`${l.id} ${field}`);
    assert.ok(l.english.trim().split(/\s+/).length<=7);assert.equal(l.choices.length,3);
    assert.equal(l.choices[l.answerIndex].label,l.chinese);assert.equal(new Set(l.choices.map(c=>c.label)).size,3);
    assert.match(l.audio,/^audio\/[a-z0-9-]+\.mp3$/);
    assert.ok(fs.statSync(new URL('../public/'+l.audio,import.meta.url)).size>1000);
  }
});
test('both English voices and every Chinese guidance clip are bundled',()=>{
  for(const file of [...englishAudioFiles(curriculum.lessons),...UI_PROMPTS.map(name=>'audio/ui/'+name+'.mp3')])assert.ok(fs.statSync(new URL('../public/'+file,import.meta.url)).size>1000,file);
});
test('audio manifest matches the current lesson text and every shipped audio file',()=>{
  const manifest=JSON.parse(fs.readFileSync(new URL('../public/audio/manifest.json',import.meta.url)));
  const expected=[...englishAudioFiles(curriculum.lessons).map(file=>'public/'+file),...UI_PROMPTS.map(n=>`public/audio/ui/${n}.mp3`)];
  assert.equal(manifest.clips.length,expected.length);
  assert.deepEqual(manifest.clips.map(c=>c.file).sort(),expected.sort());
  let total=0;
  for(const clip of manifest.clips){
    const bytes=fs.readFileSync(new URL('../'+clip.file,import.meta.url));
    assert.equal(clip.sha256,crypto.createHash('sha256').update(bytes).digest('hex'),clip.file);
    assert.equal(clip.bytes,bytes.length,clip.file);
    assert.ok(clip.seconds>0.3&&clip.seconds<20,clip.file);
    total+=bytes.length;
  }
  assert.equal(manifest.totalBytes,total);
  for(const lesson of curriculum.lessons)for(const voice of VOICES){
    const clip=manifest.clips.find(c=>c.file==='public/'+voiceAudioPath(lesson.audio,voice.id));
    assert.equal(clip.text,lesson.english,lesson.id);assert.equal(clip.voice,voice.name,lesson.id);
  }
});
test('download and service worker use the same audio cache version',()=>{
  const media=fs.readFileSync(new URL('../src/media.js',import.meta.url),'utf8');
  const worker=fs.readFileSync(new URL('../sw.template.js',import.meta.url),'utf8');
  const names=[...media.matchAll(/english-sprout-audio-v[\w-]+/g),...worker.matchAll(/english-sprout-audio-v[\w-]+/g)].map(m=>m[0]);
  assert.ok(names.length>=2);assert.equal(new Set(names).size,1);
});
test('no third-party runtime script, stylesheet, or tracking dependency is embedded',()=>{
  const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
  assert.doesNotMatch(html,/<script[^>]+src=["']https?:/i);assert.doesNotMatch(html,/<link[^>]+href=["']https?:/i);
  const js=fs.readFileSync(new URL('../src/app.js',import.meta.url),'utf8');
  assert.doesNotMatch(js,/SpeechRecognition|webkitSpeechRecognition|api[_-]?key/i);
});
