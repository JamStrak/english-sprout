/* Limited real-network check: crosses 10%, cancels, and resumes saved public model parts. */
const {chromium}=require('C:/Users/Jam/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const origin=process.env.TEST_URL||'https://jamstrak.github.io/english-sprout/';
const out=path.resolve(__dirname,'../test-results/speech-live-progress');
const total=41184862,chunk=262144,started=Date.now();
const report={origin,started:new Date().toISOString(),scope:'Real isolated Edge; partial public asset download only. No full-model readiness or child pronunciation claim.',checks:[],requests:[],statuses:[],liveStatuses:[],errors:[]};
fs.mkdirSync(out,{recursive:true});
let browser,context,page,timer,round=1,encodedSpeechBytes=0,budgetSpeechBytes=0,budgetStopped=false;
const speechBudget=10*1024*1024;
const left=()=>Math.max(1,90000-(Date.now()-started));
async function snapshot(p){return p.evaluate(async({total,chunk})=>{
  const cache=await caches.open('english-sprout-speech-v1'),parts=[];let library=null;
  for(const key of await cache.keys()){
    const u=new URL(key.url),r=await cache.match(key);
    if(u.pathname.endsWith('/model-en-us-0.15.tar.gz')&&u.searchParams.has('sprout-part')){
      const start=Number(u.searchParams.get('sprout-part')),bytes=(await r.blob()).size;
      if(bytes===Math.min(chunk,total-start))parts.push({start,bytes});
    }
    if(u.pathname.endsWith('/vosk-0.0.8.js')&&!u.search){const text=await r.text();library={decodedBytes:new TextEncoder().encode(text).byteLength,hasVosk:text.includes('Vosk')};}
  }
  parts.sort((a,b)=>a.start-b.start);let prefix=0;
  for(const part of parts){if(part.start!==prefix)break;prefix+=part.bytes;}
  return {parts,prefix,library};
},{total,chunk});}
async function observe(p){
  p.on('pageerror',e=>report.errors.push(e.message));
  p.on('request',r=>{if(!['GET','HEAD'].includes(r.method()))report.errors.push('Unexpected upload: '+r.method());});
  p.on('response',async r=>{
    if(!/\/speech\/(?:vosk-0\.0\.8\.js|model-en-us-0\.15\.tar\.gz)$/.test(new URL(r.url()).pathname))return;
    const headers=await r.allHeaders();report.requests.push({round,url:r.url(),range:r.request().headers().range||null,status:r.status(),fromServiceWorker:r.fromServiceWorker(),encoding:headers['content-encoding']||null,contentRange:headers['content-range']||null,contentLength:headers['content-length']||null});
  });
  const cdp=await context.newCDPSession(p),speech=new Map();
  await cdp.send('Network.enable');
  const enforceBudget=()=>{
    if(budgetStopped||budgetSpeechBytes<speechBudget)return;
    budgetStopped=true;report.budgetStoppedAt=budgetSpeechBytes;
    report.errors.push('10MB speech transfer budget reached during data reception');
    // Stop immediately even if an origin ignores Range and streams a whole model.
    // Abort the preparation as well, so its automatic recovery cannot retry.
    p.evaluate(()=>window.qaController?.abort()).catch(()=>{});
    cdp.send('Page.stopLoading').catch(()=>{});
  };
  cdp.on('Network.requestWillBeSent',e=>{if(/\/speech\/(?:vosk-0\.0\.8\.js|model-en-us-0\.15\.tar\.gz)$/.test(new URL(e.request.url).pathname))speech.set(e.requestId,{received:0});});
  cdp.on('Network.dataReceived',e=>{
    const request=speech.get(e.requestId);if(!request)return;
    // Some Edge chunks report no encoded size until completion. Count decoded
    // bytes conservatively for those chunks rather than waiting for the full body.
    const bytes=e.encodedDataLength>0?e.encodedDataLength:e.dataLength;
    request.received+=bytes;budgetSpeechBytes+=bytes;enforceBudget();
  });
  cdp.on('Network.loadingFinished',e=>{
    const request=speech.get(e.requestId);if(!request)return;
    encodedSpeechBytes+=e.encodedDataLength;
    budgetSpeechBytes+=e.encodedDataLength-request.received;
    speech.delete(e.requestId);enforceBudget();
  });
  // Failed/cancelled bodies already consumed the received bytes; retain them in
  // the budget even though loadingFinished will never report a final wire size.
  cdp.on('Network.loadingFailed',e=>speech.delete(e.requestId));
}
async function open(){
  const p=await context.newPage();await observe(p);
  await p.exposeBinding('qaReportStatus',(_source,message)=>report.liveStatuses.push({round,message,time:Date.now()}));
  await p.goto(origin,{waitUntil:'domcontentloaded',timeout:Math.min(30000,left())});
  await p.locator('#hero-start').waitFor({timeout:Math.min(15000,left())});
  await p.waitForFunction(()=>!!navigator.serviceWorker.controller,{},{timeout:Math.min(15000,left())});
  return p;
}
async function start(p,target){
  await p.evaluate(async({target})=>{
    const source=document.querySelector('#app-module').src;
    window.qaSpeech=await import(source.replace(/app\.js(?:\?.*)?$/,'speech-local.js'));
    window.qaController=new AbortController();window.qaStatuses=[];window.qaSettled=false;
    window.qaSpeechTask=window.qaSpeech.prepareSpeech({background:true,signal:window.qaController.signal,onStatus:message=>{
      window.qaStatuses.push({message,time:Date.now()});
      window.qaReportStatus(message).catch(()=>{});
      const value=/^小耳朵下载中 (\d+)%/.exec(message);
      if(value&&Number(value[1])>=target)window.qaController.abort();
    }}).then(()=>{window.qaOutcome='unexpected readiness';},e=>{window.qaOutcome=e.name+': '+e.message;}).finally(()=>window.qaSettled=true);
  },{target});
}
async function stopped(p){
  await p.waitForFunction(()=>window.qaSettled,{},{timeout:left()});
  await p.waitForTimeout(300);
  const value=await p.evaluate(()=>({statuses:window.qaStatuses,outcome:window.qaOutcome}));
  report.statuses.push({round,...value});assert.match(value.outcome,/^AbortError:/);return value;
}
(async()=>{
  try{
    browser=await chromium.launch({channel:'msedge',headless:true,args:['--no-proxy-server']});
    timer=setTimeout(async()=>{
      report.errors.push('90-second live-network deadline reached');
      // Abort public downloads at the deadline, then retain partial-cache evidence
      // before destroying this isolated storage context. No new network retry.
      await Promise.race([(async()=>{
        if(page&&!page.isClosed()){
          await page.evaluate(()=>window.qaController?.abort());
          report.deadlineCache=await snapshot(page);
          report.deadlineStatuses=await page.evaluate(()=>window.qaStatuses||[]);
        }
      })().catch(()=>{}),new Promise(resolve=>setTimeout(resolve,1000))]);
      await browser.close().catch(()=>{});
    },left());
    context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'allow'});
    page=await open();report.page=await page.evaluate(()=>({build:document.querySelector('meta[name="app-build"]')?.content,module:document.querySelector('#app-module').src}));
    await start(page,11);const first=await stopped(page);
    assert.ok(first.statuses.some(s=>/^小耳朵下载中 (?:1[1-9]|[2-9]\d)%/.test(s.message)));
    report.firstCache=await snapshot(page);assert.ok(report.firstCache.parts.length>=16,JSON.stringify(report.firstCache));
    assert.ok(report.firstCache.library?.hasVosk);assert.ok(report.firstCache.library.decodedBytes>1000000);
    report.checks.push({name:'Real official model passes 10% and at least 16 complete public parts persist',status:'PASS'});
    await page.close();round=2;page=await open();await start(page,15);
    await page.waitForFunction(()=>window.qaStatuses.some(s=>/^小耳朵下载中 (\d+)%/.test(s.message)&&Number(/^小耳朵下载中 (\d+)%/.exec(s.message)[1])>=10),{},{timeout:left()});
    // A second observer attaches to the in-progress promise and receives current status immediately.
    report.observer=await page.evaluate(()=>{
      const seen=[];window.qaObserverTask=window.qaSpeech.prepareSpeech({background:true,onStatus:m=>seen.push(m)}).catch(e=>e.name);
      return seen;
    });
    assert.ok(report.observer.some(s=>/^小耳朵下载中 (1[0-9])%/.test(s)),JSON.stringify(report.observer));
    await stopped(page);report.secondCache=await snapshot(page);
    assert.ok(report.secondCache.parts.length>report.firstCache.parts.length);
    const libraryRequests=report.requests.filter(r=>r.url.endsWith('/vosk-0.0.8.js'));
    assert.equal(libraryRequests.length,1);assert.equal(libraryRequests[0].range,null);assert.equal(libraryRequests[0].status,200);
    const modelRequests=report.requests.filter(r=>r.url.endsWith('/model-en-us-0.15.tar.gz'));
    assert.ok(modelRequests.length>0);
    for(const r of modelRequests){assert.equal(r.status,206);assert.match(r.contentRange,new RegExp('/'+total+'$'));assert.equal(r.fromServiceWorker,false);}
    for(const r of modelRequests.filter(r=>r.round===2)){const start=Number(/^bytes=(\d+)-/.exec(r.range)[1]);assert.ok(start>=report.firstCache.prefix,JSON.stringify({prefix:report.firstCache.prefix,r}));}
    assert.ok(encodedSpeechBytes<=speechBudget,encodedSpeechBytes);
    assert.equal(budgetStopped,false,'The partial-download check must complete within its real-time budget');
    assert.deepEqual(report.errors,[]);
    report.checks.push({name:'Same isolated storage resumes without requesting the saved contiguous prefix',status:'PASS'});
    report.checks.push({name:'New observer replays progress above 10%; real network continues to 15%',status:'PASS'});
    report.checks.push({name:'Library uses full GET; model uses correct 206 totals and bypasses service worker double cache',status:'PASS'});
    console.log(JSON.stringify({passed:report.checks.length,encodedSpeechBytes,firstPrefix:report.firstCache.prefix,secondPrefix:report.secondCache.prefix}));
  }catch(error){report.failure=error.stack;console.error(error);process.exitCode=1;}
  finally{
    clearTimeout(timer);report.elapsedMs=Date.now()-started;report.encodedSpeechBytes=encodedSpeechBytes;report.budgetSpeechBytes=budgetSpeechBytes;
    if(page&&!page.isClosed())try{report.finalCache=await snapshot(page);report.finalStatuses=await page.evaluate(()=>window.qaStatuses||[]);}catch{}
    fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(report,null,2));
    await browser?.close();
  }
})();
