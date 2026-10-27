import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';

const base = new URL('../public/xiaoya/audio/', import.meta.url);
const manifest = JSON.parse(fs.readFileSync(new URL('welcome-hello-manifest.json', base), 'utf8'));
const prompts = {
  'welcome-hello-01': '你回来啦，欢迎你！我给你准备了一份小礼物，点开看看吧。',
  'welcome-hello-02': '又见到你啦，真高兴！今天的小礼物，会是什么呢？',
  'welcome-hello-03': '嗨，小伙伴！小芽送你一个小惊喜，打开看看吧。',
  'welcome-hello-04': '欢迎来玩！这份小礼物送给你，我们一起打开吧。',
  'welcome-hello-05': '见到你真开心！你看，这里有份小礼物，送给你。',
  'welcome-hello-06': '哈喽，你来啦！今天也有小惊喜，点点礼物看看吧。',
};
const words = text => text.replace(/[^\p{L}\p{N}]/gu, '');

test('daily welcome has six distinct complete static greetings and checked manifest totals', () => {
  const ids = Object.keys(prompts).sort();
  assert.equal(manifest.version, 1);
  assert.equal(manifest.language, 'Chinese');
  assert.equal(manifest.tempo_or_pitch_effects, false);
  assert.match(manifest.source, /no runtime TTS connection/);
  assert.equal(manifest.clip_count, 6);
  assert.equal(new Set(manifest.clips.map(clip => clip.id)).size, 6);
  assert.equal(new Set(manifest.clips.map(clip => clip.text)).size, 6);
  assert.deepEqual(manifest.clips.map(clip => clip.id).sort(), ids);
  assert.deepEqual(fs.readdirSync(base).filter(file => /^welcome-hello-\d+\.mp3$/.test(file)).sort(), ids.map(id => `${id}.mp3`));
  assert.equal(manifest.total_bytes, manifest.clips.reduce((sum, clip) => sum + clip.bytes, 0));
  assert.equal(manifest.total_seconds, Number(manifest.clips.reduce((sum, clip) => sum + clip.seconds, 0).toFixed(3)));
});

for (const [id, text] of Object.entries(prompts)) {
  test(`${id} preserves complete warm greeting and checked immutable local audio`, () => {
    const clip = manifest.clips.find(item => item.id === id);
    assert.ok(clip, `Missing greeting: ${id}`);
    assert.equal(clip.text, text);
    assert.equal(clip.file, `${id}.mp3`);
    assert.equal(clip.voice, 'zh-CN-XiaoxiaoNeural');
    assert.equal(clip.model, 'Microsoft Edge Neural TTS');
    assert.equal(clip.client, 'edge-tts 7.3.1');
    assert.equal(clip.rate, '+0%');
    assert.equal(clip.pitch, '+0Hz');
    assert.equal(clip.volume, '+0%');
    assert.match(clip.source, /generic public text during production only/);
    assert.deepEqual(clip.flags, [], 'No failed production waveform checks may be published');
    assert.equal(clip.word_coverage.matches_prompt, true);
    assert.equal(words(clip.word_coverage.text), words(text), 'All words must be covered by production speech boundaries');
    assert.ok(Number.isFinite(clip.seconds) && clip.seconds > 2 && clip.seconds < 12);
    assert.ok(clip.word_coverage.final_end_seconds > 0 && clip.word_coverage.final_end_seconds <= clip.seconds,
      'The complete greeting must fit inside the exported clip');
    const bytes = fs.readFileSync(new URL(clip.file, base));
    assert.ok(bytes.length > 1000, 'A greeting cannot be an empty placeholder');
    assert.equal(bytes.length, clip.bytes);
    assert.equal(createHash('sha256').update(bytes).digest('hex'), clip.sha256);
  });
}
