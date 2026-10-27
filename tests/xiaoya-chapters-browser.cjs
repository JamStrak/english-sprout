/* Chapter acceptance: build:dev first, then node tests/xiaoya-chapters-browser.cjs.
 * Uses disposable browser contexts and the GM memory sandbox, never a child's
 * profile or microphone. Speech scores are simulations, not ASR validation. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const http = require('node:http');
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/Jam/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root = path.resolve(__dirname, '..');
const dist = path.resolve(root, process.env.XIAOYA_DIST_DIR || 'dist');
const out = path.resolve(root, process.env.XIAOYA_CHAPTER_TEST_OUT || 'test-results/xiaoya-v026-chapters');
const filter = process.env.XIAOYA_TEST_FILTER ? new RegExp(process.env.XIAOYA_TEST_FILTER) : null;
const forbidden = /(?:\/(?:speech|models?)\/|\/speech-local\.js|\.(?:onnx|wasm)(?:\?|$)|vosk|whisper)/i;
const mime = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.webmanifest':'application/manifest+json','.webp':'image/webp','.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml','.mp3':'audio/mpeg'};
const report = {startedAt:new Date().toISOString(),scope:{isolatedContexts:true,realStorageUnchanged:true,microphoneUsed:false,realSpeechAssessmentTested:false},checks:[]};
let browser, server, origin, expected;

async function serve() {
  server = http.createServer(async(req,res)=>{
    try {
      let name = decodeURIComponent(new URL(req.url,'http://localhost').pathname); if(name.endsWith('/'))name+='index.html';
      const file=path.resolve(dist,'.'+name),relative=path.relative(dist,file);
      if(relative.startsWith('..')||path.isAbsolute(relative))return res.writeHead(403).end();
      const stat=await fsp.stat(file);if(!stat.isFile())throw Error('Not a file');
      let start=0,end=stat.size-1,status=200;
      const headers={'Content-Type':mime[path.extname(file)]||'application/octet-stream','Cache-Control':'no-cache','Accept-Ranges':'bytes'};
      if(req.headers.range){
        const range=/^bytes=(\d*)-(\d*)$/.exec(req.headers.range);
        if(!range||(!range[1]&&!range[2]))return res.writeHead(416).end();
        if(range[1]){start=Number(range[1]);if(range[2])end=Math.min(end,Number(range[2]));}else start=Math.max(0,stat.size-Number(range[2]));
        if(start>end||start>=stat.size)return res.writeHead(416).end();
        status=206;headers['Content-Range']=`bytes ${start}-${end}/${stat.size}`;
      }
      headers['Content-Length']=end-start+1;res.writeHead(status,headers);
      if(req.method==='HEAD')res.end();else fs.createReadStream(file,{start,end}).on('error',()=>res.destroy()).pipe(res);
    }catch{if(!res.headersSent)res.writeHead(404);res.end('Missing test candidate');}
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  return `http://127.0.0.1:${server.address().port}`;
}
const snapshot=p=>p.evaluate(()=>Object.fromEntries(Object.keys(localStorage).sort().map(key=>[key,localStorage.getItem(key)])));
async function fixture(width=1180,reducedMotion='reduce'){
  const c=await browser.newContext({viewport:{width,height:900},timezoneId:'Asia/Shanghai',serviceWorkers:'block',reducedMotion,hasTouch:width<600,isMobile:width<600});
  const requests=[],errors=[],access={microphone:0};
  await c.exposeBinding('qaChapterMicrophone',()=>access.microphone++);
  c.on('request',r=>requests.push(r.url()));
  await c.route('**/*',route=>new URL(route.request().url()).origin===origin&&!forbidden.test(route.request().url())?route.continue():route.abort('blockedbyclient'));
  await c.addInitScript(({origin})=>{
    if(location.origin!==origin)return;
    localStorage.setItem('qa-chapter-original-child','keep-this-child-record');
    localStorage.setItem('xiaoya-english:preferences:v1',JSON.stringify({welcome:true,mic:false,guideStep:'done',audioControls:{music:false,reminders:false}}));
    const qa=window.qaChapter={mic:0,play:[],errors:[]};
    if(navigator.mediaDevices)navigator.mediaDevices.getUserMedia=()=>{qa.mic++;void window.qaChapterMicrophone();throw Error('Chapter acceptance must never open a microphone');};
    const play=HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play=function(){this.playbackRate=4;const item={url:this.currentSrc||this.src,playing:false};qa.play.push(item);this.addEventListener('playing',()=>{item.url=this.currentSrc||this.src;item.playing=true;},{once:true});return play.call(this);};
    addEventListener('unhandledrejection',event=>qa.errors.push(String(event.reason)));
  },{origin});
  const p=await c.newPage();p.setDefaultTimeout(18000);p.on('pageerror',error=>errors.push(error.message));
  await p.goto(`${origin}/xiaoya/?garden=b&gm=test&gmPage=home`,{waitUntil:'domcontentloaded'});
  await p.locator('[data-chapter-home]').waitFor();
  assert.equal(await p.locator('meta[name="xiaoya-build"]').getAttribute('content'),expected.build);
  return {c,p,width,requests,errors,access,child:await snapshot(p)};
}
async function bridge(p,method,...args){
  return p.evaluate(async({method,args})=>{
    const {gmBridge}=await import(new URL('experience.js',document.querySelector('script[type="module"][src]').src));
    return gmBridge[method](...args);
  },{method,args});
}
async function storage(p,key){
  return p.evaluate(async key=>{
    const {appStorage}=await import(new URL('runtime.js',document.querySelector('script[type="module"][src]').src));
    return JSON.parse(appStorage.getItem(key)||'null');
  },key);
}
async function press(p,selector){
  const el=p.locator(selector).first();await el.waitFor({state:'visible'});assert(await el.isEnabled(),`Disabled ${selector}`);await el.scrollIntoViewIfNeeded();
  const hit=await el.evaluate(e=>{const r=e.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2;return{x,y,hit:e.contains(document.elementFromPoint(x,y))};});
  assert(hit.hit,`Pointer intercepted: ${selector}`);
  if(p.viewportSize().width<600)await p.touchscreen.tap(hit.x,hit.y);else await p.mouse.click(hit.x,hit.y);
}
async function clean(f){
  assert.equal(f.access.microphone,0);assert.equal(await f.p.evaluate(()=>qaChapter.mic),0);
  assert.deepEqual(f.requests.filter(url=>forbidden.test(url)),[],'No speech model/runtime should load');
  assert.deepEqual(f.errors,[]);assert.deepEqual(await f.p.evaluate(()=>qaChapter.errors),[]);
  assert.deepEqual(await snapshot(f.p),f.child,'Sandbox changed the real child records');
}
async function check(name,run,width,reducedMotion='reduce'){
  if(filter&&!filter.test(name))return;
  let f;const start=Date.now();
  try{f=await fixture(width,reducedMotion);const detail=await run(f);await clean(f);report.checks.push({name,status:'PASS',ms:Date.now()-start,detail});console.log(`PASS ${name}`);}
  catch(error){process.exitCode=1;report.checks.push({name,status:'FAIL',error:error.stack});console.error(`FAIL ${name}\n${error.stack}`);if(f)await f.p.screenshot({path:path.join(out,`${name.replace(/[^a-z0-9]+/gi,'-')}.png`),fullPage:true}).catch(()=>{});}
  finally{if(f)await f.c.close();}
}
async function openChapter(p,number=1){
  await bridge(p,'navigate','home');await press(p,'[data-action="learning"]');
  await p.locator('[data-chapter-board]').waitFor();await press(p,`.chapter-card[data-chapter="chapter-${number}"]`);
  await p.locator(`[data-chapter-detail="chapter-${number}"]`).waitFor();
  return p.locator('[data-chapter-phrase]').evaluateAll(items=>items.map(item=>item.dataset.chapterPhrase));
}
async function simulate(p,result='one'){
  await bridge(p,'setResult',result);await press(p,'[data-action="record"]');
  await p.locator(`[data-assessment][data-stars="${{three:3,two:2,one:1,silence:0,unavailable:0}[result]}"]`).waitFor();
}
async function collect(p){
  await p.locator('.reward-view').waitFor();
  if(await p.locator('.reward-view').getAttribute('data-choice')==='true')await press(p,'[data-action="choose-shells"]');
  await press(p,'[data-action="chapter-after-reward"]');
}
async function participate(p){
  await simulate(p,'one');await press(p,'[data-action="chapter-practiced"]');await collect(p);
}
async function englishUrls(p){
  return p.evaluate(async()=>{
    const base=document.querySelector('script[type="module"][src]').src;
    const [{CHAPTERS},{storyFor},{lessonAudio,VOICES}]=await Promise.all(['chapters.js','stories.js','voices.js'].map(name=>import(new URL(name,base))));
    return CHAPTERS.flatMap(chapter=>chapter.eventIds.flatMap(id=>VOICES.map(voice=>new URL(lessonAudio(storyFor(id).event,voice.id),document.baseURI).href)));
  });
}
async function assertRecall(p,index,english){
  await p.locator('main[data-phase="request"]').waitFor();
  assert.equal(await p.locator('[data-action="story-continue"]').count(),0,'Review must skip the teaching slideshow');
  // Observe the initial audio scheduling window: review must not auto-play its answer.
  await p.waitForTimeout(500);
  const played=await p.evaluate(index=>qaChapter.play.slice(index).map(item=>item.url),index);
  assert.deepEqual(played.filter(url=>english.includes(url)),[],'Review leaked the English answer before the child asked to listen');
}
async function noOverflow(p){
  const box=await p.evaluate(()=>({viewport:innerWidth,document:document.documentElement.scrollWidth,body:document.body.scrollWidth}));
  assert(box.document<=box.viewport+1&&box.body<=box.viewport+1,JSON.stringify(box));return box;
}
async function decode(p,selector){
  return p.locator(selector).evaluateAll(async images=>Promise.all(images.map(async image=>{await image.decode();return{url:image.currentSrc,width:image.naturalWidth,height:image.naturalHeight};})));
}

