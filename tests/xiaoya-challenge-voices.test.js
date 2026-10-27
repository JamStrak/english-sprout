import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';

const base = new URL('../public/xiaoya/audio/', import.meta.url);
const manifest = JSON.parse(fs.readFileSync(new URL('challenge-voice-manifest.json', base), 'utf8'));
const prompts = {
  'challenge-intro': '这里是花园挑战。把学过的四句话说给小芽听，一起打开大礼物吧！',
  'challenge-invite': '你已经练过这些话啦！点小旗子，试试花园挑战吧。',
  'challenge-question': '看看这幅画，这个时候，你会怎么说呢？想好了，就点话筒。想听一遍，也可以点小耳朵。',
  'challenge-practice': '这句我们再一起练练。刚才完成的小步，都帮你留下啦。',
  'challenge-step': '这一小步完成啦！我们接着试一试。',
  'challenge-return': '再来试试刚才那一句吧。',
  'challenge-clear': '挑战完成啦！四枚贝壳，还有六滴水，都是你的！带回花园吧！',
  'challenge-replay': '你又把这几句话说出来啦！我们去花园看看吧。',
  'challenge-seed': '这是挑战送给你的特别种子！种进花园，看看会开出什么花吧。',
  'challenge-wait': '先和小芽学学这几句话，再来挑战吧。',
  'challenge-saved': '已经完成的小步，都帮你留下啦。准备好了，随时回来接着玩。',
  'economy-water-v13': '两滴水，收好啦！去给小苗浇水吧。',
  'economy-starter-v13': '送你第一份小礼物！两枚贝壳，还有三滴水。去种下第一颗种子吧。',
  'flow-water-choice-v13': '水滴可以浇花。想要这两滴水，就点小礼物。',
  'flow-review-v13': '老朋友来啦！看看这幅画，你还记得怎么说吗？想听一遍，就点小耳朵。',
};
const words = text => text.replace(/[^\p{L}\p{N}]/gu, '');

test('challenge release ships all fifteen static prompts with complete manifest totals', () => {
  const ids = Object.keys(prompts).sort();
  assert.equal(manifest.version, 1);
  assert.equal(manifest.language, 'Chinese');
  assert.equal(manifest.tempo_or_pitch_effects, false);
  assert.match(manifest.source, /no runtime TTS connection/);
  assert.equal(manifest.clip_count, ids.length);
  assert.equal(new Set(manifest.clips.map(clip => clip.id)).size, ids.length);
  assert.deepEqual(manifest.clips.map(clip => clip.id).sort(), ids);
  assert.deepEqual(fs.readdirSync(base).filter(file => /^(?:challenge-.*|(?:economy|flow)-.*-v13)\.mp3$/.test(file)).sort(), ids.map(id => `${id}.mp3`).sort());
  assert.equal(manifest.total_bytes, manifest.clips.reduce((sum, clip) => sum + clip.bytes, 0));
  assert.equal(manifest.total_seconds, Number(manifest.clips.reduce((sum, clip) => sum + clip.seconds, 0).toFixed(3)));
});

for (const [id, text] of Object.entries(prompts)) {
  test(`${id} preserves exact spoken words, usable local audio and immutable asset digest`, () => {
    const clip = manifest.clips.find(item => item.id === id);
    assert.ok(clip, `Missing guide: ${id}`);
    assert.equal(clip.text, text);
    assert.equal(clip.file, `${id}.mp3`);
    assert.equal(clip.voice, 'zh-CN-XiaoxiaoNeural');
    assert.equal(clip.model, 'Microsoft Edge Neural TTS');
    assert.equal(clip.client, 'edge-tts 7.3.1');
    assert.match(clip.source, /generic public text during production only/);
    assert.deepEqual(clip.flags, [], 'No failed waveform checks may be published');
    assert.equal(clip.word_coverage.matches_prompt, true);
    assert.equal(words(clip.word_coverage.text), words(text), 'Every spoken word must be represented in production boundaries');
    assert.ok(Number.isFinite(clip.seconds) && clip.seconds > 1 && clip.seconds < 15);
    assert.ok(clip.word_coverage.final_end_seconds > 0 && clip.word_coverage.final_end_seconds <= clip.seconds,
      'The final spoken word must fit inside the published clip');
    const bytes = fs.readFileSync(new URL(clip.file, base));
    assert.ok(bytes.length > 1000, 'A prompt cannot be an empty placeholder');
    assert.equal(bytes.length, clip.bytes);
    assert.equal(createHash('sha256').update(bytes).digest('hex'), clip.sha256);
  });
}
