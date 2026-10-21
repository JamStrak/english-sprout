import test from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULTS, profile, config, effective, sample, waterStep} from '../xiaoya/growth-core.js';
import {GROWTH_SETTINGS_KEY, createGrowthSettingsStore} from '../xiaoya/growth-settings.js';
import {MOTION_DEFAULTS} from '../xiaoya/growth-motion.js';

const ids = ['magic-starlight-01', 'magic-starlight-02'];
function memory(initial = {}) {
  const values = new Map(Object.entries(initial));
  const writes = [];
  return {
    values, writes,
    getItem(key) { return values.get(key) ?? null; },
    setItem(key, value) { writes.push([key, value]); values.set(key, value); },
  };
}
const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-10, `${actual} != ${expected}`);

test('growth uses the approved five-stage source defaults and immutable constants', () => {
  assert.deepEqual(DEFAULTS, {totalWater: 10, scales: [.4, .55, .7, .85, 1]});
  assert.equal(Object.isFrozen(DEFAULTS), true);
  assert.equal(Object.isFrozen(DEFAULTS.scales), true);
  assert.deepEqual(profile(), DEFAULTS);
  assert.deepEqual(config(), {
    schema: 'xiaoya-growth-settings/v1', releaseId: 'v09-growth-complete',
    defaults: profile(), overrides: {}, motion: {...MOTION_DEFAULTS},
  });
});

test('growth profiles clamp finite values and ignore empty or nonnumeric fields', () => {
  assert.deepEqual(profile({totalWater: '12.6', scales: ['.3', 0, 3, .65, 1]}), {
    totalWater: 13, scales: [.3, .15, 1.5, .65, 1],
  });
  assert.equal(profile({totalWater: -5}).totalWater, 4);
  assert.equal(profile({totalWater: 200}).totalWater, 50);
  for (const value of [null, undefined, '', ' ', false, true, [], {}, NaN, Infinity, 'abc']) {
    assert.deepEqual(profile({totalWater: value, scales: [value, value, value, value, value]}), DEFAULTS);
  }
  for (const value of [null, false, 4, 'bad', [], undefined]) assert.deepEqual(profile(value), DEFAULTS);
  assert.deepEqual(profile({scales: [.2, .3]}).scales, DEFAULTS.scales);
  assert.deepEqual(profile({}, null), DEFAULTS);
  assert.deepEqual(profile({}, {totalWater: ' ', scales: [null, '', false, NaN, Infinity]}), DEFAULTS);
});

test('allowed per-flower overrides inherit missing fields and do not mutate input', () => {
  const input = {
    defaults: {totalWater: 16, scales: [.3, .45, .65, .9, 1.2]},
    overrides: {
      [ids[0]]: {totalWater: '8', scales: [null, .5, '', .95, 1.3]},
      unknown: {totalWater: 20},
    },
  };
  const snapshot = structuredClone(input);
  const settings = config(input, ids);
  assert.deepEqual(Object.keys(settings.overrides), [ids[0]]);
  assert.deepEqual(settings.overrides[ids[0]], {totalWater: 8, scales: [.3, .5, .65, .95, 1.3]});
  assert.deepEqual(effective(settings, ids[1]), settings.defaults);
  assert.deepEqual(effective(settings, ids[0]), settings.overrides[ids[0]]);
  assert.deepEqual(input, snapshot);
  settings.defaults.scales[0] = .4;
  assert.equal(input.defaults.scales[0], .3);
  const selected = effective(settings, ids[0]);
  selected.scales[0] = .6;
  assert.equal(settings.overrides[ids[0]].scales[0], .3);
});

test('configuration ignores inherited overrides, strips unknown fields, and tolerates corrupt roots', () => {
  const inherited = Object.create({[ids[0]]: {totalWater: 30}});
  inherited[ids[1]] = {totalWater: 6};
  const settings = config({schema: 'bad', releaseId: 'bad', overrides: inherited, previewWater: 8}, ids);
  assert.deepEqual(Object.keys(settings.overrides), [ids[1]]);
  assert.equal(settings.schema, 'xiaoya-growth-settings/v1');
  assert.equal(Object.hasOwn(settings, 'previewWater'), false);
  assert.deepEqual(effective({defaults: {totalWater: 12}, overrides: inherited}, ids[0]), profile({totalWater: 12}));
  assert.deepEqual(effective(null, ids[0]), DEFAULTS);
  for (const value of [null, false, [], 'text', 4]) assert.deepEqual(config(value, ids), config());
  assert.deepEqual(config({}, null), config());
});

test('every default watering visibly changes size or stage and reaches maturity exactly at ten', () => {
  let previous = sample(0);
  assert.deepEqual(previous, {progress: 0, stageIndex: 0, scale: .4, mature: false});
  const stageSequence = [0];
  for (let water = 1; water <= 10; water++) {
    const next = sample(water);
    assert.ok(next.scale > previous.scale, `drop ${water} must grow`);
    close(next.scale, .4 + water * .06);
    assert.equal(next.mature, water === 10);
    stageSequence.push(next.stageIndex);
    previous = next;
  }
  assert.deepEqual(stageSequence, [0, 0, 0, 1, 1, 2, 2, 2, 3, 3, 4]);
  assert.deepEqual(previous, {progress: 1, stageIndex: 4, scale: 1, mature: true});
});

