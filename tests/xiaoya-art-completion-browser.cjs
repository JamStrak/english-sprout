/* Native Edge acceptance for the completed Xiaoya art pack.
 * Run only after the candidate dist is built. This script never builds, changes
 * product assets, uses a real browser profile, or opens a microphone.
 * By default serve dist on an isolated loopback port. TEST_URL may name a
 * candidate loopback server. All saves below are synthetic and context-local.
 * Screenshots and actual browser request sizes/timings are kept in test-results.
 * Network throttling is a browser simulation, not a physical-phone benchmark.
 */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const fsp=require('node:fs/promises');
const path=require('node:path');
const http=require('node:http');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'C:/Users/Jam/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');

const root=path.resolve(__dirname,'..'),dist=path.join(root,'dist');
const out=path.resolve(process.env.XIAOYA_ART_TEST_OUT||path.join(root,'test-results/xiaoya-art-completion'));
const filter=process.env.XIAOYA_TEST_FILTER?new RegExp(process.env.XIAOYA_TEST_FILTER):null;
const STATE='xiaoya-english:state:v1';
const THROTTLE={name:'simulated-1.5-Mbps-120-ms',offline:false,latency:120,downloadThroughput:192*1024,uploadThroughput:96*1024,connectionType:'cellular3g'};
const report={startedAt:new Date().toISOString(),checks:[],inventory:null,scope:{nativeImageDecode:true,nativeAudio:true,isolatedProfiles:true,physicalMobileDevice:false,microphoneUsed:false,recognitionTested:false,childComprehensionTested:false,syntheticParentEvidence:true,regularPlaybackRate:4,measuredPlaybackRate:1,filtered:filter?.source||null},notes:['Screenshots require a human visual-quality review; decode/layout checks do not establish semantic clarity for a child.','Native service-worker cold boot is checked separately. Throttled measurements block service workers so CDP applies to every measured fetch; they do not measure full offline audio-pack installation.']};
let browser,server,origin,metadata;
const save=()=>fs.writeFileSync(path.join(out,filter?'results-filtered.json':'results.json'),JSON.stringify(report,null,2));
const storyPath=url=>/\/xiaoya\/stories\/[^?]+\.(?:webp|png|jpe?g)(?:\?|$)/i.test(url);
const imagePath=url=>/\.(?:webp|png|jpe?g|svg)(?:\?|$)/i.test(url);
const fileName=url=>new URL(url).pathname.split('/').pop();
const safeName=name=>name.replace(/[^a-z0-9_-]+/gi,'-');
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.webmanifest':'application/manifest+json','.svg':'image/svg+xml','.webp':'image/webp','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.mp3':'audio/mpeg','.wasm':'application/wasm','.zip':'application/zip'};

