import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createUpdateGate} from '../src/auto-update.js';

function clock(){
  let now=0,id=0;const queue=new Map();
  return {performance:{now:()=>now},setTimeout(fn,ms){queue.set(++id,{fn,at:now+ms});return id;},clearTimeout(id){queue.delete(id);},
    advance(ms){const end=now+ms;while(true){const item=[...queue.entries()].filter(([,v])=>v.at<=end).sort((a,b)=>a[1].at-b[1].at)[0];if(!item)break;now=item[1].at;queue.delete(item[0]);item[1].fn();}now=end;}};
}
test('a downloaded update waits for a continuous idle interval and reloads only once',()=>{
  const timers=clock();let safe=false,reloads=0;
  const gate=createUpdateGate({isSafe:()=>safe,reload:()=>reloads++,timers});gate.request();timers.advance(10000);assert.equal(reloads,0);
  safe=true;timers.advance(1250);assert.equal(reloads,0);
  safe=false;timers.advance(250);safe=true;timers.advance(1500);assert.equal(reloads,0);
  timers.advance(250);assert.equal(reloads,1);gate.request();timers.advance(10000);assert.equal(reloads,1);
});
test('a matching controller cancels a stale update without navigation',()=>{
  const timers=clock();let reloads=0;const gate=createUpdateGate({isSafe:()=>true,reload:()=>reloads++,timers});
  gate.request();timers.advance(1000);gate.cancel();timers.advance(10000);assert.equal(reloads,0);
  gate.request();timers.advance(1500);assert.equal(reloads,1);
});

function installer({fail=false,staleHTML=false}={}){
  const events={},order=[],requests=[],delays=[];let attempts=0;
  const source=fs.readFileSync(new URL('../sw.template.js',import.meta.url),'utf8').replace('__BUILD_ID__','123456abcdef').replace('__CORE_FILES__',JSON.stringify(['./','./index.html','./src/app.js']));
  vm.runInNewContext(source,{URL,Request,setTimeout(fn,ms){delays.push(ms);queueMicrotask(fn);},self:{registration:{scope:'https://example.test/kids/'},addEventListener:(name,fn)=>events[name]=fn,skipWaiting:async()=>order.push('activate')},caches:{open:async()=>({match:async url=>new Response(`<meta name="app-build" content="${staleHTML&&(staleHTML===true||url.endsWith(staleHTML))?'111111111111':'123456abcdef'}">`),addAll:async files=>{requests.push(...files);attempts++;if(fail===true||attempts<=fail)throw Error('partial download');order.push('cached');}})}});
  return {order,requests,delays,events,install(){let done;events.install({waitUntil:p=>done=p});return done;}};
}
test('automatic activation follows complete fresh precaching, including the subdirectory root',async()=>{
  const w=installer();await w.install();assert.deepEqual(w.order,['cached','activate']);
  assert.deepEqual(w.requests.map(r=>r.url),['https://example.test/kids/','https://example.test/kids/index.html','https://example.test/kids/src/app.js']);
  assert.ok(w.requests.every(r=>r.cache==='reload'));
});
test('a failed release download never activates over the working offline app',async()=>{
  const w=installer({fail:true});await assert.rejects(w.install(),/partial download/);assert.deepEqual(w.order,[]);assert.deepEqual(w.delays,[5000,10000,20000,40000,60000,60000]);
});
test('an HTTP 200 with stale HTML cannot activate or create a reload loop',async()=>{
  for(const path of ['/kids/','index.html']){
    const w=installer({staleHTML:path});await assert.rejects(w.install(),/release page is not ready/);assert.deepEqual(w.order,Array(7).fill('cached'));
  }
});

test('a legacy page installation retries transient failures before complete activation',async()=>{
  const w=installer({fail:2});await w.install();assert.deepEqual(w.delays,[5000,10000]);assert.equal(w.requests.length,9);assert.deepEqual(w.order,['cached','activate']);
});
test('the controller identifies its actual build and still accepts legacy activation',()=>{
  const w=installer();let reply;w.events.message({data:'GET_BUILD',ports:[{postMessage:data=>reply=data}]});
  assert.equal(reply.type,'APP_BUILD');assert.equal(reply.build,'123456abcdef');
  w.events.message({data:'GET_BUILD'});w.events.message({data:'unrelated'});assert.deepEqual(w.order,[]);
  w.events.message({data:'ACTIVATE_UPDATE'});assert.deepEqual(w.order,['activate']);
});
