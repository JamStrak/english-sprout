import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {scoreSpeech,speechWords} from '../src/speech-match.js';
import {prepareSamples} from '../xiaoya/speech-signal.js';

const source = fs.readFileSync(new URL('../xiaoya/audio.js', import.meta.url), 'utf8')
  .replace("import {prepareSamples} from './speech-signal.js';", '')
  .replace(/export (async )?function /g, '$1function ')
  .replace("import('./speech-local.js')", 'loadSpeech()')
  .replace("import('../src/speech-match.js')", 'loadMatcher()');
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve=yes; reject=no; });
  return {promise,resolve,reject};
};
const flush = () => new Promise(resolve => setImmediate(resolve));

function fixture({webAudio=true, resume=Promise.resolve(), decode, meterByte=128, speech={}, permissionState='granted', permissionQuery, queryError, visible=true, recordingSupported=true, animationFrame=true, onConstruct=()=>{}}={}) {
  const permission=deferred(), timers=new Map(), intervals=new Map(), frames=new Map();
  const streams=[], recorders=[], contexts=[], urls=[], revoked=[], microphoneRequests=[], permissionQueries=[];
  let sequence=0, now=100;
  class Recorder {
    static isTypeSupported() { return true; }
    constructor(stream, options) { this.stream=stream; this.mimeType=options.mimeType; this.state='inactive'; recorders.push(this); }
    start() { this.startCalled=true; this.state='recording'; }
    emitStart() { this.onstart?.(); }
    stop() {
      this.stopCalled=true; this.state='inactive';
      queueMicrotask(() => {
        this.ondataavailable?.({data:new Blob(['fixture encoded recording'])});
        this.onstop?.();
      });
    }
  }
  const silent = {sampleRate:1000,length:400,numberOfChannels:1,getChannelData:()=>new Float32Array(400)};
  class Context {
    constructor() { this.closed=0; this.sources=0; contexts.push(this); onConstruct(); }
    resume() { return resume; }
    close() { this.closed++; return Promise.resolve(); }
    createMediaStreamSource() { this.sources++; return {connect(){}}; }
    createAnalyser() { return {fftSize:512,getByteTimeDomainData(values){values.fill(meterByte);}}; }
    decodeAudioData(bytes, success, failure) {
      this.decoded=(this.decoded||0)+1;
      Promise.resolve().then(()=>decode ? decode(bytes) : silent).then(success,failure);
    }
  }
  class ClipURL extends URL {
    static createObjectURL(blob) { const url=`blob:test-${urls.length}`; urls.push({url,blob}); return url; }
    static revokeObjectURL(url) { revoked.push(url); }
  }
  const window={isSecureContext:recordingSupported,MediaRecorder:Recorder};
  if (webAudio) window.AudioContext=Context;
  if (animationFrame) {
    window.requestAnimationFrame=fn=>{const id=++sequence;frames.set(id,fn);return id;};
    window.cancelAnimationFrame=id=>frames.delete(id);
  }
  const navigator={mediaDevices:{getUserMedia:options=>{
    const request=microphoneRequests.length ? deferred() : permission;
    microphoneRequests.push({options,...request}); return request.promise;
  }}};
  if (permissionState !== 'unsupported') navigator.permissions={query:options=>{
    permissionQueries.push(options);
    return queryError ? Promise.reject(queryError) : permissionQuery?.promise || Promise.resolve({state:permissionState});
  }};
  const sandbox={
    window,navigator,
    document:{baseURI:'http://127.0.0.1/app/',visibilityState:visible?'visible':'hidden',hidden:!visible}, location:{origin:'http://127.0.0.1'},
    MediaRecorder:Recorder,Blob,URL:ClipURL,DOMException,AbortController,prepareSamples,
    performance:{now:()=>now},
    setTimeout(fn,delay){const id=++sequence;timers.set(id,{fn,delay,due:now+delay});return id;},
    clearTimeout(id){timers.delete(id);},
    setInterval(fn,delay){const id=++sequence;intervals.set(id,{fn,delay});return id;},
    clearInterval(id){intervals.delete(id);},
    loadSpeech:()=>Promise.resolve(speech),loadMatcher:()=>Promise.resolve({scoreSpeech,speechWords})
  };
  vm.runInNewContext(source+`;globalThis.api={prepareRecording:typeof prepareRecording==='function'?prepareRecording:undefined,beginRecording,finishRecording,cancelRecording,releaseAudioSession,hasClip,prepareRecognition,speechReady,recognize,cancelRecognition};`,sandbox);
  return {
    ...sandbox.api, permission,recorders,contexts,streams,timers,intervals,frames,urls,revoked,microphoneRequests,permissionQueries,
    grant(index=Math.max(0,microphoneRequests.length-1)) {
      const track={stopped:0,readyState:'live',stop(){this.stopped++;this.readyState='ended';}};
      const stream={track,get active(){return track.readyState==='live';},getTracks:()=>[track],getAudioTracks:()=>[track]};
      streams.push(stream); (microphoneRequests[index] || permission).resolve(stream); return stream;
    },
    setVisible(value) { sandbox.document.visibilityState=value?'visible':'hidden'; sandbox.document.hidden=!value; },
    paintFrame() { const pending=[...frames.values()]; frames.clear(); for(const fn of pending)fn(now); },
    advance(ms) { now+=ms; },
    async advanceTimers(ms) {
      const target=now+ms;
      while(true) {
        const next=[...timers].filter(([,timer])=>timer.due<=target).sort((a,b)=>a[1].due-b[1].due)[0];
        if(!next)break;
        now=next[1].due; timers.delete(next[0]); next[1].fn(); await flush();
      }
      now=target; await flush();
    },
    async start(options) { const pending=sandbox.api.beginRecording(options); this.grant(); await flush(); recorders.at(-1).emitStart(); assert.equal(await pending,true); this.paintFrame(); await this.advanceTimers(0); return recorders.at(-1); }
  };
}

