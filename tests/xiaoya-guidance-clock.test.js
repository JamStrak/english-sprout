import test from 'node:test';
import assert from 'node:assert/strict';
import {createGuidanceClock, GUIDANCE_IDLE_MS} from '../xiaoya/guidance-clock.js';

const flush = async () => { for (let i = 0; i < 4; i++) await Promise.resolve(); };
function fixture(onDue = () => {}, options = {}) {
  let time = 0, serial = 0;
  const timers = new Map(), calls = [];
  const clock = createGuidanceClock({
    ...options,
    now: () => time,
    setTimer(fn, ms) { timers.set(++serial, {fn, at: time + ms}); return serial; },
    clearTimer(id) { timers.delete(id); },
    onDue() { calls.push(time); return onDue(); },
  });
  return {
    clock, calls, timers,
    advance(ms) {
      const end = time + ms;
      for (;;) {
        const next = [...timers].sort((a, b) => a[1].at - b[1].at)[0];
        if (!next || next[1].at > end) break;
        timers.delete(next[0]);
        time = next[1].at;
        next[1].fn();
      }
      time = end;
    },
  };
}

test('starts explicitly and repeats only after each complete idle minute', () => {
  const f = fixture();
  assert.equal(GUIDANCE_IDLE_MS, 60000);
  assert.equal(f.timers.size, 0);
  f.clock.schedule();
  f.advance(59999);
  assert.deepEqual(f.calls, []);
  f.advance(1);
  assert.deepEqual(f.calls, [60000]);
  f.advance(59999);
  assert.deepEqual(f.calls, [60000]);
  f.advance(60001);
  assert.deepEqual(f.calls, [60000, 120000, 180000]);
  assert.equal(f.timers.size, 1);
});

test('each interaction restarts the full quiet interval', () => {
  const f = fixture();
  f.clock.schedule();
  f.advance(59000);
  f.clock.activity();
  f.advance(59000);
  f.clock.activity();
  f.advance(59999);
  assert.deepEqual(f.calls, []);
  f.advance(1);
  assert.deepEqual(f.calls, [178000]);
});

test('render scheduling does not postpone reminders or accumulate timers', () => {
  const f = fixture();
  f.clock.schedule();
  for (let i = 0; i < 59; i++) {
    f.advance(1000);
    f.clock.schedule();
    assert.equal(f.timers.size, 1);
  }
  assert.equal(f.clock.status().nextDue, 60000);
  f.advance(1000);
  assert.deepEqual(f.calls, [60000]);
});

test('a canceled timer arriving late cannot replace the current timer or interrupt pending playback', async () => {
  let finish;
  const f = fixture(() => new Promise(resolve => { finish = resolve; }));
  f.clock.schedule();
  const staleCallback = [...f.timers.values()][0].fn;
  f.advance(1000);
  f.clock.schedule();
  const currentTimer = [...f.timers.keys()][0];

  // clearTimeout cannot retract a callback that was already queued.
  staleCallback();
  assert.equal(f.timers.size, 1);
  assert.equal(f.timers.has(currentTimer), true);
  assert.equal(f.clock.status().nextDue, 60000);

  f.advance(59000);
  assert.deepEqual(f.calls, [60000]);
  assert.equal(f.clock.status().pending, true);
  staleCallback();
  assert.deepEqual(f.calls, [60000]);
  assert.equal(f.clock.status().pending, true);
  assert.equal(f.timers.size, 0);

  f.advance(30000);
  finish();
  await flush();
  assert.equal(f.clock.status().nextDue, 150000);
  f.advance(59999);
  assert.deepEqual(f.calls, [60000]);
  f.advance(1);
  assert.deepEqual(f.calls, [60000, 150000]);
});

test('an asynchronous reminder finishes before the next full interval begins', async () => {
  let finish;
  const f = fixture(() => new Promise(resolve => { finish = resolve; }));
  f.clock.schedule();
  f.advance(60000);
  assert.equal(f.clock.status().pending, true);
  f.clock.schedule();
  assert.equal(f.timers.size, 0);
  f.advance(90000);
  assert.deepEqual(f.calls, [60000]);
  finish();
  await flush();
  assert.equal(f.clock.status().nextDue, 210000);
  f.advance(59999);
  assert.deepEqual(f.calls, [60000]);
  f.advance(1);
  assert.deepEqual(f.calls, [60000, 210000]);
});

