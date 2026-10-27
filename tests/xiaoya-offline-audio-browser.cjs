// Run against the built app on a loopback server. Each run owns a disposable
// browser context; it never reads a user profile, records speech, or uploads data.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'C:/Users/Jam/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const origin=new URL(process.env.TEST_URL||'http://127.0.0.1:24756').origin;
if(!['127.0.0.1','localhost','[::1]'].includes(new URL(origin).hostname))throw Error('Use an isolated loopback server.');
const dist=path.resolve(__dirname,'../dist');
const expected=JSON.parse(fs.readFileSync(path.join(dist,'xiaoya/version.json'),'utf8'));
const manifest=JSON.parse(fs.readFileSync(path.join(dist,'xiaoya/releases',expected.build,'audio-pack.json'),'utf8'));
const out=path.resolve(process.env.XIAOYA_OFFLINE_AUDIO_TEST_OUT||path.join(__dirname,'../test-results/xiaoya-offline-audio'));
const appBase=origin+'/xiaoya/';
const cacheName='xiaoya-audio-v3';
const report={origin,version:expected.version,build:expected.build,scope:'Disposable Edge context, real native audio at 4x, complete shipped MP3 decoding, Cache Storage integrity and offline Range responses. No user profile, recording, recognition model, child data, or uploads. Offline is browser-emulated and is not a physical-device test.',checks:[]};
let browser,context,page;
const requests=[],responses=[],failed=[],errors=[];
const save=()=>fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(report,null,2));
async function check(name,fn){
  const started=Date.now();
  try{const evidence=await fn();report.checks.push({name,status:'PASS',elapsedMs:Date.now()-started,evidence});console.log('PASS '+name);}
  catch(error){report.checks.push({name,status:'FAIL',elapsedMs:Date.now()-started,error:error.stack||String(error)});console.error('FAIL '+name+'\n'+(error.stack||error));process.exitCode=1;}
  save();
}
const isMP3=url=>{try{return new URL(url).pathname.endsWith('.mp3');}catch{return false;}};

async function setup(){
  browser=await chromium.launch({channel:'msedge',headless:true,args:['--no-proxy-server','--autoplay-policy=no-user-gesture-required']});
  context=await browser.newContext({viewport:{width:390,height:844},timezoneId:'Asia/Shanghai',serviceWorkers:'allow'});
  context.on('request',r=>requests.push({url:r.url(),method:r.method(),time:Date.now()}));
  context.on('response',r=>responses.push({url:r.url(),status:r.status(),worker:r.fromServiceWorker(),time:Date.now()}));
  context.on('requestfailed',r=>failed.push({url:r.url(),error:r.failure()?.errorText,time:Date.now()}));
  // Routing does not replace any shipped response or fake media playback.
  await context.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort('blockedbyclient'));
  await context.addInitScript(origin=>{
    if(location.origin!==origin)return;
    localStorage.setItem('xiaoya-english:preferences:v1',JSON.stringify({welcome:true,mic:false,guideStep:'done'}));
    const qa=window.qaOfflineAudio={created:[],played:[],fetches:[]};
    const NativeAudio=window.Audio;
    window.Audio=function(...args){
      const audio=new NativeAudio(...args),item={url:String(args[0]||''),playing:0,ended:0,error:0};
      audio.playbackRate=4;qa.created.push(item);
      audio.addEventListener('playing',()=>{item.playing++;qa.played.push(audio.currentSrc||audio.src||item.url);});
      audio.addEventListener('ended',()=>item.ended++);
      audio.addEventListener('error',()=>item.error++);
      return audio;
    };
    window.Audio.prototype=NativeAudio.prototype;
    const nativeFetch=window.fetch;
    window.fetch=function(input,...rest){
      const value=typeof input==='string'?input:input instanceof URL?input.href:input?.url;
      if(value&&new URL(value,document.baseURI).pathname.endsWith('.mp3'))qa.fetches.push(new URL(value,document.baseURI).href);
      return nativeFetch.call(this,input,...rest);
    };
  },origin);
  page=await context.newPage();page.setDefaultTimeout(15000);
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto(appBase+'?garden=b');
  await page.locator('.home-view').waitFor();
}

