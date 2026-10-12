import test from 'node:test';
import assert from 'node:assert/strict';
import { PLANTS, GROWTH_GOAL, MAX_GARDEN_ACTIONS, createGarden, getGarden, recordGardenAction, recordGardenPractice, validateGarden } from '../src/garden.js';
import { createState, recordResult, validateImport } from '../src/learning.js';

const first = '2026-10-01';
const date = (number) => `2026-10-${String(number).padStart(2, '0')}`;
function history(count = 1) {
  const state = { version: 1, startedAt: first, settings: { nickname: '小芽', dailyReviews: 5 }, cards: {}, days: {}, checkups: {} };
  for (let day = 1; day <= count; day++) {
    const id = `lesson-${day}`;
    state.days[date(day)] = { newId: id, newDone: true, reviewed: [], results: [{ lessonId: id, rating: 'again', isNew: true }] };
  }
  return state;
}
function action(state, type, plot = 0, today = first, kind = 'sunflower') {
  return recordGardenAction(state, { type, plot, ...(type === 'plant' ? { kind } : {}) }, today);
}

test('old state starts with three empty plots and four collectable plant kinds', () => {
  const state = history(0);
  assert.deepEqual(createGarden(), { version: 2, legacyCount: 0, actions: [] });
  assert.deepEqual(getGarden(state, first).inventory, { seeds: 0, water: 0, fertilizer: 0 });
  assert.deepEqual(getGarden(state, first).plots, [null, null, null]);
  assert.equal(getGarden(state, first).collection.length, 4);
  assert.deepEqual(PLANTS.map(item => item.id), ['sunflower', 'tulip', 'strawberry', 'bluebell']);
  assert.equal(Object.hasOwn(state, 'garden'), false);
});

test('daily rewards are independent of rating and repeated reads never mint resources', () => {
  for (const rating of ['again', 'help', 'good']) {
    const state = history();
    state.days[first].results[0].rating = rating;
    const before = structuredClone(state);
    for (let i = 0; i < 10; i++) assert.deepEqual(getGarden(state, first).inventory, { seeds: 1, water: 2, fertilizer: 0 });
    assert.deepEqual(state, before);
  }
});

test('one ordinary review gives one extra water; more review items do not multiply daily rewards', () => {
  const state = history();
  state.days[date(2)] = { newId: null, newDone: false, reviewed: ['lesson-1', 'other'], results: [
    { lessonId: 'lesson-1', rating: 'help', isNew: false }, { lessonId: 'other', rating: 'again', isNew: false },
  ] };
  assert.deepEqual(getGarden(state, date(2)).inventory, { seeds: 1, water: 5, fertilizer: 0 });
  assert.equal(getGarden(state, date(2)).earned.reviewDays, 1);
});

test('completed checkup rewards do not depend on correctness and count as real daily practice', () => {
  const state = history();
  state.checkups[date(8)] = [{ lessonId: 'lesson-1', meaning: false, spoken: 'again' }];
  assert.deepEqual(getGarden(state, date(8)).inventory, { seeds: 2, water: 4, fertilizer: 1 });
  assert.equal(getGarden(state, date(8)).earned.checkups, 1);
  state.days[date(8)] = { newId: null, newDone: false, reviewed: ['lesson-1'], results: [{ lessonId: 'lesson-1', rating: 'help', isNew: false }] };
  assert.deepEqual(getGarden(state, date(8)).inventory, { seeds: 2, water: 5, fertilizer: 1 });
});

test('milestones are granted once on the first day of five and ten unique introductions', () => {
  const state = history(10);
  const before = getGarden(state, date(4));
  assert.equal(before.earned.seeds, 4);
  assert.deepEqual(before.nextMilestone, { count: 5, remaining: 1, seeds: 2, fertilizer: 1 });
  const five = getGarden(state, date(5));
  assert.deepEqual(five.inventory, { seeds: 7, water: 10, fertilizer: 1 });
  assert.deepEqual(five.earned.milestones, [{ count: 5, date: date(5) }]);
  const ten = getGarden(state, date(10));
  assert.deepEqual(ten.inventory, { seeds: 14, water: 20, fertilizer: 2 });
  assert.deepEqual(ten.earned.milestones, [{ count: 5, date: date(5) }, { count: 10, date: date(10) }]);
  assert.equal(getGarden(state, date(30)).earned.seeds, 14);
});

