import test from 'node:test';
import assert from 'node:assert/strict';
import {CORE_PHRASE_EVENT_IDS, phraseIdFor, phraseEvents} from '../xiaoya/curriculum.js';
import {createState, recordEvidence} from '../xiaoya/learning.js';
import {createPracticePlan, recordPractice, getPracticePlan} from '../xiaoya/practice-plan.js';
import {
  CHALLENGE_KEY, CHALLENGE_UNITS, CHALLENGE_RESULTS, CHALLENGE_MILESTONES,
  createChallenges, validateChallenges, recordChallengeAttempt, recordChallengeHelp, getChallenges,
  recordInvitation, deferInvitation, invitationFor,
} from '../xiaoya/challenges.js';

const today = '2026-10-19';
const yesterday = '2026-10-18';
const first = CHALLENGE_UNITS[0];
const clone = value => JSON.parse(JSON.stringify(value));
function freeze(value) {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
}
function input(id = 'one', overrides = {}) {
  return {id, unitId: first.id, eventId: first.eventIds[0], date: today, attemptId: `speech-${id}`, result: 'independent', helped: false, ...overrides};
}
function helpInput(id = 'help-one', overrides = {}) {
  return {id, unitId: first.id, eventId: first.eventIds[0], date: today, ...overrides};
}
function studied(count = 4, {date = yesterday, outcome = 'machine-candidate'} = {}) {
  return {cards: CORE_PHRASE_EVENT_IDS.slice(0, count).map(eventId => ({eventId, firstDate: date, lastDate: date, lastOutcome: outcome}))};
}
function passUnit(state, unit = first, date = today, prefix = unit.id) {
  for (const [index, eventId] of unit.eventIds.entries()) {
    state = recordChallengeAttempt(state, input(`${prefix}-${index}`, {unitId: unit.id, eventId, date}));
  }
  return state;
}

test('21 fixed units cover 84 distinct core expressions, keeping six legacy units and only two seed milestones', () => {
  assert.equal(CHALLENGE_KEY, 'xiaoya-english:challenges:v1');
  assert.deepEqual(CHALLENGE_UNITS.flatMap(unit => unit.eventIds), CORE_PHRASE_EVENT_IDS);
  assert.equal(CHALLENGE_UNITS.length, 21);
  assert.ok(CHALLENGE_UNITS.every(unit => unit.eventIds.length === 4));
  assert.deepEqual(CHALLENGE_UNITS.map(unit => unit.id), Array.from({length: 21}, (_, index) => `challenge-${index + 1}`));
  assert.deepEqual(CHALLENGE_UNITS.slice(0, 6).map(unit => unit.eventIds), [
    ['hello-everyone', 'hello-morning', 'family-love', 'hello-thanks'],
    ['hello-youre-welcome', 'hello-sorry', 'hello-okay', 'hello-goodbye'],
    ['bed-night', 'hello-welcome', 'hello-excuse', 'outside-go-home'],
    ['outside-ready', 'family-come', 'food-eat', 'food-hungry'],
    ['feelings-happy', 'feelings-tired', 'play-turn', 'play-your-turn'],
    ['play-can-do', 'play-did-it', 'play-good-job', 'play-again'],
  ]);
  assert.equal(new Set(CHALLENGE_UNITS.flatMap(unit => unit.eventIds.map(phraseIdFor))).size, 84);
  assert.deepEqual(CHALLENGE_RESULTS, ['independent', 'supported', 'not_yet', 'unclear', 'device_error']);
  assert.deepEqual(CHALLENGE_MILESTONES, [3, 6]);
  assert.ok(Object.isFrozen(CHALLENGE_UNITS) && CHALLENGE_UNITS.every(unit => Object.isFrozen(unit) && Object.isFrozen(unit.eventIds)));
});

