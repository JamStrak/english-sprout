import {EVENTS} from './content.js';

/** B meadow rewards record participation only, never language ability. */
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

const PRODUCT = 'xiaoya-english-meadow';
const eventIds = new Set(EVENTS.map((event)=>event.id));
export const ECONOMY = Object.freeze({shellReward:2,waterReward:5,packPrice:2});
const LEGACY_SHELL_REWARD = 3;
const LEGACY_WATER_REWARD = 5;
const LEGACY_PACK_PRICE = 3;
// Saved purchase order, not randomness: refreshing or reopening cannot reroll a seed.
const SEED_CYCLE = Object.freeze([
  'daisy','bow-pink','giant-daisy','bow-blue','tulip','bow-yellow',
  'sunflower','bow-purple','bellflower','giant-sunflower','poppy','violet',
]);
const flowerById = new Map(FLOWERS.map((flower)=>[flower.id,flower]));
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
    schemaVersion:2,product:PRODUCT,shells:0,water:0,rounds:[],
    seedPacksOpened:0,pendingSeed:null,plants:[],purchases:[],legacy:null,
    shop:{date:null,offer:null,reserved:null,offers:[]},
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
    rounds:state.rounds.map((round)=>({...round,starter:false,reward:'legacy'})),
    seedPacksOpened:state.seedPacksOpened,pendingSeed:copy(state.pendingSeed),plants:copy(state.plants),legacy,
    purchases:Array.from({length:state.seedPacksOpened},(_,index)=>({id:`seed-${index+1}`,
      flowerId:flowerFor(index+1),source:'legacy',price:LEGACY_PACK_PRICE,offerId:null})),
  };
}

/** Returns the migrated value; callers must save/use it rather than discard it. */
export function validateMeadow(input) {
  if(input?.product!==PRODUCT || ![1,2].includes(input?.schemaVersion)) fail('产品或版本不匹配');
  const state=input.schemaVersion===1?migrateLegacy(input):input;
  fields(state,['schemaVersion','product','shells','water','rounds','seedPacksOpened','pendingSeed','plants','purchases','legacy','shop']);
  whole(state.shells,'贝壳');whole(state.water,'水');whole(state.seedPacksOpened,'种子包数量');
  if(!Array.isArray(state.rounds) || !Array.isArray(state.plants) || !Array.isArray(state.purchases)) fail('列表错误');
  if(state.legacy!==null) validateLegacy(state.legacy);
  const legacyRounds=state.legacy?.rounds.length??0;
  const legacySeeds=state.legacy?.seedPacksOpened??0;
  if(state.rounds.length<legacyRounds || state.purchases.length<legacySeeds) fail('旧记录不能丢失');
  const roundIds=new Set();
  let earnedShells=0,earnedWater=0;
  for(const [index,round] of state.rounds.entries()) {
    fields(round,['roundId','eventId','date','starter','reward']);validateRound(roundInput(round));
    if(roundIds.has(round.roundId)) fail('互动编号重复');
    roundIds.add(round.roundId);
    if(index<legacyRounds) {
      const old=state.legacy.rounds[index];
      if(round.roundId!==old.roundId || round.eventId!==old.eventId || round.date!==old.date || round.starter!==false || round.reward!=='legacy') fail('旧参与记录被改写');
      earnedShells+=LEGACY_SHELL_REWARD;earnedWater+=LEGACY_WATER_REWARD;
    } else if(newcomer(state) && index===0) {
      if(round.starter!==true || round.reward!=='starter') fail('首次参与奖励不符');
      earnedShells+=ECONOMY.shellReward;earnedWater+=ECONOMY.waterReward;
    } else {
      if(round.starter!==false || !['pending','shells','water'].includes(round.reward)) fail('参与补给选择不符');
      if(round.reward==='shells') earnedShells+=ECONOMY.shellReward;
      if(round.reward==='water') earnedWater+=ECONOMY.waterReward;
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
    if(purchase.id!==`seed-${index+1}` || !flowerById.has(purchase.flowerId)) fail('购买种子编号或品种不符');
    if(index<legacySeeds) {
      if(purchase.source!=='legacy' || purchase.price!==LEGACY_PACK_PRICE || purchase.offerId!==null || purchase.flowerId!==flowerFor(index+1)) fail('旧购买记录被改写');
    } else if(purchase.source==='mystery') {
      if(purchase.price!==ECONOMY.packPrice || purchase.offerId!==null) fail('盲盒成本不符');
      if(newcomer(state) && mysteries===0 && purchase.flowerId!=='daisy') fail('首次盲盒应为雏菊');
      mysteries++;
    } else if(['shop','reserved'].includes(purchase.source)) {
      const offer=offers.get(purchase.offerId);
      if(!offer || purchase.flowerId!==offer.flowerId || purchase.price!==offer.price || boughtOffers.has(offer.id)) fail('商店购买成本、品种或重复购买错误');
      boughtOffers.add(offer.id);
    } else fail('未知购买来源');
    spentShells+=purchase.price;
  }
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
    if(plant.waterings>flowerById.get(plant.flowerId).waterNeeded) fail('浇水次数超出开花所需');
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

/** Caller supplies a completed story round; rewards never imply spoken mastery. */
export function rewardRound(state,input) {
  state=validateMeadow(state); validateRound(input);
  const previous=state.rounds.find((round)=>round.roundId===input.roundId);
  if(previous) {
    if(previous.eventId!==input.eventId || previous.date!==input.date) fail('同一互动编号不能覆盖原始参与记录');
    return state;
  }
  const starter=newcomer(state) && state.rounds.length===0;
  return validateMeadow({...state,shells:state.shells+(starter?ECONOMY.shellReward:0),water:state.water+(starter?ECONOMY.waterReward:0),
    rounds:[...state.rounds,{...roundInput(input),starter,reward:starter?'starter':'pending'}]});
}

export function pendingRewards(state) {
  return validateMeadow(state).rounds.filter((round)=>round.reward==='pending');
}

export function claimReward(state,roundId,choice) {
  state=validateMeadow(state);
  if(!['shells','water'].includes(choice)) fail('请选择贝壳或水');
  const index=state.rounds.findIndex((round)=>round.roundId===roundId);
  if(index===-1 || state.rounds[index].reward!=='pending') return state;
  return validateMeadow({...state,shells:state.shells+(choice==='shells'?ECONOMY.shellReward:0),
    water:state.water+(choice==='water'?ECONOMY.waterReward:0),
    rounds:state.rounds.map((round,i)=>i===index?{...round,reward:choice}:round)});
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
  if(state.water<1 || target.waterings===flowerById.get(target.flowerId).waterNeeded) return state;
  return validateMeadow({...state,water:state.water-1,plants:state.plants.map((plant,i)=>
    i===index?{...plant,waterings:plant.waterings+1}:plant)});
}

export function nextAction(state) {
  state=validateMeadow(state);
  if(pendingRewards(state).length>0) return 'reward';
  if(state.pendingSeed!==null) return 'plant';
  if(state.water>0 && state.plants.some((plant)=>plant.waterings<flowerById.get(plant.flowerId).waterNeeded)) return 'water';
  if(state.shells>=ECONOMY.packPrice) return 'pack';
  return 'learn';
}