test('granted microphone preparation is shared, creates no recorder or clip, and is claimed without a second request', async () => {
  const f=fixture();
  const first=f.prepareRecording(), second=f.prepareRecording(); await flush();
  assert.equal(f.permissionQueries.length,1); assert.equal(f.permissionQueries[0].name,'microphone');
  assert.equal(f.microphoneRequests.length,1);
  const stream=f.grant(); assert.equal(await first,true); assert.equal(await second,true);
  assert.equal(f.recorders.length,0); assert.equal(f.contexts.length,0); assert.equal(f.urls.length,0); assert.equal(f.hasClip(),false);
  assert.equal(stream.track.readyState,'live');
  assert.equal(await f.prepareRecording(),true); assert.equal(f.microphoneRequests.length,1);
  let ready=0, settled=false;
  const started=f.beginRecording({onReady(){ready++;}}).then(value=>{settled=true;return value;}); await flush();
  assert.equal(f.microphoneRequests.length,1); assert.equal(f.recorders[0].stream,stream);
  assert.equal(ready,0); assert.equal(settled,false,'A warm stream is not the recorder start event');
  assert.equal([...f.timers.values()].some(timer=>timer.delay===20000),false,'Claiming removes the idle microphone deadline');
  f.recorders[0].emitStart(); assert.equal(await started,true); assert.equal(ready,1);
  f.releaseAudioSession(); assert.equal(stream.track.readyState,'ended'); assert.equal(f.urls.length,0);
});

test('recording claims an in-flight warm microphone request and still waits for the native start event', async () => {
  const f=fixture(); const prepared=f.prepareRecording(); await flush();
  assert.equal(f.microphoneRequests.length,1);
  let ready=0; const started=f.beginRecording({onReady(){ready++;}}); await flush();
  assert.equal(f.microphoneRequests.length,1,'A tap while getUserMedia is pending must share its request');
  const stream=f.grant(); await prepared; await flush();
  assert.equal(f.microphoneRequests.length,1); assert.equal(f.recorders.length,1);
  assert.equal(f.recorders[0].stream,stream); assert.equal(stream.track.readyState,'live'); assert.equal(ready,0);
  f.recorders[0].emitStart(); assert.equal(await started,true); assert.equal(ready,1);
  f.releaseAudioSession(); assert.equal(stream.track.readyState,'ended');
});

