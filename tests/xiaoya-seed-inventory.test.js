import test from 'node:test';
import assert from 'node:assert/strict';
import {createMeadow,validateMeadow,rewardRound,claimReward,openSeedPack,ensureShop,buyOffer,
  rewardChallenge,pendingChallengeSeeds,redeemChallengeSeed,ownedSeeds,selectSeed,plantSeed,nextAction}
  from '../xiaoya/garden-meadow.js';
import {CHALLENGE_UNITS} from '../xiaoya/challenges.js';

const clone=(value)=>JSON.parse(JSON.stringify(value));
const round=(roundId)=>({roundId,eventId:'family-love',date:'2026-10-22'});
function funded() {
  let state=createMeadow();
  for(let i=0;i<12;i++) {
    state=rewardRound(state,round(`inventory-${i}`));
    state=claimReward(state,`inventory-${i}`,'shells');
  }
  return state;
}

test('purchases accumulate, selection is free, and arbitrary planting consumes exactly the selected seed',()=>{
  let state=openSeedPack(funded(),0,.99);
  state=ensureShop(state,'2026-10-22',.5);
  state=buyOffer(state,state.shop.offer.id,'shop',.7,0);
  state=openSeedPack(state,.8,.99);
  const saved=clone(state),wallet=[state.shells,state.water];
  assert.deepEqual(ownedSeeds(state).map(seed=>seed.id),['seed-1','seed-2','seed-3']);
  assert.equal(state.pendingSeed.id,'seed-3');
  const detached=ownedSeeds(state);
  detached[0].flowerId='missing';detached[1].growth.scale=99;
  assert.deepEqual(state,saved,'inventory objects cannot modify the purchase ledger');
  for(const number of [2,1,3]) {
    state=selectSeed(state,`seed-${number}`);
    assert.deepEqual([state.shells,state.water],wallet);
    const before=state,seed=clone(state.pendingSeed);
    state=plantSeed(state,{x:.2+number*.1,y:.6});
    assert.equal(state.pendingSeed,null);
    assert.deepEqual(state.plants.at(-1),{id:`plant-${number}`,seedId:seed.id,flowerId:seed.flowerId,
      growth:seed.growth,waterings:0,x:.2+number*.1,y:.6});
    assert.equal(selectSeed(state,seed.id),state,'planted seeds cannot be selected again');
    assert.equal(plantSeed(state,{x:.5,y:.5}),state,'no selection cannot duplicate a plant');
    assert.equal(before.plants.length,state.plants.length-1,'planting is immutable');
    if(number!==3)assert.equal(nextAction(state),'seeds');
  }
  assert.deepEqual(state.plants.map(plant=>plant.id),['plant-2','plant-1','plant-3']);
  assert.deepEqual(ownedSeeds(state),[]);
  assert.equal(selectSeed(state,'missing'),state);
  assert.deepEqual(validateMeadow(clone(state)),state);
});

test('a specific earned challenge seed is redeemable alongside owned seeds without minting duplicates',()=>{
  let state=openSeedPack(funded(),0,.99);
  for(const [index,unit] of CHALLENGE_UNITS.slice(0,3).entries())
    state=rewardChallenge(state,{unitId:unit.id,date:'2026-10-22'},index===1?0:.99);
  const gifts=pendingChallengeSeeds(state),wallet=[state.shells,state.water];
  assert.equal(ownedSeeds(state).length,1,'earned but unredeemed gifts are not fabricated purchases');
  for(const index of [2,0,1]) {
    const gift=gifts[index];
    state=redeemChallengeSeed(state,gift.milestoneId);
    assert.equal(state.pendingSeed.flowerId,gift.flowerId);
    assert.deepEqual(state.pendingSeed.growth,gift.growth);
    assert.deepEqual([state.shells,state.water],wallet);
    assert.equal(redeemChallengeSeed(state,gift.milestoneId),state);
  }
  assert.equal(ownedSeeds(state).length,4);
  assert.equal(pendingChallengeSeeds(state).length,0);
  assert.equal(redeemChallengeSeed(state,'missing'),state);
  assert.equal(redeemChallengeSeed(state),state);
  state=selectSeed(state,'seed-1');
  assert.equal(state.pendingSeed.flowerId,'daisy');
});

