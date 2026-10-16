// Real browser capture and matching, with only the slow recognizer replaced.
// The stub deliberately returns a match after AbortSignal cancellation.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'C:/Users/Jam/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const origin=process.env.TEST_URL||'http://127.0.0.1:24756';
const out=path.resolve(__dirname,'../test-results/xiaoya-races');
const checks=[];
let browser;

const delayedRecognizer=`
export async function prepareSpeech(){ window.race.prepareCalls++; }
export async function assessRecording(url,target,{signal}={}){
  const blob=await (await fetch(url)).blob();
  const call={target,bytes:blob.size,type:blob.type,aborted:!!signal?.aborted,settled:false,consumed:false};
  window.race.calls.push(call);
  signal?.addEventListener('abort',()=>{call.aborted=true;},{once:true});
  return new Promise(resolve=>{
    call.resolve=()=>{
      if(call.settled)throw new Error('Assessment already settled');
      call.settled=true;
      resolve({get heard(){call.consumed=true;return target;}});
    };
  });
}
`;

async function parent(p){
  await p.locator('[data-action="parent"]').click();
  if(await p.locator('#parent-answer').count()){
    const nums=(await p.locator('label[for="parent-answer"]').textContent()).match(/\d+/g).map(Number);
    await p.locator('#parent-answer').fill(String(nums[0]+nums[1]));
    await p.locator('[data-action="gate-submit"]').click();
  }
}
async function state(p){return p.evaluate(()=>JSON.parse(localStorage.getItem('xiaoya-english:state:v1')));}
async function setup(){
  const c=await browser.newContext({viewport:{width:390,height:844},permissions:['microphone'],timezoneId:'Asia/Shanghai',serviceWorkers:'block'});
  await c.addInitScript(()=>{
    window.race={prepareCalls:0,calls:[],errors:[],streams:[],capture:{samples:0,voicedSamples:0,maxRms:0,starts:0,stops:0}};
    window.addEventListener('error',e=>race.errors.push(e.message));
    window.addEventListener('unhandledrejection',e=>race.errors.push(String(e.reason)));
    const original=navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getUserMedia=async(...args)=>{const stream=await original(...args);race.streams.push(stream);return stream;};
    // Observe the real samples without altering the input or forcing hasVoice.
    // A fixed wall-clock delay cannot guarantee fake-mic startup under load.
    const sample=AnalyserNode.prototype.getByteTimeDomainData;
    AnalyserNode.prototype.getByteTimeDomainData=function(values){
      const result=sample.call(this,values);
      const rms=Math.sqrt(values.reduce((n,x)=>n+((x-128)/128)**2,0)/values.length);
      race.capture.samples++;
      race.capture.maxRms=Math.max(race.capture.maxRms,rms);
      if(rms>.022)race.capture.voicedSamples++;
      return result;
    };
    const start=MediaRecorder.prototype.start;
    MediaRecorder.prototype.start=function(...args){
      this.addEventListener('start',()=>race.capture.starts++,{once:true});
      this.addEventListener('stop',()=>race.capture.stops++,{once:true});
      return start.apply(this,args);
    };
  });
  await c.route(/\/speech-local\.js(?:\?.*)?$/,route=>route.fulfill({status:200,contentType:'text/javascript; charset=utf-8',body:delayedRecognizer}));
  const p=await c.newPage();
  p.setDefaultTimeout(10000);
  try{
    await p.goto(origin+'/xiaoya/');
    await p.locator('[data-action="welcome-mic"]').click();
    await p.evaluate(async()=>{
      const src=document.querySelector('script[type="module"][src]').src;
      const m=await import(new URL('learning.js',src));
      // Preload the real matcher so settling is independent of network timing.
      await import(new URL('shared/speech-match.js',src));
      let s=m.createState();
      for(const [eventId,phraseId]of [['play-box','needs-08'],['food-water','needs-01'],['play-ball','play-01']]){
        for(let i=0;i<2;i++)s=m.recordEvidence(s,{attemptId:'race-fixture-'+eventId+'-'+i,eventId,contextId:i?eventId+'-elsewhere':eventId,phraseId,kind:'speech',result:'independent',source:'parent',helped:false,date:['2026-10-12','2026-10-13'][i]});
      }
      localStorage.setItem(m.STORAGE_KEY,JSON.stringify(s));
    });
    await p.reload();
    await parent(p);
    await p.locator('[data-action="enable-letters"]').click();
    await p.locator('[data-action="recognition"]').click();
    await p.getByRole('button',{name:'本地识别已就绪',exact:true}).waitFor();
    assert.equal(await p.evaluate(()=>race.prepareCalls),1);
    await p.locator('[data-action="home"]').click();
    await p.locator('[data-action="letters"]').click();
    await p.locator('[data-letter="letter-a"]').click();
    await p.locator('[data-action="discovery-listen"]').click();
    await p.locator('[data-discovery-choice="target"]').click();
    await p.locator('.event-view[data-phase="request"]').waitFor();
    assert.equal(Object.keys((await state(p)).alphabet.letters).length,0);
    return {c,p};
  }catch(error){await c.close();throw error;}
}
async function pendingRecording(p){
  await p.locator('[data-action="record"]').click();
  await p.locator('.mic-button.recording').waitFor();
  // Wait for the actual 200 ms voice precondition (three 80 ms samples), not
  // an assumed fake-device startup time. This does not change production VAD.
  await p.waitForFunction(()=>race.capture.voicedSamples>=3||race.capture.stops>0,null,{timeout:15000});
  assert(await p.evaluate(()=>race.capture.voicedSamples>=3),'The real microphone must produce enough voice before this recognition-race test can start');
  if(await p.locator('.mic-button.recording').count())await p.locator('[data-action="record"]').click();
  await p.waitForFunction(()=>race.calls.length===1);
  const call=await p.evaluate(()=>({bytes:race.calls[0].bytes,type:race.calls[0].type,settled:race.calls[0].settled}));
  assert(call.bytes>0,'Assessment must receive a real MediaRecorder blob');
  assert.match(call.type,/^audio\//);
  assert.equal(call.settled,false);
  assert.equal((await state(p)).evidence.length,6,'Pending recognition cannot write evidence');
  assert(await p.evaluate(()=>race.streams.length>0&&race.streams.every(s=>s.getTracks().every(t=>t.readyState==='ended'))));
}
async function settleMatched(p){
  await p.evaluate(()=>race.calls[0].resolve());
  await p.waitForFunction(()=>race.calls[0].consumed);
  // Real scoreSpeech has consumed the transcript; allow its awaiting app callback
  // to finish before asserting that no DOM or saved state has changed.
  await p.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
}
async function noErrors(p){assert.deepEqual(await p.evaluate(()=>race.errors),[]);}
async function diagnostics(p){return p.evaluate(()=>({
  visibility:document.visibilityState,phase:document.querySelector('.event-view')?.dataset.phase,
  recording:!!document.querySelector('.mic-button.recording'),replay:!!document.querySelector('[data-action="replay"]'),
  toast:document.querySelector('.toast')?.textContent,capture:race.capture,errors:race.errors,
  calls:race.calls.map(({target,bytes,type,aborted,settled,consumed})=>({target,bytes,type,aborted,settled,consumed})),
  tracks:race.streams.flatMap(s=>s.getTracks().map(t=>({state:t.readyState,muted:t.muted,enabled:t.enabled})))
})).catch(error=>({unavailable:error.message}));}
async function test(name,fn){
  let fixture,build;
  try{
    fixture=await setup();
    build=await fixture.p.locator('meta[name="xiaoya-build"]').getAttribute('content');
    await fn(fixture.p);
    await noErrors(fixture.p);
    checks.push({name,status:'PASS',build,diagnostics:await diagnostics(fixture.p)});
    console.log('PASS',name);
  }catch(error){const detail=fixture?await diagnostics(fixture.p):null;checks.push({name,status:'FAIL',build,error:error.stack,diagnostics:detail});console.error('FAIL',name,error.message,JSON.stringify(detail));}
  finally{await fixture?.c.close();}
}

(async()=>{
  fs.mkdirSync(out,{recursive:true});
  browser=await chromium.launch({channel:'msedge',headless:true,args:['--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream','--autoplay-policy=no-user-gesture-required']});
  await test('Watching wins over a late matched recording and awards no letter',async p=>{
    await pendingRecording(p);
    await p.locator('[data-action="watch"]').click();
    await p.locator('.event-view[data-phase="resolved"]').waitFor();
    assert.equal(await p.evaluate(()=>race.calls[0].aborted),true);
    const before=await state(p);
    await settleMatched(p);
    assert.deepEqual(await state(p),before,'Cancelled recognition must not append machine evidence');
    await p.locator('.event-view[data-phase="resolved"]').waitFor();
    await p.locator('[data-action="finish"]').click();
    await p.locator('.letter-grid').waitFor();
    assert.equal(Object.keys((await state(p)).alphabet.letters).length,0);
    assert.equal(await p.locator('.letter-card.collected,.discovered-letter').count(),0);
  });
  await test('Parent not_yet wins over a late matched recording and awards no letter',async p=>{
    await pendingRecording(p);
    await p.locator('[data-action="observe"]').click();
    await p.locator('[data-observation="not_yet"]').click();
    await p.locator('.event-view[data-phase="resolved"]').waitFor();
    assert.equal(await p.evaluate(()=>race.calls[0].aborted),true);
    const before=await state(p);
    assert.equal(before.evidence.length,7);
    assert.equal(before.evidence.at(-1).source,'parent');
    assert.equal(before.evidence.at(-1).result,'not_yet');
    await settleMatched(p);
    assert.deepEqual(await state(p),before,'Late recognition must preserve the parent observation exactly');
    await p.locator('[data-action="finish"]').click();
    await p.locator('.letter-grid').waitFor();
    assert.equal(Object.keys((await state(p)).alphabet.letters).length,0);
    assert.equal(await p.locator('.letter-card.collected,.discovered-letter').count(),0);
  });
  await test('An active matched recording remains a candidate and can complete its discovery',async p=>{
    await pendingRecording(p);
    await settleMatched(p);
    await p.locator('.event-view[data-phase="resolved"]').waitFor();
    const s=await state(p);
    assert.equal(s.evidence.length,7);
    assert.equal(s.evidence.at(-1).source,'machine');
    assert.equal(s.evidence.at(-1).result,'supported');
    assert.equal(s.evidence.filter(e=>e.source==='parent').length,6);
    assert.equal(await p.evaluate(()=>race.calls[0].aborted),false);
    await p.locator('[data-action="finish"]').click();
    await p.locator('.discovered-letter').waitFor();
    assert.deepEqual(Object.keys((await state(p)).alphabet.letters),['letter-a']);
  });
  await browser.close();
  fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(checks,null,2));
  console.log(`${checks.filter(x=>x.status==='PASS').length}/${checks.length} passed`);
  if(checks.some(x=>x.status==='FAIL'))process.exitCode=1;
})().catch(async error=>{console.error(error);await browser?.close();process.exitCode=1;});