test('attempt metadata is immutable, serialized, idempotent and contains no child recordings or text', () => {
  const before = freeze(createChallenges()); const value = freeze(input());
  const next = recordChallengeAttempt(before, value);
  assert.equal(before.attempts.length, 0);
  assert.equal(next.attempts[0].source, 'machine');
  assert.equal(next.attempts[0].retryAfterAttemptId, null);
  assert.equal(validateChallenges(next), next);
  assert.deepEqual(validateChallenges(clone(next)), next);
  assert.equal(recordChallengeAttempt(next, value), next);
  for (const patch of [{result: 'supported'}, {date: '2026-10-20'}, {source: 'parent'}, {id: 'other'}, {attemptId: 'other'}]) {
    assert.throws(() => recordChallengeAttempt(next, {...value, ...patch}), /不能覆盖/);
  }
  for (const extra of [{transcript: 'private'}, {audio: 'private'}, {stars: 3}]) {
    assert.throws(() => recordChallengeAttempt(before, {...value, ...extra}), /未知字段/);
  }
});

test('fresh child sees no eligible invitation; manual challenge opens after all four expressions studied without readiness gating', () => {
  const state = freeze(createChallenges());
  assert.equal(getChallenges(state).units[0].available, false);
  assert.equal(invitationFor(state, {date: today}), null);
  assert.equal(getChallenges(state, {practicePlan: studied(3), date: today}).units[0].available, false);
  const practicePlan = studied(4, {date: today, outcome: 'supported'});
  const unit = getChallenges(state, {practicePlan, date: today}).units[0];
  assert.equal(unit.available, true);
  assert.equal(unit.ready, false);
  assert.equal(unit.nextEventId, first.eventIds[0]);
  assert.equal(invitationFor(state, {practicePlan, date: today}), null);
  assert.equal(practicePlan.cards[0].lastOutcome, 'supported', 'challenge status never modifies ordinary scheduling');
});

test('readiness uses previous-day exposure plus at least three tentative/parent independent latest outcomes', () => {
  const state = createChallenges(); const practicePlan = studied();
  practicePlan.cards[0].lastOutcome = 'supported';
  assert.equal(getChallenges(state, {practicePlan, date: today}).units[0].ready, true);
  practicePlan.cards[1].lastOutcome = 'not-attempted';
  assert.equal(getChallenges(state, {practicePlan, date: today}).units[0].ready, false);
  practicePlan.cards[1].lastOutcome = 'parent-independent';
  assert.equal(getChallenges(state, {practicePlan, date: today}).units[0].ready, true);
  practicePlan.cards[0].firstDate = today; practicePlan.cards[0].lastDate = today;
  assert.equal(getChallenges(state, {practicePlan, date: today}).units[0].ready, false);
});

test('real practice plan integration retains the first familiar scene rather than automatically switching pictures', () => {
  let practice = createPracticePlan(); let learning = createState();
  for (const eventId of first.eventIds) {
    const attemptId = `practiced-${eventId}`;
    learning = recordEvidence(learning, {attemptId, eventId, date: yesterday, result: 'independent', helped: false, source: 'machine', kind: 'speech'});
    practice = recordPractice(practice, {roundId: `round-${eventId}`, eventId, date: yesterday, attemptId, mode: 'new'});
  }
  const practicePlan = getPracticePlan(practice, {learningState: learning, date: today});
  const unit = getChallenges(createChallenges(), {practicePlan, date: today}).units[0];
  assert.equal(unit.ready, true);
  assert.deepEqual(unit.items.map(item => item.eventId), practicePlan.cards.map(card => card.eventId));
  const withAlternative = CHALLENGE_UNITS.flatMap(unit => unit.eventIds.map(eventId => ({unit, eventId})))
    .find(({eventId}) => phraseEvents(eventId).some(event => event.id !== eventId));
  if (withAlternative) {
    const alternate = phraseEvents(withAlternative.eventId).find(event => event.id !== withAlternative.eventId).id;
    const plan = studied(24); plan.cards.find(card => card.eventId === withAlternative.eventId).eventId = alternate;
    const saved = recordChallengeAttempt(createChallenges(), input('alternate', {unitId: withAlternative.unit.id, eventId: alternate}));
    const item = getChallenges(saved, {practicePlan: plan, date: today}).units.find(unit => unit.id === withAlternative.unit.id).items.find(item => item.canonicalEventId === withAlternative.eventId);
    assert.equal(item.eventId, alternate);
    assert.equal(item.passed, true);
  }
});

