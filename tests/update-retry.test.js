import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync(new URL('../src/auto-update.js',import.meta.url),'utf8').replace(/export /g,'');
const A='111111111111',B='222222222222';
const flush=async()=>{for(let i=0;i<40;i++)await Promise.resolve();};
function events(extra={}){
  const listeners=new Map();return {...extra,addEventListener(name,fn){if(!listeners.has(name))listeners.set(name,new Set());listeners.get(name).add(fn);},removeEventListener(name,fn){listeners.get(name)?.delete(fn);},emit(name,event={}){for(const fn of [...(listeners.get(name)||[])])fn(event);}};
}
function fixture({page=A,worker=A,target=A,url='https://example.test/kids/?v=1.7.1'}={}){
  let now=0,id=0,reloads=0;const queue=new Map(),states=[],requests=[],messages=[];
  const controls={worker,target,version:'1.7.1',fetchError:false,registerErrors:0,updates:0,registers:0,update:async()=>{}};
  const timers={setTimeout(fn,ms){queue.set(++id,{fn,at:now+ms});return id;},clearTimeout(id){queue.delete(id);},performance:{now:()=>now}};
  const document=events({hidden:false}),window=events({isSecureContext:true});
  const controller={postMessage(data,ports=[]){messages.push(data);if(data==='GET_BUILD')queueMicrotask(()=>ports[0]?.reply({type:'APP_BUILD',build:controls.worker}));}};
  const registration={update:()=>{controls.updates++;return controls.update();}};
  const workers=events({controller,register:async()=>{controls.registers++;if(controls.registerErrors-->0)throw Error('Unavailable worker');return registration;}});
  const navigator={onLine:true,serviceWorker:workers};
  class Channel{constructor(){this.port1={onmessage:null,close(){}};this.port2={reply:data=>this.port1.onmessage?.({data}),close(){}};}}
  const history={state:null,replaceState(value){this.state=value;}};
  const context={...timers,document,window,navigator,history,location:{href:url,reload:()=>reloads++},MessageChannel:Channel,URL,AbortController,Date,Math,Promise,Error,
    fetch:async(request,options)=>{requests.push({url:String(request),options});if(controls.fetchError)throw Error('network');return {ok:true,json:async()=>({build:controls.target,version:controls.version})};}};
  vm.createContext(context);vm.runInContext(source,context);
  const stop=context.startAutomaticUpdates({build:page,isSafe:()=>controls.safe!==false,onState:value=>states.push({...value})});
  async function advance(ms){const end=now+ms;await flush();while(true){const next=[...queue].filter(([,value])=>value.at<=end).sort((a,b)=>a[1].at-b[1].at)[0];if(!next)break;now=next[1].at;queue.delete(next[0]);next[1].fn();await flush();}now=end;await flush();}
  return {controls,states,requests,messages,workers,navigator,document,window,history,registration,stop,advance,reloads:()=>reloads};
}

test('healthy releases check every 15 seconds using fresh manifest URLs, independent of URL version',async()=>{
 const f=fixture();await f.advance(0);assert.equal(f.controls.updates,1);assert.equal(f.states.at(-1).state,'current');assert.equal(f.states.at(-1).build,A);
 await f.advance(14999);assert.equal(f.controls.updates,1);await f.advance(1);assert.equal(f.controls.updates,2);
 assert.ok(f.requests.every(r=>r.options.cache==='no-store'&&new URL(r.url).searchParams.has('check')));assert.notEqual(f.requests[0].url,f.requests[1].url);f.stop();
});
test('incomplete installations retry automatically without focus or explicit worker update',async()=>{
 const f=fixture({target:B});await f.advance(0);assert.equal(f.controls.updates,1);assert.equal(f.states.at(-1).state,'preparing');
 f.controls.update=async()=>{f.controls.worker=B;f.workers.emit('controllerchange');};
 await f.advance(5000);assert.equal(f.controls.updates,2);assert.equal(f.states.at(-1).state,'waiting');assert.equal(f.reloads(),0);
 await f.advance(1500);assert.equal(f.reloads(),1);await f.advance(12000);assert.equal(f.reloads(),1);f.stop();
});
test('failed worker registration and failed manifest are retried from a continuously open tab',async()=>{
 const f=fixture();f.controls.registerErrors=1;await f.advance(0);assert.equal(f.controls.registers,1);assert.equal(f.states.at(-1).state,'preparing');
 await f.advance(5000);assert.equal(f.controls.registers,2);assert.equal(f.states.at(-1).state,'current');
 f.controls.fetchError=true;await f.advance(15000);assert.equal(f.states.at(-1).state,'preparing');const count=f.requests.length;
 f.controls.fetchError=false;await f.advance(5000);assert.equal(f.requests.length,count+1);assert.equal(f.states.at(-1).state,'current');f.stop();
});
test('a hanging native worker check is deadline bounded and reused instead of overlapping requests',async()=>{
 const f=fixture();let resolve;f.controls.update=()=>new Promise(r=>resolve=r);await f.advance(0);assert.equal(f.controls.updates,1);
 await f.advance(8000);assert.equal(f.states.at(-1).state,'preparing');await f.advance(18000);assert.equal(f.controls.updates,1);assert.ok(f.requests.length>=2,'the manifest is checked again despite the hung native check');
 resolve();await f.advance(0);f.controls.update=async()=>{};await f.advance(15000);assert.equal(f.controls.updates,2);f.stop();
});
test('fresh HTML never reloads backwards into an old controller cache',async()=>{
 const f=fixture({page:B,worker:A,target:B});await f.advance(0);await f.advance(10000);assert.equal(f.reloads(),0);assert.equal(f.states.at(-1).state,'preparing');
 f.controls.worker=B;f.workers.emit('controllerchange');await f.advance(0);assert.equal(f.states.at(-1).state,'current');assert.ok(f.messages.includes('PRUNE_RELEASES'));f.stop();
});
test('updates wait for the learning flow to finish and emit actual-page build status',async()=>{
 const f=fixture({target:B});f.controls.safe=false;f.controls.update=async()=>{f.controls.worker=B;f.workers.emit('controllerchange');};
 await f.advance(10000);assert.equal(f.reloads(),0);assert.equal(f.states.at(-1).state,'waiting');assert.equal(f.states.at(-1).build,A);assert.equal(f.states.at(-1).targetBuild,B);
 f.controls.safe=true;await f.advance(1750);assert.equal(f.reloads(),1);f.stop();
});

