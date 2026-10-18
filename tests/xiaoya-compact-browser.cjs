// Isolated real Edge integration for the phrase-first child flow. Playback uses
// native Audio at 4x speed; a passing clip must emit its real `ended` event.
// No user profile, microphone, ASR model, child record, or remote service is used.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'C:/Users/Jam/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const origin=new URL(process.env.TEST_URL||'http://127.0.0.1:24756').origin;
if(!['127.0.0.1','localhost','[::1]'].includes(new URL(origin).hostname))throw Error('Compact integration requires a loopback server.');
const out=path.resolve(process.env.XIAOYA_COMPACT_TEST_OUT||path.join(__dirname,'../test-results/xiaoya-v11-compact'));
const filter=process.env.XIAOYA_TEST_FILTER?new RegExp(process.env.XIAOYA_TEST_FILTER):null;
const PLAN='xiaoya-english:practice-plan:v1';
const EXPECTED_CORE=['hello-everyone','hello-morning','family-love','hello-thanks','hello-youre-welcome','hello-sorry','hello-okay','hello-goodbye','bed-night','hello-welcome','hello-excuse','outside-go-home','outside-ready','family-come','food-eat','food-hungry','feelings-happy','feelings-tired','play-turn','play-your-turn','play-can-do','play-did-it','play-good-job','play-again'];
const report={origin,actualNativePlayback:true,playbackRate:4,microphoneUsed:false,asrAccuracyTested:false,checks:[]};
let browser;
const click=(p,action)=>p.locator(`[data-action="${action}"]`).first().tap();
const save=()=>fs.writeFileSync(path.join(out,filter?'results-filtered.json':'results.json'),JSON.stringify(report,null,2));

