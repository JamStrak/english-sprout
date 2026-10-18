import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';

test('B garden ships intact static Chinese cues matching the five and ten watering rules', () => {
  const base = new URL('../public/xiaoya/audio/', import.meta.url);
  const manifest = JSON.parse(fs.readFileSync(new URL('meadow-voice-manifest.json', base), 'utf8'));
  assert.deepEqual(manifest.clips.map(c => c.id).sort(), ['reward','seed','water','growing','bloom','giant','empty','collection','water-drops'].map(id => 'meadow-' + id).sort());
  for (const clip of manifest.clips) {
    assert.equal(clip.file, clip.id + '.mp3');
    const bytes = fs.readFileSync(new URL(clip.file, base));
    assert.equal(bytes.length, clip.bytes, clip.id);
    assert.equal(createHash('sha256').update(bytes).digest('hex'), clip.sha256, clip.id);
    assert.deepEqual(clip.flags, [], clip.id);
    assert.equal(clip.word_coverage.matches_prompt, true, clip.id);
    assert.ok(clip.seconds > 1 && clip.seconds < 12, clip.id);
  }
  assert.match(manifest.clips.find(c => c.id === 'meadow-reward').text, /三枚贝壳，五滴水/);
  assert.match(manifest.clips.find(c => c.id === 'meadow-giant').text, /浇|喝十次水/);
  assert.ok(manifest.clips.reduce((size, clip) => size + clip.bytes, 0) < 300000);
});

test('drop-target guide has exact spoken instructions and keeps the old water URL immutable', () => {
  const base = new URL('../public/xiaoya/audio/', import.meta.url);
  const manifest = JSON.parse(fs.readFileSync(new URL('meadow-voice-manifest.json', base), 'utf8'));
  const clip = manifest.clips.find(c => c.id === 'meadow-water-drops');
  const text = '点一下小水壶，再点小苗头上的水滴。点一次，浇一滴水。';
  assert.equal(clip.text, text);
  assert.equal(clip.voice, 'zh-CN-XiaoxiaoNeural');
  assert.equal(clip.client, 'edge-tts 7.3.1');
  assert.match(manifest.source, /no runtime TTS connection/);
  assert.equal(manifest.tempo_or_pitch_effects, false);
  const words = value => value.replace(/[^\p{L}\p{N}]/gu, '');
  assert.equal(words(clip.word_coverage.text), words(text));
  assert.ok(clip.word_coverage.final_end_seconds > 0 && clip.word_coverage.final_end_seconds <= clip.seconds);
  assert.ok(clip.bytes > 1000);
  const previous = fs.readFileSync(new URL('meadow-water.mp3', base));
  assert.equal(previous.length, 33932);
  assert.equal(createHash('sha256').update(previous).digest('hex'), '845721a09e9a26c5dc985b97bc6ad4589f001c8ea5f9c494ca9df47e16ac4f91');
});
