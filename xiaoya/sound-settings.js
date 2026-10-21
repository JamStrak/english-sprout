import {appStorage} from './runtime.js';
import {SOUND_EVENTS, SOUND_ASSETS} from './sound-catalog.js';

export const SOUND_SETTINGS_KEY = 'xiaoya-english:sounds:v1';
export const SOUND_FILE_LIMIT = 2 * 1024 * 1024;
export const SOUND_SETTINGS_LIMIT = 5 * 1024 * 1024;
export const SOUND_MIME_TYPES = Object.freeze(['audio/mpeg','audio/mp3','audio/wav','audio/x-wav','audio/wave','audio/ogg','audio/mp4','audio/x-m4a']);
const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
const object = value => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
const volume = (value, fallback) => typeof value === 'number' && Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : fallback;
const copy = value => JSON.parse(JSON.stringify(value));
const knownAssets = new Set(SOUND_ASSETS.map(asset => asset.id));
const knownEvents = new Set(SOUND_EVENTS.map(event => event.id));
const byteLength = value => new TextEncoder().encode(value).byteLength;

/** Only embedded audio is accepted for browser-owned replacements; never URLs. */
function normalizeCustomAsset(id, input) {
  const value = object(input), dataUrl = value.dataUrl || value.url;
  if (!/^custom-[a-zA-Z0-9_-]{1,100}$/.test(id) || typeof dataUrl !== 'string') return null;
  const match = /^data:(audio\/[a-z0-9-]+);base64,([A-Za-z0-9+/]+={0,2})$/.exec(dataUrl);
  if (!match || !SOUND_MIME_TYPES.includes(match[1]) || match[2].length % 4 !== 0) return null;
  const bytes = match[2].length * 3 / 4 - (match[2].endsWith('==') ? 2 : match[2].endsWith('=') ? 1 : 0);
  if (!bytes || bytes > SOUND_FILE_LIMIT) return null;
  return {id, title:typeof value.title === 'string' ? value.title.slice(0, 160) : '本机音频', url:dataUrl, bytes, mime:match[1]};
}

export function normalizeSoundSettings(input) {
  const value = object(input), customAssets = {}, entries = object(value.events);
  for (const [id, asset] of Object.entries(object(value.customAssets))) {
    const normalized = normalizeCustomAsset(id, asset);
    if (normalized) customAssets[id] = normalized;
  }
  const events = {};
  for (const event of SOUND_EVENTS) {
    const saved = object(entries[event.id]);
    const defaultAsset = knownAssets.has(event.assetId) ? event.assetId : null;
    const assetId = saved.assetId === null ? null : (knownAssets.has(saved.assetId) || own(customAssets, saved.assetId)) ? saved.assetId : defaultAsset;
    events[event.id] = {enabled:typeof saved.enabled === 'boolean' ? saved.enabled : event.enabled !== false, assetId, volume:volume(saved.volume, volume(event.volume, 1))};
  }
  return {enabled:typeof value.enabled === 'boolean' ? value.enabled : true, volume:volume(value.volume, .65), events, customAssets};
}

/** Writes succeed atomically from the caller's perspective, including quota errors. */
export function createSoundSettingsStore({storage = appStorage} = {}) {
  const subscribers = new Set();
  let current = normalizeSoundSettings();
  function emit() { for (const callback of subscribers) { try { callback(copy(current)); } catch { /* A listener cannot change whether storage succeeded. */ } } }
  function reload() {
    try {
      const raw = storage.getItem(SOUND_SETTINGS_KEY);
      current = normalizeSoundSettings(raw ? JSON.parse(raw) : null);
      emit();
    } catch { /* Keep last good state; opening a panel never erases inaccessible data. */ }
    return copy(current);
  }
  function commit(value) {
    const next = normalizeSoundSettings(value), serialized = JSON.stringify(next);
    if (byteLength(serialized) > SOUND_SETTINGS_LIMIT) return {ok:false,error:'音效配置超过 5 MiB，请先删除不再使用的本机素材。'};
    try { storage.setItem(SOUND_SETTINGS_KEY, serialized); }
    catch (error) { return {ok:false,error:error?.name === 'QuotaExceededError' ? '浏览器存储空间不足；本次修改未保存，请删除不再使用的本机素材。' : `无法保存音效配置：${error?.message || '浏览器禁止了本地存储'}。本次修改未生效。`}; }
    current = next; emit(); return {ok:true};
  }
  function save(change) {
    const patch = object(change), next = copy(current);
    if (own(patch,'enabled')) next.enabled = patch.enabled;
    if (own(patch,'volume')) next.volume = patch.volume;
    for (const [id, value] of Object.entries(object(patch.customAssets))) {
      if (value === null) delete next.customAssets[id];
      else {
        const asset = normalizeCustomAsset(id, value);
        if (!asset) return {ok:false,error:'本机素材格式无效，仅支持不超过 2 MiB 的 MP3、WAV、OGG 或 M4A 音频。'};
        next.customAssets[id] = asset;
      }
    }
    for (const [id, value] of Object.entries(object(patch.events))) {
      if (!knownEvents.has(id)) return {ok:false,error:`没有找到声音使用点：${id}`};
      next.events[id] = {...next.events[id], ...object(value)};
      const assetId = next.events[id].assetId;
      if (assetId !== null && !knownAssets.has(assetId) && !own(next.customAssets,assetId)) return {ok:false,error:'替换素材不存在，本次修改未保存。'};
    }
    for (const config of Object.values(next.events)) {
      if (config.assetId !== null && !knownAssets.has(config.assetId) && !own(next.customAssets,config.assetId)) return {ok:false,error:'该本机素材仍被使用，请先解除所有使用点的绑定。'};
    }
    return commit(next);
  }
  reload();
  return Object.freeze({
    get:() => copy(current), save, reload,
    subscribe(callback) { subscribers.add(callback); return () => subscribers.delete(callback); },
    export:() => copy(current),
    resetEvent(id) { return knownEvents.has(id) ? save({events:{[id]:normalizeSoundSettings().events[id]}}) : {ok:false,error:'没有找到这个声音使用点。'}; },
    // Reset bindings without silently discarding an uploaded replacement library.
    resetAll:() => commit({...normalizeSoundSettings(), customAssets:current.customAssets}),
  });
}

export const soundSettings = createSoundSettingsStore();
