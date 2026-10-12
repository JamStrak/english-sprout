import test from 'node:test';
import assert from 'node:assert/strict';
import {hasOwn,last,cloneData} from '../src/compat.js';
import {createState,getDailyPlan,recordResult,getStats,getCheckupPlan,recordCheckup,validateImport} from '../src/learning.js';
import {getGarden,recordGardenAction} from '../src/garden.js';

function withoutRecentBuiltins(run) {
  const targets=[[Object,'hasOwn'],[Array.prototype,'at'],[globalThis,'structuredClone']];
  const originals=targets.map(([object,key])=>Object.getOwnPropertyDescriptor(object,key));
  try {
    targets.forEach(([object,key])=>Object.defineProperty(object,key,{value:undefined,configurable:true,writable:true}));
    return run();
  } finally {
    targets.forEach(([object,key],index)=>{
      if(originals[index])Object.defineProperty(object,key,originals[index]);
      else delete object[key];
    });
  }
}

test('ownership checks keep null-prototype and shadowed-property protections on older browsers',()=>{
  withoutRecentBuiltins(()=>{
    const nullPrototype=Object.create(null);nullPrototype.hello=true;
    assert.equal(hasOwn(nullPrototype,'hello'),true);
    assert.equal(hasOwn(nullPrototype,'toString'),false);
    const shadowed={hasOwnProperty:()=>false,hello:true};
    assert.equal(hasOwn(shadowed,'hello'),true);
    assert.equal(hasOwn(Object.create({hello:true}),'hello'),false);
    assert.equal(last([]),undefined);
    assert.equal(last(['first','last']),'last');
    const original={value:null,children:[{ready:true,amount:2,name:'小芽'}]};
    const copy=cloneData(original);assert.deepEqual(copy,original);
    copy.children[0].name='changed';assert.equal(original.children[0].name,'小芽');
  });
});

function practiceJourney() {
  const lessons=['hello-01','hello-02','hello-03'].map(id=>({id}));
  const first='2026-10-01',second='2026-10-02',third='2026-10-03';
  let state=createState(first);
  const initial=getDailyPlan(state,lessons,first);
  assert.equal(initial.newLessonId,'hello-01');assert.deepEqual(initial.dueIds,[]);
  assert.equal(getCheckupPlan(state,lessons,first).due,false);
  state=recordResult(state,'hello-01','good',first,{isNew:true});
  const beforePlant=JSON.stringify(state);
  let planted=recordGardenAction(state,{type:'plant',plot:0,kind:'sunflower'},first);
  assert.equal(JSON.stringify(state),beforePlant);
  planted.settings.nickname='花园小芽';assert.equal(state.settings.nickname,'小芽');
  state=recordGardenAction(planted,{type:'water',plot:0},first);
  assert.equal(getGarden(state,first).plots[0].lastCareDate,first);
  assert.deepEqual(getDailyPlan(state,lessons,second).dueIds,['hello-01']);
  state=recordResult(state,'hello-01','good',second);
  state=recordResult(state,'hello-02','help',second,{isNew:true});
  state=recordGardenAction(state,{type:'water',plot:0},second);
  state=recordResult(state,'hello-03','again',third,{isNew:true});
  state=recordGardenAction(state,{type:'water',plot:0},third);
  assert.equal(getGarden(state,third).plots[0].canHarvest,true);
  state=recordGardenAction(state,{type:'harvest',plot:0},third);
  assert.equal(getGarden(state,third).collection[0].count,1);
  for(const day of ['2026-10-08','2026-10-15']){
    const plan=getCheckupPlan(state,lessons,day);assert.equal(plan.due,true);
    state=recordCheckup(state,lessons,plan.ids.map(lessonId=>({lessonId,meaning:true,spoken:'help'})),day);
    assert.equal(getCheckupPlan(state,lessons,day).lastDate,day);
  }
  const imported=validateImport(JSON.parse(JSON.stringify(state)),lessons);
  assert.deepEqual(imported,state);
  assert.throws(()=>recordGardenAction(state,{type:'plant',plot:0,kind:'tulip'},first),/操作日期早于已有记录/);
  return {initial,state,plan:getDailyPlan(state,lessons,'2026-10-15'),stats:getStats(state,lessons,'2026-10-15'),garden:getGarden(state,'2026-10-15')};
}

test('first lesson, delayed review, weekly checkup, garden and saved progress work without Safari 15.4 built-ins',()=>{
  const supported=practiceJourney();
  const olderBrowser=withoutRecentBuiltins(practiceJourney);
  assert.deepEqual(olderBrowser,supported);
});
