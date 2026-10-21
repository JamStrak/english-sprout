import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
import {buildXiaoya} from '../scripts/build-xiaoya.mjs';

const project = path.resolve(import.meta.dirname, '..');
async function fixture(t,{phrasePack=false,internal=false}={}) {
  const scratch = path.join(project, 'test-results', 'tmp');
  await fs.mkdir(scratch, {recursive:true});
  const root = await fs.mkdtemp(path.join(scratch, 'xiaoya-build-'));
  t.after(() => fs.rm(root, {recursive:true, force:true}));
  await fs.mkdir(path.join(root, 'xiaoya'), {recursive:true});
  await fs.mkdir(path.join(root, 'src'));
  await fs.mkdir(path.join(root, 'dist'));
  await fs.writeFile(path.join(root, 'dist/index.html'), 'original-product');
  for (const name of ['index.html', 'manifest.webmanifest', 'sw.template.js']) await fs.copyFile(path.join(project, 'xiaoya', name), path.join(root, 'xiaoya', name));
  const modules = {
    'app.js':"import './audio.js';",
    'audio.js':"export const ready=()=>import('./speech-local.js'); export const match=()=>import('../src/speech-match.js');",
    'speech-local.js':"import './speech-assets.js'; import './speech-signal.js'; import '../src/speech-download.js'; export const worker=new URL('./speech-worker.js',import.meta.url);"
  };
  for (const name of ['phrase-pack-v015.js', 'phrase-assets-v015.js', 'story-assets.js', 'story-pictures.js', 'challenges.js', 'challenge-ui.js', 'challenge.css', 'meadow-hit-shapes.js', 'economy.css', 'seed-shop.js', 'paper.css', 'paper-art.js', 'app.js', 'experience.js', 'practice-plan.js', 'feedback.js', 'feedback.css', 'stories.js', 'story-art.js', 'garden-meadow.js', 'meadow-art.js', 'meadow-ui.js', 'meadow.css', 'garden.js', 'garden-art.js', 'voices.js', 'art.js', 'content.js', 'curriculum.js', 'learning.js', 'audio.js', 'speech-local.js', 'speech-worker.js', 'speech-assets.js', 'speech-signal.js', 'style.css']) await fs.writeFile(path.join(root, 'xiaoya', name), modules[name] || '/* public module */');
  for (const name of ['speech-match.js', 'speech-download.js']) await fs.writeFile(path.join(root, 'src', name), '/* shared module */');
  await fs.writeFile(path.join(root, 'src/speech-local.js'), '/* legacy Vosk: not part of Xiaoya */');
  await fs.writeFile(path.join(root, 'xiaoya', 'private.log'), 'not-public');
  await fs.writeFile(path.join(root, 'xiaoya', 'audio-pack.js'), '/* audio preparation */');
  for (const name of ['blindbox-ui.js', 'seed-appearance.js']) await fs.writeFile(path.join(root, 'xiaoya', name), '/* seed presentation */');
  await fs.writeFile(path.join(root, 'xiaoya', 'runtime.js'), "import {INTERNAL_BUILD} from './build-config.js'; export const enabled=INTERNAL_BUILD;");
  await fs.writeFile(path.join(root, 'xiaoya', 'garden-history.js'), '/* read-only legacy history */');
  await fs.writeFile(path.join(root, 'xiaoya', 'welcome-greetings.js'), '/* local welcome rotation */');
  await fs.writeFile(path.join(root, 'xiaoya', 'gm.js'), "/* internal reviewer */");
  await fs.writeFile(path.join(root, 'xiaoya', 'gm.css'), ".gm-reviewer{color:green}");
  await fs.mkdir(path.join(root, 'public/xiaoya/audio'), {recursive:true});
  await fs.writeFile(path.join(root, 'public/xiaoya/audio/guide-hello.mp3'), new Uint8Array([1,2,3,4,5,6]));
  for (const directory of ['', 'ryan', 'characters/pip']) {
    await fs.mkdir(path.join(root, 'public/audio', directory), {recursive:true});
    await fs.writeFile(path.join(root, 'public/audio', directory, 'hello-01.mp3'), new Uint8Array([1,2,3,4,5,6]));
  }
  await fs.writeFile(path.join(root, 'public/xiaoya/audio/private.log'), 'not-public');
  if(phrasePack){
    const directory=path.join(root,'public/xiaoya/audio/phrases-v015/daily-peekaboo');
    await fs.mkdir(directory,{recursive:true});
    for(const voice of ['aiden','ryan','pip','hint'])await fs.writeFile(path.join(directory,`${voice}.mp3`),new Uint8Array([1,2,3,4,5,6]));
    await fs.writeFile(path.join(directory,'private.log'),'not-public');
  }
  await fs.mkdir(path.join(root, 'public/xiaoya/icons'), {recursive:true});
  for (const name of ['icon-paper-v04-48.png','icon-paper-v04-192.png','icon-paper-v04-512.png']) await fs.copyFile(path.join(project, 'public/xiaoya/icons', name), path.join(root, 'public/xiaoya/icons', name));
  await fs.mkdir(path.join(root, 'public/xiaoya/stories'), {recursive:true});
  await fs.writeFile(path.join(root, 'public/xiaoya/stories/goodbye-v2.webp'), 'public story bytes');
  await fs.writeFile(path.join(root, 'public/xiaoya/stories/unvisited.webp'), 'another story bytes');
  await fs.mkdir(path.join(root, 'public/xiaoya/paper/v1'), {recursive:true});
  await fs.writeFile(path.join(root, 'public/xiaoya/paper/v1/seed.webp'), 'paper seed bytes');
  await fs.writeFile(path.join(root, 'public/xiaoya/stories/fallback.svg'), '<svg/>');
  await fs.writeFile(path.join(root, 'public/xiaoya/stories/private.log'), 'not catalogued');
  const result = await buildXiaoya({root,internal});
  return {root, ...result, output:path.join(root, 'dist/xiaoya')};
}

