const PREFIX = 'xiaoya-core-';
const CACHE = PREFIX + '__XIAOYA_BUILD__';
const AUDIO = 'xiaoya-audio-v3';
const ART = 'xiaoya-art-__XIAOYA_ART_VERSION__';
const SPEECH = 'english-sprout-speech-v1';
const CORE = __XIAOYA_CORE__;
const INTEGRITY = /*__XIAOYA_INTEGRITY__*/{};
const VOICES = /*__XIAOYA_AUDIO__*/[];
const PICTURES = /*__XIAOYA_ART__*/[];
const BUILD = '__XIAOYA_BUILD__';
const SCOPE = self.registration.scope;
const BASE = new URL('../', SCOPE);
const absolute = file => new URL(file, SCOPE).href;
const voiceByUrl = new Map(VOICES.map(file => [absolute(file.url), file]));
const artByUrl = new Map(PICTURES.map(file => [absolute(file.url), file]));
let preparingVoices = null;
let preparingArt = null;
let voiceStatus = {type:'xiaoya-audio-pack', build:BUILD, state:'preparing', done:0, total:VOICES.length};
let artStatus = {type:'xiaoya-art-pack', build:BUILD, state:'preparing', done:0, total:PICTURES.length};
const checksum = async bytes => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), byte => byte.toString(16).padStart(2, '0')).join('');
async function validVoice(response, file) {
  if (response?.status !== 200) return false;
  try {
    const bytes = await response.clone().arrayBuffer();
    return bytes.byteLength === file.bytes && await checksum(bytes) === file.sha256;
  } catch { return false; }
}
async function announceVoices() {
  const clients = await self.clients.matchAll?.({type:'window', includeUncontrolled:true}) || [];
  for (const client of clients) client.postMessage(voiceStatus);
}
function prepareVoices() {
  if (preparingVoices) return preparingVoices;
  preparingVoices = (async () => {
    const cache = await caches.open(AUDIO);
    voiceStatus = {...voiceStatus, state:'preparing', done:0};
    await announceVoices();
    let cursor = 0;
    const results = await Promise.allSettled(Array.from({length:Math.min(6, VOICES.length)}, async () => {
      while (cursor < VOICES.length) {
        const file = VOICES[cursor++], url = absolute(file.url);
        let response = await cache.match(url, {ignoreVary:true});
        if (!await validVoice(response, file)) {
          // Reload bypasses HTTP caches. Worker fetches do not pass through an
          // older service worker, which may still control the open page.
          response = await fetch(new Request(url, {cache:'reload'}));
          if (!await validVoice(response, file)) throw new Error('内置声音文件不完整');
          await cache.put(url, response);
        }
        voiceStatus.done++;
        if (voiceStatus.done % 12 === 0) await announceVoices();
      }
    }));
    const failure = results.find(result => result.status === 'rejected');
    if (failure) throw failure.reason;
    voiceStatus = {...voiceStatus, state:'ready'};
    await announceVoices();
  })().catch(async error => {
    voiceStatus = {...voiceStatus, state:'error'};
    await announceVoices();
    throw error;
  }).finally(() => { preparingVoices = null; });
  return preparingVoices;
}

async function announceArt() {
  const clients = await self.clients.matchAll?.({type:'window', includeUncontrolled:true}) || [];
  for (const client of clients) client.postMessage(artStatus);
}

function prepareArt() {
  if (preparingArt) return preparingArt;
  preparingArt = (async () => {
    const cache = await caches.open(ART);
    artStatus = {...artStatus, state:'preparing', done:0};
    await announceArt();
    let cursor = 0;
    const results = await Promise.allSettled(Array.from({length:Math.min(6, PICTURES.length)}, async () => {
      while (cursor < PICTURES.length) {
        const file = PICTURES[cursor++], url = absolute(file.url);
        let response = await cache.match(url, {ignoreVary:true});
        if (!await validVoice(response, file)) {
          response = await fetch(new Request(url, {cache:'reload'}));
          if (!await validVoice(response, file)) throw new Error('内置图片文件不完整');
          await cache.put(url, response);
        }
        artStatus.done++;
        if (artStatus.done % 8 === 0) await announceArt();
      }
    }));
    const failure = results.find(result => result.status === 'rejected');
    if (failure) throw failure.reason;
    artStatus = {...artStatus, state:'ready'};
    await announceArt();
  })().catch(async error => {
    artStatus = {...artStatus, state:'error'};
    await announceArt();
    throw error;
  }).finally(() => { preparingArt = null; });
  return preparingArt;
}

