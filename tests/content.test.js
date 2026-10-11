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
test('all three complete English voices and every Chinese guidance clip are bundled',()=>{
  assert.deepEqual(VOICES.map(voice=>voice.id),['aiden','ryan','pip']);
  for(const file of [...englishAudioFiles(curriculum.lessons),...UI_PROMPTS.map(name=>'audio/ui/'+name+'.mp3')])assert.ok(fs.statSync(new URL('../public/'+file,import.meta.url)).size>1000,file);
});
test('original 251-clip manifest still verifies unchanged Aiden, Ryan and guidance audio',()=>{
  const manifest=JSON.parse(fs.readFileSync(new URL('../public/audio/manifest.json',import.meta.url)));
  const originalVoices=[{id:'aiden',name:'Aiden'},{id:'ryan',name:'Ryan'}];
  const expected=[...curriculum.lessons.flatMap(lesson=>originalVoices.map(voice=>'public/'+voiceAudioPath(lesson.audio,voice.id))),...UI_PROMPTS.map(n=>`public/audio/ui/${n}.mp3`)];
  assert.equal(manifest.clips.length,251);
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
  for(const lesson of curriculum.lessons)for(const voice of originalVoices){
    const clip=manifest.clips.find(c=>c.file==='public/'+voiceAudioPath(lesson.audio,voice.id));
    assert.equal(clip.text,lesson.english,lesson.id);assert.equal(clip.voice,voice.name,lesson.id);
  }
});
test('download and service worker use the same audio cache version',()=>{
  const media=fs.readFileSync(new URL('../src/media.js',import.meta.url),'utf8');
  const worker=fs.readFileSync(new URL('../sw.template.js',import.meta.url),'utf8');
  const names=[...media.matchAll(/english-sprout-audio-v[\w-]+/g)].map(m=>m[0]);
  const current=worker.match(/const AUDIO=['"](english-sprout-audio-v[\w-]+)['"]/);
  assert.ok(current,'worker declares its active audio cache');assert.ok(names.length>=2);
  assert.deepEqual([...new Set(names)],[current[1]],'downloads and playback count only the current cache');
  // Explicit legacy caches support migration without becoming destinations for
  // downloads or newly generated audio.
  const legacy=worker.match(/const LEGACY_AUDIO=\[([^\]]+)\]/);
  assert.ok(legacy,'worker declares its legacy sources');
  const legacyNames=[...legacy[1].matchAll(/english-sprout-audio-v[\w-]+/g)].map(match=>match[0]);
  assert.deepEqual(legacyNames,['english-sprout-audio-v4','english-sprout-audio-v3']);
  assert.deepEqual([...new Set([...worker.matchAll(/english-sprout-audio-v[\w-]+/g)].map(match=>match[0]))],[current[1],...legacyNames]);
});
test('no third-party runtime script, stylesheet, or tracking dependency is embedded',()=>{
  const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
  assert.doesNotMatch(html,/<script[^>]+src=["']https?:/i);assert.doesNotMatch(html,/<link[^>]+href=["']https?:/i);
  const js=fs.readFileSync(new URL('../src/app.js',import.meta.url),'utf8');
  assert.doesNotMatch(js,/SpeechRecognition|webkitSpeechRecognition|api[_-]?key/i);
});
