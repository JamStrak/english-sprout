/** Independent, local-only product state. Evidence is never inferred from furniture or recognition candidates. */
import {THEMES, EVENTS, ITEMS, GOALS, ALPHABET_NODES, ALPHABET_CORE_GOALS} from './content.js';

export const STORAGE_KEY = 'xiaoya-english:state:v1';
const PRODUCT = 'xiaoya-english';
const MAX_RECORDS = 20000;
const eventMap = new Map(EVENTS.map((x) => [x.id,x]));
const itemMap = new Map(ITEMS.map((x) => [x.id,x]));
const nodeMap = new Map(ALPHABET_NODES.map((x) => [x.id,x]));
const results = new Set(['independent','supported','not_yet','unclear','device_error']);
const own = (obj,key) => Object.prototype.hasOwnProperty.call(obj,key);
const fail = (message) => { throw new Error(`小芽记录无效：${message}`); };
function object(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || ![Object.prototype,null].includes(Object.getPrototypeOf(value))) fail('应为普通对象');
  return value;
}
function keys(value,allowed) { object(value); if(Object.keys(value).some((key) => !allowed.includes(key))) fail('含有未知字段'); }
function identifier(value) {
  if(typeof value !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,159}$/.test(value) || ['constructor','prototype','__proto__'].includes(value)) fail('记录编号错误');
  return value;
}
function findEvent(id) { const value=eventMap.get(id); if(!value) fail('未知生活事件'); return value; }
function findGoal(id) { if(!GOALS.some((x)=>x.id===id)) fail('未知沟通目标'); return id; }

/** Local calendar labels; UTC is used only for validating calendar components. */
export function localDay(value = new Date()) {
  if(value instanceof Date) {
    if(!Number.isFinite(value.getTime())) fail('日期错误');
    value=`${value.getFullYear()}-${String(value.getMonth()+1).padStart(2,'0')}-${String(value.getDate()).padStart(2,'0')}`;
  }
  if(typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) fail('日期应为 YYYY-MM-DD');
  const [year,month,day]=value.split('-').map(Number);
  const probe=new Date(Date.UTC(year,month-1,day));
  if(year<2000 || year>2199 || probe.getUTCFullYear()!==year || probe.getUTCMonth()!==month-1 || probe.getUTCDate()!==day) fail('日历日期错误');
  return value;
}

export function createState() {
  return {schemaVersion:1,product:PRODUCT,evidence:[],corrections:[],completions:{},items:{},alphabet:{enabled:false,enabledOn:null,letters:{}}};
}

function normalizeEvidence(input) {
  keys(input,['attemptId','eventId','contextId','goalId','kind','result','source','helped','date','phraseId']);
  const event=findEvent(input.eventId);
  identifier(input.attemptId);
  const contextId=input.contextId ?? event.id;
  if(!event.contexts.some((context)=>context.id===contextId)) fail('情境不属于当前事件');
  if(input.goalId !== undefined && input.goalId !== event.goalId) fail('沟通目标不属于当前事件');
  if(!['listening','speech'].includes(input.kind) || !results.has(input.result) || !['parent','machine'].includes(input.source)) fail('观察类型错误');
  if(typeof input.helped !== 'boolean') fail('帮助状态须明确记录');
  const phraseId=input.phraseId ?? null;
  if(phraseId !== null && (phraseId!==event.lessonId || input.kind!=='speech' || !['independent','supported'].includes(input.result))) fail('原句证据与观察不一致');
  return {attemptId:input.attemptId,eventId:event.id,contextId,goalId:event.goalId,kind:input.kind,result:input.helped && input.result==='independent'?'supported':input.result,
    source:input.source,helped:input.helped,date:localDay(input.date),phraseId};
}

