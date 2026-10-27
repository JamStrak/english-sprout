/* Isolated acceptance for the approved 60-phrase pack. Build dist first.
 * No build, product mutation, real browser profile, microphone, speech scoring,
 * or user record is used here. Native images/audio remain real at 4x playback.
 * Synthetic participation only seeds recall.
 *
 * node tests/xiaoya-phrase-pack-browser.cjs
 * XIAOYA_TEST_FILTER=catalogue|parent|teaching|recall|pictures|offline
 * XIAOYA_PHRASE_IDS=daily-peekaboo,daily-time-to-go (explicit partial coverage)
 * TEST_URL may override the disposable server with a loopback candidate.
 * Screenshots establish layout, not whether a child understands the artwork.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const http = require('node:http');
const crypto = require('node:crypto');
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/Jam/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');

const root = path.resolve(__dirname, '..'), dist = path.join(root, 'dist');
const out = path.resolve(process.env.XIAOYA_PHRASE_TEST_OUT || path.join(root, 'test-results/xiaoya-v015-phrase-pack'));
assert.equal(path.dirname(out), path.join(root, 'test-results'), 'Keep evidence inside this worktree test-results.');
assert(path.basename(out).startsWith('xiaoya-v015-'), 'Use the assigned xiaoya-v015-* evidence prefix.');
const filter = process.env.XIAOYA_TEST_FILTER ? new RegExp(process.env.XIAOYA_TEST_FILTER) : null;
const approved = JSON.parse(fs.readFileSync(path.join(root, 'design/xiaoya-phrases-v015/phrases.json'), 'utf8'));
const requested = process.env.XIAOYA_PHRASE_IDS?.split(',').map(s => s.trim()).filter(Boolean);
if (requested) {
  assert.equal(new Set(requested).size, requested.length, 'Duplicate selected phrase ID.');
  assert(requested.length && requested.every(id => approved.some(p => p.id === id)), 'Unknown or empty phrase selection.');
}
const selected = approved.filter(p => !requested || requested.includes(p.id));
const ORIGINAL_CORE = [
  'hello-everyone', 'hello-morning', 'family-love', 'hello-thanks', 'hello-youre-welcome', 'hello-sorry', 'hello-okay',
  'hello-goodbye', 'bed-night', 'hello-welcome', 'hello-excuse', 'outside-go-home', 'outside-ready', 'family-come',
  'food-eat', 'food-hungry', 'feelings-happy', 'feelings-tired', 'play-turn', 'play-your-turn', 'play-can-do',
  'play-did-it', 'play-good-job', 'play-again',
];
const report = {
  startedAt: new Date().toISOString(), checks: [],
  scope: {isolatedProfiles: true, nativeImages: true, nativeAudio: true, playbackRate: 4, microphoneUsed: false,
    recognitionTested: false, physicalDeviceTested: false, childComprehensionTested: false, spokenContentVerified: false,
    syntheticParticipationForRecall: true, filter: filter?.source || null, selectedIds: selected.map(p => p.id),
    completePhraseSelection: selected.length === 60, note: 'Filtering or selecting IDs is partial acceptance, never full-pack approval.'},
};
let browser, server, origin, expected;
const normalize = s => s.normalize('NFKC').toLowerCase().replace(/[^a-z0-9]/g, '');
const isStory = url => /\/xiaoya\/stories\/[^?]+\.(?:webp|png|jpe?g)(?:\?|$)/i.test(url);
const isMP3 = url => /\.mp3(?:\?|$)/i.test(url);
const mp3Path = (id, voice = 'pip') => `/xiaoya/audio/phrases-v015/${id}/${voice}.mp3`;
const pathname = url => new URL(url, origin).pathname;
const save = () => fs.writeFileSync(path.join(out, filter || requested ? 'results-partial.json' : 'results.json'), JSON.stringify(report, null, 2));
const mime = {'.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.mp3': 'audio/mpeg', '.wasm': 'application/wasm'};

async function serve() {
  server = http.createServer(async (req, res) => {
    try {
      if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405).end(); return; }
      let name = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
      if (name.endsWith('/')) name += 'index.html';
      const file = path.resolve(dist, '.' + name), relative = path.relative(dist, file);
      if (relative.startsWith('..') || path.isAbsolute(relative)) { res.writeHead(403).end(); return; }
      const stat = await fsp.stat(file); if (!stat.isFile()) throw Error('Not a file');
      const headers = {'Content-Type': mime[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache', 'Accept-Ranges': 'bytes'};
      let start = 0, end = stat.size - 1, status = 200;
      if (req.headers.range) {
        const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range);
        if (!range || (!range[1] && !range[2])) { res.writeHead(416, {'Content-Range': `bytes */${stat.size}`}).end(); return; }
        if (range[1]) { start = Number(range[1]); if (range[2]) end = Math.min(end, Number(range[2])); }
        else start = Math.max(0, stat.size - Number(range[2]));
        if (start > end || start >= stat.size) { res.writeHead(416, {'Content-Range': `bytes */${stat.size}`}).end(); return; }
        status = 206; headers['Content-Range'] = `bytes ${start}-${end}/${stat.size}`;
      }
      headers['Content-Length'] = end - start + 1; res.writeHead(status, headers);
      if (req.method === 'HEAD') res.end(); else fs.createReadStream(file, {start, end}).on('error', () => res.destroy()).pipe(res);
    } catch { if (!res.headersSent) res.writeHead(404, {'Content-Type': 'text/plain'}); res.end('Missing candidate asset'); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return `http://127.0.0.1:${server.address().port}`;
}

