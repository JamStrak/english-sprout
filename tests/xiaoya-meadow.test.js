import test from 'node:test';
import assert from 'node:assert/strict';
import {MEADOW_KEY,FLOWERS,createMeadow,validateMeadow,rewardRound,openSeedPack,plantSeed,waterPlant,nextAction} from '../xiaoya/garden-meadow.js';
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
const pending=()=>openSeedPack(rewarded());
const planted=()=>plantSeed(pending(),{x:.321,y:.789});
function addPlant(state,index,point={x:.5,y:.5}) {
  return plantSeed(openSeedPack(rewardRound(state,round(`round-${index}`))),point);
}

test('B meadow has independent storage and twelve immutable collectable varieties',()=>{
  assert.equal(MEADOW_KEY,'xiaoya-english:meadow:v1');
  assert.notEqual(MEADOW_KEY,GARDEN_KEY);
  assert.equal(FLOWERS.length,12);
  assert.equal(new Set(FLOWERS.map((flower)=>flower.id)).size,12);
  assert.deepEqual(FLOWERS.slice(0,6).map((flower)=>flower.id),['daisy','tulip','sunflower','bellflower','poppy','violet']);
  const bows=FLOWERS.filter((flower)=>flower.shape==='bow');
  assert.equal(bows.length,4);
  assert.equal(new Set(bows.map((flower)=>flower.color)).size,4);
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
  assert.throws(()=>validateGarden(meadow),/产品或版本/);
  addPlant(freeze(meadow),1);
  assert.deepEqual(garden,original);
  const separate=createMeadow();
  separate.bag.pop();
  assert.equal(createMeadow().bag.length,12,'fresh meadows do not share mutable arrays');
});

test('every content event can reward completed participation exactly once across reload',()=>{
  let state=freeze(createMeadow());
  for(const [index,event] of EVENTS.entries()) {
    const payload=freeze(round(`event-${index}`,event.id));
    const before=state;
    state=rewardRound(state,payload);
    assert.equal(before.rounds.length,index);
    assert.equal(state.shells,(index+1)*3);
    assert.equal(state.water,(index+1)*5);
    assert.deepEqual(state.rounds[index],payload);
    assert.notStrictEqual(state.rounds[index],payload);
    assert.strictEqual(rewardRound(state,payload),state);
    state=freeze(clone(state));
    assert.strictEqual(rewardRound(state,payload),state);
  }
  assert.equal('evidence' in state,false);
  assert.equal('mastery' in state,false);
  assert.deepEqual(Object.keys(state.rounds[0]),['roundId','eventId','date']);
  assert.throws(()=>rewardRound(state,round('event-0',EVENTS[1].id)),/同一互动编号/);
  assert.throws(()=>rewardRound(state,round('event-0',EVENTS[0].id,'2026-10-18')),/同一互动编号/);
});

test('pack purchase reserves a stable seed and never charges twice while it awaits planting',()=>{
  const before=freeze(rewardRound(rewarded(),round('second')));
  const purchased=openSeedPack(before);
  assert.deepEqual([purchased.shells,purchased.water,purchased.seedPacksOpened],[3,10,1]);
  assert.deepEqual(purchased.pendingSeed,{id:'seed-1',flowerId:'daisy'});
  assert.equal(before.shells,6);
  assert.equal(before.pendingSeed,null);
  assert.strictEqual(openSeedPack(purchased),purchased);
  const restored=freeze(clone(purchased));
  assert.strictEqual(validateMeadow(restored),restored);
  assert.strictEqual(openSeedPack(restored),restored,'refresh cannot replace the pending seed');
  const point=freeze({x:.123456,y:.987654});
  const plantedState=plantSeed(restored,point);
  assert.deepEqual(plantedState.plants,[{id:'plant-1',seedId:'seed-1',flowerId:'daisy',waterings:0,...point}]);
  assert.equal(plantedState.pendingSeed,null);
  assert.deepEqual([plantedState.shells,plantedState.water],[3,10]);
  assert.strictEqual(plantSeed(plantedState,point),plantedState,'duplicate plant callback cannot add a second plant');
  assert.deepEqual(restored.pendingSeed,{id:'seed-1',flowerId:'daisy'});
});

test('free planting preserves exact fractional coordinates and accepts every meadow edge',()=>{
  let state=freeze(createMeadow());
  const points=[{x:0,y:0},{x:1,y:1},{x:0,y:1},{x:1,y:0},{x:.000001,y:.999999},{x:.57391,y:.48302}];
  for(const [index,point] of points.entries()) {
    state=addPlant(state,index,freeze(point));
    assert.equal(state.plants[index].x,point.x);
    assert.equal(state.plants[index].y,point.y);
    state=freeze(clone(state));
    assert.strictEqual(validateMeadow(state),state);
  }
});

