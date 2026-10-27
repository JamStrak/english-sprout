// UI/async regression for 0.3. Real HTML audio, microphone permission,
// MediaRecorder and word matcher; only model preparation/transcription is
// controlled. These checks do not measure children's pronunciation accuracy.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'C:/Users/Jam/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const origin=new URL(process.env.TEST_URL||'http://127.0.0.1:24756').origin;
if(!['127.0.0.1','localhost','[::1]'].includes(new URL(origin).hostname))throw new Error('Use a loopback test server.');
const out=path.join(root,'test-results/xiaoya-v03');
const STATE='xiaoya-english:state:v1',PREFS='xiaoya-english:preferences:v1';
const knownAudio=Array.from(fs.readFileSync(path.join(root,'public/audio/hello-02.mp3')));
const checks=[];
const filter=process.env.XIAOYA_TEST_FILTER?new RegExp(process.env.XIAOYA_TEST_FILTER):null;
let browser;

const controlledRecognizer=`
export async function prepareSpeech({onStatus}={}) {
  const call={settled:false,mode:qa.prepareMode};qa.preparations.push(call);
  onStatus?.('正在准备本地识别');
  if(call.mode==='fail'){call.settled=true;throw new Error('Controlled model preparation failure');}
  if(call.mode==='delayed')await new Promise(resolve=>{call.resolve=resolve;});
  call.settled=true;onStatus?.('本地识别已就绪');
}
export async function assessRecording(url,target,{signal}={}) {
  const blob=await(await fetch(url)).blob();
  const call={target,bytes:blob.size,type:blob.type,aborted:!!signal?.aborted,
    mode:qa.assessmentMode,heard:qa.heard,settled:false,returned:false,consumed:false};
  qa.assessments.push(call);
  signal?.addEventListener('abort',()=>call.aborted=true,{once:true});
  // Intentionally ignore abort and return late to exercise the production
  // cancellation/generation checks, not a cooperative test-only recognizer.
  if(call.mode==='delayed')await new Promise(resolve=>{call.resolve=resolve;});
  call.settled=true;call.returned=true;
  return {get heard(){call.consumed=true;return call.heard===null?target:call.heard;}};
}
`;

