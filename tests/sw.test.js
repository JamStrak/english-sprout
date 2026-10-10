import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const code=fs.readFileSync(new URL('../sw.template.js',import.meta.url),'utf8').replace('__BUILD_ID__','test').replace('__CORE_FILES__','[]');
function worker({cached=null,writeError=false,writeGate=null,openError=false,networkError=false,networkResponse=null}={}){
  const events={},lifetimes=[];let writes=0,storedBody;
  const context={self:{registration:{scope:'https://example.test/kids/'},addEventListener:(n,f)=>events[n]=f},location:{origin:'https://example.test'},URL,Response,caches:{open:async()=>{if(openError)throw Error('storage disabled');return {match:async()=>cached?.clone(),put:async(_request,response)=>{writes++;if(writeGate)await writeGate;if(writeError)throw Error('quota exceeded');storedBody=await response.text();}}; }},fetch:async()=>{if(networkError)throw Error('offline');return networkResponse||new Response('network data',{status:200});}};
  vm.runInNewContext(code,context);
  return {request:async(url,headers={})=>{let promise,dispatching=true;events.fetch({request:new Request(url,{headers}),respondWith:p=>promise=p,waitUntil:p=>{assert.equal(dispatching,true,'worker lifetime must be extended during fetch dispatch');lifetimes.push(p);}});dispatching=false;return promise;},writes:()=>writes,storedBody:()=>storedBody,finished:()=>Promise.all(lifetimes)};
}
test('cache quota error never turns a successful online response into a network error',async()=>{
  const w=worker({writeError:true});const r=await w.request('https://example.test/kids/audio/hello.mp3');assert.equal(r.status,200);assert.equal(await r.text(),'network data');assert.equal(w.writes(),1);await w.finished();
});
test('slow cache persistence does not delay playback, while waitUntil keeps the write alive',async t=>{
  let releaseWrite;
  const writeGate=new Promise(resolve=>releaseWrite=resolve);
  t.after(()=>releaseWrite());
  const w=worker({writeGate});let responseReady=false,lifetimeFinished=false;
  const pendingResponse=w.request('https://example.test/kids/audio/hello.mp3').then(response=>{responseReady=true;return response;});
  const lifetime=w.finished().then(()=>lifetimeFinished=true);
  await new Promise(setImmediate);
  assert.equal(responseReady,true,'playback response must not wait for cache.put');
  const response=await pendingResponse;
  assert.equal(await response.text(),'network data');
  assert.equal(w.writes(),1);
  assert.equal(lifetimeFinished,false,'worker must remain alive for the pending cache write');
  releaseWrite();await lifetime;
  assert.equal(w.storedBody(),'network data','the independent response clone remains readable');
});
test('streaming audio reaches the player before the whole audio file has downloaded',async t=>{
  let stream;
  const encoder=new TextEncoder();
  const body=new ReadableStream({start(controller){stream=controller;controller.enqueue(encoder.encode('first bytes'));}});
  t.after(()=>{try{stream.close();}catch{}});
  const w=worker({networkResponse:new Response(body)});let responseReady=false,lifetimeFinished=false;
  const pendingResponse=w.request('https://example.test/kids/audio/hello.mp3').then(response=>{responseReady=true;return response;});
  const lifetime=w.finished().then(()=>lifetimeFinished=true);
  await new Promise(setImmediate);
  assert.equal(responseReady,true,'waiting for the full cached body would prevent streaming playback');
  const reader=(await pendingResponse).body.getReader();
  assert.equal(new TextDecoder().decode((await reader.read()).value),'first bytes');
  assert.equal(lifetimeFinished,false);
  stream.enqueue(encoder.encode(' last bytes'));stream.close();
  assert.equal(new TextDecoder().decode((await reader.read()).value),' last bytes');
  await lifetime;
  assert.equal(w.storedBody(),'first bytes last bytes');
});
test('disabled CacheStorage still allows online content',async()=>{
  const r=await worker({openError:true}).request('https://example.test/kids/src/app.js');assert.equal(r.status,200);
});
test('offline audio supports normal, open-ended and suffix byte ranges',async()=>{
  for(const [range,body,contentRange] of [['bytes=2-5','cdef','bytes 2-5/10'],['bytes=7-','hij','bytes 7-9/10'],['bytes=-3','hij','bytes 7-9/10']]){
    const r=await worker({cached:new Response('abcdefghij'),networkError:true}).request('https://example.test/kids/audio/test.mp3',{Range:range});
    assert.equal(r.status,206);assert.equal(await r.text(),body);assert.equal(r.headers.get('Content-Range'),contentRange);
  }
});
test('unsatisfiable audio range is rejected with size, cached audio is reusable',async()=>{
  const w=worker({cached:new Response('abc'),networkError:true});const r=await w.request('https://example.test/kids/audio/test.mp3',{Range:'bytes=9-'});assert.equal(r.status,416);assert.equal(r.headers.get('Content-Range'),'bytes */3');assert.equal(await (await w.request('https://example.test/kids/audio/test.mp3')).text(),'abc');
});
test('worker never intercepts another project or third-party requests',async()=>{
  const w=worker();assert.equal(await w.request('https://example.test/another/'),undefined);assert.equal(await w.request('https://external.test/kids/'),undefined);
});