async function nativePlayback(url){
  return page.evaluate(url=>new Promise((resolve,reject)=>{
    const audio=new Audio(url),result={url,playing:false,ended:false,advanced:false,duration:0,maxTime:0};
    const timer=setTimeout(()=>finish(new Error('Native audio did not finish: '+url+' (state '+audio.readyState+', network '+audio.networkState+')')),20000);
    function sample(){result.maxTime=Math.max(result.maxTime,audio.currentTime);result.advanced=result.maxTime>0;}
    function finish(error){
      clearTimeout(timer);sample();result.duration=Number.isFinite(audio.duration)?audio.duration:0;
      audio.pause();audio.removeAttribute('src');audio.load();
      error?reject(error):resolve(result);
    }
    audio.addEventListener('playing',()=>{result.playing=true;});
    audio.addEventListener('timeupdate',sample);
    audio.addEventListener('ended',()=>{result.ended=true;finish();},{once:true});
    audio.addEventListener('error',()=>finish(new Error('Native media error '+audio.error?.code+': '+url)),{once:true});
    audio.play().catch(finish);
  }),url);
}

async function productPlayback(entry){
  const before=requests.length;
  const result=await page.evaluate(async({url,appBase})=>{
    const qa=window.qaOfflineAudio,start=qa.created.length,fetchStart=qa.fetches.length,states=[];
    const script=document.querySelector('script[type="module"][src]').src;
    const {playSound}=await import(new URL('audio.js',script));
    const ok=await playSound(new URL(url,appBase).href,state=>states.push(state));
    return{ok,states,created:qa.created.slice(start),fetches:qa.fetches.slice(fetchStart)};
  },{url:entry.url,appBase});
  assert.equal(result.ok,true,'The actual app player must finish normally.');
  assert(result.states.includes('playing'),'The app must report actual media playback.');
  assert.equal(result.created.length,1,'One requested phrase must create only one native audio element.');
  assert.equal(result.created[0].ended,1,'The native audio must reach its ended event.');
  assert.equal(result.created[0].error,0);
  const resourceRequests=requests.slice(before).filter(r=>isMP3(r.url));
  assert(resourceRequests.length<=1,'Playing a cached sound must not issue both a fetch probe and a native media request: '+JSON.stringify(resourceRequests));
  assert(result.fetches.length<=1,'The player must not fetch the same clip repeatedly.');
  return{url:entry.url,states:result.states,resourceRequests,explicitFetches:result.fetches};
}

