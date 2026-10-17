import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {EVENTS} from '../xiaoya/content.js';

test('every Chinese guide and context ships the matching checked neural clip', () => {
  const base = new URL('../public/xiaoya/audio/', import.meta.url);
  const prompts = JSON.parse(fs.readFileSync(new URL('prompts.json', base), 'utf8')).prompts;
  const manifest = JSON.parse(fs.readFileSync(new URL('voice-manifest.json', base), 'utf8'));
  const expansion = JSON.parse(fs.readFileSync(new URL('expansion-voice-manifest.json', base), 'utf8'));
  const addedPrompts = EVENTS.filter(event => event.illustration === 'comic').flatMap(event => event.contexts.map(context => ({id: context.id, text: context.help + '听我说。'})));
  const ids = prompts.map(row => row.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(manifest.clips.length, ids.length, 'Do not silently leave old system voices in the release');
  assert.deepEqual(manifest.clips.map(clip => clip.id).sort(), [...ids].sort());
  const allPrompts = [...prompts, ...addedPrompts];
  const allClips = [...manifest.clips, ...expansion.clips];
  assert.equal(new Set(allPrompts.map(row => row.id)).size, allPrompts.length, 'Expanded audio never shadows an old prompt');
  assert.deepEqual(expansion.clips.map(clip => clip.id).sort(), addedPrompts.map(row => row.id).sort());
  for (const context of EVENTS.flatMap(event => event.contexts)) assert.ok(allPrompts.some(row => row.id === context.id));
  for (const clip of allClips) {
    assert.equal(clip.file, `${clip.id}.mp3`);
    assert.equal(clip.text, allPrompts.find(row => row.id === clip.id).text);
    const bytes = fs.readFileSync(new URL(clip.file, base));
    assert.equal(bytes.length, clip.bytes, clip.id);
    assert.equal(createHash('sha256').update(bytes).digest('hex'), clip.sha256, clip.id);
    assert.ok(clip.seconds > 0 && clip.seconds < 32, clip.id);
  }
});
