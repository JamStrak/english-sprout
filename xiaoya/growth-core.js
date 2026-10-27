import {motionConfig} from './growth-motion.js';
/** Adapted from the asset lab's v09 growth-core.js. No browser or storage dependencies. */
export const DEFAULTS = Object.freeze({
  totalWater: 10,
  scales: Object.freeze([.40, .55, .70, .85, 1]),
});

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value) ? value : {};
// Form fields may contain number strings. Empty fields and booleans are not numbers.
function number(value) {
  if (typeof value !== 'number' && (typeof value !== 'string' || !value.trim())) return null;
  const result = Number(value);
  return Number.isFinite(result) ? result : null;
}

function normalizeProfile(value, fallback) {
  const input = record(value);
  const totalWater = number(input.totalWater);
  const scales = Array.isArray(input.scales) && input.scales.length === 5
    ? input.scales.map((value, index) => {
      const scale = number(value);
      return scale === null ? fallback.scales[index] : clamp(scale, .15, 1.5);
    })
    : [...fallback.scales];
  return {
    totalWater: totalWater === null ? fallback.totalWater : clamp(Math.round(totalWater), 4, 50),
    scales,
  };
}

export function profile(value = {}, fallback = DEFAULTS) {
  return normalizeProfile(value, normalizeProfile(fallback, DEFAULTS));
}

export function config(value = {}, ids = []) {
  const input = record(value);
  const defaults = profile(input.defaults);
  const candidates = record(input.overrides);
  const entries = [];
  for (const id of Array.isArray(ids) ? ids : []) {
    if (typeof id === 'string' && id && Object.hasOwn(candidates, id)) {
      entries.push([id, profile(candidates[id], defaults)]);
    }
  }
  return {
    schema: 'xiaoya-growth-settings/v1',
    releaseId: 'v09-growth-complete',
    defaults,
    overrides: Object.fromEntries(entries),
    motion: motionConfig(input.motion),
  };
}

export function effective(settings, speciesId) {
  const input = record(settings);
  const defaults = profile(input.defaults);
  const overrides = record(input.overrides);
  return Object.hasOwn(overrides, speciesId) ? profile(overrides[speciesId], defaults) : defaults;
}

/** Continuous scaling between five artwork stages; water never mutates a settings object. */
export function sample(water, settings = DEFAULTS) {
  const selected = profile(settings);
  const progress = clamp((number(water) ?? 0) / selected.totalWater, 0, 1);
  const position = progress * 4;
  const stageIndex = Math.min(4, Math.floor(position + 1e-9));
  const next = Math.min(4, stageIndex + 1);
  const fraction = clamp(position - stageIndex, 0, 1);
  const scale = selected.scales[stageIndex] + (selected.scales[next] - selected.scales[stageIndex]) * fraction;
  return {progress, stageIndex, scale, mature: progress >= 1};
}

export function waterStep(water, settings = DEFAULTS) {
  return clamp((number(water) ?? 0) + 1, 0, profile(settings).totalWater);
}