test('supported, unsuccessful, uncertain and device-error attempts do not pass a step; uncertainty is preserved', () => {
  for (const result of ['supported', 'not_yet', 'unclear', 'device_error']) {
    const state = recordChallengeAttempt(createChallenges(), input(result, {result}));
    const unit = getChallenges(state, {date: today}).units[0];
    assert.equal(unit.completedCount, 0);
    assert.equal(unit.items[0].latestResult, result);
    assert.equal(unit.items[0].passEvidence, null);
  }
  const helped = recordChallengeAttempt(createChallenges(), input('helped', {helped: true}));
  assert.equal(helped.attempts[0].result, 'supported');
  assert.equal(getChallenges(helped, {date: today}).units[0].completedCount, 0);
});

test('targeted practice then a fresh unprompted retry may clear the game while preserving help history', () => {
  let state = recordChallengeAttempt(createChallenges(), input('help', {result: 'supported', helped: true}));
  state = recordChallengeAttempt(state, input('retry', {retryAfterAttemptId: 'speech-help'}));
  const item = getChallenges(state, {date: today}).units[0].items[0];
  assert.equal(item.passed, true);
  assert.equal(item.passEvidence, 'after-practice');
  assert.equal(item.priorHelp, true);
  assert.equal(item.attemptCount, 2);
  assert.equal(state.attempts[0].helped, true);
  assert.equal(state.attempts[1].source, 'machine');
  assert.equal(Object.hasOwn(item, 'mastered'), false);
  const noLink = recordChallengeAttempt(recordChallengeAttempt(createChallenges(), input('help', {helped: true})), input('retry'));
  assert.equal(getChallenges(noLink, {date: today}).units[0].items[0].passEvidence, 'after-practice');
  let overnight = recordChallengeAttempt(createChallenges(), input('old-help', {date: yesterday, helped: true}));
  overnight = recordChallengeAttempt(overnight, input('intermediate', {date: yesterday, result: 'unclear', retryAfterAttemptId: 'speech-old-help'}));
  overnight = recordChallengeAttempt(overnight, input('linked-next-day', {retryAfterAttemptId: 'speech-intermediate'}));
  const overnightItem = getChallenges(overnight, {date: today}).units[0].items[0];
  assert.equal(overnightItem.priorHelp, true, 'a retry link cannot erase help just because midnight passed');
  assert.equal(overnightItem.passEvidence, 'after-practice');
  assert.throws(() => recordChallengeAttempt(state, input('bad-link', {eventId: first.eventIds[1], retryAfterAttemptId: 'speech-help'})), /来源错误/);
  assert.throws(() => recordChallengeAttempt(state, input('missing-link', {retryAfterAttemptId: 'missing'})), /来源错误/);
});

test('requested help persists without inventing a speech attempt and is immutable and idempotent', () => {
  const before = freeze(createChallenges()); const value = freeze(helpInput());
  const state = recordChallengeHelp(before, value);
  assert.equal(before.helps.length, 0);
  assert.deepEqual(state.helps, [{...value, afterAttemptCount: 0}]);
  assert.deepEqual(state.attempts, []);
  assert.equal(recordChallengeHelp(state, value), state);
  const restored = validateChallenges(clone(state));
  const item = getChallenges(restored, {date: today}).units[0].items[0];
  assert.equal(item.helpedToday, true);
  assert.equal(item.passed, false);
  assert.equal(item.attemptCount, 0);
  assert.equal(item.latestResult, null);
  assert.equal(item.passEvidence, null);
  assert.equal(getChallenges(restored, {date: today}).units[0].items[1].helpedToday, false);
});

