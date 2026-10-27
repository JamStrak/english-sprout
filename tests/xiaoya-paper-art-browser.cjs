// Isolated native Edge image, audio and service-worker checks. Only the 404
// cases inject network failures; due-review fixtures contain synthetic records.
// Native Audio runs at 4x. No real profile, microphone, recognition or upload.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'C:/Users/Jam/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const origin=new URL(process.env.TEST_URL||'http://127.0.0.1:24756').origin;
if(!['127.0.0.1','localhost','[::1]'].includes(new URL(origin).hostname))throw Error('Paper art checks require a loopback server.');
const out=path.resolve(process.env.XIAOYA_PAPER_TEST_OUT||path.join(__dirname,'../test-results/xiaoya-v11-paper-art'));
const gardenOnly=process.env.XIAOYA_PAPER_GARDEN==='1';
const filter=gardenOnly?/^GARDEN/:process.env.XIAOYA_TEST_FILTER?new RegExp(process.env.XIAOYA_TEST_FILTER):null;
const CORE=['hello-everyone','hello-morning','family-love','hello-thanks','hello-youre-welcome','hello-sorry','hello-okay','hello-goodbye','bed-night','hello-welcome','hello-excuse','outside-go-home','outside-ready','family-come','food-eat','food-hungry','feelings-happy','feelings-tired','play-turn','play-your-turn','play-can-do','play-did-it','play-good-job','play-again'];
const LEGACY_FILES={'family-love':'love-paper-v1.webp','hello-thanks':'thanks-paper-v1.webp','outside-go-home':'home-paper-v1.webp'};
const REVISED_FILES={'hello-youre-welcome':'hello-youre-welcome-paper-v2.webp'};
const ART=CORE.map(id=>[id,REVISED_FILES[id]||LEGACY_FILES[id]||`${id}-paper-v1.webp`]);
const FOCUS=['hello-sorry','hello-okay','play-again','hello-youre-welcome'];
const FAULT_ART=ART.filter(([id])=>id in LEGACY_FILES||FOCUS.includes(id));
const OFFLINE_ART=ART.filter(([id])=>id in LEGACY_FILES||id==='play-again'||id==='hello-youre-welcome');
const PLAN='xiaoya-english:practice-plan:v1';
const MEADOW='xiaoya-english:meadow:v1',GARDEN_FILE='garden-paper-v1.webp';
const report={origin,nativeImageDecode:true,nativeServiceWorker:true,nativeAudio:true,playbackRate:4,microphoneUsed:false,asrAccuracyTested:false,faultInjection:'404 cases only; isolated synthetic due-review saves',coverage:{coreImages:24,viewports:[390,768],newAndFamiliarReview:true,missingPictures:FAULT_ART.map(([id])=>id),offlinePictures:OFFLINE_ART.map(([id])=>id)},checks:[]};
let browser;
const tap=(p,action)=>p.locator(`[data-action="${action}"]`).first().tap();
const save=()=>fs.writeFileSync(path.join(out,gardenOnly?'results-garden.json':filter?'results-filtered.json':'results.json'),JSON.stringify(report,null,2));

