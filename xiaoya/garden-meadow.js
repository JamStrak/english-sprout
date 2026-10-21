import {EVENTS} from './content.js';
import {CHALLENGE_UNITS} from './challenges.js';

/** Meadow rewards record participation or welcome gifts, never language ability. */
export const MEADOW_KEY = 'xiaoya-english:meadow:v1';
export const FLOWERS = Object.freeze([
  {id:'daisy',name:'雏菊',color:'#fff8e7',shape:'daisy',waterNeeded:5,scale:1,giant:false},
  {id:'tulip',name:'郁金香',color:'#e99080',shape:'tulip',waterNeeded:5,scale:1,giant:false},
  {id:'sunflower',name:'向日葵',color:'#efbc50',shape:'sunflower',waterNeeded:5,scale:1,giant:false},
  {id:'bellflower',name:'风铃花',color:'#91a9d1',shape:'bellflower',waterNeeded:5,scale:1,giant:false},
  {id:'poppy',name:'虞美人',color:'#d76d58',shape:'poppy',waterNeeded:5,scale:1,giant:false},
  {id:'violet',name:'紫罗兰',color:'#ad91bc',shape:'violet',waterNeeded:5,scale:1,giant:false},
  {id:'bow-pink',name:'粉粉蝴蝶结花',color:'#e998b7',shape:'bow',waterNeeded:5,scale:1,giant:false},
  {id:'bow-blue',name:'蓝蓝蝴蝶结花',color:'#81bdde',shape:'bow',waterNeeded:5,scale:1,giant:false},
  {id:'bow-yellow',name:'金金蝴蝶结花',color:'#f1cf67',shape:'bow',waterNeeded:5,scale:1,giant:false},
  {id:'bow-purple',name:'紫紫蝴蝶结花',color:'#b9a0df',shape:'bow',waterNeeded:5,scale:1,giant:false},
  {id:'giant-daisy',name:'巨型雏菊',color:'#fff1bd',shape:'daisy',waterNeeded:10,scale:1.75,giant:true},
  {id:'giant-sunflower',name:'巨型向日葵',color:'#f4b64e',shape:'sunflower',waterNeeded:10,scale:1.75,giant:true},
].map(Object.freeze));

// Milestone flowers are earned by different first clears, never sold or drawn.
export const SPECIAL_FLOWERS = Object.freeze([
  {id:'bow-rainbow',name:'彩虹蝴蝶结花',color:'#e998b7',shape:'bow',waterNeeded:5,scale:1,giant:false,special:true},
  {id:'bow-starlight',name:'星光蝴蝶结花',color:'#a99bdb',shape:'bow',waterNeeded:5,scale:1,giant:false,special:true},
].map(Object.freeze));
export const ALL_FLOWERS = Object.freeze([...FLOWERS,...SPECIAL_FLOWERS]);

const PRODUCT = 'xiaoya-english-meadow';
const eventIds = new Set(EVENTS.map((event)=>event.id));
export const ECONOMY = Object.freeze({shellReward:2,waterReward:2,starterWaterReward:3,packPrice:2});
export const CHALLENGE_ECONOMY = Object.freeze({shells:4,water:6});
export const CHALLENGE_MILESTONES = Object.freeze([
  {id:'challenge-seed-3',clears:3,flowerId:'bow-rainbow'},
  {id:'challenge-seed-6',clears:6,flowerId:'bow-starlight'},
].map(Object.freeze));
const challengeIds = new Set(CHALLENGE_UNITS.map((unit)=>unit.id));
const PREVIOUS_ECONOMY = Object.freeze({shellReward:2,waterReward:5,packPrice:2});
const LEGACY_SHELL_REWARD = 3;
const LEGACY_WATER_REWARD = 5;
const LEGACY_PACK_PRICE = 3;
// Saved purchase order, not randomness: refreshing or reopening cannot reroll a seed.
const SEED_CYCLE = Object.freeze([
  'daisy','bow-pink','giant-daisy','bow-blue','tulip','bow-yellow',
  'sunflower','bow-purple','bellflower','giant-sunflower','poppy','violet',
]);
const flowerById = new Map(FLOWERS.map((flower)=>[flower.id,flower]));
const allFlowerById = new Map(ALL_FLOWERS.map((flower)=>[flower.id,flower]));
const fail = (message) => { throw new Error(`小芽草地记录无效：${message}`); };
const own = (value,key) => Object.prototype.hasOwnProperty.call(value,key);