test('invalid coordinates reject a planting without spending or losing its pending seed',()=>{
  const state=freeze(pending()),before=clone(state);
  const points=[undefined,null,[],{}, {x:.5}, {x:.5,y:.5,z:1},
    ...[NaN,Infinity,-Infinity,-.00001,1.00001,'0.5',null,undefined].flatMap((value)=>[{x:value,y:.5},{x:.5,y:value}])];
  for(const point of points) {
    assert.throws(()=>plantSeed(state,point),/小芽草地记录无效/);
    assert.deepEqual(state,before);
  }
});

test('ordinary flowers need five deliberate one-unit waterings and mature plants spend nothing',()=>{
  let state=freeze(planted());
  for(let pours=1;pours<=5;pours++) {
    const previous=state;
    state=waterPlant(previous,'plant-1');
    assert.equal(previous.plants[0].waterings,pours-1);
    assert.equal(state.plants[0].waterings,pours);
    assert.equal(state.water,5-pours);
    assert.equal(nextAction(state),pours<5?'water':'learn');
    state=freeze(clone(state));
  }
  assert.strictEqual(waterPlant(state,'plant-1'),state);
  const stocked=freeze(rewardRound(state,round('second')));
  assert.strictEqual(waterPlant(stocked,'plant-1'),stocked,'a full flower never consumes extra water');
  assert.throws(()=>waterPlant(stocked,'plant-missing'),/找不到植物/);
});

test('giant egg takes ten manual waterings and remains resumable after water runs out',()=>{
  let state=createMeadow();
  for(let index=1;index<=3;index++)state=addPlant(freeze(state),index);
  assert.equal(state.plants[2].flowerId,'giant-daisy');
  for(const id of ['plant-1','plant-2'])for(let i=0;i<5;i++)state=waterPlant(freeze(state),id);
  for(let i=0;i<5;i++)state=waterPlant(freeze(state),'plant-3');
  assert.equal(state.water,0);
  assert.equal(state.plants[2].waterings,5);
  assert.equal(nextAction(state),'learn');
  assert.strictEqual(waterPlant(state,'plant-3'),state);
  state=rewardRound(freeze(clone(state)),round('refill'));
  for(let i=6;i<=10;i++) {
    state=waterPlant(freeze(state),'plant-3');
    assert.equal(state.plants[2].waterings,i);
    assert.equal(state.water,10-i);
  }
  assert.strictEqual(waterPlant(state,'plant-3'),state);
  assert.equal(state.shells,3,'water replenishment does not require buying another seed');
});

test('first six packs expose a giant and three bow colors; each full twelve-pack cycle is stable',()=>{
  let state=createMeadow();
  const ids=[];
  for(let index=0;index<36;index++) {
    state=openSeedPack(rewardRound(freeze(state),round(`cycle-${index}`)));
    ids.push(state.pendingSeed.flowerId);
    assert.equal(state.pendingSeed.id,`seed-${index+1}`);
    state=freeze(clone(state));
    assert.strictEqual(openSeedPack(state),state);
    state=plantSeed(state,{x:(index%10)/10,y:.5});
  }
  assert.ok(ids.slice(0,6).some((id)=>flowerFor(id).giant));
  assert.equal(new Set(ids.slice(0,6).filter((id)=>flowerFor(id).shape==='bow')).size,3);
  assert.deepEqual(new Set(ids.slice(0,12)),new Set(FLOWERS.map((flower)=>flower.id)));
  assert.deepEqual(ids.slice(12,24),ids.slice(0,12));
  assert.deepEqual(ids.slice(24),ids.slice(0,12));
  assert.equal(state.plants[0].id,'plant-1');
  assert.equal(state.plants[35].id,'plant-36');
  assert.equal(state.shells,0);
  assert.equal(state.water,180);
  assert.deepEqual(state.bag,createMeadow().bag);
});

test('a full-looking meadow has no slot cap that can trap a paid seed or block water',()=>{
  let state=createMeadow();
  for(let index=0;index<180;index++)state=addPlant(state,index,{x:(index%18)/17,y:Math.floor(index/18)/9});
  const previous=freeze(state);
  const paid=openSeedPack(rewardRound(previous,round('beyond-visible-slots')));
  const expanded=plantSeed(freeze(paid),{x:.5,y:.5});
  assert.equal(expanded.plants.length,181);
  assert.equal(expanded.pendingSeed,null);
  assert.equal(expanded.shells,0);
  assert.equal(previous.plants.length,180);
  const watered=waterPlant(freeze(expanded),'plant-181');
  assert.equal(watered.plants[180].waterings,1);
  assert.equal(watered.water,904);
});