async function fixture({width = 390, height = 844, worker = false, fault = null} = {}) {
  const c = await browser.newContext({viewport: {width, height}, timezoneId: 'Asia/Shanghai', serviceWorkers: worker ? 'allow' : 'block', isMobile: width < 1000, hasTouch: width < 1000, reducedMotion: 'reduce'});
  const requests = [], responses = [], failures = [], errors = []; let release;
  const gate = fault?.kind === 'slow' ? new Promise(resolve => { release = resolve; }) : Promise.resolve();
  c.on('request', r => requests.push({url: r.url(), method: r.method(), at: Date.now(), worker: !!r.serviceWorker()}));
  c.on('response', r => responses.push({url: r.url(), status: r.status(), worker: r.fromServiceWorker(), at: Date.now()}));
  c.on('requestfailed', r => failures.push({url: r.url(), error: r.failure()?.errorText}));
  // Preserve native worker fetch/cache behavior in the offline check.
  if (!worker) await c.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.origin !== origin) return route.abort('blockedbyclient');
    if (fault?.file && url.pathname.endsWith(`/stories/${fault.file}`)) {
      if (fault.kind === 'slow') await gate;
      if (fault.kind === 'missing') return route.fulfill({status: 404, contentType: 'text/plain', body: 'Deliberately missing picture acceptance fixture'});
    }
    return route.continue();
  });
  await c.addInitScript(({origin}) => {
    if (location.origin !== origin) return;
    // Only consent/preferences are initialized; seeded review records survive reload.
    localStorage.setItem('xiaoya-english:preferences:v1', JSON.stringify({welcome: true, mic: false, guideStep: 'done'}));
    const qa = window.qaPhrasePack = {audio: [], views: [], errors: [], microphoneCalls: 0};
    addEventListener('error', e => { if (e.message) qa.errors.push(e.message); });
    addEventListener('unhandledrejection', e => qa.errors.push(String(e.reason)));
    const NativeAudio = window.Audio;
    window.Audio = function (...args) {
      const a = new NativeAudio(...args), item = {url: String(args[0] || ''), createdAt: performance.now(), playedAt: null, endedAt: null, error: false};
      qa.audio.push(item); a.playbackRate = 4;
      a.addEventListener('playing', () => { item.url = a.currentSrc || a.src || item.url; item.playedAt = performance.now(); });
      a.addEventListener('ended', () => { item.endedAt = performance.now(); });
      a.addEventListener('error', () => { item.error = true; });
      return a;
    }; window.Audio.prototype = NativeAudio.prototype;
    if (navigator.mediaDevices) navigator.mediaDevices.getUserMedia = () => {
      qa.microphoneCalls++; return Promise.reject(new DOMException('Acceptance never opens a microphone', 'NotAllowedError'));
    };
    new MutationObserver(() => {
      const main = document.querySelector('main[data-event]'); if (!main) return;
      const picture = main.querySelector('.story-stage .story-picture');
      const value = {at: performance.now(), id: main.dataset.event, phase: main.dataset.phase, context: main.dataset.context,
        practice: main.dataset.practiceMode, challenge: main.dataset.challenge || null,
        ready: !!main.querySelector('[data-action="story-continue"]:enabled'),
        pictureURL: picture?.dataset.pictureUrl || null, pictureStatus: picture?.dataset.pictureStatus || null,
        placeholder: !!picture?.querySelector('[data-picture-placeholder="true"]'),
        controls: [...main.querySelectorAll('button[data-action]')].map(e => ({action: e.dataset.action, disabled: e.disabled}))};
      const previous = qa.views.at(-1);
      if (!previous || ['id', 'phase', 'context', 'practice', 'challenge', 'ready', 'pictureURL', 'pictureStatus'].some(k => value[k] !== previous[k])) qa.views.push(value);
    }).observe(document, {subtree: true, childList: true, attributes: true, attributeFilter: ['class', 'style', 'disabled', 'data-picture-status']});
  }, {origin});
  const p = await c.newPage(); p.setDefaultTimeout(20000); p.on('pageerror', error => errors.push(error.message));
  try {
    const started = Date.now();
    await p.goto(`${origin}/xiaoya/?garden=b`, {waitUntil: 'domcontentloaded', timeout: 45000});
    await p.locator('main.home-view').waitFor();
    assert.equal(await p.locator('meta[name="xiaoya-version"]').getAttribute('content'), expected.version, 'Candidate version differs from local dist.');
    assert.equal(await p.locator('meta[name="xiaoya-build"]').getAttribute('content'), expected.build, 'Candidate build differs from local dist.');
    return {c, p, requests, responses, failures, errors, release, fault, width, height, worker, homeReadyMs: Date.now() - started};
  } catch (error) { release?.(); await c.close(); throw error; }
}

