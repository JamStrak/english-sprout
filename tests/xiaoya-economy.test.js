import test from 'node:test';
import assert from 'node:assert/strict';
import {FLOWERS,createMeadow,validateMeadow,rewardRound,claimReward,pendingRewards,openSeedPack,plantSeed,waterPlant,ensureShop,reserveOffer,buyOffer,nextAction} from '../xiaoya/garden-meadow.js';

const clone=(value)=>JSON.parse(JSON.stringify(value));
function freeze(value) {
  if(value && typeof value==='object') {Object.values(value).forEach(freeze);Object.freeze(value);}
  return value;
}
const round=(id)=>({roundId:id,eventId:'family-love',date:'2026-10-18'});
const fund=(count=12)=>{
  let state=createMeadow();
  for(let index=0;index<count;index++) {
    state=rewardRound(state,round(`r-${index}`));
    state=claimReward(state,`r-${index}`,'shells');
  }
  return state;
};
const oldCycle=['daisy','bow-pink','giant-daisy','bow-blue','tulip','bow-yellow','sunflower','bow-purple','bellflower','giant-sunflower','poppy','violet'];
function legacy() {
  return {schemaVersion:1,product:'xiaoya-english-meadow',shells:3,water:11,
    rounds:[round('old-1'),round('old-2'),round('old-3')],seedPacksOpened:2,
    bag:oldCycle.slice(2),pendingSeed:{id:'seed-2',flowerId:'bow-pink'},
    plants:[{id:'plant-1',seedId:'seed-1',flowerId:'daisy',waterings:4,x:.173829,y:.981927}]};
}

test('schema1 migration preserves balances, planted positions, pending seed and consumed round IDs',()=>{
  const source=freeze(legacy()),before=clone(source);
  const migrated=validateMeadow(source);
  assert.equal(migrated.schemaVersion,3);
  assert.deepEqual([migrated.shells,migrated.water],[3,11]);
  assert.deepEqual(migrated.plants,source.plants);assert.deepEqual(migrated.pendingSeed,source.pendingSeed);
  assert.deepEqual(migrated.legacy,source);assert.notStrictEqual(migrated.legacy,source);
  assert.deepEqual(migrated.rounds.map(({roundId,eventId,date})=>({roundId,eventId,date})),source.rounds);
  assert.ok(migrated.rounds.every((entry)=>entry.reward==='legacy' && entry.starter===false));
  assert.equal(pendingRewards(migrated).length,0);
  assert.strictEqual(claimReward(migrated,'old-1','shells'),migrated);
  assert.strictEqual(rewardRound(migrated,round('old-1')),migrated);
  assert.strictEqual(validateMeadow(migrated),migrated);
  assert.deepEqual(source,before);
  let next=plantSeed(freeze(migrated),{x:.349,y:.6502});
  next=waterPlant(next,'plant-1');
  assert.equal(next.plants[0].waterings,5);assert.equal(next.plants[1].flowerId,'bow-pink');
  next=rewardRound(next,round('new-1'));
  assert.deepEqual([next.shells,next.water],[3,10]);assert.equal(nextAction(next),'reward');
  next=claimReward(next,'new-1','shells');
  assert.deepEqual([next.shells,next.water],[5,10]);
  next=openSeedPack(next,10.5/12);
  assert.equal(next.pendingSeed.flowerId,'giant-daisy','migrated users do not restart the ordinary-only first draw');
  assert.equal(next.pendingSeed.id,'seed-3');assert.equal(next.shells,3);
});

test('all model actions accept legacy state and return a migrated value without mutating it',()=>{
  const source=freeze(legacy());
  for(const next of [rewardRound(source,round('old-1')),claimReward(source,'old-1','water'),openSeedPack(source),
    plantSeed(source,{x:.3,y:.5}),waterPlant(source,'plant-1'),ensureShop(source,'2026-10-18',0),
    reserveOffer(source,'missing'),buyOffer(source,'missing')]) assert.equal(next.schemaVersion,3);
  assert.deepEqual(source,legacy());
});

