import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createMemoryStorage,createSandboxStorage} from '../xiaoya/runtime.js';
import * as normal from '../xiaoya/garden-meadow.js';

const prefsKey='xiaoya-english:preferences:v1',growthKey='xiaoya-english:growth-settings:v1';
const dataModule=source=>`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
let sequence=0;

// Exercise the actual module with the same compile-time flag the builder changes,
// without building dist, enabling public GM or modifying any on-disk source.
async function loadRuntime(internal,search,storage) {
  const originalLocation=Object.getOwnPropertyDescriptor(globalThis,'location');
  const originalStorage=Object.getOwnPropertyDescriptor(globalThis,'localStorage');
  Object.defineProperty(globalThis,'location',{configurable:true,value:{search}});
  Object.defineProperty(globalThis,'localStorage',{configurable:true,value:storage});
  try {
    const source=(await readFile(new URL('../xiaoya/runtime.js',import.meta.url),'utf8'))
      .replace("import {INTERNAL_BUILD} from './build-config.js';",`const INTERNAL_BUILD=${internal};`);
    const url=dataModule(`${source}\n// isolated runtime ${sequence++}`);
    return {runtime:await import(url),url};
  } finally {
    if(originalLocation)Object.defineProperty(globalThis,'location',originalLocation);else delete globalThis.location;
    if(originalStorage)Object.defineProperty(globalThis,'localStorage',originalStorage);else delete globalThis.localStorage;
  }
}

async function sandbox(real=createMemoryStorage()) {
  const {runtime,url}=await loadRuntime(true,'?gm=test',real);
  const settings=dataModule((await readFile(new URL('../xiaoya/economy-settings.js',import.meta.url),'utf8')).replaceAll("'./runtime.js'",JSON.stringify(url)));
  const source=(await readFile(new URL('../xiaoya/garden-meadow.js',import.meta.url),'utf8'))
    .replaceAll("'./economy-settings.js'",JSON.stringify(settings))
    .replaceAll("'./challenge-flowers.js'",JSON.stringify(new URL('../xiaoya/challenge-flowers.js',import.meta.url).href))
    .replaceAll("'./runtime.js'",JSON.stringify(url))
    .replaceAll("'./content.js'",JSON.stringify(new URL('../xiaoya/content.js',import.meta.url).href))
    .replaceAll("'./challenges.js'",JSON.stringify(new URL('../xiaoya/challenges.js',import.meta.url).href));
  return {runtime,model:await import(dataModule(source)),real};
}

test('GM inherits only saved music and growth controls, never child records or mic permission',()=>{
  const growth=JSON.stringify({motion:{duration:2100,sway:16,flex:80}});
  const rawPrefs=JSON.stringify({mic:true,welcome:true,shopSeen:true,gardenMusic:{enabled:false,volume:0.03,secret:'omit'}});
  const real=createMemoryStorage({[prefsKey]:rawPrefs,[growthKey]:growth,
    [normal.MEADOW_KEY]:'private meadow','xiaoya-english:learning:v1':'private progress'});
  const memory=createSandboxStorage(()=>real);
  assert.equal(memory.length,2);
  assert.deepEqual(JSON.parse(memory.getItem(prefsKey)),{gardenMusic:{enabled:false,volume:0.03}});
  assert.equal(memory.getItem(growthKey),growth);
  assert.equal(memory.getItem(normal.MEADOW_KEY),null);
  assert.equal(memory.getItem('xiaoya-english:learning:v1'),null);
  memory.setItem(prefsKey,JSON.stringify({gardenMusic:{volume:0.8}}));memory.setItem(growthKey,'changed');
  assert.equal(real.getItem(prefsKey),rawPrefs);assert.equal(real.getItem(growthKey),growth);
});

test('GM preference inheritance tolerates denied/malformed storage and ignores unsafe properties',()=>{
  assert.equal(createSandboxStorage(()=>{throw Error('denied');}).length,0);
  assert.equal(createSandboxStorage(()=>({getItem(){throw Error('denied');}})).length,0);
  for(const raw of ['bad json','null','[]','{"gardenMusic":[]}','{"gardenMusic":{"volume":"1","enabled":"yes"}}']) {
    const real=createMemoryStorage({[prefsKey]:raw,[growthKey]:'bad json'});
    assert.equal(createSandboxStorage(()=>real).length,0);
  }
  assert.deepEqual(JSON.parse(createSandboxStorage(()=>createMemoryStorage({
    [prefsKey]:JSON.stringify({gardenMusic:{enabled:true,volume:100},mic:true}),
  })).getItem(prefsKey)),{gardenMusic:{enabled:true,volume:1}});
});

test('the public build cannot activate GM with a URL or accept unlimited test records',async()=>{
  let reads=0;
  const {runtime}=await loadRuntime(false,'?gm=test',{getItem(){reads++;return null;}});
  assert.equal(runtime.GM_SANDBOX,false);assert.equal(reads,0);
  const regular=normal.createMeadow();assert.equal(normal.hasUnlimitedResources(regular),false);
  assert.equal(normal.openSeedPack(regular,0),regular);
  assert.throws(()=>normal.validateMeadow({...regular,testMode:'unlimited-resources'}),/字段/);
  assert.equal(normal.hasUnlimitedResources({...regular,testMode:'unlimited-resources'}),false);
});

