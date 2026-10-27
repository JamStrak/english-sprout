import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createMeadow,validateMeadow,welcomeGift,claimWelcomeGift,
  rewardRound,roundReward,claimReward,rewardChallenge,redeemChallengeSeed,
  openSeedPack,plantSeed,waterPlant,ensureShop,reserveOffer,
} from '../xiaoya/garden-meadow.js';
import {CHALLENGE_UNITS} from '../xiaoya/challenges.js';

const clone=(value)=>JSON.parse(JSON.stringify(value));
const freeze=(value)=>{
  if(value && typeof value==='object') {Object.values(value).forEach(freeze);Object.freeze(value);}
  return value;
};
const round=(roundId)=>({roundId,eventId:'family-love',date:'2026-10-21'});
const wallet=(state)=>[state.shells,state.water];

function legacySave() {
  return {schemaVersion:1,product:'xiaoya-english-meadow',shells:3,water:8,
    rounds:[round('legacy-1'),round('legacy-2')],seedPacksOpened:1,
    bag:['bow-pink','giant-daisy','bow-blue','tulip','bow-yellow','sunflower','bow-purple','bellflower','giant-sunflower','poppy','violet'],
    pendingSeed:null,plants:[{id:'plant-1',seedId:'seed-1',flowerId:'daisy',waterings:2,x:.24,y:.68}]};
}

function versionTwoSave() {
  const offer={id:'offer-1',flowerId:'bow-blue',price:6};
  return {schemaVersion:2,product:'xiaoya-english-meadow',shells:0,water:3,
    rounds:[{...round('v2-first'),starter:true,reward:'starter'},
      {...round('v2-pending'),starter:false,reward:'pending'}],
    seedPacksOpened:1,pendingSeed:null,
    plants:[{id:'plant-1',seedId:'seed-1',flowerId:'daisy',waterings:2,x:.45,y:.76}],
    purchases:[{id:'seed-1',flowerId:'daisy',source:'mystery',price:2,offerId:null}],
    legacy:null,shop:{date:'2026-10-21',offer:{...offer},reserved:{...offer},offers:[{...offer,date:'2026-10-21'}]}};
}

function versionThreeSave() {
  const base=versionTwoSave();
  return {...base,schemaVersion:3,shells:12,water:25,previousRoundCount:2,
    rounds:[
      {...base.rounds[0],rewardVersion:2,amounts:{shells:2,water:5}},
      {...base.rounds[1],reward:'water',rewardVersion:2,amounts:{shells:2,water:5}},
      {...round('v3-pending'),starter:false,reward:'pending',rewardVersion:3,amounts:{shells:2,water:2}},
    ],
    challengeRewards:CHALLENGE_UNITS.slice(0,3).map(unit=>({
      id:`challenge:first-clear:${unit.id}`,unitId:unit.id,date:'2026-10-21',shells:4,water:6,
    })),
    challengeSeeds:[{milestoneId:'challenge-seed-3',flowerId:'bow-rainbow',seedId:'seed-2'}],
    seedPacksOpened:2,pendingSeed:null,
    purchases:[...base.purchases,{id:'seed-2',flowerId:'bow-rainbow',source:'challenge',price:0,offerId:null}],
    plants:[...base.plants,{id:'plant-2',seedId:'seed-2',flowerId:'bow-rainbow',waterings:1,x:.72,y:.38}],
  };
}

test('the welcome preview is one small stable gift and creates no reward or learning record',()=>{
  const state=freeze(createMeadow());
  assert.equal(state.schemaVersion,6);
  assert.deepEqual(state.welcomeGifts,[]);
  const expected={date:'2026-10-21',kind:'shells',amount:1};
  assert.deepEqual(welcomeGift(state,'2026-10-21'),expected);
  assert.deepEqual(welcomeGift(clone(state),'2026-10-21'),expected);
  const detached=welcomeGift(state,'2026-10-21');detached.kind='water';detached.amount=100;
  assert.deepEqual(welcomeGift(state,'2026-10-21'),expected);
  assert.deepEqual(wallet(state),[0,0]);
  assert.deepEqual(state,createMeadow());
  const other=createMeadow();other.welcomeGifts.push({});
  assert.deepEqual(createMeadow().welcomeGifts,[],'new profiles have independent gift ledgers');
});

test('a gift can be claimed once per local day, including reload and serialized repeated clicks',()=>{
  const original=freeze(createMeadow());
  const claimed=claimWelcomeGift(original,'2026-10-21');
  assert.deepEqual(wallet(claimed),[1,0]);
  assert.deepEqual(claimed.welcomeGifts,[{date:'2026-10-21',kind:'shells'}]);
  assert.equal(welcomeGift(claimed,'2026-10-21'),null);
  assert.strictEqual(claimWelcomeGift(claimed,'2026-10-21'),claimed);
  const restored=freeze(clone(claimed));
  for(let tap=0;tap<20;tap++) assert.strictEqual(claimWelcomeGift(restored,'2026-10-21'),restored);
  assert.deepEqual(wallet(original),[0,0]);
  assert.deepEqual(original.welcomeGifts,[]);
  for(const key of ['rounds','challengeRewards','challengeSeeds','purchases','plants']) assert.deepEqual(claimed[key],[]);
  assert.equal('evidence' in claimed,false);assert.equal('mastery' in claimed,false);
});