function normalizeCorrection(state,attemptId,input) {
  keys(input,['correctionId','result','helped','phraseId','date']);
  const original=state.evidence.find((x)=>x.attemptId===attemptId);
  if(!original) fail('找不到待纠正的观察');
  identifier(input.correctionId);
  if(!results.has(input.result) || typeof input.helped!=='boolean') fail('纠正结果错误');
  const phraseId=input.phraseId ?? null;
  if(phraseId !== null && (phraseId !== findEvent(original.eventId).lessonId || original.kind!=='speech' || !['independent','supported'].includes(input.result))) fail('纠正的原句不匹配');
  const date=localDay(input.date);
  if(date < original.date) fail('纠正日期早于观察日期');
  return {correctionId:input.correctionId,attemptId,result:input.helped && input.result==='independent'?'supported':input.result,helped:input.helped,phraseId,date,source:'parent'};
}

/** JSON-safe metadata only. Audio, transcripts and legacy-product objects are rejected. */
export function validateState(state) {
  keys(state,['schemaVersion','product','evidence','corrections','completions','items','alphabet']);
  if(state.schemaVersion!==1 || state.product!==PRODUCT) fail('产品或版本不匹配');
  if(!Array.isArray(state.evidence) || state.evidence.length>MAX_RECORDS || !Array.isArray(state.corrections) || state.corrections.length>MAX_RECORDS) fail('观察列表错误');
  const attempts=new Set();
  for(const entry of state.evidence) {
    const normalized=normalizeEvidence(entry);
    if(JSON.stringify(normalized)!==JSON.stringify(entry)) {
      if(Object.keys(normalized).some((key)=>normalized[key]!==entry[key])) fail('观察不是规范记录');
    }
    if(attempts.has(entry.attemptId)) fail('观察编号重复');
    attempts.add(entry.attemptId);
  }
  const correctionIds=new Set(); const lastCorrectionDates=new Map();
  for(const correction of state.corrections) {
    keys(correction,['correctionId','attemptId','result','helped','phraseId','date','source']);
    const {attemptId,source,...input}=correction;
    if(source!=='parent') fail('纠正必须来自家长观察');
    const normalized=normalizeCorrection(state,attemptId,input);
    if(Object.keys(normalized).some((key)=>normalized[key]!==correction[key])) fail('纠正不是规范记录');
    if(correctionIds.has(correction.correctionId)) fail('纠正编号重复');
    if((lastCorrectionDates.get(attemptId)??'')>correction.date) fail('纠正历史日期倒退');
    correctionIds.add(correction.correctionId);
    lastCorrectionDates.set(attemptId,correction.date);
  }
  object(state.completions); object(state.items);
  for(const [id,completion] of Object.entries(state.completions)) {
    const event=findEvent(id);
    keys(completion,['firstDate','lastDate','count']);
    localDay(completion.firstDate); localDay(completion.lastDate);
    if(completion.firstDate>completion.lastDate || !Number.isInteger(completion.count) || completion.count<1 || completion.count>100000) fail('事件完成记录错误');
    if(!own(state.items,event.itemId)) fail('首通收藏缺失');
  }
  for(const [id,item] of Object.entries(state.items)) {
    const catalogue=itemMap.get(id); if(!catalogue) fail('未知收藏物');
    keys(item,['earnedOn','eventId','x','y']); localDay(item.earnedOn);
    if(item.eventId!==catalogue.eventId || !own(state.completions,item.eventId) || state.completions[item.eventId].firstDate!==item.earnedOn) fail('收藏来源错误');
    if(!((item.x===null && item.y===null) || (Number.isFinite(item.x)&&Number.isFinite(item.y)&&item.x>=0&&item.x<=1&&item.y>=0&&item.y<=1))) fail('摆放位置错误');
  }
  keys(state.alphabet,['enabled','enabledOn','letters']); object(state.alphabet.letters);
  if(typeof state.alphabet.enabled!=='boolean') fail('文字区状态错误');
  if(state.alphabet.enabled) localDay(state.alphabet.enabledOn);
  else if(state.alphabet.enabledOn!==null || Object.keys(state.alphabet.letters).length) fail('文字区尚未开启');
  for(const [id,record] of Object.entries(state.alphabet.letters)) {
    const node=nodeMap.get(id); if(!node) fail('未知字母节点');
    keys(record,['letter','date']); localDay(record.date);
    if(record.letter!==node.letter || record.date<state.alphabet.enabledOn) fail('字母收藏记录错误');
  }
  return state;
}

