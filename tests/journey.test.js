import test from 'node:test';
import assert from 'node:assert/strict';
import { addDays, createState, getDailyPlan, getCheckupPlan, recordResult, recordCheckup } from '../src/learning.js';
import { getTodayJourney } from '../src/journey.js';

const lessons = Array.from({ length: 120 }, (_, index) => ({ id: `lesson-${index + 1}` }));
const start = '2026-01-01';
function introduce(count) {
  let state = createState(start);
  for (let index = 0; index < count; index++) {
    state = recordResult(state, lessons[index].id, 'good', addDays(start, index), { isNew: true });
  }
  return state;
}
function reviewDue(state, day, rating = 'good') {
  for (const id of getDailyPlan(state, lessons, day).dueIds) state = recordResult(state, id, rating, day);
  return state;
}
function freezeDeep(value) {
  for (const child of Object.values(value)) if (child && typeof child === 'object') freezeDeep(child);
  return Object.freeze(value);
}

test('a first visit offers only the first new sentence, followed by the garden', () => {
  assert.deepEqual(getTodayJourney(createState(start), lessons, start), {
    kind: 'learn', ids: ['lesson-1'], lessonId: 'lesson-1', count: 1, nextKind: 'garden',
  });
});

test('due review takes priority over both a new sentence and a due checkup', () => {
  const state = introduce(3), day = addDays(start, 8);
  assert.equal(getCheckupPlan(state, lessons, day).due, true);
  assert.deepEqual(getTodayJourney(state, lessons, day), {
    kind: 'review', ids: ['lesson-1', 'lesson-2', 'lesson-3'], lessonId: 'lesson-1', count: 3, nextKind: 'learn',
  });
  const reviewed = reviewDue(state, day, 'again');
  assert.equal(getTodayJourney(reviewed, lessons, day).kind, 'learn');
  assert.equal(getTodayJourney(reviewed, lessons, day).nextKind, 'garden');
  assert.equal(getTodayJourney(reviewed, lessons, addDays(day, 1)).kind, 'review');
});

test('after due reviews an optional next sentence is offered rather than repeating the first daily sentence', () => {
  const day = addDays(start, 8);
  let state = recordResult(introduce(3), 'lesson-4', 'help', day, { isNew: true });
  assert.equal(getDailyPlan(state, lessons, day).newLessonId, 'lesson-4');
  assert.equal(getTodayJourney(state, lessons, day).kind, 'review');
  assert.equal(getTodayJourney(state, lessons, day).nextKind, 'checkup');
  state = reviewDue(state, day);
  assert.deepEqual(getTodayJourney(state, lessons, day), {
    kind: 'learn', ids: ['lesson-5'], lessonId: 'lesson-5', count: 1, nextKind: 'garden',
  });
});

test('a due checkup follows learning when older cards are not yet due for review', () => {
  let state = reviewDue(introduce(3), addDays(start, 5));
  const day = addDays(start, 7);
  assert.equal(getDailyPlan(state, lessons, day).dueIds.length, 0);
  assert.equal(getTodayJourney(state, lessons, day).kind, 'learn');
  assert.equal(getTodayJourney(state, lessons, day).nextKind, 'checkup');
  state = recordResult(state, 'lesson-4', 'good', day, { isNew: true });
  const journey = getTodayJourney(state, lessons, day);
  assert.equal(journey.kind, 'checkup');
  assert.deepEqual(journey.ids, ['lesson-1', 'lesson-2', 'lesson-3']);
  assert.equal(journey.nextKind, 'learn');
  state = recordCheckup(state, lessons, journey.ids.map(lessonId => ({ lessonId, meaning: true, spoken: 'good' })), day);
  assert.equal(getTodayJourney(state, lessons, day).kind, 'learn');
  assert.equal(getTodayJourney(state, lessons, day).lessonId, 'lesson-5');
});

test('missed days retain the next unlearned sentence rather than skipping or adding new work', () => {
  let state = introduce(2);
  const day = addDays(start, 50);
  assert.deepEqual(getTodayJourney(state, lessons, day).ids, ['lesson-1', 'lesson-2']);
  state = reviewDue(state, day);
  assert.deepEqual(getTodayJourney(state, lessons, day), {
    kind: 'learn', ids: ['lesson-3'], lessonId: 'lesson-3', count: 1, nextKind: 'garden',
  });
});

test('the daily review limit is respected even when overdue cards remain', () => {
  const day = addDays(start, 20);
  let state = introduce(8);
  state.settings.dailyReviews = 2;
  assert.deepEqual(getTodayJourney(state, lessons, day).ids, ['lesson-1', 'lesson-2']);
  state = recordResult(state, 'lesson-1', 'again', day);
  assert.deepEqual(getTodayJourney(state, lessons, day).ids, ['lesson-2']);
  state = recordResult(state, 'lesson-2', 'help', day);
  assert.equal(getDailyPlan(state, lessons, day).extraDueCount, 6);
  assert.equal(getTodayJourney(state, lessons, day).kind, 'learn');
  assert.equal(getTodayJourney(state, lessons, day).nextKind, 'checkup');
});

test('after all 120 sentences, review leads to a checkup and then the garden without invented lessons', () => {
  const day = addDays(start, 120);
  let state = introduce(120);
  assert.equal(getDailyPlan(state, lessons, day).newLessonId, null);
  const review = getTodayJourney(state, lessons, day);
  assert.equal(review.kind, 'review');
  assert.equal(review.count, 5);
  assert.equal(review.nextKind, 'checkup');
  state = reviewDue(state, day);
  const checkup = getTodayJourney(state, lessons, day);
  assert.equal(checkup.kind, 'checkup');
  assert.equal(checkup.count, 3);
  assert.equal(checkup.nextKind, 'garden');
  state = recordCheckup(state, lessons, checkup.ids.map(lessonId => ({ lessonId, meaning: false, spoken: 'again' })), day);
  assert.deepEqual(getTodayJourney(state, lessons, day), {
    kind: 'garden', ids: [], lessonId: null, count: 0, nextKind: null,
  });
});

test('planning never mutates frozen state or lessons and returned ids are independent', () => {
  const state = freezeDeep(introduce(3)), catalog = freezeDeep(structuredClone(lessons));
  const before = JSON.stringify(state), day = addDays(start, 8);
  const result = getTodayJourney(state, catalog, day);
  result.ids.pop();
  assert.deepEqual(getTodayJourney(state, catalog, day).ids, ['lesson-1', 'lesson-2', 'lesson-3']);
  assert.equal(JSON.stringify(state), before);
});
