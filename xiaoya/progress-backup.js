import {STORAGE_KEY,validateState,createState} from './learning.js';
import {LEGACY_GARDEN_KEY,readGardenHistory} from './garden-history.js';
import {MEADOW_KEY,validateMeadow,createMeadow} from './garden-meadow.js';
import {PRACTICE_KEY,validatePracticePlan,createPracticePlan} from './practice-plan.js';
import {CHALLENGE_KEY,validateChallenges,createChallenges} from './challenges.js';
import {VOICE_KEY,VOICES} from './voices.js';
import {GUIDANCE_KEY} from './guidance-policy.js';
import {WELCOME_GREETINGS_KEY} from './welcome-greetings.js';

export const PREFERENCES_KEY='xiaoya-english:preferences:v1';
export const RESTORE_KEY='xiaoya-english:restore-in-progress:v1';
export const BACKUP_KEYS=Object.freeze([STORAGE_KEY,LEGACY_GARDEN_KEY,MEADOW_KEY,PRACTICE_KEY,CHALLENGE_KEY,PREFERENCES_KEY,VOICE_KEY,GUIDANCE_KEY,WELCOME_GREETINGS_KEY]);
export const MAX_BACKUP_BYTES=10*1024*1024;
const plain=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const own=(value,key)=>Object.prototype.hasOwnProperty.call(value,key);
const invalid=()=>{throw new Error('备份格式不完整或无法读取，当前进度没有改变。');};
const json=(value)=>value===undefined?null:JSON.stringify(value);

export function snapshotProgress(storage){return Object.fromEntries(BACKUP_KEYS.map(key=>[key,storage.getItem(key)]));}

function validateRecords(records){
  if(!plain(records)||Object.keys(records).length!==BACKUP_KEYS.length||BACKUP_KEYS.some(key=>!own(records,key)||(records[key]!==null&&typeof records[key]!=='string')))invalid();
  const read=key=>records[key]===null?null:JSON.parse(records[key]);
  const state=read(STORAGE_KEY); if(state!==null)validateState(state);
  readGardenHistory(records[LEGACY_GARDEN_KEY]);
  const meadow=read(MEADOW_KEY); if(meadow!==null)validateMeadow(meadow);
  const practice=read(PRACTICE_KEY); if(practice!==null)validatePracticePlan(practice);
  const challenges=read(CHALLENGE_KEY); if(challenges!==null)validateChallenges(challenges);
  for(const key of [PREFERENCES_KEY,GUIDANCE_KEY,WELCOME_GREETINGS_KEY])if(records[key]!==null&&!plain(read(key)))invalid();
  if(records[VOICE_KEY]!==null&&!VOICES.some(voice=>voice.id===records[VOICE_KEY]))invalid();
  return {state:state||createState(),meadow:meadow||createMeadow(),practice:practice||createPracticePlan(),challenges:challenges||createChallenges()};
}

export function createProgressBackup(storage,{sandbox=false,date=new Date()}={}){
  const records=snapshotProgress(storage);
  validateRecords(records);
  const backup={product:'xiaoya-english-progress-backup',schemaVersion:1,exportedAt:date.toISOString(),mode:sandbox?'gm-simulation':'player',records};
  if(new TextEncoder().encode(JSON.stringify(backup,null,2)).length>MAX_BACKUP_BYTES)throw new Error('进度超过备份文件大小上限，无法导出。');
  return backup;
}

/** v0.27 normal exports are supported; diagnostic and GM exports are not backups. */
export function parseProgressBackup(text){
  if(typeof text!=='string'||new TextEncoder().encode(text).length>MAX_BACKUP_BYTES)invalid();
  let data; try{data=JSON.parse(text);}catch{invalid();}
  if(!plain(data)||data.problem||data.testing)invalid();
  let records,exportedAt;
  if(data.product==='xiaoya-english-progress-backup'){
    if(data.schemaVersion!==1||data.mode!=='player'||typeof data.exportedAt!=='string'||!Number.isFinite(Date.parse(data.exportedAt)))invalid();
    records=data.records; exportedAt=data.exportedAt;
  }else if(data.product==='xiaoya-english'){
    if(!['state','rawGarden','meadow','practice','challenges','preferences','voice'].every(key=>own(data,key)))invalid();
    if(!['state','meadow','practice','challenges','preferences'].every(key=>plain(data[key])))invalid();
    if(data.rawGarden!==null&&typeof data.rawGarden!=='string')invalid();
    records={[STORAGE_KEY]:json(data.state),[LEGACY_GARDEN_KEY]:data.rawGarden,[MEADOW_KEY]:json(data.meadow),[PRACTICE_KEY]:json(data.practice),[CHALLENGE_KEY]:json(data.challenges),[PREFERENCES_KEY]:json(data.preferences),[VOICE_KEY]:data.voice,[GUIDANCE_KEY]:null,[WELCOME_GREETINGS_KEY]:null};
    exportedAt=data.exported||'旧版备份';
  }else invalid();
  let summary;try{summary=validateRecords(records);}catch{invalid();}
  return {records,exportedAt,summary:{shells:summary.meadow.shells,water:summary.meadow.water,plants:summary.meadow.plants.length,rounds:summary.meadow.rounds.length,observations:summary.state.evidence.length}};
}

/** Synchronous writes, snapshot comparison and best-effort rollback on failure. */
export function restoreProgress(storage,backup,expected){
  validateRecords(backup.records);
  const before=snapshotProgress(storage);
  if(BACKUP_KEYS.some(key=>before[key]!==expected[key]))throw new Error('本机进度在预览后发生变化，请重新选择备份再确认。');
  if(storage.getItem(RESTORE_KEY)!==null)throw new Error('另一页面正在恢复进度，请稍后重试。');
  let marker=false;
  try{
    storage.setItem(RESTORE_KEY,String(Date.now()));marker=true;
    for(const key of BACKUP_KEYS){const value=backup.records[key];if(value===null)storage.removeItem(key);else storage.setItem(key,value);}
  }catch(error){
    if(!marker)throw new Error('恢复未开始，请检查浏览器存储空间或权限。');
    let rollbackFailed=false;
    for(const key of BACKUP_KEYS)try{if(before[key]===null)storage.removeItem(key);else storage.setItem(key,before[key]);}catch{rollbackFailed=true;}
    if(rollbackFailed)throw new Error('恢复失败，原记录未能完全回滚。请保留备份文件并重新打开页面检查。');
    throw new Error('恢复失败，已回滚原记录。请检查浏览器存储空间或权限。');
  }finally{if(marker)try{storage.removeItem(RESTORE_KEY);}catch{}}
}