async function worker(fixture, {corrupt = false} = {}) {
  const scope = 'https://example.test/hosted/course/xiaoya/';
  const listeners = new Map(), stores = new Map(), fetched = [], messages = [];
  const key = request => typeof request === 'string' ? request : request.url;
  let online = true, claimed = 0, skipped = 0, badVoice = false, badArt = false;
  const network = async request => {
    const url = new URL(key(request));
    fetched.push(url.href);
    if (!online) throw new Error('offline');
    if (url.pathname.endsWith('.mp3')) return new Response(badVoice && url.pathname.endsWith('guide-hello.mp3') ? 'broken MP3' : new Uint8Array([1,2,3,4,5,6]), {headers:{'Content-Type':'audio/mpeg'}});
    let relative = url.pathname.slice(new URL(scope).pathname.length);
    if (!relative) relative = 'index.html';
    const bytes = await fs.readFile(path.join(fixture.output, relative));
    return new Response(corrupt && relative.endsWith('app.js') ? 'old cached module' : badArt && relative === 'stories/unvisited.webp' ? 'damaged art' : bytes);
  };
  const caches = {
    keys:async () => [...stores.keys()],
    open:async name => {
      if (!stores.has(name)) stores.set(name, new Map());
      const entries = stores.get(name);
      return {
        match:async (request, options = {}) => {
          const wanted = new URL(key(request));
          for (const [url, response] of entries) if (url === wanted.href || options.ignoreSearch && new URL(url).origin + new URL(url).pathname === wanted.origin + wanted.pathname) return response.clone();
          return undefined;
        },
        put:async (request, response) => { entries.set(key(request), response.clone()); },
        addAll:async requests => { for (const request of requests) entries.set(key(request), await network(request)); }
      };
    }
  };
  const self = {registration:{scope}, clients:{claim:async () => { claimed++; }, matchAll:async () => [{postMessage:message => messages.push(structuredClone(message))}]}, skipWaiting:async () => { skipped++; }, addEventListener:(type, handler) => listeners.set(type, handler)};
  const source = await fs.readFile(path.join(fixture.output, 'sw.js'), 'utf8');
  vm.runInNewContext(source, {self, caches, crypto:webcrypto, Request, Response, Headers, URL, fetch:network, console});
  const lifecycle = async type => {
    let work;
    listeners.get(type)({waitUntil:value => { work = value; }});
    return work;
  };
  const fetchRequest = async request => {
    let answer, lifetime;
    listeners.get('fetch')({request, respondWith:promise => { answer = promise; }, waitUntil:promise => { lifetime = promise; }});
    if (!answer) return undefined;
    const response = await answer;
    await lifetime;
    return response;
  };
  const send = async data => {
    let lifetime;
    listeners.get('message')({data, source:{postMessage:message => messages.push(structuredClone(message))}, waitUntil:work => { lifetime = work; }});
    await lifetime;
  };
  return {scope, stores, fetched, caches, messages, lifecycle, fetchRequest, send, setBadArt:value => { badArt = value; }, setBadVoice:value => { badVoice = value; }, setOnline:value => { online = value; }, claimed:() => claimed, skipped:() => skipped};
}

