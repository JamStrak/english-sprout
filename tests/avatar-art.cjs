// Approved artwork regression in an isolated Edge profile and a disposable local server.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'C:/Users/Jam/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {pathToFileURL}=require('node:url');
const root=path.resolve(__dirname,'..'),dist=path.join(root,'dist'),output=path.join(root,'test-results','avatar-art-v151');
const ids=['rabbit','cat','bear','fox','panda','frog'],skinIds=['sunny','classic','meadow','peach','grape'];
const avatarKey='english-sprout-avatar-v1',learningKey='english-sprout-state-v1',skinKey='english-sprout-skin-v1';
const version=JSON.parse(fs.readFileSync(path.join(dist,'version.json'),'utf8')),checks=[];
const types={'.js':'application/javascript','.html':'text/html','.css':'text/css','.json':'application/json','.mp3':'audio/mpeg','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.webmanifest':'application/manifest+json'};
let browser,origin,networkDown=false;
const server=http.createServer((req,res)=>{
  if(networkDown){res.destroy();return;}
  const relative=decodeURIComponent(new URL(req.url,'http://localhost').pathname).replace(/^\//,'')||'index.html',file=path.resolve(dist,relative);
  if(!file.startsWith(dist+path.sep)){res.writeHead(403);res.end();return;}
  try{const bytes=fs.readFileSync(file);res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store','Content-Length':bytes.length});res.end(bytes);}
  catch{res.writeHead(404);res.end();}
});
const passed=(name,evidence)=>{checks.push({name,status:'PASS',evidence});console.log('PASS',name);};
async function tap(page,selector){
  const target=page.locator(selector).first();await target.waitFor({state:'visible'});
  const box=await target.evaluate(e=>{const r=e.getBoundingClientRect(),x=r.left+r.width/2,y=r.top+r.height/2;return{x,y,inside:r.left>=0&&r.top>=0&&r.right<=innerWidth&&r.bottom<=innerHeight,hit:e.contains(document.elementFromPoint(x,y)),scrollX,scrollY};});
  assert.ok(box.inside&&box.hit&&!box.scrollX&&!box.scrollY,`${selector}: not directly tappable ${JSON.stringify(box)}`);
  await page.mouse.click(box.x,box.y);
}
async function decode(page,selector,expected){
  const decoded=await page.locator(selector).evaluateAll(async images=>{
    await Promise.all(images.map(image=>image.decode()));
    return images.map(image=>({url:image.currentSrc,width:image.naturalWidth,height:image.naturalHeight,fit:getComputedStyle(image).objectFit}));
  });
  assert.equal(decoded.length,expected.length);
  for(let i=0;i<expected.length;i++){assert.ok(decoded[i].url.endsWith(`/avatars/${expected[i]}.webp`));assert.equal(decoded[i].width,384);assert.equal(decoded[i].height,384);assert.equal(decoded[i].fit,'contain');}
  return decoded;
}
async function open(page){await tap(page,'#avatar-open');await page.locator('dialog.avatar-picker[open]').waitFor();}
async function fit(page,label){
  const result=await page.locator('dialog.avatar-picker').evaluate(dialog=>{
    const r=dialog.getBoundingClientRect(),d=document.documentElement,b=document.body;
    const controls=[...dialog.querySelectorAll('button,input[type=range]')].filter(e=>e.getClientRects().length&&getComputedStyle(e).visibility!=='hidden').map(e=>{
      const r=e.getBoundingClientRect();return{id:e.id||e.dataset.avatarAnimal||e.dataset.avatarMode,width:r.width,height:r.height,left:r.left,right:r.right,top:r.top,bottom:r.bottom,hit:e.contains(document.elementFromPoint(r.left+r.width/2,r.top+r.height/2))};
    });
    return{viewport:{width:innerWidth,height:innerHeight},dialog:{left:r.left,right:r.right,top:r.top,bottom:r.bottom,height:dialog.clientHeight,scrollHeight:dialog.scrollHeight,width:dialog.clientWidth,scrollWidth:dialog.scrollWidth},documentWidth:Math.max(d.scrollWidth,b.scrollWidth),documentHeight:Math.max(d.scrollHeight,b.scrollHeight),scrollX,scrollY,controls};
  });
  const r=result.dialog;
  assert.ok(r.left>=0&&r.top>=0&&r.right<=result.viewport.width&&r.bottom<=result.viewport.height,`${label}: dialog bounds`);
  assert.ok(r.scrollHeight<=r.height+1&&r.scrollWidth<=r.width+1,`${label}: dialog scroll`);
  assert.ok(result.documentWidth<=result.viewport.width+1&&result.documentHeight<=result.viewport.height+1&&!result.scrollX&&!result.scrollY,`${label}: document scroll`);
  for(const c of result.controls)assert.ok(c.width>=44&&c.height>=44&&c.left>=r.left&&c.right<=r.right&&c.top>=r.top&&c.bottom<=r.bottom&&c.hit,`${label}: unreachable ${JSON.stringify(c)}`);
  await page.screenshot({path:path.join(output,label+'.png')});return result;
}
async function syntheticPhoto(page){
  return page.evaluate(()=>{
    const canvas=document.createElement('canvas');canvas.width=160;canvas.height=200;
    const context=canvas.getContext('2d');context.fillStyle='#b7d8e4';context.fillRect(0,0,160,200);
    context.fillStyle='#ffe1bd';context.beginPath();context.ellipse(80,110,52,65,0,0,Math.PI*2);context.fill();
    context.fillStyle='#454f5a';for(const x of [62,98]){context.beginPath();context.arc(x,103,4,0,Math.PI*2);context.fill();}
    context.beginPath();context.arc(80,121,17,0,Math.PI);context.stroke();return canvas.toDataURL('image/jpeg',.9);
  });
}
async function ready(page){await page.evaluate(()=>navigator.serviceWorker.ready);await page.waitForFunction(()=>!!navigator.serviceWorker.controller);}
async function start(viewport){
  const context=await browser.newContext({viewport,isMobile:true,hasTouch:true,reducedMotion:'reduce',timezoneId:'Asia/Shanghai'}),page=await context.newPage(),errors=[],failed=[],httpErrors=[],writes=[];
  page.setDefaultTimeout(15000);await page.clock.setFixedTime(new Date('2026-10-12T10:00:00+08:00'));
  page.on('pageerror',error=>errors.push(error.message));
  page.on('requestfailed',request=>{if(!networkDown&&request.failure()?.errorText!=='net::ERR_ABORTED')failed.push({url:request.url(),error:request.failure()?.errorText});});
  page.on('response',response=>{if(!networkDown&&response.status()>=400)httpErrors.push({url:response.url(),status:response.status()});});
  context.on('request',request=>{if(!['GET','HEAD'].includes(request.method()))writes.push(request.url());});
  await page.goto(origin,{waitUntil:'networkidle'});await page.locator('#avatar-open').waitFor();await ready(page);
  assert.equal(await page.locator('meta[name="app-build"]').getAttribute('content'),version.build);
  return{context,page,errors,failed,httpErrors,writes};
}
async function clean(f){assert.deepEqual(f.errors,[]);assert.deepEqual(f.failed,[]);assert.deepEqual(f.httpErrors,[]);assert.deepEqual(f.writes,[]);}
(async()=>{
  fs.mkdirSync(output,{recursive:true});assert.equal(version.version,'1.5.1','Build v1.5.1 before testing.');
  for(const id of ids)assert.ok(fs.existsSync(path.join(dist,'avatars',id+'.webp')));
  const learning=await import(pathToFileURL(path.join(root,'src/learning.js')).href),curriculum=JSON.parse(fs.readFileSync(path.join(dist,'data/curriculum.json'),'utf8'));
  let state=learning.createState('2026-10-01');
  for(let i=0;i<7;i++){const date=learning.addDays('2026-10-01',i);state=learning.recordResult(state,curriculum.lessons[i].id,'again',date,{isNew:true});if(i>0&&i<=5)state=learning.recordResult(state,curriculum.lessons[0].id,'again',date);}
  state=learning.validateImport(state,curriculum.lessons);
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));origin=`http://127.0.0.1:${server.address().port}/`;
  browser=await chromium.launch({channel:'msedge',headless:true});
  for(const viewport of [{width:320,height:568},{width:390,height:844}]){
    const tag=`${viewport.width}x${viewport.height}`,f=await start(viewport),{page}=f;
    try{
      await page.evaluate(({avatarKey,learningKey,state})=>{localStorage.setItem(avatarKey,JSON.stringify({version:1,kind:'preset',animal:'fox'}));localStorage.setItem(learningKey,JSON.stringify(state));},{avatarKey,learningKey,state});
      await page.reload({waitUntil:'networkidle'});const learningBefore=await page.evaluate(key=>localStorage.getItem(key),learningKey);
      await decode(page,'#avatar-open .avatar-preset-art',['fox']);
      assert.deepEqual(await page.evaluate(key=>JSON.parse(localStorage.getItem(key)),avatarKey),{version:1,kind:'preset',animal:'fox'});
      passed(tag+'-existing-v1-fox-preference-loads-approved-art');
      await open(page);const decoded=await decode(page,'.avatar-animal-grid .avatar-preset-art',ids);
      passed(tag+'-all-six-artworks-decode-and-fit',{decoded,layout:await fit(page,tag+'-all-six')});
      await tap(page,'#avatar-close');
      for(const id of ids){await open(page);await tap(page,`[data-avatar-animal="${id}"]`);await page.locator('dialog.avatar-picker').waitFor({state:'detached'});await page.reload({waitUntil:'networkidle'});await decode(page,'#avatar-open .avatar-preset-art',[id]);assert.deepEqual(await page.evaluate(key=>JSON.parse(localStorage.getItem(key)),avatarKey),{version:1,kind:'preset',animal:id});}
      passed(tag+'-all-six-choices-save-and-survive-refresh');
      for(const skin of skinIds){
        await page.evaluate(({key,skin})=>localStorage.setItem(key,skin),{key:skinKey,skin});await page.reload({waitUntil:'networkidle'});assert.equal(await page.locator('html').getAttribute('data-skin'),skin);
        await open(page);await decode(page,'.avatar-animal-grid .avatar-preset-art',ids);passed(tag+'-skin-'+skin,await fit(page,tag+'-skin-'+skin));await tap(page,'#avatar-close');
      }
      const image=await syntheticPhoto(page),photo={version:1,kind:'photo',animal:'panda',image};
      await page.evaluate(({key,photo})=>localStorage.setItem(key,JSON.stringify(photo)),{key:avatarKey,photo});await page.reload({waitUntil:'networkidle'});
      assert.equal(await page.locator('#avatar-open .animal-avatar-image').getAttribute('src'),image);
      await page.locator('#avatar-open .animal-avatar-image').evaluate(image=>image.decode());
      await open(page);await tap(page,'[data-avatar-mode="photo"]');
      await page.locator('#avatar-photo-file').setInputFiles({name:'synthetic-local-face.jpg',mimeType:'image/jpeg',buffer:Buffer.from(image.split(',')[1],'base64')});
      await page.waitForFunction(()=>document.querySelector('dialog.avatar-picker').dataset.avatarStep==='hood'&&!document.querySelector('#avatar-save-photo').disabled);
      assert.equal(await page.locator('.avatar-animal-grid svg').count(),6);assert.equal(await page.locator('.avatar-animal-grid .avatar-preset-art').count(),0);
      await fit(page,tag+'-selfie-hoods');await tap(page,'#avatar-back');await tap(page,'[data-avatar-mode="preset"]');await decode(page,'.avatar-animal-grid .avatar-preset-art',ids);
      await tap(page,'#avatar-close');await page.reload({waitUntil:'networkidle'});
      assert.deepEqual(await page.evaluate(key=>JSON.parse(localStorage.getItem(key)),avatarKey),photo);
      assert.equal(await page.locator('#avatar-open .animal-avatar-image').getAttribute('src'),image);
      passed(tag+'-existing-photo-preserved-and-hood-art-remains-accurate');
      assert.equal(await page.evaluate(key=>localStorage.getItem(key),learningKey),learningBefore);await clean(f);
      passed(tag+'-no-progress-changes-uploads-or-failed-online-requests');
    }finally{await f.context.close();}
  }
  const f=await start({width:320,height:568});
  try{
    const cached=await f.page.evaluate(async()=>{const names=await caches.keys(),result=[];for(const name of names){if(!name.startsWith('english-sprout-core-'))continue;const cache=await caches.open(name);for(const request of await cache.keys())if(request.url.includes('/avatars/'))result.push(new URL(request.url).pathname);}return result;});
    assert.deepEqual(cached.map(url=>url.split('/').pop().replace('.webp','')).sort(),[...ids].sort());
    assert.equal(await f.page.locator('dialog.avatar-picker').count(),0,'This fresh profile has never opened the chooser.');
    await clean(f);networkDown=true;await f.context.setOffline(true);
    await open(f.page);await decode(f.page,'.avatar-animal-grid .avatar-preset-art',ids);await fit(f.page,'320x568-first-chooser-offline');
    await tap(f.page,'[data-avatar-animal="frog"]');await f.page.locator('dialog.avatar-picker').waitFor({state:'detached'});await f.page.reload({waitUntil:'domcontentloaded'});
    await f.page.locator('#avatar-open').waitFor();await decode(f.page,'#avatar-open .avatar-preset-art',['frog']);await open(f.page);await decode(f.page,'.avatar-animal-grid .avatar-preset-art',ids);
    assert.deepEqual(await f.page.evaluate(key=>JSON.parse(localStorage.getItem(key)),avatarKey),{version:1,kind:'preset',animal:'frog'});assert.deepEqual(f.errors,[]);
    passed('first-ever-chooser-opens-all-six-offline-and-selection-survives-offline-refresh',{cached,actualServerNetworkDisconnected:true});
  }finally{networkDown=false;await f.context.close();}
  console.log(`PASS ${checks.length} approved avatar checks`);
})().catch(error=>{checks.push({name:'avatar artwork QA',status:'FAIL',error:error.stack});console.error(error);process.exitCode=1;}).finally(async()=>{
  fs.mkdirSync(output,{recursive:true});fs.writeFileSync(path.join(output,'results.json'),JSON.stringify({version,origin,checks},null,2));if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));
});
