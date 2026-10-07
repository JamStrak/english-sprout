import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const code=fs.readFileSync(new URL('../sw.template.js',import.meta.url),'utf8').replace('__BUILD_ID__','test').replace('__CORE_FILES__','[]');
function worker({cached=null,writeError=false,openError=false,networkError=false}={}){
  const events={};let writes=0;
  const context={self:{registration:{scope:'https://example.test/kids/'},addEventListener:(n,f)=>events[n]=f},location:{origin:'https://example.test'},URL,Response,caches:{open:async()=>{if(openError)throw Error('storage disabled');return {match:async()=>cached?.clone(),put:async()=>{writes++;if(writeError)throw Error('quota exceeded');}}; }},fetch:async()=>{if(networkError)throw Error('offline');return new Response('network data',{status:200});}};
  vm.runInNewContext(code,context);
  return {request:async(url,headers={})=>{let promise;events.fetch({request:new Request(url,{headers}),respondWith:p=>promise=p});return promise;},writes:()=>writes};
}
test('cache quota error never turns a successful online response into a network error',async()=>{
  const w=worker({writeError:true});const r=await w.request('https://example.test/kids/audio/hello.mp3');assert.equal(r.status,200);assert.equal(await r.text(),'network data');assert.equal(w.writes(),1);
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