async function fixture(options={}){
  const c=await browser.newContext({viewport:{width:390,height:844},permissions:['microphone'],timezoneId:'Asia/Shanghai',serviceWorkers:'block',...options});
  const requests=[];
  c.on('request',r=>requests.push({url:r.url(),method:r.method()}));
  await c.addInitScript(({origin,knownAudio})=>{
    if(location.origin!==origin)return;
    if(!localStorage.getItem('xiaoya-english:preferences:v1'))localStorage.setItem('xiaoya-english:preferences:v1',JSON.stringify({welcome:true,mic:true,guideStep:'done'}));
    window.qa={errors:[],audios:[],plays:[],streams:[],records:[],preparations:[],assessments:[],prepareMode:'immediate',assessmentMode:'immediate',heard:null,silent:false,holdMic:false,micPending:null,holdAudio:null,heldAudio:null,samples:0,voiced:0,contexts:[]};
    window.addEventListener('error',e=>qa.errors.push(e.message));
    window.addEventListener('unhandledrejection',e=>qa.errors.push(String(e.reason)));
    const NativeAudio=window.Audio;
    window.Audio=function(...args){const a=new NativeAudio(...args);a.playbackRate=3;qa.audios.push(a);a.addEventListener('playing',()=>{qa.plays.push(a.src);if(qa.holdAudio&&a.src.includes(qa.holdAudio)){qa.heldAudio=a;a.pause();}});return a;};
    window.Audio.prototype=NativeAudio.prototype;
    const NativeRecorder=window.MediaRecorder;
    if(!NativeRecorder||!navigator.mediaDevices?.getUserMedia)return;
    const fixtures=new WeakMap(),AC=window.AudioContext||window.webkitAudioContext;
    const sample=AnalyserNode.prototype.getByteTimeDomainData;
    AnalyserNode.prototype.getByteTimeDomainData=function(values){const result=sample.call(this,values);qa.samples++;const rms=Math.sqrt(values.reduce((n,x)=>n+((x-128)/128)**2,0)/values.length);if(rms>.022)qa.voiced++;return result;};
    window.MediaRecorder=class extends NativeRecorder{
      constructor(...args){
        super(...args);
        const fixture=fixtures.get(args[0]),entry={bytes:0,type:this.mimeType,started:false,stopped:false};qa.records.push(entry);
        this.addEventListener('start',()=>{entry.started=true;fixture?.source.start();});
        this.addEventListener('dataavailable',e=>entry.bytes+=e.data.size);
        this.addEventListener('stop',()=>{entry.stopped=true;fixture?.context.close().catch(()=>{});});
      }
    };
    const get=navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getUserMedia=async(...args)=>{
      const native=await get(...args);qa.streams.push(native);native.getTracks().forEach(t=>t.stop());
      if(qa.holdMic)await new Promise(resolve=>{qa.micPending=resolve;});
      const context=new AC({sampleRate:48000});qa.contexts.push(context);await context.resume();
      const source=context.createBufferSource();
      source.buffer=qa.silent?context.createBuffer(1,48000,48000):await context.decodeAudioData(new Uint8Array(knownAudio).buffer);
      source.loop=true;
      const dest=context.createMediaStreamDestination();source.connect(dest);
      const stream=dest.stream;fixtures.set(stream,{context,source});qa.streams.push(stream);
      for(const track of stream.getTracks()){const stop=track.stop.bind(track);track.stop=()=>{stop();context.close().catch(()=>{});};}
      return stream;
    };
  },{origin,knownAudio});
  await c.route(/\/speech-local\.js(?:\?.*)?$/,route=>route.fulfill({status:200,contentType:'text/javascript; charset=utf-8',body:controlledRecognizer}));
  const p=await c.newPage();p.setDefaultTimeout(15000);
  try{
    await p.goto(origin+'/xiaoya/');await p.locator('[data-action="next-event"]').waitFor();
    await p.evaluate(async()=>{await import(new URL('shared/speech-match.js',document.querySelector('script[type="module"][src]').src));});
    return{c,p,requests};
  }catch(error){await c.close();throw error;}
}
async function click(p,action){await p.locator(`[data-action="${action}"]`).first().click();}
async function state(p){return p.evaluate(key=>JSON.parse(localStorage.getItem(key)||'null'),STATE);}
async function parent(p){
  await click(p,'parent');
  if(await p.locator('#parent-answer').count()){
    const numbers=(await p.locator('label[for="parent-answer"]').textContent()).match(/\d+/g).map(Number);
    await p.locator('#parent-answer').fill(String(numbers[0]+numbers[1]));await click(p,'gate-submit');
  }
}
async function request(p,event='hello-morning'){
  await parent(p);await p.locator(`[data-checkup="${event}"]`).click();await p.locator('.event-view[data-phase="request"]').waitFor();
}
async function capture(p,{silence=false}={}){
  const before=await p.evaluate(silent=>{qa.silent=silent;return{voiced:qa.voiced,samples:qa.samples,records:qa.records.length};},silence);
  await click(p,'record');await p.locator('.mic-button.recording').waitFor();
  await p.waitForFunction(({before,silence})=>silence?qa.samples>=before.samples+4:qa.voiced>=before.voiced+3,{before,silence});
  if(await p.locator('.mic-button.recording').count())await click(p,'record');
  await p.waitForFunction(n=>qa.records.length>n&&qa.records[n].stopped&&qa.records[n].bytes>0,before.records);
  await p.waitForFunction(()=>qa.streams.every(s=>s.getTracks().every(t=>t.readyState==='ended')));
}
async function assessment(p,status,stars){
  const panel=p.locator(`[data-assessment][data-status="${status}"]`);await panel.waitFor();
  if(stars!==undefined)assert.equal(Number(await panel.getAttribute('data-stars')),stars);
  return panel;
}
async function settle(p,index=0){
  await p.evaluate(index=>qa.assessments[index].resolve(),index);
  await p.waitForFunction(index=>qa.assessments[index].returned,index);
  await p.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
}
async function noMastery(p){
  const ability=await p.evaluate(async()=>{
    const src=document.querySelector('script[type="module"][src]').src;
    const [m,content]=await Promise.all([import(new URL('learning.js',src)),import(new URL('content.js',src))]);
    const s=JSON.parse(localStorage.getItem(m.STORAGE_KEY)||'null')||m.createState();
    return{goals:content.GOALS.map(g=>m.goalStatus(s,g.id)),alphabet:m.alphabetEligibility(s)};
  });
  assert(ability.goals.every(g=>g.independentCount===0&&!g.passed));assert.equal(ability.alphabet.eligible,false);
}
async function noVisibleInstructions(p){
  const visible=await p.evaluate(()=>{
    const walker=document.createTreeWalker(document.querySelector('.app-shell'),NodeFilter.SHOW_TEXT),texts=[];
    let node;
    while((node=walker.nextNode())){
      const value=node.textContent.trim();if(!/[\u3400-\u9fff]/.test(value))continue;
      // The visibly labelled adult entrance is not a child's task instruction.
      if(node.parentElement.closest('[data-action="parent"]'))continue;
      let hidden=false;
      for(let e=node.parentElement;e;e=e.parentElement){const css=getComputedStyle(e);if(css.display==='none'||css.visibility==='hidden'||Number(css.opacity)===0||css.clip!=='auto'||css.clipPath==='inset(50%)'){hidden=true;break;}}
      if(hidden)continue;
      const range=document.createRange();range.selectNodeContents(node);
      if([...range.getClientRects()].some(r=>r.width>2&&r.height>2))texts.push(value);
    }
    return texts;
  });
  assert.deepEqual(visible,[],'Child instructions must be spoken or represented by icons, with accessible text retained off screen');
}
async function diagnostics(p){return p.evaluate(()=>({
  phase:document.querySelector('.event-view')?.dataset.phase,step:document.querySelector('.guide-view')?.dataset.step,
  panel:document.querySelector('[data-assessment]')?.outerHTML,recording:!!document.querySelector('.mic-button.recording'),
  cue:document.querySelector('.event-cue,.guide-message')?.textContent,errors:qa.errors,
  preparations:qa.preparations.map(({settled,mode})=>({settled,mode})),
  assessments:qa.assessments.map(({target,bytes,type,aborted,mode,heard,settled,returned,consumed})=>({target,bytes,type,aborted,mode,heard,settled,returned,consumed})),
  records:qa.records,samples:qa.samples,voiced:qa.voiced,tracks:qa.streams.flatMap(s=>s.getTracks().map(t=>t.readyState)),
  state:localStorage.getItem('xiaoya-english:state:v1')
})).catch(error=>({error:error.message}));}
async function test(name,fn,options){
  if(filter&&!filter.test(name))return;
  let f,build;
  try{
    f=await fixture(options);build=await f.p.locator('meta[name="xiaoya-build"]').getAttribute('content');
    await fn(f);assert.deepEqual(await f.p.evaluate(()=>qa.errors),[]);
    assert(!f.requests.some(r=>!['GET','HEAD'].includes(r.method)),'No recording or transcript is uploaded');
    assert(!f.requests.some(r=>!r.url.startsWith(origin)&&!r.url.startsWith('blob:')&&!r.url.startsWith('data:')),'This path uses local assets only');
    const saved=await f.p.evaluate(()=>JSON.stringify(Object.fromEntries(Object.entries(localStorage))));
    assert.doesNotMatch(saved,/blob:|base64|audio\/webm|"heard"|"transcript"/);
    checks.push({name,status:'PASS',build,diagnostics:await diagnostics(f.p)});console.log('PASS',name);
  }catch(error){
    checks.push({name,status:'FAIL',build,error:error.stack,diagnostics:f?await diagnostics(f.p):null});console.error('FAIL',name,error.message);
    if(f)await f.p.screenshot({path:path.join(out,`failed-${checks.length}.png`),fullPage:true}).catch(()=>{});
  }finally{await f?.c.close();}
}

