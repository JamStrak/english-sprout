import test,{beforeEach,afterEach} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {downloadSpeechAsset} from '../src/speech-download.js';

const ASSET='https://example.test/speech/recovery.tar.gz';
const originalFetch=globalThis.fetch,originalCaches=globalThis.caches;
const payload=new Uint8Array([31,139,8,0,5,6,7,8,9,10,11]);
const pending=()=>new Promise(()=>{});
const options={expectedBytes:11,chunkBytes:4,requestTimeoutMs:40,cacheTimeoutMs:20,retryDelayMs:0};
let entries,calls,writes,cache;
beforeEach(()=>{
  entries=new Map();calls=[];writes=[];
  cache={
    match:async key=>entries.get(key)?.clone(),
    put:async(key,response)=>{writes.push({key,size:(await response.clone().blob()).size});entries.set(key,response.clone());},
    delete:async key=>entries.delete(key),
  };
  globalThis.caches={open:async()=>cache};
  installRange();
});
afterEach(()=>{globalThis.fetch=originalFetch;if(originalCaches===undefined)delete globalThis.caches;else globalThis.caches=originalCaches;});
function response(start,end){return new Response(payload.slice(start,end+1),{status:206,headers:{'Content-Range':`bytes ${start}-${end}/${payload.length}`,'Content-Type':'application/gzip'}});}
function installRange(behavior){
  globalThis.fetch=async(url,request)=>{
    assert.equal(url,ASSET);
    const [,first,last]=/^bytes=(\d+)-(\d+)$/.exec(request.headers.Range);
    const start=Number(first),end=Math.min(Number(last),payload.length-1);
    calls.push(start);
    return (await behavior?.({start,end,request}))||response(start,end);
  };
}
async function assertPayload(work){const result=await work;assert.deepEqual([...new Uint8Array(await result.arrayBuffer())],[...payload]);return result;}

test('a stalled cache open falls back to a usable network archive',{timeout:1500},async()=>{
  globalThis.caches={open:pending};
  const result=await assertPayload(downloadSpeechAsset(ASSET,options));
  assert.equal(result.headers.get('X-Sprout-Cache-Persisted'),'0');
  assert.deepEqual(calls.sort((a,b)=>a-b),[0,4,8]);
});

test('a stalled cache lookup cannot freeze preparing the model',{timeout:1500},async()=>{
  cache.match=pending;
  const result=await assertPayload(downloadSpeechAsset(ASSET,options));
  assert.equal(result.headers.get('X-Sprout-Cache-Persisted'),'0');
});

test('verified download progress is reported before a stalled cache write',{timeout:1500},async()=>{
  const progress=[];let firstPartLoaded;
  const nativePut=cache.put;
  cache.put=(key,value)=>{
    if(!key.includes('sprout-part='))return nativePut(key,value);
    if(firstPartLoaded===undefined)firstPartLoaded=progress.at(-1)?.loaded;
    return pending();
  };
  const result=await assertPayload(downloadSpeechAsset(ASSET,{...options,onProgress:value=>progress.push(value)}));
  assert.equal(result.headers.get('X-Sprout-Cache-Persisted'),'0');
  assert.equal(progress.at(-1).loaded,11);
  assert.equal(firstPartLoaded,4,'report the verified first part before waiting for its cache write');
});

test('a cached archive with a stalled body reader falls back without clearing other data',{timeout:1500},async()=>{
  const unrelated='https://example.test/speech/other.tar.gz';
  entries.set(unrelated,new Response('keep'));
  cache.match=async key=>key===ASSET?{headers:new Headers({'Content-Length':'11'}),blob:pending}:entries.get(key)?.clone();
  await assertPayload(downloadSpeechAsset(ASSET,options));
  assert.equal(await entries.get(unrelated).text(),'keep');
});