test('growth interpolates custom anchors including fractional stage boundaries', () => {
  const settings = {totalWater: 8, scales: [.2, .4, .7, .8, 1.4]};
  for (let stage = 0; stage < 5; stage++) {
    const point = sample(stage * 2, settings);
    assert.equal(point.stageIndex, stage);
    close(point.scale, settings.scales[stage]);
  }
  close(sample(1, settings).scale, .3);
  close(sample(3, settings).scale, .55);
  close(sample(7, settings).scale, 1.1);
  assert.equal(sample(2.5).stageIndex, 1);
  close(sample(2.5).scale, .55);
});

test('sample and water-step clamp out-of-range progress without invalid numbers or state writes', () => {
  assert.deepEqual(sample(-20), sample(0));
  assert.deepEqual(sample(200), sample(10));
  for (const value of [null, undefined, '', ' ', false, [], {}, NaN, Infinity]) {
    assert.deepEqual(sample(value), sample(0));
    assert.equal(waterStep(value), 1);
  }
  assert.deepEqual(sample('3'), sample(3));
  assert.deepEqual(sample(3, null), sample(3));
  assert.equal(waterStep(9), 10);
  assert.equal(waterStep(10), 10);
  assert.equal(waterStep(20), 10);
  assert.equal(waterStep(-20), 0);
  assert.equal(waterStep(4, {totalWater: 4}), 4);
});

test('all supported default totals grow on every drop and hit all five artwork stages', () => {
  for (let totalWater = 4; totalWater <= 50; totalWater++) {
    const stages = new Set();
    let previous = null;
    for (let water = 0; water <= totalWater; water++) {
      const point = sample(water, {totalWater});
      stages.add(point.stageIndex);
      if (previous) assert.ok(point.scale > previous.scale, `${totalWater} drops / drop ${water}`);
      previous = point;
    }
    assert.equal(stages.size, 5);
    assert.equal(previous.mature, true);
  }
});

test('settings round-trip global and flower preferences while touching only their own key', () => {
  const storage = memory({'xiaoya-english:meadow:v1': '{"water":7}', unrelated: 'keep'});
  const store = createGrowthSettingsStore({storage, ids});
  assert.deepEqual(store.load(), config());
  assert.equal(storage.writes.length, 0);
  const requested = {defaults: {totalWater: 12}, overrides: {[ids[0]]: {totalWater: 7}, bad: {totalWater: 25}}};
  const saved = store.save(requested);
  assert.equal(storage.writes.length, 1);
  assert.equal(storage.writes[0][0], GROWTH_SETTINGS_KEY);
  assert.deepEqual(createGrowthSettingsStore({storage, ids}).load(), saved);
  assert.deepEqual(saved, config(requested, ids));
  assert.equal(storage.values.get('xiaoya-english:meadow:v1'), '{"water":7}');
  assert.equal(storage.values.get('unrelated'), 'keep');
});

test('loading damaged or denied storage is read-only and never overwrites the original', () => {
  for (const broken of ['{bad json', 'null', '[]', 'false', '"text"']) {
    const storage = memory({[GROWTH_SETTINGS_KEY]: broken});
    assert.deepEqual(createGrowthSettingsStore({storage, ids}).load(), config());
    assert.equal(storage.values.get(GROWTH_SETTINGS_KEY), broken);
    assert.equal(storage.writes.length, 0);
  }
  const storage = {getItem() { throw new Error('denied'); }, setItem() { assert.fail('must not write'); }};
  assert.deepEqual(createGrowthSettingsStore({storage, ids}).load(), config());
});

test('a failed save throws instead of claiming success or changing stored settings', () => {
  const previous = JSON.stringify(config());
  const failure = new Error('quota exceeded');
  const storage = {getItem() { return previous; }, setItem() { throw failure; }};
  const store = createGrowthSettingsStore({storage, ids});
  assert.throws(() => store.save({defaults: {totalWater: 25}}), error => error === failure);
  assert.deepEqual(store.load(), config());
  assert.throws(() => createGrowthSettingsStore(), TypeError);
  assert.throws(() => createGrowthSettingsStore({storage: {getItem() {}}}), TypeError);
});

test('isolated memory settings and preview calculations cannot modify real player records', () => {
  const real = memory({[GROWTH_SETTINGS_KEY]: JSON.stringify(config({defaults: {totalWater: 15}})), player: 'keep'});
  const snapshot = [...real.values];
  const sandbox = memory();
  const store = createGrowthSettingsStore({storage: sandbox, ids});
  const settings = store.save({defaults: {totalWater: 6}});
  let water = 0;
  for (let i = 0; i < 10; i++) water = waterStep(water, effective(settings, ids[0]));
  assert.equal(sample(water, effective(settings, ids[0])).mature, true);
  assert.equal(store.load().defaults.totalWater, 6);
  assert.deepEqual([...real.values], snapshot);
  assert.equal(real.writes.length, 0);
  assert.equal(Object.hasOwn(store.load(), 'water'), false);
});
