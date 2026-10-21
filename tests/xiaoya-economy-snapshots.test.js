import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {DEFAULT_ECONOMY_SETTINGS} from '../xiaoya/economy-settings.js';
import {CHALLENGE_UNITS} from '../xiaoya/challenges.js';
import {getChallengeFlower} from '../xiaoya/challenge-flowers.js';

const clone=(value)=>JSON.parse(JSON.stringify(value));
const round=(roundId)=>({roundId,eventId:'family-love',date:'2026-10-21'});
const clear=(unit)=>({unitId:unit.id,date:'2026-10-21'});
const wallet=(state)=>[state.shells,state.water];
const asModule=(source)=>`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
let moduleSerial=0;

async function isolatedModel() {
  const settingsURL=asModule(`// isolated economy ${++moduleSerial}\n
    export const DEFAULT_ECONOMY_SETTINGS=${JSON.stringify(DEFAULT_ECONOMY_SETTINGS)};
    let current={...DEFAULT_ECONOMY_SETTINGS};
    export const getEconomySettings=()=>({...current});
    export const setSettings=(value)=>current={...DEFAULT_ECONOMY_SETTINGS,...value};`);
  let source=await readFile(new URL('../xiaoya/garden-meadow.js',import.meta.url),'utf8');
  source=source.replace("'./economy-settings.js'",JSON.stringify(settingsURL));
  for(const file of ['content','challenges','runtime','challenge-flowers'])
    source=source.replace(`'./${file}.js'`,JSON.stringify(new URL(`../xiaoya/${file}.js`,import.meta.url).href));
  return {...await import(asModule(source)),...await import(settingsURL)};
}

function historicalV4() {
  const offers=[
    {id:'offer-1',flowerId:'giant-daisy',price:8,date:'2026-10-21'},
    {id:'offer-2',flowerId:'tulip',price:3,date:'2026-10-21'},
  ];
  return {schemaVersion:4,product:'xiaoya-english-meadow',shells:16,water:25,
    rounds:[{...round('historical-first'),starter:true,reward:'starter',rewardVersion:3,amounts:{shells:2,water:3}}],
    seedPacksOpened:3,pendingSeed:null,
    plants:[
      {id:'plant-1',seedId:'seed-1',flowerId:'daisy',waterings:5,x:.15,y:.75},
      {id:'plant-2',seedId:'seed-2',flowerId:'giant-daisy',waterings:7,x:.68,y:.43},
      {id:'plant-3',seedId:'seed-3',flowerId:'bow-rainbow',waterings:2,x:.46,y:.86},
    ],
    purchases:[
      {id:'seed-1',flowerId:'daisy',source:'mystery',price:2,offerId:null},
      {id:'seed-2',flowerId:'giant-daisy',source:'shop',price:8,offerId:'offer-1'},
      {id:'seed-3',flowerId:'bow-rainbow',source:'challenge',price:0,offerId:null},
    ],legacy:null,
    shop:{date:'2026-10-21',offer:{id:'offer-2',flowerId:'tulip',price:3},
      reserved:{id:'offer-2',flowerId:'tulip',price:3},offers},
    previousRoundCount:0,
    challengeRewards:CHALLENGE_UNITS.slice(0,6).map(unit=>({id:`challenge:first-clear:${unit.id}`,...clear(unit),shells:4,water:6})),
    challengeSeeds:[
      {milestoneId:'challenge-seed-3',flowerId:'bow-rainbow',seedId:'seed-3'},
      {milestoneId:'challenge-seed-6',flowerId:'bow-starlight',seedId:null},
    ],welcomeGifts:[],
  };
}

test('saved pending and starter rewards survive settings changes; new receipts use the newly saved amounts',async()=>{
  const m=await isolatedModel();
  m.setSettings({starterShellReward:17,starterWaterReward:11,shellReward:7,waterReward:9});
  let state=m.rewardRound(m.createMeadow(),round('starter'));
  state=m.rewardRound(state,round('pending-shells'));
  state=m.rewardRound(state,round('pending-water'));
  assert.deepEqual(wallet(state),[17,11]);
  const saved=clone(state);
  m.setSettings({starterShellReward:1,starterWaterReward:1,shellReward:0,waterReward:1000});
  assert.deepEqual(m.validateMeadow(clone(saved)),saved);
  assert.deepEqual(m.roundReward(state,'starter'),{shells:17,water:11});
  state=m.claimReward(state,'pending-water','water');
  state=m.claimReward(state,'pending-shells','shells');
  assert.deepEqual(wallet(state),[24,20]);
  assert.strictEqual(m.claimReward(state,'pending-shells','shells'),state);
  state=m.rewardRound(state,round('new-water'));
  assert.deepEqual(m.roundReward(state,'new-water'),{shells:0,water:1000});
  state=m.claimReward(state,'new-water','water');
  assert.deepEqual(wallet(state),[24,1020]);
  assert.deepEqual(saved.rounds[1].reward,'pending');
});

test('mystery prices and growth snapshots cannot be repriced or rerolled when settings change',async()=>{
  const m=await isolatedModel();
  m.setSettings({starterShellReward:1000,starterWaterReward:1000,packPrice:1000,normalWaterNeeded:8,giantChance:0});
  let state=m.openSeedPack(m.rewardRound(m.createMeadow(),round('first')),0,0);
  const held=clone(state.pendingSeed);
  assert.deepEqual(wallet(state),[0,1000]);
  assert.equal(state.purchases[0].price,1000);
  m.setSettings({shellReward:1000,packPrice:1,normalWaterNeeded:4,giantWaterNeeded:13,giantScale:3.25,giantChance:1});
  assert.strictEqual(m.openSeedPack(state,.99,.99),state,'a held seed blocks repeat purchase and reroll');
  assert.deepEqual(m.validateMeadow(clone(state)).pendingSeed,held);
  state=m.plantSeed(state,{x:.4,y:.6});
  assert.equal(m.flowerForSeed(state.plants[0]).waterNeeded,8);
  for(let pour=0;pour<8;pour++) state=m.waterPlant(state,'plant-1');
  assert.strictEqual(m.waterPlant(state,'plant-1'),state);
  state=m.claimReward(m.rewardRound(state,round('refill')),'refill','shells');
  state=m.openSeedPack(state,.95,.99);
  assert.deepEqual(state.pendingSeed.growth,{giant:true,waterNeeded:13,scale:3.25});
  assert.equal(state.purchases[1].price,1);
  assert.deepEqual(wallet(state),[999,992]);
  const pending=clone(state);
  m.setSettings({giantChance:0,packPrice:999,giantScale:1,giantWaterNeeded:4});
  assert.deepEqual(m.validateMeadow(clone(pending)),pending);
  state=m.plantSeed(state,{x:.7,y:.3});
  assert.equal(m.flowerForSeed(state.plants[1]).scale,3.25);
  assert.equal(m.flowerForSeed(state.plants[0]).scale,1);
  const broken=clone(state);broken.plants[1].growth.scale=4;
  assert.throws(()=>m.validateMeadow(broken),/成长参数/);
});

test('all ten ordinary species can independently be normal or giant in mystery and shop acquisitions',async()=>{
  const m=await isolatedModel();
  for(const chance of [0,1]) {
    m.setSettings({starterShellReward:1000,giantChance:chance});
    const initial=m.rewardRound(m.createMeadow(),round(`fund-${chance}`));
    const first=m.plantSeed(m.openSeedPack(initial,0,.5),{x:.5,y:.5});
    for(const [index,flower] of m.NORMAL_FLOWERS.entries()) {
      const random=(index+.5)/m.NORMAL_FLOWERS.length;
      const mystery=m.openSeedPack(clone(first),random,.5);
      const shop=m.ensureShop(clone(initial),'2026-10-21',random);
      const bought=m.buyOffer(shop,shop.shop.offer.id,'shop',0,.5);
      for(const obtained of [mystery,bought]) {
        assert.equal(obtained.pendingSeed.flowerId,flower.id);
        assert.deepEqual(obtained.pendingSeed.growth,{giant:chance===1,waterNeeded:chance===1?10:5,scale:chance===1?2.5:1});
        assert.equal(m.flowerForSeed(obtained.pendingSeed).scale,chance===1?2.5:1);
        assert.deepEqual(m.validateMeadow(clone(obtained)),obtained);
      }
    }
  }
});

test('all 21 first clears assign distinct flowers and fix giant results before later redemption',async()=>{
  const m=await isolatedModel();
  m.setSettings({challengeShells:9,challengeWater:12,giantChance:1,giantScale:2.5});
  let state=m.createMeadow();
  for(const unit of [...CHALLENGE_UNITS].reverse()) state=m.rewardChallenge(state,clear(unit),.99);
  assert.deepEqual(wallet(state),[21*9,21*12]);
  assert.equal(new Set(state.challengeSeeds.map(seed=>seed.flowerId)).size,21);
  assert.equal(state.challengeSeeds.length,21);
  assert.equal(state.legacyChallengeCount,0);
  for(const seed of state.challengeSeeds) {
    assert.equal(seed.flowerId,getChallengeFlower(seed.unitId).id);
    assert.deepEqual(seed.growth,{giant:true,waterNeeded:10,scale:2.5});
  }
  const before=clone(state);
  m.setSettings({challengeShells:1000,challengeWater:1000,giantChance:0,giantScale:1,giantWaterNeeded:4});
  for(const unit of CHALLENGE_UNITS) assert.strictEqual(m.rewardChallenge(state,clear(unit),0),state);
  for(let index=0;index<21;index++) {
    state=m.redeemChallengeSeed(state);
    assert.deepEqual(state.pendingSeed.growth,before.challengeSeeds[index].growth);
    assert.strictEqual(m.redeemChallengeSeed(state),state,'held prize cannot be overwritten');
    state=m.plantSeed(state,{x:.5,y:.5});
  }
  assert.deepEqual(wallet(state),wallet(before));
  assert.equal(m.pendingChallengeSeeds(state).length,0);
  assert.equal(state.plants.length,21);
  assert.strictEqual(m.redeemChallengeSeed(state),state);
  assert.deepEqual(m.validateMeadow(clone(state)),state);
});

test('v4 migration backfills six flowers once while preserving old milestone gifts, giant size, prices and water',async()=>{
  const m=await isolatedModel();
  const old=historicalV4();
  const untouched=clone(old);
  m.setSettings({packPrice:999,giantChance:1,normalWaterNeeded:42,giantWaterNeeded:50,giantScale:4});
  let state=m.validateMeadow(old);
  for(const key of ['shells','water','rounds','plants','purchases','pendingSeed','shop','welcomeGifts','challengeRewards'])
    assert.deepEqual(state[key],old[key],key);
  assert.deepEqual(state.challengeSeeds.slice(0,2),old.challengeSeeds);
  assert.equal(state.challengeSeeds.length,8);
  assert.equal(state.legacyChallengeCount,6);
  assert.equal(state.seedSnapshotStart,3);
  assert.equal(state.economyStartRound,1);
  assert.deepEqual(m.flowerForSeed(state.plants[1]),m.FLOWERS.find(f=>f.id==='giant-daisy'));
  assert.equal(m.flowerForSeed(state.plants[1]).scale,1.75);
  assert.equal(m.flowerForSeed(state.plants[1]).waterNeeded,10);
  const stableEntitlements=clone(state.challengeSeeds);
  m.setSettings({giantChance:0});
  assert.deepEqual(m.validateMeadow(old).challengeSeeds,stableEntitlements,'even an unsaved migration has deterministic historical seeds');
  assert.strictEqual(m.validateMeadow(state),state);
  assert.deepEqual(m.rewardChallenge(old,clear(CHALLENGE_UNITS[0]),0),state,'replaying an old receipt returns migrated state to persist backfill');
  state=m.redeemChallengeSeed(state);
  assert.equal(state.pendingSeed.flowerId,'bow-starlight');
  assert.deepEqual(state.pendingSeed.growth,{giant:false,waterNeeded:5,scale:1});
  state=m.plantSeed(state,{x:.9,y:.9});
  const before=wallet(state);
  state=m.rewardChallenge(state,clear(CHALLENGE_UNITS[6]),.99);
  assert.deepEqual(wallet(state),[before[0]+4,before[1]+6]);
  assert.equal(state.challengeSeeds.length,9,'new clears add one flower and do not add or reissue old milestones');
  assert.equal(state.legacyChallengeCount,6);
  assert.deepEqual(old,untouched,'migration never mutates the historical source');
});

test('old pending seed and historic pending milestone stay in order throughout backfill',async()=>{
  const m=await isolatedModel();
  const old=historicalV4();
  old.pendingSeed={id:'seed-3',flowerId:'bow-rainbow'};
  old.plants.pop();old.water+=2;
  let state=m.validateMeadow(old);
  assert.deepEqual(state.pendingSeed,old.pendingSeed);
  assert.strictEqual(m.redeemChallengeSeed(state),state);
  assert.strictEqual(m.openSeedPack(state,0,0),state);
  assert.strictEqual(m.buyOffer(state,state.shop.offer.id,'shop',0,0),state);
  state=m.plantSeed(state,{x:.25,y:.25});
  assert.equal(m.flowerForSeed(state.plants.at(-1)).waterNeeded,5);
  state=m.redeemChallengeSeed(state);
  assert.equal(state.pendingSeed.flowerId,'bow-starlight');
  state=m.plantSeed(state,{x:.4,y:.4});
  state=m.redeemChallengeSeed(state);
  assert.equal(state.pendingSeed.flowerId,getChallengeFlower(CHALLENGE_UNITS[0].id).id);
  assert.deepEqual(wallet(state),wallet(old));
});
