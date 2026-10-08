/** Local-first learning state. Dates are local calendar labels, never UTC days. */
import {createGarden,validateGarden} from './garden.js';
export const REVIEW_INTERVALS = Object.freeze([1, 3, 7, 14, 30, 60, 90]);
const RATINGS = new Set(['again', 'help', 'good']);
const BLOCKED_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
const MAX_IMPORT_BYTES = 5_000_000;
const MAX_HISTORY_DAYS = 36_600;

function fail(message) {
  throw new Error(`学习记录无效：${message}`);
}

function isRecord(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function dateParts(day) {
  if (typeof day !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(day)) fail('日期格式应为 YYYY-MM-DD');
  const [year, month, date] = day.split('-').map(Number);
  if (year < 2000 || year > 2199) fail('日期超出支持范围');
  const probe = new Date(Date.UTC(year, month - 1, date));
  if (probe.getUTCFullYear() !== year || probe.getUTCMonth() !== month - 1 || probe.getUTCDate() !== date) {
    fail('存在不正确的日历日期');
  }
  return [year, month, date];
}

function validId(id) {
  return typeof id === 'string' && id.length > 0 && id.length <= 100
    && !BLOCKED_KEYS.has(id) && !/[\u0000-\u001f\u007f]/.test(id);
}

function lessonIds(lessons) {
  if (!Array.isArray(lessons) || lessons.length > 2000) fail('课程目录不正确');
  const ids = lessons.map((lesson) => typeof lesson === 'string' ? lesson : lesson?.id);
  if (ids.some((id) => !validId(id)) || new Set(ids).size !== ids.length) fail('课程编号不正确');
  return ids;
}

/** A Date is converted with local getters so 00:01 in China remains that date. */
export function dayKey(date = new Date()) {
  if (typeof date === 'string') {
    dateParts(date);
    return date;
  }
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) fail('日期不可用');
  const day = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  dateParts(day);
  return day;
}

/** UTC arithmetic operates on calendar components only, avoiding DST day-length drift. */
export function addDays(day, amount) {
  const [year, month, date] = dateParts(day);
  if (!Number.isInteger(amount) || Math.abs(amount) > 36_600) fail('日期间隔不正确');
  const result = new Date(Date.UTC(year, month - 1, date + amount));
  const value = `${result.getUTCFullYear()}-${String(result.getUTCMonth() + 1).padStart(2, '0')}-${String(result.getUTCDate()).padStart(2, '0')}`;
  dateParts(value);
  return value;
}

export function createState(today = dayKey()) {
  dateParts(today);
  return {
    version: 1,
    startedAt: today,
    settings: { nickname: '小芽', dailyReviews: 5 },
    cards: {},
    days: {},
    checkups: {},
    garden: createGarden(),
  };
}

function cloneState(state) {
  return {
    version: state.version,
    startedAt: state.startedAt,
    settings: { ...state.settings },
    cards: Object.fromEntries(Object.entries(state.cards).map(([id, card]) => [id, { ...card }])),
    days: Object.fromEntries(Object.entries(state.days).map(([day, entry]) => [day, {
      newId: entry.newId,
      newDone: entry.newDone,
      reviewed: [...entry.reviewed],
      results: entry.results.map((result) => ({ ...result })),
    }])),
    checkups: Object.fromEntries(Object.entries(state.checkups||{}).map(([day, results])=>[day,results.map(result=>({...result}))])),
    garden: state.garden?{version:state.garden.version,actions:state.garden.actions.map(action=>({...action}))}:createGarden(),
  };
}

function dayEntry(state, today) {
  return Object.hasOwn(state.days, today) ? state.days[today]
    : { newId: null, newDone: false, reviewed: [], results: [] };
}

function allDueIds(state, ids, today) {
  const order = new Map(ids.map((id, index) => [id, index]));
  return ids.filter((id) => {
    const card = Object.hasOwn(state.cards, id) ? state.cards[id] : null;
    return card && effectiveDue(state,id,card) <= today && card.lastReviewed < today;
  }).sort((a, b) => effectiveDue(state,a,state.cards[a]).localeCompare(effectiveDue(state,b,state.cards[b])) || order.get(a) - order.get(b));
}

