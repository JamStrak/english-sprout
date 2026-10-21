import {INTERNAL_BUILD} from './build-config.js';

export {INTERNAL_BUILD};

/** A disposable Storage-compatible store. Never copy a child's real records. */
export function createMemoryStorage(initial = {}) {
  const values = new Map(Object.entries(initial).map(([key, value]) => [String(key), String(value)]));
  return Object.freeze({
    get length() { return values.size; },
    key(index) { return [...values.keys()][index] ?? null; },
    getItem(key) { return values.get(String(key)) ?? null; },
    setItem(key, value) { values.set(String(key), String(value)); },
    removeItem(key) { values.delete(String(key)); },
    clear() { values.clear(); },
  });
}

/** Inherit review controls only; never copy learning, garden or mic permission. */
export function createSandboxStorage(readRealStorage = () => globalThis.localStorage) {
  const memory = createMemoryStorage();
  let source;
  try { source = readRealStorage(); } catch { return memory; }
  const preferencesKey = 'xiaoya-english:preferences:v1';
  try {
    const saved = JSON.parse(source?.getItem(preferencesKey) || 'null');
    const preferences = {};
    const value = saved?.gardenMusic;
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      const gardenMusic = {};
      if (typeof value.enabled === 'boolean') gardenMusic.enabled = value.enabled;
      if (typeof value.volume === 'number' && Number.isFinite(value.volume)) gardenMusic.volume = Math.max(0, Math.min(1, value.volume));
      if (Object.keys(gardenMusic).length) preferences.gardenMusic = gardenMusic;
    }
    const controls = saved?.audioControls;
    if (controls && typeof controls === 'object' && !Array.isArray(controls)) {
      const audioControls = {};
      for (const key of ['music', 'reminders']) {
        if (typeof controls[key] === 'boolean') audioControls[key] = controls[key];
      }
      if (Object.keys(audioControls).length) preferences.audioControls = audioControls;
    }
    if (Object.keys(preferences).length) memory.setItem(preferencesKey, JSON.stringify(preferences));
  } catch { /* A broken preference must not block a disposable test session. */ }
  // Only explicit tuning keys are inherited, never the player's progress or wallet.
  for (const key of ['xiaoya-english:growth-settings:v1','xiaoya-english:economy-settings:v1','xiaoya-english:sounds:v1']) {
    try {
      const raw = source?.getItem(key), value = JSON.parse(raw || 'null');
      if (value && typeof value === 'object' && !Array.isArray(value)) memory.setItem(key, raw);
    } catch { /* Each workbench can fall back to its own defaults. */ }
  }
  return memory;
}

// The build flag is compiled into the release; a URL cannot enable public GM.
export const GM_SANDBOX = INTERNAL_BUILD && new URLSearchParams(globalThis.location?.search || '').get('gm') === 'test';
const testStorage = GM_SANDBOX ? createSandboxStorage() : createMemoryStorage();
// Delay real Storage access until an existing try/catch can handle denied access.
export const appStorage = Object.freeze({
  getItem(key) { return (GM_SANDBOX ? testStorage : globalThis.localStorage).getItem(key); },
  setItem(key, value) { return (GM_SANDBOX ? testStorage : globalThis.localStorage).setItem(key, value); },
  removeItem(key) { return (GM_SANDBOX ? testStorage : globalThis.localStorage).removeItem(key); },
});
