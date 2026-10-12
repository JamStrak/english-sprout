/* Integration QA. Uses real Edge audio decoding and fake browser microphone input. */
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/Jam/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const origin = process.env.TEST_URL || 'http://127.0.0.1:24736';
const localTarget = ['localhost','127.0.0.1','[::1]'].includes(new URL(origin).hostname);
// The published CDN needs time to download the course and audition clips.
const navigationTimeout = Number(process.env.NAVIGATION_TIMEOUT_MS || (localTarget ? 8000 : 30000));
const offlineTimeout = Number(process.env.OFFLINE_TIMEOUT_MS || (localTarget ? 30000 : 180000));
for(const timeout of [navigationTimeout,offlineTimeout])if(!Number.isInteger(timeout)||timeout<1)throw new Error('Network timeout budgets must be positive integer milliseconds.');
// Local and published QA have separate screenshots, backups and reports by default.
const reportName = process.env.REPORT_NAME || (localTarget ? 'local' : 'live');
if(!/^[A-Za-z0-9_-]+$/.test(reportName))throw new Error('REPORT_NAME must contain only letters, digits, underscores or hyphens.');
if(!localTarget&&reportName==='local')throw new Error('Use a non-local REPORT_NAME for a published site so local evidence is preserved.');
const output = process.env.RESULT_DIR ? path.resolve(root,process.env.RESULT_DIR) : path.join(root,'test-results',reportName);
const summaryPath = path.join(root,'docs',reportName==='local'?'UI_QA.md':`UI_QA_${reportName}.md`);
const key = 'english-sprout-state-v1';
const curriculum = JSON.parse(fs.readFileSync(path.join(root, 'public/data/curriculum.json'), 'utf8'));
const courseVoices=['aiden','ryan','pip'];
const courseAudioFiles=curriculum.lessons.flatMap(l=>courseVoices.map(v=>`audio/${v==='pip'?'characters/pip/':v==='ryan'?'ryan/':''}${l.id}.mp3`));
const englishAudioCount = courseAudioFiles.length;
const voiceCandidates = JSON.parse(fs.readFileSync(path.join(root,'public/data/character-voices.json'),'utf8'));
const auditionAudioCount = new Set(voiceCandidates.candidates.flatMap(candidate=>Object.values(candidate.samples)).filter(file=>!courseAudioFiles.includes(file))).size;
const totalAudioCount = englishAudioCount + 11 + auditionAudioCount;
const audioCache = fs.readFileSync(path.join(root, 'src/media.js'), 'utf8').match(/english-sprout-audio-v[\w.-]+/)[0];
const reportDate = new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai'}).format(new Date());
const checks = [];
fs.mkdirSync(output, {recursive:true});
let browser;

async function test(name, fn) {
  try { const evidence = await fn(); checks.push({name,status:'PASS',evidence:evidence||null}); console.log('PASS',name); }
  catch(e) { checks.push({name,status:'FAIL',error:e.stack}); console.log('FAIL',name,e.message); }
}
async function context(options={}) {
  const c = await browser.newContext({viewport:{width:1440,height:1000},timezoneId:'Asia/Shanghai',permissions:['microphone'],...options});
  c.setDefaultNavigationTimeout(navigationTimeout);
  await c.addInitScript(() => {
    window.__qaAudio=[];window.__qaStreams=[];window.__qaErrors=[];window.__qaPlay=[];window.__qaAudioTimeline=[];
    if(navigator.storage?.persist){const persist=navigator.storage.persist.bind(navigator.storage);navigator.storage.persist=async()=>{window.__qaPersist={started:true,settled:false};try{const value=await persist();window.__qaPersist={started:true,settled:true,value};return value;}catch(error){window.__qaPersist={started:true,settled:true,error:error.message};throw error;}};}
    const NativeAudio=window.Audio;
    window.Audio=function(...args){const a=new NativeAudio(...args);window.__qaAudio.push(a);a.qaPlayCalls=0;a.qaLoadCalls=0;const play=a.play.bind(a),load=a.load.bind(a);a.play=(...args)=>{a.qaPlayCalls++;return play(...args);};a.load=(...args)=>{a.qaLoadCalls++;return load(...args);};a.addEventListener('playing',()=>window.__qaPlay.push({src:a.src,rate:a.playbackRate,duration:a.duration}));for(const type of ['playing','pause','ended'])a.addEventListener(type,()=>window.__qaAudioTimeline.push({type,src:a.src,ended:a.ended}));return a;};
    window.Audio.prototype=NativeAudio.prototype;
    if(navigator.mediaDevices?.getUserMedia){const original=navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);navigator.mediaDevices.getUserMedia=async(...args)=>{const s=await original(...args);window.__qaStreams.push(s);return s;};}
    window.addEventListener('error',e=>window.__qaErrors.push(e.message));
    window.addEventListener('unhandledrejection',e=>window.__qaErrors.push(String(e.reason)));
  });
  return c;
}
async function newPage(c,date='2026-10-08T10:00:00+08:00') {
  const p=await c.newPage();p.setDefaultTimeout(8000);p.setDefaultNavigationTimeout(navigationTimeout);await p.clock.setFixedTime(new Date(date));
  await p.goto(origin,{waitUntil:'networkidle'});await p.locator('#hero-start').waitFor();return p;
}
async function closeSound(p){if(await p.locator('.sound-dialog[open]').count())await p.locator('[data-close-sound]').click();}
async function sound(p){if(!await p.locator('[data-voice]:visible').count())await p.locator('[data-sound-settings]').first().click();}
async function go(p,view){await closeSound(p);await p.locator(`[data-go="${view}"]:visible`).first().click();}
async function parent(p,panel){await go(p,'parent');if(await p.locator('[data-parent-back]:visible').count())await p.locator('[data-parent-back]').click();if(panel==='install'&&!await p.locator('[data-parent-panel="install"]:visible').count())await p.locator('[data-parent-panel="offline"]').click();await p.locator(`[data-parent-panel="${panel}"]`).click();}
async function openLesson(p,id){await go(p,'library');if(!await p.locator('#phrase-search').isVisible())await p.locator('#search-open').click();await p.locator('#phrase-search').fill(curriculum.lessons.find(l=>l.id===id).english);await p.locator(`[data-preview="${id}"]`).click();}
async function setState(p,value){await p.evaluate(({key,value})=>localStorage.setItem(key,JSON.stringify(value)),{key,value});await p.reload();}
async function setRate(p,value){if(!await p.locator('[data-voice]:visible,[data-sound-settings]:visible').count())await go(p,'home');await sound(p);await p.locator(`[data-course-rate="${value}"]`).click();await closeSound(p);}
// Edge's fake microphone can take over a second to deliver its first audio packet;
// allow cold capture to settle while retaining the real playback duration assertion.
async function record(p){await p.locator('#record').click();await p.waitForFunction(()=>document.querySelector('#record').textContent.includes('停止录音'));await p.waitForTimeout(4000);await p.locator('#record').click();await p.waitForFunction(()=>!document.querySelector('#replay-record').disabled);return audio(p,'#replay-record');}

