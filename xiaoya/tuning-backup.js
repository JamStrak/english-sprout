import {appStorage} from './runtime.js';
import {ECONOMY_SETTINGS_KEY, normalizeEconomySettings, validateEconomySettings, notifyEconomySettings} from './economy-settings.js';
import {GROWTH_SETTINGS_KEY} from './growth-settings.js';
import {config as growthConfig} from './growth-core.js';
import {GROWTH_FLOWERS} from './growth-catalog.js';
import {SOUND_SETTINGS_KEY, SOUND_SETTINGS_LIMIT, normalizeSoundSettings, soundSettings} from './sound-settings.js';
import {gardenMusicSettings} from './garden-music.js';

export const TUNING_BACKUP_SCHEMA = 'xiaoya-tuning-backup/v1';
export const TUNING_BACKUP_LIMIT = 8 * 1024 * 1024;
export const PREFERENCES_KEY = 'xiaoya-english:preferences:v1';
const ids = GROWTH_FLOWERS.map(flower=>flower.id);
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const bytes = value => new TextEncoder().encode(value).byteLength;
const stable = value => JSON.stringify(Array.isArray(value) ? value.map(v=>JSON.parse(stable(v))) : object(value) ? Object.fromEntries(Object.keys(value).sort().map(key=>[key,JSON.parse(stable(value[key]))])) : value);
const equivalent = (a,b) => stable(a) === stable(b);
function exactKeys(value,keys,label) {
  if (!object(value) || Object.keys(value).length!==keys.length || keys.some(key=>!Object.hasOwn(value,key))) throw new Error(`${label}字段不完整或包含不支持的字段。`);
}
function read(storage,key) {
  const raw = storage.getItem(key);
  if (raw===null) return null;
  try { const value=JSON.parse(raw); if(!object(value))throw Error(); return value; }
  catch { throw new Error(`已保存的 ${key} 无法读取，请先保留原始数据。`); }
}
function validatedSettings(value) {
  exactKeys(value,['economy','growth','sounds','gardenMusic'],'参数');
  validateEconomySettings(value.economy);
  exactKeys(value.growth,['schema','releaseId','defaults','overrides','motion'],'成长参数');
  if (!equivalent(value.growth,growthConfig(value.growth,ids))) throw new Error('成长参数包含无效花种、阶段大小、动效或浇水次数。');
  if (!equivalent(value.sounds,normalizeSoundSettings(value.sounds))) throw new Error('声音参数或本机音频无效，请使用完整的参数备份。');
  if (bytes(JSON.stringify(value.sounds))>SOUND_SETTINGS_LIMIT) throw new Error('声音参数超过 5 MiB。');
  if (!equivalent(value.gardenMusic,gardenMusicSettings(value.gardenMusic))) throw new Error('背景音乐音量或开关无效。');
  return JSON.parse(JSON.stringify(value));
}
export function validateTuningBackup(input) {
  let value=input;
  if (typeof value==='string') {
    if (bytes(value)>TUNING_BACKUP_LIMIT) throw new Error('参数备份不能超过 8 MiB。');
    try { value=JSON.parse(value); } catch { throw new Error('不是有效的 JSON 参数备份。'); }
  }
  exactKeys(value,['schema','exportedAt','settings'],'备份');
  if (value.schema!==TUNING_BACKUP_SCHEMA) throw new Error('不支持这个参数备份版本。');
  if (typeof value.exportedAt!=='string' || !Number.isFinite(Date.parse(value.exportedAt))) throw new Error('备份时间无效。');
  const settings=validatedSettings(value.settings);
  const result={schema:TUNING_BACKUP_SCHEMA,exportedAt:value.exportedAt,settings};
  if(bytes(JSON.stringify(result))>TUNING_BACKUP_LIMIT) throw new Error('参数备份不能超过 8 MiB。');
  return result;
}
/** Only stored tuning preferences are exported. No child, lesson, garden or microphone data. */
export function exportTuningBackup({storage=appStorage,now=()=>new Date()}={}) {
  const economy=read(storage,ECONOMY_SETTINGS_KEY),growth=read(storage,GROWTH_SETTINGS_KEY),sounds=read(storage,SOUND_SETTINGS_KEY),prefs=read(storage,PREFERENCES_KEY);
  return validateTuningBackup({schema:TUNING_BACKUP_SCHEMA,exportedAt:now().toISOString(),settings:{
    economy:economy===null?normalizeEconomySettings():economy,
    growth:growthConfig(growth,ids),
    sounds:sounds===null?normalizeSoundSettings():sounds,
    gardenMusic:gardenMusicSettings(prefs?.gardenMusic),
  }});
}
/** Preflight every section before writing. Roll back previously written keys on any storage error. */
export function restoreTuningBackup(input,{storage=appStorage}={}) {
  let backup, previous, writes;
  try {
    backup=validateTuningBackup(input);
    const keys=[ECONOMY_SETTINGS_KEY,GROWTH_SETTINGS_KEY,SOUND_SETTINGS_KEY,PREFERENCES_KEY];
    previous=new Map(keys.map(key=>[key,storage.getItem(key)]));
    const prefs=read(storage,PREFERENCES_KEY)||{};
    if (typeof storage.removeItem!=='function' && [...previous.values()].includes(null)) throw new Error('存储适配器不支持安全恢复，请刷新到最新版本。');
    writes=[
      [ECONOMY_SETTINGS_KEY,backup.settings.economy],[GROWTH_SETTINGS_KEY,backup.settings.growth],
      [SOUND_SETTINGS_KEY,backup.settings.sounds],[PREFERENCES_KEY,{...prefs,gardenMusic:backup.settings.gardenMusic}],
    ].map(([key,value])=>[key,JSON.stringify(value)]);
  } catch(error) {return {ok:false,error:error.message};}
  const changed=[];
  try {
    for(const [key,value] of writes) { storage.setItem(key,value); changed.push(key); }
  } catch(error) {
    const rollbackErrors=[];
    for(const key of changed.reverse()) {
      try {const raw=previous.get(key);if(raw===null)storage.removeItem(key);else storage.setItem(key,raw);}
      catch(rollbackError){rollbackErrors.push(`${key}: ${rollbackError.message}`);}
    }
    return {ok:false,error:rollbackErrors.length ? `恢复失败，部分旧参数未能回滚；请保留备份并重试。${rollbackErrors.join('；')}` : `恢复失败，原参数已保留：${error.message||'浏览器存储不可用'}`,rollbackErrors};
  }
  if(storage===appStorage) soundSettings.reload();
  notifyEconomySettings(backup.settings.economy);
  if(typeof globalThis.dispatchEvent==='function' && typeof globalThis.CustomEvent==='function') globalThis.dispatchEvent(new CustomEvent('xiaoya:tuning-restored'));
  return {ok:true,backup};
}
