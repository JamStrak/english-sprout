import test from 'node:test';
import assert from 'node:assert/strict';
import { installChildFeedback, celebrate, stopChildFeedback } from '../src/child-feedback.js';

function environment(run) {
  const old = { window: globalThis.window, document: globalThis.document, setTimeout: globalThis.setTimeout, clearTimeout: globalThis.clearTimeout };
  const listeners = new Map();
  const timers = new Set();
  const contexts = [];
  function element() {
    const classes = new Set();
    return {
      children: [], dataset: {}, attributes: {}, removed: false,
      style: { setProperty(name, value) { this[name] = value; } },
      classList: { add: value => classes.add(value), remove: value => classes.delete(value), contains: value => classes.has(value) },
      appendChild(child) { this.children.push(child); },
      setAttribute(key, value) { this.attributes[key] = value; },
      remove() { this.removed = true; },
      getBoundingClientRect() { return { left: 20, top: 100, width: 280, height: 80 }; },
    };
  }
  const parameter = () => ({ setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} });
  class Audio {
    constructor() { this.state = 'suspended'; this.currentTime = 1; this.sampleRate = 44100; this.destination = {}; this.oscillators = []; this.sources = []; contexts.push(this); }
    resume() { this.state = 'running'; return Promise.resolve(); }
    close() { this.state = 'closed'; return Promise.resolve(); }
    createBuffer() { return {}; }
    createBufferSource() { const source = { connect() {}, disconnect() {}, start() { this.started = true; } }; this.sources.push(source); return source; }
    createGain() { return { gain: parameter(), connect() {}, disconnect() { this.disconnected = true; } }; }
    createOscillator() { const osc = { frequency: parameter(), stopped: false, connect() {}, disconnect() { this.disconnected = true; }, start(at) { this.started = at; }, stop() { this.stopped = true; } }; this.oscillators.push(osc); return osc; }
  }
  const document = { hidden: false, body: element(), documentElement: { clientWidth: 320, clientHeight: 568 }, createElement: element,
    addEventListener(name, callback) { if (!listeners.has(name)) listeners.set(name, new Set()); listeners.get(name).add(callback); },
    removeEventListener(name, callback) { listeners.get(name).delete(callback); },
  };
  globalThis.document = document;
  // Verify the older Safari name as well as suspended context unlock.
  globalThis.window = { innerWidth: 320, innerHeight: 568, webkitAudioContext: Audio };
  globalThis.setTimeout = callback => { const timer = { callback }; timers.add(timer); return timer; };
  globalThis.clearTimeout = timer => timers.delete(timer);
  const fire = (name, event = {}) => { for (const callback of [...(listeners.get(name) || [])]) callback(event); };
  let cleanup;
  try { run({ contexts, document, element, fire, timers, listeners, install: options => { cleanup = installChildFeedback(options); return cleanup; } }); }
  finally { if (cleanup) cleanup(); Object.assign(globalThis, old); }
}

test('opening the app and synthetic taps never create audio; a trusted gesture unlocks Safari audio', () => environment(({ contexts, fire, install, element }) => {
  install();
  const target = element();
  assert.equal(celebrate('stars', { target }), true);
  assert.equal(contexts.length, 0);
  fire('click', { isTrusted: false });
  assert.equal(contexts.length, 0);
  fire('pointerdown', { isTrusted: true });
  assert.equal(contexts.length, 1);
  assert.equal(contexts[0].state, 'running');
  assert.equal(contexts[0].sources.length, 1);
  celebrate('correct', { target });
  assert.equal(contexts[0].oscillators.length, 3);
}));

test('a new reward replaces the previous chime and stopping feedback disconnects all voices', () => environment(({ contexts, fire, install, element }) => {
  install(); fire('click', { isTrusted: true });
  const target = element();
  celebrate('stars', { target });
  const initial = contexts[0].oscillators.slice();
  assert.equal(initial.length, 4);
  celebrate('water', { target });
  assert.equal(contexts[0].oscillators.length, 6);
  assert.ok(initial.every(osc => osc.disconnected));
  assert.ok(target.classList.contains('child-success'));
  stopChildFeedback();
  assert.ok(contexts[0].oscillators.every(osc => osc.stopped && osc.disconnected));
  assert.equal(target.classList.contains('child-success'), false);
}));

test('recording gates, silent retries and hidden tabs cannot play a reward sound', () => environment(({ contexts, fire, install, document, element }) => {
  let canPlay = false;
  install({ canPlay: () => canPlay });
  fire('click', { isTrusted: true });
  assert.equal(contexts.length, 0);
  canPlay = true; fire('click', { isTrusted: true });
  celebrate('retry', { target: element(), silent: true });
  assert.equal(contexts[0].oscillators.length, 0);
  canPlay = false;
  celebrate('reward', { target: element() });
  assert.equal(contexts[0].oscillators.length, 0);
  canPlay = true; celebrate('bloom', { target: element() });
  document.hidden = true; fire('visibilitychange');
  assert.ok(contexts[0].oscillators.every(osc => osc.disconnected));
  assert.ok(document.body.children.every(node => node.removed));
  assert.equal(celebrate('stars'), false);
}));

test('transient effects are bounded, expire without loops, and cleanup removes gesture listeners', () => environment(({ fire, install, document, element, timers, listeners, contexts }) => {
  const cleanup = install();
  fire('pointerdown', { isTrusted: true });
  for (let i = 0; i < 6; i++) celebrate(i % 2 ? 'plant' : 'reward', { target: element() });
  const active = document.body.children.filter(node => !node.removed);
  assert.equal(active.length, 1);
  assert.equal(timers.size, 1);
  assert.ok(active.every(node => node.attributes['aria-hidden'] === 'true' && node.children.length <= 9));
  for (const timer of [...timers]) timer.callback();
  assert.equal(timers.size, 0);
  assert.ok(active.every(node => node.removed));
  cleanup();
  assert.equal(contexts[0].state, 'closed');
  assert.equal([...listeners.values()].reduce((sum, set) => sum + set.size, 0), 0);
  assert.equal(celebrate('stars'), false);
}));