function same(a,b) { return Object.keys(a).length===Object.keys(b).length && Object.keys(a).every((key)=>a[key]===b[key]); }

export function recordEvidence(state,input) {
  validateState(state); const entry=normalizeEvidence(input);
  const existing=state.evidence.find((x)=>x.attemptId===entry.attemptId);
  if(existing) { if(!same(existing,entry)) fail('同一观察编号不能覆盖原始表现'); return state; }
  if(state.evidence.length>=MAX_RECORDS) fail('观察记录已达上限，请先导出备份');
  return {...state,evidence:[...state.evidence,entry]};
}

/** Parent corrections retain the original attempt and every previous correction. */
export function correctEvidence(state,attemptId,input) {
  validateState(state); identifier(attemptId); const entry=normalizeCorrection(state,attemptId,input);
  const existing=state.corrections.find((x)=>x.correctionId===entry.correctionId);
  if(existing) { if(!same(existing,entry)) fail('同一纠正编号不能覆盖历史'); return state; }
  if(state.corrections.length>=MAX_RECORDS) fail('纠正记录已达上限');
  const previous=state.corrections.filter((x)=>x.attemptId===attemptId).slice(-1)[0];
  if(previous && entry.date<previous.date) fail('纠正日期不能倒退');
  return {...state,corrections:[...state.corrections,entry]};
}

function effective(state) {
  const corrections=new Map(state.corrections.map((x)=>[x.attemptId,x]));
  return state.evidence.map((entry)=> {
    const correction=corrections.get(entry.attemptId);
    return correction ? {...entry,result:correction.result,source:'parent',helped:correction.helped,phraseId:correction.phraseId,originSource:entry.source,corrected:true} : entry;
  });
}

/** For the parent audit view; originals remain in state.evidence. */
export function effectiveEvidence(state) { validateState(state); return effective(state); }

function setting(entry) { return findEvent(entry.eventId).contexts.find((x)=>x.id===entry.contextId).settingId; }
function transferred(entries) { return entries.some((a,index)=>entries.slice(index+1).some((b)=>a.date!==b.date && setting(a)!==setting(b))); }
function reliableSpeech(entry) { return entry.kind==='speech' && entry.source==='parent' && entry.result==='independent' && !entry.helped; }
function deriveStatus(state,id,records=effective(state)) {
  const entries=records.filter((x)=>x.goalId===id);
  const listeningEntries=entries.filter((x)=>x.kind==='listening' && x.result==='independent' && !x.helped);
  const independentEntries=entries.filter(reliableSpeech);
  const supportedEntries=entries.filter((x)=>x.kind==='speech'&&x.source==='parent'&&x.result==='supported');
  const listening=new Set(listeningEntries.map(setting)).size>=2;
  const independent=independentEntries.length>0;
  const supported=supportedEntries.length>0;
  const retained=transferred(independentEntries);
  const played=EVENTS.some((event)=>event.goalId===id&&own(state.completions,event.id));
  return {goalId:id,listening,supported,independent,retained,passed:retained,
    level:retained?'passed':independent?'independent':supported?'supported':listening?'listening':played||entries.length?'participated':'unseen',
    listeningCount:listeningEntries.length,supportedCount:supportedEntries.length,independentCount:independentEntries.length,
    candidateCount:entries.filter((x)=>x.kind==='speech'&&x.source==='machine'&&['independent','supported'].includes(x.result)).length,
    lastDate:entries.reduce((last,x)=>x.date>last?x.date:last,''),evidenceCount:entries.length};
}

