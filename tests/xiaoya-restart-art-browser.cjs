/* Restart/offline art regression. Each run snapshots dist in memory and serves
 * it from its own ephemeral loopback server, with an isolated Edge profile.
 * Never builds, starts the user's service, reads real records or records audio.
 * Legacy diagnosis: XIAOYA_RESTART_EXPECT=legacy node tests/xiaoya-restart-art-browser.cjs
 * Fixed candidate: node tests/xiaoya-restart-art-browser.cjs
 */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const http=require('node:http');
const crypto=require('node:crypto');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'C:/Users/Jam/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root=path.resolve(__dirname,'..'),dist=path.join(root,'dist');
const legacy=process.env.XIAOYA_RESTART_EXPECT==='legacy';
const expected=JSON.parse(fs.readFileSync(path.join(dist,'xiaoya/version.json'),'utf8'));
const out=path.resolve(process.env.XIAOYA_RESTART_TEST_OUT||path.join(root,'test-results',`xiaoya-restart-art-${legacy?'legacy':'fixed'}`));
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.webmanifest':'application/manifest+json','.webp':'image/webp','.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml','.mp3':'audio/mpeg'};
const snapshot=new Map();
function capture(dir){for(const e of fs.readdirSync(dir,{withFileTypes:true})){const f=path.join(dir,e.name);if(e.isDirectory())capture(f);else snapshot.set('/'+path.relative(dist,f).replaceAll('\\','/'),fs.readFileSync(f));}}
capture(dist);
const report={startedAt:new Date().toISOString(),candidate:expected,mode:legacy?'legacy-reproduction':'regression',scope:{isolatedProfile:true,isolatedLoopbackServer:true,distSnapshot:true,realServerChanged:false,microphoneUsed:false},checks:[]};
const files=['story-play-again-intro-paper-v04.webp','play-again-paper-v1.webp'];
const startup=`/xiaoya/start-${expected.build}.html?garden=b&story=play-again`;
const artManifest=legacy?[]:JSON.parse(snapshot.get(`/xiaoya/releases/${expected.build}/art-pack.json`).toString('utf8'));
let browser,server,origin,port,blocked=new Set();
const requests=[];
const delay=ms=>new Promise(r=>setTimeout(r,ms));
function save(){fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(report,null,2));}
function pass(name,evidence){report.checks.push({name,status:'PASS',evidence});save();console.log('PASS '+name);}
async function serve(){
  server=http.createServer((req,res)=>{
    let name=decodeURIComponent(new URL(req.url,'http://localhost').pathname);if(name.endsWith('/'))name+='index.html';
    requests.push(name);
    const body=snapshot.get(name);
    if(blocked.has(name)||!body)return res.writeHead(404,{'Cache-Control':'no-store'}).end('Isolated test missing asset');
    let start=0,end=body.length-1,status=200;
    const headers={'Content-Type':mime[path.extname(name)]||'application/octet-stream','Cache-Control':'no-cache','Accept-Ranges':'bytes'};
    if(req.headers.range){const range=/^bytes=(\d*)-(\d*)$/.exec(req.headers.range);if(!range||(!range[1]&&!range[2]))return res.writeHead(416).end();if(range[1]){start=Number(range[1]);if(range[2])end=Math.min(end,Number(range[2]));}else start=Math.max(0,body.length-Number(range[2]));if(start>end||start>=body.length)return res.writeHead(416).end();status=206;headers['Content-Range']=`bytes ${start}-${end}/${body.length}`;}
    headers['Content-Length']=end-start+1;res.writeHead(status,headers);res.end(req.method==='HEAD'?undefined:body.subarray(start,end+1));
  });
  await new Promise(resolve=>server.listen(port||0,'127.0.0.1',resolve));port=server.address().port;origin=`http://127.0.0.1:${port}`;
}
async function stop(){if(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));server=null;}}
async function context(){
  const c=await browser.newContext({viewport:{width:1180,height:900},serviceWorkers:'allow',reducedMotion:'reduce',timezoneId:'Asia/Shanghai'});
  await c.addInitScript(()=>{
    window.qaRestart={microphone:0,art:[],errors:[]};
    navigator.serviceWorker?.addEventListener('message',e=>{if(e.data?.type==='xiaoya-art-pack')qaRestart.art.push(e.data);});
    if(navigator.mediaDevices)navigator.mediaDevices.getUserMedia=()=>{qaRestart.microphone++;return Promise.reject(new Error('No microphone in restart regression'));};
    const NativeAudio=Audio;window.Audio=function(...args){const a=new NativeAudio(...args);a.playbackRate=4;return a;};window.Audio.prototype=NativeAudio.prototype;
    window.addEventListener('error',e=>{if(e.message)qaRestart.errors.push(e.message);});
    window.addEventListener('unhandledrejection',e=>qaRestart.errors.push(String(e.reason)));
  });
  return c;
}
async function home(c){const p=await c.newPage();p.setDefaultTimeout(25000);await p.goto(origin+startup,{waitUntil:'domcontentloaded'});await p.locator('main.home-view').waitFor();assert.equal(await p.locator('meta[name="xiaoya-build"]').getAttribute('content'),expected.build);return p;}
async function packReady(p){
  await p.waitForFunction(()=>navigator.serviceWorker.controller?.state==='activated'&&!window.xiaoyaWorker?.installing&&!window.xiaoyaWorker?.waiting,null,{timeout:120000});
  const deadline=Date.now()+120000;let state;
  do{state=await p.evaluate(async()=>(await import(new URL('audio-pack.js',document.querySelector('script[type="module"][src]').src))).audioPackStatus());if(state.state==='ready'&&state.done===expected.audio.count)break;await delay(50);}while(Date.now()<deadline);
  assert.equal(state.state,'ready');assert.equal(state.done,expected.audio.count);
  if(!legacy){
    await p.evaluate(()=>navigator.serviceWorker.controller.postMessage({type:'xiaoya-prepare-art',build:document.querySelector('meta[name="xiaoya-build"]').content}));
    await p.waitForFunction(()=>qaRestart.art.some(x=>x.state==='ready'&&x.done===x.total&&x.total>0),null,{timeout:120000});
  }
  return state;
}
async function cachesFor(p){return p.evaluate(async files=>{const names=await caches.keys(),result={};for(const name of names){const c=await caches.open(name),keys=await c.keys();result[name]={total:keys.length,stories:keys.filter(k=>k.url.includes('/xiaoya/stories/')).length,targets:Object.fromEntries(await Promise.all(files.map(async f=>[f,!!await c.match(new URL('xiaoya/stories/'+f,document.baseURI))])))};}return result;},files);}
async function fullArtCache(p){
  assert.equal(artManifest.length,expected.art.count);
  const inventory=await p.evaluate(async({manifest,name})=>{
    const c=await caches.open(name),failures=[];let count=0,bytes=0;
    for(const entry of manifest){
      const response=await c.match(new URL(entry.url,new URL('xiaoya/',document.baseURI)));
      if(!response){failures.push({url:entry.url,error:'missing'});continue;}
      const body=await response.arrayBuffer(),sha256=[...new Uint8Array(await crypto.subtle.digest('SHA-256',body))].map(x=>x.toString(16).padStart(2,'0')).join('');
      if(body.byteLength!==entry.bytes||sha256!==entry.sha256)failures.push({url:entry.url,error:'integrity'});count++;bytes+=body.byteLength;
    }
    return {name,count,bytes,failures};
  },{manifest:artManifest,name:`xiaoya-art-${expected.art.version}`});
  assert.deepEqual(inventory.failures,[]);assert.equal(inventory.count,expected.art.count);assert.equal(inventory.bytes,expected.art.bytes);return inventory;
}
async function homeArt(p){await p.locator('main.home-view [data-paper-art="buddy-welcome"][data-paper-state="ready"]').waitFor();}
async function start(p){await p.locator('[data-action="next-event"]').first().click();await p.locator('.story-stage .story-picture').waitFor();}
async function picture(p,status){await p.waitForFunction(({file,status})=>{const e=document.querySelector('.story-stage .story-picture');return e?.dataset.pictureUrl?.endsWith('/'+file)&&e.dataset.pictureStatus===status;},{file:files[1],status},{timeout:40000});return p.locator('.story-stage .story-picture').evaluate(e=>({url:e.dataset.pictureUrl,status:e.dataset.pictureStatus,vector:e.classList.contains('vector-picture'),svg:!!e.querySelector('svg'),text:e.innerText,background:getComputedStyle(e).backgroundImage}));}
async function healthy(p){const q=await p.evaluate(()=>qaRestart);assert.equal(q.microphone,0);assert.deepEqual(q.errors,[]);return q;}

