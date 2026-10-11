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
  await p.goto(origin,{waitUntil:'networkidle'});await p.locator('#start-today').waitFor();return p;
}
async function go(p,view){await p.locator(`[data-go="${view}"]:visible`).first().click();}
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
  const before=await p.evaluate(()=>window.__qaPlay.length);
  const kind=selector==='#replay-record'?'recording':selector==='#guide-audio'?'guide':'english';
  const lesson=kind==='english'&&await p.locator('.practice-main').count()?await p.locator('.practice-main').getAttribute('data-lesson-id'):null;
  const voice=selector.match(/^\[data-voice="(aiden|ryan|pip)"\]$/)?.[1]||(lesson?await p.locator('[data-voice][aria-pressed="true"]').getAttribute('data-voice'):null);
  await p.locator(selector).first().click();
  const args={before,rate,kind,lesson,voice};
  await p.waitForFunction(({before,rate,kind,lesson,voice})=>window.__qaPlay.slice(before).some(event=>event.rate===rate&&(kind==='recording'?event.src.startsWith('blob:'):kind==='guide'?event.src.includes('/audio/ui/'):event.src.includes('/audio/')&&!event.src.includes('/audio/ui/')&&(!lesson||event.src.endsWith(`/audio/${voice==='pip'?'characters/pip/':voice==='ryan'?'ryan/':''}${lesson}.mp3`)))),args,{timeout:45000});
  const event=await p.evaluate(({before,rate,kind,lesson,voice})=>window.__qaPlay.slice(before).find(event=>event.rate===rate&&(kind==='recording'?event.src.startsWith('blob:'):kind==='guide'?event.src.includes('/audio/ui/'):event.src.includes('/audio/')&&!event.src.includes('/audio/ui/')&&(!lesson||event.src.endsWith(`/audio/${voice==='pip'?'characters/pip/':voice==='ryan'?'ryan/':''}${lesson}.mp3`)))),args);
  assert.equal(event.rate,rate);assert.ok(event.duration>0.3);return event;
}
async function waitSW(p){await p.evaluate(()=>navigator.serviceWorker.ready);await p.waitForFunction(()=>navigator.serviceWorker.controller!==null);}
async function waitOfflineSaved(p){
  const started=Date.now(),requests=[],responses=[];
  const failed=request=>requests.push({url:request.url(),failure:request.failure()});
  const response=reply=>{if(reply.url().endsWith('.mp3')&&(reply.status()===206||!reply.ok()))responses.push({url:reply.url(),status:reply.status()});};
  p.context().on('requestfailed',failed);
  p.context().on('response',response);
  const snapshot=async()=>p.evaluate(async name=>({status:document.querySelector('#offline-status')?.textContent,disabled:document.querySelector('#offline-audio')?.disabled,persist:window.__qaPersist||null,cachedMP3:(await(await caches.open(name)).keys()).filter(request=>request.url.endsWith('.mp3')).length}),audioCache);
  const progress=localTarget?null:setInterval(async()=>{try{console.log('Offline save progress',JSON.stringify({elapsedMs:Date.now()-started,...await snapshot()}));}catch{}},30000);
  try{
    await p.waitForFunction(()=>document.querySelector('#offline-status')?.textContent.includes('段声音已保存'),null,{timeout:offlineTimeout});
    return {elapsedMs:Date.now()-started};
  }catch(error){
    const details={elapsedMs:Date.now()-started,...await snapshot().catch(()=>({})),failedRequests:requests,unexpectedResponses:responses};
    console.log('Offline save diagnostics',JSON.stringify(details));error.message+=' '+JSON.stringify(details);throw error;
  }finally{clearInterval(progress);p.context().off('requestfailed',failed);p.context().off('response',response);}
}
async function delayCacheCount(p){
  await p.evaluate(count=>{
    const original=Cache.prototype.match;let remaining=count;window.__qaCacheReplies=[];
    Cache.prototype.match=function(...args){const result=original.apply(this,args);if(remaining-->0)return new Promise((resolve,reject)=>result.then(value=>window.__qaCacheReplies.push(()=>resolve(value)),reject));return result;};
    window.__qaReleaseCacheCount=async()=>{Cache.prototype.match=original;window.__qaCacheReplies.forEach(reply=>reply());await new Promise(resolve=>setTimeout(resolve,0));};
  },englishAudioCount);
}

