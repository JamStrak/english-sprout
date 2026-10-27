// A/B garden + current phrase-first story browser regression. Uses disposable contexts
// only; never attaches to a user's browser or reads their localStorage.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'C:/Users/Jam/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const origin=new URL(process.env.TEST_URL||'http://127.0.0.1:24756').origin;
if(!['127.0.0.1','localhost','[::1]'].includes(new URL(origin).hostname))throw new Error('Use an isolated loopback test server.');
const out=path.resolve(process.env.XIAOYA_TEST_OUT||path.join(__dirname,'../test-results/xiaoya-ab'));
const filter=process.env.XIAOYA_TEST_FILTER?new RegExp(process.env.XIAOYA_TEST_FILTER):null;
const A_KEY='xiaoya-english:garden:v1',B_KEY='xiaoya-english:meadow:v1',STATE_KEY='xiaoya-english:state:v1';
const checks=[];let browser;

async function fixture(options={}){
  const {query='',...contextOptions}=options;
  const c=await browser.newContext({viewport:{width:390,height:844},timezoneId:'Asia/Shanghai',serviceWorkers:'block',...contextOptions});
  const requests=[];c.on('request',r=>requests.push({url:r.url(),method:r.method()}));
  await c.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort('blockedbyclient'));
  await c.route(/\/(?:xiaoya\/speech\/|speech\/(?:vosk-|model-))/,r=>r.abort('failed'));
  await c.addInitScript(origin=>{
    if(location.origin!==origin)return;
    window.qa={errors:[],audios:[],plays:[],frames:[]};
    window.addEventListener('error',e=>qa.errors.push(e.message));
    window.addEventListener('unhandledrejection',e=>qa.errors.push(String(e.reason)));
    const NativeAudio=window.Audio;
    window.Audio=function(...args){
      const audio=new NativeAudio(...args),entry={audio,url:String(args[0]||''),ended:false,error:false};qa.audios.push(entry);audio.playbackRate=3;
      audio.addEventListener('playing',()=>qa.plays.push({url:entry.url,frame:document.querySelector('[data-story-frame]')?.dataset.storyFrame??null,event:document.querySelector('main[data-event]')?.dataset.event??null}));
      audio.addEventListener('ended',()=>entry.ended=true);audio.addEventListener('error',()=>entry.error=true);return audio;
    };window.Audio.prototype=NativeAudio.prototype;
    new MutationObserver(()=>{
      const e=document.querySelector('main[data-phase="story"] [data-story-frame]');if(!e)return;
      const frame=e.dataset.storyFrame,event=e.closest('main').dataset.event,last=qa.frames[qa.frames.length-1];
      if(!last||last.frame!==frame||last.event!==event)qa.frames.push({frame,event});
    }).observe(document,{subtree:true,childList:true,attributes:true,attributeFilter:['data-story-frame']});
  },origin);
  const p=await c.newPage();p.setDefaultTimeout(20000);
  try{await p.goto(origin+'/xiaoya/'+query);await p.locator('main.home-view').waitFor();return{c,p,requests};}
  catch(error){await c.close();throw error;}
}
async function click(p,action){await p.locator(`[data-action="${action}"]`).first().click();}
async function parent(p){
  await click(p,'parent');
  if(await p.locator('#parent-answer').count()){
    const digits=(await p.locator('label[for="parent-answer"]').textContent()).match(/\d+/g).map(Number);
    await p.locator('#parent-answer').fill(String(digits[0]+digits[1]));await click(p,'gate-submit');
  }
  await p.locator('.parent-view').waitFor();
}
async function snapshot(p){return p.evaluate(()=>Object.fromEntries(Object.keys(localStorage).sort().map(key=>[key,localStorage.getItem(key)])));}
async function seedA(p,{plants=3,rounds=4}={}){
  // The retired A model is a migration fixture only; it is not publicly shipped.
  const m=await import(pathToFileURL(path.join(__dirname,'../xiaoya/garden.js')).href);
  let s=m.createGarden();
  for(let i=0;i<rounds;i++){
    s=m.rewardRound(s,{roundId:`qa-a-${i}`,eventId:['food-water','play-box','hello-goodbye'][i%3],date:'2026-10-17'});
    if(i<plants){s=m.plantSeed(m.openSeedPack(s));const id=s.plants[s.plants.length-1].id;s=m.waterPlant(m.waterPlant(s,id),id);}
  }
  const raw=JSON.stringify(s);
  await p.evaluate(({key,raw})=>localStorage.setItem(key,raw),{key:A_KEY,raw});
  await p.reload();await p.locator('main.home-view').waitFor();return raw;
}
async function openGarden(p,variant){
  await click(p,'garden');await p.locator(variant==='b'?'.meadow-view':'.garden-view:not(.meadow-view)').waitFor();
}
async function switchVariant(p,variant){
  await parent(p);await p.locator(`[data-variant="${variant}"]`).click();
  await click(p,'home');await p.locator('main.home-view').waitFor();
}
async function meadow(p){return p.evaluate(key=>JSON.parse(localStorage.getItem(key)||'null'),B_KEY);}
async function seedB(p,{rounds=1,plants=0,waterings={},pending=false}={}){
  const value=await p.evaluate(async({key,rounds,plants,waterings,pending})=>{
    const m=await import(new URL('garden-meadow.js',document.querySelector('script[type="module"][src]').src));
    let s=m.rewardRound(m.createMeadow(),{roundId:'qa-b-starter',eventId:'food-water',date:'2026-10-17'});
    // `rounds` describes the original watering budget for the interaction
    // scenarios. Earn it through the current one-resource-per-round rules.
    for(let i=1;i<rounds;i++){
      const roundId=`qa-b-water-${i}`;s=m.rewardRound(s,{roundId,eventId:'play-box',date:'2026-10-17'});s=m.claimReward(s,roundId,'water');
    }
    const purchases=plants+Number(pending);
    for(let i=0;s.shells<purchases*m.ECONOMY.packPrice;i++){
      const roundId=`qa-b-shells-${i}`;s=m.rewardRound(s,{roundId,eventId:'hello-goodbye',date:'2026-10-17'});s=m.claimReward(s,roundId,'shells');
    }
    // Deterministic injected draws select the specimens needed by growth tests;
    // the product UI remains random, covered separately by the economy suite.
    const specimens=['daisy','bow-pink','giant-daisy','bow-blue'];
    for(let i=0;i<purchases;i++){
      const flower=specimens[i%specimens.length],draw=i===0?0:(m.FLOWERS.findIndex(f=>f.id===flower)+.1)/m.FLOWERS.length;
      s=m.openSeedPack(s,draw);
      if(i<plants)s=m.plantSeed(s,{x:.2+(i%3)*.3,y:.7-(Math.floor(i/3)%2)*.3});
    }
    for(const [id,count] of Object.entries(waterings))for(let i=0;i<count;i++)s=m.waterPlant(s,id);
    localStorage.setItem(key,JSON.stringify(s));return s;
  },{key:B_KEY,rounds,plants,waterings,pending});
  await p.reload();await p.locator('main.home-view').waitFor();return value;
}
async function fieldPoint(p,x,y){const r=await p.locator('[data-meadow-field]').boundingBox();assert(r);return{x:r.x+r.width*x,y:r.y+r.height*y};}
async function buyPack(p){await click(p,'shop');await p.locator('.seed-shop-view').waitFor();await click(p,'shop-pack');await p.locator('.blindbox-view[data-blindbox-phase="choose"]').waitFor();await p.locator('[data-mystery-bag="0"]').click();await p.locator('.blindbox-view[data-blindbox-phase="revealed"]').waitFor();await click(p,'blindbox-plant');await p.locator('.meadow-view[data-tool="seed"]').waitFor();}
async function tapField(p,x,y){const point=await fieldPoint(p,x,y);await p.mouse.click(point.x,point.y);}
async function plantRootPoint(plant){
  // The button canvas includes transparent sky; click the painted soil-level
  // silhouette, whose hit path intentionally excludes that empty rectangle.
  const hit=await plant.evaluate(e=>{
    const svg=e.querySelector('svg[data-growth]'),anchor=svg.querySelector('[data-feedback-anchor]');
    const point=new DOMPoint(Number(anchor.getAttribute('cx')),Number(anchor.getAttribute('cy'))-4).matrixTransform(svg.getScreenCTM());
    return{x:point.x,y:point.y,id:e.dataset.meadowPlant,hit:document.elementFromPoint(point.x,point.y)?.closest('[data-meadow-plant]')?.dataset.meadowPlant};
  });
  assert.equal(hit.hit,hit.id,'The actual soil-level plant silhouette must receive the pointer');return{x:hit.x,y:hit.y};
}
async function tapPlantRoot(p,plant,clickCount=1){const point=await plantRootPoint(plant);await p.mouse.click(point.x,point.y,{clickCount});}
async function selectedSeedTo(p,x,y){const count=await p.locator('[data-meadow-plant]').count();await click(p,'meadow-seed');await tapField(p,x,y);await p.waitForFunction(n=>document.querySelectorAll('[data-meadow-plant]').length===n,count+1);}
async function untouchedLearning(p){assert.equal(await p.evaluate(key=>localStorage.getItem(key),STATE_KEY),null,'Participation is not evidence of language mastery');}
async function childLayout(p){
  await p.evaluate(async()=>Promise.all(document.getAnimations().filter(a=>Number.isFinite(a.effect?.getTiming().iterations)&&a.playState==='running').map(a=>a.finished.catch(()=>{}))));
  const b=await p.evaluate(()=>({width:innerWidth,height:innerHeight,scrollW:document.documentElement.scrollWidth,scrollH:document.documentElement.scrollHeight}));
  assert(b.scrollW<=b.width+1,`Horizontal overflow: ${JSON.stringify(b)}`);
  assert(b.scrollH<=b.height+1,`Main actions require page scrolling: ${JSON.stringify(b)}`);
  assert(!/[a-zA-Z]/.test(await p.locator('#app main:visible').innerText()),'No visible English letters in child content; the header version badge and separate GM workbench are excluded');
  const targets=await p.locator('#app button:visible').evaluateAll(es=>es.map(e=>{const r=e.getBoundingClientRect();return{label:e.getAttribute('aria-label'),x:r.x,y:r.y,w:r.width,h:r.height};}));
  for(const r of targets){
    assert(r.w>=47&&r.h>=47,`Touch target under 48px: ${JSON.stringify(r)}`);
    assert(r.x>=-1&&r.y>=-1&&r.x+r.w<=b.width+1&&r.y+r.h<=b.height+1,`Hidden touch target: ${JSON.stringify(r)}`);
  }
}
async function touchDrag(f,from,to,{cancel=false}={}){
  const session=await f.c.newCDPSession(f.p);
  try{
    await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:from.x,y:from.y,radiusX:5,radiusY:5,force:1}]});
    for(let i=1;i<=7;i++)await session.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:from.x+(to.x-from.x)*i/7,y:from.y+(to.y-from.y)*i/7,radiusX:5,radiusY:5,force:1}]});
    await session.send('Input.dispatchTouchEvent',{type:cancel?'touchCancel':'touchEnd',touchPoints:[]});
  }finally{await session.detach();}
}
async function center(locator){const r=await locator.boundingBox();assert(r,'Touch target exists');return{x:r.x+r.width/2,y:r.y+r.height/2};}
async function storyInfo(p,id){return p.evaluate(async id=>{const m=await import(new URL('stories.js',document.querySelector('script[type="module"][src]').src));const s=m.storyFor(id);return{id:s.id,lessonId:s.event.lessonId,cueFrame:s.cueFrame,frames:s.frames,teachingFrames:s.teachingFrames,image:s.image};},id);}
async function startStory(p,id){
  await parent(p);
  const target=p.locator(`[data-story="${id}"]`);
  // The parent library deliberately keeps extension lessons in nested details.
  // Expand each actual ancestor using its visible summary before choosing it.
  const depth=await target.evaluate(e=>{let n=0;for(let a=e.parentElement;a;a=a.parentElement)if(a.tagName==='DETAILS')n++;return n;});
  for(let i=depth;i>=1;i--){const details=target.locator(`xpath=ancestor::details[${i}]`);if(!await details.evaluate(e=>e.open))await details.locator(':scope>summary').click();}
  await target.click();await p.locator(`[data-phase="story"][data-event="${id}"]`).waitFor();
}
async function silentRequest(p){
  await click(p,'story-continue');await p.locator('[data-phase="request"]').waitFor();
  // The primary mic is now actionable on its first tap. These garden tests
  // deliberately decline recording and continue through the assisted route.
  await p.locator('[data-action="disable-mic"]').waitFor();await click(p,'disable-mic');
}
async function throughStory(p,id){
  await p.locator('[data-action="story-continue"]:enabled').waitFor({timeout:30000});
  const s=await storyInfo(p,id),frames=await p.evaluate(id=>qa.frames.filter(x=>x.event===id).map(x=>x.frame),id);
  assert.deepEqual([...new Set(frames)],s.teachingFrames.map(String),'The story plays only its meaningful teaching beats before speaking');
  const plays=await p.evaluate(({id,lesson})=>qa.plays.filter(x=>x.event===id&&x.url.endsWith(`/${lesson}.mp3`)),{id,lesson:s.lessonId});
  assert(plays.length>0,'The real local target audio played');assert(plays.every(x=>x.frame===String(s.cueFrame)),'Target audio is coupled to its meaning frame');
  assert.equal(await p.locator('[data-choice]').count(),0,'The old answer-matching quiz is absent');
  assert.equal(await p.locator('[data-story-frame] svg').count(),s.image?0:1,'Generated stories use their single picture; vector extension stories retain their semantic illustration');
  await childLayout(p);await untouchedLearning(p);return s;
}
async function diagnostic(p){return p.evaluate(()=>({build:document.querySelector('meta[name="xiaoya-build"]')?.content,main:document.querySelector('main')?.outerHTML,storage:Object.fromEntries(Object.keys(localStorage).filter(k=>k.startsWith('xiaoya')).map(k=>[k,localStorage.getItem(k)])),qa:{errors:qa.errors,frames:qa.frames,plays:qa.plays,audios:qa.audios.map(x=>({url:x.url,ended:x.ended,error:x.error,paused:x.audio.paused}))}})).catch(error=>({error:error.message}));}
async function test(name,fn,options){
  if(filter&&!filter.test(name))return;let f;
  try{
    f=await fixture(options);await fn(f);assert.deepEqual(await f.p.evaluate(()=>qa.errors),[]);
    assert(!f.requests.some(r=>r.method!=='GET'||new URL(r.url).origin!==origin),'No uploads or third-party requests');
    checks.push({name,status:'PASS',diagnostic:await diagnostic(f.p)});console.log('PASS',name);
  }catch(error){
    checks.push({name,status:'FAIL',error:error.stack,diagnostic:f?await diagnostic(f.p):null});console.error('FAIL',name,error.message);
    if(f)await f.p.screenshot({animations:'disabled',path:path.join(out,`failed-${checks.length}.png`),fullPage:true}).catch(()=>{});
  }finally{await f?.c.close();}
}

