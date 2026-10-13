/** Replayable learning rewards and practice rounds; no recording or transcript is stored. */
import {hasOwn,last,cloneData} from './compat.js';
export const PLANTS = Object.freeze([
  Object.freeze({ id: 'sunflower', name: '向日葵', color: '#efb72e', emoji: '🌻' }),
  Object.freeze({ id: 'tulip', name: '郁金香', color: '#ec739b', emoji: '🌷' }),
  Object.freeze({ id: 'strawberry', name: '草莓', color: '#ec6259', emoji: '🍓' }),
  Object.freeze({ id: 'bluebell', name: '蓝铃花', color: '#8284d4', emoji: '🪻' }),
]);

const KINDS = new Set(PLANTS.map(plant => plant.id));
const TYPES = new Set(['plant', 'water', 'fertilize', 'harvest', 'practice', 'world-plant', 'world-water']);
const ASSESSMENTS = new Set(['local-speech', 'practice-effort']);
const RATINGS = new Set(['again', 'help', 'good']);
const MILESTONES = [5, 10, 20, 40, 80, 120];
export const MAX_GARDEN_ACTIONS = 30_000;
export const GROWTH_GOAL = 12;
export const WORLD_GROWTH_GOAL = 5;
export const WORLD_CAPACITY = 1600;
export const WORLD_MIN_DISTANCE = 120;

/** Stable variation/reward selection: reloading never rerolls an earned round. */
export function gardenHash(value) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index++) hash = Math.imul(hash ^ value.charCodeAt(index), 16777619) >>> 0;
  return hash;
}
export function practiceReward(attemptId) { return { water: 2, seeds: Number(gardenHash(attemptId) % 3 === 0) }; }
function identifier(value, label) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_-]{7,99}$/.test(value)) fail(`${label}编号不正确`);
  return value;
}

function fail(message) { throw new Error(`花园记录无效：${message}`); }
function object(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    && [Object.prototype, null].includes(Object.getPrototypeOf(value));
}
function exact(value, fields, label) {
  if (!object(value)) fail(`${label}应是对象`);
  const keys = Reflect.ownKeys(value);
  if (keys.length !== fields.length || keys.some(key => !fields.includes(key))) fail(`${label}字段不正确`);
}

// Only verifies the supplied calendar label; scheduling and date arithmetic stay in learning.js.
function calendar(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) fail('日期格式应为 YYYY-MM-DD');
  const [year, month, day] = value.split('-').map(Number);
  const probe = new Date(Date.UTC(year, month - 1, day));
  if (year < 2000 || year > 2199 || probe.getUTCFullYear() !== year
    || probe.getUTCMonth() !== month - 1 || probe.getUTCDate() !== day) fail('日历日期不正确');
  return value;
}

export function createGarden() { return { version: 3, legacyCount: 0, classicCount: 0, actions: [] }; }