(async()=>{
  fs.mkdirSync(out,{recursive:true});
  await check('Built audio manifest is complete and uses safe immutable identities',async()=>{
    assert(Array.isArray(manifest)&&manifest.length>0,'audio-pack.json must be a nonempty array.');
    const urls=new Set();
    for(const item of manifest){
      assert.equal(typeof item.url,'string');
      assert(!/^(?:[a-z]+:|\/)/i.test(item.url),'Audio URLs must be relative to /xiaoya/.');
      const url=new URL(item.url,appBase);
      assert.equal(url.origin,origin);assert(url.pathname.endsWith('.mp3'));assert(!url.search&&!url.hash);
      assert(Number.isSafeInteger(item.bytes)&&item.bytes>0,'Each audio file needs its expected byte length.');
      assert.match(item.sha256,/^[a-f0-9]{64}$/i,'Each audio file needs its expected SHA-256.');
      assert(!urls.has(url.href),'Manifest URLs must be unique: '+item.url);urls.add(url.href);
      const local=path.resolve(dist,'xiaoya',item.url);
      assert(local.startsWith(dist+path.sep),'Manifest cannot leave the built public directory.');
      assert.equal(fs.statSync(local).size,item.bytes,'The manifest must describe the shipped file: '+item.url);
    }
    return{files:manifest.length,bytes:manifest.reduce((sum,item)=>sum+item.bytes,0)};
  });
  try{
    await setup();
    await check('First install waits for every full audio file and validates its integrity',async()=>{
      assert.equal(await page.locator('meta[name="xiaoya-build"]').getAttribute('content'),expected.build,'The loopback server must serve the current build.');
      assert.equal(await page.locator('meta[name="xiaoya-version"]').getAttribute('content'),expected.version);
      const worker=await page.evaluate(async()=>{
        const registration=await Promise.race([navigator.serviceWorker.ready,new Promise((_,reject)=>setTimeout(()=>reject(new Error('Audio-pack installation did not finish within 120 seconds.')),120000))]);
        const active=registration.active;
        if(active?.state!=='activated')await new Promise((resolve,reject)=>{
          const timeout=setTimeout(()=>reject(new Error('Audio worker never activated.')),15000);
          active.addEventListener('statechange',()=>{
            if(active.state==='activated'){clearTimeout(timeout);resolve();}
            if(active.state==='redundant'){clearTimeout(timeout);reject(new Error('Audio worker became redundant.'));}
          });
        });
        return{scope:registration.scope,active:active?.scriptURL,state:active?.state};
      });
      assert.equal(worker.scope,appBase);assert.equal(worker.state,'activated');
      await page.waitForFunction(()=>!!navigator.serviceWorker.controller,{},{timeout:15000});
      const inventory=await page.evaluate(async({manifest,cacheName,appBase})=>{
        const cache=await caches.open(cacheName),problems=[],queue=manifest.slice();let verified=0,bytes=0;
        await Promise.all(Array.from({length:4},async()=>{
          while(queue.length){
            const item=queue.shift(),url=new URL(item.url,appBase).href,response=await cache.match(url,{ignoreVary:true});
            if(!response){problems.push({url:item.url,reason:'missing'});continue;}
            const body=await response.arrayBuffer();
            const digest=[...new Uint8Array(await crypto.subtle.digest('SHA-256',body))].map(n=>n.toString(16).padStart(2,'0')).join('');
            if(response.status!==200||body.byteLength!==item.bytes||digest!==item.sha256.toLowerCase())problems.push({url:item.url,status:response.status,bytes:body.byteLength,sha256:digest,expectedBytes:item.bytes,expectedSha256:item.sha256});
            else{verified++;bytes+=body.byteLength;}
          }
        }));
        return{verified,bytes,problems,cacheEntries:(await cache.keys()).length};
      },{manifest,cacheName,appBase});
      assert.deepEqual(inventory.problems,[],'A ready worker must never hide incomplete or corrupt audio: '+JSON.stringify(inventory.problems));
      assert.equal(inventory.verified,manifest.length);
      return{worker,...inventory};
    });

    await check('Unheard Chinese and all three English voices play for the first time while offline',async()=>{
      const heard=new Set(await page.evaluate(()=>window.qaOfflineAudio.played));
      const unheard=manifest.filter(item=>!heard.has(new URL(item.url,appBase).href));
      const chinese=unheard.find(item=>new URL(item.url,appBase).pathname.startsWith('/xiaoya/audio/'));
      assert(chinese,'An unheard Chinese guidance clip must be available.');
      const byURL=new Map(unheard.map(item=>[new URL(item.url,appBase).pathname,item]));
      const aiden=unheard.find(item=>{
        const pathname=new URL(item.url,appBase).pathname;
        return /^\/audio\/[^/]+\.mp3$/.test(pathname)&&byURL.has(pathname.replace('/audio/','/audio/ryan/'))&&byURL.has(pathname.replace('/audio/','/audio/characters/pip/'));
      });
      assert(aiden,'The same English phrase must ship in all three voices.');
      const voicePath=new URL(aiden.url,appBase).pathname;
      const selected=[{voice:'Chinese',...chinese},{voice:'aiden',...aiden},{voice:'ryan',...byURL.get(voicePath.replace('/audio/','/audio/ryan/'))},{voice:'pip',...byURL.get(voicePath.replace('/audio/','/audio/characters/pip/'))}];
      await context.setOffline(true);
      const responseStart=responses.length,failureStart=failed.length,evidence=[];
      for(const entry of selected){
        const result=await nativePlayback(new URL(entry.url,appBase).href);
        assert(result.playing&&result.advanced&&result.ended&&result.duration>0,'Native media must actually advance and finish: '+JSON.stringify(result));
        evidence.push({voice:entry.voice,...result});
      }
      const media=responses.slice(responseStart).filter(r=>isMP3(r.url));
      assert(media.every(r=>r.worker),'Offline media must come from the service worker: '+JSON.stringify(media));
      assert.deepEqual(failed.slice(failureStart).filter(r=>isMP3(r.url)),[],'An unheard clip must not try a failing network fallback.');
      return{clips:evidence,responses:media};
    });

    await check('Offline native player reuses audio without a separate fetch probe or repeated resource load',async()=>{
      await context.setOffline(true);
      const heard=new Set(await page.evaluate(()=>window.qaOfflineAudio.played));
      const entry=manifest.find(item=>!heard.has(new URL(item.url,appBase).href));assert(entry);
      const first=await productPlayback(entry),second=await productPlayback(entry);
      return{first,second};
    });

    await check('Offline byte ranges include open, short, suffix, and unsatisfiable requests',async()=>{
      await context.setOffline(true);
      const item=manifest.find(item=>item.bytes>4);assert(item);
      const evidence=await page.evaluate(async({item,appBase,cacheName})=>{
        const url=new URL(item.url,appBase).href,cache=await caches.open(cacheName),whole=new Uint8Array(await (await cache.match(url,{ignoreVary:true})).arrayBuffer()),results=[];
        for(const range of ['bytes=0-','bytes=1-3','bytes=-2',`bytes=${whole.length}-`]){
          const response=await fetch(url,{headers:{Range:range}}),body=new Uint8Array(await response.arrayBuffer());
          const wanted=range==='bytes=0-'?whole:range==='bytes=1-3'?whole.slice(1,4):range==='bytes=-2'?whole.slice(-2):null;
          results.push({range,status:response.status,contentRange:response.headers.get('Content-Range'),acceptRanges:response.headers.get('Accept-Ranges'),contentLength:response.headers.get('Content-Length'),bytes:body.length,bodyMatches:wanted?body.length===wanted.length&&body.every((value,i)=>value===wanted[i]):true});
        }
        return{url:item.url,size:whole.length,results};
      },{item,appBase,cacheName});
      const [open,short,suffix,invalid]=evidence.results;
      for(const result of [open,short,suffix]){assert.equal(result.status,206);assert.equal(result.acceptRanges,'bytes');assert.equal(Number(result.contentLength),result.bytes);assert(result.bodyMatches);}
      assert.equal(open.contentRange,`bytes 0-${item.bytes-1}/${item.bytes}`);
      assert.equal(short.contentRange,`bytes 1-3/${item.bytes}`);
      assert.equal(suffix.contentRange,`bytes ${item.bytes-2}-${item.bytes-1}/${item.bytes}`);
      assert.equal(invalid.status,416);assert.equal(invalid.contentRange,`bytes */${item.bytes}`);
      return evidence;
    });

    await check('Every packaged MP3 can be decoded locally as real audio',async()=>{
      await context.setOffline(true);
      const decoded=await page.evaluate(async({manifest,cacheName,appBase})=>{
        const cache=await caches.open(cacheName),audioContext=new AudioContext(),queue=manifest.slice(),bad=[];let count=0,seconds=0,minDuration=Infinity,maxDuration=0;
        try{
          await Promise.all(Array.from({length:4},async()=>{
            while(queue.length){
              const item=queue.shift();
              try{
                const response=await cache.match(new URL(item.url,appBase).href,{ignoreVary:true});if(!response)throw new Error('Missing from completed audio cache');
                const decoded=await audioContext.decodeAudioData(await response.arrayBuffer());
                if(!(decoded.duration>0&&decoded.length>0&&decoded.numberOfChannels>0))throw new Error('Decoded audio is empty');
                count++;seconds+=decoded.duration;minDuration=Math.min(minDuration,decoded.duration);maxDuration=Math.max(maxDuration,decoded.duration);
              }catch(error){bad.push({url:item.url,error:String(error)});}
            }
          }));
        }finally{await audioContext.close();}
        return{count,seconds,minDuration:Number.isFinite(minDuration)?minDuration:0,maxDuration,bad};
      },{manifest,cacheName,appBase});
      report.decoding=decoded;save();
      assert.deepEqual(decoded.bad,[],'These shipped files cannot be decoded: '+JSON.stringify(decoded.bad));
      assert.equal(decoded.count,manifest.length);
      return decoded;
    });

    await check('Run stays local, performs no uploads, and has no page errors',async()=>{
      assert.deepEqual(requests.filter(r=>new URL(r.url).origin!==origin),[]);
      assert.deepEqual(requests.filter(r=>r.method!=='GET'),[]);
      assert.deepEqual(requests.filter(r=>/\/(?:xiaoya\/speech\/|speech\/(?:vosk-|model-))/.test(new URL(r.url).pathname)),[],'Audio playback must not download recognition models.');
      assert.deepEqual(errors,[]);
      return{requests:requests.length,mediaRequests:requests.filter(r=>isMP3(r.url)).length,failed};
    });
  }catch(error){report.checks.push({name:'Browser setup',status:'FAIL',error:error.stack||String(error)});process.exitCode=1;console.error(error);}
  finally{await context?.close();await browser?.close();save();}
  console.log('Audio offline report: '+path.join(out,'results.json'));
})().catch(error=>{console.error(error);process.exitCode=1;});
