/* Published-build smoke check using isolated records, no child microphone input. */
const {chromium}=require('C:/Users/Jam/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const {pathToFileURL}=require('node:url');
const {execFileSync}=require('node:child_process');
const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs');
const root=path.resolve(__dirname,'..'),url='https://jamstrak.github.io/english-sprout/',key='english-sprout-state-v1';
const out=path.join(root,'test-results/garden-live-v161');fs.mkdirSync(out,{recursive:true});
(async()=>{
  const learning=await import(pathToFileURL(path.join(root,'src/learning.js')));
  const initial=learning.recordResult(learning.createState('2026-10-12'),'hello-01','good','2026-10-12',{isNew:true});
  const fixtureMode=process.env.SPEECH_FIXTURE==='1';
  const context=await chromium.launchPersistentContext(path.join(out,fixtureMode?'browser-profile-fixture':'browser-profile'),{channel:'msedge',headless:true,args:['--no-proxy-server'],viewport:{width:768,height:1024},hasTouch:true,timezoneId:'Asia/Shanghai',serviceWorkers:fixtureMode?'block':'allow'});
  const browser=context.browser();
  await context.addInitScript(({key,initial})=>{if(!localStorage.getItem(key))localStorage.setItem(key,JSON.stringify(initial));},{key,initial});
  const fixtureEvidence=[];
  if(fixtureMode){
    for(const file of ['vosk-0.0.8.js','model-en-us-0.15.tar.gz']){
      const raw=fs.readFileSync(path.join(root,'public/speech',file));
      const bytes=file.endsWith('.js')?Buffer.from(raw.toString('utf8').replace(/\r\n/g,'\n')):raw;
      const sample=path.join(out,file+'-published-prefix.bin'),headers=path.join(out,file+'-published-prefix.txt');
      try{execFileSync('curl.exe',['--http1.1','--silent','--show-error','--max-time','25','--range','0-511','-D',headers,'-o',sample,url+'speech/'+file]);}catch(error){await context.close();await browser.close();throw error;}
      assert.match(fs.readFileSync(headers,'utf8'),/HTTP\/1\.1 206/);const first=fs.readFileSync(sample);assert.equal(first.length,512);assert.deepEqual(first,bytes.subarray(0,first.length));
      fixtureEvidence.push({file,publishedPrefixBytes:first.length,publishedPrefixMatches:true});
      await context.route('**/speech/'+file,route=>{
        const match=/^bytes=(\d+)-(\d+)$/.exec(route.request().headers().range||'');
        const start=match?Number(match[1]):0,end=match?Math.min(Number(match[2]),bytes.length-1):bytes.length-1;
        return route.fulfill({status:match?206:200,contentType:file.endsWith('.js')?'text/javascript':'application/gzip',headers:{'Content-Length':String(end-start+1),...(match?{'Content-Range':`bytes ${start}-${end}/${bytes.length}`}:{})},body:bytes.subarray(start,end+1)});
      });
    }
  }
  const page=await context.newPage();page.setDefaultTimeout(70000);page.setDefaultNavigationTimeout(30000);
  const errors=[],speechRequests=[],uploads=[],unexpected=[];
  page.on('console',m=>{if(m.type()==='log'&&m.text().includes('下载中'))console.log(m.text());});page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(r.url().includes('/speech/'))speechRequests.push(r.url());if(!['GET','HEAD'].includes(r.method()))uploads.push(r.url());if(/^https?:/.test(r.url())&&!r.url().startsWith(url))unexpected.push(r.url());});
  try{
    await page.clock.setFixedTime(new Date('2026-10-12T10:00:00+08:00'));
    await page.goto(url+'#garden',{waitUntil:'domcontentloaded'});await page.locator('.garden-play').waitFor();await page.evaluate(({key,initial})=>localStorage.setItem(key,JSON.stringify(initial)),{key,initial});await page.reload({waitUntil:'domcontentloaded'});await page.locator('.garden-play').waitFor();
    const version=await page.evaluate(()=>fetch('./version.json',{cache:'no-store'}).then(r=>r.json()));assert.equal(version.version,'1.6.1');assert.equal(await page.locator('meta[name="app-build"]').getAttribute('content'),version.build);
    assert.deepEqual(speechRequests,[],'First garden page must not require model download');
    const use=async type=>{await page.locator(`[data-garden-tool="${type}"]`).click();await page.locator('[data-garden-drop]').click();};
    await use('plant');await use('water');await use('water');assert.equal(await page.locator('.garden-stage').getAttribute('data-growth'),'2');
    await page.screenshot({path:path.join(out,'published-garden.png')});
    await page.locator('[data-garden-practice]').click();
    const speech=await page.evaluate(async()=>{
      const m=await import('./src/speech-local.js');const started=performance.now();await m.prepareSpeech({background:true,onStatus:message=>{const percentage=Number(message.match(/(\d+)%/)?.[1]);const stage=message.startsWith('声音工具')?'library':'model';const mark=stage+Math.floor(percentage/10);if(mark!==window.lastDownloadMark){window.lastDownloadMark=mark;console.log(message);}}});
      const response=await fetch('./audio/hello-01.mp3'),blob=await response.blob(),clip=URL.createObjectURL(blob);
      try{return {prepareAndMatchMs:Math.round(performance.now()-started),...await m.assessRecording(clip,'Hello, everyone.')};}finally{URL.revokeObjectURL(clip);m.disposeSpeechAssessment();}
    });assert.equal(speech.matched,true);assert.equal(speech.stars,3);
    await page.locator('[data-step="speak"]').click();await page.locator('[data-garden-effort]').click();await page.locator('[data-garden-claim]').click();
    await page.locator('.garden-play').waitFor();const stored=await page.evaluate(k=>JSON.parse(localStorage.getItem(k)),key);assert.deepEqual(stored.cards,initial.cards);assert.deepEqual(stored.days,initial.days);assert.equal(stored.garden.actions[stored.garden.actions.length-1].assessment,'practice-effort');
    if(!fixtureMode){await page.evaluate(()=>navigator.serviceWorker.ready);await page.waitForFunction(()=>!!navigator.serviceWorker.controller);}
    const offline=await context.newPage();offline.setDefaultTimeout(70000);if(!fixtureMode)await context.setOffline(true);await offline.goto(url+'#garden');await offline.locator('.garden-play').waitFor();if(fixtureMode)await context.setOffline(true);
    const offlineReady=await offline.evaluate(async()=>{const m=await import('./src/speech-local.js');await m.prepareSpeech({background:true,onStatus:message=>{const percentage=Number(message.match(/(\d+)%/)?.[1]);const stage=message.startsWith('声音工具')?'library':'model';const mark=stage+Math.floor(percentage/10);if(mark!==window.lastDownloadMark){window.lastDownloadMark=mark;console.log(message);}}});m.disposeSpeechAssessment();return true;});assert.equal(offlineReady,true);assert.equal(await offline.locator('.garden-stage').getAttribute('data-growth'),'2');
    assert.deepEqual(errors,[]);assert.deepEqual(uploads,[]);assert.deepEqual(unexpected,[]);
    const report={fixtureMode,fixtureEvidence,version,speech,offlineReady,firstPageModelRequired:false,errors,uploads,unexpected};fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
  }finally{await context.close();await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
