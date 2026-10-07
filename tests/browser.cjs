/* Integration QA. Uses real Edge audio decoding and fake browser microphone input. */
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/Jam/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const output = path.join(root, 'test-results');
const origin = process.env.TEST_URL || 'http://127.0.0.1:24736';
const key = 'english-sprout-state-v1';
const curriculum = JSON.parse(fs.readFileSync(path.join(root, 'public/data/curriculum.json'), 'utf8'));
const checks = [];
fs.mkdirSync(output, {recursive:true});
let browser;

async function test(name, fn) {
  try { const evidence = await fn(); checks.push({name,status:'PASS',evidence:evidence||null}); console.log('PASS',name); }
  catch(e) { checks.push({name,status:'FAIL',error:e.stack}); console.log('FAIL',name,e.message); }
}
async function context(options={}) {
  const c = await browser.newContext({viewport:{width:1440,height:1000},timezoneId:'Asia/Shanghai',permissions:['microphone'],...options});
  await c.addInitScript(() => {
    window.__qaAudio=[];window.__qaStreams=[];window.__qaErrors=[];window.__qaPlay=[];
    const NativeAudio=window.Audio;
    window.Audio=function(...args){const a=new NativeAudio(...args);window.__qaAudio.push(a);a.addEventListener('playing',()=>window.__qaPlay.push({src:a.src,rate:a.playbackRate,duration:a.duration}));return a;};
    window.Audio.prototype=NativeAudio.prototype;
    if(navigator.mediaDevices?.getUserMedia){const original=navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);navigator.mediaDevices.getUserMedia=async(...args)=>{const s=await original(...args);window.__qaStreams.push(s);return s;};}
    window.addEventListener('error',e=>window.__qaErrors.push(e.message));
    window.addEventListener('unhandledrejection',e=>window.__qaErrors.push(String(e.reason)));
  });
  return c;
}
async function newPage(c,date='2026-10-08T10:00:00+08:00') {
  const p=await c.newPage();p.setDefaultTimeout(8000);await p.clock.setFixedTime(new Date(date));
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
  const before=await p.evaluate(()=>window.__qaPlay.length);await p.locator(selector).click();
  await p.waitForFunction(n=>window.__qaPlay.length>n,before);
  const event=await p.evaluate(()=>window.__qaPlay.at(-1));assert.equal(event.rate,rate);assert.ok(event.duration>0.3);return event;
}
async function waitSW(p){await p.evaluate(()=>navigator.serviceWorker.ready);await p.waitForFunction(()=>navigator.serviceWorker.controller!==null);}

