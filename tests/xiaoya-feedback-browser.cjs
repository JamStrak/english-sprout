// Isolated product QA: real Edge WebAudio and MediaRecorder; virtual microphone,
// controlled ASR result, no model download, no user profile or child data.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'C:/Users/Jam/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const origin=new URL(process.env.TEST_URL||'http://127.0.0.1:24756').origin;
if(!['127.0.0.1','localhost','[::1]'].includes(new URL(origin).hostname))throw Error('Use a loopback server');
const label=process.env.TEST_LABEL||'final';
if(!/^[a-z0-9-]+$/i.test(label))throw Error('Invalid TEST_LABEL');
const out=path.resolve(__dirname,'../test-results/xiaoya-feedback',label);
fs.mkdirSync(out,{recursive:true});
const report={origin,label,realWebAudio:true,webAudioScope:'Native oscillator lifecycle and nonzero AnalyserNode waveform before destination; no physical speaker or acoustic-output measurement.',realMediaRecorder:true,syntheticDevice:true,asrControlled:true,realDeviceValidated:false,checks:[]};
const frequencies={tap:480,reward:660,seed:740,plant:420,water:640,bloom:520};
let browser,A,B;
function save(){fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(report,null,2));}
async function fixture({width=390,height=844,garden='a',funded=false,planted=false,reduced=false,noAudio=false,gumDelay=0}={}){
  const c=await browser.newContext({viewport:{width,height},isMobile:true,hasTouch:true,permissions:['microphone'],serviceWorkers:'block',reducedMotion:reduced?'reduce':'no-preference'});
  const requests=[],errors=[];
  c.on('request',r=>requests.push({url:r.url(),method:r.method()}));
  await c.route('**/*',r=>new URL(r.request().url()).origin===origin?r.continue():r.abort('blockedbyclient'));
  await c.route(/\/releases\/[^/]+\/speech-local\.js$/,r=>r.fulfill({contentType:'text/javascript',body:`export async function prepareSpeech(){return {ready:true,engine:'controlled-feedback-test'};} export async function assessRecording(){window.qaFx.asrStarted=performance.now();await new Promise(resolve=>window.qaFx.finishASR=resolve);return {heard:'I need water',engine:'controlled-feedback-test'};} export function disposeSpeechAssessment(){}` }));
  let storage={};
  if(funded){const m=garden==='a'?A:B;let s=garden==='a'?m.createGarden():m.createMeadow();s=m.rewardRound(s,{roundId:'feedback-fixture',eventId:'food-water',date:'2026-10-18'});if(planted){s=m.openSeedPack(s);s=garden==='a'?m.plantSeed(s):m.plantSeed(s,{x:.5,y:.6});}storage[garden==='a'?m.GARDEN_KEY:m.MEADOW_KEY]=JSON.stringify(s);}
  await c.addInitScript(({origin,storage,noAudio,gumDelay})=>{
    if(location.origin!==origin)return;
    for(const [key,value] of Object.entries(storage))localStorage.setItem(key,value);
    localStorage.setItem('xiaoya-english:preferences:v1',JSON.stringify({mic:true}));
    const now=()=>performance.now();
    const q=window.qaFx={tones:[],media:[],particles:[],records:[],streams:[],ui:[],clicks:[],contextCount:0,activeMedia:new Set()};
    q.isSpeaking=()=>[...q.activeMedia].some(audio=>!audio.paused&&!audio.ended&&audio.readyState>=2);
    const quiet=()=>({waiting:!!document.querySelector('.is-mic-starting'),recording:!!document.querySelector('.recording-indicator'),assessing:['assessing','preparing'].includes(document.querySelector('[data-assessment]')?.dataset.status),speech:q.isSpeaking()});
    const NativeAudio=window.Audio,NativeContext=window.AudioContext,NativeRecorder=window.MediaRecorder;
    window.Audio=function(...args){const audio=new NativeAudio(...args);const url=String(args[0]);for(const name of ['playing','ended','pause'])audio.addEventListener(name,()=>{if(name==='playing')q.activeMedia.add(audio);else q.activeMedia.delete(audio);q.media.push({name,url,at:now(),...quiet()});});return audio;};window.Audio.prototype=NativeAudio.prototype;
    if(noAudio){window.AudioContext=undefined;window.webkitAudioContext=undefined;}
    else if(NativeContext)window.AudioContext=class extends NativeContext{
      constructor(...args){super(...args);q.contextCount++;}
      createOscillator(){const oscillator=super.createOscillator(),entry={notes:[],peak:0};this.latestTone=entry;const set=oscillator.frequency.setValueAtTime.bind(oscillator.frequency);oscillator.frequency.setValueAtTime=(value,time)=>{entry.notes.push(value);return set(value,time);};const start=oscillator.start.bind(oscillator),stop=oscillator.stop.bind(oscillator);oscillator.start=(time)=>{Object.assign(entry,{at:now(),clock:this.currentTime,...quiet()});q.tones.push(entry);return start(time);};oscillator.stop=(time)=>{entry.stops??=[];entry.stops.push({at:now(),when:time??null,currentTime:this.currentTime});return stop(time);};oscillator.addEventListener('ended',()=>entry.endedAt=now());return oscillator;}
      createGain(){const gain=super.createGain(),entry=this.latestTone;if(!entry)return gain;const analyser=super.createAnalyser(),values=new Float32Array(256);analyser.fftSize=values.length;const connect=gain.connect.bind(gain);gain.connect=(target,...rest)=>{if(target!==this.destination)return connect(target,...rest);connect(analyser);return analyser.connect(target,...rest);};const timer=setInterval(()=>{analyser.getFloatTimeDomainData(values);const peak=Math.max(...values.map(Math.abs));entry.peak=Math.max(entry.peak,peak);if(peak>.0001)entry.firstWaveAt??=now();},5);setTimeout(()=>clearInterval(timer),1200);return gain;}
    };
    const gum=navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getUserMedia=async(...args)=>{const stream=await gum(...args);q.streams.push(stream);if(gumDelay)await new Promise(resolve=>setTimeout(resolve,gumDelay));return stream;};
    window.MediaRecorder=class extends NativeRecorder{constructor(...args){super(...args);const e={bytes:0};q.records.push(e);this.addEventListener('start',()=>e.startedAt=now());this.addEventListener('stop',()=>e.stoppedAt=now());this.addEventListener('dataavailable',d=>e.bytes+=d.data.size);}};
    document.addEventListener('click',e=>q.clicks.push({at:now(),action:e.target.closest('button')?.dataset.action,trusted:e.isTrusted}),true);
    const seenParticles=new WeakSet();
    new MutationObserver(records=>{
      for(const record of records)for(const node of record.addedNodes){if(node.nodeType!==1)continue;const nodes=[...(node.matches('.xiaoya-fx-particle')?[node]:[]),...node.querySelectorAll('.xiaoya-fx-particle')];for(const n of nodes){if(seenParticles.has(n))continue;seenParticles.add(n);q.particles.push({at:now(),class:n.className,animation:getComputedStyle(n).animationName,pointer:getComputedStyle(n).pointerEvents,svg:!!n.querySelector('svg')});}}
      const value=quiet(),last=q.ui.at(-1);if(!last||JSON.stringify(value)!==JSON.stringify(last.value))q.ui.push({at:now(),value});
    }).observe(document,{subtree:true,childList:true,attributes:true,attributeFilter:['class','data-status']});
    q.describe=()=>({tones:q.tones,media:q.media,particles:q.particles,records:q.records,ui:q.ui,clicks:q.clicks,contextCount:q.contextCount,asrStarted:q.asrStarted,tracks:q.streams.flatMap(s=>s.getTracks().map(t=>t.readyState))});
  },{origin,storage,noAudio,gumDelay});
  const p=await c.newPage();p.setDefaultTimeout(10000);p.on('pageerror',e=>errors.push(e.message));
  await p.goto(`${origin}/xiaoya/?garden=${garden}&story=food-water`);await p.locator('[data-primary]').waitFor();
  const build=await p.locator('meta[name="xiaoya-build"]').getAttribute('content');
  if(report.build)assert.equal(build,report.build,'Build changed during QA');else report.build=build;
  return {c,p,requests,errors};
}
async function describe(p){return p.evaluate(()=>qaFx.describe());}
async function idle(p){await p.waitForFunction(()=>!qaFx.isSpeaking());await p.waitForTimeout(90);}
async function screenshot(p,name){const file=path.join(out,`${name}.png`);await p.screenshot({path:file,animations:'allow'});return file;}
async function check(name,f,fn){try{const evidence=await fn();assert.deepEqual(f.errors,[]);assert(f.requests.every(r=>r.method==='GET'&&new URL(r.url).origin===origin),'Only loopback GET');report.checks.push({name,status:'PASS',evidence});console.log('PASS '+name);}catch(error){report.checks.push({name,status:'FAIL',error:error.stack,diagnostic:await describe(f.p),screenshot:await screenshot(f.p,`failure-${report.checks.length+1}`).catch(()=>null)});process.exitCode=1;console.error('FAIL '+name+' '+error.message);}save();}
async function effect(p,kind,trigger,settled,name,{noAudio=false,reduced=false}={}){
  await idle(p);const mark=await p.evaluate(()=>performance.now());await trigger();await settled();
  await p.waitForFunction(mark=>qaFx.particles.some(p=>p.at>=mark&&p.class.includes('xiaoya-fx-particle')),mark,{timeout:2500});
  await p.waitForTimeout(230);const shot=await screenshot(p,name);await p.waitForTimeout(1200);
  const d=await describe(p),tones=d.tones.filter(t=>t.at>=mark),particles=d.particles.filter(t=>t.at>=mark);
  assert(particles.length>0,'Action has real rendered feedback particles');assert(particles.every(p=>p.pointer==='none'),'Feedback never intercepts pointer');
  if(reduced)assert(particles.every(p=>p.animation==='none'),'Reduced motion removes all feedback animation');else assert(particles.some(p=>p.animation!=='none'),'Actual CSS animation is applied');
  if(noAudio)assert.equal(tones.length,0,'No WebAudio gracefully retains visual feedback');else assert(tones.some(t=>t.notes[0]===frequencies[kind]&&t.peak>.0001),`${kind} must render its native nonzero waveform, got ${JSON.stringify(tones.map(t=>({notes:t.notes,peak:t.peak,clock:t.clock})))}`);
  assert(tones.every(t=>!t.waiting&&!t.recording&&!t.assessing&&!t.speech),'No effect starts over narration or microphone');
  return{mark,tones,particles,screenshot:shot};
}
async function enterGarden(p){const mark=await p.evaluate(()=>performance.now());await p.locator('[data-action="garden"]').first().tap();await p.locator('[data-garden-next]').waitFor();await p.waitForFunction(mark=>qaFx.media.some(m=>m.at>=mark&&m.name==='ended'),mark,{timeout:20000});await idle(p);}
(async()=>{
 A=await import(pathToFileURL(path.resolve(__dirname,'../xiaoya/garden.js')));B=await import(pathToFileURL(path.resolve(__dirname,'../xiaoya/garden-meadow.js')));
 browser=await chromium.launch({channel:'msedge',headless:true,args:['--no-proxy-server','--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream','--autoplay-policy=no-user-gesture-required']});
 for(const [width,height] of [[320,640],[390,844],[768,1024]]){const f=await fixture({width,height});try{await check(`Home story card fits ${width} without blank art or scrolling`,f,async()=>{const data=await f.p.locator('.home-story-card').evaluate(async el=>{const picture=el.querySelector('.story-picture'),style=getComputedStyle(picture),url=style.backgroundImage.match(/url\(["']?(.*?)["']?\)/)?.[1];let loaded=!!picture.querySelector('svg');if(url){const image=new Image();loaded=await new Promise(resolve=>{image.onload=()=>resolve(image.naturalWidth>0);image.onerror=()=>resolve(false);image.src=url;});}const r=el.getBoundingClientRect();return{loaded,width:r.width,height:r.height,left:r.left,right:r.right,bottom:r.bottom,viewportWidth:innerWidth,viewportHeight:innerHeight,scrollHeight:document.documentElement.scrollHeight,scrollWidth:document.documentElement.scrollWidth};});assert(data.loaded);assert(data.width>150&&data.height>150);assert(data.left>=0&&data.right<=width+1&&data.bottom<=height+1);assert(data.scrollWidth<=width+1&&data.scrollHeight<=height+1,JSON.stringify(data));return {...data,screenshot:await screenshot(f.p,`home-${width}`)};});}finally{await f.c.close();}}
 {const f=await fixture({funded:true});try{await enterGarden(f.p);
   for(const [kind,action,settled] of [['seed','pack',()=>f.p.locator('.seed-reveal').waitFor()],['plant','plant',()=>f.p.locator('[data-plant]').waitFor()],['water','water',()=>f.p.locator('[data-plant][aria-label*="1次"]').waitFor()],['bloom','water',()=>f.p.locator('.bloom-sparkles').waitFor()]])await check(`A ${kind} has native short sound and actual animation`,f,()=>effect(f.p,kind,()=>f.p.locator(`[data-action="${action}"]`).tap(),settled,`a-${kind}`));
 }finally{await f.c.close();}}
 {const f=await fixture({garden:'b',funded:true,planted:true});try{await enterGarden(f.p);await check('B keyboard and touch tool selection each create one touch response',f,async()=>{const counts=[];for(const mode of ['keyboard','touch']){await idle(f.p);const mark=await f.p.evaluate(()=>performance.now());const tool=f.p.locator('[data-action="meadow-can"]');if(mode==='keyboard'){await tool.focus();await tool.press('Enter');}else await tool.tap();await f.p.waitForTimeout(180);const d=await describe(f.p),rings=d.particles.filter(p=>p.at>=mark&&p.class.includes('xiaoya-fx-ring'));counts.push({mode,rings:rings.length});}assert.deepEqual(counts.map(x=>x.rings),[1,1]);return counts;});}finally{await f.c.close();}}
 {const f=await fixture({gumDelay:700});try{await f.p.locator('[data-action="next-event"]').tap();await f.p.locator('[data-action="story-continue"]:enabled').waitFor({timeout:35000});
  await check('Waiting, native recording and controlled recognition remain sound-free',f,async()=>{const mark=await f.p.evaluate(()=>performance.now());await f.p.locator('[data-action="story-continue"]').tap();await f.p.locator('.is-mic-starting').waitFor();const waiting=await screenshot(f.p,'mic-waiting');await f.p.locator('.recording-indicator').waitFor({timeout:20000});const ready=await screenshot(f.p,'mic-ready');await f.p.waitForTimeout(1400);await f.p.locator('[data-action="record"]').tap();await f.p.locator('[data-status="assessing"]').waitFor({timeout:20000});await f.p.waitForTimeout(350);const d=await describe(f.p);assert.equal(d.tones.filter(t=>t.at>=mark).length,0,'No tone during request, capture or recognition');assert(d.records.length===1&&d.records[0].startedAt&&d.records[0].stoppedAt&&d.records[0].bytes>0);assert(d.tracks.every(t=>t==='ended'));assert(d.particles.some(p=>p.at>=mark),'Ready has a visual response');await f.p.evaluate(()=>qaFx.finishASR());await f.p.locator('[data-action="finish"]').waitFor();return{records:d.records,tracks:d.tracks,waiting,ready};});
  if(await f.p.locator('[data-action="finish"]').count())await check('Completed story reward has native short sound and flying tokens',f,()=>effect(f.p,'reward',()=>f.p.locator('[data-action="finish"]').tap(),()=>f.p.locator('.reward-treasure').waitFor(),'reward'));
 }finally{await f.c.close();}}
 for(const mode of ['reduced','noWebAudio']){const f=await fixture({funded:true,reduced:mode==='reduced',noAudio:mode==='noWebAudio'});try{await enterGarden(f.p);await check(`${mode} preserves seed purchase and useful visual response`,f,()=>effect(f.p,'seed',()=>f.p.locator('[data-action="pack"]').tap(),()=>f.p.locator('.seed-reveal').waitFor(),mode,{reduced:mode==='reduced',noAudio:mode==='noWebAudio'}));}finally{await f.c.close();}}
})().catch(error=>{report.error=error.stack;console.error(error);process.exitCode=1;}).finally(async()=>{await browser?.close();save();console.log(`${report.checks.filter(c=>c.status==='PASS').length}/${report.checks.length} passed; build ${report.build}; ${out}`);});
