// Real Edge + built static app integration. Every case gets an empty disposable
// browser context; no user profile, microphone, recording, or paid service is used.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'C:/Users/Jam/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const origin=new URL(process.env.TEST_URL||'http://127.0.0.1:24756').origin;
if(!['127.0.0.1','localhost','[::1]'].includes(new URL(origin).hostname))throw new Error('Practice integration needs an isolated loopback server.');
const out=path.resolve(process.env.XIAOYA_PRACTICE_TEST_OUT||path.join(__dirname,'../test-results/xiaoya-v09-practice'));
const filter=process.env.XIAOYA_TEST_FILTER?new RegExp(process.env.XIAOYA_TEST_FILTER):null;
const A='xiaoya-english:garden:v1',B='xiaoya-english:meadow:v1',STATE='xiaoya-english:state:v1',PLAN='xiaoya-english:practice-plan:v1';
// Stable v0.6 IDs, independent of the current phrase-first catalogue order.
const ORIGINAL_IDS=['hello-morning','hello-welcome','hello-goodbye','food-water','food-more','food-no-thanks','play-box','play-ball','play-bridge','care-hands','care-zip','care-socks','outside-cat','outside-bird','outside-dog','bed-book','bed-story','bed-night'];
const results=[];let browser;

async function fixture({width=390,height=844,query='',now='2026-10-18T12:00:00+08:00'}={}){
  const c=await browser.newContext({viewport:{width,height},timezoneId:'Asia/Shanghai',serviceWorkers:'block',isMobile:true,hasTouch:true,reducedMotion:'reduce'});
  const requests=[],errors=[];
  c.on('request',r=>requests.push({url:r.url(),method:r.method()}));
  c.on('page',page=>page.on('pageerror',error=>errors.push(error.message)));
  await c.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort('blockedbyclient'));
  // These cases exercise parent evidence and listen-only routes, not recognition.
  await c.route(/\/(?:xiaoya\/speech\/|speech\/(?:vosk-|model-))/,r=>r.abort('failed'));
  await c.addInitScript(({origin,now})=>{
    if(location.origin!==origin)return;
    const NativeDate=Date,clockKey='qa:practice-clock';
    window.qa={errors:[],audios:[],plays:[],frames:[]};
    const initial=localStorage.getItem(clockKey)||now;
    qa.now=NativeDate.parse(initial);
    qa.setTime=value=>{qa.now=NativeDate.parse(value);localStorage.setItem(clockKey,value);};
    window.Date=class extends NativeDate{constructor(...args){super(...(args.length?args:[qa.now]));}static now(){return qa.now;}};
    window.addEventListener('error',e=>{if(e.message)qa.errors.push(e.message);});
    window.addEventListener('unhandledrejection',e=>qa.errors.push(String(e.reason)));
    const NativeAudio=Audio;
    window.Audio=function(...args){
      const audio=new NativeAudio(...args),entry={url:String(args[0]||''),ended:false,error:false};
      audio.playbackRate=3;qa.audios.push(entry);
      audio.addEventListener('playing',()=>qa.plays.push({url:entry.url,event:document.querySelector('main[data-event]')?.dataset.event||null}));
      audio.addEventListener('ended',()=>entry.ended=true);audio.addEventListener('error',()=>entry.error=true);return audio;
    };window.Audio.prototype=NativeAudio.prototype;
    new MutationObserver(()=>{
      const e=document.querySelector('main[data-phase="story"] [data-story-frame]');if(!e)return;
      const item={event:e.closest('main').dataset.event,frame:e.dataset.storyFrame},last=qa.frames.at(-1);
      if(!last||last.event!==item.event||last.frame!==item.frame)qa.frames.push(item);
    }).observe(document,{subtree:true,childList:true,attributes:true,attributeFilter:['data-story-frame']});
  },{origin,now});
  const p=await c.newPage();p.setDefaultTimeout(20000);
  try{await p.goto(origin+'/xiaoya/'+query);await p.locator('main.home-view').waitFor();return{c,p,requests,errors};}
  catch(error){await c.close();throw error;}
}
const click=(p,action)=>p.locator(`[data-action="${action}"]`).first().click();
async function unlock(p){
  if(await p.locator('#parent-answer').count()){
    const n=(await p.locator('label[for="parent-answer"]').textContent()).match(/\d+/g).map(Number);
    await p.locator('#parent-answer').fill(String(n[0]+n[1]));await click(p,'gate-submit');
  }
}
async function parent(p){if(!await p.locator('.parent-view').count()){await click(p,'parent');await unlock(p);await p.locator('.parent-view').waitFor();}}
async function reload(p){await p.reload();await p.locator('main.home-view').waitFor();}
async function saved(p,key){return p.evaluate(key=>JSON.parse(localStorage.getItem(key)||'null'),key);}
async function plan(p){return p.evaluate(async({A,B,STATE,PLAN})=>{
  const base=document.querySelector('script[type="module"][src]').src;
  const [m,l]=await Promise.all([import(new URL('practice-plan.js',base)),import(new URL('learning.js',base))]);
  return m.getPracticePlan(JSON.parse(localStorage.getItem(PLAN)||'null')||m.createPracticePlan(),{
    rounds:[...(JSON.parse(localStorage.getItem(A)||'null')?.rounds||[]),...(JSON.parse(localStorage.getItem(B)||'null')?.rounds||[])],
    learningState:JSON.parse(localStorage.getItem(STATE)||'null')||l.createState(),date:l.localDay(),
  });
},{A,B,STATE,PLAN});}
async function seed(p,{a=['food-water'],b=[],legacy=[],date='2026-10-17',allOriginal=false}={}){
  const info=await p.evaluate(async({a,b,legacy,date,allOriginal,originalIds,A,B,STATE})=>{
    const base=document.querySelector('script[type="module"][src]').src;
    const [ga,gb,l,s,c]=await Promise.all(['garden.js','garden-meadow.js','learning.js','stories.js','curriculum.js'].map(file=>import(new URL(file,base))));
    let va=ga.createGarden(),vb=gb.createMeadow(),state=l.createState();
    a.forEach((eventId,i)=>va=ga.rewardRound(va,{roundId:`qa-a-${i}`,eventId,date}));
    b.forEach((eventId,i)=>vb=gb.rewardRound(vb,{roundId:`qa-b-${i}`,eventId,date}));
    if(allOriginal)legacy=originalIds;
    legacy.forEach(id=>state=l.completeEvent(state,id,date));
    if(a.length)localStorage.setItem(A,JSON.stringify(va));if(b.length)localStorage.setItem(B,JSON.stringify(vb));
    if(legacy.length)localStorage.setItem(STATE,JSON.stringify(state));
    return{stories:s.STORIES.map(x=>({id:x.id,lessonId:x.event.lessonId,contexts:x.event.contexts.map(context=>context.id),teachingFrames:x.teachingFrames})),legacy,coreIds:c.CORE_PHRASE_EVENT_IDS};
  },{a,b,legacy,date,allOriginal,originalIds:ORIGINAL_IDS,A,B,STATE});
  await reload(p);return info;
}
async function next(p){await parent(p);await click(p,'next-event');await p.locator('main.event-view').waitFor();}
async function checkup(p,id){
  await parent(p);
  const library=p.locator('.story-library>details');
  if(!await library.evaluate(e=>e.open))await library.locator(':scope>summary').click();
  const target=p.locator(`[data-checkup="${id}"]`),extension=target.locator('xpath=ancestor::details[contains(@class,"extension-phrases")]');
  if(await extension.count()&&!await extension.evaluate(e=>e.open))await extension.locator(':scope>summary').click();
  await target.click();await p.locator('[data-phase="request"]').waitFor();
}
async function observe(p,result='independent'){
  await click(p,'observe');await unlock(p);await p.locator('#observed-help').waitFor();
  await p.locator(`[data-observation="${result}"]`).click();await p.locator('[data-phase="resolved"]').waitFor();
  return(await saved(p,STATE)).evidence.at(-1);
}
async function watch(p){await click(p,'watch');await p.locator('[data-phase="resolved"]').waitFor();}
async function finish(p,{assessment=false}={}){await click(p,'finish');await p.locator(assessment?'.parent-view':'.reward-view').waitFor();}
async function card(p,id){return(await plan(p)).cards.find(x=>x.eventId===id);}
async function layout(p){
  await p.evaluate(async()=>Promise.all(document.getAnimations().filter(a=>Number.isFinite(a.effect?.getTiming().iterations)&&a.playState==='running').map(a=>a.finished.catch(()=>{}))));
  const bounds=await p.evaluate(()=>({width:innerWidth,height:innerHeight,scrollWidth:document.documentElement.scrollWidth,scrollHeight:document.documentElement.scrollHeight}));
  assert(bounds.scrollWidth<=bounds.width+1,`Horizontal overflow: ${JSON.stringify(bounds)}`);
  assert(bounds.scrollHeight<=bounds.height+1,`Child flow needs scrolling: ${JSON.stringify(bounds)}`);
  assert(!/[A-Za-z]/.test(await p.locator('#app').innerText()),'Child view must stay wordless');
  for(const r of await p.locator('button:visible').evaluateAll(es=>es.map(e=>{const r=e.getBoundingClientRect();return{label:e.getAttribute('aria-label'),x:r.x,y:r.y,width:r.width,height:r.height};}))){
    assert(r.width>=47&&r.height>=47,`Small touch target: ${JSON.stringify(r)}`);
    assert(r.x>=-1&&r.y>=-1&&r.x+r.width<=bounds.width+1&&r.y+r.height<=bounds.height+1,`Target outside screen: ${JSON.stringify(r)}`);
  }
}
async function failOneWrite(p,key){await p.evaluate(key=>{
  const native=Storage.prototype.setItem;qa.failedWrites=0;
  Storage.prototype.setItem=function(k,v){if(k===key&&qa.failedWrites===0){qa.failedWrites++;throw new DOMException('QA one-time storage failure','QuotaExceededError');}return native.call(this,k,v);};
},key);}
async function diagnostic(p){return p.evaluate(()=>{
  const read=key=>{const raw=localStorage.getItem(key);try{return JSON.parse(raw);}catch{return raw;}};
  return{version:document.querySelector('meta[name="xiaoya-version"]')?.content,build:document.querySelector('meta[name="xiaoya-build"]')?.content,now:new Date().toISOString(),main:document.querySelector('main')?.outerHTML,storage:Object.fromEntries(Object.keys(localStorage).filter(k=>k.startsWith('xiaoya')).map(k=>[k,read(k)])),qa:{errors:qa.errors,plays:qa.plays,frames:qa.frames,audios:qa.audios}};
}).catch(error=>({error:error.message}));}
async function test(name,fn,options){
  if(filter&&!filter.test(name))return;let f;
  try{
    f=await fixture(options);await fn(f);assert.deepEqual(f.errors,[],'No page JavaScript errors across reloads');assert.deepEqual(await f.p.evaluate(()=>qa.errors),[],'No uncaught errors or promise rejections');
    assert(!f.requests.some(r=>r.method!=='GET'||new URL(r.url).origin!==origin),'No uploads or external requests');
    results.push({name,status:'PASS',diagnostic:await diagnostic(f.p)});console.log('PASS',name);
  }catch(error){
    results.push({name,status:'FAIL',error:error.stack,diagnostic:f?await diagnostic(f.p):null});console.error('FAIL',name,error.message);
    if(f)await f.p.screenshot({animations:'disabled',path:path.join(out,`failed-${results.length}.png`),fullPage:true}).catch(()=>{});
  }finally{await f?.c.close();}
}