function fields(value,expected) {
  if(!value || typeof value!=='object' || Array.isArray(value) || ![Object.prototype,null].includes(Object.getPrototypeOf(value))) fail('应为普通对象');
  if(Object.keys(value).length!==expected.length || expected.some((key)=>!own(value,key))) fail('字段缺失或含有未知字段');
}

function whole(value,label) {
  if(!Number.isSafeInteger(value) || value<0) fail(`${label}应为非负安全整数`);
}

function position(value) {
  fields(value,['x','y']);
  for(const key of ['x','y']) {
    if(!Number.isFinite(value[key]) || value[key]<0 || value[key]>1) fail('播种坐标应为 0 到 1 之间的有限数');
  }
}

function day(value) {
  if(typeof value!=='string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) fail('日期应为 YYYY-MM-DD');
  const [year,month,date]=value.split('-').map(Number);
  const probe=new Date(Date.UTC(year,month-1,date));
  if(year<2000 || year>2199 || probe.getUTCFullYear()!==year || probe.getUTCMonth()!==month-1 || probe.getUTCDate()!==date) fail('日历日期错误');
}

function validateRound(value) {
  fields(value,['roundId','eventId','date']);
  if(typeof value.roundId!=='string' || !/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,159}$/.test(value.roundId) || ['constructor','prototype','__proto__'].includes(value.roundId)) fail('互动编号错误');
  if(!eventIds.has(value.eventId)) fail('未知故事');
  day(value.date);
}

const flowerFor = (serial) => SEED_CYCLE[(serial-1)%SEED_CYCLE.length];
const remainingBag = (opened) => SEED_CYCLE.slice(opened%SEED_CYCLE.length);

export function createMeadow() {
  return {
    schemaVersion:4,product:PRODUCT,shells:0,water:0,rounds:[],
    seedPacksOpened:0,pendingSeed:null,plants:[],purchases:[],legacy:null,
    shop:{date:null,offer:null,reserved:null,offers:[]},
    previousRoundCount:0,challengeRewards:[],challengeSeeds:[],welcomeGifts:[],
  };
}

/** Preserve the original ledger rules exactly before accepting any v1 migration. */
function validateLegacy(state) {
  fields(state,['schemaVersion','product','shells','water','rounds','seedPacksOpened','bag','pendingSeed','plants']);
  if(state.schemaVersion!==1 || state.product!==PRODUCT) fail('产品或版本不匹配');
  whole(state.shells,'贝壳'); whole(state.water,'水'); whole(state.seedPacksOpened,'种子包数量');
  if(!Array.isArray(state.rounds) || !Array.isArray(state.plants) || !Array.isArray(state.bag)) fail('列表错误');
  const roundIds=new Set();
  for(const round of state.rounds) {
    validateRound(round);
    if(roundIds.has(round.roundId)) fail('互动编号重复');
    roundIds.add(round.roundId);
  }
  const expectedBag=remainingBag(state.seedPacksOpened);
  if(state.bag.length!==expectedBag.length || expectedBag.some((id,index)=>state.bag[index]!==id)) fail('种子轮换袋与购买次数不符');
  if(state.seedPacksOpened!==state.plants.length+(state.pendingSeed===null?0:1)) fail('购买、待播种与植物数量不符');
  let usedWater=0;
  for(const [index,plant] of state.plants.entries()) {
    fields(plant,['id','seedId','flowerId','waterings','x','y']);
    const serial=index+1;
    if(plant.id!==`plant-${serial}` || plant.seedId!==`seed-${serial}` || plant.flowerId!==flowerFor(serial)) fail('植物、种子或品种不符');
    whole(plant.waterings,'浇水次数');
    if(plant.waterings>flowerById.get(plant.flowerId).waterNeeded) fail('浇水次数超出开花所需');
    position({x:plant.x,y:plant.y});
    usedWater+=plant.waterings;
  }
  if(state.pendingSeed!==null) {
    fields(state.pendingSeed,['id','flowerId']);
    if(state.pendingSeed.id!==`seed-${state.seedPacksOpened}` || state.pendingSeed.flowerId!==flowerFor(state.seedPacksOpened)) fail('待播种的种子编号或品种不符');
  }
  if(state.shells!==state.rounds.length*LEGACY_SHELL_REWARD-state.seedPacksOpened*LEGACY_PACK_PRICE) fail('贝壳余额与参与奖励、购买记录不符');
  if(state.water!==state.rounds.length*LEGACY_WATER_REWARD-usedWater) fail('水余额与参与奖励、浇水记录不符');
  return state;
}

