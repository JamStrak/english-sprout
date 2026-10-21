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
    const value = JSON.parse(source?.getItem(preferencesKey) || 'null')?.gardenMusic;
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      const gardenMusic = {};
      if (typeof value.enabled === 'boolean') gardenMusic.enabled = value.enabled;
      if (typeof value.volume === 'number' && Number.isFinite(value.volume)) gardenMusic.volume = Math.max(0, Math.min(1, value.volume));
      if (Object.keys(gardenMusic).length) memory.setItem(preferencesKey, JSON.stringify({gardenMusic}));
    }
  } catch { /* A broken preference must not block a disposable test session. */ }
  const growthKey = 'xiaoya-english:growth-settings:v1';
  try {
    const raw = source?.getItem(growthKey), value = JSON.parse(raw || 'null');
    if (value && typeof value === 'object' && !Array.isArray(value)) memory.setItem(growthKey, raw);
  } catch { /* The growth workbench will use its normal defaults. */ }
  return memory;
}

// The build flag is compiled into the release; a URL cannot enable public GM.
export const GM_SANDBOX = INTERNAL_BUILD && new URLSearchParams(globalThis.location?.search || '').get('gm') === 'test';
const testStorage = GM_SANDBOX ? createSandboxStorage() : createMemoryStorage();
// Delay real Storage access until an existing try/catch can handle denied access.
export const appStorage = Object.freeze({
  getItem(key) { return (GM_SANDBOX ? testStorage : globalThis.localStorage).getItem(key); },
  setItem(key, value) { return (GM_SANDBOX ? testStorage : globalThis.localStorage).setItem(key, value); },
});