async function main(){
  await fsp.mkdir(out,{recursive:true});expected=JSON.parse(await fsp.readFile(path.join(dist,'xiaoya/version.json'),'utf8'));report.candidate=expected;
  assert.equal(expected.channel,'internal','Run npm run build:dev before this test');
  origin=await serve();browser=await chromium.launch({channel:'msedge',headless:true,args:['--no-proxy-server','--autoplay-policy=no-user-gesture-required']});
  for(const width of [320,1180])for(const reducedMotion of ['no-preference','reduce'])await check(`one current chapter receives immediate visible focus at ${width} with ${reducedMotion}`,async f=>{
    const p=f.p;
    // Put the sole continuation below the initial viewport so navigation must
    // reveal it rather than merely drawing an off-screen animation.
    for(let number=1;number<=8;number++)await bridge(p,'prepareChallenge',`challenge-${number}`);
    await bridge(p,'navigate','chapters');await p.locator('[data-chapter-board]').waitFor();
    const focus=p.locator('[data-chapter-focus]');
    assert.equal(await focus.count(),1);assert.equal(await p.locator('[aria-current="step"]').count(),1);
    assert.equal(await focus.getAttribute('data-chapter'),'chapter-9');
    await p.waitForFunction(()=>{const r=document.querySelector('[data-chapter-focus]').getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight;});
    const state=await focus.evaluate(el=>{const tag=el.querySelector('.chapter-current-tag').getBoundingClientRect(),card=el.getBoundingClientRect();return{
      ring:getComputedStyle(el,'::before').animationName,badge:getComputedStyle(el.querySelector('.chapter-current-play')).animationName,
      pointer:getComputedStyle(el,'::before').pointerEvents,tagInside:tag.left>=card.left&&tag.right<=card.right,
      overflow:document.documentElement.scrollWidth>innerWidth||document.body.scrollWidth>innerWidth};});
    assert.equal(state.overflow,false);assert.equal(state.pointer,'none');assert.equal(state.tagInside,true);
    assert.equal(state.ring,reducedMotion==='reduce'?'none':'chapter-continue-ripple');
    assert.equal(state.badge,reducedMotion==='reduce'?'none':'chapter-continue-beckon');
    await p.screenshot({path:path.join(out,`chapter-focus-${width}-${reducedMotion}.png`),fullPage:true});
    await press(p,'.chapter-current-play');await p.locator('[data-chapter-detail="chapter-9"]').waitFor();
    return {width,reducedMotion,current:'chapter-9',visible:true,...state};
  },width,reducedMotion);

  for(const width of [1180,320])await check(`home and chapter cards decode and respond at ${width}`,async f=>{
    const p=f.p;assert.equal(await p.locator('.chapter-entry').count(),2);
    const images=await decode(p,'.chapter-entry img');assert(images.every(image=>image.width>=900&&image.height>=600));
    const boxes=await p.locator('.chapter-entry').evaluateAll(items=>items.map(item=>{const r=item.getBoundingClientRect();return{x:r.x,y:r.y,right:r.right,bottom:r.bottom};}));
    assert(boxes[0].right<=boxes[1].x||boxes[1].right<=boxes[0].x||boxes[0].bottom<=boxes[1].y||boxes[1].bottom<=boxes[0].y,'Home entrance cards overlap');
    await noOverflow(p);await p.screenshot({path:path.join(out,`home-${width}.png`),fullPage:true});
    await press(p,'.chapter-entry-garden');await p.locator('.meadow-view').waitFor();await press(p,'[data-action="home"]');
    await press(p,'.chapter-entry-learning');await p.locator('[data-chapter-board]').waitFor();
    assert.equal(await p.locator('.chapter-card').count(),21);assert.equal(await p.locator('.chapter-card:enabled').count(),1);
    await noOverflow(p);await press(p,'.chapter-card[data-chapter="chapter-1"]');
    const ids=await p.locator('[data-chapter-phrase]').evaluateAll(items=>items.map(item=>item.dataset.chapterPhrase));assert.equal(ids.length,4);
    const thumbnails=await decode(p,'.chapter-phrase img');assert(thumbnails.every(image=>image.width>0));
    await noOverflow(p);assert(await p.locator('[data-challenge-unit="challenge-1"]').isDisabled());
    await p.screenshot({path:path.join(out,`chapter-one-${width}.png`),fullPage:true});
    await press(p,`[data-chapter-phrase="${ids[2]}"]`);await p.locator(`main[data-event="${ids[2]}"]`).waitFor();
    return {width,images,phraseCount:ids.length,cards:21,locked:20};
  },width);

  await check('four one-star participations unlock next chapter without mastery or challenge pass',async f=>{
    const p=f.p,ids=await openChapter(p);await press(p,'[data-action="chapter-continue"]');
    for(let i=0;i<ids.length;i++){
      await p.locator(`main[data-event="${ids[i]}"]`).waitFor();await bridge(p,'advance');
      assert.equal((await bridge(p,'inspect')).practiceCount,i);await participate(p);
    }
    await p.locator('[data-chapter-detail="chapter-1"].is-just-completed').waitFor();
    const status=await bridge(p,'inspect');assert.equal(status.practiceCount,4);assert.equal(status.evidenceCount,4);
    assert.equal(status.challengeAttempts,0);assert.equal(status.challengeRewards,0);
    const state=await storage(p,'xiaoya-english:state:v1');assert(state.evidence.every(item=>item.result==='unclear'),'One-star evidence was upgraded');
    assert(await p.locator('[data-challenge-unit="challenge-1"]').isEnabled());assert.equal(await p.locator('.chapter-challenge.is-earned').count(),0);
    await press(p,'[data-action="chapter-next"]');await p.locator('[data-chapter-detail="chapter-2"]').waitFor();
    await press(p,'[data-action="learning"]');assert(await p.locator('.chapter-card[data-chapter="chapter-2"]').isEnabled());assert(await p.locator('.chapter-card[data-chapter="chapter-3"]').isDisabled());
    await p.screenshot({path:path.join(out,'participation-unlocks-chapter-two.png'),fullPage:true});
    return {ids,status,evidenceResults:state.evidence.map(item=>item.result),challengePassed:false,nextChapterUnlocked:true};
  });

  await check('silence and device errors cannot fabricate completed practice',async f=>{
    const p=f.p;await openChapter(p);await press(p,'[data-action="chapter-continue"]');await bridge(p,'advance');
    for(const result of ['silence','unavailable']){await simulate(p,result);assert.equal(await p.locator('[data-action="chapter-practiced"]').count(),0);assert.equal((await bridge(p,'inspect')).practiceCount,0);}
    await press(p,'[data-action="chapter-back"]');await press(p,'[data-action="learning"]');assert(await p.locator('.chapter-card[data-chapter="chapter-2"]').isDisabled());
    return {practiceCount:0,nextChapterLocked:true};
  });

  await check('single phrase and chapter review queue preserve recall without answer autoplay',async f=>{
    const p=f.p;await bridge(p,'prepareChallenge','challenge-1');const ids=await openChapter(p),english=await englishUrls(p);
    let audioIndex=await p.evaluate(()=>qaChapter.play.length);await press(p,`[data-chapter-phrase="${ids[2]}"]`);await assertRecall(p,audioIndex,english);
    assert.equal(await p.locator('main[data-event]').getAttribute('data-event'),ids[2]);await participate(p);
    await p.locator('[data-chapter-detail="chapter-1"]').waitFor();
    audioIndex=await p.evaluate(()=>qaChapter.play.length);await press(p,'[data-action="chapter-review"]');const played=[];
    for(let i=0;i<4;i++){
      await assertRecall(p,audioIndex,english);played.push(await p.locator('main[data-event]').getAttribute('data-event'));
      await simulate(p,'one');await press(p,'[data-action="chapter-practiced"]');await p.locator('.reward-view').waitFor();
      if(await p.locator('.reward-view').getAttribute('data-choice')==='true')await press(p,'[data-action="choose-water"]');
      audioIndex=await p.evaluate(()=>qaChapter.play.length);await press(p,'[data-action="chapter-after-reward"]');
    }
    await p.locator('[data-chapter-detail="chapter-1"]').waitFor();assert.deepEqual(played,ids);assert.equal((await bridge(p,'inspect')).challengeAttempts,0);
    return {singlePhrase:ids[2],reviewQueue:played,noEnglishAutoplay:true};
  });

  await check('three completed chapters offer a four-phrase mixed review from all three',async f=>{
    const p=f.p;for(const number of [1,2,3])await bridge(p,'prepareChallenge',`challenge-${number}`);
    const groups=[];for(const number of [1,2,3])groups.push(await openChapter(p,number));
    const english=await englishUrls(p);let audioIndex=await p.evaluate(()=>qaChapter.play.length);await press(p,'[data-action="chapter-mixed"]');const played=[];
    for(let i=0;i<4;i++){
      await assertRecall(p,audioIndex,english);played.push(await p.locator('main[data-event]').getAttribute('data-event'));
      await simulate(p,'one');await press(p,'[data-action="chapter-practiced"]');await p.locator('.reward-view').waitFor();
      if(await p.locator('.reward-view').getAttribute('data-choice')==='true')await press(p,'[data-action="choose-shells"]');
      audioIndex=await p.evaluate(()=>qaChapter.play.length);await press(p,'[data-action="chapter-after-reward"]');
    }
    await p.locator('[data-chapter-detail="chapter-3"]').waitFor();assert.equal(new Set(played).size,4);assert(groups.every(group=>played.some(id=>group.includes(id))));
    return {reviewQueue:played,representedChapters:3,challengePassRequired:false};
  });
}
main().catch(error=>{process.exitCode=1;report.fatal=error.stack;console.error(error);}).finally(async()=>{
  if(browser)await browser.close();if(server)await new Promise(resolve=>server.close(resolve));
  report.finishedAt=new Date().toISOString();await fsp.mkdir(out,{recursive:true});await fsp.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));
  console.log(`Chapter report: ${path.join(out,'report.json')}`);
});