async function fixture({story='family-love',width=390,height=844,offline=false,missing=false,holdFailure=false,review=false,garden=false}={}){
  const c=await browser.newContext({viewport:{width,height},timezoneId:'Asia/Shanghai',serviceWorkers:offline?'allow':'block',isMobile:true,hasTouch:true,reducedMotion:'reduce'});
  const requests=[],responses=[],errors=[];let releaseFailure;
  const gate=holdFailure?new Promise(resolve=>{releaseFailure=resolve;}):Promise.resolve();
  c.on('request',r=>requests.push({url:r.url(),method:r.method()}));
  c.on('response',r=>responses.push({url:r.url(),status:r.status(),worker:r.fromServiceWorker()}));
  c.on('page',p=>p.on('pageerror',e=>errors.push(e.message)));
  const file=garden?GARDEN_FILE:ART.find(([id])=>id===story)?.[1];
  await c.route('**/*',async route=>{
    const url=new URL(route.request().url());
    if(url.origin!==origin)return route.abort('blockedbyclient');
    if(missing&&url.pathname.endsWith(`/stories/${file}`)){await gate;return route.fulfill({status:404,contentType:'text/plain',body:'QA: deliberately unavailable image'});}
    return route.continue();
  });
  await c.addInitScript(({origin,story,review,PLAN})=>{
    if(location.origin!==origin)return;
    const NativeDate=Date,now=NativeDate.parse('2026-10-18T12:00:00+08:00');
    window.Date=class extends NativeDate{constructor(...args){super(...(args.length?args:[now]));}static now(){return now;}};
    if(review&&!sessionStorage.getItem('qa-paper-seeded')){
      localStorage.setItem(PLAN,JSON.stringify({schemaVersion:1,product:'xiaoya-english-practice-plan',entries:[{roundId:'qa-paper-review',eventId:story,date:'2026-10-17',attemptId:null,mode:'new',rewardVariant:null}]}));
      sessionStorage.setItem('qa-paper-seeded','yes');
    }
    const q=window.qaPaper={errors:[],audios:[],frames:[],readyAt:null,microphoneCalls:0,renders:0};
    window.addEventListener('error',e=>{if(e.message)q.errors.push(e.message);});
    window.addEventListener('unhandledrejection',e=>q.errors.push(String(e.reason)));
    const NativeAudio=Audio;
    window.Audio=function(...args){
      const a=new NativeAudio(...args),entry={url:String(args[0]||''),ended:false,error:false};a.playbackRate=4;q.audios.push(entry);
      a.addEventListener('playing',()=>entry.playedAt=performance.now());a.addEventListener('ended',()=>{entry.ended=true;entry.endedAt=performance.now();});a.addEventListener('error',()=>entry.error=true);return a;
    };window.Audio.prototype=NativeAudio.prototype;
    if(navigator.mediaDevices?.getUserMedia){const gum=navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);navigator.mediaDevices.getUserMedia=(...args)=>{q.microphoneCalls++;return gum(...args);};}
    new MutationObserver(records=>{
      q.renders+=records.filter(r=>r.type==='childList'&&r.target.id==='app').length;
      const main=document.querySelector('main[data-phase="story"]'),e=main?.querySelector('[data-story-frame]');
      if(!e)return;
      const svg=e.querySelector('svg'),body=svg?.innerHTML||'',fingerprint=Array.from(body).reduce((n,c)=>(Math.imul(n,31)+c.charCodeAt(0))|0,0);
      const item={event:main.dataset.event,frame:Number(e.dataset.storyFrame),kind:e.classList.contains('vector-picture')?'vector':'paper',cues:[...e.querySelectorAll('[data-cue]')].map(e=>e.dataset.cue),svgFingerprint:body?fingerprint:null,at:performance.now()},last=q.frames[q.frames.length-1];
      if(!last||last.event!==item.event||last.frame!==item.frame||last.kind!==item.kind)q.frames.push(item);
      if(q.readyAt===null&&document.querySelector('[data-action="story-continue"]:enabled'))q.readyAt=performance.now();
    }).observe(document,{subtree:true,childList:true});
  },{origin,story,review,PLAN});
  const p=await c.newPage();p.setDefaultTimeout(20000);
  try{
    await p.goto(`${origin}/xiaoya/?story=${story}${garden?'&garden=b':''}`,{waitUntil:'domcontentloaded'});await p.locator('main.home-view').waitFor();
    const version=await p.locator('meta[name="xiaoya-version"]').getAttribute('content'),build=await p.locator('meta[name="xiaoya-build"]').getAttribute('content');
    assert.equal(version,'0.11.0');if(report.build)assert.equal(build,report.build,'Build changed during suite');else{report.version=version;report.build=build;}
    return{c,p,requests,responses,errors,releaseFailure,story,file};
  }catch(error){releaseFailure?.();await c.close();throw error;}
}

