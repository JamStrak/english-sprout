import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {THEMES,EVENTS,ITEMS,GOALS,ALPHABET_NODES,ALPHABET_CORE_GOALS} from '../xiaoya/content.js';
import {STORAGE_KEY,createState,validateState,localDay,recordEvidence,correctEvidence,effectiveEvidence,completeEvent,placeItem,goalStatus,checkupContext,selectEvent,speakingAlert,alphabetEligibility,enableAlphabet,collectLetter,canRevealPhrase} from '../xiaoya/learning.js';

const find=(id)=>EVENTS.find((event)=>event.id===id);
function entry(id,eventId='play-box',date='2026-10-16',overrides={}) {
  return {attemptId:id,eventId,date,kind:'speech',result:'independent',source:'parent',helped:false,...overrides};
}
function addPair(state,eventId,prefix,exact=true) {
  const event=find(eventId);
  state=recordEvidence(state,entry(`${prefix}-one`,eventId,'2026-10-16',{phraseId:exact?event.lessonId:null}));
  return recordEvidence(state,entry(`${prefix}-two`,eventId,'2026-10-17',{contextId:event.contexts[1].id,phraseId:exact?event.lessonId:null}));
}
function eligibleState(exact=true) {
  let state=createState();
  for(const id of ['play-box','food-water','play-ball']) state=addPair(state,id,id,exact);
  return state;
}
function collectedState(exact=true) {
  let state=enableAlphabet(eligibleState(exact),'2026-10-18');
  for(const node of ALPHABET_NODES) state=collectLetter(state,node.id,'2026-10-18');
  return state;
}
function deepFreeze(value) {
  if(value&&typeof value==='object') { Object.values(value).forEach(deepFreeze); Object.freeze(value); }
  return value;
}

test('content contains six themes, 42 unique events/items and 26 reachable discovery nodes',()=>{
  assert.equal(THEMES.length,6); assert.equal(EVENTS.length,42); assert.equal(ITEMS.length,42); assert.equal(ALPHABET_NODES.length,26);
  for(const theme of THEMES) assert.ok(EVENTS.filter((event)=>event.theme===theme.id).length>=3);
  assert.equal(new Set(EVENTS.map((event)=>event.id)).size,42);
  assert.equal(new Set(ITEMS.map((item)=>item.id)).size,42);
  assert.deepEqual(ALPHABET_NODES.map((node)=>node.letter).join(''),'ABCDEFGHIJKLMNOPQRSTUVWXYZ');
  assert.equal(new Set(ALPHABET_NODES.map((node)=>node.id)).size,26);
  for(const node of ALPHABET_NODES) {
    assert.ok(ALPHABET_CORE_GOALS.includes(node.goalId));
    assert.ok(find(node.eventId).contexts.some((context)=>context.id===node.contextId));
  }
});

test('every quoted phrase is an exact existing curriculum line with an existing Pip recording',()=>{
  const curriculum=JSON.parse(fs.readFileSync(new URL('../public/data/curriculum.json',import.meta.url),'utf8'));
  for(const event of EVENTS) {
    const lesson=curriculum.lessons.find((lesson)=>lesson.id===event.lessonId);
    assert.equal(event.english,lesson.english,event.id);
    assert.equal(event.chinese,lesson.chinese,event.id);
    assert.equal(event.audio,`./audio/characters/pip/${lesson.id}.mp3`);
    assert.ok(fs.existsSync(new URL(`../public/audio/characters/pip/${lesson.id}.mp3`,import.meta.url)),event.id);
  }
});

test('contexts carry concrete different tasks and choices contain three distinct intentions',()=>{
  for(const event of EVENTS) {
    assert.equal(event.contexts.length,2);
    assert.notEqual(event.contexts[0].settingId,event.contexts[1].settingId);
    assert.notEqual(event.contexts[0].setup,event.contexts[1].setup);
    for(const context of event.contexts) for(const key of ['scene','label','setup','request','help']) assert.ok(context[key]);
    assert.equal(event.choices.length,3);
    assert.equal(event.choices.filter((choice)=>choice.correct).length,1);
    assert.equal(new Set(event.choices.map((choice)=>choice.scene)).size,3);
    assert.ok(event.choices.every((choice)=>choice.correct||find(choice.scene).goalId!==event.goalId));
  }
  assert.ok(Object.isFrozen(EVENTS[0].contexts[0]));
});