test('next action keeps pending seeds first, then thirsty plants, then packs and stories',()=>{
  const empty=freeze(createMeadow());
  assert.strictEqual(openSeedPack(empty),empty);
  assert.strictEqual(plantSeed(empty,{x:.5,y:.5}),empty);
  assert.equal(nextAction(empty),'learn');
  const rewardedState=rewardRound(empty,round('1'));
  assert.equal(nextAction(rewardedState),'pack');
  const seed=openSeedPack(rewardedState);
  assert.equal(nextAction(seed),'plant');
  const plant=plantSeed(seed,{x:.5,y:.5});
  const richer=rewardRound(plant,round('2'));
  assert.equal(nextAction(richer),'water');
  assert.equal(nextAction(openSeedPack(richer)),'plant');
  let bloom=richer;
  for(let i=0;i<5;i++)bloom=waterPlant(bloom,'plant-1');
  assert.equal(nextAction(bloom),'pack');
});

test('validation rejects broken ledger, forged varieties, malformed coordinates and learning evidence',()=>{
  const valid=rewardRound(planted(),round('second','play-box'));
  const mutations=[
    (s)=>{s.schemaVersion=2;},(s)=>{s.product='xiaoya-english-garden';},(s)=>{delete s.pendingSeed;},
    (s)=>{s.mastery=100;},(s)=>{s.shells++;},(s)=>{s.water++;},(s)=>{s.shells=-1;},
    (s)=>{s.water=Infinity;},(s)=>{s.seedPacksOpened=.5;},(s)=>{s.bag.reverse();},
    (s)=>{s.rounds.push({...s.rounds[0]});s.shells+=3;s.water+=5;},
    (s)=>{s.rounds[0].eventId='not-a-story';},(s)=>{s.rounds[0].date='2026-02-30';},
    (s)=>{s.rounds[0].mastered=true;},(s)=>{s.plants[0].flowerId='giant-daisy';},
    (s)=>{s.plants[0].seedId='seed-2';},(s)=>{s.plants[0].id='plant-99';},
    (s)=>{s.plants[0].waterings=6;s.water-=6;},(s)=>{s.plants[0].waterings=1;},
    (s)=>{s.plants[0].x=NaN;},(s)=>{s.plants[0].y=1.001;},(s)=>{s.plants[0].x='0.5';},
    (s)=>{s.pendingSeed={id:'seed-2',flowerId:'bow-pink'};},
  ];
  for(const mutate of mutations) {
    const state=clone(valid);mutate(state);freeze(state);
    for(const operation of [()=>validateMeadow(state),()=>rewardRound(state,round('third')),()=>openSeedPack(state),
      ()=>plantSeed(state,{x:.5,y:.5}),()=>waterPlant(state,'plant-1'),()=>nextAction(state)]) {
      assert.throws(operation,/小芽草地记录无效/);
    }
  }
  const seed=pending();
  for(const replacement of [{id:'seed-9',flowerId:'daisy'},{id:'seed-1',flowerId:'bow-pink'}]) {
    assert.throws(()=>validateMeadow({...seed,pendingSeed:replacement}),/待播种/);
  }
  for(const value of [null,[],{},new Date()])assert.throws(()=>validateMeadow(value),/小芽草地记录无效/);
});

test('reward inputs require a valid date, content event and safe stable round id',()=>{
  const state=freeze(createMeadow());
  for(const input of [null,{},round(''),round('__proto__'),round('constructor'),round('x'.repeat(161)),
    round('with space'),round('r','unknown'),round('r','food-water','2026-02-29'),round('r','food-water','2026-1-01'),
    round('r','food-water','1999-12-31'),{...round('r'),result:'independent'},{...round('r'),date:undefined}]) {
    assert.throws(()=>rewardRound(state,input),/小芽草地记录无效/);
  }
  const leap=rewardRound(state,round('leap','food-water','2028-02-29'));
  assert.equal(leap.rounds[0].date,'2028-02-29');
  assert.deepEqual(state,createMeadow());
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
      assert.doesNotMatch(svg,/<(?:image|text|foreignObject|script|rect)\b|(?:href=|NaN|Infinity|data-part="pot")/);
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
