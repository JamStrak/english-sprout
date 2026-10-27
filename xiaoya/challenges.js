import {CORE_PHRASE_EVENT_IDS, phraseIdFor} from './curriculum.js';
import {localDay} from './learning.js';
import {addPracticeDays} from './practice-plan.js';

/** Game progress is separate from the learning evidence and reward ledgers. */
export const CHALLENGE_KEY = 'xiaoya-english:challenges:v1';
export const CHALLENGE_RESULTS = Object.freeze(['independent', 'supported', 'not_yet', 'unclear', 'device_error']);
export const CHALLENGE_UNITS = Object.freeze(Array.from({length: CORE_PHRASE_EVENT_IDS.length / 4}, (_, index) => Object.freeze({
  id: `challenge-${index + 1}`,
  title: `小芽挑战 ${index + 1}`,
  eventIds: Object.freeze(CORE_PHRASE_EVENT_IDS.slice(index * 4, index * 4 + 4)),
})));
export const CHALLENGE_MILESTONES = Object.freeze([3, 6]);
export const INVITATION_INTERVAL_DAYS = 3;
const PRODUCT = 'xiaoya-english-challenges';
const MAX_RECORDS = 20000;
const resultSet = new Set(CHALLENGE_RESULTS);
const unitMap = new Map(CHALLENGE_UNITS.map(unit => [unit.id, unit]));
const fail = message => { throw new Error(`小芽挑战记录无效：${message}`); };
const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);

function fields(value, expected) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) fail('应为普通对象');
  if (Object.keys(value).length !== expected.length || expected.some(key => !own(value, key))) fail('字段缺失或含有未知字段');
}

function identifier(value) {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,159}$/.test(value) || ['constructor', 'prototype', '__proto__'].includes(value)) fail('记录编号错误');
}

function day(value) {
  if (typeof value !== 'string') fail('日期须为本地日历标签');
  return localDay(value);
}

function unitFor(id) {
  const unit = unitMap.get(id);
  if (!unit) fail('未知挑战');
  return unit;
}

function phraseFor(eventId) {
  try { return phraseIdFor(eventId); } catch { fail('未知故事'); }
}

function canonicalFor(unitId, eventId) {
  const phrase = phraseFor(eventId);
  const canonical = unitFor(unitId).eventIds.find(id => phraseFor(id) === phrase);
  if (!canonical) fail('故事不属于当前挑战');
  return canonical;
}

function normalizeAttempt(input) {
  const value = {source: 'machine', retryAfterAttemptId: null, ...input};
  fields(value, ['id', 'unitId', 'eventId', 'date', 'attemptId', 'result', 'helped', 'source', 'retryAfterAttemptId', ...(own(value, 'stars') ? ['stars'] : [])]);
  identifier(value.id); identifier(value.attemptId);
  canonicalFor(value.unitId, value.eventId); day(value.date);
  if (!resultSet.has(value.result) || typeof value.helped !== 'boolean' || !['machine', 'parent'].includes(value.source)) fail('挑战观察错误');
  if (value.retryAfterAttemptId !== null) identifier(value.retryAfterAttemptId);
  // Omitted/null stars are genuine legacy/parent observations, never inferred ratings.
  if (own(value, 'stars') && value.stars !== null && (value.source !== 'machine' || !Number.isInteger(value.stars) || value.stars < 0 || value.stars > 3)) fail('挑战星级错误');
  return {...value, result: value.helped && value.result === 'independent' ? 'supported' : value.result};
}

function normalizeNotice(input) {
  fields(input, ['id', 'unitId', 'date']);
  identifier(input.id); unitFor(input.unitId); day(input.date);
  return {...input};
}

function normalizeHelp(input) {
  fields(input, ['id', 'unitId', 'eventId', 'date']);
  identifier(input.id); canonicalFor(input.unitId, input.eventId); day(input.date);
  return {...input};
}

const same = (a, b) => Object.keys(a).length === Object.keys(b).length && Object.keys(a).every(key => a[key] === b[key]);

export function createChallenges() {
  return {schemaVersion: 2, product: PRODUCT, attempts: [], helps: [], invitations: [], deferrals: []};
}