self.addEventListener('message', event => {
  const type = event.data?.type;
  if (!['xiaoya-prepare-audio', 'xiaoya-prepare-art'].includes(type)) return;
  if (event.data.build !== BUILD) {
    event.source?.postMessage({type:type === 'xiaoya-prepare-art' ? 'xiaoya-art-update' : 'xiaoya-audio-update', requestedBuild:event.data.build, build:BUILD});
    return;
  }
  event.waitUntil((type === 'xiaoya-prepare-art' ? prepareArt() : prepareVoices()).catch(() => {}));
});

self.addEventListener('install', event => event.waitUntil((async () => {
  const cache = await caches.open(CACHE);
  await cache.addAll(CORE.map(file => new Request(absolute(file), {cache:'reload'})));
  for (const [file, expected] of Object.entries(INTEGRITY)) {
    const response = await cache.match(absolute(file));
    if (!response || response.status !== 200) throw new Error('小芽英语资源未完整下载');
    const digest = await crypto.subtle.digest('SHA-256', await response.arrayBuffer());
    const actual = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
    if (actual !== expected) throw new Error('小芽英语资源版本不一致');
  }
  // The app must not activate with only its shell/voices cached. Every lesson
  // image and garden asset is required, including images never visited before.
  const packs = await Promise.allSettled([prepareVoices(), prepareArt()]);
  const failure = packs.find(result => result.status === 'rejected');
  if (failure) throw failure.reason;
  await self.skipWaiting();
})()));

self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
// Retain previous releases for tabs already using them. Never delete the older
// product's caches, downloaded speech assets, recordings, or learning records.

async function cachedAudio(request) {
  // Only original English clips can reuse the older product's downloads.
  // Versioned Chinese paths also bypass an older worker's ignoreSearch lookup.
  const original = new URL(request.url).pathname.slice(BASE.pathname.length).startsWith('audio/');
  for (const name of original ? [AUDIO, 'english-sprout-audio-v5'] : [AUDIO]) {
    try {
      const found = await (await caches.open(name)).match(request, {ignoreSearch:original, ignoreVary:true});
      if (found?.status === 200 && (!voiceByUrl.has(request.url) || await validVoice(found, voiceByUrl.get(request.url)))) return found;
    } catch {}
  }
  return null;
}

