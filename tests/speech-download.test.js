import test,{beforeEach,afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {downloadSpeechAsset} from '../src/speech-download.js';

const URL_ASSET='https://example.test/speech/model.tar.gz';
const originalFetch=globalThis.fetch,originalCaches=globalThis.caches;
let entries,calls,putFailure;
test('a decoded compressed complete response remains usable offline despite encoded Content-Length',async()=>{
  entries.set(URL_ASSET,new Response('complete',{headers:{'Content-Encoding':'gzip','Content-Length':'3'}}));
  globalThis.fetch=async()=>{throw new Error('offline');};
  assert.equal(await (await downloadSpeechAsset(URL_ASSET)).text(),'complete');
});
beforeEach(()=>{
  entries=new Map();calls=[];putFailure=false;
  globalThis.caches={open:async name=>{
    assert.equal(name,'english-sprout-speech-v1');
    return {
      match:async key=>entries.get(key)?.clone(),
      put:async(key,value)=>{if(putFailure)throw new Error('QuotaExceededError');entries.set(key,value.clone());},
      delete:async key=>entries.delete(key),
    };
  }};
});
afterEach(()=>{globalThis.fetch=originalFetch;if(originalCaches===undefined)delete globalThis.caches;else globalThis.caches=originalCaches;});
function installRange(bytes,behavior){
  globalThis.fetch=async(url,options)=>{
    const [,first,last]=/^bytes=(\d+)-(\d+)$/.exec(options.headers.Range);
    const start=Number(first),end=Math.min(Number(last),bytes.length-1);
    calls.push(start);
    if(behavior){const value=await behavior({start,end,options});if(value)return value;}
    return new Response(bytes.slice(start,end+1),{status:206,headers:{'Content-Range':`bytes ${start}-${end}/${bytes.length}`,'Content-Type':'application/gzip'}});
  };
}
async function content(response){return [...new Uint8Array(await response.arrayBuffer())];}
const payload=new Uint8Array([31,139,8,0,5,6,7,8,9,10,11]);

test('verified Range chunks assemble exact gzip bytes and completed cache avoids all requests',async()=>{
  const progress=[];installRange(payload);
  const response=await downloadSpeechAsset(URL_ASSET,{chunkBytes:4,onProgress:value=>progress.push(value)});
  assert.deepEqual(await content(response),[...payload]);
  assert.deepEqual(calls.sort((a,b)=>a-b),[0,4,8]);
  assert.deepEqual(progress[progress.length-1],{loaded:11,total:11});
  assert.equal(entries.size,1);
  calls=[];
  assert.deepEqual(await content(await downloadSpeechAsset(URL_ASSET,{expectedBytes:11,chunkBytes:4})),[...payload]);
  assert.equal(calls.length,0);
});

test('interrupted download keeps completed chunks and retries resume only missing bytes',async()=>{
  installRange(payload,({start})=>{if(start===4)throw new Error('Connection lost');});
  await assert.rejects(downloadSpeechAsset(URL_ASSET,{expectedBytes:11,chunkBytes:4}),/Connection lost/);
  assert.equal(calls.filter(start=>start===4).length,4);
  assert.ok(entries.has(`${URL_ASSET}?sprout-part=0`));
  assert.ok(entries.has(`${URL_ASSET}?sprout-part=8`));
  assert.equal(entries.has(URL_ASSET),false);
  calls=[];installRange(payload);
  assert.deepEqual(await content(await downloadSpeechAsset(URL_ASSET,{expectedBytes:11,chunkBytes:4})),[...payload]);
  assert.deepEqual(calls,[4]);
});

test('server without Range support accepts only a verified complete response',async()=>{
  globalThis.fetch=async()=>{calls.push(0);return new Response(payload,{headers:{'Content-Length':'11','Content-Type':'application/gzip'}});};
  assert.deepEqual(await content(await downloadSpeechAsset(URL_ASSET,{chunkBytes:4})),[...payload]);
  assert.equal(calls.length,1);
  entries.clear();
  calls=[];
  assert.deepEqual(await content(await downloadSpeechAsset(URL_ASSET,{expectedBytes:11,chunkBytes:4})),[...payload]);
  assert.equal(calls.length,1,'known size must still probe Range support before parallel downloading');
  entries.clear();
  await assert.rejects(downloadSpeechAsset(URL_ASSET,{expectedBytes:12,chunkBytes:4}),/没有下载完整/);
  assert.equal(entries.has(URL_ASSET),false);
});

test('wrong Content-Range and short chunks never enter the cache',async()=>{
  globalThis.fetch=async()=>new Response(payload.slice(0,4),{status:206,headers:{'Content-Range':'bytes 1-4/11'}});
  await assert.rejects(downloadSpeechAsset(URL_ASSET,{chunkBytes:4}),/位置不一致/);
  assert.equal(entries.size,0);
  globalThis.fetch=async()=>new Response(payload.slice(0,3),{status:206,headers:{'Content-Range':'bytes 0-3/11'}});
  await assert.rejects(downloadSpeechAsset(URL_ASSET,{chunkBytes:4}),/没有下载完整/);
  assert.equal(entries.size,0);
});

test('changed total and transparently compressed ranges are rejected',async()=>{
  globalThis.fetch=async()=>new Response(payload.slice(0,4),{status:206,headers:{'Content-Range':'bytes 0-3/12'}});
  await assert.rejects(downloadSpeechAsset(URL_ASSET,{expectedBytes:11,chunkBytes:4}),/位置不一致/);
  assert.equal(entries.has(URL_ASSET),false);
  entries.clear();
  globalThis.fetch=async()=>new Response(payload.slice(0,4),{status:206,headers:{'Content-Range':'bytes 0-3/11','Content-Encoding':'gzip'}});
  await assert.rejects(downloadSpeechAsset(URL_ASSET,{chunkBytes:4}),/编码不一致/);
  assert.equal(entries.size,0);
});

test('cancellation does not erase verified chunks and next attempt resumes',async()=>{
  const controller=new AbortController();
  installRange(payload,async({start,options})=>{
    if(start===4){
      await new Promise((resolve,reject)=>{
        options.signal.addEventListener('abort',()=>reject(new DOMException('Aborted','AbortError')),{once:true});
        // Cancel after another parallel part is actually saved, rather than
        // assuming every machine can finish its cache write within 15 ms.
        const poll=setInterval(()=>{if(entries.has(`${URL_ASSET}?sprout-part=8`)){clearInterval(poll);clearTimeout(deadline);controller.abort();}},1);
        const deadline=setTimeout(()=>{clearInterval(poll);reject(new Error('Fixture part 8 was not saved'));},2000);
      });
    }
  });
  await assert.rejects(downloadSpeechAsset(URL_ASSET,{chunkBytes:4,signal:controller.signal}),{name:'AbortError'});
  assert.ok(entries.has(`${URL_ASSET}?sprout-part=0`));
  assert.equal(entries.has(URL_ASSET),false);
  calls=[];installRange(payload);
  assert.deepEqual(await content(await downloadSpeechAsset(URL_ASSET,{chunkBytes:4})),[...payload]);
  assert.deepEqual(calls,[4]);
});

test('quota rejection still returns exact bytes without claiming a persisted cache',async()=>{
  putFailure=true;installRange(payload);
  const response=await downloadSpeechAsset(URL_ASSET,{chunkBytes:4});
  assert.equal(response.headers.get('X-Sprout-Cache-Persisted'),'0');
  assert.deepEqual(await content(response),[...payload]);
  assert.equal(entries.size,0);
  calls=[];
  await downloadSpeechAsset(URL_ASSET,{chunkBytes:4});
  assert.equal(calls.length,3);
});

test('only 3 Range requests run concurrently and saved partial corruption is redownloaded',async()=>{
  const bytes=new Uint8Array(40).map((_,i)=>i);
  let active=0,maximum=0;
  installRange(bytes,async()=>{active++;maximum=Math.max(maximum,active);await new Promise(resolve=>setTimeout(resolve,3));active--;});
  entries.set(`${URL_ASSET}?sprout-part=0`,new Response('bad'));
  assert.deepEqual(await content(await downloadSpeechAsset(URL_ASSET,{expectedBytes:40,chunkBytes:4})),[...bytes]);
  assert.equal(maximum,3);
  assert.ok(calls.includes(0));
});

test('pre-cancelled download performs no network request',async()=>{
  const controller=new AbortController();controller.abort();installRange(payload);
  await assert.rejects(downloadSpeechAsset(URL_ASSET,{signal:controller.signal}),{name:'AbortError'});
  assert.equal(calls.length,0);
});