test('microphone warmup skips prompt, denied, unsupported and failed permission queries without requesting access', async () => {
  for (const options of [
    {permissionState:'prompt'}, {permissionState:'denied'}, {permissionState:'unsupported'},
    {queryError:new Error('microphone permission queries are unsupported')}, {recordingSupported:false}, {visible:false}
  ]) {
    const f=fixture(options);
    assert.equal(await f.prepareRecording(),false,JSON.stringify(options));
    assert.equal(f.microphoneRequests.length,0); assert.equal(f.recorders.length,0); assert.equal(f.contexts.length,0);
    assert.equal(f.urls.length,0); assert.equal(f.timers.size,0);
    f.releaseAudioSession();
  }
});

test('a prepared microphone expires after 20 seconds and later recording requests a new live stream', async () => {
  const f=fixture(), prepared=f.prepareRecording(); await flush();
  const warm=f.grant(); assert.equal(await prepared,true);
  await f.advanceTimers(19999); assert.equal(warm.track.readyState,'live');
  await f.advanceTimers(1); assert.equal(warm.track.readyState,'ended'); assert.equal(warm.track.stopped,1);
  assert.equal(f.recorders.length,0); assert.equal(f.urls.length,0);
  const started=f.beginRecording(); await flush(); assert.equal(f.microphoneRequests.length,2);
  const fresh=f.grant(); await flush(); assert.equal(f.recorders[0].stream,fresh);
  f.recorders[0].emitStart(); assert.equal(await started,true); f.releaseAudioSession();
});

test('cancelling preparation while permission query is unresolved prevents a late microphone request', async () => {
  const query=deferred(), f=fixture({permissionQuery:query});
  const prepared=f.prepareRecording(); await flush(); assert.equal(f.permissionQueries.length,1);
  f.cancelRecording(); query.resolve({state:'granted'});
  assert.equal(await prepared,false); await flush();
  assert.equal(f.microphoneRequests.length,0); assert.equal(f.recorders.length,0); assert.equal(f.timers.size,0);
});

test('release stops a late warm stream and cannot create a recorder, clip or retained deadline', async () => {
  const f=fixture(), prepared=f.prepareRecording(); await flush();
  assert.equal(f.microphoneRequests.length,1); f.releaseAudioSession();
  const late=f.grant(); assert.equal(await prepared,false); await flush();
  assert.equal(late.track.readyState,'ended'); assert.equal(late.track.stopped,1);
  assert.equal(f.recorders.length,0); assert.equal(f.urls.length,0); assert.equal(f.timers.size,0);
});

test('hidden pages cannot finish an unresolved warm permission query by requesting microphone access', async () => {
  const query=deferred(), f=fixture({permissionQuery:query});
  const prepared=f.prepareRecording(); await flush(); f.setVisible(false); query.resolve({state:'granted'});
  assert.equal(await prepared,false); assert.equal(f.microphoneRequests.length,0); assert.equal(f.timers.size,0);
});

test('keepPrepared preserves a live warm stream but default cancellation releases it', async () => {
  const f=fixture(), prepared=f.prepareRecording(); await flush(); const warm=f.grant(); await prepared;
  f.cancelRecording({keepPrepared:true}); assert.equal(warm.track.readyState,'live');
  assert.equal(await f.prepareRecording(),true); assert.equal(f.microphoneRequests.length,1);
  f.cancelRecording(); assert.equal(warm.track.readyState,'ended'); assert.equal(warm.track.stopped,1);
  assert.equal(f.timers.size,0);
});

test('an externally ended warm track is never given to MediaRecorder and falls back to a fresh request', async () => {
  const f=fixture(), prepared=f.prepareRecording(); await flush(); const warm=f.grant(); await prepared;
  warm.track.stop(); const started=f.beginRecording(); await flush();
  assert.equal(f.microphoneRequests.length,2); assert.equal(f.recorders.length,0);
  const fresh=f.grant(); await flush(); assert.equal(f.recorders[0].stream,fresh); assert.equal(fresh.track.readyState,'live');
  f.recorders[0].emitStart(); assert.equal(await started,true); f.releaseAudioSession();
});

