import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {EVENTS, ITEMS, THEMES, GOALS} from '../xiaoya/content.js';
import {PHRASE_PACK_V015, PHRASE_PACK_V015_EVENT_IDS, PHRASE_PACK_V015_EVENTS, PHRASE_PACK_V015_ITEMS} from '../xiaoya/phrase-pack-v015.js';
import {CORE_PHRASE_EVENT_IDS, phraseIdFor, phraseEvents, canonicalEventId} from '../xiaoya/curriculum.js';
import {createState, validateState, recordEvidence, completeEvent, phraseStatus, checkupContext, phraseCheckupContext, canRevealPhrase} from '../xiaoya/learning.js';
import {createPracticePlan, validatePracticePlan, recordPractice, getPracticePlan} from '../xiaoya/practice-plan.js';

const approved = JSON.parse(fs.readFileSync(new URL('../design/xiaoya-phrases-v015/phrases.json', import.meta.url), 'utf8'));
const legacyCatalogue = [
  [
    "hello-morning",
    "hello-02",
    "sun-lamp"
  ],
  [
    "hello-welcome",
    "hello-10",
    "welcome-mat"
  ],
  [
    "hello-goodbye",
    "hello-04",
    "cloud-cushion"
  ],
  [
    "food-water",
    "needs-01",
    "blue-cup"
  ],
  [
    "food-more",
    "needs-09",
    "picnic-basket"
  ],
  [
    "food-no-thanks",
    "meals-06",
    "apple-plate"
  ],
  [
    "play-box",
    "needs-08",
    "toy-box"
  ],
  [
    "play-ball",
    "play-01",
    "soft-ball"
  ],
  [
    "play-bridge",
    "needs-08",
    "wooden-bridge"
  ],
  [
    "care-hands",
    "meals-02",
    "leaf-soap"
  ],
  [
    "care-zip",
    "needs-08",
    "coat-hook"
  ],
  [
    "care-socks",
    "dress-06",
    "sock-basket"
  ],
  [
    "outside-cat",
    "explore-01",
    "cat-plush"
  ],
  [
    "outside-bird",
    "explore-03",
    "bird-mobile"
  ],
  [
    "outside-dog",
    "explore-10",
    "dog-toy"
  ],
  [
    "bed-book",
    "family-05",
    "book-shelf"
  ],
  [
    "bed-story",
    "family-06",
    "story-chair"
  ],
  [
    "bed-night",
    "hello-03",
    "star-blanket"
  ],
  [
    "hello-thanks",
    "hello-05",
    "thank-apple"
  ],
  [
    "hello-sorry",
    "hello-07",
    "sorry-block"
  ],
  [
    "hello-okay",
    "hello-08",
    "okay-heart"
  ],
  [
    "food-hungry",
    "needs-02",
    "hungry-bowl"
  ],
  [
    "food-full",
    "needs-03",
    "full-plate"
  ],
  [
    "food-spoon",
    "meals-04",
    "spoon-friend"
  ],
  [
    "food-apple",
    "meals-05",
    "apple-tree"
  ],
  [
    "food-hot",
    "meals-07",
    "cool-soup"
  ],
  [
    "food-milk",
    "meals-10",
    "milk-cup"
  ],
  [
    "care-teeth",
    "care-01",
    "toothbrush-cup"
  ],
  [
    "care-face",
    "care-02",
    "face-towel"
  ],
  [
    "care-tissue",
    "care-06",
    "tissue-box"
  ],
  [
    "care-dry",
    "care-08",
    "dry-towel"
  ],
  [
    "care-shoes",
    "dress-01",
    "ready-shoes"
  ],
  [
    "play-turn",
    "play-02",
    "turn-slide"
  ],
  [
    "play-roll",
    "play-04",
    "roll-ball"
  ],
  [
    "play-catch",
    "play-05",
    "catch-ball"
  ],
  [
    "play-tower",
    "play-06",
    "color-tower"
  ],
  [
    "play-again",
    "play-08",
    "again-tower"
  ],
  [
    "play-did-it",
    "play-09",
    "did-it-star"
  ],
  [
    "play-tidy",
    "tidy-01",
    "tidy-box"
  ],
  [
    "outside-hand",
    "outside-01",
    "hand-heart"
  ],
  [
    "outside-rain",
    "outside-08",
    "rain-umbrella"
  ],
  [
    "bed-hug",
    "feelings-09",
    "hug-heart"
  ],
  [
    "hello-everyone",
    "hello-01",
    "hello-waves"
  ],
  [
    "family-love",
    "family-04",
    "love-heart"
  ],
  [
    "hello-youre-welcome",
    "hello-06",
    "welcome-heart"
  ],
  [
    "hello-excuse",
    "hello-09",
    "excuse-hand"
  ],
  [
    "outside-go-home",
    "outside-09",
    "home-path"
  ],
  [
    "outside-ready",
    "dress-10",
    "ready-bag"
  ],
  [
    "family-come",
    "family-01",
    "come-cushion"
  ],
  [
    "food-eat",
    "meals-01",
    "eat-table"
  ],
  [
    "feelings-happy",
    "feelings-01",
    "happy-sun"
  ],
  [
    "feelings-tired",
    "feelings-03",
    "tired-cushion"
  ],
  [
    "play-your-turn",
    "play-03",
    "your-turn-block"
  ],
  [
    "play-can-do",
    "dress-07",
    "can-do-puzzle"
  ],
  [
    "play-good-job",
    "kindness-08",
    "good-job-star"
  ]
];
// Serialized with the unmodified v0.14 catalogue before adding the new pack.
const legacySave = {
  "schemaVersion": 1,
  "product": "xiaoya-english",
  "evidence": [
    {
      "attemptId": "old-water-one",
      "eventId": "food-water",
      "contextId": "food-water",
      "goalId": "request",
      "kind": "speech",
      "result": "independent",
      "source": "parent",
      "helped": false,
      "date": "2026-10-16",
      "phraseId": "needs-01"
    },
    {
      "attemptId": "old-water-two",
      "eventId": "food-water",
      "contextId": "food-water-elsewhere",
      "goalId": "request",
      "kind": "speech",
      "result": "independent",
      "source": "parent",
      "helped": false,
      "date": "2026-10-17",
      "phraseId": "needs-01"
    }
  ],
  "corrections": [],
  "completions": {
    "food-water": {
      "firstDate": "2026-10-17",
      "lastDate": "2026-10-17",
      "count": 1
    },
    "hello-everyone": {
      "firstDate": "2026-10-18",
      "lastDate": "2026-10-18",
      "count": 1
    }
  },
  "items": {
    "blue-cup": {
      "earnedOn": "2026-10-17",
      "eventId": "food-water",
      "x": 0.25,
      "y": 0.75
    },
    "hello-waves": {
      "earnedOn": "2026-10-18",
      "eventId": "hello-everyone",
      "x": null,
      "y": null
    }
  },
  "alphabet": {
    "enabled": false,
    "enabledOn": null,
    "letters": {}
  }
};
const clone = value => JSON.parse(JSON.stringify(value));

