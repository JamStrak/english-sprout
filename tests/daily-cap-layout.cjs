/* Focused cap completion and genuine Service Worker offline garden checks.
 * Isolated profiles, manual unassessed continuation; no ASR accuracy claim. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {pathToFileURL}=require('node:url');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'C:/Users/Jam/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root=path.resolve(__dirname,'..'),origin=process.env.TEST_URL||'http://127.0.0.1:24736',key='english-sprout-state-v1',today='2026-10-13';
const curriculum=JSON.parse(fs.readFileSync(path.join(root,'public/data/curriculum.json'),'utf8'));
const output=path.join(root,'test-results','daily-cap-layout');fs.mkdirSync(output,{recursive:true});
(async()=>{
 const learning=await import(pathToFileURL(path.join(root,'src/learning.js'))),garden=await import(pathToFileURL(path.join(root,'src/garden.js')));
 let two=learning.createState(today);
 for(const lesson of curriculum.lessons.slice(0,2))two=learning.recordResult(two,lesson.id,'good',today,{isNew:true,meaning:true});
 let backlog=learning.createState('2026-10-01');
 for(let n=0;n<10;n++)backlog=learning.recordResult(backlog,curriculum.lessons[n].id,'good',learning.addDays('2026-10-01',n),{isNew:true});
 backlog=learning.recordCheckup(backlog,curriculum.lessons,learning.getCheckupPlan(backlog,curriculum.lessons,'2026-10-12').ids.map(lessonId=>({lessonId,meaning:true,spoken:'good'})),'2026-10-12');
 for(const id of learning.getDailyPlan(backlog,curriculum.lessons,today).dueIds)backlog=learning.recordResult(backlog,id,'help',today,{meaning:true});
 assert.equal(learning.getDailyPlan(backlog,curriculum.lessons,today).newLimit,1);
 let planted=garden.recordGardenAction(two,{type:'world-plant',id:'offline-plant-01',kind:'sunflower',x:5000,y:5000},today);
 for(let n=0;n<2;n++)planted=garden.recordGardenAction(planted,{type:'world-water',id:'offline-plant-01',actionId:'offline-water-0'+n},today);
 const browser=await chromium.launch({channel:'msedge',headless:true,args:['--no-proxy-server']});const checks=[];
 async function fixture(state,viewport,sw=false){
  const context=await browser.newContext({viewport,timezoneId:'Asia/Shanghai',serviceWorkers:sw?'allow':'block'});
  await context.addInitScript(({key,state})=>{if(!localStorage.getItem(key))localStorage.setItem(key,JSON.stringify(state));},{key,state});
  const page=await context.newPage();page.setDefaultTimeout(10000);page.qaErrors=[];page.on('pageerror',e=>page.qaErrors.push(e.message));
  await page.clock.setFixedTime(new Date(today+'T10:00:00+08:00'));
  if(!sw)await page.route('**/src/speech-local.js',r=>r.fulfill({contentType:'text/javascript',body:'export async function prepareSpeech(){}; export async function assessRecording(){throw new Error("No assessment requested by layout test");}'}));
  return {context,page};
 }
 async function layout(page,name){
  const data=await page.evaluate(()=>({width:innerWidth,height:innerHeight,scrollWidth:document.documentElement.scrollWidth,scrollHeight:document.documentElement.scrollHeight,items:[...document.querySelectorAll('button, .completion h1, .completion p, .completion .badge')].filter(el=>el.offsetWidth&&el.offsetHeight&&!el.closest('dialog')).map(el=>({text:el.textContent.trim(),...el.getBoundingClientRect().toJSON()}))}));
  assert.ok(data.scrollWidth<=data.width+1&&data.scrollHeight<=data.height+1,name+' scroll: '+JSON.stringify(data));
  assert.deepEqual(data.items.filter(item=>item.top< -1||item.left< -1||item.bottom>data.height+1||item.right>data.width+1),[],name+' visible content/actions must fit');
  checks.push({name,status:'PASS',geometry:data});console.log('PASS '+name);
 }
 async function completeNextNew(page,state){
  const next=learning.getDailyPlan(state,curriculum.lessons,today).nextNewLessonId,l=curriculum.lessons.find(l=>l.id===next);
  await page.goto(origin+'/#home');await page.locator('#hero-start').click();await page.locator('[data-step="choose"]').click();
  await page.locator(`[data-choice="${l.answerIndex}"]`).click();await page.locator('#quiz-next').click();await page.locator('[data-rating="help"]').click();await page.locator('.completion').waitFor();
 }
 try{
  for(const viewport of [{width:320,height:568},{width:390,height:844},{width:768,height:1024}]){
   const {context,page}=await fixture(two,viewport);
   try{
    await completeNextNew(page,two);assert.match(await page.locator('.next-task').innerText(),/已学 3 句/);assert.equal(await page.locator('.completion [data-go="library"]').isVisible(),true);
    assert.equal(await page.locator('.skin-unlock-note').count(),1,'Three same-day introductions unlock the meadow skin');
    assert.match(await page.locator('.skin-unlock-note').innerText(),/薄荷森林/);
    await layout(page,viewport.width+'x'+viewport.height+' third sentence cap and skin reward');await page.screenshot({path:path.join(output,viewport.width+'-cap.png')});assert.deepEqual(page.qaErrors,[]);
   }finally{await context.close();}
  }
  {
   const {context,page}=await fixture(backlog,{width:320,height:568});
   try{
    await completeNextNew(page,backlog);assert.match(await page.locator('.next-task').innerText(),/老朋友记牢/);
    assert.equal(await page.locator('.completion [data-go="library"]').isVisible(),true);await layout(page,'320x568 ten-card backlog cap and free phrase entry');
    await page.locator('.completion [data-go="library"]').click();await page.locator('.focus-library').waitFor();assert.deepEqual(page.qaErrors,[]);
   }finally{await context.close();}
  }
  {
   const {context,page}=await fixture(planted,{width:390,height:844},true);
   try{
    await page.goto(origin+'/#garden');await page.locator('[data-garden-world]').waitFor();
    await page.waitForFunction(()=>!!navigator.serviceWorker.controller,{timeout:15000});
    const cached=await page.evaluate(async()=>{const name=(await caches.keys()).find(k=>k.startsWith('english-sprout-core-')),cache=await caches.open(name),files=['src/garden-canvas.js','src/garden-world.js','src/garden-world.css','src/garden-art.js'];return {name,files:await Promise.all(files.map(async file=>({file,found:!!await cache.match(new URL(file,location.href))})))};});
    assert.ok(cached.files.every(file=>file.found),'Garden modules and CSS really exist in Service Worker core cache');
    await context.setOffline(true);await page.close();const cold=await context.newPage();cold.qaErrors=[];cold.on('pageerror',e=>cold.qaErrors.push(e.message));
    await cold.clock.setFixedTime(new Date(today+'T10:00:00+08:00'));const offlineNavigation=await cold.goto(origin+'/#garden');assert.equal(offlineNavigation.fromServiceWorker(),true,'Offline cold page is actually served by the Service Worker');await cold.locator('[data-garden-world]').waitFor();
    const avatars=await cold.evaluate(async()=>Promise.all(['rabbit','cat','bear','fox','panda','frog'].map(async name=>{const img=new Image();img.src='./avatars/'+name+'.webp';await img.decode();return {name,width:img.naturalWidth,height:img.naturalHeight};})));
    assert.ok(avatars.every(image=>image.width>0&&image.height>0));assert.deepEqual(await cold.evaluate(key=>JSON.parse(localStorage.getItem(key)).garden.actions,key),planted.garden.actions);
    const offlineReload=await cold.reload();assert.equal(offlineReload.fromServiceWorker(),true);await cold.locator('[data-garden-world]').waitFor();const saved=await cold.evaluate(key=>JSON.parse(localStorage.getItem(key)),key);
    assert.deepEqual(saved,planted);assert.equal(garden.getGarden(saved,today).worldPlants[0].growth,2);assert.deepEqual(cold.qaErrors,[]);
    await layout(cold,'genuine offline cold garden page and reload');checks.push({name:'Offline precached world modules, six decoded avatars and unchanged garden ledger',status:'PASS',build:await cold.locator('meta[name="app-build"]').getAttribute('content'),coldPageFromServiceWorker:offlineNavigation.fromServiceWorker(),reloadFromServiceWorker:offlineReload.fromServiceWorker(),cached,avatars});console.log('PASS genuine offline garden cold page, reload and six avatars');
   }finally{await context.close();}
  }
 }finally{fs.writeFileSync(path.join(output,'results.json'),JSON.stringify({scope:'Isolated Edge layouts with unassessed manual continuation; real Service Worker offline cold-page cache, no actual iPad or ASR claim',checks},null,2));await browser.close();}
 console.log(checks.length+' focused cap/offline checks passed');
})().catch(error=>{console.error(error);process.exitCode=1;});