test('failed warm acquisition returns false and a later preparation can retry', async () => {
  const f=fixture(), first=f.prepareRecording(); await flush();
  f.microphoneRequests[0].reject(new Error('microphone device busy'));
  assert.equal(await first,false); assert.equal(f.timers.size,0); assert.equal(f.recorders.length,0);
  const retry=f.prepareRecording(); await flush(); assert.equal(f.microphoneRequests.length,2);
  const stream=f.grant(); assert.equal(await retry,true); assert.equal(stream.track.readyState,'live');
  f.releaseAudioSession(); assert.equal(stream.track.readyState,'ended');
});

test('finishing a recording claimed from warmup releases its track and does not reuse it for the next recording', async () => {
  const f=fixture(), prepared=f.prepareRecording(); await flush(); const warm=f.grant(); await prepared;
  const finished=deferred(), started=f.beginRecording({onFinish:finished.resolve}); await flush();
  f.recorders[0].emitStart(); assert.equal(await started,true);
  f.finishRecording(); const result=await finished.promise;
  assert.ok(result.url); assert.equal(warm.track.readyState,'ended'); assert.equal(f.microphoneRequests.length,1);
  const next=f.beginRecording(); await flush(); assert.equal(f.microphoneRequests.length,2);
  const fresh=f.grant(); await flush(); assert.equal(f.recorders[1].stream,fresh);
  assert.notEqual(fresh,warm); assert.deepEqual(f.revoked,[result.url]);
  f.recorders[1].emitStart(); assert.equal(await next,true); f.releaseAudioSession();
});

test('device acquisition times out after 10 seconds and a late stream is stopped without announcing readiness', async () => {
  const f=fixture(); let ready=0, finished=0;
  const started=f.beginRecording({onReady(){ready++;},onFinish(){finished++;}});
  const rejected=assert.rejects(started,/话筒启动较慢/);
  assert.equal(f.microphoneRequests.length,1); assert.equal(f.recorders.length,0);
  await f.advanceTimers(9999); assert.equal(f.contexts.length,0);
  await f.advanceTimers(1); await rejected; assert.equal(f.contexts.length,0);
  const late=f.grant(); await flush();
  assert.equal(late.track.readyState,'ended'); assert.equal(late.track.stopped,1);
  assert.equal(f.microphoneRequests.length,1); assert.equal(f.recorders.length,0);
  assert.equal(ready,0); assert.equal(finished,0); assert.equal(f.urls.length,0); assert.equal(f.timers.size,0);
});

for (const exit of ['cancel','timeout']) test(`a claimed pending warm request survives no extra request after ${exit} and closes its late stream`, async () => {
  const f=fixture(), prepared=f.prepareRecording(); await flush();
  assert.equal(f.microphoneRequests.length,1);
  let ready=0, finished=0;
  const started=f.beginRecording({onReady(){ready++;},onFinish(){finished++;}}); await flush();
  assert.equal(f.microphoneRequests.length,1); assert.equal(f.recorders.length,0);
  if (exit==='cancel') { f.cancelRecording(); assert.equal(await started,false); }
  else {
    const rejected=assert.rejects(started,/话筒启动较慢/);
    await f.advanceTimers(10000); await rejected;
  }
  const late=f.grant(); assert.equal(await prepared,false); await flush();
  assert.equal(late.track.readyState,'ended'); assert.equal(late.track.stopped,1);
  assert.equal(f.microphoneRequests.length,1,'A stale warm completion must not trigger the fallback request');
  assert.equal(f.recorders.length,0); assert.equal(ready,0); assert.equal(finished,0);
  assert.equal(f.urls.length,0); assert.equal(f.timers.size,0); assert.equal(f.contexts.length,0);
});