test('static metadata is exactly the 60 approved phrases and orders easy before later without rewriting either sequence', () => {
  assert.deepEqual(PHRASE_PACK_V015, approved);
  assert.equal(PHRASE_PACK_V015.length, 60);
  assert.deepEqual(PHRASE_PACK_V015_EVENT_IDS, [
    ...approved.filter(phrase => phrase.difficulty === 'easy').map(phrase => phrase.id),
    ...approved.filter(phrase => phrase.difficulty === 'later').map(phrase => phrase.id),
  ]);
  assert.equal(approved.filter(phrase => phrase.difficulty === 'easy').length, 49);
  assert.equal(approved.filter(phrase => phrase.difficulty === 'later').length, 11);
  assert.deepEqual(CORE_PHRASE_EVENT_IDS.slice(24), PHRASE_PACK_V015_EVENT_IDS);
  assert.ok(Object.isFrozen(PHRASE_PACK_V015) && PHRASE_PACK_V015.every(Object.isFrozen));
  assert.ok(Object.isFrozen(PHRASE_PACK_V015_EVENT_IDS));
});

test('all legacy IDs, lesson and item bindings remain intact before 60 distinct new expressions', () => {
  assert.deepEqual(EVENTS.slice(0, 55).map(({id, lessonId, itemId}) => [id, lessonId, itemId]), legacyCatalogue);
  assert.equal(EVENTS.length, 115);
  assert.equal(ITEMS.length, 115);
  assert.equal(new Set(EVENTS.map(event => event.lessonId)).size, 113);
  assert.equal(new Set(EVENTS.map(event => event.id)).size, 115);
  assert.equal(new Set(ITEMS.map(item => item.id)).size, 115);
  const normalized = english => english.toLowerCase().replace(/[^a-z0-9]/g, '');
  const oldEnglish = new Set(EVENTS.slice(0, 55).map(event => normalized(event.english)));
  const newEnglish = PHRASE_PACK_V015_EVENTS.map(event => normalized(event.english));
  assert.equal(new Set(newEnglish).size, 60);
  assert.ok(newEnglish.every(english => !oldEnglish.has(english)));
  assert.deepEqual(EVENTS.slice(55), PHRASE_PACK_V015_EVENTS);
  assert.deepEqual(ITEMS.slice(55), PHRASE_PACK_V015_ITEMS);
});

