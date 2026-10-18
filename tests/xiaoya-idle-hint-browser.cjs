// Isolated Edge regression for the optional 15-second recovery hand.
// One threshold check uses real elapsed time. Other timer checks use Playwright's
// clock; audio remains native, and capture uses a virtual device + controlled ASR.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'C:/Users/Jam/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const origin=new URL(process.env.TEST_URL||'http://127.0.0.1:24756').origin;
assert(['127.0.0.1','localhost','[::1]'].includes(new URL(origin).hostname),'Use a loopback QA server');
const out=path.resolve(process.env.XIAOYA_IDLE_TEST_OUT||path.join(__dirname,'../test-results/xiaoya-idle-hint'));
const filter=process.env.XIAOYA_TEST_FILTER?new RegExp(process.env.XIAOYA_TEST_FILTER):null;
const DAY='2026-10-18',B='xiaoya-english:meadow:v1',PLAN='xiaoya-english:practice-plan:v1';
const report={origin,scope:'Disposable Edge profiles; one real 15-second threshold, other timers accelerated with Playwright clock; native local audio, virtual microphone, controlled ASR; visibility and accelerated-case input events are explicitly synthesized. No child data or remote requests.',checks:[]};
let browser;
const save=()=>fs.writeFileSync(path.join(out,filter?'results-filtered.json':'results.json'),JSON.stringify(report,null,2));
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function poll(p,fn,arg,timeout=25000){const start=Date.now();while(Date.now()-start<timeout){const result=await p.evaluate(fn,arg);if(result)return result;await delay(50);}throw Error('Timed out waiting for browser state');}
const action=(p,name)=>p.locator(`[data-action="${name}"]`).first().evaluate(b=>b.click());
const hand=p=>p.locator('.tap-cue:visible').count();
async function noHand(p,message){assert.equal(await hand(p),0,message);assert.equal(await p.locator('.is-idle-hint').count(),0,message+' (no hidden stale hint class)');}
async function pause(p){await p.clock.pauseAt(await p.evaluate(()=>Date.now()+1));}
async function reset(p,type='click'){
  await p.evaluate(type=>{
    const event=type.startsWith('pointer')?new PointerEvent(type,{bubbles:true,pointerId:1,pointerType:'touch'}):type==='keydown'?new KeyboardEvent(type,{bubbles:true,key:'Shift'}):new Event(type,{bubbles:true});
    document.querySelector('main').dispatchEvent(event);
  },type);
}
async function hidden(p,value){await p.evaluate(value=>{if(value)Object.defineProperty(document,'hidden',{configurable:true,value:true});else delete document.hidden;document.dispatchEvent(new Event('visibilitychange'));},value);}
async function snapshot(p,name){const file=path.join(out,name+'.png');await p.screenshot({path:file,animations:'disabled'});return file;}
async function ended(p,suffix){return poll(p,suffix=>qaIdle.media.some(a=>a.url.endsWith(suffix)&&a.ended),suffix);}
async function fixture({realTime=false,mic=false}={}){
  const c=await browser.newContext({viewport:{width:390,height:844},timezoneId:'Asia/Shanghai',isMobile:true,hasTouch:true,reducedMotion:'reduce',serviceWorkers:'block',permissions:mic?['microphone']:[]});
  const errors=[],requests=[];
  c.on('request',r=>requests.push({url:r.url(),method:r.method()}));
  await c.route('**/*',r=>new URL(r.request().url()).origin===origin?r.continue():r.abort('blockedbyclient'));
  if(mic)await c.route(/\/releases\/[^/]+\/speech-local\.js$/,r=>r.fulfill({contentType:'text/javascript',body:`export async function prepareSpeech(){return {ready:true};} export async function assessRecording(){window.qaIdle.asrStarted=true;await new Promise(resolve=>window.qaIdle.finishASR=resolve);return {heard:'banana',engine:'controlled-idle-hint-test'};} export function disposeSpeechAssessment(){}` }));
  await c.addInitScript(({origin,mic})=>{
    if(location.origin!==origin)return;
    localStorage.setItem('xiaoya-english:preferences:v1',JSON.stringify({mic}));
    const q=window.qaIdle={errors:[],media:[],hints:[],microphoneCalls:0,records:[],active:new Set(),audioRate:4};
    document.addEventListener('click',()=>q.lastClickAt=performance.now(),true);
    addEventListener('error',e=>{if(e.message)q.errors.push(e.message);});addEventListener('unhandledrejection',e=>q.errors.push(String(e.reason)));
    const NativeAudio=Audio;
    window.Audio=function(...args){
      const a=new NativeAudio(...args),item={url:String(args[0]||''),ended:false};a.playbackRate=q.audioRate;q.media.push(item);q.active.add(a);
      a.addEventListener('playing',()=>item.playing=true);a.addEventListener('ended',()=>{item.ended=true;q.active.delete(a);});a.addEventListener('pause',()=>q.active.delete(a));a.addEventListener('error',()=>item.error=true);return a;
    };window.Audio.prototype=NativeAudio.prototype;
    const gum=navigator.mediaDevices?.getUserMedia.bind(navigator.mediaDevices);
    if(gum)navigator.mediaDevices.getUserMedia=(...args)=>{q.microphoneCalls++;return gum(...args);};
    const NativeRecorder=MediaRecorder;
    window.MediaRecorder=class extends NativeRecorder{constructor(...args){super(...args);const item={bytes:0};q.records.push(item);this.addEventListener('start',()=>item.started=true);this.addEventListener('stop',()=>item.stopped=true);this.addEventListener('dataavailable',e=>item.bytes+=e.data.size);}};
    new MutationObserver(()=>{
      for(const wrap of document.querySelectorAll('.primary-wrap.is-idle-hint'))if(!wrap.dataset.qaHintSeen){wrap.dataset.qaHintSeen='1';q.hints.push({at:performance.now(),action:wrap.querySelector('[data-primary]')?.dataset.action,recording:!!document.querySelector('.recording-indicator'),status:document.querySelector('[data-assessment]')?.dataset.status,hidden:document.hidden,modal:!!document.querySelector('.modal-card'),speaking:[...q.active].some(a=>!a.paused&&!a.ended)});}
      for(const wrap of document.querySelectorAll('.primary-wrap:not(.is-idle-hint)'))delete wrap.dataset.qaHintSeen;
    }).observe(document,{subtree:true,childList:true,attributes:true,attributeFilter:['class']});
  },{origin,mic});
  const p=await c.newPage();p.setDefaultTimeout(20000);p.on('pageerror',e=>errors.push(e.message));
  if(realTime)await p.clock.setFixedTime(new Date(DAY+'T12:00:00+08:00'));
  else await p.clock.install({time:new Date(DAY+'T12:00:00+08:00')});
  try{
    await p.goto(origin+'/xiaoya/?garden=b&story=hello-everyone');await p.locator('main.home-view').waitFor();
    const meta=await p.evaluate(()=>({build:document.querySelector('meta[name="xiaoya-build"]').content,version:document.querySelector('meta[name="xiaoya-version"]').content}));
    const expected=JSON.parse(fs.readFileSync(path.join(__dirname,'../dist/xiaoya/version.json'),'utf8'));
    assert.equal(meta.build,expected.build);assert.equal(meta.version,expected.version);if(report.build)assert.equal(meta.build,report.build,'Build changed during QA');else Object.assign(report,meta);
    if(!realTime)await pause(p);
    return {c,p,errors,requests,mic};
  }catch(e){await c.close();throw e;}
}
async function review(p){
  await p.clock.resume();
  await p.evaluate(async({key})=>{const m=await import(new URL('practice-plan.js',document.querySelector('script[type="module"][src]').src));localStorage.setItem(key,JSON.stringify(m.recordPractice(m.createPracticePlan(),{roundId:'qa-idle-review',eventId:'hello-everyone',date:'2026-10-17',mode:'new',rewardVariant:null})));},{key:PLAN});
  await p.reload();await p.locator('main.home-view').waitFor();await action(p,'next-event');await p.locator('[data-recall-ready]').waitFor();await ended(p,'/flow-recall.mp3');await pause(p);
}
async function reward(p){
  await p.clock.resume();
  await p.evaluate(async({key,date})=>{const m=await import(new URL('garden-meadow.js',document.querySelector('script[type="module"][src]').src));let s=m.rewardRound(m.createMeadow(),{roundId:'qa-idle-starter',eventId:'hello-everyone',date});s=m.rewardRound(s,{roundId:'qa-idle-pending',eventId:'hello-morning',date});localStorage.setItem(key,JSON.stringify(s));},{key:B,date:DAY});
  await p.reload();await p.locator('main.home-view').waitFor();await action(p,'garden');await p.locator('[data-reward-choice]').first().waitFor();
  await ended(p,'/flow-choice.mp3');await pause(p);
}
async function check(name,fn,options){
  if(filter&&!filter.test(name))return;let f;
  try{f=await fixture(options);const evidence=await fn(f);assert.deepEqual(f.errors,[]);assert.deepEqual(await f.p.evaluate(()=>qaIdle.errors),[]);assert(f.requests.every(r=>r.method==='GET'&&new URL(r.url).origin===origin),'Only loopback GET requests');if(!f.mic)assert.equal(await f.p.evaluate(()=>qaIdle.microphoneCalls),0);const hints=await f.p.evaluate(()=>qaIdle.hints);assert(hints.every(h=>!h.recording&&!h.hidden&&!h.modal&&!h.speaking&&!['preparing','assessing'].includes(h.status)),'No transient hand during a blocked state');report.checks.push({name,status:'PASS',evidence,hints});console.log('PASS '+name);}
  catch(e){report.checks.push({name,status:'FAIL',error:e.stack,diagnostic:f?await f.p.evaluate(()=>({main:document.querySelector('main')?.outerHTML,media:qaIdle.media,hints:qaIdle.hints,records:qaIdle.records})).catch(()=>null):null,screenshot:f?await snapshot(f.p,'failure-'+(report.checks.length+1)).catch(()=>null):null});process.exitCode=1;console.error('FAIL '+name+' '+e.message);}
  finally{if(f)await f.c.close();save();}
}
(async()=>{
  fs.mkdirSync(out,{recursive:true});
  browser=await chromium.launch({channel:'msedge',headless:true,args:['--no-proxy-server','--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream','--autoplay-policy=no-user-gesture-required']});
  await check('Home waits a real 15 seconds before showing its one optional hand',async({p})=>{
    await noHand(p,'The first screen is quiet');const initial=await snapshot(p,'home-initial');
    await p.touchscreen.tap(12,300);const started=await p.evaluate(()=>qaIdle.lastClickAt);
    await delay(14000);await noHand(p,'No hand before fifteen seconds');await poll(p,()=>!!document.querySelector('.primary-wrap.is-idle-hint'));
    assert.equal(await hand(p),1);const shown=await p.evaluate(()=>qaIdle.hints.at(-1));assert(shown.at-started>=14999,'The real threshold is fifteen seconds from the actual input event');
    return {elapsedMs:shown.at-started,initial,afterIdle:await snapshot(p,'home-after-idle')};
  },{realTime:true});
  await check('Pointer, key, scroll and click hide immediately and restart the full interval',async({p})=>{
    const evidence=[];await reset(p);await p.clock.runFor(15001);assert.equal(await hand(p),1);
    for(const type of ['pointerdown','keydown','scroll','click']){
      await reset(p,type);await noHand(p,type+' immediately hides the hand');
      if(type==='pointerdown'){await p.clock.runFor(20000);await noHand(p,'A held touch never gains a hand');await reset(p,'pointerup');}
      await p.clock.runFor(14999);await noHand(p,type+' starts a new full interval');await p.clock.runFor(2);assert.equal(await hand(p),1,type+' can show only after a fresh fifteen seconds');evidence.push(type);
    }
    await reset(p,'click');await p.clock.runFor(14000);await reset(p,'scroll');await p.clock.runFor(2000);await noHand(p,'An intervening event cancels the old deadline');await p.clock.runFor(13001);assert.equal(await hand(p),1);
    return {events:evidence,midIntervalReset:true,heldTouch:true};
  });
  await check('Modal and background states cancel the hand and resume with a fresh interval',async({p})=>{
    await reset(p);await p.clock.runFor(15001);assert.equal(await hand(p),1);await action(p,'parent');await noHand(p,'Opening a modal clears the hand');await p.clock.runFor(20000);await noHand(p,'A modal never gets a background hand');await action(p,'close');await noHand(p,'Closing starts quietly');await p.clock.runFor(14999);await noHand(p,'Modal close has a fresh interval');await p.clock.runFor(2);assert.equal(await hand(p),1);
    await hidden(p,true);await noHand(p,'Background immediately hides the hand');await p.clock.runFor(20000);await noHand(p,'Background has no hint');await hidden(p,false);await noHand(p,'Foreground starts quietly');await p.clock.runFor(14999);await noHand(p,'Foreground has a fresh interval');await p.clock.runFor(2);assert.equal(await hand(p),1);return {modal:true,visibilityEventControlled:true};
  });
  await check('Review leaves listening and speaking equal, including after long inactivity',async({p})=>{
    await review(p);assert.equal(await p.locator('[data-recall-ready] button').count(),2);await p.clock.runFor(30000);await noHand(p,'Recall choices must never point only to the microphone');assert.equal(await p.locator('[data-primary]').count(),0);return {screenshot:await snapshot(p,'review-equal-options')};
  });
  await check('Native speech suppresses the hand and only completion starts its next interval',async({p})=>{
    await reset(p);await p.clock.runFor(15001);assert.equal(await hand(p),1);await p.evaluate(()=>qaIdle.audioRate=.25);await action(p,'help');
    await poll(p,()=>qaIdle.media.at(-1)?.playing&&[...qaIdle.active].some(a=>!a.paused&&!a.ended&&a.readyState>=2));await noHand(p,'Speech hides the hand immediately');await p.clock.fastForward(20000);await noHand(p,'An elapsed deadline cannot appear over native speech');assert(await p.evaluate(()=>[...qaIdle.active].some(a=>!a.paused&&!a.ended&&a.readyState>=2)),'Native speech is still playing during accelerated deadline');
    await p.evaluate(()=>{for(const a of qaIdle.active)a.playbackRate=4;});await poll(p,()=>qaIdle.media.some(a=>a.ended)&&[...qaIdle.active].every(a=>a.paused||a.ended));await noHand(p,'Speech completion does not immediately show a hand');await p.clock.runFor(14999);await noHand(p,'Completion starts a fresh interval');await p.clock.runFor(2);assert.equal(await hand(p),1);return {nativeEnded:true};
  });
  await check('Reward choices stay neutral; only the selected gift confirmation gets an idle hand',async({p})=>{
    await reward(p);await p.clock.runFor(20000);await noHand(p,'No resource choice is preferred by a hand');assert.equal(await p.locator('[data-primary]').count(),0);
    const before=await p.evaluate(key=>localStorage.getItem(key),B);await p.locator('[data-reward-choice="water"]').evaluate(b=>b.click());await ended(p,'/flow-water.mp3');await noHand(p,'The selected gift starts quietly');await p.clock.runFor(14999);await noHand(p,'Gift confirmation waits fifteen seconds');await p.clock.runFor(2);assert.equal(await hand(p),1);assert.equal(await p.locator('.is-idle-hint [data-primary]').getAttribute('data-action'),'confirm-reward');assert.equal(await p.evaluate(key=>localStorage.getItem(key),B),before,'The hint never claims the reward');const screenshot=await snapshot(p,'reward-gift-idle');
    await action(p,'confirm-reward');await poll(p,()=>document.querySelector('.reward-view')?.dataset.choice==='false');await action(p,'garden');await p.locator('.meadow-view').waitFor();await ended(p,'/economy-shop-ready.mp3');await p.emulateMedia({reducedMotion:'no-preference'});await noHand(p,'Meadow tools use their own quiet invitation');
    const invitation=await p.locator('.meadow-tool.inviting:not(.selected)').first().evaluate(button=>{
      const name=getComputedStyle(button).animationName;
      const frames=button.getAnimations().find(a=>a.animationName===name)?.effect.getKeyframes().map(f=>{const m=new DOMMatrix(f.transform||'none');return {...f,translation:[m.m41,m.m42],uniformScale:[m.a,m.d]};});
      const paper=[...document.styleSheets].flatMap(sheet=>[...sheet.cssRules]).find(rule=>rule.name==='paper-invite');
      return {name,frames,paperFrames:paper?[...paper.cssRules].map(rule=>({offset:rule.keyText,scale:rule.style.scale,translate:rule.style.translate,transform:rule.style.transform})):null};
    });
    // meadow.css has a more specific :not(:disabled) selector; paper.css is also
    // checked because its fallback invitation must remain equally quiet.
    assert(['meadow-invite','paper-invite'].includes(invitation.name),'The active invitation uses a gentle breathing animation');
    assert(invitation.frames?.some(f=>f.scale==='1.025'||f.uniformScale.every(s=>Math.abs(s-1.025)<.00001)),'The active invitation uses a small scale breath');
    assert(invitation.frames.every(f=>f.translation.every(n=>n===0)&&(!f.translate||['none','0px','0px 0px'].includes(f.translate))),'The active invitation has no jumping translation');
    assert(invitation.paperFrames?.some(f=>f.scale==='1.025'),'Paper invitation also uses a small scale breath');
    assert(invitation.paperFrames.every(f=>!f.translate&&!f.transform),'Paper invitation has no jumping translation');return {screenshot,meadowInvitation:invitation};
  });
  await check('Recording, controlled recognition and retry feedback never display a hand',async({p})=>{
    await review(p);await p.clock.resume();await action(p,'record');await poll(p,()=>!!document.querySelector('.recording-indicator'));await noHand(p,'Native recording has no hand');await delay(1500);await action(p,'record');await poll(p,()=>!!qaIdle.finishASR);await pause(p);await p.clock.runFor(20000);await noHand(p,'Recognition can wait without a hand');assert.equal(await p.locator('[data-status="assessing"]').count(),1);
    await p.evaluate(()=>qaIdle.finishASR());await poll(p,()=>document.querySelector('[data-assessment]')?.dataset.status==='retry');await ended(p,'/garden-speech-retry.mp3');await p.clock.runFor(20000);await noHand(p,'Retry leaves listening, help and speaking equally available');const records=await p.evaluate(()=>qaIdle.records);assert(records.length===1&&records[0].started&&records[0].stopped&&records[0].bytes>0);return {records,controlledASR:true};
  },{mic:true});
})().catch(e=>{console.error(e);process.exitCode=1;report.fatal=e.stack;}).finally(async()=>{await browser?.close();save();});