test('new state is isolated from the old product and each instance has separate collections',()=>{
  const a=createState(),b=createState();
  assert.equal(validateState(a),a); assert.equal(a.product,'xiaoya-english');
  assert.equal(STORAGE_KEY,'xiaoya-english:state:v1');
  a.evidence.push('sentinel'); assert.deepEqual(b.evidence,[]);
  assert.throws(()=>validateState({version:1,lessons:{}}));
});

test('local day uses local calendar and rejects rollover dates and timestamps',()=>{
  assert.equal(localDay(new Date(2026,9,16,0,1)),'2026-10-16');
  assert.equal(localDay('2024-02-29'),'2024-02-29');
  for(const invalid of ['2026-02-29','2026-04-31','2026-13-01','2026-01-00','26-01-01','2026-10-16T00:00:00Z',new Date(NaN)]) assert.throws(()=>localDay(invalid));
});

test('recording is immutable, normalized, idempotent and cannot overwrite an attempt',()=>{
  const before=deepFreeze(createState()); const input=deepFreeze(entry('one'));
  const after=recordEvidence(before,input);
  assert.notEqual(after,before); assert.equal(before.evidence.length,0); assert.equal(after.evidence.length,1);
  assert.equal(recordEvidence(after,input),after);
  assert.throws(()=>recordEvidence(after,{...input,result:'supported'}));
  assert.equal(after.evidence[0].contextId,'play-box');
  assert.equal(after.evidence[0].goalId,'help');
  assert.equal(after.evidence[0].phraseId,null);
});

test('help cannot masquerade as independent speech',()=>{
  let state=recordEvidence(createState(),entry('one','play-box','2026-10-16',{helped:true}));
  state=recordEvidence(state,entry('two','care-zip','2026-10-17',{result:'supported',helped:true}));
  assert.equal(state.evidence[0].result,'supported');
  assert.equal(goalStatus(state,'help').supported,true);
  assert.equal(goalStatus(state,'help').independent,false);
  assert.equal(goalStatus(state,'help').passed,false);
});

test('machine candidates never become confirmed independent speech or open the alphabet',()=>{
  let state=createState();
  for(const [index,eventId] of ['play-box','care-zip','food-water','play-ball'].entries()) {
    state=recordEvidence(state,entry(`candidate-${index}`,eventId,index%2?'2026-10-17':'2026-10-16',{source:'machine'}));
  }
  assert.equal(goalStatus(state,'help').candidateCount,2);
  assert.equal(goalStatus(state,'help').independent,false);
  assert.equal(alphabetEligibility(state).eligible,false);
});

test('same-day or same-setting successes do not establish retained transfer',()=>{
  let sameDay=recordEvidence(createState(),entry('a'));
  sameDay=recordEvidence(sameDay,entry('b','care-zip'));
  assert.equal(goalStatus(sameDay,'help').independent,true);
  assert.equal(goalStatus(sameDay,'help').passed,false);
  let sameSetting=recordEvidence(createState(),entry('a'));
  sameSetting=recordEvidence(sameSetting,entry('b','play-box','2026-10-17'));
  assert.equal(goalStatus(sameSetting,'help').passed,false);
});

test('the same rendered coat context does not count as transfer merely because event IDs differ',()=>{
  let state=recordEvidence(createState(),entry('a','play-box','2026-10-16',{contextId:'play-box-elsewhere'}));
  state=recordEvidence(state,entry('b','care-zip','2026-10-17'));
  assert.equal(goalStatus(state,'help').passed,false);
});

test('confirmed speech on different days and in different real settings advances a shared goal',()=>{
  let state=recordEvidence(createState(),entry('a'));
  state=recordEvidence(state,entry('b','care-zip','2026-10-17'));
  assert.equal(goalStatus(state,'help').passed,true);
  assert.equal(goalStatus(state,'help').level,'passed');
  assert.equal(goalStatus(state,'help').listening,false);
});

test('listening and supported speech are separate; correct listening cannot become oral mastery',()=>{
  let state=recordEvidence(createState(),entry('a','play-box','2026-10-16',{kind:'listening',source:'machine'}));
  state=recordEvidence(state,entry('b','care-zip','2026-10-17',{kind:'listening',source:'machine'}));
  assert.equal(goalStatus(state,'help').listening,true);
  assert.equal(goalStatus(state,'help').independent,false);
  assert.equal(goalStatus(state,'help').passed,false);
});

