import test from 'node:test';
import assert from 'node:assert/strict';
import {
  FLOWERS,SPECIAL_FLOWERS,ALL_FLOWERS,CHALLENGE_ECONOMY,CHALLENGE_MILESTONES,
  createMeadow,validateMeadow,rewardRound,roundReward,claimReward,
  rewardChallenge,pendingChallengeSeeds,redeemChallengeSeed,
  openSeedPack,plantSeed,waterPlant,ensureShop,nextAction,
} from '../xiaoya/garden-meadow.js';
import {CHALLENGE_UNITS} from '../xiaoya/challenges.js';

const clone=(value)=>JSON.parse(JSON.stringify(value));
const freeze=(value)=>{
  if(value && typeof value==='object') {Object.values(value).forEach(freeze);Object.freeze(value);}
  return value;
};
const round=(id)=>({roundId:id,eventId:'family-love',date:'2026-10-19'});
const clear=(state,index)=>rewardChallenge(state,{unitId:CHALLENGE_UNITS[index].id,date:'2026-10-19'});

function previousSave() {
  const receipt=(id,reward,starter=false)=>({...round(id),starter,reward});
  const offer={id:'offer-1',flowerId:'bow-pink',price:6};
  return {schemaVersion:2,product:'xiaoya-english-meadow',shells:0,water:8,
    rounds:[receipt('old-starter','starter',true),receipt('old-shells','shells'),receipt('old-water','water'),receipt('old-pending','pending')],
    seedPacksOpened:2,pendingSeed:{id:'seed-2',flowerId:'bow-blue'},
    plants:[{id:'plant-1',seedId:'seed-1',flowerId:'daisy',waterings:2,x:.19,y:.87}],
    purchases:[{id:'seed-1',flowerId:'daisy',source:'mystery',price:2,offerId:null},
      {id:'seed-2',flowerId:'bow-blue',source:'mystery',price:2,offerId:null}],
    legacy:null,shop:{date:'2026-10-19',offer:{...offer},reserved:{...offer},offers:[{...offer,date:'2026-10-19'}]}};
}

test('v2 migration preserves the exact wallet, positions, reservation and pending five-water entitlement',()=>{
  const source=freeze(previousSave());
  const migrated=validateMeadow(source);
  assert.equal(migrated.schemaVersion,3);
  for(const key of ['shells','water','seedPacksOpened','pendingSeed','plants','purchases','legacy','shop'])
    assert.deepEqual(migrated[key],source[key],key);
  assert.equal(migrated.previousRoundCount,4);
  assert.ok(migrated.rounds.every((entry)=>entry.rewardVersion===2));
  assert.deepEqual(roundReward(migrated,'old-pending'),{shells:2,water:5});
  assert.deepEqual(roundReward(migrated,'old-starter'),{shells:2,water:5});
  assert.deepEqual(source,previousSave());
  assert.strictEqual(validateMeadow(migrated),migrated,'already migrated value is reused');
  const restored=freeze(clone(migrated));
  let claimed=claimReward(restored,'old-pending','water');
  assert.deepEqual([claimed.shells,claimed.water],[0,13]);
  assert.strictEqual(claimReward(claimed,'old-pending','water'),claimed);
  claimed=rewardRound(claimed,round('new-reward'));
  assert.deepEqual(roundReward(claimed,'new-reward'),{shells:2,water:2});
  claimed=claimReward(claimed,'new-reward','water');
  assert.equal(claimed.water,15);
  assert.equal(roundReward(claimed,'missing'),null);
  const detached=roundReward(claimed,'old-pending');detached.water=999;
  assert.equal(roundReward(claimed,'old-pending').water,5);
});

test('v2 validation runs before migration and new reward amounts cannot rewrite old pending gifts',()=>{
  for(const mutate of [
    (s)=>s.water++, (s)=>s.shells++, (s)=>s.rounds[0].reward='water',
    (s)=>s.rounds[3].amounts={shells:2,water:999}, (s)=>s.shop.reserved.price=0,
    (s)=>s.purchases[1].flowerId='bow-rainbow', (s)=>s.unknown=true,
  ]) {
    const invalid=previousSave();mutate(invalid);
    assert.throws(()=>validateMeadow(freeze(invalid)),/小芽草地记录无效/);
  }
  const current=rewardRound(validateMeadow(previousSave()),round('fresh'));
  for(const mutate of [
    (s)=>s.rounds[3].amounts.water=2,
    (s)=>s.rounds[3].rewardVersion=3,
    (s)=>s.rounds[4].amounts.water=5,
    (s)=>s.rounds[4].amounts.extra=1,
    (s)=>s.previousRoundCount=-1,
    (s)=>s.previousRoundCount=6,
    (s)=>s.challengeSeeds=[{milestoneId:'challenge-seed-3',flowerId:'bow-rainbow',seedId:null}],
  ]) {
    const invalid=clone(current);mutate(invalid);
    assert.throws(()=>validateMeadow(freeze(invalid)),/小芽草地记录无效/);
  }
});

