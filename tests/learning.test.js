import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createState, dayKey, addDays, getDailyPlan, recordResult, getStats, validateImport, REVIEW_INTERVALS } from '../src/learning.js';

const lessons = Array.from({ length: 20 }, (_, index) => ({ id: `lesson-${index + 1}` }));
const first = 'lesson-1';
const second = 'lesson-2';
const initialDay = '2026-10-08';
const clone = (value) => JSON.parse(JSON.stringify(value));
const learned = () => recordResult(createState(initialDay), first, 'good', initialDay, { isNew: true });

test('dayKey uses local calendar components, including midnight and late evening', () => {
  assert.equal(dayKey(new Date(2026, 9, 8, 0, 1)), initialDay);
  assert.equal(dayKey(new Date(2026, 9, 8, 23, 59)), initialDay);
  assert.equal(dayKey('2026-10-08'), initialDay);
  assert.throws(() => dayKey(new Date('invalid')));
});

test('calendar arithmetic handles leap years, month/year boundaries and negative offsets', () => {
  assert.equal(addDays('2028-02-28', 1), '2028-02-29');
  assert.equal(addDays('2028-02-28', 2), '2028-03-01');
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(addDays('2026-03-01', -1), '2026-02-28');
  assert.equal(addDays('2026-03-08', 1), '2026-03-09');
  assert.throws(() => addDays('2026-02-29', 1));
  assert.throws(() => addDays('2026-01-01', 0.5));
  assert.throws(() => addDays('2026-01-01', Infinity));
});

test('the same instant follows Asia/Shanghai and Los Angeles local dates independently', () => {
  const moduleUrl = new URL('../src/learning.js', import.meta.url).href;
  for (const [zone, expected] of [['Asia/Shanghai', '2026-10-08'], ['America/Los_Angeles', '2026-10-07']]) {
    const processResult = spawnSync(process.execPath, ['--input-type=module', '-e', `import { dayKey, addDays } from ${JSON.stringify(moduleUrl)}; console.log(dayKey(new Date('2026-10-07T16:01:00Z'))); console.log(addDays('2026-03-08', 1));`], {
      encoding: 'utf8', env: { ...process.env, TZ: zone },
    });
    assert.equal(processResult.status, 0, processResult.stderr);
    assert.equal(processResult.stdout.trim(), `${expected}\n2026-03-09`);
  }
});

test('new state offers one first lesson and has no pretend practice', () => {
  const state = createState(initialDay);
  assert.deepEqual(getDailyPlan(state, lessons, initialDay), { newLessonId: first, dueIds: [], extraDueCount: 0, newDone: false, reviewDone: 0, totalDone: 0 });
  assert.equal(getStats(state, lessons, initialDay).practicedDays, 0);
});

test('first exposure is complete for every rating and always due tomorrow', () => {
  for (const rating of ['again', 'help', 'good']) {
    const before = createState(initialDay);
    const state = recordResult(before, first, rating, initialDay, { isNew: true });
    assert.equal(Object.keys(before.cards).length, 0);
    assert.deepEqual(state.cards[first], { stage: 0, due: '2026-10-09', lastReviewed: initialDay, attempts: 1, lapses: 0 });
    assert.equal(getDailyPlan(state, lessons, initialDay).newDone, true);
    assert.equal(getDailyPlan(state, lessons, initialDay).newLessonId, first);
    assert.deepEqual(getDailyPlan(state, lessons, initialDay).dueIds, []);
  }
});

test('success interval series is 1,3,7,14,30,60,90 then stays at 90', () => {
  let state = learned();
  assert.deepEqual(REVIEW_INTERVALS, [1, 3, 7, 14, 30, 60, 90]);
  for (const interval of [3, 7, 14, 30, 60, 90, 90]) {
    const date = state.cards[first].due;
    state = recordResult(state, first, 'good', date);
    assert.equal(state.cards[first].due, addDays(date, interval));
  }
  assert.equal(state.cards[first].stage, 6);
  assert.equal(state.cards[first].attempts, 8);
});

test('help drops one stage and schedules tomorrow without a lapse', () => {
  let state = learned();
  state = recordResult(state, first, 'good', '2026-10-09');
  state = recordResult(state, first, 'good', '2026-10-12');
  state = recordResult(state, first, 'help', '2026-10-19');
  assert.equal(state.cards[first].stage, 1);
  assert.equal(state.cards[first].due, '2026-10-20');
  assert.equal(state.cards[first].lapses, 0);
});

