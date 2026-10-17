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
const SHELL_REWARD = 3;
const WATER_REWARD = 5;
const PACK_PRICE = 3;
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
    schemaVersion:1,product:PRODUCT,shells:0,water:0,rounds:[],
    seedPacksOpened:0,bag:remainingBag(0),pendingSeed:null,plants:[],
  };
}

/** Reject inconsistent restored JSON without changing it or clearing either garden. */
export function validateMeadow(state) {
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
  if(state.shells!==state.rounds.length*SHELL_REWARD-state.seedPacksOpened*PACK_PRICE) fail('贝壳余额与参与奖励、购买记录不符');
  if(state.water!==state.rounds.length*WATER_REWARD-usedWater) fail('水余额与参与奖励、浇水记录不符');
  return state;
}

/** Caller supplies a completed story round; rewards never imply spoken mastery. */
export function rewardRound(state,input) {
  validateMeadow(state); validateRound(input);
  const previous=state.rounds.find((round)=>round.roundId===input.roundId);
  if(previous) {
    if(previous.eventId!==input.eventId || previous.date!==input.date) fail('同一互动编号不能覆盖原始参与记录');
    return state;
  }
  return validateMeadow({...state,shells:state.shells+SHELL_REWARD,water:state.water+WATER_REWARD,
    rounds:[...state.rounds,{roundId:input.roundId,eventId:input.eventId,date:input.date}]});
}

/** Persist before revealing. One pending seed prevents duplicate charges and rerolls. */
export function openSeedPack(state) {
  validateMeadow(state);
  if(state.pendingSeed!==null || state.shells<PACK_PRICE) return state;
  const serial=state.seedPacksOpened+1;
  return validateMeadow({...state,shells:state.shells-PACK_PRICE,seedPacksOpened:serial,
    bag:remainingBag(serial),pendingSeed:{id:`seed-${serial}`,flowerId:flowerFor(serial)}});
}

/** No pot slots or plant-count cap: every paid seed can be planted on the meadow. */
export function plantSeed(state,point) {
  validateMeadow(state);
  if(state.pendingSeed===null) return state;
  position(point);
  const plant={id:`plant-${state.seedPacksOpened}`,seedId:state.pendingSeed.id,
    flowerId:state.pendingSeed.flowerId,waterings:0,x:point.x,y:point.y};
  return validateMeadow({...state,pendingSeed:null,plants:[...state.plants,plant]});
}

/** Each explicit pour spends one water. Mature plants and an empty can spend none. */
export function waterPlant(state,plantId) {
  validateMeadow(state);
  const index=state.plants.findIndex((plant)=>plant.id===plantId);
  if(index===-1) fail('找不到植物');
  const target=state.plants[index];
  if(state.water<1 || target.waterings===flowerById.get(target.flowerId).waterNeeded) return state;
  return validateMeadow({...state,water:state.water-1,plants:state.plants.map((plant,i)=>
    i===index?{...plant,waterings:plant.waterings+1}:plant)});
}

export function nextAction(state) {
  validateMeadow(state);
  if(state.pendingSeed!==null) return 'plant';
  if(state.water>0 && state.plants.some((plant)=>plant.waterings<flowerById.get(plant.flowerId).waterNeeded)) return 'water';
  if(state.shells>=PACK_PRICE) return 'pack';
  return 'learn';
}
