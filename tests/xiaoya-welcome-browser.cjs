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
const root = path.resolve(__dirname, '..'), dist = path.resolve(root, process.env.XIAOYA_DIST_DIR || 'dist');
const out = path.join(root, 'test-results', 'xiaoya-welcome-browser');
const filter = process.env.XIAOYA_TEST_FILTER ? new RegExp(process.env.XIAOYA_TEST_FILTER) : null;
const MEADOW_KEY = 'xiaoya-english:meadow:v1';
const GREETINGS_KEY = 'xiaoya-english:welcome-greetings:v1';
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

async function fixture(width = 1180, height = 900, options = {}) {
  const context = await browser.newContext({viewport:{width,height}, timezoneId:'Asia/Shanghai', serviceWorkers:'block', reducedMotion:options.motion ? 'no-preference' : 'reduce', hasTouch:width<600, isMobile:width<600});
  const f = {context, pages:[], requests:[], errors:[], microphone:0, width, height};
  await context.exposeBinding('qaWelcomeMicAccess', () => { f.microphone++; });
  context.on('request', request => f.requests.push(request.url()));
  await context.route('**/*', route => new URL(route.request().url()).origin === origin && !forbidden.test(route.request().url()) ? route.continue() : route.abort('blockedbyclient'));
  await context.addInitScript(({origin, firstDay, meadowKey, options}) => {
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
    const qa = window.qaWelcome = {setDay, failWrites:false, failedWrites:0, play:[], errors:[], blockedWelcomes:options.blockWelcomeOnce ? 1 : 0, media:[]};
    const isGreeting = url => /welcome-(?:hello-\d{2}|gift-first|gift-intro)\.mp3(?:\?|$)/.test(url);
    qa.activeGreetings = () => qa.media.filter(({element,item}) => isGreeting(item.url) && !element.paused).length;
    // Exercise the app's visibility handler without freezing the real media
    // clock. Native audio must pause even when the background event is simulated.
    qa.setHidden = hidden => {
      Object.defineProperty(document, 'hidden', {configurable:true, get:() => hidden});
      document.dispatchEvent(new Event('visibilitychange'));
    };
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
      const url = this.currentSrc || this.src;
      this.playbackRate = options.slowWelcome && isGreeting(url) ? 1 : 4;
      const item = {url, playing:false, ended:false, paused:false, error:false, rejected:null};
      qa.play.push(item);
      qa.media.push({element:this,item});
      this.addEventListener('playing', () => { item.url = this.currentSrc || this.src; item.playing = true; }, {once:true});
      this.addEventListener('ended', () => { item.ended = true; }, {once:true});
      this.addEventListener('pause', () => { item.paused = true; }, {once:true});
      this.addEventListener('error', () => { item.error = true; }, {once:true});
      if (isGreeting(url) && qa.blockedWelcomes) {
        qa.blockedWelcomes--; item.rejected = 'NotAllowedError';
        return Promise.reject(new DOMException('Isolated welcome autoplay denial', 'NotAllowedError'));
      }
      return play.call(this);
    };
    addEventListener('unhandledrejection', event => qa.errors.push(String(event.reason)));
  }, {origin, firstDay:FIRST_DAY, meadowKey:MEADOW_KEY, options});
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
const savedGreeting = page => page.evaluate(key => JSON.parse(localStorage.getItem(key) || 'null'), GREETINGS_KEY);
async function greetingAudio(page, {from=0, ended=true} = {}) {
  await page.waitForFunction(({from,ended}) => qaWelcome.play.slice(from).some(item =>
    /welcome-(?:hello-\d{2}|gift-first|gift-intro)\.mp3(?:\?|$)/.test(item.url) && item.playing && (!ended || item.ended)), {from,ended});
  return page.evaluate(({from,ended}) => qaWelcome.play.slice(from).find(item =>
    /welcome-(?:hello-\d{2}|gift-first|gift-intro)\.mp3(?:\?|$)/.test(item.url) && item.playing && (!ended || item.ended)), {from,ended});
}
const greetingId = item => /\/(welcome-(?:hello-\d{2}|gift-first|gift-intro))\.mp3(?:\?|$)/.exec(item.url)?.[1];
const greetingCount = page => page.evaluate(() => qaWelcome.play.filter(item => /welcome-(?:hello-\d{2}|gift-first|gift-intro)\.mp3(?:\?|$)/.test(item.url)).length);
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
  // The daily gift is already in front of home: do not click an entry or
  // navigate to a second page just to expose the actual opening action.
  await page.locator('.welcome-gift-overlay[role="dialog"][data-gift-phase="wrapped"]').waitFor();
  assert.equal(await page.locator('main.welcome-gift-view,[data-action="welcome-play"]').count(), 0);
}
async function giftGone(page) {
  await page.locator('.welcome-gift-overlay').waitFor({state:'hidden',timeout:11000});
  await page.locator('main.home-view').waitFor();
  assert.equal(await page.locator('.app-shell').evaluate(element => element.inert), false);
}
async function purposeAudio(page, kind) {
  const filename = kind === 'shells' ? 'welcome-gift-shell.mp3' : 'welcome-gift-water.mp3';
  await page.waitForFunction(filename => qaWelcome.play.some(item => item.url.includes(filename) && item.playing && item.ended), filename);
  return page.evaluate(filename => qaWelcome.play.find(item => item.url.includes(filename) && item.playing && item.ended), filename);
}
async function overlayGeometry(page) {
  const result = await page.locator('.welcome-gift-overlay').evaluate(element => {
    const button = element.querySelector('[data-action="open-welcome-gift"]');
    const box = element.getBoundingClientRect(), gift = button?.getBoundingClientRect();
    const colors = [getComputedStyle(element).backgroundColor, getComputedStyle(element,'::before').backgroundColor, getComputedStyle(element,'::backdrop').backgroundColor];
    const blocked = [...document.querySelectorAll('.app-shell,.gm-launcher,.gm-testbar')].every(node => node.inert || Boolean(node.closest('[inert]')));
    const actionable = [...document.querySelectorAll('button,a[href],input,select,textarea,[tabindex]')].filter(node =>
      node.getClientRects().length && !node.disabled && node.tabIndex >= 0 && !node.closest('[inert]') && !node.closest('dialog:not([open])')).map(node => node.dataset.action || node.dataset.gmAction || node.tagName);
    return {width:innerWidth,height:innerHeight,box:{left:box.left,top:box.top,width:box.width,height:box.height},
      gift:gift && {centerX:gift.x+gift.width/2,centerY:gift.y+gift.height/2,width:gift.width,height:gift.height},
      colors,blocked,actionable,ariaModal:element.getAttribute('aria-modal')};
  });
  assert.equal(result.ariaModal,'true');
  assert(result.blocked, 'The gift did not make the home and GM controls inert');
  assert.deepEqual(result.actionable,['open-welcome-gift'], 'The gift should be the only actionable control');
  assert(Math.abs(result.box.left) < 2 && Math.abs(result.box.top) < 2 && result.box.width >= result.width-2 && result.box.height >= result.height-2, 'Gift scrim does not cover the viewport');
  assert(Math.abs(result.gift.centerX-result.width/2) < 8 && Math.abs(result.gift.centerY-result.height/2) < 28, `Gift is not centered: ${JSON.stringify(result.gift)}`);
  assert(result.colors.some(color => /^rgba\(0, 0, 0, 0\.[3-8]\d*\)$/.test(color)), `Expected a black translucent scrim, found ${result.colors}`);
  return result;
}
async function paperGift(page, action) {
  const selector = `[data-action="${action}"] [data-paper-art="gift-box"]`;
  await page.locator(`${selector}[data-paper-state="ready"]`).waitFor();
  const details = await page.locator(selector).evaluate(async element => {
    const source = element.querySelector('image').href.baseVal;
    const bitmap = new Image(); bitmap.src = source; await bitmap.decode();
    const box = element.closest('svg').getBoundingClientRect();
    return {source,width:bitmap.naturalWidth,height:bitmap.naturalHeight,visibleWidth:box.width,visibleHeight:box.height};
  });
  assert.match(details.source, /xiaoya\/paper\/v1\/gift-box\.webp$/);
  assert.equal(details.width,512); assert.equal(details.height,512);
  assert(details.visibleWidth >= 60 && details.visibleHeight >= 60, 'Paper gift is too small to identify');
  return details;
}
async function claim(page, kind) {
  await press(page, '[data-action="open-welcome-gift"]');
  await page.locator(`.welcome-gift-overlay[data-gift-phase="opened"][data-gift-kind="${kind}"]`).waitFor();
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
async function check(name, run, width, height, options) {
  if (filter && !filter.test(name)) return;
  let f;
  const start = Date.now();
  try {
    f = await fixture(width,height,options);
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

  await check('automatic-centered-gift-one-operation-and-native-greeting', async f => {
    const p = f.page;
    await openGift(p);
    const first = await greetingAudio(p, {ended:false});
    assert.equal(greetingId(first), 'welcome-gift-first', 'A new child received a returning-child greeting');
    assert.equal(await savedMeadow(p), null, 'Showing a gift granted it before a click');
    const geometry = await overlayGeometry(p);
    // Native dialogs may allow Tab to reach browser chrome; they must never focus a background control.
    for (const key of ['Tab','Shift+Tab']) {
      await p.keyboard.press(key);
      const focus = await p.evaluate(() => ({focused:document.hasFocus(),tag:document.activeElement?.tagName,
        action:document.activeElement?.dataset.action,inside:!!document.activeElement?.closest('.welcome-gift-overlay')}));
      assert(focus.inside || !focus.focused, `${key} focused background content: ${JSON.stringify(focus)}`);
    }
    await p.keyboard.press('Escape');
    await p.mouse.click(8,8);
    await openGift(p);
    assert.equal(await savedMeadow(p), null, 'A backdrop click collected or dismissed the gift');
    await claim(p,'shells');
    await p.waitForFunction(() => qaWelcome.activeGreetings() === 0);
    const nativePurpose = await purposeAudio(p,'shells');
    await giftGone(p);
    assert.equal((await bridge(p,'inspect')).page,'home', 'Collecting automatically navigated away from home');
    const afterGift = await greetingCount(p);
    await p.waitForTimeout(800);
    assert.equal(await greetingCount(p),afterGift,'Gift closure repeated the greeting');
    await noLearning(f);
    return {geometry,first,nativePurpose,oneClick:true,backgroundBlocked:true,autoClosed:true};
  }, undefined,undefined,{slowWelcome:true});

  await check('returning-welcome-six-day-shuffle-refresh-stability', async f => {
    const p = f.page;
    await openGift(p); await claim(p,'shells');
    const choices = [];
    for (let day = 22; day <= 27; day++) {
      const date = `2026-10-${day}`;
      await p.evaluate(date => qaWelcome.setDay(date), date);
      await p.reload({waitUntil:'domcontentloaded'}); await openGift(p);
      const audio = await greetingAudio(p), chosen = await savedGreeting(p);
      assert.match(greetingId(audio), /^welcome-hello-0[1-6]$/, 'Returning greetings did not use a prepared variant MP3');
      assert.equal(chosen.id, greetingId(audio));
      assert.equal(chosen.date, date);
      choices.push({date,id:chosen.id,nativeAudio:audio});
      await p.reload({waitUntil:'domcontentloaded'}); await openGift(p);
      const refreshed = await greetingAudio(p);
      assert.equal(greetingId(refreshed), chosen.id, 'Refreshing rerolled today\'s greeting');
      assert.deepEqual(await savedGreeting(p), chosen, 'Refresh consumed another greeting from the rotation');
    }
    assert.equal(new Set(choices.map(choice => choice.id)).size, 6, 'A greeting repeated before all six variants were heard');
    await p.evaluate(() => qaWelcome.setDay('2026-10-28'));
    await p.reload({waitUntil:'domcontentloaded'}); await openGift(p);
    const nextCycle = await greetingAudio(p);
    assert.notEqual(greetingId(nextCycle), choices.at(-1).id, 'Adjacent shuffle cycles repeated the same greeting');
    await verifyGift(p, {shells:1,water:0,gifts:[{date:FIRST_DAY,kind:'shells'}]});
    await noLearning(f);
    return {choices,nextCycle:greetingId(nextCycle),sameDayStable:true,allSixNativeFilesDecoded:true};
  });

  await check('autoplay-denial-does-not-block-single-click-reward-audio', async f => {
    const p = f.page;
    await openGift(p);
    await p.waitForFunction(() => qaWelcome.play.some(item => item.rejected === 'NotAllowedError'));
    const denied = await p.evaluate(() => qaWelcome.play.find(item => item.rejected === 'NotAllowedError'));
    assert.equal(denied.playing, false);
    await p.waitForTimeout(650);
    assert.equal(await p.locator('.toast,#modal-root [role="dialog"]').count(), 0, 'Expected autoplay denial displayed an error');
    assert.equal(await greetingCount(p), 1, 'Blocked autoplay retried without a child gesture');
    await claim(p,'shells');
    const recovered = await purposeAudio(p,'shells');
    assert.equal(recovered.rejected, null, 'A gift click failed to unlock native reward playback');
    assert.equal(await p.locator('.toast').count(), 0);
    await giftGone(p); await noLearning(f);
    return {denied,recovered,syntheticFailureCount:1,nativeGestureRecovery:true};
  }, undefined,undefined,{blockWelcomeOnce:true});

  await check('single-click-persistent-idempotent-no-learning', async f => {
    const p = f.page;
    await openGift(p);
    assert.equal(await p.locator('.home-view .primary-wrap').count(), 1);
    assert.equal(await p.locator('[data-action="welcome-gift"]').count(), 0, 'Obsolete side entry remains');
    assert.equal(await savedMeadow(p), null);
    await claim(p,'shells');
    const wallet = await verifyGift(p, {shells:1,water:0,gifts:[{date:FIRST_DAY,kind:'shells'}]});
    assert.equal((await noLearning(f)).welcomeGifts, 1);
    const shellAudio = await purposeAudio(p,'shells');
    await giftGone(p);
    await p.reload({waitUntil:'domcontentloaded'}); await p.locator('main.home-view').waitFor();
    assert.equal(await p.locator('.welcome-gift-overlay:visible').count(), 0, 'Same-day gift reappeared after refresh');
    await p.waitForTimeout(650);
    assert.equal(await greetingCount(p), 0, 'A claimed daily gift announced another surprise after refresh');
    await verifyGift(p, {shells:1,water:0,gifts:[{date:FIRST_DAY,kind:'shells'}]});
    await noLearning(f);
    return {wallet,nativeShellAudio:shellAudio};
  });

  await check('local-day-rotation-and-clock-rollback', async f => {
    const p = f.page;
    await openGift(p); await claim(p,'shells');
    await p.evaluate(day => qaWelcome.setDay(day), SECOND_DAY);
    await p.reload({waitUntil:'domcontentloaded'}); await openGift(p); await claim(p,'water');
    const expected = {shells:1,water:1,gifts:[{date:FIRST_DAY,kind:'shells'},{date:SECOND_DAY,kind:'water'}]};
    const wallet = await verifyGift(p, expected);
    const waterAudio = await purposeAudio(p,'water');
    await giftGone(p);
    await noLearning(f);
    await p.evaluate(day => qaWelcome.setDay(day), FIRST_DAY);
    await p.reload({waitUntil:'domcontentloaded'}); await p.locator('main.home-view').waitFor();
    assert.equal(await p.locator('.welcome-gift-overlay:visible').count(), 0, 'Turning the clock back allowed another gift');
    await verifyGift(p, expected); await noLearning(f);
    return {wallet,waterAudio,homeAfterGift:true,clockRollbackReward:false};
  });

  await check('rapid-clicks-reveal-once-and-auto-close-without-lesson', async f => {
    const p = f.page;
    await openGift(p);
    const target = await p.locator('[data-action="open-welcome-gift"]').boundingBox();
    await p.mouse.click(target.x+target.width/2,target.y+target.height/2,{clickCount:3,delay:30});
    await p.locator('.welcome-gift-overlay[data-gift-phase="opened"]').waitFor();
    await verifyGift(p,{shells:1,water:0,gifts:[{date:FIRST_DAY,kind:'shells'}]});
    await purposeAudio(p,'shells');
    await giftGone(p);
    assert.equal((await bridge(p,'inspect')).page,'home');
    assert.equal(await p.locator('main.event-view').count(),0,'Gift closure started a lesson without its own click');
    await press(p,'.home-view [data-action="next-event"]');
    await p.locator('main.event-view').waitFor();
    await noLearning(f);
    return {clicks:3,rewards:1,automaticLesson:false,lessonButtonWorks:true};
  });

  await check('background-cancels-unclaimed-hello-and-durable-opening', async f => {
    const p = f.page;
    await openGift(p); await greetingAudio(p,{ended:false});
    await p.evaluate(() => qaWelcome.setHidden(true));
    await p.waitForFunction(() => qaWelcome.activeGreetings() === 0);
    assert.equal(await savedMeadow(p),null);
    await p.evaluate(() => qaWelcome.setHidden(false));
    await openGift(p);
    await p.waitForTimeout(800);
    assert.equal(await greetingCount(p),1,'Foreground repeated a same-session greeting');
    await press(p,'[data-action="open-welcome-gift"]');
    await p.waitForFunction(key => JSON.parse(localStorage.getItem(key) || 'null')?.welcomeGifts?.length === 1,MEADOW_KEY);
    await p.evaluate(() => qaWelcome.setHidden(true));
    await p.waitForTimeout(700);
    await p.evaluate(() => qaWelcome.setHidden(false));
    await giftGone(p);
    await verifyGift(p,{shells:1,water:0,gifts:[{date:FIRST_DAY,kind:'shells'}]});
    await p.waitForTimeout(800);
    assert.equal(await p.locator('.welcome-gift-overlay:visible').count(),0,'A cancelled opening resurrected after foreground');
    await noLearning(f);
    return {unclaimedPreserved:true,nativeGreetingCancelled:true,durableAwardPreserved:true,staleAnimationCancelled:true};
  }, undefined,undefined,{slowWelcome:true,motion:true});

  await check('prototype-motion-opening-reveal-and-fade-stay-centered', async f => {
    const p=f.page;
    await openGift(p); await paperGift(p,'open-welcome-gift');
    const geometry = await overlayGeometry(p);
    await p.evaluate(() => {
      window.qaGiftPhases = [];
      const observe = () => {
        const element=document.querySelector('.welcome-gift-overlay');
        const phase=element?.open ? element.dataset.giftPhase : 'gone';
        if (qaGiftPhases.at(-1)?.phase !== phase) qaGiftPhases.push({phase,at:performance.now(),animations:element ? [...element.getAnimations({subtree:true})].map(a => ({name:a.animationName || '',duration:a.effect?.getTiming().duration})) : []});
      };
      window.qaGiftObserver = new MutationObserver(observe);
      qaGiftObserver.observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['data-gift-phase','open']});
      observe();
    });
    const started=Date.now();
    await claim(p,'shells');
    await giftGone(p);
    const phases=await p.evaluate(() => { qaGiftObserver.disconnect(); return qaGiftPhases; });
    assert.deepEqual(phases.map(item=>item.phase),['wrapped','opening','opened','closing','gone']);
    const opening=phases.find(item=>item.phase==='opening'), opened=phases.find(item=>item.phase==='opened'), closing=phases.find(item=>item.phase==='closing'), gone=phases.find(item=>item.phase==='gone');
    assert(opened.at-opening.at >= 350,'Gift opening anticipation was skipped');
    assert(closing.at-opened.at >= 1200,'The reward vanished before it could be understood');
    assert(gone.at-closing.at >= 200,'The overlay closed without its fade');
    assert(phases.some(item=>item.animations.some(a=>Number(a.duration)>100)),'No actual CSS/Web Animation was active');
    assert(Date.now()-started<10000,'Automatic gift closure took too long');
    await noLearning(f);
    return {geometry,phases};
  }, undefined,undefined,{motion:true});

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
      assert.equal(await page.locator('.welcome-gift-overlay:visible').count(), 0);
    }
    return {wallet,competingTabs:2};
  });

  await check('storage-failure-preserves-unopened-gift-for-retry', async f => {
    const p = f.page;
    await openGift(p);
    await p.evaluate(() => { qaWelcome.failWrites = true; });
    await press(p, '[data-action="open-welcome-gift"]');
    await p.locator('#modal-root [role="dialog"]').waitFor();
    assert.equal(await p.evaluate(() => qaWelcome.failedWrites), 1);
    assert.equal(await savedMeadow(p), null, 'Failed storage left a partial wallet or receipt');
    assert.equal(await p.locator('.welcome-gift-overlay[data-gift-phase="opened"]').count(), 0, 'Unsaved gift was announced as collected');
    const emptyWallet = (await noLearning(f)).wallet;
    assert.deepEqual({shells:emptyWallet.shells,water:emptyWallet.water}, {shells:0,water:0});
    await p.evaluate(() => { qaWelcome.failWrites = false; });
    await press(p, '#modal-root [role="dialog"] [data-action="close"]');
    await claim(p,'shells');
    const wallet = await verifyGift(p, {shells:1,water:0,gifts:[{date:FIRST_DAY,kind:'shells'}]});
    await noLearning(f);
    return {wallet,retrySucceeded:true};
  });

  for (const size of [{name:'desktop',width:1180,height:900},{name:'small-phone',width:320,height:568},{name:'landscape',width:640,height:360}]) {
    await check(`layout-${size.name}-centered-single-gift`, async f => {
      const p = f.page, states = {};
      await openGift(p);
      states.wrapped = await layout(p,'.welcome-gift-overlay button');
      states.geometry = await overlayGeometry(p);
      states.wrappedGift = await paperGift(p,'open-welcome-gift');
      await p.screenshot({path:path.join(out,`layout-${size.name}-wrapped.png`),animations:'disabled'});
      await claim(p,'shells');
      assert.equal(await p.locator('.welcome-gift-overlay button:not([disabled])').count(),0,'Reward reveal added a redundant collection button');
      await p.screenshot({path:path.join(out,`layout-${size.name}-opened.png`),animations:'disabled'});
      await giftGone(p); await noLearning(f);
      states.home = await layout(p,'.home-view .primary-wrap button');
      return {states,touchSingleClick:true,reducedMotionSupported:true};
    }, size.width,size.height);
  }

  await check('gm-preview-and-navigation-keep-real-storage-untouched', async f => {
    const p = f.page;
    await greetingAudio(p);
    const child = await snapshot(p);
    await assert.rejects(() => bridge(p,'previewWelcome','shells'), /免录音测试|sandbox/i, 'Ordinary development mode allowed a GM wallet mutation');
    assert.deepEqual(await snapshot(p), child);
    const previews = [];
    for (const kind of ['shells','water']) {
      await p.goto(`${origin}/xiaoya/?garden=b&gm=test&gmWelcome=${kind}`, {waitUntil:'domcontentloaded'});
      await openGift(p);
      const before = await bridge(p,'inspect');
      await claim(p,kind);
      const after = await noLearning(f);
      assert.equal(after.welcomeGifts, before.welcomeGifts+1);
      assert.equal(after.wallet[kind], before.wallet[kind]+1);
      assert.equal(after.wallet[kind==='shells'?'water':'shells'], before.wallet[kind==='shells'?'water':'shells']);
      assert.deepEqual(await snapshot(p), child, 'GM preview leaked into durable child storage');
      await bridge(p,'navigate','home');
      await giftGone(p);
      await p.waitForTimeout(700);
      assert.equal(await p.locator('.welcome-gift-overlay:visible').count(),0,'A cancelled GM reveal resurrected after navigation');
      assert.equal((await bridge(p,'inspect')).wallet[kind],after.wallet[kind],'Navigation lost an already saved preview reward');
      previews.push({kind,before:{wallet:before.wallet,gifts:before.welcomeGifts},after:{wallet:after.wallet,gifts:after.welcomeGifts},navigationCancelsReveal:true});
    }
    await p.goto(`${origin}/xiaoya/?garden=b&gm=test&gmPage=home`, {waitUntil:'domcontentloaded'});
    await p.locator('main.home-view').waitFor();
    assert.equal(await p.locator('.welcome-gift-overlay:visible').count(),0,'Ordinary GM sandbox home unexpectedly forced a daily gift');
    await bridge(p,'navigate','welcome-gift');
    await openGift(p);
    await claim(p,'shells');
    assert.equal((await bridge(p,'inspect')).welcomeGifts, 1, 'Reload did not start a fresh in-memory preview');
    await giftGone(p);
    await press(p,'[data-gm-action="exit"]');
    await p.locator('main.home-view').waitFor();
    await openGift(p);
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
