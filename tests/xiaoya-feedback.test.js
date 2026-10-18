import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createFeedback} from '../xiaoya/feedback.js';

const deferred = () => {
  let resolve;
  const promise = new Promise(yes => { resolve = yes; });
  return {promise, resolve};
};
const flush = async () => { await Promise.resolve(); await Promise.resolve(); };
function fixture({reduced = false, webAudio = true, resume, canSound = () => true, contextError = false, animationFrame = true, clock = 10} = {}) {
  let time = 0, sequence = 0;
  const timers = new Map(), frames = new Map(), contexts = [], oscillators = [], gains = [];
  function events(object = {}) {
    const listeners = new Map();
    return Object.assign(object, {listeners,
      addEventListener(name, fn) { if (!listeners.has(name)) listeners.set(name, new Set()); listeners.get(name).add(fn); },
      removeEventListener(name, fn) { listeners.get(name)?.delete(fn); },
      emit(name) { for (const fn of listeners.get(name) || []) fn(); },
    });
  }
  const motion = events({matches:reduced});
  const doc = events({hidden:false});
  class Element {
    constructor(tag) {
      this.tagName = tag.toUpperCase(); this.ownerDocument = doc; this.parentNode = null;
      this.children = []; this.attributes = new Map(); this.styles = new Map(); this.classes = new Set();
      this.style = {setProperty:(key, value) => this.styles.set(key, value)};
      this.classList = {add:(...names) => names.forEach(name => this.classes.add(name)), remove:(...names) => names.forEach(name => this.classes.delete(name)), contains:name => this.classes.has(name)};
      this.rect = {left:100, top:200, width:48, height:48};
    }
    set className(value) { this.classes = new Set(value.split(/\s+/).filter(Boolean)); }
    get className() { return [...this.classes].join(' '); }
    setAttribute(key, value) { this.attributes.set(key, value); }
    appendChild(node) { node.parentNode = this; this.children.push(node); return node; }
    remove() { if (this.parentNode) this.parentNode.children = this.parentNode.children.filter(node => node !== this); this.parentNode = null; }
    getBoundingClientRect() { return this.rect; }
  }
  const param = () => ({value:0, calls:[],
    setValueAtTime(...args) { this.calls.push(['set', ...args]); },
    linearRampToValueAtTime(...args) { this.calls.push(['linear', ...args]); },
    exponentialRampToValueAtTime(...args) { this.calls.push(['exponential', ...args]); },
    cancelScheduledValues(...args) { this.calls.push(['cancel', ...args]); },
  });
  class Context {
    constructor() {
      if (contextError) throw new Error('No output device');
      this.state = resume ? 'suspended' : 'running'; this.currentTime = clock; this.destination = {};
      contexts.push(this);
    }
    resume() { this.resumes = (this.resumes || 0) + 1; return (resume || Promise.resolve()).then(() => { if (!this.closed) this.state = 'running'; }); }
    close() { this.closed = true; return Promise.resolve(); }
    createOscillator() {
      const node = {frequency:param(), start(at) { this.started = at; }, stop(at) { (this.stops ||= []).push(at); }, connect(target) { this.target = target; }, disconnect() { this.disconnected = true; }};
      oscillators.push(node); return node;
    }
    createGain() {
      const node = {gain:param(), connect(target) { this.target = target; }, disconnect() { this.disconnected = true; }};
      gains.push(node); return node;
    }
  }
  const win = events({innerWidth:390, innerHeight:844, performance:{now:() => time},
    setTimeout(fn, delay) { const id = ++sequence; timers.set(id, {fn, due:time + delay}); return id; },
    clearTimeout(id) { timers.delete(id); },
    matchMedia:() => motion,
  });
  if (animationFrame) {
    win.requestAnimationFrame = fn => { const id = ++sequence; frames.set(id, fn); return id; };
    win.cancelAnimationFrame = id => frames.delete(id);
  }
  if (webAudio) win.AudioContext = Context;
  doc.defaultView = win;
  doc.createElement = tag => new Element(tag);
  const root = new Element('body'), button = new Element('button');
  button.classList.add('existing-guide'); button.innerHTML = '<svg>existing child content</svg>';
  const onClick = () => {}; button.onclick = onClick;
  root.appendChild(button); doc.activeElement = button;
  const api = createFeedback({root, canSound});
  function tick(amount) {
    const end = time + amount;
    for (;;) {
      const next = [...timers.entries()].filter(([, value]) => value.due <= end).sort((a, b) => a[1].due - b[1].due)[0];
      if (!next) break;
      const [id, value] = next; time = value.due; timers.delete(id); value.fn();
    }
    time = end;
  }
  const layer = () => root.children.find(node => node.classList.contains('xiaoya-fx-layer'));
  const decorations = () => layer()?.children || [];
  const paint = () => { for (const [id, fn] of [...frames]) { frames.delete(id); fn(); } };
  return {api, root, button, onClick, doc, win, motion, contexts, oscillators, gains, timers, frames, tick, paint, layer, decorations};
}

