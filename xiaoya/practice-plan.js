import {EVENTS} from './content.js';
import {CORE_PHRASE_EVENT_IDS, phraseIdFor} from './curriculum.js';
import {createState, effectiveEvidence, localDay} from './learning.js';

/** A local participation log. Scheduling is not evidence of mastery. */
export const PRACTICE_KEY = 'xiaoya-english:practice-plan:v1';
export const REVIEW_INTERVALS = Object.freeze([1, 3, 7, 14, 30]);
const PRODUCT = 'xiaoya-english-practice-plan';
const MAX_RECORDS = 20000;
const eventMap = new Map(EVENTS.map(event => [event.id, event]));
const modes = new Set(['new', 'review', 'free']);
const fail = message => { throw new Error(`小芽复习记录无效：${message}`); };
const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);

function fields(value, expected) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) fail('应为普通对象');
  if (Object.keys(value).length !== expected.length || expected.some(key => !own(value, key))) fail('字段缺失或含有未知字段');
}

function identifier(value) {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,159}$/.test(value) || ['constructor', 'prototype', '__proto__'].includes(value)) fail('互动编号错误');
}

function round(value) {
  identifier(value.roundId);
  if (!eventMap.has(value.eventId)) fail('未知故事');
  if (typeof value.date !== 'string') fail('日期须为本地日历标签');
  localDay(value.date);
}

function gardenRound(value) {
  const receipt = !!value && ['reward', 'starter', 'rewardVersion', 'amounts'].some(key => own(value, key));
  const versioned = !!value && (own(value, 'rewardVersion') || own(value, 'amounts'));
  fields(value, ['roundId', 'eventId', 'date', ...(receipt ? ['starter', 'reward'] : []),
    ...(versioned ? ['rewardVersion', 'amounts'] : [])]);
  round(value);
  if (!receipt) return;
  if (!['legacy', 'starter', 'pending', 'shells', 'water'].includes(value.reward) ||
      value.starter !== (value.reward === 'starter')) fail('花园参与补给记录错误');
  if (!versioned) return;
  // Validate the persisted receipt contract without importing the garden: its
  // challenge catalogue depends on this scheduler. Quantities never become
  // learning evidence, and old receipts retain their original reward amounts.
  if (![1, 2, 3, 4].includes(value.rewardVersion) ||
      (value.rewardVersion === 1) !== (value.reward === 'legacy')) fail('花园参与补给版本错误');
  fields(value.amounts, ['shells', 'water']);
  // Version 4 stores the GM tuning that applied when this round was earned.
  // It is an immutable bounded snapshot; today's settings cannot change it.
  if (value.rewardVersion === 4) {
    if (Object.values(value.amounts).some(amount => !Number.isInteger(amount) || amount < 0 || amount > 1000))
      fail('花园参与补给金额错误');
    return;
  }
  const shells = value.rewardVersion === 1 ? 3 : 2;
  const water = value.rewardVersion === 3 ? (value.starter ? 3 : 2) : 5;
  if (value.amounts.shells !== shells || value.amounts.water !== water) fail('花园参与补给金额错误');
}

function entry(value) {
  const hasReward = !!value && own(value, 'rewardVariant');
  fields(value, ['roundId', 'eventId', 'date', 'attemptId', 'mode', ...(hasReward ? ['rewardVariant'] : [])]);
  round(value);
  if (value.attemptId !== null) identifier(value.attemptId);
  if (!modes.has(value.mode)) fail('练习类型错误');
  if (hasReward && value.rewardVariant !== null && value.rewardVariant !== 'a' && value.rewardVariant !== 'b') fail('奖励花园错误');
}

/** Calendar arithmetic uses local date labels, never elapsed 24-hour periods. */
export function addPracticeDays(value, amount) {
  const day = localDay(value);
  if (!Number.isInteger(amount) || Math.abs(amount) > 36600) fail('日期间隔错误');
  const [year, month, date] = day.split('-').map(Number);
  const shifted = new Date(Date.UTC(year, month - 1, date + amount));
  return localDay(`${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, '0')}-${String(shifted.getUTCDate()).padStart(2, '0')}`);
}

export function createPracticePlan() {
  return {schemaVersion: 1, product: PRODUCT, entries: []};
}

/** Reject malformed saves without repairing or clearing the original data. */
export function validatePracticePlan(plan) {
  fields(plan, ['schemaVersion', 'product', 'entries']);
  if (plan.schemaVersion !== 1 || plan.product !== PRODUCT) fail('产品或版本不匹配');
  if (!Array.isArray(plan.entries) || plan.entries.length > MAX_RECORDS) fail('练习列表错误');
  const ids = new Set();
  for (const value of plan.entries) {
    entry(value);
    if (ids.has(value.roundId)) fail('互动编号重复');
    ids.add(value.roundId);
  }
  return plan;
}