const copy = (value) => JSON.parse(JSON.stringify(value));
const sameOffer = (a,b) => a.id===b.id && a.flowerId===b.flowerId && a.price===b.price;
const roundInput = (round) => ({roundId:round.roundId,eventId:round.eventId,date:round.date});
// Merely opening the old app could save an empty v1 meadow; that is not prior play.
const newcomer = (state) => state.legacy===null || (state.legacy.rounds.length===0 && state.legacy.seedPacksOpened===0);
const priceFor = (flowerId) => {
  const flower=flowerById.get(flowerId);
  if(!flower) fail('未知花种');
  return flower.giant?8:flower.shape==='bow'?6:3;
};

function migrateLegacy(state) {
  validateLegacy(state);
  const legacy=copy(state);
  return {...createMeadow(),shells:state.shells,water:state.water,
    rounds:state.rounds.map((round)=>({...round,starter:false,reward:'legacy',rewardVersion:1,
      amounts:{shells:LEGACY_SHELL_REWARD,water:LEGACY_WATER_REWARD}})),
    previousRoundCount:state.rounds.length,
    seedPacksOpened:state.seedPacksOpened,pendingSeed:copy(state.pendingSeed),plants:copy(state.plants),legacy,
    purchases:Array.from({length:state.seedPacksOpened},(_,index)=>({id:`seed-${index+1}`,
      flowerId:flowerFor(index+1),source:'legacy',price:LEGACY_PACK_PRICE,offerId:null})),
  };
}

function expectedRoundAmounts(version,starter) {
  if(version===1) return {shells:LEGACY_SHELL_REWARD,water:LEGACY_WATER_REWARD};
  if(version===2) return {shells:PREVIOUS_ECONOMY.shellReward,water:PREVIOUS_ECONOMY.waterReward};
  return {shells:ECONOMY.shellReward,water:starter?ECONOMY.starterWaterReward:ECONOMY.waterReward};
}