function cleanAction(action, withDate, legacy = false) {
  if (!object(action) || !TYPES.has(action.type)) fail('操作类型不正确');
  if (action.type === 'world-plant' || action.type === 'world-water') {
    if (legacy) fail('旧版记录不支持花园广场');
    const planting = action.type === 'world-plant';
    exact(action, [...(withDate ? ['date'] : []), 'type', 'id', ...(planting ? ['kind', 'x', 'y'] : ['actionId'])], '花园广场操作');
    identifier(action.id, '植物');
    if (planting) {
      if (!KINDS.has(action.kind)) fail('植物种类不正确');
      if (![action.x, action.y].every(value => Number.isInteger(value) && value >= 0 && value <= 9999)) fail('种植位置不正确');
    } else identifier(action.actionId, '浇水操作');
    return {...(withDate ? {date: calendar(action.date)} : {}), type: action.type, id: action.id,
      ...(planting ? {kind: action.kind, x: action.x, y: action.y} : {actionId: action.actionId})};
  }
  if (action.type === 'practice') {
    if (legacy) fail('旧版记录不支持跟读奖励');
    exact(action, [...(withDate ? ['date'] : []), 'type', 'lessonId', 'attemptId', 'assessment'], '跟读');
    if (typeof action.lessonId !== 'string' || !action.lessonId || action.lessonId.length > 100
      || ['__proto__', 'constructor', 'prototype'].includes(action.lessonId)
      || /[\u0000-\u001f\u007f]/.test(action.lessonId)) fail('跟读课程编号不正确');
    if (typeof action.attemptId !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_-]{7,99}$/.test(action.attemptId)) fail('跟读轮次编号不正确');
    if (!ASSESSMENTS.has(action.assessment)) fail('跟读评价方式不正确');
    return { ...(withDate ? { date: calendar(action.date) } : {}), type: 'practice',
      lessonId: action.lessonId, attemptId: action.attemptId, assessment: action.assessment };
  }
  exact(action, [...(withDate ? ['date'] : []), 'type', 'plot', ...(action.type === 'plant' ? ['kind'] : [])], '操作');
  if (!Number.isInteger(action.plot) || action.plot < 0 || action.plot > 2) fail('花盆位置不正确');
  if (action.type === 'plant' && !KINDS.has(action.kind)) fail('植物种类不正确');
  return { ...(withDate ? { date: calendar(action.date) } : {}), type: action.type, plot: action.plot,
    ...(action.type === 'plant' ? { kind: action.kind } : {}) };
}

function cleanGarden(garden) {
  if (garden === undefined) return createGarden();
  if (!object(garden)) fail('花园应是对象');
  if (![1, 2, 3].includes(garden.version)) fail('版本不受支持');
  exact(garden, ['version', ...(garden.version >= 2 ? ['legacyCount'] : []), ...(garden.version === 3 ? ['classicCount'] : []), 'actions'], '花园');
  if (!Array.isArray(garden.actions) || garden.actions.length > MAX_GARDEN_ACTIONS) fail('操作数量过多或格式不正确');
  const legacyCount = garden.version === 1 ? garden.actions.length : garden.legacyCount;
  if (!Number.isInteger(legacyCount) || legacyCount < 0 || legacyCount > garden.actions.length) fail('旧版操作范围不正确');
  const classicCount = garden.version === 3 ? garden.classicCount : garden.actions.length;
  if (!Number.isInteger(classicCount) || classicCount < legacyCount || classicCount > garden.actions.length) fail('历史操作范围不正确');
  // Array positions preserve the actual sequence of operations within the same date.
  // Sort the two eras separately so imported ordering never changes a plant's growth goal.
  const legacyActions = garden.actions.slice(0, legacyCount).map(action => cleanAction(action, true, true));
  const classicActions = garden.actions.slice(legacyCount, classicCount).map(action => {
    const clean = cleanAction(action, true);
    if (clean.type.startsWith('world-')) fail('历史记录不支持花园广场');
    return clean;
  });
  const currentActions = garden.actions.slice(classicCount).map(action => cleanAction(action, true));
  legacyActions.sort((a, b) => a.date.localeCompare(b.date));
  classicActions.sort((a, b) => a.date.localeCompare(b.date));
  currentActions.sort((a, b) => a.date.localeCompare(b.date));
  const history = [...legacyActions, ...classicActions];
  if (legacyActions.length && classicActions.length && last(legacyActions).date > classicActions[0].date) fail('新版操作日期早于旧版记录');
  if (history.length && currentActions.length && last(history).date > currentActions[0].date) fail('新版操作日期早于旧版记录');
  const actions = [...history, ...currentActions];
  return { version: garden.version, ...(garden.version >= 2 ? { legacyCount } : {}), ...(garden.version === 3 ? { classicCount } : {}), actions };
}

function validResult(result) {
  return object(result) && typeof result.lessonId === 'string' && result.lessonId.length > 0
    && RATINGS.has(result.rating) && typeof result.isNew === 'boolean';
}