async function runCases(){
  await test('A is the default and parent A/B switching preserves both independent gardens',async({p})=>{
    const rawA=await seedA(p);await openGarden(p,'a');
    assert.equal(await p.locator('[data-meadow-field]').count(),0);
    await switchVariant(p,'b');await seedB(p);await openGarden(p,'b');await buyPack(p);
    await selectedSeedTo(p,.43,.68);const b=await meadow(p);
    assert.equal(b.plants.length,1);assert.equal(b.plants[0].waterings,0);
    assert.equal(await p.evaluate(key=>localStorage.getItem(key),A_KEY),rawA);
    await switchVariant(p,'a');await openGarden(p,'a');
    assert.equal(await p.locator('[data-plant]').count(),3);assert.equal(await p.evaluate(key=>localStorage.getItem(key),A_KEY),rawA);
    assert.deepEqual(await meadow(p),b);
    await p.reload();await openGarden(p,'a');
    await switchVariant(p,'b');await openGarden(p,'b');assert.deepEqual(await meadow(p),b);await untouchedLearning(p);
  },{reducedMotion:'reduce'});
  await test('URL previews temporarily select a garden without replacing the saved parent choice',async({p})=>{
    await seedB(p);await openGarden(p,'b');
    await p.goto(origin+'/xiaoya/');await p.locator('main.home-view').waitFor();
    // A can have no progress, so visit the garden through a parent-saved B choice
    // and prove a later temporary A preview leaves that choice intact.
    await switchVariant(p,'b');await openGarden(p,'b');
    await p.goto(origin+'/xiaoya/?garden=a');await p.locator('main.home-view').waitFor();
    await seedA(p,{plants:1,rounds:1});await openGarden(p,'a');
    await p.goto(origin+'/xiaoya/');await p.locator('main.home-view').waitFor();await openGarden(p,'b');
  },{query:'?garden=b'});
  await test('A parent choice replaces a URL preview and survives refresh in either direction',async({p})=>{
    const rawA=await seedA(p);const beforeB=await seedB(p);await openGarden(p,'b');
    await switchVariant(p,'a');assert.equal(new URL(p.url()).searchParams.has('garden'),false,'Explicit parent choice removes the temporary URL override');
    await p.reload();await p.locator('main.home-view').waitFor();await openGarden(p,'a');
    await p.goto(origin+'/xiaoya/?garden=a');await p.locator('main.home-view').waitFor();await openGarden(p,'a');
    await switchVariant(p,'b');assert.equal(new URL(p.url()).searchParams.has('garden'),false);
    await p.reload();await p.locator('main.home-view').waitFor();await openGarden(p,'b');
    assert.equal(await p.evaluate(key=>localStorage.getItem(key),A_KEY),rawA);assert.deepEqual(await meadow(p),beforeB);await untouchedLearning(p);
  },{query:'?garden=b',reducedMotion:'reduce'});
  await test('B pending seed survives refresh without purchase or variety changes and preserves A',async({p})=>{
    const rawA=await seedA(p),before=await seedB(p,{rounds:2});await openGarden(p,'b');
    await buyPack(p);const bought=await meadow(p);
    assert.deepEqual([bought.shells,bought.water,bought.seedPacksOpened,bought.plants.length],[before.shells-2,before.water,before.seedPacksOpened+1,before.plants.length]);
    assert.equal(bought.pendingSeed.id,'seed-1');
    await p.reload();await openGarden(p,'b');assert.deepEqual(await meadow(p),bought);
    await selectedSeedTo(p,.37,.73);const planted=await meadow(p);
    assert.equal(planted.pendingSeed,null);assert.equal(planted.plants.length,1);assert.equal(planted.plants[0].seedId,bought.pendingSeed.id);
    assert.equal(planted.plants[0].flowerId,bought.pendingSeed.flowerId);
    assert(Math.abs(planted.plants[0].x-.37)<.07&&Math.abs(planted.plants[0].y-.73)<.07,'Seed preserves a free coordinate instead of snapping to a fixed pot');
    await tapField(p,.68,.72);assert.deepEqual(await meadow(p),planted,'An already consumed seed cannot be planted twice');
    assert.equal(await p.evaluate(key=>localStorage.getItem(key),A_KEY),rawA);await untouchedLearning(p);
  },{query:'?garden=b',reducedMotion:'reduce'});
  await test('Five explicit pours grow a normal flower; bare taps and mature taps spend no water',async({p})=>{
    await seedB(p,{rounds:2,pending:true});await openGarden(p,'b');await selectedSeedTo(p,.4,.72);
    const initial=await meadow(p);const plant=p.locator('[data-meadow-plant="plant-1"]');
    await tapPlantRoot(p,plant);assert.deepEqual(await meadow(p),initial,'A plant tap without a held watering tool cannot water');
    await click(p,'meadow-can');const stages=[];
    for(let i=1;i<=5;i++){
      await p.locator('[data-water-plant="plant-1"]').click();await p.waitForFunction(({key,i})=>JSON.parse(localStorage.getItem(key)).plants[0].waterings===i,{key:B_KEY,i});
      const state=await meadow(p);assert.equal(state.water,initial.water-i);assert.equal(state.plants[0].waterings,i);
      stages.push(await plant.locator('svg[data-growth]').getAttribute('data-growth'));
      assert.equal(await plant.locator('svg[data-bloom]').getAttribute('data-bloom'),String(i===5));
    }
    assert.equal(new Set(stages).size,5,'Every watering has a distinct visible growth state');
    const mature=await meadow(p);await tapPlantRoot(p,plant);await tapPlantRoot(p,plant,2);assert.deepEqual(await meadow(p),mature);
    await p.reload();await openGarden(p,'b');assert.deepEqual(await meadow(p),mature);await untouchedLearning(p);
    await p.screenshot({animations:'disabled',path:path.join(out,'normal-flower-five-pours.png'),fullPage:true});
  },{query:'?garden=b',reducedMotion:'reduce'});
  await test('True touch seed and water drags each commit once, without follow-up click spending',async f=>{
    const {p}=f;await seedB(p,{rounds:2,pending:true});await openGarden(p,'b');
    const pending=await meadow(p);await touchDrag(f,await center(p.locator('[data-action="meadow-seed"]')),{x:10,y:10});
    assert.deepEqual(await meadow(p),pending,'Dropping a seed outside the grass does not consume it');
    await touchDrag(f,await center(p.locator('[data-action="meadow-seed"]')),await fieldPoint(p,.42,.69),{cancel:true});
    assert.deepEqual(await meadow(p),pending,'An interrupted touch drag does not spend or plant the seed');assert.equal(await p.locator('.meadow-drag-ghost').count(),0,'An interrupted gesture clears its floating tool');
    await touchDrag(f,await center(p.locator('[data-action="meadow-seed"]')),await fieldPoint(p,.64,.69));
    await p.locator('[data-meadow-plant="plant-1"]').waitFor();const planted=await meadow(p);
    assert.equal(planted.plants.length,1);assert.equal(planted.plants[0].waterings,0);assert.equal(planted.pendingSeed,null);
    assert(Math.abs(planted.plants[0].x-.64)<.07&&Math.abs(planted.plants[0].y-.69)<.07,'Touch release sets the seed position');
    await touchDrag(f,await center(p.locator('[data-action="meadow-can"]')),await fieldPoint(p,.05,.95));assert.deepEqual(await meadow(p),planted,'Dropping water on empty grass does not spend water');
    await touchDrag(f,await center(p.locator('[data-action="meadow-can"]')),await center(p.locator('[data-meadow-plant="plant-1"]')));
    await p.waitForFunction(key=>JSON.parse(localStorage.getItem(key)).plants[0].waterings>0,B_KEY);
    await p.waitForTimeout(350);const poured=await meadow(p);assert.equal(poured.plants[0].waterings,1);assert.equal(poured.water,planted.water-1);
    await childLayout(p);await untouchedLearning(p);
    await p.screenshot({animations:'disabled',path:path.join(out,'touch-meadow-390.png'),fullPage:true});
  },{query:'?garden=b',isMobile:true,hasTouch:true,reducedMotion:'reduce'});
  await test('Giant flowers need ten pours, keep their saved position and visibly exceed ordinary flowers',async({p})=>{
    await seedB(p,{rounds:4,plants:3,waterings:{'plant-1':5,'plant-2':5}});await openGarden(p,'b');
    const giant=p.locator('[data-meadow-plant="plant-3"]');await click(p,'meadow-can');
    for(let i=1;i<=9;i++){await p.locator('[data-water-plant="plant-3"]').click();await p.waitForFunction(({key,i})=>JSON.parse(localStorage.getItem(key)).plants[2].waterings===i,{key:B_KEY,i});assert.equal(await giant.locator('[data-bloom]').getAttribute('data-bloom'),'false');}
    const nine=await meadow(p);assert.equal(nine.water,1);
    await p.reload();await openGarden(p,'b');assert.deepEqual(await meadow(p),nine);await click(p,'meadow-can');await p.locator('[data-water-plant="plant-3"]').click();await p.waitForFunction(key=>JSON.parse(localStorage.getItem(key)).plants[2].waterings===10,B_KEY);
    const ten=await meadow(p);assert.equal(ten.plants[2].waterings,10);assert.equal(ten.water,0);assert.equal(await giant.locator('[data-bloom]').getAttribute('data-bloom'),'true');
    assert.equal(await giant.locator('[data-giant]').getAttribute('data-giant'),'true');
    const large=await giant.boundingBox(),small=await p.locator('[data-meadow-plant="plant-1"]').boundingBox();
    assert(large.width>small.width*1.4||large.height>small.height*1.4,'Giant flower has a larger on-screen silhouette');
    await giant.click();assert.deepEqual(await meadow(p),ten);await untouchedLearning(p);
    await p.screenshot({animations:'disabled',path:path.join(out,'giant-and-bow-bloom.png'),fullPage:true});
  },{query:'?garden=b',reducedMotion:'reduce'});
  await test('Colored bow flowers join the collection only after they bloom',async({p})=>{
    await seedB(p,{rounds:4,plants:4,waterings:{'plant-2':5,'plant-4':5}});await openGarden(p,'b');const before=await meadow(p);
    await click(p,'meadow-collection');await p.locator('.meadow-collection').waitFor();
    assert.equal(await p.locator('.flower-stamp.collected').count(),2);
    for(const id of ['bow-pink','bow-blue'])assert.equal(await p.locator(`.flower-stamp.collected svg[data-flower="${id}"][data-bloom="true"]`).count(),1);
    assert.equal(await p.locator('.flower-stamp.collected svg[data-flower="giant-daisy"]').count(),0);
    await p.screenshot({animations:'disabled',path:path.join(out,'colored-bow-collection.png'),fullPage:true});
    await click(p,'close');await p.locator('.meadow-view').waitFor();assert.deepEqual(await meadow(p),before);await untouchedLearning(p);
  },{query:'?garden=b',reducedMotion:'reduce'});
  await test('After three plants B stays quiet, while explicit help highlights its real tool',async({p})=>{
    await seedB(p,{rounds:4,plants:3,pending:true});const audioCount=await p.evaluate(()=>qa.audios.length);await openGarden(p,'b');
    await p.waitForTimeout(350);assert.equal(await p.locator('.meadow-view').getAttribute('data-guidance'),'quiet');assert.equal(await p.evaluate(()=>qa.audios.length),audioCount,'Experienced children do not hear another automatic planting explanation');
    assert.equal(await p.locator('.meadow-hand').count(),0,'There is no floating hand without a target');
    const invitations=await p.locator('.meadow-tool.inviting').evaluateAll(es=>es.map(e=>getComputedStyle(e).animationName));assert(invitations.every(x=>x==='none'),'Experienced users do not receive constantly bouncing tool hints');
    await click(p,'meadow-seed');assert.equal(await p.locator('.meadow-landing').isVisible(),false,'The beginner planting hand is hidden after three plants');
    await click(p,'help');const target=p.locator('[data-action="meadow-seed"].is-guided');await target.waitFor();
    const guide=await target.evaluate(e=>({outline:getComputedStyle(e).outlineWidth,animation:getComputedStyle(e).animationName}));assert.equal(guide.outline,'3px');assert(guide.animation.includes('guide-glow'),'Requested help visibly points to the same seed tool as its voice');
    await p.waitForFunction(()=>qa.plays.some(x=>x.url.endsWith('/meadow-seed.mp3')));await p.screenshot({animations:'disabled',path:path.join(out,'quiet-garden-help.png'),fullPage:true});
    await click(p,'meadow-can');assert.equal(await p.locator('[data-water-plant]').count(),3);
    for(const target of await p.locator('[data-water-plant]').all()){
      const point=await center(target),id=await target.getAttribute('data-water-plant');
      assert.equal(await p.evaluate(({x,y})=>document.elementFromPoint(x,y)?.closest('[data-water-plant]')?.dataset.waterPlant,point),id,'The held watering can shows a separate reachable drop for every unfinished plant');
      assert(await target.evaluate(e=>e.getAnimations({subtree:true}).some(a=>a.playState==='running'&&a.effect?.getTiming().iterations===Infinity)),'Each drop visibly invites touch after the can is selected');
    }await untouchedLearning(p);
  },{query:'?garden=b',reducedMotion:'no-preference'});
  await test('Two tabs serialize queued pours against the latest balance without losing either operation',async({c,p})=>{
    await seedB(p,{rounds:1,plants:1});await openGarden(p,'b');await click(p,'meadow-can');
    const other=await c.newPage();await other.goto(origin+'/xiaoya/?garden=b');await other.locator('main.home-view').waitFor();await openGarden(other,'b');await click(other,'meadow-can');
    // Hold the app's real cross-tab lock so both independent gestures queue
    // before either tab receives the other's storage event.
    await p.evaluate(key=>{navigator.locks.request(key,()=>new Promise(resolve=>{qa.releaseGardenLock=resolve;}));},B_KEY);
    await p.waitForFunction(()=>typeof qa.releaseGardenLock==='function');
    try{
      await Promise.all([p,other].map(tab=>tab.locator('[data-water-plant="plant-1"]').click()));
    }finally{await p.evaluate(()=>qa.releaseGardenLock());}
    await p.waitForFunction(key=>JSON.parse(localStorage.getItem(key)).plants[0].waterings===2,B_KEY);
    const state=await meadow(p);assert.equal(state.water,3);assert.equal(state.plants[0].waterings,2);assert.deepEqual(await meadow(other),state);
    assert.deepEqual(await other.evaluate(()=>qa.errors),[]);await other.close();await untouchedLearning(p);
  },{query:'?garden=b',reducedMotion:'reduce'});
  for(const [width,height,reducedMotion] of [[320,568,'no-preference'],[320,568,'reduce'],[768,1024,'no-preference']])await test(`Meadow touch controls fit ${width}x${height}, motion ${reducedMotion}`,async({p})=>{
    await seedB(p,{rounds:3,plants:2,pending:true});await openGarden(p,'b');await childLayout(p);
    await selectedSeedTo(p,.62,.7);await childLayout(p);await click(p,'meadow-can');await p.locator('[data-water-plant="plant-3"]').click();await childLayout(p);
    assert.equal((await meadow(p)).plants[2].waterings,1);
    await p.screenshot({animations:'disabled',path:path.join(out,`meadow-${width}-${reducedMotion}.png`),fullPage:true});
  },{query:'?garden=b',viewport:{width,height},isMobile:true,hasTouch:true,reducedMotion});
  await test('A giant seed placed at the grass edge stays visible and reachable as it grows',async({p})=>{
    await seedB(p,{rounds:3,plants:2,pending:true});await openGarden(p,'b');await selectedSeedTo(p,.98,.28);await click(p,'meadow-can');
    for(let i=1;i<=10;i++){await p.locator('[data-water-plant="plant-3"]').click();await p.waitForFunction(({key,i})=>JSON.parse(localStorage.getItem(key)).plants[2].waterings===i,{key:B_KEY,i});}
    await childLayout(p);const field=await p.locator('[data-meadow-field]').boundingBox(),plant=await p.locator('[data-meadow-plant="plant-3"]').boundingBox();
    assert(plant.x>=field.x-1&&plant.y>=field.y-1&&plant.x+plant.width<=field.x+field.width+1&&plant.y+plant.height<=field.y+field.height+1,'Growing flowers remain inside the visible grass at its boundaries');
    await p.mouse.move(plant.x+plant.width/2,plant.y+plant.height/2);await p.mouse.down();
    try{const held=await p.locator('[data-meadow-plant="plant-3"]').boundingBox();assert(Math.abs((held.x+held.width/2)-(plant.x+plant.width/2))<3&&Math.abs((held.y+held.height)-(plant.y+plant.height))<5,'Press feedback preserves the flower soil anchor');}finally{await p.mouse.up();}
    await p.screenshot({animations:'disabled',path:path.join(out,'giant-edge-320.png'),fullPage:true});
  },{query:'?garden=b',viewport:{width:320,height:568},isMobile:true,hasTouch:true,reducedMotion:'reduce'});
  await test('Cached B meadow and growth controls remain usable after a real offline reload',async({c,p})=>{
    await seedB(p,{rounds:1,plants:1});await openGarden(p,'b');
    await p.waitForFunction(()=>!!navigator.serviceWorker.controller,undefined,{timeout:25000});
    assert.equal(await p.evaluate(async()=>(await navigator.serviceWorker.ready).scope),origin+'/xiaoya/');
    await click(p,'meadow-can');await p.locator('[data-water-plant="plant-1"]').click();await p.waitForFunction(key=>JSON.parse(localStorage.getItem(key)).plants[0].waterings===1,B_KEY);const before=await meadow(p);
    await c.setOffline(true);await p.reload();await p.locator('main.home-view').waitFor();await openGarden(p,'b');
    assert.deepEqual(await meadow(p),before);await click(p,'meadow-can');await p.locator('[data-water-plant="plant-1"]').click();await p.waitForFunction(key=>JSON.parse(localStorage.getItem(key)).plants[0].waterings===2,B_KEY);
    const after=await meadow(p);assert.equal(after.plants[0].waterings,before.plants[0].waterings+1);assert.equal(after.water,before.water-1);
    await childLayout(p);await untouchedLearning(p);
  },{query:'?garden=b',serviceWorkers:'allow',reducedMotion:'reduce'});
  for(const id of ['food-hungry','play-roll','care-teeth','outside-rain','bed-hug'])await test(`Expanded story ${id} teaches with meaningful wordless frames and correctly timed local audio`,async({p})=>{
    await startStory(p,id);const s=await throughStory(p,id);assert.deepEqual(s.teachingFrames,[s.cueFrame],'These phrases move directly from the meaning picture to speaking');
    assert.equal(Boolean(s.image),id==='food-hungry','The core phrase has its supplied paper picture; extension phrases retain vector illustrations');
    await p.screenshot({animations:'disabled',path:path.join(out,`story-${id}.png`),fullPage:true});
    await silentRequest(p);await childLayout(p);
    assert.equal(await p.locator('[data-action="sample"]').count(),1);assert.equal(await p.locator('[data-action="context-help"]').count(),1);await untouchedLearning(p);
  },{query:'?garden=b',reducedMotion:'reduce'});
  await test('An expanded story completes the B reward loop once without falsely recording mastery',async({p})=>{
    const rawA=await seedA(p);await startStory(p,'food-spoon');await throughStory(p,'food-spoon');
    await silentRequest(p);await click(p,'watch');await p.locator('[data-phase="resolved"]').waitFor();
    await p.locator('[data-action="finish"]').evaluate(button=>{button.click();button.click();});await p.locator('.reward-view').waitFor();
    const rewarded=await meadow(p);assert.deepEqual([rewarded.shells,rewarded.water,rewarded.rounds.length],[2,5,1]);assert.equal(rewarded.rounds[0].eventId,'food-spoon');assert.equal(rewarded.rounds[0].reward,'starter');
    assert.equal(await p.evaluate(key=>localStorage.getItem(key),A_KEY),rawA);await untouchedLearning(p);
    await click(p,'garden');await p.locator('.meadow-view').waitFor();await buyPack(p);await selectedSeedTo(p,.53,.69);await click(p,'meadow-can');
    for(let i=1;i<=5;i++){await p.locator('[data-water-plant="plant-1"]').click();await p.waitForFunction(({key,i})=>JSON.parse(localStorage.getItem(key)).plants[0].waterings===i,{key:B_KEY,i});}
    const complete=await meadow(p);assert.deepEqual([complete.shells,complete.water,complete.plants[0].waterings],[0,0,5]);await childLayout(p);await untouchedLearning(p);
  },{query:'?garden=b',reducedMotion:'reduce'});
  await test('A reward queued before switching to B remains attached to its original garden',async({p})=>{
    const rawA=await seedA(p),before=JSON.parse(rawA);await startStory(p,'food-spoon');await throughStory(p,'food-spoon');await silentRequest(p);await click(p,'watch');await p.locator('[data-phase="resolved"]').waitFor();
    await p.evaluate(key=>{navigator.locks.request(key,()=>new Promise(resolve=>{qa.releaseRewardLock=resolve;}));},A_KEY);await p.waitForFunction(()=>typeof qa.releaseRewardLock==='function');
    try{await p.locator('[data-action="finish"]').evaluate(button=>button.click());await switchVariant(p,'b');}finally{await p.evaluate(()=>qa.releaseRewardLock());}
    await p.waitForFunction(({key,n})=>JSON.parse(localStorage.getItem(key)).rounds.length===n,{key:A_KEY,n:before.rounds.length+1});
    const after=JSON.parse((await snapshot(p))[A_KEY]);assert.equal(after.shells,before.shells+3);assert.equal(after.water,before.water+2);assert.equal(after.rounds.at(-1).eventId,'food-spoon');assert.equal(await meadow(p),null);
    await untouchedLearning(p);
  },{reducedMotion:'reduce'});
  await test('Expanded vector story and cached English audio replay after a real offline reload',async({c,p})=>{
    await startStory(p,'outside-rain');const s=await throughStory(p,'outside-rain');await click(p,'home');
    await p.waitForFunction(()=>!!navigator.serviceWorker.controller,undefined,{timeout:25000});
    await c.setOffline(true);await p.reload();await p.locator('main.home-view').waitFor();await startStory(p,'outside-rain');await throughStory(p,'outside-rain');
    const target=await p.evaluate(lesson=>qa.audios.filter(x=>x.url.endsWith(`/${lesson}.mp3`)).map(x=>({ended:x.ended,error:x.error})),s.lessonId);
    assert(target.some(x=>x.ended&&!x.error),'Cached target audio finishes in offline mode');await untouchedLearning(p);
  },{query:'?garden=b',serviceWorkers:'allow',reducedMotion:'reduce'});
}
(async()=>{
  fs.mkdirSync(out,{recursive:true});
  browser=await chromium.launch({channel:'msedge',headless:true,args:['--autoplay-policy=no-user-gesture-required']});
  await runCases();
  if(!checks.length)throw new Error('No A/B cases ran; check the integration contract or test filter.');
  await browser.close();browser=null;
  fs.writeFileSync(path.join(out,filter?'results-filtered.json':'results.json'),JSON.stringify(checks,null,2));
  console.log(`${checks.filter(x=>x.status==='PASS').length}/${checks.length} passed`);
  if(checks.some(x=>x.status!=='PASS'))process.exitCode=1;
})().catch(async error=>{console.error(error);if(browser)await browser.close();process.exitCode=1;});
