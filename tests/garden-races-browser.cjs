/* Garden recording races and storage failures in isolated app sessions. */
const {chromium}=require('C:/Users/Jam/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const {pathToFileURL}=require('node:url');
const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs');
const root=path.resolve(__dirname,'..'),origin='http://127.0.0.1:24736',key='english-sprout-state-v1';
const out=path.join(root,'test-results/garden-races');fs.mkdirSync(out,{recursive:true});
(async()=>{
  const learning=await import(pathToFileURL(path.join(root,'src/learning.js')));
  const initial=learning.recordResult(learning.createState('2026-10-12'),'hello-01','good','2026-10-12',{isNew:true});
  const browser=await chromium.launch({channel:'msedge',headless:true,args:['--no-proxy-server','--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream']});
  const checks=[];
  async function setup(init){
    const context=await browser.newContext({serviceWorkers:'block',permissions:['microphone'],timezoneId:'Asia/Shanghai'});
    await context.addInitScript(({key,initial})=>localStorage.setItem(key,JSON.stringify(initial)),{key,initial});
    if(init)await context.addInitScript(init);
    const page=await context.newPage();page.setDefaultTimeout(10000);await page.clock.setFixedTime(new Date('2026-10-12T10:00:00+08:00'));
    await page.route('**/speech/**',r=>r.abort());await page.goto(origin+'/#garden');return {context,page};
  }
  const stored=p=>p.evaluate(k=>JSON.parse(localStorage.getItem(k)),key);
  const speak=async p=>{await p.locator('[data-garden-practice]').click();await p.locator('[data-step="speak"]').click();};
  try{
    const f=await setup(()=>{window.micRequests=[];navigator.mediaDevices.getUserMedia=()=>new Promise((resolve,reject)=>window.micRequests.push({resolve,reject}));});
    await speak(f.page);await f.page.locator('#record').click();assert.equal(await f.page.locator('#record').isDisabled(),true);
    await f.page.locator('[data-garden-effort]').click();await f.page.locator('#record').click();
    await f.page.waitForFunction(()=>window.micRequests.length===2);
    await f.page.evaluate(()=>window.micRequests[0].reject(new DOMException('Cancelled','AbortError')));await f.page.waitForTimeout(100);
    assert.equal(await f.page.locator('#record').isDisabled(),true,'Old request cannot unlock the new microphone request');
    assert.equal(await f.page.locator('#replay-record').isDisabled(),true);
    await f.page.evaluate(()=>window.micRequests[1].reject(new DOMException('Denied','NotAllowedError')));
    await f.page.waitForFunction(()=>!document.querySelector('#record').disabled);
    assert.match(await f.page.locator('#record-status').innerText(),/没有开启麦克风/);
    await f.page.locator('[data-garden-effort]').click();await f.page.locator('[data-garden-claim]').click();
    assert.equal((await stored(f.page)).garden.actions.length,1);
    checks.push({name:'Cancelled same-screen permission request cannot unlock or corrupt a newer attempt',status:'PASS'});await f.context.close();

    const r=await setup(()=>{const real=navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);let count=0;navigator.mediaDevices.getUserMedia=(...args)=>++count===1?real(...args):Promise.reject(new DOMException('Denied','NotAllowedError'));});
    await speak(r.page);await r.page.locator('#record').click();await r.page.waitForFunction(()=>document.querySelector('#record').textContent.includes('停止录音'));await r.page.waitForTimeout(4000);await r.page.locator('#record').click();await r.page.waitForFunction(()=>!document.querySelector('#replay-record').disabled);
    await r.page.locator('#record').click();await r.page.waitForFunction(()=>document.querySelector('#record-status').textContent.includes('没有开启麦克风'));
    assert.equal(await r.page.locator('#replay-record').isDisabled(),true);assert.equal(await r.page.locator('[data-garden-claim]').isVisible(),false);assert.equal(await r.page.locator('[data-garden-effort]').isVisible(),true);
    checks.push({name:'Failed re-record immediately disables the revoked previous recording and offers independent continuation',status:'PASS'});await r.context.close();

    for(const action of ['claim','plant']){
      const f=await setup();const before=await stored(f.page);
      if(action==='claim'){await speak(f.page);await f.page.locator('[data-garden-effort]').click();}
      await f.page.evaluate(k=>{const real=Storage.prototype.setItem;Storage.prototype.setItem=function(key,value){if(key===k)throw new DOMException('Storage full','QuotaExceededError');return real.call(this,key,value);};},key);
      if(action==='claim')await f.page.locator('[data-garden-claim]').click();
      else{await f.page.locator('[data-garden-tool="plant"]').click();await f.page.locator('[data-garden-drop]').click();}
      assert.deepEqual(await stored(f.page),before);assert.match(await f.page.locator('#toast').innerText(),/还没保存成功/);
      if(action==='claim'){assert.equal(await f.page.locator('[data-garden-claim]').isVisible(),true);await f.page.locator('#exit-session').click();}
      assert.equal(await f.page.locator('[data-material="water"]').innerText(),'2');assert.equal(await f.page.locator('[data-material="seeds"]').innerText(),'1');
      checks.push({name:`Storage failure rolls back ${action} without celebration, phantom balances or lost records`,status:'PASS'});await f.context.close();
    }
    fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({checks},null,2));console.log(JSON.stringify({passed:checks.length}));
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