test('again resets stage and schedules tomorrow; later successful review begins at three days', () => {
  let state = learned();
  state = recordResult(state, first, 'good', '2026-10-09');
  state = recordResult(state, first, 'again', '2026-10-12');
  assert.equal(state.cards[first].stage, 0);
  assert.equal(state.cards[first].lapses, 1);
  assert.equal(state.cards[first].due, '2026-10-13');
  state = recordResult(state, first, 'good', '2026-10-13');
  assert.equal(state.cards[first].due, '2026-10-16');
});

test('same-day repeats cannot change final rating, count or stage', () => {
  let state = learned();
  state = recordResult(state, first, 'again', '2026-10-09');
  const secondClick = recordResult(state, first, 'good', '2026-10-09');
  assert.deepEqual(secondClick, state);
  assert.notEqual(secondClick, state);
  assert.equal(getDailyPlan(secondClick, lessons, '2026-10-09').reviewDone, 1);
  const newRepeat = recordResult(learned(), first, 'again', initialDay, { isNew: true });
  assert.equal(newRepeat.cards[first].attempts, 1);
});

test('missed days neither skip new lesson content nor add a punitive backlog of new lessons', () => {
  const state = learned();
  const plan = getDailyPlan(state, lessons, '2026-11-20');
  assert.equal(plan.newLessonId, second);
  assert.deepEqual(plan.dueIds, [first]);
  const reviewed = recordResult(state, first, 'good', '2026-11-20');
  assert.equal(reviewed.cards[first].due, '2026-11-23');
});

test('only one new lesson a day can be recorded', () => {
  assert.throws(() => recordResult(learned(), second, 'good', initialDay, { isNew: true }), /今天的新句/);
  const state = recordResult(learned(), second, 'good', '2026-10-09', { isNew: true });
  assert.equal(getDailyPlan(state, lessons, '2026-10-09').newLessonId, second);
  assert.equal(getDailyPlan(state, lessons, '2026-10-10').newLessonId, 'lesson-3');
});

function backlog() {
  let state = createState(initialDay);
  for (let index = 0; index < 8; index += 1) {
    state = recordResult(state, lessons[index].id, 'good', addDays(initialDay, index), { isNew: true });
  }
  return state;
}

test('daily review order and five-item cap survive sequential completions and reload', () => {
  let state = backlog();
  const date = '2026-11-01';
  assert.deepEqual(getDailyPlan(state, lessons, date).dueIds, lessons.slice(0, 5).map((x) => x.id));
  assert.equal(getDailyPlan(state, lessons, date).extraDueCount, 3);
  for (let index = 0; index < 5; index += 1) {
    state = recordResult(state, lessons[index].id, 'good', date);
    state = validateImport(JSON.stringify(state), lessons);
    assert.deepEqual(getDailyPlan(state, lessons, date).dueIds, lessons.slice(index + 1, 5).map((x) => x.id));
    assert.equal(getDailyPlan(state, lessons, date).extraDueCount, 3);
  }
  assert.equal(getDailyPlan(state, lessons, date).reviewDone, 5);
  assert.throws(() => recordResult(state, lessons[5].id, 'good', date), /复习已完成/);
  assert.deepEqual(getDailyPlan(state, lessons, addDays(date, 1)).dueIds, lessons.slice(5, 8).map((x) => x.id));
});

test('review settings can reduce or increase the remaining daily budget without recounting', () => {
  let state = backlog();
  state = recordResult(state, first, 'good', '2026-11-01');
  state.settings.dailyReviews = 2;
  assert.equal(getDailyPlan(state, lessons, '2026-11-01').dueIds.length, 1);
  state.settings.dailyReviews = 1;
  assert.equal(getDailyPlan(state, lessons, '2026-11-01').dueIds.length, 0);
  state.settings.dailyReviews = 8;
  assert.equal(getDailyPlan(state, lessons, '2026-11-01').dueIds.length, 7);
});

test('preview/query functions never mutate state or schedule a new card', () => {
  const state = learned();
  const before = clone(state);
  for (let i = 0; i < 10; i += 1) {
    getDailyPlan(state, lessons, '2026-10-09');
    getStats(state, lessons, '2026-10-09');
  }
  assert.deepEqual(state, before);
});

test('statistics show actual practice dates, learned exposure and familiarity, not mastery', () => {
  let state = learned();
  state = recordResult(state, first, 'good', '2026-10-09');
  state = recordResult(state, second, 'help', '2026-10-09', { isNew: true });
  const stats = getStats(state, lessons, '2026-10-10');
  assert.equal(stats.learnedCount, 2);
  assert.equal(stats.practicedDays, 2);
  assert.equal(stats.totalPracticeCount, 3);
  assert.equal(stats.familiarCount, 0);
  assert.equal(stats.dueCount, 1);
  assert.deepEqual(stats.last7Days.slice(-3), [
    { date: '2026-10-08', practiced: true, totalDone: 1 },
    { date: '2026-10-09', practiced: true, totalDone: 2 },
    { date: '2026-10-10', practiced: false, totalDone: 0 },
  ]);
});

