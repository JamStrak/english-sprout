/* Native Edge regression for versioned story-picture loading. Uses only a
 * loopback candidate build and isolated profiles/synthetic learning records.
 * Alternate isolation uses two test-only URLs mapped to existing real WebPs;
 * it tests media routing, not the semantic quality of newly delivered art. */
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'C:/Users/Jam/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const expected=JSON.parse(fs.readFileSync(path.join(__dirname,'../dist/xiaoya/version.json'),'utf8'));
const origin=new URL(process.env.TEST_URL||'http://127.0.0.1:24756').origin;
if(!['127.0.0.1','localhost','[::1]'].includes(new URL(origin).hostname))throw Error('Use a loopback candidate server');
const out=path.resolve(process.env.XIAOYA_PICTURES_TEST_OUT||path.join(__dirname,'../test-results/xiaoya-story-pictures'));
const filter=process.env.XIAOYA_TEST_FILTER?new RegExp(process.env.XIAOYA_TEST_FILTER):null;
const report={origin,scope:{nativeImages:true,nativeAudio:true,playbackRate:4,nativeOfflineWorker:true,viewport:[390,844],syntheticAlternateMappings:true,microphoneUsed:false},checks:[]};
const files={intro:'story-play-again-intro-paper-v04.webp',main:'play-again-paper-v1.webp',request:'qa-alternate-request.webp',resolved:'qa-alternate-resolved.webp'};
const storyRequests=f=>[...new Set(f.requests.filter(u=>/\/stories\/[^?]+\.webp/.test(u)).map(u=>new URL(u).pathname.split('/').pop()))].sort();
const tap=(p,name)=>p.locator(`[data-action="${name}"]`).first().tap();
let browser;