test('build isolates product, fingerprints every module, rewrites shared imports, and supports nested hosting', async t => {
  const built = await fixture(t);
  assert.equal(await fs.readFile(path.join(built.root, 'dist/index.html'), 'utf8'), 'original-product');
  const html = await fs.readFile(path.join(built.output, 'index.html'), 'utf8');
  const startup = `start-${built.build}.html`;
  assert.equal(await fs.readFile(path.join(built.output, startup), 'utf8'), html);
  assert.ok(built.core.includes(`./${startup}`), 'The immutable launch entry is part of the verified offline shell');
  assert.match(html, /<base href="\.\.\/">/);
  assert.match(html, /<title>小芽英语·自由花园版 v0\.20\.1<\/title>/);
  assert.match(await fs.readFile(path.join(built.output, 'manifest.webmanifest'), 'utf8'), /自由花园版 v0\.20\.1/);
  const script = html.match(/src="(xiaoya\/releases\/[^"]+\/app.js)"/)[1];
  const base = new URL('../', 'https://host.test/nested/xiaoya/');
  assert.equal(new URL(script, base).pathname, `/nested/xiaoya/releases/${built.build}/app.js`);
  const audio = await fs.readFile(path.join(built.output, `releases/${built.build}/audio.js`), 'utf8');
  assert.match(audio, /import\('\.\/speech-local.js'\)/);
  assert.match(audio, /import\('\.\/shared\/speech-match.js'\)/);
  const speech = await fs.readFile(path.join(built.output, `releases/${built.build}/speech-local.js`), 'utf8');
  assert.match(speech, /import '\.\/shared\/speech-download.js'/);
  assert.match(speech, /new URL\('\.\/speech-worker.js',import.meta.url\)/);
  for (const name of ['speech-local.js', 'speech-worker.js', 'speech-assets.js', 'speech-signal.js']) assert.ok(built.core.includes(`./releases/${built.build}/${name}`), `The small ${name} module must be available offline`);
  assert.ok(built.core.includes(`./releases/${built.build}/shared/speech-download.js`));
  for (const name of ['icon-paper-v04-48.png','icon-paper-v04-192.png','icon-paper-v04-512.png']) {
    assert.ok(built.core.includes(`./icons/${name}`), 'PWA identity is included in the verified offline shell');
    assert.deepEqual(await fs.readFile(path.join(built.output, 'icons', name)), await fs.readFile(path.join(project, 'public/xiaoya/icons', name)));
  }
  await assert.rejects(fs.stat(path.join(built.output, `releases/${built.build}/shared/speech-local.js`)), {code:'ENOENT'});
  for (const retired of ['garden.js', 'story-art.js']) await assert.rejects(fs.stat(path.join(built.output, `releases/${built.build}/${retired}`)), {code:'ENOENT'});
  assert.ok(built.core.includes(`./releases/${built.build}/garden-history.js`));
  assert.ok(built.core.every(file => !/model-en-us|vosk-0\.0\.8|whisper-tiny-en-v1|\.(mp3|webp|onnx|wasm)$/.test(file)));
  assert.deepEqual([...await fs.readFile(path.join(built.output, 'audio/v3/guide-hello.mp3'))], [1,2,3,4,5,6]);
  await assert.rejects(fs.stat(path.join(built.output, 'audio/v3/private.log')), {code:'ENOENT'});
  await assert.rejects(fs.stat(path.join(built.output, 'private.log')), {code:'ENOENT'});
  const again = await buildXiaoya({root:built.root});
  assert.equal(again.build, built.build);
  await fs.appendFile(path.join(built.root, 'xiaoya/art.js'), '\n/* updated artwork */');
  assert.notEqual((await buildXiaoya({root:built.root})).build, built.build);
});

test('public is the default and contains no GM entry, workbench, stylesheet or asset catalogue', async t => {
  const built = await fixture(t), release = path.join(built.output, 'releases', built.build);
  assert.equal(built.channel, 'public');
  assert.equal(JSON.parse(await fs.readFile(path.join(built.output, 'version.json'), 'utf8')).channel, 'public');
  assert.match(await fs.readFile(path.join(release, 'build-config.js'), 'utf8'), /INTERNAL_BUILD = false/);
  assert.doesNotMatch(await fs.readFile(path.join(release, 'app.js'), 'utf8'), /gm\.js/);
  assert.ok(!built.core.some(file => /\/gm[.-]/.test(file)));
  for (const file of ['gm.js', 'gm.css', 'gm-catalog.json']) await assert.rejects(fs.stat(path.join(release, file)), {code:'ENOENT'});
  assert.ok(built.core.includes(`./releases/${built.build}/runtime.js`));
  assert.ok(built.core.includes(`./releases/${built.build}/build-config.js`));
});