test('an empty schema1 save still gets the complete first-participation daisy loop',()=>{
  const empty=freeze({schemaVersion:1,product:'xiaoya-english-meadow',shells:0,water:0,rounds:[],
    seedPacksOpened:0,bag:[...oldCycle],pendingSeed:null,plants:[]});
  let state=validateMeadow(empty);
  assert.equal(state.schemaVersion,3);assert.deepEqual(state.legacy,empty);
  state=rewardRound(freeze(state),round('first-real-participation'));
  assert.deepEqual([state.shells,state.water],[2,3]);
  assert.equal(state.rounds[0].starter,true);assert.equal(state.rounds[0].reward,'starter');
  assert.equal(pendingRewards(state).length,0);
  state=openSeedPack(freeze(clone(state)),.99999);
  assert.deepEqual(state.pendingSeed,{id:'seed-1',flowerId:'daisy'});
  const forged=clone(state);forged.purchases[0].flowerId='giant-daisy';forged.pendingSeed.flowerId='giant-daisy';
  assert.throws(()=>validateMeadow(forged),/首次盲盒/);
  state=plantSeed(state,{x:.56,y:.32});
  for(let index=0;index<3;index++)state=waterPlant(freeze(state),'plant-1');
  assert.equal(state.plants[0].waterings,3);assert.deepEqual([state.shells,state.water],[0,0]);
  assert.equal(nextAction(state),'learn');
  state=rewardRound(freeze(clone(state)),round('second-real-participation'));
  assert.equal(state.rounds[1].starter,false);assert.equal(state.rounds[1].reward,'pending');
  assert.deepEqual([state.shells,state.water],[0,0]);
  assert.strictEqual(claimReward(state,'first-real-participation','shells'),state);
  state=claimReward(state,'second-real-participation','water');
  for(let index=0;index<2;index++)state=waterPlant(freeze(state),'plant-1');
  assert.equal(state.plants[0].waterings,5);assert.deepEqual([state.shells,state.water],[0,0]);
});

test('legacy corruption is rejected before migration and cannot mint opening balances',()=>{
  const mutations=[
    (s)=>s.shells++, (s)=>s.water++, (s)=>s.bag.reverse(), (s)=>s.mastery=true,
    (s)=>s.rounds.push({...s.rounds[0]}),(s)=>s.plants[0].flowerId='giant-daisy',
    (s)=>s.plants[0].waterings=6,(s)=>s.pendingSeed.id='seed-3',
    (s)=>s.plants[0].x=Infinity,(s)=>s.rounds[0].date='2026-02-30',
  ];
  for(const mutate of mutations) {
    const broken=legacy();mutate(broken);freeze(broken);
    assert.throws(()=>validateMeadow(broken),/小芽草地记录无效/);
  }
  const migrated=validateMeadow(legacy());
  for(const mutate of [
    (s)=>s.rounds[0].reward='pending',(s)=>s.rounds[0].roundId='rewritten',
    (s)=>s.plants[0].x=.1,(s)=>{s.plants[0].waterings--;s.water++;},
    (s)=>{s.purchases[0].price=2;s.shells++;},(s)=>s.legacy.shells++,
  ]) {
    const broken=clone(migrated);mutate(broken);
    assert.throws(()=>validateMeadow(broken),/小芽草地记录无效/);
  }
});

test('multiple unclaimed rounds survive reload and each can be claimed once in any order',()=>{
  let state=rewardRound(createMeadow(),round('starter'));
  for(const id of ['one','two','three']) state=rewardRound(state,round(id));
  assert.deepEqual([state.shells,state.water],[2,3]);
  assert.deepEqual(pendingRewards(state).map((entry)=>entry.roundId),['one','two','three']);
  state=freeze(clone(state));
  state=claimReward(state,'two','water');state=claimReward(state,'one','shells');
  assert.deepEqual([state.shells,state.water],[4,5]);
  assert.deepEqual(pendingRewards(state).map((entry)=>entry.roundId),['three']);
  const settled=claimReward(state,'three','shells');
  for(const id of ['starter','one','two','three','missing']) {
    assert.strictEqual(claimReward(settled,id,'water'),settled);
    assert.strictEqual(claimReward(settled,id,'shells'),settled);
  }
  assert.deepEqual([settled.shells,settled.water],[6,5]);
});

