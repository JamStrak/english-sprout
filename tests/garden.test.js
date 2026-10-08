import test from 'node:test';
import assert from 'node:assert/strict';
import { PLANTS, MAX_GARDEN_ACTIONS, createGarden, getGarden, recordGardenAction, validateGarden } from '../src/garden.js';

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
  assert.deepEqual(createGarden(), { version: 1, actions: [] });
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

test('plant-water-grow-harvest cycle consumes resources and adds the actual kind to collection', () => {
  let state = history(3);
  const before = structuredClone(state);
  state = action(state, 'plant', 1, first, 'strawberry');
  state = action(state, 'water', 1, first);
  state = action(state, 'water', 1, date(2));
  state = action(state, 'water', 1, date(3));
  assert.equal(getGarden(state, date(3)).plots[1].growth, 3);
  assert.equal(getGarden(state, date(3)).plots[1].canHarvest, true);
  assert.throws(() => action(state, 'water', 1, date(3)), /已经成熟/);
  state = action(state, 'harvest', 1, date(3));
  assert.equal(getGarden(state, date(3)).plots[1], null);
  assert.deepEqual(getGarden(state, date(3)).collection.find(item => item.kind === 'strawberry'), { kind: 'strawberry', count: 1 });
  assert.deepEqual(getGarden(state, date(3)).inventory, { seeds: 2, water: 3, fertilizer: 0 });
  assert.deepEqual(before, history(3));
});

test('watering and fertilizing each work once per plot/day, including after harvest and replant', () => {
  let state = history(6);
  state = action(state, 'plant', 0, date(5));
  state = action(state, 'water', 0, date(5));
  state = action(state, 'fertilize', 0, date(5));
  assert.equal(getGarden(state, date(5)).plots[0].growth, 2);
  assert.throws(() => action(state, 'water', 0, date(5)), /今天已经浇/);
  state = action(state, 'water', 0, date(6));
  state = action(state, 'harvest', 0, date(6));
  state = action(state, 'plant', 0, date(6));
  assert.equal(getGarden(state, date(6)).plots[0].canWater, false);
  assert.throws(() => action(state, 'water', 0, date(6)), /今天已经浇/);
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
  assert.throws(() => validateGarden({ version: 2, actions: [] }, state), /版本/);
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
