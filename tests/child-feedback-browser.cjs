/* Real touch/MediaRecorder/WebAudio integration with mocked ASR results.
 * These checks do not measure pronunciation accuracy or validate a physical iPad. */
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'C:/Users/Jam/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const {pathToFileURL}=require('node:url');
const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs');
const root=path.resolve(__dirname,'..'),origin=process.env.TEST_URL||'http://127.0.0.1:24736';
const out=path.join(root,'test-results/child-feedback'),key='english-sprout-state-v1',today='2026-10-13';
const curriculum=JSON.parse(fs.readFileSync(path.join(root,'public/data/curriculum.json'),'utf8'));
fs.mkdirSync(out,{recursive:true});
const asr=`export async function prepareSpeech(){};
export async function assessRecording(url){window.qaBlob=typeof url==='string'&&url.startsWith('blob:');
 if(window.qaAssessment==='pending')return new Promise(resolve=>{window.qaResolve=()=>resolve({matched:true,stars:3});});
 if(window.qaAssessment==='error')throw new Error('Model unavailable fixture');
 return window.qaAssessment==='miss'?{matched:false,stars:1}:{matched:true,stars:3};}`;
function instrument(){
 window.qaAudio=[],window.qaCapture=false;
 const contexts=[window.AudioContext,window.webkitAudioContext].filter((v,i,a)=>v&&a.indexOf(v)===i);
 for(const Context of contexts){
  const resume=Context.prototype.resume;
  Context.prototype.resume=function(){window.qaAudio.push({type:'resume',capture:window.qaCapture});return resume.apply(this,arguments);};
  const create=Context.prototype.createOscillator;
  Context.prototype.createOscillator=function(){
   const osc=create.apply(this,arguments),context=this,start=osc.start,stop=osc.stop;
   osc.start=function(at){window.qaAudio.push({type:'start',capture:window.qaCapture,time:context.currentTime,at});return start.apply(this,arguments);};
   osc.stop=function(at){window.qaAudio.push({type:'stop',capture:window.qaCapture,time:context.currentTime,at});return stop.apply(this,arguments);};
   return osc;
  };
 }
 const get=navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
 navigator.mediaDevices.getUserMedia=async constraints=>{
  const stream=await get(constraints),tracks=stream.getTracks();
  for(const track of tracks){const stop=track.stop.bind(track);track.stop=()=>{stop();window.qaCapture=tracks.some(t=>t.readyState==='live');};}
  return stream;
 };
 const start=MediaRecorder.prototype.start;
 MediaRecorder.prototype.start=function(){window.qaCapture=true;return start.apply(this,arguments);};
}
(async()=>{
 const learning=await import(pathToFileURL(path.join(root,'src/learning.js')));
 const empty=learning.createState(today);
 const learned=learning.recordResult(learning.createState('2026-10-12'),'hello-01','good','2026-10-12',{isNew:true});
 const browser=await chromium.launch({channel:'msedge',headless:true,args:['--no-proxy-server','--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream']});
 const checks=[],contexts=[];
 function pass(name){checks.push({name,status:'PASS'});console.log('PASS '+name);}
 async function setup(initial=empty,viewport={width:390,height:844},options={}){
  for(const prior of contexts)if(prior.pages().length){for(const page of prior.pages()){assert.deepEqual(page.qaErrors,[]);assert.deepEqual(page.qaRequests,[]);}await prior.close();}
  const context=await browser.newContext({hasTouch:true,serviceWorkers:'block',permissions:['microphone'],viewport,timezoneId:'Asia/Shanghai',reducedMotion:options.reduced?'reduce':'no-preference'});contexts.push(context);
  await context.addInitScript(({key,initial})=>{if(!localStorage.getItem(key))localStorage.setItem(key,JSON.stringify(initial));},{key,initial});
  await context.addInitScript(instrument);
  if(options.noAudio)await context.addInitScript(()=>{window.AudioContext=undefined;window.webkitAudioContext=undefined;});
  const page=await context.newPage();page.setDefaultTimeout(12000);page.qaErrors=[];page.qaRequests=[];
  page.on('pageerror',e=>page.qaErrors.push(e.message));page.on('request',r=>{if(!['GET','HEAD'].includes(r.method())||(!r.url().startsWith(origin)&&!r.url().startsWith('blob:')&&!r.url().startsWith('data:')))page.qaRequests.push({method:r.method(),url:r.url()});});
  await page.clock.setFixedTime(new Date(today+'T10:00:00+08:00'));
  await page.route('**/src/speech-local.js',r=>r.fulfill({contentType:'text/javascript',body:asr}));
  await page.goto(origin+'/#home');await page.locator('#hero-start').waitFor();
  return page;
 }
 const audio=p=>p.evaluate(()=>window.qaAudio);
 async function choose(p,{wrong=false}={}){
  const id=await p.locator('[data-lesson-id]').getAttribute('data-lesson-id'),lesson=curriculum.lessons.find(l=>l.id===id);
  if(wrong){const before=await audio(p);await p.locator(`[data-choice="${(lesson.answerIndex+1)%lesson.choices.length}"]`).click();assert.match(await p.locator('#quiz-feedback').innerText(),/再听|再试|慢慢|找/);assert.equal(await p.locator('.speech-stars').count(),0);assert.equal(await p.locator('#quiz-next').isVisible(),false);assert.ok((await audio(p)).length>=before.length);}
  const before=(await audio(p)).filter(e=>e.type==='start').length;
  await p.locator(`[data-choice="${lesson.answerIndex}"]`).click();
  assert.match(await p.locator('#quiz-feedback').innerText(),/对|棒|听懂/);
  if(await p.evaluate(()=>!!window.AudioContext))assert.ok((await audio(p)).filter(e=>e.type==='start').length>before,'Correct meaning choice produces a positive cue after user gesture');
  await p.locator('#quiz-next').click();
 }
 async function speak(p,kind='new'){
  if(kind==='garden'){await p.locator('[data-home-speech]').click();await p.locator('[data-step="speak"]').click();}
  else{await p.locator('#hero-start').click();if(kind==='new'){await p.locator('[data-step="choose"]').click();await choose(p);}else{await p.locator('[data-step="speak"]').click();await p.locator('#reveal').click();}}
  await p.locator('#record').waitFor();
 }
 async function record(p,{edge=false}={}){
  const box=await p.locator('#record').boundingBox();
  // Tap inside the visible left edge; a rounded corner is outside its painted target.
  if(edge)await p.touchscreen.tap(box.x+7,box.y+box.height/2);else await p.locator('#record').tap();
  try{await p.waitForFunction(()=>document.querySelector('#record')?.textContent.includes('停止录音'));}catch(error){fs.writeFileSync(path.join(out,'record-start-failure.json'),JSON.stringify({viewport:p.viewportSize(),body:await p.locator('body').innerText(),errors:p.qaErrors},null,2));throw error;}
  const during=(await audio(p)).filter(e=>e.type==='start').length;
  await p.waitForTimeout(4000);
  assert.equal((await audio(p)).filter(e=>e.type==='start').length,during,'Feedback sound remains silent during microphone capture');
  await p.locator('#record').tap();
  try{await p.waitForFunction(()=>window.qaBlob===true);}catch(error){fs.writeFileSync(path.join(out,'record-failure.json'),JSON.stringify({viewport:p.viewportSize(),url:p.url(),body:await p.locator('body').innerText(),audio:await audio(p),errors:p.qaErrors},null,2));await p.screenshot({path:path.join(out,'record-failure.png')});throw error;}
 }
 async function geometry(p,label){
  const g=await p.evaluate(()=>{const r=document.querySelector('#record'),replay=document.querySelector('#replay-record'),body=document.querySelector('.record-box'),cta=document.querySelector('[data-speech-next]:not([hidden]),[data-garden-claim]:not([hidden])');return {record:r.getBoundingClientRect().toJSON(),replay:replay.getBoundingClientRect().toJSON(),body:body.getBoundingClientRect().toJSON(),cta:cta?.getBoundingClientRect().toJSON(),scroll:document.documentElement.scrollHeight,height:innerHeight,width:innerWidth};});
  assert.ok(g.record.height>=72,`${label}: record target at least 72 px: ${JSON.stringify(g)}`);
  assert.ok(g.record.width>=g.body.width-5,`${label}: record target fills speaking panel`);
  assert.ok(g.replay.height>=44,`${label}: secondary replay retains 44 px tap target`);
  assert.ok(g.scroll<=g.height+2,`${label}: single screen`);
  for(const [name,box]of Object.entries(g).filter(([name])=>['record','replay','cta'].includes(name)))if(box){assert.ok(box.top>=-1&&box.bottom<=g.height+1&&box.left>=-1&&box.right<=g.width+1,`${label}: ${name} on screen`);}
  if(g.cta)assert.ok(g.cta.height<=g.record.height,`${label}: continue does not dominate microphone`);
  return g;
 }
 async function matched(p){await p.locator('.speech-stars').waitFor();await p.waitForFunction(()=>document.querySelector('[data-speech-next]')?.hidden===false||document.querySelector('[data-garden-claim]')?.hidden===false);assert.equal(await p.locator('.speech-stars').textContent(),'★★★');assert.match(await p.locator('[data-speech-result]').innerText(),/棒|点亮|清楚|成功|说对/);assert.ok(!(await audio(p)).some(e=>e.type==='start'&&e.capture),'No feedback oscillator starts while recording stream is live');assert.equal(await p.locator('.child-celebration[data-child-feedback="stars"]').count(),1);assert.equal(await p.locator('.child-star').count(),3);assert.equal(await p.locator('.child-celebration').evaluate(e=>getComputedStyle(e).pointerEvents),'none');}
 try{
  for(const viewport of [{width:320,height:568},{width:390,height:844},{width:768,height:1024}]){
   for(const kind of ['new','review','garden']){
    const p=await setup(kind==='new'?empty:learned,viewport);
    assert.equal((await audio(p)).filter(e=>e.type==='start').length,0,'Homepage opens without sound');
    await speak(p,kind);await geometry(p,`${kind} ready ${viewport.width}`);
    const before=(await audio(p)).filter(e=>e.type==='start').length;
    await record(p,{edge:true});await matched(p);await geometry(p,`${kind} matched ${viewport.width}`);
    assert.ok((await audio(p)).filter(e=>e.type==='start').length>before,'Matched ASR produces celebratory sound');
    await p.screenshot({path:path.join(out,`${kind}-${viewport.width}.png`)});
    pass(`Large edge-tappable microphone, clear success and compact continuation: ${kind} at ${viewport.width} px`);
   }
  }
  const choices=await setup();await choices.locator('#hero-start').click();await choices.locator('[data-step="choose"]').click();await choose(choices,{wrong:true});pass('Meaning choices distinguish gentle retry from correct celebration');
  await choices.evaluate(()=>window.qaAssessment='miss');const before=(await audio(choices)).filter(e=>e.type==='start').length;await record(choices);await choices.locator('.speech-stars').waitFor();assert.notEqual(await choices.locator('.speech-stars').textContent(),'★★★');assert.equal(await choices.locator('[data-speech-next]').isVisible(),false);await choices.waitForTimeout(1500);assert.equal((await audio(choices)).filter(e=>e.type==='start').length,before,'Unmatched speech has no success fanfare');await geometry(choices,'retry 390');pass('Unmatched retries never award three stars or success fanfare');
  const hidden=await setup();await speak(hidden);await record(hidden);await matched(hidden);const stopBefore=(await audio(hidden)).filter(e=>e.type==='stop'&&e.at===undefined).length;await hidden.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});document.dispatchEvent(new Event('visibilitychange'));});assert.equal(await hidden.locator('.child-celebration').count(),0);assert.ok((await audio(hidden)).filter(e=>e.type==='stop'&&e.at===undefined).length>stopBefore,'Hiding page cancels in-flight cue oscillators immediately');pass('Hidden-page cleanup removes celebration and immediately stops its sound');
  const playback=await setup();await speak(playback);await record(playback);await matched(playback);await playback.locator('#replay-record').tap();assert.equal(await playback.locator('.child-celebration').count(),0);pass('Replaying child recording clears the success cue without blocking replay');
  const reduced=await setup(empty,{width:320,height:568},{reduced:true});await speak(reduced);await record(reduced);await matched(reduced);const animations=await reduced.locator('.child-star,.child-celebration-icon,[data-speech-result]').evaluateAll(nodes=>nodes.map(n=>({animation:getComputedStyle(n).animationName,duration:getComputedStyle(n).animationDuration})));assert.ok(animations.every(a=>a.animation==='none'||a.duration==='0s'||a.duration==='0.001s'),'Reduced motion suppresses star/card animation');await geometry(reduced,'reduced motion 320');pass('Reduced-motion success remains visible, on-screen and interactive');
  const unavailable=await setup(empty,{width:390,height:844},{noAudio:true});await speak(unavailable);await record(unavailable);await matched(unavailable);assert.equal((await audio(unavailable)).filter(e=>e.type==='start').length,0);await geometry(unavailable,'without WebAudio');pass('Unavailable WebAudio preserves visible success and navigation');
  for(const context of contexts)for(const p of context.pages()){assert.deepEqual(p.qaErrors,[]);assert.deepEqual(p.qaRequests,[]);}
  pass('Feedback adds no uploads, third-party requests or uncaught errors');
  fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({testScope:'Real Edge touch, MediaRecorder and WebAudio; ASR outcomes mocked; no physical iPad or pronunciation accuracy claim',checks},null,2));console.log(JSON.stringify({passed:checks.length}));
 }finally{for(const context of contexts)await context.close();await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
