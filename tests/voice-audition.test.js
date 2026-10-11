import test from 'node:test';
import assert from 'node:assert/strict';
import {CHARACTER_PICKS_KEY,AUDITION_RATE_KEY,AUDITION_RATES,readAuditionRate,saveAuditionRate,validateAuditionManifest,normalizeAuditionPicks,readAuditionPicks,saveAuditionPick} from '../src/voice-audition.js';
import {COURSE_RATE_KEY,readCourseRate,saveCourseRate,PLAYBACK_RATES} from '../src/voices.js';

const candidates=[{id:'pogo',gender:'male'},{id:'milo',gender:'male'},{id:'lulu',gender:'female'},{id:'pip',gender:'female'}];
const store=initial=>{const map=new Map(Object.entries(initial||{}));return {getItem:key=>map.get(key)||null,setItem:(key,value)=>map.set(key,value),map};};

test('audition speed persists four safe rates independently and defaults to original speed',()=>{
  const storage=store({'english-sprout-voice-v1':'ryan',[CHARACTER_PICKS_KEY]:'{"version":1,"male":"pogo","female":"lulu"}'});
  assert.equal(readAuditionRate(storage),1);
  for(const rate of AUDITION_RATES){assert.equal(saveAuditionRate(rate,storage),true);assert.equal(readAuditionRate(storage),rate);}
  assert.equal(storage.getItem('english-sprout-voice-v1'),'ryan');assert.equal(storage.getItem(CHARACTER_PICKS_KEY),'{"version":1,"male":"pogo","female":"lulu"}');
  assert.equal(Object.isFrozen(AUDITION_RATES),true);
});
test('corrupt or unsupported audition rates fall back without replacing valid saved values',()=>{
  for(const raw of ['{broken','null','"0.75"','0','1.2','100','{}'])assert.equal(readAuditionRate(store({[AUDITION_RATE_KEY]:raw})),1);
  const storage=store({[AUDITION_RATE_KEY]:'0.9'});
  for(const rate of [null,undefined,'0.75',0,1.2,Infinity,NaN,-1]){assert.equal(saveAuditionRate(rate,storage),false);assert.equal(readAuditionRate(storage),0.9);}
  assert.equal(saveAuditionRate(0.75,null),false);assert.equal(readAuditionRate(null),1);
  const blocked={getItem:()=>{throw new Error('Denied');},setItem:()=>{throw new Error('Quota');}};
  assert.equal(readAuditionRate(blocked),1);assert.equal(saveAuditionRate(0.75,blocked),false);
});
test('course rate safely migrates the first audition speed then remains independently selected',()=>{
  const storage=store({[AUDITION_RATE_KEY]:'0.9','english-sprout-state-v1':'unchanged'});
  assert.equal(readCourseRate(storage),0.9);assert.equal(storage.getItem(COURSE_RATE_KEY),'0.9');
  saveAuditionRate(1.15,storage);assert.equal(readCourseRate(storage),0.9);
  assert.equal(saveCourseRate(0.75,storage),true);assert.equal(readAuditionRate(storage),1.15);assert.equal(readCourseRate(storage),0.75);
  assert.equal(storage.getItem('english-sprout-state-v1'),'unchanged');assert.equal(PLAYBACK_RATES,AUDITION_RATES);
});
test('course rate rejects corruption and does not overwrite an existing malformed preference with audition data',()=>{
  assert.equal(readCourseRate(store()),1);assert.equal(readCourseRate(null),1);
  assert.equal(readCourseRate(store({[AUDITION_RATE_KEY]:'100'})),1);
  const storage=store({[COURSE_RATE_KEY]:'{bad',[AUDITION_RATE_KEY]:'0.75'});
  assert.equal(readCourseRate(storage),1);assert.equal(storage.getItem(COURSE_RATE_KEY),'{bad');
  assert.equal(saveCourseRate('0.75',storage),false);assert.equal(saveCourseRate(1,null),false);
});

test('audition choices keep one valid candidate per gender without touching course voice or progress',()=>{
  const storage=store({'english-sprout-voice-v1':'ryan','english-sprout-v1':'progress'});
  assert.equal(saveAuditionPick('pogo',candidates,storage).ok,true);
  assert.equal(saveAuditionPick('lulu',candidates,storage).ok,true);
  assert.equal(saveAuditionPick('milo',candidates,storage).ok,true);
  assert.deepEqual(readAuditionPicks(candidates,storage),{version:1,male:'milo',female:'lulu'});
  assert.equal(storage.getItem('english-sprout-voice-v1'),'ryan');assert.equal(storage.getItem('english-sprout-v1'),'progress');
  const previous=storage.getItem(CHARACTER_PICKS_KEY);assert.equal(saveAuditionPick('aiden',candidates,storage).ok,false);assert.equal(storage.getItem(CHARACTER_PICKS_KEY),previous);
});
test('audition choices discard malformed and wrong-gender records and report failed persistence',()=>{
  assert.deepEqual(normalizeAuditionPicks({version:1,male:'lulu',female:'missing',recording:'private'},candidates),{version:1,male:null,female:null});
  assert.deepEqual(readAuditionPicks(candidates,store({[CHARACTER_PICKS_KEY]:'{broken'})),{version:1,male:null,female:null});
  assert.equal(saveAuditionPick('pogo',candidates,null).ok,false);
  assert.equal(saveAuditionPick('pogo',candidates,{getItem:()=>null,setItem:()=>{throw new Error('Quota exceeded');}}).ok,false);
});
test('audition manifest permits missing samples but rejects remote, crossed, or executable audio paths',()=>{
  const manifest={version:1,lessons:[{id:'family-07',english:'Hello!',chinese:'你好！'},{id:'food-01',english:'Yummy!',chinese:'好吃！'}],candidates:[{id:'pogo',name:'Pogo',gender:'male',animal:'fox',samples:{'family-07':'audio/characters/pogo/family-07.mp3','food-01':'https://example.com/child.mp3'}},{id:'lulu',name:'Lulu',gender:'female',animal:'rabbit',samples:{'family-07':'audio/characters/pogo/family-07.mp3','food-01':'javascript:alert(1)'}}]};
  const clean=validateAuditionManifest(manifest);
  assert.deepEqual(clean.candidates[0].samples,{'family-07':'audio/characters/pogo/family-07.mp3'});assert.deepEqual(clean.candidates[1].samples,{});
  assert.equal(validateAuditionManifest({version:2,...manifest,version:2}),null);
  assert.equal(validateAuditionManifest({version:1,lessons:[],candidates:[]}),null);
});
