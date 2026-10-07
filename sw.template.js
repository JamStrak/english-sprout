const PREFIX='english-sprout-core-';
const CACHE=PREFIX+'__BUILD_ID__';
const AUDIO='english-sprout-audio-v1';
const CORE=__CORE_FILES__;
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(CORE))));
self.addEventListener('message',event=>{if(event.data==='ACTIVATE_UPDATE')self.skipWaiting();});
self.addEventListener('activate',event=>event.waitUntil((async()=>{
  for(const key of await caches.keys())if(key.startsWith(PREFIX)&&key!==CACHE)await caches.delete(key);
  await self.clients.claim();
})()));
self.addEventListener('fetch',event=>{
  const u=new URL(event.request.url);
  if(event.request.method!=='GET'||u.origin!==location.origin||!u.href.startsWith(self.registration.scope))return;
  if(u.pathname.endsWith('/__english_sprout_health'))return;
  const isAudio=u.pathname.includes('/audio/');
  event.respondWith((async()=>{
    let cache,found;
    // The CDN varies by Accept-Encoding. Media range requests may use identity
    // while prefetch uses gzip/br; the cached body is the same decoded MP3.
    try{cache=await caches.open(isAudio?AUDIO:CACHE);found=await cache.match(event.request,{ignoreSearch:true,ignoreVary:isAudio});}catch{}
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
      if(cache&&response.ok&&response.status===200){try{await cache.put(event.request,response.clone());}catch{}}
      return response;
    }catch(error){
      if(cache&&event.request.mode==='navigate')return (await cache.match('./index.html'))||Response.error();
      return Response.error();
    }
  })());
});
