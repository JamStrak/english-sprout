// Small decorative feedback only: no media downloads, input listeners or microphone access.
const KINDS = new Set(['tap', 'reward', 'seed', 'plant', 'water', 'bloom', 'ready', 'three-stars']);
const ICONS = {
  shell: '<path d="M12 21C3 18 1 11 5 5c2-3 5-2 7 0 2-2 5-3 7 0 4 6 2 13-7 16Z" fill="#ffe19a" stroke="#d39842" stroke-width="1.6"/><path d="m12 19-5-10m5 10V7m0 12 5-10" fill="none" stroke="#d39842" stroke-width="1.1"/>',
  drop: '<path d="M12 2C9 8 5 11 5 15a7 7 0 0 0 14 0c0-4-4-7-7-13Z" fill="#6ecbd8" stroke="#3da8bb" stroke-width="1.2"/><path d="M8 14c-1 2 0 4 2 4" fill="none" stroke="#efffff" stroke-width="1.6" stroke-linecap="round"/>',
  leaf: '<path d="M20 3C5 2 1 11 8 17c7 7 14-2 12-14Z" fill="#94bf78" stroke="#5a9658" stroke-width="1.2"/><path d="M5 21 16 8" stroke="#5a9658" stroke-width="1.5" stroke-linecap="round"/>',
  petal: '<ellipse cx="12" cy="12" rx="6" ry="10" fill="currentColor"/><ellipse cx="10" cy="9" rx="2" ry="4" fill="#fff" opacity=".4"/>',
  star: '<path d="m12 2 3 7 7 3-7 3-3 7-3-7-7-3 7-3Z" fill="#f2c566" stroke="#fff5c7" stroke-width="1.2"/>',
};
const NOTES = {
  tap: [[480, 0, .055]],
  reward: [[660, 0, .08], [830, .09, .08], [990, .18, .12]],
  seed: [[740, 0, .075], [990, .085, .1]],
  plant: [[420, 0, .065], [560, .075, .09]],
  water: [[640, 0, .065], [500, .075, .09]],
  bloom: [[520, 0, .09], [780, .1, .09], [1040, .2, .12]],
  'three-stars': [[784, 0, .09], [988, .12, .10], [1319, .24, .22]],
};
const finite = value => typeof value === 'number' && Number.isFinite(value);

/**
 * All methods are synchronous and never wait for sound. Call setSilent(true)
 * BEFORE guide/example playback, microphone acquisition, recording or recognition.
 * Unmuting never replays old feedback. `ready` is always visual, even if silent:false.
 * prepare() silently warms the output device after paint; call at story/garden entry,
 * never on a microphone path. It may run during narration, but creates no sound nodes.
 * Anchors accept an Element or viewport coordinates {x,y}; reward additionally
 * accepts shellTo/waterTo. cancel() clears a departing view; destroy() disposes it.
 */