test('an explicit recording tap bypasses a pending permission query and ignores its later granted result', async () => {
  const query=deferred(), f=fixture({permissionQuery:query}), prepared=f.prepareRecording(); await flush();
  assert.equal(f.permissionQueries.length,1); assert.equal(f.microphoneRequests.length,0);
  let ready=0; const started=f.beginRecording({onReady(){ready++;}}); await flush();
  assert.equal(f.microphoneRequests.length,1,'Explicit capture must not wait for the uncompleted permissions query');
  const stream=f.grant(); await flush(); assert.equal(f.recorders.length,1); assert.equal(ready,0);
  f.recorders[0].emitStart(); assert.equal(await started,true); assert.equal(ready,1);
  query.resolve({state:'granted'}); assert.equal(await prepared,false); await flush();
  assert.equal(f.microphoneRequests.length,1); assert.equal(f.recorders.length,1);
  assert.equal(f.recorders[0].stream,stream); assert.equal(stream.track.readyState,'live');
  f.releaseAudioSession(); assert.equal(stream.track.readyState,'ended'); assert.equal(f.timers.size,0);
});

test('capture starts and announces readiness without waiting for Web Audio resume', async () => {
  const resume=deferred(), f=fixture({resume:resume.promise});
  let ready=0, settled=false;
  const pending=f.beginRecording({onReady(){ready++;}}).then(value=>{settled=true;return value;});
  f.grant(); await flush();
  assert.equal(f.recorders[0].startCalled,true);
  assert.equal(ready,0); assert.equal(settled,false);
  f.recorders[0].emitStart(); assert.equal(await pending,true);
  f.recorders[0].emitStart();
  assert.equal(ready,1); assert.equal(f.contexts.length,0);
  f.paintFrame(); await f.advanceTimers(0); assert.equal(f.contexts[0].sources,0);
  f.releaseAudioSession(); resume.resolve(); await flush();
  assert.equal(f.contexts[0].sources,0); assert.equal(f.intervals.size,0);
});

test('optional context construction happens only after native start, ready settlement and a paint opportunity', async () => {
  let ready=false, settled=false, constructed=false;
  const f=fixture({onConstruct(){
    assert.equal(ready,true); assert.equal(settled,true);
    assert.equal(f.recorders[0].state,'recording'); constructed=true;
  }});
  const pending=f.beginRecording({onReady(){ready=true;}}).then(value=>{settled=true;return value;});
  assert.equal(f.contexts.length,0,'Device permission cannot construct a context');
  f.grant(); await flush(); assert.equal(f.contexts.length,0,'recorder.start() alone is not readiness');
  f.recorders[0].emitStart(); assert.equal(await pending,true);
  assert.equal(constructed,false,'The synchronous ready callback must not construct a context');
  f.paintFrame(); assert.equal(constructed,false,'The paint callback only schedules a later task');
  await f.advanceTimers(0); assert.equal(constructed,true);
  f.releaseAudioSession(); assert.equal(f.contexts[0].closed,1);
});

for (const stage of ['frame','task']) for (const action of ['cancel','finish']) test(`${action} before the deferred meter ${stage} releases capture without constructing a late context`, async () => {
  const f=fixture(), finished=deferred(), pending=f.beginRecording({onFinish:finished.resolve});
  f.grant(); await flush(); f.recorders[0].emitStart(); assert.equal(await pending,true);
  if(stage==='task')f.paintFrame();
  const stale=stage==='frame'?[...f.frames.values()][0]:[...f.timers.values()].find(timer=>timer.delay===0)?.fn;
  assert.equal(typeof stale,'function');
  action==='cancel'?f.cancelRecording():f.finishRecording();
  if(action==='finish'){
    const result=await finished.promise;
    assert.ok(result.url); assert.equal(result.voiceActivityAvailable,false,'Unmeasured audio must remain available for recognition');
  }
  stale(); f.paintFrame(); await f.advanceTimers(0);
  assert.equal(f.contexts.length,0); assert.equal(f.frames.size,0); assert.equal(f.timers.size,0);
  assert.equal(f.streams[0].track.readyState,'ended'); f.releaseAudioSession();
});

test('a context constructed after reentrant cancellation is closed without attaching a meter', async () => {
  const f=fixture({onConstruct(){f.cancelRecording();}}), pending=f.beginRecording();
  f.grant(); await flush(); f.recorders[0].emitStart(); assert.equal(await pending,true);
  f.paintFrame(); await f.advanceTimers(0);
  assert.equal(f.contexts.length,1); assert.equal(f.contexts[0].closed,1);
  assert.equal(f.contexts[0].sources,0); assert.equal(f.intervals.size,0);
  assert.equal(f.streams[0].track.readyState,'ended'); assert.equal(f.frames.size,0); assert.equal(f.timers.size,0);
});