test('newDone with no real result and duplicate introduction IDs cannot create extra seeds', () => {
  const state = history();
  state.days[date(2)] = structuredClone(state.days[first]);
  state.days[date(3)] = { newId: 'invented', newDone: true, reviewed: [], results: [] };
  assert.equal(getGarden(state, date(3)).earned.newLessons, 1);
  assert.equal(getGarden(state, date(3)).inventory.seeds, 1);
});

test('all six cumulative milestones grant exactly one bonus and the final target ends at 120', () => {
  const state = history(0);
  for (let day = 1; day <= 120; day++) {
    const dayKey = new Date(Date.UTC(2026, 9, day)).toISOString().slice(0, 10);
    const id = `lesson-${day}`;
    state.days[dayKey] = { newId: id, newDone: true, reviewed: [], results: [{ lessonId: id, rating: 'help', isNew: true }] };
  }
  const result = getGarden(state, '2027-02-01');
  assert.equal(result.earned.newLessons, 120);
  assert.deepEqual(result.earned.milestones.map(item => item.count), [5, 10, 20, 40, 80, 120]);
  assert.deepEqual(result.inventory, { seeds: 132, water: 240, fertilizer: 6 });
  assert.equal(result.nextMilestone, null);
  assert.deepEqual(getGarden(state, '2027-12-01').inventory, result.inventory);
});

test('new plants grow through twelve care steps and collect their actual kind without daily water limits', () => {
  let state = history(6);
  const before = structuredClone(state);
  state = action(state, 'plant', 1, date(6), 'strawberry');
  for (let step = 1; step <= GROWTH_GOAL; step++) {
    assert.equal(getGarden(state, date(6)).plots[1].canWater, true);
    state = action(state, 'water', 1, date(6));
    const plot = getGarden(state, date(6)).plots[1];
    assert.equal(plot.growth, step);
    assert.equal(plot.growthGoal, 12);
    assert.equal(plot.canHarvest, step === 12);
  }
  assert.throws(() => action(state, 'water', 1, date(6)), /已经成熟/);
  state = action(state, 'harvest', 1, date(6));
  assert.equal(getGarden(state, date(6)).plots[1], null);
  assert.deepEqual(getGarden(state, date(6)).collection.find(item => item.kind === 'strawberry'), { kind: 'strawberry', count: 1 });
  assert.deepEqual(getGarden(state, date(6)).inventory, { seeds: 7, water: 0, fertilizer: 1 });
  assert.deepEqual(before, history(6));
});

test('legacy mature plants and harvests survive migration; replanted flowers use the new twelve-step goal', () => {
  const original = history(6);
  original.garden = { version: 1, actions: [
    { date: date(3), type: 'plant', plot: 0, kind: 'sunflower' },
    { date: date(3), type: 'water', plot: 0 },
    { date: date(4), type: 'water', plot: 0 },
    { date: date(5), type: 'water', plot: 0 },
    { date: date(5), type: 'harvest', plot: 0 },
    { date: date(5), type: 'plant', plot: 1, kind: 'tulip' },
    { date: date(5), type: 'water', plot: 1 },
    { date: date(5), type: 'fertilize', plot: 1 },
    { date: date(6), type: 'water', plot: 1 },
  ] };
  const mature = getGarden(original, date(6));
  assert.equal(mature.plots[1].canHarvest, true);
  assert.equal(mature.plots[1].growthGoal, 3);
  assert.equal(mature.collection[0].count, 1);
  let state = action(original, 'harvest', 1, date(6));
  assert.equal(state.garden.version, 2);
  assert.equal(state.garden.legacyCount, 9);
  state = action(state, 'plant', 1, date(6), 'bluebell');
  state = action(state, 'water', 1, date(6));
  state = action(state, 'water', 1, date(6));
  const current = getGarden(state, date(6));
  assert.equal(current.plots[1].growth, 2);
  assert.equal(current.plots[1].growthGoal, 12);
  assert.equal(current.plots[1].canWater, true);
  assert.equal(current.collection[0].count, 1);
  assert.equal(current.collection[1].count, 1);
  assert.equal(original.garden.version, 1);
  assert.equal(original.garden.actions.length, 9);
  assert.deepEqual(validateGarden(state.garden, state), state.garden);
});