test('unclear sound, equipment errors and silence never establish ability',()=>{
  let state=createState();
  for(const [index,result] of ['unclear','device_error','not_yet'].entries()) state=recordEvidence(state,entry(`a-${index}`,'play-box','2026-10-16',{result}));
  assert.equal(goalStatus(state,'help').level,'participated');
  assert.equal(goalStatus(state,'help').independent,false);
  assert.equal(speakingAlert(state).active,false);
});

test('parent correction preserves original evidence and can confirm or revoke a candidate',()=>{
  let state=recordEvidence(createState(),entry('one','play-box','2026-10-16',{source:'machine'}));
  const correction={correctionId:'fix-one',result:'independent',helped:false,date:'2026-10-16'};
  state=correctEvidence(state,'one',correction);
  assert.equal(state.evidence[0].source,'machine'); assert.equal(state.corrections.length,1);
  assert.equal(goalStatus(state,'help').independent,true);
  assert.equal(effectiveEvidence(state)[0].originSource,'machine');
  assert.equal(correctEvidence(state,'one',correction),state);
  state=correctEvidence(state,'one',{correctionId:'fix-two',result:'supported',helped:true,date:'2026-10-17'});
  assert.equal(goalStatus(state,'help').independent,false);
  assert.equal(state.corrections.length,2); assert.equal(state.evidence[0].result,'independent');
  assert.throws(()=>correctEvidence(state,'one',{...correction,correctionId:'fix-three'}));
  assert.throws(()=>correctEvidence(state,'unknown',correction));
});

test('no-speech alert counts observed opportunities across days, excluding device and machine uncertainty',()=>{
  let state=createState();
  for(let i=0;i<3;i++) state=recordEvidence(state,entry(`quiet-${i}`,'play-box',i?'2026-10-17':'2026-10-16',{result:'not_yet'}));
  assert.deepEqual({...speakingAlert(state),message:''},{active:true,type:'not_speaking',opportunities:3,days:2,message:''});
  assert.match(speakingAlert(state).message,/尚未观察到合适的表达/);
  state=recordEvidence(state,entry('error','play-box','2026-10-18',{result:'device_error'}));
  state=recordEvidence(state,entry('machine','play-box','2026-10-18',{result:'not_yet',source:'machine'}));
  assert.equal(speakingAlert(state).opportunities,3);
});

test('supported-only alert and a renewed quiet period remain visible after an earlier independent response',()=>{
  let state=recordEvidence(createState(),entry('earlier','play-box','2026-10-15'));
  for(let i=0;i<3;i++) state=recordEvidence(state,entry(`supported-${i}`,'play-box',i?'2026-10-17':'2026-10-16',{result:'supported',helped:true}));
  assert.equal(speakingAlert(state,'help').type,'supported_only');
  assert.equal(speakingAlert(state,'request').active,false);
});

test('repeated participation without parent speech observations requests observation without inferring inability',()=>{
  let state=completeEvent(createState(),'play-box','2026-10-16');
  state=completeEvent(state,'care-zip','2026-10-16');
  assert.equal(speakingAlert(state).active,false);
  state=completeEvent(state,'play-box','2026-10-17');
  const alert=speakingAlert(state);
  assert.equal(alert.active,true);
  assert.equal(alert.type,'needs_observation');
  assert.equal(alert.opportunities,0);
  assert.equal(alert.days,2);
  assert.equal(alert.completedCount,3);
  assert.match(alert.message,/不能判断孩子是否会说/);
  assert.equal(speakingAlert(state,'help').type,'needs_observation');
  assert.equal(speakingAlert(state,'request').active,false);
  assert.equal(goalStatus(state,'help').independent,false);
  state=recordEvidence(state,entry('candidate','play-box','2026-10-17',{source:'machine'}));
  assert.equal(speakingAlert(state).type,'needs_observation');
  state=correctEvidence(state,'candidate',{correctionId:'observed',result:'independent',helped:false,date:'2026-10-17'});
  assert.equal(speakingAlert(state).active,false);
});

test('same-day completion clicks and furniture never masquerade as cross-day expression opportunities',()=>{
  let state=createState();
  for(const event of EVENTS) state=completeEvent(state,event.id,'2026-10-16');
  assert.equal(speakingAlert(state).active,false);
  state=completeEvent(state,'play-box','2026-10-16');
  assert.equal(speakingAlert(state).active,false);
  state=completeEvent(state,'play-box','2026-10-17');
  assert.equal(speakingAlert(state).type,'needs_observation');
  state=recordEvidence(state,entry('unclear','play-box','2026-10-17',{result:'unclear'}));
  assert.equal(speakingAlert(state).active,false);
});