/** Reject malformed saves; do not repair, trim or erase children's progress. */
export function validateChallenges(state) {
  const legacy = state?.schemaVersion === 1;
  fields(state, ['schemaVersion', 'product', 'attempts', ...(legacy ? [] : ['helps']), 'invitations', 'deferrals']);
  if (![1, 2].includes(state.schemaVersion) || state.product !== PRODUCT) fail('产品或版本不匹配');
  if (legacy) state = {...state, schemaVersion: 2, helps: []};
  for (const key of ['attempts', 'helps', 'invitations', 'deferrals']) {
    if (!Array.isArray(state[key]) || state[key].length > MAX_RECORDS) fail('记录列表错误');
  }
  const ids = new Set(); const attempts = new Map(); const dates = new Map(); const attemptsByUnit = new Map();
  for (const [index, value] of state.attempts.entries()) {
    const normalized = normalizeAttempt(value);
    if (!same(value, normalized)) fail('挑战观察不是规范记录');
    if (ids.has(value.id) || attempts.has(value.attemptId)) fail('挑战观察编号重复');
    if ((dates.get(value.unitId) ?? '') > value.date) fail('挑战日期不能倒退');
    dates.set(value.unitId, value.date);
    if (value.retryAfterAttemptId !== null) {
      const previous = attempts.get(value.retryAfterAttemptId);
      if (!previous || previous.unitId !== value.unitId || phraseFor(previous.eventId) !== phraseFor(value.eventId) || previous.date > value.date) fail('练习后重试来源错误');
    }
    ids.add(value.id); attempts.set(value.attemptId, value);
    if (!attemptsByUnit.has(value.unitId)) attemptsByUnit.set(value.unitId, []);
    attemptsByUnit.get(value.unitId).push({date: value.date, index});
  }
  const helpDates = new Map(); let lastAttemptCount = 0;
  for (const value of state.helps) {
    fields(value, ['id', 'unitId', 'eventId', 'date', 'afterAttemptCount']);
    const {afterAttemptCount, ...input} = value; normalizeHelp(input);
    if (!Number.isInteger(afterAttemptCount) || afterAttemptCount < lastAttemptCount || afterAttemptCount > state.attempts.length) fail('帮助记录顺序错误');
    if (ids.has(value.id)) fail('记录编号重复');
    if ((helpDates.get(value.unitId) ?? '') > value.date) fail('帮助日期不能倒退');
    // A position in the append-only attempt log survives reloads without clocks
    // or recordings, and prevents later help from rewriting an earlier pass.
    const unitAttempts = attemptsByUnit.get(value.unitId) ?? [];
    let low = 0; let high = unitAttempts.length;
    while (low < high) { const middle = (low + high) >>> 1; if (unitAttempts[middle].index < afterAttemptCount) low = middle + 1; else high = middle; }
    if ((unitAttempts[low - 1]?.date ?? '') > value.date || (unitAttempts[low]?.date ?? '9999-12-31') < value.date) fail('帮助与挑战日期顺序错误');
    lastAttemptCount = afterAttemptCount; helpDates.set(value.unitId, value.date); ids.add(value.id);
  }
  const invited = new Set();
  for (const kind of ['invitations', 'deferrals']) {
    let lastDate = '';
    for (const value of state[kind]) {
      normalizeNotice(value);
      if (ids.has(value.id)) fail('记录编号重复');
      if (value.date < lastDate) fail('邀请日期不能倒退');
      if (kind === 'invitations') {
        if (invited.has(value.unitId)) fail('同一挑战只主动邀请一次');
        if (lastDate && value.date < addPracticeDays(lastDate, INVITATION_INTERVAL_DAYS)) fail('主动邀请间隔不足');
        invited.add(value.unitId);
      }
      lastDate = value.date; ids.add(value.id);
    }
  }
  return state;
}

/** Append the actual speech observation before advancing the child UI. An exact
 * replay is idempotent. The caller checks availability against the practice plan;
 * neither this log nor a game pass creates evidence of long-term mastery.
 *
 * Stars govern game progress only: one three-star or two two-star attempts pass.
 * A prompted answer remains supported evidence even when it clears the game.
 * Keep retryAfterAttemptId so help history remains visible across later attempts.
 * Legacy/parent observations without stars retain independent, unhelped passing.
 */
export function recordChallengeAttempt(state, input) {
  state = validateChallenges(state);
  const value = normalizeAttempt(input);
  const previous = state.attempts.find(item => item.id === value.id || item.attemptId === value.attemptId);
  if (previous) {
    if (!same(previous, value)) fail('同一观察编号不能覆盖历史');
    return state;
  }
  if (state.attempts.length >= MAX_RECORDS) fail('挑战记录已达上限，请先导出备份');
  const next = {...state, attempts: [...state.attempts, value]};
  validateChallenges(next);
  return next;
}

/** Derive one expression's game progress from its ordered attempt log. A replay
 * may use an exclusive attempt boundary so historic clears cannot pass a new
 * failed try. Callers pass a single phrase's records; duplicate attempt IDs never
 * count twice. This does not produce or upgrade language mastery evidence. */