function validateEconomyState(state,modern) {
  const hasWelcomeGifts=state.schemaVersion===4;
  fields(state,['schemaVersion','product','shells','water','rounds','seedPacksOpened','pendingSeed','plants','purchases','legacy','shop',
    ...(modern?['previousRoundCount','challengeRewards','challengeSeeds']:[]),...(hasWelcomeGifts?['welcomeGifts']:[])]);
  whole(state.shells,'贝壳');whole(state.water,'水');whole(state.seedPacksOpened,'种子包数量');
  if(!Array.isArray(state.rounds) || !Array.isArray(state.plants) || !Array.isArray(state.purchases)) fail('列表错误');
  if(state.legacy!==null) validateLegacy(state.legacy);
  const legacyRounds=state.legacy?.rounds.length??0;
  const legacySeeds=state.legacy?.seedPacksOpened??0;
  if(state.rounds.length<legacyRounds || state.purchases.length<legacySeeds) fail('旧记录不能丢失');
  if(modern) {
    whole(state.previousRoundCount,'旧奖励记录数量');
    if(state.previousRoundCount<legacyRounds || state.previousRoundCount>state.rounds.length) fail('旧奖励记录边界不符');
  }
  const roundIds=new Set();
  let earnedShells=0,earnedWater=0;
  for(const [index,round] of state.rounds.entries()) {
    fields(round,['roundId','eventId','date','starter','reward',...(modern?['rewardVersion','amounts']:[])]);validateRound(roundInput(round));
    if(roundIds.has(round.roundId)) fail('互动编号重复');
    roundIds.add(round.roundId);
    const version=index<legacyRounds?1:modern && index>=state.previousRoundCount?3:2;
    const amounts=expectedRoundAmounts(version,round.starter);
    if(modern) {
      fields(round.amounts,['shells','water']);
      if(round.rewardVersion!==version || round.amounts.shells!==amounts.shells || round.amounts.water!==amounts.water) fail('参与奖励版本或金额不符');
    }
    if(index<legacyRounds) {
      const old=state.legacy.rounds[index];
      if(round.roundId!==old.roundId || round.eventId!==old.eventId || round.date!==old.date || round.starter!==false || round.reward!=='legacy') fail('旧参与记录被改写');
      earnedShells+=LEGACY_SHELL_REWARD;earnedWater+=LEGACY_WATER_REWARD;
    } else if(newcomer(state) && index===0) {
      if(round.starter!==true || round.reward!=='starter') fail('首次参与奖励不符');
      earnedShells+=amounts.shells;earnedWater+=amounts.water;
    } else {
      if(round.starter!==false || !['pending','shells','water'].includes(round.reward)) fail('参与补给选择不符');
      if(round.reward==='shells') earnedShells+=amounts.shells;
      if(round.reward==='water') earnedWater+=amounts.water;
    }
  }
  const milestoneSeeds=new Map();
  if(modern) {
    if(!Array.isArray(state.challengeRewards) || !Array.isArray(state.challengeSeeds)) fail('挑战奖励列表错误');
    const awardedUnits=new Set();
    for(const receipt of state.challengeRewards) {
      fields(receipt,['id','unitId','date','shells','water']);day(receipt.date);
      if(!challengeIds.has(receipt.unitId) || receipt.id!==`challenge:first-clear:${receipt.unitId}` || awardedUnits.has(receipt.unitId)) fail('挑战首通编号或重复奖励错误');
      if(receipt.shells!==CHALLENGE_ECONOMY.shells || receipt.water!==CHALLENGE_ECONOMY.water) fail('挑战首通奖励金额不符');
      awardedUnits.add(receipt.unitId);earnedShells+=receipt.shells;earnedWater+=receipt.water;
    }
    const earnedMilestones=CHALLENGE_MILESTONES.filter((milestone)=>awardedUnits.size>=milestone.clears);
    if(state.challengeSeeds.length!==earnedMilestones.length) fail('挑战纪念种子数量不符');
    for(const [index,seed] of state.challengeSeeds.entries()) {
      fields(seed,['milestoneId','flowerId','seedId']);
      const milestone=earnedMilestones[index];
      if(seed.milestoneId!==milestone.id || seed.flowerId!==milestone.flowerId ||
        (seed.seedId!==null && (typeof seed.seedId!=='string' || !/^seed-[1-9]\d*$/.test(seed.seedId)))) fail('挑战纪念种子记录不符');
      if(seed.seedId!==null) {
        if(milestoneSeeds.has(seed.seedId)) fail('挑战纪念种子重复领取');
        milestoneSeeds.set(seed.seedId,seed);
      }
    }
  }
  if(hasWelcomeGifts) {
    if(!Array.isArray(state.welcomeGifts)) fail('欢迎礼物列表错误');
    let previousGiftDate=null;
    for(const [index,gift] of state.welcomeGifts.entries()) {
      fields(gift,['date','kind']);day(gift.date);
      if(previousGiftDate!==null && gift.date<=previousGiftDate) fail('欢迎礼物日期重复或倒退');
      if(gift.kind!==(index%2===0?'shells':'water')) fail('欢迎礼物种类与领取顺序不符');
      if(gift.kind==='shells') earnedShells++;else earnedWater++;
      previousGiftDate=gift.date;
    }
  }
  whole(earnedShells,'累计贝壳');whole(earnedWater,'累计水');
  fields(state.shop,['date','offer','reserved','offers']);
  if(!Array.isArray(state.shop.offers)) fail('商店记录错误');
  const offers=new Map();
  let previousOffer=null;
  for(const [index,offer] of state.shop.offers.entries()) {
    fields(offer,['id','flowerId','price','date']);day(offer.date);
    if(offer.id!==`offer-${index+1}` || offer.price!==priceFor(offer.flowerId)) fail('商店品种、编号或价格不符');
    if(previousOffer && (offer.date<previousOffer.date || offer.flowerId===previousOffer.flowerId)) fail('商店刷新记录不符');
    offers.set(offer.id,offer);previousOffer=offer;
  }
  if(previousOffer===null) {
    if(state.shop.date!==null || state.shop.offer!==null || state.shop.reserved!==null) fail('空商店记录不符');
  } else {
    day(state.shop.date);
    fields(state.shop.offer,['id','flowerId','price']);
    if(state.shop.date!==previousOffer.date || !sameOffer(state.shop.offer,previousOffer)) fail('当前商店展示与记录不符');
  }
  if(state.shop.reserved!==null) {
    fields(state.shop.reserved,['id','flowerId','price']);
    const offer=offers.get(state.shop.reserved.id);
    if(!offer || !sameOffer(state.shop.reserved,offer)) fail('保留种子与商店记录不符');
  }
  const boughtOffers=new Set();
  let spentShells=0,mysteries=0;
  for(const [index,purchase] of state.purchases.entries()) {
    fields(purchase,['id','flowerId','source','price','offerId']);
    if(purchase.id!==`seed-${index+1}` || !(modern?allFlowerById:flowerById).has(purchase.flowerId)) fail('购买种子编号或品种不符');
    if(index<legacySeeds) {
      if(purchase.source!=='legacy' || purchase.price!==LEGACY_PACK_PRICE || purchase.offerId!==null || purchase.flowerId!==flowerFor(index+1)) fail('旧购买记录被改写');
    } else if(purchase.source==='mystery') {
      if(purchase.price!==ECONOMY.packPrice || purchase.offerId!==null || !flowerById.has(purchase.flowerId)) fail('盲盒成本或品种不符');
      if(newcomer(state) && mysteries===0 && purchase.flowerId!=='daisy') fail('首次盲盒应为雏菊');
      mysteries++;
    } else if(['shop','reserved'].includes(purchase.source)) {
      const offer=offers.get(purchase.offerId);
      if(!offer || purchase.flowerId!==offer.flowerId || purchase.price!==offer.price || boughtOffers.has(offer.id)) fail('商店购买成本、品种或重复购买错误');
      boughtOffers.add(offer.id);
    } else if(modern && purchase.source==='challenge') {
      const seed=milestoneSeeds.get(purchase.id);
      if(!seed || seed.flowerId!==purchase.flowerId || purchase.price!==0 || purchase.offerId!==null) fail('挑战纪念种子领取不符');
      milestoneSeeds.delete(purchase.id);
    } else fail('未知购买来源');
    spentShells+=purchase.price;
  }
  if(milestoneSeeds.size>0) fail('挑战纪念种子缺少领取记录');
  whole(spentShells,'累计花费');
  if(state.shop.offer && boughtOffers.has(state.shop.offer.id)) fail('已购买商品不能继续展示');
  if(state.shop.reserved && boughtOffers.has(state.shop.reserved.id)) fail('已购买商品不能继续保留');
  if(state.seedPacksOpened!==state.purchases.length || state.seedPacksOpened!==state.plants.length+(state.pendingSeed===null?0:1)) fail('购买、待播种与植物数量不符');
  let usedWater=0;
  for(const [index,plant] of state.plants.entries()) {
    fields(plant,['id','seedId','flowerId','waterings','x','y']);
    const purchase=state.purchases[index];
    if(plant.id!==`plant-${index+1}` || plant.seedId!==purchase.id || plant.flowerId!==purchase.flowerId) fail('植物、种子或购买品种不符');
    whole(plant.waterings,'浇水次数');position({x:plant.x,y:plant.y});
    if(plant.waterings>(modern?allFlowerById:flowerById).get(plant.flowerId).waterNeeded) fail('浇水次数超出开花所需');
    const old=state.legacy?.plants[index];
    if(old && (plant.id!==old.id || plant.seedId!==old.seedId || plant.flowerId!==old.flowerId || plant.x!==old.x || plant.y!==old.y || plant.waterings<old.waterings)) fail('旧植物记录被改写');
    usedWater+=plant.waterings;
  }
  if(state.pendingSeed!==null) {
    fields(state.pendingSeed,['id','flowerId']);
    const purchase=state.purchases.at(-1);
    if(!purchase || state.pendingSeed.id!==purchase.id || state.pendingSeed.flowerId!==purchase.flowerId) fail('待播种的种子编号或品种不符');
  }
  if(state.legacy && state.plants.length<state.legacy.plants.length) fail('旧植物不能丢失');
  whole(usedWater,'累计浇水');
  if(state.shells!==earnedShells-spentShells) fail('贝壳余额与参与奖励、购买记录不符');
  if(state.water!==earnedWater-usedWater) fail('水余额与参与奖励、浇水记录不符');
  return state;
}