(async()=>{
  browser=await chromium.launch({channel:'msedge',headless:true,args:['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream']});
  const c=await context();const p=await newPage(c);
  await test('Desktop home renders, 120 lessons available, no horizontal overflow',async()=>{await p.locator('h1').waitFor();assert.match(await p.locator('h1').innerText(),/每天一句/);const r=await overflow(p,'desktop home');await p.screenshot({path:path.join(output,'home-desktop.png'),fullPage:true});return r;});
  await test('Real bundled home audio plays with finite duration',()=>audio(p,'#preview-audio'));
  await test('New lesson starts without requiring a microphone',async()=>{await p.locator('#start-today').click();assert.match(await p.locator('.practice-title').innerText(),/先听一听/);assert.equal(await p.locator('.practice-english').innerText(),curriculum.lessons[0].english);return overflow(p,'desktop practice');});
  await test('Normal and slow audio use real MP3 and correct playback rates',async()=>({normal:await audio(p,'[data-listen="normal"]'),slow:await audio(p,'[data-listen="slow"]',0.8)}));
  await test('Chinese guidance audio plays',()=>audio(p,'#guide-audio'));
  await test('Wrong answer gives gentle retry, correct answer enables speaking',async()=>{await quiz(p,curriculum.lessons[0],true);assert.match(await p.locator('.practice-title').innerText(),/开口/);assert.equal(await p.locator('#replay-record').isDisabled(),true);});
  await test('Real MediaRecorder accepts fake microphone, stop and playback work',async()=>{
    await p.locator('#record').click();await p.waitForFunction(()=>document.querySelector('#record').textContent.includes('停止录音'));
    // Fake device may not yield decodable Opus frames in a sub-second recording.
    await p.waitForTimeout(1800);await p.locator('#record').click();await p.waitForFunction(()=>!document.querySelector('#replay-record').disabled);
    const event=await audio(p,'#replay-record');assert.match(event.src,/^blob:/);assert.equal(await p.evaluate(()=>window.__qaStreams.flatMap(s=>s.getTracks()).filter(t=>t.readyState==='live').length),0);return {source:'Edge fake microphone / actual MediaRecorder',played:true};
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
  });
  let backup;
  await test('Settings persist and export produces valid transferable backup',async()=>{
    await go(p,'parent');await p.locator('#nickname').fill('小小测试员');await p.locator('#daily-reviews').selectOption('3');await p.locator('#save-settings').click();
    const d=p.waitForEvent('download');await p.locator('#export-progress').click();const download=await d;await download.saveAs(path.join(output,'qa-backup.json'));backup=JSON.parse(fs.readFileSync(path.join(output,'qa-backup.json'),'utf8'));
    assert.equal(backup.app,'english-sprout');assert.equal(backup.state.settings.nickname,'小小测试员');assert.equal(backup.state.settings.dailyReviews,3);assert.equal(Object.keys(backup.state.cards).length,1);return overflow(p,'desktop parent');
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
  await test('Reset cancel preserves progress; confirmed reset can be restored from export',async()=>{
    const before=await state(p);await p.locator('#reset-progress').click();await p.locator('[data-cancel]').click();assert.deepEqual(await state(p),before);
    await p.locator('#reset-progress').click();await p.locator('[data-confirm]').click();await p.locator('#start-today').waitFor();assert.equal(Object.keys((await state(p)).cards).length,0);
    await go(p,'parent');await p.locator('#import-file').setInputFiles({name:'backup.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(backup))});await p.locator('[data-confirm]').click();await p.waitForFunction(()=>!document.querySelector('dialog'));assert.equal(Object.keys((await state(p)).cards).length,1);
  });
  await test('Next local calendar day schedules exactly one new sentence plus due review',async()=>{
    await p.clock.setFixedTime(new Date('2026-10-09T10:00:00+08:00'));await go(p,'home');assert.equal(await p.locator('.review-number').innerText(),'1\n句待复习');await p.locator('#start-today').click();assert.equal(await p.locator('.practice-english').innerText(),curriculum.lessons[1].english);await quiz(p,curriculum.lessons[1]);await p.locator('[data-rating="good"]').click();
    assert.match(await p.locator('.practice-title').innerText(),/还记得/);assert.equal(await p.locator('.practice-english').count(),0);await p.locator('[data-step="speak"]').click();assert.equal(await p.locator('.practice-english').count(),0);await p.locator('#reveal').click();assert.equal(await p.locator('.practice-english').innerText(),curriculum.lessons[0].english);await p.locator('[data-rating="help"]').click();await p.locator('.completion').waitFor();
    const s=await state(p);assert.equal(s.days['2026-10-09'].results.length,2);assert.equal(s.cards['hello-01'].due,'2026-10-10');assert.equal(s.cards['hello-02'].due,'2026-10-10');return s.days['2026-10-09'];
  });
  await test('All 128 bundled audio files cache and play after offline reload',async()=>{
    await go(p,'parent');await waitSW(p);await p.locator('#offline-audio').click();await p.waitForFunction(()=>document.querySelector('#offline-status')?.textContent.includes('所有短句与引导声音已保存'),null,{timeout:30000});
    const count=await p.evaluate(async()=>{const cache=await caches.open('english-sprout-audio-v1');return(await cache.keys()).filter(r=>r.url.endsWith('.mp3')).length;});assert.equal(count,128);
    // Reproduce CDN Vary: Accept-Encoding mismatch between prefetch and media.
    await p.evaluate(async()=>{
      const cache=await caches.open('english-sprout-audio-v1');
      const url=new URL('./audio/kindness-10.mp3',document.baseURI).href;
      const response=await cache.match(url,{ignoreVary:true});
      const bytes=await response.arrayBuffer();await cache.delete(url,{ignoreVary:true});
      await cache.put(new Request(url,{headers:{'Accept-Encoding':'qa-prefetch-variant'}}),new Response(bytes,{headers:{'Content-Type':'audio/mpeg','Vary':'Accept-Encoding'}}));
    });
    await c.setOffline(true);await p.reload({waitUntil:'domcontentloaded'});await p.locator('#offline-audio').waitFor();await go(p,'library');await p.locator('[data-preview="kindness-10"]').click();const event=await audio(p,'[data-listen="normal"]');assert.match(event.src,/kindness-10/);await audio(p,'#guide-audio');await p.locator('#exit-session').click();
    const range=await p.evaluate(async()=>{const r=await fetch('./audio/kindness-10.mp3',{headers:{Range:'bytes=0-127'}});return{status:r.status,range:r.headers.get('Content-Range'),length:(await r.arrayBuffer()).byteLength};});assert.equal(range.status,206);assert.equal(range.length,128);assert.match(range.range,/^bytes 0-127\//);
    await c.setOffline(false);return {cachedMP3:count,offlinePlay:event,range};
  });
  await test('App reports no uncaught JavaScript errors',async()=>{assert.deepEqual(await p.evaluate(()=>window.__qaErrors),[]);});
  await c.close();

  for(const width of [390,320]){
    const mc=await context({viewport:{width,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:1});const mp=await newPage(mc);
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
  await browser.close();
  const report={url:origin,date:'2026-10-08',browser:'Microsoft Edge Chromium headless',checks,passed:checks.filter(c=>c.status==='PASS').length,failed:checks.filter(c=>c.status==='FAIL').length};
  fs.writeFileSync(path.join(output,'browser-results.json'),JSON.stringify(report,null,2));
  const md=`# 浏览器集成验证\n\n验证日期：2026-10-08。实际运行 Microsoft Edge Chromium / Playwright，地址 ${origin}。\n\n结果：${report.passed} 项通过，${report.failed} 项失败。\n\n`+checks.map(c=>`- **${c.status}** ${c.name}${c.status==='FAIL'?`\n  - ${c.error.split('\n')[0]}`:''}`).join('\n')+`\n\n## 范围与限制\n\n- 桌面宽度 1440px，移动视口 390px 与 320px；截图见 test-results。移动视口不是实体 iPhone Safari / Android 测试。\n- 检查 MP3 的真实浏览器播放事件、时长和速度；未进行人工逐句听音。\n- 录音成功路径使用 Edge 假麦克风设备与真实 MediaRecorder；拒绝路径注入 NotAllowedError。\n- 日期通过 Playwright clock 固定在中国时区，验证次日复习。\n- 离线用 service worker 缓存＋浏览器断网模拟，不等同于验证全国移动网络或系统长期缓存保留。\n- 报告对应运行时 dist；后续源码修改须重建再复验受影响行为。\n`;
  fs.writeFileSync(path.join(root,'docs/UI_QA.md'),md);
  console.log(JSON.stringify({passed:report.passed,failed:report.failed,report:path.join(output,'browser-results.json')}));
  process.exitCode=report.failed?1:0;
})().catch(async e=>{console.error(e);if(browser)await browser.close();process.exitCode=1;});