export function challengeStepProgress(attempts, {afterAttemptId = null} = {}) {
  if (!Array.isArray(attempts)) fail('挑战观察列表错误');
  let start = 0;
  if (afterAttemptId !== null) {
    identifier(afterAttemptId);
    const boundary = attempts.findIndex(item => item.attemptId === afterAttemptId);
    // A stale/unknown replay boundary must not fall back to an earlier clear.
    start = boundary < 0 ? attempts.length : boundary + 1;
  }
  const seen = new Set();
  let pass = null; let twoStarCount = 0; let passRule = null;
  for (const item of attempts.slice(start)) {
    if (seen.has(item.attemptId)) continue;
    seen.add(item.attemptId);
    if (item.result === 'device_error') continue;
    if (item.stars === undefined || item.stars === null) {
      if (item.result === 'independent' && !item.helped) passRule = 'legacy-independent';
    } else if (item.source === 'machine') {
      if (item.stars === 3) passRule = 'three-stars';
      if (item.stars === 2) {
        twoStarCount = Math.min(2, twoStarCount + 1);
        if (twoStarCount === 2) passRule = 'two-stars-twice';
      }
    }
    if (passRule) { pass = item; break; }
  }
  return {passed: !!pass, pass, passAttemptId: pass?.attemptId ?? null, twoStarCount, passRule};
}

/** Persist before supplying an answer, including when no speech attempt follows.
 * This is help history, not a speech observation or a failed challenge attempt. */
export function recordChallengeHelp(state, input) {
  state = validateChallenges(state);
  const value = normalizeHelp(input);
  const previous = state.helps.find(item => item.id === value.id);
  if (previous) {
    const {afterAttemptCount, ...saved} = previous;
    if (!same(saved, value)) fail('同一帮助编号不能覆盖历史');
    return state;
  }
  if (state.helps.length >= MAX_RECORDS) fail('帮助记录已达上限，请先导出备份');
  const next = {...state, helps: [...state.helps, {...value, afterAttemptCount: state.attempts.length}]};
  validateChallenges(next);
  return next;
}

function appendNotice(state, kind, input) {
  state = validateChallenges(state);
  const value = normalizeNotice(input);
  const previous = state[kind].find(item => item.id === value.id);
  if (previous) {
    if (!same(previous, value)) fail('同一邀请编号不能覆盖历史');
    return state;
  }
  if (state[kind].length >= MAX_RECORDS) fail('邀请记录已达上限，请先导出备份');
  const next = {...state, [kind]: [...state[kind], value]};
  validateChallenges(next);
  return next;
}

/** Record only after the invitation was actually presented. */
export function recordInvitation(state, input) { return appendNotice(state, 'invitations', input); }

/** A child choosing “later” pauses automatic invitations until the next local
 * date. Manual challenge access and already completed steps remain available. */
export function deferInvitation(state, input) { return appendNotice(state, 'deferrals', input); }

function practiceCards(practicePlan, date) {
  const cards = practicePlan?.cards ?? [];
  if (!Array.isArray(cards) || cards.length > MAX_RECORDS) fail('练习安排错误');
  const byPhrase = new Map();
  for (const card of cards) {
    if (!card || typeof card !== 'object' || Array.isArray(card)) fail('练习卡片错误');
    const phrase = phraseFor(card.eventId);
    day(card.firstDate); day(card.lastDate);
    if (card.firstDate > card.lastDate || byPhrase.has(phrase)) fail('练习卡片重复或日期错误');
    byPhrase.set(phrase, card);
  }
  return new Map([...byPhrase].filter(([, card]) => card.firstDate <= date));
}

/** The practicePlan argument is the DERIVED getPracticePlan result, not its raw
 * entries log. Familiar scenes stay fixed to its cards. Only studied expressions
 * enter a unit; readiness affects invitations, never the manual challenge entry.
 */
