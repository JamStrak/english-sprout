// Isolated release smoke check: the real published files, task order and offline reload.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'C:/Users/Jam/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {pathToFileURL}=require('node:url');
const root=path.resolve(__dirname,'..'),origin=process.env.TEST_URL||'https://jamstrak.github.io/english-sprout/';
const out=path.join(root,'test-results',process.env.RELEASE_REPORT_NAME||'live-focus');fs.mkdirSync(out,{recursive:true});
(async()=>{
 const learning=await import(pathToFileURL(path.join(root,'src/learning.js')).href);
 const curriculum=JSON.parse(fs.readFileSync(path.join(root,'public/data/curriculum.json'),'utf8'));
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try{
  const context=await browser.newContext({viewport:{width:390,height:844},timezoneId:'Asia/Shanghai',reducedMotion:'reduce'}),page=await context.newPage();
  const errors=[];page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(60000);
  await page.clock.setFixedTime(new Date('2026-10-12T10:00:00+08:00'));
  await context.addInitScript(()=>{window.qa={plays:[]};const Native=window.Audio;window.Audio=function(...args){const a=new Native(...args);a.addEventListener('playing',()=>qa.plays.push({src:a.src,rate:a.playbackRate,seconds:a.duration}));return a;};window.Audio.prototype=Native.prototype;});
  const version=await(await context.request.get(new URL('version.json',origin).href)).json();assert.equal(version.version,'1.4.0');if(process.env.EXPECTED_BUILD)assert.equal(version.build,process.env.EXPECTED_BUILD);
  await page.goto(origin,{waitUntil:'networkidle'});await page.locator('#hero-start').waitFor();assert.equal(await page.locator('.focus-home').getAttribute('data-next-kind'),'learn');
  await page.locator('[data-sound-settings]').click();assert.equal(await page.locator('[data-voice]').count(),3);assert.equal(await page.locator('[data-course-rate]').count(),4);
  for(const voice of ['aiden','ryan','pip']){const before=await page.evaluate(()=>qa.plays.length),suffix=`/audio/${voice==='pip'?'characters/pip/':voice==='ryan'?'ryan/':''}hello-01.mp3`;await page.locator(`[data-voice="${voice}"]`).click();await page.waitForFunction(({before,suffix})=>qa.plays.slice(before).some(p=>p.src.endsWith(suffix)&&p.seconds>.3),{before,suffix});}
  await page.locator('[data-course-rate="0.9"]').click();await page.locator('[data-close-sound]').click();
  let state=learning.createState('2026-10-11');state=learning.recordResult(state,'hello-01','good','2026-10-11',{isNew:true});
  await page.evaluate(s=>localStorage.setItem('english-sprout-state-v1',JSON.stringify(s)),state);await page.reload({waitUntil:'networkidle'});
  assert.equal(await page.locator('.focus-home').getAttribute('data-next-kind'),'review');await page.screenshot({path:path.join(out,'review-first-390.png')});
  await page.locator('#hero-start').click();await page.locator('.practice-main[data-step="remember"]').waitFor();assert.equal(await page.locator('.practice-english').count(),0);assert.deepEqual(await page.evaluate(()=>qa.plays),[]);
  await page.locator('button[data-step="speak"]').click();await page.locator('[data-rating="good"]').click();assert.equal(await page.locator('.completion').getAttribute('data-next-kind'),'learn');
  await page.locator('#completion-next').click();await page.waitForFunction(()=>qa.plays.some(p=>p.src.endsWith('/audio/characters/pip/hello-02.mp3')&&p.rate===.9));
  assert.equal(await page.locator('.practice-main').getAttribute('data-lesson-id'),'hello-02');
  await page.locator('button[data-step="choose"]').click();await page.locator(`[data-choice="${curriculum.lessons[1].answerIndex}"]`).click();await page.locator('#quiz-next').click();await page.locator('[data-rating="good"]').click();
  assert.equal(await page.locator('.completion').getAttribute('data-next-kind'),'garden');await page.locator('#completion-next').click();assert.equal(await page.locator('.garden-plot').count(),1);await page.locator('[data-garden-action="plant"]').click();
  await page.locator('[data-go="parent"]:visible').click();assert.equal(await page.locator('.parent-menu>button').count(),6);await page.locator('[data-parent-panel="offline"]').click();await page.locator('#offline-status').waitFor();
  await page.evaluate(()=>navigator.serviceWorker.ready);await page.waitForFunction(()=>navigator.serviceWorker.controller!==null);
  await page.waitForFunction(async()=>Boolean(await(await caches.open('english-sprout-audio-v5')).match(new URL('./audio/characters/pip/hello-02.mp3',document.baseURI).href,{ignoreVary:true})));
  await context.setOffline(true);await page.reload({waitUntil:'domcontentloaded'});await page.locator('[data-go="library"]:visible').click();await page.locator('#search-open').click();await page.locator('#phrase-search').fill(curriculum.lessons[1].english);await page.locator('[data-preview="hello-02"]').click();await page.waitForFunction(()=>qa.plays.some(p=>p.src.endsWith('/audio/characters/pip/hello-02.mp3')&&p.rate===.9&&p.seconds>.3));
  const geometry=await page.evaluate(()=>({width:innerWidth,height:innerHeight,contentWidth:Math.max(document.body.scrollWidth,document.documentElement.scrollWidth),contentHeight:Math.max(document.body.scrollHeight,document.documentElement.scrollHeight)}));assert.ok(geometry.contentWidth<=geometry.width+1&&geometry.contentHeight<=geometry.height+1);assert.deepEqual(errors,[]);
  const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('english-sprout-state-v1')));assert.equal(Object.keys(saved.cards).length,2);assert.equal(saved.cards['hello-01'].lastReviewed,'2026-10-12');assert.equal(saved.cards['hello-02'].lastReviewed,'2026-10-12');
  const result={version,url:origin,sequence:['review','learn','garden'],formalVoices:3,offlinePlayback:true,geometry,errors};fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
