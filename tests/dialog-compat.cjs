// Exercise old-iPad dialog behavior with native APIs removed in an isolated browser.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'C:/Users/Jam/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),dist=path.join(root,'dist'),output=path.join(root,'test-results','dialog-compat');
const types={'.js':'application/javascript','.css':'text/css','.html':'text/html','.json':'application/json','.webp':'image/webp','.png':'image/png','.svg':'image/svg+xml','.mp3':'audio/mpeg','.webmanifest':'application/manifest+json'};
const checks=[];let browser,origin;
const server=http.createServer((req,res)=>{
  const file=path.resolve(dist,decodeURIComponent(new URL(req.url,'http://localhost').pathname).replace(/^\//,'')||'index.html');
  if(!file.startsWith(dist+path.sep)){res.writeHead(403);res.end();return;}
  try{const bytes=fs.readFileSync(file);res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'});res.end(bytes);}catch{res.writeHead(404);res.end();}
});
function pass(name,evidence){checks.push({name,status:'PASS',evidence});console.log('PASS',name);}
async function fit(page,selector){
  await page.locator(selector+'[open]').waitFor();
  const evidence=await page.locator(selector).evaluate(dialog=>{const b=dialog.getBoundingClientRect();return{left:b.left,right:b.right,top:b.top,bottom:b.bottom,width:innerWidth,height:innerHeight,modal:dialog.getAttribute('aria-modal'),role:dialog.getAttribute('role'),focus:dialog.contains(document.activeElement),hit:dialog.contains(document.elementFromPoint(b.left+b.width/2,b.top+b.height/2))};});
  assert.ok(evidence.left>=0&&evidence.top>=0&&evidence.right<=evidence.width&&evidence.bottom<=evidence.height,JSON.stringify(evidence));
  assert.ok(evidence.hit&&evidence.focus);assert.equal(evidence.modal,'true');assert.equal(evidence.role,'dialog');
  assert.equal(await page.locator('.dialog-fallback-backdrop').count(),1);return evidence;
}
async function closed(page){
  await page.waitForFunction(()=>!document.querySelector('dialog[open],.dialog-fallback-backdrop'));
  assert.equal(await page.locator('html').evaluate(el=>el.classList.contains('dialog-fallback-open')),false);
  assert.notEqual(await page.locator('#app').getAttribute('aria-hidden'),'true');
}
async function go(page,name){await page.locator(`[data-go="${name}"]:visible`).first().click();}
(async()=>{
  fs.mkdirSync(output,{recursive:true});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));origin=`http://127.0.0.1:${server.address().port}/`;
  browser=await chromium.launch({channel:'msedge',headless:true});
  for(const viewport of [{width:390,height:844},{width:768,height:1024}]){
    const tag=`${viewport.width}x${viewport.height}`,context=await browser.newContext({viewport,hasTouch:true,isMobile:true,reducedMotion:'reduce'}),page=await context.newPage(),errors=[],writes=[];
    page.setDefaultTimeout(15000);page.on('pageerror',error=>errors.push(error.message));context.on('request',request=>{if(!['GET','HEAD'].includes(request.method()))writes.push(request.url());});
    await context.addInitScript(()=>{delete HTMLDialogElement.prototype.showModal;delete HTMLDialogElement.prototype.close;});
    try{
      await page.goto(origin,{waitUntil:'networkidle'});await page.locator('#avatar-open').waitFor();
      const stateBefore=await page.evaluate(()=>localStorage.getItem('english-sprout-state-v1'));
      await page.locator('#avatar-open').click();pass(tag+'-avatar-open',await fit(page,'.avatar-picker'));
      await page.locator('.avatar-picker').evaluate(dialog=>{const buttons=[...dialog.querySelectorAll('button')].filter(el=>!el.disabled&&el.getClientRects().length);buttons[buttons.length-1].focus();});
      await page.keyboard.press('Tab');assert.equal(await page.locator('#avatar-close').evaluate(el=>el===document.activeElement),true);
      await page.keyboard.press('Shift+Tab');assert.equal(await page.locator('[data-avatar-animal="frog"]').evaluate(el=>el===document.activeElement),true);
      await page.evaluate(()=>document.querySelector('#avatar-open').focus());assert.equal(await page.locator('.avatar-picker').evaluate(el=>el.contains(document.activeElement)),true);
      await page.screenshot({path:path.join(output,tag+'-avatar.png')});await page.keyboard.press('Escape');await closed(page);
      assert.equal(await page.locator('#avatar-open').evaluate(el=>el===document.activeElement),true);pass(tag+'-tab-cycle-focus-guard-escape-restores-trigger');
      await page.locator('#avatar-open').click();await page.locator('[data-avatar-animal="cat"]').click();await closed(page);
      assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('english-sprout-avatar-v1')).animal),'cat');pass(tag+'-avatar-selection-close-event-cleanup');
      await page.locator('[data-sound-settings]:visible').first().click();pass(tag+'-sound-open',await fit(page,'.sound-dialog'));
      await page.locator('[data-sound-done]').click();await closed(page);
      await go(page,'garden');await page.locator('[data-open-skins]').click();pass(tag+'-skin-open',await fit(page,'.skin-dialog'));
      await page.locator('[data-skin-page="1"]').click();await page.locator('[data-use-skin]').click();await closed(page);
      assert.equal(await page.locator('html').getAttribute('data-skin'),'classic');pass(tag+'-skin-onclose-and-selection');
      await go(page,'parent');await page.locator('[data-parent-panel="backup"]').click();await page.locator('#reset-progress').click();pass(tag+'-confirmation-open',await fit(page,'.confirm-dialog'));
      await page.locator('[data-cancel]').click();await closed(page);assert.equal(await page.locator('#reset-progress').evaluate(el=>el===document.activeElement),true);
      await page.locator('[data-parent-back]').click();await page.locator('[data-parent-panel="voice"]').click();await page.locator('[data-voice-audition]').click();
      pass(tag+'-audition-open',await fit(page,'.voice-audition'));await page.locator('[data-audition-play="pip"]').waitFor();await page.locator('[data-audition-close]').click();await closed(page);
      // A manually removed dialog must not leave an invisible input/scroll blocker.
      const lifecycle=await page.evaluate(async()=>{
        const {showDialog}=await import('./src/dialog.js');const trigger=document.querySelector('[data-voice-audition]');trigger.focus();
        const dialog=document.createElement('dialog');dialog.innerHTML='<button>One</button><button>Two</button>';document.body.append(dialog);
        let closeCount=0,cancelCount=0;Object.defineProperty(dialog,'onclose',{value:()=>closeCount++,writable:true,configurable:true});
        const prevent=event=>{cancelCount++;event.preventDefault();};dialog.addEventListener('cancel',prevent);showDialog(dialog);
        document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));const prevented=dialog.hasAttribute('open');
        dialog.removeEventListener('cancel',prevent);dialog.close('done');const value=dialog.returnValue;
        showDialog(dialog);dialog.remove();await new Promise(resolve=>setTimeout(resolve,0));
        return{prevented,closeCount,cancelCount,value,backdrops:document.querySelectorAll('.dialog-fallback-backdrop').length,returned:document.activeElement===trigger,bodyOverflow:document.body.style.overflow};
      });
      assert.deepEqual(lifecycle,{prevented:true,closeCount:1,cancelCount:1,value:'done',backdrops:0,returned:true,bodyOverflow:''});pass(tag+'-cancel-onclose-return-value-and-removal-cleanup',lifecycle);
      assert.equal(await page.evaluate(()=>localStorage.getItem('english-sprout-state-v1')),stateBefore);assert.deepEqual(errors,[]);assert.deepEqual(writes,[]);pass(tag+'-no-errors-uploads-or-learning-state-changes');
    }finally{await context.close();}
  }
  const context=await browser.newContext(),page=await context.newPage();
  try{
    await page.goto(origin,{waitUntil:'networkidle'});await page.locator('#avatar-open').click();
    assert.equal(await page.locator('.avatar-picker').evaluate(el=>el.matches(':modal')),true);assert.equal(await page.locator('.dialog-fallback-backdrop').count(),0);
    await page.locator('#avatar-close').click();await page.locator('.avatar-picker').waitFor({state:'detached'});pass('native-dialog-path-unchanged');
  }finally{await context.close();}
})().catch(error=>{checks.push({name:'dialog compatibility',status:'FAIL',error:error.stack});console.error(error);process.exitCode=1;}).finally(async()=>{
  fs.mkdirSync(output,{recursive:true});fs.writeFileSync(path.join(output,'results.json'),JSON.stringify({origin,checks},null,2));if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));
});