test('participation without speech earns the fixed item exactly once and never raises ability',()=>{
  const original=deepFreeze(createState());
  let state=completeEvent(original,'play-box','2026-10-16');
  assert.equal(Object.keys(state.items).length,1); assert.equal(state.items['toy-box'].earnedOn,'2026-10-16');
  assert.equal(completeEvent(state,'play-box','2026-10-16'),state);
  state=completeEvent(state,'play-box','2026-10-17');
  assert.equal(Object.keys(state.items).length,1); assert.equal(state.completions['play-box'].count,2);
  assert.equal(goalStatus(state,'help').passed,false); assert.equal(state.evidence.length,0);
  assert.equal(Object.keys(original.items).length,0);
});

test('all catalogue rewards may be earned without unlocking alphabet or losing access to any theme',()=>{
  let state=createState();
  for(const event of EVENTS) state=completeEvent(state,event.id,'2026-10-16');
  assert.equal(Object.keys(state.items).length,EVENTS.length); assert.equal(alphabetEligibility(state).eligible,false);
  for(const theme of THEMES) assert.equal(selectEvent(state,theme.id,'2026-10-17').theme,theme.id);
});

test('item placement is device-independent, immutable and rejects unowned or out-of-bounds positions',()=>{
  const before=deepFreeze(completeEvent(createState(),'play-box','2026-10-16'));
  const after=placeItem(before,'toy-box',{x:0.25,y:0.75});
  assert.equal(after.items['toy-box'].x,0.25); assert.equal(before.items['toy-box'].x,null);
  assert.equal(placeItem(after,'toy-box',{x:0.25,y:0.75}),after);
  assert.throws(()=>placeItem(after,'soft-ball',{x:0.5,y:0.5}));
  for(const position of [{x:2,y:0},{x:NaN,y:0},{x:0,y:-1},{x:0,y:0,extra:1}]) assert.throws(()=>placeItem(after,'toy-box',position));
});

test('event selection stays in the chosen theme and uses another real setting for delayed observation',()=>{
  let state=recordEvidence(createState(),entry('one'));
  state=completeEvent(state,'play-box','2026-10-16');
  const selection=selectEvent(state,'play','2026-10-17');
  assert.equal(selection.id,'play-box'); assert.equal(selection.mode,'challenge');
  assert.equal(selection.context.id,'play-box-elsewhere');
  assert.notEqual(selection.context.settingId,find('play-box').contexts[0].settingId);
  for(const theme of THEMES) assert.equal(selectEvent(state,theme.id,'2026-10-17').theme,theme.id);
  assert.throws(()=>selectEvent(state,'unknown','2026-10-17'));
});

test('core goal evidence opens the parent-enabled alphabet without requiring all six themes',()=>{
  const before=eligibleState(); const eligibility=alphabetEligibility(before);
  assert.equal(eligibility.eligible,true); assert.deepEqual(eligibility.remaining,[]);
  assert.equal(before.alphabet.enabled,false); assert.equal(Object.keys(before.completions).length,0);
  assert.throws(()=>collectLetter(before,'letter-a','2026-10-18'));
  const state=enableAlphabet(before,'2026-10-18');
  assert.equal(state.alphabet.enabled,true); assert.equal(before.alphabet.enabled,false);
  assert.equal(enableAlphabet(state,'2026-10-19'),state);
  assert.throws(()=>enableAlphabet(createState(),'2026-10-18'));
  assert.throws(()=>enableAlphabet(before,'2026-10-16'));
});

test('all 26 letters are reachable with expanded content and repeat claims cannot duplicate a letter',()=>{
  const state=collectedState();
  assert.equal(Object.keys(state.alphabet.letters).length,26);
  assert.equal(collectLetter(state,'letter-a','2026-10-19'),state);
  assert.equal(validateState(state),state);
  assert.throws(()=>collectLetter(state,'letter-aa','2026-10-19'));
  assert.throws(()=>collectLetter(state,'letter-a','2026-10-17'));
});

test('collecting letters never reveals phrases without their own exact stable oral evidence',()=>{
  const approximate=collectedState(false);
  assert.equal(goalStatus(approximate,'request').passed,true);
  assert.equal(canRevealPhrase(approximate,'needs-01'),false);
  const exact=collectedState(true);
  assert.equal(canRevealPhrase(exact,'needs-01'),true);
  assert.equal(canRevealPhrase(exact,'needs-08'),true);
  assert.equal(canRevealPhrase(exact,'family-06'),false);
  assert.equal(canRevealPhrase(enableAlphabet(eligibleState(),'2026-10-18'),'needs-01'),false);
});