async function fixture({width=390,height=844,story='hello-everyone'}={}){
  const c=await browser.newContext({viewport:{width,height},timezoneId:'Asia/Shanghai',serviceWorkers:'block',isMobile:true,hasTouch:true,reducedMotion:'reduce'});
  const requests=[],errors=[];
  c.on('request',r=>requests.push({url:r.url(),method:r.method()}));
  c.on('page',p=>p.on('pageerror',e=>errors.push(e.message)));
  await c.route('**/*',r=>new URL(r.request().url()).origin===origin?r.continue():r.abort('blockedbyclient'));
  await c.addInitScript(({origin})=>{
    if(location.origin!==origin)return;
    const NativeDate=Date,now=NativeDate.parse('2026-10-18T12:00:00+08:00');
    window.Date=class extends NativeDate{constructor(...args){super(...(args.length?args:[now]));}static now(){return now;}};
    const q=window.qaCompact={errors:[],audios:[],plays:[],frames:[],microphoneCalls:0};
    window.addEventListener('error',e=>{if(e.message)q.errors.push(e.message);});
    window.addEventListener('unhandledrejection',e=>q.errors.push(String(e.reason)));
    const NativeAudio=Audio;
    window.Audio=function(...args){
      const audio=new NativeAudio(...args),entry={url:String(args[0]||''),ended:false,error:false};
      audio.playbackRate=4;q.audios.push(entry);
      audio.addEventListener('playing',()=>{entry.playedAt=performance.now();q.plays.push({url:entry.url,at:entry.playedAt,event:document.querySelector('main[data-event]')?.dataset.event||null});});
      audio.addEventListener('ended',()=>{entry.ended=true;entry.endedAt=performance.now();});
      audio.addEventListener('error',()=>entry.error=true);return audio;
    };window.Audio.prototype=NativeAudio.prototype;
    if(navigator.mediaDevices?.getUserMedia){const gum=navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);navigator.mediaDevices.getUserMedia=(...args)=>{q.microphoneCalls++;return gum(...args);};}
    new MutationObserver(()=>{
      const e=document.querySelector('main[data-phase="story"] [data-story-frame]');if(!e)return;
      const item={event:e.closest('main').dataset.event,frame:Number(e.dataset.storyFrame)},last=q.frames.at(-1);
      if(!last||last.event!==item.event||last.frame!==item.frame)q.frames.push(item);
    }).observe(document,{subtree:true,childList:true,attributes:true,attributeFilter:['data-story-frame']});
  },{origin});
  const p=await c.newPage();p.setDefaultTimeout(20000);
  try{
    await p.goto(`${origin}/xiaoya/?story=${encodeURIComponent(story)}`);await p.locator('main.home-view').waitFor();
    const version=await p.locator('meta[name="xiaoya-version"]').getAttribute('content'),build=await p.locator('meta[name="xiaoya-build"]').getAttribute('content');
    assert.equal(version,'0.11.0');if(report.build)assert.equal(build,report.build,'Server build changed during this run; rerun against one finished build.');else{report.build=build;report.version=version;}
    assert.equal(await p.locator('.home-welcome .home-companion [data-paper-art="buddy-welcome"]').count(),1,'The first screen has the same welcoming 小芽 for every phrase');
    assert.equal(await p.locator('.home-welcome [data-primary]').count(),1,'Home has one primary action');
    assert.equal(await p.locator('.home-welcome [data-picture-id],.home-welcome .story-picture').count(),0,'Home does not reveal a lesson picture');
    assert(!requests.some(r=>/\/stories\/.+\.webp(?:\?|$)/.test(r.url)),'Home does not request lesson images before entry');
    return{c,p,requests,errors};
  }catch(error){await c.close();throw error;}
}
async function catalogue(p){return p.evaluate(async()=>{
  const base=document.querySelector('script[type="module"][src]').src;
  const [c,s]=await Promise.all(['curriculum.js','stories.js'].map(file=>import(new URL(file,base))));
  return{core:c.CORE_PHRASE_EVENT_IDS,stories:s.STORIES.map(x=>({id:x.id,lessonId:x.event.lessonId,cueFrame:x.cueFrame,teachingFrames:x.teachingFrames,context:x.event.contexts[0].id}))};
});}
async function audioState(p){return p.evaluate(()=>({audios:qaCompact.audios,plays:qaCompact.plays,frames:qaCompact.frames}));}
async function ended(p,suffix,count=1){await p.waitForFunction(({suffix,count})=>qaCompact.audios.filter(a=>a.url.endsWith(suffix)&&a.ended).length>=count,{suffix,count},{timeout:30000});}
async function readyStory(p,id){await click(p,'next-event');await p.locator(`[data-event="${id}"][data-phase="story"]`).waitFor();await p.locator('[data-action="story-continue"]:enabled').waitFor({timeout:35000});}
async function parent(p){
  await click(p,'parent');
  if(await p.locator('#parent-answer').count()){
    const n=(await p.locator('label[for="parent-answer"]').textContent()).match(/\d+/g).map(Number);
    await p.locator('#parent-answer').fill(String(n[0]+n[1]));await click(p,'gate-submit');
  }
  await p.locator('.parent-view').waitFor();
}
async function openCore(p,id){
  await parent(p);const details=p.locator('.story-library>details');
  if(!await details.evaluate(e=>e.open))await details.locator(':scope>summary').tap();
  await p.locator(`[data-story="${id}"]`).tap();await p.locator(`[data-event="${id}"][data-phase="story"]`).waitFor();
  await p.locator('[data-action="story-continue"]:enabled').waitFor({timeout:35000});
}
async function childLayout(p){
  const bounds=await p.evaluate(()=>({width:innerWidth,height:innerHeight,scrollWidth:document.documentElement.scrollWidth,scrollHeight:document.documentElement.scrollHeight}));
  assert(bounds.scrollWidth<=bounds.width+1,`Horizontal overflow: ${JSON.stringify(bounds)}`);
  assert(bounds.scrollHeight<=bounds.height+1,`Child screen needs scrolling: ${JSON.stringify(bounds)}`);
  assert(!/[A-Za-z]/.test(await p.locator('#app').innerText()),'Child-visible content contains English letters');
  for(const r of await p.locator('button:visible').evaluateAll(es=>es.map(e=>{const r=e.getBoundingClientRect();return{label:e.getAttribute('aria-label'),x:r.x,y:r.y,width:r.width,height:r.height};}))){
    assert(r.width>=47&&r.height>=47,`Touch target too small: ${JSON.stringify(r)}`);
    assert(r.x>=-1&&r.x+r.width<=bounds.width+1&&r.y>=-1&&r.y+r.height<=bounds.height+1,`Child action outside viewport: ${JSON.stringify(r)}`);
  }
  return bounds;
}
async function diagnostic(p){return p.evaluate(()=>({version:document.querySelector('meta[name="xiaoya-version"]')?.content,build:document.querySelector('meta[name="xiaoya-build"]')?.content,main:document.querySelector('main')?.outerHTML,qa:qaCompact})).catch(e=>({error:e.message}));}
async function test(name,fn,options){
  if(filter&&!filter.test(name))return;let f;
  try{
    f=await fixture(options);const evidence=await fn(f);
    assert.deepEqual(f.errors,[],'No page JavaScript errors');assert.deepEqual(await f.p.evaluate(()=>qaCompact.errors),[],'No uncaught promises');
    assert.equal(await f.p.evaluate(()=>qaCompact.microphoneCalls),0,'Compact flow does not acquire microphone');
    assert(f.requests.every(r=>r.method==='GET'&&new URL(r.url).origin===origin),'Only loopback GET requests');
    assert(!f.requests.some(r=>/\/(?:xiaoya\/speech\/|speech\/(?:vosk-|model-))/.test(r.url)),'No ASR resource downloads');
    report.checks.push({name,status:'PASS',evidence,diagnostic:await diagnostic(f.p)});console.log('PASS',name);
  }catch(error){
    report.checks.push({name,status:'FAIL',error:error.stack,diagnostic:f?await diagnostic(f.p):null});console.error('FAIL',name,error.message);process.exitCode=1;
    if(f)await f.p.screenshot({animations:'disabled',path:path.join(out,`failure-${report.checks.length}.png`),fullPage:true}).catch(()=>{});
  }finally{await f?.c.close();save();}
}

