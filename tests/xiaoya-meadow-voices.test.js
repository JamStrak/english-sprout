import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';

test('B garden ships intact static Chinese cues matching the five and ten watering rules', () => {
  const base = new URL('../public/xiaoya/audio/', import.meta.url);
  const manifest = JSON.parse(fs.readFileSync(new URL('meadow-voice-manifest.json', base), 'utf8'));
  assert.deepEqual(manifest.clips.map(c => c.id).sort(), ['reward','seed','water','growing','bloom','giant','empty','collection'].map(id => 'meadow-' + id).sort());
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
