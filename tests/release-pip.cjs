// Focused checks against the deployed site; uses a fresh isolated browser profile.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'C:/Users/Jam/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),origin=process.env.TEST_URL||'https://jamstrak.github.io/english-sprout/';
const output=path.join(root,'test-results/live-pip');fs.mkdirSync(output,{recursive:true});
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try{
  const c=await browser.newContext({viewport:{width:390,height:844},reducedMotion:'reduce'}),p=await c.newPage();p.setDefaultTimeout(60000);const errors=[];p.on('pageerror',error=>errors.push(error.message));
  await c.addInitScript(()=>{window.qa={audio:[],plays:[],errors:[]};const Native=window.Audio;window.Audio=function(...args){const a=new Native(...args);qa.audio.push(a);a.addEventListener('playing',()=>qa.plays.push({src:a.src,rate:a.playbackRate,seconds:a.duration}));return a;};window.Audio.prototype=Native.prototype;window.addEventListener('error',e=>qa.errors.push(e.message));window.addEventListener('unhandledrejection',e=>qa.errors.push(String(e.reason)));});
  const version=await(await c.request.get(new URL('version.json',origin).href)).json();assert.equal(version.version,'1.3.0');
  if(process.env.EXPECTED_BUILD)assert.equal(version.build,process.env.EXPECTED_BUILD);
  const liveManifest=await(await c.request.get(new URL('audio/pip-manifest.json',origin).href)).json();
  assert.deepEqual(liveManifest,JSON.parse(fs.readFileSync(path.join(root,'public/audio/pip-manifest.json'),'utf8')));
  await p.goto(origin,{waitUntil:'domcontentloaded'});await p.locator('#hero-start').waitFor();
  assert.deepEqual(await p.locator('[data-voice]').evaluateAll(nodes=>nodes.map(n=>n.dataset.voice)),['aiden','ryan','pip']);
  const played=[];
  async function play(selector,suffix,rate=1){const n=await p.evaluate(()=>qa.plays.length);await p.locator(selector).click();await p.waitForFunction(({n,suffix,rate})=>qa.plays.slice(n).some(x=>x.src.endsWith(suffix)&&x.rate===rate),{n,suffix,rate});const event=await p.evaluate(({n,suffix,rate})=>qa.plays.slice(n).find(x=>x.src.endsWith(suffix)&&x.rate===rate),{n,suffix,rate});assert.ok(event.seconds>.3);played.push(event);return event;}
  await play('[data-voice="aiden"]','/audio/hello-01.mp3');await play('[data-voice="ryan"]','/audio/ryan/hello-01.mp3');await play('[data-voice="pip"]','/audio/characters/pip/hello-01.mp3');
  await p.locator('[data-course-rate="0.75"]').click();await play('#preview-audio','/audio/characters/pip/hello-01.mp3',.75);
  await p.locator('[data-go="library"]:visible').first().click();
  for(const id of ['needs-01','meals-04','care-08','outside-05','kindness-10']){
   await p.locator(`[data-preview="${id}"]`).click();await play('.listen-buttons [data-listen="normal"]',`/audio/characters/pip/${id}.mp3`,.75);await p.locator('#exit-session').click();
  }
  await p.locator('[data-go="home"]:visible').first().click();await p.locator('[data-course-rate="1"]').click();
  await p.reload({waitUntil:'domcontentloaded'});await p.locator('#hero-start').waitFor();assert.equal(await p.locator('[data-voice="pip"]').getAttribute('aria-pressed'),'true');
  await play('#preview-audio','/audio/characters/pip/hello-01.mp3');
  await p.evaluate(()=>navigator.serviceWorker.ready);await p.waitForFunction(()=>navigator.serviceWorker.controller!==null);
  await p.waitForFunction(async()=>Boolean(await(await caches.open('english-sprout-audio-v5')).match(new URL('./audio/characters/pip/hello-01.mp3',document.baseURI).href,{ignoreVary:true})));
  await c.setOffline(true);await p.reload({waitUntil:'domcontentloaded'});await p.locator('#hero-start').waitFor();await play('#preview-audio','/audio/characters/pip/hello-01.mp3');
  assert.equal(await p.evaluate(()=>localStorage.getItem('english-sprout-state-v1')),null);assert.deepEqual(await p.evaluate(()=>qa.errors),[]);assert.deepEqual(errors,[]);
  await p.screenshot({path:path.join(output,'home-pip-390.png'),fullPage:true});
  const report={url:origin,version,manifestClips:liveManifest.clips.length,played,offlineReload:true,learningUnchanged:true,errors};fs.writeFileSync(path.join(output,'results.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
