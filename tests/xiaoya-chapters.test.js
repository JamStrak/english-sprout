import test from 'node:test';
import assert from 'node:assert/strict';
import {CORE_PHRASE_EVENT_IDS} from '../xiaoya/curriculum.js';
import {CHALLENGE_UNITS} from '../xiaoya/challenges.js';
import {createState, completeEvent, recordEvidence} from '../xiaoya/learning.js';
import {createPracticePlan, recordPractice, getPracticePlan} from '../xiaoya/practice-plan.js';
import {CHAPTERS, getChapterProgress, nextChapterPractice, mixedChapterReview} from '../xiaoya/chapters.js';

const day = '2026-10-22';
function practiced(ids, {date = day, asOf = date} = {}) {
  const log = ids.reduce((plan, eventId, index) => recordPractice(plan, {
    roundId: `practice-${index}`, eventId, date, mode: 'new',
  }), createPracticePlan());
  return getPracticePlan(log, {date: asOf});
}
const first = count => CORE_PHRASE_EVENT_IDS.slice(0, count);
const chapterAt = (plan, number) => getChapterProgress(plan).chapters[number - 1];

test('21 chapter groups retain all 84 core IDs and the existing challenge mapping', () => {
  assert.equal(CHAPTERS.length, 21);
  assert.deepEqual(CHAPTERS.flatMap(chapter => chapter.eventIds), CORE_PHRASE_EVENT_IDS);
  CHAPTERS.forEach((chapter, index) => {
    assert.equal(chapter.id, `chapter-${index + 1}`);
    assert.equal(chapter.number, index + 1);
    assert.equal(chapter.challengeId, CHALLENGE_UNITS[index].id);
    assert.deepEqual(chapter.eventIds, CHALLENGE_UNITS[index].eventIds);
    assert.ok(chapter.title.length >= 3);
    assert.ok(Object.isFrozen(chapter));
    assert.ok(Object.isFrozen(chapter.eventIds));
  });
  assert.ok(Object.isFrozen(CHAPTERS));
});

test('a new learner can enter only the first chapter and unfinished chapters stay grey', () => {
  const plan = practiced([]);
  const progress = getChapterProgress(plan);
  assert.equal(progress.currentChapterId, 'chapter-1');
  assert.equal(progress.completedCount, 0);
  assert.deepEqual(progress.chapters.filter(chapter => chapter.unlocked).map(chapter => chapter.id), ['chapter-1']);
  assert.deepEqual(nextChapterPractice('chapter-1', plan), {eventId: first(1)[0], mode: 'new'});
  assert.equal(nextChapterPractice('chapter-2', plan), null);
  assert.equal(nextChapterPractice('missing', plan), null);
  assert.equal(chapterAt(plan, 2).nextEventId, null);
});

test('completing four practice flows opens the next chapter without stars or challenges', () => {
  const incomplete = practiced(first(3));
  assert.equal(chapterAt(incomplete, 1).completedCount, 3);
  assert.equal(chapterAt(incomplete, 2).unlocked, false);
  const complete = practiced(first(4));
  assert.ok(complete.cards.every(card => card.lastOutcome === 'not-attempted'));
  assert.equal(chapterAt(complete, 1).completed, true);
  assert.equal(chapterAt(complete, 2).unlocked, true);
  assert.equal(chapterAt(complete, 3).unlocked, false);
  assert.equal(getChapterProgress(complete).currentChapterId, 'chapter-2');
  assert.equal(getChapterProgress(complete).completedCount, 1);
  assert.deepEqual(nextChapterPractice('chapter-2', complete), {eventId: CORE_PHRASE_EVENT_IDS[4], mode: 'new'});
});

test('recorded one-star or helped participation is sufficient; attempts alone are not completion', () => {
  let state = createState();
  let log = createPracticePlan();
  first(4).forEach((eventId, index) => {
    const attemptId = `try-${index}`;
    state = recordEvidence(state, {attemptId, eventId, date: day, kind: 'speech',
      result: index % 2 ? 'supported' : 'not_yet', source: 'machine', helped: !!(index % 2)});
    log = recordPractice(log, {roundId: `done-${index}`, eventId, date: day, attemptId});
  });
  assert.equal(chapterAt(getPracticePlan(log, {learningState: state, date: day}), 2).unlocked, true);
  const abandoned = getPracticePlan(createPracticePlan(), {learningState: state, date: day});
  assert.equal(chapterAt(abandoned, 1).completedCount, 0);
  assert.equal(chapterAt(abandoned, 2).unlocked, false);
});

test('old completion records keep chapters through the furthest practiced chapter open', () => {
  const state = completeEvent(createState(), CHAPTERS[7].eventIds[2], '2026-09-20');
  const plan = getPracticePlan(createPracticePlan(), {learningState: state, date: day});
  const result = getChapterProgress(plan);
  assert.deepEqual(result.chapters.filter(chapter => chapter.unlocked).map(chapter => chapter.number), [1,2,3,4,5,6,7,8]);
  assert.equal(result.chapters[7].completedCount, 1);
  assert.equal(result.chapters[8].unlocked, false);
  assert.equal(result.currentChapterId, 'chapter-1');
  assert.equal(nextChapterPractice('chapter-7', plan).mode, 'new');
});

