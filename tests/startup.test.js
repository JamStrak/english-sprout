import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {loadCurriculum,parseCurriculum,serializeCurriculum,installViewportFallback} from '../src/startup.js';
const text=fs.readFileSync(new URL('../public/data/curriculum.json',import.meta.url),'utf8');
const course=JSON.parse(text);

test('older viewport height follows visible window height while modern browsers remain native',()=>{
  const values={},listeners=new Map(),host={innerHeight:924,CSS:{supports:()=>false},document:{documentElement:{style:{setProperty:(key,value)=>values[key]=value}}},addEventListener:(name,fn)=>listeners.set(name,fn),removeEventListener:name=>listeners.delete(name)};
  const cleanup=installViewportFallback(host);assert.equal(values['--app-viewport-height'],'924px');assert.equal(values['--app-vh'],'9.24px');
  host.innerHeight=700;listeners.get('resize')();assert.equal(values['--app-viewport-height'],'700px');cleanup();assert.equal(listeners.size,0);
  host.CSS.supports=()=>true;installViewportFallback(host);assert.equal(listeners.size,0);
});

test('published embedded curriculum starts with no network or offline-cache dependency',async()=>{
  let requests=0;
  const loaded=await loadCurriculum({embedded:serializeCurriculum(text),fetcher:()=>{requests++;throw Error('network unavailable');}});
  assert.deepEqual(loaded,course);assert.equal(requests,0);
});
test('embedded course safely escapes HTML delimiters without changing lesson text or IDs',()=>{
  const special=JSON.parse(text);special.lessons[0].english='</script><script>bad()</script>\u2028\u2029';
  const serialized=serializeCurriculum(JSON.stringify(special));
  assert.doesNotMatch(serialized,/<|\u2028|\u2029/);assert.deepEqual(parseCurriculum(serialized),special);
});
test('legacy pages retry a transient failure and do not need a page reload',async()=>{
  let attempts=0;const delays=[];
  const actual=await loadCurriculum({embedded:undefined,fetcher:async()=>{attempts++;return new Response(attempts===1?'temporary':text,{status:attempts===1?503:200});},wait:async ms=>delays.push(ms)});
  assert.deepEqual(actual,course);assert.equal(attempts,2);assert.deepEqual(delays,[400]);
});
test('malformed embedded/network data is never passed to the home renderer',async()=>{
  let attempts=0;
  const actual=await loadCurriculum({embedded:'{"lessons":[]}',fetcher:async()=>new Response(++attempts===1?'<!doctype html>':text),wait:async()=>{}});
  assert.deepEqual(actual,course);assert.equal(attempts,2);
  const bad=JSON.parse(text);bad.lessons[0].answerIndex=99;assert.throws(()=>parseCurriculum(JSON.stringify(bad)),/Invalid lesson/);
});
test('fallback requests time out and stop after bounded retries',async()=>{
  const signals=[];
  await assert.rejects(loadCurriculum({embedded:undefined,fetcher:(_url,{signal})=>{signals.push(signal);return new Promise(()=>{});},timeout:5,wait:async()=>{}}),/timed out/);
  assert.equal(signals.length,3);assert.ok(signals.every(signal=>signal.aborted));
});