test('claimed kinds alternate across visits, missed days add no debt or catch-up bonus',()=>{
  const dates=['2026-10-21','2026-10-22','2026-10-30','2026-12-25','2028-02-29','2029-01-01'];
  let state=freeze(createMeadow());
  for(const [index,date] of dates.entries()) {
    const kind=index%2===0?'shells':'water';
    assert.deepEqual(welcomeGift(state,date),{date,kind,amount:1});
    state=claimWelcomeGift(state,date);
    assert.deepEqual(wallet(state),[Math.ceil((index+1)/2),Math.floor((index+1)/2)]);
    state=freeze(clone(state));
  }
  assert.equal(state.welcomeGifts.length,dates.length);
  assert.deepEqual(state.welcomeGifts.map(({date})=>date),dates);
  assert.equal(state.rounds.length,0);
});

test('moving the clock back or reopening an older day cannot issue another welcome gift',()=>{
  const state=freeze(claimWelcomeGift(claimWelcomeGift(createMeadow(),'2026-10-21'),'2026-10-24'));
  for(const date of ['2000-01-01','2026-10-20','2026-10-21','2026-10-22','2026-10-23','2026-10-24']) {
    assert.equal(welcomeGift(state,date),null);
    assert.strictEqual(claimWelcomeGift(state,date),state);
  }
  assert.deepEqual(welcomeGift(state,'2026-10-25'),{date:'2026-10-25',kind:'shells',amount:1});
});

test('welcome gifts preserve the real starter reward and do not claim a pending practice reward',()=>{
  let state=claimWelcomeGift(createMeadow(),'2026-10-21');
  state=claimWelcomeGift(state,'2026-10-22');
  state=rewardRound(state,round('first-practice'));
  assert.deepEqual(wallet(state),[3,4]);
  assert.equal(state.rounds.length,1);
  assert.equal(state.rounds[0].starter,true);
  assert.deepEqual(roundReward(state,'first-practice'),{shells:2,water:3});
  state=rewardRound(state,round('next-practice'));
  const before=clone(state.rounds);
  state=claimWelcomeGift(state,'2026-10-23');
  assert.deepEqual(state.rounds,before);
  assert.equal(state.rounds[1].reward,'pending');
  assert.deepEqual(wallet(state),[4,4]);
  state=claimReward(state,'next-practice','water');
  assert.deepEqual(wallet(state),[4,6]);
  assert.deepEqual(roundReward(state,'next-practice'),{shells:2,water:2});
});

test('welcome shells and water reconcile with normal seed purchases and watering',()=>{
  let state=createMeadow();
  for(const date of ['2026-10-21','2026-10-22','2026-10-23']) state=claimWelcomeGift(state,date);
  assert.deepEqual(wallet(state),[2,1]);
  state=plantSeed(openSeedPack(state,0),{x:.23,y:.71});
  assert.deepEqual(wallet(state),[0,1]);
  assert.equal(state.plants[0].flowerId,'daisy');
  state=waterPlant(state,'plant-1');
  assert.deepEqual(wallet(state),[0,0]);
  assert.equal(state.plants[0].waterings,1);
  assert.equal(state.rounds.length,0);
  assert.strictEqual(validateMeadow(state),state);
  state=rewardRound(state,round('first-practice-after-gifts'));
  assert.deepEqual(wallet(state),[2,3]);
  assert.equal(state.rounds[0].starter,true);
});

test('v1 migration preserves the validated old wallet, plants and reward history before adding welcome gifts',()=>{
  const source=freeze(legacySave());
  const migrated=validateMeadow(source);
  assert.equal(migrated.schemaVersion,6);
  assert.deepEqual(migrated.welcomeGifts,[]);
  for(const key of ['shells','water','plants','pendingSeed','seedPacksOpened']) assert.deepEqual(migrated[key],source[key],key);
  assert.deepEqual(migrated.legacy,source);
  assert.deepEqual(migrated.rounds.map(({roundId,eventId,date})=>({roundId,eventId,date})),source.rounds);
  const claimed=claimWelcomeGift(source,'2026-10-22');
  assert.deepEqual(wallet(claimed),[4,8]);
  assert.deepEqual(source,legacySave());
  const practiced=rewardRound(claimed,round('after-migration'));
  assert.equal(practiced.rounds.at(-1).starter,false);
  assert.deepEqual(wallet(practiced),[4,8]);
});

test('v2 migration preserves five-water pending gifts, shop reservations and plant positions',()=>{
  const source=freeze(versionTwoSave());
  const migrated=validateMeadow(source);
  assert.equal(migrated.schemaVersion,6);
  assert.deepEqual(migrated.welcomeGifts,[]);
  for(const key of ['shells','water','plants','pendingSeed','seedPacksOpened','purchases','shop','legacy'])
    assert.deepEqual(migrated[key],source[key],key);
  const claimed=claimWelcomeGift(source,'2026-10-22');
  assert.deepEqual(wallet(claimed),[1,3]);
  assert.deepEqual(roundReward(claimed,'v2-pending'),{shells:2,water:5});
  assert.deepEqual(wallet(claimReward(claimed,'v2-pending','water')),[1,8]);
  assert.deepEqual(source,versionTwoSave());
});

