/* Real MediaRecorder -> actual local Vosk -> normal daily meaning/recall/reward path.
   Known course audio is supplied to Edge's synthetic microphone; this is not a child pronunciation accuracy test. */
const {chromium}=require('C:/Users/Jam/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const {execFileSync}=require('node:child_process');
const {pathToFileURL}=require('node:url');
const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs');
const root=path.resolve(__dirname,'..'),out=path.join(root,'test-results/main-real-speech');
const origin=process.env.TEST_URL||'http://127.0.0.1:24736',key='english-sprout-state-v1',today='2026-10-13';
const curriculum=JSON.parse(fs.readFileSync(path.join(root,'public/data/curriculum.json'),'utf8'));
fs.mkdirSync(out,{recursive:true});
const wav=path.join(out,'known-microphone-input.wav');
execFileSync('ffmpeg',['-hide_banner','-loglevel','error','-y','-i',path.join(root,'public/audio/hello-01.mp3'),'-af','adelay=2000,apad=pad_dur=10','-ar','48000','-ac','1','-t','12',wav]);
(async()=>{
  const learning=await import(pathToFileURL(path.join(root,'src/learning.js')));
  const garden=await import(pathToFileURL(path.join(root,'src/garden.js')));
  const initial=learning.createState(today),checks=[];
  const browser=await chromium.launch({channel:'msedge',headless:true,args:['--no-proxy-server','--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream',`--use-file-for-fake-audio-capture=${wav}`]});
  const context=await browser.newContext({permissions:['microphone'],viewport:{width:390,height:844},timezoneId:'Asia/Shanghai'});
  const page=await context.newPage();page.setDefaultTimeout(65000);
  const errors=[],uploads=[],external=[];
  page.on('pageerror',error=>errors.push(error.message));
  context.on('request',request=>{
    if(!['GET','HEAD'].includes(request.method()))uploads.push({url:request.url(),method:request.method()});
    if(!request.url().startsWith(origin)&&!request.url().startsWith('blob:')&&!request.url().startsWith('data:'))external.push(request.url());
  });
  const pass=name=>{checks.push({name,status:'PASS'});console.log('PASS '+name);};
  try{
    await page.clock.setFixedTime(new Date(today+'T10:00:00+08:00'));
    await context.addInitScript(({key,initial})=>{if(!localStorage.getItem(key))localStorage.setItem(key,JSON.stringify(initial));},{key,initial});
    await page.goto(origin+'/#home');await page.locator('#hero-start').waitFor();
    assert.equal(await page.locator('.focus-home').getAttribute('data-next-kind'),'learn');
    await page.evaluate(()=>navigator.serviceWorker.ready);await page.waitForFunction(()=>!!navigator.serviceWorker.controller);
    await page.locator('#hero-start').click();
    assert.equal(await page.locator('[data-lesson-id]').getAttribute('data-lesson-id'),'hello-01');
    await page.evaluate(()=>import('./src/speech-local.js').then(speech=>speech.prepareSpeech()));
    await page.locator('[data-step="choose"]').click();
    const lesson=curriculum.lessons.find(item=>item.id==='hello-01');
    await page.locator(`[data-choice="${lesson.answerIndex}"]`).click();await page.locator('#quiz-next').click();
    assert.match(await page.locator('#record').innerText(),/跟读评星/);
    await page.locator('#record').click();await page.waitForFunction(()=>document.querySelector('#record').textContent.includes('停止录音'));
    await page.waitForTimeout(6500);await page.locator('#record').click();
    await page.locator('[data-speech-next]:visible').waitFor();
    assert.equal(await page.locator('.speech-stars').textContent(),'★★★');
    assert.match(await page.locator('[data-speech-result]').innerText(),/你说出来/);
    await page.screenshot({path:path.join(out,'real-main-stars.png')});
    pass('Real MediaRecorder capture is assessed by actual local Vosk and receives three matching stars in the normal daily path');
    await page.locator('[data-speech-next]').evaluate(button=>{button.click();button.click();});
    await page.locator('.completion').waitFor();
    const saved=await page.evaluate(k=>JSON.parse(localStorage.getItem(k)),key);
    assert.equal(saved.days[today].results.length,1);
    assert.deepEqual(saved.days[today].results[0],{lessonId:'hello-01',rating:'good',isNew:true,meaning:true});
    assert.equal(saved.cards['hello-01'].due,learning.addDays(today,1));
    const practice=saved.garden.actions.filter(action=>action.type==='practice');
    assert.equal(practice.length,1);assert.equal(practice[0].assessment,'local-speech');
    const rewarded=garden.getGarden(saved,today);
    assert.equal(rewarded.earned.practicePasses,1);assert.equal(rewarded.inventory.water,4);
    assert.doesNotMatch(JSON.stringify(saved),/heard|transcript|blob:|base64/);
    pass('Correct meaning plus recorded word match commits one tomorrow review and exactly one water reward, without recording/transcript storage');
    await page.reload();await page.locator('#hero-start').waitFor();
    assert.deepEqual(await page.evaluate(k=>JSON.parse(localStorage.getItem(k)),key),saved);
    pass('Reload preserves the completed normal-flow assessment and reward without replaying it');
    // A new page in the same browser starts the local model offline after shell/module loading.
    const offline=await context.newPage();await offline.goto(origin+'/#home');
    await offline.evaluate(()=>import('./src/speech-local.js').then(speech=>window.localSpeech=speech));
    await context.setOffline(true);
    assert.equal(await offline.evaluate(async()=>{await window.localSpeech.prepareSpeech();window.localSpeech.disposeSpeechAssessment();return true;}),true);
    pass('Previously downloaded model prepares in a cold page while offline');
    assert.deepEqual(errors,[]);assert.deepEqual(uploads,[]);assert.deepEqual(external,[]);
    pass('No POST, external requests or uncaught errors were observed in the real recording/model chain');
    const report={checks,syntheticMicrophone:true,actualLocalModel:true,childSpeechValidated:false,offlineColdPrepare:true};
    fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({passed:checks.length}));
  }finally{await context.close();await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
