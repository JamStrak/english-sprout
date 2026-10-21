/* Internal workbench acceptance; disposable browser profile and loopback server.
 * Build separately first: npm run build:dev; node tests/xiaoya-gm-browser.cjs
 * For the public build: XIAOYA_EXPECT_PUBLIC=1 node tests/xiaoya-gm-browser.cjs
 * TEST_URL can select a loopback candidate; no build or user profile is modified.
 * Native image/audio decoding is real. All lesson evidence is explicitly GM-only.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const http = require('node:http');
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/Jam/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root = path.resolve(__dirname, '..'), dist = path.join(root, 'dist');
const publicBuild = process.env.XIAOYA_EXPECT_PUBLIC === '1';
const filter = process.env.XIAOYA_TEST_FILTER ? new RegExp(process.env.XIAOYA_TEST_FILTER) : null;
const out = path.resolve(root, process.env.XIAOYA_GM_TEST_OUT || path.join('test-results', publicBuild ? 'xiaoya-v016-gm-public' : 'xiaoya-v016-gm'));
const report = {startedAt: new Date().toISOString(), checks: [], scope: {publicBuild, nativeMedia: true, isolatedProfiles: true, microphoneUsed: false, realSpeechAssessmentTested: false, filter: filter?.source || null}};
const forbidden = /(?:\/(?:speech|models?)\/|\/speech-local\.js|\.(?:onnx|wasm)(?:\?|$)|vosk|whisper)/i;
const mime = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.webmanifest':'application/manifest+json','.webp':'image/webp','.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml','.mp3':'audio/mpeg'};
let browser, server, origin, expected;

async function serve() {
  server = http.createServer(async (req, res) => {
    try {
      let name = decodeURIComponent(new URL(req.url, 'http://localhost').pathname); if (name.endsWith('/')) name += 'index.html';
      const file = path.resolve(dist, '.' + name), relative = path.relative(dist, file);
      if (relative.startsWith('..') || path.isAbsolute(relative)) return res.writeHead(403).end();
      const stat = await fsp.stat(file); if (!stat.isFile()) throw Error('Not a file');
      let start = 0, end = stat.size - 1, status = 200;
      const headers = {'Content-Type': mime[path.extname(file)] || 'application/octet-stream', 'Cache-Control':'no-cache', 'Accept-Ranges':'bytes'};
      if (req.headers.range) {
        const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range);
        if (!range || (!range[1] && !range[2])) return res.writeHead(416).end();
        if (range[1]) { start = Number(range[1]); if (range[2]) end = Math.min(end, Number(range[2])); }
        else start = Math.max(0, stat.size - Number(range[2]));
        if (start > end || start >= stat.size) return res.writeHead(416).end();
        status = 206; headers['Content-Range'] = `bytes ${start}-${end}/${stat.size}`;
      }
      headers['Content-Length'] = end - start + 1; res.writeHead(status, headers);
      if (req.method === 'HEAD') res.end(); else fs.createReadStream(file,{start,end}).on('error',()=>res.destroy()).pipe(res);
    } catch { if (!res.headersSent) res.writeHead(404); res.end('Missing test candidate'); }
  });
  await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
  return `http://127.0.0.1:${server.address().port}`;
}
async function fixture(width = 1180) {
  const c = await browser.newContext({viewport:{width,height:900},timezoneId:'Asia/Shanghai',serviceWorkers:'block',reducedMotion:'reduce',hasTouch:width<600,isMobile:width<600});
  const requests = [], errors = [], access = {microphone:0};
  await c.exposeBinding('qaReportMicrophone',()=>{access.microphone++;});
  c.on('request',r=>requests.push(r.url()));
  await c.route('**/*',route=>new URL(route.request().url()).origin===origin && !forbidden.test(route.request().url()) ? route.continue() : route.abort('blockedbyclient'));
  await c.addInitScript(({origin})=>{
    if(location.origin!==origin)return;
    if (!localStorage.getItem('qa-gm-original-child')) {
      localStorage.setItem('qa-gm-original-child','keep-this-child-record');
      localStorage.setItem('xiaoya-english:preferences:v1',JSON.stringify({welcome:true,mic:false,guideStep:'done'}));
      localStorage.setItem('xiaoya-english:voice:v1','ryan');
    }
    const qa=window.qaGM={mic:0,play:[],errors:[]};
    if(navigator.mediaDevices)navigator.mediaDevices.getUserMedia=()=>{qa.mic++;void window.qaReportMicrophone();throw Error('GM acceptance must never open the microphone');};
    const play=HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play=function(){this.playbackRate=4;const item={url:this.currentSrc||this.src,playing:false,ended:false,error:false};qa.play.push(item);this.addEventListener('playing',()=>{item.url=this.currentSrc||this.src;item.playing=true;},{once:true});this.addEventListener('ended',()=>item.ended=true,{once:true});this.addEventListener('error',()=>item.error=true,{once:true});return play.call(this);};
    addEventListener('unhandledrejection',event=>qa.errors.push(String(event.reason)));
  },{origin});
  const p = await c.newPage(); p.setDefaultTimeout(18000); p.on('pageerror',e=>errors.push(e.message));
  await p.goto(`${origin}/xiaoya/?garden=b`,{waitUntil:'domcontentloaded'});await p.locator('main.home-view').waitFor();
  assert.equal(await p.locator('meta[name="xiaoya-build"]').getAttribute('content'),expected.build);
  const child = await snapshot(p);
  return {c,p,requests,errors,access,child,width};
}
const snapshot = p=>p.evaluate(()=>Object.fromEntries(Object.keys(localStorage).sort().map(key=>[key,localStorage.getItem(key)])));
async function bridge(p, method, ...args) {
  return p.evaluate(async({method,args})=>{
    const base=document.querySelector('script[type="module"][src]').src;
    const {gmBridge}=await import(new URL('experience.js',base));
    return gmBridge[method](...args);
  },{method,args});
}
async function press(p, selector) {
  const el=p.locator(selector).first();await el.waitFor({state:'visible'});assert(await el.isEnabled(),`Disabled ${selector}`);await el.scrollIntoViewIfNeeded();
  const box=await el.evaluate(e=>{const r=e.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2;return{x,y,hit:e.contains(document.elementFromPoint(x,y))};});
  assert(box.hit,`Pointer intercepted for ${selector}`);
  if(p.viewportSize().width<600)await p.touchscreen.tap(box.x,box.y);else await p.mouse.click(box.x,box.y);
}
async function clean(f) {
  assert.equal(f.access.microphone,0,'A previous GM navigation touched the real microphone');
  assert.equal(await f.p.evaluate(()=>qaGM.mic),0,'GM touched the real microphone');
  assert.deepEqual(f.requests.filter(url=>forbidden.test(url)),[],'GM requested a speech model/recognition runtime');
  assert.deepEqual(f.errors,[]);assert.deepEqual(await f.p.evaluate(()=>qaGM.errors),[]);
  assert.deepEqual(await snapshot(f.p),f.child,'A GM action changed the child\'s real browser records');
}
async function check(name, run, width) {
  if(filter&&!filter.test(name))return;
  const f=await fixture(width),start=Date.now();
  try{const detail=await run(f);await clean(f);report.checks.push({name,status:'PASS',ms:Date.now()-start,detail});console.log(`PASS ${name}`);}
  catch(error){process.exitCode=1;report.checks.push({name,status:'FAIL',error:error.stack});console.error(`FAIL ${name}\n${error.stack}`);await f.p.screenshot({path:path.join(out,`${name.replace(/[^a-z0-9]+/gi,'-')}.png`),fullPage:true}).catch(()=>{});}
  finally{await f.c.close();}
}
async function sandbox(p, query = 'gmEvent=hello-morning&gmMode=review&gmVoice=pip') {
  await p.goto(`${origin}/xiaoya/?garden=b&gm=test&${query}`,{waitUntil:'domcontentloaded'});
  await p.waitForFunction(()=>document.querySelector('main.event-view,main.meadow-view,main.home-view'));
}
async function simulate(p,result='three') {
  await p.locator('.gm-testbar [data-gm-result]').selectOption(result);await press(p,'[data-action="record"]');
  await p.locator(`[data-assessment][data-stars="${{three:3,two:2,one:1,silence:0,unavailable:0}[result]}"]`).waitFor();
}
async function openWorkbench(p,tab='courses') {
  await press(p,'#xiaoya-gm [data-gm-action="open"]');await p.locator('#gm-workbench[open]').waitFor();
  if(tab!=='courses')await press(p,`[data-gm-tab="${tab}"]`);
}
async function audition(p,selector) {
  const url=await p.locator(selector).first().getAttribute('data-gm-audio');
  const index=await p.evaluate(()=>qaGM.play.length);await press(p,selector);
  await p.waitForFunction(({url,index})=>qaGM.play.slice(index).some(item=>item.url.endsWith(url)&&item.playing&&item.ended),{url,index},{timeout:30000});
  assert.match(await p.locator('[data-gm-playback]').textContent(),/已播完/);return url;
}
async function main() {
  await fsp.mkdir(out,{recursive:true}); expected=JSON.parse(await fsp.readFile(path.join(dist,'xiaoya/version.json'),'utf8'));
  report.candidate=expected;
  assert.equal(expected.channel,publicBuild?'public':'internal','Build the intended channel before acceptance.');
  origin=process.env.TEST_URL?new URL(process.env.TEST_URL).origin:await serve();
  assert(['127.0.0.1','localhost','[::1]'].includes(new URL(origin).hostname),'Only loopback candidates are allowed');
  browser=await chromium.launch({channel:'msedge',headless:true,args:['--no-proxy-server','--autoplay-policy=no-user-gesture-required']});
  if(publicBuild){
    await check('public excludes workbench even with GM URL',async f=>{
      await sandbox(f.p);await f.p.locator('main.home-view').waitFor();
      assert.equal(await f.p.locator('[data-gm-action],[data-gm-tab],#xiaoya-gm').count(),0);
      assert(!f.requests.some(url=>/\/gm\.(?:js|css)|gm-catalog\.json/.test(url)));
      const config=await f.p.evaluate(async()=>import(new URL('build-config.js',document.querySelector('script[type="module"][src]').src)).then(x=>({internal:x.INTERNAL_BUILD,channel:x.BUILD_CHANNEL})));
      assert.deepEqual(config,{internal:false,channel:'public'});return config;
    });return;
  }
  await check('workbench course search and all three native voice auditions',async f=>{
    await openWorkbench(f.p);
    assert.match(await f.p.locator('.gm-section-heading p').textContent(),/115.*84/);
    assert.equal(await f.p.locator('.gm-count').textContent(),'115 项');
    assert.equal(await f.p.locator('[data-gm-course]').count(),12,'Courses must be paged');
    await f.p.locator('[data-gm-filter]').selectOption('new');assert.equal(await f.p.locator('.gm-count').textContent(),'60 项');
    await f.p.locator('[data-gm-search]').fill('Peekaboo!');assert.equal(await f.p.locator('[data-gm-course]').count(),1);
    await f.p.locator('[data-gm-search]').fill('daily-peekaboo');await f.p.locator('[data-gm-course="daily-peekaboo"]').waitFor();
    const voices=[];for(const voice of ['aiden','ryan','pip'])voices.push(await audition(f.p,`[data-gm-course="daily-peekaboo"] [data-gm-audio$="/${voice}.mp3"]`));
    assert.deepEqual(voices,['aiden','ryan','pip'].map(voice=>`xiaoya/audio/phrases-v015/daily-peekaboo/${voice}.mp3`));
    await press(f.p,'[data-gm-tab="voices"]');await f.p.locator('.gm-audio-row').first().waitFor();
    const count=await f.p.locator('.gm-count').textContent();assert.match(count,new RegExp(`\\b${expected.audio.count} 段`));assert.equal(await f.p.locator('.gm-audio-row').count(),36);
    await f.p.locator('[data-gm-search]').fill('daily-peekaboo');assert.equal(await f.p.locator('.gm-audio-row').count(),4);
    await f.p.locator('[data-gm-filter]').selectOption('pip');assert.equal(await f.p.locator('.gm-audio-row').count(),1);
    await audition(f.p,'.gm-audio-row [data-gm-audio]');
    await f.p.keyboard.press('Escape');assert.equal(await f.p.locator('#gm-workbench[open]').count(),0);
    assert.equal(await f.p.evaluate(()=>document.activeElement?.dataset.gmAction),'open');
    return {courses:115,newPhrases:60,voices,nativeCatalogCount:count,escapeRestoresFocus:true};
  });
  await check('music sandbox settings are disposable and all controls fit narrow screens',async f=>{
    await sandbox(f.p,'gmPage=home');await openWorkbench(f.p,'music');
    const slider=f.p.locator('[data-gm-music-volume]');
    assert.equal(await slider.inputValue(),'50');
    await slider.focus();await slider.press('Home');await slider.press('PageUp');await slider.press('PageUp');
    assert.equal(await slider.inputValue(),'20');
    assert.match(await f.p.locator('[data-gm-music-saved]').textContent(),/临时测试/);
    await press(f.p,'[data-gm-action="music-preview"]');
    await f.p.waitForFunction(()=>qaGM.play.some(item=>item.url.endsWith('/garden-piano.mp3')&&item.playing));
    assert.equal((await bridge(f.p,'musicSettings')).preview,true);
    await press(f.p,'[data-gm-music-enabled]');
    assert.equal((await bridge(f.p,'musicSettings')).preview,false);
    assert(await f.p.locator('[data-gm-action="music-preview"]').isDisabled());
    const layout=await f.p.locator('#gm-workbench').evaluate(e=>({width:e.clientWidth,scroll:e.scrollWidth}));
    assert(layout.scroll<=layout.width+1);
    for(const tab of await f.p.locator('[data-gm-tab]').all()) {
      const box=await tab.boundingBox();assert(box.x>=0&&box.x+box.width<=320);
    }
    await f.p.screenshot({path:path.join(out,'music-320.png'),fullPage:true});
    await f.p.reload();await f.p.locator('main.home-view').waitFor();await openWorkbench(f.p,'music');
    assert.equal(await slider.inputValue(),'50');assert(await f.p.locator('[data-gm-music-enabled]').isChecked());
    return {temporaryVolume:20,afterReload:50,width:320,layout};
  },320);
  await check('image catalog pagination search native decode and preview focus',async f=>{
    await openWorkbench(f.p,'images');await f.p.locator('.gm-image-card').first().waitFor();
    const total=Number((await f.p.locator('.gm-count').textContent()).match(/\d+/)[0]);assert(total>100);
    assert.equal(await f.p.locator('.gm-image-card').count(),24);
    assert.deepEqual(await f.p.locator('.gm-image-card img').evaluateAll(images=>Array.from(new Set(images.map(image=>image.loading)))),['lazy']);
    const first=await f.p.locator('[data-gm-image]').first().getAttribute('data-gm-image');await press(f.p,'[data-gm-action="next"]');
    assert.notEqual(await f.p.locator('[data-gm-image]').first().getAttribute('data-gm-image'),first);
    await f.p.locator('[data-gm-search]').fill('daily-peekaboo');assert.equal(await f.p.locator('.gm-image-card').count(),1);
    await press(f.p,'.gm-image-card [data-gm-image]');await f.p.locator('#gm-picture-preview[open]').waitFor();
    const picture=await f.p.locator('[data-gm-large-picture]').evaluate(async image=>{await image.decode();return{width:image.naturalWidth,height:image.naturalHeight,url:image.currentSrc};});
    assert(picture.width>=500&&picture.height>=500);assert.match(await f.p.locator('[data-gm-picture-info]').textContent(),/px/);
    assert.match(await f.p.locator('[data-gm-picture-path]').textContent(),/daily-peekaboo/);
    await f.p.keyboard.press('Escape');assert.equal(await f.p.locator('#gm-picture-preview[open]').count(),0);assert.equal(await f.p.locator('#gm-workbench[open]').count(),1);
    assert(await f.p.evaluate(()=>Boolean(document.activeElement?.dataset.gmImage)),'Closing preview must return focus to its image');
    await f.p.keyboard.press('Escape');return {total,picture,lazyPageSize:24};
  });
  await check('catalog load failure is actionable and retry recovers',async f=>{
    await f.p.route('**/gm-catalog.json',route=>route.fulfill({status:503,contentType:'text/plain',body:'Unavailable test catalog'}));
    await openWorkbench(f.p,'images');await f.p.locator('[data-gm-action="retry-catalog"]').waitFor();
    assert.match(await f.p.locator('#gm-content').textContent(),/资源清单读取失败（503）/);
    await f.p.unroute('**/gm-catalog.json');await press(f.p,'[data-gm-action="retry-catalog"]');await f.p.locator('.gm-image-card').first().waitFor();
    return {failureStatus:503,retryRecovered:true};
  });
  await check('mobile workbench launches selected lesson and supports keyboard navigation',async f=>{
    await openWorkbench(f.p);await f.p.locator('[data-gm-search]').fill('daily-peekaboo');await f.p.locator('[data-gm-voice]').selectOption('pip');
    await f.p.locator('[data-gm-tab="courses"]').focus();await f.p.keyboard.press('End');assert.equal(await f.p.locator('[data-gm-tab="flows"]').getAttribute('aria-selected'),'true');
    await f.p.locator('#gm-content [data-gm-result]').selectOption('two');
    await f.p.keyboard.press('Escape');await openWorkbench(f.p);await press(f.p,'[data-gm-tab="courses"]');
    const geometry=await f.p.locator('#gm-workbench').evaluate(el=>({width:el.getBoundingClientRect().width,scroll:el.scrollWidth,client:el.clientWidth,viewport:innerWidth}));
    assert(geometry.width<=geometry.viewport&&geometry.scroll<=geometry.client+1,JSON.stringify(geometry));
    await press(f.p,'[data-gm-action="lesson"][data-gm-event="daily-peekaboo"][data-gm-mode="new"]');
    await f.p.locator('.gm-testbar').waitFor();await f.p.locator('main[data-event="daily-peekaboo"]').waitFor();
    assert.equal((await bridge(f.p,'inspect')).voice,'pip');
    assert.equal(await f.p.locator('.gm-testbar [data-gm-result]').inputValue(),'two','Selected simulated result must survive entering sandbox');
    await press(f.p,'[data-gm-action="advance"]');await f.p.locator('main[data-phase="request"]').waitFor();await simulate(f.p,'two');await simulate(f.p,'three');
    const toolbar=await f.p.locator('.gm-testbar').evaluate(el=>({scroll:el.scrollWidth,client:el.clientWidth}));assert(toolbar.scroll<=toolbar.client+1,JSON.stringify(toolbar));
    await press(f.p,'[data-gm-action="exit"]');await f.p.locator('main.home-view').waitFor();assert(!new URL(f.p.url()).searchParams.has('gm'));
    return {viewport:390,geometry,toolbar,selectedVoice:'pip',resultSelectionPreserved:true};
  },390);
  await check('normal development lesson retains real microphone consent flow',async f=>{
    await press(f.p,'[data-action="next-event"]');
    await f.p.locator('[data-action="story-continue"]:enabled').waitFor({timeout:45000});
    const heard=await f.p.evaluate(()=>qaGM.play.filter(x=>x.playing&&x.url.endsWith('.mp3')));
    assert(heard.length>0,'Normal lesson did not play its native audio before asking for speech');
    await press(f.p,'[data-action="story-continue"]');await f.p.locator('#parent-answer').waitFor();
    assert.equal(await f.p.locator('[data-assessment]').count(),0,'Internal build simulated a real child\'s speech outside GM');
    await press(f.p,'[data-action="close"]');return {normalAudio:heard.map(x=>x.url),consentGateRequired:true};
  });
  await check('sandbox outcomes use real feedback without recording',async f=>{
    await sandbox(f.p);
    for(const [result,status,stars]of[['one','retry',1],['two','retry',2],['silence','silence',0],['unavailable','unavailable',0],['three','matched',3]]){
      await simulate(f.p,result);assert.equal(await f.p.locator('[data-assessment]').getAttribute('data-status'),status);assert.equal(await f.p.locator('[data-assessment]').getAttribute('data-stars'),String(stars));
    }
    await f.p.locator('main[data-phase="resolved"]').waitFor();
    assert.equal(await f.p.locator('[data-action="replay"]').count(),0,'Simulation must not invent a recorded clip');
    return {outcomes:5,mode:await bridge(f.p,'inspect')};
  });
  await check('sandbox lesson reward shop planting watering reload and exit',async f=>{
    await sandbox(f.p);await simulate(f.p);await press(f.p,'[data-action="finish"]');
    await f.p.locator('.reward-view').waitFor();await press(f.p,'[data-action="garden"]');await f.p.locator('.meadow-view').waitFor();
    assert.equal(await f.p.locator('[data-shells]').textContent(),'2');assert.equal(await f.p.locator('[data-water]').textContent(),'3');
    await press(f.p,'[data-action="shop"]');await f.p.locator('.seed-shop-view').waitFor();await press(f.p,'[data-action="shop-pack"]');
    await f.p.locator('.blindbox-view[data-blindbox-phase="choose"]').waitFor();await press(f.p,'[data-mystery-bag="0"]');
    await f.p.locator('.blindbox-view[data-blindbox-phase="revealed"]').waitFor();await press(f.p,'[data-action="blindbox-plant"]');
    await f.p.locator('.meadow-view[data-tool="seed"]').waitFor();
    const field=f.p.locator('[data-meadow-field]');await field.scrollIntoViewIfNeeded();const box=await field.boundingBox();await f.p.mouse.click(box.x+box.width*.48,box.y+box.height*.7);
    await f.p.locator('[data-meadow-plant][data-waterings="0"]').waitFor();await press(f.p,'[data-action="meadow-can"]');await press(f.p,'[data-water-plant]');
    await f.p.locator('[data-meadow-plant][data-waterings="1"]').waitFor();assert.equal(await f.p.locator('[data-water]').textContent(),'2');
    await clean(f);
    const before=await bridge(f.p,'inspect');await f.p.evaluate(()=>dispatchEvent(new StorageEvent('storage',{key:'xiaoya-english:meadow:v1',newValue:'invalid-other-tab-record'})));
    assert.deepEqual(await bridge(f.p,'inspect'),before,'Other tabs\' records leaked into the sandbox');
    await f.p.reload({waitUntil:'domcontentloaded'});await bridge(f.p,'navigate','garden');await f.p.locator('.meadow-view').waitFor();
    assert.equal(await f.p.locator('[data-meadow-plant]').count(),0);assert.equal(await f.p.locator('[data-water]').textContent(),'0');
    await press(f.p,'[data-gm-action="exit"]');await f.p.locator('main.home-view').waitFor();
    return {steps:['simulate','reward','shop','open seed','plant','water','ignore storage event','reload resets','exit'],childRecordBytesUnchanged:true};
  });
  await check('workbench supply and page navigation stay inside disposable records',async f=>{
    await openWorkbench(f.p,'flows');await press(f.p,'[data-gm-action="supply"]');await f.p.locator('.seed-shop-view').waitFor();await f.p.locator('.gm-testbar').waitFor();
    assert.deepEqual((await bridge(f.p,'inspect')).wallet,{shells:12,water:11});
    for(const [page,selector]of[['garden','.meadow-view'],['home','.home-view'],['shop','.seed-shop-view'],['challenges','[data-challenge-board]'],['parent','.parent-view']]){
      await openWorkbench(f.p,'flows');await press(f.p,`[data-gm-action="navigate"][data-gm-page="${page}"]`);await f.p.locator(selector).waitFor();assert.equal((await bridge(f.p,'inspect')).page,page);
    }
    await openWorkbench(f.p,'courses');await press(f.p,'[data-gm-tab="courses"]');await f.p.locator('[data-gm-search]').fill('daily-peekaboo');
    await press(f.p,'[data-gm-action="lesson"][data-gm-event="daily-peekaboo"][data-gm-mode="review"]');await f.p.locator('main[data-event="daily-peekaboo"][data-phase="request"]').waitFor();
    assert.equal(await f.p.locator('main.event-view').getAttribute('data-practice-mode'),'review');
    await openWorkbench(f.p,'courses');await press(f.p,'[data-gm-action="lesson"][data-gm-event="daily-peekaboo"][data-gm-mode="checkup"]');await simulate(f.p);await press(f.p,'[data-action="finish"]');await f.p.locator('.parent-view').waitFor();
    return {supply:{shells:12,water:11},pages:5,reviewAndCheckupViaUI:true};
  });
  await check('review checkup and challenge preserve normal semantics',async f=>{
    await sandbox(f.p,'gmEvent=daily-peekaboo&gmMode=checkup&gmVoice=ryan');
    await f.p.locator('main[data-event="daily-peekaboo"][data-phase="request"]').waitFor();await simulate(f.p);await press(f.p,'[data-action="finish"]');await f.p.locator('.parent-view').waitFor();
    await openWorkbench(f.p,'flows');assert.equal(await f.p.locator('[data-gm-challenge] option').count(),21);await f.p.locator('[data-gm-challenge]').selectOption('challenge-1');await press(f.p,'[data-gm-action="challenge"]');
    for(let i=0;i<4;i++){await f.p.locator('main[data-challenge="challenge-1"][data-phase="request"]').waitFor();await simulate(f.p);await press(f.p,'[data-action="finish"]');}
    await f.p.locator('[data-challenge-complete="challenge-1"]').waitFor();await press(f.p,'[data-action="garden"]');await f.p.locator('.meadow-view').waitFor();
    const wallet={shells:await f.p.locator('[data-shells]').textContent(),water:await f.p.locator('[data-water]').textContent()};
    assert.deepEqual(wallet,{shells:'4',water:'6'});
    await bridge(f.p,'navigate','challenges');await press(f.p,'[data-challenge-unit="challenge-1"]');
    for(let i=0;i<4;i++){await f.p.locator('main[data-phase="request"]').waitFor();await simulate(f.p);await press(f.p,'[data-action="finish"]');}
    await bridge(f.p,'navigate','garden');
    assert.deepEqual({shells:await f.p.locator('[data-shells]').textContent(),water:await f.p.locator('[data-water]').textContent()},wallet,'Replaying a completed challenge issued its reward again');
    return {challengeSteps:4,firstReward:wallet,repeatedReward:false};
  });
}
main().catch(error=>{process.exitCode=1;report.checks.push({name:'suite setup',status:'FAIL',error:error.stack});console.error(error);}).finally(async()=>{
  await browser?.close();if(server)await new Promise(resolve=>server.close(resolve));
  report.finishedAt=new Date().toISOString();report.result=report.checks.length&&report.checks.every(x=>x.status==='PASS')?(filter?'PASS_PARTIAL':'PASS_AUTOMATED_SCOPE'):'FAIL';
  if(fs.existsSync(out))fs.writeFileSync(path.join(out,filter?'results-partial.json':'results.json'),JSON.stringify(report,null,2));
});
