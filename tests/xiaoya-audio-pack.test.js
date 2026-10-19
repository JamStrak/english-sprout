import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

// Evaluate each lifecycle in its own realm: no real browser, service worker,
// Cache Storage, microphone, local storage, or network is touched by this file.
const source=fs.readFileSync(new URL('../xiaoya/audio-pack.js',import.meta.url),'utf8').replace(/\bexport\s+/g,'');
const BUILD='page-build-123';
const origin='http://127.0.0.1:24756';
const plain=value=>JSON.parse(JSON.stringify(value));

class Events {
  listeners=new Map();
  addEventListener(type,listener){
    if(!this.listeners.has(type))this.listeners.set(type,new Set());
    this.listeners.get(type).add(listener);
  }
  removeEventListener(type,listener){this.listeners.get(type)?.delete(listener);}
  emit(type,event={}){for(const listener of [...this.listeners.get(type)||[]])listener(event);}
}
class Worker extends Events {
  constructor(name,state='activated'){super();this.name=name;this.state=state;this.messages=[];}
  postMessage(message){this.messages.push(plain(message));}
  changeState(state){this.state=state;this.emit('statechange');}
}

function fixture({supported=true,protocol='http:',active=new Worker('current'),installing=null,waiting=null,controller=active,registerError=null,updateError=null}={}){
  let reloads=0;
  const registrations=[],updates=[];
  const registration=Object.assign(new Events(),{active,installing,waiting,async update(){updates.push({});if(updateError)throw updateError;}});
  const serviceWorker=Object.assign(new Events(),{controller,async register(url,options){registrations.push({url:url.href,options:plain(options)});if(registerError)throw registerError;return registration;}});
  const navigator=supported?{serviceWorker}:{};
  const location={protocol,reload(){reloads++;}};
  const sandbox={document:{baseURI:origin+'/',querySelector:selector=>selector==='meta[name="xiaoya-build"]'?{content:BUILD}:null},navigator,location,window:{},URL};
  vm.runInNewContext(source+';globalThis.api={audioPackStatus,onAudioPackChange,startAudioPack,retryAudioPack,audioPackMessage};',sandbox);
  return{
    ...sandbox.api,serviceWorker,registration,registrations,updates,window:sandbox.window,
    get reloads(){return reloads;},
    setRegisterError(error){registerError=error;},setUpdateError(error){updateError=error;},
    control(worker){serviceWorker.controller=worker;serviceWorker.emit('controllerchange');},
    message(data,from=serviceWorker.controller){serviceWorker.emit('message',{data,source:from});},
    progress(state,from=serviceWorker.controller,extra={}){serviceWorker.emit('message',{source:from,data:{type:'xiaoya-audio-pack',build:BUILD,state,done:state==='ready'?575:12,total:575,...extra}});},
    mismatch(from=serviceWorker.controller,extra={}){serviceWorker.emit('message',{source:from,data:{type:'xiaoya-audio-update',requestedBuild:BUILD,build:'newer-worker-build',...extra}});}
  };
}

test('audio preparation registers once, exposes status snapshots, and lets observers unsubscribe',async()=>{
  const f=fixture(),seen=[];
  const unsubscribe=f.onAudioPackChange(value=>seen.push(plain(value)));
  assert.deepEqual(seen,[{state:'preparing',done:0,total:0}]);
  const first=f.startAudioPack(),second=f.startAudioPack();assert.equal(first,second);await first;
  assert.deepEqual(f.registrations,[{url:origin+'/xiaoya/sw.js',options:{scope:'/xiaoya/',updateViaCache:'none'}}]);
  assert.equal(f.window.xiaoyaWorker,f.registration);
  assert.deepEqual(f.registration.active.messages,[{type:'xiaoya-prepare-audio',build:BUILD}]);
  f.progress('preparing');assert.equal(seen.at(-1).done,12);
  const copy=f.audioPackStatus();copy.state='ready';assert.equal(f.audioPackStatus().state,'preparing');
  unsubscribe();const before=seen.length;f.progress('ready');assert.equal(seen.length,before);
});

test('ready requires both the current controlling worker and the current page build',async()=>{
  const f=fixture(),other=new Worker('another-worker');await f.startAudioPack();
  f.progress('ready',f.serviceWorker.controller,{build:'different-build'});
  assert.equal(f.audioPackStatus().state,'preparing','A different release cannot claim this page is offline-ready.');
  f.progress('ready',other);
  assert.equal(f.audioPackStatus().state,'preparing','A matching build from a noncontrolling worker is still not ready.');
  f.progress('ready');assert.equal(f.audioPackStatus().state,'ready');
  assert.match(f.audioPackMessage(),/三种英语音色均可离线播放/);
});

test('a null message source cannot claim readiness before a controller exists',async()=>{
  const f=fixture({active:null,controller:null});await f.startAudioPack();
  f.progress('ready',null);
  assert.equal(f.audioPackStatus().state,'preparing','A page with no controlling worker cannot play Cache Storage audio while offline.');
});

test('first install remains preparing until controllerchange and a controlling ready response',async()=>{
  const installing=new Worker('first-install','installing'),f=fixture({active:null,controller:null,installing});
  await f.startAudioPack();assert.equal(installing.messages.length,0);
  f.progress('preparing',installing,{done:500});assert.equal(f.audioPackStatus().done,500);
  f.progress('ready',installing);assert.equal(f.audioPackStatus().state,'preparing');
  installing.changeState('activated');assert.equal(installing.messages.length,1,'Activation asks the new worker for pack status.');
  f.registration.active=installing;f.registration.installing=null;f.control(installing);
  assert.equal(installing.messages.length,2,'Taking control asks again, since the install-time ready reply could not be accepted.');
  assert.equal(f.audioPackStatus().state,'preparing');
  f.progress('ready',installing);assert.equal(f.audioPackStatus().state,'ready');assert.equal(f.reloads,0);
});

