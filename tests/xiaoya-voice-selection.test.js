import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {VOICES, VOICE_KEY, normalizeVoice, readVoice, saveVoice, lessonAudio} from '../xiaoya/voices.js';

function storage(entries = []) {
  const items = new Map(entries);
  return {getItem:key => items.get(key) ?? null, setItem:(key,value) => items.set(key,value), items};
}

test('new voice choices use Chinese labels and default to Pip for absent or invalid preferences', () => {
  assert.deepEqual(VOICES.map(({id,name}) => [id,name]), [['aiden','小熊伙伴'],['ryan','小狐伙伴'],['pip','泡泡猫']]);
  for (const voice of VOICES) assert.equal(normalizeVoice(voice.id), voice.id);
  for (const value of [undefined, null, '', 'unknown', 'Pip', {}, 1]) assert.equal(normalizeVoice(value), 'pip');
  assert.equal(readVoice(storage()), 'pip');
});

test('voice selection persists in its own key without reading or overwriting the older app preference', () => {
  const store = storage([['english-sprout-voice-v1','aiden']]);
  assert.equal(VOICE_KEY, 'xiaoya-english:voice:v1');
  assert.equal(readVoice(store), 'pip');
  assert.equal(saveVoice('ryan', store), true);
  assert.equal(readVoice(store), 'ryan');
  assert.equal(store.items.get('english-sprout-voice-v1'), 'aiden');
  assert.equal(saveVoice('unknown', store), true);
  assert.equal(readVoice(store), 'pip');
});

test('blocked local storage still permits the default voice and reports an unsaved preference', () => {
  const blocked = {getItem() {throw new Error('blocked');}, setItem() {throw new Error('blocked');}};
  assert.equal(readVoice(blocked), 'pip');
  assert.equal(saveVoice('aiden', blocked), false);
});

test('lesson audio supports an event or lesson ID and stays relative for nested hosting', () => {
  const event = {lessonId:'needs-01',audio:'./audio/characters/pip/needs-01.mp3'};
  assert.equal(lessonAudio(event, 'aiden'), './audio/needs-01.mp3');
  assert.equal(lessonAudio(event, 'ryan'), './audio/ryan/needs-01.mp3');
  assert.equal(lessonAudio({phraseId:'needs-01'}, 'pip'), './audio/characters/pip/needs-01.mp3');
  assert.equal(lessonAudio('needs-01', 'invalid'), './audio/characters/pip/needs-01.mp3');
  assert.equal(new URL(lessonAudio(event, 'ryan'), 'https://example.test/hosted/course/').pathname,
    '/hosted/course/audio/ryan/needs-01.mp3');
  for (const invalid of [undefined, null, {}, '../needs-01', 'needs-01.mp3', 'https://example.test/clip']) {
    assert.equal(lessonAudio(invalid, 'aiden'), '');
  }
});

test('all three pilot stories have prerecorded audio in all three voice choices', () => {
  const base = new URL('../public/', import.meta.url);
  for (const lesson of ['needs-01','needs-08','hello-04']) {
    for (const voice of VOICES) assert.ok(fs.statSync(new URL(lessonAudio(lesson,voice.id),base)).size > 1000, `${lesson}/${voice.id}`);
  }
});

test('all nine garden cues ship their separately checked neural clips', () => {
  const base = new URL('../public/xiaoya/audio/', import.meta.url);
  const manifest = JSON.parse(fs.readFileSync(new URL('garden-voice-manifest.json',base),'utf8'));
  const expected = ['garden-welcome','garden-reward','garden-pack','garden-seed','garden-water','garden-bloom','garden-next','garden-speak','garden-watch'];
  assert.deepEqual(manifest.clips.map(clip => clip.id).sort(), expected.sort());
  for (const clip of manifest.clips) {
    assert.equal(clip.file, `${clip.id}.mp3`);
    assert.equal(clip.voice, 'zh-CN-XiaoxiaoNeural');
    assert.equal(clip.client, 'edge-tts 7.3.1');
    assert.equal(clip.word_coverage.matches_prompt, true);
    assert.equal(clip.word_coverage.text.replace(/[^\p{L}\p{N}]/gu,''), clip.text.replace(/[^\p{L}\p{N}]/gu,''));
    assert.ok(clip.seconds > 0 && clip.seconds < 20, clip.id);
    const bytes = fs.readFileSync(new URL(clip.file,base));
    assert.equal(bytes.length, clip.bytes, clip.id);
    assert.equal(createHash('sha256').update(bytes).digest('hex'), clip.sha256, clip.id);
    assert.deepEqual(clip.flags, []);
  }
});

test('garden feedback voices name the current controls and separate a shell reward from a saved assessment', () => {
  const base = new URL('../public/xiaoya/audio/', import.meta.url);
  const manifest = JSON.parse(fs.readFileSync(new URL('garden-speech-voice-manifest.json',base),'utf8'));
  const expected = {
    'garden-speech-pass':'我听懂啦！点亮闪闪的贝壳，收下小礼物吧。',
    'garden-speech-retry':'再试试看。点小耳朵，听一听，再点话筒跟我说。',
    'garden-speech-partial':'已经有一点像啦！点小耳朵，再听一遍，一起试试。',
    'garden-speech-silent':'等话筒亮起来，再开口说哦。也可以点小耳朵，先听一听。',
    'garden-speech-wait':'小耳朵还没准备好。可以点下面的小三角，先听伙伴说。',
    'garden-speech-saved':'我听懂啦！点小勾勾，收好这次练习吧。',
    'garden-open-pack':'点一下种子袋，看看里面藏着什么种子！'
  };
  assert.deepEqual(manifest.clips.map(clip => clip.id).sort(), Object.keys(expected).sort());
  assert.equal(manifest.tempo_or_pitch_effects, false);
  for (const clip of manifest.clips) {
    assert.equal(clip.text, expected[clip.id]);
    assert.equal(clip.file, `${clip.id}.mp3`);
    assert.equal(clip.voice, 'zh-CN-XiaoxiaoNeural');
    assert.equal(clip.client, 'edge-tts 7.3.1');
    assert.equal(clip.word_coverage.matches_prompt, true);
    assert.equal(clip.word_coverage.text.replace(/[^\p{L}\p{N}]/gu,''), clip.text.replace(/[^\p{L}\p{N}]/gu,''));
    assert.ok(clip.seconds > 0 && clip.seconds < 20, clip.id);
    assert.ok(clip.word_coverage.final_end_seconds <= clip.seconds + .15, clip.id);
    assert.ok(clip.seconds - clip.word_coverage.final_end_seconds <= 1.2, clip.id);
    const bytes = fs.readFileSync(new URL(clip.file,base));
    assert.equal(bytes.length, clip.bytes, clip.id);
    assert.equal(createHash('sha256').update(bytes).digest('hex'), clip.sha256, clip.id);
    assert.deepEqual(clip.flags, []);
  }
});