/** Call after a complete story or completed review, including reviews without rewards.
 * Persist the returned value before advancing the UI. Keep the actual attempt ID:
 * later parent corrections then change scheduling without rewriting this log.
 * An explicit rewardVariant is a durable reward intent. Legacy entries without
 * it are equivalent to null and must never be upgraded into an invented reward.
 */
export function recordPractice(plan, input) {
  validatePracticePlan(plan);
  const value = {...input, attemptId: input.attemptId ?? null, mode: input.mode ?? 'free', rewardVariant: input.rewardVariant ?? null};
  entry(value);
  const previous = plan.entries.find(item => item.roundId === value.roundId);
  if (previous) {
    if (Object.keys(value).some(key => (key === 'rewardVariant' ? previous[key] ?? null : previous[key]) !== value[key])) fail('同一互动不能覆盖原记录');
    return plan;
  }
  if (plan.entries.length >= MAX_RECORDS) fail('练习记录已达上限，请先导出备份');
  return {...plan, entries: [...plan.entries, value]};
}

function outcome(evidence) {
  if (!evidence) return 'not-attempted';
  if (evidence.helped || evidence.result === 'supported') return 'supported';
  if (evidence.result === 'independent') return evidence.source === 'parent' ? 'parent-independent' : 'machine-candidate';
  return ({not_yet: 'not-yet', unclear: 'unclear', device_error: 'device-error'})[evidence.result] || 'not-attempted';
}

const independent = value => value === 'parent-independent' || value === 'machine-candidate';

function history(plan, rounds, learningState, date) {
  if (!Array.isArray(rounds) || rounds.length > MAX_RECORDS * 2) fail('旧参与列表错误');
  // Validate the original first; an as-of query must not apply future corrections.
  let evidence = effectiveEvidence(learningState);
  if (learningState.corrections.some(item => item.date > date)) {
    evidence = effectiveEvidence({...learningState, corrections: learningState.corrections.filter(item => item.date <= date)});
  }
  evidence = evidence.filter(item => item.kind === 'speech' && item.date <= date);
  const byAttempt = new Map(evidence.map(item => [item.attemptId, item]));
  const byEventDay = new Map();
  for (const item of evidence) {
    const key = `${item.eventId}:${item.date}`;
    // Old saves cannot identify the final round's attempt. Use the first observed
    // result conservatively; a later same-day retry cannot inflate its interval.
    if (!byEventDay.has(key)) byEventDay.set(key, item);
  }
  const contacts = new Map();
  rounds.forEach((value, index) => {
    gardenRound(value);
    const previous = contacts.get(value.roundId);
    if (previous && (previous.eventId !== value.eventId || previous.date !== value.date)) fail('两座花园的互动编号冲突');
    if (!previous) contacts.set(value.roundId, {roundId:value.roundId,eventId:value.eventId,date:value.date, origin: 'legacy', order: index, mode: 'review'});
  });
  plan.entries.forEach((value, index) => {
    const previous = contacts.get(value.roundId);
    if (previous && (previous.eventId !== value.eventId || previous.date !== value.date)) fail('复习与花园互动记录不一致');
    contacts.set(value.roundId, {...value, origin: 'recorded', order: index});
  });
  const days = new Set([...contacts.values()].map(item => `${item.eventId}:${item.date}`));
  let legacyOrder = rounds.length;
  const legacy = (eventId, day, attemptId = null) => {
    const key = `${eventId}:${day}`;
    if (days.has(key)) return;
    days.add(key);
    // A synthetic key must never overwrite a legitimate garden round ID.
    contacts.set(Symbol(key), {roundId: `legacy:${key}`, eventId, date: day, attemptId, origin: 'legacy', order: legacyOrder++, mode: 'review'});
  };
  for (const [eventId, completion] of Object.entries(learningState.completions)) {
    // first/last are the only known dates; count cannot invent missing calendar days.
    legacy(eventId, completion.firstDate);
    legacy(eventId, completion.lastDate);
  }
  // Historic parent checkups did not create garden rewards. An explicit parent
  // observation can recover that contact. A machine attempt alone can belong to
  // an abandoned flow; it needs a completed round, never invents participation.
  for (const item of evidence) if (item.source === 'parent' && item.result !== 'device_error') legacy(item.eventId, item.date, item.attemptId);
  return [...contacts.values()].filter(item => item.date <= date).sort((a, b) =>
    a.date.localeCompare(b.date) || (a.origin === b.origin ? a.order - b.order : a.origin === 'legacy' ? -1 : 1)
  ).map((item, index) => {
    const observation = item.origin === 'recorded' ? byAttempt.get(item.attemptId) : byEventDay.get(`${item.eventId}:${item.date}`);
    if (observation && (observation.eventId !== item.eventId || observation.date !== item.date)) fail('口语观察不属于本轮故事或日期');
    return {...item, outcome: outcome(observation), sequence: index};
  });
}

