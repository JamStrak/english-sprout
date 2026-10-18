// Isolated Edge QA: native WebAudio and MediaRecorder with a virtual microphone.
// ASR transcripts are controlled; no model download, user profile, or child data.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'C:/Users/Jam/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const origin=new URL(process.env.TEST_URL||'http://127.0.0.1:24756').origin;
assert(['127.0.0.1','localhost','[::1]'].includes(new URL(origin).hostname),'Only loopback QA');
const label=process.env.TEST_LABEL||'final';
assert(/^[a-z0-9-]+$/i.test(label),'Invalid TEST_LABEL');
const out=path.resolve(__dirname,'../test-results/xiaoya-three-stars',label);
fs.mkdirSync(out,{recursive:true});
const report={origin,label,realWebAudio:true,webAudioScope:'Native oscillator lifecycle and nonzero AnalyserNode waveform before destination; no physical speaker measurement.',realMediaRecorder:true,syntheticDevice:true,asrControlled:true,visibilityEventControlled:true,realDeviceValidated:false,checks:[]};
let browser;
function save(){fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(report,null,2));}
async function fixture({heard='I need water',noAudio=false}={}){
  const c=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,permissions:['microphone'],serviceWorkers:'block'});
  const requests=[],errors=[];
  c.on('request',r=>requests.push({url:r.url(),method:r.method()}));
  await c.route('**/*',r=>new URL(r.request().url()).origin===origin?r.continue():r.abort('blockedbyclient'));
  await c.route(/\/releases\/[^/]+\/speech-local\.js$/,r=>r.fulfill({contentType:'text/javascript',body:`export async function prepareSpeech(){return {ready:true,engine:'controlled-three-stars-test'};} export async function assessRecording(){window.qaStars.asrStarted=performance.now();await new Promise(resolve=>window.qaStars.finishASR=resolve);return {heard:${JSON.stringify(heard)},engine:'controlled-three-stars-test'};} export function disposeSpeechAssessment(){}` }));
  await c.addInitScript(({origin,noAudio})=>{
    if(location.origin!==origin)return;
    localStorage.setItem('xiaoya-english:preferences:v1',JSON.stringify({mic:true}));
    const now=()=>performance.now(),q=window.qaStars={tones:[],media:[],records:[],activeMedia:new Set()};
    q.isSpeaking=()=>[...q.activeMedia].some(audio=>!audio.paused&&!audio.ended&&audio.readyState>=2);
    const quiet=()=>({waiting:!!document.querySelector('.is-mic-starting'),recording:!!document.querySelector('.recording-indicator'),assessing:['assessing','preparing'].includes(document.querySelector('[data-assessment]')?.dataset.status),speech:q.isSpeaking()});
    const NativeAudio=window.Audio,NativeContext=window.AudioContext,NativeRecorder=window.MediaRecorder;
    window.Audio=function(...args){const audio=new NativeAudio(...args),url=String(args[0]);for(const name of ['playing','ended','pause'])audio.addEventListener(name,()=>{if(name==='playing')q.activeMedia.add(audio);else q.activeMedia.delete(audio);q.media.push({name,url,at:now()});});return audio;};window.Audio.prototype=NativeAudio.prototype;
    if(noAudio){window.AudioContext=undefined;window.webkitAudioContext=undefined;}
    else if(NativeContext)window.AudioContext=class extends NativeContext{
      createOscillator(){const oscillator=super.createOscillator(),entry={notes:[],peak:0};this.latestTone=entry;const set=oscillator.frequency.setValueAtTime.bind(oscillator.frequency);oscillator.frequency.setValueAtTime=(value,time)=>{entry.notes.push(value);return set(value,time);};const start=oscillator.start.bind(oscillator),stop=oscillator.stop.bind(oscillator);oscillator.start=(time)=>{Object.assign(entry,{at:now(),clock:this.currentTime,...quiet()});q.tones.push(entry);return start(time);};oscillator.stop=(time)=>{entry.stops??=[];entry.stops.push({at:now(),when:time??null,currentTime:this.currentTime});return stop(time);};oscillator.addEventListener('ended',()=>entry.endedAt=now());return oscillator;}
      createGain(){const gain=super.createGain(),entry=this.latestTone;if(!entry)return gain;const analyser=super.createAnalyser(),values=new Float32Array(256);analyser.fftSize=values.length;const connect=gain.connect.bind(gain);gain.connect=(target,...rest)=>{if(target!==this.destination)return connect(target,...rest);connect(analyser);return analyser.connect(target,...rest);};const timer=setInterval(()=>{analyser.getFloatTimeDomainData(values);entry.peak=Math.max(entry.peak,...values.map(Math.abs));},5);setTimeout(()=>clearInterval(timer),1500);return gain;}
    };
    window.MediaRecorder=class extends NativeRecorder{constructor(...args){super(...args);const entry={bytes:0};q.records.push(entry);this.addEventListener('start',()=>entry.startedAt=now());this.addEventListener('stop',()=>entry.stoppedAt=now());this.addEventListener('dataavailable',e=>entry.bytes+=e.data.size);}};
    q.describe=()=>({tones:q.tones,media:q.media,records:q.records,asrStarted:q.asrStarted});
  },{origin,noAudio});
  const p=await c.newPage();p.setDefaultTimeout(12000);p.on('pageerror',error=>errors.push(error.message));
  await p.goto(`${origin}/xiaoya/?garden=b&story=food-water`);await p.locator('[data-primary]').waitFor();
  const build=await p.locator('meta[name="xiaoya-build"]').getAttribute('content');
  if(report.build)assert.equal(build,report.build,'Build changed during QA');else report.build=build;
  return {c,p,requests,errors};
}
async function describe(p){return p.evaluate(()=>qaStars.describe());}
async function screenshot(p,name){const file=path.join(out,`${name}.png`);await p.screenshot({path:file});return file;}
async function check(name,options,fn){const f=await fixture(options);try{const evidence=await fn(f.p);assert.deepEqual(f.errors,[]);assert(f.requests.every(r=>r.method==='GET'&&new URL(r.url).origin===origin),'Only loopback GET');report.checks.push({name,status:'PASS',evidence});console.log('PASS '+name);}catch(error){report.checks.push({name,status:'FAIL',error:error.stack,diagnostic:await describe(f.p),screenshot:await screenshot(f.p,`failure-${report.checks.length+1}`).catch(()=>null)});process.exitCode=1;console.error('FAIL '+name+' '+error.message);}finally{await f.c.close();save();}}
async function startAssessment(p){
  await p.locator('[data-action="next-event"]').tap();
  await p.locator('[data-action="story-continue"]:enabled').waitFor({timeout:35000});
  await p.locator('[data-action="story-continue"]').tap();
  await p.locator('.recording-indicator').waitFor({timeout:20000});
  await p.waitForTimeout(1400);await p.locator('[data-action="record"]').tap();
  await p.waitForFunction(()=>!!qaStars.finishASR,{},{timeout:20000});
  const d=await describe(p);assert.equal(d.records.length,1);assert(d.records[0].bytes>0&&d.records[0].startedAt&&d.records[0].stoppedAt,'Actual recording completed');
  assert(d.tones.every(t=>!t.waiting&&!t.recording&&!t.assessing&&!t.speech),'Capture and narration remain effect-free');
}
async function resolve(p,stars=3){const mark=await p.evaluate(()=>{const mark=performance.now();qaStars.finishASR();return mark;});await p.locator(`[data-assessment][data-stars="${stars}"]`).waitFor();return mark;}
const celebrations=(d,mark=0)=>d.tones.filter(t=>t.at>=mark&&JSON.stringify(t.notes)==='[784,988,1319]');
const praises=(d,mark=0)=>d.media.filter(m=>m.at>=mark&&m.name==='playing'&&/garden-speech-pass\.mp3/.test(m.url));
async function waitCelebration(p,mark){await p.waitForFunction(mark=>qaStars.tones.some(t=>t.at>=mark&&t.notes[0]===784),mark);}
(async()=>{
  browser=await chromium.launch({channel:'msedge',headless:true,args:['--no-proxy-server','--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream','--autoplay-policy=no-user-gesture-required']});
  await check('Three stars produce one audible rising chime before praise; replaying praise does not repeat it',{},async p=>{
    await startAssessment(p);const mark=await resolve(p);await waitCelebration(p,mark);
    await p.waitForFunction(mark=>qaStars.media.some(m=>m.at>=mark&&m.name==='playing'&&/garden-speech-pass\.mp3/.test(m.url)),mark);
    const d=await describe(p),tones=celebrations(d,mark),voice=praises(d,mark);assert.equal(tones.length,1);assert.equal(voice.length,1);assert(tones[0].peak>.0001,'Native nonzero waveform');assert(tones[0].endedAt<=voice[0].at,'Chime completes before praise starts');assert(voice[0].at-mark>=700,'Praise leaves room for the chime');assert(!tones[0].waiting&&!tones[0].recording&&!tones[0].assessing&&!tones[0].speech);
    const shot=await screenshot(p,'three-stars');await p.waitForFunction(()=>!qaStars.isSpeaking());const replayAt=await p.evaluate(()=>performance.now());await p.locator('[data-action="assessment-voice"]').tap();await p.waitForFunction(mark=>qaStars.media.some(m=>m.at>=mark&&m.name==='playing'&&/garden-speech-pass\.mp3/.test(m.url)),replayAt);await p.waitForTimeout(850);const after=await describe(p);assert.equal(celebrations(after,mark).length,1,'One celebration per assessment');return {tones,voice,replayVoice:praises(after,replayAt),screenshot:shot};
  });
  for(const [stars,heard] of [[2,'need water'],[1,'apple']])await check(`${stars}-star feedback does not play the three-star celebration`,{heard},async p=>{await startAssessment(p);const mark=await resolve(p,stars);await p.waitForTimeout(1200);const d=await describe(p);assert.equal(celebrations(d,mark).length,0);assert(d.media.some(m=>m.at>=mark&&m.name==='playing'&&/garden-speech-(partial|retry)\.mp3/.test(m.url)));return {stars,tones:d.tones.filter(t=>t.at>=mark),media:d.media.filter(m=>m.at>=mark)};});
  for(const action of ['home','finish'])await check(`Immediate ${action} cancels the chime and pending old praise`,{},async p=>{await startAssessment(p);const mark=await resolve(p);await waitCelebration(p,mark);const actionAt=await p.evaluate(()=>performance.now());await p.locator(`[data-action="${action}"]`).tap();await p.waitForTimeout(1300);const d=await describe(p),tones=celebrations(d,mark);assert.equal(tones.length,1);assert(tones[0].endedAt<=actionAt+250,'Action promptly cancels ongoing chime');assert.equal(praises(d,mark).length,0,'Old assessment praise never resumes');await p.locator(action==='home'?'.home-view':'.reward-treasure').waitFor();return {actionAt,tones,media:d.media.filter(m=>m.at>=mark)};});
  await check('Visibility suspension cancels pending praise without replay on resume',{},async p=>{await startAssessment(p);const mark=await resolve(p);await waitCelebration(p,mark);const hiddenAt=await p.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});document.dispatchEvent(new Event('visibilitychange'));return performance.now();});await p.waitForTimeout(950);await p.evaluate(()=>{delete document.hidden;document.dispatchEvent(new Event('visibilitychange'));});await p.waitForTimeout(950);const d=await describe(p),tones=celebrations(d,mark);assert.equal(tones.length,1);assert(tones[0].endedAt<=hiddenAt+200);assert.equal(praises(d,mark).length,0);return {hiddenAt,tones,media:d.media.filter(m=>m.at>=mark)};});
  await check('No WebAudio still shows three stars, speaks praise and allows reward collection',{noAudio:true},async p=>{await startAssessment(p);const mark=await resolve(p);await p.waitForFunction(mark=>qaStars.media.some(m=>m.at>=mark&&m.name==='playing'&&/garden-speech-pass\.mp3/.test(m.url)),mark);const d=await describe(p);assert.equal(d.tones.length,0);assert.equal(praises(d,mark).length,1);await p.locator('[data-action="finish"]').tap();await p.locator('.reward-treasure').waitFor();return {tones:d.tones,praise:praises(d,mark)};});
})().catch(error=>{report.error=error.stack;console.error(error);process.exitCode=1;}).finally(async()=>{await browser?.close();save();console.log(`${report.checks.filter(c=>c.status==='PASS').length}/${report.checks.length} passed; build ${report.build}; ${out}`);});
