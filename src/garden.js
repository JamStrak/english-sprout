/** A replayable garden ledger. Learning history is the only source of rewards. */
export const PLANTS = Object.freeze([
  Object.freeze({ id: 'sunflower', name: '向日葵', color: '#efb72e', emoji: '🌻' }),
  Object.freeze({ id: 'tulip', name: '郁金香', color: '#ec739b', emoji: '🌷' }),
  Object.freeze({ id: 'strawberry', name: '草莓', color: '#ec6259', emoji: '🍓' }),
  Object.freeze({ id: 'bluebell', name: '蓝铃花', color: '#8284d4', emoji: '🪻' }),
]);

const KINDS = new Set(PLANTS.map(plant => plant.id));
const TYPES = new Set(['plant', 'water', 'fertilize', 'harvest']);
const RATINGS = new Set(['again', 'help', 'good']);
const MILESTONES = [5, 10, 20, 40, 80, 120];
export const MAX_GARDEN_ACTIONS = 30_000;

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

export function createGarden() { return { version: 1, actions: [] }; }

function cleanAction(action, withDate) {
  if (!object(action) || !TYPES.has(action.type)) fail('操作类型不正确');
  exact(action, [...(withDate ? ['date'] : []), 'type', 'plot', ...(action.type === 'plant' ? ['kind'] : [])], '操作');
  if (!Number.isInteger(action.plot) || action.plot < 0 || action.plot > 2) fail('花盆位置不正确');
  if (action.type === 'plant' && !KINDS.has(action.kind)) fail('植物种类不正确');
  return { ...(withDate ? { date: calendar(action.date) } : {}), type: action.type, plot: action.plot,
    ...(action.type === 'plant' ? { kind: action.kind } : {}) };
}

function cleanGarden(garden) {
  if (garden === undefined) return createGarden();
  exact(garden, ['version', 'actions'], '花园');
  if (garden.version !== 1) fail('版本不受支持');
  if (!Array.isArray(garden.actions) || garden.actions.length > MAX_GARDEN_ACTIONS) fail('操作数量过多或格式不正确');
  // Array positions preserve the actual sequence of operations within the same date.
  const actions = garden.actions.map(action => cleanAction(action, true));
  actions.sort((a, b) => a.date.localeCompare(b.date));
  return { version: 1, actions };
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
    const fresh = Boolean(entry?.newDone && typeof entry.newId === 'string' && !introduced.has(entry.newId)
      && results.some(result => result.isNew && result.lessonId === entry.newId));
    if (fresh) introduced.add(entry.newId);
    const practiced = results.length > 0 || Boolean(checkup);
    const reviewed = results.some(result => !result.isNew && entry.reviewed.includes(result.lessonId));
    const milestones = MILESTONES.filter(count => introduced.size >= count && !reached.has(count));
    milestones.forEach(count => reached.add(count));
    return { date, seeds: Number(fresh) + Number(Boolean(checkup)) + 2 * milestones.length,
      water: 2 * Number(practiced) + Number(reviewed), fertilizer: Number(Boolean(checkup)) + milestones.length,
      newLessons: Number(fresh), practiceDays: Number(practiced), reviewDays: Number(reviewed),
      checkups: Number(Boolean(checkup)), milestones: milestones.map(count => ({ count, date })) };
  });
}

function replay(actions, rewards, start, today = '9999-12-31') {
  const inventory = { seeds: 0, water: 0, fertilizer: 0 };
  const earned = { ...inventory, newLessons: 0, practiceDays: 0, reviewDays: 0, checkups: 0, milestones: [] };
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
  for (const action of actions) {
    if (action.date < start) fail('操作日期早于首次使用日期');
    if (action.date > today) break;
    grantThrough(action.date);
    const plot = plots[action.plot];
    if (action.type === 'plant') {
      if (plot) fail('请先收获成熟植物，再重新播种');
      spend('seeds');
      plots[action.plot] = { kind: action.kind, growth: 0, plantedAt: action.date };
    } else if (action.type === 'harvest') {
      if (!plot || plot.growth !== 3) fail('植物还没有成熟');
      counts[plot.kind] += 1;
      plots[action.plot] = null;
    } else {
      if (!plot) fail('请先播种');
      if (plot.growth >= 3) fail('植物已经成熟，可以收获啦');
      const resource = action.type === 'water' ? 'water' : 'fertilizer';
      if (care[action.plot][resource] === action.date) fail(action.type === 'water' ? '这块地今天已经浇过水了' : '这块地今天已经施过肥了');
      spend(resource);
      plot.growth += 1;
      care[action.plot][resource] = action.date;
    }
  }
  grantThrough(today);
  return { inventory, earned, plots: plots.map((plot, index) => plot && {
    ...plot, lastWaterDate: care[index].water, lastFertilizeDate: care[index].fertilizer,
    lastCareDate: [care[index].water, care[index].fertilizer].filter(Boolean).sort().at(-1) ?? null,
    canWater: plot.growth < 3 && inventory.water > 0 && care[index].water !== today,
    canFertilize: plot.growth < 3 && inventory.fertilizer > 0 && care[index].fertilizer !== today,
    canHarvest: plot.growth === 3,
  }), collection: PLANTS.map(plant => ({ kind: plant.id, count: counts[plant.id] })) };
}

/** Strict import boundary: reject fabricated balances and illegal historical spending. */
export function validateGarden(garden, state) {
  const clean = cleanGarden(garden);
  replay(clean.actions, rewardTimeline(state), calendar(state.startedAt));
  return clean;
}

export function getGarden(state, today) {
  calendar(today);
  if (today < calendar(state.startedAt)) fail('当前日期早于首次使用日期');
  const garden = cleanGarden(state.garden), rewards = rewardTimeline(state);
  // Validate the whole ledger even when requesting an earlier calendar snapshot.
  replay(garden.actions, rewards, state.startedAt);
  const result = replay(garden.actions, rewards, state.startedAt, today);
  const target = MILESTONES.find(count => count > result.earned.newLessons);
  return { ...result, nextMilestone: target === undefined ? null : {
    count: target, remaining: target - result.earned.newLessons, seeds: 2, fertilizer: 1,
  } };
}

/** Returns an independent complete learning state; never mutates the caller. */
export function recordGardenAction(state, action, today) {
  calendar(today);
  const clean = validateGarden(state.garden, state);
  if (today < state.startedAt || today < (clean.actions.at(-1)?.date ?? state.startedAt)) fail('操作日期早于已有记录，请检查设备日期');
  if (clean.actions.length >= MAX_GARDEN_ACTIONS) fail('操作数量已达到上限');
  clean.actions.push({ date: today, ...cleanAction(action, false) });
  const garden = validateGarden(clean, state);
  const next = structuredClone(state);
  next.garden = garden;
  return next;
}