/** Validate old ledgers before migration; no balance is recomputed at new rates. */
export function validateMeadow(input) {
  if(input?.product!==PRODUCT || ![1,2,3,4].includes(input?.schemaVersion)) fail('产品或版本不匹配');
  if(input.schemaVersion===1) return validateEconomyState(migrateLegacy(input),true);
  if(input.schemaVersion===2) {
    validateEconomyState(input,false);
    return validateEconomyState({...copy(input),schemaVersion:4,previousRoundCount:input.rounds.length,
      rounds:input.rounds.map((round)=>({...round,rewardVersion:round.reward==='legacy'?1:2,
        amounts:expectedRoundAmounts(round.reward==='legacy'?1:2,round.starter)})),
      challengeRewards:[],challengeSeeds:[],welcomeGifts:[]},true);
  }
  if(input.schemaVersion===3) {
    validateEconomyState(input,true);
    return validateEconomyState({...copy(input),schemaVersion:4,welcomeGifts:[]},true);
  }
  return validateEconomyState(input,true);
}

/** The caller supplies its local calendar day. Opening this preview never pays. */
export function welcomeGift(state,date) {
  state=validateMeadow(state);day(date);
  if(state.welcomeGifts.length && date<=state.welcomeGifts.at(-1).date) return null;
  return {date,kind:state.welcomeGifts.length%2===0?'shells':'water',amount:1};
}