test('explicit internal builds fingerprint their channel and catalogue all static artwork and shipped audio', async t => {
  const built = await fixture(t, {phrasePack:true,internal:true});
  const release = path.join(built.output, 'releases', built.build);
  assert.equal(built.channel, 'internal');
  assert.equal(JSON.parse(await fs.readFile(path.join(built.output, 'version.json'), 'utf8')).channel, 'internal');
  assert.match(await fs.readFile(path.join(release, 'app.js'), 'utf8'), /import '\.\/gm\.js'/);
  assert.match(await fs.readFile(path.join(release, 'build-config.js'), 'utf8'), /INTERNAL_BUILD = true/);
  for (const file of ['gm.js','gm.css','gm-catalog.json']) assert.ok(built.core.includes(`./releases/${built.build}/${file}`));
  const catalogue = JSON.parse(await fs.readFile(path.join(release, 'gm-catalog.json'), 'utf8'));
  assert.equal(catalogue.images.length, 6);
  assert.equal(catalogue.audio.length, 8);
  assert.ok(catalogue.images.some(entry => entry.url === 'xiaoya/stories/goodbye-v2.webp' && entry.category === 'stories'));
  assert.ok(!catalogue.images.some(entry => entry.url.endsWith('.svg')), 'The workbench does not offer retired SVG fallbacks');
  assert.ok(catalogue.audio.some(entry => entry.url === 'audio/characters/pip/hello-01.mp3' && entry.category === 'pip'));
  assert.ok(catalogue.audio.some(entry => entry.url === 'xiaoya/audio/phrases-v015/daily-peekaboo/hint.mp3' && entry.category === 'hint'));
  assert.ok(catalogue.audio.some(entry => entry.url === 'xiaoya/audio/v3/guide-hello.mp3' && entry.category === 'guide'));
  for (const entry of [...catalogue.images,...catalogue.audio]) {
    assert.ok(entry.bytes > 0 && entry.name && /^[a-f0-9]{64}$/.test(entry.sha256));
    assert.ok(!entry.url.startsWith('/') && !entry.url.includes('..') && !entry.url.includes('private'));
    assert.ok(new URL(entry.url, 'https://host.test/nested/').pathname.startsWith('/nested/'));
  }
  assert.ok(built.core.every(file => !file.endsWith('.webp') && !file.endsWith('.mp3')), 'Media use separate verified packs instead of the shell cache');
  const sw = await worker(built);
  await sw.lifecycle('install');
  sw.setOnline(false);
  const offlineCatalogue = await sw.fetchRequest(new Request(new URL(`releases/${built.build}/gm-catalog.json`, sw.scope)));
  assert.deepEqual(await offlineCatalogue.json(), catalogue, 'The review index itself is verified and available offline');
  assert.equal(sw.fetched.filter(url => url.endsWith('.webp')).length, 3, 'Installing the release prepares every runtime picture');
  const publicBuild = await buildXiaoya({root:built.root, dist:path.join(built.root, 'public-dist')});
  assert.notEqual(publicBuild.build, built.build);
  assert.equal(publicBuild.channel, 'public');
  await fs.appendFile(path.join(built.root, 'public/xiaoya/stories/goodbye-v2.webp'), 'changed');
  assert.notEqual((await buildXiaoya({root:built.root,internal:true})).build, built.build, 'Image changes invalidate the internal catalogue and shell');
  await assert.rejects(buildXiaoya({root:built.root,internal:'true'}), /explicit boolean/);
});

test('worker verifies core and the full voice pack, leaving existing product caches intact', async t => {
  const built = await fixture(t), sw = await worker(built);
  await (await sw.caches.open('english-sprout-core-old')).put('https://example.test/hosted/course/index.html', new Response('old-product'));
  await sw.lifecycle('install');
  await sw.lifecycle('activate');
  assert.equal(sw.skipped(), 1);
  assert.equal(sw.claimed(), 1);
  assert.ok(sw.stores.has('english-sprout-core-old'));
  assert.ok(sw.fetched.every(url => url.startsWith(new URL('../', sw.scope).href)));
  assert.equal(sw.fetched.filter(url => url.endsWith('.mp3')).length, 4);
  assert.ok(!sw.fetched.some(url => /model-en-us|vosk-0|whisper-tiny-en-v1/.test(url)));
  sw.setOnline(false);
  for (const file of ['speech-local.js', 'speech-worker.js', 'speech-assets.js', 'speech-signal.js', 'shared/speech-match.js', 'shared/speech-download.js']) {
    const response = await sw.fetchRequest(new Request(new URL(`releases/${built.build}/${file}`, sw.scope)));
    assert.equal(response.status, 200);
    assert.equal(await response.text(), await fs.readFile(path.join(built.output, `releases/${built.build}/${file}`), 'utf8'));
  }
});

