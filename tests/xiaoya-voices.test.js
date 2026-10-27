import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {EVENTS} from '../xiaoya/content.js';
import {PHRASE_PACK_V015} from '../xiaoya/phrase-pack-v015.js';

test('new phrase audio matches the frozen text, all three voices, and the checked production manifest', () => {
  const root = new URL('../', import.meta.url);
  const specBytes = fs.readFileSync(new URL('design/xiaoya-phrases-v015/phrases.json', root));
  const manifest = JSON.parse(fs.readFileSync(new URL('design/xiaoya-phrases-v015/audio-manifest.json', root), 'utf8'));
  const sha = bytes => createHash('sha256').update(bytes).digest('hex');
  assert.equal(manifest.status, 'complete');
  assert.equal(manifest.phraseSpecSHA256, sha(specBytes));
  assert.equal(manifest.phraseCount, 60);
  assert.equal(manifest.clipCount, 240);
  assert.equal(manifest.clips.length, 240);
  assert.equal(manifest.runtimeSynthesis, false);
  assert.equal(manifest.childDataUploaded, false);
  const seen = new Set();
  let total = 0;
  for (const clip of manifest.clips) {
    const phrase = PHRASE_PACK_V015.find(row => row.id === clip.phraseId);
    assert(phrase, clip.phraseId);
    assert(['aiden', 'ryan', 'pip', 'hint'].includes(clip.voiceId));
    const key = `${clip.phraseId}/${clip.voiceId}`;
    assert(!seen.has(key), key); seen.add(key);
    assert.equal(clip.text, clip.voiceId === 'hint' ? phrase.hint + '听我说。' : phrase.english, key);
    assert.equal(clip.url, `xiaoya/audio/phrases-v015/${key}.mp3`);
    assert.equal(clip.file, `public/${clip.url}`);
    const bytes = fs.readFileSync(new URL(clip.file, root));
    assert.equal(bytes.length, clip.bytes, key);
    assert.equal(sha(bytes), clip.sha256, key);
    assert(clip.seconds > 0 && clip.seconds < 18, key);
    assert.deepEqual(clip.metrics.flags, [], key);
    assert(clip.contentCheck && Object.keys(clip.contentCheck).length, key);
    total += bytes.length;
  }
  assert.equal(total, manifest.totalBytes);
  for (const phrase of PHRASE_PACK_V015) {
    for (const voice of ['aiden', 'ryan', 'pip', 'hint']) assert(seen.has(`${phrase.id}/${voice}`));
  }
});

test('every Chinese guide and context ships the matching checked neural clip', () => {
  const base = new URL('../public/xiaoya/audio/', import.meta.url);
  const prompts = JSON.parse(fs.readFileSync(new URL('prompts.json', base), 'utf8')).prompts;
  const manifest = JSON.parse(fs.readFileSync(new URL('voice-manifest.json', base), 'utf8'));
  const expansion = JSON.parse(fs.readFileSync(new URL('expansion-voice-manifest.json', base), 'utf8'));
  const phrases = JSON.parse(fs.readFileSync(new URL('phrase-voice-manifest.json', base), 'utf8'));
  const addedPrompts = EVENTS.filter(event => event.illustration === 'comic').flatMap(event => event.contexts.map(context => ({id: context.id, text: context.help + '听我说。'})));
  const phrasePrompts = EVENTS.filter(event => event.illustration === 'phrase').flatMap(event => event.contexts.map(context => ({id: context.id, text: context.help + '听我说。'})));
  const ids = prompts.map(row => row.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(manifest.clips.length, ids.length, 'Do not silently leave old system voices in the release');
  assert.deepEqual(manifest.clips.map(clip => clip.id).sort(), [...ids].sort());
  const allPrompts = [...prompts, ...addedPrompts, ...phrasePrompts];
  const allClips = [...manifest.clips, ...expansion.clips, ...phrases.clips];
  assert.equal(new Set(allPrompts.map(row => row.id)).size, allPrompts.length, 'Expanded audio never shadows an old prompt');
  assert.deepEqual(expansion.clips.map(clip => clip.id).sort(), addedPrompts.map(row => row.id).sort());
  assert.deepEqual(phrases.clips.map(clip => clip.id).sort(), phrasePrompts.map(row => row.id).sort());
  for (const context of EVENTS.filter(event => event.audioPack !== 'phrases-v015').flatMap(event => event.contexts)) assert.ok(allPrompts.some(row => row.id === context.id));
  for (const clip of allClips) {
    assert.equal(clip.file, `${clip.id}.mp3`);
    assert.equal(clip.text, allPrompts.find(row => row.id === clip.id).text);
    const bytes = fs.readFileSync(new URL(clip.file, base));
    assert.equal(bytes.length, clip.bytes, clip.id);
    assert.equal(createHash('sha256').update(bytes).digest('hex'), clip.sha256, clip.id);
    assert.ok(clip.seconds > 0 && clip.seconds < 32, clip.id);
  }
});