async function run(){
  for(const id of EXPECTED_CORE)await test(`Core ${id}: compact new teaching, phrase-only replay, Chinese then English help`,async({p})=>{
    const data=await catalogue(p);assert.deepEqual(data.core,EXPECTED_CORE);const story=data.stories.find(s=>s.id===id),suffix=`/${story.lessonId}.mp3`;
    assert.deepEqual(story.teachingFrames,id==='play-again'?[0,story.cueFrame]:[story.cueFrame],'Core teaching only retains a second beat where it establishes the retry cause');await readyStory(p,id);await ended(p,suffix);
    const initial=await audioState(p);
    assert.deepEqual(initial.frames.filter(x=>x.event===id).map(x=>x.frame),story.teachingFrames,'Only the intended teaching scene(s) are displayed');
    assert.equal(initial.plays.length,1,'Initial lesson plays exactly one English phrase');assert(initial.plays[0].url.endsWith(suffix));
    assert.equal(await p.locator('.story-progress').count(),story.teachingFrames.length===2?1:0);await childLayout(p);
    await click(p,'story-replay');await p.locator('[data-phase="request"]').waitFor();await ended(p,suffix,2);
    const replay=await audioState(p);assert.equal(replay.plays.length,2);assert(replay.plays.at(-1).url.endsWith(suffix));
    assert.deepEqual(replay.frames,initial.frames,'Replay never restarts story frames');assert.equal(Number(await p.locator('[data-story-frame]').getAttribute('data-story-frame')),story.cueFrame);await childLayout(p);
    await click(p,'context-help');await ended(p,`/${story.context}.mp3`);await ended(p,suffix,3);
    const helped=await audioState(p),last=helped.audios.slice(-2);
    assert.equal(helped.plays.length,4,'Help adds exactly Chinese context and English phrase');
    assert(last[0].url.endsWith(`/xiaoya/audio/v3/${story.context}.mp3`));assert(last[1].url.endsWith(suffix));
    assert(last.every(a=>a.ended&&!a.error),'Both real help clips ended successfully');assert(last[1].playedAt>=last[0].endedAt,'English begins only after Chinese ends');
    assert.deepEqual(helped.frames,initial.frames,'Help does not replay the whole story');
    assert.equal(await p.evaluate(key=>localStorage.getItem(key),PLAN),null,'Listening does not fabricate a completed lesson');
    return{id,lessonId:story.lessonId,teachingFrames:story.teachingFrames,actualClips:helped.plays.map(x=>x.url)};
  },{story:id});

  for(const id of ['hello-everyone','hello-sorry'])await test(`Due review ${id}: silent familiar cue, one requested English replay`,async({p})=>{
    const story=(await catalogue(p)).stories.find(s=>s.id===id);
    await p.evaluate(async({key,id})=>{
      const base=document.querySelector('script[type="module"][src]').src,m=await import(new URL('practice-plan.js',base));
      localStorage.setItem(key,JSON.stringify(m.recordPractice(m.createPracticePlan(),{roundId:'qa-compact-review',eventId:id,date:'2026-10-17',mode:'new',rewardVariant:null})));
    },{key:PLAN,id});
    await p.reload();await p.locator('main.home-view').waitFor();await click(p,'next-event');await p.locator(`[data-event="${id}"][data-phase="request"][data-practice-mode="review"]`).waitFor();
    await p.waitForTimeout(1300);const before=await audioState(p);assert.deepEqual(before.plays,[],'Recall never automatically gives the answer');assert.deepEqual(before.frames,[],'Recall never starts teaching frames');
    assert.equal(await p.locator('main').getAttribute('data-context'),story.context);assert.equal(Number(await p.locator('[data-story-frame]').getAttribute('data-story-frame')),story.cueFrame);
    await childLayout(p);await click(p,'sample');await ended(p,`/${story.lessonId}.mp3`);const after=await audioState(p);
    assert.equal(after.plays.length,1);assert(after.plays[0].url.endsWith(`/${story.lessonId}.mp3`));assert.deepEqual(after.frames,[]);assert.equal(await p.locator('[data-phase="request"]').count(),1);
    return{event:id,context:story.context,actualClips:after.plays};
  },{story:id});

  await test('Parent catalogue contains 24 distinct core phrases and 29 distinct extensions',async({p})=>{
    await parent(p);const details=p.locator('.story-library>details');await details.locator(':scope>summary').tap();
    const core=details.locator(':scope>.checkup-row'),extensions=details.locator('.extension-phrases');
    assert.equal(await core.count(),24);assert.match(await details.locator(':scope>summary').innerText(),/24/);
    await extensions.locator(':scope>summary').tap();assert.equal(await extensions.locator('.checkup-row').count(),29);
    const all=await details.locator('[data-phrase]').evaluateAll(es=>es.map(e=>e.dataset.phrase));assert.equal(all.length,53);assert.equal(new Set(all).size,53);
    assert.equal(await details.locator('[data-phrase="needs-08"]').count(),1,'The three Help scenes share one parent phrase');
    assert.equal(await details.locator('[data-story="play-bridge"],[data-story="care-zip"]').count(),0);
    const ids=await core.locator('[data-story]').evaluateAll(es=>es.map(e=>e.dataset.story));assert.deepEqual(ids,EXPECTED_CORE);
    await p.screenshot({animations:'disabled',path:path.join(out,'parent-phrases-390.png'),fullPage:true});return{core:24,extensions:29,unique:all.length};
  });

  for(const [width,height] of [[320,568],[390,844],[768,1024]])await test(`Child home, single scene, two scenes and help fit ${width}px without English letters`,async({p})=>{
    const views={home:await childLayout(p)};await p.screenshot({animations:'disabled',path:path.join(out,`home-${width}.png`)});
    await readyStory(p,'hello-everyone');views.single=await childLayout(p);await p.screenshot({animations:'disabled',path:path.join(out,`single-${width}.png`)});
    await click(p,'story-replay');await ended(p,'/hello-01.mp3',2);views.request=await childLayout(p);
    await click(p,'context-help');await ended(p,'/hello-01.mp3',3);views.help=await childLayout(p);
    await openCore(p,'play-again');views.two=await childLayout(p);assert.equal(await p.locator('.story-progress').count(),1);await p.screenshot({animations:'disabled',path:path.join(out,`two-${width}.png`)});
    await click(p,'story-replay');await p.locator('[data-phase="request"]').waitFor();views.twoRequest=await childLayout(p);
    return views;
  },{width,height});
}

(async()=>{
  fs.mkdirSync(out,{recursive:true});browser=await chromium.launch({channel:'msedge',headless:true,args:['--no-proxy-server','--autoplay-policy=no-user-gesture-required']});
  await run();await browser.close();browser=null;
  if(!report.checks.length)throw Error('No compact integration cases matched the filter.');
  report.passed=report.checks.filter(x=>x.status==='PASS').length;report.total=report.checks.length;save();
  console.log(`${report.passed}/${report.total} compact integration cases passed · ${report.build}`);
})().catch(async error=>{console.error(error);if(browser)await browser.close();process.exitCode=1;});
