/* Local recognition quality experiment. No ASR mocks, no user profile, no
   learning writes, no product edits. Known course audio is synthetic input;
   results do not establish children's pronunciation or microphone accuracy. */
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'C:/Users/Jam/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const {spawnSync}=require('node:child_process');
const {createHash}=require('node:crypto');
const root=path.resolve(__dirname,'..');
const entry=new URL(process.env.TEST_URL||'http://127.0.0.1:24756/xiaoya/');
assert(['127.0.0.1','localhost','[::1]'].includes(entry.hostname),'Only a loopback server is allowed');
const stamp=new Date().toISOString().replace(/[:.]/g,'-');
const output=path.join(root,'test-results/xiaoya-speech-quality',process.env.TEST_RUN_LABEL||stamp);
fs.mkdirSync(output,{recursive:true});
const replaySaved=process.env.TEST_REPLAY_SAVED==='1';
const report={started:new Date().toISOString(),entry:entry.href,actualLocalRecognition:true,actualRecordingThisRun:!replaySaved,reusingNativeMediaRecorderClips:replaySaved,syntheticMicrophone:true,childSpeechValidated:false,realMicrophoneValidated:false,cases:[],errors:[],requests:[]};
let browser,context,page;
function save(){fs.writeFileSync(path.join(output,'results.json'),JSON.stringify(report,null,2));}
const fileFor=(voice,id)=>`audio/${voice==='aiden'?'':voice==='ryan'?'ryan/':'characters/pip/'}${id}.mp3`;
function signalFixture(kind){
  const rate=16000,seconds=4,samples=rate*seconds,bytes=Buffer.alloc(44+samples*2);
  bytes.write('RIFF');bytes.writeUInt32LE(bytes.length-8,4);bytes.write('WAVE',8);bytes.write('fmt ',12);bytes.writeUInt32LE(16,16);bytes.writeUInt16LE(1,20);bytes.writeUInt16LE(1,22);bytes.writeUInt32LE(rate,24);bytes.writeUInt32LE(rate*2,28);bytes.writeUInt16LE(2,32);bytes.writeUInt16LE(16,34);bytes.write('data',36);bytes.writeUInt32LE(samples*2,40);
  let seed=0x5eed2026;
  for(let i=0;i<samples;i++){
    seed=(Math.imul(seed,1664525)+1013904223)>>>0;
    bytes.writeInt16LE(kind==='silence'?0:Math.round((seed/4294967296*2-1)*.08*32767),44+i*2);
  }
  const file=path.join(output,kind+'.wav');fs.writeFileSync(file,bytes);
  return {localFile:path.relative(root,file),mimeType:'audio/wav',generator:{kind,sampleRate:rate,duration:seconds,seed:'0x5eed2026',peakAmplitude:kind==='silence'?0:.08}};
}
function savedCases(folder){
  const priorPath=path.join(root,'test-results/xiaoya-speech-quality',folder,'results.json');
  const prior=JSON.parse(fs.readFileSync(priorPath,'utf8'));
  return prior.cases.filter(c=>c.path==='recorded'&&c.polarity==='positive').map(c=>({
    polarity:'positive',path:'saved-recording',voice:c.voice,lessonId:c.lessonId,targetId:c.targetId,expected:c.expected,accepted:c.accepted,condition:c.condition||'normal',mimeType:'audio/webm',
    localFile:path.relative(root,path.join(path.dirname(priorPath),c.captureFile)),
    baseline:{report:path.relative(root,priorPath),build:prior.build,heard:c.result.heard,stars:c.result.stars,matched:c.result.matched,finish:c.finish,capture:c.capture,records:c.records}
  }));
}
async function run(test){
  const began=Date.now();
  let transformedBytes=null;
  if(test.localFile){
    const fixturePath=path.resolve(root,test.localFile);
    assert(fixturePath.startsWith(root+path.sep),'A saved fixture must stay in this workspace');
    const fixture=fs.readFileSync(fixturePath);
    transformedBytes=Array.from(fixture);test={...test,fixtureSha256:createHash('sha256').update(fixture).digest('hex')};
  }
  if(test.tempo){
    const converted=spawnSync(process.env.FFMPEG||'ffmpeg',['-hide_banner','-loglevel','error','-i','pipe:0','-af',`atempo=${test.tempo}`,'-f','wav','pipe:1'],{input:fs.readFileSync(path.join(root,'public',test.file)),maxBuffer:10*1024*1024});
    assert.equal(converted.status,0,converted.stderr?.toString()||'atempo conversion failed');
    transformedBytes=Array.from(converted.stdout);
    fs.writeFileSync(path.join(output,`${test.voice}-${test.lessonId}-tempo-${test.tempo}.wav`),converted.stdout);
  }
  const result=await page.evaluate(async test=>{
    const {audio,matcher}=qaQuality;
    qaQuality.messages=[];qaQuality.dispatches=[];qaQuality.records=[];qaQuality.chunks=[];
    let bytes;
    if(test.transformedBytes)bytes=new Uint8Array(test.transformedBytes).buffer;
    else{
      const source=await fetch(new URL(test.file,document.baseURI));
      if(!source.ok)throw new Error('Fixture unavailable: '+test.file+' '+source.status);
      bytes=await source.arrayBuffer();
    }
    const analysisContext=new AudioContext();
    let sourceAnalysis;
    try{
      const decoded=await analysisContext.decodeAudioData(bytes.slice(0));
      sourceAnalysis=qaQuality.energy(decoded);
    }finally{await analysisContext.close();}
    let url,finish=null;
    if(test.path==='recorded'){
      qaQuality.sourceBytes=bytes;qaQuality.gain=test.gain??1;
      const finished=new Promise((resolve,reject)=>{
        const timer=setTimeout(()=>reject(new Error('Real recording did not finish in 20 seconds')),20000);
        audio.beginRecording({onFinish:value=>{clearTimeout(timer);resolve(value);}}).then(ok=>{if(!ok){clearTimeout(timer);reject(new Error('Recorder was not ready'));}},error=>{clearTimeout(timer);reject(error);});
      });
      finish=await finished;url=finish.url;
      if(!url)throw new Error('Native recording did not create a clip');
    }else url=URL.createObjectURL(new Blob([bytes],{type:test.mimeType||'audio/mpeg'}));
    const assessmentStarted=performance.now();
    const result=await audio.recognize(url,test.accepted);
    const assessmentMilliseconds=performance.now()-assessmentStarted;
    if(!result)throw new Error('Prepared local recognizer returned no result');
    const strictScores=test.accepted.map(expected=>({expected,...matcher.scoreSpeech(expected,result.heard)}));
    let capture=null,captureBytes=null;
    if(test.path==='recorded'){
      const blob=new Blob(qaQuality.chunks,{type:qaQuality.records[0]?.mimeType});
      captureBytes=Array.from(new Uint8Array(await blob.arrayBuffer()));
      const decoding=new AudioContext();
      try{capture=qaQuality.energy(await decoding.decodeAudioData(await blob.arrayBuffer()));}finally{await decoding.close();}
    }
    const response={result,assessmentMilliseconds,strictScores,sourceAnalysis,finish:finish&&{...finish,url:!!finish.url},capture,records:qaQuality.records,messages:qaQuality.messages,decoderRequests:qaQuality.dispatches,captureBytes};
    if(test.path!=='recorded')URL.revokeObjectURL(url);
    audio.clearClip();return response;
  },{...test,transformedBytes});
  if(result.captureBytes){
    const file=`${test.voice}-${test.lessonId}${test.condition?'-'+test.condition:''}.webm`;
    fs.writeFileSync(path.join(output,file),Buffer.from(result.captureBytes));
    result.captureFile=file;delete result.captureBytes;
  }
  const row={...test,milliseconds:Date.now()-began,...result};report.cases.push(row);save();
  console.log(`${test.polarity} ${test.path} ${test.condition||'normal'} ${test.voice} ${test.lessonId} -> ${test.targetId}: ${JSON.stringify(row.result.heard)} stars=${row.result.stars} matched=${row.result.matched} recognitionMs=${Math.round(row.assessmentMilliseconds)}${row.finish?' voice='+row.finish.hasVoice:''}`);
  if(test.path==='recorded'){
    assert(row.records.length===1&&row.records[0].bytes>0&&row.records[0].stopped,'Actual native MediaRecorder produced bytes');
    assert(row.records[0].sourceEndedAt<row.records[0].stoppedAt,'Capture includes the complete fixture');
  }
  return row;
}
async function runSignalTests(){
  const source=fs.readFileSync(path.join(root,'xiaoya/speech-signal.js'),'utf8');
  const signalURL=new URL('/__speech-quality__/speech-signal.js',entry.origin).href;
  report.engine='capture-signal-only';report.actualLocalRecognition=false;report.actualRecordingThisRun=false;
  report.signalSourceSha256=createHash('sha256').update(source).digest('hex');
  await page.route(signalURL,route=>route.fulfill({status:200,contentType:'text/javascript',body:source}));
  await page.evaluate(async url=>{qaQuality.signal=await import(url);},signalURL);
  const clips=[...savedCases('2026-10-16T12-12-38-201Z'),...savedCases('2026-10-16T12-15-04-050Z')];
  for(const condition of ['silence','white-noise'])clips.push({polarity:'negative',condition,...signalFixture(condition)});
  for(const test of clips){
    const bytes=fs.readFileSync(path.resolve(root,test.localFile));
    const outcome=await page.evaluate(async data=>{
      const context=new AudioContext();
      try{
        const decoded=await context.decodeAudioData(new Uint8Array(data).buffer);
        const before=qaQuality.energy(decoded),started=performance.now();
        const {samples,quality}=qaQuality.signal.prepareSamples(decoded);
        return {quality,before,processingMilliseconds:performance.now()-started,outputSamples:samples.length,finite:samples.every(Number.isFinite)};
      }finally{await context.close();}
    },Array.from(bytes));
    report.cases.push({...test,fixtureSha256:createHash('sha256').update(bytes).digest('hex'),...outcome});save();
    console.log(`signal ${test.condition||'normal'} ${test.voice||'generated'} ${test.lessonId||''}: ${JSON.stringify(outcome.quality)}`);
  }
  report.summary={positive:report.cases.filter(c=>c.polarity==='positive').length,falseSilence:report.cases.filter(c=>c.polarity==='positive'&&!c.quality.hasVoice).length,controls:report.cases.filter(c=>c.polarity==='negative').length,falseVoice:report.cases.filter(c=>c.polarity==='negative'&&c.quality.hasVoice).length};
  assert.equal(report.summary.falseSilence,0,'Saved speech must not be discarded as silence/noise');
  assert.equal(report.summary.falseVoice,0,'Silence and stationary noise must not pass the signal gate');
  assert(report.cases.every(c=>c.finite),'Conditioning must not introduce NaN or Infinity');
  assert.deepEqual(report.errors,[]);
}
(async()=>{
  browser=await chromium.launch({channel:'msedge',headless:true,args:['--no-proxy-server','--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream','--autoplay-policy=no-user-gesture-required']});
  context=await browser.newContext({permissions:['microphone'],viewport:{width:390,height:844},timezoneId:'Asia/Shanghai'});
  context.on('request',r=>report.requests.push({url:r.url(),method:r.method(),hasBody:r.postDataBuffer()!==null}));
  await context.addInitScript(()=>{
    window.qaQuality={messages:[],dispatches:[],records:[],chunks:[],sourceBytes:null};
    const NativeWorker=window.Worker;
    window.Worker=class extends NativeWorker{
      constructor(...args){super(...args);this.addEventListener('message',e=>{if(['result','partialresult'].includes(e.data?.event)||['result','error'].includes(e.data?.type))qaQuality.messages.push(e.data);});}
      postMessage(message,...rest){
        if(message?.type==='transcribe')qaQuality.dispatches.push({keys:Object.keys(message).sort(),samples:message.samples?.length});
        return super.postMessage(message,...rest);
      }
    };
    qaQuality.energy=buffer=>{
      const samples=buffer.getChannelData(0),step=Math.round(buffer.sampleRate*.02);
      let first=null,last=null,frames=0,peak=0,sum=0;
      for(let i=0;i<samples.length;i++){peak=Math.max(peak,Math.abs(samples[i]));sum+=samples[i]**2;}
      for(let i=0;i<samples.length;i+=step){const block=samples.subarray(i,i+step),rms=Math.sqrt(block.reduce((n,x)=>n+x*x,0)/block.length);if(rms>.022){first??=i/buffer.sampleRate;last=(i+block.length)/buffer.sampleRate;frames++;}}
      return {duration:buffer.duration,sampleRate:buffer.sampleRate,channels:buffer.numberOfChannels,peak,rms:Math.sqrt(sum/samples.length),firstVoice:first,lastVoice:last,activeVoice:frames*.02};
    };
    if(!window.MediaRecorder||!navigator.mediaDevices?.getUserMedia)return;
    const fixtures=new WeakMap(),NativeRecorder=window.MediaRecorder;
    window.MediaRecorder=class extends NativeRecorder{
      constructor(...args){
        super(...args);const fixture=fixtures.get(args[0]);
        const record={mimeType:this.mimeType,bytes:0,stopped:false};qaQuality.records.push(record);
        this.addEventListener('start',()=>{record.startedAt=performance.now();if(fixture){fixture.source.onended=()=>{record.sourceEndedAt=performance.now();};fixture.silence.start();fixture.source.start(fixture.context.currentTime+2);}});
        this.addEventListener('dataavailable',e=>{record.bytes+=e.data.size;qaQuality.chunks.push(e.data);});
        this.addEventListener('stop',()=>{record.stopped=true;record.stoppedAt=performance.now();fixture?.context.close().catch(()=>{});});
      }
    };
    const nativeGet=navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getUserMedia=async(...args)=>{
      const nativeStream=await nativeGet(...args);nativeStream.getTracks().forEach(t=>t.stop());
      const context=new AudioContext({sampleRate:48000});await context.resume();
      const buffer=await context.decodeAudioData(qaQuality.sourceBytes.slice(0));
      const destination=context.createMediaStreamDestination();destination.channelCount=1;
      const source=context.createBufferSource();source.buffer=buffer;
      const gain=context.createGain();gain.gain.value=qaQuality.gain??1;source.connect(gain);gain.connect(destination);
      const silence=context.createBufferSource();silence.buffer=context.createBuffer(1,48000,48000);silence.loop=true;silence.connect(destination);
      fixtures.set(destination.stream,{context,source,silence});return destination.stream;
    };
  });
  page=await context.newPage();page.on('pageerror',e=>report.errors.push(e.message));
  await page.goto(entry.href);await page.locator('[data-action="next-event"]').waitFor();
  const metadata=await page.evaluate(async()=>{
    const src=document.querySelector('script[type="module"][src]').src;
    qaQuality.audio=await import(new URL('audio.js',src));
    qaQuality.matcher=await import(new URL('./shared/speech-match.js',src));
    const content=await import(new URL('content.js',src));
    const targets=['food-water','play-box','hello-goodbye'].map(id=>{const e=content.EVENTS.find(e=>e.id===id);return {id,lessonId:e.lessonId,english:e.english,accepted:e.accepted};});
    return {version:document.querySelector('meta[name="xiaoya-version"]').content,build:document.querySelector('meta[name="xiaoya-build"]').content,targets};
  });Object.assign(report,metadata);save();
  if(process.env.TEST_SIGNAL_ONLY==='1'){await runSignalTests();return;}
  if(process.env.TEST_EXPECT_BUILD)assert.equal(report.build,process.env.TEST_EXPECT_BUILD,'Do not test a stale or mixed build');
  const preparationStarted=Date.now();
  await page.evaluate(()=>qaQuality.audio.prepareRecognition());
  report.preparationMilliseconds=Date.now()-preparationStarted;
  report.engine=report.requests.some(r=>/whisper/i.test(r.url))?'whisper':report.requests.some(r=>/vosk/i.test(r.url))?'vosk':'unknown';
  if(process.env.TEST_EXPECT_ENGINE)assert.equal(report.engine,process.env.TEST_EXPECT_ENGINE,'Expected local recognition engine must actually load');
  save();
  const voices=['aiden','ryan','pip'];
  if(replaySaved){
    report.experiment='Replay 18 saved native MediaRecorder clips, 9 unrelated speech cases, and deterministic silence/noise controls against the current local recognizer';
    const cases=[...savedCases(process.env.TEST_BASELINE_FOLDER||'2026-10-16T12-12-38-201Z'),...savedCases(process.env.TEST_STRESS_FOLDER||'2026-10-16T12-15-04-050Z')];
    assert.equal(cases.length,18,'The fixed comparison corpus has 9 normal and 9 stress recordings');
    for(const test of cases){
      const target=report.targets.find(t=>t.id===test.targetId);assert(target,'Target still exists');
      assert.equal(target.lessonId,test.lessonId,'Do not substitute a different phrase');
      await run({...test,expected:target.english,accepted:target.accepted});
    }
  }else if(process.env.TEST_STRESS_ONLY==='1'){
    report.experiment='Default Pip, actual recording: linear gain 0.12 / 0.04 and FFmpeg atempo 0.85 (pitch preserved)';
    for(const condition of [{condition:'gain-012',gain:.12},{condition:'gain-004',gain:.04},{condition:'tempo-085',tempo:.85}])for(const target of report.targets){
      await run({polarity:'positive',path:'recorded',voice:'pip',lessonId:target.lessonId,file:fileFor('pip',target.lessonId),targetId:target.id,expected:target.english,accepted:target.accepted,...condition});
    }
  }else{
    for(const mode of ['direct','recorded'])for(const voice of voices)for(const target of report.targets){
      await run({polarity:'positive',path:mode,voice,lessonId:target.lessonId,file:fileFor(voice,target.lessonId),targetId:target.id,expected:target.english,accepted:target.accepted});
    }
  }
  if(replaySaved||process.env.TEST_STRESS_ONLY!=='1'){
    const negatives=[{voice:'aiden',id:'meals-02',english:'Wash your hands.'},{voice:'ryan',id:'dress-06',english:'My socks are wet.'},{voice:'pip',id:'hello-03',english:'Good night.'}];
    for(const negative of negatives)for(const target of report.targets){
      await run({polarity:'negative',path:'direct',voice:negative.voice,lessonId:negative.id,file:fileFor(negative.voice,negative.id),spoken:negative.english,targetId:target.id,expected:target.english,accepted:target.accepted});
    }
  }
  if(replaySaved){
    for(const condition of ['silence','white-noise']){
      const fixture=signalFixture(condition);
      for(const target of report.targets)await run({polarity:'negative',path:'signal',voice:'generated',lessonId:null,condition,targetId:target.id,expected:target.english,accepted:target.accepted,...fixture});
    }
  }
  const timings=report.cases.map(c=>c.assessmentMilliseconds).sort((a,b)=>a-b);
  report.summary={positive:report.cases.filter(c=>c.polarity==='positive').length,positiveMatches:report.cases.filter(c=>c.polarity==='positive'&&c.result.matched).length,negative:report.cases.filter(c=>c.polarity==='negative').length,falsePositives:report.cases.filter(c=>c.polarity==='negative'&&c.result.matched).length,oneStar:report.cases.filter(c=>c.result.stars===1).map(c=>({voice:c.voice,lessonId:c.lessonId,target:c.targetId,path:c.path,polarity:c.polarity,heard:c.result.heard})),recognitionMilliseconds:{min:timings[0],median:timings[Math.floor(timings.length/2)],max:timings.slice(-1)[0]},externalRequests:report.requests.filter(r=>!r.url.startsWith('blob:')&&!r.url.startsWith('data:')&&new URL(r.url).origin!==entry.origin).length};
  if(report.engine==='whisper'){
    const requests=report.cases.flatMap(c=>c.decoderRequests);
    report.decoderAudit={transcriptionRequests:requests.length,payloadKeys:[...new Set(requests.flatMap(r=>r.keys))].sort()};
    assert(requests.length>0,'The actual Whisper decoder must run');
    for(const request of requests)assert.deepEqual(request.keys,['id','samples','type'],'The decoder receives audio only, without reference phrase or prompt');
  }
  if(replaySaved)assert.equal(report.summary.positiveMatches,18,'All 18 fixed normal/quiet/slow reference recordings must match');
  assert.equal(report.summary.falsePositives,0,'Unrelated speech must not pass');
  assert.deepEqual(report.errors,[]);
  assert.deepEqual(report.requests.filter(r=>!['GET','HEAD'].includes(r.method)||r.hasBody),[]);
  assert.deepEqual(report.requests.filter(r=>!r.url.startsWith('blob:')&&!r.url.startsWith('data:')&&new URL(r.url).origin!==entry.origin),[]);
})().catch(error=>{report.error=error.stack;console.error(error);process.exitCode=1;}).finally(async()=>{
  await context?.close();await browser?.close();report.finished=new Date().toISOString();save();
  console.log('REPORT '+path.relative(root,path.join(output,'results.json')));if(report.summary)console.log(JSON.stringify(report.summary));
});
