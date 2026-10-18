import test from 'node:test';
import assert from 'node:assert/strict';
import {EVENTS} from '../xiaoya/content.js';
import {CORE_PHRASE_EVENT_IDS, phraseIdFor, phraseEvents} from '../xiaoya/curriculum.js';
import {createState,recordEvidence,correctEvidence,completeEvent,goalStatus} from '../xiaoya/learning.js';
import {createGarden,rewardRound} from '../xiaoya/garden.js';
import {createMeadow,rewardRound as rewardMeadowRound} from '../xiaoya/garden-meadow.js';
import {PRACTICE_KEY,REVIEW_INTERVALS,addPracticeDays,createPracticePlan,validatePracticePlan,recordPractice,getPracticePlan} from '../xiaoya/practice-plan.js';

const day='2026-10-01';
const eventId='food-water';
const clone=value=>JSON.parse(JSON.stringify(value));
const round=(roundId,eventId='food-water',date=day)=>({roundId,eventId,date});
const card=(result,id=eventId)=>result.cards.find(item=>item.eventId===id);
function freeze(value) {
  if(value&&typeof value==='object') { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
}
function attempt(attemptId,date=day,overrides={}) {
  return {attemptId,eventId,date,kind:'speech',result:'independent',source:'parent',helped:false,...overrides};
}
function practicePair(plan,state,id,date,{event=eventId,result='independent',source='parent',helped=false,mode='review'}={}) {
  const attemptId=`${id}-speech`;
  return {
    state:recordEvidence(state,attempt(attemptId,date,{eventId:event,result,source,helped})),
    plan:recordPractice(plan,{...round(id,event,date),attemptId,mode}),
  };
}

test('practice log is separately versioned, immutable, idempotent and stores no recordings or transcript',()=>{
  const before=freeze(createPracticePlan());
  const input=freeze({...round('one'),attemptId:'speech-one',mode:'new'});
  const after=recordPractice(before,input);
  assert.equal(PRACTICE_KEY,'xiaoya-english:practice-plan:v1');
  assert.deepEqual(REVIEW_INTERVALS,[1,3,7,14,30]);
  assert.equal(validatePracticePlan(after),after);
  assert.equal(before.entries.length,0);
  assert.notEqual(after,before);
  assert.equal(recordPractice(after,input),after);
  assert.throws(()=>recordPractice(after,{...input,attemptId:null}));
  assert.throws(()=>recordPractice(before,{...input,transcript:'private'}));
  assert.throws(()=>recordPractice(before,{...input,audio:'private'}));
  assert.throws(()=>recordPractice(before,{...input,date:new Date(2026,9,1)}));
  assert.deepEqual(recordPractice(before,round('plain')).entries[0],{...round('plain'),attemptId:null,mode:'free',rewardVariant:null});
  assert.deepEqual(validatePracticePlan(clone(after)),after);
});

test('reward intent survives serialization and cannot be moved, removed or duplicated by a retry',()=>{
  for(const rewardVariant of ['a','b',null]) {
    const input=freeze({...round('reward'),attemptId:'speech-reward',mode:'review',rewardVariant});
    const plan=freeze(clone(recordPractice(createPracticePlan(),input)));
    assert.equal(validatePracticePlan(plan),plan);
    assert.equal(plan.entries[0].rewardVariant,rewardVariant);
    assert.equal(recordPractice(plan,input),plan);
    for(const conflicting of ['a','b',null].filter(value=>value!==rewardVariant)) {
      assert.throws(()=>recordPractice(plan,{...input,rewardVariant:conflicting}),/不能覆盖/);
    }
    if(rewardVariant!==null) {
      const withoutIntent={...input};delete withoutIntent.rewardVariant;
      assert.throws(()=>recordPractice(plan,withoutIntent),/不能覆盖/);
    }
  }
});

test('legacy five-field entries remain unchanged and cannot acquire an unproven reward intent',()=>{
  const legacy=freeze({...createPracticePlan(),entries:[{...round('old'),attemptId:null,mode:'free'}]});
  const serialized=JSON.stringify(legacy);
  assert.equal(validatePracticePlan(legacy),legacy);
  assert.equal(recordPractice(legacy,round('old')),legacy);
  assert.equal(recordPractice(legacy,{...round('old'),rewardVariant:null}),legacy);
  for(const rewardVariant of ['a','b']) assert.throws(()=>recordPractice(legacy,{...round('old'),rewardVariant}),/不能覆盖/);
  const updated=recordPractice(legacy,{...round('new','play-box'),rewardVariant:'b'});
  assert.equal(updated.entries[0],legacy.entries[0]);
  assert.equal(Object.hasOwn(updated.entries[0],'rewardVariant'),false);
  assert.equal(JSON.stringify(legacy),serialized);
  assert.deepEqual(validatePracticePlan(clone(updated)),updated);
  const current=recordPractice(createPracticePlan(),{...round('old'),rewardVariant:'a'});
  assert.deepEqual(getPracticePlan(current,{date:day}),getPracticePlan(legacy,{date:day}),'reward routing does not change the learning schedule');
});

test('reward intent accepts only the two gardens or explicit null in persisted entries',()=>{
  const base=recordPractice(createPracticePlan(),round('one'));
  for(const rewardVariant of [undefined,'c','A','',true,0,{},[]]) {
    const invalid={...base,entries:[{...base.entries[0],rewardVariant}]};
    assert.throws(()=>validatePracticePlan(invalid),/奖励花园错误/);
    if(rewardVariant!==undefined) assert.throws(()=>recordPractice(createPracticePlan(),{...round('bad'),rewardVariant}),/奖励花园错误/);
  }
  assert.equal(recordPractice(createPracticePlan(),{...round('default'),rewardVariant:undefined}).entries[0].rewardVariant,null);
});

test('malformed persisted plans fail without clearing or modifying the supplied data',()=>{
  const valid=recordPractice(createPracticePlan(),round('one'));
  for(const invalid of [
    null,{}, {...valid,schemaVersion:2},{...valid,product:'english-sprout'},
    {...valid,entries:[valid.entries[0],valid.entries[0]]},
    {...valid,entries:[{...valid.entries[0],date:'2026-02-29'}]},
    {...valid,entries:[{...valid.entries[0],eventId:'unknown'}]},
    {...valid,entries:[{...valid.entries[0],roundId:'__proto__'}]},
    {...valid,entries:[{...valid.entries[0],attemptId:''}]},
    {...valid,entries:[{...valid.entries[0],mode:'passed'}]},
    {...valid,entries:[{...valid.entries[0],extra:true}]},
  ]) {
    const original=clone(invalid);
    assert.throws(()=>validatePracticePlan(invalid));
    assert.deepEqual(invalid,original);
  }
});

test('calendar dates preserve local midnight and skip leap/year boundaries without elapsed-hour drift',()=>{
  assert.equal(getPracticePlan(createPracticePlan(),{date:new Date(2026,9,1,0,1)}).date,day);
  assert.equal(addPracticeDays('2024-02-28',1),'2024-02-29');
  assert.equal(addPracticeDays('2024-02-29',1),'2024-03-01');
  assert.equal(addPracticeDays('2026-12-31',1),'2027-01-01');
  assert.equal(addPracticeDays('2026-03-08',1),'2026-03-09');
  assert.equal(addPracticeDays('2026-11-01',1),'2026-11-02');
  assert.throws(()=>addPracticeDays(day,1.5));
  assert.throws(()=>addPracticeDays('2026-02-30',1));
});

test('fresh children get the first single story; complete participation reveals the next without claiming speech',()=>{
  const empty=freeze(createState());
  const first=CORE_PHRASE_EVENT_IDS[0];
  const plan=recordPractice(createPracticePlan(),{...round('first',first),mode:'new'});
  assert.deepEqual(getPracticePlan(createPracticePlan(),{date:day}).next,{eventId:first,mode:'new',reason:'unseen',dueDate:null});
  const result=getPracticePlan(freeze(plan),{date:day,learningState:empty});
  assert.equal(result.next.eventId,CORE_PHRASE_EVENT_IDS[1]);
  assert.equal(result.next.mode,'new');
  assert.equal(result.unseenIds.length,CORE_PHRASE_EVENT_IDS.length-1);
  assert.equal(card(result,first).lastOutcome,'not-attempted');
  assert.equal(card(result,first).dueDate,'2026-10-02');
  assert.equal(card(result,first).stage,0);
  assert.deepEqual(empty,createState());
});

test('A/B participation is shared and duplicate rewards cannot create extra review days',()=>{
  const a=rewardRound(createGarden(),round('shared'));
  let b=rewardMeadowRound(createMeadow(),round('shared'));
  b=rewardMeadowRound(b,round('box','play-box'));
  const plan=recordPractice(createPracticePlan(),{...round('shared'),mode:'new'});
  const result=getPracticePlan(clone(plan),{rounds:[...a.rounds,...b.rounds],date:day});
  assert.equal(result.next.eventId,CORE_PHRASE_EVENT_IDS[0]);
  assert.equal(result.cards.length,2);
  assert.equal(card(result).completedDays,1);
  assert.equal(card(result).playCount,1);
  assert.throws(()=>getPracticePlan(plan,{rounds:[round('shared','play-box')],date:day}));
  assert.throws(()=>getPracticePlan(createPracticePlan(),{rounds:[round('same'),round('same','play-box')],date:day}));
});

test('legacy completions preserve first/last exposure and course position without inventing count dates',()=>{
  let state=createState();
  for(const id of [...CORE_PHRASE_EVENT_IDS.slice(0,3),eventId]) state=completeEvent(state,id,day);
  state=completeEvent(state,eventId,'2026-10-03');
  state=completeEvent(state,eventId,'2026-10-04');
  const result=getPracticePlan(createPracticePlan(),{learningState:freeze(state),date:'2026-10-04'});
  assert.equal(card(result).firstDate,day);
  assert.equal(card(result).lastDate,'2026-10-04');
  assert.equal(card(result).completedDays,2,'only the known first/last dates are reconstructed');
  assert.equal(card(result).stage,0);
  assert.equal(result.unseenIds[0],CORE_PHRASE_EVENT_IDS[3]);
  assert.equal(result.next.mode,'review');
  assert.notEqual(result.next.eventId,eventId,'today\'s completed story is not immediately tested again');
});

test('legacy parent checkups count as contact; listening, device errors and abandoned machine attempts do not',()=>{
  let state=recordEvidence(createState(),attempt('old-checkup'));
  state=recordEvidence(state,attempt('only-listening',day,{eventId:'play-box',kind:'listening'}));
  state=recordEvidence(state,attempt('abandoned-machine',day,{eventId:'hello-goodbye',source:'machine'}));
  state=recordEvidence(state,attempt('broken-device',day,{eventId:'hello-morning',result:'device_error'}));
  const result=getPracticePlan(createPracticePlan(),{learningState:state,date:day});
  assert.deepEqual(result.cards.map(item=>item.eventId),[eventId]);
  assert.equal(card(result).lastOutcome,'parent-independent');
  assert.equal(result.next.eventId,CORE_PHRASE_EVENT_IDS[0]);
});

test('legacy contact reconstruction cannot collide with a real garden round identifier',()=>{
  const state=completeEvent(createState(),eventId,day);
  const result=getPracticePlan(createPracticePlan(),{learningState:state,rounds:[round(`legacy:${eventId}:${day}`,'play-box')],date:day});
  assert.deepEqual(result.cards.map(item=>item.eventId),[eventId,'play-box']);
});

test('only independent due-day speech advances the 1/3/7/14/30 calendar intervals, capped at 30',()=>{
  let plan=createPracticePlan(),state=createState();
  const cases=[
    [day,'2026-10-02',0],['2026-10-02','2026-10-05',1],
    ['2026-10-05','2026-10-12',2],['2026-10-12','2026-10-26',3],
    ['2026-10-26','2026-11-25',4],['2026-11-25','2026-12-25',4],
  ];
  for(const [index,[date,dueDate,stage]] of cases.entries()) {
    ({plan,state}=practicePair(plan,state,`round-${index}`,date,{mode:index?'review':'new'}));
    const item=card(getPracticePlan(plan,{learningState:state,date}));
    assert.equal(item.dueDate,dueDate);
    assert.equal(item.stage,stage);
    assert.equal(item.intervalDays,REVIEW_INTERVALS[stage]);
    assert.equal(item.completedDays,index+1);
    assert.equal(item.practicedToday,true);
    assert.equal(item.due,false);
  }
});

test('supported, unclear, not-yet, device-error and silent completed rounds do not increase intervals',()=>{
  for(const [index,details] of [
    {result:'supported',helped:true,outcome:'supported'},
    {result:'independent',helped:true,outcome:'supported'},
    {result:'not_yet',outcome:'not-yet'},
    {result:'unclear',outcome:'unclear'},
    {result:'device_error',outcome:'device-error'},
    {result:null,outcome:'not-attempted'},
  ].entries()) {
    let plan=recordPractice(createPracticePlan(),round(`first-${index}`));
    let state=createState();
    ({plan,state}=practicePair(plan,state,`second-${index}`,'2026-10-02'));
    if(details.result) ({plan,state}=practicePair(plan,state,`retry-${index}`,'2026-10-05',details));
    else plan=recordPractice(plan,{...round(`retry-${index}`,eventId,'2026-10-05'),mode:'review'});
    const item=card(getPracticePlan(plan,{learningState:state,date:'2026-10-05'}));
    assert.equal(item.stage,1,details.outcome);
    assert.equal(item.intervalDays,1,details.outcome);
    assert.equal(item.dueDate,'2026-10-06',details.outcome);
    assert.equal(item.lastOutcome,details.outcome);
  }
});

test('independent speech after a next-day retry restores its earned interval before testing a longer gap',()=>{
  let plan=recordPractice(createPracticePlan(),round('first')),state=createState();
  ({plan,state}=practicePair(plan,state,'three-days','2026-10-02'));
  ({plan,state}=practicePair(plan,state,'needed-help','2026-10-05',{result:'supported',helped:true}));
  ({plan,state}=practicePair(plan,state,'recovered','2026-10-06'));
  let item=card(getPracticePlan(plan,{learningState:state,date:'2026-10-06'}));
  assert.equal(item.stage,1);
  assert.equal(item.intervalDays,3);
  assert.equal(item.dueDate,'2026-10-09');
  ({plan,state}=practicePair(plan,state,'retained-three-days','2026-10-09'));
  item=card(getPracticePlan(plan,{learningState:state,date:'2026-10-09'}));
  assert.equal(item.stage,2);
  assert.equal(item.intervalDays,7);
  assert.equal(item.dueDate,'2026-10-16');
});

test('same-day repeats cannot turn supported recall into an independent interval or promote multiple times',()=>{
  let plan=recordPractice(createPracticePlan(),round('initial')),state=createState();
  ({plan,state}=practicePair(plan,state,'help-first','2026-10-02',{result:'supported',helped:true}));
  ({plan,state}=practicePair(plan,state,'later-repeat','2026-10-02'));
  let item=card(getPracticePlan(plan,{learningState:state,date:'2026-10-02'}));
  assert.equal(item.stage,0);
  assert.equal(item.lastOutcome,'supported');
  assert.equal(item.completedDays,2);
  assert.equal(item.playCount,3);
  ({plan,state}=practicePair(plan,state,'tomorrow','2026-10-03'));
  ({plan,state}=practicePair(plan,state,'tomorrow-repeat','2026-10-03'));
  item=card(getPracticePlan(plan,{learningState:state,date:'2026-10-03'}));
  assert.equal(item.stage,1);
  assert.equal(item.dueDate,'2026-10-06');
  assert.equal(item.completedDays,3);
});

test('independent early rehearsals leave the existing due date and stage intact',()=>{
  let plan=recordPractice(createPracticePlan(),round('initial')),state=createState();
  ({plan,state}=practicePair(plan,state,'due','2026-10-02'));
  ({plan,state}=practicePair(plan,state,'early','2026-10-03',{mode:'free'}));
  const item=card(getPracticePlan(plan,{learningState:state,date:'2026-10-03'}));
  assert.equal(item.stage,1);
  assert.equal(item.dueDate,'2026-10-05');
});

test('machine candidates may change schedule without claiming parent-verified mastery',()=>{
  let plan=createPracticePlan(),state=createState();
  ({plan,state}=practicePair(plan,state,'first',day,{source:'machine',mode:'new'}));
  ({plan,state}=practicePair(plan,state,'second','2026-10-02',{source:'machine'}));
  const before=clone(state);
  const result=getPracticePlan(freeze(plan),{learningState:freeze(state),date:'2026-10-02'});
  assert.equal(card(result).stage,1);
  assert.equal(card(result).lastOutcome,'machine-candidate');
  const status=goalStatus(state,EVENTS.find(event=>event.id===eventId).goalId);
  assert.equal(status.independent,false);
  assert.equal(status.passed,false);
  assert.equal(status.retained,false);
  assert.deepEqual(state,before);
});

test('parent corrections recalculate intervals without overwriting the practice log or leaking into earlier date queries',()=>{
  let plan=recordPractice(createPracticePlan(),round('initial')),state=createState();
  ({plan,state}=practicePair(plan,state,'candidate','2026-10-02',{source:'machine'}));
  const originalPlan=clone(plan);
  state=correctEvidence(state,'candidate-speech',{correctionId:'parent-correction',result:'supported',helped:true,date:'2026-10-03'});
  assert.equal(card(getPracticePlan(plan,{learningState:state,date:'2026-10-02'})).stage,1);
  const current=card(getPracticePlan(plan,{learningState:state,date:'2026-10-03'}));
  assert.equal(current.stage,0);
  assert.equal(current.dueDate,'2026-10-03');
  assert.equal(current.lastOutcome,'supported');
  assert.deepEqual(plan,originalPlan);
});

test('only the recorded attempt belongs to a completed round; unrelated same-day evidence cannot upgrade silence',()=>{
  const state=recordEvidence(createState(),attempt('unrelated','2026-10-02'));
  let plan=recordPractice(createPracticePlan(),round('initial'));
  plan=recordPractice(plan,{...round('silent',eventId,'2026-10-02'),mode:'review'});
  assert.equal(card(getPracticePlan(plan,{learningState:state,date:'2026-10-02'})).lastOutcome,'not-attempted');
  for(const [event,date] of [['play-box','2026-10-02'],[eventId,'2026-10-03']]) {
    const other=recordPractice(createPracticePlan(),{...round('mismatch',event,date),attemptId:'unrelated',mode:'review'});
    assert.throws(()=>getPracticePlan(other,{learningState:state,date:'2026-10-03'}));
  }
  const missing=recordPractice(createPracticePlan(),{...round('missing'),attemptId:'unknown-attempt',mode:'review'});
  assert.equal(card(getPracticePlan(missing,{date:day})).lastOutcome,'not-attempted');
});

test('due dates outrank new content, but two reviews allow a new story across reload and A/B switches',()=>{
  const ids=CORE_PHRASE_EVENT_IDS.slice(0,3);
  const rounds=ids.map((id,index)=>round(`legacy-${index}`,id));
  let plan=createPracticePlan(),state=createState();
  const current=()=>getPracticePlan(clone(plan),{rounds,learningState:clone(state),date:'2026-10-02'});
  assert.deepEqual(current().dueIds,ids);
  assert.equal(current().next.eventId,ids[0]);
  ({plan,state}=practicePair(plan,state,'review-1','2026-10-02',{event:ids[0]}));
  assert.equal(current().next.eventId,ids[1]);
  assert.equal(current().reviewStreak,1);
  ({plan,state}=practicePair(plan,state,'review-2','2026-10-02',{event:ids[1]}));
  assert.equal(current().next.eventId,CORE_PHRASE_EVENT_IDS[3]);
  assert.equal(current().next.mode,'new');
  assert.equal(current().next.reason,'new-after-reviews');
  assert.deepEqual(current().dueIds,[ids[2]]);
  plan=recordPractice(plan,{...round('new-story',CORE_PHRASE_EVENT_IDS[3],'2026-10-02'),mode:'new'});
  assert.equal(current().reviewStreak,0);
  assert.equal(current().next.eventId,ids[2]);
  assert.equal(current().next.mode,'review');
});

test('review assessments without garden rewards persist and tomorrow resets the two-review allowance',()=>{
  const rounds=CORE_PHRASE_EVENT_IDS.slice(0,3).map((id,index)=>round(`old-${index}`,id));
  let plan=createPracticePlan(),state=createState();
  for(const [index,id] of CORE_PHRASE_EVENT_IDS.slice(0,2).entries()) ({plan,state}=practicePair(plan,state,`assessment-${index}`,'2026-10-02',{event:id}));
  const today=getPracticePlan(plan,{rounds,learningState:state,date:'2026-10-02'});
  assert.equal(today.reviewStreak,2);
  assert.equal(today.next.mode,'new');
  const tomorrow=getPracticePlan(plan,{rounds,learningState:state,date:'2026-10-03'});
  assert.equal(tomorrow.reviewStreak,0);
  assert.equal(tomorrow.next.eventId,CORE_PHRASE_EVENT_IDS[2]);
  assert.equal(tomorrow.next.mode,'review');
});

test('oldest due dates come first regardless of story position and future records do not skip new lessons',()=>{
  const rounds=[round('water',eventId,'2026-10-03'),round('box','play-box',day),round('future','hello-goodbye','2026-10-20')];
  const result=getPracticePlan(createPracticePlan(),{rounds,date:'2026-10-04'});
  assert.deepEqual(result.dueIds,['play-box',eventId]);
  assert.equal(result.next.eventId,'play-box');
  assert.equal(result.unseenIds[0],CORE_PHRASE_EVENT_IDS[0]);
  assert.ok(result.unseenIds.includes('hello-goodbye'));
});

test('all current stories permit rotating familiar play, while remaining due stories never disappear behind the review cap',()=>{
  let plan=createPracticePlan();
  const ids=[...CORE_PHRASE_EVENT_IDS,...EVENTS.map(event=>event.id).filter(id=>!CORE_PHRASE_EVENT_IDS.includes(id))];
  for(const [index,id] of ids.entries()) plan=recordPractice(plan,{...round(`all-${index}`,id),mode:'new'});
  let result=getPracticePlan(plan,{date:day});
  assert.equal(result.unseenIds.length,0);
  assert.equal(result.next.mode,'free');
  assert.equal(result.next.eventId,CORE_PHRASE_EVENT_IDS[0]);
  plan=recordPractice(plan,{...round('free-first',CORE_PHRASE_EVENT_IDS[0]),mode:'free'});
  assert.equal(getPracticePlan(plan,{date:day}).next.eventId,CORE_PHRASE_EVENT_IDS[1]);
  for(const [index,id] of CORE_PHRASE_EVENT_IDS.slice(0,2).entries()) plan=recordPractice(plan,{...round(`review-all-${index}`,id,'2026-10-02'),mode:'review'});
  result=getPracticePlan(plan,{date:'2026-10-02'});
  assert.equal(result.reviewStreak,2);
  assert.equal(result.next.mode,'review');
  assert.equal(result.next.eventId,CORE_PHRASE_EVENT_IDS[2]);
});

test('new lessons use only the ordered core; previously played extensions remain due for review',()=>{
  const empty=getPracticePlan(createPracticePlan(),{date:day});
  assert.deepEqual(empty.unseenIds,CORE_PHRASE_EVENT_IDS);
  assert.equal(empty.cards.length,0);
  assert.equal(empty.unseenIds.includes('play-box'),false);
  const plan=recordPractice(createPracticePlan(),{...round('extension','care-zip'),rewardVariant:'b'});
  const result=getPracticePlan(plan,{date:'2026-10-02'});
  assert.deepEqual(result.unseenIds,CORE_PHRASE_EVENT_IDS);
  assert.deepEqual(result.dueIds,['care-zip']);
  assert.deepEqual(result.next,{eventId:'care-zip',mode:'review',reason:'due',dueDate:'2026-10-02'});
});

test('all old core scene contacts keep their phrase out of new lessons without migrating any IDs',()=>{
  for(const coreId of CORE_PHRASE_EVENT_IDS) for(const event of phraseEvents(coreId)) {
    const rounds=freeze([round(`old-${event.id}`,event.id)]);
    const state=freeze(completeEvent(createState(),event.id,day));
    const plan=freeze(recordPractice(createPracticePlan(),{...round(`new-${event.id}`,event.id),rewardVariant:'a'}));
    const before=JSON.stringify({rounds,state,plan});
    for(const options of [{rounds},{learningState:state},{}]) {
      const result=getPracticePlan(Object.keys(options).length?createPracticePlan():plan,{...options,date:day});
      assert.equal(result.unseenIds.includes(coreId),false,coreId);
      assert.equal(result.cards.length,1);
      assert.equal(result.cards[0].eventId,event.id);
      assert.equal(result.cards[0].phraseId,event.lessonId);
    }
    assert.equal(JSON.stringify({rounds,state,plan}),before);
  }
});

test('alternate scenes share one card and preserve the first familiar scene across refresh, rewards and corrections',()=>{
  let plan=createPracticePlan(),state=createState();
  ({plan,state}=practicePair(plan,state,'first-zip',day,{event:'care-zip',mode:'new'}));
  ({plan,state}=practicePair(plan,state,'later-box','2026-10-02',{event:'play-box',source:'machine'}));
  plan=recordPractice(plan,{...round('bridge-reward','play-bridge','2026-10-02'),mode:'free',rewardVariant:'b'});
  const before=JSON.stringify(plan);
  const current=()=>getPracticePlan(freeze(clone(plan)),{learningState:freeze(clone(state)),date:'2026-10-03'});
  let result=current();
  assert.equal(result.cards.length,1);
  assert.equal(result.cards[0].eventId,'care-zip');
  assert.equal(result.cards[0].phraseId,'needs-08');
  assert.equal(result.cards[0].lessonId,'needs-08');
  assert.equal(result.cards[0].stage,1);
  assert.equal(result.cards[0].dueDate,'2026-10-05');
  assert.equal(result.cards[0].playCount,3);
  assert.equal(result.cards[0].completedDays,2);
  state=correctEvidence(state,'later-box-speech',{correctionId:'correct-alias',result:'supported',helped:true,date:'2026-10-03'});
  result=current();
  assert.equal(result.cards[0].stage,0);
  assert.equal(result.cards[0].dueDate,'2026-10-03');
  assert.deepEqual(result.dueIds,['care-zip']);
  assert.equal(result.next.eventId,'care-zip');
  assert.equal(JSON.stringify(plan),before);
  assert.deepEqual(plan.entries.map(item=>[item.roundId,item.eventId,item.attemptId,item.rewardVariant]),[
    ['first-zip','care-zip','first-zip-speech',null],
    ['later-box','play-box','later-box-speech',null],
    ['bridge-reward','play-bridge',null,'b'],
  ]);
});

test('same-day alternate scenes cannot override help, advance twice, or spend two review slots',()=>{
  let plan=recordPractice(createPracticePlan(),round('first','play-bridge')),state=createState();
  ({plan,state}=practicePair(plan,state,'assisted','2026-10-02',{event:'care-zip',result:'supported',helped:true}));
  ({plan,state}=practicePair(plan,state,'repeat','2026-10-02',{event:'play-box'}));
  let result=getPracticePlan(plan,{learningState:state,date:'2026-10-02'});
  assert.equal(result.cards.length,1);
  assert.equal(result.cards[0].eventId,'play-bridge');
  assert.equal(result.cards[0].lastOutcome,'supported');
  assert.equal(result.cards[0].stage,0);
  assert.equal(result.cards[0].completedDays,2);
  assert.equal(result.cards[0].playCount,3);
  assert.equal(result.reviewStreak,1);
  ({plan,state}=practicePair(plan,state,'tomorrow','2026-10-03',{event:'play-box'}));
  ({plan,state}=practicePair(plan,state,'tomorrow-alias','2026-10-03',{event:'care-zip'}));
  result=getPracticePlan(plan,{learningState:state,date:'2026-10-03'});
  assert.equal(result.cards[0].stage,1);
  assert.equal(result.cards[0].dueDate,'2026-10-06');
  assert.equal(result.cards[0].completedDays,3);
  assert.equal(result.reviewStreak,1);
  assert.equal(result.cards[0].practicedToday,true);
  assert.deepEqual(result.dueIds,[]);
});

test('legacy alternate scenes merge by earliest calendar contact and never infer extra days from completion counts',()=>{
  let state=completeEvent(createState(),'care-zip',day);
  state=completeEvent(state,'care-zip','2026-10-02');
  state=completeEvent(state,'care-zip','2026-10-04');
  state=completeEvent(state,'play-box','2026-10-04');
  const result=getPracticePlan(createPracticePlan(),{learningState:freeze(state),rounds:[round('later-first-in-array','play-bridge','2026-10-05')],date:'2026-10-06'});
  assert.equal(result.cards.length,1);
  assert.equal(result.cards[0].eventId,'care-zip');
  assert.equal(result.cards[0].firstDate,day);
  assert.equal(result.cards[0].lastDate,'2026-10-05');
  assert.equal(result.cards[0].completedDays,3);
  assert.equal(result.cards[0].playCount,4);
  assert.equal(result.cards[0].stage,0);
  assert.deepEqual(result.dueIds,['care-zip']);
});

test('different phrases sharing a goal keep separate new progress, cards and due dates',()=>{
  const plan=recordPractice(createPracticePlan(),round('water'));
  assert.equal(EVENTS.find(item=>item.id==='food-water').goalId,EVENTS.find(item=>item.id==='food-hungry').goalId);
  assert.notEqual(phraseIdFor('food-water'),phraseIdFor('food-hungry'));
  assert.ok(getPracticePlan(plan,{date:day}).unseenIds.includes('food-hungry'));
  const nextPlan=recordPractice(plan,round('hungry','food-hungry','2026-10-02'));
  const result=getPracticePlan(nextPlan,{date:'2026-10-02'});
  assert.equal(result.cards.length,2);
  assert.deepEqual(result.dueIds,['food-water']);
  assert.equal(card(result,'food-hungry').dueDate,'2026-10-03');
  assert.equal(card(result,'food-water').dueDate,'2026-10-02');
});

test('phrase aggregation never permits an attempt from an alternate event to impersonate the recorded round',()=>{
  const state=recordEvidence(createState(),attempt('zip-speech',day,{eventId:'care-zip'}));
  const plan=recordPractice(createPracticePlan(),{...round('box','play-box'),attemptId:'zip-speech',mode:'review'});
  assert.equal(phraseIdFor('care-zip'),phraseIdFor('play-box'));
  assert.throws(()=>getPracticePlan(plan,{learningState:state,date:day}),/不属于本轮故事/);
});
