// First-use and older-browser regressions in isolated Edge profiles, never a user's saved browser.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'C:/Users/Jam/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {pathToFileURL}=require('node:url');
const root=path.resolve(__dirname,'..'),dist=path.join(root,'dist'),output=path.join(root,'test-results',process.env.REPORT_NAME||'startup-browser');
const stateKey='english-sprout-state-v1',avatarKey='english-sprout-avatar-v1',skinKey='english-sprout-skin-v1';
const course=JSON.parse(fs.readFileSync(path.join(dist,'data/curriculum.json'),'utf8'));
const version=JSON.parse(fs.readFileSync(path.join(dist,'version.json'),'utf8'));
const audioCache=fs.readFileSync(path.join(dist,'src/media.js'),'utf8').match(/english-sprout-audio-v[\w.-]+/)[0];
const source=new Map(),checks=[],contexts=new Set();
const types={'.js':'application/javascript','.html':'text/html','.css':'text/css','.json':'application/json','.mp3':'audio/mpeg','.webp':'image/webp','.svg':'image/svg+xml','.png':'image/png','.webmanifest':'application/manifest+json'};
function snapshot(folder){for(const item of fs.readdirSync(folder,{withFileTypes:true})){const file=path.join(folder,item.name);if(item.isDirectory())snapshot(file);else source.set(path.relative(dist,file).split(path.sep).join('/'),fs.readFileSync(file));}}
snapshot(dist);
let mode={},requests=[],networkDown=false,releaseCourse=null,browser,origin;
const server=http.createServer(async(req,res)=>{
  const pathname=new URL(req.url,'http://localhost').pathname.slice(1)||'index.html';
  requests.push({path:pathname,method:req.method,time:Date.now()});
  if(networkDown){res.destroy();return;}
  let data=source.get(pathname);if(!data){res.writeHead(404);res.end();return;}
  if(pathname===mode.moduleFailure||mode.moduleFailure&&pathname.endsWith('/'+mode.moduleFailure)){res.writeHead(503);res.end('Module temporarily unavailable');return;}
  if(pathname==='data/curriculum.json'){
    const count=requests.filter(r=>r.path===pathname).length;
    if(mode.delayCourse)await new Promise(resolve=>{releaseCourse=resolve;});
    if(mode.courseFailure==='always'||mode.courseFailure==='once'&&count===1){res.writeHead(503);res.end('Try again');return;}
    if(mode.courseFailure==='malformed')data=Buffer.from('{broken course');
  }
  if(pathname==='index.html'&&mode.removeEmbedded)data=Buffer.from(data.toString().replace(/<script\b[^>]*id=["']curriculum-data["'][^>]*>[\s\S]*?<\/script>/i,''));
  // Deliberately throw in render, after successful course loading, to check error classification.
  if(pathname.endsWith('src/app.js')&&mode.renderError){
    const text=data.toString();assert.ok(text.includes('function render(){'),'render injection point');
    data=Buffer.from(text.replace('function render(){','function render(){throw new Error("QA render fault");'));
  }
  res.writeHead(200,{'Content-Type':types[path.extname(pathname)]||'application/octet-stream','Content-Length':data.length,'Cache-Control':'no-store'});res.end(data);
});
async function test(name,fn){
  try{const evidence=await fn();checks.push({name,status:'PASS',evidence:evidence||null});console.log('PASS',name);}
  catch(error){checks.push({name,status:'FAIL',error:error.stack});console.error('FAIL',name,error.message);}
  finally{releaseCourse?.();releaseCourse=null;networkDown=false;for(const context of contexts){await context.close();contexts.delete(context);}}
}
async function fixture(viewport,options={}){
  mode=options;requests=[];networkDown=false;releaseCourse=null;
  const context=await browser.newContext({viewport,isMobile:true,hasTouch:true,timezoneId:'Asia/Shanghai',reducedMotion:'reduce'});contexts.add(context);
  const page=await context.newPage(),errors=[],uploads=[],pageCourseRequests=[];page.setDefaultTimeout(12000);page.setDefaultNavigationTimeout(15000);
  await page.clock.setFixedTime(new Date('2026-10-12T10:00:00+08:00'));
  page.on('pageerror',error=>errors.push(error.message));context.on('request',request=>{if(!['GET','HEAD'].includes(request.method()))uploads.push(request.url());});
  // Page requests exclude the worker's separate background install fetches.
  page.on('request',request=>{if(new URL(request.url()).pathname.endsWith('/data/curriculum.json'))pageCourseRequests.push(request.url());});
  await context.addInitScript(({legacy,noSW,initialState,stateKey,avatarKey,skinKey})=>{
    window.qa={plays:[],unhandled:[]};window.addEventListener('unhandledrejection',e=>qa.unhandled.push(String(e.reason)));
    const Native=window.Audio;window.Audio=function(...args){const audio=new Native(...args);audio.addEventListener('playing',()=>qa.plays.push({src:audio.src,seconds:audio.duration,rate:audio.playbackRate}));return audio;};window.Audio.prototype=Native.prototype;
    if(legacy){delete Object.hasOwn;delete Array.prototype.at;delete window.structuredClone;}
    if(noSW&&navigator.serviceWorker)navigator.serviceWorker.register=()=>Promise.reject(new Error('QA offline registration unavailable'));
    if(initialState&&!localStorage.getItem(stateKey)){
      localStorage.setItem(stateKey,JSON.stringify(initialState));
      localStorage.setItem(avatarKey,JSON.stringify({version:1,kind:'preset',animal:'fox'}));localStorage.setItem(skinKey,'classic');
    }
  },{...options,stateKey,avatarKey,skinKey});
  await page.goto(origin,{waitUntil:options.delayCourse?'domcontentloaded':'networkidle'});
  return{context,page,errors,uploads,pageCourseRequests};
}
async function clean(f){assert.deepEqual(f.errors,[]);assert.deepEqual(f.uploads,[]);assert.deepEqual(await f.page.evaluate(()=>qa.unhandled),[]);}
async function home(page){await page.locator('#hero-start').waitFor();assert.equal(await page.locator('#retry').count(),0);}
async function geometry(page){
  const value=await page.evaluate(()=>({width:innerWidth,height:innerHeight,contentWidth:Math.max(document.body.scrollWidth,document.documentElement.scrollWidth),contentHeight:Math.max(document.body.scrollHeight,document.documentElement.scrollHeight)}));
  assert.ok(value.contentWidth<=value.width+1&&value.contentHeight<=value.height+1,JSON.stringify(value));return value;
}
async function saved(page){return page.evaluate(key=>JSON.parse(localStorage.getItem(key)),stateKey);}
async function played(page,before,suffix){
  await page.waitForFunction(({before,suffix})=>qa.plays.slice(before).some(p=>p.src.endsWith(suffix)&&p.seconds>.3),{before,suffix},{timeout:20000});
  return page.evaluate(({before,suffix})=>qa.plays.slice(before).find(p=>p.src.endsWith(suffix)&&p.seconds>.3),{before,suffix});
}
async function openLesson(page,id){
  await page.locator('[data-go="library"]:visible').click();await page.locator('#search-open').click();
  await page.locator('#phrase-search').fill(course.lessons.find(l=>l.id===id).english);
  const before=await page.evaluate(()=>qa.plays.length);await page.locator(`[data-preview="${id}"]`).click();
  return played(page,before,`/audio/${id}.mp3`);
}
async function waitSW(page){
  await page.evaluate(()=>Promise.race([navigator.serviceWorker.ready,new Promise((_,reject)=>setTimeout(()=>reject(new Error('Offline service did not become ready')),15000))]));await page.waitForFunction(()=>!!navigator.serviceWorker.controller);
}
async function storedAudio(page,file){
  await page.waitForFunction(async({cache,file})=>!!await(await caches.open(cache)).match(new URL(file,document.baseURI).href,{ignoreVary:true}),{cache:audioCache,file},{timeout:15000});
}
(async()=>{
  fs.mkdirSync(output,{recursive:true});
  const html=source.get('index.html').toString(),embedded=html.match(/<script\b[^>]*id=["']curriculum-data["'][^>]*>([\s\S]*?)<\/script>/i);
  assert.ok(embedded,'Build the embedded-course startup fix before running this suite.');assert.deepEqual(JSON.parse(embedded[1]),course);assert.equal(course.lessons.length,120);
  const learning=await import(pathToFileURL(path.join(root,'src/learning.js')).href);
  let existing=learning.recordResult(learning.createState('2026-10-11'),'hello-01','good','2026-10-11',{isNew:true});
  existing=learning.validateImport(existing,course.lessons);
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));origin=`http://127.0.0.1:${server.address().port}/`;
  browser=await chromium.launch({channel:'msedge',headless:true});
  for(const viewport of [{width:390,height:844},{width:768,height:1024}]){
    const tag=`${viewport.width}x${viewport.height}`;
    await test(tag+' older-browser capabilities: first lesson and planting',async()=>{
      const f=await fixture(viewport,{legacy:true}),{page}=f;await home(page);
      assert.deepEqual(f.pageCourseRequests,[],'Normal startup should use embedded data without another page request');
      assert.deepEqual(await page.evaluate(()=>[typeof Object.hasOwn,typeof Array.prototype.at,typeof window.structuredClone]),['undefined','undefined','undefined']);
      assert.equal(await page.locator('.focus-home').getAttribute('data-next-kind'),'learn');assert.deepEqual(await page.evaluate(()=>qa.plays),[]);
      const homeGeometry=await geometry(page),before=await page.evaluate(()=>qa.plays.length);await page.locator('#hero-start').click();const audio=await played(page,before,'/audio/hello-01.mp3');
      await page.locator('button[data-step="choose"]').click();await page.locator(`[data-choice="${course.lessons[0].answerIndex}"]`).click();await page.locator('#quiz-next').click();await page.locator('[data-rating="good"]').click();
      assert.equal(await page.locator('.completion').getAttribute('data-next-kind'),'learn');await page.locator('.completion [data-go="garden"]').click();await page.locator('[data-world-tool="plant"]').click();await page.locator('[data-garden-world]').click({position:{x:100,y:100}});
      const state=await saved(page);assert.equal(Object.keys(state.cards).length,1);assert.equal(state.cards['hello-01'].lastReviewed,'2026-10-12');assert.equal(state.garden.actions.length,1);assert.equal(state.garden.actions[0].type,'world-plant');
      const gardenGeometry=await geometry(page);await page.screenshot({path:path.join(output,tag+'-legacy-planted.png')});await clean(f);return{homeGeometry,gardenGeometry,audio};
    });
    await test(tag+' older-browser capabilities: existing progress and identity preserved',async()=>{
      const f=await fixture(viewport,{legacy:true,initialState:existing}),{page}=f;await home(page);
      assert.equal(await page.locator('.focus-home').getAttribute('data-next-kind'),'review');assert.deepEqual(await saved(page),existing);
      assert.equal(await page.locator('html').getAttribute('data-skin'),'classic');assert.match(await page.locator('#avatar-open img').getAttribute('src'),/fox\.webp$/);
      await page.reload({waitUntil:'networkidle'});await home(page);assert.deepEqual(await saved(page),existing);await clean(f);
      return{reviewFirst:true,progressPreserved:true,avatar:'fox',skin:'classic'};
    });
    await test(tag+' first use: unavailable course JSON does not block embedded course',async()=>{
      const failure=viewport.width===390?'always':'malformed';const f=await fixture(viewport,{courseFailure:failure}),{page}=f;await home(page);
      assert.equal(await page.locator('.focus-home').getAttribute('data-next-kind'),'learn');const result=await geometry(page);
      const audio=await openLesson(page,'outside-07');await clean(f);return{courseFailure:failure,geometry:result,audio};
    });
    await test(tag+' first use: unavailable offline service still permits uncached on-demand audio',async()=>{
      const f=await fixture(viewport,{noSW:true}),{page}=f;await home(page);
      assert.equal(requests.filter(r=>r.path==='audio/outside-07.mp3').length,0);
      const before=Date.now(),audio=await openLesson(page,'outside-07');assert.ok(requests.some(r=>r.path==='audio/outside-07.mp3'&&r.time>=before));
      const mp3s=[...new Set(requests.filter(r=>r.path.endsWith('.mp3')).map(r=>r.path))];
      // Navigating through library pages may warm their visible cards and voices.
      // The requirement is that playback does not depend on downloading all 360 clips.
      assert.ok(mp3s.length>0&&mp3s.length<course.lessons.length*3,`Should not require a full audio download: ${mp3s.length}`);
      assert.equal(await page.evaluate(()=>!!navigator.serviceWorker.controller),false);assert.equal(await page.evaluate(async()=>(await navigator.serviceWorker.getRegistrations()).length),0);
      await clean(f);return{audio,downloadedFiles:mp3s};
    });
    await test(tag+' background core and played clip survive offline reload',async()=>{
      const f=await fixture(viewport),{page,context}=f;await home(page);await waitSW(page);const onlineAudio=await openLesson(page,'outside-07');
      await storedAudio(page,'./audio/outside-07.mp3');await page.locator('#exit-session').click();
      const cached=await page.evaluate(async cache=>(await(await caches.open(cache)).keys()).length,audioCache);assert.ok(cached>0&&cached<360);
      networkDown=true;await context.setOffline(true);await page.reload({waitUntil:'domcontentloaded'});await page.locator('#avatar-open').waitFor();
      const offlineAudio=await openLesson(page,'outside-07');await page.screenshot({path:path.join(output,tag+'-offline-on-demand.png')});await clean(f);return{onlineAudio,offlineAudio,cachedClips:cached,allAudioDownloadRequired:false};
    });
  }
  await test('Without embedded data, one failed course request retries automatically',async()=>{
    const f=await fixture({width:390,height:844},{removeEmbedded:true,courseFailure:'once',noSW:true}),{page}=f;await home(page);
    const count=requests.filter(r=>r.path==='data/curriculum.json').length;assert.ok(count>=2&&count<=4);assert.equal(await page.locator('.focus-home').getAttribute('data-next-kind'),'learn');await clean(f);return{courseRequests:count};
  });
  await test('Missing entry or dependency module exposes an HTML retry instead of waiting forever',async()=>{
    const outcomes=[];
    for(const moduleFailure of ['src/app.js','src/learning.js']){
      const f=await fixture({width:768,height:1024},{moduleFailure,noSW:true}),{page,context}=f;
      await page.locator('#retry').waitFor({state:'visible',timeout:15000});
      assert.equal(await page.locator('#app').getAttribute('data-startup'),'modules-error');
      const text=await page.locator('#app').innerText();assert.doesNotMatch(text,/需要先联网一次|尚未下载离线|先下载离线/);assert.match(text,/再试/);
      assert.equal(await page.locator('#hero-start').count(),0);assert.ok(requests.some(r=>r.path===moduleFailure||r.path.endsWith('/'+moduleFailure)));
      await page.screenshot({path:path.join(output,moduleFailure==='src/app.js'?'missing-app-module.png':'missing-dependent-module.png')});
      mode.moduleFailure=null;await page.locator('#retry').click();await home(page);
      outcomes.push({moduleFailure,text,retryRecovered:true});await clean(f);await context.close();contexts.delete(context);
    }
    return outcomes;
  });
  await test('After terminal course failure, reconnecting resumes without overwriting saved progress',async()=>{
    const f=await fixture({width:390,height:844},{removeEmbedded:true,courseFailure:'always',noSW:true,initialState:existing}),{page}=f;
    await page.locator('#retry').waitFor({state:'visible'});assert.equal(await page.locator('#app').getAttribute('data-startup'),'error');
    const failedRequests=requests.filter(r=>r.path==='data/curriculum.json').length;assert.equal(failedRequests,3);
    assert.deepEqual(await saved(page),existing);assert.equal(await page.locator('#hero-start').count(),0);
    mode.courseFailure=null;await page.evaluate(()=>window.dispatchEvent(new Event('online')));await home(page);
    assert.equal(await page.locator('.focus-home').getAttribute('data-next-kind'),'review');assert.equal(await page.locator('#app').getAttribute('data-startup'),'ready');assert.deepEqual(await saved(page),existing);
    assert.equal(await page.locator('html').getAttribute('data-skin'),'classic');assert.match(await page.locator('#avatar-open img').getAttribute('src'),/fox\.webp$/);
    await clean(f);return{failedRequests,totalCourseRequests:requests.filter(r=>r.path==='data/curriculum.json').length,progressPreserved:true,automaticResume:true};
  });
  await test('Events before course initialization are safe and current route is respected',async()=>{
    const f=await fixture({width:768,height:1024},{removeEmbedded:true,delayCourse:true,noSW:true}),{page}=f;
    for(let i=0;i<40&&!releaseCourse;i++)await page.waitForTimeout(50);assert.ok(releaseCourse,'Fallback course fetch started');
    await page.evaluate(({stateKey,avatarKey,skinKey})=>{
      for(const name of ['online','offline'])window.dispatchEvent(new Event(name));document.dispatchEvent(new Event('visibilitychange'));
      location.hash='library';window.dispatchEvent(new HashChangeEvent('hashchange'));
      for(const key of [stateKey,avatarKey,skinKey,'english-sprout-voice-v1','english-sprout-course-rate-v1'])window.dispatchEvent(new StorageEvent('storage',{key}));
    },{stateKey,avatarKey,skinKey});
    releaseCourse();releaseCourse=null;await page.locator('#avatar-open').waitFor();await page.locator('#search-open').waitFor();await clean(f);return{route:'library',safeEvents:['online','offline','visibilitychange','hashchange','storage']};
  });
  await test('Render failure is distinguished from offline download advice',async()=>{
    const f=await fixture({width:390,height:844},{renderError:true,noSW:true}),{page}=f;
    await page.locator('#retry').waitFor();const text=await page.locator('#app').innerText();assert.doesNotMatch(text,/请检查网络|需要先联网一次|尚未下载离线/);assert.match(text,/打开|重试|重新/);
    assert.equal(await page.evaluate(()=>navigator.onLine),true);await page.screenshot({path:path.join(output,'render-error-classified.png')});return{text,online:true};
  });
  const report={version,url:origin,compatibilityTarget:'iPadOS 15.1 Safari',engine:'Headless Microsoft Edge; missing API simulation is not an iPad device test',checks,passed:checks.filter(c=>c.status==='PASS').length,failed:checks.filter(c=>c.status==='FAIL').length};
  fs.writeFileSync(path.join(output,'results.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({passed:report.passed,failed:report.failed,report:output}));if(report.failed)process.exitCode=1;
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(async()=>{for(const c of contexts)await c.close();await browser?.close();await new Promise(resolve=>server.close(resolve));});