export function createFeedback({root = globalThis.document?.body, canSound = () => true} = {}) {
  if (!root?.ownerDocument) throw new TypeError('Feedback needs a document root.');
  const doc = root.ownerDocument;
  const win = doc.defaultView || globalThis;
  const motion = win.matchMedia?.('(prefers-reduced-motion: reduce)');
  const timers = new Set(), particles = new Map(), targets = new Map(), voices = new Set();
  let muted = false, silent = false, destroyed = false, layer = null;
  let context = null, soundTimer = null, soundGeneration = 0;
  let prepareFrame = null, prepareTimer = null, prepareGeneration = 0;
  const now = () => win.performance?.now?.() ?? Date.now();
  const later = (fn, delay) => {
    const id = win.setTimeout(() => { timers.delete(id); fn(); }, delay);
    timers.add(id); return id;
  };
  const clear = id => { if (id != null) { win.clearTimeout(id); timers.delete(id); } };
  const allowed = () => {
    try { return !destroyed && !muted && !silent && !doc.hidden && Boolean(canSound()); }
    catch { return false; }
  };
  const point = (value, fallback) => {
    if (finite(value?.x) && finite(value?.y)) return {x: value.x, y: value.y};
    const rect = value?.getBoundingClientRect?.();
    if (rect && [rect.left, rect.top, rect.width, rect.height].every(finite)) {
      return {x: rect.left + rect.width / 2, y: rect.top + rect.height / 2};
    }
    return fallback || {x: (win.innerWidth || 320) / 2, y: (win.innerHeight || 480) / 2};
  };
  function stopVoice(voice) {
    if (!voices.delete(voice)) return;
    clear(voice.timer);
    try { voice.gain.gain.cancelScheduledValues(0); voice.gain.gain.value = 0; } catch {}
    try { voice.oscillator.onended = null; voice.oscillator.stop(); } catch {}
    try { voice.oscillator.disconnect(); voice.gain.disconnect(); } catch {}
  }
  function stopAudio() {
    soundGeneration++; clear(soundTimer); soundTimer = null;
    for (const voice of [...voices]) stopVoice(voice);
  }
  function stopPreparation() {
    prepareGeneration++;
    if (prepareFrame != null) win.cancelAnimationFrame?.(prepareFrame);
    prepareFrame = null; clear(prepareTimer); prepareTimer = null;
  }
  function resumeContext(active) {
    try {
      if (active && active.state !== 'running' && active.state !== 'closed') {
        // An existing context can be unlocked within a real user gesture on Safari.
        // No source is queued: late permission or resume never replays an old effect.
        return Promise.resolve(active.resume()).catch(() => {});
      }
    } catch {}
    return null;
  }
  function prepare() {
    if (destroyed || muted || doc.hidden || !(win.AudioContext || win.webkitAudioContext)) return false;
    if (context?.state === 'closed') context = null;
    if (context) { resumeContext(context); return true; }
    if (prepareFrame != null || prepareTimer != null) return true;
    const generation = prepareGeneration;
    const create = () => {
      prepareTimer = null;
      if (generation !== prepareGeneration || destroyed || muted || doc.hidden) return;
      try {
        const Context = win.AudioContext || win.webkitAudioContext;
        context ||= new Context();
        resumeContext(context);
      } catch { /* Device warmup is optional; navigation and guides proceed. */ }
    };
    // Device construction can block on some systems. Let the entrance paint first.
    if (win.requestAnimationFrame) prepareFrame = win.requestAnimationFrame(() => {
      prepareFrame = null;
      if (generation === prepareGeneration) prepareTimer = later(create, 0);
    });
    else prepareTimer = later(create, 16);
    return true;
  }
  function sound(kind) {
    if (!NOTES[kind] || !allowed()) return;
    // One sound at a time. Defer optional device setup so visual feedback is applied
    // first; an immediately following guide or mic request can cancel it altogether.
    stopAudio();
    const generation = soundGeneration;
    const expires = now() + 250;
    const resumed = resumeContext(context);
    soundTimer = later(async () => {
      soundTimer = null;
      if (generation !== soundGeneration || !allowed() || now() > expires) return;
      try {
        const Context = win.AudioContext || win.webkitAudioContext;
        if (!Context) return;
        context ||= new Context();
        const active = context;
        if (resumed) await resumed;
        else if (active.state !== 'running') await resumeContext(active);
        if (generation !== soundGeneration || !allowed() || active !== context || now() > expires) return;
        // `running` can precede output-device startup by seconds. A cold effect is
        // deliberately omitted rather than scheduled at clock zero and played late.
        if (active.state !== 'running' || active.currentTime <= 0) return;
        const oscillator = active.createOscillator(), gain = active.createGain();
        const voice = {oscillator, gain, timer: null};
        voices.add(voice);
        try {
          oscillator.type = 'sine'; oscillator.connect(gain); gain.connect(active.destination);
          const start = active.currentTime;
          gain.gain.setValueAtTime(0, start);
          for (const [frequency, offset, duration] of NOTES[kind]) {
            const at = start + offset;
            oscillator.frequency.setValueAtTime(frequency, at);
            gain.gain.setValueAtTime(0, at);
            gain.gain.linearRampToValueAtTime(kind === 'tap' ? .012 : kind === 'three-stars' ? .032 : .022, at + .008);
            gain.gain.exponentialRampToValueAtTime(.0001, at + duration - .006);
            gain.gain.linearRampToValueAtTime(0, at + duration);
          }
          const notes = NOTES[kind], last = notes[notes.length - 1];
          oscillator.onended = () => stopVoice(voice);
          oscillator.start(start); oscillator.stop(start + last[1] + last[2] + .01);
          voice.timer = later(() => stopVoice(voice), 900);
        } catch { stopVoice(voice); }
      } catch { /* Optional decoration must not block a child's activity. */ }
    }, 0);
  }
  function removeParticle(node) {
    clear(particles.get(node)); particles.delete(node); node.remove();
  }
  function particle(icon, origin, {dx = 0, dy = 0, size = 24, duration = 560, delay = 0, turn = 0, travel = false, color = '#e2b261', reduced = false} = {}) {
    if (!layer?.parentNode) {
      layer = doc.createElement('div'); layer.className = 'xiaoya-fx-layer';
      layer.setAttribute('aria-hidden', 'true'); root.appendChild(layer);
    }
    // Rapid taps never accumulate an unbounded number of decorative nodes.
    while (particles.size >= 32) removeParticle(particles.keys().next().value);
    const node = doc.createElement('span');
    node.className = `xiaoya-fx-particle${icon === 'ring' ? ' xiaoya-fx-ring' : ''}${travel ? ' xiaoya-fx-travel' : ''}${reduced ? ' xiaoya-fx-still' : ''}`;
    for (const [name, value] of Object.entries({left:`${origin.x}px`, top:`${origin.y}px`, '--fx-dx':`${dx}px`, '--fx-dy':`${dy}px`, '--fx-size':`${size}px`, '--fx-duration':`${duration}ms`, '--fx-delay':`${delay}ms`, '--fx-turn':`${turn}deg`, color})) node.style.setProperty(name, value);
    if (icon !== 'ring') node.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">${ICONS[icon] || ICONS.star}</svg>`;
    layer.appendChild(node);
    particles.set(node, later(() => removeParticle(node), duration + delay + 60));
  }
  function releaseTarget(target) {
    const record = targets.get(target);
    if (!record) return;
    record.forEach(clear); targets.delete(target);
    target.classList.remove('xiaoya-fx-target', 'xiaoya-fx-press', 'xiaoya-fx-pop');
  }
  function bump(target, press = false) {
    if (!target?.classList || motion?.matches) return;
    releaseTarget(target);
    const name = press ? 'xiaoya-fx-press' : 'xiaoya-fx-pop';
    target.classList.add('xiaoya-fx-target', name);
    const release = later(() => target.classList.remove(name), press ? 75 : 145);
    const finish = later(() => releaseTarget(target), press ? 270 : 350);
    targets.set(target, [release, finish]);
  }
  function visual(kind, options) {
    const center = point(options.from || options.target);
    if (motion?.matches) {
      particle('ring', center, {size:kind === 'tap' ? 26 : 44, duration:220, reduced:true});
      return;
    }
    if (kind === 'tap') {
      bump(options.target, true);
      particle('ring', finite(options.x) && finite(options.y) ? point(options) : center, {size:26, duration:280});
    } else if (kind === 'ready') {
      particle('ring', center, {size:64, duration:380, color:'#71ac87'});
    } else if (kind === 'reward') {
      // Decorative tokens illustrate both resources, not the accounting amount.
      for (let i = 0; i < 5; i++) {
        const icon = i < 3 ? 'shell' : 'drop';
        const destination = options[icon === 'shell' ? 'shellTo' : 'waterTo'] || options.to;
        const end = destination ? point(destination, center) : {x:center.x + (i - 2) * 24, y:center.y - 48 + Math.abs(i - 2) * 10};
        particle(icon, center, {dx:end.x-center.x, dy:end.y-center.y, duration:620, delay:i*36, travel:true, size:26, turn:(i-2)*15});
      }
      bump(options.target);
    } else if (kind === 'three-stars') {
      for (let i = 0; i < 3; i++) particle('star', {x:center.x+(i-1)*30,y:center.y}, {dx:(i-1)*12, dy:-42, size:27, duration:480, delay:i*120, turn:(i-1)*18});
      bump(options.target);
    } else if (kind === 'water') {
      for (let i = 0; i < 4; i++) particle('drop', {x:center.x-21+i*14, y:center.y-45}, {dx:i%2 ? 7 : -7, dy:58, size:16, duration:440, delay:i*45});
      bump(options.target);
    } else if (kind === 'bloom') {
      const colors = ['#efa3b3','#f2c566','#a2c58d'];
      for (let i = 0; i < 8; i++) {
        const angle = i * Math.PI / 4;
        particle(i%3 === 0 ? 'star' : 'petal', center, {dx:Math.cos(angle)*66, dy:Math.sin(angle)*54-12, size:19, duration:700, turn:i*47, color:colors[i%3]});
      }
      bump(options.target);
    } else {
      const icon = kind === 'plant' ? 'leaf' : 'star';
      for (let i = 0; i < 3; i++) particle(icon, center, {dx:(i-1)*28, dy:i === 1 ? -49 : -25, size:20, duration:490, turn:(i-1)*35});
      bump(options.target);
    }
  }
  function play(kind, options = {}) {
    if (destroyed || doc.hidden || !KINDS.has(kind)) return false;
    visual(kind, options);
    if (options.silent || kind === 'ready' || !allowed()) stopAudio();
    else sound(kind);
    return true;
  }
  function cancel() {
    stopAudio(); stopPreparation();
    for (const timer of [...timers]) clear(timer);
    for (const target of [...targets.keys()]) releaseTarget(target);
    for (const node of [...particles.keys()]) removeParticle(node);
    layer?.remove(); layer = null;
  }
  const visibility = () => { if (doc.hidden) cancel(); };
  const motionChanged = () => cancel();
  doc.addEventListener('visibilitychange', visibility);
  win.addEventListener?.('pagehide', cancel);
  motion?.addEventListener?.('change', motionChanged);
  return Object.freeze({
    prepare,
    play,
    tap: (target, options = {}) => play('tap', {...options, target}),
    setMuted(value) { muted = Boolean(value); if (muted) { stopAudio(); stopPreparation(); } },
    setSilent(value) { silent = Boolean(value); if (silent) stopAudio(); },
    cancel,
    destroy() {
      if (destroyed) return;
      destroyed = true; cancel();
      doc.removeEventListener('visibilitychange', visibility);
      win.removeEventListener?.('pagehide', cancel);
      motion?.removeEventListener?.('change', motionChanged);
      const active = context; context = null;
      try { Promise.resolve(active?.close()).catch(() => {}); } catch {}
    },
  });
}