test('background pause cancels reminders and resume waits a full new interval', () => {
  const f = fixture();
  f.clock.schedule();
  f.advance(59000);
  f.clock.pause();
  f.advance(3600000);
  f.clock.schedule();
  f.clock.activity();
  assert.equal(f.clock.status().paused, true);
  assert.equal(f.timers.size, 0);
  assert.deepEqual(f.calls, []);
  f.clock.resume();
  f.advance(59999);
  assert.deepEqual(f.calls, []);
  f.advance(1);
  assert.deepEqual(f.calls, [3719000]);
});

test('activity invalidates a pending reminder without letting its completion postpone the new deadline', async () => {
  let finish;
  const f = fixture(() => new Promise(resolve => { finish = resolve; }));
  f.clock.schedule();
  f.advance(60000);
  f.advance(10000);
  f.clock.activity();
  f.advance(20000);
  finish();
  await flush();
  assert.equal(f.clock.status().nextDue, 130000);
  assert.equal(f.timers.size, 1);
  f.advance(40000);
  assert.deepEqual(f.calls, [60000, 130000]);
});

test('an old asynchronous completion cannot rearm while paused or change a resumed deadline', async () => {
  const finish = [];
  const f = fixture(() => new Promise(resolve => { finish.push(resolve); }));
  f.clock.schedule();
  f.advance(60000);
  f.clock.pause();
  finish[0]();
  await flush();
  assert.equal(f.timers.size, 0);
  f.clock.resume();
  f.advance(60000);
  f.clock.pause();
  f.advance(10000);
  f.clock.resume();
  f.advance(10000);
  finish[1]();
  await flush();
  assert.equal(f.clock.status().nextDue, 190000);
  f.advance(50000);
  assert.deepEqual(f.calls, [60000, 120000, 190000]);
});

test('stop is permanent even after pending playback resolves and callers try to restart', async () => {
  let finish;
  const f = fixture(() => new Promise(resolve => { finish = resolve; }));
  f.clock.schedule();
  f.advance(60000);
  f.clock.stop();
  finish();
  await flush();
  f.clock.activity();
  f.clock.resume();
  f.clock.schedule();
  f.advance(3600000);
  assert.deepEqual(f.calls, [60000]);
  assert.equal(f.timers.size, 0);
  assert.equal(f.clock.status().stopped, true);
});

test('callback failure waits a full interval instead of retrying immediately', async () => {
  let count = 0;
  const f = fixture(() => {
    count++;
    if (count === 1) throw new Error('playback unavailable');
    return Promise.reject(new Error('playback rejected'));
  });
  f.clock.schedule();
  f.advance(60000);
  assert.equal(f.clock.status().nextDue, 120000);
  f.advance(60000);
  await flush();
  assert.equal(f.clock.status().nextDue, 180000);
  assert.deepEqual(f.calls, [60000, 120000]);
});

test('an interaction from inside the callback survives its synchronous completion', () => {
  const f = fixture(() => { f.clock.activity(); });
  f.clock.schedule();
  f.advance(60000);
  assert.equal(f.timers.size, 1);
  assert.equal(f.clock.status().nextDue, 120000);
  f.advance(60000);
  assert.deepEqual(f.calls, [60000, 120000]);
});

test('a custom delay remains uniform and invalid delays use the safe default', () => {
  const f = fixture(() => {}, {delay: 45000});
  f.clock.schedule();
  f.advance(135000);
  assert.deepEqual(f.calls, [45000, 90000, 135000]);
  for (const delay of [0, -1, NaN, Infinity, '60000']) {
    const invalid = fixture(() => {}, {delay});
    invalid.clock.schedule();
    assert.equal(invalid.clock.status().nextDue, 60000);
  }
});
