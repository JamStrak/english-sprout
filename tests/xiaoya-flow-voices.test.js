import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';

const base = new URL('../public/xiaoya/audio/', import.meta.url);
const manifest = JSON.parse(fs.readFileSync(new URL('flow-voice-manifest.json', base), 'utf8'));
const prompts = {
  'flow-recall': '这句还记得吗？点耳朵听一遍，或者点话筒说。',
  'flow-choice': '贝壳可以买种子，水滴可以浇花。点一个，听听看。',
  'flow-shells': '贝壳可以买种子。想要贝壳，就点下面的小礼物。',
  'flow-water': '水滴可以浇花。想要水滴，就点下面的小礼物。',
  'flow-shell-use': '贝壳可以买种子。攒起来，买喜欢的种子吧。',
  'flow-water-use': '水滴可以浇花，让小苗慢慢长大。',
  'flow-pass': '我听懂啦！点亮小礼物，收下奖励吧。',
};
const words = text => text.replace(/[^\p{L}\p{N}]/gu, '');

test('flow guides contain exactly the seven static prompts and MP3 files', () => {
  const ids = Object.keys(prompts).sort();
  assert.equal(manifest.version, 1);
  assert.equal(manifest.language, 'Chinese');
  assert.equal(manifest.tempo_or_pitch_effects, false);
  assert.match(manifest.source, /no runtime TTS connection/);
  assert.equal(new Set(manifest.clips.map(clip => clip.id)).size, manifest.clips.length);
  assert.deepEqual(manifest.clips.map(clip => clip.id).sort(), ids);
  assert.deepEqual(fs.readdirSync(base).filter(file => /^flow-.*\.mp3$/.test(file) && !/-v13\.mp3$/.test(file)).sort(), ids.map(id => `${id}.mp3`).sort());
});

for (const [id, text] of Object.entries(prompts)) {
  test(`${id} keeps its exact text, checked speech coverage and published bytes`, () => {
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
    assert.equal(words(clip.word_coverage.text), words(text), 'All prompt words must be represented in production speech boundaries');
    assert.ok(Number.isFinite(clip.seconds) && clip.seconds > 1 && clip.seconds < 15);
    assert.ok(clip.word_coverage.final_end_seconds > 0 && clip.word_coverage.final_end_seconds <= clip.seconds,
      'The final spoken word must fit inside the exported clip');
    const bytes = fs.readFileSync(new URL(clip.file, base));
    assert.ok(bytes.length > 1000, 'A guide cannot be an empty or placeholder asset');
    assert.equal(bytes.length, clip.bytes);
    assert.equal(createHash('sha256').update(bytes).digest('hex'), clip.sha256);
  });
}
