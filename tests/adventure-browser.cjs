/* Actual built-app game journey checks in isolated Edge profiles.
 * Touch, audio and MediaRecorder are real browser APIs; speech recognition output
 * is an explicit test double. This is not a child-pronunciation or physical-iPad test. */
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'C:/Users/Jam/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {pathToFileURL}=require('node:url');
const root=path.resolve(__dirname,'..'),origin=(process.env.TEST_URL||'http://127.0.0.1:24736').replace(/\/$/, '');
const report=process.env.REPORT_NAME||'adventure-browser';
if(!/^[\w-]+$/.test(report))throw new Error('Invalid report name');
const out=path.join(root,'test-results',report),key='english-sprout-state-v1',today='2026-10-13';
const curriculum=JSON.parse(fs.readFileSync(path.join(root,'public/data/curriculum.json'),'utf8'));
fs.mkdirSync(out,{recursive:true});
const speech=`export async function prepareSpeech(){};
export async function assessRecording(url){window.qaBlob=typeof url==='string'&&url.startsWith('blob:');
if(window.qaSpeech==='error')throw new Error('Explicit unavailable recognizer fixture');
return window.qaSpeech==='miss'?{matched:false,stars:1}:{matched:true,stars:3};}`;
const checks=[];let browser,learning,garden,empty,learned,built;
const stored=p=>p.evaluate(k=>JSON.parse(localStorage.getItem(k)),key);
async function setup(initial=empty,viewport={width:390,height:844},options={}){
 const context=await browser.newContext({viewport,hasTouch:true,permissions:['microphone'],timezoneId:'Asia/Shanghai',serviceWorkers:options.offline?'allow':'block',reducedMotion:options.reduced?'reduce':'no-preference'});
 await context.addInitScript(({key,initial,options})=>{
  if(!localStorage.getItem(key))localStorage.setItem(key,JSON.stringify(initial));
  window.qaSounds=[];const NativeAudio=window.Audio;
  window.Audio=function(...args){const audio=new NativeAudio(...args);audio.addEventListener('playing',()=>window.qaSounds.push(audio.src));return audio;};window.Audio.prototype=NativeAudio.prototype;
  if(options.noAudio){window.AudioContext=undefined;window.webkitAudioContext=undefined;}
 },{key,initial,options});
 const page=await context.newPage();page.setDefaultTimeout(12000);page.setDefaultNavigationTimeout(45000);
 page.qaErrors=[];page.qaUploads=[];page.on('pageerror',error=>page.qaErrors.push(error.message));
 page.on('request',request=>{if(!['GET','HEAD'].includes(request.method()))page.qaUploads.push({url:request.url(),method:request.method()});});
 await page.clock.setFixedTime(new Date(today+'T10:00:00+08:00'));
 if(!options.offline)await page.route('**/src/speech-local.js',route=>route.fulfill({contentType:'text/javascript',body:speech}));
 try{
  await page.goto(origin+'/#home');await page.locator('.adventure-home #hero-start').waitFor();
  const current=await page.locator('meta[name="app-build"]').getAttribute('content');
  if(built)assert.equal(current,built,'Every test uses the same built app');else built=current;
  return {page,context};
 }catch(error){await context.close();throw error;}
}
async function test(name,callback,initial=empty,viewport,options){
 if(process.env.QA_FILTER&&!name.includes(process.env.QA_FILTER))return;
 let resources;
 try{resources=await setup(initial,viewport,options);const evidence=await callback(resources.page,resources.context);assert.deepEqual(resources.page.qaErrors,[]);assert.deepEqual(resources.page.qaUploads,[]);checks.push({name,status:'PASS',evidence:evidence||null});console.log('PASS '+name);}
 catch(error){checks.push({name,status:'FAIL',error:error.stack});console.error('FAIL '+name+' '+error.message);if(resources){const stamp=String(checks.length).padStart(2,'0');await resources.page.screenshot({path:path.join(out,stamp+'-failure.png')}).catch(()=>{});fs.writeFileSync(path.join(out,stamp+'-failure.json'),JSON.stringify({body:await resources.page.locator('body').innerText(),url:resources.page.url(),errors:resources.page.qaErrors,uploads:resources.page.qaUploads},null,2));}}
 finally{if(resources)await resources.context.close();}
}
async function geometry(page,label,selectors=[]){
 const result=await page.evaluate(selectors=>{
  const visible=e=>{const rect=e.getBoundingClientRect(),css=getComputedStyle(e);return rect.width&&rect.height&&css.visibility!=='hidden'&&css.display!=='none'&&!e.closest('[hidden]');};
  const elements=[...document.querySelectorAll(selectors.join(',')||'button')].filter(visible);
  const boxes=elements.map(element=>{const r=element.getBoundingClientRect();const top=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return {name:element.id||element.getAttribute('aria-label')||element.textContent.trim().slice(0,50),...r.toJSON(),enabled:!element.disabled,hit:top===element||element.contains(top)};});
  return {width:innerWidth,height:innerHeight,scrollWidth:document.documentElement.scrollWidth,scrollHeight:document.documentElement.scrollHeight,boxes};
 },selectors);
 assert.ok(result.scrollHeight<=result.height+2,`${label}: no vertical document scrolling ${JSON.stringify(result)}`);
 assert.ok(result.scrollWidth<=result.width+2,`${label}: no horizontal document scrolling`);
 for(const box of result.boxes){assert.ok(box.top>=-1&&box.left>=-1&&box.bottom<=result.height+1&&box.right<=result.width+1,`${label}: visible ${box.name}: ${JSON.stringify(box)}`);if(box.enabled)assert.ok(box.hit,`${label}: center of ${box.name} reachable`);}
 return result;
}
async function currentStep(page,step){
 const nodes=await page.locator('.quest-steps [data-quest-step]').evaluateAll(nodes=>nodes.map(n=>({step:n.dataset.questStep,current:n.getAttribute('aria-current'),classes:n.className})));
 assert.ok(nodes.length>=2,'Visible quest progression exists');
 const current=nodes.filter(n=>n.current==='step'||/(^|\s)(current|is-current)(\s|$)/.test(n.classes));
 assert.equal(current.length,1,'Exactly one step is current');assert.equal(current[0].step,step);
}
async function wallet(page){
 const inventory=garden.getGarden(await stored(page),today).inventory;
 for(const material of ['seeds','water']){
  const node=page.locator(`.adventure-wallet [data-material="${material}"],.adventure-wallet [data-wallet-material="${material}"],[data-world-tool="${material==='seeds'?'plant':'water'}"] strong`).first();
  assert.equal(await node.count(),1,`HUD exposes ${material}`);
  const number=await node.evaluate(element=>Number(element.dataset.value??element.textContent.match(/\d+/)?.[0]));
  assert.equal(number,inventory[material],`${material} HUD equals the saved reward ledger`);
 }
 return inventory;
}
async function rewardValues(page,before){
 const start=garden.getGarden(before,today).earned,end=garden.getGarden(await stored(page),today).earned;
 for(const material of ['seeds','water','fertilizer']){
  const value=await page.locator(`.earned-rewards [data-material="${material}"] strong`).innerText();
  assert.equal(Number(value.replace('+','')),end[material]-start[material],`${material} reward is the actual saved gain`);
 }
}
async function choose(page,{wrong=false}={}){
 const id=await page.locator('[data-lesson-id]').getAttribute('data-lesson-id'),lesson=curriculum.lessons.find(l=>l.id===id);
 if(wrong){await page.locator(`[data-choice="${(lesson.answerIndex+1)%lesson.choices.length}"]`).tap();assert.equal(await page.locator('#quiz-next').isVisible(),false);}
 await page.locator(`[data-choice="${lesson.answerIndex}"]`).tap();await page.locator('#quiz-next').waitFor({state:'visible'});await page.locator('#quiz-next').tap();return id;
}
async function record(page){
 const before=await page.locator('#record').boundingBox();assert.ok(before.height>=72&&before.width>=200,'Microphone remains a large primary action');
 await page.touchscreen.tap(before.x+8,before.y+before.height/2);
 await page.waitForFunction(()=>document.querySelector('#record')?.textContent.includes('停止录音'));
 await page.waitForTimeout(4000);await page.locator('#record').tap();
 await page.waitForFunction(()=>window.qaBlob===true);await page.locator('.speech-stars').waitFor();
}
async function matched(page){await record(page);assert.equal(await page.locator('.speech-stars').textContent(),'★★★');await page.locator('[data-speech-next]:visible').waitFor();}
async function go(page,target){await page.locator(`[data-go="${target}"]:visible`).first().tap();}
async function plantAndWater(page){
 await page.locator('[data-garden-world]').waitFor();const initial=await stored(page),before=garden.getGarden(initial,today);
 assert.ok(before.inventory.seeds>0&&before.inventory.water>0,'Completed learning offers usable garden material');
 await page.locator('[data-world-tool="plant"]').tap();
 let box=await page.locator('[data-garden-world]').boundingBox();await page.touchscreen.tap(box.x+box.width/2,box.y+box.height/2);
 await page.waitForFunction(k=>JSON.parse(localStorage.getItem(k)).garden.actions.some(a=>a.type==='world-plant'),key);
 await page.locator('[data-world-tool="water"]').tap();box=await page.locator('[data-garden-world]').boundingBox();await page.touchscreen.tap(box.x+box.width/2,box.y+box.height/2);
 await page.waitForFunction(k=>JSON.parse(localStorage.getItem(k)).garden.actions.some(a=>a.type==='world-water'),key);
 const after=await stored(page),world=garden.getGarden(after,today);
 assert.equal(world.inventory.seeds,before.inventory.seeds-1);assert.equal(world.inventory.water,before.inventory.water-1);assert.equal(world.worldPlants.length,before.worldPlants.length+1);
 assert.deepEqual(after.cards,initial.cards);assert.deepEqual(after.days,initial.days);return after;
}
(async()=>{
 learning=await import(pathToFileURL(path.join(root,'src/learning.js')));garden=await import(pathToFileURL(path.join(root,'src/garden.js')));
 empty=learning.createState(today);learned=learning.recordResult(learning.createState('2026-10-12'),'hello-01','good','2026-10-12',{isNew:true});
 browser=await chromium.launch({channel:'msedge',headless:true,args:['--no-proxy-server','--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream']});
 try{
  for(const viewport of [{width:320,height:568},{width:390,height:844},{width:768,height:1024}]){
   await test(`${viewport.width}: one quest, truthful HUD and reachable passport`,async page=>{
    assert.equal(await page.locator('.adventure-home').getAttribute('data-next-kind'),'learn');
    assert.equal(await page.locator('.adventure-home #hero-start').count(),1);assert.equal(await page.locator('.adventure-rank').count(),1);assert.equal(await page.locator('.adventure-rank').getAttribute('data-level'),'1');await wallet(page);
    const g=await geometry(page,'home',['#hero-start','#daily-picture','[data-adventure-passport]','[data-home-speech]','.bottom-nav button']);
    const start=await page.locator('#hero-start').boundingBox();assert.ok(start.height>=48,'Main quest remains at least a 48 px touch target');
    const before=await stored(page);await page.locator('[data-adventure-passport]').tap();await page.locator('.adventure-passport[open]').waitFor();await geometry(page,'passport',['.adventure-passport button']);
    await page.keyboard.press('Escape');assert.equal(await page.locator('.adventure-passport[open]').count(),0);assert.deepEqual(await stored(page),before,'Inspecting rank never awards progress');
    await page.screenshot({path:path.join(out,`home-${viewport.width}.png`)});return g;
   },empty,viewport);
   await test(`${viewport.width}: hear, meaning, speak, reward, then plant and water`,async page=>{
    await page.locator('#daily-picture').tap();await currentStep(page,'listen');await geometry(page,'listen',['.scene-picture','button[data-step]','#exit-session']);
    await page.locator('.scene-picture').tap();await page.waitForFunction(()=>window.qaSounds.some(src=>src.endsWith('.mp3')));
    await page.locator('[data-step="choose"]').tap();await currentStep(page,'choose');await geometry(page,'choose',['[data-choice]','#exit-session']);
    const lesson=await choose(page);await currentStep(page,'speak');await geometry(page,'speak',['#record','#replay-record','#exit-session','[data-rating]']);
    await matched(page);await geometry(page,'matched',['#record','[data-speech-next]']);await page.locator('[data-speech-next]').tap();
    await page.locator('.game-completion').waitFor();await geometry(page,'reward',['#completion-next','.game-completion [data-go]']);
    const earned=await stored(page);assert.equal(earned.days[today].results.length,1);assert.equal(earned.cards[lesson].due,'2026-10-14');assert.equal(earned.days[today].results[0].meaning,true);
    await rewardValues(page,empty);await page.screenshot({path:path.join(out,`reward-${viewport.width}.png`)});
    await page.locator('.game-completion [data-go="garden"]').tap();await plantAndWater(page);await wallet(page);await geometry(page,'garden',['[data-world-tool]','[data-world-practice]','.bottom-nav button']);
    await page.screenshot({path:path.join(out,`garden-${viewport.width}.png`)});
   },empty,viewport);
  }
  await test('Review quest first; silent recall and meaning required before reward',async page=>{
   assert.equal(await page.locator('.adventure-home').getAttribute('data-next-kind'),'review');await wallet(page);const before=await stored(page),played=await page.evaluate(()=>window.qaSounds.length);
   await page.locator('#hero-start').tap();assert.equal(await page.locator('.practice-english').count(),0);assert.equal(await page.evaluate(()=>window.qaSounds.length),played);await currentStep(page,'remember');
   await page.locator('[data-step="speak"]').tap();await currentStep(page,'speak');await matched(page);await page.locator('[data-speech-next]').tap();
   assert.deepEqual(await stored(page),before,'Speech matching alone cannot complete a recall or award learning');await currentStep(page,'choose');await choose(page);await page.locator('.game-completion').waitFor();
   const after=await stored(page);assert.equal(after.days[today].results.length,1);assert.equal(after.days[today].results[0].meaning,true);assert.equal(after.days[today].results[0].isNew,false);assert.equal(after.days[today].results[0].rating,'good');await rewardValues(page,before);
  },learned);
  await test('Old saved lesson and garden survive passive game screens and reload',async page=>{
   const before=await stored(page);await go(page,'garden');await geometry(page,'old garden',['[data-world-tool]','[data-world-practice]']);await go(page,'library');await go(page,'home');
   await page.locator('[data-adventure-passport]').tap();await page.keyboard.press('Escape');await page.reload();await page.locator('.adventure-home').waitFor();
   assert.deepEqual(await stored(page),before);await wallet(page);
  },{...learned,garden:{version:1,actions:[{date:'2026-10-12',type:'plant',plot:0,kind:'sunflower'}]}});
  let capped=learning.createState(today);for(const lesson of curriculum.lessons.slice(0,3))capped=learning.recordResult(capped,lesson.id,'good',today,{isNew:true,meaning:true});
  let twoKnown=learning.createState(today);for(const lesson of curriculum.lessons.slice(0,2))twoKnown=learning.recordResult(twoKnown,lesson.id,'good',today,{isNew:true,meaning:true});
  await test('Third real discovery visibly unlocks rank two once and reload grants no duplicate materials',async page=>{
   assert.equal(await page.locator('.adventure-rank').getAttribute('data-level'),'1');const before=await stored(page);
   await page.locator('#hero-start').tap();await page.locator('[data-step="choose"]').tap();const lesson=await choose(page);await matched(page);await page.locator('[data-speech-next]').tap();
   await page.locator('.game-completion [data-rank-unlocked]').waitFor();assert.match(await page.locator('[data-rank-unlocked]').innerText(),/新称号.*种子伙伴/);
   assert.equal(await page.locator('.adventure-rank').getAttribute('data-level'),'2');await rewardValues(page,before);await geometry(page,'rank unlocked at daily limit',['[data-rank-unlocked]','#completion-next','.game-completion [data-go]']);
   const after=await stored(page);assert.equal(after.days[today].results.length,3);assert.equal(after.days[today].results[2].lessonId,lesson);assert.equal(after.garden.actions.filter(a=>a.type==='practice').length,1,'Exactly one matched practice reward');
   await page.screenshot({path:path.join(out,'rank-discovery-320.png')});await page.reload();await page.locator('.adventure-home').waitFor();assert.equal(await page.locator('.adventure-rank').getAttribute('data-level'),'2');assert.equal(await page.locator('[data-rank-unlocked]').count(),0);assert.deepEqual(await stored(page),after);await wallet(page);
  },twoKnown,{width:320,height:568});
  let nearBloom=twoKnown;
  for(let i=0;i<2;i++)nearBloom=garden.recordGardenPractice(nearBloom,{lessonId:'hello-01',attemptId:'adventure-fixture-'+i,assessment:'local-speech'},today);
  nearBloom=garden.recordGardenAction(nearBloom,{type:'world-plant',id:'adventure-flower',kind:'sunflower',x:5000,y:5000},today);
  for(let i=0;i<4;i++)nearBloom=garden.recordGardenAction(nearBloom,{type:'world-water',id:'adventure-flower',actionId:'adventure-water-'+i},today);
  await test('Fifth real watering unlocks bloom rank without extra currency or duplicate collection on reload',async page=>{
   assert.equal(await page.locator('.adventure-rank').getAttribute('data-level'),'1');const before=await stored(page),beforeGarden=garden.getGarden(before,today);
   await go(page,'garden');await page.locator('[data-world-tool="water"]').tap();const box=await page.locator('[data-garden-world]').boundingBox();await page.touchscreen.tap(box.x+box.width/2,box.y+box.height/2);
   await page.locator('[data-world-instruction][data-rank-unlocked]').waitFor();assert.match(await page.locator('[data-rank-unlocked]').innerText(),/新称号.*种子伙伴/);assert.equal(await page.locator('.adventure-rank').getAttribute('data-level'),'2');
   const after=await stored(page),afterGarden=garden.getGarden(after,today);assert.equal(afterGarden.worldPlants[0].growth,5);assert.equal(afterGarden.collection.reduce((sum,p)=>sum+p.count,0),1);assert.deepEqual(afterGarden.earned,beforeGarden.earned,'Bloom rank has no invented currency reward');assert.equal(afterGarden.inventory.water,beforeGarden.inventory.water-1);assert.equal(afterGarden.inventory.seeds,beforeGarden.inventory.seeds);assert.deepEqual(after.cards,before.cards);assert.deepEqual(after.days,before.days);
   await geometry(page,'bloom rank',['[data-world-tool]','[data-rank-unlocked]','[data-world-practice]']);await page.screenshot({path:path.join(out,'rank-bloom-390.png')});
   await page.reload();await page.locator('[data-garden-world]').waitFor();assert.equal(await page.locator('.adventure-rank').getAttribute('data-level'),'2');assert.equal(await page.locator('[data-rank-unlocked]').count(),0);assert.deepEqual(await stored(page),after);await wallet(page);
  },nearBloom);
  await test('Daily new-phrase limit redirects to garden; free exploration does not award learning',async page=>{
   assert.equal(await page.locator('.adventure-home').getAttribute('data-next-kind'),'garden');assert.equal(await page.locator('.adventure-rank').getAttribute('data-level'),'2','Three real new phrases reach the second exploration rank');const before=await stored(page);await page.locator('#hero-start').tap();await page.locator('[data-garden-world]').waitFor();
   await go(page,'library');await page.locator('[data-theme-open]').first().tap();await page.locator('[data-preview]').first().tap();await page.locator('[data-step="choose"]').tap();await choose(page);await page.locator('[data-rating="good"]').tap();await page.locator('.focus-library').waitFor();assert.deepEqual(await stored(page),before);
  },capped);
  await test('Reduced motion and no WebAudio preserve game objectives, matching and reward navigation',async page=>{
   await geometry(page,'reduced motion home',['#hero-start','#daily-picture']);
   const animations=await page.locator('.adventure-home *').evaluateAll(nodes=>nodes.map(n=>({name:n.className,animation:getComputedStyle(n).animationName,duration:getComputedStyle(n).animationDuration})));
   assert.ok(animations.every(a=>a.animation==='none'||a.duration==='0s'||a.duration==='0.001s'),'Reduced motion disables home motion');
   await page.locator('#hero-start').tap();await page.locator('[data-step="choose"]').tap();await choose(page);await matched(page);await page.locator('[data-speech-next]').tap();await page.locator('.game-completion').waitFor();await geometry(page,'reduced motion reward',['#completion-next','.game-completion [data-go]']);
  },empty,{width:320,height:568},{reduced:true,noAudio:true});
  await test('Empty garden tools are disabled without blocking the visible practice route',async page=>{
   await go(page,'garden');assert.equal(await page.locator('[data-world-tool="plant"]').isDisabled(),true);assert.equal(await page.locator('[data-world-tool="water"]').isDisabled(),true);
   const before=await stored(page);await page.locator('[data-world-practice]').tap();await page.locator('[data-lesson-id]').waitFor();assert.deepEqual(await stored(page),before);await geometry(page,'first quest from empty garden',['button[data-step]','#exit-session']);
  });
  await test('Cached game home, passport, world and planting reopen offline with preserved save',async(page,context)=>{
   await page.evaluate(()=>navigator.serviceWorker.ready);await page.waitForFunction(()=>!!navigator.serviceWorker.controller);const before=await stored(page);
   await go(page,'garden');await page.locator('[data-garden-world]').waitFor();await context.setOffline(true);await page.reload();await page.locator('[data-garden-world]').waitFor();
   assert.deepEqual(await stored(page),before);await wallet(page);await plantAndWater(page);await go(page,'home');await page.locator('[data-adventure-passport]').tap();await page.locator('.adventure-passport[open]').waitFor();await page.keyboard.press('Escape');await geometry(page,'offline home',['#hero-start','[data-adventure-passport]']);
   return {build:built,offline:true};
  },capped,{width:390,height:844},{offline:true});
 }finally{
  if(browser)await browser.close();
  fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({origin,build:built,scope:'Actual built Edge app; isolated saved records; real touch, audio and MediaRecorder; explicitly mocked ASR except offline navigation; no child pronunciation or physical-device claim',checks},null,2));
 }
 console.log(JSON.stringify({passed:checks.filter(c=>c.status==='PASS').length,failed:checks.filter(c=>c.status==='FAIL').length,build:built}));if(checks.some(c=>c.status==='FAIL'))process.exitCode=1;
})().catch(error=>{console.error(error);process.exitCode=1;});