async function catalogue(p) {
  return p.evaluate(async () => {
    const base = document.querySelector('script[type="module"][src]').src;
    const [{EVENTS}, {CORE_PHRASE_EVENT_IDS}, {PHRASE_PACK_V015}, {STORIES}, {VOICES, lessonAudio}, {CHALLENGE_UNITS}] = await Promise.all(
      ['content.js', 'curriculum.js', 'phrase-pack-v015.js', 'stories.js', 'voices.js', 'challenges.js'].map(file => import(new URL(file, base))));
    return {events: EVENTS.map(e => ({id: e.id, english: e.english, accepted: e.accepted, lessonId: e.lessonId, contexts: e.contexts, hintAudio: e.hintAudio})),
      core: CORE_PHRASE_EVENT_IDS, pack: PHRASE_PACK_V015, units: CHALLENGE_UNITS, voices: VOICES.map(v => v.id),
      stories: STORIES.map(s => ({id: s.id, image: s.image || null, imageUrl: s.image ? new URL(`xiaoya/stories/${s.image}`, document.baseURI).href : null,
        imageLayout: s.imageLayout, teachingFrames: s.teachingFrames, contexts: s.event.contexts, alternate: s.alternateImages || null,
        audio: Object.fromEntries(VOICES.map(v => [v.id, new URL(lessonAudio(s.event, v.id), document.baseURI).href])),
        hint: s.event.hintAudio ? new URL(s.event.hintAudio, document.baseURI).href : null}))};
  });
}
async function press(p, selector) {
  const target = p.locator(selector).first(); await target.waitFor({state: 'visible'}); assert(await target.isEnabled(), `Disabled ${selector}`);
  await target.scrollIntoViewIfNeeded();
  const point = await target.evaluate(e => { const r = e.getBoundingClientRect(), x = r.x + r.width / 2, y = r.y + r.height / 2; return {x, y, hit: e.contains(document.elementFromPoint(x, y))}; });
  assert(point.hit, `Another element intercepts ${selector}`);
  if (p.viewportSize().width < 1000) await p.touchscreen.tap(point.x, point.y); else await p.mouse.click(point.x, point.y);
}
const action = (p, name) => press(p, `[data-action="${name}"]`);
async function parent(p) {
  if (!await p.locator('main.parent-view').count()) await action(p, 'parent');
  if (await p.locator('#parent-answer').count()) {
    const [a, b] = (await p.locator('label[for="parent-answer"]').textContent()).match(/\d+/g).map(Number);
    await p.locator('#parent-answer').fill(String(a + b)); await action(p, 'gate-submit');
  }
  await p.locator('main.parent-view').waitFor();
}
async function library(p) {
  await parent(p);
  const box = p.locator('.story-library > details');
  if (!await box.evaluate(e => e.open)) await press(p, '.story-library > details > summary');
  const pack = p.locator('details.new-phrase-pack');
  if (!await pack.evaluate(e => e.open)) await press(p, 'details.new-phrase-pack > summary');
}
async function layout(p, {child = false} = {}) {
  const viewport = p.viewportSize();
  const value = await p.evaluate(() => ({width: innerWidth, height: innerHeight, scrollWidth: document.documentElement.scrollWidth, scrollHeight: document.documentElement.scrollHeight,
    text: document.querySelector('main')?.innerText || '', header: [...document.querySelectorAll('.topbar [data-action]')].map(e => e.dataset.action)}));
  assert(value.scrollWidth <= viewport.width + 1, `Horizontal overflow: ${value.scrollWidth} > ${viewport.width}`);
  if (child) { assert(value.scrollHeight <= viewport.height + 1, 'Child controls require scrolling.'); assert(!/[a-z]/i.test(value.text), 'English text appears in child flow.'); }
  return {...value, viewport};
}
async function trace(p, start = 0) { return p.evaluate(start => ({audio: qaPhrasePack.audio.slice(start), views: qaPhrasePack.views}), start); }
async function audioCount(p) { return p.evaluate(() => qaPhrasePack.audio.length); }
async function ended(p, url, start = 0) {
  await p.waitForFunction(({url, start}) => qaPhrasePack.audio.slice(start).some(a => a.url === url && a.endedAt != null && !a.error), {url, start}, {timeout: 45000});
}
async function guideEnded(p, file, start = 0) {
  await p.waitForFunction(({file, start}) => qaPhrasePack.audio.slice(start).some(a => new URL(a.url, document.baseURI).pathname.endsWith('/' + file + '.mp3') && a.endedAt != null && !a.error), {file, start}, {timeout: 45000});
}
async function picture(p, story) {
  assert(story.imageUrl, `${story.id}: no accepted picture mapping yet.`);
  await p.waitForFunction(url => {
    const e = document.querySelector('.story-stage .story-picture'); return e?.dataset.pictureUrl === url && e.dataset.pictureStatus === 'ready';
  }, story.imageUrl, {timeout: 25000});
  const value = await p.locator('.story-stage .story-picture').evaluate(e => ({url: e.dataset.pictureUrl, status: e.dataset.pictureStatus,
    background: getComputedStyle(e).backgroundImage, size: getComputedStyle(e).backgroundSize, single: e.classList.contains('single-picture'), vector: e.classList.contains('vector-picture')}));
  assert(value.single && !value.vector && value.background.includes(story.imageUrl), 'Accepted single artwork is not visible.');
  assert.equal(value.size, 'contain', 'Artwork must not be cropped.'); return value;
}
async function screenshot(p, name) { const file = path.join(out, name + '.png'); await p.screenshot({path: file, fullPage: false, animations: 'disabled'}); return file; }
async function seedPractice(p, ids, daysAgo) {
  return p.evaluate(async ({ids, daysAgo}) => {
    const base = document.querySelector('script[type="module"][src]').src;
    const [{PRACTICE_KEY, createPracticePlan, recordPractice, addPracticeDays}, {localDay}] = await Promise.all([import(new URL('practice-plan.js', base)), import(new URL('learning.js', base))]);
    const date = addPracticeDays(localDay(), -daysAgo);
    const value = ids.reduce((s, eventId, i) => recordPractice(s, {roundId: `qa-v015:${i}:${eventId}`, eventId, date, attemptId: null, mode: 'new', rewardVariant: null}), createPracticePlan());
    localStorage.setItem(PRACTICE_KEY, JSON.stringify(value)); return {date, count: value.entries.length, synthetic: true};
  }, {ids, daysAgo});
}
async function reloadHome(p) { await p.reload({waitUntil: 'domcontentloaded'}); await p.locator('main.home-view').waitFor(); }
function noAnswer(audio, story, label) {
  assert(!audio.some(a => Object.values(story.audio).includes(a.url) || a.url === story.hint), `${label} automatically revealed the target answer.`);
}
async function assertClean(f) {
  assert.deepEqual(f.errors, [], 'Uncaught page errors.');
  const qa = await f.p.evaluate(() => qaPhrasePack);
  assert.deepEqual(qa.errors, [], 'Unhandled browser errors.'); assert.equal(qa.microphoneCalls, 0);
  assert(f.requests.every(r => new URL(r.url).origin === origin && ['GET', 'HEAD'].includes(r.method)), 'External request or upload.');
  assert(!f.requests.some(r => /\/(?:xiaoya\/speech\/|speech\/(?:vosk-|model-))/.test(pathname(r.url))), 'Non-recording flow fetched a recognition model.');
  assert.deepEqual(f.responses.filter(r => r.status >= 400 && !(f.fault?.kind === 'missing' && pathname(r.url).endsWith('/stories/' + f.fault.file))), [], 'Unexpected failed response.');
  assert.deepEqual(qa.audio.filter(a => a.error), [], 'Native audio decode/playback error.');
}
async function check(name, fn, options = {}) {
  if (filter && !filter.test(name)) return;
  const entry = {name, startedAt: new Date().toISOString()}; report.checks.push(entry); let f;
  try { f = await fixture(options); entry.evidence = await fn(f); await assertClean(f); entry.status = 'PASS'; console.log('PASS ' + name); }
  catch (error) { entry.status = 'FAIL'; entry.error = error.stack || String(error); process.exitCode = 1; console.error('FAIL ' + name + '\n' + entry.error);
    if (f) { entry.diagnostic = await f.p.evaluate(() => ({main: document.querySelector('main')?.outerHTML, qa: window.qaPhrasePack})).catch(() => null); entry.screenshot = await screenshot(f.p, 'failure-' + name.replace(/[^a-z0-9_-]/gi, '-')).catch(() => null); }
  } finally { if (f) { entry.requests = f.requests; entry.responses = f.responses; entry.requestFailures = f.failures; entry.homeReadyMs = f.homeReadyMs; f.release?.(); await f.c.close(); } entry.finishedAt = new Date().toISOString(); save(); }
}