function rewardTimeline(state) {
  if (!object(state) || !object(state.days) || !object(state.checkups ?? {})) fail('学习历史不可用');
  const start = calendar(state.startedAt);
  const dates = [...new Set([...Object.keys(state.days), ...Object.keys(state.checkups ?? {})])].sort();
  const introduced = new Set();
  const reached = new Set();
  return dates.map(date => {
    calendar(date);
    if (date < start) fail('学习日期早于首次使用日期');
    const entry = state.days[date];
    if (entry && (!object(entry) || !Array.isArray(entry.results) || !Array.isArray(entry.reviewed)
      || entry.results.some(result => !validResult(result)))) fail('每日练习历史不正确');
    const results = entry?.results ?? [];
    const checkup = state.checkups?.[date];
    if (checkup !== undefined && (!Array.isArray(checkup) || checkup.length < 1 || checkup.length > 3
      || checkup.some(result => !object(result) || typeof result.lessonId !== 'string' || !result.lessonId
        || typeof result.meaning !== 'boolean' || !RATINGS.has(result.spoken))
      || new Set(checkup.map(result => result.lessonId)).size !== checkup.length)) fail('小测历史不正确');
    let fresh = 0;
    for (const result of results) {
      if (!result.isNew || introduced.has(result.lessonId)) continue;
      introduced.add(result.lessonId);
      fresh += 1;
    }
    const practiced = results.length > 0 || Boolean(checkup);
    const reviewed = results.some(result => !result.isNew && entry.reviewed.includes(result.lessonId));
    const milestones = MILESTONES.filter(count => introduced.size >= count && !reached.has(count));
    milestones.forEach(count => reached.add(count));
    return { date, seeds: fresh + Number(Boolean(checkup)) + 2 * milestones.length,
      water: 2 * Number(practiced) + Number(reviewed), fertilizer: Number(Boolean(checkup)) + milestones.length,
      newLessons: fresh, practiceDays: Number(practiced), reviewDays: Number(reviewed),
      checkups: Number(Boolean(checkup)), milestones: milestones.map(count => ({ count, date })) };
  });
}

function practicedLessons(state) {
  const introduced = new Map();
  for (const [date, entry] of Object.entries(state.days)) {
    for (const result of entry.results) {
      if (result.isNew && (!introduced.has(result.lessonId) || introduced.get(result.lessonId) > date)) introduced.set(result.lessonId, date);
    }
  }
  return introduced;
}

