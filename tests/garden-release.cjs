/* Published-build smoke check using isolated records, no child microphone input. */
const {chromium}=require('C:/Users/Jam/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const {pathToFileURL}=require('node:url');
const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs');
const root=path.resolve(__dirname,'..'),url='https://jamstrak.github.io/english-sprout/',key='english-sprout-state-v1';
const out=path.join(root,'test-results/garden-live-v160');fs.mkdirSync(out,{recursive:true});
(async()=>{
  const learning=await import(pathToFileURL(path.join(root,'src/learning.js')));
  const initial=learning.recordResult(learning.createState('2026-10-12'),'hello-01','good','2026-10-12',{isNew:true});
  const browser=await chromium.launch({channel:'msedge',headless:true,args:['--no-proxy-server']});
  const context=await browser.newContext({viewport:{width:768,height:1024},hasTouch:true,timezoneId:'Asia/Shanghai'});
  await context.addInitScript(({key,initial})=>{if(!localStorage.getItem(key))localStorage.setItem(key,JSON.stringify(initial));},{key,initial});
  const page=await context.newPage();page.setDefaultTimeout(70000);page.setDefaultNavigationTimeout(30000);
  const errors=[],speechRequests=[],uploads=[],unexpected=[];
  page.on('console',m=>{if(m.type()==='log'&&m.text().includes('下载中'))console.log(m.text());});page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(r.url().includes('/speech/'))speechRequests.push(r.url());if(!['GET','HEAD'].includes(r.method()))uploads.push(r.url());if(/^https?:/.test(r.url())&&!r.url().startsWith(url))unexpected.push(r.url());});
  try{
    await page.clock.setFixedTime(new Date('2026-10-12T10:00:00+08:00'));
    await page.goto(url+'#garden',{waitUntil:'domcontentloaded'});await page.locator('.garden-play').waitFor();
    const version=await page.evaluate(()=>fetch('./version.json',{cache:'no-store'}).then(r=>r.json()));assert.equal(version.version,'1.6.1');assert.equal(await page.locator('meta[name="app-build"]').getAttribute('content'),version.build);
    assert.deepEqual(speechRequests,[],'First garden page must not require model download');
    const use=async type=>{await page.locator(`[data-garden-tool="${type}"]`).click();await page.locator('[data-garden-drop]').click();};
    await use('plant');await use('water');await use('water');assert.equal(await page.locator('.garden-stage').getAttribute('data-growth'),'2');
    await page.screenshot({path:path.join(out,'published-garden.png')});
    await page.locator('[data-garden-practice]').click();
    const speech=await page.evaluate(async()=>{
      const m=await import('./src/speech-local.js');const started=performance.now();await m.prepareSpeech({background:true,onStatus:message=>console.log(message)});
      const response=await fetch('./audio/hello-01.mp3'),blob=await response.blob(),clip=URL.createObjectURL(blob);
      try{return {prepareAndMatchMs:Math.round(performance.now()-started),...await m.assessRecording(clip,'Hello, everyone.')};}finally{URL.revokeObjectURL(clip);m.disposeSpeechAssessment();}
    });assert.equal(speech.matched,true);assert.equal(speech.stars,3);
    await page.locator('[data-step="speak"]').click();await page.locator('[data-garden-effort]').click();await page.locator('[data-garden-claim]').click();
    await page.locator('.garden-play').waitFor();const stored=await page.evaluate(k=>JSON.parse(localStorage.getItem(k)),key);assert.deepEqual(stored.cards,initial.cards);assert.deepEqual(stored.days,initial.days);assert.equal(stored.garden.actions[stored.garden.actions.length-1].assessment,'practice-effort');
    await page.evaluate(()=>navigator.serviceWorker.ready);await page.waitForFunction(()=>!!navigator.serviceWorker.controller);
    await context.setOffline(true);const offline=await context.newPage();offline.setDefaultTimeout(70000);await offline.goto(url+'#garden');await offline.locator('.garden-play').waitFor();
    const offlineReady=await offline.evaluate(async()=>{const m=await import('./src/speech-local.js');await m.prepareSpeech({background:true,onStatus:message=>console.log(message)});m.disposeSpeechAssessment();return true;});assert.equal(offlineReady,true);assert.equal(await offline.locator('.garden-stage').getAttribute('data-growth'),'2');
    assert.deepEqual(errors,[]);assert.deepEqual(uploads,[]);assert.deepEqual(unexpected,[]);
    const report={version,speech,offlineReady,firstPageModelRequired:false,errors,uploads,unexpected};fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
  }finally{await context.close();await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
