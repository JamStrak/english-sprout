const PREFIX = 'xiaoya-core-';
const CACHE = PREFIX + '__XIAOYA_BUILD__';
const AUDIO = 'xiaoya-audio-v2';
const SPEECH = 'english-sprout-speech-v1';
const CORE = __XIAOYA_CORE__;
const INTEGRITY = /*__XIAOYA_INTEGRITY__*/{};
const SCOPE = self.registration.scope;
const BASE = new URL('../', SCOPE);
const absolute = file => new URL(file, SCOPE).href;

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
      if (found?.status === 200) return found;
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
  const isSpeech = /^speech\/(?:vosk-0\.0\.8\.js|model-en-us-0\.15\.tar\.gz)$/.test(relative);
  if (isSpeech && request.cache === 'no-store') return;
  let write = Promise.resolve();
  const work = (async () => {
    let cache, found;
    try {
      cache = await caches.open(isAudio ? AUDIO : isSpeech ? SPEECH : CACHE);
      found = isAudio ? await cachedAudio(request) : await cache.match(request);
      if (!found && !isAudio && !isSpeech) {
        for (const name of await caches.keys()) {
          if (name.startsWith(PREFIX) && name !== CACHE) found = await (await caches.open(name)).match(request);
          if (found) break;
        }
      }
    } catch {}
    if (found) return isAudio ? withAudioRange(found, request) : found;
    try {
      // Save the complete short clip even when the media element requests a range.
      const headers = new Headers(request.headers);
      if (isAudio) headers.delete('range');
      const response = await fetch(isAudio ? new Request(request, {headers}) : request);
      if (cache && response.status === 200) write = cache.put(request, response.clone()).catch(() => {});
      return isAudio ? withAudioRange(response, request) : response;
    } catch {
      if (request.mode === 'navigate' && url.href.startsWith(SCOPE)) return (await cache?.match(absolute('./index.html'))) || Response.error();
      return Response.error();
    }
  })();
  event.respondWith(work);
  event.waitUntil(work.then(() => write).catch(() => {}));
});
