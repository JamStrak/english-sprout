import test from 'node:test';
import assert from 'node:assert/strict';
import { addDays, createState, getCheckupPlan, recordCheckup, recordResult, validateImport } from '../src/learning.js';
import { DEFAULT_SKIN_ID, SKINS, SKIN_STORAGE_KEY, getSkinProgress, normalizeSkinId, resolveSelectedSkin } from '../src/skins.js';

const start = '2026-10-01';
const lessons = Array.from({ length: 12 }, (_, index) => ({ id: `lesson-${index + 1}` }));
const progress = (state, id, date = start) => getSkinProgress(state, date).find(skin => skin.id === id);
function introduce(count, gap = 1) {
  let state = createState(start);
  for (let index = 0; index < count; index++) {
    state = recordResult(state, lessons[index].id, 'help', addDays(start, index * gap), { isNew: true });
  }
  return state;
}
function freezeDeep(value) {
  for (const child of Object.values(value)) if (child && typeof child === 'object') freezeDeep(child);
  return Object.freeze(value);
}

test('new and absent history expose two free skins and three small cumulative goals', () => {
  const result = getSkinProgress(createState(start), start);
  assert.equal(DEFAULT_SKIN_ID, 'sunny');
  assert.equal(SKIN_STORAGE_KEY, 'english-sprout-skin-v1');
  assert.deepEqual(result.filter(skin => skin.unlocked).map(skin => skin.id), ['sunny', 'classic']);
  assert.deepEqual(result.filter(skin => !skin.unlocked).map(({ id, current, target, remaining }) => ({ id, current, target, remaining })), [
    { id: 'meadow', current: 0, target: 3, remaining: 3 },
    { id: 'peach', current: 0, target: 5, remaining: 5 },
    { id: 'grape', current: 0, target: 7, remaining: 7 },
  ]);
  assert.deepEqual(getSkinProgress(null, start), result);
  assert.equal(SKINS.length, 5);
});

test('three unique introductions unlock the forest without claiming mastery or requiring good ratings', () => {
  const state = introduce(3, 4), today = addDays(start, 8);
  assert.equal(progress(state, 'meadow', addDays(today, -1)).remaining, 1);
  assert.equal(progress(state, 'meadow', today).unlocked, true);
  assert.equal(progress(state, 'meadow', today).current, 3);
  assert.equal(progress(state, 'meadow', today).remaining, 0);
  assert.equal(progress(state, 'meadow', today).rule, '累计认识 3 个新句');
  assert.equal(progress(state, 'peach', today).current, 0);
});

test('five recorded due reviews unlock the lake, and a sentence can contribute on different days', () => {
  let state = introduce(1);
  for (let index = 1; index <= 5; index++) {
    const today = addDays(start, index);
    state = recordResult(state, 'lesson-1', 'again', today);
    assert.equal(progress(state, 'peach', today).current, index);
    assert.equal(progress(state, 'peach', today).unlocked, index === 5);
    const repeated = recordResult(state, 'lesson-1', 'good', today);
    assert.deepEqual(getSkinProgress(repeated, today), getSkinProgress(state, today));
  }
  assert.equal(progress(state, 'meadow', addDays(start, 5)).current, 1);
});

test('seven nonconsecutive practice dates unlock the playground and days never expire', () => {
  const state = introduce(7, 3), today = addDays(start, 18);
  assert.equal(progress(state, 'grape', addDays(today, -1)).remaining, 1);
  assert.equal(progress(state, 'grape', today).unlocked, true);
  assert.equal(progress(state, 'grape', today).current, 7);
  assert.equal(progress(state, 'grape', addDays(today, 100)).unlocked, true);
});

test('a completed checkup contributes one practice date, not review attempts or extra days per question', () => {
  let state = introduce(3), today = addDays(start, 7);
  const plan = getCheckupPlan(state, lessons, today);
  assert.equal(plan.due, true);
  state = recordCheckup(state, lessons, plan.ids.map(lessonId => ({ lessonId, meaning: false, spoken: 'again' })), today);
  assert.equal(progress(state, 'grape', today).current, 4);
  assert.equal(progress(state, 'peach', today).current, 0);
  state = recordResult(state, 'lesson-1', 'help', today);
  assert.equal(progress(state, 'grape', today).current, 4);
  assert.equal(progress(state, 'peach', today).current, 1);
});

