/* Sound configuration acceptance. Build internal candidate separately first.
 * Disposable profiles + loopback HTTP only; native MP3 playback is observed.
 * No physical microphone, user profile, remote API, or project build is changed.
 * npm run build:dev; node tests/xiaoya-sound-browser.cjs
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const http = require('node:http');
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/Jam/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root = path.resolve(__dirname, '..'), dist = path.resolve(root, process.env.XIAOYA_DIST_DIR || 'dist');
const out = path.resolve(root, process.env.XIAOYA_SOUND_TEST_OUT || 'test-results/xiaoya-sounds');
const filter = process.env.XIAOYA_TEST_FILTER ? new RegExp(process.env.XIAOYA_TEST_FILTER) : null;
const report = {startedAt:new Date().toISOString(),checks:[],scope:{nativeMedia:true,isolatedProfiles:true,physicalMicrophone:false,realSpeechAssessment:false,filter:filter?.source||null}};
const forbidden = /(?:\/(?:speech|models?)\/|\/speech-local\.js|\.(?:onnx|wasm)(?:\?|$)|vosk|whisper)/i;
const mime = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.webmanifest':'application/manifest+json','.webp':'image/webp','.png':'image/png','.svg':'image/svg+xml','.mp3':'audio/mpeg'};
let browser, server, origin, expected;

async function serve() {
  server = http.createServer(async (req,res) => {
    try {
      let name = decodeURIComponent(new URL(req.url,'http://localhost').pathname); if(name.endsWith('/'))name+='index.html';
      const file = path.resolve(dist,'.'+name), relative = path.relative(dist,file);
      if(relative.startsWith('..')||path.isAbsolute(relative))return res.writeHead(403).end();
      const stat = await fsp.stat(file); if(!stat.isFile())throw Error('Not a file');
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
    }catch{if(!res.headersSent)res.writeHead(404);res.end('Missing sound test candidate');}
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  return `http://127.0.0.1:${server.address().port}`;
}
const snapshot = p=>p.evaluate(()=>Object.fromEntries(Object.keys(localStorage).sort().map(key=>[key,localStorage.getItem(key)])));
async function moduleCall(p,moduleName,expression,args) {
  return p.evaluate(async({moduleName,expression,args})=>{
    const entry=document.querySelector('script[type="module"][src]').src;
    const module=await import(new URL(moduleName,entry));
    return Function('module','args',`return (${expression})(module,args)`)(module,args);
  },{moduleName,expression,args});
}
const bridge=(p,method,...args)=>moduleCall(p,'experience.js','(m,a)=>m.gmBridge[a.method](...a.args)',{method,args});
const settings=p=>moduleCall(p,'sound-settings.js','m=>m.soundSettings.get()');
const soundStatus=p=>moduleCall(p,'sound-player.js','m=>m.soundPlayer.status()');
async function waitMusic(p,playing){
  await moduleCall(p,'experience.js','m=>{window.qaSoundMusicStatus=()=>m.gmBridge.musicSettings();}');
  await p.waitForFunction(playing=>qaSoundMusicStatus().playing===playing,playing);
}
const soundKey='xiaoya-english:sounds:v1';
const card=id=>`[data-sound-event="${id}"]`;
async function observedSound(p,url,action) {
  const before=await p.evaluate(()=>qaSound.play.length);await action();
  await p.waitForFunction(({before,url})=>qaSound.play.slice(before).some(item=>item.url.endsWith(url)&&item.playing&&!item.error),{before,url});
  return p.evaluate(({before,url})=>qaSound.play.slice(before).find(item=>item.url.endsWith(url)&&item.playing),{before,url});
}
async function waitCueFinished(p) {
  await moduleCall(p,'sound-player.js','m=>{window.qaSoundPlayerStatus=()=>m.soundPlayer.status();}');
  await p.waitForFunction(()=>!qaSoundPlayerStatus().id);
}
async function noChildChanges(f) {
  const actual=await snapshot(f.p),original={...f.child};delete actual[soundKey];delete original[soundKey];
  assert.deepEqual(actual,original,'Sound management changed unrelated child records');
}
async function press(p,selector) {
  const el=p.locator(selector).first();await el.waitFor({state:'visible'});assert(await el.isEnabled(),`Disabled ${selector}`);await el.scrollIntoViewIfNeeded();
  const box=await el.evaluate(e=>{const r=e.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2;return{x,y,hit:e.contains(document.elementFromPoint(x,y))};});
  assert(box.hit,`Pointer intercepted for ${selector}`);
  if(p.viewportSize().width<600)await p.touchscreen.tap(box.x,box.y);else await p.mouse.click(box.x,box.y);
}
async function fixture(width=1180) {
  const c=await browser.newContext({viewport:{width,height:900},timezoneId:'Asia/Shanghai',serviceWorkers:'block',reducedMotion:'reduce',hasTouch:width<600,isMobile:width<600});
  const requests=[],responses=[],errors=[],access={microphone:0};
  c.on('request',r=>requests.push(r.url()));c.on('response',r=>responses.push({url:r.url(),status:r.status()}));
  await c.exposeBinding('qaSoundMicrophone',()=>{access.microphone++;});
  await c.route('**/*',route=>new URL(route.request().url()).origin===origin&&!forbidden.test(route.request().url())?route.continue():route.abort('blockedbyclient'));
  await c.addInitScript(({origin})=>{
    if(location.origin!==origin)return;
    if(!localStorage.getItem('qa-sound-original-child')){
      localStorage.setItem('qa-sound-original-child','keep-child-record');
      localStorage.setItem('xiaoya-english:preferences:v1',JSON.stringify({welcome:true,mic:false,guideStep:'done',shopSeen:true}));
      localStorage.setItem('xiaoya-english:voice:v1','ryan');
    }
    const qa=window.qaSound={play:[],elements:[],errors:[],mic:0};
    if(navigator.mediaDevices)navigator.mediaDevices.getUserMedia=()=>{qa.mic++;void window.qaSoundMicrophone();throw Error('Sound acceptance must not access the physical microphone');};
    const play=HTMLMediaElement.prototype.play,pause=HTMLMediaElement.prototype.pause,latestPlay=new WeakMap();
    HTMLMediaElement.prototype.play=function(){
      if(!qa.elements.includes(this))qa.elements.push(this);
      const item={url:this.currentSrc||this.src,element:qa.elements.indexOf(this),readyState:this.readyState,playing:false,ended:false,error:false,at:performance.now()};qa.play.push(item);
      latestPlay.set(this,item);
      this.addEventListener('loadeddata',()=>{item.loadedAt=performance.now();},{once:true});
      this.addEventListener('playing',()=>{item.url=this.currentSrc||this.src;item.playing=true;item.playingAt=performance.now();},{once:true});
      this.addEventListener('ended',()=>item.ended=true,{once:true});
      this.addEventListener('error',()=>item.error=true,{once:true});
      const result=play.call(this);result?.then(()=>{item.settledAt=performance.now();},error=>{item.rejectedAt=performance.now();item.rejection=String(error);});return result;
    };
    HTMLMediaElement.prototype.pause=function(){
      const item=latestPlay.get(this);if(item&&!item.firstPause)item.firstPause={at:performance.now(),readyState:this.readyState,networkState:this.networkState,currentTime:this.currentTime,duration:Number.isFinite(this.duration)?this.duration:null};
      return pause.call(this);
    };
    addEventListener('unhandledrejection',event=>qa.errors.push(String(event.reason)));
  },{origin});
  const p=await c.newPage();p.setDefaultTimeout(18000);p.on('pageerror',e=>errors.push(e.message));
  await p.goto(`${origin}/xiaoya/?garden=b`,{waitUntil:'domcontentloaded'});await p.locator('main.home-view').waitFor();
  assert.equal(await p.locator('meta[name="xiaoya-build"]').getAttribute('content'),expected.build);
  if(await p.locator('[data-action="open-welcome-gift"]').isVisible()){
    await press(p,'[data-action="open-welcome-gift"]');await p.locator('.welcome-gift-overlay[open]').waitFor({state:'hidden',timeout:14000});
  }
  return {c,p,requests,responses,errors,access,child:await snapshot(p),width};
}
async function openWorkbench(p) {
  await press(p,'#xiaoya-gm [data-gm-action="open"]');await p.locator('#gm-workbench[open]').waitFor();
  await press(p,'[data-gm-tab="sounds"]');await p.locator('[data-sound-event]').first().waitFor();
}
async function closeWorkbench(p) {await press(p,'#gm-workbench [data-gm-action="close"]');await p.locator('#gm-workbench[open]').waitFor({state:'hidden'});}
async function sandbox(p,query='gmPage=home') {
  await p.goto(`${origin}/xiaoya/?garden=b&gm=test&${query}`,{waitUntil:'domcontentloaded'});await p.locator('.gm-testbar').waitFor();
}
async function assertClean(f) {
  assert.equal(f.access.microphone,0);assert.equal(await f.p.evaluate(()=>qaSound.mic),0);
  assert.deepEqual(f.requests.filter(url=>forbidden.test(url)),[],'Requested a speech model/recognition runtime');
  assert.deepEqual(f.errors,[]);assert.deepEqual(await f.p.evaluate(()=>qaSound.errors),[]);
}
async function check(name,run,width) {
  if(filter&&!filter.test(name))return;
  const f=await fixture(width),start=Date.now();
  try{const detail=await run(f);await assertClean(f);report.checks.push({name,status:'PASS',ms:Date.now()-start,detail});console.log(`PASS ${name}`);}
  catch(error){process.exitCode=1;const diagnostics=await f.p.evaluate(()=>({hidden:document.hidden,play:qaSound.play,media:qaSound.elements.map(element=>({src:element.currentSrc||element.src,paused:element.paused,loop:element.loop,readyState:element.readyState,volume:element.volume})),errors:qaSound.errors})).catch(()=>null);if(diagnostics){diagnostics.sound=await soundStatus(f.p).catch(()=>null);diagnostics.music=await bridge(f.p,'musicSettings').catch(()=>null);}report.checks.push({name,status:'FAIL',error:error.stack,diagnostics});console.error(`FAIL ${name}\n${error.stack}`);await f.p.screenshot({path:path.join(out,`${name.replace(/[^a-z0-9]+/gi,'-')}.png`),fullPage:true}).catch(()=>{});}
  finally{await f.c.close();}
}

