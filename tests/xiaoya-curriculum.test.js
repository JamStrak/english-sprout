import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {EVENTS, ITEMS, THEMES, GOALS} from '../xiaoya/content.js';
import {VOICES, lessonAudio} from '../xiaoya/voices.js';
import {
  CORE_PHRASE_EVENT_IDS, phraseIdFor, canonicalEventId, phraseEvents,
} from '../xiaoya/curriculum.js';

const eventFor = id => EVENTS.find(event => event.id === id);
const read = path => fs.readFileSync(new URL('../' + path, import.meta.url));
const recorded = JSON.parse(read('public/data/curriculum.json')).lessons;
const originalIds = [
  'hello-morning', 'hello-welcome', 'hello-goodbye', 'food-water', 'food-more',
  'food-no-thanks', 'play-box', 'play-ball', 'play-bridge', 'care-hands', 'care-zip',
  'care-socks', 'outside-cat', 'outside-bird', 'outside-dog', 'bed-book', 'bed-story',
  'bed-night', 'hello-thanks', 'hello-sorry', 'hello-okay', 'food-hungry', 'food-full',
  'food-spoon', 'food-apple', 'food-hot', 'food-milk', 'care-teeth', 'care-face',
  'care-tissue', 'care-dry', 'care-shoes', 'play-turn', 'play-roll', 'play-catch',
  'play-tower', 'play-again', 'play-did-it', 'play-tidy', 'outside-hand',
  'outside-rain', 'bed-hug',
];
const originalCoreIds = [
  'hello-everyone', 'hello-morning', 'family-love',
  'hello-thanks', 'hello-youre-welcome', 'hello-sorry', 'hello-okay',
  'hello-goodbye', 'bed-night', 'hello-welcome', 'hello-excuse',
  'outside-go-home', 'outside-ready', 'family-come', 'food-eat',
  'food-hungry', 'feelings-happy', 'feelings-tired',
  'play-turn', 'play-your-turn', 'play-can-do', 'play-did-it',
  'play-good-job', 'play-again',
];

test('84 distinct core expressions retain the original first 24 lessons in the same order', () => {
  assert.equal(CORE_PHRASE_EVENT_IDS.length, 84);
  assert.deepEqual(CORE_PHRASE_EVENT_IDS.slice(0, 24), originalCoreIds);
  assert.ok(Object.isFrozen(CORE_PHRASE_EVENT_IDS));
  assert.equal(new Set(CORE_PHRASE_EVENT_IDS).size, 84);
  assert.equal(new Set(CORE_PHRASE_EVENT_IDS.map(phraseIdFor)).size, 84);
  assert.equal(CORE_PHRASE_EVENT_IDS[0], 'hello-everyone');
  for (const english of ['I love you.', 'Good morning.', 'Good night.', 'Thank you.',
    "You're welcome.", "I'm sorry.", "That's okay.", 'See you later.', "Let's go home."]) {
    assert.ok(CORE_PHRASE_EVENT_IDS.some(id => eventFor(id).english === english), english);
  }
  for (const id of ['play-box', 'play-bridge', 'care-zip', 'food-no-thanks', 'care-socks']) {
    assert.ok(eventFor(id), 'Older expressions remain available: ' + id);
    assert.ok(!CORE_PHRASE_EVENT_IDS.includes(id), 'Do not automatically introduce this as a core lesson: ' + id);
  }
});

test('all original core expressions retain their shipped English and Chinese lines and three usable voices', () => {
  assert.equal(VOICES.length, 3);
  for (const id of originalCoreIds) {
    const event = eventFor(id);
    const source = recorded.find(lesson => lesson.id === phraseIdFor(id));
    assert.ok(source, id);
    assert.equal(event.english, source.english, id);
    assert.equal(event.chinese, source.chinese, id);
    for (const voice of VOICES) {
      const path = 'public/' + lessonAudio(event, voice.id).slice(2);
      assert.ok(read(path).length > 1000, id + ' has shipped ' + voice.id + ' audio');
    }
  }
});

test('same-phrase lookups consolidate every old help scene and preserve original event order', () => {
  assert.deepEqual(EVENTS.slice(0, originalIds.length).map(event => event.id), originalIds);
  const expected = ['play-box', 'play-bridge', 'care-zip'];
  for (const id of expected) {
    assert.equal(phraseIdFor(id), 'needs-08');
    assert.equal(canonicalEventId(id), 'play-box');
    const group = phraseEvents(id);
    assert.deepEqual(group.map(event => event.id), expected);
    assert.ok(Object.isFrozen(group));
    for (const event of group) assert.equal(event, eventFor(event.id));
  }
});

test('core canonical events resolve to themselves and unrelated phrases never share their group', () => {
  for (const id of CORE_PHRASE_EVENT_IDS) {
    assert.equal(canonicalEventId(id), id);
    assert.ok(phraseEvents(id).every(event => event.lessonId === phraseIdFor(id)));
  }
  assert.notEqual(phraseEvents('hello-thanks'), phraseEvents('hello-youre-welcome'));
  assert.notEqual(phraseEvents('play-turn'), phraseEvents('play-your-turn'));
  for (const fn of [phraseIdFor, canonicalEventId, phraseEvents]) {
    for (const invalid of ['unknown', '', undefined, 'needs-08']) {
      assert.throws(() => fn(invalid), RangeError, 'Do not silently select a different expression');
    }
  }
});

test('new phrase scenes have complete distinct contexts and do not claim pre-recorded comic help', () => {
  const additions = EVENTS.filter(event => event.illustration === 'phrase');
  assert.equal(additions.length, 13);
  assert.equal(EVENTS.filter(event => event.illustration === 'comic').length, 24);
  assert.equal(new Set(EVENTS.map(event => event.id)).size, EVENTS.length);
  assert.equal(new Set(ITEMS.map(item => item.id)).size, ITEMS.length);
  for (const event of additions) {
    assert.ok(CORE_PHRASE_EVENT_IDS.includes(event.id));
    assert.ok(THEMES.some(theme => theme.id === event.theme), event.id);
    assert.ok(GOALS.some(goal => goal.id === event.goalId), event.id);
    assert.ok(ITEMS.some(item => item.id === event.itemId && item.eventId === event.id), event.id);
    assert.ok(Object.isFrozen(event));
    assert.equal(event.contexts.length, 2);
    assert.notEqual(event.contexts[0].settingId, event.contexts[1].settingId, event.id);
    assert.notEqual(event.contexts[0].setup, event.contexts[1].setup, event.id);
    for (const context of event.contexts) {
      for (const key of ['id', 'settingId', 'scene', 'label', 'setup', 'request', 'help']) {
        assert.ok(typeof context[key] === 'string' && context[key].length > 0, event.id + ' ' + key);
      }
    }
    assert.ok(event.accepted.length > 0, event.id);
  }
});