test('mismatch during installation or waiting does not interrupt an upgrade; an active mismatch offers explicit refresh',async()=>{
  const active=new Worker('newer-controller'),installing=new Worker('upgrade','installing'),f=fixture({active,installing});
  await f.startAudioPack();
  f.mismatch();assert.equal(f.audioPackStatus().state,'preparing','An installing release can still match this page.');
  f.registration.installing=null;f.registration.waiting=installing;
  f.mismatch();assert.equal(f.audioPackStatus().state,'preparing');
  f.registration.waiting=null;f.mismatch();assert.equal(f.audioPackStatus().state,'update');
  assert.match(f.audioPackMessage(),/刷新到最新版本/);assert.equal(f.reloads,0,'An update never reloads a child activity automatically.');
  const before=active.messages.length;await f.retryAudioPack();
  assert.equal(f.reloads,1);assert.equal(active.messages.length,before);assert.equal(f.updates.length,0);
});

test('a delayed mismatch from a former controller cannot replace current ready status',async()=>{
  const stale=new Worker('former-controller'),f=fixture();await f.startAudioPack();
  f.progress('ready');assert.equal(f.audioPackStatus().state,'ready');
  f.mismatch(stale);
  assert.equal(f.audioPackStatus().state,'ready','Only the current controller can require a page refresh.');
  f.mismatch(f.serviceWorker.controller,{requestedBuild:'another-page-build'});
  assert.equal(f.audioPackStatus().state,'ready','A mismatch intended for another page release is irrelevant.');
});

test('failed active preparation can be explicitly retried and only a verified ready response completes it',async()=>{
  const f=fixture();await f.startAudioPack();
  f.progress('error');assert.equal(f.audioPackStatus().state,'error');assert.match(f.audioPackMessage(),/重新检查/);
  await f.retryAudioPack();assert.equal(f.audioPackStatus().state,'preparing');
  assert.equal(f.registration.active.messages.length,2);assert.equal(f.updates.length,1);
  f.progress('preparing',f.serviceWorker.controller,{done:574});assert.equal(f.audioPackStatus().state,'preparing');
  f.progress('ready');assert.equal(f.audioPackStatus().state,'ready');
  assert.equal(f.reloads,0);assert.equal(f.registrations.length,1,'Retrying preparation does not create another registration.');
});

test('failed installation is observed, and a newly discovered replacement can take control on retry',async()=>{
  const failed=new Worker('failed-install','installing'),replacement=new Worker('replacement','installing');
  const f=fixture({active:null,controller:null,installing:failed});await f.startAudioPack();
  failed.changeState('redundant');assert.equal(f.audioPackStatus().state,'error');
  f.registration.installing=null;
  f.registration.update=async()=>{f.updates.push({});f.registration.installing=replacement;f.registration.emit('updatefound');};
  await f.retryAudioPack();assert.equal(f.audioPackStatus().state,'preparing');
  replacement.changeState('activated');assert.equal(replacement.messages.length,1,'The replacement discovered by updatefound must be watched.');
  f.registration.active=replacement;f.registration.installing=null;f.control(replacement);f.progress('ready');
  assert.equal(f.audioPackStatus().state,'ready');assert.equal(f.updates.length,1);
});

test('registration and update failures remain retryable instead of leaving a false ready status',async()=>{
  const f=fixture({registerError:new Error('local service unavailable')});await f.startAudioPack();
  assert.equal(f.audioPackStatus().state,'error');
  f.setRegisterError(null);await f.retryAudioPack();assert.equal(f.registrations.length,2);
  f.setUpdateError(new Error('update check unavailable'));await f.retryAudioPack();
  assert.equal(f.audioPackStatus().state,'error');
  f.setUpdateError(null);await f.retryAudioPack();assert.equal(f.audioPackStatus().state,'preparing');
  f.progress('ready');assert.equal(f.audioPackStatus().state,'ready');
});

test('retrying a failed registration does not duplicate worker event listeners or preparation messages',async()=>{
  const f=fixture({registerError:new Error('local service unavailable')});await f.startAudioPack();
  f.setRegisterError(null);await f.retryAudioPack();
  const seen=[],unsubscribe=f.onAudioPackChange(value=>seen.push(plain(value)));
  const worker=f.serviceWorker.controller,beforeMessages=worker.messages.length,beforeNotifications=seen.length;
  f.control(worker);f.progress('ready');unsubscribe();
  assert.deepEqual({
    messageListeners:f.serviceWorker.listeners.get('message')?.size,
    controllerListeners:f.serviceWorker.listeners.get('controllerchange')?.size,
    prepareMessages:worker.messages.length-beforeMessages,
    readyNotifications:seen.length-beforeNotifications
  },{messageListeners:1,controllerListeners:1,prepareMessages:1,readyNotifications:1},
  'A failed registration retry must leave one listener per event and one preparation per control change.');
});

test('unsupported service workers and file URLs report their limitation without attempting registration',async()=>{
  for(const options of [{supported:false},{protocol:'file:'}]){
    const f=fixture(options);await f.startAudioPack();
    assert.equal(f.audioPackStatus().state,'unsupported');assert.match(f.audioPackMessage(),/无法保存离线声音/);
    await f.retryAudioPack();assert.equal(f.audioPackStatus().state,'unsupported');
    assert.equal(f.registrations.length,0);assert.equal(f.updates.length,0);
  }
});
