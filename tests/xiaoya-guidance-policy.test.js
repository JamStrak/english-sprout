import test from 'node:test';
import assert from 'node:assert/strict';
import {audioControls, createGuidancePolicy, GUIDANCE_KEY} from '../xiaoya/guidance-policy.js';

function memory(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    values,
  };
}

test('audio controls default on and only the explicit boolean false disables a channel', () => {
  for (const value of [undefined, null, {}, true, 'off', [], {music: 0, reminders: ''},
    {music: 'false', reminders: null}, {music: NaN, reminders: undefined}]) {
    assert.deepEqual(audioControls(value), {music: true, reminders: true});
  }
  assert.deepEqual(audioControls({music: false}), {music: false, reminders: true});
  assert.deepEqual(audioControls({reminders: false}), {music: true, reminders: false});
  assert.deepEqual(audioControls({music: false, reminders: false}), {music: false, reminders: false});
  assert.deepEqual(audioControls({music: true, reminders: true}), {music: true, reminders: true});
});

test('a novice sees the first automatic hint once per context', () => {
  const storage = memory(), policy = createGuidancePolicy({storage});
  assert.equal(policy.status().firstSession, true);
  assert.deepEqual(JSON.parse(storage.getItem(GUIDANCE_KEY)), {visited: true, seen: []});
  assert.equal(policy.allow('reward-choice'), true);
  assert.equal(policy.allow('reward-choice'), false);
  assert.equal(policy.allow('garden-water'), true);
  assert.equal(policy.allow('garden-water'), false);
  assert.deepEqual(JSON.parse(storage.getItem(GUIDANCE_KEY)), {
    visited: true, seen: ['reward-choice', 'garden-water'],
  });
});

test('refresh is a returning session even when the previous visit played no hint', () => {
  const storage = memory();
  createGuidancePolicy({storage});
  const refreshed = createGuidancePolicy({storage});
  assert.equal(refreshed.status().firstSession, false);
  assert.equal(refreshed.allow('reward-choice'), false);
  assert.equal(refreshed.allow('garden-water'), false);
});

test('existing learners migrate as returning users without replaying first-use guidance', () => {
  const storage = memory({'xiaoya-english:learning:v1': 'existing child evidence'});
  const policy = createGuidancePolicy({storage, returning: true});
  assert.equal(policy.status().firstSession, false);
  assert.equal(policy.allow('reward-choice'), false);
  assert.equal(policy.allow('reward-choice', {idle: true}), true);
  assert.equal(storage.getItem('xiaoya-english:learning:v1'), 'existing child evidence');
  assert.deepEqual([...storage.values.keys()], ['xiaoya-english:learning:v1', GUIDANCE_KEY]);
  assert.deepEqual(JSON.parse(storage.getItem(GUIDANCE_KEY)), {visited: true, seen: []});
});

test('idle reminders remain eligible repeatedly for novices and returning users', () => {
  for (const returning of [false, true]) {
    const policy = createGuidancePolicy({storage: memory(), returning});
    policy.allow('reward-choice');
    for (let i = 0; i < 3; i++) assert.equal(policy.allow('reward-choice', {idle: true}), true);
    assert.equal(policy.allow('new-context', {idle: true}), true);
    assert.equal(policy.status().seen.includes('new-context'), false);
  }
});

test('muting reminders suppresses both novice and idle hints without consuming the first hint', () => {
  const policy = createGuidancePolicy({storage: memory()});
  assert.equal(policy.allow('reward-choice', {enabled: false}), false);
  assert.equal(policy.allow('reward-choice', {idle: true, enabled: false}), false);
  assert.deepEqual(policy.status().seen, []);
  assert.equal(policy.allow('reward-choice'), true);
});

test('deliberate help remains available after muting or returning and does not consume novice hints', () => {
  for (const returning of [false, true]) {
    const policy = createGuidancePolicy({storage: memory(), returning});
    assert.equal(policy.allow('reward-choice', {manual: true, enabled: false}), true);
    assert.equal(policy.allow('reward-choice', {manual: true, enabled: false, idle: true}), true);
    assert.deepEqual(policy.status().seen, []);
    assert.equal(policy.allow('reward-choice'), !returning);
  }
});

test('broken stored JSON or shapes recover to a small valid visit record', () => {
  for (const raw of ['broken', 'null', '[]', 'true', '"visited"', '{"visited":"true","seen":7}']) {
    const storage = memory({[GUIDANCE_KEY]: raw});
    const policy = createGuidancePolicy({storage});
    assert.equal(policy.status().firstSession, true);
    assert.equal(policy.allow('reward-choice'), true);
    assert.deepEqual(JSON.parse(storage.getItem(GUIDANCE_KEY)), {visited: true, seen: ['reward-choice']});
  }
});

test('stored context keys are validated and private or unrelated properties are never persisted', () => {
  const storage = memory({[GUIDANCE_KEY]: JSON.stringify({
    visited: false, seen: ['reward-choice', null, 5, '', 'reward-choice', 'garden-water'],
    transcript: 'must not retain', score: 3, learning: {mastered: true},
  })});
  const policy = createGuidancePolicy({storage});
  assert.equal(policy.allow('reward-choice'), false);
  assert.equal(policy.allow('garden-water'), false);
  assert.deepEqual(JSON.parse(storage.getItem(GUIDANCE_KEY)), {
    visited: true, seen: ['reward-choice', 'garden-water'],
  });
  for (const key of [null, undefined, '', 3, {}]) assert.equal(policy.allow(key), false);
  const snapshot = policy.status();
  snapshot.seen.push('not-real');
  assert.equal(policy.status().seen.includes('not-real'), false);
});

test('unavailable or unwritable storage still deduplicates hints in memory', () => {
  for (const storage of [undefined, {
    getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); },
  }, {
    getItem() { return null; }, setItem() { throw new Error('quota exceeded'); },
  }]) {
    const policy = createGuidancePolicy({storage});
    assert.equal(policy.allow('reward-choice'), true);
    assert.equal(policy.allow('reward-choice'), false);
    assert.equal(policy.allow('reward-choice', {idle: true}), true);
    assert.deepEqual(policy.status().seen, ['reward-choice']);
  }
});

test('a stored visited flag keeps the user familiar even if writes are now denied', () => {
  const policy = createGuidancePolicy({storage: {
    getItem() { return JSON.stringify({visited: true, seen: ['garden-water']}); },
    setItem() { throw new Error('quota exceeded'); },
  }});
  assert.equal(policy.status().firstSession, false);
  assert.equal(policy.allow('reward-choice'), false);
  assert.equal(policy.allow('reward-choice', {idle: true}), true);
  assert.equal(policy.allow('reward-choice', {manual: true}), true);
});