test('v5 validates its original ledger before an immutable v6 migration',()=>{
  let state=openSeedPack(funded(),0,.99);
  state=plantSeed(state,{x:.3,y:.7});
  state=openSeedPack(state,.4,0);
  const previous={...clone(state),schemaVersion:5},snapshot=clone(previous);
  const migrated=validateMeadow(previous);
  assert.equal(migrated.schemaVersion,6);
  assert.deepEqual({...migrated,schemaVersion:5},snapshot);
  assert.deepEqual(previous,snapshot);
  assert.deepEqual(ownedSeeds(migrated),[snapshot.pendingSeed]);
  const multiple=openSeedPack(state,.6,.99);
  assert.doesNotThrow(()=>validateMeadow(multiple));
  assert.throws(()=>validateMeadow({...clone(multiple),schemaVersion:5}),/小芽草地记录无效/,
    'a purported old single-seed save must not bypass its original count checks');
  let reordered=plantSeed(multiple,{x:.6,y:.5});
  reordered=plantSeed(selectSeed(reordered,'seed-2'),{x:.4,y:.8});
  assert.doesNotThrow(()=>validateMeadow(reordered));
  assert.throws(()=>validateMeadow({...clone(reordered),schemaVersion:5}),/小芽草地记录无效/,
    'old sequential planting checks still apply before migration');
});

test('legacy unplanted seeds can be planted after new seeds without changing historical plants or snapshot boundaries',()=>{
  const oldCycle=['daisy','bow-pink','giant-daisy','bow-blue','tulip','bow-yellow','sunflower','bow-purple','bellflower','giant-sunflower','poppy','violet'];
  const old={schemaVersion:1,product:'xiaoya-english-meadow',shells:3,water:11,
    rounds:[round('old-1'),round('old-2'),round('old-3')],seedPacksOpened:2,
    bag:oldCycle.slice(2),pendingSeed:{id:'seed-2',flowerId:'bow-pink'},
    plants:[{id:'plant-1',seedId:'seed-1',flowerId:'daisy',waterings:4,x:.173829,y:.981927}]};
  const original=clone(old);
  let state=validateMeadow(old);
  state=openSeedPack(state,.5,0);
  state=plantSeed(state,{x:.6,y:.6});
  state=plantSeed(selectSeed(state,'seed-2'),{x:.4,y:.4});
  assert.equal(state.seedSnapshotStart,2);
  assert.deepEqual(state.plants.map(plant=>plant.id),['plant-1','plant-3','plant-2']);
  assert.deepEqual(state.plants[0],original.plants[0]);
  assert.equal(state.plants[1].growth.giant,true);
  assert.equal('growth' in state.plants[2],false);
  assert.deepEqual(old,original);
  const missing=clone(state);missing.plants.shift();missing.water+=4;
  assert.throws(()=>validateMeadow(missing),/旧植物不能丢失/);
  const moved=clone(state);moved.plants[0].x=.5;
  assert.throws(()=>validateMeadow(moved),/旧植物记录被改写/);
});

test('multi-seed inventory does not weaken balance, identity, duplicate planting, or growth validation',()=>{
  let state=openSeedPack(funded(),0,.99);
  state=openSeedPack(state,.3,0);
  state=openSeedPack(state,.7,.99);
  state=plantSeed(selectSeed(state,'seed-2'),{x:.5,y:.6});
  state=selectSeed(state,'seed-1');
  const mutations=[
    value=>value.shells++,value=>value.water++,
    value=>value.purchases.pop(),value=>value.seedPacksOpened++,
    value=>value.plants.push(clone(value.plants[0])),
    value=>value.plants[0].id='plant-1',
    value=>value.plants[0].seedId='seed-999',
    value=>value.plants[0].growth.scale+=.1,
    value=>value.pendingSeed.growth.waterNeeded++,
    value=>value.pendingSeed={id:'seed-2',flowerId:value.purchases[1].flowerId,growth:clone(value.purchases[1].growth)},
    value=>value.pendingSeed.id='seed-999',
    value=>value.purchases[1].price=0,
  ];
  for(const mutate of mutations) {
    const bad=clone(state);mutate(bad);
    for(const operation of [()=>validateMeadow(bad),()=>ownedSeeds(bad),()=>selectSeed(bad,'seed-3'),
      ()=>plantSeed(bad,{x:.5,y:.6}),()=>openSeedPack(bad,.5,.99)])
      assert.throws(operation,/小芽草地记录无效/);
  }
});
