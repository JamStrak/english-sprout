/* Comic/garden integration: real story -> MediaRecorder -> real local Whisper.
   A known course MP3 supplies a synthetic stream once native recording starts.
   This verifies the software
   path, not children's pronunciation accuracy or real-device microphone quality.
   Run after npm run build with launcher_xiaoya.py serving the worktree dist. */
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'C:/Users/Jam/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const root=path.resolve(__dirname,'..');
const target=new URL(process.env.TEST_URL||'http://127.0.0.1:24756');
if(!['127.0.0.1','localhost','[::1]'].includes(target.hostname))throw new Error('This recording integration test requires a loopback server.');
const origin=target.origin;
const entry=new URL(target.pathname.endsWith('/xiaoya/')?target.pathname:target.pathname.replace(/\/$/,'')+'/xiaoya/',origin).href;
const fixtureVoice=process.env.TEST_SPEECH_VOICE||'pip';
assert(['pip','aiden'].includes(fixtureVoice),'TEST_SPEECH_VOICE must select an existing local pip or aiden fixture');
const fixturePath=fixtureVoice==='pip'?'public/audio/characters/pip/needs-01.mp3':'public/audio/needs-01.mp3';
const output=path.join(root,'test-results/xiaoya-garden-speech'+(fixtureVoice==='pip'?'':'-aiden'));
const key='xiaoya-english:state:v1';
fs.mkdirSync(output,{recursive:true});
const knownAudio=Array.from(fs.readFileSync(path.join(root,fixturePath)));
const isSpeechAsset=url=>new URL(url).pathname.includes('/xiaoya/speech/whisper-tiny-en-v1/');
const report={entry,fixture:fixturePath,checks:[],syntheticMicrophone:true,actualMediaRecorder:true,actualLocalWhisper:true,childSpeechValidated:false,realDeviceMicrophoneValidated:false,requests:[],errors:[]};
let browser,context,page;
function pass(name,evidence){report.checks.push({name,status:'PASS',evidence});console.log('PASS '+name);}
async function parent(){
  await page.locator('[data-action="parent"]').click();
  if(await page.locator('#parent-answer').count()){
    const numbers=(await page.locator('label[for="parent-answer"]').textContent()).match(/\d+/g).map(Number);
    await page.locator('#parent-answer').fill(String(numbers[0]+numbers[1]));
    await page.locator('[data-action="gate-submit"]').click();
  }
}
async function state(){return page.evaluate(k=>JSON.parse(localStorage.getItem(k)||'null'),key);}
async function statuses(){return page.evaluate(async key=>{
  const src=document.querySelector('script[type="module"][src]').src;
  const learning=await import(new URL('learning.js',src));
  const state=JSON.parse(localStorage.getItem(key));
  return {goal:learning.goalStatus(state,'request'),alphabet:learning.alphabetEligibility(state),phrase:learning.canRevealPhrase(state,'needs-01')};
},key);}
async function captureCandidate(expectedCount){
  const before=await state(),previousCount=before?.evidence.length||0;
  await page.locator('[data-action="next-event"]').click();
  assert.equal(await page.locator('.event-view').getAttribute('data-event'),'food-water');
  assert.equal(await page.locator('.event-view').getAttribute('data-phase'),'story');
  assert.equal(await page.locator('[data-action="record"]').count(),0,'Recording is unavailable before meaning-building story');
  await page.locator('[data-action="story-continue"]').waitFor({timeout:45000});
  assert.equal(await page.locator('[data-story-frame]').getAttribute('data-story-frame'),'3');
  assert.equal((await state())?.evidence.length||0,previousCount,'Watching the story does not write learning evidence');
  assert.equal(await page.locator('[data-choice]').count(),0,'The comic flow does not ask an untaught picture question');
  await page.screenshot({path:path.join(output,expectedCount===1?'online-story-complete.png':'offline-story-complete.png'),fullPage:true});
  if(expectedCount===1){
    assert(!report.requests.some(r=>isSpeechAsset(r.url)));
    pass('The default water story completes before recording, writes no evidence and downloads no speech model');
  }
  await page.locator('[data-action="story-continue"]').click();
  assert.equal(await page.locator('.event-view').getAttribute('data-phase'),'request');
  await page.locator('[data-action="record"]').click();
  await page.locator('.recording-indicator').waitFor();
  // Real voice activity and recorder timeout finish capture, with no fabricated
  // ASR result and no direct write to application learning state.
  await page.waitForFunction(({key,count})=>{
    const state=JSON.parse(localStorage.getItem(key)||'null');
    return state?.evidence.filter(e=>e.kind==='speech'&&e.source==='machine').length===count;
  },{key,count:expectedCount},{timeout:180000});
  const saved=await state(),candidate=saved.evidence.at(-1);
  const diagnostic=await page.evaluate(()=>qaCapture.describe());
  report.captures??=[];report.captures.push({candidate,diagnostic});
  assert.equal(candidate.eventId,'food-water');
  assert.equal(candidate.result,'supported','Known I need water audio after the story must be a supported matching candidate');
  assert.equal(candidate.source,'machine');
  assert.equal(candidate.contextId,'food-water');
  assert.equal(candidate.helped,true,'The story example is sticky help for this entire attempt');
  const latest=diagnostic.records.at(-1);
  assert(latest.sourceEndedAt<latest.stoppedAt,'The complete known phrase is supplied before capture stops');
  assert(latest.injectedAt>=latest.startedAt,'Synthetic speech starts only after the actual recorder is ready');
  assert.equal(await page.locator('.event-view').getAttribute('data-phase'),'resolved');
  await page.locator('[data-assessment][data-status="matched"][data-stars="3"]').waitFor();
  const capture=await page.evaluate(async()=>{
    const script=document.querySelector('script[type="module"][src]').src;
    const audio=await import(new URL('audio.js',script));
    return {records:qaCapture.records,tracks:qaCapture.streams.flatMap(s=>s.getTracks().map(t=>t.readyState)),workers:qaCapture.workers,messages:qaCapture.workerMessages,speechReady:audio.speechReady(),workerURL:new URL('speech-worker.js',script).href};
  });
  assert(capture.records.some(r=>r.bytes>0&&r.stopped&&r.mimeType.startsWith('audio/')),'A real MediaRecorder produced non-empty audio');
  assert(capture.tracks.every(s=>s==='ended'),'Capture releases microphone tracks');
  assert(capture.speechReady,'The real local Whisper engine is ready');
  assert(capture.workers.some(worker=>worker.url===capture.workerURL&&worker.type==='module'),'The actual versioned Whisper module worker was started');
  const transcribes=capture.messages.filter(m=>m.direction==='sent'&&m.type==='transcribe');
  assert.equal(transcribes.length,1,'This fresh page sends one genuine captured sample buffer to its worker');
  const transcribe=transcribes[0],result=capture.messages.find(m=>m.direction==='received'&&m.type==='result'&&m.id===transcribe.id&&m.worker===transcribe.worker);
  assert.deepEqual(transcribe.keys,['id','samples','type'],'No expected phrase, answer prompt or candidate list enters the decoder');
  assert(transcribe.samples>16000&&transcribe.activeVoiceSeconds>0,'Actual captured PCM reaches Whisper');
  assert(result?.heard?.trim(),'Actual Whisper produces a nonempty transcript for the known course audio');
  const initialization=capture.messages.find(m=>m.direction==='sent'&&m.type==='init'&&m.worker===transcribe.worker);
  assert(capture.messages.some(m=>m.direction==='received'&&m.type==='ready'&&m.id===initialization?.id&&m.at<=transcribe.at),'Recognition waits for real model readiness');
  capture.timings={modelInitializationMs:capture.messages.find(m=>m.direction==='received'&&m.type==='ready'&&m.id===initialization.id).at-initialization.at,inferenceMs:result.at-transcribe.at};
  await page.screenshot({path:path.join(output,expectedCount===1?'online-matched.png':'offline-matched.png'),fullPage:true});
  return {saved,capture};
}
(async()=>{
  const {SPEECH_ASSETS,SPEECH_ENGINE,SPEECH_BYTES}=await import(pathToFileURL(path.join(root,'xiaoya/speech-assets.js')).href);
  report.engine=SPEECH_ENGINE;report.expectedModelBytes=SPEECH_BYTES;
  browser=await chromium.launch({channel:'msedge',headless:true,args:['--no-proxy-server','--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream','--autoplay-policy=no-user-gesture-required']});
  context=await browser.newContext({permissions:['microphone'],viewport:{width:390,height:844},timezoneId:'Asia/Shanghai'});
  context.on('request',request=>report.requests.push({url:request.url(),method:request.method(),hasBody:request.postDataBuffer()!==null}));
  context.on('page',p=>p.on('pageerror',error=>report.errors.push(error.message)));
  await context.addInitScript(({knownAudio,origin})=>{
    if(location.origin===origin&&!localStorage.getItem('xiaoya-english:preferences:v1'))localStorage.setItem('xiaoya-english:preferences:v1',JSON.stringify({mic:true}));
    window.qaCapture={records:[],streams:[],streamEvidence:[],chunks:[],workers:[],workerMessages:[]};
    const NativeRecorder=window.MediaRecorder;
    // Initial about:blank is not a secure media surface. Instrument only the
    // actual loopback document; unavailable APIs remain unavailable there.
    if(!NativeRecorder||!navigator.mediaDevices?.getUserMedia)return;
    const fixtures=new WeakMap(),AudioContext=window.AudioContext||window.webkitAudioContext;
    window.MediaRecorder=class extends NativeRecorder{
      constructor(...args){
        super(...args);
        const evidence={mimeType:this.mimeType,bytes:0,stopped:false,constructedAt:performance.now()};qaCapture.records.push(evidence);
        const chunks=[];qaCapture.chunks.push(chunks);
        const fixture=fixtures.get(args[0]);
        this.addEventListener('start',()=>{
          evidence.startedAt=performance.now();
          if(fixture){
            // Unlike a browser file-input clock, this fixture cannot start
            // speaking during an arbitrarily slow AudioContext initialisation.
            evidence.injectedAt=performance.now();evidence.sourceDelaySeconds=2;
            fixture.source.onended=()=>{evidence.sourceEndedAt=performance.now();};
            fixture.silence.start();fixture.source.start(fixture.context.currentTime+2);
          }
        });
        this.addEventListener('dataavailable',event=>{evidence.bytes+=event.data.size;chunks.push(event.data);});
        this.addEventListener('stop',()=>{evidence.stopped=true;evidence.stoppedAt=performance.now();fixture?.context.close().catch(()=>{});});
      }
    };
    const get=navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getUserMedia=async(...args)=>{
      const requestedAt=performance.now();
      // Retain the real browser permission/API call, using Edge's fake device.
      // Replace only its audio source with a controllable, decoded course MP3.
      const nativeStream=await get(...args);qaCapture.streams.push(nativeStream);nativeStream.getTracks().forEach(t=>t.stop());
      const context=new AudioContext({sampleRate:48000});await context.resume();
      const buffer=await context.decodeAudioData(new Uint8Array(knownAudio).buffer);
      const destination=context.createMediaStreamDestination();destination.channelCount=1;
      const source=context.createBufferSource();source.buffer=buffer;source.connect(destination);
      // A microphone keeps producing samples after a phrase. Keep silence
      // flowing too, so the browser records the real post-speech VAD interval.
      const silence=context.createBufferSource();silence.buffer=context.createBuffer(1,48000,48000);silence.loop=true;silence.connect(destination);
      const stream=destination.stream;fixtures.set(stream,{context,source,silence});qaCapture.streams.push(stream);
      qaCapture.streamEvidence.push({requestedAt,resolvedAt:performance.now(),sourceDurationSeconds:buffer.duration,settings:stream.getAudioTracks().map(t=>t.getSettings())});return stream;
    };
    qaCapture.describe=async()=>{
      const decoded=[];
      for(const chunks of qaCapture.chunks){
        const context=new AudioContext();
        try{
          const buffer=await context.decodeAudioData(await new Blob(chunks).arrayBuffer()),samples=buffer.getChannelData(0),frame=Math.round(buffer.sampleRate*.02);
          let first=null,last=null,activeFrames=0;
          for(let start=0;start<samples.length;start+=frame){const values=samples.subarray(start,start+frame),rms=Math.sqrt(values.reduce((sum,x)=>sum+x*x,0)/values.length);if(rms>.022){first??=start/buffer.sampleRate;last=(start+values.length)/buffer.sampleRate;activeFrames++;}}
          decoded.push({durationSeconds:buffer.duration,firstVoiceSeconds:first,lastVoiceSeconds:last,activeVoiceSeconds:activeFrames*.02});
        }finally{await context.close();}
      }
      return {records:qaCapture.records,streams:qaCapture.streamEvidence,decoded,workers:qaCapture.workers,workerMessages:qaCapture.workerMessages};
    };
    const NativeWorker=window.Worker;
    window.Worker=class extends NativeWorker{
      constructor(...args){
        super(...args);this.qaWorker=qaCapture.workers.length;
        qaCapture.workers.push({url:new URL(String(args[0]),document.baseURI).href,type:args[1]?.type,createdAt:performance.now()});
        this.addEventListener('message',event=>{const d=event.data;if(['ready','result','error'].includes(d?.type))qaCapture.workerMessages.push({at:performance.now(),direction:'received',worker:this.qaWorker,...d});});
      }
      postMessage(data,...args){
        if(['init','transcribe'].includes(data?.type)){
          const item={at:performance.now(),direction:'sent',worker:this.qaWorker,type:data.type,id:data.id,keys:Object.keys(data).sort()};
          if(data.type==='init'){item.assetCount=data.assets?.length;item.assetBytes=data.assets?.reduce((total,a)=>total+a.blob.size,0);}
          if(data.samples){item.samples=data.samples.length;let active=0;for(let i=0;i<data.samples.length;i+=320){let power=0;const end=Math.min(i+320,data.samples.length);for(let j=i;j<end;j++)power+=data.samples[j]**2;if(Math.sqrt(power/(end-i))>.022)active++;}item.activeVoiceSeconds=active*.02;}
          qaCapture.workerMessages.push(item);
        }
        return super.postMessage(data,...args);
      }
    };
  },{knownAudio,origin});
  page=await context.newPage();page.setDefaultTimeout(15000);
  await page.goto(entry);
  await page.locator('[data-action="next-event"]').waitFor();
  report.version=await page.locator('meta[name="xiaoya-version"]').getAttribute('content');
  report.build=await page.locator('meta[name="xiaoya-build"]').getAttribute('content');
  assert.equal(report.version,'0.6.0','Run against the built Whisper comic/garden v0.6 app');
  const servedAssets=await page.evaluate(async()=>{
    const script=document.querySelector('script[type="module"][src]').src;
    const assets=await import(new URL('speech-assets.js',script));
    return {engine:assets.SPEECH_ENGINE,assets:assets.SPEECH_ASSETS};
  });
  assert.equal(servedAssets.engine,SPEECH_ENGINE);assert.deepEqual(servedAssets.assets,SPEECH_ASSETS,'The test and served build must use the same immutable speech assets');
  const worker=await page.evaluate(async()=>{
    const ready=await Promise.race([navigator.serviceWorker.ready.then(()=>true),new Promise(resolve=>setTimeout(()=>resolve(false),30000))]);
    return {ready,registrations:(await navigator.serviceWorker.getRegistrations()).map(r=>({scope:r.scope,active:r.active?.state,installing:r.installing?.state,waiting:r.waiting?.state}))};
  });
  assert(worker.ready,'Service worker failed to become ready within 30 seconds: '+JSON.stringify(worker));
  await page.waitForFunction(()=>!!navigator.serviceWorker.controller,null,{timeout:15000});
  assert(!report.requests.some(r=>isSpeechAsset(r.url)));
  const prepareStarted=Date.now();
  // The child recording action must prepare the real model automatically.
  // No parent recognition/preparation button is used anywhere in this run.
  const first=await captureCandidate(1);
  const downloads=report.requests.filter(r=>isSpeechAsset(r.url));
  for(const asset of SPEECH_ASSETS)assert(downloads.some(r=>new URL(r.url).pathname.endsWith('/'+asset.path)),`First recording must fetch ${asset.path}`);
  assert(!report.requests.some(r=>/\/speech\/(vosk-|model-en-us)/.test(r.url)),'Xiaoya must not load the previous Vosk engine');
  const cached=await page.evaluate(async assets=>{
    const cache=await caches.open('english-sprout-speech-v1');
    const result={};
    for(const asset of assets){
      const response=await cache.match(new URL(asset.path,document.baseURI));
      if(!response){result[asset.path]=null;continue;}
      const bytes=await response.arrayBuffer();
      const digest=await crypto.subtle.digest('SHA-256',bytes);
      result[asset.path]={bytes:bytes.byteLength,sha256:[...new Uint8Array(digest)].map(x=>x.toString(16).padStart(2,'0')).join('')};
    }
    return result;
  },SPEECH_ASSETS);
  for(const asset of SPEECH_ASSETS)assert.deepEqual(cached[asset.path],{bytes:asset.bytes,sha256:asset.sha256},`Complete verified bytes must be cached: ${asset.path}`);
  const initialization=first.capture.messages.find(m=>m.direction==='sent'&&m.type==='init');
  assert.equal(initialization.assetCount,SPEECH_ASSETS.length);assert.equal(initialization.assetBytes,SPEECH_BYTES);
  pass('First recording automatically prepares actual local Whisper with complete verified model and runtime bytes',{milliseconds:Date.now()-prepareStarted,cached});
  pass('Real MediaRecorder audio reaches actual Whisper without the expected phrase and produces a matching machine candidate',{recorders:first.capture.records,timings:first.capture.timings});
  const firstStatus=await statuses();
  assert.equal(firstStatus.goal.candidateCount,1);
  for(const field of ['independent','retained','passed'])assert.equal(firstStatus.goal[field],false);
  assert.equal(firstStatus.goal.independentCount,0);
  assert.equal(firstStatus.alphabet.eligible,false);
  assert.equal(firstStatus.phrase,false);
  assert.equal(firstStatus.goal.supported,false,'A machine candidate is not parent-confirmed supported ability');
  assert.equal(firstStatus.goal.listening,false,'Story playback is not independent listening evidence');
  await page.locator('[data-action="home"]').click();await parent();
  await page.getByText('机器候选 1 次',{exact:false}).first().waitFor();
  pass('Story-supported machine evidence unlocks no independent mastery, alphabet or spelling',firstStatus);
  const mediaCache=await page.evaluate(async()=>{
    const build=document.querySelector('meta[name="xiaoya-build"]').content;
    const core=await caches.open('xiaoya-core-'+build),audio=await caches.open('xiaoya-audio-v3');
    const result={};
    for(const [cache,file] of [[core,'xiaoya/stories/water-v1.webp'],[audio,'audio/characters/pip/needs-01.mp3'],[audio,'xiaoya/audio/v3/garden-speak.mp3'],[audio,'xiaoya/audio/v3/garden-speech-pass.mp3']]){
      const response=await cache.match(new URL(file,document.baseURI));
      result[file]=response?(await response.arrayBuffer()).byteLength:0;
    }
    return result;
  });
  for(const [file,bytes]of Object.entries(mediaCache))assert(bytes>0,'Visited story/audio missing from cache: '+file);
  report.visitedMediaCache=mediaCache;
  // A full reload destroys the first page's model and recorder instances. Every
  // subsequent download/recognition operation now runs with the context offline.
  await context.setOffline(true);
  const requestBoundary=report.requests.length;
  await page.reload();await page.locator('[data-action="next-event"]').waitFor();
  assert.equal(await page.evaluate(()=>qaCapture.workers.length),0,'Reload starts with no model worker, not an already warm in-memory engine');
  const second=await captureCandidate(2);
  const offlineRequests=report.requests.slice(requestBoundary).filter(r=>isSpeechAsset(r.url));
  assert.deepEqual(offlineRequests,[],'Cold offline preparation reuses existing speech bytes without another asset fetch');
  const secondStatus=await statuses();
  assert.equal(secondStatus.goal.candidateCount,2);
  assert.equal(secondStatus.goal.independentCount,0);
  assert.equal(secondStatus.goal.passed,false);
  assert.equal(secondStatus.alphabet.eligible,false);
  pass('Cold offline reload, complete water comic/audio, model preparation and another actual recording/recognition succeed',{recorders:second.capture.records,timings:second.capture.timings,candidateCount:secondStatus.goal.candidateCount});
  await page.locator('[data-action="home"]').click();
  const serialized=await page.evaluate(()=>JSON.stringify(Object.fromEntries(Object.entries(localStorage))));
  assert.doesNotMatch(serialized,/blob:|base64|transcript|"heard"|audio\/webm/);
  assert.deepEqual(report.requests.filter(r=>!['GET','HEAD'].includes(r.method)||r.hasBody),[]);
  assert.deepEqual(report.requests.filter(r=>!r.url.startsWith('blob:')&&!r.url.startsWith('data:')&&new URL(r.url).origin!==origin),[]);
  assert.deepEqual(report.errors,[]);
  pass('Observed flow sends no uploads or external requests and stores no recording URL or transcript');
})().catch(async error=>{
  report.checks.push({name:'Integration run',status:'FAIL',error:error.stack});
  console.error(error);
  if(page){
    const diagnostics=await page.evaluate(async()=>({records:qaCapture?.records,streams:qaCapture?.streamEvidence,workers:qaCapture?.workers,workerMessages:qaCapture?.workerMessages,recordings:await Promise.all((qaCapture?.chunks||[]).map(async chunks=>Array.from(new Uint8Array(await new Blob(chunks).arrayBuffer()))))})).catch(()=>null);
    if(diagnostics){
      for(const [index,bytes]of diagnostics.recordings.entries())fs.writeFileSync(path.join(output,`synthetic-capture-${index+1}.webm`),Buffer.from(bytes));
      delete diagnostics.recordings;report.failureDiagnostics=diagnostics;
    }
  }
  if(page)await page.screenshot({path:path.join(output,'failure.png'),fullPage:true}).catch(()=>{});
  process.exitCode=1;
}).finally(async()=>{
  await context?.close();await browser?.close();
  fs.writeFileSync(path.join(output,'results.json'),JSON.stringify(report,null,2));
  console.log(`${report.checks.filter(x=>x.status==='PASS').length}/${report.checks.length} passed; synthetic known speech only, no child-speech accuracy claim`);
});
