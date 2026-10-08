import test from 'node:test';
import assert from 'node:assert/strict';
import {createState,recordResult,getDailyPlan,getCheckupPlan,recordCheckup,validateImport,getStats} from '../src/learning.js';
import {getGarden,recordGardenAction} from '../src/garden.js';
const lessons=[{id:'one'},{id:'two'},{id:'three'}];
function fixture(){
  let state=createState('2026-10-01');
  for(const [id,date] of [['one','2026-10-01'],['two','2026-10-02'],['three','2026-10-03']])state=recordResult(state,id,'good',date,{isNew:true});
  for(const [id,date] of [['one','2026-10-02'],['two','2026-10-03'],['three','2026-10-04'],['one','2026-10-05'],['two','2026-10-06'],['three','2026-10-07']])state=recordResult(state,id,'good',date);
  return state;
}
const resultsFor=(state,date,spoken='good')=>getCheckupPlan(state,lessons,date).ids.map(lessonId=>({lessonId,meaning:true,spoken}));
test('checkup waits seven local calendar days and offers at most three delayed old phrases',()=>{
  const state=fixture();assert.equal(getCheckupPlan(state,lessons,'2026-10-07').due,false);
  const plan=getCheckupPlan(state,lessons,'2026-10-08');assert.equal(plan.due,true);assert.equal(plan.ids.length,3);assert.equal(plan.nextDate,'2026-10-08');
  assert.deepEqual(getCheckupPlan(state,lessons,'2026-11-08').ids,plan.ids);
});
test('freshly learned and already reviewed today are excluded from a checkup',()=>{
  let state=fixture();state=recordResult(state,'one','good','2026-10-12');
  assert.ok(!getCheckupPlan(state,lessons,'2026-10-12').ids.includes('one'));
  const recent=recordResult(createState('2026-10-01'),'one','good','2026-10-07',{isNew:true});
  assert.equal(getCheckupPlan(recent,lessons,'2026-10-08').due,false);
});
test('a completed checkup is idempotent and cannot promote or postpone ordinary reviews',()=>{
  const state=fixture(),results=resultsFor(state,'2026-10-08');
  const next=recordCheckup(state,lessons,results,'2026-10-08');assert.deepEqual(next.cards,state.cards);assert.deepEqual(state.checkups,{});
  assert.deepEqual(recordCheckup(next,lessons,results,'2026-10-08'),next);
  assert.equal(getCheckupPlan(next,lessons,'2026-10-14').due,false);assert.equal(getCheckupPlan(next,lessons,'2026-10-15').due,true);
});
test('recognition or spoken recall difficulty brings that card back tomorrow without fake mastery',()=>{
  for(const outcome of [{meaning:false,spoken:'good'},{meaning:true,spoken:'help'},{meaning:true,spoken:'again'}]){
    const state=fixture(),results=resultsFor(state,'2026-10-08');Object.assign(results[0],outcome);
    const checked=recordCheckup(state,lessons,results,'2026-10-08');
    assert.deepEqual(getDailyPlan(checked,lessons,'2026-10-08').dueIds,[]);
    assert.deepEqual(getDailyPlan(checked,lessons,'2026-10-09').dueIds,[results[0].lessonId]);
    const reviewed=recordResult(checked,results[0].lessonId,'help','2026-10-09');
    assert.deepEqual(validateImport(reviewed,lessons),reviewed);
    assert.equal(reviewed.cards[results[0].lessonId].due,'2026-10-10');
  }
});
test('old version-one backups migrate without losing learning records',()=>{
  const legacy=fixture();delete legacy.checkups;const imported=validateImport(legacy,lessons);
  assert.deepEqual(imported.cards,legacy.cards);assert.deepEqual(imported.days,legacy.days);assert.deepEqual(imported.checkups,{});
});
test('checkup backup rejects unknown IDs, duplicate claims, invalid dates and fabricated early checks',()=>{
  const state=recordCheckup(fixture(),lessons,resultsFor(fixture(),'2026-10-08'),'2026-10-08');
  assert.deepEqual(validateImport(state,lessons),state);
  for(const change of [
    s=>{s.checkups['2026-10-08'][0].lessonId='unknown';},
    s=>{s.checkups['2026-10-08'][1]={...s.checkups['2026-10-08'][0]};},
    s=>{s.checkups['2026-10-08'][0].meaning=1;},
    s=>{s.checkups['2026-10-08'][0].spoken='mastered';},
    s=>{s.checkups['2026-10-08'][0].untrusted=true;},
    s=>{s.checkups['2026-10-09']=s.checkups['2026-10-08'];},
    s=>{s.checkups['2026-10-02']=s.checkups['2026-10-08'];delete s.checkups['2026-10-08'];}
  ]){const bad=structuredClone(state);change(bad);assert.throws(()=>validateImport(bad,lessons));}
});
test('partial, repeated, premature and future-backdated checkups cannot be recorded',()=>{
  const state=fixture(),results=resultsFor(state,'2026-10-08');
  assert.throws(()=>recordCheckup(state,lessons,results.slice(0,2),'2026-10-08'));
  assert.throws(()=>recordCheckup(state,lessons,results,'2026-10-07'));
  assert.throws(()=>recordCheckup(state,lessons,[results[0],results[0],results[2]],'2026-10-08'));
  const later=recordCheckup(state,lessons,results,'2026-10-15');assert.throws(()=>recordCheckup(later,lessons,results,'2026-10-08'));
});