export function goalStatus(state,goalId) { validateState(state); findGoal(goalId); return deriveStatus(state,goalId); }

/** Completing play awards the fixed item, even without speaking. Same-day repeats are idempotent. */
export function completeEvent(state,eventId,date=localDay()) {
  validateState(state); const event=findEvent(eventId); date=localDay(date);
  const old=state.completions[event.id];
  if(old && date<=old.lastDate) return state;
  const completion=old?{...old,lastDate:date,count:old.count+1}:{firstDate:date,lastDate:date,count:1};
  return {...state,completions:{...state.completions,[event.id]:completion},items:old?state.items:{...state.items,[event.itemId]:{earnedOn:date,eventId:event.id,x:null,y:null}}};
}

/** Coordinates are normalized to 0..1, independent of phone/tablet pixels. */
export function placeItem(state,itemId,position) {
  validateState(state); keys(position,['x','y']);
  if(!itemMap.has(itemId) || !own(state.items,itemId)) fail('尚未获得该收藏物');
  const {x,y}=position;
  if(!Number.isFinite(x)||!Number.isFinite(y)||x<0||x>1||y<0||y>1) fail('摆放位置须在小屋内');
  if(state.items[itemId].x===x && state.items[itemId].y===y) return state;
  return {...state,items:{...state.items,[itemId]:{...state.items[itemId],x,y}}};
}

/** A checkup changes setting after reliable parent-confirmed speech, never after assisted play. */
export function checkupContext(state,eventId) {
  validateState(state);
  const event=findEvent(eventId);
  const records=effective(state).filter(x=>x.goalId===event.goalId && reliableSpeech(x));
  const recent=records.reverse().sort((a,b)=>b.date.localeCompare(a.date))[0];
  return recent ? event.contexts.find(x=>x.settingId!==setting(recent))??event.contexts[0] : event.contexts[1]??event.contexts[0];
}

/** Pick inside the requested theme only. A review may change setting, never fabricate transfer evidence. */
export function selectEvent(state,themeId,date=localDay()) {
  validateState(state); date=localDay(date);
  if(!THEMES.some((x)=>x.id===themeId)) fail('未知生活主题');
  const records=effective(state); const events=EVENTS.filter((x)=>x.theme===themeId);
  const ordered=[...events].sort((a,b)=> {
    function priority(event) {
      const entries=records.filter((x)=>x.eventId===event.id);
      const last=entries.reduce((value,x)=>x.date>value?x.date:value,'');
      const status=deriveStatus(state,event.goalId,records);
      if(last && last<date && (status.independent||status.supported) && !status.passed) return 0;
      if(!own(state.completions,event.id)) return 1;
      return 2;
    }
    return priority(a)-priority(b) || (state.completions[a.id]?.lastDate??'').localeCompare(state.completions[b.id]?.lastDate??'') || events.indexOf(a)-events.indexOf(b);
  });
  const event=ordered[0]; const status=deriveStatus(state,event.goalId,records);
  const recent=records.filter((x)=>x.goalId===event.goalId && reliableSpeech(x)).sort((a,b)=>b.date.localeCompare(a.date))[0];
  const context=recent ? event.contexts.find((x)=>x.settingId!==setting(recent))??event.contexts[0] : event.contexts[0];
  return {...event,context,mode:status.passed?'extend':status.independent?'challenge':status.supported||status.listening?'review':'learn',reason:status.independent?'换情境观察独立表达':status.supported?'逐步减少帮助':'继续生活里的交流'};
}

