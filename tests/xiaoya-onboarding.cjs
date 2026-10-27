// Guided entry regression: real HTML audio and MediaRecorder; no recognition or
// learning-result stub. Model asset requests are unavailable in this suite so
// model loading cannot monopolize CPU across guide fixtures. Actual recognition
// is covered separately. Browser fake microphone verifies mechanics, not speech.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'C:/Users/Jam/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const origin=process.env.TEST_URL||'http://127.0.0.1:24756';
const out=path.resolve(__dirname,'../test-results/xiaoya-onboarding');
const STATE='xiaoya-english:state:v1',PREFS='xiaoya-english:preferences:v1';
const checks=[];let browser;
const filter=process.env.XIAOYA_TEST_FILTER?new RegExp(process.env.XIAOYA_TEST_FILTER):null;

async function fixture(options={}){
  const c=await browser.newContext({viewport:{width:390,height:844},permissions:['microphone'],timezoneId:'Asia/Shanghai',serviceWorkers:'block',...options});
  await c.route(/\/speech\/(?:vosk-.*\.js|model-.*\.tar\.gz)(?:\?.*)?$/,route=>route.abort('failed'));
  await c.addInitScript(()=>{
    window.qa={errors:[],audios:[],streams:[],requests:[],hold:null,held:-1,voiced:0,stops:0,deny:false,failKey:null};
    window.addEventListener('error',e=>qa.errors.push(e.message));
    window.addEventListener('unhandledrejection',e=>qa.errors.push(String(e.reason)));
    const set=Storage.prototype.setItem;
    Storage.prototype.setItem=function(key,value){if(qa.failKey===key)throw new DOMException('Test storage full','QuotaExceededError');return set.call(this,key,value);};
    const NativeAudio=window.Audio;
    window.Audio=function(...args){
      const a=new NativeAudio(...args),entry={audio:a,url:args[0]||'',ended:false,plays:0};qa.audios.push(entry);
      // Decode/play the real assets faster so repeated narration does not make
      // this integration suite unnecessarily slow. A held sound cannot end.
      a.playbackRate=3;
      a.addEventListener('playing',()=>{entry.plays++;if(qa.hold&&entry.url.includes(qa.hold)){a.pause();qa.held=qa.audios.indexOf(entry);}});
      a.addEventListener('ended',()=>{entry.ended=true;});return a;
    };window.Audio.prototype=NativeAudio.prototype;
    if(navigator.mediaDevices){const get=navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);navigator.mediaDevices.getUserMedia=async(...args)=>{if(qa.deny)throw new DOMException('Denied','NotAllowedError');const stream=await get(...args);qa.streams.push(stream);return stream;};}
    if(window.AnalyserNode){const sample=AnalyserNode.prototype.getByteTimeDomainData;AnalyserNode.prototype.getByteTimeDomainData=function(values){const result=sample.call(this,values);const rms=Math.sqrt(values.reduce((n,x)=>n+((x-128)/128)**2,0)/values.length);if(rms>.022)qa.voiced++;return result;};}
    if(window.MediaRecorder){const start=MediaRecorder.prototype.start;MediaRecorder.prototype.start=function(...args){this.addEventListener('stop',()=>qa.stops++,{once:true});return start.apply(this,args);};}
  });
  const p=await c.newPage();p.setDefaultTimeout(15000);const requests=[];
  p.on('request',r=>requests.push({url:r.url(),method:r.method()}));
  await p.goto(origin+'/xiaoya/');await p.locator('[data-action="start-guide"]').waitFor();
  return{c,p,requests};
}
async function state(p){return p.evaluate(key=>JSON.parse(localStorage.getItem(key)||'null'),STATE);}
async function prefs(p){return p.evaluate(key=>JSON.parse(localStorage.getItem(key)||'null'),PREFS);}
async function stage(p,name){await p.locator(`main.guide-view[data-step="${name}"]`).waitFor();assert.equal(await p.locator('main [data-primary]').count(),1);assert.equal(await p.locator('[data-choice],[data-theme],[data-letter]').count(),0);}
async function click(p,action){await p.locator(`[data-action="${action}"]`).click();}
async function start(p){await click(p,'start-guide');await stage(p,'listen');}
async function toSpeak(p){await start(p);await click(p,'sample');await stage(p,'wave');await click(p,'guide-wave');await stage(p,'speak');}
async function authorize(p){await click(p,'record');if(await p.locator('#parent-answer').count()){const numbers=(await p.locator('label[for="parent-answer"]').textContent()).match(/\d+/g).map(Number);await p.locator('#parent-answer').fill(String(numbers[0]+numbers[1]));await click(p,'gate-submit');}await p.locator('[data-action="allow-mic"]').waitFor();assert.equal(await p.evaluate(()=>qa.streams.length),0);await click(p,'allow-mic');assert.equal(await p.evaluate(()=>qa.streams.length),0,'Permission choice is not permission to begin recording immediately');}
async function capture(p){const before=await p.evaluate(()=>({voiced:qa.voiced,stops:qa.stops}));await click(p,'record');await p.locator('.mic-button.recording').waitFor();await p.waitForFunction(before=>qa.voiced>=before.voiced+3||qa.stops>before.stops,before);assert(await p.evaluate(before=>qa.voiced>=before.voiced+3,before),'Real captured samples must satisfy the voice-presence precondition');if(await p.locator('.mic-button.recording').count())await click(p,'record');await stage(p,'replay');assert(await p.evaluate(()=>qa.streams.every(s=>s.getTracks().every(t=>t.readyState==='ended'))));}
async function releaseHeld(p){await p.evaluate(async()=>{const a=qa.audios[qa.held].audio;qa.hold=null;qa.held=-1;await a.play();});}
async function seedStage(p,step,mic=true){await p.evaluate(({key,step,mic})=>localStorage.setItem(key,JSON.stringify({welcome:true,mic,guideStep:step})),{key:PREFS,step,mic});await p.reload();await click(p,'start-guide');await stage(p,step==='replay'?'speak':step);}
async function noEvidence(p){assert.equal((await state(p))?.evidence.length||0,0);}
async function diagnostic(p){return p.evaluate(()=>({step:document.querySelector('.guide-view')?.dataset.step,prefs:localStorage.getItem('xiaoya-english:preferences:v1'),state:localStorage.getItem('xiaoya-english:state:v1'),message:document.querySelector('.guide-message')?.textContent,toast:document.querySelector('.toast')?.textContent,errors:qa.errors,voiceSamples:qa.voiced,stops:qa.stops,audios:qa.audios.map(x=>({url:x.url,ended:x.ended,plays:x.plays,paused:x.audio.paused})),tracks:qa.streams.flatMap(s=>s.getTracks().map(t=>t.readyState))})).catch(e=>({error:e.message}));}
async function test(name,fn,options){if(filter&&!filter.test(name))return;let f,build;try{f=await fixture(options);build=await f.p.locator('meta[name="xiaoya-build"]').getAttribute('content');await fn(f);assert.deepEqual(await f.p.evaluate(()=>qa.errors),[]);checks.push({name,status:'PASS',build,diagnostic:await diagnostic(f.p)});console.log('PASS',name);}catch(error){checks.push({name,status:'FAIL',build,error:error.stack,diagnostic:f?await diagnostic(f.p):null});console.error('FAIL',name,error.message);if(f)await f.p.screenshot({path:path.join(out,`failed-${checks.length}.png`),fullPage:true}).catch(()=>{});}finally{await f?.c.close();}}