// A difficult checkup adds an earlier retrieval opportunity, never a longer interval.
function effectiveDue(state,id,card){
  let due=card.due;
  for(const [date,results] of Object.entries(state.checkups||{})){
    if(date<card.lastReviewed)continue;
    if(results.some(r=>r.lessonId===id&&(!r.meaning||r.spoken!=='good'))){const retry=addDays(date,1);if(retry<due)due=retry;}
  }
  return due;
}

function introductionDates(state){
  const dates={};
  for(const [date,entry] of Object.entries(state.days))for(const result of entry.results)if(result.isNew)dates[result.lessonId]=date;
  return dates;
}

/** Brief weekly checkup: delayed recognition and parent-observed recall stay distinct. */
export function getCheckupPlan(state,lessons,today=dayKey()){
  dateParts(today);
  const dates=Object.keys(state.checkups||{}).filter(d=>d<=today).sort();
  const lastDate=dates.at(-1)||null;
  const nextDate=addDays(lastDate||state.startedAt,7);
  const introduced=introductionDates(state),order=new Map(lessonIds(lessons).map((id,i)=>[id,i]));
  const candidates=[...order.keys()].filter(id=>state.cards[id]&&introduced[id]&&introduced[id]<=addDays(today,-3)&&state.cards[id].lastReviewed<today);
  const lastSeen=id=>dates.filter(date=>state.checkups[date].some(r=>r.lessonId===id)).at(-1)||state.startedAt;
  candidates.sort((a,b)=>lastSeen(a).localeCompare(lastSeen(b))||effectiveDue(state,a,state.cards[a]).localeCompare(effectiveDue(state,b,state.cards[b]))||order.get(a)-order.get(b));
  const due=today>=nextDate&&candidates.length>0;
  return {due,ids:due?candidates.slice(0,3):[],lastDate,nextDate};
}

/** Checkups do not promote a card; only ordinary delayed recall can grow its interval. */
export function recordCheckup(state,lessons,results,today=dayKey()){
  dateParts(today);
  if(today<state.startedAt||Object.keys(state.checkups||{}).some(date=>date>today))fail('小测日期早于已有记录');
  if(Object.hasOwn(state.checkups||{},today))return cloneState(state);
  const plan=getCheckupPlan(state,lessons,today);
  if(!plan.due||!Array.isArray(results)||results.length!==plan.ids.length)fail('小测尚未到期或结果数量不正确');
  const seen=new Set();
  for(const result of results){
    exactKeys(result,['lessonId','meaning','spoken'],'小测结果');
    if(!plan.ids.includes(result.lessonId)||seen.has(result.lessonId)||typeof result.meaning!=='boolean'||!RATINGS.has(result.spoken))fail('小测结果不正确');
    seen.add(result.lessonId);
  }
  const next=cloneState(state);next.checkups[today]=results.map(r=>({...r}));return next;
}

/** dueIds contains remaining work only. Missed days never create extra new lessons. */
export function getDailyPlan(state, lessons, today = dayKey()) {
  dateParts(today);
  const ids = lessonIds(lessons);
  const entry = dayEntry(state, today);
  const due = allDueIds(state, ids, today);
  const slots = Math.max(0, state.settings.dailyReviews - entry.reviewed.length);
  return {
    newLessonId: entry.newId ?? ids.find((id) => !Object.hasOwn(state.cards, id)) ?? null,
    dueIds: due.slice(0, slots),
    extraDueCount: Math.max(0, due.length - slots),
    newDone: entry.newDone,
    reviewDone: entry.reviewed.length,
    totalDone: entry.results.length,
  };
}