test('daily shop stays stable through reload and backwards clocks, then changes variety',()=>{
  const initial=freeze(fund());
  const shown=ensureShop(initial,'2026-10-18',0);
  assert.deepEqual(shown.shop.offer,{id:'offer-1',flowerId:'daisy',price:3});
  assert.strictEqual(ensureShop(shown,'2026-10-18',.99),shown);
  assert.strictEqual(ensureShop(shown,'2026-10-17',.99),shown);
  const restored=freeze(clone(shown));
  assert.strictEqual(ensureShop(restored,'2026-10-18',.99),restored);
  const tomorrow=ensureShop(restored,'2026-10-19',0);
  assert.equal(tomorrow.shop.offer.id,'offer-2');assert.equal(tomorrow.shop.offer.flowerId,'tulip');
  assert.equal(tomorrow.shells,shown.shells);
  assert.equal(initial.shop.offer,null);
  for(const date of ['2026-02-30','2026-1-01','1999-01-01',null]) assert.throws(()=>ensureShop(shown,date,0),/日期/);
});

test('shop prices are fixed by ordinary, bow and giant variety instead of forged offer values',()=>{
  for(const [index,flower] of FLOWERS.entries()) {
    const shown=ensureShop(fund(),'2026-10-18',(index+.5)/FLOWERS.length);
    const price=flower.giant?8:flower.shape==='bow'?6:3;
    assert.equal(shown.shop.offer.price,price);
    const bought=buyOffer(shown,shown.shop.offer.id,'shop',0);
    assert.equal(bought.shells,shown.shells-price);assert.equal(bought.pendingSeed.flowerId,flower.id);
    assert.equal(bought.purchases[0].price,price);
    assert.notEqual(bought.shop.offer.flowerId,flower.id);
    assert.equal(bought.shop.offer.id,'offer-2');
  }
});

test('shop buying is idempotent and a pending seed prevents both purchase channels spending',()=>{
  const shown=freeze(ensureShop(fund(),'2026-10-18',0));
  const bought=buyOffer(shown,'offer-1','shop',.9);
  assert.equal(bought.shells,shown.shells-3);assert.equal(shown.pendingSeed,null);
  assert.strictEqual(buyOffer(bought,'offer-1','shop',0),bought);
  assert.strictEqual(buyOffer(bought,bought.shop.offer.id,'shop',0),bought);
  assert.strictEqual(openSeedPack(bought,.8),bought);
  const planted=plantSeed(bought,{x:.5,y:.5});
  assert.strictEqual(buyOffer(planted,'offer-1','shop',0),planted,'stale DOM callback remains harmless after planting');
  assert.strictEqual(buyOffer(planted,'missing','shop',0),planted);
  assert.strictEqual(buyOffer(planted,'offer-1','reserved',0),planted);
  const poor=ensureShop(rewardRound(createMeadow(),round('only')),'2026-10-18',0);
  assert.strictEqual(buyOffer(poor,'offer-1'),poor,'insufficient balance does not spend or refresh');
});

test('reservation survives daily refresh and old reserved purchase leaves current shop unchanged',()=>{
  let state=ensureShop(fund(),'2026-10-18',6.5/12);
  state=reserveOffer(state,'offer-1');
  const kept=clone(state.shop.reserved);
  state=ensureShop(freeze(state),'2026-10-19',.9);
  assert.deepEqual(state.shop.reserved,kept);
  assert.notEqual(state.shop.offer.id,kept.id);
  const before=freeze(clone(state));
  assert.strictEqual(reserveOffer(before,before.shop.offer.id),before,'another bookmark requires explicit replacement');
  const bought=buyOffer(before,kept.id,'reserved',0);
  assert.equal(bought.shells,before.shells-6);assert.equal(bought.pendingSeed.flowerId,'bow-pink');
  assert.equal(bought.shop.reserved,null);assert.deepEqual(bought.shop.offer,before.shop.offer);
  assert.deepEqual(bought.shop.offers,before.shop.offers);
  assert.strictEqual(buyOffer(bought,kept.id,'reserved'),bought);
  assert.deepEqual(before.shop.reserved,kept);
});

