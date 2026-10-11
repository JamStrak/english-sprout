const PREFIX='english-sprout-core-';
const CACHE=PREFIX+'__BUILD_ID__';
const AUDIO='english-sprout-audio-v5';
// Original course clips and the 16 auditions are unchanged. Prefer the newest
// known cache, while retaining older downloads if copying is unavailable.
const LEGACY_AUDIO=['english-sprout-audio-v4','english-sprout-audio-v3'];
const CORE=__CORE_FILES__;
function isLegacyAudio(request,cacheName){
  const url=new URL(request.url),scope=new URL(self.registration.scope);
  if(request.method!=='GET'||url.origin!==scope.origin||!url.pathname.startsWith(scope.pathname))return false;
  const path=url.pathname.slice(scope.pathname.length);
  return /^audio\/(?:ryan\/)?(?:hello|needs|feelings|meals|care|dress|play|tidy|outside|family|explore|kindness)-(?:0[1-9]|10)\.mp3$/.test(path)
    ||/^audio\/ui\/(?:listen|choose|speak|reveal|complete|review|record|welcome|try-again|well-done|checkup)\.mp3$/.test(path)
    ||(cacheName===LEGACY_AUDIO[0]&&/^audio\/characters\/(?:pogo|milo|lulu|pip)\/(?:family-07|meals-10|tidy-07|dress-09)\.mp3$/.test(path));
}
async function findLegacyAudio(request){
  if(!LEGACY_AUDIO.some(name=>isLegacyAudio(request,name)))return null;
  try{
    const names=await caches.keys();
    for(const name of LEGACY_AUDIO){
      if(!names.includes(name)||!isLegacyAudio(request,name))continue;
      try{
        const response=await (await caches.open(name)).match(request,{ignoreSearch:true,ignoreVary:true});
        if(response?.status===200)return response;
      }catch{}
    }
  }catch{}
  return null;
}
async function migrateLegacyAudio(){
  try{
    const names=await caches.keys(),current=await caches.open(AUDIO),seen=new Set();
    for(const name of LEGACY_AUDIO){
      if(!names.includes(name))continue;
      try{
        const legacy=await caches.open(name);
        for(const request of await legacy.keys()){
          if(!isLegacyAudio(request,name))continue;
          const url=new URL(request.url),key=url.origin+url.pathname;
          if(seen.has(key))continue;
          try{
            if(await current.match(request,{ignoreSearch:true,ignoreVary:true}))continue;
            const response=await legacy.match(request,{ignoreSearch:true,ignoreVary:true});
            if(response?.status!==200)continue;
            seen.add(key); // A failed v4 copy must not substitute an older v3 entry.
            await current.put(request,response);
          }catch{} // Quota or individual entry failures must not block activation.
        }
      }catch{}
    }
  }catch{}
  // Retain both old caches as offline fallbacks if copying was unavailable.
}
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(CORE))));
self.addEventListener('message',event=>{if(event.data==='ACTIVATE_UPDATE')self.skipWaiting();});
self.addEventListener('activate',event=>event.waitUntil((async()=>{
  for(const key of await caches.keys())if(key.startsWith(PREFIX)&&key!==CACHE)await caches.delete(key);
  await migrateLegacyAudio();
  await self.clients.claim();
})()));
self.addEventListener('fetch',event=>{
  const u=new URL(event.request.url);
  if(event.request.method!=='GET'||u.origin!==location.origin||!u.href.startsWith(self.registration.scope))return;
  if(u.pathname.endsWith('/__english_sprout_health'))return;
  // JSON manifests live beside MP3s but belong to the versioned core cache.
  const isAudio=/\/audio\/.+\.mp3$/i.test(u.pathname);
  let cacheWrite=Promise.resolve();
  const responsePromise=(async()=>{
    let cache,found;
    // The CDN varies by Accept-Encoding. Media range requests may use identity
    // while prefetch uses gzip/br; the cached body is the same decoded MP3.
    try{cache=await caches.open(isAudio?AUDIO:CACHE);found=await cache.match(event.request,{ignoreSearch:true,ignoreVary:isAudio});}catch{}
    if(!found&&isAudio)found=await findLegacyAudio(event.request);
    if(found){
      // iOS media can request a byte range even for fully cached short MP3s.
      const range=isAudio&&event.request.headers.get('range');
      if(range){
        const match=/^bytes=(\d*)-(\d*)$/.exec(range);
        if(match){
          const bytes=await found.arrayBuffer(),size=bytes.byteLength;
          const start=match[1]?Number(match[1]):Math.max(0,size-Number(match[2]));
          const end=match[1]&&match[2]?Math.min(Number(match[2]),size-1):size-1;
          if(start>end||start>=size)return new Response(null,{status:416,headers:{'Content-Range':`bytes */${size}`}});
          return new Response(bytes.slice(start,end+1),{status:206,headers:{'Content-Type':'audio/mpeg','Accept-Ranges':'bytes','Content-Range':`bytes ${start}-${end}/${size}`,'Content-Length':String(end-start+1)}});
        }
      }
      return found;
    }
    try{
      const response=await fetch(event.request);
      if(cache&&response.ok&&response.status===200){
        // Let the media element start consuming the response immediately. Saving
        // the cloned body may wait for the full download and slow device storage.
        try{cacheWrite=cache.put(event.request,response.clone()).catch(()=>{});}catch{}
      }
      return response;
    }catch(error){
      if(cache&&event.request.mode==='navigate')return (await cache.match('./index.html'))||Response.error();
      return Response.error();
    }
  })();
  event.respondWith(responsePromise);
  // Register the lifetime extension during dispatch, then retain the worker
  // until any background write finishes, without delaying the response.
  event.waitUntil(responsePromise.then(()=>cacheWrite).catch(()=>{}));
});