test('without requestAnimationFrame the optional meter is still deferred beyond readiness', async () => {
  const f=fixture({animationFrame:false}), pending=f.beginRecording();
  f.grant(); await flush(); f.recorders[0].emitStart(); assert.equal(await pending,true);
  assert.equal(f.contexts.length,0); await f.advanceTimers(0); assert.equal(f.contexts.length,1);
  f.releaseAudioSession();
});

test('cancelling pending permission settles immediately and stops a late granted stream', async () => {
  const f=fixture(); let ready=0, finished=0;
  const pending=f.beginRecording({onReady(){ready++;},onFinish(){finished++;}});
  f.cancelRecording(); assert.equal(await pending,false);
  const stream=f.grant(); await flush();
  assert.equal(stream.track.stopped,1); assert.equal(f.recorders.length,0);
  assert.equal(ready,0); assert.equal(finished,0); assert.equal(f.contexts.length,0);
});

test('cancelling after recorder.start but before its start event suppresses a late ready cue', async () => {
  const f=fixture(); let ready=0;
  const pending=f.beginRecording({onReady(){ready++;}}); f.grant(); await flush();
  const recorder=f.recorders[0], lateStart=recorder.onstart;
  f.cancelRecording(); assert.equal(await pending,false); lateStart(); await flush();
  assert.equal(ready,0); assert.equal(recorder.state,'inactive');
  assert.ok(f.streams[0].track.stopped); assert.equal(f.urls.length,0);
});

test('words captured before the meter resumes are checked from the entire local recording', async () => {
  const pcm=Float32Array.from({length:400},(_,i)=>i<280 ? Math.sin(i*.9)*.1 : 0);
  const f=fixture({resume:new Promise(()=>{}),decode:()=>({sampleRate:1000,length:400,numberOfChannels:1,getChannelData:()=>pcm})});
  const finished=deferred();
  await f.start({onFinish:finished.resolve}); f.advance(400); f.finishRecording();
  const result=await finished.promise;
  assert.equal(result.hasVoice,true); assert.equal(result.voiceActivityAvailable,true);
  assert.equal(result.duration,.4); assert.equal(f.contexts[0].decoded,1);
  assert.ok(result.url); assert.ok(f.contexts[0].closed); assert.ok(f.streams[0].track.stopped);
  f.releaseAudioSession(); assert.equal(f.hasClip(),false); assert.deepEqual(f.revoked,[result.url]);
});

test('a decoded silent clip is reported as silence, not speech', async () => {
  const f=fixture(), finished=deferred();
  await f.start({onFinish:finished.resolve}); f.finishRecording();
  const result=await finished.promise;
  assert.equal(result.hasVoice,false); assert.equal(result.voiceActivityAvailable,true);
  assert.ok(result.url); f.releaseAudioSession();
});

test('recording still works without Web Audio and reports unavailable voice detection honestly', async () => {
  const f=fixture({webAudio:false}), finished=deferred();
  await f.start({onFinish:finished.resolve}); f.finishRecording();
  const result=await finished.promise;
  assert.ok(result.url); assert.equal(result.hasVoice,false); assert.equal(result.voiceActivityAvailable,false);
  f.releaseAudioSession();
});

test('a timed-out full-clip check cannot call late silent meter samples proof of silence', async () => {
  const resume=deferred(), f=fixture({resume:resume.promise,decode:()=>new Promise(()=>{})});
  const finished=deferred();
  await f.start({onFinish:finished.resolve});
  f.advance(600); resume.resolve(); await flush();
  assert.equal(f.intervals.size,1);
  [...f.intervals.values()][0].fn(); // Only the quiet tail was observed live.
  f.finishRecording(); await flush();
  [...f.timers.values()].find(timer=>timer.delay===1800).fn();
  const result=await finished.promise;
  assert.ok(result.url); assert.equal(result.hasVoice,false);
  assert.equal(result.voiceActivityAvailable,false,'Keep the recording available for recognition instead of declaring silence');
  f.releaseAudioSession();
});