async function withAudioRange(response, request) {
  const range = request.headers.get('range');
  if (!range || response.status !== 200) return response;
  const match = /^bytes=(\d*)-(\d*)$/.exec(range);
  if (!match || (!match[1] && !match[2])) return response;
  const bytes = await response.arrayBuffer(), size = bytes.byteLength;
  const start = match[1] ? Number(match[1]) : Math.max(0, size - Number(match[2]));
  const end = match[1] && match[2] ? Math.min(Number(match[2]), size - 1) : size - 1;
  if (start > end || start >= size) return new Response(null, {status:416, headers:{'Content-Range':`bytes */${size}`}});
  return new Response(bytes.slice(start, end + 1), {status:206, headers:{'Content-Type':response.headers.get('Content-Type') || 'audio/mpeg', 'Accept-Ranges':'bytes', 'Content-Range':`bytes ${start}-${end}/${size}`, 'Content-Length':String(end - start + 1)}});
}

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url), request = event.request;
  if (request.method !== 'GET' || url.origin !== BASE.origin || !url.pathname.startsWith(BASE.pathname)) return;
  const relative = url.pathname.slice(BASE.pathname.length);
  if (relative.endsWith('/sw.js') || relative.endsWith('/version.json') || relative.startsWith('__')) return;
  const isAudio = /^(?:xiaoya\/)?audio\/.+\.mp3$/i.test(relative);
  const isArt = /^xiaoya\/(?:stories|paper)\//.test(relative);
  const isSpeech = /^speech\/(?:vosk-0\.0\.8\.js|model-en-us-0\.15\.tar\.gz)$/.test(relative) || relative.startsWith('xiaoya/speech/');
  if (isSpeech && request.cache === 'no-store') return;
  let write = Promise.resolve();
  const work = (async () => {
    let cache, found;
    try {
      cache = await caches.open(isArt ? ART : isAudio ? AUDIO : isSpeech ? SPEECH : CACHE);
      if (isArt) {
        // Query strings never select a different artwork version. Only this
        // release's manifest may resolve art; retired SVGs and prior core
        // caches must not silently restore another visual style.
        const artUrl = new URL(url); artUrl.search = ''; artUrl.hash = '';
        const file = artByUrl.get(artUrl.href);
        if (!file) return Response.error();
        found = await cache.match(artUrl.href, {ignoreVary:true});
        if (await validVoice(found, file)) return found;
        const response = await fetch(new Request(artUrl.href, {cache:'reload'}));
        if (!await validVoice(response, file)) return Response.error();
        write = cache.put(artUrl.href, response.clone()).catch(() => {});
        return response;
      }
      // New navigations prefer the published shell. Existing documents keep
      // their immutable modules and are never reloaded during a child activity.
      // Keep this worker's verified offline shell intact even if the network
      // serves a newer build while that build's audio pack is still installing.
      const entry = new URL(SCOPE);
      const startup = url.pathname.startsWith(entry.pathname) && /^start-[a-f0-9]{12}\.html$/.test(url.pathname.slice(entry.pathname.length));
      if (request.mode === 'navigate' && (startup || [entry.pathname, `${entry.pathname}index.html`].includes(url.pathname))) {
        try {
          // Restored tabs can keep an earlier start-<build> bookmark forever.
          // Resolve it through the current entry even on ordinary static hosts,
          // never through an old core cache containing the retired page.
          const target = startup ? new URL('./index.html' + url.search, SCOPE).href : request;
          const fresh = await fetch(new Request(target, {cache:'no-cache'}));
          if (fresh.status === 200 && /<meta\s+name="xiaoya-build"\s+content="[a-f0-9]{12}"/.test(await fresh.clone().text())) return fresh;
        } catch {}
        const shell = await cache.match(absolute('./index.html'));
        if (shell) return shell;
      }
      found = isAudio ? await cachedAudio(request) : await cache.match(request);
      if (!found && !isAudio && !isSpeech) {
        for (const name of await caches.keys()) {
          if (name.startsWith(PREFIX) && name !== CACHE) found = await (await caches.open(name)).match(request);
          if (found) break;
        }
      }
    } catch { if (isArt) return Response.error(); }
    if (found) return isAudio ? withAudioRange(found, request) : found;
    try {
      // Save the complete short clip even when the media element requests a range.
      const headers = new Headers(request.headers);
      if (isAudio) headers.delete('range');
      const response = await fetch(isAudio ? new Request(request, {headers, cache:'reload'}) : request);
      const voice = isAudio && voiceByUrl.get(url.href);
      if (voice && !await validVoice(response, voice)) return Response.error();
      if (cache && response.status === 200) write = cache.put(isAudio ? url.href : request, response.clone()).catch(() => {});
      return isAudio ? withAudioRange(response, request) : response;
    } catch {
      if (request.mode === 'navigate' && url.href.startsWith(SCOPE)) return (await cache?.match(absolute('./index.html'))) || Response.error();
      return Response.error();
    }
  })();
  event.respondWith(work);
  event.waitUntil(work.then(() => write).catch(() => {}));
});