export function speakingAlert(state,goalId) {
  validateState(state); if(goalId!==undefined) findGoal(goalId);
  const parentEntries=effective(state).filter((x)=>x.kind==='speech'&&x.source==='parent'&&(!goalId||x.goalId===goalId));
  // Participation is evidence that an observation may be useful, never evidence
  // that a child had a valid opportunity to speak or failed to express an idea.
  const completions=Object.entries(state.completions).filter(([id])=>!goalId||findEvent(id).goalId===goalId).map(([,record])=>record);
  const completedCount=completions.reduce((total,record)=>total+record.count,0);
  const completedDays=new Set(completions.flatMap((record)=>[record.firstDate,record.lastDate]));
  if(!parentEntries.length && completedCount>=3 && completedDays.size>=2) {
    return {active:true,type:'needs_observation',opportunities:0,days:completedDays.size,completedCount,
      message:'已在不同日子完成多次互动，还没有家长口语观察。请陪孩子观察一次；仅凭游玩记录，不能判断孩子是否会说。'};
  }
  const allEntries=parentEntries.filter((x)=>['independent','supported','not_yet'].includes(x.result)).sort((a,b)=>a.date.localeCompare(b.date));
  let lastIndependent=-1;
  allEntries.forEach((entry,index)=>{if(reliableSpeech(entry)) lastIndependent=index;});
  const entries=allEntries.slice(lastIndependent+1);
  const dates=new Set(entries.map((x)=>x.date));
  const independent=entries.filter(reliableSpeech);
  const supported=entries.filter((x)=>x.result==='supported');
  const active=entries.length>=3&&dates.size>=2&&independent.length===0;
  return {active,type:active?(supported.length?'supported_only':'not_speaking'):null,opportunities:entries.length,days:dates.size,
    message:active?(supported.length?'最近这些交流机会中，表达仍需要帮助；试着在新情境留一点等待时间。':'最近已有多次交流机会，尚未观察到合适的表达；调整邀请方式，提供图画与中文帮助。'):''};
}

function eligibility(state) {
  const records=effective(state);
  const passed=ALPHABET_CORE_GOALS.filter((id)=>deriveStatus(state,id,records).passed);
  return {eligible:passed.length===ALPHABET_CORE_GOALS.length,passed,required:[...ALPHABET_CORE_GOALS],remaining:ALPHABET_CORE_GOALS.filter((id)=>!passed.includes(id))};
}
export function alphabetEligibility(state) { validateState(state); return eligibility(state); }

export function enableAlphabet(state,date=localDay()) {
  validateState(state); date=localDay(date);
  if(!eligibility(state).eligible) fail('核心口语目标尚未获得稳定证据');
  if(state.alphabet.enabled) return state;
  const latest=effective(state).filter((x)=>ALPHABET_CORE_GOALS.includes(x.goalId)&&reliableSpeech(x)).reduce((day,x)=>x.date>day?x.date:day,'');
  if(date<latest) fail('开启日期早于能力证据');
  return {...state,alphabet:{...state.alphabet,enabled:true,enabledOn:date}};
}

/** The caller completes the node's familiar communication activity before claiming; this is not a new mastery score. */
export function collectLetter(state,nodeId,date=localDay()) {
  validateState(state); date=localDay(date); const node=nodeMap.get(nodeId);
  if(!node) fail('未知字母活动');
  if(!state.alphabet.enabled || !eligibility(state).eligible || !deriveStatus(state,node.goalId).passed) fail('文字探索尚不可用');
  if(date<state.alphabet.enabledOn) fail('收藏日期早于文字区开启');
  if(own(state.alphabet.letters,nodeId)) return state;
  return {...state,alphabet:{...state.alphabet,letters:{...state.alphabet.letters,[nodeId]:{letter:node.letter,date}}}};
}

/** Exact phrase evidence is additional to meaning-equivalent short speech and to collecting all letters. */
export function canRevealPhrase(state,phraseId) {
  validateState(state);
  if(!EVENTS.some((x)=>x.lessonId===phraseId)) fail('未知目标短句');
  if(!state.alphabet.enabled || !eligibility(state).eligible || Object.keys(state.alphabet.letters).length!==26) return false;
  return transferred(effective(state).filter((x)=>x.phraseId===phraseId&&reliableSpeech(x)));
}