test('every built-in voice works offline without ever being played first', async t => {
  const built = await fixture(t), sw = await worker(built);
  await sw.lifecycle('install');
  sw.setOnline(false);
  const requests = sw.fetched.length;
  for (const file of ['./audio/v3/guide-hello.mp3', '../audio/hello-01.mp3', '../audio/ryan/hello-01.mp3', '../audio/characters/pip/hello-01.mp3']) {
    const response = await sw.fetchRequest(new Request(new URL(file, sw.scope), {headers:{Range:'bytes=1-3'}}));
    assert.equal(response.status, 206, `${file} must be ready before the first listen`);
    assert.deepEqual([...new Uint8Array(await response.arrayBuffer())], [2,3,4]);
  }
  assert.equal(sw.fetched.length, requests, 'Offline first listens must never attempt network');
});

test('audio bytes fingerprint the release and the published voice pack', async t => {
  const built = await fixture(t);
  const manifest = JSON.parse(await fs.readFile(path.join(built.output, `releases/${built.build}/audio-pack.json`), 'utf8'));
  assert.equal(manifest.length, 4);
  assert.ok(manifest.every(entry => entry.bytes === 6 && /^[a-f0-9]{64}$/.test(entry.sha256)));
  await fs.writeFile(path.join(built.root, 'public/xiaoya/audio/guide-hello.mp3'), 'new voice');
  assert.notEqual((await buildXiaoya({root:built.root})).build, built.build);
});

test('new phrase voices are copied, fingerprinted and ready for first playback offline',async t=>{
  const built=await fixture(t,{phrasePack:true}),sw=await worker(built);
  const manifest=JSON.parse(await fs.readFile(path.join(built.output,`releases/${built.build}/audio-pack.json`),'utf8'));
  assert.equal(manifest.length,8);
  await sw.lifecycle('install');sw.setOnline(false);
  const requests=sw.fetched.length;
  for(const voice of ['aiden','ryan','pip','hint']){
    const relative=`audio/phrases-v015/daily-peekaboo/${voice}.mp3`;
    assert.deepEqual([...await fs.readFile(path.join(built.output,relative))],[1,2,3,4,5,6]);
    assert(manifest.some(entry=>entry.url===`./${relative}`));
    const response=await sw.fetchRequest(new Request(new URL(relative,sw.scope),{headers:{Range:'bytes=1-3'}}));
    assert.equal(response.status,206);assert.deepEqual([...new Uint8Array(await response.arrayBuffer())],[2,3,4]);
  }
  assert.equal(sw.fetched.length,requests);
  await assert.rejects(fs.stat(path.join(built.output,'audio/phrases-v015/daily-peekaboo/private.log')),{code:'ENOENT'});
  await fs.appendFile(path.join(built.root,'public/xiaoya/audio/phrases-v015/daily-peekaboo/pip.mp3'),'changed');
  assert.notEqual((await buildXiaoya({root:built.root})).build,built.build);
});

test('corrupt voices block activation and retry resumes from the verified partial pack', async t => {
  const sw = await worker(await fixture(t));
  sw.setBadVoice(true);
  await assert.rejects(sw.lifecycle('install'), /声音文件不完整/);
  assert.equal(sw.skipped(), 0, 'A partial pack must never be called ready');
  const ready = sw.stores.get('xiaoya-audio-v3');
  assert.equal(ready.size, 3, 'Other completed voices remain available for resuming');
  const requests = sw.fetched.filter(url => url.endsWith('.mp3')).length;
  sw.setBadVoice(false);
  await sw.lifecycle('install');
  assert.equal(sw.skipped(), 1);
  assert.equal(sw.fetched.filter(url => url.endsWith('.mp3')).length - requests, 1, 'Only the missing voice is downloaded again');
});