/** Derive a deterministic, refresh-safe plan shared by both gardens.
 * cards are scheduling metadata only: stage is an interval index, not proficiency.
 * Alternate scenes share one phrase card, whose eventId stays the first familiar
 * scene. Raw event/round/attempt IDs remain in the logs for attribution and rewards.
 * dueIds excludes phrases already completed today. next is review/new/free;
 * free play stays available when everything is current, and never fakes mastery.
 */
export function getPracticePlan(plan, {rounds = [], learningState = createState(), date = localDay()} = {}) {
  validatePracticePlan(plan);
  date = localDay(date);
  const contacts = history(plan, rounds, learningState, date);
  const cardsByPhrase = new Map();
  const handledDays = new Set();
  let reviewStreak = 0;
  for (const item of contacts) {
    const phraseId = phraseIdFor(item.eventId);
    const existing = cardsByPhrase.get(phraseId);
    const key = `${phraseId}:${item.date}`;
    if (handledDays.has(key)) {
      existing.playCount++;
      existing.lastSequence = item.sequence;
      continue;
    }
    handledDays.add(key);
    const first = !existing;
    let stage = existing?.stage ?? 0;
    let intervalDays = existing?.intervalDays ?? 1;
    let dueDate = existing?.dueDate ?? addPracticeDays(item.date, 1);
    if (!first) {
      if (independent(item.outcome)) {
        // An early rehearsal and repeated same-day attempts cannot jump stages.
        if (item.date >= dueDate) {
          // A next-day supported retry first restores the earned interval. It
          // must not skip a longer retention check just by speaking tomorrow.
          if (intervalDays === REVIEW_INTERVALS[stage]) stage = Math.min(REVIEW_INTERVALS.length - 1, stage + 1);
          intervalDays = REVIEW_INTERVALS[stage];
          dueDate = addPracticeDays(item.date, intervalDays);
        }
      } else {
        intervalDays = 1;
        dueDate = addPracticeDays(item.date, 1);
      }
    }
    cardsByPhrase.set(phraseId, {
      eventId: existing?.eventId ?? item.eventId, lessonId: phraseId, phraseId,
      firstDate: existing?.firstDate ?? item.date, lastDate: item.date,
      dueDate, stage, intervalDays,
      completedDays: (existing?.completedDays ?? 0) + 1,
      playCount: (existing?.playCount ?? 0) + 1,
      lastOutcome: item.outcome, lastSequence: item.sequence,
      practicedToday: item.date === date,
    });
    if (item.date === date) {
      if (first) reviewStreak = 0;
      else if (item.mode === 'review') reviewStreak++;
    }
  }
  // Keep core order predictable, with already-played extensions still reviewable.
  // A phrase can have several events, so ordering must also deduplicate by phrase.
  const orderedPhrases = [...new Set([...CORE_PHRASE_EVENT_IDS, ...EVENTS.map(event => event.id)].map(phraseIdFor))];
  const cards = orderedPhrases.filter(id => cardsByPhrase.has(id)).map(id => {
    const {lastSequence, ...card} = cardsByPhrase.get(id);
    return {...card, due: card.dueDate <= date && !card.practicedToday};
  });
  const unseenIds = CORE_PHRASE_EVENT_IDS.filter(id => !cardsByPhrase.has(phraseIdFor(id)));
  const dueIds = cards.filter(card => card.due).sort((a, b) => a.dueDate.localeCompare(b.dueDate)).map(card => card.eventId);
  let next = null;
  if (dueIds.length && (!unseenIds.length || reviewStreak < 2)) {
    const eventId = dueIds[0];
    next = {eventId, mode: 'review', reason: 'due', dueDate: cardsByPhrase.get(phraseIdFor(eventId)).dueDate};
  } else if (unseenIds.length) {
    next = {eventId: unseenIds[0], mode: 'new', reason: dueIds.length ? 'new-after-reviews' : 'unseen', dueDate: null};
  } else if (cards.length) {
    const oldest = [...cardsByPhrase.values()].sort((a, b) => a.lastDate.localeCompare(b.lastDate) || a.lastSequence - b.lastSequence)[0];
    next = {eventId: oldest.eventId, mode: 'free', reason: 'all-current', dueDate: oldest.dueDate};
  }
  return {date, next, cards, dueIds, unseenIds, reviewStreak};
}
