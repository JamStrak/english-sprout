// Goodbye story pilot: real rendered assets and HTML audio, isolated storage.
// No real user profile, microphone or recognition model is used by this suite.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'C:/Users/Jam/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const origin=new URL(process.env.TEST_URL||'http://127.0.0.1:24756').origin;
if(!['127.0.0.1','localhost','[::1]'].includes(new URL(origin).hostname))throw new Error('Use an isolated loopback test server.');
const out=path.resolve(process.env.XIAOYA_TEST_OUT||path.join(__dirname,'../test-results/xiaoya-story'));
const filter=process.env.XIAOYA_TEST_FILTER?new RegExp(process.env.XIAOYA_TEST_FILTER):null;
const STATE='xiaoya-english:state:v1',PREFS='xiaoya-english:preferences:v1';
const TARGET='/hello-04.mp3',FRAMES=['play','leave','wave','depart'];
const checks=[];let browser;

async function fixture(options={}){
  const c=await browser.newContext({viewport:{width:390,height:844},timezoneId:'Asia/Shanghai',serviceWorkers:'block',...options});
  const requests=[];c.on('request',r=>requests.push({url:r.url(),method:r.method()}));
  // A story never needs the speech model. Abort accidental model downloads.
  await c.route(/\/speech\/(?:vosk-.*\.js|model-.*\.tar\.gz)(?:\?.*)?$/,r=>r.abort('failed'));
  await c.addInitScript(({origin,PREFS})=>{
    if(location.origin!==origin)return;
    if(!localStorage.getItem(PREFS))localStorage.setItem(PREFS,JSON.stringify({welcome:true,mic:false,guideStep:'done'}));
    window.qa={errors:[],audios:[],plays:[],frames:[],hold:null,held:null};
    window.addEventListener('error',e=>qa.errors.push(e.message));
    window.addEventListener('unhandledrejection',e=>qa.errors.push(String(e.reason)));
    const NativeAudio=window.Audio;
    window.Audio=function(...args){
      const audio=new NativeAudio(...args),entry={audio,url:args[0]||'',ended:false};qa.audios.push(entry);
      audio.playbackRate=3;
      audio.addEventListener('playing',()=>{
        qa.plays.push({url:entry.url,frame:document.querySelector('[data-story-frame]')?.dataset.storyFrame||null,time:performance.now()});
        if(qa.hold&&entry.url.includes(qa.hold)){audio.pause();qa.held=entry;}
      });
      audio.addEventListener('ended',()=>entry.ended=true);return audio;
    };window.Audio.prototype=NativeAudio.prototype;
    new MutationObserver(()=>{
      const frame=document.querySelector('[data-story-frame]')?.dataset.storyFrame;
      if(frame&&qa.frames[qa.frames.length-1]?.frame!==frame)qa.frames.push({frame,time:performance.now()});
    }).observe(document,{subtree:true,childList:true,attributes:true,attributeFilter:['data-story-frame']});
  },{origin,PREFS});
  const p=await c.newPage();p.setDefaultTimeout(12000);
  try{await p.goto(origin+'/xiaoya/');await p.locator('[data-action="next-event"]').waitFor();return{c,p,requests};}
  catch(error){await c.close();throw error;}
}
async function state(p){return p.evaluate(key=>JSON.parse(localStorage.getItem(key)||'null'),STATE);}
async function click(p,action){await p.locator(`[data-action="${action}"]`).first().click();}
async function gate(p){if(await p.locator('#parent-answer').count()){const n=(await p.locator('label[for="parent-answer"]').textContent()).match(/\d+/g).map(Number);await p.locator('#parent-answer').fill(String(n[0]+n[1]));await click(p,'gate-submit');}}
async function parent(p){await click(p,'parent');await gate(p);await p.locator('.parent-view').waitFor();}
async function seedGoodbye(p,{completed=false,independent=false}={}){
  await p.evaluate(async({key,completed,independent})=>{
    const m=await import(new URL('learning.js',document.querySelector('script[type="module"][src]').src));
    let s=m.createState();for(const id of ['hello-morning','hello-welcome'])s=m.completeEvent(s,id,m.localDay());
    if(completed)s=m.completeEvent(s,'hello-goodbye',m.localDay());
    if(independent)s=m.recordEvidence(s,{attemptId:'story-fixture-independent',eventId:'hello-goodbye',contextId:'hello-goodbye',kind:'speech',result:'independent',source:'parent',helped:false,date:m.localDay(),phraseId:'hello-04'});
    localStorage.setItem(key,JSON.stringify(s));
  },{key:STATE,completed,independent});
  await p.reload();await p.locator('[data-action="next-event"]').waitFor();
}
async function startGoodbye(p){await seedGoodbye(p);await click(p,'next-event');await frame(p,'play');}
async function frame(p,name){await p.locator(`[data-phase="story"] [data-story-frame="${name}"]`).waitFor();}
async function throughStory(p){await frame(p,'depart');await p.locator('[data-action="story-continue"]:enabled').waitFor();}
async function targetPlays(p){return p.evaluate(t=>qa.plays.filter(x=>x.url.includes(t)),TARGET);}
async function assertNoEvidence(p){assert.deepEqual((await state(p))?.evidence||[],[]);}
async function workerReady(p){
  await p.waitForFunction(()=>!!navigator.serviceWorker.controller,{},{timeout:20000});
  const scope=await p.evaluate(async()=>(await navigator.serviceWorker.ready).scope);
  assert.equal(scope,origin+'/xiaoya/','Use the real Xiaoya worker in this isolated context');
}
async function layout(p){
  const bounds=await p.evaluate(()=>({width:innerWidth,height:innerHeight,scrollW:document.documentElement.scrollWidth,scrollH:document.documentElement.scrollHeight}));
  assert(bounds.scrollW<=bounds.width+1,`Horizontal overflow: ${JSON.stringify(bounds)}`);
  assert(bounds.scrollH<=bounds.height+1,`Vertical overflow: ${JSON.stringify(bounds)}`);
  const controls=await p.locator('main button:visible').evaluateAll(es=>es.map(e=>{const r=e.getBoundingClientRect();return {label:e.getAttribute('aria-label'),disabled:e.disabled,x:r.x,y:r.y,w:r.width,h:r.height};}));
  assert(controls.length>0);
  for(const r of controls){assert(r.w>=48&&r.h>=48,`Touch target under 48px: ${JSON.stringify(r)}`);assert(r.x>=-1&&r.y>=-1&&r.x+r.w<=bounds.width+1&&r.y+r.h<=bounds.height+1,`Hidden control: ${JSON.stringify(r)}`);}
  const primary=p.locator('main [data-primary]:visible');assert.equal(await primary.count(),1);
  assert(await primary.evaluate(e=>{const r=e.getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return hit===e||e.contains(hit);}), 'Main action is occluded');
}
async function diagnostic(p){return p.evaluate(()=>({build:document.querySelector('meta[name="xiaoya-build"]')?.content,phase:document.querySelector('main[data-phase]')?.dataset.phase,frame:document.querySelector('[data-story-frame]')?.dataset.storyFrame,frames:qa.frames,plays:qa.plays,audios:qa.audios.map(x=>({url:x.url,ended:x.ended,paused:x.audio.paused,src:x.audio.getAttribute('src')})),errors:qa.errors,state:localStorage.getItem('xiaoya-english:state:v1')})).catch(e=>({error:e.message}));}
async function test(name,fn,options){
  if(filter&&!filter.test(name))return;let f;
  try{f=await fixture(options);await fn(f);assert.deepEqual(await f.p.evaluate(()=>qa.errors),[]);assert(!f.requests.some(r=>r.method!=='GET'||new URL(r.url).origin!==origin),'No uploads or external requests');checks.push({name,status:'PASS',diagnostic:await diagnostic(f.p)});console.log('PASS',name);}
  catch(error){checks.push({name,status:'FAIL',error:error.stack,diagnostic:f?await diagnostic(f.p):null});console.error('FAIL',name,error.message);if(f)await f.p.screenshot({path:path.join(out,`failed-${checks.length}.png`),fullPage:true}).catch(()=>{});}
  finally{await f?.c.close();}
}

