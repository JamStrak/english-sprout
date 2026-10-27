import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';

const base = new URL('../public/xiaoya/audio/', import.meta.url);
const manifest = JSON.parse(fs.readFileSync(new URL('economy-voice-manifest.json', base), 'utf8'));
const prompts = {
  'economy-choice': '这次想带回什么？点贝壳，或者点水滴。',
  'economy-shells': '两枚小贝壳，收好啦！攒起来，可以买喜欢的种子。',
  'economy-water': '五滴水，收好啦！去给小苗浇水吧。',
  'economy-starter': '送你第一份小礼物！两枚贝壳，还有五滴水。去种一朵小花吧。',
  'economy-shop': '这里有两种种子包。问号包，打开有惊喜。旁边这包，可以看到会长出什么花。',
  'economy-reserve': '先帮你留下来。攒够贝壳，再来带它回家。',
  'economy-replace': '要换成这包吗？原来留下的那包，就放回商店啦。',
  'economy-short': '贝壳还不够。可以先帮你留下来，再去玩一会儿英语。',
  'economy-pack': '用两枚贝壳，打开一包惊喜种子。',
  'economy-earned': '小礼物还在这里。点贝壳，或者点水滴，选一份带回家。',
  'economy-shop-ready': '去看看种子吧。可以开惊喜包，也可以攒贝壳买喜欢的花。',
  'economy-water-short': '水用完啦。再玩一会儿英语，带些水回来吧。',
  'economy-shells-short': '贝壳还不够。再和小芽玩一会儿，带些贝壳回来吧。',
};
const words = text => text.replace(/[^\p{L}\p{N}]/gu, '');

test('economy guides contain exactly the thirteen static prompts and MP3 files', () => {
  const ids = Object.keys(prompts).sort();
  assert.equal(manifest.version, 1);
  assert.equal(manifest.language, 'Chinese');
  assert.equal(manifest.tempo_or_pitch_effects, false);
  assert.match(manifest.source, /no runtime TTS connection/);
  assert.equal(new Set(manifest.clips.map(clip => clip.id)).size, manifest.clips.length);
  assert.deepEqual(manifest.clips.map(clip => clip.id).sort(), ids);
  assert.deepEqual(fs.readdirSync(base).filter(file => /^economy-.*\.mp3$/.test(file) && !/-v13\.mp3$/.test(file)).sort(), ids.map(id => `${id}.mp3`).sort());
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