async function serve(){
  assert(fs.existsSync(path.join(dist,'xiaoya/index.html')),'Candidate dist is missing. Build it before running this test.');
  server=http.createServer(async(req,res)=>{
    try{
      if(!['GET','HEAD'].includes(req.method)){res.writeHead(405);res.end();return;}
      let pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
      if(pathname.endsWith('/'))pathname+='index.html';
      const file=path.resolve(dist,'.'+pathname),relative=path.relative(dist,file);
      if(relative.startsWith('..')||path.isAbsolute(relative)){res.writeHead(403);res.end();return;}
      const stat=await fsp.stat(file);if(!stat.isFile())throw Error('Not a file');
      const headers={'Content-Type':mime[path.extname(file)]||'application/octet-stream','Cache-Control':'no-cache','Accept-Ranges':'bytes'};
      let start=0,end=stat.size-1,status=200;
      if(req.headers.range){
        const range=/^bytes=(\d*)-(\d*)$/.exec(req.headers.range);
        if(!range){res.writeHead(416,{'Content-Range':`bytes */${stat.size}`});res.end();return;}
        if(range[1]){start=Number(range[1]);if(range[2])end=Math.min(end,Number(range[2]));}
        else if(range[2])start=Math.max(0,stat.size-Number(range[2]));
        if(start>end||start>=stat.size){res.writeHead(416,{'Content-Range':`bytes */${stat.size}`});res.end();return;}
        status=206;headers['Content-Range']=`bytes ${start}-${end}/${stat.size}`;
      }
      headers['Content-Length']=end-start+1;res.writeHead(status,headers);
      if(req.method==='HEAD')res.end();else fs.createReadStream(file,{start,end}).on('error',()=>res.destroy()).pipe(res);
    }catch{if(!res.headersSent)res.writeHead(404,{'Content-Type':'text/plain'});res.end('Missing candidate asset');}
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  return `http://127.0.0.1:${server.address().port}`;
}

async function fixture({story='family-love',garden='b',width=390,height=844,worker=false,throttle=false,rate=4,fault=null}={}){
  const c=await browser.newContext({viewport:{width,height},timezoneId:'Asia/Shanghai',serviceWorkers:worker?'allow':'block',isMobile:width<1000,hasTouch:width<1000,reducedMotion:'reduce'});
  const requests=[],responses=[],errors=[],pending=new Set();let release;
  const gate=fault?.kind==='slow'?new Promise(resolve=>release=resolve):Promise.resolve();
  c.on('request',r=>requests.push({url:r.url(),method:r.method(),at:Date.now(),worker:!!r.serviceWorker()}));
  c.on('response',r=>{
    const task=(async()=>{
      const item={url:r.url(),status:r.status(),at:Date.now(),worker:r.fromServiceWorker()};
      responses.push(item);
      try{item.headers=await r.allHeaders();await r.finished();item.sizes=await r.request().sizes();item.timing=r.request().timing();}catch(error){item.measurementError=error.message;}
    })();pending.add(task);task.finally(()=>pending.delete(task));
  });
  // The separate worker case is intentionally unrouted so native SW fetch and
  // cache semantics remain intact. All app URLs must nevertheless stay local.
  if(!worker)await c.route('**/*',async route=>{
    const url=new URL(route.request().url());
    if(url.origin!==origin)return route.abort('blockedbyclient');
    if(fault&&url.pathname.endsWith(`/stories/${fault.file}`)){
      if(fault.kind==='slow')await gate;
      if(fault.kind==='missing')return route.fulfill({status:404,contentType:'text/plain',body:'Deliberately missing art fixture'});
    }
    return route.continue();
  });
  await c.addInitScript(({origin,rate})=>{
    if(location.origin!==origin)return;
    const q=window.qaArt={errors:[],audio:[],pictures:[],microphoneCalls:0};
    window.addEventListener('error',e=>{if(e.message)q.errors.push(e.message);});
    window.addEventListener('unhandledrejection',e=>q.errors.push(String(e.reason)));
    const NativeAudio=Audio;
    window.Audio=function(...args){
      const a=new NativeAudio(...args),item={url:String(args[0]||''),createdAt:performance.now(),ended:false,error:false};q.audio.push(item);a.playbackRate=rate;
      a.addEventListener('playing',()=>item.playedAt=performance.now());a.addEventListener('ended',()=>{item.ended=true;item.endedAt=performance.now();});a.addEventListener('error',()=>item.error=true);return a;
    };window.Audio.prototype=NativeAudio.prototype;
    if(navigator.mediaDevices)navigator.mediaDevices.getUserMedia=()=>{q.microphoneCalls++;return Promise.reject(new DOMException('Microphone prohibited in art acceptance','NotAllowedError'));};
    new MutationObserver(()=>{
      const main=document.querySelector('main[data-event]'),picture=main?.querySelector('.story-stage .story-picture');
      if(!picture)return;
      const value={event:main.dataset.event,phase:main.dataset.phase,context:main.dataset.context,frame:picture.dataset.storyFrame??null,mappedUrl:picture.dataset.pictureUrl??null,status:picture.dataset.pictureStatus??null,background:getComputedStyle(picture).backgroundImage,vector:picture.classList.contains('vector-picture'),at:performance.now()};
      const last=q.pictures.at(-1);if(!last||['event','phase','context','frame','mappedUrl','status','background','vector'].some(key=>last[key]!==value[key]))q.pictures.push(value);
    }).observe(document,{subtree:true,childList:true,attributes:true,attributeFilter:['style','class','data-picture-status','data-picture-url']});
  },{origin,rate});
  const p=await c.newPage();p.setDefaultTimeout(20000);p.on('pageerror',e=>errors.push(e.message));
  if(throttle){const cdp=await c.newCDPSession(p);await cdp.send('Network.enable');await cdp.send('Network.setCacheDisabled',{cacheDisabled:true});const {name,...conditions}=THROTTLE;await cdp.send('Network.emulateNetworkConditions',conditions);}
  try{
    const started=Date.now();await p.goto(`${origin}/xiaoya/?story=${encodeURIComponent(story)}&garden=${garden}`,{waitUntil:'domcontentloaded',timeout:45000});
    await p.locator('main.home-view').waitFor({timeout:45000});
    const version=await p.locator('meta[name="xiaoya-version"]').getAttribute('content'),build=await p.locator('meta[name="xiaoya-build"]').getAttribute('content');
    if(report.build)assert.equal(build,report.build,'Candidate build changed during acceptance');else{report.version=version;report.build=build;}
    return{c,p,requests,responses,errors,pending,release,story,garden,width,height,fault,worker,rate,homeReadyMs:Date.now()-started};
  }catch(error){release?.();await c.close();throw error;}
}

async function metadataFrom(p){return p.evaluate(async()=>{
  const base=document.querySelector('script[type="module"][src]').src;
  const [{STORIES},{PAPER_ASSETS},{canonicalEventId}]=await Promise.all([import(new URL('stories.js',base)),import(new URL('paper-art.js',base)),import(new URL('curriculum.js',base))]);
  const asset=file=>file?new URL(`xiaoya/stories/${file}`,document.baseURI).href:null;
  return{stories:STORIES.map(s=>({id:s.id,canonical:canonicalEventId(s.id),image:s.image||null,imageUrl:asset(s.image),layout:s.imageLayout||null,intro:s.introImage||null,introUrl:asset(s.introImage),introFrame:s.introFrame??null,cueFrame:s.cueFrame,teachingFrames:s.teachingFrames,lessonId:s.event.lessonId,contexts:s.event.contexts.map(c=>({id:c.id,settingId:c.settingId})),alternate:s.alternateImages||null,alternateUrls:s.alternateImages?Object.fromEntries(Object.entries(s.alternateImages).map(([key,file])=>[key,asset(file)])):null})),paper:Object.entries(PAPER_ASSETS).map(([key,file])=>({key,file,url:new URL(file,document.baseURI).href})),base:document.baseURI};
});}
async function nativeDecode(p,url){return p.evaluate(url=>new Promise(resolve=>{
  const image=new Image(),started=performance.now();let done=false;
  const finish=value=>{if(done)return;done=true;clearTimeout(timer);resolve({url,decodeMs:performance.now()-started,...value});};
  const timer=setTimeout(()=>finish({ok:false,error:'Native image decode timed out after 15 seconds'}),15000);
  image.src=url;image.decode().then(()=>finish({ok:true,width:image.naturalWidth,height:image.naturalHeight,complete:image.complete,currentSrc:image.currentSrc}),error=>finish({ok:false,error:error.message}));
}),url);}
async function press(p,selector){
  const target=p.locator(selector).first();await target.waitFor({state:'visible'});assert(await target.isEnabled(),`Disabled action ${selector}`);await target.scrollIntoViewIfNeeded();
  const point=await target.evaluate(e=>{const r=e.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2;return{x,y,hit:e.contains(document.elementFromPoint(x,y))};});
  assert(point.hit,`Another element intercepts ${selector}`);
  if(p.viewportSize().width<1000)await p.touchscreen.tap(point.x,point.y);else await p.mouse.click(point.x,point.y);
}
const action=(p,name)=>press(p,`[data-action="${name}"]`);
async function unlock(p){if(await p.locator('#parent-answer').count()){const [a,b]=(await p.locator('label[for="parent-answer"]').textContent()).match(/\d+/g).map(Number);await p.locator('#parent-answer').fill(String(a+b));await action(p,'gate-submit');}}
async function layout(p){
  const viewport=p.viewportSize();
  const result=await p.evaluate(()=>({width:innerWidth,height:innerHeight,scrollWidth:document.documentElement.scrollWidth,scrollHeight:document.documentElement.scrollHeight,text:document.querySelector('main')?.innerText||'',buttons:[...document.querySelectorAll('button')].filter(e=>e.checkVisibility()&&!e.closest('[role="dialog"]')).map(e=>{const r=e.getBoundingClientRect();return{action:e.dataset.action||e.dataset.checkup||e.dataset.story,label:e.getAttribute('aria-label'),x:r.x,y:r.y,width:r.width,height:r.height,disabled:e.disabled};})}));
  // Mobile layout overflow can expand innerWidth itself, hiding the fault if
  // that expanded width becomes the test's boundary. Use the requested screen.
  assert(result.scrollWidth<=viewport.width+1,`Horizontal viewport overflow: ${result.scrollWidth} > ${viewport.width}`);assert(result.scrollHeight<=viewport.height+1,`Child screen requires scrolling: ${result.scrollHeight} > ${viewport.height}`);assert(!/[A-Za-z]/.test(result.text),'English lettering is visible in the child flow');
  for(const b of result.buttons){assert(b.width>=43&&b.height>=43,`Touch target below 44 px: ${JSON.stringify(b)}`);assert(b.x>=-1&&b.y>=-1&&b.x+b.width<=viewport.width+1&&b.y+b.height<=viewport.height+1,`Clipped action: ${JSON.stringify(b)}`);}
  return{...result,viewport};
}
async function picture(p,url){
  const selector='.story-stage .story-picture';
  await p.waitForFunction(({selector,url})=>[...document.querySelectorAll(selector)].some(e=>getComputedStyle(e).backgroundImage.includes(url)),{selector,url},{timeout:20000});
  const value=await p.locator(selector).first().evaluate(e=>{const s=getComputedStyle(e),r=e.getBoundingClientRect();return{url:s.backgroundImage,size:s.backgroundSize,position:s.backgroundPosition,vector:e.classList.contains('vector-picture'),single:e.classList.contains('single-picture'),x:r.x,y:r.y,width:r.width,height:r.height};});
  assert(!value.vector,'Available image stayed as a vector fallback');assert(value.single,'Completed art must use one whole-picture layout');assert.equal(value.size,'contain','Story artwork must not be cropped');assert.equal(value.position,'50% 50%');
  assert(value.x>=-1&&value.y>=-1&&value.x+value.width<=p.viewportSize().width+1&&value.y+value.height<=p.viewportSize().height+1,'Story picture leaves viewport');
  return value;
}
async function englishEnded(p,lesson,count=1){await p.waitForFunction(({lesson,count})=>qaArt.audio.filter(a=>a.url.endsWith(`/${lesson}.mp3`)&&a.ended&&!a.error).length>=count,{lesson,count},{timeout:35000});}
async function teaching(f,s){
  const tappedAt=await f.p.evaluate(()=>performance.now());await action(f.p,'next-event');await f.p.locator(`main[data-event="${s.id}"][data-phase="story"]`).waitFor();
  await f.p.locator('[data-action="story-continue"]:enabled').waitFor({timeout:45000});await englishEnded(f.p,s.lessonId);
  const shown=await picture(f.p,s.imageUrl),trace=await f.p.evaluate(()=>qaArt);
  if(s.introUrl){
    const intro=trace.pictures.filter(p=>p.event===s.id&&p.phase==='story'&&p.frame===String(s.introFrame));
    assert(intro.some(p=>p.mappedUrl===s.introUrl),'Teaching skipped the mapped introductory beat');
    // A slow image must not extend the introduction or block English. Its
    // correct vector scene can establish meaning until native loading ends.
    assert(intro.every(p=>p.vector||p.background.includes(s.introUrl)),'An unrelated picture replaced the introductory beat');
  }
  const a=trace.audio.find(a=>a.url.endsWith(`/${s.lessonId}.mp3`)&&a.ended);
  const ready=await f.p.evaluate(()=>performance.now());
  return{tappedAt,englishPlayingMs:a.playedAt-tappedAt,englishEndedMs:a.endedAt-tappedAt,readyMs:ready-tappedAt,picture:shown,trace:trace.pictures};
}
async function screenshot(f,name){const file=path.join(out,`${safeName(name)}.png`);await f.p.screenshot({path:file,fullPage:false});return file;}
async function paperReady(p,scope){
  await p.waitForFunction(scope=>{const es=[...document.querySelectorAll(`${scope} [data-paper-art]`)];return es.length&&es.every(e=>e.dataset.paperState==='ready');},scope);
  const values=await p.locator(`${scope} [data-paper-art]`).evaluateAll(es=>es.map(e=>{const image=e.querySelector('image'),fallback=e.querySelector('[data-paper-fallback]');return{key:e.dataset.paperArt,state:e.dataset.paperState,href:image.getAttribute('href'),opacity:Number(getComputedStyle(image).opacity),fallback:getComputedStyle(fallback).visibility,pointerEvents:getComputedStyle(e).pointerEvents};}));
  assert(values.every(v=>v.opacity===1&&v.fallback==='hidden'&&v.pointerEvents==='none'),'Paper artwork should replace its fallback without intercepting input');
  return values;
}
async function reloadHome(p){await p.reload({waitUntil:'domcontentloaded'});await p.locator('main.home-view').waitFor();}
async function network(f){
  await Promise.race([Promise.allSettled([...f.pending]),new Promise(resolve=>setTimeout(resolve,1200))]);
  const resources=await f.p.evaluate(()=>performance.getEntriesByType('resource').map(r=>({url:r.name,type:r.initiatorType,startTime:r.startTime,duration:r.duration,transferSize:r.transferSize,encodedBodySize:r.encodedBodySize,decodedBodySize:r.decodedBodySize,responseEnd:r.responseEnd})));
  const finished=f.responses.filter(r=>r.sizes),totals={requests:f.requests.length,finished:finished.length,unfinished:f.pending.size,wireBytes:0,bodyBytes:0,storyImageBytes:0,allImageBytes:0,audioBytes:0};
  for(const r of finished){const n=r.sizes.responseBodySize;totals.wireBytes+=n+r.sizes.responseHeadersSize;totals.bodyBytes+=n;if(storyPath(r.url))totals.storyImageBytes+=n;if(imagePath(r.url))totals.allImageBytes+=n;if(/\.mp3(?:\?|$)/.test(r.url))totals.audioBytes+=n;}
  return{totals,requests:f.requests,responses:f.responses,resources};
}
async function diagnostic(f){return{main:await f.p.locator('main').evaluate(e=>e.outerHTML).catch(()=>null),qa:await f.p.evaluate(()=>window.qaArt).catch(()=>null)};}
async function test(name,fn,options){
  if(filter&&!filter.test(name))return;
  let f;
  try{
    f=await fixture(options);const evidence=await fn(f);
    assert.deepEqual(f.errors,[],'Uncaught page errors');const qa=await f.p.evaluate(()=>qaArt);assert.deepEqual(qa.errors,[],'Unhandled page errors');assert.equal(qa.microphoneCalls,0,'Art acceptance must never open a microphone');
    assert(f.requests.every(r=>new URL(r.url).origin===origin&&r.method==='GET'),'Unexpected external or mutating request');
    assert(!f.requests.some(r=>/\/(?:xiaoya\/speech\/|speech\/(?:vosk-|model-))/.test(r.url)),'Art flow fetched a recognition model');
    const badImages=f.responses.filter(r=>imagePath(r.url)&&r.status>=400&&!(f.fault?.kind==='missing'&&fileName(r.url)===f.fault.file));assert.deepEqual(badImages,[],'Unexpected missing image response');
    report.checks.push({name,status:'PASS',evidence,network:await network(f)});console.log('PASS',name);
  }catch(error){
    report.checks.push({name,status:'FAIL',error:error.stack,diagnostic:f?await diagnostic(f):null,network:f?await network(f):null});process.exitCode=1;console.error('FAIL',name,error.message);
    if(f)await screenshot(f,`${name}-FAIL`).catch(()=>{});
  }finally{if(f){f.release?.();await f.c.close();}save();}
}

async function seedIndependent(p,id){
  return p.evaluate(async({id,key})=>{
    const base=document.querySelector('script[type="module"][src]').src,{createState,recordEvidence,localDay}=await import(new URL('learning.js',base)),{storyFor}=await import(new URL('stories.js',base)),s=storyFor(id);
    const state=recordEvidence(createState(),{attemptId:`qa-art-independent-${id}`,eventId:id,contextId:s.event.contexts[0].id,kind:'speech',result:'independent',source:'parent',helped:false,date:localDay()});
    localStorage.setItem(key,JSON.stringify(state));return state.evidence[0];
  },{id,key:STATE});
}
async function alternateCheckup(f,s,{capture=false}={}){
  const evidence=await seedIndependent(f.p,s.id);await f.p.reload({waitUntil:'domcontentloaded'});await f.p.locator('main.home-view').waitFor();
  await action(f.p,'parent');await unlock(f.p);await f.p.locator('.parent-view').waitFor();
  // Open library disclosure controls; no child learning data is altered here.
  await f.p.locator('.story-library > details > summary').click();
  const button=f.p.locator(`[data-checkup="${s.id}"]`);let legacyEntry=false;
  if(!await button.count()){
    assert.notEqual(s.canonical,s.id,'A canonical course is absent from the parent library');legacyEntry=true;
    // Two historical duplicate scenes are intentionally absent from the visible
    // 53-phrase library. Exercise their existing delegated handler separately.
    await f.p.evaluate(id=>{const b=document.createElement('button');b.dataset.checkup=id;b.textContent='旧场景验收夹具';document.querySelector('.parent-view').append(b);},s.id);
  }else if(!await button.isVisible())await f.p.locator('details.extension-phrases > summary').click();
  await press(f.p,`[data-checkup="${s.id}"]`);await f.p.locator(`main[data-event="${s.id}"][data-phase="request"]`).waitFor();
  assert.equal(await f.p.locator('main').getAttribute('data-context'),s.contexts[1].id,'Parent evidence did not select the alternate setting');
  const request=await picture(f.p,s.alternateUrls.request);await layout(f.p);
  const requestScreenshot=capture?await screenshot(f,`alternate-request-${f.width}-${s.id}`):null;
  await action(f.p,'observe');await unlock(f.p);await f.p.locator('#observed-help').waitFor();await press(f.p,'[data-observation="independent"]');await f.p.locator('main[data-phase="resolved"]').waitFor();
  const resolved=await picture(f.p,s.alternateUrls.resolved);await layout(f.p);
  return{syntheticEvidence:evidence,legacyEntryFixture:legacyEntry,request,resolved,requestScreenshot};
}

(async()=>{
  fs.mkdirSync(out,{recursive:true});
  try{
    origin=process.env.TEST_URL?new URL(process.env.TEST_URL).origin:await serve();
    assert(['127.0.0.1','localhost','[::1]'].includes(new URL(origin).hostname),'Only loopback candidate servers are permitted');report.origin=origin;
    browser=await chromium.launch({channel:'msedge',headless:true,args:['--autoplay-policy=no-user-gesture-required']});
    const bootstrap=await fixture();try{metadata=await metadataFrom(bootstrap.p);}finally{await bootstrap.c.close();}
    report.inventory=metadata;save();
    await test('inventory-native-decode-all',async f=>{
      const problems=[];if(metadata.stories.length!==55)problems.push(`Expected 55 stories, received ${metadata.stories.length}`);
      for(const s of metadata.stories){if(!s.image||s.layout!=='single')problems.push(`${s.id}: missing single main picture`);if(!s.alternate?.request||!s.alternate?.resolved)problems.push(`${s.id}: incomplete alternate request/resolved mapping`);}
      if(!metadata.stories.find(s=>s.id==='play-again')?.introUrl)problems.push('play-again: missing introductory picture');
      const references=metadata.stories.flatMap(s=>[{owner:s.id,kind:'main',url:s.imageUrl},...(s.introUrl?[{owner:s.id,kind:'intro',url:s.introUrl}]:[]),...Object.entries(s.alternateUrls||{}).map(([phase,url])=>({owner:s.id,kind:`alternate-${phase}`,url}))]);
      const urls=[...new Set([...references.map(r=>r.url),...metadata.paper.map(p=>p.url),new URL('xiaoya/stories/garden-paper-v1.webp',metadata.base).href].filter(Boolean))],decoded=[];
      for(let i=0;i<urls.length;i+=4)decoded.push(...await Promise.all(urls.slice(i,i+4).map(url=>nativeDecode(f.p,url))));
      for(const image of decoded){if(!image.ok)problems.push(`${fileName(image.url)}: ${image.error}`);else if(references.some(r=>r.url===image.url)){if(image.width<900||image.height<600||Math.abs(image.width/image.height-1.4)>.035)problems.push(`${fileName(image.url)}: unexpected story dimensions ${image.width}x${image.height}`);}}
      report.inventory={...metadata,references,decoded,problems};save();assert.deepEqual(problems,[],'Completed art inventory is incomplete or not decodable');
      return{stories:metadata.stories.length,references:references.length,uniqueNativeDecodedImages:decoded.length,paperAssets:metadata.paper.length};
    });

    for(const [width,height] of [[390,844],[768,1024],[1366,900]])await test(`cold-and-layout-${width}`,async f=>{
      const home=await layout(f.p),homeScreenshot=await screenshot(f,`home-${width}`);
      assert(!f.requests.some(r=>storyPath(r.url)),'Cold home downloaded story pictures before a child chose a lesson');
      const s=metadata.stories.find(s=>s.id===f.story),flow=await teaching(f,s),mainLayout=await layout(f.p),storyScreenshot=await screenshot(f,`story-${width}`);
      const expected=new Set([s.image,s.intro].filter(Boolean)),requested=[...new Set(f.requests.filter(r=>storyPath(r.url)).map(r=>fileName(r.url)))];
      assert(requested.every(file=>expected.has(file)),`Cold lesson downloaded unrelated images: ${requested}`);
      const alternate=await alternateCheckup(f,s,{capture:true}),alternateScreenshot=await screenshot(f,`alternate-resolved-${width}`);
      return{homeReadyMs:f.homeReadyMs,home,mainLayout,homeScreenshot,storyScreenshot,alternateScreenshot,flow,alternate,initialStoryFiles:requested};
    },{width,height,story:width===768?'play-again':width===1366?'food-water':'family-love'});

    await test('cold-native-service-worker-demand-loading',async f=>{
      const homeImages=f.requests.filter(r=>storyPath(r.url));assert.deepEqual(homeImages,[],'Service-worker install eagerly requested story pictures');
      const s=metadata.stories.find(s=>s.id===f.story),flow=await teaching(f,s);
      await f.p.waitForTimeout(1000);
      const files=[...new Set(f.requests.filter(r=>storyPath(r.url)).map(r=>fileName(r.url)))];assert(files.every(file=>[s.image,s.intro].includes(file)),'Service worker eagerly fetched unrelated story pictures');
      return{homeReadyMs:f.homeReadyMs,flow,files,nativeServiceWorker:true,audioPackMayStillBeInstalling:true};
    },{worker:true,story:'hello-everyone',rate:1});

    for(const id of ['family-love','play-again'])await test(`throttled-cold-${id}`,async f=>{
      assert(!f.requests.some(r=>storyPath(r.url)),'Throttled home downloaded lesson pictures');const homeNetwork=await network(f),home=await layout(f.p),s=metadata.stories.find(s=>s.id===id),flow=await teaching(f,s);
      const allowed=[s.image,s.intro].filter(Boolean),files=[...new Set(f.requests.filter(r=>storyPath(r.url)).map(r=>fileName(r.url)))];assert(files.every(file=>allowed.includes(file)),'Throttled lesson fetched unrelated artwork');
      const image=await nativeDecode(f.p,s.imageUrl);assert(image.ok,'Current story failed native decode on simulated slow network');
      return{networkProfile:THROTTLE,playbackRate:1,serviceWorkers:'blocked-for-complete-CDP-coverage',homeReadyMs:f.homeReadyMs,home,homeNetwork,flow,image,files,screenshot:await screenshot(f,`throttled-${id}`)};
    },{story:id,throttle:true,rate:1});

    await test('packaging-three-voice-portraits',async f=>{
      await action(f.p,'parent');await unlock(f.p);await f.p.locator('.voice-grid').waitFor();
      const portraits=await paperReady(f.p,'.voice-grid');
      assert.deepEqual(portraits.map(p=>p.key).sort(),['voice-aiden','voice-pip','voice-ryan']);
      await f.p.locator('.voice-grid').scrollIntoViewIfNeeded();
      const initialScreenshot=await screenshot(f,'packaging-three-voices-390'),previews=[];
      for(const id of ['aiden','ryan','pip']){
        await press(f.p,`[data-select-voice="${id}"]`);await f.p.locator(`[data-select-voice="${id}"][aria-pressed="true"]`).waitFor();
        await paperReady(f.p,'.voice-grid');const from=await f.p.evaluate(()=>qaArt.audio.length);
        await press(f.p,`[data-preview-voice="${id}"]`);
        await f.p.waitForFunction(from=>qaArt.audio.slice(from).some(a=>a.ended&&!a.error),from);
        previews.push({id,audio:await f.p.evaluate(from=>qaArt.audio.slice(from).filter(a=>a.ended&&!a.error),from)});
      }
      const bounds=await f.p.locator('.voice-grid button').evaluateAll(es=>es.map(e=>{const r=e.getBoundingClientRect();return{x:r.x,width:r.width,height:r.height};}));
      assert(bounds.every(b=>b.x>=-1&&b.x+b.width<=f.width+1&&b.width>=44&&b.height>=44),'Voice portrait buttons remain usable at 390 px');
      return{portraits,previews,bounds,initialScreenshot,selectedScreenshot:await screenshot(f,'packaging-selected-voice-390')};
    });

    await test('packaging-garden-a-new-pots',async f=>{
      const before=await f.p.evaluate(async()=>{
        const base=document.querySelector('script[type="module"][src]').src,m=await import(new URL('garden.js',base)),{localDay}=await import(new URL('learning.js',base));let s=m.createGarden();
        for(let i=0;i<3;i++){s=m.rewardRound(s,{roundId:`qa-art-pot-${i}`,eventId:'family-love',date:localDay()});s=m.plantSeed(m.openSeedPack(s));for(let n=0;n<2-i;n++)s=m.waterPlant(s,s.plants.at(-1).id);}
        localStorage.setItem(m.GARDEN_KEY,JSON.stringify(s));return s;
      });
      await reloadHome(f.p);await action(f.p,'garden');await f.p.locator('.garden-view').waitFor();
      const initialArt=await paperReady(f.p,'.garden-plants');assert.equal(initialArt.filter(a=>a.key==='pot-front').length,3);
      const initialLayout=await layout(f.p),initialScreenshot=await screenshot(f,'packaging-garden-a-pots-768');
      await press(f.p,'[data-plant="plant-3"]');
      await f.p.waitForFunction(()=>JSON.parse(localStorage.getItem('xiaoya-english:garden:v1')).plants[2].waterings===1);
      const wateredArt=await paperReady(f.p,'[data-plant="plant-3"]');assert(wateredArt.some(a=>a.key==='sprout'));assert(wateredArt.some(a=>a.key==='pot-front'));
      const after=await f.p.evaluate(()=>JSON.parse(localStorage.getItem('xiaoya-english:garden:v1')));assert.equal(after.water,before.water-1);
      assert.equal(await f.p.evaluate(key=>localStorage.getItem(key),STATE),null,'New pot art cannot create language evidence');
      return{before,after,initialArt,wateredArt,initialLayout,initialScreenshot,wateredScreenshot:await screenshot(f,'packaging-garden-a-watered-768')};
    },{garden:'a',width:768,height:1024});

    await test('packaging-challenge-flag-and-prize',async f=>{
      const unit=await f.p.evaluate(async()=>{
        const base=document.querySelector('script[type="module"][src]').src,[ch,pr,l]=await Promise.all(['challenges.js','practice-plan.js','learning.js'].map(file=>import(new URL(file,base)))),unit=ch.CHALLENGE_UNITS[0];let plan=pr.createPracticePlan(),progress=ch.createChallenges();
        for(const [i,eventId] of unit.eventIds.entries()){
          plan=pr.recordPractice(plan,{roundId:`qa-art-challenge-study-${i}`,eventId,date:l.localDay(),attemptId:null,mode:'new',rewardVariant:null});
          if(i<3)progress=ch.recordChallengeAttempt(progress,{id:`qa-art-challenge-step-${i}`,unitId:unit.id,eventId,date:l.localDay(),attemptId:`qa-art-challenge-attempt-${i}`,result:'independent',helped:false,source:'parent'});
        }
        localStorage.setItem(pr.PRACTICE_KEY,JSON.stringify(plan));localStorage.setItem(ch.CHALLENGE_KEY,JSON.stringify(progress));return unit;
      });
      await reloadHome(f.p);await f.p.locator('[data-action="challenges"]').waitFor();const homeArt=await paperReady(f.p,'.challenge-flag'),homeLayout=await layout(f.p),homeScreenshot=await screenshot(f,'packaging-home-challenge-flag-390');
      assert(homeArt.some(a=>a.key==='challenge-flag'));await action(f.p,'challenges');await f.p.locator('[data-challenge-board]').waitFor();
      const boardArt=await paperReady(f.p,'.challenge-board'),boardLayout=await layout(f.p),boardScreenshot=await screenshot(f,'packaging-challenge-board-390');
      await f.p.setViewportSize({width:320,height:740});
      // The two-column board is a scrollable list, unlike the single-screen
      // lesson controls. Verify its real scroll/return path at 320 px instead
      // of applying the no-scroll lesson contract to this longer list.
      const narrowBoardLayout=await f.p.evaluate(()=>({width:innerWidth,height:innerHeight,scrollWidth:document.documentElement.scrollWidth,scrollHeight:document.documentElement.scrollHeight,buttons:[...document.querySelectorAll('button')].filter(e=>e.checkVisibility()).map(e=>{const r=e.getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height,action:e.dataset.action||e.dataset.challengeUnit};})}));
      assert(narrowBoardLayout.scrollWidth<=320,'Narrow challenge list overflows horizontally');
      assert(narrowBoardLayout.buttons.every(b=>b.x>=-1&&b.x+b.width<=321&&b.width>=43&&b.height>=43),'Narrow challenge controls must retain complete touch targets');
      const narrowBoardScreenshot=await screenshot(f,'packaging-challenge-board-320');
      await f.p.mouse.wheel(0,1000);
      await f.p.waitForFunction(()=>{const r=document.querySelector('.challenge-back').getBoundingClientRect();return r.top>=0&&r.bottom<=740;});
      const narrowScrolledScreenshot=await screenshot(f,'packaging-challenge-board-320-scrolled');
      await press(f.p,'.challenge-back');await f.p.locator('.meadow-view').waitFor();
      narrowBoardLayout.returnTapReachedGarden=true;
      await f.p.setViewportSize({width:f.width,height:f.height});
      await action(f.p,'home');await f.p.locator('main.home-view').waitFor();await action(f.p,'challenges');await f.p.locator('[data-challenge-board]').waitFor();
      await press(f.p,`[data-challenge-unit="${unit.id}"]`);await f.p.locator(`[data-phase="request"][data-event="${unit.eventIds[3]}"]`).waitFor();
      await f.p.waitForFunction(()=>qaArt.audio.some(a=>a.url.endsWith('/challenge-question.mp3')&&a.ended));
      await action(f.p,'observe');await unlock(f.p);await f.p.locator('#observed-help').waitFor();assert.equal(await f.p.locator('#observed-help').isChecked(),false);
      await press(f.p,'[data-observation="independent"]');await f.p.locator('[data-phase="resolved"]').waitFor();await action(f.p,'finish');
      await f.p.locator(`[data-challenge-complete="${unit.id}"]`).waitFor();const prizeArt=await paperReady(f.p,'.challenge-prize'),prizeLayout=await layout(f.p);
      assert(prizeArt.some(a=>a.key==='challenge-flag'));assert.equal(await f.p.locator('[data-action="shell-purpose"] b').textContent(),'+4');assert.equal(await f.p.locator('[data-action="water-purpose"] b').textContent(),'+6');
      const prizeScreenshot=await screenshot(f,'packaging-challenge-prize-390');
      const limitedFlowerFixture=await f.p.evaluate(async()=>{
        const base=document.querySelector('script[type="module"][src]').src,[m,ch,l]=await Promise.all(['garden-meadow.js','challenges.js','learning.js'].map(file=>import(new URL(file,base))));let s=m.createMeadow();
        for(const unit of ch.CHALLENGE_UNITS)s=m.rewardChallenge(s,{unitId:unit.id,date:l.localDay()});
        for(const [i,x] of [.28,.7].entries()){s=m.plantSeed(m.redeemChallengeSeed(s),{x,y:.7});for(let n=0;n<5;n++)s=m.waterPlant(s,`plant-${i+1}`);}
        localStorage.setItem(m.MEADOW_KEY,JSON.stringify(s));return{source:'synthetic-completed-challenge-garden-ledger',plants:s.plants};
      });
      // Challenge-only fixture saves still use the welcome home screen. Reach
      // the garden through its visible challenge-board return, as a child can.
      await reloadHome(f.p);await action(f.p,'challenges');await f.p.locator('[data-challenge-board]').waitFor();await press(f.p,'.challenge-back');await f.p.locator('.meadow-view').waitFor();await f.p.waitForFunction(()=>document.querySelector('[data-meadow-field]')?.classList.contains('has-paper'));
      const limitedFlowerArt=await paperReady(f.p,'.meadow-view');
      for(const id of ['bow-rainbow','bow-starlight'])assert(limitedFlowerArt.some(a=>a.key===`flower-${id}`),`${id} must use its actual completed artwork`);
      const limitedFlowerLayout=await layout(f.p),limitedFlowerScreenshot=await screenshot(f,'packaging-limited-flowers-390');
      return{unit:unit.id,syntheticPriorSteps:3,finalStepSource:'parent-observation-fixture',homeArt,boardArt,prizeArt,homeLayout,boardLayout,narrowBoardLayout,prizeLayout,homeScreenshot,boardScreenshot,narrowBoardScreenshot,narrowScrolledScreenshot,prizeScreenshot,limitedFlowerFixture,limitedFlowerArt,limitedFlowerLayout,limitedFlowerScreenshot};
    });

    await test('packaging-rewards-and-free-garden',async f=>{
      const before=await f.p.evaluate(async()=>{
        const base=document.querySelector('script[type="module"][src]').src,m=await import(new URL('garden-meadow.js',base)),{localDay}=await import(new URL('learning.js',base)),date=localDay();let s=m.createMeadow();
        s=m.rewardRound(s,{roundId:'qa-art-garden-starter',eventId:'family-love',date});s=m.plantSeed(m.openSeedPack(s,0),{x:.28,y:.7});
        for(const [i,choice] of ['water','shells'].entries()){const roundId=`qa-art-garden-earn-${i}`;s=m.claimReward(m.rewardRound(s,{roundId,eventId:'family-love',date}),roundId,choice);}
        for(let i=0;i<5;i++)s=m.waterPlant(s,'plant-1');s=m.plantSeed(m.openSeedPack(s,.4),{x:.68,y:.7});
        s=m.rewardRound(s,{roundId:'qa-art-garden-pending',eventId:'family-love',date});localStorage.setItem(m.MEADOW_KEY,JSON.stringify(s));return s;
      });
      await reloadHome(f.p);await action(f.p,'garden');await f.p.locator('.reward-view[data-choice="true"]').waitFor();
      const choiceArt=await paperReady(f.p,'.reward-view'),choiceLayout=await layout(f.p),choiceScreenshot=await screenshot(f,'packaging-reward-choice-390');
      await press(f.p,'[data-reward-choice="water"]');await f.p.locator('[data-action="confirm-reward"]:enabled').waitFor();
      await f.p.waitForFunction(()=>qaArt.audio.some(a=>a.url.endsWith('/flow-water-choice-v13.mp3')&&a.ended));
      await action(f.p,'confirm-reward');await f.p.locator('.reward-view[data-choice="false"]').waitFor();
      const receiptArt=await paperReady(f.p,'.reward-view'),receiptLayout=await layout(f.p),receiptScreenshot=await screenshot(f,'packaging-water-receipt-390');
      await action(f.p,'garden');await f.p.locator('.meadow-view').waitFor();await f.p.waitForFunction(()=>document.querySelector('[data-meadow-field]')?.classList.contains('has-paper'));
      const gardenArt=await paperReady(f.p,'.meadow-view');await action(f.p,'meadow-can');await press(f.p,'[data-water-plant="plant-2"]');
      await f.p.waitForFunction(()=>JSON.parse(localStorage.getItem('xiaoya-english:meadow:v1')).plants[1].waterings===1);await paperReady(f.p,'[data-meadow-plant="plant-2"]');
      const after=await f.p.evaluate(()=>JSON.parse(localStorage.getItem('xiaoya-english:meadow:v1')));assert.equal(after.water,before.water+1);assert.equal(after.shells,before.shells);
      assert.equal(await f.p.evaluate(key=>localStorage.getItem(key),STATE),null,'Garden rewards cannot create language evidence');
      return{before,after,choiceArt,receiptArt,gardenArt,choiceLayout,receiptLayout,gardenLayout:await layout(f.p),choiceScreenshot,receiptScreenshot,gardenScreenshot:await screenshot(f,'packaging-free-garden-watered-390')};
    });

    for(const s of metadata.stories)await test(`mapping-${s.id}`,async f=>{
      assert(s.imageUrl&&s.alternateUrls?.request&&s.alternateUrls?.resolved,`Missing image contract for ${s.id}`);
      const main=await teaching(f,s);await layout(f.p);await action(f.p,'story-replay');await f.p.locator('main[data-phase="request"]').waitFor();await englishEnded(f.p,s.lessonId,2);
      const familiar=await picture(f.p,s.imageUrl),alternate=await alternateCheckup(f,s);
      return{main,familiar,alternate};
    },{story:s.id});

    for(const kind of ['slow','missing'])await test(`fault-${kind}-image-controls-and-audio`,async f=>{
      const s=metadata.stories.find(s=>s.id===f.story),started=await f.p.evaluate(()=>performance.now());await action(f.p,'next-event');await f.p.locator('main[data-phase="story"]').waitFor();
      await action(f.p,'story-replay');await f.p.locator('main[data-phase="request"]').waitFor();await englishEnded(f.p,s.lessonId);
      const englishWhileImageUnavailableMs=await f.p.evaluate(({started,lesson})=>qaArt.audio.find(a=>a.url.endsWith(`/${lesson}.mp3`)&&a.ended).endedAt-started,{started,lesson:s.lessonId});
      assert(englishWhileImageUnavailableMs<15000,'Missing/held art delayed the requested audio');
      await f.p.locator('.story-stage .vector-picture').waitFor({timeout:10000});
      const fallback=await layout(f.p),fallbackScreenshot=await screenshot(f,`fault-${kind}`);
      let lateReady=null;
      if(kind==='slow'){
        await f.p.locator('.story-stage [data-picture-status="slow"]').waitFor({timeout:10000});
        await f.p.evaluate(()=>{
          const main=document.querySelector('main[data-event]'),button=main.querySelector('[data-action="record"]'),picture=main.querySelector('.story-picture');
          button.focus({preventScroll:true});
          window.qaArtLateProbe={main,button,picture,phase:main.dataset.phase,context:main.dataset.context,frame:picture.dataset.storyFrame,audioCount:qaArt.audio.length};
        });
        f.release();const shown=await picture(f.p,s.imageUrl);
        const retained=await f.p.evaluate(()=>{
          const before=window.qaArtLateProbe,main=document.querySelector('main[data-event]'),picture=main.querySelector('.story-picture');
          return{main:main===before.main,button:main.querySelector('[data-action="record"]')===before.button,picture:picture===before.picture,focus:document.activeElement===before.button,phase:main.dataset.phase===before.phase,context:main.dataset.context===before.context,frame:picture.dataset.storyFrame===before.frame,audioCount:qaArt.audio.length===before.audioCount,enabled:!before.button.disabled};
        });
        assert(Object.values(retained).every(Boolean),`Late picture replaced controls, focus or lesson state: ${JSON.stringify(retained)}`);
        lateReady={shown,retained,screenshot:await screenshot(f,'fault-slow-image-late-ready')};
      }
      await action(f.p,'context-help');await englishEnded(f.p,s.lessonId,2);assert(await f.p.locator('[data-action="record"]').isEnabled(),'Image failure disabled the recording control');
      await action(f.p,'home');await f.p.locator('main.home-view').waitFor();
      return{fault:kind,englishWhileImageUnavailableMs,fallback,fallbackScreenshot,lateReady,audio:await f.p.evaluate(()=>qaArt.audio),homeNavigationWorked:true};
    },{story:'family-love',fault:{kind,file:metadata.stories.find(s=>s.id==='family-love').image}});
  }catch(error){report.fatal=error.stack;process.exitCode=1;console.error(error.stack);}
  finally{report.finishedAt=new Date().toISOString();report.summary={passed:report.checks.filter(c=>c.status==='PASS').length,failed:report.checks.filter(c=>c.status==='FAIL').length,total:report.checks.length,filtered:!!filter};save();if(browser)await browser.close();if(server)await new Promise(resolve=>server.close(resolve));console.log(JSON.stringify({output:out,...report.summary}));}
})();