test('sandbox purchases and every pour remain unlimited without fabricating learning rewards',async()=>{
  const {model:m}=await sandbox();let state=m.createMeadow();
  assert.equal(m.hasUnlimitedResources(state),true);assert.equal(m.nextAction(state),'pack');
  for(let i=0;i<30;i++) {
    state=m.openSeedPack(state,(i%10)/10,i%2?0:.99);
    assert.equal(state.pendingSeed.id,`seed-${i+1}`);
    assert.equal(m.openSeedPack(state,0),state,'a pending seed still prevents double purchase');
    state=m.plantSeed(state,{x:0.15+(i%5)*0.15,y:0.2+(i%4)*0.15});
    const plant=state.plants.at(-1),needed=m.flowerForSeed(plant).waterNeeded;
    assert.equal(m.nextAction(state),'water');
    for(let step=0;step<needed;step++)state=m.waterPlant(state,plant.id);
    assert.equal(state.plants.at(-1).waterings,needed);
    assert.equal(m.waterPlant(state,plant.id),state,'mature flowers still stop growing');
    state=m.validateMeadow(JSON.parse(JSON.stringify(state)));
  }
  assert.equal(state.seedPacksOpened,30);assert.equal(state.shells,0);assert.equal(state.water,0);
  assert.equal(state.rounds.length,0);assert.equal(state.challengeRewards.length,0);assert.equal(state.welcomeGifts.length,0);
  assert(state.plants.some(p=>p.waterings===10));
  assert.throws(()=>normal.validateMeadow(state),/字段/,'a GM export cannot become a normal player save');
});

test('sandbox fixed/reserved offers are unlimited but price, stale-ID and ledger validation stay intact',async()=>{
  const {model:m}=await sandbox();let state=m.ensureShop(m.createMeadow(),'2026-10-21',0.9);
  const offer=state.shop.offer;assert(offer.price>state.shells);
  state=m.reserveOffer(state,offer.id);
  assert.equal(m.buyOffer(state,'stale-offer','shop',0),state);
  state=m.buyOffer(state,offer.id,'reserved',0);
  assert.equal(state.pendingSeed.flowerId,offer.flowerId);assert.equal(state.purchases[0].price,offer.price);
  assert.equal(state.shop.reserved,null);assert.equal(state.shells,0);
  assert.throws(()=>m.validateMeadow({...state,shells:100}),/贝壳余额/);
  assert.throws(()=>m.validateMeadow({...state,testMode:'anything'}),/字段/);
  assert.throws(()=>m.validateMeadow({...state,water:-1}),/非负安全整数/);
  assert.throws(()=>m.validateMeadow({...state,purchases:[{...state.purchases[0],price:0}]}),/购买成本/);
});

test('sandbox storage and economy leave the normal saved wallet, progress and settings byte-for-byte intact',async()=>{
  let player=normal.rewardRound(normal.createMeadow(),{roundId:'real-round',eventId:'food-water',date:'2026-10-21'});
  player=normal.plantSeed(normal.openSeedPack(player,0),{x:0.3,y:0.5});
  player=normal.waterPlant(player,'plant-1');
  const real=createMemoryStorage({[normal.MEADOW_KEY]:JSON.stringify(player),[prefsKey]:JSON.stringify({mic:true,gardenMusic:{volume:0.02}}),
    [growthKey]:JSON.stringify({motion:{sway:14}}),'real-learning':'private-progress'});
  const before=Object.fromEntries(Array.from({length:real.length},(_,i)=>[real.key(i),real.getItem(real.key(i))]));
  const {runtime,model:m}=await sandbox(real);
  assert.equal(runtime.appStorage.getItem(normal.MEADOW_KEY),null);
  let state=m.plantSeed(m.openSeedPack(m.createMeadow(),0),{x:0.2,y:0.4});
  state=m.waterPlant(state,'plant-1');runtime.appStorage.setItem(m.MEADOW_KEY,JSON.stringify(state));
  runtime.appStorage.setItem(prefsKey,JSON.stringify({gardenMusic:{volume:0.9}}));
  runtime.appStorage.setItem(growthKey,JSON.stringify({motion:{sway:3}}));
  assert.equal(JSON.parse(runtime.appStorage.getItem(m.MEADOW_KEY)).plants[0].waterings,1);
  assert.deepEqual(Object.fromEntries(Array.from({length:real.length},(_,i)=>[real.key(i),real.getItem(real.key(i))])),before);
  assert.deepEqual(normal.validateMeadow(JSON.parse(real.getItem(m.MEADOW_KEY))),player);
  const fresh=await sandbox(real);
  assert.equal(fresh.runtime.appStorage.getItem(m.MEADOW_KEY),null,'refresh starts a fresh disposable garden');
  assert.equal(JSON.parse(fresh.runtime.appStorage.getItem(prefsKey)).gardenMusic.volume,0.02,'fresh sessions inherit the real tuning, not prior test changes');
});
