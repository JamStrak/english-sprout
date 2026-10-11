// Separate Edge context: real audition playback without touching the user's tab.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'C:/Users/Jam/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),origin=process.env.TEST_URL||'http://127.0.0.1:24736/';
const local=new URL(origin).hostname==='127.0.0.1';
const output=path.join(root,'test-results',local?'audition-local':'audition-live');fs.mkdirSync(output,{recursive:true});
const catalog=JSON.parse(fs.readFileSync(path.join(root,'public/data/character-voices.json'),'utf8'));
const report={url:origin,checks:[]};let browser;
async function check(name,fn){try{const evidence=await fn();report.checks.push({name,status:'PASS',evidence});console.log('PASS',name);}catch(e){report.checks.push({name,status:'FAIL',error:e.stack});console.log('FAIL',name,e.message);}}
async function context(options={}){
  const c=await browser.newContext({viewport:{width:390,height:844},reducedMotion:'reduce',...options});c.setDefaultTimeout(15000);
  await c.addInitScript(()=>{window.qa={audio:[],played:[],errors:[]};const Native=window.Audio;window.Audio=function(...args){const a=new Native(...args);qa.audio.push(a);a.qaPlayCalls=0;a.qaLoadCalls=0;const play=a.play.bind(a),load=a.load.bind(a);a.play=(...args)=>{a.qaPlayCalls++;return play(...args);};a.load=(...args)=>{a.qaLoadCalls++;return load(...args);};a.addEventListener('playing',()=>qa.played.push({src:a.src,seconds:a.duration}));return a;};window.Audio.prototype=Native.prototype;window.addEventListener('error',e=>qa.errors.push(e.message));window.addEventListener('unhandledrejection',e=>qa.errors.push(String(e.reason)));});
  return c;
}
async function open(page){if(!await page.locator('[data-voice-audition]').count())await page.locator('[data-go="parent"]:visible').first().click();await page.locator('[data-voice-audition]').first().click();await page.locator('[data-audition-play="pogo"]').waitFor();}
async function play(page,id,lesson=catalog.lessons[0].id,part=''){
  const file=['aiden','ryan'].includes(id)?`audio/${id==='ryan'?'ryan/':''}${lesson}.mp3`:catalog.candidates.find(c=>c.id===id).samples[lesson];
  const before=await page.evaluate(()=>qa.played.length);
  await page.locator(`[data-audition-play="${id}"]${part}`).click();
  await page.waitForFunction(({before,file})=>qa.played.slice(before).some(a=>a.src.endsWith('/'+file)),{before,file},{timeout:45000});
  const result=await page.evaluate(({before,file})=>qa.played.slice(before).find(a=>a.src.endsWith('/'+file)),{before,file});
  assert.ok(result.seconds>0.3);return result;
}
(async()=>{
  browser=await chromium.launch({channel:'msedge',headless:true});const c=await context(),p=await c.newPage();
  await p.goto(origin,{waitUntil:'domcontentloaded',timeout:60000});await p.locator('#hero-start').waitFor();
  report.release=await(await c.request.get(new URL('version.json',origin).href)).json();
  await check('Parent opens the selected Pip and other sample voices without automatically speaking',async()=>{
    await open(p);assert.equal(await p.locator('[data-audition-pick]').count(),0);assert.equal(await p.locator('[data-audition-play]').count(),6);
    assert.equal(await p.locator('[data-audition-lesson]').count(),4);assert.deepEqual(await p.evaluate(()=>qa.played),[]);
    await p.screenshot({path:path.join(output,'audition-390.png')});return {candidates:4,references:2,automaticSpeech:0};
  });
  await check('Every candidate plays all four matching phrases using real MP3 files',async()=>{
    const results=[];
    for(const lesson of catalog.lessons){await p.locator(`[data-audition-lesson="${lesson.id}"]`).click();for(const candidate of catalog.candidates)results.push(await play(p,candidate.id,lesson.id));}
    assert.equal(results.length,16);assert.equal(await p.evaluate(()=>qa.audio.filter(a=>a.src).length)<=6,true);
    assert.equal(await p.evaluate(()=>qa.audio.filter(a=>!a.paused&&!a.ended).length),1);return results;
  });
  await check('Speed buttons change the playing stream immediately, keep pitch and remember the chosen pace',async()=>{
    await p.locator('[data-audition-stop]').click();const count=await p.evaluate(()=>qa.played.length);
    await p.locator('[data-audition-rate="0.75"]').click();assert.equal(await p.evaluate(()=>qa.played.length),count,'idle speed changes stay silent');
    const lesson=catalog.lessons.at(-1).id;await play(p,'pip',lesson);
    await p.waitForFunction(()=>qa.audio.some(a=>!a.paused&&a.currentTime>.12));
    const before=await p.evaluate(()=>{qa.speedTarget=qa.audio.find(a=>!a.paused&&!a.ended);const a=qa.speedTarget;return {time:a.currentTime,rate:a.playbackRate,plays:a.qaPlayCalls,loads:a.qaLoadCalls};});
    assert.equal(before.rate,.75);await p.locator('[data-audition-rate="1.15"]').click();
    const after=await p.evaluate(()=>{const a=qa.speedTarget;return {time:a.currentTime,rate:a.playbackRate,plays:a.qaPlayCalls,loads:a.qaLoadCalls,pitch:a.preservesPitch,active:!a.paused&&!a.ended};});
    assert.equal(after.rate,1.15);assert.equal(after.pitch,true);assert.equal(after.active,true);assert.ok(after.time>=before.time);
    assert.equal(after.plays,before.plays);assert.equal(after.loads,before.loads);
    await play(p,'milo',lesson);assert.equal(await p.evaluate(()=>qa.audio.find(a=>!a.paused&&!a.ended).playbackRate),1.15);
    await p.locator('[data-audition-stop]').click();await p.locator('[data-audition-rate="0.9"]').click();
    await p.locator('[data-audition-close]').click();await open(p);
    assert.equal(await p.locator('[data-audition-rate="0.9"]').getAttribute('aria-pressed'),'true');
    assert.equal(await p.evaluate(()=>localStorage.getItem('english-sprout-audition-rate-v1')),'0.9');
    return {before,after,rememberedRate:.9};
  });
  await check('Whole portrait and name play; original voices remain available and progress stays untouched',async()=>{
    await p.locator(`[data-audition-lesson="${catalog.lessons[0].id}"]`).click();
    const image=await play(p,'pogo',catalog.lessons[0].id,' .audition-avatar');
    const name=await play(p,'lulu',catalog.lessons[0].id,' .audition-card-name');
    const aiden=await play(p,'aiden'),ryan=await play(p,'ryan');
    assert.equal(await p.evaluate(()=>localStorage.getItem('english-sprout-state-v1')),null);
    assert.equal(await p.evaluate(()=>localStorage.getItem('english-sprout-voice-v1')),null);
    return {image,name,aiden,ryan};
  });
  await check('Only three voices are adopted; closing and reopening the comparison stays silent',async()=>{
    assert.match(await p.locator('.audition-adopted').innerText(),/Pip.*|已加入完整课程/);
    assert.equal(await p.locator('.audition-card .audition-availability').filter({hasText:'仅供样音对照'}).count(),3);
    await play(p,'milo');await p.locator('[data-audition-close]').click();await p.locator('.voice-audition').waitFor({state:'detached'});
    assert.equal(await p.evaluate(()=>qa.audio.filter(a=>!a.paused&&!a.ended).length),0);
    await p.reload({waitUntil:'domcontentloaded'});await p.locator('[data-voice-audition]').waitFor();await open(p);
    assert.equal(await p.locator('[data-audition-pick]').count(),0);assert.deepEqual(await p.evaluate(()=>qa.played),[]);
    return {formalVoices:['aiden','ryan','pip'],otherSampleOnly:3};
  });
  await check('320px dialog scrolls internally while close and playback state stay visible',async()=>{
    await p.setViewportSize({width:320,height:640});await p.locator('[data-audition-play="pip"]').scrollIntoViewIfNeeded();
    const geometry=await p.evaluate(()=>{const d=document.querySelector('.voice-audition'),close=d.querySelector('[data-audition-close]').getBoundingClientRect(),footer=d.querySelector('.audition-player').getBoundingClientRect();return {width:innerWidth,bodyWidth:document.body.scrollWidth,dialogWidth:d.scrollWidth,rect:d.getBoundingClientRect().width,closeTop:close.top,closeBottom:close.bottom,footerBottom:footer.bottom,height:innerHeight};});
    assert.ok(geometry.bodyWidth<=320);assert.ok(geometry.dialogWidth<=geometry.rect+1);assert.ok(geometry.closeTop>=0&&geometry.closeBottom<geometry.height);assert.ok(geometry.footerBottom<=geometry.height);
    await p.screenshot({path:path.join(output,'audition-320.png')});await p.locator('[data-audition-close]').click();return geometry;
  });
  await check('Parent entry and saved previews work after an offline page reload',async()=>{
    await p.locator('[data-go="parent"]:visible').first().click();await open(p);await p.locator('[data-audition-close]').click();
    await p.evaluate(()=>navigator.serviceWorker.ready);await p.waitForFunction(()=>navigator.serviceWorker.controller!==null);
    await p.locator('#offline-audio').click();await p.waitForFunction(()=>document.querySelector('#offline-status').textContent.includes('段声音已保存'),null,{timeout:local?40000:240000});
    await c.setOffline(true);await p.reload({waitUntil:'domcontentloaded'});await p.locator('[data-voice-audition]').waitFor();await open(p);
    const results=[];for(const candidate of catalog.candidates)results.push(await play(p,candidate.id));
    await p.locator('[data-audition-close]').click();await c.setOffline(false);return results;
  });
  await check('Keyboard phrase focus survives rendering and external navigation stops the audition',async()=>{
    await open(p);const lesson=catalog.lessons[1].id;
    await p.locator(`[data-audition-lesson="${lesson}"]`).focus();await p.keyboard.press('Enter');
    assert.equal(await p.evaluate(()=>document.activeElement.dataset.auditionLesson),lesson);
    await play(p,'milo',lesson);
    await p.evaluate(()=>window.dispatchEvent(new StorageEvent('storage',{key:'english-sprout-voice-v1'})));
    assert.equal(await p.locator('.audition-player').getAttribute('data-audition-state'),'idle');
    assert.equal(await p.evaluate(()=>qa.audio.filter(a=>!a.paused&&!a.ended).length),0);
    await play(p,'pogo',lesson);await p.evaluate(()=>location.hash='home');
    await p.locator('.voice-audition').waitFor({state:'detached'});
    assert.equal(await p.evaluate(()=>qa.audio.filter(a=>!a.paused&&!a.ended).length),0);
    return {keyboardFocus:lesson,storageState:'idle',navigationClosed:true};
  });
  await check('No uncaught errors or accidental changes to learning and course voice',async()=>{
    const result=await p.evaluate(()=>({errors:qa.errors,learning:localStorage.getItem('english-sprout-state-v1'),voice:localStorage.getItem('english-sprout-voice-v1')}));assert.deepEqual(result,{errors:[],learning:null,voice:null});return result;
  });await c.close();
  if(local){
    const failedContext=await context({serviceWorkers:'block'}),fp=await failedContext.newPage();
    await check('A failed audition shows a retry state and recovers on the next click',async()=>{
      await fp.route('**/audio/characters/pogo/family-07.mp3',r=>r.fulfill({status:503,body:'Audio unavailable'}));
      await fp.goto(origin,{waitUntil:'domcontentloaded'});await fp.locator('#hero-start').waitFor();await open(fp);
      await fp.locator('[data-audition-play="pogo"]').click();await fp.locator('.audition-player[data-audition-state="error"]').waitFor();
      await fp.unroute('**/audio/characters/pogo/family-07.mp3');const recovered=await play(fp,'pogo');await fp.locator('[data-audition-stop]').click();
      assert.equal(await fp.locator('.audition-player').getAttribute('data-audition-state'),'idle');return recovered;
    });await failedContext.close();
  }
  report.passed=report.checks.filter(c=>c.status==='PASS').length;report.failed=report.checks.filter(c=>c.status==='FAIL').length;
  fs.writeFileSync(path.join(output,'results.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({passed:report.passed,failed:report.failed,release:report.release}));process.exitCode=report.failed?1:0;
  await browser.close();
})().catch(async e=>{console.error(e);if(browser)await browser.close();process.exitCode=1;});