test('backup cannot mark a partial three-question checkup as complete or award its garden reward',()=>{
  const state=fixture(),before=structuredClone(state);
  const partial={...state,checkups:{'2026-10-08':resultsFor(state,'2026-10-08').slice(0,1)}};
  assert.throws(()=>validateImport(partial,lessons),/小测/);
  assert.deepEqual(state,before);
  assert.equal(getGarden(state,'2026-10-08').earned.checkups,0);
});

test('backup preserves a full checkup followed by an ordinary review on the same day',()=>{
  let state=fixture();
  state=recordCheckup(state,lessons,resultsFor(state,'2026-10-12','help'),'2026-10-12');
  state=recordResult(state,'one','good','2026-10-12');
  assert.deepEqual(validateImport(state,lessons),state);
});

test('backup preserves a smaller complete checkup after an ordinary review, but rejects an incomplete one',()=>{
  let state=recordResult(fixture(),'one','good','2026-10-12');
  const results=resultsFor(state,'2026-10-12');
  assert.equal(results.length,2);
  state=recordCheckup(state,lessons,results,'2026-10-12');
  assert.deepEqual(validateImport(state,lessons),state);
  const bad=structuredClone(state);bad.checkups['2026-10-12'].pop();
  assert.throws(()=>validateImport(bad,lessons),/小测/);
});

test('backup can place a complete checkup between two ordinary reviews that day',()=>{
  let state=recordResult(fixture(),'one','good','2026-10-14');
  state=recordCheckup(state,lessons,resultsFor(state,'2026-10-14'),'2026-10-14');
  state=recordResult(state,'two','good','2026-10-14');
  assert.deepEqual(validateImport(state,lessons),state);
});

test('garden spending from a genuine checkup survives import, while a truncated checkup is rejected',()=>{
  let state=fixture();
  state=recordCheckup(state,lessons,resultsFor(state,'2026-10-08','again'),'2026-10-08');
  state=recordGardenAction(state,{type:'plant',plot:0,kind:'sunflower'},'2026-10-08');
  state=recordGardenAction(state,{type:'water',plot:0},'2026-10-08');
  state=recordGardenAction(state,{type:'fertilize',plot:0},'2026-10-08');
  const imported=validateImport(state,lessons);
  assert.deepEqual(imported,state);
  assert.equal(getGarden(imported,'2026-10-08').plots[0].growth,2);
  const bad=structuredClone(state);bad.checkups['2026-10-08']=bad.checkups['2026-10-08'].slice(0,1);
  assert.throws(()=>validateImport(bad,lessons),/小测/);
  assert.equal(getGarden(imported,'2026-10-08').earned.checkups,1);
});

test('checkup-only days count in daily footprints without changing ordinary-practice totals',()=>{
  const before=fixture(),ordinary=getStats(before,lessons,'2026-10-08');
  const state=recordCheckup(before,lessons,resultsFor(before,'2026-10-08'),'2026-10-08');
  const stats=getStats(state,lessons,'2026-10-08');
  assert.equal(stats.practicedDays,ordinary.practicedDays+1);
  assert.equal(stats.totalPracticeCount,ordinary.totalPracticeCount);
  assert.equal(stats.checkupCount,3);
  assert.deepEqual(stats.last7Days.at(-1),{date:'2026-10-08',practiced:true,totalDone:3});
  assert.equal(getStats(state,lessons,'2026-10-07').checkupCount,0);
});

test('ordinary practice and a checkup on one date contribute one practiced day',()=>{
  let state=fixture();
  const before=getStats(state,lessons,'2026-10-12');
  state=recordCheckup(state,lessons,resultsFor(state,'2026-10-12'),'2026-10-12');
  state=recordResult(state,'one','good','2026-10-12');
  const after=getStats(state,lessons,'2026-10-12');
  assert.equal(after.practicedDays,before.practicedDays+1);
  assert.equal(after.totalPracticeCount,before.totalPracticeCount+1);
  assert.equal(after.checkupCount,3);
  assert.deepEqual(after.last7Days.at(-1),{date:'2026-10-12',practiced:true,totalDone:4});
});
