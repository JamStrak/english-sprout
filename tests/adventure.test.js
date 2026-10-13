import test from 'node:test';
import assert from 'node:assert/strict';
import {addDays, createState, getDailyPlan, recordResult, recordCheckup} from '../src/learning.js';
import {getTodayJourney} from '../src/journey.js';
import {getGarden, recordGardenAction, recordGardenPractice, WORLD_CAPACITY} from '../src/garden.js';
import {getAdventure} from '../src/adventure.js';

const start = '2026-01-01';
const lessons = Array.from({length: 120}, (_, index) => ({id: `lesson-${index + 1}`}));
function introduce(count) {
  let state = createState(start);
  for (let index = 0; index < count; index++) state = recordResult(state, lessons[index].id, 'good', addDays(start, index), {isNew: true});
  return state;
}
function review(state, day) {
  for (const id of getDailyPlan(state, lessons, day).dueIds) state = recordResult(state, id, 'good', day);
  return state;
}
function freezeDeep(value) {
  for (const child of Object.values(value)) if (child && typeof child === 'object') freezeDeep(child);
  return Object.freeze(value);
}
const seed = {type: 'world-plant', id: 'adventure-flower-1', kind: 'sunflower', x: 3000, y: 3000};
function watered(state, count, day = start) {
  for (let index = 0; index < count; index++) state = recordGardenAction(state,
    {type: 'world-water', id: seed.id, actionId: `adventure-drop-${index}`}, day);
  return state;
}

test('first adventure starts with one real discovery and zero fabricated rewards', () => {
  const state = createState(start), before = JSON.stringify(state);
  const adventure = getAdventure(state, lessons, start);
  assert.equal(adventure.quest.kind, 'learn');
  assert.equal(adventure.quest.lessonId, 'lesson-1');
  assert.deepEqual(adventure.stats, {learnedCount: 0, bloomCount: 0, plantCount: 0, practiceDays: 0, seeds: 0, water: 0});
  assert.equal(adventure.rank.level, 1);
  assert.equal(adventure.rank.current, 0);
  assert.equal(adventure.rank.target, 3);
  assert.equal(adventure.rank.progress, 0);
  assert.equal(adventure.nextGoal.kind, 'discover');
  assert.equal(JSON.stringify(state), before);
});

test('the game keeps review first and respects the daily new-sentence cap', () => {
  const day = addDays(start, 10);
  let state = introduce(3);
  assert.equal(getAdventure(state, lessons, day).quest.kind, 'review');
  assert.equal(getAdventure(state, lessons, day).quest.count, 3);
  state = review(state, day);
  assert.equal(getAdventure(state, lessons, day).quest.kind, 'learn');
  for (let index = 3; index < 6; index++) state = recordResult(state, lessons[index].id, 'good', day, {isNew: true});
  const adventure = getAdventure(state, lessons, day);
  assert.equal(getDailyPlan(state, lessons, day).canLearnMore, false);
  assert.equal(adventure.quest.kind, 'garden');
  assert.equal(adventure.quest.lessonId, null);
  assert.equal(adventure.quest.nextKind, null);
});

test('review backlog cannot be bypassed by an adventure title or a rank goal', () => {
  const day = addDays(start, 30);
  let state = introduce(12);
  state.settings.dailyReviews = 2;
  assert.equal(getAdventure(state, lessons, day).quest.count, 2);
  state = review(state, day);
  assert.equal(getDailyPlan(state, lessons, day).newLimit, 1);
  assert.equal(getAdventure(state, lessons, day).quest.kind, 'learn');
  state = recordResult(state, 'lesson-13', 'good', day, {isNew: true});
  const adventure = getAdventure(state, lessons, day);
  assert.equal(adventure.quest.kind, 'checkup');
  assert.equal(adventure.quest.nextKind, 'garden');
  const checkup = getTodayJourney(state, lessons, day);
  state = recordCheckup(state, lessons, checkup.ids.map(lessonId => ({lessonId, meaning: true, spoken: 'good'})), day);
  assert.equal(getAdventure(state, lessons, day).quest.kind, 'garden');
  assert.equal(getDailyPlan(state, lessons, day).canLearnMore, false);
});

test('memory treasure appears only when the existing checkup scheduler offers it', () => {
  let state = review(introduce(3), addDays(start, 5));
  const day = addDays(start, 7);
  assert.equal(getAdventure(state, lessons, day).quest.nextKind, 'checkup');
  state = recordResult(state, 'lesson-4', 'good', day, {isNew: true});
  assert.equal(getAdventure(state, lessons, day).quest.kind, 'checkup');
  assert.equal(getAdventure(state, lessons, day).quest.title, '记忆寻宝');
  assert.equal(getAdventure(state, lessons, day).quest.count, 3);
});

test('rank uses discoveries and actual blooms, not water spending or repeated practice', () => {
  let state = introduce(1);
  const rank = getAdventure(state, lessons, start).rank;
  state = recordGardenAction(state, seed, start);
  for (let round = 0; round < 2; round++) state = recordGardenPractice(state,
    {lessonId: 'lesson-1', attemptId: `adventure-round-${round}`, assessment: 'practice-effort'}, start);
  assert.deepEqual(getAdventure(state, lessons, start).rank, rank);
  state = watered(state, 4);
  assert.equal(getAdventure(state, lessons, start).rank.current, 1);
  assert.equal(getAdventure(state, lessons, start).nextGoal.remaining, 1);
  state = recordGardenAction(state, {type: 'world-water', id: seed.id, actionId: 'adventure-drop-last'}, start);
  const adventure = getAdventure(state, lessons, start);
  assert.equal(adventure.stats.bloomCount, 1);
  assert.equal(adventure.stats.plantCount, 1);
  assert.equal(adventure.rank.current, 2);
  assert.equal(adventure.rank.progress, 2 / 3);
});