export function getChallenges(state, {practicePlan = null, date = localDay()} = {}) {
  state = validateChallenges(state); date = localDay(date);
  const cards = practiceCards(practicePlan, date);
  const visibleAttempts = state.attempts.map((item, index) => ({...item, index})).filter(item => item.date <= date);
  const visibleHelps = state.helps.filter(item => item.date <= date);
  const helpKey = item => `${item.unitId}:${phraseFor(item.eventId)}:${item.date}`;
  const firstHelpPosition = new Map();
  for (const help of visibleHelps) if (!firstHelpPosition.has(helpKey(help))) firstHelpPosition.set(helpKey(help), help.afterAttemptCount);
  const helpBefore = attempt => (firstHelpPosition.get(helpKey(attempt)) ?? Infinity) <= attempt.index;
  const attemptsById = new Map(visibleAttempts.map(item => [item.attemptId, item]));
  const linkedHelp = pass => {
    let previous = pass?.retryAfterAttemptId ? attemptsById.get(pass.retryAfterAttemptId) : null;
    while (previous) {
      if (previous.helped || previous.result === 'supported' || helpBefore(previous)) return true;
      previous = previous.retryAfterAttemptId ? attemptsById.get(previous.retryAfterAttemptId) : null;
    }
    return false;
  };
  const units = CHALLENGE_UNITS.map(unit => {
    const records = visibleAttempts.filter(item => item.unitId === unit.id);
    const items = unit.eventIds.map(canonicalEventId => {
      const phrase = phraseFor(canonicalEventId);
      const card = cards.get(phrase);
      const attempts = records.filter(item => phraseFor(item.eventId) === phrase);
      const progress = challengeStepProgress(attempts);
      const pass = progress.pass;
      // Even a caller that omits a retry link cannot erase same-day help.
      const priorHelp = !!pass && (pass.helped || pass.result === 'supported' || helpBefore(pass) || linkedHelp(pass) || attempts.some(item => item.index < pass.index && (item.date === pass.date || progress.passRule === 'two-stars-twice' && item.stars === 2) && (item.helped || item.result === 'supported' || helpBefore(item) || linkedHelp(item))));
      const helpedToday = firstHelpPosition.has(helpKey({unitId: unit.id, eventId: canonicalEventId, date})) || attempts.some(item => item.date === date && (item.helped || item.result === 'supported'));
      const linkedRetry = !!pass?.retryAfterAttemptId;
      return {
        canonicalEventId, eventId: card?.eventId ?? canonicalEventId,
        studied: !!card, passed: !!pass, passedOn: pass?.date ?? null,
        passAttemptId: pass?.attemptId ?? null,
        passEvidence: !pass ? null : priorHelp || linkedRetry || progress.passRule === 'two-stars-twice' ? 'after-practice' : pass.source === 'parent' ? 'parent-independent' : 'machine-candidate',
        twoStarCount: progress.twoStarCount, passRule: progress.passRule,
        priorHelp, helpedToday, latestResult: attempts.at(-1)?.result ?? null,
        attemptCount: attempts.length,
      };
    });
    const available = items.every(item => item.studied);
    const ready = available && items.every(item => cards.get(phraseFor(item.canonicalEventId)).firstDate < date) && items.filter(item => {
      const card = cards.get(phraseFor(item.canonicalEventId));
      return card.lastDate <= date && ['parent-independent', 'machine-candidate'].includes(card.lastOutcome);
    }).length >= 3;
    const completed = items.every(item => item.passed);
    const passIds = new Set(items.map(item => item.passAttemptId).filter(Boolean));
    const firstClear = completed ? records.filter(item => passIds.has(item.attemptId)).at(-1) : null;
    return {
      id: unit.id, title: unit.title, eventIds: [...unit.eventIds], items,
      available, ready, completed, completedCount: items.filter(item => item.passed).length,
      completedEventIds: items.filter(item => item.passed).map(item => item.canonicalEventId),
      nextEventId: items.find(item => !item.passed)?.eventId ?? null,
      completedOn: firstClear?.date ?? null,
      receiptId: completed ? `challenge:first-clear:${unit.id}` : null,
      firstClearIndex: firstClear?.index ?? null,
    };
  });
  const cleared = units.filter(unit => unit.completed).sort((a, b) => a.firstClearIndex - b.firstClearIndex);
  const receipts = cleared.map(unit => ({id: unit.receiptId, unitId: unit.id, date: unit.completedOn}));
  const milestones = CHALLENGE_MILESTONES.map(count => ({
    count, reached: cleared.length >= count,
    receiptId: cleared.length >= count ? `challenge:milestone:${count}` : null,
    date: cleared[count - 1]?.completedOn ?? null,
    unitId: cleared[count - 1]?.id ?? null,
  }));
  return {date, units, completedUnitIds: cleared.map(unit => unit.id), completedCount: cleared.length, receipts, milestones};
}

/** One first-time invitation per eligible unit and at least three local dates
 * between invitations. Callers may disable all automatic invites; manual access
 * is always independently available through getChallenges(). */
export function invitationFor(state, {practicePlan = null, date = localDay(), enabled = true} = {}) {
  const summary = getChallenges(state, {practicePlan, date});
  if (typeof enabled !== 'boolean') fail('邀请开关错误');
  if (!enabled) return null;
  date = summary.date;
  const invitations = state.invitations.filter(item => item.date <= date);
  const latest = invitations.at(-1);
  if (latest && date < addPracticeDays(latest.date, INVITATION_INTERVAL_DAYS)) return null;
  if (state.deferrals.some(item => item.date <= date && date < addPracticeDays(item.date, 1))) return null;
  const invited = new Set(invitations.map(item => item.unitId));
  return summary.units.find(unit => unit.ready && !unit.completed && !invited.has(unit.id)) ?? null;
}