(async()=>{
  fs.mkdirSync(out,{recursive:true});
  browser=await chromium.launch({channel:'msedge',headless:true,args:['--autoplay-policy=no-user-gesture-required']});
  await test('First goodbye presents four story frames; target sound belongs to the wave frame',async({p})=>{
    await startGoodbye(p);assert.equal(await p.locator('[data-choice],[data-action="record"]').count(),0);
    assert.equal((await targetPlays(p)).length,0);await assertNoEvidence(p);
    await throughStory(p);
    assert.deepEqual(await p.evaluate(()=>qa.frames.map(x=>x.frame)),FRAMES);
    const plays=await targetPlays(p);assert.equal(plays.length,1);assert.equal(plays[0].frame,'wave');
    assert.equal(await p.locator('[data-choice]').count(),0);await assertNoEvidence(p);
    const media=await p.locator('[data-story-frame]').evaluate(async e=>{
      const background=getComputedStyle(e).backgroundImage,src=background.match(/url\(["']?(.*?)["']?\)/)?.[1];
      if(!src)return{background,width:0};
      const image=new Image();image.src=src;await image.decode();return{background,width:image.naturalWidth,height:image.naturalHeight};
    });
    assert(media.width>0&&media.height>0,'Story artwork really decoded');
    await p.screenshot({path:path.join(out,'story-depart-390.png'),fullPage:true});
  });
  await test('Story participation and supported practice never become independent listening or speech',async({p})=>{
    await startGoodbye(p);await throughStory(p);await click(p,'story-continue');await p.locator('[data-phase="request"]').waitFor();
    assert.equal(await p.locator('[data-choice]').count(),0);await assertNoEvidence(p);
    await click(p,'observe');await gate(p);assert(await p.locator('#observed-help').isChecked());assert(await p.locator('#observed-help').isDisabled());
    await p.locator('[data-observation="independent"]').click();
    const s=await state(p);assert.equal(s.evidence.length,1);assert.equal(s.evidence[0].kind,'speech');assert.equal(s.evidence[0].result,'supported');assert.equal(s.evidence[0].helped,true);
    assert.equal(s.evidence.filter(x=>x.kind==='listening').length,0);
  });
  await test('Replay and Chinese help restart the story; leaving stops held target audio and late progression',async({p})=>{
    await startGoodbye(p);await throughStory(p);let n=(await targetPlays(p)).length;
    await click(p,'story-replay');await frame(p,'play');await throughStory(p);assert.equal((await targetPlays(p)).length,n+1);
    n=(await targetPlays(p)).length;await click(p,'story-help');await frame(p,'play');await throughStory(p);assert.equal((await targetPlays(p)).length,n+1);
    await p.evaluate(t=>qa.hold=t,TARGET);await click(p,'story-replay');await p.waitForFunction(()=>!!qa.held);
    const heldCount=await p.evaluate(()=>qa.audios.length);await click(p,'home');await p.locator('.focus-home').waitFor();
    assert(await p.evaluate(n=>qa.audios.slice(0,n).every(x=>x.audio.paused&&x.audio.getAttribute('src')===null),heldCount));
    n=(await targetPlays(p)).length;await p.waitForTimeout(2200);assert.equal((await targetPlays(p)).length,n);assert.equal(await p.locator('[data-phase="story"]').count(),0);await assertNoEvidence(p);
  });
  await test('Practice can repeat the sound; teaching and Chinese help replay the story without stale evidence',async({p})=>{
    await startGoodbye(p);await throughStory(p);await click(p,'story-continue');
    const n=(await targetPlays(p)).length;await click(p,'sample');await p.waitForFunction(({target,n})=>qa.plays.filter(x=>x.url.includes(target)).length===n+1,{target:TARGET,n});
    assert.equal(await p.locator('[data-phase="request"]').count(),1);
    await click(p,'observe');await gate(p);assert(await p.locator('#observed-help').isChecked());assert(await p.locator('#observed-help').isDisabled());await click(p,'close');
    await click(p,'teach');await frame(p,'play');await throughStory(p);
    await click(p,'story-continue');await click(p,'context-help');await frame(p,'play');await throughStory(p);
    await assertNoEvidence(p);assert.equal(await p.locator('[data-choice]').count(),0);
  });
  await test('Independent parent speech and listening checks bypass the story and keep the answer hidden',async({p})=>{
    await seedGoodbye(p);await parent(p);await p.locator('[data-checkup="hello-goodbye"]').click();await p.locator('[data-phase="request"]').waitFor();
    assert.equal(await p.locator('[data-phase="story"]').count(),0);await p.waitForTimeout(2200);assert.equal((await targetPlays(p)).length,0);
    await click(p,'home');await parent(p);await p.locator('[data-listening="hello-goodbye"]').click();await p.locator('[data-listening-neutral]').waitFor();
    assert.equal(await p.locator('[data-phase="story"],[data-choice]').count(),0);
    assert.equal(await p.locator('[data-listening-neutral] [data-scene],[data-listening-neutral] img').count(),0);
    assert.equal((await targetPlays(p)).length,0);await click(p,'sample');await p.locator('[data-choice="target"]').waitFor();
    assert.equal(await p.locator('[data-phase="story"]').count(),0);await p.locator('[data-choice="target"]').click();
    const s=await state(p);assert.equal(s.evidence.length,1);assert.equal(s.evidence[0].kind,'listening');assert.equal(s.evidence[0].result,'independent');assert.equal(s.evidence[0].helped,false);
  });
  await test('Refresh restarts unfinished teaching; a participation reward does not skip learning',async({p})=>{
    await startGoodbye(p);await frame(p,'leave');await p.reload();await p.locator('.focus-home').waitFor();await assertNoEvidence(p);
    await click(p,'next-event');await frame(p,'play');await click(p,'home');
    // Furniture selects the completed goodbye directly without depending on
    // theme scheduling or rewriting application state internals.
    await seedGoodbye(p,{completed:true});await click(p,'house');await p.locator('[data-inventory="cloud-cushion"]').click();await click(p,'furniture-play');await frame(p,'play');await assertNoEvidence(p);
  });
  await test('A failed target sound stays at the waving frame and a fresh tap can recover',async({c,p})=>{
    const target=/\/hello-04\.mp3(?:\?.*)?$/;
    await c.route(target,r=>r.abort('failed'));await startGoodbye(p);
    await p.locator('[data-action="story-audio"]:enabled').waitFor();await frame(p,'wave');
    assert.equal(await p.locator('[data-action="story-continue"]').count(),0);await assertNoEvidence(p);
    await c.unroute(target);await click(p,'story-audio');await throughStory(p);
    const plays=await targetPlays(p);assert.equal(plays.length,1);assert.equal(plays[0].frame,'wave');await assertNoEvidence(p);
  });
  await test('Opening and closing a parent modal pauses teaching safely and allows replay',async({p})=>{
    await startGoodbye(p);await frame(p,'leave');await click(p,'parent');await p.locator('.modal-card').waitFor();
    const n=(await targetPlays(p)).length;await p.waitForTimeout(2400);assert.equal((await targetPlays(p)).length,n);
    await click(p,'close');await click(p,'story-replay');await frame(p,'play');await throughStory(p);await assertNoEvidence(p);
  });
  await test('The direct story trial has one start target and preserves existing learning and preferences',async({p})=>{
    await seedGoodbye(p,{completed:true,independent:true});
    const before=await p.evaluate(({STATE,PREFS})=>({state:localStorage.getItem(STATE),prefs:localStorage.getItem(PREFS)}),{STATE,PREFS});
    await p.goto(origin+'/xiaoya/?story=hello-goodbye');await p.locator('[data-action="start-story"]').waitFor();
    assert.equal(await p.locator('main button').count(),1);assert.equal((await targetPlays(p)).length,0);
    await click(p,'start-story');await frame(p,'play');await throughStory(p);
    assert.deepEqual(await p.evaluate(({STATE,PREFS})=>({state:localStorage.getItem(STATE),prefs:localStorage.getItem(PREFS)}),{STATE,PREFS}),before);
    await click(p,'story-continue');await p.locator('[data-phase="request"]').waitFor();
    assert.deepEqual(await p.evaluate(({STATE,PREFS})=>({state:localStorage.getItem(STATE),prefs:localStorage.getItem(PREFS)}),{STATE,PREFS}),before);
  });
  await test('First viewing caches its artwork even before a service worker controls the page',async({p})=>{
    // The blocked worker matches a first visit before registration/activation.
    // Decode the launch preview first so the later Image can reuse memory bytes.
    await p.goto(origin+'/xiaoya/?story=hello-goodbye');await p.locator('[data-action="start-story"]').waitFor();
    assert.equal(await p.evaluate(()=>navigator.serviceWorker.controller),null);
    const mediaUrl=await p.locator('[data-story-frame]').evaluate(async e=>{
      const src=getComputedStyle(e).backgroundImage.match(/url\(["']?(.*?)["']?\)/)?.[1];
      const image=new Image();image.src=src;await image.decode();return src;
    });
    const cachedBefore=await p.evaluate(async url=>{for(const name of await caches.keys())if(await(await caches.open(name)).match(url))return true;return false;},mediaUrl);
    assert.equal(cachedBefore,false,'A launch preview alone does not explicitly cache unused story media');
    await click(p,'start-story');await frame(p,'play');await throughStory(p);
    assert.equal(await p.evaluate(()=>navigator.serviceWorker.controller),null);
    await p.waitForFunction(async url=>{
      for(const name of await caches.keys())if(name.startsWith('xiaoya-core-')){
        const response=await(await caches.open(name)).match(url);if(response?.status===200)return(await response.blob()).size>0;
      }
      return false;
    },mediaUrl);
    await assertNoEvidence(p);
  });
  await test('Story artwork is lazy; watched artwork and English still work after an offline refresh',async({c,p,requests})=>{
    await workerReady(p);
    assert(!requests.some(r=>/\/xiaoya\/stories\//.test(r.url)),'Normal first screen must not fetch story artwork');
    const cachedStoryBefore=await p.evaluate(async()=>{for(const name of await caches.keys())for(const r of await(await caches.open(name)).keys())if(/\/xiaoya\/stories\//.test(r.url))return r.url;return null;});
    assert.equal(cachedStoryBefore,null,'Story artwork must not be part of the core precache');
    await startGoodbye(p);await workerReady(p);await throughStory(p);
    const mediaUrl=await p.locator('[data-story-frame]').evaluate(e=>getComputedStyle(e).backgroundImage.match(/url\(["']?(.*?)["']?\)/)?.[1]);
    assert(mediaUrl,'Rendered story identifies its real artwork');
    await p.waitForFunction(async({mediaUrl,target})=>{
      let artwork=false,audio=false;
      for(const name of await caches.keys()){
        const cache=await caches.open(name);artwork=artwork||!!await cache.match(mediaUrl);
        for(const r of await cache.keys())if(r.url.includes(target))audio=audio||(await cache.match(r))?.status===200;
      }
      return artwork&&audio;
    },{mediaUrl,target:TARGET});
    await c.setOffline(true);await p.reload();await p.locator('[data-action="next-event"]').waitFor();
    await click(p,'next-event');await frame(p,'play');await throughStory(p);
    const plays=await targetPlays(p);assert.equal(plays.length,1);assert.equal(plays[0].frame,'wave');
    const decoded=await p.evaluate(async src=>{const image=new Image();image.src=src;await image.decode();return image.naturalWidth>0;},mediaUrl);
    assert(decoded,'Cached story artwork decodes offline');await assertNoEvidence(p);
  },{serviceWorkers:'allow'});
  for(const [width,height,reducedMotion] of [[320,568,'no-preference'],[390,844,'no-preference'],[320,568,'reduce']])await test(`Story controls fit ${width}x${height}, motion ${reducedMotion}`,async({p})=>{
    await startGoodbye(p);await layout(p);await throughStory(p);await layout(p);
    assert(!/[a-zA-Z]/.test(await p.locator('.app-shell').innerText()),'Child story contains no visible English letters');
    if(reducedMotion==='reduce'){
      assert(await p.evaluate(()=>matchMedia('(prefers-reduced-motion: reduce)').matches));
      const running=await p.locator('main').evaluate(e=>e.getAnimations({subtree:true}).filter(a=>a.playState==='running'&&Number(a.effect?.getTiming().duration)>20).length);
      assert.equal(running,0,'Reduced motion must not keep decorative animations running');
    }
    await p.screenshot({path:path.join(out,`story-${width}-${reducedMotion}.png`),fullPage:true});
    await click(p,'story-continue');await p.locator('[data-phase="request"]').waitFor();await layout(p);
  },{viewport:{width,height},isMobile:true,hasTouch:true,reducedMotion});
  await browser.close();browser=null;
  fs.writeFileSync(path.join(out,filter?'results-filtered.json':'results.json'),JSON.stringify(checks,null,2));
  console.log(`${checks.filter(x=>x.status==='PASS').length}/${checks.length} passed`);
  if(!checks.length||checks.some(x=>x.status==='FAIL'))process.exitCode=1;
})().catch(async error=>{console.error(error);await browser?.close();process.exitCode=1;});