test('damaged existing audio is repaired before playback instead of being trusted as a 200 response', async t => {
  const sw = await worker(await fixture(t));
  await sw.lifecycle('install');
  const url = new URL('./audio/v3/guide-hello.mp3', sw.scope).href;
  const cache = await sw.caches.open('xiaoya-audio-v3');
  await cache.put(url, new Response('truncated'));
  const requests = sw.fetched.length;
  const response = await sw.fetchRequest(new Request(url, {headers:{Range:'bytes=1-3'}}));
  assert.equal(response.status, 206);
  assert.deepEqual([...new Uint8Array(await response.arrayBuffer())], [2,3,4]);
  assert.equal(sw.fetched.length, requests + 1);
  assert.deepEqual([...new Uint8Array(await (await cache.match(url)).arrayBuffer())], [1,2,3,4,5,6]);
});

test('worker refuses activation when one core response is from another build', async t => {
  const sw = await worker(await fixture(t), {corrupt:true});
  await assert.rejects(sw.lifecycle('install'), /版本不一致/);
  assert.equal(sw.skipped(), 0);
});

test('query and restored startup navigations prefer the current entry, never an older cached page', async t => {
  const built = await fixture(t), sw = await worker(built);
  const currentHtml = await fs.readFile(path.join(built.output, 'index.html'), 'utf8');
  const oldCache = await sw.caches.open('xiaoya-core-old-query-release');
  const urls = ['./?story=hello-goodbye', './index.html?story=hello-goodbye', './start-aaaaaaaaaaaa.html?story=hello-goodbye', `./start-${built.build}.html?story=hello-goodbye`].map(file => new URL(file, sw.scope).href);
  await fs.writeFile(path.join(built.output, 'start-aaaaaaaaaaaa.html'), currentHtml.replaceAll(built.build, 'aaaaaaaaaaaa'));
  for (const url of urls) await oldCache.put(url, new Response('<html>old query shell</html>'));
  await sw.lifecycle('install');
  await sw.lifecycle('activate');
  const installedRequests = sw.fetched.length;
  for (const online of [true, false]) {
    sw.setOnline(online);
    for (const url of urls) {
      // Node disallows constructing mode:navigate; keep its real Request URL
      // and headers while exposing the mode supplied by a browser navigation.
      const request = new Request(url);
      Object.defineProperty(request, 'mode', {value:'navigate'});
      const response = await sw.fetchRequest(request);
      assert.equal(response.status, 200, `Navigation must return a shell (${online ? 'online' : 'offline'})`);
      assert.equal(await response.text(), currentHtml, 'An older release must never serve query navigation HTML');
      assert.equal(response.headers.get('Location'), null, 'Serving the shell must not redirect away from the story query');
      assert.equal(response.redirected, false);
      assert.equal(request.url, url);
      assert.equal(new URL(request.url).searchParams.get('story'), 'hello-goodbye');
    }
  }
  assert.equal(sw.fetched.length, installedRequests + urls.length * 2, 'Each navigation checks the network, including an offline attempt');
  assert.equal(await (await oldCache.match(urls[0])).text(), '<html>old query shell</html>', 'Old release assets stay intact for existing tabs');
});

test('a newer online shell does not replace this worker offline shell or interrupt existing clients', async t => {
  const built = await fixture(t), sw = await worker(built);
  const original = await fs.readFile(path.join(built.output, 'index.html'), 'utf8');
  await sw.lifecycle('install');
  await sw.lifecycle('activate');
  const newer = original.replaceAll(built.build, '0123456789ab');
  await fs.writeFile(path.join(built.output, 'index.html'), newer);
  const request = new Request(new URL('./?garden=b', sw.scope));
  Object.defineProperty(request, 'mode', {value:'navigate'});
  assert.equal(await (await sw.fetchRequest(request)).text(), newer, 'A new navigation must reach the published build before worker activation');
  const cache = await sw.caches.open(`xiaoya-core-${built.build}`);
  assert.equal(await (await cache.match(new URL('./index.html', sw.scope).href)).text(), original, 'An installed release remains atomic');
  await fs.writeFile(path.join(built.output, 'index.html'), '<html>temporary upstream error</html>');
  assert.equal(await (await sw.fetchRequest(request)).text(), original, 'A non-app network response must not replace the offline app');
  sw.setOnline(false);
  assert.equal(await (await sw.fetchRequest(request)).text(), original);
  assert.equal(await (await sw.fetchRequest(new Request(new URL(`start-${built.build}.html`, sw.scope)))).text(), original);
  assert.equal(sw.claimed(), 1, 'Navigation never reclaims or navigates another client');
});

