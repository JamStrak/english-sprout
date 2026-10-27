// Isolated touch regression: real Chromium/MediaRecorder with a synthetic device.
// No user profile, speech model, live microphone, upload or stored child progress.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'C:/Users/Jam/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const origin=new URL(process.env.TEST_URL||'http://127.0.0.1:24756').origin;
if(!['127.0.0.1','localhost','[::1]'].includes(new URL(origin).hostname))throw Error('Use a loopback test server.');
const label=process.env.TEST_LABEL||'final';
if(!/^[a-z0-9-]+$/i.test(label))throw Error('TEST_LABEL must be a plain label.');
const baseline=process.env.TEST_BASELINE==='1';
const out=path.resolve(__dirname,'../test-results/xiaoya-single-tap',label);
fs.mkdirSync(out,{recursive:true});
const report={origin,label,baseline,actualTouch:true,actualMediaRecorder:true,syntheticMicrophone:true,asrIsolated:true,realDeviceValidated:false,checks:[]};
let browser;
function save(){fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(report,null,2));}
async function fixture({mic=true,gumDelay=0}={}){
  const c=await browser.newContext({permissions:['microphone'],viewport:{width:390,height:844},isMobile:true,hasTouch:true,serviceWorkers:'block'});
  const errors=[],requests=[];
  c.on('request',r=>requests.push({url:r.url(),method:r.method()}));
  await c.route('**/*',r=>new URL(r.request().url()).origin===origin?r.continue():r.abort('blockedbyclient'));
  await c.route(/\/releases\/[^/]+\/speech-local\.js$/,r=>r.fulfill({contentType:'text/javascript',body:'export async function prepareSpeech(){throw Error("Input-only QA: no ASR");} export async function assessRecording(){throw Error("Input-only QA: no ASR");} export function disposeSpeechAssessment(){}'}));
  await c.addInitScript(({origin,mic,gumDelay})=>{
    if(location.origin!==origin)return;
    localStorage.setItem('xiaoya-english:preferences:v1',JSON.stringify({mic}));
    const now=()=>performance.now(),q=window.qaTap={events:[],attempts:[],acquisitions:[],records:[],streams:[],recordStreams:[],plays:[],ui:[]};
    const NativeAudio=window.Audio,NativeRecorder=window.MediaRecorder;
    window.Audio=function(...args){const a=new NativeAudio(...args);a.playbackRate=4;a.addEventListener('playing',()=>q.plays.push({at:now(),url:String(args[0]),recording:!!document.querySelector('.recording-indicator')}));return a;};window.Audio.prototype=NativeAudio.prototype;
    const gum=navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getUserMedia=async(...args)=>{
      const entry={calledAt:now(),constraints:args[0]};q.acquisitions.push(entry);
      const stream=await gum(...args);q.streams.push(stream);entry.nativeAt=now();
      if(gumDelay)await new Promise(r=>setTimeout(r,gumDelay));entry.deliveredAt=now();return stream;
    };
    window.MediaRecorder=class extends NativeRecorder{
      constructor(...args){super(...args);const e=this.qaEntry={constructedAt:now(),bytes:0};q.records.push(e);q.recordStreams.push(args[0]);this.addEventListener('start',()=>e.startedAt=now());this.addEventListener('stop',()=>e.stoppedAt=now());this.addEventListener('dataavailable',d=>e.bytes+=d.data.size);}
      start(...args){this.qaEntry.startCalledAt=now();return super.start(...args);}
    };
    for(const type of ['pointerdown','pointerup','click'])document.addEventListener(type,e=>{
      const action=e.target.closest('[data-action]')?.dataset.action;
      q.events.push({type,action:action||null,at:now(),trusted:e.isTrusted});
      if(type==='click'&&(action==='story-continue'||action==='record'&&!document.querySelector('.recording-indicator')))q.attempts.push({action,at:now()});
    },true);
    new MutationObserver(()=>{
      const phase=document.querySelector('main')?.dataset.phase||null,waiting=!!document.querySelector('.is-mic-starting'),recording=!!document.querySelector('.recording-indicator');
      const last=q.ui[q.ui.length-1];if(!last||phase!==last.phase||waiting!==last.waiting||recording!==last.recording)q.ui.push({at:now(),phase,waiting,recording});
    }).observe(document,{subtree:true,childList:true,attributes:true,attributeFilter:['class','aria-busy']});
    q.describe=()=>({events:q.events,attempts:q.attempts,acquisitions:q.acquisitions,records:q.records,plays:q.plays,ui:q.ui,tracks:q.streams.flatMap(s=>s.getTracks().map(t=>t.readyState)),recordTracks:q.recordStreams.flatMap(s=>s.getTracks().map(t=>t.readyState)),phase:document.querySelector('main')?.dataset.phase,guided:Array.from(document.querySelectorAll('.is-guided')).map(e=>e.dataset.action),button:document.querySelector('[data-action="record"]')?.outerHTML});
  },{origin,mic,gumDelay});
  const p=await c.newPage();p.setDefaultTimeout(12000);p.on('pageerror',e=>errors.push(e.message));
  await p.goto(origin+'/xiaoya/?story=food-water');await p.locator('[data-action="next-event"]').waitFor();
  const build=await p.locator('meta[name="xiaoya-build"]').getAttribute('content');
  if(report.build)assert.equal(build,report.build,'Build must not change during this test run');else report.build=build;
  return{c,p,errors,requests};
}
async function story(p){await p.locator('[data-action="next-event"]').tap();await p.locator('[data-action="story-continue"]:enabled').waitFor({timeout:35000});}
async function diagnostic(p){return p.evaluate(()=>qaTap.describe());}
async function ready(p){await p.locator('.recording-indicator').waitFor();await p.waitForFunction(()=>qaTap.records[qaTap.records.length-1]?.startedAt);return diagnostic(p);}
async function tapStart(p){await p.locator('[data-action="story-continue"]').tap();return ready(p);}
function immediate(d){const a=d.attempts[d.attempts.length-1],ui=d.ui.find(u=>u.at>=a.at&&(u.waiting||u.recording));assert(ui,'A tap must cause visible microphone response');assert(ui.at-a.at<250,`Immediate response took ${ui.at-a.at}ms`);assert(d.events.some(e=>e.action===a.action&&e.type==='click'&&e.trusted));return{responseMs:ui.at-a.at,readyMs:d.records[d.records.length-1].startedAt-a.at};}
async function stop(p){await p.locator('[data-action="record"]').tap();await p.waitForFunction(()=>!!qaTap.records[qaTap.records.length-1]?.stoppedAt);await p.waitForFunction(()=>!document.querySelector('.recording-indicator'));}
async function gate(p){const digits=(await p.locator('label[for="parent-answer"]').textContent()).match(/\d+/g).map(Number);await p.locator('#parent-answer').fill(String(digits[0]+digits[1]));await p.locator('[data-action="gate-submit"]').tap();}
async function test(name,fn,options){
  let f;try{f=await fixture(options);const evidence=await fn(f);assert.deepEqual(f.errors,[]);assert(f.requests.every(r=>r.method==='GET'&&new URL(r.url).origin===origin),'Only local GET requests');report.checks.push({name,status:'PASS',evidence,diagnostic:await diagnostic(f.p)});console.log('PASS '+name);}
  catch(error){report.checks.push({name,status:'FAIL',error:error.stack,diagnostic:f?await diagnostic(f.p).catch(()=>null):null});console.error('FAIL '+name+' '+error.message);process.exitCode=1;if(f)await f.p.screenshot({path:path.join(out,`failure-${report.checks.length}.png`),fullPage:true}).catch(()=>{});}
  finally{await f?.c.close();save();}
}
(async()=>{
 browser=await chromium.launch({channel:'msedge',headless:true,args:['--no-proxy-server','--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream','--autoplay-policy=no-user-gesture-required']});
 if(baseline){
   await test('Reproduce two separate microphone taps with permission already granted',async({p})=>{
     await story(p);assert.equal((await diagnostic(p)).records.length,0);await p.screenshot({path:path.join(out,'before-first-tap.png')});
     await p.locator('[data-action="story-continue"]').tap();await p.waitForTimeout(180);
     const first=await diagnostic(p);assert.equal(first.phase,'request');assert.equal(first.records.length,0,'First mic tap is navigation only');assert(first.guided.includes('record'));
     await p.screenshot({path:path.join(out,'first-tap-guided-not-recording.png')});
     await p.locator('[data-action="record"]').tap();const second=await ready(p);assert.equal(second.records.length,1);await p.screenshot({path:path.join(out,'second-tap-recording.png')});await stop(p);
     return{first,secondTiming:immediate(second),actualClicks:first.events.filter(e=>e.type==='click')};
   });return;
 }
 await test('One story microphone tap starts native recording, one stop tap stops it, repeated tap starts again',async({p})=>{
   await story(p);assert.equal((await diagnostic(p)).records.length,0,'Story completion must not record automatically');
   const first=await tapStart(p);assert.equal(first.records.length,1);const firstTiming=immediate(first);assert(!first.plays.some(e=>e.at>=first.attempts[0].at&&e.url.includes('garden-speak')),'The start tap does not speak the recording instructions over the child');await p.screenshot({path:path.join(out,'one-tap-recording.png')});
   await p.waitForTimeout(250);await stop(p);let d=await diagnostic(p);assert.equal(d.records.length,1);assert(d.records[0].bytes>0);assert(d.recordTracks.every(x=>x==='ended'));
   await p.locator('[data-action="record"]:enabled').waitFor();await p.locator('[data-action="record"]').tap();const repeated=await ready(p);assert.equal(repeated.records.length,2);const repeatedTiming=immediate(repeated);await stop(p);
   return{firstTiming,repeatedTiming};
 });
 await test('Slow microphone opens waiting state on first touch and ignores extra touch during startup',async({p})=>{
   await story(p);await p.locator('[data-action="story-continue"]').tap();await p.locator('.mic-start-ring').waitFor();
   assert.equal(await p.locator('[data-action="record"]').getAttribute('aria-busy'),'true');assert.equal(await p.locator('.recording-indicator').count(),0);assert.equal((await diagnostic(p)).records.length,0);
   await p.screenshot({path:path.join(out,'first-tap-waiting.png')});const b=await p.locator('[data-action="record"]').boundingBox();await p.touchscreen.tap(b.x+b.width/2,b.y+b.height/2);
   const d=await ready(p);assert.equal(d.records.length,1);assert.equal(d.acquisitions.length,1);const timing=immediate(d);await stop(p);return timing;
 },{gumDelay:1200});
 await test('Leaving while the one-tap microphone request is pending never starts a late recording',async({p})=>{
   await story(p);await p.locator('[data-action="story-continue"]').tap();await p.locator('.mic-start-ring').waitFor();await p.locator('[data-action="home"]').tap();
   await p.waitForFunction(()=>qaTap.acquisitions[0]?.deliveredAt&&qaTap.streams.every(s=>s.getTracks().every(t=>t.readyState==='ended')));
   const d=await diagnostic(p);assert.equal(d.records.length,0);assert.equal(await p.locator('.recording-indicator').count(),0);return{tracks:d.tracks};
 },{gumDelay:1200});
 await test('First microphone use still requires parent consent and cancellation never records',async({p})=>{
   await story(p);await p.locator('[data-action="story-continue"]').tap();await p.locator('#parent-answer').waitFor();assert.equal((await diagnostic(p)).acquisitions.length,0);
   await gate(p);await p.locator('[data-action="allow-mic"]').waitFor();let d=await diagnostic(p);assert.equal(d.acquisitions.length,0);assert.equal(d.records.length,0);
   await p.locator('[data-action="disable-mic"]').tap();d=await diagnostic(p);assert.equal(d.records.length,0);assert.equal(d.acquisitions.length,0);return{permissionGateProtected:true};
 },{mic:false});
 await test('Parent consent resumes only the microphone tap that requested it',async({p})=>{
   await story(p);await p.locator('[data-action="story-continue"]').tap();await p.locator('#parent-answer').waitFor();await gate(p);await p.locator('[data-action="allow-mic"]').waitFor();
   assert.equal((await diagnostic(p)).records.length,0);await p.locator('[data-action="allow-mic"]').tap();const d=await ready(p);assert.equal(d.records.length,1);
   const click=d.events.findLast(e=>e.type==='click'&&e.action==='allow-mic'),ui=d.ui.find(e=>e.at>=click.at&&(e.waiting||e.recording));assert(ui&&ui.at-click.at<250,'Consent resumes the requested recording immediately');assert(!d.plays.some(e=>e.at>=click.at&&e.url.includes('garden-speak')));await stop(p);return{responseAfterConsentMs:ui.at-click.at};
 },{mic:false});
 await test('Enabling microphone from parent settings alone never starts recording',async({p})=>{
   await p.locator('[data-action="parent"]').tap();await gate(p);await p.locator('[data-action="mic-settings"]').tap();await p.locator('[data-action="allow-mic"]').tap();await p.locator('.parent-view').waitFor();
   const d=await diagnostic(p);assert.equal(d.records.length,0);assert.equal(d.acquisitions.length,0);return{settingsDoNotRecord:true};
 },{mic:false});
 await test('Direct assessment microphone is also one touch; sample and help never start recording',async({p})=>{
   await p.locator('[data-action="parent"]').tap();await gate(p);await p.locator('.story-library>details>summary').tap();await p.locator('[data-checkup="hello-everyone"]').tap();await p.locator('[data-action="record"]:enabled').waitFor();
   assert.equal((await diagnostic(p)).records.length,0);await p.locator('[data-action="sample"]').tap();await p.locator('[data-action="record"]:enabled').waitFor();assert.equal((await diagnostic(p)).records.length,0);
   await p.locator('[data-action="context-help"]').tap();await p.locator('[data-action="record"]:enabled').waitFor();assert.equal((await diagnostic(p)).records.length,0);
   await p.locator('[data-action="record"]').tap();const d=await ready(p);assert.equal(d.records.length,1);const timing=immediate(d);await stop(p);return timing;
 });
})().catch(error=>{report.error=error.stack;console.error(error);process.exitCode=1;}).finally(async()=>{await browser?.close();save();console.log(`${report.checks.filter(c=>c.status==='PASS').length}/${report.checks.length} passed; ${report.build}; real touch and recorder, synthetic device`);});