async function fixture({story='play-again',hold=null,missing=null,alternate=false,worker=false}={}){
  const c=await browser.newContext({viewport:{width:390,height:844},timezoneId:'Asia/Shanghai',isMobile:true,hasTouch:true,reducedMotion:'reduce',serviceWorkers:worker?'allow':'block'});
  const requests=[],errors=[];let release;
  const gate=hold?new Promise(resolve=>release=resolve):Promise.resolve();
  c.on('request',r=>requests.push(r.url()));c.on('page',p=>p.on('pageerror',e=>errors.push(e.message)));
  if(!worker)await c.route('**/*',async route=>{
    const url=new URL(route.request().url()),file=url.pathname.split('/').pop();
    if(url.origin!==origin)return route.abort('blockedbyclient');
    if(alternate&&file==='story-assets.js'){
      const response=await route.fetch(),source=(await response.text()).replace('export const STORY_ASSETS','const ORIGINAL_ASSETS');
      return route.fulfill({response,body:source+`\nexport const STORY_ASSETS=Object.freeze({...ORIGINAL_ASSETS,'family-love':{...ORIGINAL_ASSETS['family-love'],alternateImages:{request:'${files.request}',resolved:'${files.resolved}'}}});`});
    }
    if(file===hold)await gate;
    if(file===missing)return route.fulfill({status:404,contentType:'text/plain',body:'QA missing optional picture'});
    if(alternate&&[files.request,files.resolved].includes(file)){
      const response=await route.fetch({url:origin+'/xiaoya/stories/'+(file===files.request?'love-paper-v1.webp':'thanks-paper-v1.webp')});
      return route.fulfill({response});
    }
    return route.continue();
  });
  await c.addInitScript(({origin})=>{
    if(location.origin!==origin)return;
    const q=window.qaPictures={audio:[],frames:[],errors:[],renders:0,microphoneCalls:0};
    window.addEventListener('error',e=>{if(e.message)q.errors.push(e.message);});
    window.addEventListener('unhandledrejection',e=>q.errors.push(String(e.reason)));
    const NativeAudio=Audio;
    window.Audio=function(...args){const a=new NativeAudio(...args),v={url:String(args[0]||''),ended:false,error:false};q.audio.push(v);a.playbackRate=4;a.addEventListener('playing',()=>v.playedAt=performance.now());a.addEventListener('ended',()=>{v.ended=true;v.endedAt=performance.now();});a.addEventListener('error',()=>v.error=true);return a;};
    window.Audio.prototype=NativeAudio.prototype;
    if(navigator.mediaDevices)navigator.mediaDevices.getUserMedia=()=>{q.microphoneCalls++;return Promise.reject(new DOMException('Test never opens microphones','NotAllowedError'));};
    new MutationObserver(records=>{
      q.renders+=records.filter(r=>r.type==='childList'&&r.target.id==='app').length;
      const e=document.querySelector('.story-stage .story-picture');if(!e)return;
      const next={frame:e.dataset.storyFrame,status:e.dataset.pictureStatus,url:e.dataset.pictureUrl,vector:e.classList.contains('vector-picture'),cues:[...e.querySelectorAll('[data-cue]')].map(e=>e.dataset.cue),at:performance.now()},last=q.frames.at(-1);
      if(!last||['frame','status','url','vector'].some(k=>last[k]!==next[k]))q.frames.push(next);
    }).observe(document,{subtree:true,childList:true,attributes:true,attributeFilter:['class','style','data-picture-status']});
  },{origin});
  const p=await c.newPage();p.setDefaultTimeout(20000);
  try{
    await p.goto(`${origin}/xiaoya/?garden=b&story=${story}`,{waitUntil:'domcontentloaded'});await p.locator('main.home-view').waitFor();
    const version=await p.locator('meta[name="xiaoya-version"]').getAttribute('content'),build=await p.locator('meta[name="xiaoya-build"]').getAttribute('content');
    assert.equal(version,expected.version);assert.equal(build,expected.build,'Served build must match the local candidate');if(report.build)assert.equal(build,report.build,'Build changed during suite');else Object.assign(report,{version,build});
    return {c,p,requests,errors,release,story};
  }catch(error){release?.();await c.close();throw error;}
}
async function meta(p,id){return p.evaluate(async id=>{
  const base=document.querySelector('script[type="module"][src]').src,{storyFor}=await import(new URL('stories.js',base)),s=storyFor(id);
  return {id:s.id,lesson:s.event.lessonId,intro:s.introImage,main:s.image,context:s.event.contexts[0].id,alternate:s.event.contexts[1].id};
},id);}
async function ready(f){await tap(f.p,'next-event');await f.p.locator('[data-action="story-continue"]:enabled').waitFor({timeout:35000});}
async function ended(p,lesson,count=1){await p.waitForFunction(({lesson,count})=>qaPictures.audio.filter(a=>a.url.endsWith(`/${lesson}.mp3`)&&a.ended&&!a.error).length>=count,{lesson,count});}
async function layout(p){const v=await p.evaluate(()=>({width:innerWidth,height:innerHeight,scrollWidth:document.documentElement.scrollWidth,scrollHeight:document.documentElement.scrollHeight,text:document.querySelector('main').innerText}));assert(v.scrollWidth<=v.width+1);assert(v.scrollHeight<=v.height+1);assert(!/[A-Za-z]/.test(v.text));return v;}
async function picture(p,file,status='ready'){await p.waitForFunction(({file,status})=>{const e=document.querySelector('.story-stage .story-picture');return e?.dataset.pictureUrl?.endsWith('/'+file)&&e.dataset.pictureStatus===status;},{file,status});return p.locator('.story-stage .story-picture').evaluate(e=>({status:e.dataset.pictureStatus,url:e.dataset.pictureUrl,vector:e.classList.contains('vector-picture'),single:e.classList.contains('single-picture'),background:getComputedStyle(e).backgroundImage,size:getComputedStyle(e).backgroundSize,svg:!!e.querySelector('svg')}));}
async function unlock(p){if(await p.locator('#parent-answer').count()){const n=(await p.locator('label[for="parent-answer"]').textContent()).match(/\d+/g).map(Number);await p.locator('#parent-answer').fill(String(n[0]+n[1]));await tap(p,'gate-submit');}}
async function checkup(f){
  await f.p.evaluate(async()=>{const base=document.querySelector('script[type="module"][src]').src,{createState,recordEvidence,localDay,STORAGE_KEY}=await import(new URL('learning.js',base)),{storyFor}=await import(new URL('stories.js',base)),s=storyFor('family-love');const state=recordEvidence(createState(),{attemptId:'qa-picture-prior',eventId:s.id,contextId:s.event.contexts[0].id,kind:'speech',result:'independent',source:'parent',helped:false,date:localDay()});localStorage.setItem(STORAGE_KEY,JSON.stringify(state));});
  await f.p.reload({waitUntil:'domcontentloaded'});await f.p.locator('main.home-view').waitFor();await tap(f.p,'parent');await unlock(f.p);
  const groups=f.p.locator('.story-library details').filter({has:f.p.locator('[data-checkup="family-love"]')});
  for(const group of await groups.all())if(!await group.evaluate(e=>e.open))await group.locator(':scope > summary').click();
  await f.p.locator('[data-checkup="family-love"]').tap();await f.p.locator('main[data-phase="request"][data-context="family-love-elsewhere"]').waitFor();
}
async function resolveCheckup(p){await tap(p,'observe');await unlock(p);await p.locator('[data-observation="independent"]').tap();await p.locator('main[data-phase="resolved"]').waitFor();}
async function test(name,fn,options={}){
  if(filter&&!filter.test(name))return;
  let f;const entry={name};report.checks.push(entry);
  try{f=await fixture(options);entry.evidence=await fn(f);assert.deepEqual(f.errors,[]);const q=await f.p.evaluate(()=>qaPictures);assert.deepEqual(q.errors,[]);assert.equal(q.microphoneCalls,0);assert(!f.requests.some(u=>new URL(u).origin!==origin));entry.pass=true;console.log('PASS '+name);}
  catch(error){entry.pass=false;entry.error=error.stack;console.error('FAIL '+name+'\n'+error.stack);process.exitCode=1;}
  finally{f?.release?.();if(f)await f.c.close();fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(report,null,2));}
}