test('help followed by leaving and restoring the save still marks a same-day fresh pass as after-practice', () => {
  const helped = recordChallengeHelp(createChallenges(), helpInput());
  const restored = freeze(clone(helped));
  const passed = recordChallengeAttempt(restored, input('after-return', {source: 'parent'}));
  const item = getChallenges(passed, {date: today}).units[0].items[0];
  assert.equal(item.passed, true, 'a fresh answer may clear the game');
  assert.equal(item.priorHelp, true);
  assert.equal(item.helpedToday, true);
  assert.equal(item.passEvidence, 'after-practice');
  assert.equal(item.attemptCount, 1, 'help is not a pretend speech attempt');
  assert.equal(passed.attempts[0].helped, false);
  assert.equal(passed.attempts[0].retryAfterAttemptId, null);
  assert.equal(recordChallengeHelp(passed, helpInput()), passed, 'replaying the same help does not move it after the pass');
});

test('same-day help is phrase-specific, does not carry into a new day, and future help is ignored', () => {
  let state = recordChallengeHelp(createChallenges(), helpInput('old-help', {date: yesterday}));
  state = recordChallengeHelp(state, helpInput('other-help', {eventId: first.eventIds[1]}));
  state = recordChallengeAttempt(state, input('next-day-answer'));
  const current = getChallenges(state, {date: today}).units[0].items[0];
  assert.equal(current.helpedToday, false);
  assert.equal(current.priorHelp, false);
  assert.equal(current.passEvidence, 'machine-candidate');
  const previous = getChallenges(state, {date: yesterday}).units[0].items;
  assert.equal(previous[0].helpedToday, true);
  assert.equal(previous[0].passed, false);
  assert.equal(previous[1].helpedToday, false);
  assert.equal(getChallenges(state, {date: '2026-10-20'}).units[0].items[1].helpedToday, false);
  let legacy = recordChallengeAttempt(createChallenges(), input('supported', {helped: true}));
  assert.equal(getChallenges(legacy, {date: today}).units[0].items[0].helpedToday, true, 'existing helped observations also expose current-day assistance');
});

test('help requested after an existing independent pass never rewrites that earlier evidence', () => {
  let state = recordChallengeAttempt(createChallenges(), input('first-pass', {source: 'parent'}));
  state = recordChallengeHelp(state, helpInput());
  state = recordChallengeAttempt(state, input('later-pass', {source: 'parent'}));
  const item = getChallenges(clone(state), {date: today}).units[0].items[0];
  assert.equal(state.helps[0].afterAttemptCount, 1);
  assert.equal(item.passAttemptId, 'speech-first-pass');
  assert.equal(item.helpedToday, true);
  assert.equal(item.priorHelp, false);
  assert.equal(item.passEvidence, 'parent-independent');
});

test('standalone help remains discoverable through a linked retry across midnight', () => {
  let state = recordChallengeHelp(createChallenges(), helpInput('last-night-help', {date: yesterday}));
  state = recordChallengeAttempt(state, input('unclear-last-night', {date: yesterday, result: 'unclear'}));
  state = recordChallengeAttempt(state, input('linked-today', {retryAfterAttemptId: 'speech-unclear-last-night'}));
  const item = getChallenges(state, {date: today}).units[0].items[0];
  assert.equal(item.helpedToday, false);
  assert.equal(item.priorHelp, true);
  assert.equal(item.passEvidence, 'after-practice');
});