test('all story and garden images are available offline before any lesson is visited under a nested host', async t => {
  const sw = await worker(await fixture(t));
  await sw.lifecycle('install');
  const requests = sw.fetched.length;
  sw.setOnline(false);
  for (const [file, expected] of [['stories/goodbye-v2.webp','public story bytes'],['stories/unvisited.webp','another story bytes'],['paper/v1/seed.webp','paper seed bytes']]) {
    const response = await sw.fetchRequest(new Request(new URL(file, sw.scope)));
    assert.equal(await response.text(), expected, 'Previously unseen content must be ready immediately after restart');
  }
  assert.equal(sw.fetched.length, requests, 'Offline artwork must not need a first network request');
});

test('art bytes identify the public release and a separate content-versioned verified pack', async t => {
  const built = await fixture(t);
  const metadata = JSON.parse(await fs.readFile(path.join(built.output, 'version.json'), 'utf8'));
  const art = JSON.parse(await fs.readFile(path.join(built.output, `releases/${built.build}/art-pack.json`), 'utf8'));
  assert.equal(metadata.name, '小芽英语·自由花园版');
  assert.equal(metadata.garden, 'free');
  assert.equal(metadata.art.version, built.artVersion);
  assert.equal(metadata.art.count, 3);
  assert.equal(metadata.art.bytes, art.reduce((sum, file) => sum + file.bytes, 0));
  assert.ok(art.every(file => file.bytes > 0 && /^[a-f0-9]{64}$/.test(file.sha256)));
  await assert.rejects(fs.stat(path.join(built.output, 'stories/fallback.svg')), {code:'ENOENT'});
  await assert.rejects(fs.stat(path.join(built.output, 'stories/private.log')), {code:'ENOENT'});
  await fs.appendFile(path.join(built.root, 'public/xiaoya/stories/unvisited.webp'), 'new art bytes');
  const updated = await buildXiaoya({root:built.root});
  assert.notEqual(updated.build, built.build, 'Public builds also include the actual artwork, not only module changes');
  assert.notEqual(updated.artVersion, built.artVersion);
});

test('corrupt art blocks activation and retry resumes a verified partial picture pack', async t => {
  const built = await fixture(t), sw = await worker(built);
  sw.setBadArt(true);
  await assert.rejects(sw.lifecycle('install'), /图片文件不完整/);
  assert.equal(sw.skipped(), 0, 'Voices being ready must not activate an incomplete artwork release');
  assert.equal(sw.stores.get(`xiaoya-art-${built.artVersion}`).size, 2);
  assert.ok(sw.messages.some(message => message.type === 'xiaoya-art-pack' && message.build === built.build && message.state === 'error'));
  assert.ok(!sw.messages.some(message => message.type === 'xiaoya-art-pack' && message.state === 'ready'));
  const before = sw.fetched.filter(url => url.endsWith('.webp')).length;
  sw.setBadArt(false);
  await sw.lifecycle('install');
  assert.equal(sw.skipped(), 1);
  assert.equal(sw.fetched.filter(url => url.endsWith('.webp')).length - before, 1);
  assert.deepEqual(sw.messages.filter(message => message.type === 'xiaoya-art-pack').at(-1), {type:'xiaoya-art-pack', build:built.build, state:'ready', done:3, total:3});
});

test('art never falls back to an older shell or corrupted content cache and repairs valid bytes online', async t => {
  const built = await fixture(t), sw = await worker(built);
  const url = new URL('stories/unvisited.webp', sw.scope).href;
  const old = await sw.caches.open('xiaoya-core-retired');
  await old.put(url, new Response('old SVG-style picture'));
  await sw.lifecycle('install');
  const art = await sw.caches.open(`xiaoya-art-${built.artVersion}`);
  await art.put(url, new Response('tampered current picture'));
  sw.setOnline(false);
  assert.equal((await sw.fetchRequest(new Request(url))).type, 'error', 'Never show visually wrong bytes merely because a cache entry exists');
  assert.equal((await sw.fetchRequest(new Request(new URL('stories/fallback.svg', sw.scope)))).type, 'error');
  sw.setOnline(true);
  const repaired = await sw.fetchRequest(new Request(url + '?from=old-bookmark'));
  assert.equal(await repaired.text(), 'another story bytes');
  sw.setOnline(false);
  assert.equal(await (await sw.fetchRequest(new Request(url))).text(), 'another story bytes');
  assert.equal(await (await old.match(url)).text(), 'old SVG-style picture', 'Other tabs and products retain their own cache records');
});