test('failed full-clip decoding reports unknown voice activity even when the meter sampled silence', async () => {
  const f=fixture({decode:()=>Promise.reject(new Error('unsupported decoder'))}), finished=deferred();
  await f.start({onFinish:finished.resolve});
  assert.equal(f.intervals.size,1); [...f.intervals.values()][0].fn();
  f.finishRecording(); const result=await finished.promise;
  assert.ok(result.url); assert.equal(result.hasVoice,false); assert.equal(result.voiceActivityAvailable,false);
  f.releaseAudioSession();
});

test('confirmed live voice activity remains usable without a second decode', async () => {
  const f=fixture({meterByte:144,decode:()=>Promise.reject(new Error('must not decode'))}), finished=deferred();
  await f.start({onFinish:finished.resolve});
  for(let i=0;i<3;i++){f.advance(80);[...f.intervals.values()][0].fn();}
  f.finishRecording(); const result=await finished.promise;
  assert.equal(result.hasVoice,true); assert.equal(result.voiceActivityAvailable,true);
  assert.equal(f.contexts[0].decoded,undefined); f.releaseAudioSession();
});

test('release during delayed final decoding cannot create a clip or deliver a stale result', async () => {
  const decoded=deferred(), f=fixture({decode:()=>decoded.promise}); let finished=0;
  await f.start({onFinish(){finished++;}}); f.finishRecording(); await flush();
  assert.equal(f.contexts[0].decoded,1); f.releaseAudioSession();
  decoded.resolve({sampleRate:1000,length:400,numberOfChannels:1,getChannelData:()=>new Float32Array(400).fill(.1)});
  await flush();
  assert.equal(finished,0); assert.equal(f.urls.length,0); assert.equal(f.hasClip(),false);
});

test('permission denial and native startup failure reject readiness and clean up', async () => {
  const f=fixture(), denied=new Error('denied');
  const pending=f.beginRecording(); f.permission.reject(denied);
  await assert.rejects(pending,/denied/); assert.equal(f.contexts.length,0);
  const g=fixture(); const second=g.beginRecording(); g.grant(); await flush();
  g.recorders[0].onerror();
  await assert.rejects(second,/录音没有完成/);
  assert.equal(g.recorders[0].state,'inactive'); assert.ok(g.streams[0].track.stopped);
});

test('a recorder that never starts times out and cleans up the granted microphone', async () => {
  const f=fixture(), pending=f.beginRecording(); f.grant(); await flush();
  [...f.timers.values()].find(timer=>timer.delay===10000).fn();
  await assert.rejects(pending,/话筒启动较慢/);
  assert.equal(f.recorders[0].state,'inactive'); assert.ok(f.streams[0].track.stopped);
});

test('background recognition preparation is shared and new observers get progress; leaving does not abort it', async () => {
  const download=deferred(), calls=[];
  const f=fixture({speech:{prepareSpeech(options){calls.push(options);options.onStatus('下载中');return download.promise;}}});
  const first=[],second=[];
  const a=f.prepareRecognition(value=>first.push(value)); await flush();
  const b=f.prepareRecognition(value=>second.push(value));
  assert.equal(calls.length,1); assert.equal(calls[0].background,true); assert.deepEqual(second,['下载中']);
  f.releaseAudioSession(); assert.equal(f.speechReady(),false);
  download.resolve(); assert.equal(await a,true); assert.equal(await b,true);
  assert.equal(f.speechReady(),true); assert.equal(first.at(-1),'小耳朵准备好了'); assert.equal(second.at(-1),'小耳朵准备好了');
});

