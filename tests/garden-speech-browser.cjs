/* Real MediaRecorder -> local ASR -> reward integration with a known synthetic mic input. */
const {chromium}=require('C:/Users/Jam/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const {execFileSync}=require('node:child_process');
const {pathToFileURL}=require('node:url');
const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs');
const root=path.resolve(__dirname,'..'),out=path.join(root,'test-results/garden-speech');
const origin=process.env.TEST_URL||'http://127.0.0.1:24736',key='english-sprout-state-v1';
fs.mkdirSync(out,{recursive:true});
const wav=path.join(out,'known-microphone-input.wav');
execFileSync('ffmpeg',['-hide_banner','-loglevel','error','-y','-i',path.join(root,'public/audio/hello-01.mp3'),'-af','adelay=2000,apad=pad_dur=10','-ar','48000','-ac','1','-t','12',wav]);
(async()=>{
  const learning=await import(pathToFileURL(path.join(root,'src/learning.js'))),garden=await import(pathToFileURL(path.join(root,'src/garden.js')));
  let initial=learning.recordResult(learning.createState('2026-10-12'),'hello-01','good','2026-10-12',{isNew:true});
  const browser=await chromium.launch({channel:'msedge',headless:true,args:['--no-proxy-server','--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream',`--use-file-for-fake-audio-capture=${wav}`]});
  const checks=[];
  const context=await browser.newContext({permissions:['microphone'],viewport:{width:390,height:844},timezoneId:'Asia/Shanghai'});
  const page=await context.newPage();page.setDefaultTimeout(65000);
  const errors=[],uploads=[];page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(!['GET','HEAD'].includes(r.method()))uploads.push({url:r.url(),method:r.method()});});
  try{
    await page.clock.setFixedTime(new Date('2026-10-12T10:00:00+08:00'));
    await context.addInitScript(({key,initial})=>{if(!localStorage.getItem(key))localStorage.setItem(key,JSON.stringify(initial));},{key,initial});
    await page.goto(origin+'/#garden');await page.evaluate(()=>navigator.serviceWorker.ready);await page.waitForFunction(()=>!!navigator.serviceWorker.controller);await page.locator('[data-garden-practice]').click();
    await page.evaluate(()=>import('./src/speech-local.js').then(m=>m.prepareSpeech()));
    await page.locator('[data-step="speak"]').click();await page.locator('#record').click();
    await page.waitForFunction(()=>document.querySelector('#record').textContent.includes('停止录音'));
    await page.waitForTimeout(6500);await page.locator('#record').click();
    await page.locator('[data-garden-claim]:visible').waitFor();
    assert.match(await page.locator('[data-speech-result]').innerText(),/这句听清/);
    assert.equal(await page.locator('.speech-stars').textContent(),'★★★');
    await page.screenshot({path:path.join(out,'automatic-match.png')});
    await page.locator('[data-garden-claim]').evaluate(b=>{b.click();b.click();});
    await page.locator('.garden-play').waitFor();
    const saved=await page.evaluate(k=>JSON.parse(localStorage.getItem(k)),key);
    assert.equal(saved.garden.actions.length,1);assert.equal(saved.garden.actions[0].assessment,'local-speech');
    assert.deepEqual(saved.cards,initial.cards);assert.deepEqual(saved.days,initial.days);
    assert.equal(garden.getGarden(saved,'2026-10-12').inventory.water,4);
    assert.doesNotMatch(JSON.stringify(saved),/heard|transcript|blob:|base64/);
    checks.push({name:'Real recorded reference speech automatically earns three matching stars and exactly one reward',status:'PASS'});
    await page.reload();await page.locator('.garden-play').waitFor();assert.deepEqual(await page.evaluate(k=>JSON.parse(localStorage.getItem(k)),key),saved);
    checks.push({name:'Reward reload keeps learning schedule and stores neither recording nor transcript',status:'PASS'});

    // Resolve an assessment after the child has left the page; a stale result cannot award.
    const pendingContext=await browser.newContext({serviceWorkers:'block',permissions:['microphone'],timezoneId:'Asia/Shanghai'});
    const pendingPage=await pendingContext.newPage();await pendingPage.clock.setFixedTime(new Date('2026-10-12T10:00:00+08:00'));
    await pendingPage.route('**/src/speech-local.js',r=>r.fulfill({contentType:'text/javascript',body:'export async function prepareSpeech(){};export function assessRecording(){window.startedAssessment=true;return new Promise(resolve=>window.finishAssessment=()=>resolve({matched:true,stars:3,coverage:1}));}'}));
    await pendingContext.addInitScript(({key,initial})=>{localStorage.setItem(key,JSON.stringify(initial));},{key,initial});
    await pendingPage.goto(origin+'/#garden');await pendingPage.locator('[data-garden-practice]').click();await pendingPage.locator('[data-step="speak"]').click();await pendingPage.locator('#record').click();await pendingPage.waitForTimeout(2500);await pendingPage.locator('#record').click();await pendingPage.waitForFunction(()=>window.startedAssessment);
    await pendingPage.locator('#exit-session').click();await pendingPage.evaluate(()=>window.finishAssessment());await pendingPage.waitForTimeout(150);
    assert.equal(await pendingPage.locator('[data-garden-claim]').count(),0);assert.deepEqual(await pendingPage.evaluate(k=>JSON.parse(localStorage.getItem(k)),key),initial);
    checks.push({name:'Late successful assessment after exit cannot change the page or grant water',status:'PASS'});
    await pendingContext.close();
    assert.deepEqual(errors,[]);assert.deepEqual(uploads,[]);
    checks.push({name:'No recording uploads or uncaught errors during real recording and matching',status:'PASS'});
    fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({checks},null,2));console.log(JSON.stringify({passed:checks.length}));
  }finally{await context.close();await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