function nextCard(previous, rating, today) {
  const stage = !previous || rating === 'again' ? 0
    : rating === 'help' ? Math.max(0, previous.stage - 1)
      : Math.min(REVIEW_INTERVALS.length - 1, previous.stage + 1);
  const delay = !previous || rating !== 'good' ? 1 : REVIEW_INTERVALS[stage];
  return {
    stage,
    due: addDays(today, delay),
    lastReviewed: today,
    attempts: (previous?.attempts ?? 0) + 1,
    // A first exposure cannot demonstrate forgetting; lapses count review results only.
    lapses: (previous?.lapses ?? 0) + Number(Boolean(previous) && rating === 'again'),
  };
}

/** First final rating per lesson/day wins. Repeated clicks cannot grow the interval. */
export function recordResult(state, lessonId, rating, today = dayKey(), { isNew = false } = {}) {
  dateParts(today);
  if (today < state.startedAt) fail('练习日期早于首次使用日期，请检查设备日期');
  if (!validId(lessonId) || !RATINGS.has(rating) || typeof isNew !== 'boolean') fail('练习结果不正确');
  const result = cloneState(state);
  const entry = dayEntry(result, today);
  if (entry.results.some((item) => item.lessonId === lessonId)) return result;
  const previous = Object.hasOwn(result.cards, lessonId) ? result.cards[lessonId] : null;
  if (previous && previous.lastReviewed >= today) fail('设备日期早于已有练习，请检查设备日期');
  if (isNew) {
    if (previous) fail('这句已经学过，请从复习进入');
    if (entry.newDone || (entry.newId !== null && entry.newId !== lessonId)) fail('今天的新句已完成');
    entry.newId = lessonId;
    entry.newDone = true;
  } else {
    if (!previous) fail('请先完成这句的新句练习');
    if (effectiveDue(result,lessonId,previous) > today) fail('这句尚未到复习日期');
    if (entry.reviewed.length >= result.settings.dailyReviews) fail('今天的复习已完成');
    entry.reviewed.push(lessonId);
  }
  result.cards[lessonId] = nextCard(previous, rating, today);
  entry.results.push({ lessonId, rating, isNew });
  result.days[today] = entry;
  return result;
}

export function getStats(state, lessons, today = dayKey()) {
  dateParts(today);
  const ids = lessonIds(lessons);
  const learned = ids.filter((id) => Object.hasOwn(state.cards, id));
  const plan = getDailyPlan(state, lessons, today);
  const practiced = Object.entries(state.days).filter(([date, entry]) => date <= today && entry.results.length > 0);
  const checkups = Object.entries(state.checkups || {}).filter(([date, results]) => date <= today && results.length > 0);
  const practicedDates = new Set([...practiced.map(([date]) => date), ...checkups.map(([date]) => date)]);
  const dueCount = allDueIds(state, ids, today).length;
  const tomorrow = addDays(today, 1);
  return {
    learnedCount: learned.length,
    totalLearned: learned.length,
    familiarCount: learned.filter((id) => state.cards[id].stage >= 3).length,
    practicedDays: practicedDates.size,
    // Ordinary practice keeps its existing meaning; checkup observations are counted separately.
    totalPracticeCount: practiced.reduce((sum, [, entry]) => sum + entry.results.length, 0),
    checkupCount: checkups.reduce((sum, [, results]) => sum + results.length, 0),
    dueCount,
    reviewDueCount: dueCount,
    nextDueCount: learned.filter((id) => effectiveDue(state,id,state.cards[id]) === tomorrow).length,
    todayNewDone: plan.newDone,
    todayReviewDone: plan.reviewDone,
    todayTotalDone: plan.totalDone,
    last7Days: Array.from({ length: 7 }, (_, index) => {
      const date = addDays(today, index - 6);
      const totalDone = dayEntry(state, date).results.length + (state.checkups?.[date]?.length || 0);
      return { date, practiced: totalDone > 0, totalDone };
    }),
  };
}

function exactKeys(object, required, label) {
  if (!isRecord(object)) fail(`${label}应是对象`);
  const keys = Object.keys(object);
  if (keys.length !== required.length || keys.some((key) => !required.includes(key))) fail(`${label}字段不正确`);
  for (const key of required) if (!Object.hasOwn(object, key)) fail(`${label}缺少字段`);
}