async function coldUnseen(){
  await serve();const c=await context();let p;
  try{
    p=await home(c);const audio=await packReady(p),cache=await cachesFor(p),art=legacy?null:await fullArtCache(p);
    assert.equal(await p.locator('.story-stage').count(),0,'No lesson was opened before shutdown');
    if(legacy)assert(!Object.values(cache).some(x=>Object.values(x.targets).some(Boolean)),'Previously unseen art is absent while the full voice pack is ready');
    else assert(files.every(f=>Object.values(cache).some(x=>x.targets[f])),'The entire art pack includes never-viewed lesson pictures');
    pass(legacy?'legacy homepage caches all voices but no unseen story art':'full art pack includes never-viewed story art',{audio,art,cache});
    await p.close();await stop();p=await home(c);if(!legacy)await homeArt(p);assert.equal(await p.evaluate(()=>navigator.onLine),true,'Stopping the local service is not navigator offline mode');await start(p);
    const view=await picture(p,legacy?'failed':'ready');
    if(legacy)assert(view.vector&&view.svg,'Reproduce old SVG under the same build when the local service is absent');else assert(!view.vector&&!view.svg,'An unseen course must keep its raster art after restart');
    await p.screenshot({path:path.join(out,legacy?'same-build-unseen-svg.png':'unseen-story-service-stopped.png')});
    pass(legacy?'same immutable build falls back to old SVG with local service stopped':'unseen lesson remains raster with local service stopped',{build:await p.locator('meta[name="xiaoya-build"]').getAttribute('content'),view,serverRunning:false,navigatorOnline:true});
    await healthy(p);
    if(!legacy){
      const previous='/xiaoya/start-662cdacbb1dd.html?garden=b&story=play-again';
      await p.evaluate(async previous=>{const c=await caches.open('xiaoya-core-662cdacbb1dd');await c.put(new URL(previous,location.origin),new Response('<!doctype html><meta name="xiaoya-build" content="662cdacbb1dd"><main>Retired cached shell sentinel</main>',{headers:{'Content-Type':'text/html'}}));},previous);
      await p.close();p=await c.newPage();await p.goto(origin+previous,{waitUntil:'domcontentloaded'});await p.locator('main.home-view').waitFor();
      const restoredBuild=await p.locator('meta[name="xiaoya-build"]').getAttribute('content');assert.equal(restoredBuild,expected.build);await homeArt(p);await start(p);const restoredView=await picture(p,'ready');assert(!restoredView.vector&&!restoredView.svg);await healthy(p);
      pass('old immutable sidebar bookmark resolves to the current verified shell offline',{previous,build:restoredBuild,view:restoredView,serverRunning:false});
    }
  }finally{await c.close();await stop();}
}
async function viewedPersistence(){
  await serve();const c=await context();let p;
  try{
    p=await home(c);await packReady(p);await start(p);const first=await picture(p,'ready');assert(!first.vector&&!first.svg);
    const deadline=Date.now()+20000;let cache;do{cache=await cachesFor(p);if(files.every(f=>Object.values(cache).some(x=>x.targets[f])))break;await delay(100);}while(Date.now()<deadline);
    assert(files.every(f=>Object.values(cache).some(x=>x.targets[f])),'Viewed pictures persist under the SW cache URL');
    await p.close();await stop();p=await home(c);await start(p);const view=await picture(p,'ready');assert(!view.vector&&!view.svg);await healthy(p);
    pass('viewed pictures persist under a matching SW cache and survive local service shutdown',{cache,view});
  }finally{await c.close();await stop();}
}
async function missingRecovery(){
  // Run after the corrected candidate exists. A fresh isolated profile with
  // two missing files must show an honest placeholder, never legacy artwork.
  blocked=new Set(files.map(f=>'/xiaoya/stories/'+f));await serve();const c=await context();let p;
  try{
    p=await home(c);await start(p);const view=await picture(p,'failed');assert(!view.vector&&!view.svg);assert(view.text.trim(),'Missing art needs an explicit explanation');
    await p.locator('[data-picture-placeholder]').waitFor();
    const retry=p.locator('[data-action="picture-retry"]').first();await retry.waitFor();
    await p.locator('[data-action="story-continue"]:enabled').waitFor({timeout:40000});
    await p.evaluate(()=>{window.qaLesson=document.querySelector('main');window.qaSpeak=document.querySelector('[data-action="story-continue"]');});
    await p.screenshot({path:path.join(out,'missing-picture-placeholder.png')});const url=p.url();blocked.clear();await retry.click();const restored=await picture(p,'ready');assert(!restored.vector&&!restored.svg);assert.equal(p.url(),url);await healthy(p);
    const stable=await p.evaluate(()=>({lesson:qaLesson===document.querySelector('main'),speakingButton:qaSpeak===document.querySelector('[data-action="story-continue"]')}));assert.deepEqual(stable,{lesson:true,speakingButton:true});
    pass('missing art is explicit and retries correctly without reload',{missing:view,restored,stable});
  }finally{blocked.clear();await c.close();await stop();}
}
(async()=>{
  fs.mkdirSync(out,{recursive:true});report.snapshot={files:snapshot.size,bytes:[...snapshot.values()].reduce((n,b)=>n+b.length,0),workerSha256:crypto.createHash('sha256').update(snapshot.get('/xiaoya/sw.js')).digest('hex')};save();
  fs.writeFileSync(path.join(out,'candidate-worker.js'),snapshot.get('/xiaoya/sw.js'));
  fs.writeFileSync(path.join(out,'candidate-version.json'),JSON.stringify(expected,null,2));
  browser=await chromium.launch({channel:'msedge',headless:true,args:['--no-proxy-server','--autoplay-policy=no-user-gesture-required']});
  await coldUnseen();if(legacy)await viewedPersistence();else await missingRecovery();
})().catch(error=>{report.failure=error.stack;console.error(error.stack);process.exitCode=1;}).finally(async()=>{await stop();await browser?.close();report.finishedAt=new Date().toISOString();save();});