async function run(){
  await test('Legacy 18-story completion saves retain every ID, aggregate 16 phrases, and expose the first unseen core phrase',async({p})=>{
    const data=await seed(p,{a:[],allOriginal:true});const before=await saved(p,STATE),schedule=await plan(p);
    assert.equal(schedule.cards.length,16);assert.equal(schedule.unseenIds[0],'hello-everyone');
    assert.deepEqual(Object.keys(before.completions).sort(),[...ORIGINAL_IDS].sort());
    assert(schedule.unseenIds.every(id=>data.coreIds.includes(id)),'Automatic new lessons contain only core phrases');
    assert(!schedule.unseenIds.includes('hello-morning'),'A previously played core phrase is never a new lesson again');
    assert(schedule.unseenIds.includes('food-hungry'),'Different phrases under the same request goal retain separate progress');
    assert(!schedule.unseenIds.includes('food-water'));assert.equal(schedule.next.mode,'review');
    await parent(p);assert.match(await p.locator('.practice-plan').innerText(),/已接触 16 句表达/);
    const entry=p.locator('.practice-plan [data-action="new-event"]');assert(await entry.isVisible());assert.equal(await entry.evaluate(e=>!!e.closest('details')),false);
    await entry.click();await p.locator('[data-phase="story"][data-event="hello-everyone"][data-practice-mode="new"]').waitFor();
    await p.locator('[data-action="story-continue"]:enabled').waitFor({timeout:30000});
    assert.deepEqual([...new Set(await p.evaluate(()=>qa.frames.filter(x=>x.event==='hello-everyone').map(x=>x.frame)))],['1'],'The new phrase uses one focused teaching scene');
    assert.equal(await p.evaluate(lesson=>qa.plays.filter(x=>x.url.endsWith(`/${lesson}.mp3`)).length,data.stories.find(x=>x.id==='hello-everyone').lessonId),1,'One target English phrase is played once');
    assert.deepEqual(await saved(p,STATE),before,'Merely playing a new story never creates mastery evidence');
    assert.equal(await saved(p,PLAN),null,'Watching frames alone is not a completed practice round');
  });
  await test('A plus B plus legacy contacts share due reviews, real completions, and a new story after two reviews',async({p})=>{
    await seed(p,{a:['hello-everyone'],b:['hello-morning'],legacy:['family-love']});
    let schedule=await plan(p);assert.equal(schedule.cards.length,3);assert.equal(schedule.dueIds.length,3);
    await next(p);assert.equal(await p.locator('main').getAttribute('data-event'),'hello-everyone');assert.equal(await p.locator('main').getAttribute('data-practice-mode'),'review');
    await watch(p);await finish(p);let log=await saved(p,PLAN);assert.equal(log.entries.length,1);assert.equal(log.entries[0].mode,'review');assert.equal(log.entries[0].attemptId,null);assert.equal(log.entries[0].rewardVariant,'a');
    assert.equal((await card(p,'hello-everyone')).dueDate,'2026-10-19');assert.equal((await saved(p,STATE)).evidence.length,0);
    await next(p);assert.equal(await p.locator('main').getAttribute('data-event'),'hello-morning');const evidence=await observe(p);assert.equal(evidence.helped,false);
    await finish(p);log=await saved(p,PLAN);assert.equal(log.entries.length,2);assert.equal(log.entries[1].attemptId,evidence.attemptId);
    assert.equal((await card(p,'hello-morning')).dueDate,'2026-10-21');assert.equal((await card(p,'hello-morning')).lastOutcome,'parent-independent');
    schedule=await plan(p);assert.equal(schedule.reviewStreak,2);assert.equal(schedule.dueIds.length,1);assert.equal(schedule.next.mode,'new');
    const newId=schedule.next.eventId;await reload(p);assert.equal((await plan(p)).next.eventId,newId);assert.equal((await plan(p)).next.mode,'new');
    await parent(p);await p.locator('[data-variant="b"]').click();await p.locator('main.home-view').waitFor();assert.equal((await plan(p)).next.eventId,newId);
    await parent(p);await p.screenshot({animations:'disabled',path:path.join(out,'parent-practice-plan-390.png'),fullPage:true});
    await click(p,'next-event');await p.locator(`[data-phase="story"][data-event="${newId}"][data-practice-mode="new"]`).waitFor();
    assert.equal((await saved(p,A)).rounds.length,3);assert.equal((await saved(p,B)).rounds.length,1);
  });
  for(const [width,height] of [[320,568],[390,844]])await test(`Due review starts silently in the familiar request context and fits ${width}px`,async({p})=>{
    const info=await seed(p),story=info.stories.find(x=>x.id==='food-water');await next(p);await p.locator('[data-phase="request"]').waitFor();
    assert.equal(await p.locator('main').getAttribute('data-event'),'food-water');assert.equal(await p.locator('main').getAttribute('data-context'),story.contexts[0]);
    await p.waitForTimeout(1200);assert.equal(await p.locator('[data-action="story-continue"]').count(),0);
    assert.equal(await p.evaluate(lesson=>qa.plays.filter(x=>x.url.endsWith(`/${lesson}.mp3`)).length,story.lessonId),0,'No automatic English answer during recall');
    assert.equal(await p.locator('[data-action="sample"]').count(),1);await layout(p);
    await p.screenshot({animations:'disabled',path:path.join(out,`due-request-${width}.png`),fullPage:true});
    await click(p,'sample');await p.waitForFunction(lesson=>qa.audios.some(x=>x.url.endsWith(`/${lesson}.mp3`)&&x.ended),story.lessonId);
    const evidence=await observe(p);assert.equal(evidence.helped,true);assert.equal(evidence.result,'supported');await finish(p);
    assert.equal((await card(p,'food-water')).intervalDays,1);assert.equal((await card(p,'food-water')).lastOutcome,'supported');await layout(p);
  },{width,height});
  await test('Parent assessment without a garden reward persists, repeated same-day checks cannot skip intervals',async({p})=>{
    const info=await seed(p),story=info.stories.find(x=>x.id==='food-water');const originalGarden=await saved(p,A);await checkup(p,'food-water');
    assert.equal(await p.locator('main').getAttribute('data-context'),story.contexts[0],'No independent evidence means the first checkup remains familiar');
    const e1=await observe(p);await finish(p,{assessment:true});let log=await saved(p,PLAN);assert.equal(log.entries[0].attemptId,e1.attemptId);assert.equal(log.entries[0].mode,'review');assert.equal(log.entries[0].rewardVariant,null);assert.deepEqual(await saved(p,A),originalGarden);
    assert.equal((await card(p,'food-water')).stage,1);assert.equal((await card(p,'food-water')).dueDate,'2026-10-21');
    await checkup(p,'food-water');assert.equal(await p.locator('main').getAttribute('data-context'),story.contexts[1],'A parent can request a changed context after confirmed independence');await observe(p);await finish(p,{assessment:true});assert.equal((await saved(p,PLAN)).entries.length,2);
    let c=await card(p,'food-water');assert.equal(c.stage,1);assert.equal(c.completedDays,2);assert.equal(c.playCount,3);assert.equal(c.dueDate,'2026-10-21');
    await reload(p);c=await card(p,'food-water');assert.equal(c.stage,1);assert.equal(c.practicedToday,true);assert.equal(c.due,false);
    assert((await saved(p,PLAN)).entries.every(entry=>entry.rewardVariant===null));assert.deepEqual(await saved(p,A),originalGarden,'Assessment logs never acquire garden rewards during restoration');assert.equal(await saved(p,B),null);
    await p.evaluate(()=>qa.setTime('2026-10-21T00:01:00+08:00'));await reload(p);assert.equal((await card(p,'food-water')).due,true);assert.equal((await plan(p)).next.mode,'review');
    await next(p);assert.equal(await p.locator('main').getAttribute('data-context'),story.contexts[0],'Normal review returns to the familiar picture even after transfer checkups');const e3=await observe(p);await finish(p);c=await card(p,'food-water');assert.equal(c.stage,2);assert.equal(c.dueDate,'2026-10-28');assert.equal((await saved(p,PLAN)).entries.at(-1).attemptId,e3.attemptId);
  });
  await test('One phrase across A and B scenes keeps its first familiar scene, raw IDs, and one same-day review interval',async({p})=>{
    const info=await seed(p,{a:['care-zip'],b:['play-box']}),familiar=info.stories.find(x=>x.id==='care-zip'),other=info.stories.find(x=>x.id==='play-box');
    const originalA=await saved(p,A),originalB=await saved(p,B);
    let schedule=await plan(p),c=schedule.cards[0];
    assert.equal(schedule.cards.length,1);assert.equal(c.phraseId,'needs-08');assert.equal(c.eventId,'care-zip');assert.equal(c.completedDays,1);assert.equal(c.playCount,2);
    assert.deepEqual(schedule.dueIds,['care-zip']);assert.equal(schedule.unseenIds[0],'hello-everyone');
    assert(!['care-zip','play-box','play-bridge'].some(id=>schedule.unseenIds.includes(id)),'Alternate extension scenes do not become extra new lessons');
    await next(p);assert.equal(await p.locator('main').getAttribute('data-event'),'care-zip');assert.equal(await p.locator('main').getAttribute('data-context'),familiar.contexts[0]);
    const first=await observe(p);await finish(p);c=await card(p,'care-zip');assert.equal(c.stage,1);assert.equal(c.dueDate,'2026-10-21');
    await checkup(p,'play-box');assert.equal(await p.locator('main').getAttribute('data-context'),other.contexts[0],'Parent checkup may use another setting after independent speech');
    const second=await observe(p);await finish(p,{assessment:true});
    schedule=await plan(p);c=schedule.cards[0];assert.equal(schedule.cards.length,1);assert.equal(c.eventId,'care-zip');assert.equal(c.stage,1);assert.equal(c.completedDays,2);assert.equal(c.playCount,4);assert.equal(c.dueDate,'2026-10-21');assert.equal(schedule.reviewStreak,1);
    const log=await saved(p,PLAN);assert.deepEqual(log.entries.map(x=>x.eventId),['care-zip','play-box']);assert.deepEqual(log.entries.map(x=>x.attemptId),[first.attemptId,second.attemptId]);assert.deepEqual(log.entries.map(x=>x.rewardVariant),['a',null]);
    const afterA=await saved(p,A);assert.deepEqual(afterA.rounds[0],originalA.rounds[0]);assert.equal(afterA.rounds.length,2);assert.equal(afterA.rounds[1].eventId,'care-zip');assert.equal(afterA.rounds[1].roundId,log.entries[0].roundId);assert.deepEqual(await saved(p,B),originalB);
    assert.equal(await p.locator('.story-library [data-phrase="needs-08"]').count(),1,'Parent library shows one phrase, not three scene cards');
    await p.evaluate(()=>qa.setTime('2026-10-21T00:01:00+08:00'));await reload(p);schedule=await plan(p);assert.deepEqual(schedule.dueIds,['care-zip']);
    await next(p);assert.equal(await p.locator('main').getAttribute('data-event'),'care-zip');assert.equal(await p.locator('main').getAttribute('data-context'),familiar.contexts[0],'Cross-day review must not switch to the canonical or most recent scene');
    assert.deepEqual(await saved(p,PLAN),log);assert.deepEqual(await saved(p,B),originalB);
    await p.screenshot({animations:'disabled',path:path.join(out,'same-phrase-familiar-review.png'),fullPage:true});
  });
  for(const failedKey of [PLAN,A])await test(`A failed ${failedKey===PLAN?'practice log':'garden reward'} write retries one frozen round with its original evidence`,async({p})=>{
    await seed(p);await next(p);const evidence=await observe(p);await failOneWrite(p,failedKey);await click(p,'finish');await p.getByRole('heading',{name:'这一步还没保存'}).waitFor();
    assert.equal(await p.evaluate(()=>qa.failedWrites),1);const partial=await saved(p,PLAN);assert.equal(partial?.entries.length||0,failedKey===A?1:0);
    await click(p,'close');await finish(p);const log=await saved(p,PLAN);assert.equal(log.entries.length,1);assert.equal(log.entries[0].attemptId,evidence.attemptId);
    const garden=await saved(p,A);assert.equal(garden.rounds.length,2);assert.equal(garden.rounds.at(-1).roundId,log.entries[0].roundId);
    assert.equal(garden.rounds.at(-1).date,log.entries[0].date);assert.equal((await card(p,'food-water')).lastOutcome,'parent-independent');
    await reload(p);assert.equal((await card(p,'food-water')).dueDate,'2026-10-21');
  });
  await test('Cross-midnight observation and reward use one local evidence date, including a failed-save retry',async({p})=>{
    await seed(p);await next(p);const evidence=await observe(p);assert.equal(evidence.date,'2026-10-18');
    await p.evaluate(()=>qa.setTime('2026-10-19T00:00:02+08:00'));await failOneWrite(p,A);await click(p,'finish');await p.getByRole('heading',{name:'这一步还没保存'}).waitFor();
    await p.evaluate(()=>qa.setTime('2026-10-19T00:02:00+08:00'));await click(p,'close');await finish(p);
    const log=await saved(p,PLAN),garden=await saved(p,A);assert.equal(log.entries.length,1);assert.equal(log.entries[0].date,'2026-10-18');assert.equal(log.entries[0].attemptId,evidence.attemptId);assert.equal(garden.rounds.at(-1).date,'2026-10-18');
    await reload(p);const c=await card(p,'food-water');assert.equal(c.dueDate,'2026-10-21');assert.equal(c.lastOutcome,'parent-independent');assert.equal((await plan(p)).date,'2026-10-19');
  },{now:'2026-10-18T23:59:58+08:00'});
  await test('A visibility pause after a parent observation preserves its completed evidence until finish',async({p})=>{
    await seed(p);await next(p);const evidence=await observe(p);
    // Exercise the actual browser lifecycle handler deterministically, without
    // depending on a headless browser's OS focus/background-tab heuristics.
    await p.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));Object.defineProperty(document,'hidden',{configurable:true,value:false});document.dispatchEvent(new Event('visibilitychange'));});
    await finish(p);assert.equal((await saved(p,PLAN)).entries[0].attemptId,evidence.attemptId,'Final parent evidence survives a pause');
    assert.equal((await card(p,'food-water')).lastOutcome,'parent-independent');
  });
  for(const switchGarden of [false,true])await test(`${switchGarden?'Switching to B':'Leaving'} after tapping finish while the practice lock is queued keeps the committed round reward in A`,async({p})=>{
    await seed(p);await next(p);await watch(p);
    await p.evaluate(key=>{navigator.locks.request(key,()=>new Promise(resolve=>{qa.releasePracticeLock=resolve;}));},PLAN);
    await p.waitForFunction(()=>typeof qa.releasePracticeLock==='function');
    try{
      await click(p,'finish');await click(p,'home');await p.locator('main.home-view').waitFor();
      if(switchGarden){await parent(p);await p.locator('[data-variant="b"]').click();await p.locator('main.home-view').waitFor();}
    }
    finally{await p.evaluate(()=>qa.releasePracticeLock());}
    await p.waitForFunction(key=>JSON.parse(localStorage.getItem(key)||'null')?.entries.length===1,PLAN);
    await p.waitForFunction(key=>JSON.parse(localStorage.getItem(key)||'null')?.rounds.length===2,A,{timeout:5000});
    const log=await saved(p,PLAN),garden=await saved(p,A);assert.equal(log.entries[0].rewardVariant,'a');assert.equal(garden.rounds.at(-1).roundId,log.entries[0].roundId);
    assert.equal((await saved(p,B))?.rounds.length||0,0,'Late credit belongs to the original garden, not the newly selected one');
    if(switchGarden)assert.equal(await p.evaluate(()=>localStorage.getItem('xiaoya-english:garden-variant:v1')),'b');
    assert.equal(await p.locator('main.home-view').count(),1,'Late completion must not navigate a child away from the page they chose');
  });
  for(const switchGarden of [false,true])await test(`Reload restores a committed A reward ${switchGarden?'while opening garden B':'in the original garden'} exactly once`,async({p})=>{
    await seed(p);await next(p);const evidence=await observe(p);
    await failOneWrite(p,A);await click(p,'finish');await p.getByRole('heading',{name:'这一步还没保存'}).waitFor();
    const log=await saved(p,PLAN),entry=log.entries[0];assert.equal(log.entries.length,1);assert.equal(entry.rewardVariant,'a');assert.equal(entry.attemptId,evidence.attemptId);assert.equal((await saved(p,A)).rounds.length,1);
    if(switchGarden)await p.evaluate(()=>localStorage.setItem('xiaoya-english:garden-variant:v1','b'));
    await reload(p);
    await p.waitForFunction(key=>JSON.parse(localStorage.getItem(key)||'null')?.rounds.length===2,A,{timeout:5000});
    const restored=await saved(p,A);assert.deepEqual(restored.rounds.at(-1),{roundId:entry.roundId,eventId:entry.eventId,date:entry.date});assert.deepEqual(await saved(p,PLAN),log);
    assert.equal((await saved(p,B))?.rounds.length||0,0,'Restoration credits only the original reward destination');
    if(switchGarden){await parent(p);assert.equal(await p.locator('[data-variant="b"]').getAttribute('aria-pressed'),'true');}
    await reload(p);await parent(p);
    assert.deepEqual(await saved(p,A),restored,'Repeated startup never duplicates shells, water or participation');assert.deepEqual(await saved(p,PLAN),log);assert.equal((await saved(p,B))?.rounds.length||0,0);
    assert.equal((await card(p,'food-water')).dueDate,'2026-10-21');
  });
  await test('Legacy five-field practice records resume learning without inventing a missing garden reward',async({p})=>{
    const old=await p.evaluate(async key=>{
      const base=document.querySelector('script[type="module"][src]').src,m=await import(new URL('practice-plan.js',base));
      const log=m.recordPractice(m.createPracticePlan(),{roundId:'qa-legacy-five',eventId:'food-water',date:'2026-10-17',attemptId:null,mode:'new'});
      delete log.entries[0].rewardVariant;localStorage.setItem(key,JSON.stringify(log));return log;
    },PLAN);
    for(let i=0;i<2;i++){
      await reload(p);await parent(p);const schedule=await plan(p);
      assert.equal(schedule.cards.length,1);assert.equal(schedule.cards[0].eventId,'food-water');assert.equal(schedule.unseenIds[0],'hello-everyone');
      assert.deepEqual(await saved(p,PLAN),old);assert.equal(await saved(p,A),null);assert.equal(await saved(p,B),null);
    }
  });
  await test('Recovery continues to B when another page already credited A before the queued garden lock opens',async({c,p})=>{
    const lockUrl=origin+'/__qa_practice_lock';
    await c.route(lockUrl,route=>route.fulfill({status:200,contentType:'text/html',body:'<!doctype html><html><body>Isolated lock owner</body></html>'}));
    const other=await c.newPage();await other.goto(lockUrl);
    await other.evaluate(key=>{navigator.locks.request(key,()=>new Promise(resolve=>{qa.releaseGardenLock=resolve;}));},A);
    await other.waitForFunction(()=>typeof qa.releaseGardenLock==='function');
    try{
      const intended=await p.evaluate(async key=>{
        const base=document.querySelector('script[type="module"][src]').src;
        const [m,ga]=await Promise.all(['practice-plan.js','garden.js'].map(file=>import(new URL(file,base))));
        const a={roundId:'qa-pending-a',eventId:'food-water',date:'2026-10-18'},b={roundId:'qa-pending-b',eventId:'play-box',date:'2026-10-18'};
        let log=m.recordPractice(m.createPracticePlan(),{...a,mode:'new',rewardVariant:'a'});log=m.recordPractice(log,{...b,mode:'new',rewardVariant:'b'});
        localStorage.setItem(key,JSON.stringify(log));return{log,a:ga.rewardRound(ga.createGarden(),a),b};
      },PLAN);
      await reload(p);
      await p.waitForFunction(async key=>(await navigator.locks.query()).pending.some(lock=>lock.name===key),A);
      // This page has no app script, so only the main page can restore B.
      // Writing A while its lock is held also emits a real storage event to
      // the main page while its recovery is already waiting in that lock.
      await other.evaluate(({key,value})=>localStorage.setItem(key,JSON.stringify(value)),{key:A,value:intended.a});
      await other.evaluate(()=>qa.releaseGardenLock());
      await p.waitForFunction(key=>JSON.parse(localStorage.getItem(key)||'null')?.rounds.length===1,B,{timeout:5000});
      assert.deepEqual(await saved(p,A),intended.a);assert.deepEqual((await saved(p,B)).rounds,[intended.b]);assert.deepEqual(await saved(p,PLAN),intended.log);
      const beforeB=await saved(p,B);await reload(p);await parent(p);assert.deepEqual(await saved(p,A),intended.a);assert.deepEqual(await saved(p,B),beforeB);
    }finally{await other.evaluate(()=>qa.releaseGardenLock?.()).catch(()=>{});await other.close();}
  });
}

(async()=>{
  fs.mkdirSync(out,{recursive:true});browser=await chromium.launch({channel:'msedge',headless:true,args:['--autoplay-policy=no-user-gesture-required']});
  await run();await browser.close();browser=null;
  if(!results.length)throw new Error('No integration cases matched the filter.');
  fs.writeFileSync(path.join(out,filter?'results-filtered.json':'results.json'),JSON.stringify(results,null,2));
  console.log(`${results.filter(x=>x.status==='PASS').length}/${results.length} practice integration cases passed`);if(results.some(x=>x.status!=='PASS'))process.exitCode=1;
})().catch(async error=>{console.error(error);if(browser)await browser.close();process.exitCode=1;});