(async()=>{
  fs.mkdirSync(out,{recursive:true});
  browser=await chromium.launch({channel:'msedge',headless:true,args:['--no-proxy-server','--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream','--autoplay-policy=no-user-gesture-required']});
  await test('Listening displays only neutral artwork and three choices without an answer-sized clue',async({p})=>{
    await noVisibleInstructions(p);await p.screenshot({path:path.join(out,'wordless-home-390.png'),fullPage:true});
    await click(p,'next-event');await p.locator('.event-view[data-phase="listen"]').waitFor();
    assert.equal(await p.locator('[data-choice]').count(),0);
    const stage=p.locator('.scene-stage');
    if(await stage.count()){assert(await stage.getAttribute('data-listening-neutral')!==null);assert.equal(await stage.locator('[data-scene]').count(),0);}
    await click(p,'sample');await p.locator('[data-choice]').first().waitFor();assert.equal(await p.locator('[data-choice]').count(),3);
    assert.equal(await p.locator('.scene-stage [data-scene]').count(),0);
    await noVisibleInstructions(p);
    assert.equal(await p.evaluate(()=>qa.preparations.length),0);assert.equal(await state(p),null);
    await p.screenshot({path:path.join(out,'listening-390.png'),fullPage:true});
  });
  await test('First recording automatically prepares recognition and a word match receives three practice stars without mastery',async({p})=>{
    assert.equal(await p.evaluate(()=>qa.preparations.length),0);await request(p);
    assert.equal(await p.evaluate(()=>qa.preparations.length),0);await capture(p);await assessment(p,'matched',3);
    await p.locator('.event-view[data-phase="resolved"]').waitFor();assert.equal(await p.evaluate(()=>qa.preparations.length),1);
    const s=await state(p);assert.equal(s.evidence.length,1);assert.equal(s.evidence[0].source,'machine');assert.equal(s.evidence[0].result,'independent');assert.equal(s.evidence[0].helped,false);
    await noMastery(p);assert.doesNotMatch(await p.locator('.app-shell').innerText(),/发音准确率|口语掌握率|准确率.*%/);
    await p.screenshot({path:path.join(out,'matched-390.png'),fullPage:true});
  });
  await test('The feedback icon replays its voice without rescoring, changing evidence or losing the next action',async({p})=>{
    await request(p);await capture(p);await assessment(p,'matched',3);await noVisibleInstructions(p);
    const before=await state(p),calls=await p.evaluate(()=>qa.assessments.length),played=await p.evaluate(()=>qa.plays.length);
    await click(p,'assessment-voice');await p.waitForFunction(n=>qa.plays.length>n,played);
    assert.deepEqual(await state(p),before);assert.equal(await p.evaluate(()=>qa.assessments.length),calls);
    await assessment(p,'matched',3);await p.locator('[data-action="finish"]').waitFor();await noMastery(p);
  });
  await test('Unrelated speech receives retry feedback and retrying can pass without a parent assessment',async({p})=>{
    await request(p);await p.evaluate(()=>qa.heard='purple rocket');await capture(p);await assessment(p,'retry',1);
    await p.locator('.event-view[data-phase="request"]').waitFor();assert.equal((await state(p)).evidence[0].source,'machine');assert.equal((await state(p)).evidence[0].result,'unclear');
    await p.evaluate(()=>qa.heard=null);await capture(p);await assessment(p,'matched',3);assert.equal((await state(p)).evidence.length,2);await noMastery(p);
  });
  await test('Real silence receives zero stars without a fabricated transcript or ability record',async({p})=>{
    await request(p);await capture(p,{silence:true});await assessment(p,'silence',0);
    assert.equal(await p.evaluate(()=>qa.voiced),0);assert.equal(await p.evaluate(()=>qa.assessments.length),0);assert.equal(await state(p),null);await noMastery(p);
    await p.screenshot({path:path.join(out,'silence-390.png'),fullPage:true});
  });
  await test('Unavailable model offers retry and does not mark a child as failing',async({p})=>{
    await request(p);await p.evaluate(()=>qa.prepareMode='fail');await capture(p);await assessment(p,'unavailable');
    assert.equal(await state(p),null);assert.equal(await p.evaluate(()=>qa.assessments.length),0);await noMastery(p);
    await p.evaluate(()=>qa.prepareMode='immediate');await capture(p);await assessment(p,'matched',3);
    assert(await p.evaluate(()=>qa.preparations.length>=2));
  });
  for(const action of ['teach','help','sample'])await test(`${action} interrupts active recording, releases its microphone and allows a fresh supported attempt`,async({p})=>{
    await request(p);await click(p,'record');await p.locator('.mic-button.recording').waitFor();await click(p,action);
    await p.waitForFunction(()=>!document.querySelector('.mic-button.recording')&&qa.streams.every(s=>s.getTracks().every(t=>t.readyState==='ended')));
    assert.equal(await state(p),null);assert.equal(await p.evaluate(()=>qa.assessments.length),0);
    await capture(p);await assessment(p,'matched',3);const e=(await state(p)).evidence[0];assert.equal(e.result,'supported');assert.equal(e.helped,true);await noMastery(p);
  });
  await test('Help during pending microphone permission cancels the late stream and the next recording works',async({p})=>{
    await request(p);await p.evaluate(()=>qa.holdMic=true);await click(p,'record');await p.waitForFunction(()=>!!qa.micPending);
    await click(p,'teach');await p.evaluate(()=>{qa.holdMic=false;qa.micPending();});
    await p.waitForFunction(()=>qa.streams.length===2&&qa.streams.every(s=>s.getTracks().every(t=>t.readyState==='ended')));
    assert.equal(await p.locator('.mic-button.recording').count(),0);assert.equal(await state(p),null);await capture(p);await assessment(p,'matched',3);
  });
  await test('Backgrounding during ordinary teach audio cancels it and a fresh recording can start after returning',async({p})=>{
    await request(p);await p.evaluate(()=>qa.holdAudio='assist-model.mp3');await click(p,'teach');
    await p.waitForFunction(()=>!!qa.heldAudio);assert(await p.locator('[data-action="record"]').isDisabled());
    await p.evaluate(()=>{window.dispatchEvent(new PageTransitionEvent('pagehide',{persisted:true}));qa.holdAudio=null;window.dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true}));});
    assert(await p.locator('[data-action="record"]').isEnabled());assert.equal(await state(p),null);
    await capture(p);await assessment(p,'matched',3);assert.equal((await state(p)).evidence[0].result,'supported');await noMastery(p);
  });
  await test('Closing an observation modal after pending permission restores the recording button and cancels the late stream',async({p})=>{
    await request(p);await p.evaluate(()=>qa.holdMic=true);await click(p,'record');await p.waitForFunction(()=>!!qa.micPending);
    assert(await p.locator('[data-action="record"]').isDisabled());await click(p,'observe');await p.locator('.modal-card').waitFor();await click(p,'close');
    assert(await p.locator('[data-action="record"]').isEnabled());assert.equal(await p.locator('.mic-button.recording').count(),0);
    await p.evaluate(()=>{qa.holdMic=false;qa.micPending();});await p.waitForFunction(()=>qa.streams.length===2&&qa.streams.every(s=>s.getTracks().every(t=>t.readyState==='ended')));
    assert.equal(await state(p),null);await capture(p);await assessment(p,'matched',3);await noMastery(p);
  });
  await test('An unavailable voice activity detector does not label a valid native recording as silence',async({p})=>{
    await request(p);
    // The source fixture retains its native context. Only the application lacks
    // Web Audio, so its real MediaRecorder still receives and encodes audio.
    await p.evaluate(()=>{window.AudioContext=undefined;window.webkitAudioContext=undefined;});
    await click(p,'record');await p.locator('.mic-button.recording').waitFor();await p.waitForFunction(()=>qa.records[0]?.bytes>0);
    await click(p,'record');await p.waitForFunction(()=>qa.records[0].stopped&&qa.streams.every(s=>s.getTracks().every(t=>t.readyState==='ended')));
    await assessment(p,'matched',3);assert.equal(await p.locator('[data-assessment][data-status="silence"]').count(),0);
    assert.equal(await p.evaluate(()=>qa.samples),0);assert.equal(await p.evaluate(()=>qa.assessments.length),1);await noMastery(p);
  });
  await test('Placing furniture keeps its saved position and the house-shaped return action reaches the home screen',async({p})=>{
    await request(p);await click(p,'watch');await p.locator('.event-view[data-phase="resolved"]').waitFor();await click(p,'finish');await click(p,'take-reward');
    await p.locator('.house-view').waitFor();await p.locator('[data-inventory="sun-lamp"]').click();await click(p,'place-center');
    const saved=await state(p);assert.equal(saved.items['sun-lamp'].x,.5);assert.equal(saved.items['sun-lamp'].y,.65);
    await p.locator('.bottom-nav [data-action="home"]').click();await p.locator('[data-action="next-event"]').waitFor();assert.equal(await p.locator('.house-view').count(),0);assert.deepEqual(await state(p),saved);
  });
  await test('A late match after watching cannot replace the chosen outcome or append evidence',async({p})=>{
    await request(p);await p.evaluate(()=>qa.assessmentMode='delayed');await capture(p);await p.waitForFunction(()=>qa.assessments.length===1);
    await click(p,'watch');await p.locator('.event-view[data-phase="resolved"]').waitFor();const before=await state(p);await settle(p);
    assert.deepEqual(await state(p),before);assert.equal(await p.locator('[data-assessment][data-status="matched"]').count(),0);assert.equal(await p.evaluate(()=>qa.assessments[0].aborted),true);
  });
  await test('A late old match cannot overwrite a newer retry score or add a second candidate',async({p})=>{
    await request(p);await p.evaluate(()=>qa.assessmentMode='delayed');await capture(p);await p.waitForFunction(()=>qa.assessments.length===1);
    await p.evaluate(()=>{qa.assessmentMode='immediate';qa.heard='purple rocket';});await capture(p);await assessment(p,'retry',1);
    const before=await state(p);await settle(p);await assessment(p,'retry',1);assert.deepEqual(await state(p),before);assert.equal(before.evidence.length,1);assert.equal(await p.evaluate(()=>qa.assessments[0].aborted),true);
  });
  await test('Context help cancels a pending assessment and its late match cannot append evidence',async({p})=>{
    await request(p);await p.evaluate(()=>qa.assessmentMode='delayed');await capture(p);await p.waitForFunction(()=>qa.assessments.length===1);
    await click(p,'context-help');await settle(p);assert.equal(await state(p),null);
    assert.equal(await p.locator('[data-assessment]').count(),0);assert.equal(await p.evaluate(()=>qa.assessments[0].aborted),true);
    await p.locator('.event-view[data-phase="request"]').waitFor();await p.evaluate(()=>qa.assessmentMode='immediate');await capture(p);await assessment(p,'matched',3);
    assert.equal((await state(p)).evidence[0].result,'supported');await noMastery(p);
  });
  await test('Leaving during automatic model preparation permits background completion but never evaluates a discarded recording',async({p})=>{
    await request(p);await p.evaluate(()=>qa.prepareMode='delayed');await capture(p);await p.waitForFunction(()=>qa.preparations.length===1);
    await click(p,'home');await p.locator('[data-action="next-event"]').waitFor();await p.evaluate(()=>qa.preparations[0].resolve());await p.waitForFunction(()=>qa.preparations[0].settled);
    await p.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));assert.equal(await p.evaluate(()=>qa.assessments.length),0);assert.equal(await state(p),null);
  });
  await test('Tutorial recording may receive automatic practice feedback but never creates ability evidence',async({p})=>{
    await p.evaluate(key=>localStorage.setItem(key,JSON.stringify({welcome:true,mic:true,guideStep:'speak'})),PREFS);await p.reload();await click(p,'start-guide');
    await p.locator('.guide-view[data-step="speak"] [data-action="record"]:not([disabled])').waitFor();await p.screenshot({path:path.join(out,'wordless-guide-390.png'),fullPage:true});await capture(p);await assessment(p,'matched',3);
    await p.locator('.guide-view[data-step="replay"]').waitFor();assert.equal(await state(p),null);await noMastery(p);
    await click(p,'guide-replay');await p.locator('.guide-view[data-step="gift"]').waitFor();assert.equal(await state(p),null);await click(p,'guide-gift');await p.locator('.guide-view[data-step="place"]').waitFor();
    assert.equal((await state(p)).evidence.length,0);await click(p,'guide-place');await p.locator('[data-action="next-event"]').waitFor();assert.equal((await state(p)).evidence.length,0);
  });
  await test('A narrow-screen child can finish the icon-led introduction, place a gift and return home without visible instructions',async({p})=>{
    await p.evaluate(key=>localStorage.setItem(key,JSON.stringify({welcome:true,mic:true,guideStep:'listen'})),PREFS);await p.reload();
    await p.locator('[data-action="start-guide"]').waitFor();await noVisibleInstructions(p);await p.screenshot({path:path.join(out,'wordless-entry-320.png'),fullPage:true});
    await click(p,'start-guide');await p.locator('.guide-view[data-step="listen"]').waitFor();await noVisibleInstructions(p);
    await click(p,'sample');await p.locator('.guide-view[data-step="wave"] [data-primary]:not([disabled])').waitFor();await noVisibleInstructions(p);
    await click(p,'guide-wave');await p.locator('.guide-view[data-step="speak"] [data-action="record"]:not([disabled])').waitFor();await noVisibleInstructions(p);await p.screenshot({path:path.join(out,'wordless-guide-320.png'),fullPage:true});
    await capture(p);await assessment(p,'matched',3);await noVisibleInstructions(p);assert.equal(await state(p),null);await p.screenshot({path:path.join(out,'wordless-feedback-320.png'),fullPage:true});
    await click(p,'guide-replay');await p.locator('.guide-view[data-step="gift"] [data-primary]:not([disabled])').waitFor();await noVisibleInstructions(p);
    await click(p,'guide-gift');await p.locator('.guide-view[data-step="place"] [data-primary]:not([disabled])').waitFor();await noVisibleInstructions(p);
    await click(p,'guide-place');await p.locator('[data-action="next-event"]').waitFor();await noVisibleInstructions(p);
    await click(p,'house');await p.locator('.house-view').waitFor();await noVisibleInstructions(p);
    const box=await p.locator('.bottom-nav [data-action="home"]').boundingBox();assert(box.width>=44&&box.height>=44);
    assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await p.screenshot({path:path.join(out,'wordless-house-320.png'),fullPage:true});
    await p.locator('.bottom-nav [data-action="home"]').click();await p.locator('[data-action="next-event"]').waitFor();assert.equal((await state(p)).evidence.length,0);
    await click(p,'next-event');await p.locator('.event-view[data-phase="listen"]').waitFor();await click(p,'sample');await p.locator('[data-choice]').first().waitFor();await noVisibleInstructions(p);await p.screenshot({path:path.join(out,'wordless-listening-320.png'),fullPage:true});
  },{viewport:{width:320,height:740},reducedMotion:'reduce'});
  await browser.close();
  fs.writeFileSync(path.join(out,filter?'results-filtered.json':'results.json'),JSON.stringify({actualMediaRecorder:true,actualWordMatcher:true,controlledTranscription:true,childSpeechValidated:false,checks},null,2));
  console.log(`${checks.filter(x=>x.status==='PASS').length}/${checks.length} passed`);if(checks.some(x=>x.status==='FAIL'))process.exitCode=1;
})().catch(async error=>{console.error(error);await browser?.close();process.exitCode=1;});