test('schema 1 saves strictly normalize without changing progress, receipts, or their source object', () => {
  const current = passUnit(createChallenges());
  const {helps, ...oldFields} = current;
  const old = freeze({...oldFields, schemaVersion: 1});
  const migrated = validateChallenges(old);
  assert.equal(old.schemaVersion, 1);
  assert.equal(Object.hasOwn(old, 'helps'), false);
  assert.equal(migrated.schemaVersion, 2);
  assert.deepEqual(migrated.helps, []);
  assert.deepEqual(getChallenges(old, {date: today}), getChallenges(current, {date: today}));
  assert.equal(recordChallengeAttempt(old, input(`${first.id}-0`)).schemaVersion, 2);
  assert.equal(recordChallengeHelp(old, helpInput()).schemaVersion, 2);
  assert.equal(recordInvitation(old, {id: 'old-invite', unitId: first.id, date: today}).schemaVersion, 2);
  assert.equal(deferInvitation(old, {id: 'old-defer', unitId: first.id, date: today}).schemaVersion, 2);
  assert.throws(() => validateChallenges({...old, helps: []}), /未知字段/);
  assert.throws(() => validateChallenges({...old, attempts: [{...old.attempts[0], audio: 'private'}]}), /未知字段/);
});

test('help logs reject unknown or duplicate identifiers, wrong phrases, private fields and invalid ordering', () => {
  const empty = createChallenges(); const state = recordChallengeHelp(empty, helpInput());
  for (const patch of [{unitId: 'challenge-22'}, {eventId: 'missing'}, {eventId: CHALLENGE_UNITS[1].eventIds[0]}, {date: '2026-02-29'}, {audio: 'private'}, {afterAttemptCount: 0}]) {
    assert.throws(() => recordChallengeHelp(empty, {...helpInput(), ...patch}));
  }
  assert.throws(() => recordChallengeHelp(state, helpInput('help-one', {eventId: first.eventIds[1]})), /不能覆盖/);
  assert.throws(() => recordChallengeAttempt(state, input('help-one')), /编号重复/);
  assert.throws(() => recordInvitation(state, {id: 'help-one', unitId: first.id, date: today}), /编号重复/);
  assert.throws(() => recordChallengeHelp(recordChallengeAttempt(empty, input()), helpInput('one')), /编号重复/);
  assert.throws(() => recordChallengeHelp(state, helpInput('earlier', {date: yesterday})), /日期不能倒退/);
  assert.throws(() => recordChallengeAttempt(state, input('earlier', {date: yesterday})), /日期顺序错误/);
  assert.throws(() => recordChallengeHelp(recordChallengeAttempt(empty, input()), helpInput('earlier', {date: yesterday})), /日期顺序错误/);
  for (const afterAttemptCount of [-1, 1, 0.5, '0']) {
    assert.throws(() => validateChallenges({...state, helps: [{...state.helps[0], afterAttemptCount}]}), /顺序错误/);
  }
  assert.throws(() => validateChallenges({...state, helps: [...state.helps, ...state.helps]}), /编号重复/);
  assert.throws(() => validateChallenges({...state, helps: Array(20001).fill(state.helps[0])}), /列表错误/);
  let ordered = recordChallengeAttempt(state, input());
  ordered = recordChallengeHelp(ordered, helpInput('second-help'));
  assert.throws(() => validateChallenges({...ordered, helps: [...ordered.helps].reverse()}), /顺序错误/);
});

test('machine candidates and parent observations stay distinct, never imply pronunciation or retained mastery', () => {
  for (const source of ['machine', 'parent']) {
    const state = recordChallengeAttempt(createChallenges(), input(source, {source}));
    const summary = getChallenges(state, {date: today});
    assert.equal(summary.units[0].items[0].passEvidence, source === 'machine' ? 'machine-candidate' : 'parent-independent');
    assert.equal(Object.hasOwn(summary, 'retained'), false);
  }
});

test('cleared steps persist after failed retries and refresh; next challenge item skips completed steps', () => {
  let state = recordChallengeAttempt(createChallenges(), input('first'));
  state = recordChallengeAttempt(state, input('second', {eventId: first.eventIds[1]}));
  state = recordChallengeAttempt(state, input('unsure-again', {result: 'unclear'}));
  const unit = getChallenges(freeze(clone(state)), {date: today}).units[0];
  assert.equal(unit.completedCount, 2);
  assert.equal(unit.nextEventId, first.eventIds[2]);
  assert.equal(unit.items[0].passed, true);
  assert.equal(unit.items[0].latestResult, 'unclear');
  assert.deepEqual(unit.completedEventIds, first.eventIds.slice(0, 2));
});

