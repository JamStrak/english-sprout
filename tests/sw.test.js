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

function upgradeWorker({legacyV3=[],legacyV4=[],current=[],writeError=false,openError=false,failedOpenNames=[]}={}){
  const events={},stores=new Map([
    ['english-sprout-audio-v3',new Map(legacyV3)],
    ['english-sprout-audio-v4',new Map(legacyV4)],
    ['english-sprout-audio-v5',new Map(current)],
    ['english-sprout-core-old',new Map()]
  ]);
  let claims=0,networkRequests=0;
  const keyOf=request=>typeof request==='string'?request:request.url;
  const context={self:{registration:{scope:'https://example.test/kids/'},clients:{claim:async()=>{claims++;}},addEventListener:(name,fn)=>events[name]=fn},location:{origin:'https://example.test'},URL,Response,
    caches:{keys:async()=>[...stores.keys()],delete:async name=>stores.delete(name),open:async name=>{
      if((openError&&name==='english-sprout-audio-v5')||failedOpenNames.includes(name))throw Error('cache unavailable');
      if(!stores.has(name))stores.set(name,new Map());const entries=stores.get(name);
      return {
        keys:async()=>[...entries.keys()].map(url=>new Request(url)),
        match:async(request,options={})=>{
          const requested=new URL(keyOf(request));
          for(const [url,response] of entries){
            const stored=new URL(url);
            if(options.ignoreSearch){requested.search='';stored.search='';}
            if(stored.href===requested.href)return response.clone();
          }
        },
        put:async(request,response)=>{if(writeError&&name==='english-sprout-audio-v5')throw Error('quota exceeded');entries.set(keyOf(request),response.clone());}
      };
    }},fetch:async()=>{networkRequests++;throw Error('offline');}
  };
  vm.runInNewContext(code,context);
  return {
    activate:()=>{let finished;events.activate({waitUntil:p=>finished=p});return finished;},
    request:async(url,headers={})=>{let result,lifetime;events.fetch({request:new Request(url,{headers}),respondWith:p=>result=p,waitUntil:p=>lifetime=p});const response=await result;await lifetime;return response;},
    stores,claims:()=>claims,networkRequests:()=>networkRequests
  };
}

test('activation preserves all 251 original downloads from either legacy cache without replacing v5',async()=>{
  const base='https://example.test/kids/';
  const themes=['hello','needs','feelings','meals','care','dress','play','tidy','outside','family','explore','kindness'];
  const files=themes.flatMap(theme=>Array.from({length:10},(_,i)=>`${theme}-${String(i+1).padStart(2,'0')}.mp3`));
  const urls=[...files.map(file=>base+'audio/'+file),...files.map(file=>base+'audio/ryan/'+file),
    ...['listen','choose','speak','reveal','complete','review','record','welcome','try-again','well-done','checkup'].map(file=>base+'audio/ui/'+file+'.mp3')];
  const unrelated=[
    'https://example.test/another/audio/hello-01.mp3',
    'https://external.test/kids/audio/hello-01.mp3',
    base+'audio/hello-11.mp3',base+'audio/unknown-01.mp3',
    base+'audio/characters/bunny/hello-01.mp3',base+'audio/ui/unknown.mp3'
  ];
  for(const source of ['legacyV3','legacyV4']){
    const entries=[...urls.map(url=>[url,new Response('legacy '+url)]),...unrelated.map(url=>[url,new Response('unrelated')])];
    const w=upgradeWorker({[source]:entries,current:[[urls[0],new Response('already current')]]});
    await w.activate();
    assert.equal(w.claims(),1);assert.equal(w.networkRequests(),0);
    const copied=w.stores.get('english-sprout-audio-v5');assert.equal(copied.size,251);
    assert.equal(await copied.get(urls[0]).clone().text(),'already current');
    for(const url of urls.slice(1))assert.equal(await copied.get(url).clone().text(),'legacy '+url);
    for(const url of unrelated)assert.equal(copied.has(url),false,url);
    assert.equal(w.stores.get(source==='legacyV3'?'english-sprout-audio-v3':'english-sprout-audio-v4').size,257,'keep fallback cache intact');
    assert.equal(w.stores.has('english-sprout-core-old'),false,'normal core cleanup still runs');
  }
});