async function storyMeta(p,id){return p.evaluate(async id=>{
  const base=document.querySelector('script[type="module"][src]').src,{storyFor}=await import(new URL('stories.js',base));
  const s=storyFor(id);return{id:s.id,file:s.image,layout:s.imageLayout,lessonId:s.event.lessonId,cueFrame:s.cueFrame,teachingFrames:s.teachingFrames,introFrame:s.introFrame??null,context:s.event.contexts[0].id,url:new URL(`xiaoya/stories/${s.image}`,document.baseURI).href};
},id);}
async function decode(p,url){return p.evaluate(async url=>{const image=new Image();image.src=url;await image.decode();return{width:image.naturalWidth,height:image.naturalHeight,complete:image.complete,url:image.currentSrc};},url);}
function nativePicture(native,id){const expected=id in LEGACY_FILES?[1400,1000]:[980,700];assert.deepEqual([native.width,native.height],expected,'Decoded bytes must have the original full-picture dimensions');assert(native.complete);}
async function pictureState(p,id){return p.locator(`[data-picture-id="${id}"]`).evaluate(e=>{
  const s=getComputedStyle(e),rect=e.getBoundingClientRect();return{width:parseFloat(s.width),height:parseFloat(s.height),backgroundSize:s.backgroundSize,backgroundPosition:s.backgroundPosition,backgroundImage:s.backgroundImage,transform:s.transform,single:e.classList.contains('single-picture'),frame:Number(e.dataset.storyFrame),bounds:{x:rect.x,y:rect.y,width:rect.width,height:rect.height}};
});}
function wholePicture(actual,url){
  assert(actual.single,'Single-image layout marker is required');assert.equal(actual.backgroundSize,'contain','A single picture must remain fully visible without cropping or sprite zoom');
  assert.equal(actual.backgroundPosition,'50% 50%');assert(actual.backgroundImage.includes(url));assert.equal(actual.transform,'none');
  const ratio=actual.width/actual.height;assert(Math.abs(ratio-1.4)<0.025,`Picture viewport must show approximately 7:5, received ${ratio}`);
  return{...actual,ratio,croppedFraction:0};
}
async function welcomingHome(p,requests=[]){
  assert.equal(await p.locator('.home-welcome .home-companion [data-paper-art="buddy-welcome"]').count(),1,'Home keeps the same welcoming 小芽 rather than showing a lesson answer');
  assert.equal(await p.locator('.home-welcome [data-primary]').count(),1,'Home has one primary action');
  assert.equal(await p.locator('.home-welcome [data-picture-id],.home-welcome .story-picture').count(),0,'A story picture appears only after lesson entry');
  assert(!requests.some(r=>/\/stories\/.+\.webp(?:\?|$)/.test(r.url)),'Fresh home must not request story or meadow images');
  return{fixedBuddy:true,primaryActions:1,pictureRequests:0,...await layout(p)};
}
async function layout(p){
  const state=await p.evaluate(()=>({width:innerWidth,height:innerHeight,scrollWidth:document.documentElement.scrollWidth,scrollHeight:document.documentElement.scrollHeight,text:document.getElementById('app').innerText}));
  assert(state.scrollWidth<=state.width+1,'No horizontal page overflow');assert(state.scrollHeight<=state.height+1,'Child flow fits viewport');assert(!/[A-Za-z]/.test(state.text),'No child-visible English lettering');
  return state;
}
async function ready(p,id){await tap(p,'next-event');await p.locator(`[data-event="${id}"][data-phase="story"]`).waitFor();await p.locator('[data-action="story-continue"]:enabled').waitFor({timeout:35000});}
async function ended(p,lesson,count){await p.waitForFunction(({lesson,count})=>qaPaper.audios.filter(a=>a.url.endsWith(`/${lesson}.mp3`)&&a.ended).length>=count,{lesson,count},{timeout:30000});}
function onlyCurrentPicture(requests,file){
  const urls=[...new Set(requests.map(r=>r.url).filter(url=>/\/stories\/.+\.webp(?:\?|$)/.test(url)))];
  assert.deepEqual(urls.map(url=>new URL(url).pathname.split('/').pop()),[file],'Only the current story picture may be requested');return urls;
}
async function teachingTrace(p,meta,{fallback=false}={}){
  const trace=await p.evaluate(()=>({frames:qaPaper.frames,readyAt:qaPaper.readyAt,audios:qaPaper.audios}));
  const frames=trace.frames.filter(f=>f.event===meta.id),distinct=frames.filter((f,i)=>i===0||f.frame!==frames[i-1].frame).map(f=>f.frame);
  const expected=meta.id==='play-again'?[0,meta.cueFrame]:[meta.cueFrame];
  assert.deepEqual(meta.teachingFrames,expected);assert.deepEqual(distinct,expected,'Teaching never repeats the same paper image as multiple story beats');
  const final=frames[frames.length-1];assert.equal(final.kind,fallback?'vector':'paper');
  if(meta.id==='play-again'){
    assert.equal(meta.introFrame,0);assert.equal(frames[0].kind,'vector');assert(frames[0].cues.includes('fallen-blocks'),'Retry starts from the fallen tower');
    if(fallback)assert.notEqual(final.svgFingerprint,frames[0].svgFingerprint,'Missing paper art must retain a visibly different retry action, not two copies of fallen blocks');
  }
  const english=trace.audios.filter(a=>a.url.endsWith(`/${meta.lessonId}.mp3`));assert.equal(english.length,1);assert(english[0].ended&&!english[0].error);
  assert(trace.readyAt>=english[0].endedAt,'Speaking becomes ready only after the phrase finishes');
  const readyDelay=trace.readyAt-english[0].endedAt;assert(readyDelay<250,`Speaking should be ready immediately after the real audio ended (${readyDelay} ms)`);
  assert.equal(await p.locator('[data-action="story-continue"]:enabled').getAttribute('aria-label'),'轮到我说啦');
  assert.equal(await p.locator('.story-progress').count(),expected.length===2?1:0);
  return{...trace,readyDelay};
}
async function familiarReview(p,meta){
  await p.evaluate(async({key,id})=>{const m=await import(new URL('practice-plan.js',document.querySelector('script[type="module"][src]').src));localStorage.setItem(key,JSON.stringify(m.recordPractice(m.createPracticePlan(),{roundId:'qa-paper-review',eventId:id,date:'2026-10-17',mode:'new',rewardVariant:null})));},{key:PLAN,id:meta.id});
  await p.reload({waitUntil:'domcontentloaded'});await p.locator('main.home-view').waitFor();await tap(p,'next-event');await p.locator(`[data-event="${meta.id}"][data-phase="request"][data-practice-mode="review"]`).waitFor();
  await p.waitForTimeout(600);assert.deepEqual(await p.evaluate(()=>qaPaper.audios),[],'Familiar review must not automatically reveal the spoken answer');assert.deepEqual(await p.evaluate(()=>qaPaper.frames),[],'Review skips the teaching sequence');
  assert.equal(await p.locator('main').getAttribute('data-context'),meta.context);const cue=wholePicture(await pictureState(p,meta.id),meta.url);assert.equal(cue.frame,meta.cueFrame);
  await tap(p,'sample');await ended(p,meta.lessonId,1);const replay=wholePicture(await pictureState(p,meta.id),meta.url);assert.equal(replay.backgroundImage,cue.backgroundImage);assert.equal(replay.frame,meta.cueFrame);assert.deepEqual(await p.evaluate(()=>qaPaper.frames),[]);await layout(p);
  return{cue,replay,audios:await p.evaluate(()=>qaPaper.audios)};
}
async function seedGarden(p,{rounds=2,plants=0,pending=true}={}){
  const state=await p.evaluate(async({key,rounds,plants,pending})=>{
    const m=await import(new URL('garden-meadow.js',document.querySelector('script[type="module"][src]').src));let s=m.createMeadow();
    for(let i=0;i<rounds;i++){
      s=m.rewardRound(s,{roundId:`qa-paper-garden-${i}`,eventId:'family-love',date:'2026-10-18'});
      if(i<plants){s=m.plantSeed(m.openSeedPack(s),{x:.2,y:.85-i*.35});for(let n=0;n<5;n++)s=m.waterPlant(s,`plant-${i+1}`);}
    }
    if(pending)s=m.openSeedPack(s);localStorage.setItem(key,JSON.stringify(s));return s;
  },{key:MEADOW,rounds,plants,pending});
  await p.reload({waitUntil:'domcontentloaded'});await p.locator('main.home-view').waitFor();return state;
}
async function meadowState(p){return p.evaluate(key=>JSON.parse(localStorage.getItem(key)),MEADOW);}
async function garden(p){await tap(p,'garden');await p.locator('.meadow-view').waitFor();}
async function fieldState(p){return p.locator('[data-meadow-field]').evaluate(e=>{
  const c=getComputedStyle(e),r=e.getBoundingClientRect();return{paper:e.classList.contains('has-paper'),pictureId:e.dataset.pictureId||null,background:c.backgroundImage,size:c.backgroundSize,position:c.backgroundPosition,sky:getComputedStyle(e.querySelector('.meadow-sky')).display,grass:getComputedStyle(e.querySelector('.meadow-grass')).display,bounds:{x:r.x,y:r.y,width:r.width,height:r.height}};
});}
function paperField(field){assert(field.paper);assert.equal(field.pictureId,'garden-background');assert(field.background.includes(GARDEN_FILE));assert.equal(field.size,'100% 125%, 100% 100%');assert.equal(field.position,'50% 100%, 50% 100%');assert.equal(field.sky,'none');assert.equal(field.grass,'none');}
async function gardenLayout(p){
  const bounds=await layout(p),targets=await p.locator('button:visible').evaluateAll(es=>es.map(e=>{const r=e.getBoundingClientRect();return{label:e.getAttribute('aria-label'),x:r.x,y:r.y,width:r.width,height:r.height};}));
  for(const r of targets){assert(r.width>=47&&r.height>=47,`Small touch target: ${JSON.stringify(r)}`);assert(r.x>=-1&&r.y>=-1&&r.x+r.width<=bounds.width+1&&r.y+r.height<=bounds.height+1,`Clipped action: ${JSON.stringify(r)}`);}
  return{bounds,targets};
}
async function oneTouchPlantAndWater(p,{x=.75,y=.75,mature=false}={}){
  const before=await meadowState(p);assert(before.pendingSeed);await tap(p,'meadow-seed');
  assert.equal(await p.locator('[data-action="meadow-seed"]').getAttribute('aria-pressed'),'true','One real tool tap selects the seed');
  const field=await p.locator('[data-meadow-field]').boundingBox();await p.touchscreen.tap(field.x+field.width*x,field.y+field.height*y);
  await p.waitForFunction(({key,count})=>JSON.parse(localStorage.getItem(key)).plants.length===count,{key:MEADOW,count:before.plants.length+1});
  const planted=await meadowState(p),id=planted.plants[planted.plants.length-1].id;
  assert.equal(planted.pendingSeed,null);assert.equal(planted.water,before.water);assert.equal(planted.shells,before.shells);
  assert.equal(planted.plants[planted.plants.length-1].waterings,0);assert(Math.abs(planted.plants[planted.plants.length-1].x-x)<.025);assert(Math.abs(planted.plants[planted.plants.length-1].y-y)<.025);
  await tap(p,'meadow-can');assert.equal(await p.locator('[data-action="meadow-can"]').getAttribute('aria-pressed'),'true','One real tap selects the can');
  const target=p.locator(`[data-meadow-plant="${id}"]`);await target.tap();
  await p.waitForFunction(({key,id})=>JSON.parse(localStorage.getItem(key)).plants.find(p=>p.id===id).waterings===1,{key:MEADOW,id});
  await p.waitForTimeout(500);const watered=await meadowState(p);assert.equal(watered.water,before.water-1,'A single touch spends one water, including any synthesized click');
  const needed=Number(await target.getAttribute('data-needed'));assert.equal(watered.plants.find(p=>p.id===id).waterings,1);
  if(mature)for(let n=2;n<=needed;n++){await target.tap();await p.waitForFunction(({key,id,n})=>JSON.parse(localStorage.getItem(key)).plants.find(p=>p.id===id).waterings===n,{key:MEADOW,id,n});assert.equal((await meadowState(p)).water,before.water-n);}
  if(mature)assert.equal(await target.locator('[data-bloom]').getAttribute('data-bloom'),'true');
  assert.equal(await p.evaluate(()=>localStorage.getItem('xiaoya-english:state:v1')),null,'Garden fixtures cannot create language mastery');
  return{before,planted,firstPour:watered,final:await meadowState(p),nativeTouch:true};
}
async function diagnostic(p){return p.evaluate(()=>({version:document.querySelector('meta[name="xiaoya-version"]')?.content,build:document.querySelector('meta[name="xiaoya-build"]')?.content,online:navigator.onLine,main:document.querySelector('main')?.outerHTML,qa:qaPaper})).catch(e=>({error:e.message}));}
async function test(name,fn,options){
  if(filter&&!filter.test(name))return;let f;
  try{
    f=await fixture(options);const evidence=await fn(f);
    assert.deepEqual(f.errors,[]);assert.deepEqual(await f.p.evaluate(()=>qaPaper.errors),[]);assert.equal(await f.p.evaluate(()=>qaPaper.microphoneCalls),0);
    assert(f.requests.every(r=>r.method==='GET'&&new URL(r.url).origin===origin),'Only loopback GET requests');
    assert(!f.requests.some(r=>/\/(?:xiaoya\/speech\/|speech\/(?:vosk-|model-))/.test(r.url)),'No recognition-model downloads');
    report.checks.push({name,status:'PASS',evidence,diagnostic:await diagnostic(f.p)});console.log('PASS',name);
  }catch(error){
    report.checks.push({name,status:'FAIL',error:error.stack,diagnostic:f?await diagnostic(f.p):null});console.error('FAIL',name,error.message);process.exitCode=1;
    if(f)await f.p.screenshot({animations:'disabled',path:path.join(out,`failure-${report.checks.length}.png`),fullPage:true}).catch(()=>{});
  }finally{f?.releaseFailure?.();await f?.c.close();save();}
}

