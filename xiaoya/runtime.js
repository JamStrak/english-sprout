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

// The build flag is compiled into the release; a URL cannot enable public GM.
export const GM_SANDBOX = INTERNAL_BUILD && new URLSearchParams(globalThis.location?.search || '').get('gm') === 'test';
const testStorage = createMemoryStorage();
// Delay real Storage access until an existing try/catch can handle denied access.
export const appStorage = Object.freeze({
  getItem(key) { return (GM_SANDBOX ? testStorage : globalThis.localStorage).getItem(key); },
  setItem(key, value) { return (GM_SANDBOX ? testStorage : globalThis.localStorage).setItem(key, value); },
});