test('resources earned on future dates cannot finance earlier actions', () => {
  const state = history(5);
  assert.throws(() => validateGarden({ version: 1, actions: [
    { date: first, type: 'plant', plot: 0, kind: 'sunflower' },
    { date: first, type: 'plant', plot: 1, kind: 'tulip' },
  ] }, state), /资源不足/);
  const planted = action(state, 'plant');
  assert.throws(() => action(planted, 'fertilize'), /资源不足/);
  assert.equal(getGarden(planted, first).inventory.seeds, 0);
});

test('empty or occupied plots, immature harvest, invalid kinds and fractional positions are rejected', () => {
  const state = history();
  assert.throws(() => action(state, 'water'), /先播种/);
  assert.throws(() => action(state, 'harvest'), /没有成熟/);
  const planted = action(state, 'plant');
  assert.throws(() => action(planted, 'plant'), /先收获/);
  assert.throws(() => action(planted, 'harvest'), /没有成熟/);
  assert.throws(() => action(state, 'plant', 0.5), /位置/);
  assert.throws(() => action(state, 'plant', 0, first, '__proto__'), /种类/);
});

test('missed practice does not wither plants, spend resources or advance growth', () => {
  const state = action(action(history(), 'plant'), 'water');
  const before = getGarden(state, first);
  const later = getGarden(state, '2027-10-01');
  assert.equal(later.plots[0].growth, 1);
  assert.deepEqual(later.inventory, before.inventory);
  assert.equal(later.plots[0].canWater, true);
});

test('calendar-ordered import is stable within a day and returns a fresh sanitized ledger', () => {
  const state = history(2);
  const raw = { version: 1, actions: [
    { date: date(2), type: 'water', plot: 0 },
    { date: first, type: 'plant', plot: 0, kind: 'bluebell' },
    { date: first, type: 'water', plot: 0 },
  ] };
  const clean = validateGarden(raw, state);
  assert.deepEqual(clean.actions.map(item => item.date), [first, first, date(2)]);
  assert.equal(raw.actions[0].date, date(2));
  assert.notEqual(clean.actions[0], raw.actions[1]);
});

test('malicious backup balances, extra fields, prototypes and oversized ledgers are rejected', () => {
  const state = history();
  assert.throws(() => validateGarden({ version: 1, actions: [], inventory: { seeds: 999 } }, state), /字段/);
  assert.throws(() => validateGarden({ version: 1, actions: [{ date: first, type: 'plant', plot: 0, kind: 'sunflower', cost: -1 }] }, state), /字段/);
  assert.throws(() => validateGarden(Object.assign(Object.create({ bypass: true }), createGarden()), state), /对象/);
  assert.throws(() => validateGarden({ version: 1, actions: new Array(MAX_GARDEN_ACTIONS + 1).fill(null) }, state), /数量/);
  assert.throws(() => validateGarden({ version: 3, actions: [] }, state), /版本/);
  assert.throws(() => validateGarden({ version: 1, actions: [{ date: first, type: 'water', plot: 0, kind: 'sunflower' }] }, state), /字段/);
});

test('impossible dates and backward live actions are rejected; historical views exclude future rewards', () => {
  assert.throws(() => getGarden(history(), '2026-02-29'), /日历日期/);
  assert.throws(() => getGarden(history(), '2026-10-1'), /日期格式/);
  let state = action(history(2), 'plant', 0, date(2));
  assert.throws(() => action(state, 'water', 0, first), /早于已有记录/);
  assert.equal(getGarden(state, first).plots[0], null);
  assert.equal(getGarden(state, first).inventory.seeds, 1);
  const before = structuredClone(state);
  state = action(state, 'water', 0, date(2));
  state.settings.nickname = '改名';
  state.days[first].results[0].rating = 'good';
  assert.equal(before.settings.nickname, '小芽');
  assert.equal(before.days[first].results[0].rating, 'again');
});