test('explicit reservation replacement preserves wallet and stale IDs do nothing',()=>{
  let state=reserveOffer(ensureShop(fund(),'2026-10-18',0),'offer-1');
  state=ensureShop(state,'2026-10-19',.9);
  assert.strictEqual(reserveOffer(state,'offer-1',{replace:true}),state);
  assert.strictEqual(reserveOffer(state,'offer-2'),state);
  const replaced=reserveOffer(freeze(state),'offer-2',{replace:true});
  assert.deepEqual(replaced.shop.reserved,replaced.shop.offer);
  assert.deepEqual([replaced.shells,replaced.water],[state.shells,state.water]);
  assert.strictEqual(reserveOffer(replaced,'offer-2'),replaced);
  assert.throws(()=>reserveOffer(state,'offer-2',{replace:'yes'}),/选项/);
  assert.throws(()=>reserveOffer(state,'offer-2',{replace:true,price:0}),/字段/);
});

test('buying either reference to the same offer clears its reservation and replenishes once',()=>{
  for(const source of ['shop','reserved']) {
    const state=freeze(reserveOffer(ensureShop(fund(),'2026-10-18',0),'offer-1'));
    const next=buyOffer(state,'offer-1',source,.5);
    assert.equal(next.shells,state.shells-3);assert.equal(next.shop.reserved,null);
    assert.equal(next.shop.offer.id,'offer-2');assert.notEqual(next.shop.offer.flowerId,'daisy');
    assert.equal(next.shop.offers.length,2);assert.equal(next.purchases.length,1);
    const planted=plantSeed(next,{x:.7,y:.2});
    assert.strictEqual(buyOffer(planted,'offer-1','shop'),planted);
    assert.strictEqual(buyOffer(planted,'offer-1','reserved'),planted);
  }
});

test('first mystery stays a daisy even when the first seed was a purchased giant',()=>{
  let state=ensureShop(fund(),'2026-10-18',10.5/12);
  state=buyOffer(state,'offer-1','shop',0);
  assert.equal(state.pendingSeed.flowerId,'giant-daisy');
  state=plantSeed(state,{x:.5,y:.5});
  state=openSeedPack(state,.99);
  assert.equal(state.pendingSeed.flowerId,'daisy');
  state=plantSeed(state,{x:.8,y:.5});
  state=openSeedPack(state,.99);
  assert.equal(state.pendingSeed.flowerId,'giant-sunflower');
});

test('shop, purchase and offer history must reconcile with balances and unique seed identities',()=>{
  let valid=ensureShop(fund(),'2026-10-18',0);
  valid=buyOffer(valid,'offer-1','shop',.6);
  valid=plantSeed(valid,{x:.5,y:.5});
  valid=reserveOffer(valid,'offer-2');
  const mutations=[
    (s)=>s.shop.offer.price=1,(s)=>s.shop.reserved.price=1,
    (s)=>{s.shop.offers[0].price=1;s.purchases[0].price=1;s.shells+=2;},
    (s)=>{s.purchases[0].price=0;s.shells+=3;},
    (s)=>s.purchases[0].offerId='offer-2',(s)=>s.purchases[0].source='gift',
    (s)=>s.shop.date='2026-10-19',(s)=>s.shop.offers[1].flowerId='daisy',
    (s)=>s.shop.offers[1].id='offer-1',(s)=>s.shop.offers[0].date='2026-10-19',
    (s)=>s.shop.reserved={id:'offer-1',flowerId:'daisy',price:3},
    (s)=>s.shop.offer={id:'offer-1',flowerId:'daisy',price:3},
    (s)=>s.shop.free=true,(s)=>s.shop.offers[0].free=true,
    (s)=>{s.plants.push({...s.plants[0]});s.purchases.push({...s.purchases[0]});s.seedPacksOpened++;s.shells-=3;},
    (s)=>{s.purchases.push({...s.purchases[0],id:'seed-2'});s.pendingSeed={id:'seed-2',flowerId:'daisy'};s.seedPacksOpened++;s.shells-=3;},
  ];
  for(const mutate of mutations) {
    const state=clone(valid);mutate(state);freeze(state);
    assert.throws(()=>validateMeadow(state),/小芽草地记录无效/);
    assert.throws(()=>ensureShop(state,'2026-10-20',0),/小芽草地记录无效/);
    assert.throws(()=>buyOffer(state,'offer-2'),/小芽草地记录无效/);
  }
});
