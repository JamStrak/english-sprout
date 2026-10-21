/* Daily welcome acceptance against an already-built internal candidate.
 * Run: npm run build:dev; node tests/xiaoya-welcome-browser.cjs
 * Owns a temporary loopback server and disposable browser profiles. Never
 * connects to the live app, changes a build, or reads a real child's records.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const http = require('node:http');
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/Jam/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root = path.resolve(__dirname, '..'), dist = path.join(root, 'dist');
const out = path.join(root, 'test-results', 'xiaoya-welcome-browser');
const filter = process.env.XIAOYA_TEST_FILTER ? new RegExp(process.env.XIAOYA_TEST_FILTER) : null;
const MEADOW_KEY = 'xiaoya-english:meadow:v1';
const LEARNING_KEYS = ['xiaoya-english:state:v1', 'xiaoya-english:practice-plan:v1', 'xiaoya-english:challenges:v1'];
const FIRST_DAY = '2026-10-21', SECOND_DAY = '2026-10-22';
const forbidden = /(?:\/(?:speech|models?)\/|\/speech-local\.js|\.(?:onnx|wasm)(?:\?|$)|vosk|whisper)/i;
const mime = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.webmanifest':'application/manifest+json','.webp':'image/webp','.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml','.mp3':'audio/mpeg'};
const report = {startedAt:new Date().toISOString(), checks:[], scope:{isolatedProfiles:true, temporaryLoopbackServer:true, nativeMedia:true, microphoneUsed:false, realLearningRecordsChanged:false, filter:filter?.source || null}};
let server, browser, origin;

async function serve() {
  server = http.createServer(async(req, res) => {
    try {
      let name = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
      if (name.endsWith('/')) name += 'index.html';
      const file = path.resolve(dist, '.' + name), relative = path.relative(dist, file);
      if (relative.startsWith('..') || path.isAbsolute(relative)) return res.writeHead(403).end();
      const stat = await fsp.stat(file);
      if (!stat.isFile()) throw Error('Not a file');
      let start = 0, end = stat.size - 1, status = 200;
      const headers = {'Content-Type':mime[path.extname(file)] || 'application/octet-stream', 'Cache-Control':'no-store', 'Accept-Ranges':'bytes'};
      if (req.headers.range) {
        const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range);
        if (!range || (!range[1] && !range[2])) return res.writeHead(416).end();
        if (range[1]) { start = Number(range[1]); if (range[2]) end = Math.min(end, Number(range[2])); }
        else start = Math.max(0, stat.size - Number(range[2]));
        if (start > end || start >= stat.size) return res.writeHead(416).end();
        status = 206; headers['Content-Range'] = `bytes ${start}-${end}/${stat.size}`;
      }
      headers['Content-Length'] = end - start + 1;
      res.writeHead(status, headers);
      if (req.method === 'HEAD') res.end();
      else fs.createReadStream(file, {start,end}).on('error', () => res.destroy()).pipe(res);
    } catch { if (!res.headersSent) res.writeHead(404); res.end('Missing test candidate'); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return `http://127.0.0.1:${server.address().port}`;
}

async function fixture(width = 1180, height = 900) {
  const context = await browser.newContext({viewport:{width,height}, timezoneId:'Asia/Shanghai', serviceWorkers:'block', reducedMotion:'reduce', hasTouch:width<600, isMobile:width<600});
  const f = {context, pages:[], requests:[], errors:[], microphone:0, width, height};
  await context.exposeBinding('qaWelcomeMicAccess', () => { f.microphone++; });
  context.on('request', request => f.requests.push(request.url()));
  await context.route('**/*', route => new URL(route.request().url()).origin === origin && !forbidden.test(route.request().url()) ? route.continue() : route.abort('blockedbyclient'));
  await context.addInitScript(({origin, firstDay, meadowKey}) => {
    if (location.origin !== origin) return;
    if (!localStorage.getItem('qa-welcome-child-sentinel')) {
      localStorage.setItem('qa-welcome-child-sentinel', 'keep-this-disposable-child-record');
      localStorage.setItem('xiaoya-english:preferences:v1', JSON.stringify({welcome:true, mic:false, guideStep:'done'}));
    }
    // Change only the local calendar. Real timer durations continue to advance,
    // so native media and the app's animation/idle clocks are not frozen.
    const RealDate = Date;
    let offset = 0;
    const setDay = day => {
      sessionStorage.setItem('qa-welcome-day', day);
      offset = new RealDate(`${day}T12:00:00+08:00`).getTime() - RealDate.now();
    };
    setDay(sessionStorage.getItem('qa-welcome-day') || firstDay);
    class CalendarDate extends RealDate {
      constructor(...args) { super(...(args.length ? args : [RealDate.now() + offset])); }
      static now() { return RealDate.now() + offset; }
    }
    window.Date = CalendarDate;
    const qa = window.qaWelcome = {setDay, failWrites:false, failedWrites:0, play:[], errors:[]};
    const setItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function(key, value) {
      if (this === localStorage && key === meadowKey && qa.failWrites) {
        qa.failedWrites++;
        throw new DOMException('Isolated welcome test: storage is full', 'QuotaExceededError');
      }
      return setItem.call(this, key, value);
    };
    if (navigator.mediaDevices) navigator.mediaDevices.getUserMedia = () => {
      void window.qaWelcomeMicAccess(); throw Error('Welcome tests must never request the microphone');
    };
    const play = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function() {
      this.playbackRate = 4;
      const item = {url:this.currentSrc || this.src, playing:false, ended:false, error:false};
      qa.play.push(item);
      this.addEventListener('playing', () => { item.url = this.currentSrc || this.src; item.playing = true; }, {once:true});
      this.addEventListener('ended', () => { item.ended = true; }, {once:true});
      this.addEventListener('error', () => { item.error = true; }, {once:true});
      return play.call(this);
    };
    addEventListener('unhandledrejection', event => qa.errors.push(String(event.reason)));
  }, {origin, firstDay:FIRST_DAY, meadowKey:MEADOW_KEY});
  f.page = await newPage(f);
  await goHome(f.page);
  f.learning = await learningSnapshot(f.page);
  return f;
}