function practiceHistory() {
  const state = history();
  state.cards['lesson-1'] = { stage: 0, due: date(2), lastReviewed: first, attempts: 1, lapses: 0 };
  return state;
}
function practice(state, number, assessment = 'local-speech', today = first) {
  return recordGardenPractice(state, { lessonId: 'lesson-1', attemptId: `attempt-${number}`, assessment }, today);
}

test('repeat rounds earn water and every third round a seed without changing review, checkup or mastery records', () => {
  let state = practiceHistory();
  const baseline = structuredClone(state);
  state = action(state, 'plant');
  for (let round = 1; round <= 6; round++) {
    state = practice(state, round, round % 2 ? 'local-speech' : 'practice-effort');
    state = action(action(state, 'water'), 'water');
  }
  const garden = getGarden(state, first);
  assert.equal(garden.plots[0].growth, 12);
  assert.equal(garden.plots[0].canHarvest, true);
  assert.deepEqual(garden.inventory, { seeds: 2, water: 2, fertilizer: 0 });
  assert.equal(garden.earned.practiceRounds, 6);
  assert.equal(garden.earned.practicePasses, 3);
  assert.equal(garden.earned.practiceDays, 1);
  assert.equal(garden.earned.newLessons, 1);
  for (const key of ['cards', 'days', 'checkups', 'settings']) assert.deepEqual(state[key], baseline[key]);
  assert.deepEqual(practiceHistory(), baseline);
  for (let read = 0; read < 3; read++) assert.deepEqual(getGarden(state, first), garden);
});

test('practice persistence stores only the round identity and assessment kind, not recordings or transcripts', () => {
  const state = practice(practiceHistory(), 1, 'practice-effort');
  assert.deepEqual(state.garden.actions, [{ date: first, type: 'practice', lessonId: 'lesson-1',
    attemptId: 'attempt-1', assessment: 'practice-effort' }]);
  const imported = validateGarden(JSON.parse(JSON.stringify(state.garden)), state);
  assert.deepEqual(imported, state.garden);
  const before = structuredClone(state);
  const duplicated = practice(state, 1, 'practice-effort');
  assert.deepEqual(duplicated, state);
  assert.notEqual(duplicated, state);
  duplicated.cards['lesson-1'].attempts += 10;
  assert.deepEqual(state, before);
  assert.throws(() => practice(state, 1, 'local-speech'), /已有不同结果/);
  assert.throws(() => validateGarden({ ...state.garden, actions: [...state.garden.actions, ...state.garden.actions] }, state), /轮次重复/);
});

test('follow-up practice rewards can only use an already learned lesson and never finance earlier spending', () => {
  const state = practiceHistory();
  const future = structuredClone(state);
  future.days[date(2)] = { newId: 'lesson-2', newDone: true, reviewed: [], results: [{ lessonId: 'lesson-2', rating: 'good', isNew: true }] };
  future.cards['lesson-2'] = { stage: 0, due: date(3), lastReviewed: date(2), attempts: 1, lapses: 0 };
  assert.throws(() => recordGardenPractice(future, { lessonId: 'lesson-2', attemptId: 'attempt-2', assessment: 'local-speech' }, first), /已经学过/);
  assert.throws(() => recordGardenPractice(state, { lessonId: 'missing', attemptId: 'attempt-2', assessment: 'practice-effort' }, first), /已经学过/);
  const cardOnly = history(0);
  cardOnly.cards['lesson-1'] = state.cards['lesson-1'];
  assert.throws(() => practice(cardOnly, 1), /已经学过/);
  const introductionOnly = history();
  assert.throws(() => practice(introductionOnly, 1), /已经学过/);
  let spent = action(action(action(state, 'plant'), 'water'), 'water');
  assert.throws(() => action(spent, 'water'), /资源不足/);
  spent = practice(spent, 1);
  spent = action(spent, 'water');
  assert.equal(getGarden(spent, first).plots[0].growth, 3);
  const reordered = structuredClone(spent.garden);
  const [reward] = reordered.actions.splice(3, 1);
  reordered.actions.push(reward);
  assert.throws(() => validateGarden(reordered, spent), /资源不足/);
  const tomorrow = practice(state, 2, 'local-speech', date(2));
  assert.equal(getGarden(tomorrow, first).earned.practiceRounds, 0);
  assert.equal(getGarden(tomorrow, first).inventory.water, 2);
  assert.equal(getGarden(tomorrow, date(2)).earned.practiceRounds, 1);
});

