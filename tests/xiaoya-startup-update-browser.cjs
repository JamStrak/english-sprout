/* Real old-worker upgrade regression, isolated from the user's browser/server.
 * Build separately first: npm run build:dev
 * Run: node tests/xiaoya-startup-update-browser.cjs
 * Uses the historical worker from Git, unchanged except its fixture manifests.
 * No microphone, user profile, child records, source build, or service is changed.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const http = require('node:http');
const crypto = require('node:crypto');
const {execFileSync} = require('node:child_process');
const {pathToFileURL} = require('node:url');
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/Jam/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root = path.resolve(__dirname, '..'), dist = path.join(root, 'dist');
const out = path.join(root, 'test-results', 'xiaoya-startup-update');
const oldBuild = 'aaaaaaaaaaaa', oldRevision = '8c7b61f';
const report = {startedAt:new Date().toISOString(),checks:[],scope:{isolatedProfile:true,isolatedLoopbackServer:true,microphoneUsed:false,historicalWorker:oldRevision}};
const mime = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.webmanifest':'application/manifest+json','.webp':'image/webp','.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml','.mp3':'audio/mpeg'};
let browser, context, server, page, oldPage, origin, expected, latest = false, holdAudio = true, heldAudio = [], heldAudioPath, audioRequests = 0;
const oldHtml = `<!doctype html><html><head><meta name="xiaoya-build" content="${oldBuild}"><base href="../"></head><body><main id="legacy-startup">Historical cached shell fixture</main><script>navigator.serviceWorker.register('xiaoya/sw.js',{scope:'xiaoya/',updateViaCache:'none'});</script></body></html>`;
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const oldWorker = execFileSync('git',['show',`${oldRevision}:xiaoya/sw.template.js`],{cwd:root,encoding:'utf8',windowsHide:true})
  .replaceAll('__XIAOYA_BUILD__',oldBuild).replace('__XIAOYA_CORE__',JSON.stringify(['./','./index.html']))
  .replace('/*__XIAOYA_INTEGRITY__*/{}',JSON.stringify({'./':hash(oldHtml),'./index.html':hash(oldHtml)})).replace('/*__XIAOYA_AUDIO__*/[]','[]');