/** Save inside the shared garden transaction before revealing the little gift. */
export function claimWelcomeGift(state,date) {
  state=validateMeadow(state);
  const gift=welcomeGift(state,date);
  if(!gift) return state;
  return validateMeadow({...state,shells:state.shells+(gift.kind==='shells'?1:0),
    water:state.water+(gift.kind==='water'?1:0),
    welcomeGifts:[...state.welcomeGifts,{date:gift.date,kind:gift.kind}]});
}

/** Caller supplies a completed story round; rewards never imply spoken mastery. */
export function rewardRound(state,input) {
  state=validateMeadow(state); validateRound(input);
  const previous=state.rounds.find((round)=>round.roundId===input.roundId);
  if(previous) {
    if(previous.eventId!==input.eventId || previous.date!==input.date) fail('同一互动编号不能覆盖原始参与记录');
    return state;
  }
  const starter=newcomer(state) && state.rounds.length===0;
  const amounts=expectedRoundAmounts(3,starter);
  return validateMeadow({...state,shells:state.shells+(starter?amounts.shells:0),water:state.water+(starter?amounts.water:0),
    rounds:[...state.rounds,{...roundInput(input),starter,reward:starter?'starter':'pending',rewardVersion:3,amounts}]});
}

/** Receipt-specific quantities keep an old unclaimed five-water gift intact. */
export function roundReward(state,roundId) {
  const round=validateMeadow(state).rounds.find((entry)=>entry.roundId===roundId);
  return round?{...round.amounts}:null;
}