test('v3 migration preserves challenge seeds, old reward versions and every existing field without aliases',()=>{
  const source=freeze(versionThreeSave());
  const migrated=validateMeadow(source);
  assert.equal(migrated.schemaVersion,6);
  assert.deepEqual(migrated.welcomeGifts,[]);
  for(const key of Object.keys(source).filter((key)=>!['schemaVersion','challengeSeeds'].includes(key))) assert.deepEqual(migrated[key],source[key],key);
  assert.strictEqual(validateMeadow(migrated),migrated);
  assert.notStrictEqual(migrated.plants,source.plants);
  assert.notStrictEqual(migrated.shop,source.shop);
  const claimed=claimWelcomeGift(source,'2026-10-22');
  assert.deepEqual(wallet(claimed),[source.shells+1,source.water]);
  assert.deepEqual(claimed.challengeRewards,source.challengeRewards);
  assert.deepEqual(claimed.challengeSeeds,migrated.challengeSeeds);
  assert.deepEqual(migrated.challengeSeeds.slice(0,1),source.challengeSeeds);
  assert.equal(migrated.challengeSeeds.length,4);
  assert.deepEqual(claimed.rounds,source.rounds);
  assert.deepEqual(source,versionThreeSave());
});

test('corrupt old ledgers are rejected before migration or any welcome reward is paid',()=>{
  for(const factory of [legacySave,versionTwoSave,versionThreeSave]) {
    for(const mutate of [
      (s)=>s.shells++, (s)=>s.water++, (s)=>s.rounds[0].eventId='missing',
      (s)=>s.welcomeGifts=[], (s)=>s.extra=true,
    ]) {
      const bad=factory();mutate(bad);freeze(bad);
      for(const operation of [()=>validateMeadow(bad),()=>welcomeGift(bad,'2026-10-22'),()=>claimWelcomeGift(bad,'2026-10-22')])
        assert.throws(operation,/小芽草地记录无效/);
    }
  }
});

test('invalid, duplicate or reordered welcome receipts and forged balances fail all ledger entry points',()=>{
  let valid=createMeadow();
  for(const date of ['2026-10-21','2026-10-22','2026-10-23']) valid=claimWelcomeGift(valid,date);
  valid=plantSeed(openSeedPack(valid,0),{x:.3,y:.5});
  const mutations=[
    (s)=>delete s.welcomeGifts, (s)=>s.welcomeGifts=null, (s)=>s.welcomeGifts={},
    (s)=>s.welcomeGifts[0]=null, (s)=>s.welcomeGifts[0]=[],
    (s)=>s.welcomeGifts[0].amount=1, (s)=>s.welcomeGifts[0].mastered=true,
    (s)=>s.welcomeGifts[0].date='2026-02-30', (s)=>s.welcomeGifts[0].date='2026-1-21',
    (s)=>s.welcomeGifts[1].date=s.welcomeGifts[0].date,
    (s)=>s.welcomeGifts.reverse(), (s)=>s.welcomeGifts[0].kind='water',
    (s)=>s.welcomeGifts[1].kind='shells', (s)=>s.welcomeGifts[0].kind='seed',
    (s)=>{s.welcomeGifts.push({...s.welcomeGifts[0]});s.shells++;},
    (s)=>s.shells++, (s)=>s.water++, (s)=>s.welcomeGifts.pop(),
    (s)=>s.schemaVersion=7,
  ];
  for(const mutate of mutations) {
    const bad=clone(valid);mutate(bad);freeze(bad);
    for(const operation of [()=>validateMeadow(bad),()=>welcomeGift(bad,'2026-10-24'),
      ()=>claimWelcomeGift(bad,'2026-10-24'),()=>rewardRound(bad,round('later')),
      ()=>openSeedPack(bad,0),()=>waterPlant(bad,'plant-1'),()=>ensureShop(bad,'2026-10-24',0),
      ()=>reserveOffer(bad,'missing')]) assert.throws(operation,/小芽草地记录无效/);
  }
});

test('welcome day input must be an explicit valid local calendar date, never a timestamp',()=>{
  const state=freeze(createMeadow());
  for(const date of [null,undefined,0,{},new Date(),'', '2026-10-21T00:00:00Z','2026-1-01',
    '1999-12-31','2200-01-01','2026-02-29','2026-04-31','2026-00-01','2026-13-01']) {
    assert.throws(()=>welcomeGift(state,date),/小芽草地记录无效/);
    assert.throws(()=>claimWelcomeGift(state,date),/小芽草地记录无效/);
  }
  assert.deepEqual(welcomeGift(state,'2028-02-29'),{date:'2028-02-29',kind:'shells',amount:1});
  assert.deepEqual(state,createMeadow());
});