test('each new event has one approved familiar scene and stable daily phrase and static audio identities', () => {
  for (const [index, event] of PHRASE_PACK_V015_EVENTS.entries()) {
    const source = approved[index];
    assert.equal(event.id, source.id);
    assert.match(event.id, /^daily-[a-z]+(?:-[a-z]+)*$/);
    assert.equal(event.lessonId, source.id);
    assert.equal(event.phraseId, source.id);
    assert.equal(phraseIdFor(event.id), source.id);
    assert.equal(canonicalEventId(event.id), source.id);
    assert.deepEqual(phraseEvents(event.id), [event]);
    assert.equal(event.english, source.english);
    assert.equal(event.chinese, source.meaning);
    assert.equal(event.audioPack, 'phrases-v015');
    assert.equal(event.audio, `./xiaoya/audio/phrases-v015/${source.id}/pip.mp3`);
    assert.equal(event.hintAudio, `xiaoya/audio/phrases-v015/${source.id}/hint.mp3`);
    assert.ok(THEMES.some(theme => theme.id === event.theme));
    assert.ok(GOALS.some(goal => goal.id === event.goalId));
    assert.deepEqual(event.accepted, [source.english]);
    assert.deepEqual(event.contexts, [{id: source.id, settingId: source.id, scene: source.id, label: source.title,
      setup: source.scene, request: source.hint, help: source.hint}]);
    assert.equal(event.setup, source.scene);
    assert.equal(event.resolution, source.scene, 'a single still scene does not invent an outcome frame');
    assert.ok(!('alternateImages' in event));
    assert.equal(event.choices.length, 1);
    assert.equal(event.choices[0].scene, source.id);
    assert.ok(event.choices[0].correct);
    assert.ok(Object.isFrozen(event) && Object.isFrozen(event.contexts[0]) && Object.isFrozen(event.accepted));
    const item = PHRASE_PACK_V015_ITEMS[index];
    assert.equal(item.id, event.itemId);
    assert.equal(item.eventId, event.id);
    assert.equal(item.replayEventId, event.id);
    assert.ok(Object.isFrozen(item));
  }
});

test('v0.14 serialized learning records and placed collections survive loading and a new-phrase completion', () => {
  const before = clone(legacySave);
  let state = validateState(clone(legacySave));
  assert.deepEqual(state, before);
  assert.equal(phraseStatus(state, 'food-water').passed, true);
  const originalPlan = getPracticePlan(createPracticePlan(), {learningState: state, date: '2026-10-19'});
  assert.deepEqual(new Set(originalPlan.cards.map(card => card.eventId)), new Set(['food-water', 'hello-everyone']));
  assert.ok(originalPlan.unseenIds.includes(PHRASE_PACK_V015_EVENT_IDS[0]));
  assert.ok(!originalPlan.unseenIds.includes('hello-everyone'));
  const eventId = PHRASE_PACK_V015_EVENT_IDS[0];
  state = recordEvidence(state, {attemptId: 'new-phrase-first', eventId, date: '2026-10-19', kind: 'speech', result: 'independent', source: 'machine', helped: false});
  state = completeEvent(state, eventId, '2026-10-19');
  assert.deepEqual(validateState(clone(state)), state);
  for (const [id, completion] of Object.entries(before.completions)) assert.deepEqual(state.completions[id], completion);
  for (const [id, item] of Object.entries(before.items)) assert.deepEqual(state.items[id], item);
  assert.deepEqual(state.evidence.slice(0, before.evidence.length), before.evidence);
  assert.deepEqual(state.alphabet, before.alphabet);
  assert.equal(phraseStatus(state, eventId).candidateCount, 1);
  assert.equal(phraseStatus(state, eventId).retained, false);
  assert.deepEqual(legacySave, before, 'reading and adding records never migrates the input in place');
});