function integer(value, min, max, label) {
  if (!Number.isSafeInteger(value) || value < min || value > max) fail(`${label}不正确`);
}

/** A checkup must fit at a real boundary between that day's recorded practice events. */
function validateCheckupHistory(state, lessons) {
  if (!Object.keys(state.checkups).length) return;
  const replay = createState(state.startedAt);
  const dates = [...new Set([...Object.keys(state.days), ...Object.keys(state.checkups)])].sort();
  for (const date of dates) {
    const checkup = state.checkups[date];
    let accepted = !checkup;
    function acceptIfPossible() {
      if (accepted) return;
      const plan = getCheckupPlan(replay, lessons, date);
      if (plan.due && plan.ids.length === checkup.length && checkup.every(result => plan.ids.includes(result.lessonId))) {
        replay.checkups[date] = checkup;
        accepted = true;
      }
    }
    // A legitimate checkup can precede all reviews, follow them, or sit between two.
    acceptIfPossible();
    for (const result of state.days[date]?.results || []) {
      const entry = dayEntry(replay, date);
      if (result.isNew) { entry.newId = result.lessonId; entry.newDone = true; }
      else entry.reviewed.push(result.lessonId);
      entry.results.push(result);
      replay.days[date] = entry;
      replay.cards[result.lessonId] = nextCard(replay.cards[result.lessonId], result.rating, date);
      acceptIfPossible();
    }
    if (!accepted) fail('小测结果与当天可完整完成的题目不一致');
  }
}