test('empty v2 saves use the new starter, then one more water reward completes the first flower',()=>{
  const old={...previousSave(),shells:0,water:0,rounds:[],seedPacksOpened:0,pendingSeed:null,plants:[],purchases:[],
    shop:{date:null,offer:null,reserved:null,offers:[]}};
  let state=rewardRound(freeze(old),round('first'));
  assert.deepEqual(roundReward(state,'first'),{shells:2,water:3});
  state=plantSeed(openSeedPack(state,0),{x:.5,y:.5});
  for(let i=0;i<3;i++)state=waterPlant(state,'plant-1');
  assert.equal(state.plants[0].waterings,3);assert.equal(state.water,0);
  assert.strictEqual(waterPlant(state,'plant-1'),state);
  state=claimReward(rewardRound(state,round('second')),'second','water');
  for(let i=0;i<2;i++)state=waterPlant(state,'plant-1');
  assert.equal(state.plants[0].waterings,5);assert.equal(state.water,0);
});

test('each different unit first clear pays both resources exactly once, including after reload or a new day',()=>{
  let state=freeze(createMeadow());
  assert.deepEqual(CHALLENGE_ECONOMY,{shells:4,water:6});
  for(const [index,unit] of CHALLENGE_UNITS.entries()) {
    const before=state;
    state=clear(state,index);
    assert.equal(before.challengeRewards.length,index);
    assert.deepEqual([state.shells,state.water],[(index+1)*4,(index+1)*6]);
    assert.equal(state.rounds.length,0,'challenge currency never creates pretend learning rounds');
    assert.deepEqual(state.challengeRewards[index],{id:`challenge:first-clear:${unit.id}`,unitId:unit.id,date:'2026-10-19',shells:4,water:6});
    state=freeze(clone(state));
    assert.strictEqual(rewardChallenge(state,{unitId:unit.id,date:'2026-10-20'}),state);
    assert.strictEqual(clear(state,index),state);
  }
  assert.equal(state.challengeSeeds.length,2);
  for(const [index] of CHALLENGE_UNITS.entries())assert.strictEqual(clear(state,index),state);
});

test('third and sixth different first clears save named seed entitlements until there is room to plant',()=>{
  let state=openSeedPack(rewardRound(createMeadow(),round('starter')),0);
  const original=clone(state.pendingSeed);
  for(let i=0;i<6;i++) {
    state=clear(freeze(state),i);
    assert.deepEqual(state.pendingSeed,original,'a challenge never overwrites the seed already held');
    assert.equal(pendingChallengeSeeds(state).length,i<2?0:i<5?1:2);
    assert.strictEqual(redeemChallengeSeed(state),state);
  }
  state=plantSeed(freeze(clone(state)),{x:.1,y:.4});
  assert.equal(nextAction(state),'challenge-seed');
  const wallet=[state.shells,state.water];
  state=redeemChallengeSeed(state);
  assert.deepEqual(state.pendingSeed,{id:'seed-2',flowerId:'bow-rainbow'});
  assert.deepEqual([state.shells,state.water],wallet);
  assert.equal(pendingChallengeSeeds(state).length,1);
  assert.strictEqual(redeemChallengeSeed(state),state,'a second tap cannot consume the second entitlement');
  state=plantSeed(state,{x:.7,y:.4});
  state=redeemChallengeSeed(freeze(clone(state)));
  assert.deepEqual(state.pendingSeed,{id:'seed-3',flowerId:'bow-starlight'});
  state=plantSeed(state,{x:.3,y:.6});
  assert.deepEqual(pendingChallengeSeeds(state),[]);
  assert.strictEqual(redeemChallengeSeed(state),state);
  assert.deepEqual(state.purchases.slice(1).map((entry)=>[entry.source,entry.price]),[['challenge',0],['challenge',0]]);
  assert.deepEqual(state.challengeSeeds.map((entry)=>entry.seedId),['seed-2','seed-3']);
  for(const id of ['plant-2','plant-3']) {
    for(let i=0;i<5;i++)state=waterPlant(state,id);
    assert.strictEqual(waterPlant(state,id),state);
  }
  assert.equal(state.water,wallet[1]-10);
  assert.deepEqual(state.plants.map(({x,y})=>({x,y})),[{x:.1,y:.4},{x:.7,y:.4},{x:.3,y:.6}]);
});

