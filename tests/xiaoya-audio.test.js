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

function fixture({webAudio=true, resume=Promise.resolve(), decode, meterByte=128, speech={}}={}) {
  const permission=deferred(), timers=new Map(), intervals=new Map();
  const streams=[], recorders=[], contexts=[], urls=[], revoked=[];
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
    constructor() { this.closed=0; this.sources=0; contexts.push(this); }
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
  const window={isSecureContext:true,MediaRecorder:Recorder};
  if (webAudio) window.AudioContext=Context;
  const sandbox={
    window, navigator:{mediaDevices:{getUserMedia:()=>permission.promise}},
    document:{baseURI:'http://127.0.0.1/app/'}, location:{origin:'http://127.0.0.1'},
    MediaRecorder:Recorder,Blob,URL:ClipURL,DOMException,AbortController,prepareSamples,
    performance:{now:()=>now},
    setTimeout(fn,delay){const id=++sequence;timers.set(id,{fn,delay});return id;},
    clearTimeout(id){timers.delete(id);},
    setInterval(fn,delay){const id=++sequence;intervals.set(id,{fn,delay});return id;},
    clearInterval(id){intervals.delete(id);},
    loadSpeech:()=>Promise.resolve(speech),loadMatcher:()=>Promise.resolve({scoreSpeech,speechWords})
  };
  vm.runInNewContext(source+`;globalThis.api={beginRecording,finishRecording,cancelRecording,releaseAudioSession,hasClip,prepareRecognition,speechReady,recognize,cancelRecognition};`,sandbox);
  return {
    ...sandbox.api, permission,recorders,contexts,streams,timers,intervals,urls,revoked,
    grant() { const track={stopped:0,stop(){this.stopped++;}}; const stream={track,getTracks:()=>[track]}; streams.push(stream); permission.resolve(stream); return stream; },
    advance(ms) { now+=ms; },
    async start(options) { const pending=sandbox.api.beginRecording(options); this.grant(); await flush(); recorders.at(-1).emitStart(); assert.equal(await pending,true); return recorders.at(-1); }
  };
}

test('capture starts and announces readiness without waiting for Web Audio resume', async () => {
  const resume=deferred(), f=fixture({resume:resume.promise});
  let ready=0, settled=false;
  const pending=f.beginRecording({onReady(){ready++;}}).then(value=>{settled=true;return value;});
  f.grant(); await flush();
  assert.equal(f.recorders[0].startCalled,true);
  assert.equal(ready,0); assert.equal(settled,false);
  f.recorders[0].emitStart(); assert.equal(await pending,true);
  f.recorders[0].emitStart();
  assert.equal(ready,1); assert.equal(f.contexts[0].sources,0);
  f.releaseAudioSession(); resume.resolve(); await flush();
  assert.equal(f.contexts[0].sources,0); assert.equal(f.intervals.size,0);
});

test('cancelling pending permission settles immediately and stops a late granted stream', async () => {
  const f=fixture(); let ready=0, finished=0;
  const pending=f.beginRecording({onReady(){ready++;},onFinish(){finished++;}});
  f.cancelRecording(); assert.equal(await pending,false);
  const stream=f.grant(); await flush();
  assert.equal(stream.track.stopped,1); assert.equal(f.recorders.length,0);
  assert.equal(ready,0); assert.equal(finished,0); assert.ok(f.contexts[0].closed);
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
  await assert.rejects(pending,/denied/); assert.ok(f.contexts[0].closed);
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
