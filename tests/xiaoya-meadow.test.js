import test from 'node:test';
import assert from 'node:assert/strict';
import {MEADOW_KEY,FLOWERS,ECONOMY,createMeadow,validateMeadow,rewardRound,claimReward,pendingRewards,openSeedPack,plantSeed,waterPlant,nextAction} from '../xiaoya/garden-meadow.js';
import {meadowPlantArt} from '../xiaoya/meadow-art.js';
import {GARDEN_KEY,createGarden,validateGarden} from '../xiaoya/garden.js';
import {EVENTS} from '../xiaoya/content.js';

const clone=(value)=>JSON.parse(JSON.stringify(value));
const round=(id,eventId='food-water',date='2026-10-17')=>({roundId:id,eventId,date});
const flowerFor=(id)=>FLOWERS.find((flower)=>flower.id===id);
function freeze(value) {
  if(value && typeof value==='object') { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
}
const rewarded=()=>rewardRound(createMeadow(),round('first'));
const pending=()=>openSeedPack(rewarded(),0);
const planted=()=>plantSeed(pending(),{x:.321,y:.789});
function reward(state,id,choice='shells') {
  const recorded=rewardRound(state,round(id));
  return claimReward(recorded,id,choice);
}
function addPlant(state,index,point={x:.5,y:.5},random=0) {
  return plantSeed(openSeedPack(reward(state,`round-${index}`),random),point);
}

test('B meadow keeps its storage key, immutable varieties and independent A economy',()=>{
  assert.equal(MEADOW_KEY,'xiaoya-english:meadow:v1');
  assert.notEqual(MEADOW_KEY,GARDEN_KEY);
  assert.deepEqual(ECONOMY,{shellReward:2,waterReward:5,packPrice:2});
  assert.ok(Object.isFrozen(ECONOMY));
  assert.equal(FLOWERS.length,12);
  assert.equal(new Set(FLOWERS.map((flower)=>flower.id)).size,12);
  assert.equal(FLOWERS.filter((flower)=>flower.shape==='bow').length,4);
  assert.equal(FLOWERS.filter((flower)=>flower.giant).length,2);
  for(const flower of FLOWERS) {
    assert.ok(Object.isFrozen(flower));
    assert.equal(flower.waterNeeded,flower.giant?10:5);
    assert.equal(flower.scale,flower.giant?1.75:1);
  }
  const meadow=createMeadow(),garden=freeze(createGarden()),original=clone(garden);
  assert.strictEqual(validateMeadow(meadow),meadow);
  assert.equal(nextAction(meadow),'learn');
  assert.throws(()=>validateMeadow(garden),/产品或版本/);
  assert.throws(()=>validateGarden(meadow),/字段|产品或版本/);
  addPlant(freeze(meadow),1);
  assert.deepEqual(garden,original);
  const separate=createMeadow();separate.shop.offers.push({});
  assert.equal(createMeadow().shop.offers.length,0);
});

test('each content event records participation once and each later reward needs a choice',()=>{
  let state=freeze(createMeadow()),shells=0,water=0;
  for(const [index,event] of EVENTS.entries()) {
    const payload=freeze(round(`event-${index}`,event.id));
    const before=state;
    state=rewardRound(state,payload);
    assert.equal(before.rounds.length,index);
    assert.deepEqual(state.rounds[index],{...payload,starter:index===0,reward:index===0?'starter':'pending'});
    assert.strictEqual(rewardRound(state,payload),state);
    if(index===0) {shells+=2;water+=5;}
    else {
      assert.deepEqual([state.shells,state.water],[shells,water]);
      assert.equal(pendingRewards(state).length,1);
      const choice=index%2?'water':'shells';
      state=claimReward(state,payload.roundId,choice);
      shells+=choice==='shells'?2:0;water+=choice==='water'?5:0;
      assert.strictEqual(claimReward(state,payload.roundId,choice==='shells'?'water':'shells'),state);
    }
    assert.deepEqual([state.shells,state.water],[shells,water]);
    assert.equal(pendingRewards(state).length,0);
    state=freeze(clone(state));
    assert.strictEqual(rewardRound(state,payload),state);
  }
  assert.equal('evidence' in state,false);assert.equal('mastery' in state,false);
  assert.throws(()=>rewardRound(state,round('event-0',EVENTS[1].id)),/同一互动编号/);
  assert.throws(()=>rewardRound(state,round('event-0',EVENTS[0].id,'2026-10-18')),/同一互动编号/);
});

test('a bought mystery is stable through reload and duplicate clicks until planted',()=>{
  const before=freeze(reward(rewarded(),'second'));
  const purchased=openSeedPack(before,0);
  assert.deepEqual([purchased.shells,purchased.water,purchased.seedPacksOpened],[2,5,1]);
  assert.deepEqual(purchased.pendingSeed,{id:'seed-1',flowerId:'daisy'});
  assert.equal(before.shells,4);assert.equal(before.pendingSeed,null);
  assert.strictEqual(openSeedPack(purchased,.99),purchased);
  const restored=freeze(clone(purchased));
  assert.strictEqual(validateMeadow(restored),restored);
  assert.strictEqual(openSeedPack(restored,.99),restored);
  const point=freeze({x:.123456,y:.987654});
  const plantedState=plantSeed(restored,point);
  assert.deepEqual(plantedState.plants,[{id:'plant-1',seedId:'seed-1',flowerId:'daisy',waterings:0,...point}]);
  assert.equal(plantedState.pendingSeed,null);
  assert.deepEqual([plantedState.shells,plantedState.water],[2,5]);
  assert.strictEqual(plantSeed(plantedState,point),plantedState);
  assert.deepEqual(restored.pendingSeed,{id:'seed-1',flowerId:'daisy'});
});

test('newcomer mystery is a daisy while later mystery outcomes use the supplied draw',()=>{
  for(const random of [0,.1,.5,.99]) assert.equal(openSeedPack(rewarded(),random).pendingSeed.flowerId,'daisy');
  const base=reward(planted(),'second');
  for(const [index,flower] of FLOWERS.entries()) assert.equal(openSeedPack(base,(index+.5)/FLOWERS.length).pendingSeed.flowerId,flower.id);
  for(const value of [-1,1,Infinity,NaN,'0.5',null]) assert.throws(()=>openSeedPack(rewarded(),value),/随机值/);
});

test('free planting preserves fractional coordinates and every meadow edge',()=>{
  let state=freeze(createMeadow());
  const points=[{x:0,y:0},{x:1,y:1},{x:0,y:1},{x:1,y:0},{x:.000001,y:.999999},{x:.57391,y:.48302}];
  for(const [index,point] of points.entries()) {
    state=addPlant(state,index,freeze(point));
    assert.equal(state.plants[index].x,point.x);assert.equal(state.plants[index].y,point.y);
    state=freeze(clone(state));assert.strictEqual(validateMeadow(state),state);
  }
});

test('invalid coordinates reject planting without changing a saved seed',()=>{
  const state=freeze(pending()),before=clone(state);
  const points=[undefined,null,[],{}, {x:.5}, {x:.5,y:.5,z:1},
    ...[NaN,Infinity,-Infinity,-.00001,1.00001,'0.5',null,undefined].flatMap((value)=>[{x:value,y:.5},{x:.5,y:value}])];
  for(const point of points) {
    assert.throws(()=>plantSeed(state,point),/小芽草地记录无效/);assert.deepEqual(state,before);
  }
});

test('ordinary flowers need five one-unit pours and mature plants spend no water',()=>{
  let state=freeze(planted());
  for(let pours=1;pours<=5;pours++) {
    const previous=state;state=waterPlant(previous,'plant-1');
    assert.equal(previous.plants[0].waterings,pours-1);assert.equal(state.plants[0].waterings,pours);
    assert.equal(state.water,5-pours);assert.equal(nextAction(state),pours<5?'water':'learn');
    state=freeze(clone(state));
  }
  assert.strictEqual(waterPlant(state,'plant-1'),state);
  const stocked=freeze(reward(state,'second','water'));
  assert.strictEqual(waterPlant(stocked,'plant-1'),stocked);
  assert.throws(()=>waterPlant(stocked,'plant-missing'),/找不到植物/);
});

test('a giant needs ten pours and water-only rewards refill without forcing another seed',()=>{
  let state=planted();
  for(let n=0;n<5;n++)state=waterPlant(state,'plant-1');
  state=addPlant(state,2,{x:.4,y:.6},10.5/12);
  assert.equal(state.plants[1].flowerId,'giant-daisy');assert.equal(state.water,0);
  assert.strictEqual(waterPlant(state,'plant-2'),state);
  for(let batch=0;batch<2;batch++) {
    state=reward(freeze(state),`refill-${batch}`,'water');
    for(let n=0;n<5;n++)state=waterPlant(freeze(state),'plant-2');
    assert.equal(state.water,0);
    assert.equal(state.plants[1].waterings,(batch+1)*5);
  }
  assert.equal(state.shells,0);assert.equal(state.seedPacksOpened,2);
  assert.strictEqual(waterPlant(state,'plant-2'),state);
});

test('the meadow has no slot cap that traps a purchased seed',()=>{
  let state=createMeadow();
  for(let index=0;index<180;index++)state=addPlant(state,index,{x:(index%18)/17,y:Math.floor(index/18)/9});
  const previous=freeze(state);
  const paid=openSeedPack(reward(previous,'beyond-visible-slots'),.5);
  const expanded=plantSeed(freeze(paid),{x:.5,y:.5});
  assert.equal(expanded.plants.length,181);assert.equal(expanded.pendingSeed,null);
  assert.equal(expanded.shells,0);assert.equal(previous.plants.length,180);
  const watered=waterPlant(freeze(expanded),'plant-181');
  assert.equal(watered.plants[180].waterings,1);assert.equal(watered.water,4);
});

test('next action prioritizes unclaimed rewards, pending seed, thirsty plant then buying',()=>{
  const empty=freeze(createMeadow());
  assert.strictEqual(openSeedPack(empty),empty);assert.strictEqual(plantSeed(empty,{x:.5,y:.5}),empty);
  assert.equal(nextAction(empty),'learn');
  const funded=rewardRound(empty,round('1'));assert.equal(nextAction(funded),'pack');
  const seed=openSeedPack(funded,0);assert.equal(nextAction(seed),'plant');
  const unclaimed=rewardRound(seed,round('2'));assert.equal(nextAction(unclaimed),'reward');
  const claimed=claimReward(unclaimed,'2','shells');assert.equal(nextAction(claimed),'plant');
  const plant=plantSeed(claimed,{x:.5,y:.5});assert.equal(nextAction(plant),'water');
  let bloom=plant;for(let n=0;n<5;n++)bloom=waterPlant(bloom,'plant-1');
  assert.equal(nextAction(bloom),'pack');
});

test('validation rejects forged balances, purchases, plants and learning evidence everywhere',()=>{
  const valid=reward(planted(),'second');
  const mutations=[
    (s)=>{s.schemaVersion=3;},(s)=>{s.product='xiaoya-english-garden';},(s)=>{delete s.pendingSeed;},
    (s)=>{s.mastery=100;},(s)=>{s.shells++;},(s)=>{s.water++;},(s)=>{s.shells=-1;},
    (s)=>{s.water=Infinity;},(s)=>{s.seedPacksOpened=.5;},
    (s)=>{s.rounds.push({...s.rounds[0]});s.shells+=2;s.water+=5;},
    (s)=>{s.rounds[0].eventId='not-a-story';},(s)=>{s.rounds[0].date='2026-02-30';},
    (s)=>{s.rounds[0].mastered=true;},(s)=>{s.rounds[1].starter=true;},
    (s)=>{s.rounds[1].reward='legacy';},(s)=>{s.purchases[0].price=0;s.shells+=2;},
    (s)=>{s.purchases[0].source='legacy';},(s)=>{s.purchases[0].extra=1;},
    (s)=>{s.plants[0].flowerId='giant-daisy';},(s)=>{s.plants[0].seedId='seed-2';},
    (s)=>{s.plants[0].id='plant-99';},(s)=>{s.plants[0].waterings=6;s.water-=6;},
    (s)=>{s.plants[0].waterings=1;},(s)=>{s.plants[0].x=NaN;},(s)=>{s.plants[0].y=1.001;},
    (s)=>{s.plants[0].x='0.5';},(s)=>{s.pendingSeed={id:'seed-2',flowerId:'bow-pink'};},
  ];
  for(const mutate of mutations) {
    const state=clone(valid);mutate(state);freeze(state);
    for(const operation of [()=>validateMeadow(state),()=>rewardRound(state,round('third')),()=>openSeedPack(state),
      ()=>claimReward(state,'second','water'),()=>pendingRewards(state),
      ()=>plantSeed(state,{x:.5,y:.5}),()=>waterPlant(state,'plant-1'),()=>nextAction(state)]) {
      assert.throws(operation,/小芽草地记录无效/);
    }
  }
  for(const replacement of [{id:'seed-9',flowerId:'daisy'},{id:'seed-1',flowerId:'bow-pink'}]) {
    assert.throws(()=>validateMeadow({...pending(),pendingSeed:replacement}),/待播种/);
  }
  for(const value of [null,[],{},new Date()])assert.throws(()=>validateMeadow(value),/小芽草地记录无效/);
});

test('reward input requires a real date, known event and safe stable ID',()=>{
  const state=freeze(createMeadow());
  for(const input of [null,{},round(''),round('__proto__'),round('constructor'),round('x'.repeat(161)),
    round('with space'),round('r','unknown'),round('r','food-water','2026-02-29'),round('r','food-water','2026-1-01'),
    round('r','food-water','1999-12-31'),{...round('r'),result:'independent'},{...round('r'),date:undefined}]) {
    assert.throws(()=>rewardRound(state,input),/小芽草地记录无效/);
  }
  const leap=rewardRound(state,round('leap','food-water','2028-02-29'));
  assert.equal(leap.rounds[0].date,'2028-02-29');assert.deepEqual(state,createMeadow());
  assert.throws(()=>claimReward(rewarded(),'missing','both'),/请选择/);
  assert.strictEqual(claimReward(state,'missing','water'),state);
});

test('every watering changes actual plant geometry, with a separate full-bloom stage and no pot',()=>{
  for(const flower of FLOWERS) {
    const art=[];
    for(let stage=0;stage<=flower.waterNeeded;stage++) {
      const svg=meadowPlantArt(flower,stage);
      assert.match(svg,/^<svg viewBox="0 0 160 180"/);
      assert.match(svg,new RegExp(`data-growth="${stage}"`));
      assert.match(svg,new RegExp(`data-bloom="${stage===flower.waterNeeded}"`));
      assert.match(svg,new RegExp(`data-scale="${flower.scale}"`));
      assert.match(svg,/data-part="soil"/);
      assert.doesNotMatch(svg,/<(?:text|foreignObject|script|rect)\b|(?:NaN|Infinity|data-part="pot")/);
      const paperKey=stage===flower.waterNeeded?`flower-${flower.id}`:stage===0?'seed-in-soil':stage/flower.waterNeeded<.5?'sprout':'bud';
      assert.match(svg,new RegExp(`data-paper-art="${paperKey}"`));
      assert.match(svg,/<g data-paper-fallback>/);
      assert.match(svg,/<image[^>]+opacity="0"/);
      assert.equal(svg.includes('data-part="flower"'),stage===flower.waterNeeded);
      // Attribute changes alone do not count: check the actual stem's drawn path.
      art.push(svg.match(/data-part="stem" d="([^"]+)"/)[1]);
    }
    assert.equal(new Set(art).size,flower.waterNeeded+1,`${flower.id} visibly grows on each pour`);
  }
  assert.notEqual(meadowPlantArt(flowerFor('bow-pink'),5),meadowPlantArt(flowerFor('bow-blue'),5));
  assert.notEqual(meadowPlantArt(flowerFor('daisy'),5),meadowPlantArt(flowerFor('giant-daisy'),5));
});

test('art clamps invalid stages and never interpolates unknown flower metadata',()=>{
  const flower=FLOWERS[0];
  assert.equal(meadowPlantArt(flower,100),meadowPlantArt(flower,5));
  for(const value of [NaN,Infinity,-10,'3'])assert.equal(meadowPlantArt(flower,value),meadowPlantArt(flower,0));
  const hostile={id:'daisy',color:'"><script>alert(1)</script>',shape:'bow'};
  assert.equal(meadowPlantArt(hostile,5),meadowPlantArt(flower,5));
  assert.equal(meadowPlantArt({id:'unknown'},5),meadowPlantArt(flower,5));
});