async function newPage(f) {
  const page = await f.context.newPage();
  page.setDefaultTimeout(18000);
  page.on('pageerror', error => f.errors.push(error.message));
  f.pages.push(page);
  return page;
}
async function goHome(page) {
  await page.goto(`${origin}/xiaoya/?garden=b`, {waitUntil:'domcontentloaded'});
  await page.locator('main.home-view').waitFor();
}
const snapshot = page => page.evaluate(() => Object.fromEntries(Object.keys(localStorage).sort().map(key => [key, localStorage.getItem(key)])));
const learningSnapshot = page => page.evaluate(keys => Object.fromEntries(keys.map(key => [key, localStorage.getItem(key)])), LEARNING_KEYS);
const savedMeadow = page => page.evaluate(key => JSON.parse(localStorage.getItem(key) || 'null'), MEADOW_KEY);
async function bridge(page, method, ...args) {
  return page.evaluate(async({method,args}) => {
    const {gmBridge} = await import(new URL('experience.js', document.querySelector('script[type="module"][src]').src));
    return gmBridge[method](...args);
  }, {method,args});
}
async function press(page, selector) {
  const target = page.locator(selector).first();
  await target.waitFor({state:'visible'});
  assert(await target.isEnabled(), `Disabled action: ${selector}`);
  await target.scrollIntoViewIfNeeded();
  const point = await target.evaluate(element => {
    const r = element.getBoundingClientRect(), x = r.x + r.width/2, y = r.y + r.height/2;
    return {x,y,hit:element.contains(document.elementFromPoint(x,y))};
  });
  assert(point.hit, `Covered action: ${selector}`);
  if (page.viewportSize().width < 600) await page.touchscreen.tap(point.x,point.y);
  else await page.mouse.click(point.x,point.y);
}
async function openGift(page) {
  await press(page, '[data-action="welcome-gift"]');
  await page.locator('main.welcome-gift-view[data-gift-phase="wrapped"]').waitFor();
}
async function claim(page, kind) {
  await press(page, '[data-action="open-welcome-gift"]');
  await page.locator(`main.welcome-gift-view[data-gift-phase="opened"][data-gift-kind="${kind}"]`).waitFor();
}
async function noLearning(f, page = f.page) {
  assert.deepEqual(await learningSnapshot(page), f.learning, 'A welcome gift changed learning, review, or challenge records');
  const state = await bridge(page, 'inspect');
  assert.equal(state.practiceCount, 0, 'A gift was recorded as practice');
  assert.equal(state.evidenceCount, 0, 'A gift was recorded as learning evidence');
  assert.equal(state.challengeAttempts, 0, 'A gift was recorded as a challenge attempt');
  assert.equal(state.challengeRewards, 0, 'A gift was recorded as a challenge prize');
  return state;
}
async function verifyGift(page, expected) {
  const meadow = await savedMeadow(page);
  assert.equal(meadow.schemaVersion, 4);
  assert.deepEqual(meadow.welcomeGifts, expected.gifts);
  assert.equal(meadow.shells, expected.shells);
  assert.equal(meadow.water, expected.water);
  assert.deepEqual(meadow.rounds, [], 'Welcome gifts must not create reward rounds');
  assert.deepEqual(meadow.challengeRewards, []);
  assert.deepEqual(meadow.challengeSeeds, []);
  return {shells:meadow.shells, water:meadow.water, welcomeGifts:meadow.welcomeGifts};
}
const overlap = (a,b) => Math.min(a.right,b.right)-Math.max(a.left,b.left)>1 && Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)>1;
async function layout(page, selector) {
  const geometry = await page.evaluate(selector => {
    const controls = [...document.querySelectorAll(selector)].filter(element => element.getClientRects().length).map(element => {
      const r = element.getBoundingClientRect();
      return {action:element.dataset.action, left:r.left, top:r.top, right:r.right, bottom:r.bottom, width:r.width, height:r.height,
        hit:element.contains(document.elementFromPoint(r.left+r.width/2, r.top+r.height/2))};
    });
    return {width:innerWidth, height:innerHeight, scrollWidth:document.documentElement.scrollWidth, scrollHeight:document.documentElement.scrollHeight, controls};
  }, selector);
  assert(geometry.controls.length > 0, 'No welcome controls found');
  assert(geometry.scrollWidth <= geometry.width+1, `Horizontal overflow: ${JSON.stringify(geometry)}`);
  assert(geometry.scrollHeight <= geometry.height+1, `Welcome needs scrolling: ${JSON.stringify(geometry)}`);
  for (const control of geometry.controls) {
    assert(control.width >= 48 && control.height >= 48, `Touch target under 48px: ${JSON.stringify(control)}`);
    assert(control.left >= 0 && control.top >= 0 && control.right <= geometry.width && control.bottom <= geometry.height, `Control outside viewport: ${JSON.stringify(control)}`);
    assert(control.hit, `Control is covered: ${JSON.stringify(control)}`);
  }
  for (let i=0; i<geometry.controls.length; i++) for (let j=i+1; j<geometry.controls.length; j++) {
    assert(!overlap(geometry.controls[i], geometry.controls[j]), `Overlapping controls: ${JSON.stringify(geometry)}`);
  }
  return geometry;
}
async function clean(f) {
  assert.equal(f.microphone, 0, 'A welcome action accessed the real microphone');
  assert.deepEqual(f.requests.filter(url => forbidden.test(url)), [], 'Welcome downloaded a speech recognition runtime');
  assert.deepEqual(f.errors, [], 'Page JavaScript errors');
  for (const page of f.pages) if (!page.isClosed()) assert.deepEqual(await page.evaluate(() => qaWelcome.errors), [], 'Unhandled page rejection');
}
async function check(name, run, width, height) {
  if (filter && !filter.test(name)) return;
  let f;
  const start = Date.now();
  try {
    f = await fixture(width,height);
    const detail = await run(f);
    await clean(f);
    await f.page.screenshot({path:path.join(out, `${name}.png`), animations:'disabled'});
    report.checks.push({name,status:'PASS',ms:Date.now()-start,detail});
    console.log('PASS', name);
  } catch (error) {
    process.exitCode = 1;
    report.checks.push({name,status:'FAIL',ms:Date.now()-start,error:error.stack});
    console.error('FAIL', name, error.stack);
    await f?.page.screenshot({path:path.join(out, `${name}-failed.png`), animations:'disabled',fullPage:true}).catch(() => {});
  } finally { await f?.context.close(); }
}