test('end of catalog remains reviewable with no invented new lesson', () => {
  const state = learned();
  assert.equal(getDailyPlan(state, [lessons[0]], '2026-10-09').newLessonId, null);
  assert.deepEqual(getDailyPlan(state, [lessons[0]], '2026-10-09').dueIds, [first]);
});

test('invalid transitions and clock rollback are rejected', () => {
  assert.throws(() => recordResult(createState(initialDay), first, 'good', initialDay));
  assert.throws(() => recordResult(learned(), first, 'good', '2026-10-07'), /日期早于/);
  assert.throws(() => recordResult(learned(), first, 'good', '2026-10-09', { isNew: true }));
  let state = recordResult(learned(), first, 'good', '2026-10-09');
  assert.throws(() => recordResult(state, first, 'good', '2026-10-10'), /尚未到/);
  assert.throws(() => recordResult(state, first, 'perfect', '2026-10-12'));
  assert.throws(() => recordResult(state, '__proto__', 'good', '2026-10-12', { isNew: true }));
});

test('empty and populated JSON backups round-trip into independent sanitized objects', () => {
  for (const state of [createState(initialDay), learned(), backlog()]) {
    const imported = validateImport(JSON.stringify(state), lessons);
    assert.deepEqual(imported, state);
    assert.notEqual(imported.settings, state.settings);
    assert.notEqual(imported.cards, state.cards);
  }
});

test('import rejects unexpected keys and prototype-pollution payloads without global mutation', () => {
  const state = learned();
  const payload = JSON.stringify(state).replace('"cards":{', '"cards":{"__proto__":{"polluted":true},');
  assert.throws(() => validateImport(payload, lessons));
  assert.equal({}.polluted, undefined);
  assert.throws(() => validateImport({ ...state, audio: 'data:audio...' }, lessons));
  assert.throws(() => validateImport(Object.assign(Object.create({ polluted: true }), state), lessons));
  assert.throws(() => validateImport({ ...state, cards: [] }, lessons));
});

test('import rejects unknown lessons, invalid real dates, unsupported version and malformed JSON', () => {
  const state = learned();
  assert.throws(() => validateImport(state, [lessons[1]]));
  assert.throws(() => validateImport({ ...state, startedAt: '2026-02-29' }, lessons));
  assert.throws(() => validateImport({ ...state, version: 2 }, lessons));
  assert.throws(() => validateImport('not json', lessons));
  assert.throws(() => validateImport(null, lessons));
  assert.throws(() => validateImport([], lessons));
  assert.throws(() => validateImport(' '.repeat(5_000_001), lessons));
});

test('import rejects invalid nickname, ratings, settings, counters and fabricated progress', () => {
  const mutations = [
    (s) => { s.settings.nickname = '\u0000'; },
    (s) => { s.settings.dailyReviews = 99; },
    (s) => { s.settings.dailyReviews = 1.2; },
    (s) => { s.cards[first].stage = 99; },
    (s) => { s.cards[first].attempts = 2; },
    (s) => { s.cards[first].due = '2026-10-20'; },
    (s) => { s.days[initialDay].results[0].rating = 'perfect'; },
    (s) => { s.days[initialDay].results[0].isNew = false; },
    (s) => { s.days[initialDay].results.push({ ...s.days[initialDay].results[0] }); },
    (s) => { s.days[initialDay].newDone = false; },
    (s) => { s.days[initialDay].reviewed = [first]; },
    (s) => { delete s.days[initialDay]; },
  ];
  for (const mutate of mutations) {
    const state = learned();
    mutate(state);
    assert.throws(() => validateImport(state, lessons));
  }
});

test('two years of plausible practice retains a valid backup and bounded daily workload', () => {
  let state = createState(initialDay);
  for (let offset = 0; offset < 730; offset += 1) {
    const date = addDays(initialDay, offset);
    if (offset % 9 === 0) continue;
    const plan = getDailyPlan(state, lessons, date);
    assert.ok(plan.dueIds.length <= 5);
    if (plan.newLessonId && !plan.newDone) state = recordResult(state, plan.newLessonId, 'good', date, { isNew: true });
    for (const id of plan.dueIds) state = recordResult(state, id, offset % 13 === 0 ? 'again' : offset % 7 === 0 ? 'help' : 'good', date);
  }
  assert.deepEqual(validateImport(JSON.stringify(state), lessons), state);
  assert.equal(getStats(state, lessons, addDays(initialDay, 729)).learnedCount, 20);
});
