/* Focused avatar QA: every step fits a small phone, drafts stay local and cancellable. */
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'C:/Users/Jam/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const origin=process.env.TEST_URL||'http://127.0.0.1:24736';
const sourceMode=process.env.AVATAR_SOURCE==='1';
const output=path.join(root,'test-results',sourceMode?'avatar-focus-source':'avatar-focus');
const avatarKey='english-sprout-avatar-v1',learningKey='english-sprout-state-v1';
const checks=[];
fs.mkdirSync(output,{recursive:true});
let browser;

async function fit(page,label){
  const result=await page.locator('dialog.avatar-picker').evaluate(dialog=>{
    const b=dialog.getBoundingClientRect();
    const visible=element=>{const r=element.getBoundingClientRect();return r.width>0&&r.height>0&&getComputedStyle(element).visibility!=='hidden';};
    const controls=[...dialog.querySelectorAll('button,input[type=range]')].filter(visible).map(element=>{
      const r=element.getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);
      return {id:element.id||element.dataset.avatarAnimal||element.dataset.avatarMode,width:r.width,height:r.height,left:r.left,top:r.top,right:r.right,bottom:r.bottom,hit:hit===element||element.contains(hit)};
    });
    return {step:dialog.dataset.avatarStep,viewport:{width:innerWidth,height:innerHeight},bounds:{left:b.left,top:b.top,right:b.right,bottom:b.bottom},scrollHeight:dialog.scrollHeight,clientHeight:dialog.clientHeight,scrollWidth:dialog.scrollWidth,clientWidth:dialog.clientWidth,controls};
  });
  assert.ok(result.scrollHeight<=result.clientHeight+1,`${label}: vertical scrolling ${JSON.stringify(result)}`);
  assert.ok(result.scrollWidth<=result.clientWidth+1,`${label}: horizontal scrolling`);
  assert.ok(result.bounds.top>=0&&result.bounds.left>=0&&result.bounds.bottom<=result.viewport.height&&result.bounds.right<=result.viewport.width,`${label}: modal outside viewport`);
  for(const control of result.controls){
    assert.ok(control.width>=44&&control.height>=44,`${label}: small target ${JSON.stringify(control)}`);
    assert.ok(control.left>=result.bounds.left&&control.right<=result.bounds.right&&control.top>=result.bounds.top&&control.bottom<=result.bounds.bottom,`${label}: clipped ${JSON.stringify(control)}`);
    assert.ok(control.hit,`${label}: obscured ${JSON.stringify(control)}`);
  }
  await page.screenshot({path:path.join(output,`${label}.png`)});
  checks.push({name:label,status:'PASS',evidence:result});
}

async function photoFixture(page){
  const data=await page.evaluate(()=>{
    const canvas=document.createElement('canvas');canvas.width=320;canvas.height=400;
    const ctx=canvas.getContext('2d');ctx.fillStyle='#cbe1df';ctx.fillRect(0,0,320,400);
    ctx.fillStyle='#f7c9a6';ctx.beginPath();ctx.ellipse(160,210,90,120,0,0,Math.PI*2);ctx.fill();
    ctx.fillStyle='#475a52';ctx.beginPath();ctx.arc(125,190,9,0,Math.PI*2);ctx.arc(195,190,9,0,Math.PI*2);ctx.fill();
    return canvas.toDataURL('image/png').split(',')[1];
  });
  return {name:'synthetic-local-avatar.png',mimeType:'image/png',buffer:Buffer.from(data,'base64')};
}