test('milestones depend on distinct units, not unit order, replay count or abandoned challenge entries',()=>{
  let state=createMeadow();
  for(const index of [5,2])state=clear(state,index);
  for(let n=0;n<12;n++)state=clear(state,5);
  assert.deepEqual(pendingChallengeSeeds(state),[]);
  state=clear(state,0);
  assert.deepEqual(pendingChallengeSeeds(state),[{milestoneId:'challenge-seed-3',flowerId:'bow-rainbow',seedId:null}]);
  const detached=pendingChallengeSeeds(state);detached[0].seedId='seed-99';
  assert.equal(pendingChallengeSeeds(state)[0].seedId,null);
  state=redeemChallengeSeed(state);
  assert.equal(state.pendingSeed.flowerId,'bow-rainbow');
  assert.deepEqual(CHALLENGE_MILESTONES.map((item)=>item.clears),[3,6]);
});

test('exclusive flowers stay out of all shop and mystery outcomes while ordinary prices remain unchanged',()=>{
  assert.equal(FLOWERS.length,12);assert.equal(ALL_FLOWERS.length,14);
  assert.deepEqual(SPECIAL_FLOWERS.map((flower)=>flower.id),['bow-rainbow','bow-starlight']);
  assert.ok(SPECIAL_FLOWERS.every((flower)=>Object.isFrozen(flower) && flower.waterNeeded===5));
  let funded=clear(createMeadow(),0);
  funded=plantSeed(openSeedPack(funded,0),{x:.2,y:.2});
  for(const [index,flower] of FLOWERS.entries()) {
    const random=(index+.5)/FLOWERS.length;
    assert.equal(openSeedPack(funded,random).pendingSeed.flowerId,flower.id);
    const shown=ensureShop(funded,'2026-10-19',random);
    assert.equal(shown.shop.offer.flowerId,flower.id);
    assert.equal(shown.shop.offer.price,flower.giant?8:flower.shape==='bow'?6:3);
  }
  assert.ok(!FLOWERS.some((flower)=>flower.special));
});

test('malformed or duplicate challenge receipts and seed entitlements cannot mint currency or plants',()=>{
  let valid=createMeadow();for(let i=0;i<6;i++)valid=clear(valid,i);
  valid=plantSeed(redeemChallengeSeed(valid),{x:.3,y:.4});
  valid=redeemChallengeSeed(valid);
  const mutations=[
    (s)=>s.challengeRewards[0].shells=5,
    (s)=>s.challengeRewards[0].water=7,
    (s)=>s.challengeRewards[0].id='other-receipt',
    (s)=>s.challengeRewards[0].unitId='unknown',
    (s)=>s.challengeRewards[0].date='2026-02-30',
    (s)=>s.challengeRewards[0].mastered=true,
    (s)=>{s.challengeRewards.push({...s.challengeRewards[0]});s.shells+=4;s.water+=6;},
    (s)=>s.challengeSeeds.pop(),
    (s)=>s.challengeSeeds.reverse(),
    (s)=>s.challengeSeeds[0].flowerId='daisy',
    (s)=>s.challengeSeeds[0].seedId=null,
    (s)=>s.challengeSeeds[0].seedId='seed-999',
    (s)=>s.challengeSeeds[1].seedId=s.challengeSeeds[0].seedId,
    (s)=>s.challengeSeeds[0].claimed=true,
    (s)=>{s.purchases[0].price=2;s.shells-=2;},
    (s)=>s.purchases[0].source='mystery',
    (s)=>s.purchases[0].offerId='offer-1',
    (s)=>s.pendingSeed.flowerId='bow-rainbow',
  ];
  for(const mutate of mutations) {
    const invalid=clone(valid);mutate(invalid);freeze(invalid);
    for(const operation of [()=>validateMeadow(invalid),()=>clear(invalid,0),()=>redeemChallengeSeed(invalid),()=>pendingChallengeSeeds(invalid)])
      assert.throws(operation,/小芽草地记录无效/);
  }
  for(const input of [null,{}, {unitId:'unknown',date:'2026-10-19'},
    {unitId:CHALLENGE_UNITS[0].id,date:'2026-02-30'},
    {unitId:CHALLENGE_UNITS[0].id,date:'2026-10-19',shells:100}])
    assert.throws(()=>rewardChallenge(createMeadow(),input),/小芽草地记录无效/);
});