(async()=>{
  fs.mkdirSync(out,{recursive:true});
  browser=await chromium.launch({channel:'msedge',headless:true,args:['--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream','--autoplay-policy=no-user-gesture-required']});
  await test('Fresh entry has one child action and no unsolicited microphone, model, modal or theme grid',async({p,requests})=>{
    assert.equal(await p.locator('main [data-primary]').count(),1);assert.equal(await p.locator('[data-theme],[data-action="world"],[data-action="house"],[data-action="letters"],.modal-card').count(),0);
    assert.equal(await p.evaluate(()=>qa.streams.length),0);assert.equal(await p.evaluate(()=>qa.audios.length),0);assert.equal(await state(p),null);
    assert(!requests.some(r=>/model-en-us|vosk-0/.test(r.url)));assert(!/[a-zA-Z]/.test(await p.locator('.app-shell').innerText()));
    await p.screenshot({path:path.join(out,'first-entry.png'),fullPage:true});
  });
  await test('Real narration and English sample must end before the next child action becomes available',async({p})=>{
    await p.evaluate(()=>qa.hold='guide-hello.mp3');await start(p);await p.waitForFunction(()=>qa.held>=0);
    assert(await p.locator('[data-action="sample"]').isDisabled());assert.equal(await p.locator('[data-action="guide-wave"]').count(),0);
    await releaseHeld(p);await p.locator('[data-action="sample"]:not([disabled])').waitFor();
    await p.evaluate(()=>qa.hold='hello-02.mp3');await click(p,'sample');await p.waitForFunction(()=>qa.held>=0);
    await stage(p,'listen');assert.equal(await p.locator('[data-action="guide-wave"]').count(),0);await noEvidence(p);
    await releaseHeld(p);await stage(p,'wave');assert(await p.evaluate(()=>qa.audios.some(x=>x.url.includes('hello-02.mp3')&&x.ended)));
    await click(p,'guide-wave');await stage(p,'speak');await noEvidence(p);assert.equal(await p.evaluate(()=>qa.streams.length),0);
  });
  await test('Guided capture, replay, reload recovery and placing one gift create participation only',async({p,requests})=>{
    await toSpeak(p);assert(!requests.some(r=>/model-en-us|vosk-0/.test(r.url)),'Listening and waving alone do not prepare recognition');await authorize(p);await capture(p);await noEvidence(p);
    await p.reload();await click(p,'start-guide');await stage(p,'speak');assert.equal((await prefs(p)).guideStep,'speak','A lost in-memory clip must lead to a fresh recording');
    await capture(p);await p.evaluate(()=>qa.hold='blob:');await click(p,'guide-replay');await p.waitForFunction(()=>qa.held>=0);
    await stage(p,'replay');assert.equal(await p.locator('[data-action="guide-gift"]').count(),0);await releaseHeld(p);await stage(p,'gift');
    assert.equal(await state(p),null);await click(p,'guide-gift');await stage(p,'place');const awarded=await state(p);
    assert.equal(Object.keys(awarded.items).length,1);assert.equal(awarded.completions['hello-morning'].count,1);await noEvidence(p);
    await p.reload();await click(p,'start-guide');await stage(p,'place');assert.deepEqual(await state(p),awarded);
    await click(p,'guide-place');await p.locator('[data-action="next-event"]').waitFor();const done=await state(p);
    assert.equal(done.items['sun-lamp'].x,.5);assert.equal(done.items['sun-lamp'].y,.4);assert.equal(done.completions['hello-morning'].count,1);assert.equal((await prefs(p)).guideStep,'done');
    await p.reload();await p.locator('[data-action="next-event"]').waitFor();assert.deepEqual(await state(p),done);assert.equal(await p.locator('[data-action="world"]').count(),0);
    const saved=await p.evaluate(()=>JSON.stringify(Object.fromEntries(Object.entries(localStorage))));assert.doesNotMatch(saved,/blob:|base64|audio\/webm/);assert(!requests.some(r=>!['GET','HEAD'].includes(r.method)));
    await p.screenshot({path:path.join(out,'guide-complete.png'),fullPage:true});
  });
  await test('Denied microphone offers a silent completion route without inventing speech evidence',async({p})=>{
    await toSpeak(p);await authorize(p);await p.evaluate(()=>qa.deny=true);await click(p,'record');await p.locator('[data-action="guide-skip"]').waitFor();
    assert.equal(await p.locator('.mic-button.recording').count(),0);await noEvidence(p);await click(p,'guide-skip');await stage(p,'gift');await click(p,'guide-gift');await stage(p,'place');await click(p,'guide-place');await p.locator('[data-action="next-event"]').waitFor();
    await noEvidence(p);assert.equal(Object.keys((await state(p)).items).length,1);assert.equal(await p.evaluate(()=>qa.streams.length),0);
  },{permissions:[]});
  await test('A browser without MediaRecorder can complete the guide through listening',async({p})=>{
    await seedStage(p,'speak');await p.evaluate(()=>window.MediaRecorder=undefined);await click(p,'record');await p.locator('[data-action="guide-skip"]').waitFor();await click(p,'guide-skip');await stage(p,'gift');await click(p,'guide-gift');await stage(p,'place');await click(p,'guide-place');await p.locator('[data-action="next-event"]').waitFor();await noEvidence(p);
  });
  await test('Failed English sound stays on listening and can be retried without a false advance',async({c,p})=>{
    await start(p);const pattern=/\/audio\/characters\/pip\/hello-02\.mp3(?:\?.*)?$/;
    await c.route(pattern,route=>route.abort('failed'));await click(p,'sample');await p.getByText('声音没响起来，再点一次试试',{exact:true}).waitFor();await stage(p,'listen');assert.equal(await p.locator('[data-action="guide-wave"]').count(),0);await noEvidence(p);
    await c.unroute(pattern);await click(p,'sample');await stage(p,'wave');await noEvidence(p);
  });
  await test('Leaving during a held sound cancels it; reopening resumes the unfinished step',async({p})=>{
    await start(p);await p.locator('[data-action="sample"]:not([disabled])').waitFor();await p.evaluate(()=>qa.hold='hello-02.mp3');await click(p,'sample');await p.waitForFunction(()=>qa.held>=0);const oldCount=await p.evaluate(()=>qa.audios.length);await click(p,'home');await p.locator('[data-action="start-guide"]').waitFor();
    // Returning home now speaks the next-action cue; only the abandoned guide
    // audio must be stopped and released, not that new navigation narration.
    assert(await p.evaluate(n=>qa.audios.slice(0,n).every(x=>x.audio.paused),oldCount));assert.equal(await p.evaluate(()=>qa.audios[qa.held].audio.getAttribute('src')),null);assert.equal((await prefs(p)).guideStep,'listen');await noEvidence(p);
    await p.reload();await start(p);await click(p,'sample');await stage(p,'wave');await noEvidence(p);
  });
  await test('Existing learning, fixed furniture and old-product storage survive the first new guide',async({p})=>{
    await p.evaluate(async()=>{const m=await import(new URL('learning.js',document.querySelector('script[type="module"][src]').src));let s=m.createState();s=m.recordEvidence(s,{attemptId:'prior-parent-observation',eventId:'food-water',contextId:'food-water',kind:'speech',result:'independent',source:'parent',helped:false,date:'2026-10-13',phraseId:'needs-01'});s=m.completeEvent(s,'hello-morning','2026-10-13');s=m.completeEvent(s,'play-ball','2026-10-13');s=m.placeItem(s,'sun-lamp',{x:.2,y:.7});localStorage.setItem(m.STORAGE_KEY,JSON.stringify(s));localStorage.setItem('xiaoya-english:preferences:v1',JSON.stringify({welcome:true,mic:true}));localStorage.setItem('english-sprout-state-v1','legacy exact bytes');});
    await p.reload();const before=await state(p);await p.locator('[data-action="start-guide"]').waitFor();await toSpeak(p);assert.deepEqual(await state(p),before);await p.evaluate(()=>qa.deny=true);await click(p,'record');await click(p,'guide-skip');await stage(p,'gift');await click(p,'guide-gift');await stage(p,'place');assert.deepEqual(await state(p),before,'Revisiting the tutorial must not increment prior completion counts or mint another gift');await click(p,'guide-place');await p.locator('[data-action="next-event"]').waitFor();const after=await state(p);assert.deepEqual(after.evidence,before.evidence);assert.deepEqual(after.completions,before.completions);assert.equal(Object.keys(after.items).length,2);assert.equal(await p.evaluate(()=>localStorage.getItem('english-sprout-state-v1')),'legacy exact bytes');assert.equal((await prefs(p)).mic,true);
  });
  await test('Failed gift and preference saves never fake completion and retries cannot duplicate rewards',async({p})=>{
    await seedStage(p,'gift');await p.evaluate(key=>qa.failKey=key,STATE);await click(p,'guide-gift');await p.getByText('这次记录没有保存。浏览器存储可能已满或被禁用，请保留本页并稍后重试。',{exact:true}).waitFor();assert.equal(await state(p),null);assert.equal((await prefs(p)).guideStep,'gift');await p.evaluate(()=>qa.failKey=null);await click(p,'close');
    await p.evaluate(key=>qa.failKey=key,PREFS);await click(p,'guide-gift');await p.getByText('设置没有保存，请检查浏览器存储权限。',{exact:true}).waitFor();assert.equal(Object.keys((await state(p)).items).length,1);assert.equal((await prefs(p)).guideStep,'gift');await p.evaluate(()=>qa.failKey=null);await click(p,'close');await click(p,'guide-gift');await stage(p,'place');assert.equal((await state(p)).completions['hello-morning'].count,1);await click(p,'guide-place');await p.locator('[data-action="next-event"]').waitFor();await noEvidence(p);
  });
  await test('Cross-tab preference sync keeps the saved guide step and does not write ability evidence',async({c,p})=>{
    await seedStage(p,'wave');await p.locator('[data-action="guide-wave"]:not([disabled])').waitFor();const other=await c.newPage();await other.goto(origin+'/xiaoya/');
    await other.evaluate(key=>localStorage.setItem(key,JSON.stringify({welcome:true,mic:false,guideStep:'speak'})),PREFS);
    await p.locator('[data-action="start-guide"]').waitFor();await click(p,'start-guide');await stage(p,'speak');assert.equal((await prefs(p)).guideStep,'speak');await noEvidence(p);await other.close();
  });
  for(const [width,height]of [[320,568],[390,844],[768,1024]])await test(`First entry and guide stay usable at ${width}x${height}`,async({p})=>{
    assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));let box=await p.locator('[data-primary]').boundingBox();assert(box.width>=48&&box.height>=48&&box.y>=0&&box.y+box.height<=height);await start(p);await p.locator('[data-action="sample"]:not([disabled])').waitFor();box=await p.locator('main [data-primary]').boundingBox();assert(box.width>=48&&box.height>=48&&box.y>=0&&box.y+box.height<=height);assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await p.screenshot({path:path.join(out,`guide-${width}.png`),fullPage:true});
  },{viewport:{width,height},isMobile:true,hasTouch:true});
  await browser.close();fs.writeFileSync(path.join(out,filter?'results-filtered.json':'results.json'),JSON.stringify(checks,null,2));console.log(`${checks.filter(x=>x.status==='PASS').length}/${checks.length} passed`);if(checks.some(x=>x.status==='FAIL'))process.exitCode=1;
})().catch(async error=>{console.error(error);await browser?.close();process.exitCode=1;});
