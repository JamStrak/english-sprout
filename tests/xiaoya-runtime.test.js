import test from 'node:test';
import assert from 'node:assert/strict';
import {createMemoryStorage, createSandboxStorage, INTERNAL_BUILD, GM_SANDBOX, appStorage} from '../xiaoya/runtime.js';

test('GM memory records are independent from both their input and other test sessions', () => {
  const child = {voice: 'ryan', progress: '{"rounds":7}'};
  const first = createMemoryStorage(child), second = createMemoryStorage();
  first.setItem('progress', '{"rounds":8}'); first.setItem('seed', 'daisy');
  assert.deepEqual(child, {voice: 'ryan', progress: '{"rounds":7}'});
  assert.equal(second.length, 0); assert.equal(second.getItem('progress'), null);
  first.clear();
  assert.equal(first.length, 0); assert.equal(first.getItem('voice'), null);
  assert.deepEqual(child, {voice: 'ryan', progress: '{"rounds":7}'});
});

test('GM memory supports persistent-model JSON reads, replacements, deletion and Storage string values', () => {
  const memory = createMemoryStorage();
  assert.equal(memory.getItem('missing'), null);
  memory.setItem('state', JSON.stringify({rounds: [1], water: 2}));
  memory.setItem(3, false); memory.setItem('nil', null);
  assert.deepEqual(JSON.parse(memory.getItem('state')), {rounds: [1], water: 2});
  assert.equal(memory.getItem('3'), 'false'); assert.equal(memory.getItem('nil'), 'null');
  memory.setItem('state', JSON.stringify({rounds: [1, 2], water: 3}));
  assert.equal(memory.length, 3); assert.equal(memory.key(0), 'state'); assert.equal(memory.key(3), null);
  memory.removeItem(3); memory.removeItem('missing');
  assert.equal(memory.length, 2); assert.equal(memory.getItem(3), null);
  assert.equal(memory.key(1), 'nil');
});

test('unbuilt source is public by default and access to real storage remains lazy', () => {
  assert.equal(INTERNAL_BUILD, false); assert.equal(GM_SANDBOX, false);
  const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const denied = new Error('Storage unavailable in this browser profile');
  Object.defineProperty(globalThis, 'localStorage', {configurable: true, get() { throw denied; }});
  try { assert.throws(() => appStorage.getItem('state'), error => error === denied); }
  finally { if (original) Object.defineProperty(globalThis, 'localStorage', original); else delete globalThis.localStorage; }
});

test('GM inherits boolean audio controls alongside music tuning, without child or novice state', () => {
  const key='xiaoya-english:preferences:v1';
  const saved={audioControls:{music:false,reminders:false,extra:'omit'},gardenMusic:{enabled:true,volume:.03},mic:true,
    welcome:true,shopSeen:true,guidance:{seen:['reward','garden']}};
  const real=createMemoryStorage({[key]:JSON.stringify(saved),'xiaoya-english:learning:v1':'private progress'});
  const memory=createSandboxStorage(()=>real);
  assert.deepEqual(JSON.parse(memory.getItem(key)),{gardenMusic:{enabled:true,volume:.03},audioControls:{music:false,reminders:false}});
  assert.equal(memory.getItem('xiaoya-english:learning:v1'),null);
  memory.setItem(key,JSON.stringify({audioControls:{music:true,reminders:true}}));
  assert.deepEqual(JSON.parse(real.getItem(key)),saved,'Sandbox toggles cannot change the real controls');
});

test('GM audio control inheritance rejects arrays and nonboolean values but preserves valid partial settings', () => {
  const key='xiaoya-english:preferences:v1';
  for(const audioControls of [null,[],true,'off',{music:'false',reminders:0},{unknown:true}]) {
    const real=createMemoryStorage({[key]:JSON.stringify({audioControls,mic:true,welcome:true})});
    assert.equal(createSandboxStorage(()=>real).getItem(key),null);
  }
  for(const audioControls of [{music:true},{reminders:false},{music:false,reminders:true}]) {
    const real=createMemoryStorage({[key]:JSON.stringify({audioControls})});
    assert.deepEqual(JSON.parse(createSandboxStorage(()=>real).getItem(key)),{audioControls});
  }
});