export function pendingRewards(state) {
  return validateMeadow(state).rounds.filter((round)=>round.reward==='pending');
}

export function claimReward(state,roundId,choice) {
  state=validateMeadow(state);
  if(!['shells','water'].includes(choice)) fail('请选择贝壳或水');
  const index=state.rounds.findIndex((round)=>round.roundId===roundId);
  if(index===-1 || state.rounds[index].reward!=='pending') return state;
  const amounts=state.rounds[index].amounts;
  return validateMeadow({...state,shells:state.shells+(choice==='shells'?amounts.shells:0),
    water:state.water+(choice==='water'?amounts.water:0),
    rounds:state.rounds.map((round,i)=>i===index?{...round,reward:choice}:round)});
}

/** Call only after persisting a completed challenge. Replays cannot mint rewards. */
export function rewardChallenge(state,input) {
  state=validateMeadow(state);fields(input,['unitId','date']);day(input.date);
  if(!challengeIds.has(input.unitId)) fail('未知挑战');
  if(state.challengeRewards.some((receipt)=>receipt.unitId===input.unitId)) return state;
  const challengeRewards=[...state.challengeRewards,{id:`challenge:first-clear:${input.unitId}`,...input,...CHALLENGE_ECONOMY}];
  const challengeSeeds=[...state.challengeSeeds];
  for(const milestone of CHALLENGE_MILESTONES) {
    if(challengeRewards.length>=milestone.clears && !challengeSeeds.some((seed)=>seed.milestoneId===milestone.id))
      challengeSeeds.push({milestoneId:milestone.id,flowerId:milestone.flowerId,seedId:null});
  }
  return validateMeadow({...state,shells:state.shells+CHALLENGE_ECONOMY.shells,water:state.water+CHALLENGE_ECONOMY.water,
    challengeRewards,challengeSeeds});
}

export function pendingChallengeSeeds(state) {
  return validateMeadow(state).challengeSeeds.filter((seed)=>seed.seedId===null).map((seed)=>({...seed}));
}

/** A saved entitlement waits safely while another seed is in the child's hands. */
export function redeemChallengeSeed(state) {
  state=validateMeadow(state);
  if(state.pendingSeed!==null) return state;
  const next=state.challengeSeeds.find((seed)=>seed.seedId===null);
  if(!next) return state;
  const purchased=purchaseSeed(state,next.flowerId,'challenge',0);
  return validateMeadow({...purchased,challengeSeeds:state.challengeSeeds.map((seed)=>seed===next?
    {...seed,seedId:purchased.pendingSeed.id}:seed)});
}

function randomFlower(pool,randomValue) {
  if(typeof randomValue!=='number' || !Number.isFinite(randomValue) || randomValue<0 || randomValue>=1) fail('随机值应在 0 到 1 之间');
  return pool[Math.floor(randomValue*pool.length)].id;
}

function purchaseSeed(state,flowerId,source,price,offerId=null) {
  const serial=state.seedPacksOpened+1;
  return {...state,shells:state.shells-price,seedPacksOpened:serial,
    pendingSeed:{id:`seed-${serial}`,flowerId},purchases:[...state.purchases,{id:`seed-${serial}`,flowerId,source,price,offerId}]};
}