test('a valid correction can close current progression without deleting earned collections or audit history',()=>{
  let state=collectedState();
  state=correctEvidence(state,'food-water-two',{correctionId:'parent-recheck',result:'supported',helped:true,date:'2026-10-19'});
  assert.equal(alphabetEligibility(state).eligible,false);
  assert.equal(canRevealPhrase(state,'needs-01'),false);
  assert.equal(Object.keys(state.alphabet.letters).length,26);
  assert.throws(()=>collectLetter(state,'letter-a','2026-10-19'));
  assert.equal(validateState(state),state);
});

test('every catalogued phrase has a no-text path to its own stable evidence',()=>{
  let state=collectedState();
  for(const event of EVENTS) {
    state=addPair(state,event.id,`exact-${event.id}`);
    assert.equal(canRevealPhrase(state,event.lessonId),true,event.id);
  }
});

test('invalid evidence, mismatched IDs and private payloads are rejected',()=>{
  const state=createState();
  const invalid=[{attemptId:'__proto__'},{eventId:'missing'},{goalId:'request'},{contextId:'made-up'},{kind:'pronunciation'},{source:'ai'},{result:'passed'},{helped:undefined},{phraseId:'hello-02'},{kind:'listening',phraseId:'needs-08'},{result:'not_yet',phraseId:'needs-08'},{transcript:'child speech'},{audio:'data:audio/wav;base64,private'}];
  for(const patch of invalid) assert.throws(()=>recordEvidence(state,{...entry('one'),...patch}),JSON.stringify(patch));
  assert.throws(()=>goalStatus(state,'fake')); assert.throws(()=>canRevealPhrase(state,'fake'));
});

test('state validation rejects corrupted rewards, dates, foreign products and fabricated letters',()=>{
  const clone=(value)=>JSON.parse(JSON.stringify(value));
  const base=completeEvent(createState(),'play-box','2026-10-16');
  const bad=[];
  let s=clone(base);s.product='english-sprout';bad.push(s);
  s=clone(base);s.schemaVersion=2;bad.push(s);
  s=clone(base);delete s.items['toy-box'];bad.push(s);
  s=clone(base);s.items['toy-box'].eventId='care-zip';bad.push(s);
  s=clone(base);s.items['toy-box'].x=0.5;bad.push(s);
  s=clone(base);s.completions['play-box'].firstDate='2026-02-30';bad.push(s);
  s=clone(base);s.alphabet.letters['letter-a']={letter:'A',date:'2026-10-16'};bad.push(s);
  s=clone(collectedState());s.alphabet.letters['letter-a'].letter='Z';bad.push(s);
  s=clone(recordEvidence(createState(),entry('one')));s.evidence.push({...s.evidence[0]});bad.push(s);
  for(const state of bad) assert.throws(()=>validateState(state));
});


test('garden checkups alternate reliable settings without counting demonstrations or machine candidates',()=>{
  for(const id of ['food-water','play-box','hello-goodbye']) {
    const event=find(id);let state=createState();
    assert.equal(checkupContext(state,id).id,event.contexts[1].id);
    state=recordEvidence(state,entry(`${id}-assisted`,id,'2026-10-16',{contextId:event.contexts[1].id,helped:true}));
    state=recordEvidence(state,entry(`${id}-machine`,id,'2026-10-16',{contextId:event.contexts[1].id,source:'machine'}));
    assert.equal(checkupContext(state,id).id,event.contexts[1].id);
    state=recordEvidence(state,entry(`${id}-first`,id,'2026-10-16',{contextId:event.contexts[1].id}));
    assert.equal(checkupContext(state,id).id,event.contexts[0].id);
    assert.equal(goalStatus(state,event.goalId).retained,false);
    state=recordEvidence(state,entry(`${id}-second`,id,'2026-10-17',{contextId:checkupContext(state,id).id}));
    assert.equal(goalStatus(state,event.goalId).retained,true);
    assert.equal(checkupContext(state,id).id,event.contexts[1].id);
    state=correctEvidence(state,`${id}-second`,{correctionId:`${id}-correction`,result:'supported',helped:true,date:'2026-10-17'});
    assert.equal(goalStatus(state,event.goalId).retained,false);
    assert.equal(checkupContext(state,id).id,event.contexts[0].id);
  }
});