async function run(){
  for(const [id,file] of ART)for(const [width,height] of [[390,844],[768,1024]])await test(`${id} ${width}px: native full image, new teaching and familiar review replay`,async({p,requests})=>{
    const meta=await storyMeta(p,id);assert.equal(meta.file,file);assert.equal(meta.layout,'single');
    const home=await welcomingHome(p,requests);await p.screenshot({animations:'disabled',path:path.join(out,`${id}-home-${width}.png`)});
    await ready(p,id);await ended(p,meta.lessonId,1);const trace=await teachingTrace(p,meta);
    const native=await decode(p,meta.url);nativePicture(native,id);
    const story=wholePicture(await pictureState(p,id),meta.url);await layout(p);
    await p.screenshot({animations:'disabled',path:path.join(out,`${id}-story-${width}.png`)});
    await tap(p,'story-replay');await p.locator('[data-phase="request"]').waitFor();await ended(p,meta.lessonId,2);
    const replay=wholePicture(await pictureState(p,id),meta.url);assert.equal(replay.backgroundImage,story.backgroundImage);assert.equal(replay.frame,meta.cueFrame);await layout(p);
    assert.equal(await p.locator('.vector-picture').count(),0);assert.equal(await p.evaluate(key=>localStorage.getItem(key),PLAN),null);
    const nativeAudio=await p.evaluate(()=>qaPaper.audios);assert.equal(nativeAudio.length,2);assert.deepEqual(await p.evaluate(()=>qaPaper.frames),trace.frames,'Ear replay does not restart or change the story frames');
    const review=await familiarReview(p,meta);await p.screenshot({animations:'disabled',path:path.join(out,`${id}-review-${width}.png`)});
    return{native,home,story,replay,trace,nativeAudio,review,requestedPictures:onlyCurrentPicture(requests,file)};
  },{story:id,width,height});

  for(const [id,file] of FAULT_ART)for(const review of [false,true])await test(`${id}: 404 becomes stable SVG on ${review?'direct review':'new story'}`,async({p,requests,releaseFailure})=>{
    await welcomingHome(p,requests);
    if(review){await tap(p,'next-event');await p.locator(`[data-event="${id}"][data-phase="request"][data-practice-mode="review"]`).waitFor();releaseFailure();}else await ready(p,id);
    await p.locator('.story-picture.vector-picture svg').waitFor();assert.equal(await p.locator('[data-picture-id]').count(),0);
    const meta=await storyMeta(p,id);if(review)assert.equal(await p.locator('main').getAttribute('data-context'),meta.context);
    const trace=review?null:await teachingTrace(p,meta,{fallback:true});
    assert.equal(await p.locator('.vector-picture svg').getAttribute('data-story'),id);assert.equal(Number(await p.locator('[data-story-frame]').getAttribute('data-story-frame')),meta.cueFrame);
    if(id==='hello-sorry'||id==='hello-okay'){
      assert.equal(await p.locator('.vector-picture [data-cue="fallen-blocks"]').count(),1,'Apology and reassurance retain the fallen-block cause');
      assert.equal(await p.locator('.vector-picture [data-character="sprout"]').getAttribute('data-mood'),id==='hello-sorry'?'sorry':'happy');
      assert.equal(await p.locator('.vector-picture [data-character="sprout"]').getAttribute('data-pose'),id==='hello-sorry'?'hold':'offer');
    }
    await layout(p);const failed=()=>requests.filter(r=>new URL(r.url).pathname.endsWith(`/stories/${file}`)).length;
    const first=failed(),renders=await p.evaluate(()=>qaPaper.renders);assert(first>0&&first<=3,'The real image was attempted without a retry storm');
    await p.waitForTimeout(1400);assert.equal(failed(),first,'No failed-image retry loop');assert.equal(await p.evaluate(()=>qaPaper.renders),renders,'No fallback render loop');
    if(review){assert.deepEqual(await p.evaluate(()=>qaPaper.audios),[],'Direct review is silent');await tap(p,'sample');await ended(p,meta.lessonId,1);}
    else{await tap(p,'story-replay');await p.locator('[data-phase="request"]').waitFor();await ended(p,meta.lessonId,2);}
    await p.locator('.vector-picture svg').waitFor();assert.equal(failed(),first,'Replay retains SVG fallback without retrying failed image');
    const cueBefore=await p.locator('.vector-picture svg').evaluate(e=>e.innerHTML);await tap(p,'context-help');await ended(p,meta.context,1);await ended(p,meta.lessonId,review?2:3);
    const audios=await p.evaluate(()=>qaPaper.audios),last=audios.slice(-2);assert(last[0].url.endsWith(`/xiaoya/audio/v3/${meta.context}.mp3`));assert(last[1].url.endsWith(`/${meta.lessonId}.mp3`));assert(last.every(a=>a.ended&&!a.error));assert(last[1].playedAt>=last[0].endedAt,'Help plays Chinese first, then English');
    assert.equal(await p.locator('.vector-picture svg').evaluate(e=>e.innerHTML),cueBefore,'Help keeps the same familiar semantic picture');assert.equal(failed(),first,'Help does not retry a failed picture');onlyCurrentPicture(requests,file);
    await p.screenshot({animations:'disabled',path:path.join(out,`${id}-missing-${review?'review':'story'}.png`)});
    return{injectedStatus:404,failedImageRequests:first,stableRenders:renders,view:review?'direct review':'new story',trace,helpAudio:last};
  },{story:id,missing:true,holdFailure:review,review});

  for(const [id,file] of OFFLINE_ART)await test(`${id}: previously viewed image survives an offline cold page`,async f=>{
    const {c,p}=f,meta=await storyMeta(p,id);await welcomingHome(p,f.requests);
    await p.waitForFunction(()=>!!navigator.serviceWorker.controller,undefined,{timeout:30000});
    await ready(p,id);await ended(p,meta.lessonId,1);await decode(p,meta.url);
    await p.waitForFunction(async url=>{const names=await caches.keys();for(const name of names)if(name.startsWith('xiaoya-core-')&&(await(await caches.open(name)).match(url))?.status===200)return true;return false;},meta.url,{timeout:30000});
    const scope=await p.evaluate(async()=>(await navigator.serviceWorker.ready).scope);assert.equal(scope,`${origin}/xiaoya/`);
    await p.close();await c.setOffline(true);f.p=await c.newPage();f.p.setDefaultTimeout(20000);
    await f.p.goto(`${origin}/xiaoya/?story=${id}`,{waitUntil:'domcontentloaded'});await f.p.locator('main.home-view').waitFor();
    assert.equal(await f.p.evaluate(()=>navigator.onLine),false);await welcomingHome(f.p);
    await ready(f.p,id);await ended(f.p,meta.lessonId,1);const trace=await teachingTrace(f.p,meta);
    const native=await decode(f.p,meta.url);nativePicture(native,id);
    const picture=wholePicture(await pictureState(f.p,id),meta.url);assert.equal(await f.p.locator('.vector-picture').count(),0);
    const [response,cachedBytes]=await Promise.all([
      f.p.waitForResponse(response=>response.url()===meta.url&&response.fromServiceWorker(),{timeout:10000}).then(r=>({url:r.url(),status:r.status(),worker:r.fromServiceWorker()})),
      f.p.evaluate(async url=>{const r=await fetch(url,{cache:'no-store'});return{status:r.status,bytes:(await r.arrayBuffer()).byteLength};},meta.url),
    ]);
    assert.equal(cachedBytes.status,200);assert(cachedBytes.bytes>10000,'The real cached picture has image bytes');
    assert.equal(response.status,200);await layout(f.p);
    await f.p.screenshot({animations:'disabled',path:path.join(out,`${id}-offline-cold.png`)});
    onlyCurrentPicture(f.requests,file);return{native,picture,scope,workerResponse:response,cachedBytes,trace};
  },{story:id,offline:true});

  await test('First home installs shell without requesting or caching story images',async({p,requests})=>{
    await p.waitForFunction(()=>!!navigator.serviceWorker.controller,undefined,{timeout:30000});await p.waitForTimeout(1200);const home=await welcomingHome(p,requests);
    const images=[...new Set(requests.map(r=>r.url).filter(url=>/\/stories\/.+\.webp(?:\?|$)/.test(url)))];
    assert.deepEqual(images,[],'The fixed companion home must not request lesson images');
    const cached=await p.evaluate(async()=>{const urls=[];for(const name of await caches.keys())if(name.startsWith('xiaoya-core-'))for(const r of await(await caches.open(name)).keys())if(/\/stories\/.+\.webp/.test(r.url))urls.push(r.url);return [...new Set(urls)];});
    assert.deepEqual(cached,[],'Shell install must not cache unseen story images');return{home,requestedImages:images,cachedImages:cached};
  },{offline:true});

  await test('Paper and deep-tea theme retains readable icon and primary-button contrast',async({p})=>{
    const ratio=([r,g,b])=>{const c=[r,g,b].map(v=>v/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);return .2126*c[0]+.7152*c[1]+.0722*c[2];};
    const colors=async selector=>p.locator(selector).evaluate(e=>{const s=getComputedStyle(e);return{color:s.color,background:s.backgroundColor};});
    const contrast=c=>{const luminance=[c.color,c.background].map(v=>ratio(v.match(/\d+/g).slice(0,3).map(Number))).sort((a,b)=>b-a);return(luminance[0]+.05)/(luminance[1]+.05);};
    const vars=await p.evaluate(()=>({paper:getComputedStyle(document.documentElement).getPropertyValue('--paper').trim(),ink:getComputedStyle(document.documentElement).getPropertyValue('--ink').trim(),theme:document.querySelector('meta[name="theme-color"]').content}));
    assert.equal(vars.paper.toUpperCase(),'#EFEADF');assert.equal(vars.ink.toUpperCase(),'#344B45');assert.equal(vars.theme.toUpperCase(),'#EFEADF');
    const home=await colors('.home-welcome [data-primary]');await ready(p,'family-love');const primary=await colors('[data-action="story-continue"]'),secondary=await colors('[data-action="story-replay"]');
    await tap(p,'parent');await p.locator('#parent-answer').waitFor();const gate=await colors('[data-action="gate-submit"]');
    const samples={home,primary,secondary,gate};for(const [name,c]of Object.entries(samples)){c.contrast=contrast(c);assert(c.contrast>=4.5,`${name} contrast ${c.contrast} is below 4.5:1`);}
    for(const name of ['home','primary','gate']){assert.equal(samples[name].color,'rgb(239, 234, 223)');assert.equal(samples[name].background,'rgb(52, 75, 69)');}
    return{vars,samples};
  });

  for(const [width,height] of [[320,568],[390,844],[768,1024]])await test(`GARDEN ${width}px: paper ground preserves one-touch planting and ten-pour giant growth`,async({p,requests})=>{
    await seedGarden(p,{rounds:5,plants:2});
    assert(!requests.some(r=>r.url.endsWith(GARDEN_FILE)),'Home must not request the garden illustration');
    await garden(p);const url=`${origin}/xiaoya/stories/${GARDEN_FILE}`,native=await decode(p,url);
    assert.equal(native.width,1599);assert.equal(native.height,900);const field=await fieldState(p);paperField(field);
    const touch=await oneTouchPlantAndWater(p,{mature:true});assert.equal(touch.final.plants[2].flowerId,'giant-daisy');assert.equal(touch.final.plants[2].waterings,10);
    assert.equal(touch.firstPour.water,touch.before.water-1);assert.equal(touch.final.water,touch.before.water-10);
    const screen=await gardenLayout(p);await p.screenshot({animations:'disabled',path:path.join(out,`garden-paper-${width}.png`)});
    return{native,field,screen,touch};
  },{garden:true,width,height});

  await test('GARDEN home and shell installation defer picture bytes until B garden entry',async({p,requests})=>{
    await seedGarden(p);await p.waitForFunction(()=>!!navigator.serviceWorker.controller,undefined,{timeout:30000});await p.waitForTimeout(1200);
    const cachedGarden=()=>p.evaluate(async file=>{const hits=[];for(const name of await caches.keys())for(const r of await(await caches.open(name)).keys())if(r.url.endsWith(file))hits.push({cache:name,url:r.url});return hits;},GARDEN_FILE);
    assert(!requests.some(r=>r.url.endsWith(GARDEN_FILE)));assert.deepEqual(await cachedGarden(),[],'Install cannot prefetch the unused meadow background');
    const countAtHome=requests.length;await garden(p);await decode(p,`${origin}/xiaoya/stories/${GARDEN_FILE}`);
    await p.waitForFunction(async file=>{for(const name of await caches.keys())if(name.startsWith('xiaoya-core-'))for(const r of await(await caches.open(name)).keys())if(r.url.endsWith(file))return true;return false;},GARDEN_FILE,{timeout:30000});
    const loaded=requests.slice(countAtHome).filter(r=>r.url.endsWith(GARDEN_FILE));assert(loaded.length>0);paperField(await fieldState(p));
    return{homeGardenRequests:0,homeGardenCacheEntries:0,requestsAfterEntry:loaded,cachedAfterEntry:await cachedGarden()};
  },{garden:true,offline:true});

  await test('GARDEN missing background falls back once and native planting and watering still work',async({p,requests})=>{
    await seedGarden(p);await garden(p);await p.locator('[data-meadow-field]:not(.has-paper)').waitFor();
    const field=await fieldState(p);assert.equal(field.pictureId,null);assert(!field.background.includes(GARDEN_FILE));assert.notEqual(field.sky,'none');assert.notEqual(field.grass,'none');
    const failed=()=>requests.filter(r=>r.url.endsWith(GARDEN_FILE)).length,first=failed(),renders=await p.evaluate(()=>qaPaper.renders);
    assert(first>0&&first<=3);await p.waitForTimeout(1400);assert.equal(failed(),first,'No failed-background network retry loop');assert.equal(await p.evaluate(()=>qaPaper.renders),renders,'No failed-background render loop');
    const touch=await oneTouchPlantAndWater(p,{mature:true});assert.equal(touch.final.plants[0].waterings,5);assert.equal(touch.final.water,touch.before.water-5);assert.equal(failed(),first,'Ordinary garden actions cannot retry a failed background');
    await gardenLayout(p);await p.screenshot({animations:'disabled',path:path.join(out,'garden-missing.png')});return{injectedStatus:404,failedImageRequests:first,field,touch};
  },{garden:true,missing:true});

  await test('GARDEN viewed background survives real service-worker offline cold page and another touch pour',async f=>{
    const {c,p}=f,url=`${origin}/xiaoya/stories/${GARDEN_FILE}`;await seedGarden(p);await garden(p);await decode(p,url);
    await p.waitForFunction(()=>!!navigator.serviceWorker.controller,undefined,{timeout:30000});
    await p.waitForFunction(async url=>{for(const name of await caches.keys())if(name.startsWith('xiaoya-core-')&&(await(await caches.open(name)).match(url))?.status===200)return true;return false;},url,{timeout:30000});
    const scope=await p.evaluate(async()=>(await navigator.serviceWorker.ready).scope);assert.equal(scope,`${origin}/xiaoya/`);
    const first=await oneTouchPlantAndWater(p);await p.close();await c.setOffline(true);f.p=await c.newPage();f.p.setDefaultTimeout(20000);
    await f.p.goto(`${origin}/xiaoya/?story=family-love&garden=b`,{waitUntil:'domcontentloaded'});await f.p.locator('main.home-view').waitFor();assert.equal(await f.p.evaluate(()=>navigator.onLine),false);
    await garden(f.p);const native=await decode(f.p,url);assert.equal(native.width,1599);assert.equal(native.height,900);paperField(await fieldState(f.p));assert.deepEqual(await meadowState(f.p),first.final);
    await tap(f.p,'meadow-can');await f.p.locator('[data-meadow-plant="plant-1"]').tap();
    await f.p.waitForFunction(key=>JSON.parse(localStorage.getItem(key)).plants[0].waterings===2,MEADOW);await f.p.waitForTimeout(500);
    const after=await meadowState(f.p);assert.equal(after.water,first.final.water-1);assert.equal(after.plants[0].waterings,2);
    const [response,cachedBytes]=await Promise.all([
      f.p.waitForResponse(r=>r.url()===url&&r.fromServiceWorker(),{timeout:10000}).then(r=>({url:r.url(),status:r.status(),worker:r.fromServiceWorker()})),
      f.p.evaluate(async url=>{const r=await fetch(url,{cache:'no-store'});return{status:r.status,bytes:(await r.arrayBuffer()).byteLength};},url),
    ]);
    assert.equal(response.status,200);assert.equal(cachedBytes.status,200);assert.equal(cachedBytes.bytes,80006);await gardenLayout(f.p);
    await f.p.screenshot({animations:'disabled',path:path.join(out,'garden-offline-cold.png')});return{scope,native,workerResponse:response,cachedBytes,beforeCold:first.final,afterColdTouch:after};
  },{garden:true,offline:true});
}

(async()=>{
  fs.mkdirSync(out,{recursive:true});browser=await chromium.launch({channel:'msedge',headless:true,args:['--no-proxy-server','--autoplay-policy=no-user-gesture-required']});
  await run();await browser.close();browser=null;if(!report.checks.length)throw Error('No paper-art cases matched.');
  report.passed=report.checks.filter(x=>x.status==='PASS').length;report.total=report.checks.length;save();console.log(`${report.passed}/${report.total} paper-art checks passed · ${report.build}`);
})().catch(async error=>{console.error(error);if(browser)await browser.close();process.exitCode=1;});