test('every one of the 84 core lessons is reachable once, and raw practice logs round-trip with stable IDs', () => {
  let practice = createPracticePlan();
  const visited = [];
  for (const eventId of CORE_PHRASE_EVENT_IDS) {
    const plan = getPracticePlan(practice, {date: '2026-10-19'});
    assert.deepEqual(plan.next, {eventId, mode: 'new', reason: 'unseen', dueDate: null});
    visited.push(plan.next.eventId);
    practice = recordPractice(practice, {roundId: `round-${eventId}`, eventId, date: '2026-10-19', mode: 'new'});
    practice = validatePracticePlan(clone(practice));
  }
  const finished = getPracticePlan(practice, {date: '2026-10-19'});
  assert.deepEqual(visited, CORE_PHRASE_EVENT_IDS);
  assert.deepEqual(visited.slice(24), PHRASE_PACK_V015_EVENT_IDS);
  assert.equal(finished.cards.length, 84);
  assert.equal(finished.unseenIds.length, 0);
  assert.equal(finished.next.mode, 'free');
  const tomorrow = getPracticePlan(practice, {date: '2026-10-20'});
  assert.equal(tomorrow.dueIds.length, 84);
  assert.equal(tomorrow.next.eventId, CORE_PHRASE_EVENT_IDS[0]);
  assert.equal(tomorrow.next.mode, 'review');
  assert.ok(tomorrow.cards.every(card => card.lastOutcome === 'not-attempted' && card.stage === 0));
});

test('an existing 24-lesson practice save offers two due reviews then the first new expression', () => {
  // The previous version persisted these fields, without rewardVariant.
  const saved = {schemaVersion: 1, product: 'xiaoya-english-practice-plan', entries: CORE_PHRASE_EVENT_IDS.slice(0, 24).map(eventId => ({
    roundId: `legacy-${eventId}`, eventId, date: '2026-10-18', attemptId: null, mode: 'new',
  }))};
  let practice = validatePracticePlan(clone(saved));
  assert.deepEqual(practice, saved);
  for (let index = 0; index < 2; index++) {
    const plan = getPracticePlan(practice, {date: '2026-10-19'});
    assert.equal(plan.next.mode, 'review');
    assert.equal(plan.next.eventId, CORE_PHRASE_EVENT_IDS[index]);
    practice = recordPractice(practice, {roundId: `review-${index}`, eventId: plan.next.eventId, date: '2026-10-19', mode: 'review'});
  }
  const next = getPracticePlan(practice, {date: '2026-10-19'}).next;
  assert.equal(next.mode, 'new');
  assert.equal(next.reason, 'new-after-reviews');
  assert.equal(next.eventId, PHRASE_PACK_V015_EVENT_IDS[0]);
  assert.deepEqual(practice.entries.slice(0, 24), saved.entries);
});

test('new phrase checkups and repeated correct observations stay in the one real setting', () => {
  const event = PHRASE_PACK_V015_EVENTS[0];
  let state = createState();
  assert.equal(checkupContext(state, event.id), event.contexts[0]);
  for (const [index, date] of ['2026-10-19', '2026-10-20', '2026-10-23'].entries()) {
    const context = phraseCheckupContext(state, event.id);
    assert.equal(context, event.contexts[0]);
    state = recordEvidence(state, {attemptId: `familiar-${index}`, eventId: event.id, contextId: context.id, date,
      kind: 'speech', result: 'independent', source: 'parent', helped: false, phraseId: event.lessonId});
  }
  assert.equal(phraseStatus(state, event.id).independent, true);
  assert.equal(phraseStatus(state, event.id).retained, false);
  assert.equal(phraseStatus(state, event.id).passed, false);
  assert.equal(canRevealPhrase(state, event.lessonId), false);
  assert.throws(() => recordEvidence(state, {attemptId: 'fabricated-elsewhere', eventId: event.id, contextId: `${event.id}-elsewhere`, date: '2026-10-24',
    kind: 'speech', result: 'independent', source: 'parent', helped: false}), /情境/);
});

test('all 60 phrases ship three English voices and Chinese hint files', t => {
  const required = PHRASE_PACK_V015_EVENT_IDS.flatMap(id => ['aiden', 'ryan', 'pip', 'hint'].map(voice =>
    `public/xiaoya/audio/phrases-v015/${id}/${voice}.mp3`));
  const missing = required.filter(path => !fs.existsSync(new URL('../' + path, import.meta.url)));
  if (missing.length && process.env.XIAOYA_ALLOW_PENDING_V015_AUDIO === '1') {
    t.skip(`Explicit content-only validation: ${missing.length} of 240 generated audio files are pending; release requires this check without the flag.`);
    return;
  }
  assert.deepEqual(missing, [], 'no new phrase may ship with missing static audio');
  for (const path of required) assert.ok(fs.statSync(new URL('../' + path, import.meta.url)).size > 1000, path);
});