test('prepare warms one shared device after an entrance paint without creating any sound nodes', () => {
  const f = fixture();
  assert.equal(f.api.prepare(), true);
  assert.equal(f.api.prepare(), true);
  assert.equal(f.frames.size, 1);
  assert.equal(f.contexts.length, 0);
  f.paint();
  assert.equal(f.contexts.length, 0, 'The frame itself must not block painting with device construction');
  f.tick(0);
  assert.equal(f.contexts.length, 1);
  assert.equal(f.oscillators.length, 0);
  assert.equal(f.gains.length, 0);
  f.api.prepare(); f.paint(); f.tick(0);
  assert.equal(f.contexts.length, 1);
  f.api.play('reward', {target:f.button}); f.tick(0);
  assert.equal(f.contexts.length, 1, 'The first reward uses the prewarmed device');
  assert.equal(f.oscillators.length, 1);
});

test('narration can cover silent warmup but no effect starts during narration', () => {
  let guidePlaying = true;
  const f = fixture({canSound:() => !guidePlaying});
  f.api.setSilent(true);
  f.api.prepare(); f.paint(); f.tick(0);
  assert.equal(f.contexts.length, 1);
  f.api.play('seed', {target:f.button}); f.tick(0);
  assert.equal(f.oscillators.length, 0);
  guidePlaying = false; f.api.setSilent(false); f.tick(1000);
  assert.equal(f.oscillators.length, 0, 'Missed feedback is not queued');
  f.api.play('plant', {target:f.button}); f.tick(0);
  assert.equal(f.oscillators.length, 1);
});

test('departure, mute and background cancel both warmup stages before device construction', () => {
  for (const stage of ['before-frame','after-frame']) for (const action of ['cancel','mute','background','destroy']) {
    const f = fixture(); f.api.prepare();
    if (stage === 'after-frame') f.paint();
    if (action === 'cancel') f.api.cancel();
    if (action === 'mute') { f.api.setMuted(true); f.api.setMuted(false); }
    if (action === 'background') { f.doc.hidden = true; f.doc.emit('visibilitychange'); }
    if (action === 'destroy') f.api.destroy();
    f.paint(); f.tick(1000);
    assert.equal(f.contexts.length, 0, `${stage}: ${action}`);
    assert.equal(f.frames.size, 0);
    assert.equal(f.timers.size, 0);
  }
});

test('prepare has a cancellable fallback without animation frames and respects unavailable output', () => {
  const f = fixture({animationFrame:false});
  f.api.prepare(); f.tick(15); assert.equal(f.contexts.length, 0);
  f.tick(1); assert.equal(f.contexts.length, 1); assert.equal(f.oscillators.length, 0);
  for (const mode of ['muted','hidden','destroyed','unsupported']) {
    const blocked = fixture({webAudio:mode !== 'unsupported'});
    if (mode === 'muted') blocked.api.setMuted(true);
    if (mode === 'hidden') blocked.doc.hidden = true;
    if (mode === 'destroyed') blocked.api.destroy();
    assert.equal(blocked.api.prepare(), false, mode);
    blocked.paint(); blocked.tick(1000); assert.equal(blocked.contexts.length, 0);
  }
  const failed = fixture({contextError:true});
  assert.doesNotThrow(() => { failed.api.prepare(); failed.paint(); failed.tick(0); });
});