async function main() {
  await fsp.mkdir(out,{recursive:true});expected=JSON.parse(await fsp.readFile(path.join(dist,'xiaoya/version.json'),'utf8'));report.candidate=expected;
  assert.equal(expected.channel,'internal','Build the internal candidate before sound acceptance.');
  origin=process.env.TEST_URL?new URL(process.env.TEST_URL).origin:await serve();
  assert(['127.0.0.1','localhost','[::1]'].includes(new URL(origin).hostname),'Only loopback candidates are allowed');
  browser=await chromium.launch({channel:'msedge',headless:true,args:['--no-proxy-server','--autoplay-policy=no-user-gesture-required']});
  await check('sound management exposes the current mapping and native preview',async f=>{
    await openWorkbench(f.p);
    const catalog=await moduleCall(f.p,'sound-catalog.js','m=>({events:m.SOUND_EVENTS,assets:m.SOUND_ASSETS})');
    assert.equal(await f.p.locator('[data-sound-event]').count(),catalog.events.length);
    for(const event of catalog.events){
      const row=f.p.locator(card(event.id));assert.equal(await row.locator('[data-sound-asset]').inputValue(),event.assetId);
      assert.equal(await row.locator('[data-sound-enabled]').isChecked(),event.enabled!==false);
      assert.match(await row.textContent(),new RegExp(event.title));
    }
    const played=[];
    for(const asset of catalog.assets){
      const event=catalog.events.find(event=>event.assetId===asset.id);assert(event,`Unused asset ${asset.id}`);
      const selector=`${card(event.id)} [data-sound-action="preview"]`;
      const item=await observedSound(f.p,asset.url,()=>press(f.p,selector));played.push(item.url);
      assert(f.responses.some(response=>response.url===item.url&&[200,206].includes(response.status)),`Native preview did not fetch ${asset.id}`);
      if(event.kind==='bgm')await press(f.p,selector);
      else await f.p.waitForFunction(selector=>document.querySelector(selector)?.getAttribute('aria-pressed')==='false',selector);
    }
    assert.deepEqual(await snapshot(f.p),f.child,'Read-only mapping inspection or preview changed child records');
    return {events:catalog.events.length,nativeDecodedAssets:played.length,played};
  });
  await check('real app buttons panels and page changes request their configured cues',async f=>{
    const cues=[],startupCues=await f.p.evaluate(()=>qaSound.play.filter(item=>item.url.includes('/sfx/')).map(item=>({url:item.url,playing:item.playing,startDelayMs:item.playingAt?Math.round((item.playingAt-item.at)*10)/10:null})));
    assert(startupCues.some(item=>item.url.endsWith('/gift-open.mp3')&&item.playing),'The first gift click produced no native sound');
    assert(startupCues.some(item=>item.url.endsWith('/reward-shell.mp3')&&item.playing),'The first reward produced no native sound');
    cues.push(await observedSound(f.p,'xiaoya/sfx/panel-open.mp3',()=>press(f.p,'[data-action="parent"]')));
    await f.p.locator('#parent-answer').fill('999');
    cues.push(await observedSound(f.p,'xiaoya/sfx/ui-tap.mp3',()=>press(f.p,'[data-action="gate-submit"]')));
    cues.push(await observedSound(f.p,'xiaoya/sfx/panel-close.mp3',()=>press(f.p,'[data-action="close"]')));
    cues.push(await observedSound(f.p,'xiaoya/sfx/page-turn.mp3',()=>press(f.p,'[data-action="next-event"]')));
    await f.p.locator('main.event-view').waitFor();
    cues.push(await observedSound(f.p,'xiaoya/sfx/page-turn.mp3',()=>press(f.p,'[data-action="home"]')));
    await f.p.locator('main.home-view').waitFor();await noChildChanges(f);
    const nativeCues=await f.p.evaluate(()=>qaSound.play.filter(item=>item.url.includes('/sfx/')));
    return {startupCues,actualUICues:cues.map(item=>({url:item.url,startDelayMs:Math.round((item.playingAt-item.at)*10)/10})),nativeCues,physicalMicrophone:false};
  });
  await check('parent disclosure controls and observation save play their configured cues',async f=>{
    await press(f.p,'[data-action="parent"]');
    const question=await f.p.locator('label[for="parent-answer"]').textContent(),numbers=question.match(/\d+/g).map(Number);
    await f.p.locator('#parent-answer').fill(String(numbers[0]+numbers[1]));await press(f.p,'[data-action="gate-submit"]');
    await f.p.locator('main.parent-view').waitFor();await waitCueFinished(f.p);
    const disclosures=[];
    async function toggle(selector) {
      const wasOpen=await f.p.locator(selector).evaluate(summary=>summary.parentElement.open);
      const cue=await observedSound(f.p,`xiaoya/sfx/panel-${wasOpen?'close':'open'}.mp3`,()=>press(f.p,selector));
      assert.equal(await f.p.locator(selector).evaluate(summary=>summary.parentElement.open),!wasOpen);
      disclosures.push({selector,open:!wasOpen,startDelayMs:Math.round((cue.playingAt-cue.at)*10)/10});await waitCueFinished(f.p);
    }
    await toggle('.practice-plan > details > summary');await toggle('.practice-plan > details > summary');
    await toggle('.story-library > details > summary');
    for(const selector of ['.new-phrase-pack > summary','.original-phrases > summary','.extension-phrases > summary']){await toggle(selector);await toggle(selector);}
    await toggle('.story-library > details > summary');await noChildChanges(f);
    // Prepare a disposable lesson, then exercise the real observation controls.
    await sandbox(f.p,'gmPage=parent');const lesson=await moduleCall(f.p,'content.js','m=>m.EVENTS[0].id');
    await bridge(f.p,'openLesson',lesson,'review');await bridge(f.p,'advance');
    await press(f.p,'[data-action="observe"]');await f.p.locator('[data-observation="unclear"]').waitFor();await waitCueFinished(f.p);
    const before=(await bridge(f.p,'inspect')).evidenceCount;
    const saved=await observedSound(f.p,'xiaoya/sfx/ui-select.mp3',()=>press(f.p,'[data-observation="unclear"]'));
    assert.equal((await bridge(f.p,'inspect')).evidenceCount,before+1);assert.equal(await f.p.locator('[data-observation="unclear"]').count(),0);
    assert.deepEqual(await snapshot(f.p),f.child,'Sandbox observation escaped into real child storage');
    return {disclosures,observationSaved:true,saveDelayMs:Math.round((saved.playingAt-saved.at)*10)/10,localStorageBytesUnchanged:true};
  });
  await check('disable replace delete restore and refresh preserve mappings and child records',async f=>{
    await openWorkbench(f.p);const row=card('tap');
    await press(f.p,`${row} [data-sound-enabled]`);
    let saved=await settings(f.p);assert.equal(saved.events.tap.enabled,false);assert.equal(saved.events.tap.assetId,'ui-tap');
    await f.p.reload({waitUntil:'domcontentloaded'});await f.p.locator('main.home-view').waitFor();await openWorkbench(f.p);
    assert.equal(await f.p.locator(`${row} [data-sound-enabled]`).isChecked(),false);
    await f.p.locator(`${row} [data-sound-asset]`).selectOption('ui-select');
    saved=await settings(f.p);assert.equal(saved.events.tap.assetId,'ui-select');assert.equal(saved.events.tap.enabled,false);
    await press(f.p,`${row} [data-sound-enabled]`);
    await observedSound(f.p,'xiaoya/sfx/ui-select.mp3',()=>press(f.p,`${row} [data-sound-action="preview"]`));
    await press(f.p,`${row} [data-sound-action="delete"]`);
    saved=await settings(f.p);assert.equal(saved.events.tap.assetId,null);assert.equal(await f.p.locator(`${row} [data-sound-asset]`).inputValue(),'');
    assert(await f.p.locator(`${row} [data-sound-action="preview"]`).isDisabled());
    await f.p.reload({waitUntil:'domcontentloaded'});await f.p.locator('main.home-view').waitFor();await openWorkbench(f.p);
    assert.equal(await f.p.locator(`${row} [data-sound-asset]`).inputValue(),'');
    await press(f.p,`${row} [data-sound-action="reset"]`);
    saved=await settings(f.p);assert.deepEqual(saved.events.tap,{enabled:true,assetId:'ui-tap',volume:.45});
    const slider=f.p.locator(`${row} [data-sound-volume]`);await slider.focus();await slider.press('Home');await slider.press('PageUp');
    assert.equal((await settings(f.p)).events.tap.volume,.1);
    const master=f.p.locator('[data-sound-master-volume]');await master.focus();await master.press('Home');await master.press('PageUp');await master.press('PageUp');
    assert.equal((await settings(f.p)).volume,.2);await press(f.p,'[data-sound-master-enabled]');assert.equal((await settings(f.p)).enabled,false);
    await press(f.p,'[data-sound-action="reset-all"]');saved=await settings(f.p);
    assert.equal(saved.enabled,true);assert.equal(saved.volume,.65);assert.equal(saved.events.tap.volume,.45);
    await noChildChanges(f);assert((await snapshot(f.p))[soundKey]);
    return {persistedAcrossReload:true,operations:['disable','replace','enable','delete','restore','event volume','master volume','master disable','reset all'],childRecordsUnchanged:true};
  });
  await check('GM sandbox sound changes never write real storage and reset after refresh',async f=>{
    await sandbox(f.p);await openWorkbench(f.p);const row=card('tap');
    await press(f.p,`${row} [data-sound-enabled]`);await f.p.locator(`${row} [data-sound-asset]`).selectOption('ui-select');
    await press(f.p,`${card('navigate')} [data-sound-action="delete"]`);await press(f.p,'[data-sound-master-enabled]');
    assert.equal((await settings(f.p)).enabled,false);assert.match(await f.p.locator('[data-sound-status]').textContent(),/刷新后重置/);
    assert.deepEqual(await snapshot(f.p),f.child,'Sandbox sound edits escaped into real localStorage');
    await f.p.reload({waitUntil:'domcontentloaded'});await f.p.locator('.gm-testbar').waitFor();await openWorkbench(f.p);
    const saved=await settings(f.p);assert.equal(saved.enabled,true);assert.equal(saved.events.tap.enabled,true);assert.equal(saved.events.tap.assetId,'ui-tap');assert.equal(saved.events.navigate.assetId,'page-turn');
    assert.deepEqual(await snapshot(f.p),f.child);
    return {sandboxOnly:true,reloadRestoresDefaults:true,localStorageBytesUnchanged:true};
  });
  await check('local audio replacement validates decodes exports and survives refresh',async f=>{
    await openWorkbench(f.p);const row=card('tap');
    let chooser=f.p.waitForEvent('filechooser');await press(f.p,`${row} [data-sound-action="upload"]`);
    await (await chooser).setFiles({name:'broken.mp3',mimeType:'audio/mpeg',buffer:Buffer.from('This is not decodable audio')});
    await f.p.locator('[data-sound-status].is-error').waitFor();assert.equal((await settings(f.p)).events.tap.assetId,'ui-tap');
    chooser=f.p.waitForEvent('filechooser');await press(f.p,`${row} [data-sound-action="upload"]`);
    await (await chooser).setFiles({name:'本机按钮声.mp3',mimeType:'audio/mpeg',buffer:await fsp.readFile(path.join(dist,'xiaoya/sfx/ui-select.mp3'))});
    await f.p.waitForFunction(selector=>document.querySelector(selector)?.value.startsWith('custom-'),`${row} [data-sound-asset]`);
    const customId=(await settings(f.p)).events.tap.assetId,before=await f.p.evaluate(()=>qaSound.play.length);
    await press(f.p,`${row} [data-sound-action="preview"]`);
    await f.p.waitForFunction(before=>qaSound.play.slice(before).some(item=>item.url.startsWith('data:audio/mpeg;base64,')&&item.playing&&!item.error),before);
    const pendingDownload=f.p.waitForEvent('download');await press(f.p,'[data-sound-action="export"]');const download=await pendingDownload;
    const exported=JSON.parse(await fsp.readFile(await download.path(),'utf8'));assert.equal(exported.format,'xiaoya-sounds-v1');assert.equal(exported.events.tap.assetId,customId);assert(exported.customAssets[customId].url.startsWith('data:audio/mpeg;base64,'));
    await f.p.reload({waitUntil:'domcontentloaded'});await f.p.locator('main.home-view').waitFor();await openWorkbench(f.p);
    assert.equal(await f.p.locator(`${row} [data-sound-asset]`).inputValue(),customId);await noChildChanges(f);
    await press(f.p,`${row} [data-sound-action="delete"]`);
    await f.p.locator('.gm-sound-library summary').click();await press(f.p,`[data-sound-action="remove-asset"][data-sound-asset-id="${customId}"]`);
    assert.equal((await settings(f.p)).customAssets[customId],undefined);
    return {invalidFileRejected:true,nativeCustomDecode:true,exportedEmbeddedAudio:true,refreshPreservesCustom:true,unusedAssetRemoved:true};
  });
  await check('failed preference save reports an error and retains the previous mapping',async f=>{
    await openWorkbench(f.p);const before=await settings(f.p);
    await f.p.evaluate(key=>{const original=Storage.prototype.setItem;Storage.prototype.setItem=function(name,value){if(name===key)throw new DOMException('Sound acceptance quota','QuotaExceededError');return original.call(this,name,value);};},soundKey);
    await f.p.locator(`${card('tap')} [data-sound-asset]`).selectOption('ui-select');
    await f.p.locator('[data-sound-status].is-error').waitFor();assert.match(await f.p.locator('[data-sound-status]').textContent(),/空间不足/);
    assert.deepEqual(await settings(f.p),before);assert.equal(await f.p.locator(`${card('tap')} [data-sound-asset]`).inputValue(),'ui-tap');
    assert.deepEqual(await snapshot(f.p),f.child);
    return {quotaFailureVisible:true,previousMappingPreserved:true};
  });
  await check('speech microphone and hidden state prevent native cues and do not replay stale sounds',async f=>{
    await openWorkbench(f.p);
    const results=[];
    for(const state of ['speech','recording','hidden']){
      const before=await f.p.evaluate(()=>qaSound.play.length);
      const played=await moduleCall(f.p,'sound-player.js','async(m,state)=>{m.soundPlayer.setState({[state]:true});const result=await m.soundPlayer.play("tap",{preview:true});m.soundPlayer.setState({[state]:false});return result;}',state);
      assert.equal(played,false);assert.equal(await f.p.evaluate(()=>qaSound.play.length),before);results.push(state);
    }
    await observedSound(f.p,'xiaoya/audio/v3/garden-piano.mp3',()=>press(f.p,`${card('bgm-garden')} [data-sound-action="preview"]`));
    await moduleCall(f.p,'sound-player.js','m=>m.soundPlayer.setState({recording:true})');
    assert.equal((await soundStatus(f.p)).playing,false);
    assert(await f.p.evaluate(()=>qaSound.elements.every(element=>element.paused)),'Recording state must cancel all current sound cues');
    const before=await f.p.evaluate(()=>qaSound.play.length);await moduleCall(f.p,'sound-player.js','m=>m.soundPlayer.setState({recording:false})');
    await f.p.waitForTimeout(450);assert.equal(await f.p.evaluate(()=>qaSound.play.length),before);
    assert.deepEqual(await snapshot(f.p),f.child);
    return {blockedStates:results,activePreviewStopped:true,stalePlaybackSuppressed:true,physicalMicrophone:false};
  });
  await check('background music belongs only to the garden and fades away on navigation or GM',async f=>{
    await sandbox(f.p);await waitMusic(f.p,false);
    await bridge(f.p,'navigate','garden');await waitMusic(f.p,true);
    assert.equal((await bridge(f.p,'musicSettings')).playing,true);
    await f.p.evaluate(()=>dispatchEvent(new PageTransitionEvent('pagehide',{persisted:true})));
    assert.equal(await f.p.evaluate(()=>document.hidden),false,'Synthetic pagehide must exercise lifecycle independently of visibility');
    await f.p.waitForTimeout(300);
    assert.equal((await bridge(f.p,'musicSettings')).playing,false,'Audio release callbacks restarted music after pagehide');
    assert(await f.p.evaluate(()=>qaSound.elements.every(element=>element.paused)));
    assert.equal(await moduleCall(f.p,'sound-player.js','m=>m.soundPlayer.play("tap",{preview:true})'),false);
    await f.p.evaluate(()=>dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true})));
    await waitMusic(f.p,true);
    await openWorkbench(f.p);await waitMusic(f.p,false);
    assert.equal(await f.p.locator(card('bgm-home')).count(),0);
    await closeWorkbench(f.p);await waitMusic(f.p,true);
    for(const page of ['home','shop','blindbox']){
      if(page==='blindbox'){
        await bridge(f.p,'navigate','shop');await press(f.p,'[data-action="shop-pack"]');
      }else await bridge(f.p,'navigate',page);
      await waitMusic(f.p,false);
      assert(await f.p.evaluate(()=>qaSound.elements.every(element=>!element.loop||element.paused)),`${page} started garden music`);
      await bridge(f.p,'navigate','garden');await waitMusic(f.p,true);
    }
    await bridge(f.p,'navigate','garden');await f.p.locator('.meadow-view').waitFor();
    await waitMusic(f.p,true);
    assert.equal((await bridge(f.p,'musicSettings')).playing,true);
    assert.equal(await f.p.evaluate(()=>qaSound.elements.filter(element=>element.loop&&!element.paused).length),1,'Scene change overlapped background tracks');
    await openWorkbench(f.p);await f.p.locator(`${card('bgm-garden')} [data-sound-asset]`).selectOption('ui-select');
    await observedSound(f.p,'xiaoya/sfx/ui-select.mp3',()=>closeWorkbench(f.p));
    assert(await f.p.evaluate(()=>qaSound.elements.some(element=>element.loop&&!element.paused&&element.currentSrc.endsWith('xiaoya/sfx/ui-select.mp3'))),'The scene ignored its replacement binding');
    await openWorkbench(f.p);await press(f.p,`${card('bgm-garden')} [data-sound-action="delete"]`);await closeWorkbench(f.p);
    await waitMusic(f.p,false);
    await openWorkbench(f.p);await press(f.p,`${card('bgm-garden')} [data-sound-action="reset"]`);
    await observedSound(f.p,'xiaoya/audio/v3/garden-piano.mp3',()=>closeWorkbench(f.p));
    await press(f.p,'[data-action="next-event"]');await f.p.locator('main.event-view').waitFor();
    await f.p.waitForFunction(()=>qaSound.elements.every(element=>!element.loop||element.paused));
    assert.equal((await bridge(f.p,'musicSettings')).playing,false);assert.deepEqual(await snapshot(f.p),f.child);
    return {pagehideSilent:true,pageshowRestoresScene:true,homeShopBlindboxSilent:true,gardenScenePlaying:true,sceneReplacementAndDeletion:true,learningSceneSilent:true,maximumSimultaneousLoops:1};
  });
  await check('sound filters and actions fit a 320 pixel screen',async f=>{
    await sandbox(f.p);await openWorkbench(f.p);
    await f.p.locator('[data-sound-module]').selectOption('花园');
    assert.equal(await f.p.locator('[data-sound-event]').count(),await moduleCall(f.p,'sound-catalog.js','m=>m.SOUND_EVENTS.filter(event=>event.module==="花园").length'));
    await f.p.locator('[data-sound-search]').fill('绽放');assert.equal(await f.p.locator('[data-sound-event]').count(),1);
    await observedSound(f.p,'xiaoya/sfx/flower-bloom.mp3',()=>press(f.p,`${card('bloom')} [data-sound-action="preview"]`));
    const layout=await f.p.locator('#gm-workbench').evaluate(element=>({width:element.clientWidth,scroll:element.scrollWidth,viewport:innerWidth}));
    assert(layout.scroll<=layout.width+1,JSON.stringify(layout));
    for(const selector of ['[data-sound-module]','[data-sound-search]',`${card('bloom')} [data-sound-asset]`,`${card('bloom')} [data-sound-action="reset"]`]){
      const box=await f.p.locator(selector).boundingBox();assert(box.x>=0&&box.x+box.width<=320,`${selector} overflowed the viewport`);
    }
    await f.p.screenshot({path:path.join(out,'sounds-320.png'),fullPage:true});
    assert.deepEqual(await snapshot(f.p),f.child);return {width:320,layout,filtersWorking:true};
  },320);
}
main().catch(error=>{process.exitCode=1;report.checks.push({name:'suite setup',status:'FAIL',error:error.stack});console.error(error);}).finally(async()=>{
  await browser?.close();if(server)await new Promise(resolve=>server.close(resolve));
  report.finishedAt=new Date().toISOString();report.result=report.checks.length&&report.checks.every(x=>x.status==='PASS')?(filter?'PASS_PARTIAL':'PASS_AUTOMATED_SCOPE'):'FAIL';
  if(fs.existsSync(out))fs.writeFileSync(path.join(out,filter?'results-partial.json':'results.json'),JSON.stringify(report,null,2));
});
