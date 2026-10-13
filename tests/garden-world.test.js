import test from 'node:test';
import assert from 'node:assert/strict';
import {createGarden, getGarden, recordGardenAction, recordGardenPractice, validateGarden,
  WORLD_CAPACITY, WORLD_GROWTH_GOAL, practiceReward} from '../src/garden.js';
import {createState, recordResult, validateImport} from '../src/learning.js';

const today = '2026-10-13';
function learned(count = 1) {
  const results = Array.from({length: count}, (_, index) => ({lessonId: `lesson-${index}`, rating: 'good', isNew: true}));
  return {version: 1, startedAt: today, settings: {nickname: '小芽', dailyReviews: 5},
    cards: Object.fromEntries(results.map(result => [result.lessonId, {stage: 0, due: '2026-10-14', lastReviewed: today, attempts: 1, lapses: 0}])),
    days: {[today]: {newId: results[0]?.lessonId ?? null, newDone: count > 0, reviewed: [], results}},
    checkups: {}, garden: createGarden()};
}
function plant(index, x = 1000, y = 1000) {
  return {type: 'world-plant', id: `flower-${String(index).padStart(5, '0')}`, kind: 'sunflower', x, y};
}
function water(index, actionId) {
  return {type: 'world-water', id: `flower-${String(index).padStart(5, '0')}`, actionId};
}

test('world plant keeps its arbitrary position and matures in five separate water drops', () => {
  let state = learned(3);
  const before = structuredClone(state);
  state = recordGardenAction(state, plant(1, 7345, 8123), today);
  for (let round = 0; round < 2; round++) state = recordGardenPractice(state,
    {lessonId: 'lesson-0', attemptId: `world-round-${round}`, assessment: 'local-speech'}, today);
  for (let step = 1; step <= 5; step++) {
    state = recordGardenAction(state, water(1, `water-round-${step}`), today);
    const flower = getGarden(state, today).worldPlants[0];
    assert.equal(flower.growth, step);
    assert.equal(flower.growthGoal, WORLD_GROWTH_GOAL);
    assert.equal(flower.x, 7345);
    assert.equal(flower.y, 8123);
    assert.equal(flower.canWater, step < 5);
  }
  const mature = getGarden(state, today);
  assert.equal(mature.worldPlants.length, 1);
  assert.equal(mature.collection.find(item => item.kind === 'sunflower').count, 1);
  assert.throws(() => recordGardenAction(state, water(1, 'water-round-6'), today), /已经成熟/);
  assert.deepEqual(learned(3), before);
  assert.equal(getGarden(state, '2027-10-13').worldPlants[0].growth, 5);
});

test('one thousand flowers fit in a single persistent garden without replacing each other', () => {
  const state = learned(1000);
  state.garden.actions = Array.from({length: 1000}, (_, index) => ({date: today,
    ...plant(index, (index % 40) * 240 + 200, Math.floor(index / 40) * 240 + 200)}));
  const clean = validateGarden(state.garden, state);
  state.garden = JSON.parse(JSON.stringify(clean));
  const garden = getGarden(state, today);
  assert.equal(garden.worldPlants.length, 1000);
  assert.equal(new Set(garden.worldPlants.map(item => item.id)).size, 1000);
  assert.equal(garden.worldCapacity, WORLD_CAPACITY);
  assert.ok(WORLD_CAPACITY >= 1600);
  assert.equal(garden.earned.newLessons, 1000);
  assert.equal(garden.inventory.seeds, 12);
  assert.deepEqual(getGarden(state, today).worldPlants, garden.worldPlants);
});

test('world replay bounds coordinates, spacing, kinds, IDs and capacity', () => {
  const state = learned(1601);
  for (const change of [{x: -1}, {y: 10000}, {x: 1.5}, {kind: 'invented'}, {id: '__proto__'}, {id: 'short'}, {extra: true}]) {
    assert.throws(() => recordGardenAction(state, {...plant(1), ...change}, today), /不正确/);
  }
  let planted = recordGardenAction(state, plant(1), today);
  assert.throws(() => recordGardenAction(planted, plant(2), today), /已有小苗/);
  assert.throws(() => recordGardenAction(planted, plant(2, 1119, 1000), today), /已有小苗/);
  planted = recordGardenAction(planted, plant(2, 1120, 1000), today);
  assert.equal(getGarden(planted, today).worldPlants.length, 2);
  const actions = Array.from({length: WORLD_CAPACITY + 1}, (_, index) => ({date: today,
    ...plant(index, (index % 50) * 190 + 100, Math.floor(index / 50) * 190 + 100)}));
  assert.throws(() => validateGarden({...createGarden(), actions}, state), /已种满/);
});

