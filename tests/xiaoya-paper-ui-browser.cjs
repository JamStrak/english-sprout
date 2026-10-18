// Isolated Edge touch/layout acceptance for the v0.10 paper UI. Public model
// APIs create valid synthetic saves; native Audio and images remain native.
// No user profile, microphone, recognition model or remote network is used.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'C:/Users/Jam/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const origin=new URL(process.env.TEST_URL||'http://127.0.0.1:24756').origin;
if(!['127.0.0.1','localhost','[::1]'].includes(new URL(origin).hostname))throw Error('Paper UI checks require a loopback server.');
const out=path.resolve(process.env.XIAOYA_PAPER_UI_OUT||path.join(__dirname,'../test-results/xiaoya-v10-ui'));
const filter=process.env.XIAOYA_TEST_FILTER?new RegExp(process.env.XIAOYA_TEST_FILTER):null;
const keys={a:'xiaoya-english:garden:v1',b:'xiaoya-english:meadow:v1',plan:'xiaoya-english:practice-plan:v1',learning:'xiaoya-english:state:v1'};
const report={origin,nativeTouch:true,nativeImageDecode:true,nativeAudio:true,playbackRate:4,syntheticSaveFixtures:true,microphoneUsed:false,asrAccuracyTested:false,physicalDeviceValidated:false,checks:[]};
let browser;
const tap=(p,action)=>p.locator(`[data-action="${action}"]`).first().tap();
const save=()=>fs.writeFileSync(path.join(out,filter?'results-filtered.json':'results.json'),JSON.stringify(report,null,2));
const shot=(p,name,fullPage=false)=>p.screenshot({animations:'disabled',path:path.join(out,`${name}.png`),fullPage});