test('first clears generate one stable receipt per unit and milestones only at three and six distinct clears', () => {
  let state = createChallenges();
  for (let index = 0; index < CHALLENGE_UNITS.length; index++) {
    const unit = CHALLENGE_UNITS[index];
    state = passUnit(state, unit);
    const summary = getChallenges(state, {date: today});
    assert.equal(summary.completedCount, index + 1);
    assert.equal(summary.receipts.length, index + 1);
    assert.deepEqual(summary.receipts[index], {id: `challenge:first-clear:${unit.id}`, unitId: unit.id, date: today});
    assert.equal(summary.milestones[0].reached, index >= 2);
    assert.equal(summary.milestones[1].reached, index >= 5);
    assert.deepEqual(summary.milestones.map(milestone => milestone.count), [3, 6]);
  }
  const before = getChallenges(state, {date: today});
  state = passUnit(state, first, '2026-10-20', 'repeat');
  const after = getChallenges(state, {date: '2026-10-20'});
  assert.deepEqual(after.receipts, before.receipts);
  assert.deepEqual(after.milestones, before.milestones);
  assert.equal(after.units[0].nextEventId, null);
  assert.equal(after.milestones[0].receiptId, 'challenge:milestone:3');
  assert.equal(after.milestones[1].receiptId, 'challenge:milestone:6');
});

test('completion order drives milestones even when a child freely completes later units first', () => {
  let state = createChallenges();
  for (const index of [5, 0, 3]) state = passUnit(state, CHALLENGE_UNITS[index]);
  const summary = getChallenges(state, {date: today});
  assert.deepEqual(summary.completedUnitIds, ['challenge-6', 'challenge-1', 'challenge-4']);
  assert.equal(summary.milestones[0].unitId, 'challenge-4');
  assert.equal(summary.milestones[1].reached, false);
});

test('invitations occur once per ready unit with three-day spacing and do not lock self-initiated challenges', () => {
  const practicePlan = studied(24); let state = createChallenges();
  assert.equal(invitationFor(state, {practicePlan, date: today}).id, first.id);
  const invite = {id: 'invite-first', unitId: first.id, date: today};
  state = recordInvitation(state, invite);
  assert.equal(recordInvitation(state, invite), state);
  assert.equal(invitationFor(state, {practicePlan, date: today}), null);
  assert.equal(invitationFor(state, {practicePlan, date: '2026-10-21'}), null);
  assert.equal(invitationFor(state, {practicePlan, date: '2026-10-22'}).id, 'challenge-2');
  assert.equal(getChallenges(state, {practicePlan, date: today}).units[1].available, true);
  assert.throws(() => recordInvitation(state, {id: 'duplicate', unitId: first.id, date: '2026-10-22'}), /只主动邀请一次/);
  assert.throws(() => recordInvitation(state, {id: 'soon', unitId: 'challenge-2', date: '2026-10-20'}), /间隔不足/);
  assert.equal(invitationFor(state, {practicePlan, date: '2026-10-22', enabled: false}), null);
});

test('defer pauses automatic invitations for the local day, leaves progress intact and accepts idempotent replay', () => {
  const practicePlan = studied(24); const input = {id: 'later', unitId: first.id, date: today};
  const state = deferInvitation(createChallenges(), input);
  assert.equal(deferInvitation(state, input), state);
  assert.equal(invitationFor(state, {practicePlan, date: today}), null);
  assert.equal(invitationFor(state, {practicePlan, date: '2026-10-20'}).id, first.id);
  assert.equal(getChallenges(state, {practicePlan, date: today}).units[0].available, true);
  assert.throws(() => deferInvitation(state, {...input, unitId: 'challenge-2'}), /不能覆盖/);
});

