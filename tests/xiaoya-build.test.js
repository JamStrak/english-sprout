import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
import {buildXiaoya} from '../scripts/build-xiaoya.mjs';

const project = path.resolve(import.meta.dirname, '..');
async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'xiaoya-build-'));
  t.after(() => fs.rm(root, {recursive:true, force:true}));
  await fs.mkdir(path.join(root, 'xiaoya'), {recursive:true});
  await fs.mkdir(path.join(root, 'src'));
  await fs.mkdir(path.join(root, 'dist'));
  await fs.writeFile(path.join(root, 'dist/index.html'), 'original-product');
  for (const name of ['index.html', 'manifest.webmanifest', 'sw.template.js']) await fs.copyFile(path.join(project, 'xiaoya', name), path.join(root, 'xiaoya', name));
  for (const name of ['app.js', 'art.js', 'content.js', 'learning.js', 'audio.js', 'style.css']) await fs.writeFile(path.join(root, 'xiaoya', name), name === 'app.js' ? "import './audio.js';" : name === 'audio.js' ? "export const ready=()=>import('../src/speech-local.js');" : '/* public module */');
  for (const name of ['speech-local.js', 'speech-match.js', 'speech-download.js']) await fs.writeFile(path.join(root, 'src', name), '/* shared module */');
  await fs.writeFile(path.join(root, 'xiaoya', 'private.log'), 'not-public');
  await fs.mkdir(path.join(root, 'public/xiaoya/audio'), {recursive:true});
  await fs.writeFile(path.join(root, 'public/xiaoya/audio/guide-hello.mp3'), 'replacement voice bytes');
  await fs.writeFile(path.join(root, 'public/xiaoya/audio/private.log'), 'not-public');
  const result = await buildXiaoya({root});
  // The outer build copies public media; it must stay outside the eager shell.
  await fs.mkdir(path.join(root, 'dist/xiaoya/stories'), {recursive:true});
  await fs.writeFile(path.join(root, 'dist/xiaoya/stories/goodbye-v2.webp'), 'public story bytes');
  return {root, ...result, output:path.join(root, 'dist/xiaoya')};
}

async function worker(fixture, {corrupt = false} = {}) {
  const scope = 'https://example.test/hosted/course/xiaoya/';
  const listeners = new Map(), stores = new Map(), fetched = [];
  const key = request => typeof request === 'string' ? request : request.url;
  let online = true, claimed = 0, skipped = 0;
  const network = async request => {
    const url = new URL(key(request));
    fetched.push(url.href);
    if (!online) throw new Error('offline');
    if (url.pathname.endsWith('.mp3')) return new Response(new Uint8Array([1,2,3,4,5,6]), {headers:{'Content-Type':'audio/mpeg'}});
    let relative = url.pathname.slice(new URL(scope).pathname.length);
    if (!relative) relative = 'index.html';
    const bytes = await fs.readFile(path.join(fixture.output, relative));
    return new Response(corrupt && relative.endsWith('app.js') ? 'old cached module' : bytes);
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
  const self = {registration:{scope}, clients:{claim:async () => { claimed++; }}, skipWaiting:async () => { skipped++; }, addEventListener:(type, handler) => listeners.set(type, handler)};
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
  return {scope, stores, fetched, caches, lifecycle, fetchRequest, setOnline:value => { online = value; }, claimed:() => claimed, skipped:() => skipped};
}

test('build isolates product, fingerprints every module, rewrites shared imports, and supports nested hosting', async t => {
  const built = await fixture(t);
  assert.equal(await fs.readFile(path.join(built.root, 'dist/index.html'), 'utf8'), 'original-product');
  const html = await fs.readFile(path.join(built.output, 'index.html'), 'utf8');
  assert.match(html, /<base href="\.\.\/">/);
  const script = html.match(/src="(xiaoya\/releases\/[^"]+\/app.js)"/)[1];
  const base = new URL('../', 'https://host.test/nested/xiaoya/');
  assert.equal(new URL(script, base).pathname, `/nested/xiaoya/releases/${built.build}/app.js`);
  assert.match(await fs.readFile(path.join(built.output, `releases/${built.build}/audio.js`), 'utf8'), /import\('\.\/shared\/speech-local.js'\)/);
  assert.ok(built.core.includes(`./releases/${built.build}/shared/speech-download.js`));
  assert.ok(built.core.every(file => !file.includes('model-en-us') && !file.includes('vosk-0.0.8') && !/\.(mp3|webp)$/.test(file)));
  assert.equal(await fs.readFile(path.join(built.output, 'audio/v3/guide-hello.mp3'), 'utf8'), 'replacement voice bytes');
  await assert.rejects(fs.stat(path.join(built.output, 'audio/v3/private.log')), {code:'ENOENT'});
  await assert.rejects(fs.stat(path.join(built.output, 'private.log')), {code:'ENOENT'});
  const again = await buildXiaoya({root:built.root});
  assert.equal(again.build, built.build);
  await fs.appendFile(path.join(built.root, 'xiaoya/art.js'), '\n/* updated artwork */');
  assert.notEqual((await buildXiaoya({root:built.root})).build, built.build);
});

test('worker verifies lightweight core and leaves existing product caches intact', async t => {
  const built = await fixture(t), sw = await worker(built);
  await (await sw.caches.open('english-sprout-core-old')).put('https://example.test/hosted/course/index.html', new Response('old-product'));
  await sw.lifecycle('install');
  await sw.lifecycle('activate');
  assert.equal(sw.skipped(), 1);
  assert.equal(sw.claimed(), 1);
  assert.ok(sw.stores.has('english-sprout-core-old'));
  assert.ok(sw.fetched.every(url => url.startsWith(sw.scope)));
  assert.ok(!sw.fetched.some(url => /\.mp3$|model-en-us|vosk-0/.test(url)));
  sw.setOnline(false);
  const response = await sw.fetchRequest(new Request(new URL(`releases/${built.build}/shared/speech-local.js`, sw.scope)));
  assert.equal(response.status, 200);
  assert.equal(await response.text(), '/* shared module */');
});

test('worker refuses activation when one core response is from another build', async t => {
  const sw = await worker(await fixture(t), {corrupt:true});
  await assert.rejects(sw.lifecycle('install'), /版本不一致/);
  assert.equal(sw.skipped(), 0);
});

test('query navigations use the current shell instead of an older cached query page, online and offline', async t => {
  const built = await fixture(t), sw = await worker(built);
  const currentHtml = await fs.readFile(path.join(built.output, 'index.html'), 'utf8');
  const oldCache = await sw.caches.open('xiaoya-core-old-query-release');
  const urls = ['./?story=hello-goodbye', './index.html?story=hello-goodbye'].map(file => new URL(file, sw.scope).href);
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
  assert.equal(sw.fetched.length, installedRequests, 'Installed current HTML must work without a navigation network request');
  assert.equal(await (await oldCache.match(urls[0])).text(), '<html>old query shell</html>', 'Old release assets stay intact for existing tabs');
});

test('story image loads on demand and remains available offline under a nested host', async t => {
  const sw = await worker(await fixture(t));
  await sw.lifecycle('install');
  const url = new URL('stories/goodbye-v2.webp', sw.scope);
  assert.ok(!sw.fetched.includes(url.href), 'Installing the shell must not download story art');
  assert.equal(await (await sw.fetchRequest(new Request(url))).text(), 'public story bytes');
  sw.setOnline(false);
  assert.equal(await (await sw.fetchRequest(new Request(url))).text(), 'public story bytes');
  assert.equal(sw.fetched.filter(value => value === url.href).length, 1);
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