test('suspended warmup does not queue sound and a later user gesture retries resume immediately', async () => {
  const pending = deferred(), f = fixture({resume:pending.promise});
  f.api.prepare(); f.paint(); f.tick(0);
  assert.equal(f.contexts[0].resumes, 1);
  f.api.tap(f.button);
  assert.equal(f.contexts[0].resumes, 2, 'Existing output is resumed inside the user action before any timer');
  f.tick(0); f.api.setSilent(true); f.api.cancel();
  pending.resolve(); await flush(); await flush();
  assert.equal(f.oscillators.length, 0);
  assert.equal(f.gains.length, 0);
  f.api.setSilent(false); f.api.play('reward', {target:f.button}); f.tick(0);
  assert.equal(f.oscillators.length, 1);
});

test('a running context with a stationary startup clock drops cold sound rather than playing it late', () => {
  const f = fixture({clock:0});
  f.api.play('seed', {target:f.button}); f.tick(0);
  assert.equal(f.contexts.length, 1);
  assert.equal(f.oscillators.length, 0);
  f.contexts[0].currentTime = 2; f.tick(2000);
  assert.equal(f.oscillators.length, 0);
  f.api.play('plant', {target:f.button}); f.tick(0);
  assert.equal(f.oscillators.length, 1);
});

test('tap immediately responds without replacing content, handlers, focus or existing classes', () => {
  const f = fixture();
  assert.equal(f.api.tap(f.button, {x:0, y:215, silent:true}), true);
  assert.equal(f.button.classList.contains('xiaoya-fx-press'), true);
  assert.equal(f.button.classList.contains('existing-guide'), true);
  assert.equal(f.button.innerHTML, '<svg>existing child content</svg>');
  assert.equal(f.button.onclick, f.onClick);
  assert.equal(f.doc.activeElement, f.button);
  assert.equal(f.decorations()[0].styles.get('left'), '0px');
  assert.equal(f.layer().attributes.get('aria-hidden'), 'true');
  assert.equal(f.doc.listeners.has('click'), false);
  assert.equal(f.win.listeners.has('pointerdown'), false);
  f.tick(1000);
  assert.deepEqual([...f.button.classes], ['existing-guide']);
  assert.equal(f.decorations().length, 0);
});

test('reward flies each resource toward its corresponding viewport destination', () => {
  const f = fixture();
  f.api.play('reward', {from:{x:150,y:300}, shellTo:{x:35,y:50}, waterTo:{x:110,y:50}, silent:true});
  assert.equal(f.decorations().length, 5);
  const shells = f.decorations().slice(0,3), drops = f.decorations().slice(3);
  assert.ok(shells.every(node => node.styles.get('--fx-dx') === '-115px'));
  assert.ok(drops.every(node => node.styles.get('--fx-dx') === '-40px'));
  assert.ok(f.decorations().every(node => node.styles.get('--fx-dy') === '-250px' && node.classList.contains('xiaoya-fx-travel')));
  f.tick(1000);
  assert.equal(f.decorations().length, 0);
});

test('growth feedback stays bounded during rapid input and releases all decorations', () => {
  const f = fixture();
  for (const kind of ['seed','plant','water','bloom']) assert.equal(f.api.play(kind, {target:f.button, silent:true}), true);
  for (let i = 0; i < 60; i++) f.api.play('bloom', {target:f.button, silent:true});
  assert.equal(f.decorations().length, 32);
  assert.ok(f.timers.size <= 35, 'Removed particles and replaced target pulses must release their timers');
  f.tick(1000);
  assert.equal(f.decorations().length, 0);
  assert.deepEqual([...f.button.classes], ['existing-guide']);
  assert.equal(f.timers.size, 0);
});

test('reduced motion uses one stationary marker, no target scaling, and still cleans up', () => {
  const f = fixture({reduced:true});
  f.api.play('bloom', {target:f.button, silent:true});
  assert.equal(f.decorations().length, 1);
  assert.equal(f.decorations()[0].classList.contains('xiaoya-fx-still'), true);
  assert.equal(f.button.classList.contains('xiaoya-fx-pop'), false);
  f.tick(300);
  assert.equal(f.decorations().length, 0);
});