test('future introductions, reviews and checkups cannot unlock an earlier calendar snapshot', () => {
  let state = introduce(7);
  for (const id of lessons.slice(0, 5).map(lesson => lesson.id)) state = recordResult(state, id, 'again', addDays(start, 7));
  const checkpoint = addDays(start, 14), plan = getCheckupPlan(state, lessons, checkpoint);
  state = recordCheckup(state, lessons, plan.ids.map(lessonId => ({ lessonId, meaning: true, spoken: 'good' })), checkpoint);
  assert.equal(Object.keys(state.cards).length, 7);
  const before = getSkinProgress(state, addDays(start, -1));
  assert.deepEqual(before.filter(skin => skin.metric).map(skin => skin.current), [0, 0, 0]);
  assert.deepEqual(getSkinProgress(state, start).filter(skin => skin.metric).map(skin => skin.current), [1, 0, 1]);
  assert.deepEqual(getSkinProgress(state, addDays(start, 6)).filter(skin => skin.metric).map(skin => skin.current), [7, 0, 7]);
  assert.equal(progress(state, 'peach', checkpoint).current, 5);
  assert.equal(progress(state, 'grape', checkpoint).current, 9);
});

test('duplicate events and progress flags alone cannot manufacture sentence or review totals', () => {
  const state = introduce(1);
  state.days[start].results.push({ ...state.days[start].results[0] });
  const date = addDays(start, 1);
  state.days[date] = { newId: 'lesson-2', newDone: true, reviewed: ['lesson-1'], results: [] };
  assert.deepEqual(getSkinProgress(state, date).filter(skin => skin.metric).map(skin => skin.current), [1, 0, 1]);
  state.days[date].results = Array.from({ length: 5 }, () => ({ lessonId: 'lesson-1', rating: 'again', isNew: false }));
  assert.equal(progress(state, 'peach', date).current, 1);
  assert.equal(progress(state, 'grape', date).current, 2);
});

test('repeated reads/free practice do not change saved learning or garden inventory', () => {
  const state = freezeDeep(introduce(3)), before = JSON.stringify(state), today = addDays(start, 4);
  const result = getSkinProgress(state, today);
  for (let index = 0; index < 20; index++) assert.deepEqual(getSkinProgress(state, today), result);
  assert.equal(JSON.stringify(state), before);
  assert.deepEqual(validateImport(state, lessons), state);
  assert.equal(Object.hasOwn(state, 'skins'), false);
  assert.equal(Object.hasOwn(state.settings, 'skin'), false);
});

test('stored IDs are allowlisted and locked selections fall back when progress is replaced or date changes', () => {
  const state = introduce(3), today = addDays(start, 2);
  for (const value of [null, undefined, '', 'unknown', {}, { id: 'grape' }, '__proto__', ' sunny ']) assert.equal(normalizeSkinId(value), 'sunny');
  for (const skin of SKINS) assert.equal(normalizeSkinId(skin.id), skin.id);
  assert.equal(resolveSelectedSkin(state, today, 'classic'), 'classic');
  assert.equal(resolveSelectedSkin(state, today, 'meadow'), 'meadow');
  assert.equal(resolveSelectedSkin(state, today, 'grape'), 'sunny');
  assert.equal(resolveSelectedSkin(createState(start), today, 'meadow'), 'sunny');
  assert.equal(resolveSelectedSkin(state, start, 'meadow'), 'sunny');
});

test('older backups without checkups work and invalid requested calendar labels are rejected', () => {
  const state = introduce(1);
  delete state.checkups;
  assert.equal(progress(state, 'grape').current, 1);
  assert.throws(() => getSkinProgress(state, '2026-02-30'), /日历日期/);
});


test('three new sentences on the same calendar day unlock forest while counting one practice day', () => {
  let state = createState(start);
  for(const lesson of lessons.slice(0,3))state=recordResult(state,lesson.id,'good',start,{isNew:true,meaning:true});
  assert.deepEqual(validateImport(state,lessons),state);
  assert.equal(progress(state,'meadow').current,3);
  assert.equal(progress(state,'meadow').unlocked,true);
  assert.equal(progress(state,'grape').current,1);
  assert.deepEqual(getSkinProgress(state,addDays(start,-1)).filter(skin=>skin.metric).map(skin=>skin.current),[0,0,0]);
  state.days[start].results.push({...state.days[start].results[2]});
  assert.equal(progress(state,'meadow').current,3);
});