test('art preparation messages verify the entire pack and reject requests for another build', async t => {
  const built = await fixture(t), sw = await worker(built);
  await sw.send({type:'xiaoya-prepare-art', build:'0123456789ab'});
  assert.deepEqual(sw.messages.at(-1), {type:'xiaoya-art-update', requestedBuild:'0123456789ab', build:built.build});
  assert.equal(sw.fetched.length, 0);
  await sw.send({type:'xiaoya-prepare-art', build:built.build});
  assert.deepEqual(sw.messages.at(-1), {type:'xiaoya-art-pack', build:built.build, state:'ready', done:3, total:3});
  const requests = sw.fetched.length;
  sw.setOnline(false);
  await sw.send({type:'xiaoya-prepare-art', build:built.build});
  assert.equal(sw.messages.at(-1).state, 'ready');
  assert.equal(sw.fetched.length, requests, 'Already complete artwork is validated locally without redownloading');
});

test('downloaded original and new help clips play offline including byte ranges', async t => {
  const sw = await worker(await fixture(t));
  await sw.lifecycle('install');
  for (const audio of ['../audio/hello-01.mp3', './audio/help-hello.mp3']) {
    sw.setOnline(true);
    const url = new URL(audio, sw.scope);
    const response = await sw.fetchRequest(new Request(url, {headers:{Range:'bytes=1-3'}}));
    assert.equal(response.status, 206);
    assert.deepEqual([...new Uint8Array(await response.arrayBuffer())], [2,3,4]);
    sw.setOnline(false);
    const offline = await sw.fetchRequest(new Request(url, {headers:{Range:'bytes=3-'}}));
    assert.equal(offline.headers.get('Content-Range'), 'bytes 3-5/6');
    assert.deepEqual([...new Uint8Array(await offline.arrayBuffer())], [4,5,6]);
  }
});

test('worker reuses old audio and bypasses resumable speech downloads and outside requests', async t => {
  const sw = await worker(await fixture(t));
  const url = new URL('../audio/hello-02.mp3', sw.scope).href;
  await (await sw.caches.open('english-sprout-audio-v5')).put(url, new Response('original clip'));
  sw.setOnline(false);
  assert.equal(await (await sw.fetchRequest(new Request(url))).text(), 'original clip');
  assert.equal(await sw.fetchRequest(new Request(new URL('../speech/model-en-us-0.15.tar.gz', sw.scope), {cache:'no-store'})), undefined);
  for (const file of ['model/onnx/encoder_model.onnx', 'model/config.json', 'runtime/ort-wasm-simd-threaded.wasm', 'runtime/transformers-4.3.1.min.js']) {
    const request = new Request(new URL(`speech/whisper-tiny-en-v1/${file}`, sw.scope), {cache:'no-store', headers:{Range:'bytes=0-1023'}});
    assert.equal(await sw.fetchRequest(request), undefined, 'Verified resumable Whisper downloads must bypass the shell worker');
  }
  assert.equal(await sw.fetchRequest(new Request('https://example.test/unrelated/file.js')), undefined);
  assert.equal(await sw.fetchRequest(new Request('https://other.test/hosted/course/audio/a.mp3')), undefined);
});

test('replaced Chinese voices bypass the previous voice cache and remain available offline', async t => {
  const sw = await worker(await fixture(t));
  const oldUrl = new URL('./audio/speak.mp3', sw.scope).href;
  const url = new URL('./audio/v3/speak.mp3', sw.scope).href;
  await (await sw.caches.open('xiaoya-audio-v1')).put(oldUrl, new Response('old system voice'));
  await (await sw.caches.open('english-sprout-audio-v5')).put(oldUrl, new Response('old parent-worker voice'));
  await (await sw.caches.open('english-sprout-audio-v5')).put(url, new Response('unexpected parent-worker voice'));
  const response = await sw.fetchRequest(new Request(url));
  assert.deepEqual([...new Uint8Array(await response.arrayBuffer())], [1,2,3,4,5,6]);
  assert.ok(sw.fetched.includes(url), 'Replacement bytes must be downloaded instead of replaying v1');
  sw.setOnline(false);
  assert.deepEqual([...new Uint8Array(await (await sw.fetchRequest(new Request(url))).arrayBuffer())], [1,2,3,4,5,6]);
  assert.equal(await (await (await sw.caches.open('xiaoya-audio-v1')).match(oldUrl)).text(), 'old system voice');
  const player = await fs.readFile(path.join(project, 'xiaoya/audio.js'), 'utf8');
  const template = await fs.readFile(path.join(project, 'xiaoya/sw.template.js'), 'utf8');
  assert.equal(player.match(/const AUDIO_CACHE = '([^']+)'/)[1], template.match(/const AUDIO = '([^']+)'/)[1]);
});
