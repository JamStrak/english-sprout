import {config} from './growth-core.js';

export const GROWTH_SETTINGS_KEY = 'xiaoya-english:growth-settings:v1';

/** Inject runtime.appStorage so GM sandbox preferences stay in disposable memory. */
export function createGrowthSettingsStore({storage, ids = []} = {}) {
  if (!storage || typeof storage.getItem !== 'function' || typeof storage.setItem !== 'function') {
    throw new TypeError('Growth settings require a Storage-compatible adapter.');
  }
  const speciesIds = Array.isArray(ids) ? [...ids] : [];
  return Object.freeze({
    load() {
      try {
        return config(JSON.parse(storage.getItem(GROWTH_SETTINGS_KEY) || 'null'), speciesIds);
      } catch {
        // Do not erase malformed or inaccessible data just because the panel was opened.
        return config({}, speciesIds);
      }
    },
    save(value) {
      const normalized = config(value, speciesIds);
      // Let quota/access failures reach the UI; only a successful write counts as saved.
      storage.setItem(GROWTH_SETTINGS_KEY, JSON.stringify(normalized));
      return normalized;
    },
  });
}