test('completed units are never automatically invited, and unsupported readiness never generates an invitation', () => {
  const state = passUnit(createChallenges());
  assert.equal(invitationFor(state, {practicePlan: studied(24), date: today}).id, 'challenge-2');
  assert.equal(invitationFor(state, {practicePlan: studied(24, {outcome: 'supported'}), date: today}), null);
});

test('as-of queries ignore future attempts, notices and exposure without applying future readiness', () => {
  let state = passUnit(createChallenges(), first, '2026-10-20');
  state = recordInvitation(state, {id: 'future-invite', unitId: first.id, date: '2026-10-20'});
  state = deferInvitation(state, {id: 'future-defer', unitId: first.id, date: '2026-10-20'});
  const previous = getChallenges(state, {practicePlan: studied(), date: today});
  assert.equal(previous.completedCount, 0);
  assert.equal(invitationFor(state, {practicePlan: studied(), date: today}).id, first.id);
  const futureCards = studied(4, {date: '2026-10-20'});
  assert.equal(getChallenges(state, {practicePlan: futureCards, date: today}).units[0].available, false);
  const futureOutcome = studied(); futureOutcome.cards.forEach(card => { card.lastDate = '2026-10-20'; });
  assert.equal(getChallenges(state, {practicePlan: futureOutcome, date: today}).units[0].ready, false);
});

test('calendar labels use local date components and maintain leap/year invitation boundaries', () => {
  const date = new Date(2026, 9, 19, 0, 1);
  assert.equal(getChallenges(createChallenges(), {date}).date, today);
  const practicePlan = studied(24, {date: '2024-02-20'});
  let state = recordInvitation(createChallenges(), {id: 'leap', unitId: first.id, date: '2024-02-28'});
  assert.equal(invitationFor(state, {practicePlan, date: '2024-03-01'}), null);
  assert.equal(invitationFor(state, {practicePlan, date: '2024-03-02'}).id, 'challenge-2');
  state = recordInvitation(createChallenges(), {id: 'year', unitId: first.id, date: '2026-12-30'});
  assert.equal(invitationFor(state, {practicePlan, date: '2027-01-01'}), null);
  assert.equal(invitationFor(state, {practicePlan, date: '2027-01-02'}).id, 'challenge-2');
  assert.throws(() => recordChallengeAttempt(createChallenges(), input('date-object', {date})), /本地日历/);
});

test('malformed logs reject unknown IDs, non-unit expressions, forged results, duplicate IDs and backwards dates', () => {
  const valid = recordChallengeAttempt(createChallenges(), input());
  for (const invalid of [
    null, {}, {...valid, schemaVersion: 3}, {...valid, product: 'old-product'},
    {...valid, attempts: [...valid.attempts, ...valid.attempts]},
    {...valid, attempts: [{...valid.attempts[0], id: '__proto__'}]},
    {...valid, attempts: [{...valid.attempts[0], eventId: 'unknown'}]},
    {...valid, attempts: [{...valid.attempts[0], eventId: CHALLENGE_UNITS[1].eventIds[0]}]},
    {...valid, attempts: [{...valid.attempts[0], unitId: 'challenge-22'}]},
    {...valid, attempts: [{...valid.attempts[0], result: 'three-stars'}]},
    {...valid, attempts: [{...valid.attempts[0], helped: 0}]},
    {...valid, attempts: [{...valid.attempts[0], helped: true}]},
    {...valid, attempts: [{...valid.attempts[0], source: 'robot'}]},
    {...valid, attempts: [{...valid.attempts[0], date: '2026-02-29'}]},
    {...valid, attempts: [{...valid.attempts[0], extra: true}]},
    {...valid, attempts: Array(20001).fill(valid.attempts[0])},
  ]) {
    const before = clone(invalid);
    assert.throws(() => validateChallenges(invalid));
    assert.deepEqual(invalid, before);
  }
  assert.throws(() => recordChallengeAttempt(valid, input('back', {date: yesterday})), /日期不能倒退/);
  assert.throws(() => recordInvitation(valid, {id: 'one', unitId: first.id, date: today}), /编号重复/);
  assert.throws(() => getChallenges(valid, {practicePlan: {cards: [...studied().cards, studied().cards[0]]}, date: today}), /重复/);
});

