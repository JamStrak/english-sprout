import test from 'node:test';
import assert from 'node:assert/strict';
import {GARDEN_KEY,FLOWERS,createGarden,validateGarden,rewardRound,openSeedPack,plantSeed,waterPlant,gardenNextAction} from '../xiaoya/garden.js';

const clone=(value)=>JSON.parse(JSON.stringify(value));
const round=(id,eventId='food-water',date='2026-10-16')=>({roundId:id,eventId,date});
function freeze(value) {
  if(value && typeof value==='object') { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
}
const rewarded=()=>rewardRound(createGarden(),round('round-1'));
const planted=()=>plantSeed(openSeedPack(rewarded()));

test('garden has an independent key and six distinct, immutable varieties',()=>{
  assert.equal(GARDEN_KEY,'xiaoya-english:garden:v1');
  assert.equal(FLOWERS.length,6);
  assert.equal(new Set(FLOWERS.map((flower)=>flower.id)).size,6);
  assert.equal(new Set(FLOWERS.map((flower)=>flower.color)).size,6);
  for(const flower of FLOWERS) {
    assert.deepEqual(Object.keys(flower),['id','name','color']);
    assert.ok(Object.isFrozen(flower));
  }
  const state=createGarden();
  assert.strictEqual(validateGarden(state),state);
  assert.equal(gardenNextAction(state),'learn');
  assert.deepEqual([state.shells,state.water,state.rounds.length,state.plants.length],[0,0,0,0]);
  state.bag.pop();
  assert.equal(createGarden().bag.length,6,'fresh gardens do not share mutable arrays');
});

test('each supported story rewards completed participation, once per round across refresh',()=>{
  let state=freeze(createGarden());
  const stories=['food-water','play-box','hello-goodbye'];
  for(const [index,eventId] of stories.entries()) {
    const input=freeze(round(`round-${index}`,eventId));
    const previous=state;
    state=rewardRound(state,input);
    assert.notStrictEqual(state,previous);
    assert.equal(previous.rounds.length,index);
    assert.deepEqual(state.rounds[index],input);
    assert.notStrictEqual(state.rounds[index],input,'caller-owned payload is copied');
    assert.strictEqual(rewardRound(state,input),state);
    state=freeze(clone(state));
    assert.strictEqual(rewardRound(state,input),state,'saved round id stays idempotent');
  }
  assert.deepEqual([state.shells,state.water,state.rounds.length],[9,6,3]);
  assert.deepEqual(Object.keys(state.rounds[0]),['roundId','eventId','date']);
  assert.equal('evidence' in state,false);
  assert.equal('mastery' in state,false);
  assert.throws(()=>rewardRound(state,round('round-0','play-box')),/同一互动编号/);
  assert.throws(()=>rewardRound(state,round('round-0','food-water','2026-10-17')),/同一互动编号/);
});

test('buying reserves the variety and seed id before planting, without refresh rerolls',()=>{
  const original=freeze(rewardRound(rewarded(),round('round-2')));
  const purchased=openSeedPack(original);
  assert.deepEqual([purchased.shells,purchased.water,purchased.seedPacksOpened],[3,4,1]);
  assert.deepEqual(purchased.pendingSeed,{id:'seed-1',flowerId:FLOWERS[0].id});
  assert.equal(purchased.bag.length,5);
  assert.equal(original.pendingSeed,null);
  assert.equal(original.shells,6);
  assert.strictEqual(openSeedPack(purchased),purchased,'another pack cannot replace a pending seed even with enough shells');
  const restored=freeze(clone(purchased));
  assert.strictEqual(validateGarden(restored),restored);
  assert.strictEqual(openSeedPack(restored),restored);
  const result=plantSeed(restored);
  assert.equal(result.pendingSeed,null);
  assert.deepEqual(result.plants,[{id:'plant-1',seedId:'seed-1',flowerId:FLOWERS[0].id,waterings:0}]);
  assert.deepEqual([result.shells,result.water],[3,4]);
  assert.strictEqual(plantSeed(result),result,'a repeated plant callback cannot duplicate the flower');
});

test('two one-unit waterings bloom a plant; unavailable actions never spend resources',()=>{
  const empty=freeze(createGarden());
  assert.strictEqual(openSeedPack(empty),empty);
  assert.strictEqual(plantSeed(empty),empty);
  const state=freeze(planted());
  const one=waterPlant(state,'plant-1');
  assert.deepEqual([one.water,one.plants[0].waterings],[1,1]);
  assert.deepEqual([state.water,state.plants[0].waterings],[2,0]);
  const two=freeze(waterPlant(one,'plant-1'));
  assert.deepEqual([two.water,two.plants[0].waterings],[0,2]);
  assert.strictEqual(waterPlant(two,'plant-1'),two);
  const withWater=rewardRound(two,round('round-2'));
  assert.strictEqual(waterPlant(withWater,'plant-1'),withWater,'a blooming flower spends no further water');
  assert.throws(()=>waterPlant(withWater,'plant-missing'),/找不到花盆/);
  assert.deepEqual([withWater.shells,withWater.water],[3,2]);
});

test('every six packs contain all varieties, then repeat, while stable pots keep expanding',()=>{
  let state=createGarden();
  const varieties=[];
  for(let index=0;index<30;index++) {
    state=rewardRound(freeze(state),round(`repeat-${index}`,'hello-goodbye'));
    state=openSeedPack(freeze(state));
    varieties.push(state.pendingSeed.flowerId);
    assert.equal(state.pendingSeed.id,`seed-${index+1}`);
    state=clone(state);
    state=plantSeed(freeze(state));
    state=waterPlant(freeze(state),`plant-${index+1}`);
    state=waterPlant(freeze(state),`plant-${index+1}`);
    assert.equal(state.plants.length,index+1);
    assert.equal(state.plants[0].id,'plant-1');
    assert.equal(state.plants[0].waterings,2);
    assert.equal(validateGarden(state),state);
  }
  for(let start=0;start<varieties.length;start+=6) {
    assert.deepEqual(varieties.slice(start,start+6),FLOWERS.map((flower)=>flower.id));
  }
  assert.equal(new Set(state.plants.map((plant)=>plant.id)).size,30);
  assert.deepEqual([state.shells,state.water],[0,0]);
  assert.deepEqual(state.bag,FLOWERS.map((flower)=>flower.id));
});

test('next action prioritizes a pending seed, then water, then a pack, then participation',()=>{
  let state=rewarded();
  assert.equal(gardenNextAction(state),'pack');
  state=openSeedPack(state);
  assert.equal(gardenNextAction(state),'plant');
  state=plantSeed(state);
  state=rewardRound(state,round('round-2'));
  assert.equal(gardenNextAction(state),'water','watering wins over a purchasable pack');
  state=openSeedPack(state);
  assert.equal(gardenNextAction(state),'plant','pending seed wins over a thirsty flower');
  state=plantSeed(state);
  for(const id of ['plant-1','plant-2']) {
    state=waterPlant(state,id);
    state=waterPlant(state,id);
  }
  assert.equal(gardenNextAction(state),'learn');
});

test('rejects corrupted, mismatched and legacy state without changing it',()=>{
  const valid=rewardRound(planted(),round('round-2','play-box'));
  const mutations=[
    (s)=>{s.schemaVersion=2;},
    (s)=>{s.product='xiaoya-english';},
    (s)=>{delete s.pendingSeed;},
    (s)=>{s.evidence=[];},
    (s)=>{s.shells+=1;},
    (s)=>{s.water+=1;},
    (s)=>{s.shells=-1;},
    (s)=>{s.water=NaN;},
    (s)=>{s.seedPacksOpened=1.5;},
    (s)=>{s.bag.reverse();},
    (s)=>{s.bag[0]=s.bag[1];},
    (s)=>{s.rounds.push({...s.rounds[0]});s.shells+=3;s.water+=2;},
    (s)=>{s.rounds[0].eventId='bed-night';},
    (s)=>{s.rounds[0].date='2026-02-30';},
    (s)=>{s.rounds[0].mastered=true;},
    (s)=>{s.plants[0].flowerId='tulip';},
    (s)=>{s.plants[0].seedId='seed-2';},
    (s)=>{s.plants[0].id='plant-99';},
    (s)=>{s.plants[0].waterings=3;s.water-=3;},
    (s)=>{s.plants[0].waterings=1;},
    (s)=>{s.pendingSeed={id:'seed-2',flowerId:'tulip'};},
  ];
  for(const mutate of mutations) {
    const broken=clone(valid);mutate(broken);freeze(broken);
    assert.throws(()=>validateGarden(broken),/小芽花园记录无效/);
    assert.throws(()=>rewardRound(broken,round('round-3')),/小芽花园记录无效/);
    assert.throws(()=>openSeedPack(broken),/小芽花园记录无效/);
    assert.throws(()=>plantSeed(broken),/小芽花园记录无效/);
    assert.throws(()=>waterPlant(broken,'plant-1'),/小芽花园记录无效/);
    assert.throws(()=>gardenNextAction(broken),/小芽花园记录无效/);
  }
  const pending=openSeedPack(rewarded());
  for(const replacement of [{id:'seed-9',flowerId:'daisy'},{id:'seed-1',flowerId:'tulip'}]) {
    assert.throws(()=>validateGarden({...pending,pendingSeed:replacement}),/待播种/);
  }
  for(const value of [null,[],{},new Date()]) assert.throws(()=>validateGarden(value),/小芽花园记录无效/);
});

test('reward inputs require an explicit valid day, known story and unique safe identifier',()=>{
  const state=freeze(createGarden());
  for(const input of [
    null,{},round(''),round('__proto__'),round('x'.repeat(161)),round('with space'),
    round('r','unknown'),round('r','food-water','2026-02-29'),
    round('r','food-water','2026-1-01'),round('r','food-water','1999-12-31'),
    {...round('r'),date:undefined},{...round('r'),result:'independent'},
  ]) assert.throws(()=>rewardRound(state,input),/小芽花园记录无效/);
  const leap=rewardRound(state,round('leap','food-water','2028-02-29'));
  assert.equal(leap.rounds[0].date,'2028-02-29');
  assert.deepEqual([state.shells,state.water,state.rounds.length],[0,0,0]);
});
