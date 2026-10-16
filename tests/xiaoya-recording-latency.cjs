// Recording timing only: real isolated Edge/MediaRecorder, no speech model.
// TEST_LABEL=baseline/final preserves comparable reports for each built version.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'C:/Users/Jam/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const origin=new URL(process.env.TEST_URL||'http://127.0.0.1:24756').origin;
if(!['127.0.0.1','localhost','[::1]'].includes(new URL(origin).hostname))throw Error('Use an isolated loopback test server.');
const label=process.env.TEST_LABEL||'run';
const final=process.env.TEST_FINAL==='1';
const meterFocus=process.env.TEST_METER_FOCUS==='1';
if(!/^[a-z0-9-]+$/i.test(label))throw Error('TEST_LABEL must be a plain label.');
const out=path.join(root,'test-results/xiaoya-recording-latency',label);
fs.mkdirSync(out,{recursive:true});
const report={label,origin,final,meterFocus,actualMediaRecorder:true,syntheticMicrophone:true,asrIsolated:true,realDeviceValidated:false,checks:[],requests:[],errors:[]};
const knownAudio=Array.from(fs.readFileSync(path.join(root,'public/audio/characters/pip/needs-01.mp3')));
let browser,context,page;
function save(){fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(report,null,2));}
function pass(name,evidence){report.checks.push({name,status:'PASS',evidence});save();console.log('PASS '+name+' '+JSON.stringify(evidence?.timing||evidence?.phrase||{}));}
async function fixture({synthetic=false,gumDelay=0,holdResume=false,contextBlock=0,permission='prompt'}={}){
  context=await browser.newContext({permissions:['microphone'],viewport:{width:390,height:844},serviceWorkers:'block'});
  context.on('request',r=>report.requests.push({url:r.url(),method:r.method()}));
  await context.route('**/*',r=>new URL(r.request().url()).origin===origin?r.continue():r.abort('blockedbyclient'));
  // Exclude ASR CPU/downloads without mocking any microphone or recorder event.
  await context.route(/\/releases\/[^/]+\/speech-local\.js$/,r=>r.fulfill({contentType:'text/javascript',body:'export async function prepareSpeech(){throw Error("Recording-only QA: no ASR");} export async function assessRecording(){throw Error("Recording-only QA: no ASR");} export function disposeSpeechAssessment(){}'}));
  await context.addInitScript(({origin,synthetic,gumDelay,holdResume,contextBlock,knownAudio,permission})=>{
    if(location.origin!==origin)return;
    localStorage.setItem('xiaoya-english:preferences:v1',JSON.stringify({mic:true}));
    const now=()=>performance.now(),wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
    const q=window.qaLatency={attempts:[],acquisitions:[],contexts:[],streams:[],records:[],chunks:[],gumDelay,holdResume,contextBlock,permission};
    const meterGate=holdResume?new Promise(resolve=>{q.releaseMeter=resolve;}):Promise.resolve();
    const NativeContext=window.AudioContext,NativeRecorder=window.MediaRecorder,NativeAudio=window.Audio;
    const get=navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    const query=navigator.permissions.query.bind(navigator.permissions);
    navigator.permissions.query=async options=>options.name==='microphone'?{state:q.permission,addEventListener(){},removeEventListener(){}}:query(options);
    window.Audio=function(...args){const a=new NativeAudio(...args);a.playbackRate=4;return a;};window.Audio.prototype=NativeAudio.prototype;
    window.AudioContext=class extends NativeContext{
      constructor(...args){const constructCalledAt=now();while(now()-constructCalledAt<q.contextBlock){}super(...args);this.qaEntry={constructCalledAt,createdAt:now()};q.contexts.push(this.qaEntry);}
      resume(){const e=this.qaEntry;e.resumeCalledAt=now();return super.resume().then(async()=>{e.nativeResumedAt=now();await meterGate;e.resumedAt=now();});}
    };
    document.addEventListener('click',e=>{
      const action=e.target.closest('[data-action]')?.dataset.action;
      if(action==='record'&&!document.querySelector('.recording-indicator'))q.attempts.push({clickAt:now()});
      if(action==='home')q.exitAt=now();
    },true);
    new MutationObserver(()=>{
      const a=q.attempts.at(-1);if(!a)return;
      if(!a.waitingAt&&document.querySelector('[data-action="record"][disabled]'))a.waitingAt=now();
      if(!a.uiReadyAt&&document.querySelector('.recording-indicator')){
        a.uiReadyAt=now();
        requestAnimationFrame(()=>{a.readyFrameAt=now();});
        if(q.source){a.sourceStartedAt=now();q.source.start(q.fixtureContext.currentTime+.025);}
      }
    }).observe(document,{childList:true,subtree:true,attributes:true});
    navigator.mediaDevices.getUserMedia=async(...args)=>{
      const a={id:q.acquisitions.length,gumCalledAt:now(),constraints:args[0]};q.acquisitions.push(a);
      const stream=await get(...args);a.gumNativeResolvedAt=now();q.streams.push(stream);
      if(q.gumDelay)await wait(q.gumDelay);
      a.gumDeliveredAt=now();
      if(synthetic){stream.getTracks().forEach(t=>t.stop());q.streams.push(q.destination.stream);a.stream=q.destination.stream;return q.destination.stream;}
      a.stream=stream;
      return stream;
    };
    window.MediaRecorder=class extends NativeRecorder{
      constructor(...args){
        super(...args);this.qaEntry={constructedAt:now(),mimeType:this.mimeType,bytes:0};q.records.push(this.qaEntry);
        const chunks=[];q.chunks.push(chunks);const a=q.attempts.at(-1),e=this.qaEntry;
        const acquisition=q.acquisitions.find(g=>g.stream===args[0]);if(acquisition){const {stream,...fields}=acquisition;e.acquisitionId=fields.id;if(a)Object.assign(a,fields);}
        this.addEventListener('start',()=>{e.onstartAt=now();if(a)a.onstartAt=e.onstartAt;});
        this.addEventListener('dataavailable',event=>{e.bytes+=event.data.size;chunks.push(event.data);});
        this.addEventListener('stop',()=>{e.stoppedAt=now();});
      }
      start(...args){this.qaEntry.startCalledAt=now();const a=q.attempts.at(-1);if(a)a.startCalledAt=this.qaEntry.startCalledAt;super.start(...args);this.qaEntry.startReturnedAt=now();}
    };
    q.prepareFixture=async()=>{
      const c=q.fixtureContext=new NativeContext({sampleRate:48000});await c.resume();
      q.reference=await c.decodeAudioData(new Uint8Array(knownAudio).buffer);
      const destination=q.destination=c.createMediaStreamDestination();destination.channelCount=1;
      q.source=c.createBufferSource();q.source.buffer=q.reference;q.source.connect(destination);
      q.source.onended=()=>{q.attempts.at(-1).sourceEndedAt=now();};
      const silence=c.createBufferSource();silence.buffer=c.createBuffer(1,48000,48000);silence.loop=true;silence.connect(destination);silence.start();
    };
    q.describe=()=>({attempts:q.attempts,acquisitions:q.acquisitions.map(({stream,...a})=>({...a,tracks:stream?.getTracks().map(t=>t.readyState)})),contexts:q.contexts,records:q.records,tracks:q.streams.flatMap(s=>s.getTracks().map(t=>t.readyState)),exitAt:q.exitAt});
    q.comparePhrase=async()=>{
      const c=new NativeContext({sampleRate:48000}),blob=new Blob(q.chunks.at(-1),{type:q.records.at(-1).mimeType});
      const recording=await c.decodeAudioData(await blob.arrayBuffer()),reference=q.reference;
      // Compare the decoded waveform, not an assumed ASR answer. Downsample both
      // to 8 kHz and find the codec delay before checking beginning/middle/end.
      // Pad the capture tail with silence: a user can stop before the reference
      // file's trailing silence ends without losing any spoken sound.
      function down(b){const data=b.getChannelData(0),out=new Float32Array(Math.floor(b.duration*8000));for(let i=0;i<out.length;i++)out[i]=data[Math.min(data.length-1,Math.round(i*b.sampleRate/8000))];return out;}
      const actual=down(recording),expected=down(reference),n=expected.length;
      function corr(offset,start=0,end=n){let xy=0,xx=0,yy=0;for(let i=start;i<end;i++){const x=expected[i],y=actual[i+offset]||0;xy+=x*y;xx+=x*x;yy+=y*y;}return xy/Math.sqrt(xx*yy||1);}
      let offset=0,best=-1;for(let i=0;i<=Math.min(actual.length,1600);i++){const value=corr(i,0,Math.min(n,4000));if(value>best){best=value;offset=i;}}
      const segmentMatches=Array.from({length:3},(_,k)=>{let best=-1,bestOffset=offset;for(let i=Math.max(0,offset-80);i<=offset+80;i++){const value=corr(i,Math.floor(n*k/3),Math.floor(n*(k+1)/3));if(value>best){best=value;bestOffset=i;}}return {correlation:best,offsetSeconds:bestOffset/8000};});
      q.pcm={actual:Array.from(actual),expected:Array.from(expected)};
      const sum=new Float64Array(actual.length+1);for(let i=0;i<actual.length;i++)sum[i+1]=sum[i]+actual[i]**2;
      const envelope=[];for(let i=0;i<n;i+=80){let xx=0;for(let j=i;j<Math.min(n,i+80);j++)xx+=expected[j]**2;envelope.push(Math.sqrt(xx));}
      function envelopeCorr(shift,start=0,end=envelope.length){let x=0,y=0,xx=0,yy=0,xy=0;for(let i=start;i<end;i++){const a=envelope[i],b=Math.sqrt(sum[Math.min(actual.length,(i+1)*80+shift)]-sum[Math.min(actual.length,i*80+shift)]);x+=a;y+=b;xx+=a*a;yy+=b*b;xy+=a*b;}const count=end-start;return (xy-x*y/count)/Math.sqrt((xx-x*x/count)*(yy-y*y/count));}
      let envelopeOffset=0,envelopeMatch=-1;for(let i=0;i<=Math.min(actual.length,1600);i+=2){const value=envelopeCorr(i);if(value>envelopeMatch){envelopeMatch=value;envelopeOffset=i;}}
      const result={bytes:blob.size,recordedSeconds:recording.duration,referenceSeconds:reference.duration,offsetSeconds:offset/8000,wholeCorrelation:corr(offset),segments:Array.from({length:3},(_,k)=>corr(offset,Math.floor(n*k/3),Math.floor(n*(k+1)/3))),envelopeOffsetSeconds:envelopeOffset/8000,envelopeCorrelation:envelopeMatch,envelopeSegments:Array.from({length:3},(_,k)=>envelopeCorr(envelopeOffset,Math.floor(envelope.length*k/3),Math.floor(envelope.length*(k+1)/3))),segmentMatches};
      await c.close();await q.fixtureContext.close();return result;
    };
  },{origin,synthetic,gumDelay,holdResume,contextBlock,knownAudio,permission});
  page=await context.newPage();page.setDefaultTimeout(15000);page.on('pageerror',e=>report.errors.push(e.message));
  await page.goto(origin+'/xiaoya/');await page.locator('[data-action="next-event"]').waitFor();
  const metadata=await page.evaluate(()=>({version:document.querySelector('meta[name="xiaoya-version"]').content,build:document.querySelector('meta[name="xiaoya-build"]').content}));
  if(report.build)assert.equal(metadata.build,report.build,'Do not change builds during the latency run');else Object.assign(report,metadata);
  await page.locator('[data-action="next-event"]').click();await page.locator('[data-action="story-continue"]').waitFor({timeout:45000});
  if(synthetic)await page.evaluate(()=>qaLatency.prepareFixture());
  await page.locator('[data-action="story-continue"]').click();await page.locator('[data-action="record"]:enabled').waitFor();
}
async function ready(){await page.locator('[data-action="record"]').click();await page.locator('.recording-indicator').waitFor();return page.evaluate(()=>qaLatency.describe());}
function timing(d){const a=d.attempts.at(-1);return {clickToGumMs:a.gumCalledAt-a.clickAt,nativeGumMs:a.gumNativeResolvedAt-a.gumCalledAt,injectedGumMs:a.gumDeliveredAt-a.gumNativeResolvedAt,gumToStartMs:a.startCalledAt-a.gumDeliveredAt,startToOnstartMs:a.onstartAt-a.startCalledAt,onstartToUiMs:a.uiReadyAt-a.onstartAt,clickToUiMs:a.uiReadyAt-a.clickAt,clickToWaitingMs:a.waitingAt-a.clickAt};}
async function exit(){await page.locator('[data-action="home"]').click();await page.waitForFunction(()=>qaLatency.streams.every(s=>s.getTracks().every(t=>t.readyState==='ended')));assert.equal(await page.locator('.recording-indicator').count(),0);}
async function close(){await context.close();context=null;}
async function hidden(){await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});document.dispatchEvent(new Event('visibilitychange'));});}
function meterAfterReady(d){const a=d.attempts.at(-1),c=d.contexts.at(-1);assert(c&&c.constructCalledAt>=a.uiReadyAt,'Optional context construction starts after the UI ready mutation');assert(c.constructCalledAt>=a.readyFrameAt,'Ready UI gets a frame before optional context construction');return {constructAfterReadyMs:c.constructCalledAt-a.uiReadyAt,constructDurationMs:c.createdAt-c.constructCalledAt,frameAfterReadyMs:a.readyFrameAt-a.uiReadyAt};}
async function focusedMeterChecks(){
  await fixture({holdResume:true,contextBlock:650});assert.equal((await page.evaluate(()=>qaLatency.describe())).contexts.length,0);
  await ready();await page.waitForFunction(()=>!!qaLatency.contexts[0]?.nativeResumedAt);const cold=await page.evaluate(()=>qaLatency.describe());
  const coldMeter=meterAfterReady(cold);assert(coldMeter.constructDurationMs>=650);assert(!cold.contexts[0].resumedAt);assert(timing(cold).onstartToUiMs<100);await page.evaluate(()=>qaLatency.releaseMeter());
  pass('Cold native recording becomes ready before a deliberately slow optional context and pending resume',{timing:timing(cold),meter:coldMeter,diagnostic:cold});await exit();await close();
  await fixture({permission:'granted'});await page.waitForFunction(()=>{const a=qaLatency.acquisitions[0];return a?.gumDeliveredAt&&performance.now()-a.gumNativeResolvedAt>=1200;});
  const before=await page.evaluate(()=>qaLatency.describe());assert.equal(before.contexts.length,0);assert.equal(before.records.length,0);
  await ready();await page.waitForFunction(()=>!!qaLatency.contexts[0]?.createdAt);const warm=await page.evaluate(()=>qaLatency.describe());assert.equal(warm.acquisitions.length,1);assert.equal(warm.records[0].acquisitionId,0);
  pass('Ready prewarm is claimed without a new request and its meter follows the ready frame',{timing:timing(warm),dwellMs:warm.attempts[0].clickAt-warm.acquisitions[0].gumDeliveredAt,meter:meterAfterReady(warm),diagnostic:warm});await page.screenshot({path:path.join(out,'recording-ready.png'),fullPage:true});await exit();await close();
  await fixture({permission:'granted',gumDelay:1300,contextBlock:650});await page.waitForFunction(()=>!!qaLatency.acquisitions[0]?.gumNativeResolvedAt);await page.locator('[data-action="record"]').click();await page.locator('.mic-start-ring').waitFor();
  assert.equal(await page.locator('[data-action="record"]').getAttribute('aria-busy'),'true');assert.equal(await page.locator('.recording-indicator').count(),0);assert.equal((await page.evaluate(()=>qaLatency.describe())).contexts.length,0);await page.screenshot({path:path.join(out,'waiting-for-microphone.png'),fullPage:true});
  await page.locator('.recording-indicator').waitFor();await page.waitForFunction(()=>!!qaLatency.contexts[0]?.createdAt);const pending=await page.evaluate(()=>qaLatency.describe());assert.equal(pending.acquisitions.length,1);assert(pending.attempts[0].clickAt<pending.acquisitions[0].gumDeliveredAt);assert(timing(pending).clickToWaitingMs<100,'Waiting UI must not be blocked by the optional context');
  pass('Pending prewarm shows waiting immediately and only constructs its meter after recording is ready',{timing:timing(pending),meter:meterAfterReady(pending),diagnostic:pending});await exit();await close();
  await fixture({synthetic:true,permission:'granted',holdResume:true,contextBlock:650});await page.waitForFunction(()=>!!qaLatency.acquisitions[0]?.gumDeliveredAt);await ready();await page.waitForFunction(()=>!!qaLatency.attempts.at(-1).sourceEndedAt);await page.locator('[data-action="record"]').click();await page.waitForFunction(()=>!!qaLatency.records.at(-1).stoppedAt);
  const phrase=await page.evaluate(()=>qaLatency.comparePhrase());report.phrase=phrase;save();fs.writeFileSync(path.join(out,'synthetic-phrase-pcm.json'),JSON.stringify(await page.evaluate(()=>qaLatency.pcm)));
  assert(phrase.wholeCorrelation>.80);assert(phrase.segments.every(x=>x>.70),'The beginning, middle and final speech must survive the slow meter constructor');assert(phrase.envelopeCorrelation>.95);
  const recorded=await page.evaluate(()=>qaLatency.describe());assert(!recorded.contexts[0].resumedAt);assert(recorded.tracks.every(s=>s==='ended'));
  pass('Entire phrase beginning 25ms after ready survives slow meter construction and an unresolved resume',{timing:timing(recorded),phrase,meter:meterAfterReady(recorded),diagnostic:recorded});await close();
}
function validateIsolation(){assert(!report.requests.some(r=>/\/speech\/whisper-|\.onnx|\.wasm/.test(r.url)),'No ASR resources are requested');assert(report.requests.every(r=>r.method==='GET'&&new URL(r.url).origin===origin),'No upload or external request');assert.deepEqual(report.errors,[]);}
(async()=>{
  browser=await chromium.launch({channel:'msedge',headless:true,args:['--no-proxy-server','--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream','--autoplay-policy=no-user-gesture-required']});
  if(meterFocus){await focusedMeterChecks();validateIsolation();return;}
  if(!process.env.TEST_PHRASE_ONLY){
  await fixture();
  if(final){const before=await page.evaluate(()=>qaLatency.describe());assert.equal(before.acquisitions.length,0,'A prompt permission must never cause a prewarm request');assert.equal(before.records.length,0);pass('First-time microphone permission is not requested until explicit record click',before);}
  for(let i=0;i<3;i++){
    const d=await ready();const t=timing(d);assert(t.onstartToUiMs>=0&&t.onstartToUiMs<100,'The ready cue follows native recording readiness promptly');
    pass(i?'Native fake-device repeated recording '+i:'Native fake-device first recording',{timing:t,diagnostic:d});
    await page.locator('[data-action="sample"]').click();await page.waitForFunction(()=>qaLatency.streams.every(s=>s.getTracks().every(t=>t.readyState==='ended')));
  }
  await exit();await context.close();context=null;
  await fixture({gumDelay:900});const delayed=await ready();assert(timing(delayed).injectedGumMs>=850);pass('Controlled getUserMedia delay is attributable to stream acquisition',{timing:timing(delayed),diagnostic:delayed});await exit();await context.close();context=null;
  await fixture({holdResume:true});await ready();await page.waitForFunction(()=>!!qaLatency.contexts.at(-1)?.resumeCalledAt);const independent=await page.evaluate(()=>qaLatency.describe()),c=independent.contexts.at(-1);assert(!c.resumedAt,'Native recording must become ready while the optional meter resume Promise is still pending');await page.evaluate(()=>qaLatency.releaseMeter());pass('Pending optional AudioContext resume does not gate native recording',{timing:timing(independent),diagnostic:independent});await exit();await context.close();context=null;
  }
  if(final){
    await fixture({permission:'granted'});
    for(let i=0;i<3;i++){
      // A disclosed 1.2 s dwell after device acquisition models listening before
      // tapping. It is outside the click latency measurement, not a ready mock.
      await page.waitForFunction(()=>{const a=qaLatency.acquisitions.at(-1);return a?.gumDeliveredAt&&a.stream.getTracks().some(t=>t.readyState==='live')&&performance.now()-a.gumNativeResolvedAt>=1200;});
      const before=await page.evaluate(()=>qaLatency.describe());assert.equal(before.records.length,i,'Prewarming must not create an additional recorder');assert(!before.records.at(-1)||before.records.at(-1).stoppedAt);
      const d=await ready();assert.equal(d.acquisitions.length,before.acquisitions.length,'Ready stream must be claimed without a second getUserMedia');assert.equal(d.records.at(-1).acquisitionId,before.acquisitions.at(-1).id);assert(timing(d).onstartToUiMs>=0&&timing(d).onstartToUiMs<100);
      pass('Granted ready-stream claim '+(i+1),{timing:timing(d),dwellMs:d.attempts.at(-1).clickAt-d.attempts.at(-1).gumDeliveredAt,diagnostic:d});
      if(i<2){await page.locator('[data-action="sample"]').click();await page.waitForFunction(count=>qaLatency.acquisitions.length>count,before.acquisitions.length);}else await exit();
    }
    await close();
    await fixture({permission:'granted',gumDelay:1300});await page.waitForFunction(()=>!!qaLatency.acquisitions[0]?.gumNativeResolvedAt);await page.locator('[data-action="record"]').click();await page.locator('.mic-start-ring').waitFor();
    assert.equal(await page.locator('[data-action="record"]').getAttribute('aria-busy'),'true');assert.equal(await page.locator('.recording-indicator').count(),0);assert.equal(await page.locator('.tap-cue').isVisible(),false);await page.screenshot({path:path.join(out,'waiting-for-microphone.png'),fullPage:true});
    await page.locator('.recording-indicator').waitFor();const pending=await page.evaluate(()=>qaLatency.describe());assert.equal(pending.acquisitions.length,1);assert.equal(pending.records[0].acquisitionId,0);assert(pending.attempts[0].clickAt<pending.acquisitions[0].gumDeliveredAt);pass('Pending prewarm is claimed once and shows a waiting ring until native start',{timing:timing(pending),diagnostic:pending});await exit();await close();
  }
  await fixture({synthetic:true,permission:final?'granted':'prompt'});if(final)await page.waitForFunction(()=>!!qaLatency.acquisitions[0]?.gumDeliveredAt);const complete=await ready();await page.screenshot({path:path.join(out,'recording-ready.png'),fullPage:true});await page.waitForFunction(()=>!!qaLatency.attempts.at(-1).sourceEndedAt);await page.locator('[data-action="record"]').click();await page.waitForFunction(()=>!!qaLatency.records.at(-1).stoppedAt);
  const phrase=await page.evaluate(()=>qaLatency.comparePhrase());report.phrase=phrase;save();fs.writeFileSync(path.join(out,'synthetic-phrase-pcm.json'),JSON.stringify(await page.evaluate(()=>qaLatency.pcm)));console.log('Phrase diagnostic '+JSON.stringify(phrase));assert(phrase.wholeCorrelation>.80,'Complete known phrase waveform must survive capture');assert(phrase.segments.every(x=>x>.70),'Beginning, middle and final speech segments must all survive capture');assert(phrase.envelopeCorrelation>.95,'Whole speech energy pattern must survive capture');
  const captured=await page.evaluate(()=>qaLatency.describe());assert(captured.tracks.every(s=>s==='ended'));pass('Phrase spoken immediately after the UI ready cue is captured completely',{timing:timing(complete),phrase,diagnostic:captured});await page.screenshot({path:path.join(out,'complete-capture.png'),fullPage:true});await context.close();context=null;
  await fixture({gumDelay:1200});await page.locator('[data-action="record"]').click();await page.waitForFunction(()=>!!qaLatency.acquisitions[0]?.gumCalledAt);await page.locator('[data-action="home"]').click();await page.waitForFunction(()=>!!qaLatency.acquisitions[0]?.gumDeliveredAt&&qaLatency.streams.every(s=>s.getTracks().every(t=>t.readyState==='ended')));
  const canceled=await page.evaluate(()=>qaLatency.describe());assert.equal(canceled.records.length,0);assert(!canceled.attempts[0].uiReadyAt);assert.equal(await page.locator('.recording-indicator').count(),0);pass('Leaving during pending microphone acquisition releases the late stream without showing ready',canceled);
  await close();
  if(final)for(const delay of [0,1500]){
    await fixture({permission:'granted',gumDelay:delay});await page.waitForFunction(delay=>delay?!!qaLatency.acquisitions[0]?.gumNativeResolvedAt:!!qaLatency.acquisitions[0]?.gumDeliveredAt,delay);await hidden();await page.waitForFunction(()=>!!qaLatency.acquisitions[0]?.gumDeliveredAt&&qaLatency.streams.every(s=>s.getTracks().every(t=>t.readyState==='ended')));
    const background=await page.evaluate(()=>qaLatency.describe());assert.equal(background.records.length,0);assert.equal(background.attempts.length,0);assert.equal(await page.locator('.recording-indicator').count(),0);pass(delay?'Background visibility event releases the late pending prewarm stream':'Background visibility event releases an unused ready prewarm stream',background);await close();
  }
  validateIsolation();
})().catch(async error=>{report.checks.push({name:'Recording latency run',status:'FAIL',error:error.stack,diagnostic:await page?.evaluate(()=>qaLatency.describe()).catch(()=>null)});console.error(error);process.exitCode=1;}).finally(async()=>{await context?.close();await browser?.close();save();console.log(`${report.checks.filter(x=>x.status==='PASS').length}/${report.checks.length} passed; ${report.build}; synthetic input, no ASR or real-device claim`);});