(async()=>{
  browser=await chromium.launch({channel:'msedge',headless:true,args:['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream']});
  const c=await context();const p=await newPage(c);
  await test('Desktop home renders, 120 lessons available, no horizontal overflow',async()=>{await p.locator('h1').waitFor();assert.match(await p.locator('h1').innerText(),/每天一句/);const r=await overflow(p,'desktop home');await p.screenshot({path:path.join(output,'home-desktop.png'),fullPage:true});return r;});
  await test('Real bundled home audio plays with finite duration',()=>audio(p,'#preview-audio'));
  await test('New lesson starts without requiring a microphone',async()=>{await p.locator('#start-today').click();assert.match(await p.locator('.practice-title').innerText(),/先听一听/);assert.equal(await p.locator('.practice-english').innerText(),curriculum.lessons[0].english);return overflow(p,'desktop practice');});
  await test('Normal and slow audio use real MP3 and correct playback rates',async()=>({normal:await audio(p,'[data-listen="normal"]'),slow:await audio(p,'[data-listen="slow"]',0.8)}));
  await test('Chinese guidance remains available when deliberately requested',()=>audio(p,'#guide-audio'));
  await test('Wrong answer gives gentle retry, correct answer enables speaking',async()=>{await quiz(p,curriculum.lessons[0],true);assert.match(await p.locator('.practice-title').innerText(),/开口/);assert.equal(await p.locator('#replay-record').isDisabled(),true);});
  await test('Real MediaRecorder accepts fake microphone, stop and playback work',async()=>{
    await p.locator('#record').click();await p.waitForFunction(()=>document.querySelector('#record').textContent.includes('停止录音'));
    // Fake device may not yield decodable Opus frames in a sub-second recording.
    await p.waitForTimeout(1800);await p.locator('#record').click();await p.waitForFunction(()=>!document.querySelector('#replay-record').disabled);
    const event=await audio(p,'#replay-record');assert.match(event.src,/^blob:/);assert.equal(await p.evaluate(()=>window.__qaStreams.flatMap(s=>s.getTracks()).filter(t=>t.readyState==='live').length),0);return {source:'Edge fake microphone / actual MediaRecorder',played:true};
  });
  await test('Voice name buttons immediately replay the current sentence and preserve recording and progress',async()=>{
    const before=await state(p),recorded=await audio(p,'#replay-record');
    assert.equal(await p.locator('select[data-voice]').count(),0);assert.equal(await p.locator('[data-voice="aiden"]').getAttribute('aria-pressed'),'true');
    const aiden=await audio(p,'[data-listen="normal"]');assert.match(aiden.src,/\/audio\/hello-01\.mp3$/);const oldAudio=await p.evaluate(src=>window.__qaAudio.findIndex(a=>a.src===src&&!a.paused),aiden.src);assert.ok(oldAudio>=0);
    const ryan=await audio(p,'[data-voice="ryan"]');assert.equal(await p.evaluate(index=>window.__qaAudio[index].paused,oldAudio),true);assert.match(ryan.src,/\/audio\/ryan\/hello-01\.mp3$/);
    assert.equal(await p.locator('[data-voice="ryan"]').getAttribute('aria-pressed'),'true');assert.match((await audio(p,'[data-voice="ryan"]')).src,/\/audio\/ryan\/hello-01\.mp3$/);
    await audio(p,'[data-listen="slow"]',0.8);
    const pip=await audio(p,'[data-voice="pip"]');assert.match(pip.src,/\/audio\/characters\/pip\/hello-01\.mp3$/);
    assert.equal((await audio(p,'#replay-record')).src,recorded.src);assert.deepEqual(await state(p),before);
    await audio(p,'[data-voice="aiden"]');assert.equal(await p.locator('#replay-record').isDisabled(),false);assert.deepEqual(await state(p),before);
    return {aiden:aiden.src,ryan:ryan.src,pip:pip.src,recordingPreserved:true};
  });
  await test('Course speed changes immediately without restarting, while guidance and recorded voice stay natural',async()=>{
    const before=await state(p);assert.equal(await p.locator('[data-course-rate]').count(),4);
    await audio(p,'[data-voice="pip"]');
    await p.waitForFunction(()=>window.__qaAudio.some(a=>!a.paused&&!a.ended&&a.currentTime>.12));
    const initial=await p.evaluate(()=>{window.__qaSpeedTarget=window.__qaAudio.find(a=>!a.paused&&!a.ended);const a=window.__qaSpeedTarget;return {time:a.currentTime,plays:a.qaPlayCalls,loads:a.qaLoadCalls};});
    await p.locator('[data-course-rate="0.75"]').click();
    const changed=await p.evaluate(()=>{const a=window.__qaSpeedTarget;return {time:a.currentTime,rate:a.playbackRate,pitch:a.preservesPitch,plays:a.qaPlayCalls,loads:a.qaLoadCalls,active:!a.paused&&!a.ended};});
    assert.equal(changed.rate,.75);assert.equal(changed.pitch,true);assert.equal(changed.active,true);assert.ok(changed.time>=initial.time);assert.equal(changed.plays,initial.plays);assert.equal(changed.loads,initial.loads);
    await audio(p,'[data-listen="normal"]',.75);await audio(p,'[data-voice="aiden"]',.75);
    await audio(p,'[data-listen="slow"]',.8);await audio(p,'#guide-audio',1);await audio(p,'#replay-record',1);
    await p.locator('[data-course-rate="1.15"]').click();await audio(p,'[data-listen="normal"]',1.15);
    await p.locator('[data-course-rate="1"]').click();assert.deepEqual(await state(p),before);
    assert.equal(await p.evaluate(()=>localStorage.getItem('english-sprout-course-rate-v1')),'1');return {initial,changed,recordingAndGuidanceRate:1};
  });
  await test('First completion saves one card and next-day review; no second new sentence',async()=>{
    await p.locator('[data-rating="good"]').click();await p.locator('.completion').waitFor();
    const s=await state(p);assert.equal(Object.keys(s.cards).length,1);assert.equal(s.cards['hello-01'].due,'2026-10-09');assert.equal(s.days['2026-10-08'].newDone,true);
    await go(p,'home');assert.match(await p.locator('#start-today').innerText(),/小书/);await p.reload();await p.locator('#start-today').waitFor();assert.match(await p.locator('#start-today').innerText(),/小书/);assert.deepEqual(await state(p),s);return s.cards['hello-01'];
  });
  await test('Library search and all twelve theme filters select relevant lessons',async()=>{
    await go(p,'library');assert.equal(await p.locator('.phrase-tile').count(),120);
    await p.locator('#phrase-search').fill('牛奶');assert.equal(await p.locator('.phrase-tile').count(),1);assert.match(await p.locator('.phrase-tile').innerText(),/milk/);
    await p.locator('#phrase-search').fill('xyz-no-match');assert.equal(await p.locator('.phrase-tile').count(),0);assert.equal(await p.locator('.empty-state').isVisible(),true);
    await p.locator('#phrase-search').fill('');
    for(const t of curriculum.themes){await p.locator(`[data-filter="${t.id}"]`).click();assert.equal(await p.locator('.phrase-tile').count(),10);}
    await p.locator('[data-filter="all"]').click();return overflow(p,'desktop library');
  });
  await test('Free library practice does not schedule or alter learning progress',async()=>{
    const before=await state(p);await p.locator('[data-preview="needs-01"]').click();await quiz(p,curriculum.lessons.find(l=>l.id==='needs-01'));await p.locator('[data-rating="good"]').click();await p.locator('.phrase-grid').waitFor();assert.deepEqual(await state(p),before);
  });
  await test('Leaving free practice via completion stops current playback',async()=>{
    await p.locator('[data-preview="hello-01"]').click();await quiz(p,curriculum.lessons[0]);await audio(p,'[data-listen="slow"]',0.8);await p.locator('[data-rating="good"]').click();await p.locator('.phrase-grid').waitFor();assert.equal(await p.evaluate(()=>window.__qaAudio.filter(a=>!a.paused&&!a.ended).length),0);
  });
  await test('Exit practice immediately stops active microphone and audio',async()=>{
    await p.locator('[data-preview="hello-01"]').click();await quiz(p,curriculum.lessons[0]);await p.locator('#record').click();await p.waitForFunction(()=>document.querySelector('#record').textContent.includes('停止录音'));await p.locator('#exit-session').click();await p.locator('.phrase-grid').waitFor();
    assert.equal(await p.evaluate(()=>window.__qaStreams.flatMap(s=>s.getTracks()).filter(t=>t.readyState==='live').length),0);assert.equal(await p.evaluate(()=>window.__qaAudio.filter(a=>!a.paused&&!a.ended).length),0);
    await go(p,'home');const resumed=await audio(p,'#preview-audio');assert.match(resumed.src,/\/audio\/hello-01\.mp3$/);await go(p,'library');return {captureStopped:true,homePlaybackResumed:true};
  });
  let backup;
  await test('Settings persist and export produces valid transferable backup',async()=>{
    await go(p,'parent');await p.locator('#nickname').fill('小小测试员');await p.locator('#daily-reviews').selectOption('3');await p.locator('#save-settings').click();
    const d=p.waitForEvent('download');await p.locator('#export-progress').click();const download=await d;await download.saveAs(path.join(output,'qa-backup.json'));backup=JSON.parse(fs.readFileSync(path.join(output,'qa-backup.json'),'utf8'));
    assert.equal(backup.app,'english-sprout');assert.equal(backup.state.settings.nickname,'小小测试员');assert.equal(backup.state.settings.dailyReviews,3);assert.equal(Object.keys(backup.state.cards).length,1);return overflow(p,'desktop parent');
  });
  await test('Parent voice preference survives reload and applies to home and phrase-book audio without altering progress',async()=>{
    const before=await state(p);await p.locator('[data-voice="ryan"]').click();await p.reload();await p.locator('#save-settings').waitFor();assert.equal(await p.locator('[data-voice="ryan"]').getAttribute('aria-pressed'),'true');
    await go(p,'home');assert.match((await audio(p,'#preview-audio')).src,/\/audio\/ryan\/hello-01\.mp3$/);
    await go(p,'library');await p.locator('[data-preview="hello-02"]').click();assert.equal(await p.locator('[data-voice="ryan"]').getAttribute('aria-pressed'),'true');assert.match((await audio(p,'[data-listen="normal"]')).src,/\/audio\/ryan\/hello-02\.mp3$/);
    await p.locator('#exit-session').click();await go(p,'parent');assert.deepEqual(await state(p),before);assert.deepEqual(Object.keys(backup.state.settings).sort(),['dailyReviews','nickname']);
  });
  await test('Pip is a complete third voice across home and all twelve lesson themes',async()=>{
    const before=await state(p);await audio(p,'[data-voice="pip"]');await p.reload();await p.locator('#save-settings').waitFor();
    assert.equal(await p.locator('[data-voice="pip"]').getAttribute('aria-pressed'),'true');assert.equal(await p.locator('[data-voice]').count(),3);
    await go(p,'home');assert.match((await audio(p,'#preview-audio')).src,/\/audio\/characters\/pip\/hello-01\.mp3$/);
    await go(p,'library');const clips=[];
    for(const theme of curriculum.themes){
      const lesson=curriculum.lessons.find(l=>l.theme===theme.id||l.themeId===theme.id||l.id.startsWith(theme.id+'-'));
      assert.ok(lesson);await p.locator(`[data-preview="${lesson.id}"]`).click();
      const played=await audio(p,'[data-listen="normal"]');assert.ok(played.src.endsWith(`/audio/characters/pip/${lesson.id}.mp3`));clips.push(played);
      await p.locator('#exit-session').click();
    }
    await go(p,'parent');assert.deepEqual(await state(p),before);await audio(p,'[data-voice="ryan"]');return {clips,learningUnchanged:true};
  });
  await test('Parent phone QR renders and copy-link uses the intended public URL',async()=>{
    const qr=p.locator('.phone-share img');assert.equal(await qr.evaluate(i=>i.complete&&i.naturalWidth>0),true);
    await p.evaluate(()=>{navigator.clipboard.writeText=async text=>{window.__qaCopied=text;};});await p.locator('#copy-link').click();
    const copied=await p.evaluate(()=>window.__qaCopied);assert.equal(copied,'https://jamstrak.github.io/english-sprout/');return{copied,qrRendered:true};
  });
  await test('Invalid import is rejected without changing progress',async()=>{
    const before=await state(p);await p.locator('#import-file').setInputFiles({name:'bad.json',mimeType:'application/json',buffer:Buffer.from('{"app":"wrong"}')});await p.waitForFunction(()=>document.querySelector('#import-status').textContent.includes('没有导入'));assert.deepEqual(await state(p),before);assert.equal(await p.locator('dialog').count(),0);
  });
  await test('Import requires confirmation; cancel preserves state and confirm restores',async()=>{
    const changed={...backup,state:{...backup.state,settings:{...backup.state.settings,nickname:'恢复的小芽'}}};
    const input={name:'valid.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(changed))};
    const before=await state(p);await p.locator('#import-file').setInputFiles(input);await p.locator('dialog[open]').waitFor();assert.match(await p.locator('dialog').innerText(),/不会合并/);await p.locator('[data-cancel]').click();await p.waitForFunction(()=>!document.querySelector('dialog'));assert.deepEqual(await state(p),before);
    await p.locator('#import-file').setInputFiles(input);await p.locator('[data-confirm]').click();await p.waitForFunction(()=>!document.querySelector('dialog'));assert.equal((await state(p)).settings.nickname,'恢复的小芽');
  });
  for(const dailyReviews of [1,10])await test(`Imported ${dailyReviews} daily reviews and 16-character nickname survive settings edits`,async()=>{
    const nickname='小芽'.repeat(8);
    const imported={...backup,state:{...backup.state,settings:{nickname,dailyReviews}}};
    await p.locator('#import-file').setInputFiles({name:'settings.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(imported))});
    await p.locator('[data-confirm]').click();await p.waitForFunction(()=>!document.querySelector('dialog'));
    assert.equal(await p.locator('#nickname').inputValue(),nickname);assert.equal(await p.locator('#daily-reviews').inputValue(),String(dailyReviews));
    assert.deepEqual(await p.locator('#daily-reviews option').evaluateAll(options=>options.map(o=>Number(o.value))),Array.from({length:10},(_,i)=>i+1));
    await p.locator('#save-settings').click();assert.deepEqual((await state(p)).settings,{nickname,dailyReviews});
    const edited='🌱'.repeat(15)+'芽';await p.locator('#nickname').fill(edited);await p.locator('#save-settings').click();
    assert.deepEqual((await state(p)).settings,{nickname:edited,dailyReviews});await p.reload();await p.locator('#save-settings').waitFor();
    assert.equal(await p.locator('#nickname').inputValue(),edited);assert.equal(await p.locator('#daily-reviews').inputValue(),String(dailyReviews));
  });
  await test('Reset cancel preserves progress; confirmed reset can be restored from export',async()=>{
    const before=await state(p);await p.locator('#reset-progress').click();await p.locator('[data-cancel]').click();assert.deepEqual(await state(p),before);
    await p.locator('#reset-progress').click();await p.locator('[data-confirm]').click();await p.locator('#start-today').waitFor();assert.equal(Object.keys((await state(p)).cards).length,0);
    await go(p,'parent');await p.locator('#import-file').setInputFiles({name:'backup.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(backup))});await p.locator('[data-confirm]').click();await p.waitForFunction(()=>!document.querySelector('dialog'));assert.equal(Object.keys((await state(p)).cards).length,1);
  });
  await test('Next local calendar day schedules exactly one new sentence plus due review',async()=>{
    await p.clock.setFixedTime(new Date('2026-10-09T10:00:00+08:00'));await go(p,'home');assert.equal(await p.locator('.review-number').innerText(),'1\n句待复习');await p.locator('#start-today').click();assert.equal(await p.locator('.practice-english').innerText(),curriculum.lessons[1].english);await quiz(p,curriculum.lessons[1]);await p.locator('[data-rating="good"]').click();
    assert.match(await p.locator('.practice-title').innerText(),/还记得/);assert.equal(await p.locator('.practice-english').count(),0);await p.locator('[data-step="speak"]').click();assert.equal(await p.locator('.practice-english').count(),0);
    await p.locator('#record').click();await p.waitForFunction(()=>document.querySelector('#record').textContent.includes('停止录音'));await p.waitForTimeout(1800);await p.locator('#record').click();await p.waitForFunction(()=>!document.querySelector('#replay-record').disabled);
    const ownRecording=await audio(p,'#replay-record');await p.locator('#reveal').click();assert.equal(await p.locator('.practice-english').innerText(),curriculum.lessons[0].english);
    assert.equal(await p.locator('#reveal').count(),0);await audio(p,'[data-listen="normal"]');await audio(p,'[data-listen="slow"]',0.8);assert.equal((await audio(p,'#replay-record')).src,ownRecording.src);
    await p.locator('[data-rating="help"]').click();await p.locator('.completion').waitFor();
    const s=await state(p);assert.equal(s.days['2026-10-09'].results.length,2);assert.equal(s.cards['hello-01'].due,'2026-10-10');assert.equal(s.cards['hello-02'].due,'2026-10-10');return s.days['2026-10-09'];
  });
  await test(`All ${totalAudioCount} course and audition audio files cache and all three English voices play after offline reload`,async()=>{
    await go(p,'parent');await waitSW(p);await p.locator('#offline-audio').click();const download=await waitOfflineSaved(p);
    const count=await p.evaluate(async name=>{const cache=await caches.open(name);return(await cache.keys()).filter(r=>r.url.endsWith('.mp3')).length;},audioCache);assert.equal(count,totalAudioCount);
    // Reproduce CDN Vary: Accept-Encoding mismatch between prefetch and media.
    await p.evaluate(async name=>{
      const cache=await caches.open(name);
      const url=new URL('./audio/kindness-10.mp3',document.baseURI).href;
      const response=await cache.match(url,{ignoreVary:true});
      const bytes=await response.arrayBuffer();await cache.delete(url,{ignoreVary:true});
      await cache.put(new Request(url,{headers:{'Accept-Encoding':'qa-prefetch-variant'}}),new Response(bytes,{headers:{'Content-Type':'audio/mpeg','Vary':'Accept-Encoding'}}));
    },audioCache);
    await c.setOffline(true);await p.reload({waitUntil:'domcontentloaded'});await p.locator('#offline-audio').waitFor();await go(p,'library');await p.locator('[data-preview="kindness-10"]').click();const event=await audio(p,'[data-voice="aiden"]');assert.match(event.src,/\/audio\/kindness-10\.mp3$/);
    const ryan=await audio(p,'[data-voice="ryan"]');assert.match(ryan.src,/\/audio\/ryan\/kindness-10\.mp3$/);const pip=await audio(p,'[data-voice="pip"]');assert.match(pip.src,/\/audio\/characters\/pip\/kindness-10\.mp3$/);await audio(p,'#guide-audio');await p.locator('#exit-session').click();
    const range=await p.evaluate(async()=>{const r=await fetch('./audio/kindness-10.mp3',{headers:{Range:'bytes=0-127'}});return{status:r.status,range:r.headers.get('Content-Range'),length:(await r.arrayBuffer()).byteLength};});assert.equal(range.status,206);assert.equal(range.length,128);assert.match(range.range,/^bytes 0-127\//);
    await c.setOffline(false);return {cachedMP3:count,download,offlinePlay:{aiden:event,ryan,pip},range};
  });
  await test('App reports no uncaught JavaScript errors',async()=>{assert.deepEqual(await p.evaluate(()=>window.__qaErrors),[]);});
  await c.close();

  for(const width of [390,320]){
    const mc=await context({viewport:{width,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:1});const mp=await newPage(mc);
    await test(`Mobile ${width}px first-screen main button is unobscured and starts today's new lesson without scrolling`,async()=>{
      const position=await mp.locator('#hero-start').evaluate(button=>{const r=button.getBoundingClientRect(),x=r.left+r.width/2,y=r.top+r.height/2;return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,height:r.height,x,y,scrollY,viewportWidth:innerWidth,viewportHeight:innerHeight,navigationTop:document.querySelector('.bottom-nav').getBoundingClientRect().top,unobscured:button.contains(document.elementFromPoint(x,y))};});
      assert.equal(position.scrollY,0);assert.ok(position.left>=0&&position.right<=width);assert.ok(position.top>=0&&position.bottom<=Math.min(position.viewportHeight,position.navigationTop),JSON.stringify(position));assert.ok(position.height>=48);assert.equal(position.unobscured,true);
      await mp.screenshot({path:path.join(output,`home-first-screen-${width}.png`)});
      // A coordinate tap cannot auto-scroll an off-screen control into view.
      await mp.touchscreen.tap(position.x,position.y);assert.match(await mp.locator('.practice-title').innerText(),/先听一听/);assert.equal(await mp.locator('.practice-main').getAttribute('data-lesson-id'),'hello-01');assert.equal(await state(mp),null);await mp.locator('#exit-session').click();return position;
    });
    await test(`Mobile ${width}px home and navigation fit without overflow`,async()=>{await overflow(mp,`mobile ${width} home`);await mp.screenshot({path:path.join(output,`home-mobile-${width}.png`),fullPage:true});assert.equal(await mp.locator('.bottom-nav').isVisible(),true);await go(mp,'library');await overflow(mp,`mobile ${width} library`);await go(mp,'garden');await overflow(mp,`mobile ${width} garden`);await go(mp,'parent');await overflow(mp,`mobile ${width} parent`);await go(mp,'home');});
    await test(`Mobile ${width}px lesson, quiz and speaking fit without overflow`,async()=>{await mp.locator('#start-today').click();await overflow(mp,`mobile ${width} listen`);await mp.screenshot({path:path.join(output,`lesson-mobile-${width}.png`),fullPage:true});await mp.locator('[data-step="choose"]').click();await overflow(mp,`mobile ${width} quiz`);await mp.locator('[data-choice="0"]').click();await mp.locator('#quiz-next').click();await overflow(mp,`mobile ${width} speak`);await mp.locator('[data-rating="good"]').click();await overflow(mp,`mobile ${width} completion`);});
    await mc.close();
  }
  const pendingContext=await context({serviceWorkers:'block'});
  await pendingContext.addInitScript(()=>{const original=navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);let first=true;navigator.mediaDevices.getUserMedia=(...args)=>{if(!first)return original(...args);first=false;return new Promise((resolve,reject)=>{window.__releaseMic=async()=>{try{resolve(await original(...args));}catch(e){reject(e);}};});};});
  const pp=await newPage(pendingContext);
  await test('Late microphone permission is discarded after exiting and entering another card',async()=>{
    await pp.locator('#start-today').click();await quiz(pp,curriculum.lessons[0]);await pp.locator('#record').click();assert.equal(await pp.locator('#record').isDisabled(),true);
    await pp.locator('#exit-session').click();await go(pp,'library');await pp.locator('[data-preview="hello-02"]').click();await quiz(pp,curriculum.lessons[1]);await pp.evaluate(()=>window.__releaseMic());
    await pp.waitForFunction(()=>window.__qaStreams.length>0&&window.__qaStreams.every(s=>s.getTracks().every(t=>t.readyState==='ended')));
    assert.equal(await pp.locator('#record').isDisabled(),false);assert.equal(await pp.locator('#replay-record').isDisabled(),true);assert.equal(await pp.locator('.practice-english').innerText(),curriculum.lessons[1].english);
    await pp.locator('#record').click();await pp.waitForFunction(()=>document.querySelector('#record').textContent.includes('停止录音'));await pp.locator('#exit-session').click();assert.equal(await pp.evaluate(()=>window.__qaStreams.flatMap(s=>s.getTracks()).filter(t=>t.readyState==='live').length),0);assert.deepEqual(await pp.evaluate(()=>window.__qaErrors),[]);
  });await pendingContext.close();
  const deniedContext=await context({permissions:[],serviceWorkers:'block'});await deniedContext.addInitScript(()=>{navigator.mediaDevices.getUserMedia=async()=>{throw new DOMException('Permission denied','NotAllowedError');};});const dp=await newPage(deniedContext);
  await test('Denied microphone shows fallback and does not block completion',async()=>{await dp.locator('#start-today').click();await quiz(dp,curriculum.lessons[0]);await dp.locator('#record').click();await dp.waitForFunction(()=>document.querySelector('#record-status').textContent.includes('没有开启麦克风'));assert.equal(await dp.locator('#record').isDisabled(),false);await dp.locator('[data-rating="good"]').click();await dp.locator('.completion').waitFor();assert.equal(Object.keys((await state(dp)).cards).length,1);});await deniedContext.close();
  const shuffleContext=await context({serviceWorkers:'block'});const sp=await newPage(shuffleContext);
  await test('Shuffled choices retain answer mapping and stay in place during retries',async()=>{
    await go(sp,'library');
    for(const lesson of curriculum.lessons.slice(0,3)){
      await sp.evaluate(()=>{Math.random=()=>0;});await sp.locator(`[data-preview="${lesson.id}"]`).click();await sp.locator('[data-step="choose"]').click();
      const labels=await sp.locator('.choice strong').allTextContents();assert.deepEqual(labels,[1,2,0].map(i=>lesson.choices[i].label));assert.deepEqual(await sp.locator('.choice i').allTextContents(),['A','B','C']);
      await audio(sp,'[data-voice="ryan"]');assert.deepEqual(await sp.locator('.choice strong').allTextContents(),labels);
      // A retry must not reshuffle or treat the displayed letter as the source answer index.
      await sp.locator('.choice').filter({hasText:lesson.choices[(lesson.answerIndex+1)%3].label}).click();assert.match(await sp.locator('#quiz-feedback').innerText(),/再听一次/);assert.equal(await sp.locator('#quiz-next').isVisible(),false);
      await audio(sp,'[data-listen="slow"]',0.8);assert.deepEqual(await sp.locator('.choice strong').allTextContents(),labels);
      await sp.locator('.choice').filter({hasText:lesson.choices[lesson.answerIndex].label}).click();assert.equal(await sp.locator('#quiz-next').isVisible(),true);assert.equal(await state(sp),null);
      await sp.locator('#exit-session').click();
      await sp.evaluate(()=>{Math.random=()=>0.999;});await sp.locator(`[data-preview="${lesson.id}"]`).click();await sp.locator('[data-step="choose"]').click();assert.deepEqual(await sp.locator('.choice strong').allTextContents(),lesson.choices.map(choice=>choice.label));await sp.locator('#exit-session').click();
    }
  });await shuffleContext.close();
  const cacheRaceContext=await context();const cp=await newPage(cacheRaceContext);
  await test('Delayed cache counts cannot overwrite download success or a newer parent page',async()=>{
    await waitSW(cp);await delayCacheCount(cp);await go(cp,'parent');await cp.waitForFunction(count=>window.__qaCacheReplies.length===count,englishAudioCount);
    await cp.locator('#offline-audio').click();await waitOfflineSaved(cp);
    await cp.evaluate(()=>window.__qaReleaseCacheCount());assert.match(await cp.locator('#offline-status').innerText(),/段声音已保存/);
    // A previous render must not overwrite the status of a fresh parent page either.
    await go(cp,'home');await cp.evaluate(async name=>{const cache=await caches.open(name),url=new URL('./audio/hello-01.mp3',document.baseURI).href;window.__qaSavedAudio=await cache.match(url);await cache.delete(url);},audioCache);
    await delayCacheCount(cp);await go(cp,'parent');await cp.waitForFunction(count=>window.__qaCacheReplies.length===count,englishAudioCount);
    await cp.evaluate(async name=>{const cache=await caches.open(name);await cache.put(new URL('./audio/hello-01.mp3',document.baseURI).href,window.__qaSavedAudio);},audioCache);
    await go(cp,'home');await go(cp,'parent');await cp.waitForFunction(()=>document.querySelector('#offline-status').textContent.includes(`${360} / ${360}`));
    await cp.evaluate(()=>window.__qaReleaseCacheCount());assert.match(await cp.locator('#offline-status').innerText(),/360 \/ 360/);
    assert.deepEqual(await cp.evaluate(()=>window.__qaErrors),[]);
  });await cacheRaceContext.close();
  const guideContext=await context();const ap=await newPage(guideContext);
  await test('Learning stages, answer feedback and completion never automatically start Chinese narration',async()=>{
    await ap.locator('#hero-start').click();await ap.locator('[data-step="choose"]').click();
    await ap.waitForFunction(()=>window.__qaPlay.some(event=>event.src.endsWith('/audio/hello-01.mp3')),null,{timeout:30000});
    await ap.locator('[data-choice="1"]').click();assert.equal(await ap.locator('#quiz-next').isVisible(),false);
    await ap.locator('[data-choice="0"]').click();await ap.locator('#quiz-next').click();await ap.locator('[data-rating="good"]').click();await ap.locator('.completion').waitFor();
    const narration=await ap.evaluate(()=>window.__qaAudio.filter(audio=>audio.src.includes('/audio/ui/')).map(audio=>audio.src));assert.deepEqual(narration,[]);
  });await guideContext.close();
  const pictureContext=await context({serviceWorkers:'block'});const ip=await newPage(pictureContext);
  await test('The complete scene picture and its play icon both replay the current sentence',async()=>{
    await ip.locator('#hero-start').click();assert.equal(await ip.locator('.scene-picture').evaluate(element=>element.tagName),'BUTTON');assert.ok(await ip.locator('.scene-picture').getAttribute('aria-label'));
    const picture=await audio(ip,'.scene-picture .lesson-illustration');const playIcon=await audio(ip,'.scene-picture .picture-play');assert.match(picture.src,/\/audio\/hello-01\.mp3$/);assert.equal(playIcon.src,picture.src);
    assert.equal(await state(ip),null);return {picture:picture.src,playIcon:playIcon.src};
  });await pictureContext.close();
  const tapContext=await context({serviceWorkers:'block',reducedMotion:'reduce'});const tp=await newPage(tapContext);
  await test('Child tap feedback marks the actual tap, survives navigation and never blocks the next action',async()=>{
    const target=await tp.locator('#hero-start').boundingBox(),point={x:target.x+target.width/2,y:target.y+target.height/2};
    await tp.mouse.click(point.x,point.y);await tp.locator('.practice-main').waitFor();
    const burst=await tp.locator('.interaction-feedback-burst').last().evaluate(el=>({x:parseFloat(el.style.left),y:parseFloat(el.style.top),layerPointerEvents:getComputedStyle(el.parentElement).pointerEvents,ringAnimation:getComputedStyle(el.querySelector('.interaction-feedback-ring')).animationName,ringOpacity:getComputedStyle(el.querySelector('.interaction-feedback-ring')).opacity,stars:[...el.querySelectorAll('.interaction-feedback-star')].map(star=>getComputedStyle(star).display)}));
    assert.ok(Math.abs(burst.x-point.x)<1&&Math.abs(burst.y-point.y)<1);assert.equal(burst.layerPointerEvents,'none');assert.equal(burst.ringAnimation,'none');assert.ok(Number(burst.ringOpacity)>0);assert.ok(burst.stars.every(display=>display==='none'));
    await tp.locator('[data-voice="ryan"]').click();assert.equal(await tp.locator('[data-voice="ryan"]').getAttribute('aria-pressed'),'true');
    await tp.locator('#exit-session').focus();await tp.keyboard.press('Enter');await tp.locator('#hero-start').waitFor();assert.equal(await state(tp),null);
    await tp.waitForFunction(()=>document.querySelectorAll('.interaction-feedback-burst').length===0);assert.equal(await tp.locator('.interaction-feedback-active').count(),0);
    return {actualTap:point,reducedMotion:true,nextActionUnaffected:true};
  });await tapContext.close();
  const feedbackContext=await context({serviceWorkers:'block'});const fp=await feedbackContext.newPage();fp.setDefaultTimeout(8000);
  await test('Audio feedback shows loading, playback and idle, then recovers from a failed clip on the next tap',async()=>{
    let release;
    const gate=new Promise(resolve=>{release=resolve;});
    await fp.route('**/audio/hello-01.mp3',async route=>{await gate;await route.fulfill({contentType:'audio/mpeg',body:fs.readFileSync(path.join(root,'public/audio/hello-01.mp3'))});});
    try{
      // Intercept before navigation: the current sentence now preloads silently.
      await fp.goto(origin,{waitUntil:'domcontentloaded'});await fp.locator('#hero-start').click();
      await fp.locator('.scene-picture').click();await fp.locator('.audio-status[data-audio-state="loading"]').waitFor();assert.equal(await fp.locator('body').getAttribute('data-playing'),'loading');
      release();await fp.locator('.audio-status[data-audio-state="playing"]').waitFor();assert.equal(await fp.locator('body').getAttribute('data-playing'),'playing');
      await fp.locator('.audio-status[data-audio-state="idle"]').waitFor();assert.equal(await fp.locator('body').getAttribute('data-playing'),'idle');
    }finally{release();await fp.unroute('**/audio/hello-01.mp3');}
    await fp.route('**/audio/hello-01.mp3',route=>route.fulfill({status:503,contentType:'text/plain',body:'QA unavailable audio'}));
    // A new document represents a real uncached failure, not a buffered replay.
    await fp.reload({waitUntil:'domcontentloaded'});await fp.locator('#hero-start').click();
    await fp.locator('.scene-picture').click();await fp.locator('.audio-status[data-audio-state="error"]').waitFor();assert.equal(await fp.locator('body').getAttribute('data-playing'),'error');assert.equal(await fp.locator('.scene-picture').isEnabled(),true);
    await fp.unroute('**/audio/hello-01.mp3');const recovered=await audio(fp,'.scene-picture .picture-play');await fp.locator('.audio-status[data-audio-state="idle"]').waitFor();assert.equal(await fp.locator('body').getAttribute('data-playing'),'idle');assert.equal(await state(fp),null);
    return {states:['loading','playing','idle','error','playing','idle'],recoveredClip:recovered.src};
  });await feedbackContext.close();
  const learning=await import(require('node:url').pathToFileURL(path.join(root,'src/learning.js')).href);
  let mature=learning.createState('2026-10-01');
  for(let i=0;i<3;i++)mature=learning.recordResult(mature,curriculum.lessons[i].id,'good',`2026-10-0${i+1}`,{isNew:true});
  const heroContext=await context();const hp=await newPage(heroContext);
  await test('Home main entry teaches only the daily new sentence despite due reviews, then repeats it without rewards',async()=>{
    await hp.evaluate(({key,value})=>localStorage.setItem(key,JSON.stringify(value)),{key,value:mature});await hp.reload();await hp.locator('#hero-start').click();
    assert.equal(await hp.locator('.practice-main').getAttribute('data-lesson-id'),'hello-04');assert.match(await hp.locator('.practice-title').innerText(),/先听一听/);assert.equal(await hp.locator('.is-checkup').count(),0);assert.deepEqual(await state(hp),mature);
    await quiz(hp,curriculum.lessons[3]);await hp.locator('[data-rating="good"]').click();await hp.locator('.completion').waitFor();const completed=await state(hp);
    assert.equal(Object.keys(completed.cards).length,4);assert.equal(completed.days['2026-10-08'].results.length,1);assert.equal(completed.days['2026-10-08'].newDone,true);assert.equal(completed.days['2026-10-08'].reviewed.length,0);
    for(const lesson of curriculum.lessons.slice(0,3))assert.deepEqual(completed.cards[lesson.id],mature.cards[lesson.id]);
    await go(hp,'home');assert.equal(await hp.locator('#start-review').isVisible(),true);assert.equal(await hp.locator('#start-checkup').isVisible(),true);
    await hp.locator('#hero-start').click();assert.equal(await hp.locator('.practice-main').getAttribute('data-lesson-id'),'hello-04');await quiz(hp,curriculum.lessons[3]);await hp.locator('[data-rating="good"]').click();await hp.locator('#hero-start').waitFor();assert.deepEqual(await state(hp),completed);
    for(const selector of ['#daily-words','#daily-picture']){await hp.locator(selector).click();assert.equal(await hp.locator('.practice-main').getAttribute('data-lesson-id'),'hello-04');await hp.locator('#exit-session').click();assert.deepEqual(await state(hp),completed);}
    return {dailySentence:'hello-04',dueReviewsKept:3,repeatedPracticeChangesProgress:false};
  });await heroContext.close();
  const finishedContext=await context();const fh=await newPage(finishedContext);
  await test('After all 120 sentences the main entry offers due review, then the checkup, then the garden',async()=>{
    const first='2026-06-09',today='2026-10-08';let allLearned=learning.createState(first);
    for(let index=0;index<curriculum.lessons.length;index++)allLearned=learning.recordResult(allLearned,curriculum.lessons[index].id,'good',learning.addDays(first,index),{isNew:true});
    assert.equal(learning.getDailyPlan(allLearned,curriculum.lessons,today).newLessonId,null);
    await fh.evaluate(({key,value})=>localStorage.setItem(key,JSON.stringify(value)),{key,value:allLearned});await fh.reload();assert.match(await fh.locator('#hero-start').innerText(),/复习/);await fh.locator('#hero-start').click();assert.match(await fh.locator('.practice-title').innerText(),/还记得/);assert.equal(await fh.locator('.is-checkup').count(),0);await fh.locator('#exit-session').click();
    for(const id of learning.getDailyPlan(allLearned,curriculum.lessons,today).dueIds)allLearned=learning.recordResult(allLearned,id,'good',today);
    await fh.evaluate(({key,value})=>localStorage.setItem(key,JSON.stringify(value)),{key,value:allLearned});await fh.reload();assert.match(await fh.locator('#hero-start').innerText(),/小游戏/);await fh.locator('#hero-start').click();assert.equal(await fh.locator('.is-checkup').count(),1);await fh.locator('#exit-session').click();
    allLearned=learning.recordCheckup(allLearned,curriculum.lessons,learning.getCheckupPlan(allLearned,curriculum.lessons,today).ids.map(lessonId=>({lessonId,meaning:true,spoken:'good'})),today);
    await fh.evaluate(({key,value})=>localStorage.setItem(key,JSON.stringify(value)),{key,value:allLearned});await fh.reload();assert.match(await fh.locator('#hero-start').innerText(),/花田/);await fh.locator('#hero-start').click();await fh.locator('.garden-plots').waitFor();assert.deepEqual(await state(fh),allLearned);
    return {learned:120,remainingEntryOrder:['review','checkup','garden']};
  });await finishedContext.close();
  const reviewContext=await context();const rp=await newPage(reviewContext);
  await test('Home names and pictures due reviews; review-only entry never introduces a new lesson',async()=>{
    await rp.evaluate(({key,value})=>localStorage.setItem(key,JSON.stringify(value)),{key,value:mature});await rp.reload();await rp.locator('#start-review').waitFor();
    assert.equal(await rp.locator('[data-review-id]').count(),3);assert.equal(await rp.locator('[data-review-id] .lesson-illustration').count(),3);
    await rp.locator('#start-review').click();assert.match(await rp.locator('.practice-title').innerText(),/还记得/);
    for(const lesson of curriculum.lessons.slice(0,3)){assert.equal(await rp.locator('.practice-main').getAttribute('data-lesson-id'),lesson.id);await rp.locator('[data-step="speak"]').click();await rp.locator('[data-rating="good"]').click();}
    await rp.locator('.completion').waitFor();const after=await state(rp);assert.equal(Object.keys(after.cards).length,3);assert.equal(after.days['2026-10-08'].newDone,false);assert.equal(after.days['2026-10-08'].reviewed.length,3);
    await go(rp,'home');assert.match(await rp.locator('.checkup-invite').innerText(),/今天的句子已经练过啦/);assert.doesNotMatch(await rp.locator('.checkup-invite').innerText(),/2026-10-08 再来玩/);
  });await reviewContext.close();
  const checkupContext=await context();const qp=await newPage(checkupContext);
  await test('Weekly checkup recalls before listening, preserves first choices and separates meaning from prompted speech',async()=>{
    await qp.evaluate(({key,value})=>localStorage.setItem(key,JSON.stringify(value)),{key,value:mature});await qp.reload();await qp.locator('#start-checkup').waitFor();await qp.locator('#start-checkup').click();
    assert.equal(await qp.locator('.practice-english,.practice-chinese,.parent-prompt').count(),0);assert.equal(await qp.locator('.listen-buttons').count(),0);assert.equal(await qp.locator('.scene-picture .lesson-illustration').count(),1);
    assert.deepEqual(await qp.evaluate(()=>window.__qaPlay),[],'silent preloading must not reveal the answer');
    await qp.locator('#exit-session').click();assert.deepEqual(await state(qp),mature);await qp.locator('#start-checkup').click();
    for(let i=0;i<3;i++){
      const lesson=curriculum.lessons[i];assert.equal(await qp.locator('.practice-main').getAttribute('data-lesson-id'),lesson.id);assert.equal(await qp.locator('.practice-english,.practice-chinese').count(),0);
      if(i===1){await audio(qp,'.scene-picture');assert.equal(await qp.locator('#reveal').count(),0);assert.equal(await qp.locator('.practice-english').innerText(),lesson.english);assert.equal(await qp.locator('[data-rating="good"]').isDisabled(),true);await qp.locator('[data-rating="help"]').click();}else await qp.locator(`[data-rating="${i===0?'good':'again'}"]`).click();
      assert.equal(await qp.locator('.choices .lesson-illustration').count(),3);
      if(i===0){await qp.locator(`[data-choice="${(lesson.answerIndex+1)%3}"]`).click();assert.equal(await qp.locator('#quiz-next').isVisible(),false);}
      await qp.locator(`[data-choice="${lesson.answerIndex}"]`).click();await qp.locator('#quiz-next').click();
    }
    await qp.locator('.checkup-completion').waitFor();const after=await state(qp);assert.deepEqual(after.checkups['2026-10-08'],curriculum.lessons.slice(0,3).map((lesson,i)=>({lessonId:lesson.id,meaning:i!==0,spoken:['good','help','again'][i]})));
    assert.deepEqual(after.days,mature.days);assert.match(await qp.locator('.checkup-scores').innerText(),/2 \/ 3/);assert.match(await qp.locator('.checkup-scores').innerText(),/1 \/ 3/);
    for(const lesson of curriculum.lessons.slice(0,3))assert.equal(after.cards[lesson.id].stage,mature.cards[lesson.id].stage);
    await go(qp,'home');assert.equal(await qp.locator('#start-checkup').count(),0);
  });await checkupContext.close();
  const gardenContext=await context({viewport:{width:320,height:844}});const gp=await newPage(gardenContext);
  await test('Garden uses earned materials, one action per plot, daily care and a persistent collection',async()=>{
    await gp.evaluate(({key,value})=>localStorage.setItem(key,JSON.stringify(value)),{key,value:mature});await gp.reload();await gp.locator('#start-today').waitFor();await go(gp,'garden');
    assert.equal(await gp.locator('.garden-plot').count(),3);assert.equal(await gp.locator('[data-material="seeds"] strong').innerText(),'3');await overflow(gp,'mobile garden actions');
    const plot=gp.locator('[data-plot="0"]');assert.equal(await plot.locator('button').count(),1);await plot.locator('[data-garden-action="plant"]').click();assert.equal(await gp.locator('[data-material="seeds"] strong').innerText(),'2');
    await gp.locator('[data-plot="0"] [data-garden-action="water"]').click();assert.equal(await gp.locator('[data-plot="0"] [data-garden-action="water"]').count(),0);assert.equal(await gp.locator('[data-plot="0"] button').count(),1);
    for(const date of ['2026-10-09','2026-10-10']){await gp.clock.setFixedTime(new Date(`${date}T10:00:00+08:00`));await go(gp,'garden');await gp.locator('[data-plot="0"] [data-garden-action="water"]').click();}
    await gp.locator('[data-plot="0"] [data-garden-action="harvest"]').click();assert.match(await gp.locator('[data-collection="sunflower"]').innerText(),/已收集 1 株/);const after=await state(gp);assert.deepEqual(after.days,mature.days);
    await gp.reload();await gp.locator('.garden-plots').waitFor();assert.match(await gp.locator('[data-collection="sunflower"]').innerText(),/已收集 1 株/);assert.deepEqual(await state(gp),after);await overflow(gp,'mobile garden collection');
  });await gardenContext.close();
  const gardenRules=await import(require('node:url').pathToFileURL(path.join(root,'src/garden.js')).href);
  const rewardContext=await context();const gr=await newPage(rewardContext);
  await test('Garden buttons offer only remaining reward-bearing tasks and otherwise wait for tomorrow',async()=>{
    let firstDay=learning.recordResult(learning.createState('2026-10-08'),'hello-01','again','2026-10-08',{isNew:true});
    firstDay=gardenRules.recordGardenAction(firstDay,{type:'plant',plot:0,kind:'sunflower'},'2026-10-08');firstDay=gardenRules.recordGardenAction(firstDay,{type:'water',plot:0},'2026-10-08');
    await gr.evaluate(({key,value})=>localStorage.setItem(key,JSON.stringify(value)),{key,value:firstDay});await gr.reload();await gr.locator('#start-today').waitFor();await go(gr,'garden');
    assert.equal(await gr.locator('[data-garden-action="practice"],[data-garden-action="review"],[data-garden-action="checkup"]').count(),0);
    assert.equal(await gr.locator('[data-plot="0"] button').isDisabled(),true);for(const index of [1,2]){assert.equal(await gr.locator(`[data-plot="${index}"] button`).isDisabled(),true);assert.match(await gr.locator(`[data-plot="${index}"] button`).innerText(),/明天领种子/);}
    await gr.clock.setFixedTime(new Date('2026-10-09T10:00:00+08:00'));await go(gr,'garden');await gr.locator('[data-plot="1"] [data-garden-action="practice"]').click();assert.equal(await gr.locator('.practice-main').getAttribute('data-lesson-id'),'hello-02');assert.match(await gr.locator('.practice-label').innerText(),/认识新朋友/);await gr.locator('#exit-session').click();
    let needsWater=mature;
    for(let plot=0;plot<3;plot++)needsWater=gardenRules.recordGardenAction(needsWater,{type:'plant',plot,kind:gardenRules.PLANTS[plot].id},'2026-10-03');
    for(const date of ['2026-10-03','2026-10-04'])for(let plot=0;plot<3;plot++)needsWater=gardenRules.recordGardenAction(needsWater,{type:'water',plot},date);
    needsWater=learning.recordResult(needsWater,'hello-04','again','2026-10-08',{isNew:true});
    for(const plot of [0,1])needsWater=gardenRules.recordGardenAction(needsWater,{type:'water',plot},'2026-10-08');
    await gr.clock.setFixedTime(new Date('2026-10-08T10:00:00+08:00'));await gr.evaluate(({key,value})=>localStorage.setItem(key,JSON.stringify(value)),{key,value:needsWater});await gr.reload();await gr.locator('.garden-plots').waitFor();
    await gr.locator('[data-plot="2"] [data-garden-action="review"]').click();assert.equal(await gr.locator('.practice-main').getAttribute('data-lesson-id'),'hello-01');assert.match(await gr.locator('.practice-title').innerText(),/还记得/);await gr.locator('#exit-session').click();
    let needsSeed=gardenRules.recordGardenAction(needsWater,{type:'harvest',plot:0},'2026-10-08');needsSeed=gardenRules.recordGardenAction(needsSeed,{type:'plant',plot:0,kind:'sunflower'},'2026-10-08');needsSeed=gardenRules.recordGardenAction(needsSeed,{type:'harvest',plot:1},'2026-10-08');
    await gr.evaluate(({key,value})=>localStorage.setItem(key,JSON.stringify(value)),{key,value:needsSeed});await gr.reload();await gr.locator('.garden-plots').waitFor();await gr.locator('[data-plot="1"] [data-garden-action="checkup"]').click();assert.equal(await gr.locator('.is-checkup').count(),1);assert.equal(await gr.locator('.practice-english').count(),0);assert.deepEqual(await state(gr),needsSeed);
  });await rewardContext.close();
  const storageContext=await context();const st=await newPage(storageContext);
  await test('A learning-state update from another tab stops current and queued practice audio',async()=>{
    const other=await storageContext.newPage();await other.goto(origin,{waitUntil:'networkidle'});await other.locator('#start-today').waitFor();
    await st.locator('#start-today').click();await st.locator('[data-step="choose"]').click();await audio(st,'[data-listen="slow"]',0.8);
    await other.evaluate(({key,value})=>localStorage.setItem(key,JSON.stringify(value)),{key,value:mature});await st.locator('#start-today').waitFor();
    assert.equal(await st.evaluate(()=>window.__qaAudio.filter(audio=>!audio.paused&&!audio.ended).length),0);const played=await st.evaluate(()=>window.__qaPlay.length);await st.waitForTimeout(250);assert.equal(await st.evaluate(()=>window.__qaPlay.length),played);assert.deepEqual(await state(st),mature);assert.equal(await st.locator('.practice-shell').count(),0);
  });await storageContext.close();
  const avatarKey='english-sprout-avatar-v1';
  const avatarContext=await context();const av=await newPage(avatarContext);const avatarTraffic=[];
  avatarContext.on('request',request=>{if(!['GET','HEAD'].includes(request.method()))avatarTraffic.push({url:request.url(),method:request.method()});});
  await test('Six animal presets are selectable and persist separately from learning progress',async()=>{
    const before=await state(av);await av.locator('#avatar-open').click();await av.locator('dialog.avatar-picker[open]').waitFor();
    assert.equal(await av.locator('[data-avatar-animal]').count(),6);assert.equal(await av.locator('#avatar-camera-file').getAttribute('capture'),'user');
    await av.locator('[data-avatar-animal="cat"]').click();await av.waitForFunction(key=>JSON.parse(localStorage.getItem(key)||'null')?.animal==='cat',avatarKey);
    const preset=await av.evaluate(key=>JSON.parse(localStorage.getItem(key)),avatarKey);assert.deepEqual(preset,{version:1,kind:'preset',animal:'cat'});
    if(await av.locator('dialog.avatar-picker[open]').count())await av.locator('#avatar-close').click();
    await av.reload();await av.locator('#avatar-open').waitFor();assert.deepEqual(await av.evaluate(key=>JSON.parse(localStorage.getItem(key)),avatarKey),preset);assert.deepEqual(await state(av),before);
    return {presets:6,selected:'cat',learningUnchanged:true};
  });
  let savedAvatar;
  await test('A local selfie is composed only after Save, stays out of learning backups and remains available offline',async()=>{
    const before=await state(av),fixture=await av.evaluate(()=>{const canvas=document.createElement('canvas');canvas.width=600;canvas.height=800;const ctx=canvas.getContext('2d');ctx.fillStyle='#edd8bb';ctx.fillRect(0,0,600,800);ctx.fillStyle='#9c6d52';ctx.beginPath();ctx.arc(300,370,150,0,Math.PI*2);ctx.fill();return canvas.toDataURL('image/png').split(',')[1];});
    await av.locator('#avatar-open').click();await av.locator('[data-avatar-mode="photo"]').click();
    const previous=await av.evaluate(key=>localStorage.getItem(key),avatarKey);
    await av.locator('#avatar-photo-file').setInputFiles({name:'local-qa-portrait.png',mimeType:'image/png',buffer:Buffer.from(fixture,'base64')});
    await av.waitForFunction(()=>!document.querySelector('#avatar-save-photo').disabled);assert.equal(await av.evaluate(key=>localStorage.getItem(key),avatarKey),previous);
    await av.locator('[data-avatar-animal="fox"]').click();await av.locator('#avatar-save-photo').click();
    await av.waitForFunction(key=>JSON.parse(localStorage.getItem(key)||'null')?.kind==='photo',avatarKey);savedAvatar=await av.evaluate(key=>JSON.parse(localStorage.getItem(key)),avatarKey);
    assert.equal(savedAvatar.animal,'fox');assert.match(savedAvatar.image,/^data:image\/jpeg;base64,/);assert.deepEqual(await state(av),before);assert.deepEqual(avatarTraffic,[]);
    if(await av.locator('dialog.avatar-picker[open]').count())await av.locator('#avatar-close').click();
    await go(av,'parent');const pending=av.waitForEvent('download');await av.locator('#export-progress').click();const download=await pending;const exportFile=path.join(output,'qa-avatar-learning-backup.json');await download.saveAs(exportFile);
    const exported=fs.readFileSync(exportFile,'utf8');assert.doesNotMatch(exported,/data:image|english-sprout-avatar|local-qa-portrait/);assert.equal(JSON.parse(exported).app,'english-sprout');
    await go(av,'home');await waitSW(av);await avatarContext.setOffline(true);await av.reload({waitUntil:'domcontentloaded'});await av.locator('#avatar-open').waitFor();
    await av.waitForFunction(()=>{const image=document.querySelector('[data-user-avatar] img');return image?.complete&&image.naturalWidth>0;});assert.equal(await av.locator('[data-user-avatar] img').getAttribute('src'),savedAvatar.image);assert.deepEqual(await av.evaluate(key=>JSON.parse(localStorage.getItem(key)),avatarKey),savedAvatar);
    assert.deepEqual(await state(av),before);await avatarContext.setOffline(false);return {animal:'fox',savedOnlyOnRequest:true,photoInLearningBackup:false,offline:true,writeRequests:avatarTraffic.length};
  });
  await test('Deleting the saved selfie removes local photo data and returns to an animal preset',async()=>{
    await av.locator('#avatar-open').click();await av.locator('[data-avatar-mode="photo"]').click();await av.locator('#avatar-delete-photo').click();
    await av.waitForFunction(key=>JSON.parse(localStorage.getItem(key)||'null')?.kind!=='photo',avatarKey);
    const after=await av.evaluate(key=>localStorage.getItem(key),avatarKey);assert.doesNotMatch(after||'',/data:image/);
    if(await av.locator('dialog.avatar-picker[open]').count())await av.locator('#avatar-close').click();await av.reload();await av.locator('#avatar-open').waitFor();assert.equal(await av.locator('[data-user-avatar] img[src^="data:"]').count(),0);assert.equal(await state(av),null);assert.deepEqual(await av.evaluate(()=>window.__qaErrors),[]);return {photoRemoved:true};
  });await avatarContext.close();
  await browser.close();
  const report={name:reportName,url:origin,date:reportDate,browser:'Microsoft Edge Chromium headless',networkBudgets:{navigationMs:navigationTimeout,offlineMs:offlineTimeout},checks,passed:checks.filter(c=>c.status==='PASS').length,failed:checks.filter(c=>c.status==='FAIL').length};
  fs.writeFileSync(path.join(output,'browser-results.json'),JSON.stringify(report,null,2));
  const md=`# 浏览器集成验证\n\n验证日期：${reportDate}。实际运行 Microsoft Edge Chromium / Playwright，地址 ${origin}。\n\n结果：${report.passed} 项通过，${report.failed} 项失败。\n\n`+checks.map(c=>`- **${c.status}** ${c.name}${c.status==='FAIL'?`\n  - ${c.error.split('\n')[0]}`:''}`).join('\n')+`\n\n## 范围与限制\n\n- 桌面宽度 1440px，移动视口 390px 与 320px；截图见 ${path.relative(root,output).replaceAll('\\','/')}。移动视口不是实体 iPhone Safari / Android 测试。\n- 检查 MP3 的真实浏览器播放事件、时长和速度；未进行人工逐句听音。\n- 录音成功路径使用 Edge 假麦克风设备与真实 MediaRecorder；拒绝路径注入 NotAllowedError。\n- 日期通过 Playwright clock 固定在中国时区，验证次日复习。\n- 离线用 service worker 缓存＋浏览器断网模拟，不等同于验证全国移动网络或系统长期缓存保留。\n- 报告对应验证地址 ${origin} 当时返回的版本；本地修改须重建，正式网页须部署后再复验。\n`;
  fs.writeFileSync(path.join(output,'UI_QA.md'),md);
  fs.writeFileSync(summaryPath,md);
  console.log(JSON.stringify({name:reportName,passed:report.passed,failed:report.failed,report:path.join(output,'browser-results.json'),summary:summaryPath}));
  process.exitCode=report.failed?1:0;
})().catch(async e=>{console.error(e);if(browser)await browser.close();process.exitCode=1;});