async function overflow(p,label){
  const r=await p.evaluate(()=>({viewport:innerWidth,body:document.body.scrollWidth,html:document.documentElement.scrollWidth,offenders:[...document.querySelectorAll('body *')].filter(e=>{const r=e.getBoundingClientRect();return r.width>0&&(r.left < -1 || r.right>innerWidth+1)&&getComputedStyle(e).position!=='fixed'&&e.closest('.theme-filters')===null;}).slice(0,8).map(e=>({tag:e.tagName,cls:e.className,rect:{left:e.getBoundingClientRect().left,right:e.getBoundingClientRect().right}}))}));
  assert.ok(Math.max(r.body,r.html)<=r.viewport+1,`${label}: ${JSON.stringify(r)}`);return r;
}
async function state(p){return p.evaluate(k=>JSON.parse(localStorage.getItem(k)),key);}
async function quiz(p,lesson,wrong=false){
  await p.locator('[data-step="choose"]').click();
  if(wrong){await p.locator(`[data-choice="${(lesson.answerIndex+1)%3}"]`).click();assert.match(await p.locator('#quiz-feedback').innerText(),/再听一次/);assert.equal(await p.locator('#quiz-next').isVisible(),false);}
  await p.locator(`[data-choice="${lesson.answerIndex}"]`).click();assert.match(await p.locator('#quiz-feedback').innerText(),/选对/);await p.locator('#quiz-next').click();
}
async function audio(p,selector,rate=1){
  if((selector.startsWith('[data-voice=')||selector==='[data-listen="slow"]'))await sound(p);else await closeSound(p);
  const before=await p.evaluate(()=>window.__qaPlay.length);
  const kind=selector==='#replay-record'?'recording':selector==='#guide-audio'?'guide':'english';
  const lesson=kind==='english'&&await p.locator('.practice-main').count()?await p.locator('.practice-main').getAttribute('data-lesson-id'):null;
  const voice=selector.match(/^\[data-voice="(aiden|ryan|pip)"\]$/)?.[1]||await p.evaluate(()=>localStorage.getItem('english-sprout-voice-v1')||'aiden');
  await p.locator(selector).first().click();
  const args={before,rate,kind,lesson,voice};
  await p.waitForFunction(({before,rate,kind,lesson,voice})=>window.__qaPlay.slice(before).some(event=>event.rate===rate&&(kind==='recording'?event.src.startsWith('blob:'):kind==='guide'?event.src.includes('/audio/ui/'):event.src.includes('/audio/')&&!event.src.includes('/audio/ui/')&&(!lesson||event.src.endsWith(`/audio/${voice==='pip'?'characters/pip/':voice==='ryan'?'ryan/':''}${lesson}.mp3`)))),args,{timeout:45000});
  const event=await p.evaluate(({before,rate,kind,lesson,voice})=>window.__qaPlay.slice(before).find(event=>event.rate===rate&&(kind==='recording'?event.src.startsWith('blob:'):kind==='guide'?event.src.includes('/audio/ui/'):event.src.includes('/audio/')&&!event.src.includes('/audio/ui/')&&(!lesson||event.src.endsWith(`/audio/${voice==='pip'?'characters/pip/':voice==='ryan'?'ryan/':''}${lesson}.mp3`)))),args);
  assert.equal(event.rate,rate);assert.ok(event.duration>0.3);await closeSound(p);return event;
}
async function waitSW(p){await p.evaluate(()=>navigator.serviceWorker.ready);await p.waitForFunction(()=>navigator.serviceWorker.controller!==null);}
async function waitOfflineSaved(p){
  const start=Date.now();
  await p.waitForFunction(()=>document.querySelector('#offline-status')?.textContent.includes('段声音已保存'),null,{timeout:offlineTimeout});
  return{elapsedMs:Date.now()-start};
}