function replay(garden, rewards, state, today = '9999-12-31') {
  const { actions } = garden;
  const legacyCount = garden.version === 1 ? actions.length : garden.legacyCount;
  const classicCount = garden.version === 3 ? garden.classicCount : actions.length;
  const introduced = practicedLessons(state);
  const seenAttempts = new Set();
  const seenWorldActions = new Set();
  const world = new Map();
  const inventory = { seeds: 0, water: 0, fertilizer: 0 };
  const earned = { ...inventory, newLessons: 0, practiceDays: 0, reviewDays: 0, checkups: 0,
    practiceRounds: 0, practicePasses: 0, milestones: [] };
  const plots = [null, null, null];
  const care = Array.from({ length: 3 }, () => ({ water: null, fertilizer: null }));
  const counts = Object.fromEntries(PLANTS.map(plant => [plant.id, 0]));
  let cursor = 0;
  function grantThrough(date) {
    while (cursor < rewards.length && rewards[cursor].date <= date) {
      const reward = rewards[cursor++];
      for (const key of ['seeds', 'water', 'fertilizer']) inventory[key] += reward[key];
      for (const key of ['seeds', 'water', 'fertilizer', 'newLessons', 'practiceDays', 'reviewDays', 'checkups']) earned[key] += reward[key];
      earned.milestones.push(...reward.milestones.map(item => ({ ...item })));
    }
  }
  function spend(resource) {
    if (inventory[resource] < 1) fail('当天资源不足，不能预支以后练习的奖励');
    inventory[resource] -= 1;
  }
  for (let index = 0; index < actions.length; index++) {
    const action = actions[index], legacy = index < legacyCount;
    if (action.date < state.startedAt) fail('操作日期早于首次使用日期');
    if (action.date > today) break;
    grantThrough(action.date);
    if (action.type === 'practice') {
      if (!object(state.cards) || !hasOwn(state.cards, action.lessonId) || !introduced.has(action.lessonId)
        || introduced.get(action.lessonId) > action.date) fail('只能跟读已经学过的课程');
      if (seenAttempts.has(action.attemptId)) fail('跟读轮次重复，不能重复领取奖励');
      seenAttempts.add(action.attemptId);
      earned.practiceRounds += 1;
      earned.practicePasses += Number(action.assessment === 'local-speech');
      inventory.water += 2;
      earned.water += 2;
      const seed = index < classicCount ? Number(earned.practiceRounds % 3 === 0) : practiceReward(action.attemptId).seeds;
      inventory.seeds += seed;
      earned.seeds += seed;
      continue;
    }
    if (action.type === 'world-plant') {
      if (world.has(action.id) || /^legacy-plot-[0-2]$/.test(action.id)) fail('植物编号重复');
      if (world.size >= WORLD_CAPACITY) fail('花园广场已种满，可以继续照顾现有植物');
      const occupied = [...world.values(), ...plots.map((plot, index) => plot && {x: 4000 + index * 1000, y: 4500}).filter(Boolean)];
      if (occupied.some(plant => (plant.x - action.x) ** 2 + (plant.y - action.y) ** 2 < WORLD_MIN_DISTANCE ** 2)) fail('这里已有小苗，请在旁边播种');
      spend('seeds');
      world.set(action.id, {id: action.id, kind: action.kind, x: action.x, y: action.y,
        growth: 0, growthGoal: WORLD_GROWTH_GOAL, variant: gardenHash(action.id) % 6,
        plantedAt: action.date, lastWaterDate: null});
      continue;
    }
    if (action.type === 'world-water') {
      if (seenWorldActions.has(action.actionId)) fail('浇水操作重复，不能重复使用水壶');
      seenWorldActions.add(action.actionId);
      const legacyPlot = /^legacy-plot-([0-2])$/.exec(action.id);
      const target = legacyPlot ? plots[Number(legacyPlot[1])] : world.get(action.id);
      if (!target) fail('请先播种');
      if (target.growth >= target.growthGoal) fail('植物已经成熟');
      spend('water');
      target.growth += 1;
      if (legacyPlot) care[Number(legacyPlot[1])].water = action.date;
      else target.lastWaterDate = action.date;
      continue;
    }
    const plot = plots[action.plot];
    if (action.type === 'plant') {
      if (plot) fail('请先收获成熟植物，再重新播种');
      spend('seeds');
      plots[action.plot] = { kind: action.kind, growth: 0, growthGoal: legacy ? 3 : GROWTH_GOAL, plantedAt: action.date };
    } else if (action.type === 'harvest') {
      if (!plot || plot.growth !== plot.growthGoal) fail('植物还没有成熟');
      counts[plot.kind] += 1;
      plots[action.plot] = null;
    } else {
      if (!plot) fail('请先播种');
      if (plot.growth >= plot.growthGoal) fail('植物已经成熟，可以收获啦');
      const resource = action.type === 'water' ? 'water' : 'fertilizer';
      if (legacy && care[action.plot][resource] === action.date) fail(action.type === 'water' ? '这块地今天已经浇过水了' : '这块地今天已经施过肥了');
      spend(resource);
      plot.growth += 1;
      care[action.plot][resource] = action.date;
    }
  }
  grantThrough(today);
  const worldPlants = [...world.values()].map(plant => ({...plant, canWater: plant.growth < plant.growthGoal && inventory.water > 0}));
  // Mature world flowers remain visible; their collection entry needs no extra harvest step.
  for (const plant of world.values()) if (plant.growth === plant.growthGoal) counts[plant.kind] += 1;
  for (let index = 0; index < plots.length; index++) {
    const plot = plots[index];
    if (!plot) continue;
    worldPlants.push({...plot, id: `legacy-plot-${index}`, x: 4000 + index * 1000, y: 4500,
      variant: index, sourcePlot: index, lastWaterDate: care[index].water,
      canWater: plot.growth < plot.growthGoal && inventory.water > 0});
  }
  return { inventory, earned, worldPlants, worldCapacity: WORLD_CAPACITY, plots: plots.map((plot, index) => plot && {
    ...plot, lastWaterDate: care[index].water, lastFertilizeDate: care[index].fertilizer,
    lastCareDate: last([care[index].water, care[index].fertilizer].filter(Boolean).sort()) ?? null,
    canWater: plot.growth < plot.growthGoal && inventory.water > 0,
    canFertilize: plot.growth < plot.growthGoal && inventory.fertilizer > 0,
    canHarvest: plot.growth === plot.growthGoal,
  }), collection: PLANTS.map(plant => ({ kind: plant.id, count: counts[plant.id] })) };
}

