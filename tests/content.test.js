import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
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
test('all English and Chinese prompt audio files are bundled',()=>{
  for(const name of ['listen','choose','speak','reveal','complete','review','record','welcome'])assert.ok(fs.statSync(new URL('../public/audio/ui/'+name+'.mp3',import.meta.url)).size>1000);
});
test('no third-party runtime script, stylesheet, or tracking dependency is embedded',()=>{
  const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
  assert.doesNotMatch(html,/<script[^>]+src=["']https?:/i);assert.doesNotMatch(html,/<link[^>]+href=["']https?:/i);
  const js=fs.readFileSync(new URL('../src/app.js',import.meta.url),'utf8');
  assert.doesNotMatch(js,/SpeechRecognition|webkitSpeechRecognition|api[_-]?key/i);
});