test('sound is optional, quiet, short, and starts without delaying the immediate visual response', () => {
  const f = fixture();
  f.api.play('bloom', {target:f.button});
  assert.equal(f.decorations().length, 8);
  assert.equal(f.contexts.length, 0);
  f.tick(0);
  assert.equal(f.contexts.length, 1);
  assert.equal(f.oscillators.length, 1);
  const oscillator = f.oscillators[0];
  assert.equal(oscillator.type, 'sine');
  assert.ok(oscillator.stops[0] - oscillator.started < .34);
  assert.ok(f.gains[0].gain.calls.filter(call => call[0] === 'linear').every(call => call[1] <= .022));
  f.tick(1000);
  assert.equal(oscillator.disconnected, true);
});

test('three stars emit three ascending chimes and timed sparkles, finishing in under half a second', () => {
  const f = fixture();
  f.api.play('three-stars', {target:f.button});
  assert.equal(f.decorations().length, 3);
  assert.deepEqual(f.decorations().map(node => node.styles.get('--fx-delay')), ['0ms','120ms','240ms']);
  f.tick(0);
  assert.equal(f.oscillators.length, 1);
  const oscillator = f.oscillators[0];
  const frequencies = oscillator.frequency.calls.map(call => call[1]);
  assert.equal(frequencies.length, 3);
  assert.ok(frequencies[0] < frequencies[1] && frequencies[1] < frequencies[2]);
  assert.ok(oscillator.stops[0] - oscillator.started < .5);
  const peaks = f.gains[0].gain.calls.filter(call => call[0] === 'linear' && call[1] > 0);
  assert.ok(peaks.every(call => call[1] > .022 && call[1] <= .04));
  f.tick(1000);assert.equal(oscillator.disconnected, true);assert.equal(f.decorations().length, 0);
});

test('three stars respect mute and reduced motion and remain usable without Web Audio', () => {
  for (const options of [{webAudio:false}, {reduced:true}]) {
    const f = fixture(options);f.api.setMuted(true);
    assert.equal(f.api.play('three-stars', {target:f.button}), true);
    assert.equal(f.decorations().length, options.reduced ? 1 : 3);
    f.tick(1000);assert.equal(f.oscillators.length, 0);assert.equal(f.decorations().length, 0);
    f.api.setMuted(false);f.tick(1000);assert.equal(f.oscillators.length, 0);
  }
});

test('muted, silent, denied sound and ready never construct an audio context', () => {
  for (const mode of ['muted','silent','denied','per-call','ready']) {
    const f = fixture({canSound:() => mode !== 'denied'});
    if (mode === 'muted') f.api.setMuted(true);
    if (mode === 'silent') f.api.setSilent(true);
    f.api.play(mode === 'ready' ? 'ready' : 'reward', {target:f.button, silent:mode === 'per-call'});
    f.tick(1000);
    assert.equal(f.contexts.length, 0, mode);
  }
});

test('short feedback sound starts when Array.at is unavailable', () => {
  const descriptor = Object.getOwnPropertyDescriptor(Array.prototype, 'at');
  // Keep this compatibility probe synchronous, restoring the host before yielding.
  Object.defineProperty(Array.prototype, 'at', {configurable:true, writable:true, value:undefined});
  try {
    const f = fixture();
    f.api.play('reward', {target:f.button});
    f.tick(0);
    assert.equal(f.oscillators.length, 1);
    assert.equal(f.oscillators[0].started, 10);
    assert.ok(f.oscillators[0].stops[0] > 10);
    assert.deepEqual(f.oscillators[0].frequency.calls.map(call => call[1]), [660, 830, 990]);
    f.api.destroy();
  } finally {
    if (descriptor) Object.defineProperty(Array.prototype, 'at', descriptor);
    else delete Array.prototype.at;
  }
});