test('stalled metadata JSON cannot block network recovery',{timeout:1500},async()=>{
  cache.match=async key=>key.endsWith('?sprout-meta=1')?{json:pending}:undefined;
  const result=await assertPayload(downloadSpeechAsset(ASSET,options));
  assert.equal(result.headers.get('X-Sprout-Cache-Persisted'),'0');
});

test('a cached partial with a stalled body reader falls back to verified network bytes',{timeout:1500},async()=>{
  cache.match=async key=>key.endsWith('?sprout-part=0')?{blob:pending,headers:new Headers()}:undefined;
  await assertPayload(downloadSpeechAsset(ASSET,options));
  assert.ok(calls.includes(0));
});

test('compressed library full GET avoids encoded Range offsets and remains usable offline',{timeout:1500},async()=>{
  let requests=0;
  globalThis.fetch=async(url,request)=>{
    requests++;assert.equal(url,ASSET);assert.equal(request.headers?.Range,undefined);
    return new Response(payload,{headers:{'Content-Encoding':'gzip','Content-Length':'3'}});
  };
  const fullOptions={...options,useRanges:false};
  await assertPayload(downloadSpeechAsset(ASSET,fullOptions));
  assert.equal(requests,1);
  globalThis.fetch=async()=>{throw new Error('offline');};
  const offline=await assertPayload(downloadSpeechAsset(ASSET,fullOptions));
  assert.equal(offline.headers.get('X-Sprout-Cache-Persisted'),'1');
});

test('full GET mode rejects an unexpected partial response instead of caching an incomplete library',{timeout:1500},async()=>{
  globalThis.fetch=async()=>new Response(payload.slice(0,1),{status:206,headers:{'Content-Range':'bytes 0-0/11'}});
  await assert.rejects(downloadSpeechAsset(ASSET,{...options,useRanges:false}));
  assert.equal(entries.has(ASSET),false);
});

test('fetch ignoring AbortSignal is retried after inactivity and reports retry state',{timeout:1500},async()=>{
  const states=[];let attempts=0;
  installRange(({start})=>start===0&&attempts++===0?pending():undefined);
  await assertPayload(downloadSpeechAsset(ASSET,{...options,onState:state=>states.push(state)}));
  assert.equal(calls.filter(start=>start===0).length,2);
  assert.ok(states.some(state=>state.phase==='retrying'));
});

test('Response.blob ignoring AbortSignal is retried after inactivity',{timeout:1500},async()=>{
  let attempts=0;
  installRange(({start,end})=>start===0&&attempts++===0?{status:206,headers:response(start,end).headers,blob:pending}:undefined);
  await assertPayload(downloadSpeechAsset(ASSET,options));
  assert.equal(calls.filter(start=>start===0).length,2);
});

test('a real response stream that stops midway is cancelled and retried without saving short bytes',{timeout:1500},async()=>{
  let attempts=0,cancellations=0;
  installRange(({start,end})=>{
    if(start!==0||attempts++!==0)return;
    return new Response(new ReadableStream({
      start(controller){controller.enqueue(payload.slice(0,2));},
      cancel(){cancellations++;},
    }),{status:206,headers:response(start,end).headers});
  });
  await assertPayload(downloadSpeechAsset(ASSET,options));
  assert.equal(calls.filter(start=>start===0).length,2);
  assert.equal(cancellations,1,'release the stalled response reader before its retry');
  assert.ok(writes.filter(item=>item.key.endsWith('?sprout-part=0')).every(item=>item.size===4));
});

test('steady streamed bytes reset inactivity timeout and show progress before chunk completion',{timeout:1500},async()=>{
  const progress=[];let attempts=0;
  // One 11-byte part takes over 80 ms, twice the 40 ms inactivity timeout.
  globalThis.fetch=async()=>{
    attempts++;let offset=0,timer;
    const body=new ReadableStream({
      start(controller){timer=setInterval(()=>{controller.enqueue(payload.slice(offset,++offset));if(offset===payload.length){clearInterval(timer);controller.close();}},8);},
      cancel(){clearInterval(timer);},
    });
    return new Response(body,{status:206,headers:{'Content-Range':'bytes 0-10/11'}});
  };
  await assertPayload(downloadSpeechAsset(ASSET,{...options,chunkBytes:11,onProgress:value=>progress.push(value)}));
  assert.equal(attempts,1,'continued byte arrivals must keep the first request alive');
  assert.ok(progress.some(value=>value.loaded>0&&value.loaded<11),'show body bytes before the whole part completes');
  assert.ok(progress.every(value=>value.loaded>=0&&value.loaded<=value.total));
});