/** Import is a strict, bounded JSON backup, never an executable object or audio payload. */
export function validateImport(input, lessons) {
  if (typeof input === 'string') {
    if (input.length > MAX_IMPORT_BYTES) fail('备份超过 5 MB');
    try { input = JSON.parse(input); } catch { fail('不是有效的 JSON 文件'); }
  }
  exactKeys(input, ['version', 'startedAt', 'settings', 'cards', 'days',...['checkups','garden'].filter(key=>Object.hasOwn(input||{},key))], '备份');
  if (input.version !== 1) fail('备份版本不受支持');
  dateParts(input.startedAt);
  exactKeys(input.settings, ['nickname', 'dailyReviews'], '设置');
  const nickname = input.settings.nickname;
  if (typeof nickname !== 'string' || !nickname.trim() || [...nickname].length > 16 || /[\u0000-\u001f\u007f]/.test(nickname)) fail('昵称应为 1–16 个字符');
  integer(input.settings.dailyReviews, 1, 10, '每日复习数量');
  const known = new Set(lessonIds(lessons));
  if (!isRecord(input.cards) || !isRecord(input.days)) fail('课程或日期记录格式不正确');
  if (Object.keys(input.cards).length > known.size || Object.keys(input.days).length > MAX_HISTORY_DAYS) fail('记录数量过多');
  const clean = createState(input.startedAt);
  clean.settings = { nickname: nickname.trim(), dailyReviews: input.settings.dailyReviews };
  for (const [id, card] of Object.entries(input.cards)) {
    if (!known.has(id) || !validId(id)) fail('备份含有不认识的课程');
    exactKeys(card, ['stage', 'due', 'lastReviewed', 'attempts', 'lapses'], '课程记录');
    integer(card.stage, 0, REVIEW_INTERVALS.length - 1, '复习阶段');
    integer(card.attempts, 1, MAX_HISTORY_DAYS, '练习次数');
    integer(card.lapses, 0, card.attempts - 1, '再练次数');
    dateParts(card.due);
    dateParts(card.lastReviewed);
    if (card.lastReviewed < clean.startedAt || card.due <= card.lastReviewed) fail('课程日期次序不正确');
    clean.cards[id] = { ...card };
  }
  const replay = {};
  if(Object.hasOwn(input,'checkups')){
    if(!isRecord(input.checkups)||Object.keys(input.checkups).length>MAX_HISTORY_DAYS)fail('小测记录不正确');
    let previousDate=null;
    for(const date of Object.keys(input.checkups).sort()){
      dateParts(date);
      if(date<addDays(previousDate||clean.startedAt,7))fail('小测间隔不足七天');
      const results=input.checkups[date];
      if(!Array.isArray(results)||results.length<1||results.length>3)fail('小测结果数量不正确');
      const seen=new Set();
      clean.checkups[date]=results.map(result=>{
        exactKeys(result,['lessonId','meaning','spoken'],'小测结果');
        if(!known.has(result.lessonId)||!Object.hasOwn(clean.cards,result.lessonId)||seen.has(result.lessonId)||typeof result.meaning!=='boolean'||!RATINGS.has(result.spoken))fail('小测结果不正确');
        seen.add(result.lessonId);return {...result};
      });
      previousDate=date;
    }
  }
  const introduced = new Set();
  for (const date of Object.keys(input.days).sort()) {
    dateParts(date);
    if (date < clean.startedAt) fail('练习日期早于首次使用日期');
    const entry = input.days[date];
    exactKeys(entry, ['newId', 'newDone', 'reviewed', 'results'], '每日记录');
    if (entry.newId !== null && !known.has(entry.newId)) fail('新句编号不正确');
    if (typeof entry.newDone !== 'boolean' || (entry.newDone && entry.newId === null)) fail('新句完成状态不正确');
    if (!Array.isArray(entry.reviewed) || entry.reviewed.length > 10 || entry.reviewed.some((id) => !known.has(id)) || new Set(entry.reviewed).size !== entry.reviewed.length) fail('复习列表不正确');
    if (!Array.isArray(entry.results) || entry.results.length > 11) fail('每日结果过多');
    const seen = new Set();
    const reviews = [];
    let newCount = 0;
    const results = entry.results.map((item) => {
      exactKeys(item, ['lessonId', 'rating', 'isNew'], '练习结果');
      if (!known.has(item.lessonId) || !Object.hasOwn(clean.cards, item.lessonId) || !RATINGS.has(item.rating) || typeof item.isNew !== 'boolean' || seen.has(item.lessonId)) fail('练习结果内容不正确');
      seen.add(item.lessonId);
      if (item.isNew) {
        newCount += 1;
        if (introduced.has(item.lessonId) || item.lessonId !== entry.newId || !entry.newDone) fail('新句历史不一致');
        introduced.add(item.lessonId);
      } else {
        if (!introduced.has(item.lessonId) || effectiveDue(clean,item.lessonId,replay[item.lessonId]) > date) fail('复习早于学习或预约日期');
        reviews.push(item.lessonId);
      }
      replay[item.lessonId] = nextCard(Object.hasOwn(replay, item.lessonId) ? replay[item.lessonId] : null, item.rating, date);
      return { lessonId: item.lessonId, rating: item.rating, isNew: item.isNew };
    });
    if (newCount !== Number(entry.newDone) || reviews.length !== entry.reviewed.length || reviews.some((id, index) => id !== entry.reviewed[index])) fail('每日结果与完成数量不一致');
    clean.days[date] = { newId: entry.newId, newDone: entry.newDone, reviewed: [...entry.reviewed], results };
  }
  for (const [id, card] of Object.entries(clean.cards)) {
    if (!Object.hasOwn(replay, id) || Object.keys(card).some((key) => card[key] !== replay[id][key])) fail('课程进度与练习历史不一致');
  }
  const introductions=introductionDates(clean);
  for(const [date,results] of Object.entries(clean.checkups))for(const result of results){
    if(!introductions[result.lessonId]||introductions[result.lessonId]>addDays(date,-3))fail('小测应检查至少三天前学过的句子');
  }
  validateCheckupHistory(clean, lessons);
  clean.garden=validateGarden(input.garden,clean);
  for(const action of clean.garden.actions){dateParts(action.date);if(action.date<clean.startedAt)fail('种植日期早于首次使用日期');}
  return clean;
}