test('unsupported assessment claims and fabricated practice metadata cannot enter a backup', () => {
  const state = practiceHistory();
  const round = { lessonId: 'lesson-1', attemptId: 'attempt-1', assessment: 'local-speech' };
  for (const extra of [{ score: 100 }, { rating: 'good' }, { audio: 'data:audio/webm;base64,xxx' }, { transcript: 'hello' }, { type: 'water' }]) {
    assert.throws(() => recordGardenPractice(state, { ...round, ...extra }, first), /字段/);
  }
  for (const assessment of ['parent', 'perfect-pronunciation', '', null]) assert.throws(() => recordGardenPractice(state, { ...round, assessment }, first), /评价方式/);
  for (const attemptId of ['', 'short', '__proto__', 'wrong id', 'a'.repeat(101)]) {
    assert.throws(() => recordGardenPractice(state, { ...round, attemptId }, first), /轮次编号/);
  }
  for (const lessonId of ['__proto__', 'constructor', 'prototype', 'bad\n']) assert.throws(() => recordGardenPractice(state, { ...round, lessonId }, first), /课程编号/);
  assert.throws(() => validateGarden({ version: 1, actions: [{ date: first, type: 'practice', ...round }] }, state), /旧版/);
});

test('old immature plants finish their original goal, then new plants use twelve steps', () => {
  const state = practiceHistory();
  state.garden = { version: 1, actions: [
    { date: first, type: 'plant', plot: 0, kind: 'sunflower' },
    { date: first, type: 'water', plot: 0 },
  ] };
  let next = practice(state, 1);
  next = action(action(next, 'water'), 'water');
  assert.equal(getGarden(next, first).plots[0].growthGoal, 3);
  assert.equal(getGarden(next, first).plots[0].canHarvest, true);
  assert.equal(next.garden.legacyCount, 2);
  assert.equal(getGarden(state, first).plots[0].growth, 1);
});

test('legacy bounds and ordering cannot turn old invalid spending into valid migrated history', () => {
  const state = history(5);
  for (const legacyCount of [-1, 1, 0.5, '0', null]) assert.throws(() => validateGarden({ version: 2, legacyCount, actions: [] }, state), /旧版操作范围/);
  assert.throws(() => validateGarden({ version: 2, actions: [] }, state), /字段/);
  const repeated = [
    { date: first, type: 'plant', plot: 0, kind: 'sunflower' },
    { date: first, type: 'water', plot: 0 },
    { date: first, type: 'water', plot: 0 },
  ];
  assert.throws(() => validateGarden({ version: 2, legacyCount: 3, actions: repeated }, state), /今天已经浇/);
  assert.equal(validateGarden({ version: 2, legacyCount: 2, actions: repeated }, state).actions.length, 3);
  assert.throws(() => validateGarden({ version: 2, legacyCount: 1, actions: [
    { date: date(2), type: 'plant', plot: 0, kind: 'sunflower' },
    { date: first, type: 'water', plot: 0 },
  ] }, state), /早于旧版/);
});

test('ordinary learning and full backup import preserve migrated plants and repeated-practice rewards', () => {
  let state = recordResult(createState(first), 'lesson-1', 'good', first, { isNew: true });
  state.garden = { version: 1, actions: [
    { date: first, type: 'plant', plot: 0, kind: 'sunflower' },
    { date: first, type: 'water', plot: 0 },
  ] };
  state = practice(state, 1);
  const garden = structuredClone(state.garden);
  state = recordResult(state, 'lesson-1', 'good', date(2));
  state = recordResult(state, 'lesson-2', 'good', date(2), { isNew: true });
  assert.deepEqual(state.garden, garden);
  const imported = validateImport(JSON.stringify(state), ['lesson-1', 'lesson-2']);
  assert.deepEqual(imported, state);
  assert.equal(getGarden(imported, date(2)).plots[0].growthGoal, 3);
  assert.equal(getGarden(imported, date(2)).earned.practiceRounds, 1);
  assert.notEqual(imported.garden, state.garden);
});
