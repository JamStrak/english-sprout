/* Isolated native SVG lifecycle probe. Does not use the running app or user profile. */
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const http=require('node:http');
const path=require('node:path');
const {chromium}=require('C:/Users/Jam/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');

(async()=>{
  const root=path.resolve(__dirname,'..'),out=path.join(root,'test-results','xiaoya-paper-art-native');
  await fs.mkdir(out,{recursive:true});
  const module=await fs.readFile(path.join(root,'xiaoya','paper-art.js'),'utf8');
  const requests={},checks=[];let browser,releaseShell;
  const shellGate=new Promise(resolve=>{releaseShell=resolve;});
  const html=`<!doctype html><html><head><base href="../"><meta name="xiaoya-build" content="012345abcdef"><style>button{width:160px;height:180px;padding:0;border:0;background:#fff}svg{width:100%;height:100%}body{background:#eee}</style></head><body><main id="app"></main><script type="module">
    import {paperLayer,installPaperArt} from '/paper-art.js';
    const root=document.querySelector('#app');window.dispose=installPaperArt(document.body);window.clicks=0;
    root.addEventListener('click',()=>window.clicks++);
    window.draw=(key='shell')=>{root.innerHTML='<button aria-label="Test"><svg viewBox="0 0 160 180" xmlns="http://www.w3.org/2000/svg">'+paperLayer(key,'<circle cx="80" cy="90" r="50" fill="orange"/>')+'</svg></button>';};
    window.ghost=()=>{const node=document.createElement('div');node.dataset.ghost='';node.innerHTML='<svg viewBox="0 0 160 180" xmlns="http://www.w3.org/2000/svg">'+paperLayer('shell','<circle cx="80" cy="90" r="50" fill="orange"/>')+'</svg>';document.body.append(node);};
    window.draw();window.fixtureReady=true;
  </script></body></html>`;
  const worker=`const cache='xiaoya-core-012345abcdef';self.addEventListener('install',e=>e.waitUntil(caches.open(cache).then(c=>c.addAll(['/nested/xiaoya/','/paper-art.js'])).then(()=>self.skipWaiting())));self.addEventListener('activate',e=>e.waitUntil(self.clients.claim()));self.addEventListener('fetch',e=>e.respondWith(caches.open(cache).then(async c=>(await c.match(e.request))||fetch(e.request))));`;
  const server=http.createServer(async(req,res)=>{
    const url=req.url;requests[url]=(requests[url]||0)+1;
    if(url==='/nested/xiaoya/'||url==='/nested/xiaoya/index.html'){res.writeHead(200,{'Content-Type':'text/html'});res.end(html);return;}
    if(url==='/paper-art.js'){res.writeHead(200,{'Content-Type':'text/javascript'});res.end(module);return;}
    if(url==='/nested/xiaoya/sw.js'){res.writeHead(200,{'Content-Type':'text/javascript'});res.end(worker);return;}
    if(url==='/nested/xiaoya/paper/v1/shell.webp'){
      await shellGate;res.writeHead(200,{'Content-Type':'image/svg+xml','Cache-Control':'no-cache'});
      res.end('<svg xmlns="http://www.w3.org/2000/svg" width="160" height="180"><rect x="30" y="40" width="100" height="100" rx="20" fill="#468bce"/></svg>');return;
    }
    res.writeHead(404);res.end('missing fixture');
  });
  try {
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
    const base=`http://127.0.0.1:${server.address().port}`;
    browser=await chromium.launch({channel:'msedge',headless:true});
    const context=await browser.newContext({viewport:{width:390,height:500}}),page=await context.newPage();
    const errors=[];page.on('pageerror',error=>errors.push(error.message));
    await page.goto(`${base}/nested/xiaoya/`,{waitUntil:'domcontentloaded'});
    await page.waitForFunction(()=>window.fixtureReady);
    const bounds=await page.locator('button').boundingBox();
    assert.equal(await page.locator('[data-paper-image]').getAttribute('opacity'),'0');
    assert.equal(await page.locator('[data-paper-fallback]').evaluate(node=>getComputedStyle(node).visibility),'visible');
    checks.push('Pending native SVG image keeps visible vector and fixed button geometry');
    releaseShell();
    await page.locator('[data-paper-state="ready"]').waitFor();
    assert.equal(await page.locator('[data-paper-image]').getAttribute('opacity'),'1');
    assert.equal(await page.locator('[data-paper-fallback]').evaluate(node=>getComputedStyle(node).visibility),'hidden');
    assert.deepEqual(await page.locator('button').boundingBox(),bounds);
    await page.locator('button').click();assert.equal(await page.evaluate(()=>window.clicks),1);
    await page.screenshot({path:path.join(out,'ready-image.png')});
    checks.push('Native load swaps art only after success, without layout/focus/pointer interference');
    await page.waitForFunction(async()=>!!await (await caches.open('xiaoya-core-012345abcdef')).match(new URL('xiaoya/paper/v1/shell.webp',document.baseURI)));
    assert.equal(await page.evaluate(()=>!!navigator.serviceWorker.controller),false);
    assert.equal(requests['/nested/xiaoya/paper/v1/shell.webp'],1);
    checks.push('First uncontrolled page cached image using its HTTP response: exactly one network request');
    await page.evaluate(async()=>{await navigator.serviceWorker.register('xiaoya/sw.js');await navigator.serviceWorker.ready;});
    await page.waitForFunction(()=>!!navigator.serviceWorker.controller);
    await page.evaluate(()=>window.draw());await page.locator('[data-paper-state="ready"]').waitFor();
    assert.equal(requests['/nested/xiaoya/paper/v1/shell.webp'],1);
    checks.push('Cached native image fires direct load after a new SVG render and makes no duplicate request');
    await page.evaluate(()=>window.ghost());await page.locator('[data-ghost] [data-paper-state="ready"]').waitFor();
    assert.equal(requests['/nested/xiaoya/paper/v1/shell.webp'],1);
    assert.equal(await page.locator('[data-ghost] [data-paper-fallback]').evaluate(node=>getComputedStyle(node).visibility),'hidden');
    await page.locator('[data-ghost]').evaluate(node=>node.remove());
    checks.push('Body-level drag ghost loads cached paper art without another network request');
    await page.evaluate(()=>window.draw('seed'));await page.locator('[data-paper-state="fallback"]').waitFor();
    assert.equal(await page.locator('[data-paper-fallback]').evaluate(node=>getComputedStyle(node).visibility),'visible');
    assert.equal(await page.locator('[data-paper-image]').getAttribute('opacity'),'0');
    assert.deepEqual(await page.locator('button').boundingBox(),bounds);
    await page.screenshot({path:path.join(out,'missing-vector.png')});
    checks.push('HTTP 404 retains complete vector with identical layout');
    await page.close();await context.setOffline(true);
    const offline=await context.newPage();await offline.goto(`${base}/nested/xiaoya/`);
    await offline.locator('[data-paper-state="ready"]').waitFor();
    await offline.evaluate(()=>window.draw('flower-daisy'));await offline.locator('[data-paper-state="fallback"]').waitFor();
    assert.equal(await offline.locator('[data-paper-fallback]').evaluate(node=>getComputedStyle(node).visibility),'visible');
    checks.push('New offline page recovers first-visit art from real CacheStorage/SW; unseen art uses vector');
    assert.deepEqual(errors,[]);
    const report={browser:'Microsoft Edge isolated headless profile',build:'source module, isolated fixture server',checks,requests,passed:checks.length};
    await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
  } finally {releaseShell();await browser?.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});