(async()=>{
  fs.mkdirSync(out,{recursive:true});browser=await chromium.launch({channel:'msedge',headless:true,args:['--autoplay-policy=no-user-gesture-required']});
  await test('Parent navigation removes child help and the redundant parent button while home still works',async f=>{
    await tap(f.p,'parent');await unlock(f.p);await f.p.locator('main.parent-view').waitFor();
    assert.deepEqual(await f.p.locator('.topbar [data-action]').evaluateAll(es=>es.map(e=>e.dataset.action)),['home']);
    assert.equal(await f.p.evaluate(()=>qaPictures.audio.length),0,'Opening parent settings cannot play a child instruction');
    await f.p.screenshot({path:path.join(out,'parent-header-390.png'),animations:'disabled'});
    await tap(f.p,'home');await f.p.locator('main.home-view').waitFor();
    await f.p.locator('.topbar [data-action="help"]').waitFor();await f.p.locator('.topbar [data-action="parent"]').waitFor();
    const s=await meta(f.p,f.story);await ready(f);await ended(f.p,s.lesson);
    await f.p.locator('[data-action="story-help"]').waitFor();
    await tap(f.p,'parent');await f.p.locator('main.parent-view').waitFor();
    assert.deepEqual(await f.p.locator('.topbar [data-action]').evaluateAll(es=>es.map(e=>e.dataset.action)),['home']);
    await f.p.setViewportSize({width:1366,height:900});
    await f.p.screenshot({path:path.join(out,'parent-header-1366.png'),animations:'disabled'});
    await tap(f.p,'home');await f.p.locator('main.home-view').waitFor();
    return {parentActions:['home'],childHelpPreserved:true,viewports:[390,1366],returnedFromLesson:true};
  });
  await test('P0 introduction and main picture load only after entry; real English completes',async f=>{
    assert.deepEqual(storyRequests(f),[]);const s=await meta(f.p,f.story);assert.equal(s.intro,files.intro);await ready(f);await ended(f.p,s.lesson);
    const view=await picture(f.p,files.main);assert(!view.vector&&view.single);assert.equal(view.size,'contain');
    const trace=await f.p.evaluate(()=>qaPictures.frames);assert(trace.some(x=>x.frame==='0'&&x.url?.endsWith(files.intro)&&!x.vector),'Introduction must display its own real picture');assert(trace.some(x=>x.frame==='1'&&x.url?.endsWith(files.main)&&!x.vector));
    assert.deepEqual(storyRequests(f),[files.intro,files.main].sort());await layout(f.p);await f.p.screenshot({path:path.join(out,'p0-ready.png'),animations:'disabled'});return {trace,view,requests:storyRequests(f)};
  });
  await test('A missing intro shows recovery without old art and does not poison main art or audio',async f=>{
    const s=await meta(f.p,f.story);await ready(f);await ended(f.p,s.lesson);const view=await picture(f.p,files.main),trace=await f.p.evaluate(()=>qaPictures.frames);
    assert(trace.some(x=>x.frame==='0'&&x.status==='failed'&&!x.vector));assert(!view.vector);assert.deepEqual(storyRequests(f),[files.intro,files.main].sort());return {view,trace};
  },{missing:files.intro});
  await test('A late main image replaces only the picture while the speaking button and dialog survive',async f=>{
    const s=await meta(f.p,f.story);await ready(f);await ended(f.p,s.lesson);await picture(f.p,files.main,'slow');
    // The teaching microphone directly enters recording and opens the gate.
    // Do not click the underlying button again through that visible dialog.
    await tap(f.p,'story-continue');await f.p.locator('[data-action="record"]').waitFor();await f.p.locator('#parent-answer').waitFor();
    await f.p.evaluate(()=>{window.qaButton=document.querySelector('[data-action="record"]');window.qaDialog=document.querySelector('[role="dialog"]');window.qaBefore=qaPictures.renders;});
    f.release();const view=await picture(f.p,files.main);
    const stable=await f.p.evaluate(()=>({button:qaButton===document.querySelector('[data-action="record"]'),dialog:qaDialog===document.querySelector('[role="dialog"]'),renders:qaPictures.renders-qaBefore}));
    assert.deepEqual(stable,{button:true,dialog:true,renders:0});assert(!view.vector);return {view,stable,audioEndedBeforeImage:true};
  },{hold:files.main});
  await test('An intro arriving after teaching cannot overwrite the current main picture',async f=>{
    await ready(f);const before=await picture(f.p,files.main);await f.p.evaluate(()=>{window.qaButton=document.querySelector('[data-action="story-continue"]');});const arrived=f.p.waitForResponse(r=>r.url().endsWith('/'+files.intro));f.release();await(await arrived).finished();
    await f.p.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    const after=await picture(f.p,files.main);assert.deepEqual(after,before);assert(await f.p.evaluate(()=>qaButton===document.querySelector('[data-action="story-continue"]')));return {before,after};
  },{hold:files.intro});
  await test('Distinct alternate request and resolved pictures preserve checkup semantics and bounded prefetch',async f=>{
    await checkup(f);const request=await picture(f.p,files.request);assert(!request.vector);assert.deepEqual(storyRequests(f),[files.request,files.resolved].sort());
    const s=await meta(f.p,'family-love');assert.equal((await f.p.evaluate(()=>qaPictures.audio)).filter(a=>a.url.endsWith('/'+s.lesson+'.mp3')).length,0,'Checkup must not autoplay its answer');
    await resolveCheckup(f.p);const resolved=await picture(f.p,files.resolved);await layout(f.p);assert(!resolved.vector);return {request,resolved,requests:storyRequests(f)};
  },{story:'family-love',alternate:true});
  await test('A missing alternate request offers recovery without SVG and allows the resolved picture',async f=>{
    await checkup(f);const request=await picture(f.p,files.request,'failed');assert(!request.vector&&!request.svg);await f.p.locator('.story-picture [data-action="picture-retry"]').waitFor();await resolveCheckup(f.p);const resolved=await picture(f.p,files.resolved);assert(!resolved.vector);assert.deepEqual(storyRequests(f),[files.request,files.resolved].sort());return {request,resolved};
  },{story:'family-love',alternate:true,missing:files.request});
  await test('Viewed intro and main pictures plus the real voice survive an offline cold page',async f=>{
    await f.p.waitForFunction(()=>!!navigator.serviceWorker.controller,undefined,{timeout:120000});const s=await meta(f.p,f.story);await ready(f);await ended(f.p,s.lesson);
    await f.p.waitForFunction(async files=>{const names=await caches.keys();for(const name of names)if(name.startsWith('xiaoya-art-')){const cache=await caches.open(name);if((await Promise.all(files.map(file=>cache.match(new URL('xiaoya/stories/'+file,document.baseURI))))).every(Boolean))return true;}return false;},[files.intro,files.main]);
    await f.p.close();await f.c.setOffline(true);f.p=await f.c.newPage();f.p.setDefaultTimeout(20000);await f.p.goto(`${origin}/xiaoya/?garden=b&story=play-again`,{waitUntil:'domcontentloaded'});await f.p.locator('main.home-view').waitFor();await ready(f);await ended(f.p,s.lesson);
    const view=await picture(f.p,files.main);assert.equal(await f.p.evaluate(()=>navigator.onLine),false);const trace=await f.p.evaluate(()=>qaPictures.frames);assert(trace.some(x=>x.url?.endsWith(files.intro)&&!x.vector));await layout(f.p);return {offline:true,view,trace};
  },{worker:true});
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(async()=>{await browser?.close();});
