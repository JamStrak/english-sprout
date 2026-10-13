/* Reward receipt integration in isolated browser profiles. Uses real browser
 * recording and touch, but explicitly mocked local-ASR outcomes; no speech-quality
 * or physical iPad claim. Never reads or changes the user's browser profile. */
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'C:/Users/Jam/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {pathToFileURL}=require('node:url');
const root=path.resolve(__dirname,'..'),origin=(process.env.TEST_URL||'http://127.0.0.1:24736').replace(/\/$/,''),key='english-sprout-state-v1',today='2026-10-13';
const report=process.env.REPORT_NAME||'reward-claim-browser';if(!/^[\w-]+$/.test(report))throw new Error('Invalid report name');
const out=path.join(root,'test-results',report);fs.mkdirSync(out,{recursive:true});
const curriculum=JSON.parse(fs.readFileSync(path.join(root,'public/data/curriculum.json'),'utf8'));
const speech=`export async function prepareSpeech(){};export async function assessRecording(url){window.qaHadBlob=typeof url==='string'&&url.startsWith('blob:');window.qaAssessments=(window.qaAssessments||0)+1;return {matched:true,stars:3};}`;
const checks=[];let browser,learning,garden,empty,learned,build;
const stored=p=>p.evaluate(k=>JSON.parse(localStorage.getItem(k)),key);
const rounds=state=>state.garden.actions.filter(action=>action.type==='practice');
async function setup(initial,viewport={width:390,height:844},fallback=false){
 const context=await browser.newContext({viewport,hasTouch:true,permissions:['microphone'],serviceWorkers:'block',timezoneId:'Asia/Shanghai'});
 await context.addInitScript(({key,initial,fallback})=>{
  if(!localStorage.getItem(key))localStorage.setItem(key,JSON.stringify(initial));
  if(fallback)Object.defineProperty(HTMLDialogElement.prototype,'showModal',{configurable:true,value:undefined});
  window.qaRecordingStarts=0;const native=MediaRecorder.prototype.start;MediaRecorder.prototype.start=function(){window.qaRecordingStarts++;return native.apply(this,arguments);};
 },{key,initial,fallback});
 const page=await context.newPage();page.setDefaultTimeout(12000);page.setDefaultNavigationTimeout(45000);page.qaErrors=[];page.qaUploads=[];page.qaInitial=initial;
 page.on('pageerror',e=>page.qaErrors.push(e.message));page.on('request',r=>{if(!['GET','HEAD'].includes(r.method()))page.qaUploads.push({url:r.url(),method:r.method()});});
 await page.clock.setFixedTime(new Date(today+'T10:00:00+08:00'));
 await page.route('**/src/speech-local.js',route=>route.fulfill({contentType:'text/javascript',body:speech}));
 try{await page.goto(origin+'/#home');await page.locator('#hero-start').waitFor();const current=await page.locator('meta[name="app-build"]').getAttribute('content');if(build)assert.equal(current,build,'Same candidate throughout QA');else build=current;return {page,context};}catch(error){await context.close();throw error;}
}
async function test(name,callback,{initial=empty,viewport,fallback=false}={}){
 if(process.env.QA_FILTER&&!name.includes(process.env.QA_FILTER))return;
 let resources;
 try{resources=await setup(initial,viewport,fallback);const evidence=await callback(resources.page,resources.context);assert.deepEqual(resources.page.qaErrors,[]);assert.deepEqual(resources.page.qaUploads,[]);checks.push({name,status:'PASS',evidence:evidence||null});console.log('PASS '+name);}
 catch(error){checks.push({name,status:'FAIL',error:error.stack});console.error('FAIL '+name+' '+error.message);if(resources){const stamp=String(checks.length).padStart(2,'0');await resources.page.screenshot({path:path.join(out,stamp+'-failure.png')}).catch(()=>{});fs.writeFileSync(path.join(out,stamp+'-failure.json'),JSON.stringify({body:await resources.page.locator('body').innerText(),url:resources.page.url(),errors:resources.page.qaErrors},null,2));}}
 finally{await resources?.context.close();}
}
async function choose(page,{wrong=false}={}){
 const id=await page.locator('[data-lesson-id]').getAttribute('data-lesson-id'),lesson=curriculum.lessons.find(l=>l.id===id);
 if(wrong){await page.locator(`[data-choice="${(lesson.answerIndex+1)%lesson.choices.length}"]`).tap();assert.equal(await page.locator('.reward-claim-dialog[open]').count(),0);}
 await page.locator(`[data-choice="${lesson.answerIndex}"]`).tap();
 await page.waitForFunction(()=>document.querySelector('.reward-claim-dialog[open]')||document.querySelector('#quiz-next')?.hidden===false);
 if(await page.locator('.reward-claim-dialog[open]').count()===0)await page.locator('#quiz-next').tap();return id;
}
async function newSpeak(page){await page.locator('#hero-start').tap();await page.locator('[data-step="choose"]').tap();const id=await choose(page);await page.locator('#record').waitFor();return id;}
async function record(page){await page.locator('#record').tap();await page.waitForFunction(()=>document.querySelector('#record')?.textContent.includes('停止录音'));await page.waitForTimeout(4000);await page.locator('#record').tap();await page.waitForFunction(()=>window.qaHadBlob===true);}
async function modal(page,fallback){
 const dialog=page.locator('dialog.reward-claim-dialog[open]');await dialog.waitFor();
 assert.equal(await page.locator('dialog.reward-claim-dialog[open]').count(),1);assert.equal(await dialog.locator('button:visible').count(),1,'Only one action is offered');
 assert.equal(await dialog.locator('[data-reward-collect]:visible').count(),1);assert.equal(await dialog.evaluate(d=>d.contains(document.activeElement)),true,'Opening moves focus inside the modal');
 if(fallback){assert.equal(await dialog.getAttribute('aria-modal'),'true');assert.match(await dialog.getAttribute('class'),/dialog-fallback/);assert.equal(await page.locator('.dialog-fallback-backdrop').count(),1);}else assert.equal(await dialog.evaluate(d=>d.matches(':modal')),true,'Browser enforces native modality');
 const geometry=await dialog.evaluate(d=>{const button=d.querySelector('[data-reward-collect]'),r=d.getBoundingClientRect(),b=button.getBoundingClientRect();return {dialog:r.toJSON(),button:b.toJSON(),width:innerWidth,height:innerHeight,scrollHeight:document.documentElement.scrollHeight,scrollWidth:document.documentElement.scrollWidth,label:d.getAttribute('aria-labelledby'),focus:document.activeElement===button};});
 assert.ok(geometry.label,'Reward has an accessible title');assert.ok(geometry.button.width>=200&&geometry.button.height>=72,'The water-receipt action is large enough for a child');assert.ok(geometry.focus,'The sole water action receives focus');
 for(const rect of [geometry.dialog,geometry.button])assert.ok(rect.top>=-1&&rect.left>=-1&&rect.bottom<=geometry.height+1&&rect.right<=geometry.width+1,'Receipt and action are inside viewport');
 assert.ok(geometry.scrollWidth<=geometry.width+2&&geometry.scrollHeight<=geometry.height+2,'Reward does not add document scrolling');
 const before=garden.getGarden(page.qaInitial,today).inventory,after=garden.getGarden(await stored(page),today).inventory;
 for(const material of ['water','seeds','fertilizer']){
  const delta=after[material]-before[material],node=dialog.locator(`[data-material="${material}"]`);
  if(delta>0){assert.equal(await node.count(),1,`${material} gain is shown`);const shown=await node.locator('strong').innerText();assert.equal(Number(shown.replace(/[^\d]/g,'')),delta,`${material} receipt matches the actual saved gain`);}
  else assert.equal(await node.count(),0,`${material} with no gain is not advertised as a reward`);
 }
 return geometry;
}
async function blocked(page){
 const before=await stored(page),url=page.url(),count=await page.evaluate(()=>window.qaRecordingStarts);
 await page.keyboard.press('Escape');assert.equal(await page.locator('.reward-claim-dialog[open]').count(),1,'Escape cannot bypass receiving');
 await page.touchscreen.tap(3,3);assert.equal(await page.locator('.reward-claim-dialog[open]').count(),1,'Backdrop tap cannot dismiss');
 const background=await page.locator('#exit-session').boundingBox();if(background)await page.touchscreen.tap(background.x+background.width/2,background.y+background.height/2);
 assert.equal(page.url(),url);assert.equal(await page.locator('.reward-claim-dialog[open]').count(),1,'Underlying exit cannot be activated');
 await page.keyboard.press('Tab');assert.equal(await page.locator('[data-reward-collect]').evaluate(e=>e===document.activeElement),true,'Tab stays on sole action');await page.keyboard.press('Shift+Tab');assert.equal(await page.locator('[data-reward-collect]').evaluate(e=>e===document.activeElement),true,'Reverse Tab stays on sole action');
 assert.equal(await page.evaluate(()=>window.qaRecordingStarts),count);assert.deepEqual(await stored(page),before,'Background interaction does not alter saved ledger');
}
async function collect(page,target='.completion'){
 const before=await stored(page);await page.locator('[data-reward-collect]').evaluate(button=>{button.click();button.click();});await page.locator(target).waitFor();assert.equal(await page.locator('.reward-claim-dialog').count(),0);assert.deepEqual(await stored(page),before,'Receiving the already-saved reward never repeats the transaction');return before;
}
(async()=>{
 learning=await import(pathToFileURL(path.join(root,'src/learning.js')));garden=await import(pathToFileURL(path.join(root,'src/garden.js')));
 empty=learning.createState(today);learned=learning.recordResult(learning.createState('2026-10-12'),'hello-01','good','2026-10-12',{isNew:true,meaning:true});
 browser=await chromium.launch({channel:'msedge',headless:true,args:['--no-proxy-server','--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream']});
 try{
  for(const fallback of [false,true])for(const viewport of [{width:320,height:568},{width:390,height:844},{width:768,height:1024}])await test(`${fallback?'Safari fallback':'Native'} ${viewport.width}: automatic saved receipt, focus, blocked background and collect once`,async page=>{
   const id=await newSpeak(page);await record(page);const geometry=await modal(page,fallback),saved=await stored(page);
   assert.equal(saved.days[today].results.length,1);assert.equal(saved.days[today].results[0].lessonId,id);assert.equal(saved.days[today].results[0].meaning,true);assert.equal(rounds(saved).length,1);assert.equal(garden.getGarden(saved,today).inventory.water,4,'Daily + matching water is already durably saved');
   assert.doesNotMatch(JSON.stringify(saved),/blob:|transcript|heard/);await blocked(page);await page.screenshot({path:path.join(out,`${fallback?'fallback':'native'}-${viewport.width}.png`)});await collect(page);return geometry;
  },{viewport,fallback});
  for(const fallback of [false,true])await test(`${fallback?'Safari fallback':'Native'}: reload before collecting keeps already earned water and lesson`,async page=>{
   await newSpeak(page);await record(page);await modal(page,fallback);const saved=await stored(page),inventory=garden.getGarden(saved,today).inventory;
   await page.reload();await page.locator('#hero-start').waitFor();assert.deepEqual(await stored(page),saved);assert.deepEqual(garden.getGarden(await stored(page),today).inventory,inventory);assert.equal(rounds(await stored(page)).length,1);
   assert.equal(await page.locator('.reward-claim-dialog').count(),0,'Reload does not fabricate another claim');
  },{fallback});
  for(const wrong of [false,true])await test(`Review ${wrong?'wrong-first meaning':'correct meaning'}: matching cannot bypass picture understanding before receipt`,async page=>{
   const before=await stored(page);await page.locator('#hero-start').tap();await page.locator('[data-step="speak"]').tap();await record(page);
   await page.waitForFunction(()=>document.querySelector('[data-choice]')||document.querySelector('[data-speech-next]')?.hidden===false);
   assert.equal(await page.locator('.reward-claim-dialog').count(),0);assert.deepEqual(await stored(page),before,'No review or reward is saved from speech alone');
   if(await page.locator('[data-choice]').count()===0)await page.locator('[data-speech-next]').tap();
   assert.equal(await page.locator('[data-choice]').count()>1,true);assert.deepEqual(await stored(page),before);await choose(page,{wrong});await modal(page,false);
   const saved=await stored(page),result=saved.days[today].results[0];assert.equal(result.isNew,false);assert.equal(result.meaning,!wrong);assert.equal(result.rating,wrong?'again':'good');assert.equal(rounds(saved).length,1);await collect(page);
  },{initial:learned});
  await test('Garden matching automatically opens saved two-water receipt and collects back to garden',async page=>{
   const before=await stored(page),water=garden.getGarden(before,today).inventory.water;await page.locator('[data-home-speech]').tap();await page.locator('[data-step="speak"]').tap();await record(page);await modal(page,false);
   const saved=await stored(page);assert.equal(garden.getGarden(saved,today).inventory.water,water+2);assert.equal(rounds(saved).length,1);assert.deepEqual(saved.cards,before.cards);assert.deepEqual(saved.days,before.days);await collect(page,'[data-garden-world]');
  },{initial:learned});
  await test('Unlearned free preview gives no water receipt or saved-learning reward',async page=>{
   const before=await stored(page);await page.locator('[data-go="library"]').first().tap();await page.locator('[data-theme-open]').first().tap();await page.locator('[data-preview="hello-01"]').tap();await page.locator('[data-step="choose"]').tap();await choose(page);await record(page);
   await page.waitForFunction(()=>document.querySelector('[data-speech-next]')?.hidden===false||document.querySelector('.focus-library'));
   assert.equal(await page.locator('.reward-claim-dialog').count(),0);assert.deepEqual(await stored(page),before);if(await page.locator('[data-speech-next]:visible').count())await page.locator('[data-speech-next]').tap();await page.locator('.focus-library').waitFor();assert.deepEqual(await stored(page),before);
  });
  await test('Lifecycle: hash navigation dismisses receipt and stale collect cannot resume the old session',async page=>{
   await newSpeak(page);await record(page);await modal(page,false);const saved=await stored(page);
   await page.evaluate(()=>{window.qaStaleCollect=document.querySelector('[data-reward-collect]');location.hash='garden';});await page.locator('[data-garden-world]').waitFor();assert.equal(await page.locator('.reward-claim-dialog').count(),0);assert.deepEqual(await stored(page),saved);
   await page.evaluate(()=>{window.qaStaleCollect.click();window.qaStaleCollect.click();});await page.waitForTimeout(80);
   assert.equal(await page.locator('[data-garden-world]').count(),1);assert.equal(await page.locator('.completion').count(),0);assert.equal(await page.locator('[data-lesson-id]').count(),0);assert.deepEqual(await stored(page),saved);
  });
  await test('Lifecycle: another tab updates state, clears receipt and invalidates the stale collect callback',async(page,context)=>{
   await newSpeak(page);await record(page);await modal(page,false);const saved=await stored(page),external=JSON.parse(JSON.stringify(saved));external.settings.nickname='新的冒险家';
   await page.evaluate(()=>{window.qaStaleCollect=document.querySelector('[data-reward-collect]');window.qaStateEvents=0;addEventListener('storage',event=>{if(event.key==='english-sprout-state-v1')window.qaStateEvents++;});});
   const other=await context.newPage();await other.goto(origin+'/#home');await other.locator('#hero-start').waitFor();await other.evaluate(({key,external})=>localStorage.setItem(key,JSON.stringify(external)),{key,external});
   await page.waitForFunction(()=>window.qaStateEvents>0);await page.locator('#hero-start').waitFor();assert.equal(await page.locator('.reward-claim-dialog').count(),0);assert.deepEqual(await stored(page),external);
   await page.evaluate(()=>{window.qaStaleCollect.click();window.qaStaleCollect.click();});await page.waitForTimeout(80);
   assert.equal(await page.locator('#hero-start').count(),1);assert.equal(await page.locator('.completion').count(),0);assert.equal(await page.locator('[data-lesson-id]').count(),0);assert.deepEqual(await stored(page),external);assert.equal(rounds(await stored(page)).length,1);await other.close();
  });
  for(const kind of ['new','garden'])await test(`${kind}: storage failure does not show a received reward or mutate the old save`,async page=>{
   if(kind==='new')await newSpeak(page);else{await page.locator('[data-home-speech]').tap();await page.locator('[data-step="speak"]').tap();}const before=await stored(page);
   await page.evaluate(key=>{const write=Storage.prototype.setItem;window.qaWriteFailures=0;Storage.prototype.setItem=function(k,v){if(k===key){window.qaWriteFailures++;throw new DOMException('Explicit full-storage test','QuotaExceededError');}return write.call(this,k,v);};},key);
   await record(page);await page.waitForFunction(()=>window.qaWriteFailures>0);assert.deepEqual(await stored(page),before);assert.equal(await page.locator('.reward-claim-dialog').count(),0);assert.equal(await page.locator('.completion').count(),0);assert.equal(await page.locator('#storage-warning').isVisible(),true);
  },{initial:kind==='new'?empty:learned});
 }finally{
  await browser?.close();fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({origin,build,scope:'Actual built Edge app in isolated profiles; real MediaRecorder and touch; local-ASR result mocked; dialog API removal simulates fallback, not an actual iPad',checks},null,2));
 }
 console.log(JSON.stringify({passed:checks.filter(c=>c.status==='PASS').length,failed:checks.filter(c=>c.status==='FAIL').length,build}));if(checks.some(c=>c.status==='FAIL'))process.exitCode=1;
})().catch(error=>{console.error(error);process.exitCode=1;});