const snapshot = p => p.evaluate(()=>Object.fromEntries(Object.keys(localStorage).sort().map(key=>[key,localStorage.getItem(key)])));
const buildOf = p => p.locator('meta[name="xiaoya-build"]').getAttribute('content');
function passed(name,detail={}) { report.checks.push({name,status:'PASS',detail});console.log(`PASS ${name}`); }
function releaseAudio() { holdAudio=false;for(const resume of heldAudio.splice(0))resume(); }
async function serve() {
  server=http.createServer(async(req,res)=>{
    try {
      let name=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
      if(!latest&&(name==='/xiaoya/'||name==='/xiaoya/index.html'||name==='/xiaoya/sw.js')) {
        const worker=name.endsWith('/sw.js'),body=worker?oldWorker:oldHtml;
        res.writeHead(200,{'Content-Type':worker?mime['.js']:mime['.html'],'Cache-Control':'no-cache'});return res.end(body);
      }
      if(name.endsWith('/'))name+='index.html';
      const file=path.resolve(dist,'.'+name),relative=path.relative(dist,file);
      if(relative.startsWith('..')||path.isAbsolute(relative))return res.writeHead(403).end();
      const stat=await fsp.stat(file);if(!stat.isFile())throw Error('Not a file');
      if(name.endsWith('.mp3')) {
        audioRequests++;
        // Block one required clip, not all six HTTP connections: the pack stays
        // incomplete without artificially starving homepage image requests.
        if(holdAudio&&!heldAudioPath)heldAudioPath=name;
        if(holdAudio&&name===heldAudioPath)await new Promise(resolve=>heldAudio.push(resolve));
      }
      if(res.destroyed)return;
      let start=0,end=stat.size-1,status=200;
      const headers={'Content-Type':mime[path.extname(file)]||'application/octet-stream','Cache-Control':'no-cache','Accept-Ranges':'bytes'};
      if(req.headers.range) {
        const range=/^bytes=(\d*)-(\d*)$/.exec(req.headers.range);
        if(!range||(!range[1]&&!range[2]))return res.writeHead(416).end();
        if(range[1]){start=Number(range[1]);if(range[2])end=Math.min(end,Number(range[2]));}else start=Math.max(0,stat.size-Number(range[2]));
        if(start>end||start>=stat.size)return res.writeHead(416).end();
        status=206;headers['Content-Range']=`bytes ${start}-${end}/${stat.size}`;
      }
      headers['Content-Length']=end-start+1;res.writeHead(status,headers);
      if(req.method==='HEAD')res.end();else fs.createReadStream(file,{start,end}).on('error',()=>res.destroy()).pipe(res);
    }catch{if(!res.headersSent)res.writeHead(404);res.end('Missing startup test candidate');}
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  return `http://127.0.0.1:${server.address().port}`;
}
async function paperReady(p) {
  await p.locator('main.home-view [data-paper-art="buddy-welcome"][data-paper-state="ready"]').waitFor();
  assert.equal(await p.locator('main.home-view [data-paper-art="buddy-welcome"] [data-paper-image]').getAttribute('opacity'),'1');
  assert.equal(await p.locator('main.home-view [data-paper-art="buddy-welcome"] [data-paper-fallback]').getAttribute('visibility'),'hidden');
}
async function main() {
  await fsp.mkdir(out,{recursive:true});
  expected=JSON.parse(await fsp.readFile(path.join(dist,'xiaoya/version.json'),'utf8'));report.candidate=expected;
  const startup=`/xiaoya/start-${expected.build}.html?garden=b`;
  assert.match(expected.build,/^[a-f0-9]{12}$/);
  assert.equal(await fsp.readFile(path.join(dist,'xiaoya',`start-${expected.build}.html`),'utf8'),await fsp.readFile(path.join(dist,'xiaoya/index.html'),'utf8'),'Build the current candidate before running this regression');
  origin=await serve();
  browser=await chromium.launch({channel:'msedge',headless:true,args:['--no-proxy-server','--autoplay-policy=no-user-gesture-required']});
  context=await browser.newContext({viewport:{width:1180,height:900},serviceWorkers:'allow',reducedMotion:'reduce',timezoneId:'Asia/Shanghai'});
  const errors=[];context.on('page',p=>p.on('pageerror',e=>errors.push(e.message)));
  await context.addInitScript(()=>{
    window.qaStartup={microphone:0};
    if(navigator.mediaDevices)navigator.mediaDevices.getUserMedia=()=>{qaStartup.microphone++;throw Error('Startup regression must not open a microphone');};
  });
  oldPage=await context.newPage();oldPage.setDefaultTimeout(20000);
  await oldPage.goto(`${origin}/xiaoya/?garden=b`,{waitUntil:'domcontentloaded'});
  await oldPage.waitForFunction(()=>navigator.serviceWorker.controller?.state==='activated');
  const learning=await import(pathToFileURL(path.join(root,'xiaoya/learning.js')));
  const meadow=await import(pathToFileURL(path.join(root,'xiaoya/garden-meadow.js')));
  const state=learning.recordEvidence(learning.createState(),{attemptId:'startup-preserved-evidence',eventId:'hello-morning',kind:'speech',result:'supported',source:'parent',helped:true,date:'2026-10-19'});
  const garden=meadow.rewardRound(meadow.createMeadow(),{roundId:'startup-preserved-round',eventId:'hello-morning',date:'2026-10-19'});
  await oldPage.evaluate(({state,garden})=>{
    localStorage.setItem('xiaoya-english:state:v1',JSON.stringify(state));
    localStorage.setItem('xiaoya-english:meadow:v1',JSON.stringify(garden));
    localStorage.setItem('xiaoya-english:preferences:v1',JSON.stringify({welcome:true,mic:false,guideStep:'done'}));
    localStorage.setItem('xiaoya-english:voice:v1','ryan');
    localStorage.setItem('qa-startup-original-child','keep-records-through-upgrade');
  },{state,garden});
  const child=await snapshot(oldPage);
  latest=true;
  // Reproduce why a query alone cannot fix an already-installed historical worker.
  await oldPage.goto(`${origin}/xiaoya/?garden=b&build=${expected.build}`,{waitUntil:'domcontentloaded'});
  assert.equal(await buildOf(oldPage),oldBuild);await oldPage.locator('#legacy-startup').waitFor();
  passed('historical worker reproduces stale canonical page even with a new build query');
  const oldNavigations=[];oldPage.on('framenavigated',frame=>{if(frame===oldPage.mainFrame())oldNavigations.push(frame.url());});
  page=await context.newPage();page.setDefaultTimeout(20000);
  const started=Date.now();
  await page.goto(origin+startup,{waitUntil:'domcontentloaded'});
  await page.locator('main.home-view').waitFor();
  assert.equal(await buildOf(page),expected.build);
  if(expected.channel==='internal')await page.locator('#xiaoya-gm .gm-launcher').waitFor();
  const firstRenderMs=Date.now()-started;
  await page.waitForFunction(()=>window.xiaoyaWorker?.installing?.state==='installing');
  // Installing begins with core assets. Wait for an actual blocked audio request
  // before asserting that first rendering is independent of the full voice pack.
  const blockedDeadline=Date.now()+20000;
  while(!heldAudio.length&&Date.now()<blockedDeadline)await new Promise(resolve=>setTimeout(resolve,25));
  assert(heldAudio.length>0,'The new worker audio pack must still be blocked during first render');
  const first=await page.evaluate(async()=>({controller:!!navigator.serviceWorker.controller,pack:(await import(new URL('audio-pack.js',document.querySelector('script[type="module"][src]').src))).audioPackStatus()}));
  assert(first.controller);assert.notEqual(first.pack.state,'ready');
  passed('first immutable navigation opens current UI before the new audio pack finishes',{ms:firstRenderMs,heldAudioRequests:heldAudio.length,pack:first.pack.state});
  await paperReady(page);
  assert.equal(page.url(),origin+startup,'Paper art must become ready without leaving the homepage');
  await page.screenshot({path:path.join(out,'cold-homepage.png')});
  passed('cold homepage paper character becomes ready without navigation or clicking');
  assert.deepEqual(await snapshot(page),child);
  passed('learning evidence, garden balance, voice and preferences preserved byte for byte');
  releaseAudio();
  await page.waitForFunction(()=>navigator.serviceWorker.controller?.state==='activated'&&!window.xiaoyaWorker?.installing&&!window.xiaoyaWorker?.waiting,null,{timeout:120000});
  // Await the evaluated value explicitly: some bundled Playwright releases
  // consider the async waitForFunction callback's Promise truthy prematurely.
  const readyDeadline=Date.now()+120000;
  let voicePack;
  do{
    voicePack=await page.evaluate(async()=>(await import(new URL('audio-pack.js',document.querySelector('script[type="module"][src]').src))).audioPackStatus());
    if(voicePack.state==='ready'&&voicePack.done===expected.audio.count&&voicePack.total===expected.audio.count)break;
    await new Promise(resolve=>setTimeout(resolve,50));
  }while(Date.now()<readyDeadline);
  assert.equal(voicePack.state,'ready');assert.equal(voicePack.done,expected.audio.count);assert.equal(voicePack.total,expected.audio.count);
  const installed=await page.evaluate(async()=>{
    const {audioPackStatus}=await import(new URL('audio-pack.js',document.querySelector('script[type="module"][src]').src));
    const cachesFound=[];
    for(const name of await caches.keys()){
      const cache=await caches.open(name),shell=await cache.match(new URL('xiaoya/index.html',document.baseURI));
      cachesFound.push({name,count:(await cache.keys()).length,shell:shell?(await shell.text()).match(/name="xiaoya-build" content="([^"]+)"/)?.[1]:null});
    }
    return {pack:audioPackStatus(),controller:navigator.serviceWorker.controller?.state,installing:window.xiaoyaWorker?.installing?.state,waiting:window.xiaoyaWorker?.waiting?.state,caches:cachesFound};
  });
  assert.equal(await buildOf(oldPage),oldBuild);assert.deepEqual(oldNavigations,[],'Worker activation must not reload another open activity');
  passed('new worker verifies the full voice pack without automatically reloading the old tab',{audioRequests,verified:voicePack,installed});
  await page.reload({waitUntil:'domcontentloaded'});await paperReady(page);
  assert.equal(await buildOf(page),expected.build);assert.deepEqual(await snapshot(page),child);
  passed('warm reload keeps current UI and immediately usable homepage art');
  await context.setOffline(true);
  await page.reload({waitUntil:'domcontentloaded'});await paperReady(page);
  assert.equal(await buildOf(page),expected.build);assert.deepEqual(await snapshot(page),child);
  await page.goto(`${origin}/xiaoya/?garden=b`,{waitUntil:'domcontentloaded'});await paperReady(page);
  assert.equal(await buildOf(page),expected.build);assert.deepEqual(await snapshot(page),child);
  assert.equal(await page.evaluate(()=>qaStartup.microphone),0);assert.deepEqual(errors,[]);
  passed('current immutable and canonical entries both start offline with records and paper art intact');
}
main().catch(async error=>{
  process.exitCode=1;report.checks.push({name:'startup upgrade regression',status:'FAIL',error:error.stack});console.error(error.stack);
  if(page)await page.screenshot({path:path.join(out,'failure.png')}).catch(()=>{});
}).finally(async()=>{
  releaseAudio();await context?.close().catch(()=>{});await browser?.close().catch(()=>{});
  server?.closeAllConnections();if(server)await new Promise(resolve=>server.close(resolve));
  report.finishedAt=new Date().toISOString();await fsp.mkdir(out,{recursive:true});await fsp.writeFile(path.join(out,'results.json'),JSON.stringify(report,null,2));
});