/** Persist before revealing. One pending seed prevents duplicate charges and rerolls. */
export function openSeedPack(state,randomValue=Math.random()) {
  state=validateMeadow(state);
  if(state.pendingSeed!==null || state.shells<ECONOMY.packPrice) return state;
  const first=newcomer(state) && !state.purchases.some((purchase)=>purchase.source==='mystery');
  const pool=first?[flowerById.get('daisy')]:FLOWERS;
  return validateMeadow(purchaseSeed(state,randomFlower(pool,randomValue),'mystery',ECONOMY.packPrice));
}

function refreshShop(state,date,randomValue) {
  const pool=FLOWERS.filter((flower)=>flower.id!==state.shop.offer?.flowerId);
  const flowerId=randomFlower(pool,randomValue);
  const offer={id:`offer-${state.shop.offers.length+1}`,flowerId,price:priceFor(flowerId)};
  return {...state,shop:{...state.shop,date,offer,offers:[...state.shop.offers,{...offer,date}]}};
}

/** An offer is stable all day; moving the clock backwards does not reroll it. */
export function ensureShop(state,date,randomValue=Math.random()) {
  state=validateMeadow(state);day(date);
  if(state.shop.date!==null && date<=state.shop.date) return state;
  return validateMeadow(refreshShop(state,date,randomValue));
}

export function reserveOffer(state,expectedOfferId,options={replace:false}) {
  state=validateMeadow(state);fields(options,['replace']);
  if(typeof options.replace!=='boolean') fail('保留替换选项错误');
  const offer=state.shop.offer;
  if(!offer || offer.id!==expectedOfferId || state.shop.reserved?.id===offer.id) return state;
  if(state.shop.reserved!==null && !options.replace) return state;
  return validateMeadow({...state,shop:{...state.shop,reserved:{...offer}}});
}

/** IDs bind the action to what the child saw; stale/repeated taps cannot spend. */
export function buyOffer(state,expectedOfferId,source='shop',randomValue=Math.random()) {
  state=validateMeadow(state);
  if(!['shop','reserved'].includes(source)) fail('商店购买来源错误');
  const offer=source==='shop'?state.shop.offer:state.shop.reserved;
  if(!offer || offer.id!==expectedOfferId || state.pendingSeed!==null || state.shells<offer.price) return state;
  let result=purchaseSeed(state,offer.flowerId,source,offer.price,offer.id);
  if(state.shop.reserved?.id===offer.id) result={...result,shop:{...result.shop,reserved:null}};
  if(state.shop.offer?.id===offer.id) result=refreshShop(result,state.shop.date,randomValue);
  return validateMeadow(result);
}

/** No pot slots or plant-count cap: every paid seed can be planted on the meadow. */
export function plantSeed(state,point) {
  state=validateMeadow(state);
  if(state.pendingSeed===null) return state;
  position(point);
  const plant={id:`plant-${state.seedPacksOpened}`,seedId:state.pendingSeed.id,
    flowerId:state.pendingSeed.flowerId,waterings:0,x:point.x,y:point.y};
  return validateMeadow({...state,pendingSeed:null,plants:[...state.plants,plant]});
}

/** Each explicit pour spends one water. Mature plants and an empty can spend none. */
export function waterPlant(state,plantId) {
  state=validateMeadow(state);
  const index=state.plants.findIndex((plant)=>plant.id===plantId);
  if(index===-1) fail('找不到植物');
  const target=state.plants[index];
  if(state.water<1 || target.waterings===allFlowerById.get(target.flowerId).waterNeeded) return state;
  return validateMeadow({...state,water:state.water-1,plants:state.plants.map((plant,i)=>
    i===index?{...plant,waterings:plant.waterings+1}:plant)});
}

export function nextAction(state) {
  state=validateMeadow(state);
  if(pendingRewards(state).length>0) return 'reward';
  if(state.pendingSeed!==null) return 'plant';
  if(pendingChallengeSeeds(state).length>0) return 'challenge-seed';
  if(state.water>0 && state.plants.some((plant)=>plant.waterings<allFlowerById.get(plant.flowerId).waterNeeded)) return 'water';
  if(state.shells>=ECONOMY.packPrice) return 'pack';
  return 'learn';
}