test('rank has stable bounded interval progress and never decays after missed days', () => {
  const state = introduce(3), day = addDays(start, 2);
  const adventure = getAdventure(state, lessons, day);
  assert.equal(adventure.rank.level, 2);
  assert.equal(adventure.rank.current, 3);
  assert.equal(adventure.rank.target, 10);
  assert.equal(adventure.rank.progress, 0);
  assert.deepEqual(getAdventure(state, lessons, addDays(start, 100)).rank, adventure.rank);
  // Repeating the same introduction in an older history never doubles earned progress.
  const duplicate = JSON.parse(JSON.stringify(state));
  duplicate.days[addDays(start, 3)] = JSON.parse(JSON.stringify(duplicate.days[start]));
  assert.deepEqual(getAdventure(duplicate, lessons, addDays(start, 3)).rank, adventure.rank);
});

test('old mature plants count once before and after collection and retain their shorter goal', () => {
  let state = introduce(3), day = addDays(start, 2);
  state.garden = {version: 1, actions: [
    {date: start, type: 'plant', plot: 0, kind: 'bluebell'},
    {date: start, type: 'water', plot: 0},
    {date: addDays(start, 1), type: 'water', plot: 0},
  ]};
  const growing = getAdventure(state, lessons, day);
  assert.equal(growing.nextGoal.target, 3);
  assert.equal(growing.nextGoal.remaining, 1);
  state = recordGardenAction(state, {type: 'water', plot: 0}, day);
  const before = getAdventure(state, lessons, day);
  assert.equal(before.stats.bloomCount, 1);
  assert.equal(before.rank.current, 4);
  state = recordGardenAction(state, {type: 'harvest', plot: 0}, day);
  const after = getAdventure(state, lessons, day);
  assert.equal(after.stats.bloomCount, 1);
  assert.equal(after.stats.plantCount, 0);
  assert.deepEqual(after.rank, before.rank);
});

test('a legacy state without a garden stays unchanged and offers earned seed planting', () => {
  const state = introduce(1);
  delete state.garden;
  delete state.checkups;
  const before = JSON.stringify(state);
  const adventure = getAdventure(state, lessons, start);
  assert.equal(adventure.nextGoal.kind, 'plant');
  assert.equal(adventure.stats.seeds, 1);
  assert.equal(JSON.stringify(state), before);
});

test('a thirsty seedling suggests repeat practice without inventing water or promising a seed', () => {
  const state = watered(recordGardenAction(introduce(1), seed, start), 2);
  const before = getGarden(state, start).inventory;
  const adventure = getAdventure(state, lessons, start);
  assert.equal(adventure.nextGoal.kind, 'bloom');
  assert.equal(adventure.nextGoal.remaining, 3);
  assert.equal(adventure.nextGoal.hint, '跟读一句，带回 2 壶水');
  assert.equal(adventure.stats.water, 0);
  assert.deepEqual(getGarden(state, start).inventory, before);
});

test('large gardens produce a small serializable view, not thousands of UI quest entries', () => {
  const state = createState(start);
  const catalog = Array.from({length: WORLD_CAPACITY}, (_, index) => ({id: `historic-${index}`}));
  // A large-catalog historical fixture funds the garden without fabricating inventory.
  for (let index = 0; index < catalog.length; index++) {
    const id = catalog[index].id, date = addDays(start, index);
    state.cards[id] = {stage: 0, due: addDays(date, 1), lastReviewed: date, attempts: 1, lapses: 0};
    state.days[date] = {newId: id, newDone: true, reviewed: [], results: [{lessonId: id, rating: 'good', isNew: true}]};
  }
  const day = addDays(start, catalog.length);
  state.garden.actions = catalog.map((_, index) => ({date: day, type: 'world-plant',
    id: `large-garden-${index}`, kind: 'sunflower', x: (index % 40) * 240 + 200, y: Math.floor(index / 40) * 240 + 200}));
  const adventure = getAdventure(state, catalog, day);
  assert.equal(adventure.stats.plantCount, 1600);
  assert.equal(adventure.stats.bloomCount, 0);
  assert.equal(adventure.rank.level, 8);
  assert.equal(adventure.rank.target, null);
  assert.equal(adventure.rank.progress, 1);
  assert.equal(adventure.nextGoal.kind, 'bloom');
  assert.ok(JSON.stringify(adventure).length < 2000);
  assert.deepEqual(JSON.parse(JSON.stringify(adventure)), adventure);
});

test('frozen callers and repeated reads remain independent and never persist game state', () => {
  const state = freezeDeep(introduce(3)), catalog = freezeDeep(JSON.parse(JSON.stringify(lessons)));
  const before = JSON.stringify(state), day = addDays(start, 5);
  const baseline = getAdventure(state, catalog, day);
  const edited = getAdventure(state, catalog, day);
  edited.rank.level = 999;
  edited.stats.water = 999;
  edited.quest.kind = 'invented';
  edited.nextGoal.remaining = 999;
  assert.deepEqual(getAdventure(state, catalog, day), baseline);
  assert.equal(JSON.stringify(state), before);
});