test('microphone/guide silence cancels sound synchronously, including already scheduled notes', () => {
  const f = fixture();
  f.api.play('reward', {target:f.button}); f.tick(0);
  assert.equal(f.oscillators.length, 1);
  f.api.setSilent(true);
  assert.equal(f.oscillators[0].stops.at(-1), undefined, 'Immediate stop, not the future score end');
  assert.equal(f.gains[0].gain.value, 0);
  assert.equal(f.gains[0].disconnected, true);
  f.api.play('water', {target:f.button}); f.tick(0);
  assert.equal(f.oscillators.length, 1);
  f.api.setSilent(false); f.tick(1000);
  assert.equal(f.oscillators.length, 1, 'Unmuting must never replay missed feedback');
});

test('a mic request in the same turn prevents even optional audio device construction', () => {
  const f = fixture();
  f.api.tap(f.button);
  f.api.setSilent(true);
  f.tick(1000);
  assert.equal(f.contexts.length, 0);
});

test('a pending resume cannot emit late sound after cancellation or a mute/unmute cycle', async () => {
  for (const action of ['cancel','mute','silent','destroy']) {
    const pending = deferred();
    const f = fixture({resume:pending.promise});
    f.api.play('reward', {target:f.button}); f.tick(0);
    assert.equal(f.contexts.length, 1);
    if (action === 'cancel') f.api.cancel();
    if (action === 'destroy') f.api.destroy();
    if (action === 'mute') { f.api.setMuted(true); f.api.setMuted(false); }
    if (action === 'silent') { f.api.setSilent(true); f.api.setSilent(false); }
    pending.resolve(); await flush();
    assert.equal(f.oscillators.length, 0, action);
  }
});

test('blocked autoplay that resolves too late discards stale sound', async () => {
  const pending = deferred();
  const f = fixture({resume:pending.promise});
  f.api.tap(f.button); f.tick(0); f.tick(300);
  pending.resolve(); await flush();
  assert.equal(f.oscillators.length, 0);
});

test('sound permission is rechecked after resume and new sound stops the previous voice', async () => {
  let allowed = true;
  const pending = deferred();
  const f = fixture({resume:pending.promise, canSound:() => allowed});
  f.api.tap(f.button); f.tick(0); allowed = false;
  pending.resolve(); await flush();
  assert.equal(f.oscillators.length, 0);
  const active = fixture();
  active.api.play('reward', {target:active.button}); active.tick(0);
  active.api.tap(active.button); active.tick(0);
  assert.equal(active.oscillators.length, 2);
  assert.equal(active.oscillators[0].disconnected, true);
  active.api.play('ready', {target:active.button});
  assert.equal(active.oscillators[1].disconnected, true, 'Ready is quiet even if a previous celebration is still playing');
});

test('cancel, background and page leave release visuals, audio and delayed target changes', () => {
  for (const action of ['cancel','background','pagehide','motion']) {
    const f = fixture();
    f.api.play('reward', {target:f.button}); f.tick(0);
    if (action === 'cancel') f.api.cancel();
    if (action === 'background') { f.doc.hidden = true; f.doc.emit('visibilitychange'); }
    if (action === 'pagehide') f.win.emit('pagehide');
    if (action === 'motion') { f.motion.matches = true; f.motion.emit('change'); }
    assert.equal(f.layer(), undefined, action);
    assert.equal(f.timers.size, 0, action);
    assert.deepEqual([...f.button.classes], ['existing-guide'], action);
    assert.equal(f.oscillators[0].disconnected, true, action);
    f.tick(1000);
    assert.equal(f.layer(), undefined, action);
  }
});

test('destroy is idempotent and removes lifecycle listeners; unsupported audio keeps visuals usable', () => {
  const f = fixture();
  f.api.tap(f.button); f.tick(0);
  f.api.destroy(); f.api.destroy();
  assert.equal(f.contexts[0].closed, true);
  assert.equal(f.doc.listeners.get('visibilitychange').size, 0);
  assert.equal(f.win.listeners.get('pagehide').size, 0);
  assert.equal(f.motion.listeners.get('change').size, 0);
  assert.equal(f.api.tap(f.button), false);
  for (const options of [{webAudio:false}, {contextError:true}, {canSound:() => { throw new Error('settings unavailable'); }}]) {
    const optional = fixture(options);
    assert.equal(optional.api.play('seed', {target:optional.button}), true);
    optional.tick(0);
    assert.ok(optional.decorations().length > 0);
    optional.api.destroy();
  }
});