test('a completed furthest old chapter opens exactly its next chapter even when earlier chapters have gaps', () => {
  const plan = practiced(CHAPTERS[7].eventIds);
  assert.equal(chapterAt(plan, 9).unlocked, true);
  assert.equal(chapterAt(plan, 10).unlocked, false);
  assert.deepEqual(mixedChapterReview('chapter-9', plan), []);
});

test('calendar review becomes due next day but does not relock completed or open chapters', () => {
  const fresh = practiced(first(4));
  const tomorrow = practiced(first(4), {asOf: '2026-10-23'});
  assert.equal(chapterAt(fresh, 1).dueCount, 0);
  assert.equal(chapterAt(tomorrow, 1).dueCount, 4);
  assert.deepEqual(nextChapterPractice('chapter-1', fresh), {eventId: first(1)[0], mode: 'free'});
  assert.deepEqual(nextChapterPractice('chapter-1', tomorrow), {eventId: first(1)[0], mode: 'review'});
  assert.equal(chapterAt(tomorrow, 2).unlocked, true);
  assert.equal(chapterAt(tomorrow, 1).completed, true);
  const partial = practiced(first(2), {asOf: '2026-10-23'});
  assert.deepEqual(nextChapterPractice('chapter-1', partial), {eventId: CORE_PHRASE_EVENT_IDS[2], mode: 'new'});
});

test('mixed review appears only at completed third-chapter checkpoints, never early', () => {
  assert.deepEqual(mixedChapterReview('chapter-3', practiced(first(11))), []);
  const plan = practiced(first(12));
  assert.deepEqual(mixedChapterReview('chapter-2', plan), []);
  assert.deepEqual(mixedChapterReview('chapter-6', plan), []);
  assert.deepEqual(mixedChapterReview('missing', plan), []);
  assert.deepEqual(mixedChapterReview('chapter-3', plan), [0,1,4,8].map(index => CORE_PHRASE_EVENT_IDS[index]));
  assert.deepEqual(mixedChapterReview('chapter-3', plan, {limit: 0}), []);
  assert.deepEqual(mixedChapterReview('chapter-3', plan, {limit: 1.5}), []);
});

test('mixed review keeps its own three-chapter range, is deterministic and never duplicates a phrase', () => {
  const plan = practiced(first(24));
  const expected = CORE_PHRASE_EVENT_IDS.slice(12, 24);
  const ids = mixedChapterReview('chapter-6', plan, {limit: 50});
  assert.deepEqual(ids, expected);
  assert.equal(new Set(ids).size, 12);
  assert.deepEqual(mixedChapterReview('chapter-6', plan), [0,1,4,8].map(index => expected[index]));
  assert.deepEqual(mixedChapterReview('chapter-6', plan), mixedChapterReview('chapter-6', plan));
});

test('mixed review covers every chapter before using due and oldest priority to fill the round', () => {
  const plan = practiced(first(12));
  const dates = ['2026-10-04','2026-10-08','2026-10-07','2026-10-06'];
  plan.cards.forEach((card, index) => {
    card.due = index >= 4 && index < 8;
    card.lastDate = index >= 4 && index < 8 ? dates[index - 4] : '2026-10-01';
  });
  const before = JSON.stringify(plan);
  assert.deepEqual(mixedChapterReview('chapter-3', plan), [4,7,0,8].map(index => CORE_PHRASE_EVENT_IDS[index]));
  assert.equal(JSON.stringify(plan), before);
  assert.deepEqual(mixedChapterReview('chapter-3', plan, {limit: 6}), [4,7,6,5,0,8].map(index => CORE_PHRASE_EVENT_IDS[index]));
  assert.deepEqual(mixedChapterReview('chapter-3', plan, {limit: 3}), [4,0,8].map(index => CORE_PHRASE_EVENT_IDS[index]));
  assert.deepEqual(mixedChapterReview('chapter-3', plan, {limit: 2}), [4,7].map(index => CORE_PHRASE_EVENT_IDS[index]));
});

test('every mixed checkpoint includes practiced content from all three chapters even when only one is due', () => {
  const plan = practiced(CORE_PHRASE_EVENT_IDS);
  for (let end = 3; end <= 21; end += 3) {
    const block = CHAPTERS.slice(end - 3, end);
    const dueIds = block[1].eventIds;
    plan.cards.forEach(card => { card.due = dueIds.includes(card.eventId); });
    const ids = mixedChapterReview(`chapter-${end}`, plan);
    assert.equal(ids.length, 4);
    assert.equal(new Set(ids).size, 4);
    for (const chapter of block) assert.ok(ids.some(id => chapter.eventIds.includes(id)));
    assert.ok(ids.every(id => plan.cards.some(card => card.eventId === id && card.firstDate)));
    assert.equal(ids.filter(id => dueIds.includes(id)).length, 2);
  }
});

test('all completed chapters remain available and current chapter never overflows the catalogue', () => {
  const plan = practiced(CORE_PHRASE_EVENT_IDS);
  const progress = getChapterProgress(plan);
  assert.equal(progress.completedCount, 21);
  assert.equal(progress.currentChapterId, 'chapter-21');
  assert.ok(progress.chapters.every(chapter => chapter.unlocked && chapter.completed));
  assert.equal(mixedChapterReview('chapter-21', plan, {limit: 99}).length, 12);
  assert.equal(nextChapterPractice('chapter-21', plan).mode, 'free');
});