async function fixture({width=390,height=844,motion='reduce',garden='a',missing=false,serviceWorkers=false,review=false}={}){
  const c=await browser.newContext({viewport:{width,height},timezoneId:'Asia/Shanghai',serviceWorkers:serviceWorkers?'allow':'block',isMobile:true,hasTouch:true,reducedMotion:motion});
  const requests=[],responses=[],errors=[];
  c.on('request',r=>requests.push({url:r.url(),method:r.method()}));
  c.on('response',r=>responses.push({url:r.url(),status:r.status(),worker:r.fromServiceWorker()}));
  c.on('page',p=>p.on('pageerror',e=>errors.push(e.message)));
  await c.route('**/*',route=>{
    const u=new URL(route.request().url());
    if(u.origin!==origin)return route.abort('blockedbyclient');
    if(missing&&/\/xiaoya\/paper\//.test(u.pathname))return route.fulfill({status:404,contentType:'text/plain',body:'QA: deliberately unavailable paper art'});
    return route.continue();
  });
  await c.addInitScript(({origin,review,keys})=>{
    if(location.origin!==origin)return;
    const NativeDate=Date,now=NativeDate.parse('2026-10-18T12:00:00+08:00');
    window.Date=class extends NativeDate{constructor(...args){super(...(args.length?args:[now]));}static now(){return now;}};
    if(review&&!sessionStorage.getItem('qa-paper-ui-review')){
      localStorage.setItem(keys.plan,JSON.stringify({schemaVersion:1,product:'xiaoya-english-practice-plan',entries:[{roundId:'qa-paper-ui-review',eventId:'family-love',date:'2026-10-17',attemptId:null,mode:'new',rewardVariant:null}]}));
      sessionStorage.setItem('qa-paper-ui-review','yes');
    }
    const q=window.qaPaperUI={errors:[],audios:[],microphoneCalls:0,renders:0,trustedTouches:0};
    addEventListener('error',e=>{if(e.message)q.errors.push(e.message);});
    addEventListener('unhandledrejection',e=>q.errors.push(String(e.reason)));
    addEventListener('pointerdown',e=>{if(e.isTrusted&&e.pointerType==='touch')q.trustedTouches++;},true);
    const NativeAudio=Audio;
    window.Audio=function(...args){const a=new NativeAudio(...args),entry={url:String(args[0]||''),ended:false,error:false};a.playbackRate=4;q.audios.push(entry);a.addEventListener('playing',()=>entry.playedAt=performance.now());a.addEventListener('ended',()=>entry.ended=true);a.addEventListener('error',()=>entry.error=true);return a;};window.Audio.prototype=NativeAudio.prototype;
    if(navigator.mediaDevices?.getUserMedia){const gum=navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);navigator.mediaDevices.getUserMedia=(...args)=>{q.microphoneCalls++;return gum(...args);};}
    new MutationObserver(records=>{q.renders+=records.filter(r=>r.type==='childList'&&r.target.id==='app').length;}).observe(document,{subtree:true,childList:true});
  },{origin,review,keys});
  const p=await c.newPage();p.setDefaultTimeout(20000);
  try{
    await p.goto(`${origin}/xiaoya/?story=family-love&garden=${garden}`,{waitUntil:'domcontentloaded'});await p.locator('main.home-view').waitFor();
    const version=await p.locator('meta[name="xiaoya-version"]').getAttribute('content'),build=await p.locator('meta[name="xiaoya-build"]').getAttribute('content');
    assert.equal(version,'0.10.0');if(report.build)assert.equal(build,report.build,'Build changed during suite');else{report.version=version;report.build=build;}
    return{c,p,requests,responses,errors,width,height,motion,garden};
  }catch(e){await c.close();throw e;}
}
async function measure(p,{parent=false,modal=false}={}){
  const result=await p.evaluate(({parent,modal})=>{
    // Closed details may retain nonzero layout rectangles in Edge after scrolling.
    // Native visibility excludes those hidden descendants without masking overlays.
    const root=document.documentElement,visible=e=>{const r=e.getBoundingClientRect(),s=getComputedStyle(e);return e.checkVisibility()&&r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none';};
    const scope=modal?document.querySelector('[role="dialog"]'):document.querySelector('#app');
    const controls=[...scope.querySelectorAll('button,input,summary')].filter(visible).map(e=>{
      const r=e.getBoundingClientRect(),topbar=!!e.closest('.topbar'),mainControl=!!e.closest('.event-controls'),minimum=topbar||mainControl?56:48;
      const inView=r.top>=-1&&r.bottom<=innerHeight+1,hit=inView?document.elementFromPoint(r.x+r.width/2,r.y+r.height/2):null;
      return{tag:e.tagName,action:e.dataset.action||e.dataset.variant||e.dataset.selectVoice||null,label:e.getAttribute('aria-label')||e.textContent.trim().slice(0,70),disabled:e.disabled||false,minimum,x:r.x,y:r.y,width:r.width,height:r.height,inView,hit:!!hit&&(hit===e||e.contains(hit)),hitTag:hit?.tagName,hitClass:typeof hit?.className==='string'?hit.className:null};
    });
    return{width:innerWidth,height:innerHeight,scrollWidth:root.scrollWidth,scrollHeight:root.scrollHeight,text:document.querySelector('main')?.innerText,controls,animations:document.getAnimations().filter(a=>a.playState==='running').map(a=>({duration:a.effect?.getTiming().duration,iterations:String(a.effect?.getTiming().iterations)})),reduced:matchMedia('(prefers-reduced-motion: reduce)').matches};
  },{parent,modal});
  assert(result.scrollWidth<=result.width+1,`Horizontal overflow: ${result.scrollWidth}/${result.width}`);
  if(!parent&&!modal)assert(result.scrollHeight<=result.height+1,`Child page exceeds viewport: ${result.scrollHeight}/${result.height}`);
  if(!parent)assert(!/[A-Za-z]/.test(result.text||''),'Child page must not expose English lettering');
  for(const b of result.controls){
    assert(b.width>=b.minimum-.5&&b.height>=b.minimum-.5,`Touch target smaller than ${b.minimum}px: ${JSON.stringify(b)}`);
    assert(b.x>=-1&&b.x+b.width<=result.width+1,`Horizontally clipped control: ${JSON.stringify(b)}`);
    if(!parent)assert(b.inView,`Control outside visible child/dialog area: ${JSON.stringify(b)}`);
    if(b.inView&&!b.disabled)assert(b.hit,`Control centre obscured: ${JSON.stringify(b)}`);
  }
  if(result.reduced)assert.equal(result.animations.length,0,'Reduced motion disables running decorative animations');
  return result;
}
async function waitArt(p,scope='.home-companion'){
  // The progressive SVG wrapper is public DOM; wait for its native image state.
  await p.locator(`${scope} image`).first().waitFor({state:'attached'});
  return p.locator(`${scope} image`).evaluateAll(async es=>Promise.all(es.map(async e=>{
    const href=e.getAttribute('href')||e.getAttribute('xlink:href');const im=new Image();im.src=href;await im.decode();
    return{href,width:im.naturalWidth,height:im.naturalHeight,opacity:getComputedStyle(e).opacity,pointerEvents:getComputedStyle(e).pointerEvents};
  })));
}
async function artVisible(p,scope='.home-companion'){
  const decoded=await waitArt(p,scope);
  await p.waitForFunction(scope=>[...document.querySelectorAll(`${scope} [data-paper-art]`)].every(e=>e.dataset.paperState==='ready'),scope);
  assert(decoded.length>0);const states=await p.locator(`${scope} [data-paper-art]`).evaluateAll(es=>es.map(e=>({state:e.dataset.paperState,image:getComputedStyle(e.querySelector('image')).opacity,fallback:getComputedStyle(e.querySelector('[data-paper-fallback]')).visibility})));
  assert(states.every(s=>s.state==='ready'&&Number(s.image)>0&&s.fallback==='hidden'),'Native art hides its procedural fallback only after successful loading');
  return decoded;
}
async function growthArt(p,scope,key,{fallback=false}={}){
  await p.waitForFunction(({scope,key,fallback})=>{const e=document.querySelector(`${scope} > svg [data-paper-art="${key}"]`);return e?.dataset.paperState===(fallback?'fallback':'ready');},{scope,key,fallback});
  if(!fallback)await artVisible(p,`${scope} > svg`);
  const item=await p.locator(`${scope} > svg [data-paper-art="${key}"]`).evaluate(e=>{const image=e.querySelector('image'),svg=e.closest('svg');return{key:e.dataset.paperArt,state:e.dataset.paperState,bloom:svg.dataset.bloom,growth:svg.dataset.growth,geometry:['x','y','width','height'].map(a=>Number(image.getAttribute(a))),imageOpacity:Number(getComputedStyle(image).opacity),fallbackVisibility:getComputedStyle(e.querySelector('[data-paper-fallback]')).visibility};});
  if(fallback){assert.equal(item.imageOpacity,0);assert.equal(item.fallbackVisibility,'visible');}else{assert.equal(item.imageOpacity,1);assert.equal(item.fallbackVisibility,'hidden');}
  if(!key.startsWith('flower-'))assert(!item.key.startsWith('flower-'),'No mature flower is revealed before full growth');return item;
}
async function homeCheck(f,name){
  const {p,requests}=f;await p.locator('.home-welcome .home-companion').waitFor();
  const art=await artVisible(p);assert(art.every(x=>x.width>100&&x.height>100),'Welcome uses actual decoded artwork');
  assert.equal(await p.locator('main [data-primary]').count(),1,'Exactly one primary action');
  assert.equal(await p.locator('main [data-primary]').getAttribute('data-action'),'next-event');
  assert.equal(await p.locator('main.home-view').getAttribute('data-next-event'),'family-love');
  assert.equal(await p.locator('.home-story-card').count(),0,'First home uses the fixed welcome character');
  assert.equal(await p.locator('main [data-picture-id]').count(),0,'No teaching picture placed on first home');
  await p.waitForTimeout(300);assert(!requests.some(r=>/\/stories\/.+\.webp/.test(r.url)),'First home does not fetch a lesson or garden picture');
  const screen=await measure(p);if(!screen.reduced)assert(screen.animations.length>0,'Normal motion runs its visual invitation before screenshot freezing');await shot(p,`${name}-home`);return{art,screen};
}
async function fullPicture(p){
  await p.locator('[data-picture-id="family-love"].single-picture').waitFor();
  const picture=await p.locator('[data-picture-id="family-love"]').evaluate(e=>{const s=getComputedStyle(e),r=e.getBoundingClientRect();return{width:parseFloat(s.width),height:parseFloat(s.height),backgroundSize:s.backgroundSize,backgroundPosition:s.backgroundPosition,background:s.backgroundImage,transform:s.transform,bounds:{x:r.x,y:r.y,width:r.width,height:r.height}};});
  assert(['cover','contain'].includes(picture.backgroundSize),'Single art cannot use a four-panel sprite zoom');assert.equal(picture.backgroundPosition,'50% 50%');assert.equal(picture.transform,'none');assert(picture.background.includes('love-paper-v1.webp'));
  const ratio=picture.width/picture.height,crop=picture.backgroundSize==='contain'?0:ratio>1.4?1-1.4/ratio:1-ratio/1.4;assert(crop<.018,`Single picture accidentally cropped: ${crop}`);return{...picture,ratio,crop};
}
async function eventCheck(f,name){
  const {p}=f;await tap(p,'next-event');await p.locator('main[data-event="family-love"][data-phase="story"]').waitFor();await p.locator('[data-action="story-continue"]:enabled').waitFor({timeout:35000});
  const picture=await fullPicture(p),screen=await measure(p);
  const controls=await p.locator('.event-controls button').evaluateAll(es=>es.map(e=>({action:e.dataset.action,label:e.getAttribute('aria-label'),svg:e.querySelector('svg')?.outerHTML})));
  assert.equal(controls.length,3);assert.deepEqual(controls.map(x=>x.action).sort(),['story-continue','story-help','story-replay']);assert.equal(new Set(controls.map(x=>x.label)).size,3);assert.equal(new Set(controls.map(x=>x.svg)).size,3,'Ear, microphone and help use different icons');
  await shot(p,`${name}-event`);await tap(p,'story-replay');await p.locator('main[data-phase="request"]').waitFor();
  const replay=await fullPicture(p);assert.equal(replay.background,picture.background,'Ear replay keeps the same full picture');
  await p.waitForFunction(()=>qaPaperUI.audios.filter(a=>/\/family-04\.mp3$/.test(a.url)&&a.ended).length>=2,undefined,{timeout:15000});
  assert.equal(await p.locator('[data-action="record"]').getAttribute('aria-busy'),'false');
  const request=await measure(p);await shot(p,`${name}-request`);return{picture,replay,screen,request,controls};
}
async function seed(p,variant,{rounds=5,plants=variant==='a'?1:2,pending=true,all=false}={}){
  return p.evaluate(async({variant,rounds,plants,pending,all,keys})=>{
    const m=await import(new URL(variant==='a'?'garden.js':'garden-meadow.js',document.querySelector('script[type="module"][src]').src));let s=variant==='a'?m.createGarden():m.createMeadow();
    for(let n=0;n<rounds;n++)s=m.rewardRound(s,{roundId:`qa-paper-ui-${variant}-${n}`,eventId:'family-love',date:'2026-10-18'});
    for(let n=0;n<plants;n++){
      s=m.openSeedPack(s);s=variant==='a'?m.plantSeed(s):m.plantSeed(s,{x:all?.15+(n%4)*.23:.22,y:all?.35+Math.floor(n/4)*.26:.83-n*.31});
      const plant=s.plants[s.plants.length-1],needed=variant==='a'?2:m.FLOWERS.find(f=>f.id===plant.flowerId).waterNeeded;
      for(let w=0;w<needed;w++)s=m.waterPlant(s,plant.id);
    }
    if(pending)s=m.openSeedPack(s);localStorage.setItem(keys[variant],JSON.stringify(s));return s;
  },{variant,rounds,plants,pending,all,keys});
}
const state=(p,variant)=>p.evaluate(key=>JSON.parse(localStorage.getItem(key)),keys[variant]);
async function enterGarden(p,variant){await p.goto(`${origin}/xiaoya/?story=family-love&garden=${variant}`,{waitUntil:'domcontentloaded'});await p.locator('main.home-view').waitFor();assert.equal(await p.locator('main [data-primary]').count(),1);await tap(p,'garden');await p.locator(variant==='a'?'.garden-view':'.meadow-view').waitFor();}
async function gardenACheck(f,name){
  const {p}=f;await seed(p,'a');await enterGarden(p,'a');const initial=await state(p,'a');assert(initial.pendingSeed);await measure(p);
  await tap(p,'plant');await p.waitForFunction(key=>JSON.parse(localStorage.getItem(key)).plants.length===2,keys.a);
  const seedStage=await growthArt(p,'[data-plant="plant-2"]','seed-in-soil');
  assert.equal((await state(p,'a')).pendingSeed,null);assert.equal(await p.locator('[data-action="water"] > svg').count(),1,'Water tool retains direct SVG wrapper');
  await tap(p,'water');await p.waitForFunction(key=>JSON.parse(localStorage.getItem(key)).plants[1].waterings===1,keys.a);await p.waitForTimeout(300);
  const first=await state(p,'a');assert.equal(first.water,initial.water-1,'One real touch pours once in A');
  const sproutStage=await growthArt(p,'[data-plant="plant-2"]','sprout');assert.notEqual(sproutStage.key,seedStage.key,'One pour visibly changes seed to sprout');
  const growing=await measure(p);await shot(p,`${name}-garden-a-growing`);await tap(p,'water');await p.waitForFunction(key=>JSON.parse(localStorage.getItem(key)).plants[1].waterings===2,keys.a);
  await artVisible(p,'.garden-plants');const screen=await measure(p);await shot(p,`${name}-garden-a`);assert.equal(await p.evaluate(key=>localStorage.getItem(key),keys.learning),null,'Garden activity cannot create language mastery');return{initial,first,final:await state(p,'a'),seedStage,sproutStage,growing,screen};
}
async function gardenBCheck(f,name){
  const {p}=f;await seed(p,'b');await enterGarden(p,'b');await artVisible(p,'.meadow-plant');const before=await state(p,'b');
  await tap(p,'meadow-seed');assert.equal(await p.locator('[data-action="meadow-seed"]').getAttribute('aria-pressed'),'true');const field=await p.locator('[data-meadow-field]').boundingBox();await p.touchscreen.tap(field.x+field.width*.75,field.y+field.height*.75);
  await p.waitForFunction(key=>JSON.parse(localStorage.getItem(key)).plants.length===3,keys.b);assert.equal((await state(p,'b')).pendingSeed,null);
  const seedStage=await growthArt(p,'[data-meadow-plant="plant-3"]','seed-in-soil');
  assert.equal(await p.locator('[data-action="meadow-can"] > svg').count(),1,'Water can retains direct SVG wrapper');await tap(p,'meadow-can');assert.equal(await p.locator('[data-action="meadow-can"]').getAttribute('aria-pressed'),'true');await p.locator('[data-meadow-plant="plant-3"]').tap();
  await p.waitForFunction(key=>JSON.parse(localStorage.getItem(key)).plants[2].waterings===1,keys.b);await p.waitForTimeout(300);const first=await state(p,'b');assert.equal(first.water,before.water-1,'One touch pours once in B');
  assert.equal(await p.locator('[data-meadow-plant="plant-3"] [data-bloom]').getAttribute('data-bloom'),'false');const sproutStage=await growthArt(p,'[data-meadow-plant="plant-3"]','sprout');assert.notDeepEqual(sproutStage.geometry,seedStage.geometry,'Each pour changes the growing paper geometry');
  const screen=await measure(p);await shot(p,`${name}-garden-b`);await tap(p,'meadow-collection');await p.locator('[role="dialog"] .meadow-collection').waitFor();const modal=await measure(p,{modal:true});await shot(p,`${name}-collection`);await tap(p,'close');await p.locator('[role="dialog"]').waitFor({state:'detached'});
  assert.equal(await p.evaluate(key=>localStorage.getItem(key),keys.learning),null);return{before,first,seedStage,sproutStage,screen,modal};
}
async function parent(p){await tap(p,'parent');if(await p.locator('#parent-answer').count()){const nums=(await p.locator('label[for="parent-answer"]').innerText()).match(/\d+/g).map(Number);await p.locator('#parent-answer').fill(String(nums[0]+nums[1]));await tap(p,'gate-submit');}await p.locator('.parent-view').waitFor();}
async function parentCheck(f,name){
  const {p}=f;await tap(p,'parent');await p.locator('#parent-answer').waitFor();const gate=await measure(p,{modal:true});await shot(p,`${name}-gate`);
  const nums=(await p.locator('label[for="parent-answer"]').innerText()).match(/\d+/g).map(Number);await p.locator('#parent-answer').fill(String(nums[0]+nums[1]));await tap(p,'gate-submit');await p.locator('.parent-view').waitFor();
  const screen=await measure(p,{parent:true});await shot(p,`${name}-parent`);await shot(p,`${name}-parent-full`,true);
  const choices=p.locator('[data-select-voice]');assert.equal(await choices.count(),3);await choices.nth(1).tap();assert.equal(await choices.nth(1).getAttribute('aria-pressed'),'true','One native touch selects a different voice');
  await p.locator('[data-action="mic-settings"]').tap();await p.locator('[role="dialog"]').waitFor();const modal=await measure(p,{parent:true,modal:true});await shot(p,`${name}-mic-settings`);await tap(p,'close');await p.locator('[role="dialog"]').waitFor({state:'detached'});
  const scanned=[];for(const element of await p.locator('.parent-view button:visible,.parent-view summary:visible').all()){
    await element.scrollIntoViewIfNeeded();const item=await element.evaluate(e=>{const r=e.getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return{label:e.getAttribute('aria-label')||e.textContent.trim().slice(0,55),width:r.width,height:r.height,left:r.left,right:r.right,hit:!!hit&&(hit===e||e.contains(hit))};});
    assert(item.width>=47.5&&item.height>=47.5,`Parent target too small: ${JSON.stringify(item)}`);assert(item.left>=-1&&item.right<=f.width+1,`Parent control clipped: ${JSON.stringify(item)}`);assert(item.hit,`Parent control obscured after scrolling: ${JSON.stringify(item)}`);scanned.push(item);
  }
  await measure(p,{parent:true});return{gate,screen,modal,scanned};
}
async function diagnostic(p){return p.evaluate(()=>({main:document.querySelector('main')?.outerHTML,dialog:document.querySelector('[role="dialog"]')?.outerHTML,qa:qaPaperUI})).catch(e=>({error:e.message}));}
async function test(name,fn,options){
  if(filter&&!filter.test(name))return;let f;
  try{f=await fixture(options);const evidence=await fn(f);assert.deepEqual(f.errors,[]);assert.deepEqual(await f.p.evaluate(()=>qaPaperUI.errors),[]);assert.equal(await f.p.evaluate(()=>qaPaperUI.microphoneCalls),0);assert(f.requests.every(r=>r.method==='GET'&&new URL(r.url).origin===origin));assert(!f.requests.some(r=>/\/(?:xiaoya\/speech\/|speech\/(?:vosk-|model-))/.test(r.url)),'No model downloads');report.checks.push({name,status:'PASS',evidence});console.log('PASS',name);
  }catch(e){report.checks.push({name,status:'FAIL',error:e.stack,diagnostic:f?await diagnostic(f.p):null});console.error('FAIL',name,e.message);process.exitCode=1;if(f)await shot(f.p,`failure-${report.checks.length}`,true).catch(()=>{});
  }finally{await f?.c.close();save();}
}
async function run(){
  for(const [width,height] of [[320,568],[390,844],[768,1024]])for(const motion of ['no-preference','reduce']){
    const tag=`${width}-${motion}`,options={width,height,motion};
    await test(`HOME ${tag}: fixed paper welcome, one primary and deferred story images`,f=>homeCheck(f,tag),options);
    await test(`EVENT ${tag}: full single picture, distinct 56px controls and native replay`,f=>eventCheck(f,tag),options);
    await test(`GARDEN-A ${tag}: native single-touch planting and watering with mature paper flowers`,f=>gardenACheck(f,tag),options);
    await test(`GARDEN-B ${tag}: seed, can, growing paper art and collection dialog`,f=>gardenBCheck(f,tag),{...options,garden:'b'});
    await test(`PARENT ${tag}: gate, voice choices, settings modal and scroll reachability`,f=>parentCheck(f,tag),options);
  }
  await test('DRAG 320px: seed and can ghosts show native paper art during real touch drag',async({c,p})=>{
    await seed(p,'b',{rounds:2,plants:0});await enterGarden(p,'b');const before=await state(p,'b'),session=await c.newCDPSession(p),ghosts=[];
    const drag=async(action,point,name)=>{
      const box=await p.locator(`[data-action="${action}"]`).boundingBox(),start={x:box.x+box.width/2,y:box.y+box.height/2};let down=false;
      try{
        await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...start,id:1}]});down=true;
        for(let step=1;step<=7;step++)await session.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:start.x+(point.x-start.x)*step/7,y:start.y+(point.y-start.y)*step/7,id:1}]});
        await p.locator('.meadow-drag-ghost').waitFor();const art=await artVisible(p,'.meadow-drag-ghost'),ghost=await p.locator('.meadow-drag-ghost').evaluate(e=>({pointerEvents:getComputedStyle(e).pointerEvents,position:getComputedStyle(e).position,key:e.querySelector('[data-paper-art]')?.dataset.paperArt}));assert.equal(ghost.pointerEvents,'none');assert.equal(ghost.position,'fixed');await shot(p,name);ghosts.push({action,art,ghost});
        await session.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});down=false;await p.locator('.meadow-drag-ghost').waitFor({state:'detached'});
      }finally{if(down)await session.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});}
    };
    const field=await p.locator('[data-meadow-field]').boundingBox();await drag('meadow-seed',{x:field.x+field.width*.63,y:field.y+field.height*.7},'320-native-seed-drag');await p.waitForFunction(key=>JSON.parse(localStorage.getItem(key)).plants.length===1,keys.b);const plant=await p.locator('[data-meadow-plant="plant-1"]').boundingBox();await drag('meadow-can',{x:plant.x+plant.width/2,y:plant.y+plant.height*.65},'320-native-can-drag');await p.waitForFunction(key=>JSON.parse(localStorage.getItem(key)).plants[0].waterings===1,keys.b);const after=await state(p,'b');assert.equal(after.water,before.water-1);await session.detach();return{ghosts,before,after,nativeTouch:true};
  },{width:320,height:568,motion:'no-preference',garden:'b'});
  await test('GROWTH: giant flower changes geometry on all ten real pours, with seed, sprout, bud and final bloom',async({p})=>{
    await seed(p,'b');await enterGarden(p,'b');await tap(p,'meadow-seed');const field=await p.locator('[data-meadow-field]').boundingBox();await p.touchscreen.tap(field.x+field.width*.75,field.y+field.height*.75);await p.locator('[data-meadow-plant="plant-3"]').waitFor();
    const before=await state(p,'b'),stages=[await growthArt(p,'[data-meadow-plant="plant-3"]','seed-in-soil')];assert.equal(before.plants[2].flowerId,'giant-daisy');await tap(p,'meadow-can');
    for(let n=1;n<=10;n++){
      await p.locator('[data-meadow-plant="plant-3"]').tap();await p.waitForFunction(n=>document.querySelector('[data-meadow-plant="plant-3"]')?.dataset.waterings===String(n),n);
      const stage=await growthArt(p,'[data-meadow-plant="plant-3"]',n===10?'flower-giant-daisy':n>=5?'bud':'sprout');assert.equal(stage.growth,String(n));assert.equal(stage.bloom,String(n===10));assert.notDeepEqual(stage.geometry,stages[n-1].geometry,`Pour ${n} changes visible geometry`);const renderedHeight=Math.min(stage.geometry[3],stage.geometry[2]/.75),rootY=stage.geometry[1]+stage.geometry[3]-renderedHeight+.88*renderedHeight;assert(Math.abs(rootY-164)<.02,'Actual painted root remains anchored on the soil at y164');assert(Math.abs(stage.geometry[0]+stage.geometry[2]*.5-80)<.02,'Root remains horizontally centred on the soil');stages.push(stage);
      assert.equal((await state(p,'b')).water,before.water-n,`Pour ${n} spends exactly one water`);
      if(n===5||n===10)await shot(p,`giant-paper-growth-${n}`);
    }
    await measure(p);return{stages,before,after:await state(p,'b')};
  },{garden:'b'});
  await test('ART: all twelve mature B flowers use native paper art, with clickable transparent SVG wrappers',async({p})=>{
    await seed(p,'b',{rounds:14,plants:12,pending:false,all:true});await enterGarden(p,'b');const mature=await artVisible(p,'.meadow-plant');assert.equal(mature.length,12);assert(mature.every(x=>x.width>100&&x.height>100));
    const pointer=await p.locator('.meadow-plant image').evaluateAll(es=>es.map(e=>getComputedStyle(e).pointerEvents));assert(pointer.every(x=>x==='none'),'Artwork does not intercept planting/watering controls');
    await tap(p,'meadow-collection');await p.locator('.flower-stamp.collected').first().waitFor();assert.equal(await p.locator('.flower-stamp.collected').count(),12);const collection=await artVisible(p,'.meadow-collection');assert.equal(collection.length,12);await measure(p,{modal:true});await shot(p,'all-twelve-paper-flowers');return{mature,collection,pointer};
  },{garden:'b'});
  await test('ART: paper image 404 retains stable visible SVG and live garden controls',async({p,requests})=>{
    await p.locator('.home-companion svg').waitFor();await p.waitForTimeout(500);const failed=()=>requests.filter(r=>/\/xiaoya\/paper\//.test(r.url)).length;assert(failed()>0,'Failure injected on actual paper image requests');
    const first=failed(),renders=await p.evaluate(()=>qaPaperUI.renders);await p.waitForTimeout(900);assert.equal(failed(),first,'No failed-image request loop');assert.equal(await p.evaluate(()=>qaPaperUI.renders),renders,'No failed-image render loop');
    const fallback=await p.locator('.home-companion svg').evaluate(e=>({size:e.getBoundingClientRect().width,paths:[...e.querySelectorAll('path,circle,ellipse,rect')].filter(n=>getComputedStyle(n).display!=='none'&&getComputedStyle(n).visibility!=='hidden').length,images:[...e.querySelectorAll('image')].map(n=>getComputedStyle(n).opacity),states:[...e.querySelectorAll('[data-paper-art]')].map(n=>n.dataset.paperState)}));assert(fallback.size>80);assert(fallback.paths>3);assert(fallback.images.every(x=>Number(x)===0));assert(fallback.states.every(x=>x==='fallback'));await measure(p);await shot(p,'paper-art-404-home');
    await seed(p,'b');await enterGarden(p,'b');await tap(p,'meadow-seed');const field=await p.locator('[data-meadow-field]').boundingBox();await p.touchscreen.tap(field.x+field.width*.75,field.y+field.height*.75);await p.waitForFunction(key=>JSON.parse(localStorage.getItem(key)).plants.length===3,keys.b);await tap(p,'meadow-can');await p.locator('[data-meadow-plant="plant-3"]').tap();await p.waitForFunction(key=>JSON.parse(localStorage.getItem(key)).plants[2].waterings===1,keys.b);const growthFallback=await growthArt(p,'[data-meadow-plant="plant-3"]','sprout',{fallback:true});await measure(p);await shot(p,'paper-art-404-garden');return{fallback,growthFallback,failedImageRequests:failed(),state:await state(p,'b')};
  },{garden:'b',missing:true});
  await test('OFFLINE: cached welcome survives cold page and unseen garden paper art falls back without blocking touch',async f=>{
    const {c,p}=f;await artVisible(p);const hero=await p.locator('.home-companion image').getAttribute('href'),url=new URL(hero,`${origin}/`).href;
    await p.waitForFunction(()=>!!navigator.serviceWorker.controller,undefined,{timeout:30000});
    await p.waitForFunction(async url=>{for(const name of await caches.keys())if(name.startsWith('xiaoya-core-')&&(await(await caches.open(name)).match(url))?.status===200)return true;return false;},url,{timeout:30000});
    const scope=await p.evaluate(async()=>(await navigator.serviceWorker.ready).scope);assert.equal(scope,`${origin}/xiaoya/`);await seed(p,'b');
    assert(!f.requests.some(r=>/\/paper\/v1\/flowers\//.test(r.url)),'Unvisited flower art must not be prefetched');
    await p.close();await c.setOffline(true);f.p=await c.newPage();f.p.setDefaultTimeout(20000);await f.p.goto(`${origin}/xiaoya/?story=family-love&garden=b`,{waitUntil:'domcontentloaded'});await f.p.locator('main.home-view').waitFor();assert.equal(await f.p.evaluate(()=>navigator.onLine),false);
    const nativeHero=await artVisible(f.p);await shot(f.p,'paper-ui-offline-cold-home');
    const [response,bytes]=await Promise.all([f.p.waitForResponse(r=>r.url()===url&&r.fromServiceWorker()).then(r=>({status:r.status(),worker:r.fromServiceWorker()})),f.p.evaluate(async url=>{const r=await fetch(url,{cache:'no-store'});return(await r.arrayBuffer()).byteLength;},url)]);assert.equal(response.status,200);assert(bytes>1000);
    await tap(f.p,'garden');await f.p.locator('.meadow-view').waitFor();await f.p.waitForFunction(()=>[...document.querySelectorAll('.meadow-plant [data-paper-art]')].every(e=>e.dataset.paperState==='fallback'));
    const fallback=await f.p.locator('.meadow-plant [data-paper-art]').evaluateAll(es=>es.map(e=>({key:e.dataset.paperArt,state:e.dataset.paperState,visibility:getComputedStyle(e.querySelector('[data-paper-fallback]')).visibility,opacity:getComputedStyle(e.querySelector('image')).opacity})));assert.equal(fallback.length,2);assert(fallback.every(x=>x.state==='fallback'&&x.visibility==='visible'&&Number(x.opacity)===0));
    const before=await state(f.p,'b');await tap(f.p,'meadow-seed');const field=await f.p.locator('[data-meadow-field]').boundingBox();await f.p.touchscreen.tap(field.x+field.width*.75,field.y+field.height*.75);await f.p.waitForFunction(key=>JSON.parse(localStorage.getItem(key)).plants.length===3,keys.b);await tap(f.p,'meadow-can');await f.p.locator('[data-meadow-plant="plant-3"]').tap();await f.p.waitForFunction(key=>JSON.parse(localStorage.getItem(key)).plants[2].waterings===1,keys.b);const after=await state(f.p,'b');assert.equal(after.water,before.water-1);const growthFallback=await growthArt(f.p,'[data-meadow-plant="plant-3"]','sprout',{fallback:true});await measure(f.p);await shot(f.p,'paper-ui-offline-unseen-garden');return{scope,nativeHero,response,bytes,fallback,growthFallback,before,after};
  },{garden:'b',serviceWorkers:true});
}
(async()=>{fs.mkdirSync(out,{recursive:true});browser=await chromium.launch({channel:'msedge',headless:true,args:['--no-proxy-server','--autoplay-policy=no-user-gesture-required']});await run();await browser.close();browser=null;if(!report.checks.length)throw Error('No paper UI checks matched');report.passed=report.checks.filter(x=>x.status==='PASS').length;report.total=report.checks.length;save();console.log(`${report.passed}/${report.total} paper UI checks passed · ${report.build}`);})().catch(async e=>{console.error(e);await browser?.close();process.exitCode=1;});