(async()=>{
  browser=await chromium.launch({channel:'msedge',headless:true,args:['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream']});
  const learning=await import(require('node:url').pathToFileURL(path.join(root,'src/learning.js')).href);
  const garden=await import(require('node:url').pathToFileURL(path.join(root,'src/garden.js')).href);
  let mature=learning.createState('2026-10-01');
  for(let i=0;i<3;i++)mature=learning.recordResult(mature,curriculum.lessons[i].id,'good',`2026-10-0${i+1}`,{isNew:true});
  const c=await context(),p=await newPage(c);
  await test('Fresh home offers one focused learning action and no autoplay',async()=>{
    assert.equal(await p.locator('.focus-home').getAttribute('data-next-kind'),'learn');assert.equal(await p.locator('#hero-start').count(),1);
    assert.equal(await p.locator('#start-today,#start-review').count(),0);assert.deepEqual(await p.evaluate(()=>window.__qaPlay),[]);
    await p.screenshot({path:path.join(output,'home-desktop.png')});return overflow(p,'home');
  });
  await test('New lesson and whole illustration play real English without microphone or automatic Chinese guidance',async()=>{
    await p.locator('#hero-start').click();assert.equal(await p.locator('.practice-english').innerText(),curriculum.lessons[0].english);
    const picture=await audio(p,'.scene-picture'),icon=await audio(p,'.scene-picture .picture-play');assert.equal(picture.src,icon.src);
    assert.deepEqual(await p.evaluate(()=>window.__qaPlay.filter(e=>e.src.includes('/audio/ui/'))),[]);assert.equal(await state(p),null);return picture;
  });
  await test('Deliberate guidance, normal playback and temporary slow playback remain available',async()=>({guide:await audio(p,'#guide-audio'),normal:await audio(p,'[data-listen="normal"]'),slow:await audio(p,'[data-listen="slow"]',.8)}));
  await test('Wrong image answer retries gently and does not save mastery; correct answer reaches speaking',async()=>{
    await quiz(p,curriculum.lessons[0],true);assert.equal(await state(p),null);assert.equal(await p.locator('#replay-record').isDisabled(),true);
  });
  await test('Real MediaRecorder records and replays locally, with tracks released after stopping',async()=>{
    const event=await record(p);assert.match(event.src,/^blob:/);assert.equal(await p.evaluate(()=>window.__qaStreams.flatMap(s=>s.getTracks()).filter(t=>t.readyState==='live').length),0);return event;
  });
  await test('Three direct voice buttons preserve recording and progress; opening settings is silent',async()=>{
    const before=await state(p),recorded=await audio(p,'#replay-record'),played=await p.evaluate(()=>window.__qaPlay.length);
    await sound(p);assert.equal(await p.locator('[data-voice]').count(),3);assert.equal(await p.locator('[data-course-rate]').count(),4);assert.equal(await p.locator('select[data-voice]').count(),0);assert.equal(await p.evaluate(()=>window.__qaPlay.length),played);
    const events=[];for(const voice of courseVoices)events.push(await audio(p,`[data-voice="${voice}"]`));
    assert.match(events[1].src,/\/audio\/ryan\/hello-01\.mp3$/);assert.match(events[2].src,/\/audio\/characters\/pip\/hello-01\.mp3$/);
    assert.equal((await audio(p,'#replay-record')).src,recorded.src);assert.deepEqual(await state(p),before);return events;
  });
  await test('Rate changes affect the active player immediately without restart; recording and guidance remain 1x',async()=>{
    const before=await state(p);await sound(p);await p.locator('[data-voice="pip"]').click();
    await p.waitForFunction(()=>window.__qaAudio.some(a=>!a.paused&&!a.ended&&a.currentTime>.1));
    const initial=await p.evaluate(()=>{window.__target=window.__qaAudio.find(a=>!a.paused&&!a.ended);const a=window.__target;return{time:a.currentTime,plays:a.qaPlayCalls,loads:a.qaLoadCalls};});
    await p.locator('[data-course-rate="0.75"]').click();
    const after=await p.evaluate(()=>{const a=window.__target;return{time:a.currentTime,rate:a.playbackRate,pitch:a.preservesPitch,plays:a.qaPlayCalls,loads:a.qaLoadCalls};});
    assert.equal(after.rate,.75);assert.equal(after.pitch,true);assert.ok(after.time>=initial.time);assert.equal(after.plays,initial.plays);assert.equal(after.loads,initial.loads);
    await closeSound(p);await audio(p,'[data-listen="normal"]',.75);await audio(p,'#guide-audio');await audio(p,'#replay-record');await setRate(p,1.15);await audio(p,'[data-listen="normal"]',1.15);await setRate(p,1);
    assert.deepEqual(await state(p),before);return{initial,after};
  });
  let backup;
  await test('A first lesson saves one next-day card and routes completed daily work to the garden',async()=>{
    await p.locator('[data-rating="good"]').click();await p.locator('.completion').waitFor();const s=await state(p);assert.equal(Object.keys(s.cards).length,1);assert.equal(s.cards['hello-01'].due,'2026-10-09');
    await go(p,'home');assert.equal(await p.locator('.focus-home').getAttribute('data-next-kind'),'garden');await p.reload();await p.locator('#hero-start').waitFor();assert.deepEqual(await state(p),s);
  });
  await test('Library theme and sentence pagination plus global search expose all 120 lessons',async()=>{
    await go(p,'library');const themes=[];for(let page=0;page<2;page++){themes.push(...await p.locator('[data-theme-open]').evaluateAll(items=>items.map(e=>e.dataset.themeOpen)));if(page===0)await p.locator('[data-page-delta="1"]').click();}
    assert.deepEqual(new Set(themes),new Set(curriculum.themes.map(t=>t.id)));
    await p.locator('[data-theme-open]').first().click();assert.ok(await p.locator('[data-preview]').count()<=4);const ids=[];
    for(let page=0;page<3;page++){ids.push(...await p.locator('[data-preview]').evaluateAll(items=>items.map(e=>e.dataset.preview)));if(page<2)await p.locator('[data-page-delta="1"]').click();}assert.equal(new Set(ids).size,10);
    await p.locator('#search-open').click();await p.locator('#phrase-search').fill('牛奶');assert.equal(await p.locator('[data-preview]').count(),1);assert.match(await p.locator('[data-preview]').innerText(),/milk/);
    await p.locator('#phrase-search').fill('xyz-no-match');assert.equal(await p.locator('[data-preview]').count(),0);assert.equal(await p.locator('.empty-state').isVisible(),true);
  });
  await test('Free practice changes neither learning nor rewards and stops audio on completion',async()=>{
    const before=await state(p);await openLesson(p,'needs-01');await quiz(p,curriculum.lessons.find(l=>l.id==='needs-01'));await audio(p,'[data-listen="slow"]',.8);await p.locator('[data-rating="good"]').click();await p.locator('.phrase-grid').waitFor();assert.deepEqual(await state(p),before);assert.equal(await p.evaluate(()=>window.__qaAudio.filter(a=>!a.paused&&!a.ended).length),0);
  });
  await test('Exiting a speaking card stops microphone capture and playback immediately',async()=>{
    await openLesson(p,'hello-01');await quiz(p,curriculum.lessons[0]);await p.locator('#record').click();await p.waitForFunction(()=>document.querySelector('#record').textContent.includes('停止录音'));await p.locator('#exit-session').click();assert.equal(await p.evaluate(()=>window.__qaStreams.flatMap(s=>s.getTracks()).filter(t=>t.readyState==='live').length),0);assert.equal(await p.evaluate(()=>window.__qaAudio.filter(a=>!a.paused&&!a.ended).length),0);
  });
  await test('Parent habit settings persist and export a valid transferable backup',async()=>{
    await parent(p,'habits');await p.locator('#nickname').fill('小小测试员');await p.locator('#daily-reviews').selectOption('3');await p.locator('#save-settings').click();
    await parent(p,'backup');const d=p.waitForEvent('download');await p.locator('#export-progress').click();await(await d).saveAs(path.join(output,'qa-backup.json'));backup=JSON.parse(fs.readFileSync(path.join(output,'qa-backup.json'),'utf8'));assert.equal(backup.app,'english-sprout');assert.equal(backup.state.settings.nickname,'小小测试员');assert.equal(backup.state.settings.dailyReviews,3);
  });
  await test('Voice and speed preferences survive reload and Pip covers all twelve themes',async()=>{
    const before=await state(p);await parent(p,'voice');await audio(p,'[data-voice="pip"]');await setRate(p,.9);await p.reload();await p.locator('[data-go="home"]').first().waitFor();assert.equal(await p.evaluate(()=>localStorage.getItem('english-sprout-voice-v1')),'pip');
    const clips=[];for(const theme of curriculum.themes){const l=curriculum.lessons.find(l=>l.theme===theme.id);await openLesson(p,l.id);const e=await audio(p,'[data-listen="normal"]',.9);assert.ok(e.src.endsWith(`/characters/pip/${l.id}.mp3`));clips.push(l.id);await p.locator('#exit-session').click();}await setRate(p,1);assert.deepEqual(await state(p),before);return clips;
  });
  await test('Install page QR decodes as an image and copy action uses the official URL',async()=>{
    await parent(p,'install');assert.equal(await p.locator('.phone-share img').evaluate(i=>i.complete&&i.naturalWidth>0),true);await p.evaluate(()=>{navigator.clipboard.writeText=async text=>window.__copied=text;});await p.locator('#copy-link').click();assert.equal(await p.evaluate(()=>window.__copied),'https://jamstrak.github.io/english-sprout/');
  });
  await test('Invalid import and cancelled valid import preserve existing progress',async()=>{
    await parent(p,'backup');const before=await state(p);await p.locator('#import-file').setInputFiles({name:'bad.json',mimeType:'application/json',buffer:Buffer.from('{"app":"wrong"}')});await p.waitForFunction(()=>document.querySelector('#import-status').textContent.includes('没有导入'));assert.deepEqual(await state(p),before);
    await p.locator('#import-file').setInputFiles({name:'good.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(backup))});await p.locator('dialog[open]').waitFor();assert.match(await p.locator('dialog[open]').innerText(),/不会合并/);await p.locator('[data-cancel]').click();assert.deepEqual(await state(p),before);
  });
  for(const dailyReviews of [1,10])await test(`Confirmed import retains ${dailyReviews} review limit and 16-character nickname after edits`,async()=>{
    await parent(p,'backup');const nickname='小芽'.repeat(8),value={...backup,state:{...backup.state,settings:{nickname,dailyReviews}}};await p.locator('#import-file').setInputFiles({name:'settings.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(value))});await p.locator('[data-confirm]').click();await parent(p,'habits');assert.equal(await p.locator('#nickname').inputValue(),nickname);assert.equal(await p.locator('#daily-reviews').inputValue(),String(dailyReviews));const edited='🌱'.repeat(15)+'芽';await p.locator('#nickname').fill(edited);await p.locator('#save-settings').click();await p.reload();await parent(p,'habits');assert.deepEqual((await state(p)).settings,{nickname:edited,dailyReviews});
  });
  await test('Reset requires confirmation and an exported backup restores the saved lesson',async()=>{
    await parent(p,'backup');const before=await state(p);await p.locator('#reset-progress').click();await p.locator('[data-cancel]').click();assert.deepEqual(await state(p),before);await p.locator('#reset-progress').click();await p.locator('[data-confirm]').click();await p.locator('#hero-start').waitFor();assert.equal(Object.keys((await state(p)).cards).length,0);await parent(p,'backup');await p.locator('#import-file').setInputFiles({name:'backup.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(backup))});await p.locator('[data-confirm]').click();assert.equal(Object.keys((await state(p)).cards).length,1);
  });
  await test('Next local day prioritizes silent recall, then offers exactly one new sentence',async()=>{
    await p.clock.setFixedTime(new Date('2026-10-09T10:00:00+08:00'));await go(p,'home');assert.equal(await p.locator('.focus-home').getAttribute('data-next-kind'),'review');const before=await p.evaluate(()=>window.__qaPlay.length);await p.locator('#hero-start').click();assert.equal(await p.locator('.practice-english').count(),0);assert.equal(await p.evaluate(()=>window.__qaPlay.length),before);await p.locator('[data-step="speak"]').click();const recorded=await record(p);await p.locator('#reveal').click();assert.equal(await p.locator('.practice-english').innerText(),curriculum.lessons[0].english);assert.equal((await audio(p,'#replay-record')).src,recorded.src);await p.locator('[data-rating="help"]').click();await p.locator('.completion').waitFor();assert.equal((await state(p)).days['2026-10-09'].newDone,false);await p.locator('#completion-next').click();assert.equal(await p.locator('.practice-main').getAttribute('data-lesson-id'),'hello-02');await quiz(p,curriculum.lessons[1]);await p.locator('[data-rating="good"]').click();const s=await state(p);assert.equal(s.days['2026-10-09'].results.length,2);assert.equal(s.cards['hello-01'].due,'2026-10-10');assert.equal(s.cards['hello-02'].due,'2026-10-10');
  });
  await test(`All ${totalAudioCount} MP3 files cache; three voices, guidance and Range/Vary work after offline reload`,async()=>{
    await parent(p,'offline');await waitSW(p);await p.locator('#offline-audio').click();const download=await waitOfflineSaved(p);const count=await p.evaluate(async n=>(await(await caches.open(n)).keys()).filter(r=>r.url.endsWith('.mp3')).length,audioCache);assert.equal(count,totalAudioCount);
    await p.evaluate(async n=>{const cache=await caches.open(n),url=new URL('./audio/kindness-10.mp3',document.baseURI).href,res=await cache.match(url,{ignoreVary:true});await cache.delete(url,{ignoreVary:true});await cache.put(new Request(url,{headers:{'Accept-Encoding':'qa-variant'}}),new Response(await res.arrayBuffer(),{headers:{'Content-Type':'audio/mpeg','Vary':'Accept-Encoding'}}));},audioCache);
    await c.setOffline(true);await p.reload({waitUntil:'domcontentloaded'});await openLesson(p,'kindness-10');for(const voice of courseVoices)await audio(p,`[data-voice="${voice}"]`);await audio(p,'#guide-audio');await p.locator('#exit-session').click();const range=await p.evaluate(async()=>{const r=await fetch('./audio/kindness-10.mp3',{headers:{Range:'bytes=0-127'}});return{status:r.status,range:r.headers.get('Content-Range'),bytes:(await r.arrayBuffer()).byteLength};});assert.equal(range.status,206);assert.equal(range.bytes,128);assert.match(range.range,/^bytes 0-127\//);await c.setOffline(false);return{count,download,range};
  });
  await test('The main user journey has no uncaught JavaScript errors',async()=>assert.deepEqual(await p.evaluate(()=>window.__qaErrors),[]));await c.close();

  const rc=await context(),rp=await newPage(rc);
  await test('Home priority and review completion guide a child into learning without first revealing answers',async()=>{
    await setState(rp,mature);assert.equal(await rp.locator('.focus-home').getAttribute('data-next-kind'),'review');await rp.locator('#hero-start').click();assert.equal(await rp.locator('.practice-main').getAttribute('data-lesson-id'),'hello-01');assert.deepEqual(await rp.evaluate(()=>window.__qaPlay),[]);
    for(const l of curriculum.lessons.slice(0,3)){assert.equal(await rp.locator('.practice-main').getAttribute('data-lesson-id'),l.id);assert.equal(await rp.locator('.practice-english').count(),0);await rp.locator('[data-step="speak"]').click();await rp.locator('[data-rating="good"]').click();}
    await rp.locator('.completion').waitFor();const after=await state(rp);assert.equal(Object.keys(after.cards).length,3);assert.equal(after.days['2026-10-08'].reviewed.length,3);assert.equal(after.days['2026-10-08'].newDone,false);await rp.locator('#completion-next').click();assert.equal(await rp.locator('.practice-main').getAttribute('data-lesson-id'),'hello-04');await quiz(rp,curriculum.lessons[3]);await rp.locator('[data-rating="good"]').click();await go(rp,'home');assert.equal(await rp.locator('.focus-home').getAttribute('data-next-kind'),'garden');
  });await rc.close();
  const qc=await context(),qp=await newPage(qc);
  await test('Weekly checkup hides answers, remembers the first choice, and keeps prompted speech separate from independent recall',async()=>{
    let ready=mature;for(const id of Object.keys(ready.cards))ready=learning.recordResult(ready,id,'good','2026-10-06');ready=learning.recordResult(ready,'hello-04','good','2026-10-08',{isNew:true});await setState(qp,ready);assert.equal(await qp.locator('.focus-home').getAttribute('data-next-kind'),'checkup');await qp.locator('#hero-start').click();assert.equal(await qp.locator('.practice-english,.practice-chinese,.parent-prompt').count(),0);assert.deepEqual(await qp.evaluate(()=>window.__qaPlay),[]);
    for(let i=0;i<3;i++){const l=curriculum.lessons[i];assert.equal(await qp.locator('.practice-main').getAttribute('data-lesson-id'),l.id);if(i===1){await audio(qp,'.scene-picture');assert.equal(await qp.locator('[data-rating="good"]').isDisabled(),true);await qp.locator('[data-rating="help"]').click();}else await qp.locator(`[data-rating="${i===0?'good':'again'}"]`).click();if(i===0)await qp.locator(`[data-choice="${(l.answerIndex+1)%3}"]`).click();await qp.locator(`[data-choice="${l.answerIndex}"]`).click();await qp.locator('#quiz-next').click();}
    await qp.locator('.completion').waitFor();const after=await state(qp);assert.deepEqual(after.checkups['2026-10-08'],curriculum.lessons.slice(0,3).map((l,i)=>({lessonId:l.id,meaning:i!==0,spoken:['good','help','again'][i]})));assert.deepEqual(after.days,ready.days);for(const id of Object.keys(ready.cards))assert.deepEqual(after.cards[id],ready.cards[id]);
  });await qc.close();
  const fc=await context(),fp=await newPage(fc);
  await test('After all 120 lessons, the main action remains review, then checkup, then garden',async()=>{
    let value=learning.createState('2026-06-09');for(let i=0;i<120;i++)value=learning.recordResult(value,curriculum.lessons[i].id,'good',learning.addDays('2026-06-09',i),{isNew:true});await setState(fp,value);assert.equal(await fp.locator('.focus-home').getAttribute('data-next-kind'),'review');for(const id of learning.getDailyPlan(value,curriculum.lessons,'2026-10-08').dueIds)value=learning.recordResult(value,id,'good','2026-10-08');await setState(fp,value);assert.equal(await fp.locator('.focus-home').getAttribute('data-next-kind'),'checkup');value=learning.recordCheckup(value,curriculum.lessons,learning.getCheckupPlan(value,curriculum.lessons,'2026-10-08').ids.map(lessonId=>({lessonId,meaning:true,spoken:'good'})),'2026-10-08');await setState(fp,value);assert.equal(await fp.locator('.focus-home').getAttribute('data-next-kind'),'garden');await fp.locator('#hero-start').click();await fp.locator('.focus-garden').waitFor();assert.deepEqual(await state(fp),value);
  });await fc.close();
  const gc=await context(),gp=await newPage(gc);
  await test('Garden tools plant and water repeatedly on the same date, harvest and persist without changing review history',async()=>{
    let ready=mature;for(let i=0;i<4;i++)ready=garden.recordGardenPractice(ready,{lessonId:'hello-01',attemptId:'browser-round-'+i,assessment:'practice-effort'},'2026-10-08');
    await setState(gp,ready);await go(gp,'garden');assert.equal(await gp.locator('.garden-plot').count(),1);assert.equal(await gp.locator('[data-plot-tab]').count(),3);
    const use=async type=>{await gp.locator(`[data-garden-tool="${type}"]`).click();await gp.locator('[data-garden-drop]').click();};
    await use('plant');assert.equal(await gp.locator('[data-material="seeds"]').innerText(),'3');
    for(let i=1;i<=12;i++){await use('water');assert.equal(await gp.locator('.garden-stage').getAttribute('data-growth'),String(i));}
    assert.equal(await gp.locator('[data-garden-tool="water"]').isDisabled(),true);
    await gp.locator('[data-garden-action="harvest"]').click();await gp.locator('[data-garden-view="collection"]').click();assert.match(await gp.locator('[data-collection="sunflower"]').innerText(),/已收集 1/);const after=await state(gp);assert.deepEqual(after.days,mature.days);assert.deepEqual(after.cards,mature.cards);await gp.reload();await go(gp,'garden');await gp.locator('[data-garden-view="collection"]').click();assert.match(await gp.locator('[data-collection="sunflower"]').innerText(),/已收集 1/);assert.deepEqual(await state(gp),after);
  });
  await test('Independent garden practice can earn encouragement water without a parent or a fabricated speech pass',async()=>{
    let value=learning.recordResult(learning.createState('2026-10-08'),'hello-01','again','2026-10-08',{isNew:true});value=garden.recordGardenAction(value,{type:'plant',plot:0,kind:'sunflower'},'2026-10-08');value=garden.recordGardenAction(value,{type:'water',plot:0},'2026-10-08');await setState(gp,value);await go(gp,'garden');
    for(const i of [0,1,2]){await gp.locator(`[data-plot-tab="${i}"]`).click();assert.equal(await gp.locator('.garden-plot').count(),1);assert.equal(await gp.locator('[data-garden-practice]').isEnabled(),true);}assert.deepEqual(await state(gp),value);
    await gp.route('**/speech/**',route=>route.abort());await gp.locator('[data-garden-practice]').click();await gp.locator('[data-step="speak"]').click();assert.equal(await gp.locator('[data-rating]').count(),0);await gp.locator('[data-garden-effort]').click();await gp.locator('[data-garden-claim]').click();await gp.locator('.garden-play').waitFor();const after=await state(gp);assert.deepEqual(after.cards,value.cards);assert.deepEqual(after.days,value.days);assert.equal(after.garden.actions.length,value.garden.actions.length+1);assert.equal(after.garden.actions[after.garden.actions.length-1].assessment,'practice-effort');assert.equal(garden.getGarden(after,'2026-10-08').earned.practicePasses,0);assert.equal(garden.getGarden(after,'2026-10-08').inventory.water,3);
  });await gc.close();
  const mc=await context({serviceWorkers:'block'});await mc.addInitScript(()=>{const original=navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);let first=true;navigator.mediaDevices.getUserMedia=(...args)=>{if(!first)return original(...args);first=false;return new Promise((resolve,reject)=>{window.__releaseMic=async()=>{try{resolve(await original(...args));}catch(e){reject(e);}};});};});const mp=await newPage(mc);
  await test('Late microphone permission from an exited card is discarded rather than attaching to the next lesson',async()=>{
    await mp.locator('#hero-start').click();await quiz(mp,curriculum.lessons[0]);await mp.locator('#record').click();assert.equal(await mp.locator('#record').isDisabled(),true);await mp.locator('#exit-session').click();await openLesson(mp,'hello-02');await quiz(mp,curriculum.lessons[1]);await mp.evaluate(()=>window.__releaseMic());await mp.waitForFunction(()=>window.__qaStreams.length>0&&window.__qaStreams.every(s=>s.getTracks().every(t=>t.readyState==='ended')));assert.equal(await mp.locator('#record').isDisabled(),false);assert.equal(await mp.locator('#replay-record').isDisabled(),true);
  });await mc.close();
  const dc=await context({permissions:[],serviceWorkers:'block'});await dc.addInitScript(()=>{navigator.mediaDevices.getUserMedia=async()=>{throw new DOMException('Denied','NotAllowedError');};});const dp=await newPage(dc);
  await test('Denied microphone explains the fallback and never blocks lesson completion',async()=>{await dp.locator('#hero-start').click();await quiz(dp,curriculum.lessons[0]);await dp.locator('#record').click();await dp.waitForFunction(()=>document.querySelector('#record-status').textContent.includes('没有开启麦克风'));await dp.locator('[data-rating="good"]').click();await dp.locator('.completion').waitFor();assert.equal(Object.keys((await state(dp)).cards).length,1);});await dc.close();
  const sc=await context(),sp=await newPage(sc);
  await test('Cross-tab progress changes stop active practice, queued audio and stale lesson actions',async()=>{const other=await newPage(sc);await sp.locator('#hero-start').click();await sp.locator('[data-step="choose"]').click();await audio(sp,'[data-listen="slow"]',.8);await other.evaluate(({key,value})=>localStorage.setItem(key,JSON.stringify(value)),{key,value:mature});await sp.locator('#hero-start').waitFor();assert.equal(await sp.evaluate(()=>window.__qaAudio.filter(a=>!a.paused&&!a.ended).length),0);assert.deepEqual(await state(sp),mature);assert.equal(await sp.locator('.practice-shell').count(),0);});await sc.close();


  const importContext=await context(),importPage=await newPage(importContext);
  await test('A delayed backup read is ignored after leaving Backup and cannot replace an active recording page',async()=>{
    await parent(importPage,'backup');await importPage.evaluate(()=>{const original=File.prototype.text;File.prototype.text=function(){const file=this;return new Promise((resolve,reject)=>{window.__releaseImport=()=>original.call(file).then(resolve,reject);});};});const before=await state(importPage);await importPage.locator('#import-file').setInputFiles({name:'delayed.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({app:'english-sprout',version:1,state:mature}))});await importPage.waitForFunction(()=>!!window.__releaseImport);await go(importPage,'home');await importPage.locator('#hero-start').click();await quiz(importPage,curriculum.lessons[0]);await importPage.locator('#record').click();await importPage.waitForFunction(()=>document.querySelector('#record').textContent.includes('停止录音'));await importPage.evaluate(()=>window.__releaseImport());await importPage.waitForTimeout(100);assert.equal(await importPage.locator('dialog[open]').count(),0);assert.equal(await importPage.locator('.practice-main').getAttribute('data-lesson-id'),'hello-01');assert.match(await importPage.locator('#record').innerText(),/停止录音/);assert.deepEqual(await state(importPage),before);await importPage.locator('#exit-session').click();assert.equal(await importPage.evaluate(()=>window.__qaStreams.flatMap(s=>s.getTracks()).filter(t=>t.readyState==='live').length),0);
  });await importContext.close();
  const backgroundContext=await context({serviceWorkers:'block'});await backgroundContext.addInitScript(()=>{const original=navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);navigator.mediaDevices.getUserMedia=(...args)=>new Promise((resolve,reject)=>{window.__grant=async()=>{try{resolve(await original(...args));}catch(e){reject(e);}};});});const backgroundPage=await newPage(backgroundContext);
  await test('A microphone permission arriving after the page goes into the background cannot start capture',async()=>{
    await backgroundPage.locator('#hero-start').click();await quiz(backgroundPage,curriculum.lessons[0]);await backgroundPage.locator('#record').click();assert.equal(await backgroundPage.locator('#record').isDisabled(),true);await backgroundPage.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));});await backgroundPage.evaluate(()=>window.__grant());await backgroundPage.waitForFunction(()=>window.__qaStreams.length>0&&window.__qaStreams.every(s=>s.getTracks().every(t=>t.readyState==='ended')));assert.equal(await backgroundPage.locator('#replay-record').isDisabled(),true);assert.doesNotMatch(await backgroundPage.locator('#record').innerText(),/停止录音/);assert.equal(await state(backgroundPage),null);
  });await backgroundContext.close();
  const shuffleContext=await context({serviceWorkers:'block'}),shufflePage=await newPage(shuffleContext);
  await test('Image choices retain source answer mapping and never reshuffle during retries or voice changes',async()=>{
    await openLesson(shufflePage,'hello-01');await shufflePage.evaluate(()=>{Math.random=()=>0;});await shufflePage.locator('[data-step="choose"]').click();const l=curriculum.lessons[0],labels=await shufflePage.locator('.choice strong').allTextContents();assert.deepEqual(labels,[1,2,0].map(i=>l.choices[i].label));await audio(shufflePage,'[data-voice="ryan"]');assert.deepEqual(await shufflePage.locator('.choice strong').allTextContents(),labels);await shufflePage.locator('[data-choice="1"]').click();assert.equal(await shufflePage.locator('#quiz-next').isVisible(),false);assert.deepEqual(await shufflePage.locator('.choice strong').allTextContents(),labels);await shufflePage.locator('[data-choice="0"]').click();assert.equal(await shufflePage.locator('#quiz-next').isVisible(),true);assert.equal(await state(shufflePage),null);
  });await shuffleContext.close();
  const cacheContext=await context(),cachePage=await newPage(cacheContext);
  await test('Delayed cache-count replies cannot overwrite a completed download or a newly opened offline page',async()=>{
    const delay=async()=>cachePage.evaluate(n=>{const original=Cache.prototype.match;let remaining=n;window.__cacheReplies=[];Cache.prototype.match=function(...args){const result=original.apply(this,args);if(remaining-->0)return new Promise((resolve,reject)=>result.then(value=>window.__cacheReplies.push(()=>resolve(value)),reject));return result;};window.__releaseCount=async()=>{Cache.prototype.match=original;window.__cacheReplies.forEach(reply=>reply());await new Promise(r=>setTimeout(r,0));};},englishAudioCount);
    await waitSW(cachePage);await delay();await parent(cachePage,'offline');await cachePage.waitForFunction(n=>window.__cacheReplies.length===n,englishAudioCount);await cachePage.locator('#offline-audio').click();await waitOfflineSaved(cachePage);await cachePage.evaluate(()=>window.__releaseCount());assert.match(await cachePage.locator('#offline-status').innerText(),/段声音已保存/);
    await go(cachePage,'home');await cachePage.evaluate(async n=>{const cache=await caches.open(n),url=new URL('./audio/hello-01.mp3',document.baseURI).href;window.__saved=await cache.match(url);await cache.delete(url);},audioCache);await delay();await parent(cachePage,'offline');await cachePage.waitForFunction(n=>window.__cacheReplies.length===n,englishAudioCount);await cachePage.evaluate(async n=>{const cache=await caches.open(n);await cache.put(new URL('./audio/hello-01.mp3',document.baseURI).href,window.__saved);},audioCache);await go(cachePage,'home');await parent(cachePage,'offline');await cachePage.waitForFunction(()=>document.querySelector('#offline-status').textContent.includes('360 / 360'));await cachePage.evaluate(()=>window.__releaseCount());assert.match(await cachePage.locator('#offline-status').innerText(),/360 \/ 360/);
  });await cacheContext.close();
  const feedbackContext=await context({serviceWorkers:'block'}),feedbackPage=await feedbackContext.newPage();feedbackPage.setDefaultTimeout(8000);
  await test('Audio loading and failure feedback remain visible and a second tap recovers the real clip',async()=>{
    let release;const gate=new Promise(r=>release=r);await feedbackPage.route('**/audio/hello-01.mp3',async route=>{await gate;await route.fulfill({contentType:'audio/mpeg',body:fs.readFileSync(path.join(root,'public/audio/hello-01.mp3'))});});try{await feedbackPage.goto(origin,{waitUntil:'domcontentloaded'});await feedbackPage.locator('#hero-start').click();await feedbackPage.locator('.scene-picture').click();await feedbackPage.locator('.audio-status[data-audio-state="loading"]').waitFor();release();await feedbackPage.locator('.audio-status[data-audio-state="playing"]').waitFor();await feedbackPage.locator('.audio-status[data-audio-state="idle"]').waitFor();}finally{release();await feedbackPage.unroute('**/audio/hello-01.mp3');}
    await feedbackPage.route('**/audio/hello-01.mp3',r=>r.fulfill({status:503,contentType:'text/plain',body:'QA unavailable'}));await feedbackPage.reload({waitUntil:'domcontentloaded'});await feedbackPage.locator('#hero-start').click();await feedbackPage.locator('.scene-picture').click();await feedbackPage.locator('.audio-status[data-audio-state="error"]').waitFor();assert.equal(await feedbackPage.locator('.scene-picture').isEnabled(),true);await feedbackPage.unroute('**/audio/hello-01.mp3');await audio(feedbackPage,'.scene-picture');await feedbackPage.locator('.audio-status[data-audio-state="idle"]').waitFor();assert.equal(await state(feedbackPage),null);
  });await feedbackContext.close();
  const tapContext=await context({serviceWorkers:'block',reducedMotion:'reduce'}),tapPage=await newPage(tapContext);
  await test('Tap feedback tracks the actual coordinate and does not cover the next control or keyboard navigation',async()=>{
    const r=await tapPage.locator('#hero-start').boundingBox(),point={x:r.x+r.width/2,y:r.y+r.height/2};await tapPage.mouse.click(point.x,point.y);await tapPage.locator('.practice-main').waitFor();const burst=await tapPage.locator('.interaction-feedback-burst').last().evaluate(e=>({x:parseFloat(e.style.left),y:parseFloat(e.style.top),pointer:getComputedStyle(e.parentElement).pointerEvents,animation:getComputedStyle(e.querySelector('.interaction-feedback-ring')).animationName}));assert.ok(Math.abs(burst.x-point.x)<1&&Math.abs(burst.y-point.y)<1);assert.equal(burst.pointer,'none');assert.equal(burst.animation,'none');await tapPage.locator('#exit-session').focus();await tapPage.keyboard.press('Enter');await tapPage.locator('#hero-start').waitFor();assert.equal(await state(tapPage),null);
  });await tapContext.close();
  const ac=await context(),ap=await newPage(ac),avatarKey='english-sprout-avatar-v1',writes=[];ac.on('request',r=>{if(!['GET','HEAD'].includes(r.method()))writes.push(r.url());});
  await test('Six animal presets persist separately and a selfie is saved only on request, then removable',async()=>{
    const before=await state(ap);await ap.locator('#avatar-open').click();assert.equal(await ap.locator('[data-avatar-animal]').count(),6);await ap.locator('[data-avatar-animal="cat"]').click();if(await ap.locator('dialog.avatar-picker[open]').count())await ap.locator('#avatar-close').click();await ap.reload();await ap.locator('#avatar-open').waitFor();assert.equal(await ap.evaluate(k=>JSON.parse(localStorage.getItem(k)).animal,avatarKey),'cat');
    const png=await ap.evaluate(()=>{const c=document.createElement('canvas');c.width=400;c.height=600;const x=c.getContext('2d');x.fillStyle='#dfbba4';x.fillRect(0,0,400,600);return c.toDataURL('image/png').split(',')[1];});await ap.locator('#avatar-open').click();await ap.locator('[data-avatar-mode="photo"]').click();await ap.locator('#avatar-photo-file').setInputFiles({name:'local-portrait.png',mimeType:'image/png',buffer:Buffer.from(png,'base64')});await ap.waitForFunction(()=>!document.querySelector('#avatar-save-photo').disabled);assert.equal(await ap.evaluate(k=>JSON.parse(localStorage.getItem(k)).kind,avatarKey),'preset');await ap.locator('#avatar-save-photo').click();await ap.waitForFunction(k=>JSON.parse(localStorage.getItem(k)).kind==='photo',avatarKey);assert.deepEqual(await state(ap),before);assert.deepEqual(writes,[]);
    if(await ap.locator('dialog.avatar-picker[open]').count())await ap.locator('#avatar-close').click();await parent(ap,'backup');const d=ap.waitForEvent('download');await ap.locator('#export-progress').click();const file=path.join(output,'avatar-learning-backup.json');await(await d).saveAs(file);assert.doesNotMatch(fs.readFileSync(file,'utf8'),/data:image|local-portrait/);await go(ap,'home');await waitSW(ap);await ac.setOffline(true);await ap.reload({waitUntil:'domcontentloaded'});await ap.locator('#avatar-open').waitFor();assert.equal(await ap.locator('[data-user-avatar] img[src^="data:"]').count()>0,true);await ac.setOffline(false);await ap.locator('#avatar-open').click();await ap.locator('[data-avatar-mode="photo"]').click();await ap.locator('#avatar-delete-photo').click();assert.doesNotMatch(await ap.evaluate(k=>localStorage.getItem(k),avatarKey),/data:image/);assert.deepEqual(await state(ap),before);
  });await ac.close();
  await browser.close();
  const report={name:reportName,url:origin,date:reportDate,browser:'Microsoft Edge Chromium headless',checks,passed:checks.filter(c=>c.status==='PASS').length,failed:checks.filter(c=>c.status==='FAIL').length};
  fs.writeFileSync(path.join(output,'browser-results.json'),JSON.stringify(report,null,2));
  const md=`# 浏览器集成验证\n\n验证日期：${reportDate}。Microsoft Edge / Playwright；地址 ${origin}。\n\n结果：${report.passed} 项通过，${report.failed} 项失败。\n\n`+checks.map(c=>`- **${c.status}** ${c.name}${c.status==='FAIL'?`\n  - ${c.error.split('\n')[0]}`:''}`).join('\n')+`\n\n范围：真实 MP3 播放与变速、假麦克风加真实 MediaRecorder、固定本地日历、离线 Service Worker、学习/导入/花园/头像。单屏手机尺寸和点击命中另见 focus-browser.cjs；未冒充实体手机或真人听音验收。\n`;
  fs.writeFileSync(path.join(output,'UI_QA.md'),md);fs.writeFileSync(summaryPath,md);console.log(JSON.stringify({passed:report.passed,failed:report.failed,report:path.join(output,'browser-results.json')}));process.exitCode=report.failed?1:0;
})().catch(async e=>{console.error(e);if(browser)await browser.close();process.exitCode=1;});
