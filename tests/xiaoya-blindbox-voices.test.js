import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {ALL_FLOWERS} from '../xiaoya/garden-meadow.js';

const base = new URL('../public/xiaoya/audio/', import.meta.url);
const manifest = JSON.parse(fs.readFileSync(new URL('blindbox-voice-manifest.json', base), 'utf8'));
const prompts = {
  'blindbox-choose': '六个小袋子，选一个喜欢的吧。用两枚贝壳，就能打开它。',
  'blindbox-reveal': '惊喜种子来啦！带它去花园，种下看看吧。',
  ...Object.fromEntries(ALL_FLOWERS.map(flower => [`blindbox-seed-${flower.id}`, `你找到${flower.name}种子啦！`])),
};
const words = text => text.replace(/[^\p{L}\p{N}]/gu, '');

test('blind-box guides include every independent flower identity and checked manifest totals', () => {
  const ids = Object.keys(prompts).sort();
  assert.equal(manifest.version, 1);
  assert.equal(manifest.language, 'Chinese');
  assert.equal(manifest.tempo_or_pitch_effects, false);
  assert.match(manifest.source, /no runtime TTS connection/);
  assert.equal(manifest.clip_count, ALL_FLOWERS.length + 2);
  assert.equal(new Set(manifest.clips.map(clip => clip.id)).size, ids.length);
  assert.deepEqual(manifest.clips.map(clip => clip.id).sort(), ids);
  assert.deepEqual(fs.readdirSync(base).filter(file => /^blindbox-.*\.mp3$/.test(file)).sort(), ids.map(id => `${id}.mp3`).sort());
  assert.equal(manifest.total_bytes, manifest.clips.reduce((sum, clip) => sum + clip.bytes, 0));
  assert.equal(manifest.total_seconds, Number(manifest.clips.reduce((sum, clip) => sum + clip.seconds, 0).toFixed(3)));
});

for (const [id, text] of Object.entries(prompts)) {
  test(`${id} preserves exact spoken name, complete coverage and immutable local audio`, () => {
    const clip = manifest.clips.find(item => item.id === id);
    assert.ok(clip, `Missing guide: ${id}`);
    assert.equal(clip.text, text);
    assert.equal(clip.file, `${id}.mp3`);
    assert.equal(clip.voice, 'zh-CN-XiaoxiaoNeural');
    assert.equal(clip.model, 'Microsoft Edge Neural TTS');
    assert.equal(clip.client, 'edge-tts 7.3.1');
    assert.match(clip.source, /generic public text during production only/);
    assert.deepEqual(clip.flags, [], 'No failed production waveform checks may be published');
    assert.equal(clip.word_coverage.matches_prompt, true);
    assert.equal(words(clip.word_coverage.text), words(text), 'All words must be covered by production speech boundaries');
    assert.ok(Number.isFinite(clip.seconds) && clip.seconds > 1 && clip.seconds < 10);
    assert.ok(clip.word_coverage.final_end_seconds > 0 && clip.word_coverage.final_end_seconds <= clip.seconds,
      'The complete name must fit inside the exported clip');
    const bytes = fs.readFileSync(new URL(clip.file, base));
    assert.ok(bytes.length > 1000, 'A prompt cannot be an empty placeholder');
    assert.equal(bytes.length, clip.bytes);
    assert.equal(createHash('sha256').update(bytes).digest('hex'), clip.sha256);
  });
}