test('an interrupted response stream is never persisted as a verified partial chunk',{timeout:1500},async()=>{
  let attempts=0;
  installRange(({start,end})=>{
    if(start!==4||attempts++!==0)return;
    return new Response(new ReadableStream({start(controller){controller.enqueue(payload.slice(4,6));controller.error(new Error('body disconnected'));}}),{status:206,headers:response(start,end).headers});
  });
  await assertPayload(downloadSpeechAsset(ASSET,options));
  assert.equal(calls.filter(start=>start===4).length,2);
  assert.ok(writes.filter(item=>item.key.endsWith('?sprout-part=4')).every(item=>item.size===4));
});

test('cancelling a cache wait rejects promptly and does not start fetching',{timeout:1500},async()=>{
  globalThis.caches={open:pending};
  const controller=new AbortController();
  const work=downloadSpeechAsset(ASSET,{...options,cacheTimeoutMs:1000,signal:controller.signal});
  controller.abort();
  await assert.rejects(work,{name:'AbortError'});
  assert.equal(calls.length,0);
});

test('cancelling a stalled body read stops retries and keeps verified cached parts',{timeout:1500},async()=>{
  entries.set(`${ASSET}?sprout-part=0`,new Response(payload.slice(0,4)));
  const controller=new AbortController();
  installRange(({start,end})=>{
    if(start===4){setTimeout(()=>controller.abort(),5);return {status:206,headers:response(start,end).headers,blob:pending};}
  });
  await assert.rejects(downloadSpeechAsset(ASSET,{...options,signal:controller.signal}),{name:'AbortError'});
  assert.equal(calls.filter(start=>start===4).length,1);
  assert.ok(entries.has(`${ASSET}?sprout-part=0`));
  assert.equal(entries.has(ASSET),false);
});

test('cleanup cache deletion stalls cannot hold an already persisted archive',{timeout:1500},async()=>{
  cache.delete=pending;
  const result=await assertPayload(downloadSpeechAsset(ASSET,options));
  assert.equal(result.headers.get('X-Sprout-Cache-Persisted'),'1');
  assert.ok(entries.has(ASSET));
});

test('a downloader request reaches the network through SW even when its CacheStorage would hang',{timeout:1500},async()=>{
  const handlers={};let storageReads=0,intercepted;
  const context={
    self:{registration:{scope:'https://example.test/kids/'},addEventListener:(name,handler)=>handlers[name]=handler},
    location:{origin:'https://example.test'},URL,Response,
    caches:{open:()=>{storageReads++;return pending();}},
  };
  const workerCode=fs.readFileSync(new URL('../sw.template.js',import.meta.url),'utf8').replace('__BUILD_ID__','test').replace('__CORE_FILES__','[]');
  vm.runInNewContext(workerCode,context);
  const request=new Request('https://example.test/kids/speech/model-en-us-0.15.tar.gz',{cache:'no-store',headers:{Range:'bytes=0-3'}});
  handlers.fetch({request,respondWith:work=>intercepted=work,waitUntil:()=>{}});
  // A fetch handler that leaves the event unhandled lets the browser perform
  // its ordinary network fetch, avoiding a second await of the stalled cache.
  const result=await(intercepted||Promise.resolve(response(0,3)));
  assert.equal(result.status,206);
  assert.equal(result.headers.get('Content-Range'),'bytes 0-3/11');
  assert.equal(storageReads,0);
});