test('a serialized six-unit-era save keeps clears and help history while new units require their own studied phrases', () => {
  const old = {
    schemaVersion: 2, product: 'xiaoya-english-challenges',
    attempts: ['hello-everyone', 'hello-morning', 'family-love', 'hello-thanks'].map((eventId, index) => ({
      id: `old-step-${index}`, unitId: 'challenge-1', eventId, date: yesterday,
      attemptId: `old-speech-${index}`, result: 'independent', helped: false, source: 'parent', retryAfterAttemptId: null,
    })),
    helps: [{id: 'old-help', unitId: 'challenge-2', eventId: 'hello-sorry', date: yesterday, afterAttemptCount: 4}],
    invitations: [{id: 'old-invitation', unitId: 'challenge-1', date: '2026-10-16'}],
    deferrals: [{id: 'old-later', unitId: 'challenge-2', date: yesterday}],
  };
  const restored = validateChallenges(clone(old));
  assert.deepEqual(restored, old);
  const summary = getChallenges(restored, {practicePlan: studied(24), date: today});
  assert.equal(summary.units.length, 21);
  assert.deepEqual(summary.completedUnitIds, ['challenge-1']);
  assert.deepEqual(summary.receipts, [{id: 'challenge:first-clear:challenge-1', unitId: 'challenge-1', date: yesterday}]);
  assert.ok(summary.units.slice(6).every(unit => !unit.available && !unit.ready && unit.completedCount === 0));
  const expanded = getChallenges(restored, {practicePlan: studied(28), date: today});
  assert.equal(expanded.units[6].available, true);
  assert.equal(expanded.units[6].ready, true);
  assert.ok(expanded.units.slice(7).every(unit => !unit.available));
  const completed = passUnit(restored, CHALLENGE_UNITS[6]);
  assert.deepEqual(completed.helps, old.helps);
  assert.deepEqual(completed.invitations, old.invitations);
  assert.deepEqual(completed.deferrals, old.deferrals);
  assert.deepEqual(completed.attempts.slice(0, 4), old.attempts);
  assert.deepEqual(validateChallenges(clone(completed)), completed);
  assert.deepEqual(getChallenges(completed, {date: today}).completedUnitIds, ['challenge-1', 'challenge-7']);
  assert.deepEqual(restored, old);
});

test('last new unit is independently reachable without clearing earlier units or generating extra seed milestones', () => {
  const unit = CHALLENGE_UNITS[20];
  const practicePlan = {cards: unit.eventIds.map(eventId => ({eventId, firstDate: yesterday, lastDate: yesterday, lastOutcome: 'machine-candidate'}))};
  let state = createChallenges();
  const before = getChallenges(state, {practicePlan, date: today});
  assert.ok(before.units.slice(0, 20).every(item => !item.available));
  assert.equal(before.units[20].available, true);
  assert.equal(before.units[20].ready, true);
  assert.equal(invitationFor(state, {practicePlan, date: today}).id, 'challenge-21');
  state = passUnit(state, unit);
  const after = getChallenges(validateChallenges(clone(state)), {practicePlan, date: today});
  assert.deepEqual(after.completedUnitIds, ['challenge-21']);
  assert.deepEqual(after.receipts, [{id: 'challenge:first-clear:challenge-21', unitId: 'challenge-21', date: today}]);
  assert.deepEqual(after.milestones.map(item => [item.count, item.reached]), [[3, false], [6, false]]);
  const replayed = passUnit(state, unit, '2026-10-20', 'last-replay');
  assert.deepEqual(getChallenges(replayed, {date: '2026-10-20'}).receipts, after.receipts);
});