test('world planting and water drops are idempotent live; conflicting or duplicate imported operations fail', () => {
  const original = learned();
  const planted = recordGardenAction(original, plant(1), today);
  assert.deepEqual(recordGardenAction(planted, plant(1), today), planted);
  assert.throws(() => recordGardenAction(planted, plant(1, 2000), today), /已有不同结果/);
  const watered = recordGardenAction(planted, water(1, 'drop-first-1'), today);
  assert.deepEqual(recordGardenAction(watered, water(1, 'drop-first-1'), today), watered);
  assert.throws(() => recordGardenAction(watered, {...water(1, 'drop-first-1'), id: 'flower-00002'}, today), /已有不同结果/);
  for (const index of [0, 1]) {
    const actions = [...watered.garden.actions, watered.garden.actions[index]];
    assert.throws(() => validateGarden({...watered.garden, actions}, watered), /重复/);
  }
});

test('resources cannot be fabricated or spent before the practice that earns them', () => {
  let state = learned();
  state = recordGardenAction(state, plant(1), today);
  state = recordGardenAction(state, water(1, 'water-once-1'), today);
  state = recordGardenAction(state, water(1, 'water-twice-2'), today);
  assert.throws(() => recordGardenAction(state, water(1, 'water-third-3'), today), /资源不足/);
  const rewarded = recordGardenPractice(state, {lessonId: 'lesson-0', attemptId: 'practice-later-1', assessment: 'local-speech'}, '2026-10-14');
  assert.equal(getGarden(rewarded, today).inventory.water, 0);
  const invalid = structuredClone(rewarded.garden);
  invalid.actions.splice(3, 0, {date: today, ...water(1, 'water-third-3')});
  assert.throws(() => validateGarden(invalid, rewarded), /资源不足/);
  assert.throws(() => validateGarden({...rewarded.garden, inventory: {seeds: 999}}, rewarded), /字段/);
  assert.throws(() => recordGardenAction(rewarded, plant(2, 2000), today), /早于已有记录/);
});

test('v2 practice reward prefix and old growth survive world migration and later random rounds', () => {
  let state = learned();
  state.garden = {version: 2, legacyCount: 0, actions: [
    {date: today, type: 'plant', plot: 0, kind: 'bluebell'},
    ...Array.from({length: 3}, (_, index) => ({date: today, type: 'practice', lessonId: 'lesson-0',
      attemptId: `classic-round-${index}`, assessment: 'local-speech'})),
    {date: today, type: 'water', plot: 0},
  ]};
  const baseline = getGarden(state, today);
  assert.equal(baseline.inventory.seeds, 1);
  state = recordGardenAction(state, plant(1), today);
  assert.equal(state.garden.classicCount, 5);
  assert.equal(state.garden.legacyCount, 0);
  const legacy = getGarden(state, today).worldPlants.find(item => item.sourcePlot === 0);
  assert.equal(legacy.id, 'legacy-plot-0');
  assert.equal(legacy.growthGoal, 12);
  state = recordGardenAction(state, {type: 'world-water', id: legacy.id, actionId: 'old-plot-water-1'}, today);
  assert.equal(getGarden(state, today).plots[0].growth, 2);
  const before = getGarden(state, today);
  state = recordGardenPractice(state, {lessonId: 'lesson-0', attemptId: 'new-round-0001', assessment: 'practice-effort'}, today);
  const after = getGarden(state, today);
  assert.equal(after.inventory.water - before.inventory.water, 2);
  assert.equal(after.inventory.seeds - before.inventory.seeds, practiceReward('new-round-0001').seeds);
  assert.equal(after.earned.practicePasses, 3);
  assert.equal(after.earned.practiceRounds, 4);
});

test('new world plants and round identities survive full progress export/import', () => {
  let state = recordResult(createState(today), 'hello-01', 'good', today, {isNew: true});
  state = recordGardenAction(state, plant(1, 2345, 8765), today);
  state = recordGardenAction(state, water(1, 'backup-water-1'), today);
  const restored = validateImport(JSON.stringify(state), ['hello-01']);
  assert.deepEqual(restored, state);
  assert.deepEqual(getGarden(restored, today).worldPlants, getGarden(state, today).worldPlants);
});

test('new seed surprises and visual variants are repeatable rather than rerolled by reload', () => {
  const state = recordGardenAction(learned(), plant(1), today);
  const first = getGarden(state, today).worldPlants[0].variant;
  assert.ok(first >= 0 && first < 6);
  for (let repeat = 0; repeat < 10; repeat++) {
    assert.equal(getGarden(JSON.parse(JSON.stringify(state)), today).worldPlants[0].variant, first);
    assert.deepEqual(practiceReward('child-round-1234'), practiceReward('child-round-1234'));
  }
});
