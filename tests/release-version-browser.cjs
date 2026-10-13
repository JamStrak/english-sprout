// Inspect the actual deployed/cache-backed release, not a URL version label.
const {chromium}=require('C:/Users/Jam/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const origin=process.env.TEST_URL||'http://127.0.0.1:24736/',expected=process.env.EXPECT_VERSION||'1.7.2';
const out=path.resolve(__dirname,'../test-results',process.env.REPORT_NAME||'release-version');fs.mkdirSync(out,{recursive:true});
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true,args:['--no-proxy-server']});
 const checks=[];let manifest;
 try{
  for(const [width,height] of [[320,568],[390,844],[768,1024]]){
   const context=await browser.newContext({viewport:{width,height},hasTouch:true}),page=await context.newPage(),errors=[];
   page.on('pageerror',error=>errors.push(error.message));
   await page.goto(origin+'?v=99.99.99#home');await page.locator('#hero-start').waitFor();
   manifest=await page.evaluate(async()=>await(await fetch('./version.json?live='+Date.now(),{cache:'no-store'})).json());
   assert.equal(manifest.version,expected);
   assert.equal(await page.locator('meta[name="app-build"]').getAttribute('content'),manifest.build);
   assert.equal(await page.locator('[data-app-version]').getAttribute('data-build'),manifest.build);
   assert.match(await page.locator('[data-app-version]').innerText(),new RegExp('^v'+expected.replaceAll('.','\\.')));
   const layout=await page.evaluate(()=>{
    const badge=document.querySelector('[data-app-version]').getBoundingClientRect();
    const sources=[document.querySelector('#app-module').src,...[...document.querySelectorAll('link[rel="stylesheet"]')].map(node=>node.href)];
    return {badge:{x:badge.x,y:badge.y,right:badge.right,bottom:badge.bottom},sources,scroll:document.documentElement.scrollHeight,viewport:innerHeight};
   });
   assert.ok(layout.badge.x>=0&&layout.badge.y>=0&&layout.badge.right<=width&&layout.badge.bottom<=height);
   assert.ok(layout.scroll<=layout.viewport+2,'Home does not require vertical scrolling');
   assert.ok(layout.sources.every(url=>url.includes('/releases/'+manifest.build+'/src/')));
   await page.screenshot({path:path.join(out,'home-'+width+'.png')});
   checks.push({name:width+'px actual visible version and coherent immutable paths',status:'PASS'});
   await page.evaluate(()=>navigator.serviceWorker.ready);await page.waitForFunction(()=>!!navigator.serviceWorker.controller);
   const worker=await page.evaluate(()=>new Promise(resolve=>{const c=new MessageChannel();c.port1.onmessage=event=>resolve(event.data);navigator.serviceWorker.controller.postMessage('GET_BUILD',[c.port2]);}));
   assert.equal(worker.build,manifest.build);assert.equal(worker.version,expected);
   if(width===390){
    const cached=await page.evaluate(async()=>{
     const sw=await(await fetch('./sw.js?live='+Date.now(),{cache:'no-store'})).text();
     const integrity=JSON.parse(sw.match(/const INTEGRITY=(\{.*?\});/)[1]);
     const build=document.querySelector('meta[name="app-build"]').content,cache=await caches.open('english-sprout-core-'+build);
     const failures=[];
     for(const [file,expected] of Object.entries(integrity)){
      const response=await cache.match(new URL(file,location.href).href);if(!response){failures.push(file+': missing');continue;}
      const hash=await crypto.subtle.digest('SHA-256',await response.arrayBuffer());
      const actual=Array.from(new Uint8Array(hash),b=>b.toString(16).padStart(2,'0')).join('');if(actual!==expected)failures.push(file+': mismatch');
     }
     return {count:Object.keys(integrity).length,failures};
    });
    assert.ok(cached.count>30);assert.deepEqual(cached.failures,[]);checks.push({name:'Actual cached core SHA-256 matches deployed worker',status:'PASS',count:cached.count});
    await context.setOffline(true);await page.reload();await page.locator('#hero-start').waitFor();
    assert.match(await page.locator('[data-app-version]').innerText(),/^v1\.7\.2/);checks.push({name:'New release reopens offline with actual version',status:'PASS'});
   }
   assert.deepEqual(errors,[]);await context.close();console.log('PASS '+width+'px release, worker and layout');
  }
  fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({origin,manifest,checks,physicalDevice:false},null,2));console.log(JSON.stringify({passed:checks.length,manifest}));
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