test('permanently blocked stylesheet never causes repeated same-build reloads',async()=>{
 const f=fixture();f.document.querySelectorAll=()=>[{sheet:null}];f.history.state={sproutStyleRecovery:A};
 await f.advance(20000);assert.equal(f.reloads(),0);assert.equal(f.states.at(-1).state,'preparing');
 f.document.querySelectorAll=()=>[{sheet:{cssRules:[{}]}}];await f.advance(5000);assert.equal(f.states.at(-1).state,'current');assert.equal(f.history.state.sproutStyleRecovery,undefined);f.stop();
});

test('installed latest waiting worker activates automatically after reconnect while recording stays protected',async()=>{
 const f=fixture({target:B});f.controls.safe=false;const messages=[];
 f.registration.waiting={postMessage(data,ports=[]){messages.push(data);if(data==='GET_BUILD')queueMicrotask(()=>ports[0].reply({type:'APP_BUILD',build:B}));else if(data==='ACTIVATE_UPDATE'){f.registration.waiting=null;f.controls.worker=B;f.workers.emit('controllerchange');}}};
 await f.advance(10000);assert.ok(messages.includes('ACTIVATE_UPDATE'));assert.equal(f.reloads(),0);
 f.controls.safe=true;await f.advance(1750);assert.equal(f.reloads(),1);f.stop();
});
test('hidden and offline tabs avoid network checks; returning retries without a storm',async()=>{
 const f=fixture();await f.advance(0);const first=f.requests.length;f.document.hidden=true;await f.advance(30000);assert.equal(f.requests.length,first);
 f.document.hidden=false;f.document.emit('visibilitychange');await f.advance(0);assert.equal(f.requests.length,first+1);
 f.window.emit('focus');f.window.emit('online');await f.advance(0);assert.equal(f.requests.length,first+1);
 f.navigator.onLine=false;await f.advance(15000);assert.equal(f.requests.length,first+1);assert.equal(f.states.at(-1).state,'offline');
 f.navigator.onLine=true;f.window.emit('online');await f.advance(0);assert.equal(f.requests.length,first+2);f.stop();
});
test('page-build protocol reports the actual loaded page and cleanup stops future checks',async()=>{
 const f=fixture();await f.advance(0);let response;
 f.workers.emit('message',{data:'GET_PAGE_BUILD',ports:[{postMessage:data=>response=data}]});assert.equal(response.type,'APP_PAGE_BUILD');assert.equal(response.build,A);
 const requests=f.requests.length;f.window.emit('pagehide',{persisted:false});await f.advance(60000);f.window.emit('focus');await f.advance(0);assert.equal(f.requests.length,requests);
 response=null;f.workers.emit('message',{data:'GET_PAGE_BUILD',ports:[{postMessage:data=>response=data}]});assert.equal(response,null);
});

test('same-build page with failed stylesheet recovers from verified cache only at a safe point',async()=>{
 const f=fixture();f.document.querySelectorAll=()=>[{sheet:{cssRules:[]}}];f.controls.safe=false;
 await f.advance(0);assert.equal(f.states.at(-1).state,'waiting');await f.advance(5000);assert.equal(f.reloads(),0);
 f.controls.safe=true;await f.advance(1750);assert.equal(f.reloads(),1);assert.equal(f.history.state.sproutStyleRecovery,A);f.stop();
});