test('recognition exposes the actual best accepted word match, partial coverage and zero scores for silence', async () => {
  let heard='Morning';
  const f=fixture({speech:{prepareSpeech:async()=>{},assessRecording:async()=>({heard})}});
  assert.equal(await f.recognize('blob:test',['Good morning']),null);
  await f.prepareRecognition();
  let result=await f.recognize('blob:test',['Good morning','Morning']);
  assert.equal(result.variant,'Morning'); assert.equal(result.matched,true); assert.equal(result.stars,3);
  assert.equal(result.coverage,1); assert.equal(result.precision,1); assert.equal(result.matchedWords,1);
  heard='good'; result=await f.recognize('blob:test',['Good morning']);
  assert.equal(result.matched,false); assert.equal(result.stars,2); assert.equal(result.coverage,.5); assert.equal(result.precision,1);
  heard=''; result=await f.recognize('blob:test',['Good morning']);
  assert.equal(result.matched,false); assert.equal(result.stars,0); assert.equal(result.coverage,0); assert.equal(result.precision,0);
});

test('Xiaoya accepts one ASR article insertion only with the complete ordered phrase and keeps raw lexical metrics', async () => {
  let heard='i need a water';
  const f=fixture({speech:{prepareSpeech:async()=>{},assessRecording:async()=>({heard})}});
  await f.prepareRecognition();
  for(const article of ['a','an','the']){
    heard=`i need ${article} water`;
    const result=await f.recognize('blob:test',['I need water','Water please','Water']);
    assert.equal(result.matched,true,heard); assert.equal(result.stars,3);
    assert.equal(result.variant,'I need water'); assert.equal(result.coverage,1);
    assert.equal(result.precision,.75); assert.equal(result.matchedWords,3);
    assert.equal(result.expectedWords,3); assert.equal(result.heard,heard);
    assert.equal('pronunciation' in result,false);
    assert.equal(scoreSpeech('I need water',heard).matched,false,'Shared old-product matching remains unchanged');
  }
});

test('Xiaoya article tolerance does not accept missing content, other inserts or a long unrelated utterance', async () => {
  let heard='';
  const f=fixture({speech:{prepareSpeech:async()=>{},assessRecording:async()=>({heard})}});
  await f.prepareRecognition();
  for(const words of ['i need a the water','i a water','i need a juice','i need cold water','a i need water','i need water a','water i need','i need a water and a banana']){
    heard=words; const result=await f.recognize('blob:test',['I need water','Water please','Water']);
    assert.equal(result.matched,false,words); assert.equal(result.variant,null,words);
    assert(result.stars<3,words);
  }
});

test('Xiaoya rejects changed negation, antonyms and missing semantic words even at the shared 80 percent threshold', async () => {
  let heard='';
  const f=fixture({speech:{prepareSpeech:async()=>{},assessRecording:async()=>({heard})}});
  await f.prepareRecognition();
  const cases=[
    ['I hear a dog','I hear no a dog'],
    ["Let's read a book",'let us not read a book'],
    ["Let's read a book",'let us never read a book'],
    ["Let's read a book",'let us close a book'],
    ["Let's read a book",'let us a book'],
    ['Please do not open the box','please do open the box'],
    ['Please open the big box','please close the big box'],
    ['My little socks are wet','my little socks are dry'],
    ['Can I have some water please','can you have some water please'],
    ['I need water','I do not need a water'],
    ['No thank you','thank you']
  ];
  for(const [expected,words] of cases){
    heard=words; const result=await f.recognize('blob:test',[expected]);
    assert.equal(result.matched,false,`${expected} / ${words}`); assert(result.stars<3);
  }
  heard='can i have water please';
  assert.equal((await f.recognize('blob:test',['Can I have some water please'])).matched,true,'Existing long-phrase omission of some remains supported');
  heard='i want water';
  assert.equal((await f.recognize('blob:test',['I want some water'])).matched,false,'Short phrases still require every target word');
});

test('a cancelled recognizer cannot consume or return a late transcript even if its backend ignores abort', async () => {
  const assessment=deferred(); let signal,consumed=false;
  const f=fixture({speech:{prepareSpeech:async()=>{},assessRecording:async(_url,_expected,options)=>{signal=options.signal;return assessment.promise;}}});
  await f.prepareRecognition(); const pending=f.recognize('blob:test',['Good morning']); await flush();
  f.releaseAudioSession(); assert.equal(signal.aborted,true); assert.equal(f.speechReady(),false);
  assessment.resolve({get heard(){consumed=true;return 'Good morning';}});
  await assert.rejects(pending,{name:'AbortError'}); assert.equal(consumed,false);
});
