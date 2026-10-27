import test from 'node:test';
import assert from 'node:assert/strict';
import {WELCOME_GREETINGS_KEY,WELCOME_GREETING_IDS,FIRST_GREETING,nextWelcomeGreeting,createWelcomeGreetings} from '../xiaoya/welcome-greetings.js';

const date=n=>`2026-10-${String(n).padStart(2,'0')}`;
test('a first visitor gets a first-visit welcome, then the returning pool',()=>{
  const first=nextWelcomeGreeting(null,{date:date(1)});
  assert.equal(first.id,FIRST_GREETING);
  assert.equal(nextWelcomeGreeting(first,{date:date(1),returning:true}),first);
  assert(WELCOME_GREETING_IDS.includes(nextWelcomeGreeting(first,{date:date(2)}).id));
});
test('each six returning visits cover the whole pool and cycle boundaries never repeat',()=>{
  for(const random of [()=>0,()=>0.99,Math.random]){
    let record=null;const ids=[];
    for(let day=1;day<=30;day++){
      record=nextWelcomeGreeting(record,{date:date(day),returning:true,random});ids.push(record.id);
      if(day>1)assert.notEqual(ids.at(-1),ids.at(-2));
    }
    for(let i=0;i<30;i+=6)assert.deepEqual(new Set(ids.slice(i,i+6)),new Set(WELCOME_GREETING_IDS));
  }
});
test('same day and clock rollback do not consume a different greeting',()=>{
  const current=nextWelcomeGreeting(null,{date:date(21),returning:true});
  for(const day of [21,20])assert.equal(nextWelcomeGreeting(current,{date:date(day),random:()=>{throw Error('reshuffle');}}),current);
});
test('refresh and two stores use the same saved choice without changing other data',()=>{
  const values=new Map([['child-save','keep']]);let writes=0;
  const storage={getItem:key=>values.get(key),setItem:(key,value)=>{writes++;values.set(key,value);}};
  const a=createWelcomeGreetings(storage,()=>0),b=createWelcomeGreetings(storage,()=>0.99);
  assert.equal(a({date:date(1),returning:true}),b({date:date(1),returning:true}));
  assert.equal(writes,1);
  assert.equal(b({date:date(2)}),a({date:date(2)}));
  assert.equal(writes,2);assert.equal(values.get('child-save'),'keep');
  assert(values.has(WELCOME_GREETINGS_KEY));
});
test('storage refusal stays usable and stable in memory',()=>{
  const choose=createWelcomeGreetings({getItem(){throw Error('denied');},setItem(){throw Error('full');}},()=>0);
  const first=choose({date:date(1),returning:true});
  assert.equal(choose({date:date(1),returning:true}),first);
  assert.notEqual(choose({date:date(2),returning:true}),first);
});
test('invalid cosmetic data is repaired without trusting arbitrary audio paths',()=>{
  for(const saved of ['bad json','null',JSON.stringify({schema:1,date:date(1),id:'https://bad.example/audio',remaining:[]}),JSON.stringify({schema:1,date:date(1),id:WELCOME_GREETING_IDS[0],remaining:[WELCOME_GREETING_IDS[1],WELCOME_GREETING_IDS[1]]})]){
    let repaired;
    const choose=createWelcomeGreetings({getItem:()=>saved,setItem:(_key,value)=>{repaired=JSON.parse(value);}});
    assert.equal(choose({date:date(2)}),FIRST_GREETING);assert.equal(repaired.date,date(2));
  }
});
