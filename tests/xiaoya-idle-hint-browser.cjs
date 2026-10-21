// Guidance/audio/reward regression in disposable Edge contexts. Virtual time is
// explicit: native local audio plays at 4x while the clock is paused. Never use
// the user's browser profile, learning history, microphone, or external ASR.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'C:/Users/Jam/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const origin=new URL(process.env.TEST_URL||'http://127.0.0.1:24756').origin;
assert(['127.0.0.1','localhost','[::1]'].includes(new URL(origin).hostname),'Use a loopback QA server');
const out=path.resolve(process.env.XIAOYA_IDLE_TEST_OUT||path.join(__dirname,'../test-results/xiaoya-idle-hint'));
const filter=process.env.XIAOYA_TEST_FILTER?new RegExp(process.env.XIAOYA_TEST_FILTER):null;
const DAY='2026-10-18',B='xiaoya-english:meadow:v1',PLAN='xiaoya-english:practice-plan:v1',PREFS='xiaoya-english:preferences:v1',GUIDANCE='xiaoya-english:guidance:v1';
const report={origin,scope:'Disposable Edge contexts; 60-second thresholds use Playwright virtual time. Local recorded audio is native at 4x. Microphone is a synthetic device; ASR, visibility and idle input events are controlled. No real player data, remote requests, or server changes.',checks:[]};
let browser,seed;
const save=()=>fs.writeFileSync(path.join(out,filter?'results-filtered.json':'results.json'),JSON.stringify(report,null,2));
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function poll(p,fn,arg,timeout=20000){const start=Date.now();while(Date.now()-start<timeout){const result=await p.evaluate(fn,arg);if(result)return result;await delay(50);}throw Error('Timed out waiting for browser state: '+String(fn).slice(0,180));}
const action=(p,name)=>p.locator(`[data-action="${name}"]`).first().evaluate(b=>b.click());
const hand=p=>p.locator('.tap-cue:visible').count();
async function noHand(p,message){assert.equal(await hand(p),0,message);assert.equal(await p.locator('.is-idle-hint').count(),0,message+' (no stale class)');}
const voices=p=>p.evaluate(()=>qaIdle.media.filter(a=>/\/audio\/v3\//.test(a.url)&&!a.url.endsWith('/garden-piano.mp3')));
const countVoice=(p,suffix)=>p.evaluate(s=>qaIdle.media.filter(a=>a.url.endsWith(s)).length,suffix);
async function ended(p,suffix,n=1){return poll(p,({suffix,n})=>qaIdle.media.filter(a=>a.url.endsWith(suffix)&&a.ended).length>=n,{suffix,n});}
async function pause(p){await p.clock.pauseAt(await p.evaluate(()=>Date.now()+1));}
async function reset(p,type='click'){
  await p.evaluate(type=>{const e=type.startsWith('pointer')?new PointerEvent(type,{bubbles:true,pointerId:1,pointerType:'touch'}):type==='keydown'?new KeyboardEvent(type,{bubbles:true,key:'Shift'}):new Event(type,{bubbles:true});document.querySelector('main').dispatchEvent(e);},type);
}
async function hidden(p,value){await p.evaluate(value=>{if(value)Object.defineProperty(document,'hidden',{configurable:true,value:true});else delete document.hidden;document.dispatchEvent(new Event('visibilitychange'));},value);}
async function snapshot(p,name){const file=path.join(out,name+'.png');await p.screenshot({path:file,animations:'disabled'});return file;}
async function fixture({mic=false,returning=true,reminders=true}={}){
  const c=await browser.newContext({viewport:{width:390,height:844},timezoneId:'Asia/Shanghai',isMobile:true,hasTouch:true,reducedMotion:'reduce',serviceWorkers:'block',permissions:mic?['microphone']:[]});
  const errors=[],requests=[];
  c.on('request',r=>requests.push({url:r.url(),method:r.method()}));
  await c.route('**/*',r=>new URL(r.request().url()).origin===origin?r.continue():r.abort('blockedbyclient'));
  if(mic)await c.route(/\/releases\/[^/]+\/speech-local\.js$/,r=>r.fulfill({contentType:'text/javascript',body:`export async function prepareSpeech(){return {ready:true};} export async function assessRecording(){window.qaIdle.asrStarted=true;await new Promise(resolve=>window.qaIdle.finishASR=resolve);return {heard:'banana',engine:'controlled-guidance-test'};} export function disposeSpeechAssessment(){}` }));
  await c.addInitScript(({origin,mic,returning,reminders,seed,B,PREFS,GUIDANCE})=>{
    if(location.origin!==origin)return;
    if(!sessionStorage.getItem('qa-guidance-seeded')){
      localStorage.setItem(B,JSON.stringify(seed));
      localStorage.setItem(PREFS,JSON.stringify({mic,audioControls:{music:true,reminders}}));
      if(returning)localStorage.setItem(GUIDANCE,JSON.stringify({visited:true,seen:[]}));
      sessionStorage.setItem('qa-guidance-seeded','1');
    }
    const q=window.qaIdle={errors:[],media:[],hints:[],microphoneCalls:0,records:[],active:new Set(),audioRate:4,webAudioStarts:0};
    addEventListener('error',e=>{if(e.message)q.errors.push(e.message);});addEventListener('unhandledrejection',e=>q.errors.push(String(e.reason)));
    const NativeAudio=Audio;
    window.Audio=function(...args){const a=new NativeAudio(...args),item={url:String(args[0]||''),ended:false};a.playbackRate=q.audioRate;q.media.push(item);q.active.add(a);a.addEventListener('playing',()=>{item.url=a.currentSrc||a.src;item.playing=true;q.active.add(a);});a.addEventListener('ended',()=>{item.ended=true;q.active.delete(a);});a.addEventListener('pause',()=>q.active.delete(a));a.addEventListener('error',()=>item.error=true);return a;};window.Audio.prototype=NativeAudio.prototype;
    const start=AudioBufferSourceNode.prototype.start;AudioBufferSourceNode.prototype.start=function(...args){q.webAudioStarts++;return start.apply(this,args);};
    const gum=navigator.mediaDevices?.getUserMedia.bind(navigator.mediaDevices);if(gum)navigator.mediaDevices.getUserMedia=(...args)=>{q.microphoneCalls++;return gum(...args);};
    const NativeRecorder=MediaRecorder;window.MediaRecorder=class extends NativeRecorder{constructor(...args){super(...args);const item={bytes:0};q.records.push(item);this.addEventListener('start',()=>item.started=true);this.addEventListener('stop',()=>item.stopped=true);this.addEventListener('dataavailable',e=>item.bytes+=e.data.size);}};
    new MutationObserver(()=>{for(const w of document.querySelectorAll('.primary-wrap.is-idle-hint'))if(!w.dataset.qaHintSeen){w.dataset.qaHintSeen='1';q.hints.push({at:Date.now(),action:w.querySelector('[data-primary]')?.dataset.action,recording:!!document.querySelector('.recording-indicator'),status:document.querySelector('[data-assessment]')?.dataset.status,hidden:document.hidden,modal:!!document.querySelector('.modal-card'),gm:!!document.querySelector('#gm-workbench[open]'),speaking:[...q.active].some(a=>!a.paused&&!a.ended&&!a.loop)});}for(const w of document.querySelectorAll('.primary-wrap:not(.is-idle-hint)'))delete w.dataset.qaHintSeen;}).observe(document,{subtree:true,childList:true,attributes:true,attributeFilter:['class']});
  },{origin,mic,returning,reminders,seed,B,PREFS,GUIDANCE});
  const p=await c.newPage();p.setDefaultTimeout(20000);p.on('pageerror',e=>errors.push(e.message));
  await p.clock.install({time:new Date(DAY+'T12:00:00+08:00')});
  try{
    await p.goto(origin+'/xiaoya/?garden=b&story=hello-everyone');await p.locator('main.home-view').waitFor();
    const meta=await p.evaluate(()=>({build:document.querySelector('meta[name="xiaoya-build"]').content,version:document.querySelector('meta[name="xiaoya-version"]').content}));
    const expected=JSON.parse(fs.readFileSync(path.join(__dirname,'../dist/xiaoya/version.json'),'utf8'));assert.equal(meta.build,expected.build);assert.equal(meta.version,expected.version);if(report.build)assert.equal(meta.build,report.build,'Build changed during QA');else Object.assign(report,meta);
    await pause(p);return {c,p,errors,requests,mic};
  }catch(e){await c.close();throw e;}
}
// Use exported state transitions to make valid ledgers; inject only into this
// disposable context. StorageEvent exercises the real cross-tab refresh path.
async function reward(p,serial=1){
  await p.evaluate(async({key,date,serial})=>{const m=await import(new URL('garden-meadow.js',document.querySelector('script[type="module"][src]').src));let s=JSON.parse(localStorage.getItem(key));if(!s.rounds.length)s=m.rewardRound(s,{roundId:'qa-starter',eventId:'hello-everyone',date});s=m.rewardRound(s,{roundId:'qa-pending-'+serial,eventId:'hello-morning',date});localStorage.setItem(key,JSON.stringify(s));dispatchEvent(new StorageEvent('storage',{key,newValue:JSON.stringify(s)}));},{key:B,date:DAY,serial});
  await action(p,'garden');await p.locator('[data-reward-choice]').first().waitFor();await p.clock.fastForward(2500);
}
async function review(p){
  await p.evaluate(async({key})=>{const m=await import(new URL('practice-plan.js',document.querySelector('script[type="module"][src]').src));const s=m.recordPractice(m.createPracticePlan(),{roundId:'qa-review',eventId:'hello-everyone',date:'2026-10-17',mode:'new',rewardVariant:null});localStorage.setItem(key,JSON.stringify(s));dispatchEvent(new StorageEvent('storage',{key,newValue:JSON.stringify(s)}));},{key:PLAN});
  await action(p,'next-event');await p.locator('[data-recall-ready]').waitFor();await p.clock.fastForward(2500);
}
async function check(name,fn,options){
  if(filter&&!filter.test(name))return;let f;
  try{f=await fixture(options);const evidence=await fn(f);assert.deepEqual(f.errors,[]);assert.deepEqual(await f.p.evaluate(()=>qaIdle.errors),[]);assert(f.requests.every(r=>r.method==='GET'&&new URL(r.url).origin===origin),'Only loopback GET requests');if(!f.mic)assert.equal(await f.p.evaluate(()=>qaIdle.microphoneCalls),0);const hints=await f.p.evaluate(()=>qaIdle.hints);assert(hints.every(h=>!h.recording&&!h.hidden&&!h.modal&&!h.gm&&!h.speaking&&!['preparing','assessing'].includes(h.status)),'No transient hand during a blocked state');report.checks.push({name,status:'PASS',evidence,hints});console.log('PASS '+name);}
  catch(e){report.checks.push({name,status:'FAIL',error:e.stack,diagnostic:f?await f.p.evaluate(()=>({main:document.querySelector('main')?.outerHTML,media:qaIdle.media,hints:qaIdle.hints,records:qaIdle.records})).catch(()=>null):null,screenshot:f?await snapshot(f.p,'failure-'+(report.checks.length+1)).catch(()=>null):null});process.exitCode=1;console.error('FAIL '+name+' '+e.message);}
  finally{if(f)await f.c.close();save();}
}
(async()=>{
  fs.mkdirSync(out,{recursive:true});
  const m=await import(pathToFileURL(path.join(__dirname,'../xiaoya/garden-meadow.js')).href);seed=m.claimWelcomeGift(m.createMeadow(),DAY);
  browser=await chromium.launch({channel:'msedge',headless:true,args:['--no-proxy-server','--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream','--autoplay-policy=no-user-gesture-required']});
  await check('Novice explains a reward once; repeat and reload stay quiet',async({p})=>{
    await reward(p);await ended(p,'/flow-choice.mp3');assert.equal(await countVoice(p,'/flow-choice.mp3'),1);
    await action(p,'choose-water');await poll(p,()=>document.querySelector('.reward-view')?.dataset.choice==='false');await action(p,'home');
    await reward(p,2);assert.equal(await countVoice(p,'/flow-choice.mp3'),1,'No repeated procedural explanation in the first session');
    await p.reload();await p.locator('main.home-view').waitFor();await pause(p);await action(p,'garden');await p.clock.fastForward(2500);assert.equal(await countVoice(p,'/flow-choice.mp3'),0,'A returning session stays quiet');
    return {firstPromptCount:1,repeatPromptCount:0,reloadPromptCount:0,seen:await p.evaluate(k=>JSON.parse(localStorage.getItem(k)).seen,GUIDANCE)};
  },{returning:false});
  await check('Returning reminders wait 60 seconds and repeat 60 seconds after playback ends',async({p})=>{
    await reset(p);await p.clock.fastForward(59999);assert.equal((await voices(p)).length,0);await noHand(p,'No early visual hint');
    await p.clock.fastForward(1);await ended(p,'/garden-welcome.mp3');assert.equal(await hand(p),1);assert.equal(await countVoice(p,'/garden-welcome.mp3'),1);
    await p.clock.fastForward(59999);assert.equal(await countVoice(p,'/garden-welcome.mp3'),1,'No repeat before the full interval');
    await p.clock.fastForward(1);await ended(p,'/garden-welcome.mp3',2);assert.equal(await hand(p),1);
    const screenshot=await snapshot(p,'home-idle-hand');await p.setViewportSize({width:320,height:844});
    const narrow=await p.evaluate(()=>{const rect=e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom};};return {viewport:innerWidth,buttons:[...document.querySelectorAll('.topbar button')].map(e=>({action:e.dataset.action,...rect(e)})),brand:rect(document.querySelector('.topbar .brand')),hand:rect(document.querySelector('.tap-cue')),wallet:rect(document.querySelector('.reward-preview')),wrap:rect(document.querySelector('.primary-wrap')),orb:rect(document.querySelector('.primary-orb'))};});
    const overlaps=(a,b)=>a.x<b.right&&a.right>b.x&&a.y<b.bottom&&a.bottom>b.y;
    assert(narrow.buttons.some(b=>b.action==='audio-settings'),'Sound settings remains available at 320px');
    for(let i=0;i<narrow.buttons.length;i++){const b=narrow.buttons[i];assert(b.x>=0&&b.right<=320,'Header button stays inside 320px viewport: '+b.action);assert(!overlaps(b,narrow.brand),'Header button does not cover brand: '+b.action);for(const other of narrow.buttons.slice(i+1))assert(!overlaps(b,other),'Header buttons do not collide');}
    return {intervalMs:60000,nativePlaybacks:2,screenshot,narrow,screenshot320:await snapshot(p,'home-idle-hand-320')};
  });
  await check('Pointer, key, scroll and click reset the full interval; held touch stays quiet',async({p})=>{
    for(const type of ['pointerdown','keydown','scroll','click']){
      await reset(p,type);await noHand(p,type+' hides hand');if(type==='pointerdown'){await p.clock.fastForward(60000);await noHand(p,'Held touch has no hand');await reset(p,'pointerup');}
      await p.clock.fastForward(59999);await noHand(p,type+' resets deadline');await p.clock.fastForward(1);assert.equal(await hand(p),1,type+' can hint after 60 seconds');
    }
    await reset(p);await p.clock.fastForward(59000);await reset(p,'scroll');await p.clock.fastForward(1001);await noHand(p,'Old deadline cancelled');await p.clock.fastForward(58999);assert.equal(await hand(p),1);return {events:['pointerdown/up','keydown','scroll','click'],midIntervalReset:true};
  },{reminders:false});
  await check('Audio modal, background and GM block hints and restart with a fresh interval',async({p})=>{
    await reset(p);await p.clock.fastForward(60000);assert.equal(await hand(p),1);
    await action(p,'audio-settings');await p.clock.fastForward(120000);await noHand(p,'Audio modal blocks background hand');await action(p,'close');await p.clock.fastForward(59999);await noHand(p,'Modal close has a fresh interval');await p.clock.fastForward(1);assert.equal(await hand(p),1);
    await hidden(p,true);await p.clock.fastForward(120000);await noHand(p,'Background blocks hand');await hidden(p,false);await p.clock.fastForward(59999);await noHand(p,'Foreground has a fresh interval');await p.clock.fastForward(1);assert.equal(await hand(p),1);
    await p.locator('.gm-launcher').evaluate(b=>b.click());await p.locator('#gm-workbench[open]').waitFor();await p.clock.fastForward(120000);await noHand(p,'GM blocks background hand');await p.locator('[data-gm-action="close"]').evaluate(b=>b.click());await p.clock.fastForward(59999);await noHand(p,'GM close has a fresh interval');await p.clock.fastForward(1);assert.equal(await hand(p),1);return {modal:true,visibilityEventControlled:true,gm:true};
  },{reminders:false});
  await check('Both reward choices credit on one click and ignore double or stale clicks',async({p})=>{
    const changes=[];
    for(const [serial,choice] of [[1,'water'],[2,'shells']]){
      await reward(p,serial);await reset(p);await p.clock.fastForward(60000);await ended(p,'/flow-choice.mp3',serial);await noHand(p,'No reward choice is preferred by a hand');
      assert.equal(await p.locator('[data-primary], [data-action="confirm-reward"]').count(),0);const before=await p.evaluate(k=>JSON.parse(localStorage.getItem(k)),B);
      await p.locator(`[data-reward-choice="${choice}"]`).evaluate(b=>{window.qaStaleReward=b;b.click();b.click();});await poll(p,()=>document.querySelector('.reward-view')?.dataset.choice==='false');
      const after=await p.evaluate(k=>JSON.parse(localStorage.getItem(k)),B);assert(after[choice]>before[choice]);assert.equal(after[choice==='water'?'shells':'water'],before[choice==='water'?'shells':'water']);assert.equal(after.rounds.find(r=>r.roundId==='qa-pending-'+serial).reward,choice);
      await p.evaluate(()=>qaStaleReward.click());assert.deepEqual(await p.evaluate(k=>JSON.parse(localStorage.getItem(k)),B),after,'Stale/double click never credits twice');assert.equal(await p.locator('[data-action="garden"][data-primary]').count(),1,'Garden button is navigation only');changes.push({choice,delta:after[choice]-before[choice]});await action(p,'home');
    }
    return {changes,screenshot:await snapshot(p,'reward-after-claim')};
  });
  await check('Audio switches persist; muting reminders and effects preserves manual help and English',async({p})=>{
    await action(p,'audio-settings');await action(p,'toggle-music');await action(p,'toggle-reminders');assert.equal(await p.locator('[data-action="toggle-music"]').getAttribute('aria-checked'),'false');assert.equal(await p.locator('[data-action="toggle-reminders"]').getAttribute('aria-checked'),'false');
    const starts=await p.evaluate(()=>qaIdle.webAudioStarts);await action(p,'close');await reset(p);await p.clock.fastForward(60000);assert.equal((await voices(p)).length,0,'Automatic reminders disabled');assert.equal(await p.evaluate(()=>qaIdle.webAudioStarts),starts,'UI effects disabled');
    await action(p,'help');await ended(p,'/garden-welcome.mp3');await review(p);const before=await p.evaluate(()=>qaIdle.media.length);await action(p,'sample');await poll(p,n=>qaIdle.media.slice(n).some(a=>a.ended&&!/\/audio\/v3\//.test(a.url)),before);
    const played=await p.evaluate(n=>qaIdle.media.slice(n).filter(a=>a.ended).map(a=>a.url),before);assert(played.length>0,'Explicit English sample completed');
    await p.reload();await p.locator('main.home-view').waitFor();await pause(p);await action(p,'audio-settings');assert.equal(await p.locator('[data-action="toggle-music"]').getAttribute('aria-checked'),'false');assert.equal(await p.locator('[data-action="toggle-reminders"]').getAttribute('aria-checked'),'false');
    return {manualHelpCompleted:true,englishCompleted:played,preferences:await p.evaluate(k=>JSON.parse(localStorage.getItem(k)),PREFS),screenshot:await snapshot(p,'audio-settings-muted')};
  });
  await check('Review keeps listening and speaking equal after an idle reminder',async({p})=>{
    await review(p);assert.equal(await countVoice(p,'/flow-review-v13.mp3'),0);assert.equal(await p.locator('[data-recall-ready] button').count(),2);await reset(p);await p.clock.fastForward(60000);await ended(p,'/garden-speak.mp3');await noHand(p,'Review never points only to the microphone');assert.equal(await p.locator('[data-primary]').count(),0);return {screenshot:await snapshot(p,'review-equal-options')};
  });
  await check('Music switch stops and resumes native garden BGM independently of reminders',async({p})=>{
    const playing=()=>[...qaIdle.active].some(a=>a.loop&&!a.paused&&a.volume>0&&a.currentSrc.endsWith('/garden-piano.mp3'));
    await reward(p);await action(p,'choose-water');await poll(p,()=>document.querySelector('.reward-view')?.dataset.choice==='false');await action(p,'garden');await p.clock.fastForward(2500);await poll(p,playing);await action(p,'audio-settings');await action(p,'toggle-music');await action(p,'close');await p.clock.fastForward(500);assert.equal(await p.evaluate(playing),false,'Muted BGM is stopped');
    await action(p,'audio-settings');await action(p,'toggle-reminders');await action(p,'toggle-music');await action(p,'close');await p.clock.fastForward(500);await poll(p,playing);assert.equal(await p.evaluate(k=>JSON.parse(localStorage.getItem(k)).audioControls.reminders,PREFS),false,'Re-enabling music preserves muted reminders');return {nativeBGMStopped:true,nativeBGMResumed:true,remindersRemainOff:true};
  });
  await check('Synthetic recording and controlled recognition suppress all idle reminders',async({p})=>{
    await review(p);await action(p,'record');await poll(p,()=>!!document.querySelector('.recording-indicator'));await noHand(p,'Recording has no hand');await delay(1500);await action(p,'record');await poll(p,()=>!!qaIdle.finishASR);const before=(await voices(p)).length;await p.clock.fastForward(120000);await noHand(p,'Pending recognition has no hand');assert.equal(await p.locator('[data-status="assessing"]').count(),1);assert.equal((await voices(p)).length,before,'Pending recognition has no reminder');
    await p.evaluate(()=>qaIdle.finishASR());await poll(p,()=>document.querySelector('[data-assessment]')?.dataset.status==='retry');await p.clock.fastForward(2500);await ended(p,'/garden-speech-retry.mp3');const records=await p.evaluate(()=>qaIdle.records);assert(records.length===1&&records[0].started&&records[0].stopped&&records[0].bytes>0);return {records,controlledASR:true};
  },{mic:true});
})().catch(e=>{console.error(e);process.exitCode=1;report.fatal=e.stack;}).finally(async()=>{await browser?.close();save();});