test('v4 takes precedence over v3 and all 16 original auditions migrate without replacing v5',async()=>{
  const base='https://example.test/kids/audio/';
  const urls=['pogo','milo','lulu','pip'].flatMap(voice=>['family-07','meals-10','tidy-07','dress-09'].map(lesson=>`${base}characters/${voice}/${lesson}.mp3`));
  const shared=base+'hello-01.mp3',v3only=base+'ryan/hello-01.mp3';
  const w=upgradeWorker({
    legacyV3:[[shared,new Response('v3 shared')],[v3only,new Response('v3 only')]],
    legacyV4:[[shared,new Response('v4 shared')],...urls.map(url=>[url,new Response('v4 '+url)])],
    current:[[urls[0],new Response('already v5')]]
  });
  await w.activate();const current=w.stores.get('english-sprout-audio-v5');
  assert.equal(current.size,18);assert.equal(await current.get(shared).clone().text(),'v4 shared');
  assert.equal(await current.get(v3only).clone().text(),'v3 only');
  assert.equal(await current.get(urls[0]).clone().text(),'already v5');
  for(const url of urls.slice(1))assert.equal(await current.get(url).clone().text(),'v4 '+url);
  assert.equal(w.stores.get('english-sprout-audio-v4').size,17);assert.equal(w.stores.get('english-sprout-audio-v3').size,2);
});

test('failed migration still activates and plays v4 then v3 clips offline with byte ranges',async()=>{
  const url='https://example.test/kids/audio/ryan/hello-01.mp3';
  const sample='https://example.test/kids/audio/characters/pip/family-07.mp3';
  const v3only='https://example.test/kids/audio/ui/listen.mp3';
  for(const failure of [{writeError:true},{openError:true}]){
    const w=upgradeWorker({...failure,
      legacyV4:[[url,new Response('abcdefghij')],[sample,new Response('v4 sample')]],
      legacyV3:[[url,new Response('older value')],[v3only,new Response('v3 only')]]
    });
    await w.activate();assert.equal(w.claims(),1);assert.equal(w.stores.get('english-sprout-audio-v5').size,0);
    assert.equal(await (await w.request(url)).text(),'abcdefghij');
    assert.equal(await (await w.request(sample)).text(),'v4 sample');
    assert.equal(await (await w.request(v3only)).text(),'v3 only');
    const range=await w.request(url+'?old-download=1',{Range:'bytes=2-5'});
    assert.equal(range.status,206);assert.equal(range.headers.get('Content-Range'),'bytes 2-5/10');assert.equal(await range.text(),'cdef');
    assert.equal(w.networkRequests(),0);assert.ok(w.stores.get('english-sprout-audio-v3').has(url));
  }
});

test('an unavailable v4 cache does not block migration or offline fallback from v3',async()=>{
  const url='https://example.test/kids/audio/hello-01.mp3';
  for(const writeError of [true,false]){
    const w=upgradeWorker({writeError,failedOpenNames:['english-sprout-audio-v4'],legacyV3:[[url,new Response('v3 available')]]});
    await w.activate();assert.equal(w.claims(),1);
    assert.equal(await (await w.request(url)).text(),'v3 available');assert.equal(w.networkRequests(),0);
    assert.equal(w.stores.get('english-sprout-audio-v5').size,writeError?0:1);
  }
});

test('legacy fallback excludes new Pip paths, v3 auditions and incomplete cached responses',async()=>{
  const audition='https://example.test/kids/audio/characters/bunny/hello-01.mp3';
  const v3sample='https://example.test/kids/audio/characters/pip/family-07.mp3';
  const newPip='https://example.test/kids/audio/characters/pip/hello-01.mp3';
  const incomplete='https://example.test/kids/audio/hello-02.mp3';
  const w=upgradeWorker({
    legacyV3:[[v3sample,new Response('unknown v3 audition')]],
    legacyV4:[[audition,new Response('unknown audition')],[newPip,new Response('unknown new course')],[incomplete,new Response('fragment',{status:206})]]
  });
  await w.activate();assert.equal(w.stores.get('english-sprout-audio-v5').size,0);
  for(const url of [audition,v3sample,newPip,incomplete])assert.equal((await w.request(url)).status,0,url);
  assert.equal(w.networkRequests(),4,'non-reusable old bytes are never served as current audio');
});

test('audio JSON manifests are read offline from the core cache without MP3 range handling',async()=>{
  const url='https://example.test/kids/audio/pip-manifest.json';
  const manifest={version:1,voiceId:'pip',clips:[{lessonId:'hello-01'}]};
  const w=upgradeWorker({current:[[url,new Response('stale audio-cache entry')]]});
  w.stores.set('english-sprout-core-test',new Map([[url,new Response(JSON.stringify(manifest),{headers:{'Content-Type':'application/json'}})]]));
  for(const headers of [{},{Range:'bytes=0-3'}]){
    const response=await w.request(url+'?build=current',headers);
    assert.equal(response.status,200,'JSON must not become a partial audio response');
    assert.equal(response.headers.get('Content-Type'),'application/json');
    assert.equal(response.headers.get('Content-Range'),null);
    assert.deepEqual(await response.json(),manifest);
  }
  assert.equal(w.networkRequests(),0,'the already cached core JSON works fully offline');
});
