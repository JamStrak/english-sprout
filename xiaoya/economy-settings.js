import {appStorage} from './runtime.js';

export const ECONOMY_SETTINGS_KEY = 'xiaoya-english:economy-settings:v1';
export const DEFAULT_ECONOMY_SETTINGS = Object.freeze({
  shellReward:2, waterReward:2, starterShellReward:2, starterWaterReward:3,
  packPrice:2, challengeShells:4, challengeWater:6,
  normalWaterNeeded:5, giantWaterNeeded:10, giantChance:.05, giantScale:2.5,
});
export const ECONOMY_LIMITS = Object.freeze({
  shellReward:[0,1000,1], waterReward:[0,1000,1], starterShellReward:[0,1000,1], starterWaterReward:[0,1000,1],
  packPrice:[1,1000,1], challengeShells:[0,1000,1], challengeWater:[0,1000,1],
  normalWaterNeeded:[4,50,1], giantWaterNeeded:[4,50,1], giantChance:[0,1,0], giantScale:[1,4,0],
});
const record = value => value && typeof value === 'object' && !Array.isArray(value);

/** Runtime reads are tolerant of old or damaged preferences; saving/importing is strict. */
export function normalizeEconomySettings(value) {
  const input = record(value) ? value : {};
  return Object.fromEntries(Object.entries(DEFAULT_ECONOMY_SETTINGS).map(([key, fallback]) => {
    const [min,max,integer] = ECONOMY_LIMITS[key];
    let number = input[key];
    if (typeof number !== 'number' || !Number.isFinite(number)) number = fallback;
    number = Math.max(min,Math.min(max,number));
    return [key,integer ? Math.round(number) : number];
  }));
}
export function validateEconomySettings(value) {
  if (!record(value) || Object.keys(value).length !== Object.keys(DEFAULT_ECONOMY_SETTINGS).length) throw new Error('数值参数字段不完整或包含未知字段。');
  for (const [key,[min,max,integer]] of Object.entries(ECONOMY_LIMITS)) {
    const number = value[key];
    if (typeof number !== 'number' || !Number.isFinite(number) || number < min || number > max || (integer && !Number.isInteger(number))) {
      throw new Error(`${key} 必须是 ${min}–${max} 范围内的${integer?'整数':'数值'}。`);
    }
  }
  return {...value};
}
export function notifyEconomySettings(settings) {
  if (typeof globalThis.dispatchEvent === 'function' && typeof globalThis.CustomEvent === 'function') {
    globalThis.dispatchEvent(new CustomEvent('xiaoya:economy-settings-changed',{detail:{...settings}}));
  }
}
export function createEconomySettingsStore({storage=appStorage}={}) {
  return Object.freeze({
    load() { try { return normalizeEconomySettings(JSON.parse(storage.getItem(ECONOMY_SETTINGS_KEY)||'null')); } catch { return {...DEFAULT_ECONOMY_SETTINGS}; } },
    save(value) {
      const settings = validateEconomySettings(value);
      storage.setItem(ECONOMY_SETTINGS_KEY,JSON.stringify(settings));
      notifyEconomySettings(settings);
      return settings;
    },
  });
}
export function getEconomySettings() { return createEconomySettingsStore().load(); }