async function main() {
  await fsp.mkdir(out, {recursive:true});
  report.candidate = JSON.parse(await fsp.readFile(path.join(dist,'xiaoya/version.json'),'utf8'));
  assert.equal(report.candidate.channel, 'internal', 'Build the internal candidate before running welcome + GM acceptance');
  origin = await serve();
  browser = await chromium.launch({channel:'msedge',headless:true,args:['--no-proxy-server','--autoplay-policy=no-user-gesture-required']});

  await check('optional-gift-persistent-idempotent-no-learning', async f => {
    const p = f.page;
    assert.equal(await p.locator('main.welcome-gift-view,[role="dialog"]').count(), 0, 'Home must not force a welcome popup');
    assert.equal(await p.locator('.home-view .primary-wrap').count(), 1, 'The learning primary action remains singular');
    assert.equal(await p.locator('[data-action="welcome-gift"]').count(), 1);
    assert.equal(await savedMeadow(p), null, 'Showing home must not give a reward');
    await openGift(p);
    assert.equal(await savedMeadow(p), null, 'Looking at an unopened gift must not claim it');
    await claim(p, 'shells');
    const wallet = await verifyGift(p, {shells:1,water:0,gifts:[{date:FIRST_DAY,kind:'shells'}]});
    assert.equal((await noLearning(f)).welcomeGifts, 1);
    await press(p, '[data-action="welcome-gift-voice"]');
    await p.waitForFunction(() => qaWelcome.play.some(item => /welcome-gift-shell\.mp3(?:\?|$)/.test(item.url) && item.playing && item.ended));
    const shellAudio = await p.evaluate(() => qaWelcome.play.find(item => /welcome-gift-shell\.mp3(?:\?|$)/.test(item.url) && item.playing && item.ended));
    await p.reload({waitUntil:'domcontentloaded'});
    await p.locator('main.home-view').waitFor();
    assert.equal(await p.locator('[data-action="welcome-gift"]').count(), 0, 'A same-day gift reappeared after refresh');
    await verifyGift(p, {shells:1,water:0,gifts:[{date:FIRST_DAY,kind:'shells'}]});
    await noLearning(f);
    return {wallet,nativeShellAudio:shellAudio};
  });

  await check('local-day-rotation-and-clock-rollback', async f => {
    const p = f.page;
    await openGift(p); await claim(p,'shells');
    await p.evaluate(day => qaWelcome.setDay(day), SECOND_DAY);
    await p.reload({waitUntil:'domcontentloaded'}); await p.locator('main.home-view').waitFor();
    await openGift(p); await claim(p,'water');
    const expected = {shells:1,water:1,gifts:[{date:FIRST_DAY,kind:'shells'},{date:SECOND_DAY,kind:'water'}]};
    const wallet = await verifyGift(p, expected);
    await press(p, '[data-action="welcome-gift-voice"]');
    await p.waitForFunction(() => qaWelcome.play.some(item => /welcome-gift-water\.mp3(?:\?|$)/.test(item.url) && item.playing && item.ended));
    await press(p, 'main.welcome-gift-view [data-action="garden"]');
    await p.locator('main.meadow-view').waitFor();
    await noLearning(f);
    await p.evaluate(day => qaWelcome.setDay(day), FIRST_DAY);
    await p.reload({waitUntil:'domcontentloaded'}); await p.locator('main.home-view').waitFor();
    assert.equal(await p.locator('[data-action="welcome-gift"]').count(), 0, 'Turning the clock back allowed another gift');
    await verifyGift(p, expected); await noLearning(f);
    return {wallet,waterPurposeAudioDecoded:true,gardenEntryWorks:true,clockRollbackReward:false};
  });

  await check('purpose-audio-cancels-pending-lesson-navigation', async f => {
    const p = f.page;
    await openGift(p); await claim(p,'shells');
    const firstPlay = await p.evaluate(() => qaWelcome.play.length);
    await press(p, '[data-action="welcome-play"]');
    await p.waitForFunction(from => qaWelcome.play.slice(from).some(item => /welcome-gift-play\.mp3(?:\?|$)/.test(item.url) && item.playing && !item.ended), firstPlay);
    const purposePlay = await p.evaluate(() => qaWelcome.play.length);
    await press(p, '[data-action="welcome-gift-voice"]');
    await p.waitForFunction(from => qaWelcome.play.slice(from).some(item => /welcome-gift-shell\.mp3(?:\?|$)/.test(item.url) && item.playing && !item.ended), purposePlay);
    assert.equal((await bridge(p,'inspect')).page, 'welcome-gift', 'Cancelled continue audio navigated away while gift-purpose audio was playing');
    await p.waitForFunction(from => qaWelcome.play.slice(from).some(item => /welcome-gift-shell\.mp3(?:\?|$)/.test(item.url) && item.playing && item.ended), purposePlay);
    assert.equal((await bridge(p,'inspect')).page, 'welcome-gift', 'Hearing the gift purpose unexpectedly started a lesson');
    const cancelledContinue = await p.evaluate(from => qaWelcome.play.slice(from).find(item => /welcome-gift-play\.mp3(?:\?|$)/.test(item.url)), firstPlay);
    assert.equal(cancelledContinue.ended, false, 'The test did not cancel an active continue narration');
    await noLearning(f);
    const retryPlay = await p.evaluate(() => qaWelcome.play.length);
    await press(p, '[data-action="welcome-play"]');
    await p.locator('main.event-view').waitFor({timeout:30000});
    const completedContinue = await p.evaluate(from => qaWelcome.play.slice(from).find(item => /welcome-gift-play\.mp3(?:\?|$)/.test(item.url) && item.playing && item.ended), retryPlay);
    assert(completedContinue, 'Retry entered learning before its continue narration finished');
    await verifyGift(p, {shells:1,water:0,gifts:[{date:FIRST_DAY,kind:'shells'}]});
    await noLearning(f);
    return {cancelledContinue,completedContinue,purposeStayedOnGiftPage:true,retryStartsLesson:true};
  });

  await check('two-tabs-contend-for-one-durable-gift', async f => {
    const p = f.page, other = await newPage(f);
    await goHome(other); await openGift(p); await openGift(other);
    // Hold the actual wallet Web Lock so both real button handlers queue their
    // transactions before either can read and commit the latest stored ledger.
    await p.evaluate(key => {
      if (!navigator.locks?.request) throw Error('Web Locks unavailable in this browser');
      window.qaLockHeld = false;
      window.qaLockTask = navigator.locks.request(key, () => new Promise(resolve => {
        window.qaReleaseLock = resolve; window.qaLockHeld = true;
      }));
    }, MEADOW_KEY);
    await p.waitForFunction(() => window.qaLockHeld);
    await Promise.all([press(p,'[data-action="open-welcome-gift"]'), press(other,'[data-action="open-welcome-gift"]')]);
    assert.equal(await savedMeadow(p), null, 'A transaction bypassed the held wallet lock');
    await p.evaluate(() => { window.qaReleaseLock(); return window.qaLockTask; });
    await p.waitForFunction(key => JSON.parse(localStorage.getItem(key) || 'null')?.welcomeGifts?.length === 1, MEADOW_KEY);
    await p.waitForFunction(async () => !(await navigator.locks.query()).pending.length && !(await navigator.locks.query()).held.length);
    const wallet = await verifyGift(p, {shells:1,water:0,gifts:[{date:FIRST_DAY,kind:'shells'}]});
    await noLearning(f,p); await noLearning(f,other);
    for (const page of [p,other]) {
      await page.reload({waitUntil:'domcontentloaded'}); await page.locator('main.home-view').waitFor();
      assert.equal(await page.locator('[data-action="welcome-gift"]').count(), 0);
    }
    return {wallet,competingTabs:2};
  });

  await check('storage-failure-preserves-unopened-gift-for-retry', async f => {
    const p = f.page;
    await openGift(p);
    await p.evaluate(() => { qaWelcome.failWrites = true; });
    await press(p, '[data-action="open-welcome-gift"]');
    await p.locator('[role="dialog"]').waitFor();
    assert.equal(await p.evaluate(() => qaWelcome.failedWrites), 1);
    assert.equal(await savedMeadow(p), null, 'Failed storage left a partial wallet or receipt');
    assert.equal(await p.locator('main[data-gift-phase="opened"]').count(), 0, 'Unsaved gift was announced as collected');
    assert.deepEqual((await noLearning(f)).wallet, {shells:0,water:0});
    await p.evaluate(() => { qaWelcome.failWrites = false; });
    await press(p, '[role="dialog"] [data-action="close"]');
    await claim(p,'shells');
    const wallet = await verifyGift(p, {shells:1,water:0,gifts:[{date:FIRST_DAY,kind:'shells'}]});
    await noLearning(f);
    return {wallet,retrySucceeded:true};
  });

  for (const size of [{name:'small-phone',width:320,height:568},{name:'landscape',width:640,height:360}]) {
    await check(`layout-${size.name}-all-gift-controls`, async f => {
      const p = f.page, states = {};
      states.home = await layout(p, '.home-view .primary-wrap button,.home-view [data-action="welcome-gift"]');
      await openGift(p);
      states.wrapped = await layout(p, 'main.welcome-gift-view button');
      await p.screenshot({path:path.join(out,`layout-${size.name}-wrapped.png`),animations:'disabled'});
      await claim(p,'shells');
      states.opened = await layout(p, 'main.welcome-gift-view button');
      await p.screenshot({path:path.join(out,`layout-${size.name}-opened.png`),animations:'disabled'});
      await noLearning(f);
      await press(p, '[data-action="welcome-play"]');
      await p.locator('main.event-view').waitFor({timeout:30000});
      await noLearning(f);
      return {states,continueStartsLessonWithoutRecording:true};
    }, size.width,size.height);
  }

  await check('gm-preview-and-navigation-keep-real-storage-untouched', async f => {
    const p = f.page, child = await snapshot(p);
    await assert.rejects(() => bridge(p,'previewWelcome','shells'), /免录音测试|sandbox/i, 'Ordinary development mode allowed a GM wallet mutation');
    assert.deepEqual(await snapshot(p), child);
    const previews = [];
    for (const kind of ['shells','water']) {
      await p.goto(`${origin}/xiaoya/?garden=b&gm=test&gmWelcome=${kind}`, {waitUntil:'domcontentloaded'});
      await p.locator('main.welcome-gift-view[data-gift-phase="wrapped"]').waitFor();
      const before = await bridge(p,'inspect');
      await claim(p,kind);
      const after = await noLearning(f);
      assert.equal(after.welcomeGifts, before.welcomeGifts+1);
      assert.equal(after.wallet[kind], before.wallet[kind]+1);
      assert.equal(after.wallet[kind==='shells'?'water':'shells'], before.wallet[kind==='shells'?'water':'shells']);
      assert.deepEqual(await snapshot(p), child, 'GM preview leaked into durable child storage');
      previews.push({kind,before:{wallet:before.wallet,gifts:before.welcomeGifts},after:{wallet:after.wallet,gifts:after.welcomeGifts}});
    }
    await p.goto(`${origin}/xiaoya/?garden=b&gm=test&gmPage=home`, {waitUntil:'domcontentloaded'});
    await p.locator('main.home-view').waitFor();
    await bridge(p,'navigate','welcome-gift');
    await p.locator('main.welcome-gift-view[data-gift-phase="wrapped"]').waitFor();
    await claim(p,'shells');
    assert.equal((await bridge(p,'inspect')).welcomeGifts, 1, 'Reload did not start a fresh in-memory preview');
    await press(p,'[data-gm-action="exit"]');
    await p.locator('main.home-view').waitFor();
    assert.equal(await p.locator('[data-action="welcome-gift"]').count(), 1, 'Exiting GM consumed the real daily gift');
    assert.deepEqual(await snapshot(p), child);
    await noLearning(f);
    return {previews,gmNavigationWorks:true,realStorageUnchanged:true};
  });
}

main().catch(error => { report.error = error.stack; console.error(error); process.exitCode = 1; }).finally(async() => {
  await browser?.close();
  await new Promise(resolve => server ? server.close(resolve) : resolve());
  report.finishedAt = new Date().toISOString();
  await fsp.mkdir(out,{recursive:true});
  await fsp.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));
  if (report.checks.some(check => check.status === 'FAIL')) process.exitCode = 1;
});
