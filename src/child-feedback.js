// Small, local celebrations. Audio is unlocked only by a real user gesture.
const CUES = {
  stars: { icon: '⭐', notes: [523.25, 659.25, 783.99, 1046.5], step: .14, length: .23 },
  correct: { icon: '🌟', notes: [659.25, 783.99, 1046.5], step: .13, length: .24 },
  reward: { icon: '🎁', notes: [523.25, 783.99, 1046.5], step: .17, length: .28 },
  bloom: { icon: '🌸', notes: [523.25, 659.25, 783.99, 1046.5], step: .18, length: .29 },
  water: { icon: '💧', notes: [880, 1174.66], step: .1, length: .14 },
  plant: { icon: '🌱', notes: [392, 659.25], step: .1, length: .15 },
  retry: { icon: '👂', notes: [523.25, 659.25], step: .16, length: .2 },
};
let installed = false;
let audio = null;
let allowed = () => true;
let removeListeners = null;
let lastCue = null;
const voices = new Set();
const effects = new Set();

function permitted() {
  try { return installed && !document.hidden && allowed(); } catch { return false; }
}

function unlock(event) {
  if (!event.isTrusted || !permitted()) return;
  try {
    if (!audio) {
      const Audio = window.AudioContext || window.webkitAudioContext;
      if (!Audio) return;
      audio = new Audio();
    }
    if (audio.state === 'suspended') {
      const resumed = audio.resume();
      if (resumed && resumed.catch) resumed.catch(() => {});
    }
    // Older iPad Safari also requires starting a source in the gesture itself.
    if (audio.state !== 'closed') {
      const source = audio.createBufferSource();
      source.buffer = audio.createBuffer(1, 1, audio.sampleRate);
      source.connect(audio.destination);
      source.onended = () => { try { source.disconnect(); } catch {} };
      source.start(0);
    }
  } catch { /* A visual celebration still works without Web Audio. */ }
}

function stopVoices() {
  for (const voice of [...voices]) {
    voice.osc.onended = null;
    try { voice.osc.stop(); } catch {}
    try { voice.osc.disconnect(); voice.gain.disconnect(); } catch {}
    voices.delete(voice);
  }
}

function chime(kind) {
  // No late sound after opening a page, changing tabs, or waiting for unlock.
  if (!permitted() || !audio || audio.state !== 'running') return;
  const now = Date.now();
  if (lastCue && lastCue.kind === kind && now - lastCue.time < 180) return;
  lastCue = { kind, time: now };
  stopVoices();
  const cue = CUES[kind];
  try {
    const start = audio.currentTime + .01;
    cue.notes.forEach((frequency, index) => {
      const osc = audio.createOscillator();
      const gain = audio.createGain();
      const at = start + index * cue.step;
      // Soft attack and release avoid the sharp clicks of toy buzzers.
      osc.type = kind === 'water' ? 'sine' : 'triangle';
      osc.frequency.setValueAtTime(frequency, at);
      if (kind === 'water' || kind === 'plant') osc.frequency.exponentialRampToValueAtTime(frequency * .8, at + cue.length);
      gain.gain.setValueAtTime(0, at);
      gain.gain.linearRampToValueAtTime(.065, at + .014);
      gain.gain.exponentialRampToValueAtTime(.001, at + cue.length);
      gain.gain.setValueAtTime(0, at + cue.length + .01);
      osc.connect(gain); gain.connect(audio.destination);
      const voice = { osc, gain };
      voices.add(voice);
      osc.onended = () => {
        voices.delete(voice);
        try { osc.disconnect(); gain.disconnect(); } catch {}
      };
      osc.start(at); osc.stop(at + cue.length + .02);
    });
  } catch { stopVoices(); }
}

function clearEffect(effect) {
  clearTimeout(effect.timer);
  effect.node.remove();
  if (effect.target && effect.target.classList) effect.target.classList.remove('child-success');
  effects.delete(effect);
}

export function stopChildFeedback() {
  stopVoices();
  for (const effect of [...effects]) clearEffect(effect);
  lastCue = null;
}

export function installChildFeedback({ canPlay = () => true } = {}) {
  if (removeListeners) removeListeners();
  stopChildFeedback();
  allowed = canPlay;
  installed = true;
  const hidden = () => { if (document.hidden) stopChildFeedback(); };
  document.addEventListener('pointerdown', unlock, true);
  document.addEventListener('click', unlock, true);
  document.addEventListener('visibilitychange', hidden);
  let active = true;
  const cleanup = () => {
    if (!active) return;
    active = false;
    document.removeEventListener('pointerdown', unlock, true);
    document.removeEventListener('click', unlock, true);
    document.removeEventListener('visibilitychange', hidden);
    stopChildFeedback();
    installed = false;
    allowed = () => false;
    if (audio) {
      try { const closed = audio.close(); if (closed && closed.catch) closed.catch(() => {}); } catch {}
      audio = null;
    }
    if (removeListeners === cleanup) removeListeners = null;
  };
  removeListeners = cleanup;
  return cleanup;
}

export function celebrate(kind, { target, silent = false } = {}) {
  if (!installed || document.hidden || !CUES[kind]) return false;
  if (!silent) chime(kind);
  // The burst sits above the touched object and never catches a child's taps.
  const bounds = target && target.getBoundingClientRect ? target.getBoundingClientRect() : null;
  const width = window.innerWidth || document.documentElement.clientWidth;
  const height = window.innerHeight || document.documentElement.clientHeight;
  const x = bounds ? bounds.left + bounds.width / 2 : width / 2;
  const y = bounds ? bounds.top + bounds.height / 2 : height / 2;
  for (const effect of [...effects]) if (effect.target === target) clearEffect(effect);
  // Rapid watering still gives one clear response rather than piling up bursts.
  while (effects.size >= 1) clearEffect(effects.values().next().value);
  const node = document.createElement('div');
  node.className = 'child-celebration';
  node.dataset.childFeedback = kind;
  node.setAttribute('aria-hidden', 'true');
  node.style.left = `${Math.max(28, Math.min(width - 28, x))}px`;
  node.style.top = `${Math.max(28, Math.min(height - 28, y))}px`;
  const center = document.createElement('span');
  center.className = 'child-celebration-icon'; center.textContent = CUES[kind].icon;
  node.appendChild(center);
  if (kind !== 'retry') {
    const count = kind === 'water' || kind === 'plant' ? 5 : 8;
    for (let index = 0; index < count; index++) {
      const particle = document.createElement('i');
      const angle = Math.PI * 2 * index / count;
      particle.textContent = kind === 'water' ? '💧' : kind === 'bloom' ? '✿' : '✦';
      particle.style.setProperty('--burst-x', `${Math.cos(angle) * 63}px`);
      particle.style.setProperty('--burst-y', `${Math.sin(angle) * 52 - 14}px`);
      particle.style.setProperty('--burst-turn', `${index % 2 ? 25 : -25}deg`);
      particle.style.setProperty('--burst-color', ['#eea627', '#da7966', '#70a08a'][index % 3]);
      node.appendChild(particle);
    }
  }
  document.body.appendChild(node);
  if (target && target.classList) target.classList.add('child-success');
  const effect = { node, target, timer: null };
  effect.timer = setTimeout(() => clearEffect(effect), 1150);
  effects.add(effect);
  return true;
}