test('pointer rings use the touched coordinates, including zero, with or without reduced motion', () => {
  for (const reduced of [false, true]) {
    const f = fixture({reduced});
    f.api.tap(f.button, {x:0, y:302, silent:true});
    assert.equal(f.decorations()[0].styles.get('left'), '0px');
    assert.equal(f.decorations()[0].styles.get('top'), '302px');
    f.api.destroy();
  }
});

test('plant feedback animates only the body and keyboard feedback uses the fixed soil anchor', () => {
  const f = fixture();
  const body = f.doc.createElement('g'), soil = f.doc.createElement('ellipse');
  soil.rect = {left:110, top:290, width:28, height:8};
  f.button.querySelector = selector => selector === '[data-feedback-body]' ? body : soil;
  f.api.tap(f.button, {silent:true});
  assert.deepEqual([...f.button.classes], ['existing-guide']);
  assert.ok(body.classList.contains('xiaoya-fx-press'));
  assert.equal(f.decorations()[0].styles.get('left'), '124px');
  assert.equal(f.decorations()[0].styles.get('top'), '294px');
  f.tick(280);
  assert.equal(body.classes.size, 0);
  f.api.play('bloom', {target:f.button, silent:true});
  assert.ok(body.classList.contains('xiaoya-fx-pop'));
  assert.deepEqual([...f.button.classes], ['existing-guide']);
  f.api.cancel();
  assert.equal(body.classes.size, 0);
});

test('a seed wiggle stays visible, restarts on another tap, and cancels on departure', () => {
  const f = fixture(), body = f.doc.createElement('g');
  body.dataset = {feedbackKind:'seed'};
  f.button.querySelector = selector => selector === '[data-feedback-body]' ? body : null;
  f.api.tap(f.button, {silent:true});
  f.tick(400);
  assert.ok(body.classList.contains('xiaoya-fx-seed'), 'Feedback must last long enough to notice');
  assert.deepEqual([...f.button.classes], ['existing-guide']);
  f.api.tap(f.button, {silent:true});
  f.tick(400);
  assert.ok(body.classList.contains('xiaoya-fx-seed'), 'An old cleanup must not cut off the new wiggle');
  f.tick(240);
  assert.equal(body.classes.size, 0);
  f.api.tap(f.button, {silent:true});
  f.api.cancel();
  assert.equal(body.classes.size, 0);
  assert.equal(f.timers.size, 0);
});

test('reduced motion keeps seed tap feedback stationary', () => {
  const f = fixture({reduced:true}), body = f.doc.createElement('g');
  body.dataset = {feedbackKind:'seed'};
  f.button.querySelector = selector => selector === '[data-feedback-body]' ? body : null;
  f.api.tap(f.button, {x:12,y:34,silent:true});
  assert.equal(body.classes.size, 0);
  assert.equal(f.decorations()[0].styles.get('top'), '34px');
  f.api.destroy();
});

test('invalid anchors stay finite and CSS isolates decoration from layout and pointer input', () => {
  const f = fixture();
  f.api.play('plant', {from:{x:NaN,y:Infinity}, silent:true});
  assert.ok(f.decorations().every(node => node.styles.get('left') === '195px' && node.styles.get('top') === '422px'));
  assert.equal(f.api.play('unknown'), false);
  const css = fs.readFileSync(new URL('../xiaoya/feedback.css', import.meta.url), 'utf8');
  assert.match(css, /\.xiaoya-fx-layer\{[^}]*position:fixed[^}]*pointer-events:none!important/);
  assert.match(css, /\.xiaoya-fx-layer \*\{[^}]*pointer-events:none!important/);
  assert.match(css, /prefers-reduced-motion:reduce/);
  assert.doesNotMatch(css, /\.xiaoya-fx-(?:press|pop)\{[^}]*transform:/, 'Target positioning transforms must survive feedback');
});