(async()=>{
  browser=await chromium.launch({channel:'msedge',headless:true});
  for(const viewport of [{width:320,height:568},{width:390,height:844}]){
    const tag=`${viewport.width}x${viewport.height}`;
    const context=await browser.newContext({viewport,serviceWorkers:'block'});
    const page=await context.newPage();page.setDefaultTimeout(10000);
    const errors=[],writes=[];page.on('pageerror',error=>errors.push(error.message));
    context.on('request',request=>{if(!['GET','HEAD'].includes(request.method()))writes.push(request.url());});
    if(sourceMode)for(const file of ['avatars.js','avatars.css'])await context.route(`**/src/${file}`,route=>route.fulfill({path:path.join(root,'src',file),contentType:file.endsWith('.js')?'text/javascript':'text/css'}));
    await page.addInitScript(()=>{
      window.__holdAvatarPhotos=false;window.__delayedAvatarPhotos=[];window.__avatarDecoded=0;
      const descriptor=Object.getOwnPropertyDescriptor(HTMLImageElement.prototype,'src');
      Object.defineProperty(HTMLImageElement.prototype,'src',{...descriptor,set(value){
        if(String(value).startsWith('blob:'))this.addEventListener('load',()=>{window.__avatarDecoded++;},{once:true});
        if(window.__holdAvatarPhotos&&String(value).startsWith('blob:'))window.__delayedAvatarPhotos.push(()=>descriptor.set.call(this,value));
        else descriptor.set.call(this,value);
      }});
    });
    await page.goto(origin,{waitUntil:'networkidle'});await page.locator('#avatar-open').waitFor();
    const learningBefore=await page.evaluate(key=>localStorage.getItem(key),learningKey);
    const open=async()=>{await page.locator('#avatar-open').click();await page.locator('dialog.avatar-picker[open]').waitFor();};
    const stored=()=>page.evaluate(key=>localStorage.getItem(key),avatarKey);
    const focusRestored=async()=>assert.equal(await page.evaluate(()=>document.activeElement?.id),'avatar-open');
    await open();await fit(page,`${tag}-preset`);
    assert.equal(await page.locator('[data-avatar-animal]').count(),6);
    await page.locator('[data-avatar-animal="cat"]').click();await page.locator('dialog.avatar-picker').waitFor({state:'detached'});
    assert.deepEqual(JSON.parse(await stored()),{version:1,kind:'preset',animal:'cat'});await focusRestored();
    await open();await page.locator('[data-avatar-mode="photo"]').click();await fit(page,`${tag}-photo-source`);
    assert.equal(await page.locator('#avatar-camera-file').getAttribute('capture'),'user');
    const original=await stored(),fixture=await photoFixture(page);
    await page.locator('#avatar-photo-file').setInputFiles(fixture);
    await page.waitForFunction(()=>!document.querySelector('#avatar-save-photo').disabled);
    await fit(page,`${tag}-photo-hood`);assert.equal(await stored(),original);
    await page.locator('[data-avatar-animal="fox"]').click();await page.waitForFunction(()=>!document.querySelector('#avatar-save-photo').disabled);
    await page.locator('#avatar-adjust-photo').click();await fit(page,`${tag}-photo-crop`);
    await page.locator('#avatar-zoom').fill('1.8');await page.locator('#avatar-x').fill('0.2');await page.locator('#avatar-y').fill('-0.3');
    await page.locator('#avatar-back').click();assert.equal(await page.locator('#avatar-zoom').inputValue(),'1.8');
    await page.keyboard.press('Escape');await page.locator('dialog.avatar-picker').waitFor({state:'detached'});
    assert.equal(await stored(),original);await focusRestored();
    await open();await page.locator('[data-avatar-mode="photo"]').click();
    await page.locator('#avatar-photo-file').setInputFiles(fixture);await page.waitForFunction(()=>!document.querySelector('#avatar-save-photo').disabled);
    await page.locator('[data-avatar-animal="frog"]').click();await page.locator('#avatar-save-photo').click();await page.locator('dialog.avatar-picker').waitFor({state:'detached'});
    const saved=JSON.parse(await stored());assert.equal(saved.kind,'photo');assert.equal(saved.animal,'frog');assert.match(saved.image,/^data:image\/jpeg;base64,/);await focusRestored();
    await open();await page.locator('[data-avatar-mode="photo"]').click();await fit(page,`${tag}-photo-delete`);
    await page.locator('#avatar-delete-photo').click();assert.deepEqual(JSON.parse(await stored()),{version:1,kind:'preset',animal:'frog'});
    await page.locator('#avatar-photo-file').setInputFiles({name:'broken.png',mimeType:'image/png',buffer:Buffer.from('broken')});
    await page.waitForFunction(()=>document.querySelector('#avatar-message').classList.contains('is-error'));await fit(page,`${tag}-photo-error`);
    assert.equal(JSON.parse(await stored()).kind,'preset');
    await page.evaluate(()=>{window.__holdAvatarPhotos=true;});
    const decodedBefore=await page.evaluate(()=>window.__avatarDecoded);
    await page.locator('#avatar-photo-file').setInputFiles(fixture);
    await page.waitForFunction(()=>window.__delayedAvatarPhotos.length===1);
    await page.locator('[data-avatar-mode="preset"]').click();
    await page.evaluate(()=>{window.__holdAvatarPhotos=false;window.__delayedAvatarPhotos.splice(0).forEach(start=>start());});
    await page.waitForFunction(before=>window.__avatarDecoded>before,decodedBefore);
    assert.equal(await page.locator('dialog.avatar-picker').getAttribute('data-avatar-step'),'preset');
    assert.equal(JSON.parse(await stored()).kind,'preset');
    await page.locator('#avatar-close').click();await page.locator('dialog.avatar-picker').waitFor({state:'detached'});await focusRestored();
    await open();await page.locator('[data-avatar-mode="photo"]').click();
    const closedDecodedBefore=await page.evaluate(()=>{window.__holdAvatarPhotos=true;return window.__avatarDecoded;});
    await page.locator('#avatar-photo-file').setInputFiles(fixture);await page.waitForFunction(()=>window.__delayedAvatarPhotos.length===1);
    await page.locator('#avatar-close').click();await page.locator('dialog.avatar-picker').waitFor({state:'detached'});await focusRestored();
    await open();await page.locator('[data-avatar-mode="photo"]').click();
    await page.evaluate(()=>{window.__holdAvatarPhotos=false;window.__delayedAvatarPhotos.splice(0).forEach(start=>start());});
    await page.waitForFunction(before=>window.__avatarDecoded>before,closedDecodedBefore);
    assert.equal(await page.locator('dialog.avatar-picker').getAttribute('data-avatar-step'),'source');
    assert.equal(JSON.parse(await stored()).kind,'preset');
    await page.locator('#avatar-close').click();await page.locator('dialog.avatar-picker').waitFor({state:'detached'});await focusRestored();
    assert.equal(await page.evaluate(key=>localStorage.getItem(key),learningKey),learningBefore);
    assert.deepEqual(errors,[]);assert.deepEqual(writes,[]);
    checks.push({name:`${tag}-local-draft-cancel-save-delete-and-async-race`,status:'PASS',evidence:{learningUnchanged:true,writeRequests:writes.length,errors}});
    await context.close();
  }
  console.log(`PASS ${checks.length} avatar checks (${sourceMode?'source assets':'built app'})`);
})().catch(error=>{checks.push({name:'avatar QA',status:'FAIL',error:error.stack});console.error(error);process.exitCode=1;}).finally(async()=>{
  fs.writeFileSync(path.join(output,'results.json'),JSON.stringify({sourceMode,origin,checks},null,2));
  if(browser)await browser.close();
});
