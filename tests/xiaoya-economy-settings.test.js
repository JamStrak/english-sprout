import test from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULT_ECONOMY_SETTINGS,ECONOMY_SETTINGS_KEY,normalizeEconomySettings,validateEconomySettings,createEconomySettingsStore} from '../xiaoya/economy-settings.js';
import {createMemoryStorage,createSandboxStorage} from '../xiaoya/runtime.js';

test('economy defaults, normal/giant ranges and strict saves are consistent',()=>{
  assert.equal(DEFAULT_ECONOMY_SETTINGS.giantWaterNeeded,10);
  assert.equal(DEFAULT_ECONOMY_SETTINGS.giantScale,2.5);
  assert.equal(DEFAULT_ECONOMY_SETTINGS.normalWaterNeeded,5);
  assert.equal(normalizeEconomySettings({giantChance:5,packPrice:0,giantScale:NaN}).giantChance,1);
  assert.equal(normalizeEconomySettings({packPrice:0}).packPrice,1);
  for(const change of [{giantChance:-.1},{giantScale:5},{normalWaterNeeded:3},{waterReward:1.4},{packPrice:0},{giantChance:'0.5'}]) assert.throws(()=>validateEconomySettings({...DEFAULT_ECONOMY_SETTINGS,...change}));
  assert.throws(()=>validateEconomySettings({...DEFAULT_ECONOMY_SETTINGS,unknown:1}));
  const storage=createMemoryStorage(),store=createEconomySettingsStore({storage});
  const changed={...DEFAULT_ECONOMY_SETTINGS,giantChance:.3,packPrice:7};
  assert.deepEqual(store.save(changed),changed);assert.deepEqual(store.load(),changed);
  assert.equal(JSON.parse(storage.getItem(ECONOMY_SETTINGS_KEY)).packPrice,7);
});
test('failed numerical saves do not claim success or change stored settings',()=>{
  const storage=createMemoryStorage(),store=createEconomySettingsStore({storage});store.save({...DEFAULT_ECONOMY_SETTINGS});
  const broken=createEconomySettingsStore({storage:{getItem:storage.getItem,setItem(){throw Error('quota');}}});
  assert.throws(()=>broken.save({...DEFAULT_ECONOMY_SETTINGS,packPrice:5}),/quota/);
  assert.equal(store.load().packPrice,2);
});
test('sandbox inherits only tuning and music, and mutations remain disposable',()=>{
  const source=createMemoryStorage({[ECONOMY_SETTINGS_KEY]:JSON.stringify({...DEFAULT_ECONOMY_SETTINGS,packPrice:8}),
    'xiaoya-english:growth-settings:v1':JSON.stringify({motion:{sway:9}}),
    'xiaoya-english:sounds:v1':JSON.stringify({volume:.08}),
    'xiaoya-english:preferences:v1':JSON.stringify({welcome:true,mic:true,gardenMusic:{volume:.04,enabled:true}}),
    'child-wallet':'private-wallet','child-learning':'private-learning'});
  const sandbox=createSandboxStorage(()=>source);
  assert.equal(JSON.parse(sandbox.getItem(ECONOMY_SETTINGS_KEY)).packPrice,8);
  assert.equal(JSON.parse(sandbox.getItem('xiaoya-english:sounds:v1')).volume,.08);
  assert.equal(JSON.parse(sandbox.getItem('xiaoya-english:growth-settings:v1')).motion.sway,9);
  assert.deepEqual(JSON.parse(sandbox.getItem('xiaoya-english:preferences:v1')),{gardenMusic:{volume:.04,enabled:true}});
  assert.equal(sandbox.getItem('child-wallet'),null);assert.equal(sandbox.getItem('child-learning'),null);
  createEconomySettingsStore({storage:sandbox}).save({...DEFAULT_ECONOMY_SETTINGS,packPrice:12});
  assert.equal(JSON.parse(source.getItem(ECONOMY_SETTINGS_KEY)).packPrice,8);
});
