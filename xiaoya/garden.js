/** Local participation rewards only: flowers and balances are never learning evidence. */
export const GARDEN_KEY = 'xiaoya-english:garden:v1';
export const FLOWERS = Object.freeze([
  {id:'daisy',name:'雏菊',color:'#fff8e7'},
  {id:'tulip',name:'郁金香',color:'#e99080'},
  {id:'sunflower',name:'向日葵',color:'#efbc50'},
  {id:'bellflower',name:'风铃花',color:'#91a9d1'},
  {id:'poppy',name:'虞美人',color:'#d76d58'},
  {id:'violet',name:'紫罗兰',color:'#ad91bc'},
].map(Object.freeze));

const PRODUCT = 'xiaoya-english-garden';
const EVENTS = new Set(['food-water','play-box','hello-goodbye']);
const SHELL_REWARD = 3;
const WATER_REWARD = 2;
const PACK_PRICE = 3;
const BLOOM_WATERINGS = 2;
const fail = (message) => { throw new Error(`小芽花园记录无效：${message}`); };
const own = (value,key) => Object.prototype.hasOwnProperty.call(value,key);

function fields(value,expected) {
  if(!value || typeof value!=='object' || Array.isArray(value) || ![Object.prototype,null].includes(Object.getPrototypeOf(value))) fail('应为普通对象');
  if(Object.keys(value).length!==expected.length || expected.some((key)=>!own(value,key))) fail('字段缺失或含有未知字段');
}

function whole(value,label) {
  if(!Number.isSafeInteger(value) || value<0) fail(`${label}应为非负安全整数`);
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
  if(!EVENTS.has(value.eventId)) fail('未知故事');
  day(value.date);
}

const flowerFor = (serial) => FLOWERS[(serial-1)%FLOWERS.length].id;
const remainingBag = (opened) => FLOWERS.slice(opened%FLOWERS.length).map((flower)=>flower.id);

export function createGarden() {
  return {
    schemaVersion:1,product:PRODUCT,shells:0,water:0,rounds:[],
    seedPacksOpened:0,bag:remainingBag(0),pendingSeed:null,plants:[],
  };
}

/** Validate restored JSON without repairing, resetting or changing any record. */
export function validateGarden(state) {
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
  if(state.seedPacksOpened!==state.plants.length+(state.pendingSeed===null?0:1)) fail('购买、待播种与花盆数量不符');
  let usedWater=0;
  for(const [index,plant] of state.plants.entries()) {
    fields(plant,['id','seedId','flowerId','waterings']);
    const serial=index+1;
    if(plant.id!==`plant-${serial}` || plant.seedId!==`seed-${serial}` || plant.flowerId!==flowerFor(serial)) fail('花盆、种子或品种不符');
    whole(plant.waterings,'浇水次数');
    if(plant.waterings>BLOOM_WATERINGS) fail('浇水次数超出开花所需');
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

/** Call only after a complete interaction. A repeated round never adds another reward. */
export function rewardRound(state,input) {
  validateGarden(state); validateRound(input);
  const previous=state.rounds.find((round)=>round.roundId===input.roundId);
  if(previous) {
    if(previous.eventId!==input.eventId || previous.date!==input.date) fail('同一互动编号不能覆盖原始参与记录');
    return state;
  }
  const next={...state,shells:state.shells+SHELL_REWARD,water:state.water+WATER_REWARD,
    rounds:[...state.rounds,{roundId:input.roundId,eventId:input.eventId,date:input.date}]};
  return validateGarden(next);
}

/** Save this returned state before revealing the seed. Pending seeds cannot be rerolled. */
export function openSeedPack(state) {
  validateGarden(state);
  if(state.pendingSeed!==null || state.shells<PACK_PRICE) return state;
  const serial=state.seedPacksOpened+1;
  return validateGarden({...state,shells:state.shells-PACK_PRICE,seedPacksOpened:serial,
    bag:remainingBag(serial),pendingSeed:{id:`seed-${serial}`,flowerId:state.bag[0]}});
}

/** Each planted seed receives a new, stable pot; existing pots are never replaced. */
export function plantSeed(state) {
  validateGarden(state);
  if(state.pendingSeed===null) return state;
  const plant={id:`plant-${state.seedPacksOpened}`,seedId:state.pendingSeed.id,flowerId:state.pendingSeed.flowerId,waterings:0};
  return validateGarden({...state,pendingSeed:null,plants:[...state.plants,plant]});
}

/** Valid but unavailable actions are no-ops. Unknown pots and malformed state throw. */
export function waterPlant(state,plantId) {
  validateGarden(state);
  const index=state.plants.findIndex((plant)=>plant.id===plantId);
  if(index===-1) fail('找不到花盆');
  if(state.water<1 || state.plants[index].waterings===BLOOM_WATERINGS) return state;
  return validateGarden({...state,water:state.water-1,plants:state.plants.map((plant,i)=>
    i===index?{...plant,waterings:plant.waterings+1}:plant)});
}

export function gardenNextAction(state) {
  validateGarden(state);
  if(state.pendingSeed!==null) return 'plant';
  if(state.water>0 && state.plants.some((plant)=>plant.waterings<BLOOM_WATERINGS)) return 'water';
  if(state.shells>=PACK_PRICE) return 'pack';
  return 'learn';
}