async function main() {
  fs.mkdirSync(out, {recursive: true});
  expected = JSON.parse(fs.readFileSync(path.join(dist, 'xiaoya/version.json'), 'utf8'));
  Object.assign(report, {version: expected.version, build: expected.build});
  if (process.env.TEST_URL) { const url = new URL(process.env.TEST_URL); assert(['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname), 'Use a loopback server.'); origin = url.origin; }
  else origin = await serve();
  report.origin = origin;
  browser = await chromium.launch({channel: 'msedge', headless: true, args: ['--no-proxy-server', '--autoplay-policy=no-user-gesture-required']});

  await check('catalogue: 115 events, 113 expressions, original 24 plus approved 60', async f => {
    const m = await catalogue(f.p); assert.equal(m.events.length, 115); assert.equal(new Set(m.events.map(e => e.id)).size, 115);
    assert.equal(new Set(m.events.map(e => e.lessonId)).size, 113); assert.equal(new Set(m.events.map(e => normalize(e.english))).size, 113);
    assert.deepEqual(m.pack, approved, 'Runtime metadata differs from the approved phrase package.');
    const appended = ['easy', 'later'].flatMap(d => approved.filter(p => p.difficulty === d).map(p => p.id));
    assert.deepEqual(m.core, [...ORIGINAL_CORE, ...appended]);
    assert.equal(m.units.length, 21); assert.deepEqual(m.units.flatMap(u => u.eventIds), m.core);
    assert.deepEqual(m.voices.sort(), ['aiden', 'pip', 'ryan']);
    const oldAliases = new Set(m.events.filter(e => !e.id.startsWith('daily-')).flatMap(e => [e.english, ...(e.accepted || [])]).map(normalize));
    for (const p of approved) {
      const event = m.events.find(e => e.id === p.id), s = m.stories.find(s => s.id === p.id);
      assert(event && s); assert.equal(event.english, p.english); assert.equal(event.lessonId, p.id); assert.equal(event.contexts.length, 1);
      assert.equal(event.contexts[0].id, p.id); assert.equal(s.teachingFrames.length, 1); assert.equal(s.alternate, null);
      for (const text of [event.english, ...(event.accepted || [])]) assert(!oldAliases.has(normalize(text)), `Duplicate legacy expression/accepted alias: ${text}`);
      for (const voice of m.voices) assert.equal(pathname(s.audio[voice]), mp3Path(p.id, voice));
      assert.equal(pathname(s.hint), mp3Path(p.id, 'hint'));
    }
    return {events: m.events.length, expressions: 113, core: m.core, challengeGroups: m.units.length, singleContextNewLessons: approved.length, approvedMetadataMatches: true};
  });

  for (const width of [390, 1366]) await check(`parent: all 60 available, clear header and no overflow at ${width}`, async f => {
    const before = await audioCount(f.p); await parent(f.p);
    assert.deepEqual(await f.p.locator('.topbar [data-action]').evaluateAll(es => es.map(e => e.dataset.action)), ['home']);
    assert.equal(await audioCount(f.p), before, 'Entering parent settings played child instructions.');
    const entryPlacement = await f.p.evaluate(() => {
      const practice = document.querySelector('.practice-plan'), library = document.querySelector('.story-library');
      const challenge = document.querySelector('.challenge-parent-row')?.closest('.parent-card');
      return {summary: library?.querySelector('summary')?.textContent,
        followsPractice: practice?.nextElementSibling === library, precedesChallenges: library?.nextElementSibling === challenge,
        libraryTop: library?.getBoundingClientRect().top, challengeTop: challenge?.getBoundingClientRect().top};
    });
    assert(entryPlacement.followsPractice && entryPlacement.precedesChallenges, 'The new expression entry is buried after challenge groups.');
    assert.match(entryPlacement.summary, /表达库.*新增\s*60\s*句日常口语/);
    const entryScreenshot = await screenshot(f.p, `parent-entry-${width}`);
    await library(f.p);
    assert.equal(await f.p.locator('.new-phrase-pack [data-story]').count(), 60);
    assert.equal(await f.p.locator('.new-phrase-pack [data-checkup]').count(), 60);
    const entries = await f.p.locator('.new-phrase-pack .checkup-row').evaluateAll(es => es.map(e => ({id: e.dataset.phrase, text: e.innerText,
      story: e.querySelector('[data-story]')?.dataset.story, checkup: e.querySelector('[data-checkup]')?.dataset.checkup,
      enabled: [...e.querySelectorAll('button')].every(b => !b.disabled)})));
    assert.deepEqual(entries.map(e => e.id).sort(), approved.map(p => p.id).sort());
    for (const p of approved) { const e = entries.find(e => e.id === p.id); assert(e.enabled && e.story === p.id && e.checkup === p.id && e.text.includes(p.english)); }
    const screen = await layout(f.p), image = await screenshot(f.p, `parent-${width}`);
    await action(f.p, 'home'); await f.p.locator('main.home-view').waitFor();
    return {entryPlacement, entryScreenshot, entries, screen, screenshot: image, homeWorks: true};
  }, {width, height: width === 390 ? 844 : 900});

  await check('teaching: every selected new lesson waits for real English and question help explains then models', async f => {
    const m = await catalogue(f.p), results = [];
    for (const item of selected) {
      const s = m.stories.find(s => s.id === item.id); assert(s.imageUrl, `${item.id}: artwork still in production.`);
      // Warm the actual product loader using the familiar checkup view. This
      // separates the image-ready teaching branch from slow/missing tests below.
      await library(f.p); const checkupStart = await audioCount(f.p);
      await press(f.p, `[data-checkup="${s.id}"]`); await picture(f.p, s); await guideEnded(f.p, 'flow-review-v13', checkupStart);
      const checkup = await trace(f.p, checkupStart); noAnswer(checkup.audio, s, 'Single-context checkup');
      assert.equal(await f.p.locator('main').getAttribute('data-context'), s.id);
      await library(f.p); const start = await audioCount(f.p), began = await f.p.evaluate(() => performance.now());
      await press(f.p, `[data-story="${s.id}"]`);
      await f.p.locator(`main[data-event="${s.id}"][data-phase="story"]`).waitFor();
      await f.p.locator('[data-action="story-continue"]:enabled').waitFor({timeout: 45000}); await ended(f.p, s.audio.pip, start);
      const taught = await trace(f.p, start), english = taught.audio.find(a => a.url === s.audio.pip);
      assert(english?.endedAt != null && !english.error); assert(!taught.audio.some(a => a.url === s.hint), 'Ready artwork should not force automatic Chinese.');
      const ready = taught.views.find(v => v.id === s.id && v.phase === 'story' && v.ready && v.at >= began);
      assert(ready && ready.at >= english.endedAt, 'Record invitation appeared before English finished.');
      assert.equal(await f.p.locator('main').getAttribute('data-practice-mode'), 'new');
      await picture(f.p, s); await layout(f.p, {child: true});
      const helpStart = await audioCount(f.p); await action(f.p, 'story-help');
      await ended(f.p, s.hint, helpStart); await ended(f.p, s.audio.pip, helpStart);
      const helped = await trace(f.p, helpStart), hint = helped.audio.find(a => a.url === s.hint), model = helped.audio.find(a => a.url === s.audio.pip);
      assert(hint.endedAt <= model.playedAt, 'Help must explain the current scene before its English model.');
      await f.p.locator('[data-action="record"]:enabled').waitFor();
      results.push({id: s.id, checkupAudio: checkup.audio, newAudio: taught.audio, readyAt: ready.at, helpAudio: helped.audio});
    }
    return {readyBranchExplicitlyWarmed: true, count: results.length, results, screenshot: await screenshot(f.p, 'new-lesson-help')};
  });

  await check('recall: due new-pack lesson uses familiar picture without automatic answer', async f => {
    const m = await catalogue(f.p), s = m.stories.find(s => s.id === selected[0].id);
    const seed = await seedPractice(f.p, [s.id], 1); await reloadHome(f.p);
    const start = await audioCount(f.p); await action(f.p, 'next-event');
    await f.p.locator(`main[data-event="${s.id}"][data-phase="request"][data-practice-mode="review"] [data-recall-ready]`).waitFor();
    await guideEnded(f.p, 'flow-review-v13', start); await picture(f.p, s);
    const before = await trace(f.p, start); noAnswer(before.audio, s, 'Scheduled review');
    assert.equal(await f.p.locator('main').getAttribute('data-context'), s.id);
    await f.p.locator('[data-action="sample"]:enabled').waitFor(); await f.p.locator('[data-action="record"]:enabled').waitFor();
    const help = await audioCount(f.p); await action(f.p, 'sample'); await ended(f.p, s.audio.pip, help);
    return {seed, id: s.id, familiarImage: s.imageUrl, before: before.audio, requestedSample: (await trace(f.p, help)).audio};
  });

  await check('recall: new-pack challenge opens voluntarily without revealing answer', async f => {
    const m = await catalogue(f.p), unit = m.units.find(u => u.eventIds.some(id => id === selected[0].id)); assert(unit);
    const seed = await seedPractice(f.p, unit.eventIds, 0); await reloadHome(f.p); await parent(f.p);
    const start = await audioCount(f.p); await press(f.p, `[data-challenge-unit="${unit.id}"]`);
    const s = m.stories.find(s => s.id === unit.eventIds[0]);
    await f.p.locator(`main[data-challenge="${unit.id}"][data-event="${s.id}"] [data-recall-ready]`).waitFor();
    await guideEnded(f.p, 'challenge-question', start); await picture(f.p, s);
    const before = await trace(f.p, start); noAnswer(before.audio, s, 'Challenge');
    assert.equal(await f.p.locator('main').getAttribute('data-context'), s.id);
    const helpStart = await audioCount(f.p); await action(f.p, 'context-help');
    await ended(f.p, s.hint, helpStart); await ended(f.p, s.audio.pip, helpStart);
    return {seed, unit, id: s.id, automaticAudio: before.audio, requestedHelp: (await trace(f.p, helpStart)).audio,
      screenshot: await screenshot(f.p, 'challenge-requested-help')};
  });

  await check('pictures: home is light, every selected accepted image decodes and current story loads alone', async f => {
    const m = await catalogue(f.p), stories = selected.map(item => m.stories.find(s => s.id === item.id));
    await f.p.waitForTimeout(1000); const homeRequests = f.requests.filter(r => isStory(r.url));
    assert.deepEqual(homeRequests, [], 'The first screen prefetched story art.');
    assert(stories.every(s => s.imageUrl && s.imageLayout === 'single' && s.teachingFrames.length === 1), 'A selected picture is missing or is not a single clear scene.');
    assert.equal(new Set(stories.map(s => s.image)).size, stories.length, 'Different expressions reuse one main-picture URL.');
    await library(f.p); assert.deepEqual(f.requests.filter(r => isStory(r.url)), [], 'Opening the parent list fetched story images.');
    const first = stories[0], requestStart = f.requests.length; await press(f.p, `[data-story="${first.id}"]`);
    await picture(f.p, first); await f.p.locator('[data-action="story-continue"]:enabled').waitFor({timeout: 45000});
    const initial = [...new Set(f.requests.slice(requestStart).filter(r => isStory(r.url)).map(r => r.url))];
    assert.deepEqual(initial, [first.imageUrl], 'Opening one lesson fetched unrelated story artwork.');
    const screenshotFile = await screenshot(f.p, 'single-picture-390'), decoded = [];
    for (const s of stories) {
      const result = await f.p.evaluate(url => new Promise(resolve => {
        const image = new Image(), started = performance.now(); let finished = false;
        const finish = value => { if (finished) return; finished = true; clearTimeout(timer); resolve({url, decodeMs: performance.now() - started, ...value}); };
        const timer = setTimeout(() => finish({ok: false, error: 'Native image decode exceeded 15 seconds'}), 15000);
        image.src = url; image.decode().then(() => finish({ok: true, width: image.naturalWidth, height: image.naturalHeight}), error => finish({ok: false, error: error.message}));
      }), s.imageUrl);
      assert(result.ok && result.width > 0 && result.height > 0, `${s.id}: ${JSON.stringify(result)}`);
      const file = path.join(dist, 'xiaoya/stories', s.image), body = fs.readFileSync(file);
      decoded.push({id: s.id, ...result, bytes: body.length, sha256: crypto.createHash('sha256').update(body).digest('hex')});
    }
    assert.equal(new Set(decoded.map(x => x.sha256)).size, decoded.length, 'Different new expressions contain identical image bytes.');
    return {homeStoryRequests: 0, firstLessonStoryRequests: initial, decoded, totalImageBytes: decoded.reduce((sum, r) => sum + r.bytes, 0), screenshot: screenshotFile,
      note: 'Decode times are local browser measurements, not a mobile network benchmark. Image semantics and anatomy need human review.'};
  });

  // Fault URL comes from the built map, never from a hardcoded asset filename.
  const faultTestName = kind => `pictures: ${kind} art explains in Chinese then English and remains usable`;
  if (!filter || ['slow', 'missing'].some(kind => filter.test(faultTestName(kind)))) {
    let probe;
    try {
      probe = await fixture(); const m = await catalogue(probe.p), s = m.stories.find(s => s.id === selected[0].id);
      assert(s?.image, `${selected[0].id}: no accepted mapping for fault tests.`);
      await probe.c.close(); probe = null;
      for (const kind of ['slow', 'missing']) await check(faultTestName(kind), async f => {
        await library(f.p); const start = await audioCount(f.p); await press(f.p, `[data-story="${s.id}"]`);
        await f.p.locator('[data-picture-placeholder="true"]').waitFor();
        await ended(f.p, s.hint, start); await ended(f.p, s.audio.pip, start);
        await f.p.locator('[data-action="story-continue"]:enabled').waitFor();
        const values = await trace(f.p, start), hint = values.audio.find(a => a.url === s.hint), english = values.audio.find(a => a.url === s.audio.pip);
        assert(hint.endedAt <= english.playedAt); assert.equal(await f.p.locator('main').getAttribute('data-event'), s.id);
        assert(await f.p.locator('[data-picture-placeholder="true"]').count(), 'Missing picture reused an unrelated story image.');
        const fallbackShot = await screenshot(f.p, `picture-${kind}-fallback`);
        if (kind === 'slow') {
          const audioBefore = await audioCount(f.p); f.release(); await picture(f.p, s);
          assert.equal(await audioCount(f.p), audioBefore, 'Late artwork restarted teaching audio.');
          await f.p.locator('[data-action="story-continue"]:enabled').waitFor();
        }
        // Consent stays disabled: one click must advance to the microphone UI,
        // never silently open a device or download the recognition model.
        await action(f.p, 'story-continue'); await f.p.locator('main[data-phase="request"]').waitFor();
        await f.p.locator('[role="dialog"]').waitFor();
        return {id: s.id, kind, audio: values.audio, fallbackScreenshot: fallbackShot, recordEntryWorks: true};
      }, {fault: {kind, file: s.image}});
    } catch (error) {
      report.checks.push({name: 'pictures: fault-test mapping setup', status: 'FAIL', error: error.stack}); process.exitCode = 1; save();
    } finally { await probe?.c.close(); }
  }

  await check('offline: all 240 new clips verified and decoded, actual UI plays all three voices without network', async f => {
    const manifest = JSON.parse(fs.readFileSync(path.join(dist, 'xiaoya/releases', expected.build, 'audio-pack.json'), 'utf8'));
    const appBase = origin + '/xiaoya/', added = manifest.filter(x => pathname(new URL(x.url, appBase).href).startsWith('/xiaoya/audio/phrases-v015/'));
    assert.equal(added.length, 240, 'All 60 x (three English + one hint) clips must ship.');
    const urls = new Set(added.map(x => pathname(new URL(x.url, appBase).href)));
    for (const p of approved) for (const v of ['aiden', 'ryan', 'pip', 'hint']) assert(urls.has(mp3Path(p.id, v)), `Missing ${p.id}/${v}`);
    const sw = fs.readFileSync(path.join(dist, 'xiaoya/sw.js'), 'utf8'), cacheName = /const AUDIO\s*=\s*['"]([^'"]+)['"]/.exec(sw)?.[1];
    assert(cacheName, 'Could not locate the built worker audio-cache name.');
    for (const e of added) {
      const file = path.resolve(dist, '.' + decodeURIComponent(pathname(new URL(e.url, appBase).href)));
      assert(!path.relative(dist, file).startsWith('..')); const body = fs.readFileSync(file);
      assert.equal(body.length, e.bytes); assert.equal(crypto.createHash('sha256').update(body).digest('hex'), e.sha256.toLowerCase());
    }
    await f.p.evaluate(async () => {
      await Promise.race([
        navigator.serviceWorker.ready,
        new Promise((_, reject) => setTimeout(() => reject(Error('Audio worker installation timed out')), 180000)),
      ]);
      const base = document.querySelector('script[type="module"][src]').src;
      const {audioPackStatus} = await import(new URL('audio-pack.js', base));
      window.qaPhraseAudioStatus = audioPackStatus;
    });
    await f.p.waitForFunction(() => {
      const status = window.qaPhraseAudioStatus();
      return !!navigator.serviceWorker.controller && status.state === 'ready' && status.total > 0 && status.done === status.total;
    }, null, {timeout: 180000});
    const readyStatus = await f.p.evaluate(() => window.qaPhraseAudioStatus());
    assert.equal(readyStatus.total, manifest.length); assert.equal(readyStatus.done, manifest.length);
    assert.deepEqual(f.requests.filter(r => isStory(r.url)), [], 'Worker install prefetched the story pack.');
    const decoded = await f.p.evaluate(async ({added, appBase, cacheName}) => {
      const cache = await caches.open(cacheName), audio = new AudioContext(), queue = added.slice(), results = [];
      try {
        await Promise.all(Array.from({length: 4}, async () => {
          while (queue.length) {
            const e = queue.shift(), result = {url: e.url};
            try {
              const response = await cache.match(new URL(e.url, appBase).href, {ignoreVary: true}); if (!response) throw Error('Not in ready audio cache');
              const body = await response.arrayBuffer(), hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', body))].map(x => x.toString(16).padStart(2, '0')).join('');
              if (body.byteLength !== e.bytes || hash !== e.sha256.toLowerCase()) throw Error('Cached bytes/integrity differ from manifest');
              const data = await audio.decodeAudioData(body); if (!(data.duration > 0 && data.length > 0 && data.numberOfChannels > 0)) throw Error('Empty decoded clip');
              Object.assign(result, {ok: true, bytes: e.bytes, seconds: data.duration, sampleRate: data.sampleRate, channels: data.numberOfChannels});
            } catch (error) { Object.assign(result, {ok: false, error: String(error)}); }
            results.push(result);
          }
        }));
      } finally { await audio.close(); }
      return results;
    }, {added, appBase, cacheName});
    assert.equal(decoded.length, 240); assert.deepEqual(decoded.filter(x => !x.ok), []);
    const m = await catalogue(f.p), s = m.stories.find(s => s.id === selected[0].id);
    const heard = await trace(f.p); assert(!heard.audio.some(a => Object.values(s.audio).includes(a.url) || a.url === s.hint), 'Offline sample was heard during setup.');
    // Cache the optional picture while online; this does not play its English.
    await library(f.p); const warm = await audioCount(f.p); await press(f.p, `[data-checkup="${s.id}"]`);
    await picture(f.p, s); await guideEnded(f.p, 'flow-review-v13', warm); await library(f.p);
    await f.c.setOffline(true); const failedStart = f.failures.length, responseStart = f.responses.length, played = [];
    for (const voice of ['aiden', 'ryan', 'pip']) {
      await parent(f.p); await press(f.p, `[data-select-voice="${voice}"]`);
      // Selecting a voice may also play its already-shipped preview; the target
      // phrase below must nevertheless be the first native play of its new URL.
      await library(f.p); const start = await audioCount(f.p); await press(f.p, `[data-story="${s.id}"]`);
      await f.p.locator('[data-action="story-continue"]:enabled').waitFor({timeout: 45000}); await ended(f.p, s.audio[voice], start);
      const values = await trace(f.p, start), actual = values.audio.filter(a => a.url === s.audio[voice]);
      assert.equal(actual.length, 1); assert(actual[0].playedAt != null && actual[0].endedAt > actual[0].playedAt && !actual[0].error);
      assert(!values.audio.some(a => Object.values(s.audio).includes(a.url) && a.url !== s.audio[voice]), 'Selected voice played a different English model.');
      played.push({voice, audio: actual});
      if (voice === 'pip') { const helpStart = await audioCount(f.p); await action(f.p, 'story-help'); await ended(f.p, s.hint, helpStart); await ended(f.p, s.audio.pip, helpStart); played.push({voice: 'hint', audio: (await trace(f.p, helpStart)).audio}); }
    }
    const media = f.responses.slice(responseStart).filter(r => isMP3(r.url));
    assert(media.length > 0 && media.every(r => r.worker), 'Offline media must be served by the real worker.');
    assert.deepEqual(f.failures.slice(failedStart).filter(r => isMP3(r.url)), [], 'Offline sound attempted an unavailable network fallback.');
    return {cacheName, readyStatus, packagedCount: added.length, newAudioBytes: added.reduce((n, e) => n + e.bytes, 0), decoded, played, offlineMediaResponses: media};
  }, {worker: true});

  assert(report.checks.length, 'The filter selected no tests.');
  report.finishedAt = new Date().toISOString();
  report.result = report.checks.every(c => c.status === 'PASS') ? (filter || requested ? 'PASS_PARTIAL' : 'PASS_AUTOMATED_SCOPE') : 'FAIL';
}

main().catch(error => { process.exitCode = 1; report.checks.push({name: 'suite setup', status: 'FAIL', error: error.stack || String(error)}); console.error(error); })
  .finally(async () => { await browser?.close(); if (server) await new Promise(resolve => server.close(resolve)); if (fs.existsSync(out)) save(); });