/** Strict import boundary: reject fabricated balances and illegal historical spending. */
export function validateGarden(garden, state) {
  const clean = cleanGarden(garden);
  calendar(state.startedAt);
  replay(clean, rewardTimeline(state), state);
  return clean;
}

export function getGarden(state, today) {
  calendar(today);
  if (today < calendar(state.startedAt)) fail('当前日期早于首次使用日期');
  const garden = cleanGarden(state.garden), rewards = rewardTimeline(state);
  // Validate the whole ledger even when requesting an earlier calendar snapshot.
  replay(garden, rewards, state);
  const result = replay(garden, rewards, state, today);
  const target = MILESTONES.find(count => count > result.earned.newLessons);
  return { ...result, nextMilestone: target === undefined ? null : {
    count: target, remaining: target - result.earned.newLessons, seeds: 2, fertilizer: 1,
  } };
}

/** Returns an independent complete learning state; never mutates the caller. */
export function recordGardenAction(state, action, today) {
  calendar(today);
  const clean = validateGarden(state.garden, state);
  if (today < state.startedAt || today < (last(clean.actions)?.date ?? state.startedAt)) fail('操作日期早于已有记录，请检查设备日期');
  const nextAction = cleanAction(action, false);
  if (nextAction.type === 'practice') {
    const previous = clean.actions.find(item => item.type === 'practice' && item.attemptId === nextAction.attemptId);
    if (previous) {
      if (previous.lessonId !== nextAction.lessonId || previous.assessment !== nextAction.assessment) fail('跟读轮次已有不同结果');
      return cloneData(state);
    }
  }
  if (nextAction.type === 'world-plant' || nextAction.type === 'world-water') {
    const previous = clean.actions.find(item => item.type === nextAction.type && (nextAction.type === 'world-plant'
      ? item.id === nextAction.id : item.actionId === nextAction.actionId));
    if (previous) {
      const expected = {date: previous.date, ...nextAction};
      if (JSON.stringify(previous) !== JSON.stringify(expected)) fail('花园操作已有不同结果');
      return cloneData(state);
    }
  }
  if (clean.actions.length >= MAX_GARDEN_ACTIONS) fail('操作数量已达到上限');
  if (clean.version !== 3) {
    clean.legacyCount = clean.version === 1 ? clean.actions.length : clean.legacyCount;
    clean.classicCount = clean.actions.length;
    clean.version = 3;
  }
  clean.actions.push({ date: today, ...nextAction });
  const garden = validateGarden(clean, state);
  const next = cloneData(state);
  next.garden = garden;
  return next;
}

/** A completed repeat round rewards effort independently of spaced review or oral mastery. */
export function recordGardenPractice(state, attempt, today) {
  exact(attempt, ['lessonId', 'attemptId', 'assessment'], '跟读');
  return recordGardenAction(state, { type: 'practice', ...attempt }, today);
}
