// Isolated real-browser checks for cosmetic collection, phone geometry and offline use.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'C:/Users/Jam/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {pathToFileURL}=require('node:url');
const root=path.resolve(__dirname,'..'),origin=process.env.TEST_URL||'http://127.0.0.1:24736/';
const out=path.join(root,'test-results','skins-v150');fs.mkdirSync(out,{recursive:true});
const stateKey='english-sprout-state-v1',skinKey='english-sprout-skin-v1',today='2026-10-12';
const ids=['sunny','classic','meadow','peach','grape'],checks=[];
const curriculum=JSON.parse(fs.readFileSync(path.join(root,'public/data/curriculum.json'),'utf8'));
let browser,version;

function passed(name,evidence){checks.push({name,status:'PASS',...(evidence?{evidence}:{})});console.log('PASS',name);}
async function tap(page,selector){
  const target=page.locator(selector).first();await target.waitFor({state:'visible'});
  const r=await target.evaluate(element=>{const r=element.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2;return{x,y,left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:innerWidth,height:innerHeight,scrollX,scrollY,hit:element.contains(document.elementFromPoint(x,y))};});
  assert.equal(r.scrollY,0,selector+' must be visible without scrolling');assert.equal(r.scrollX,0);
  assert.ok(r.left>=-1&&r.top>=-1&&r.right<=r.width+1&&r.bottom<=r.height+1,selector+' outside screen '+JSON.stringify(r));
  assert.ok(r.hit,selector+' is obscured');await page.mouse.click(r.x,r.y);
}
async function fit(page,label){
  await page.evaluate(()=>document.fonts.ready);await page.waitForTimeout(50);
  const geometry=await page.evaluate(()=>{
    const d=document.documentElement,b=document.body,scope=document.querySelector('dialog[open]')||document.querySelector('#app');
    const issues=[],visible=e=>e.getClientRects().length&&getComputedStyle(e).visibility!=='hidden'&&!e.closest('[hidden],svg,.interaction-feedback-layer,dialog:not([open])');
    const name=e=>e.id||e.className||e.tagName;
    for(const e of [scope,...scope.querySelectorAll('*')]){
      if(!visible(e))continue;const r=e.getBoundingClientRect(),s=getComputedStyle(e);
      if(r.width<=1||r.height<=1)continue;
      if(e.matches('button,a,input,select,textarea,h1,h2,h3,p,small,strong,img')&&(r.left< -1||r.top< -1||r.right>innerWidth+1||r.bottom>innerHeight+1))issues.push({type:'outside',element:name(e),rect:{left:r.left,top:r.top,right:r.right,bottom:r.bottom}});
      if(e.clientHeight&&e.scrollHeight>e.clientHeight+3&&/(hidden|clip|auto|scroll)/.test(s.overflowY)&&!e.matches('input,textarea,select'))issues.push({type:'scroll-or-clip',element:name(e),scroll:e.scrollHeight,client:e.clientHeight});
      if(e.matches('button,a[href],input:not([type=file]),select,textarea')&&!e.disabled&&s.pointerEvents!=='none'&&!e.contains(document.elementFromPoint(r.left+r.width/2,r.top+r.height/2)))issues.push({type:'obscured',element:name(e)});
    }
    const dialog=document.querySelector('dialog[open]');
    if(dialog&&(dialog.scrollHeight>dialog.clientHeight+1||dialog.scrollWidth>dialog.clientWidth+1))issues.push({type:'dialog-scroll',scrollHeight:dialog.scrollHeight,clientHeight:dialog.clientHeight});
    return{width:innerWidth,height:innerHeight,documentWidth:Math.max(d.scrollWidth,b.scrollWidth),documentHeight:Math.max(d.scrollHeight,b.scrollHeight),scrollX,scrollY,issues};
  });
  await page.screenshot({path:path.join(out,label+'.png')});
  const valid=geometry.documentWidth<=geometry.width+1&&geometry.documentHeight<=geometry.height+1&&!geometry.scrollX&&!geometry.scrollY&&!geometry.issues.length;
  checks.push({name:label,status:valid?'PASS':'FAIL',evidence:geometry});console.log(valid?'PASS':'FAIL',label);
}
async function seed(page,state){await page.evaluate(({key,state})=>localStorage.setItem(key,JSON.stringify(state)),{key:stateKey,state});await page.reload({waitUntil:'networkidle'});}
async function currentSkin(page){return page.locator('html').getAttribute('data-skin');}
async function choosePage(page,id){
  const current=await page.locator('[data-use-skin]').getAttribute('data-use-skin'),from=ids.indexOf(current),to=ids.indexOf(id),delta=to>=from?1:-1;
  for(let i=from;i!==to;i+=delta)await tap(page,`[data-skin-page="${delta}"]`);
  assert.equal(await page.locator('[data-use-skin]').getAttribute('data-use-skin'),id);
}
async function openPicker(page){await tap(page,'[data-open-skins]');await page.locator('dialog.skin-dialog[open]').waitFor();}
async function go(page,view){await tap(page,`[data-go="${view}"]:visible`);}

(async()=>{
  const learning=await import(pathToFileURL(path.join(root,'src/learning.js')).href);
  let unlocked=learning.createState('2026-10-01');
  for(let i=0;i<7;i++){
    const date=learning.addDays('2026-10-01',i);
    unlocked=learning.recordResult(unlocked,curriculum.lessons[i].id,'again',date,{isNew:true});
    if(i>0&&i<=5)unlocked=learning.recordResult(unlocked,curriculum.lessons[0].id,'again',date);
  }
  unlocked=learning.validateImport(unlocked,curriculum.lessons);
  let beforeThird=learning.createState('2026-10-08');
  beforeThird=learning.recordResult(beforeThird,curriculum.lessons[0].id,'good','2026-10-08',{isNew:true});
  beforeThird=learning.recordResult(beforeThird,curriculum.lessons[1].id,'good','2026-10-09',{isNew:true});
  for(const lesson of curriculum.lessons.slice(0,2))beforeThird=learning.recordResult(beforeThird,lesson.id,'good','2026-10-11');
  beforeThird=learning.validateImport(beforeThird,curriculum.lessons);

  browser=await chromium.launch({channel:'msedge',headless:true});
  for(const viewport of [{width:320,height:568},{width:390,height:844}]){
    const tag=`${viewport.width}x${viewport.height}`,context=await browser.newContext({viewport,timezoneId:'Asia/Shanghai',isMobile:true,hasTouch:true,reducedMotion:'reduce'}),page=await context.newPage();
    const errors=[];page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(15000);
    await page.clock.setFixedTime(new Date(today+'T10:00:00+08:00'));
    await context.addInitScript(({skinKey})=>{
      window.__failSkinSave=false;
      const native=Storage.prototype.setItem;
      Storage.prototype.setItem=function(key,value){if(window.__failSkinSave&&key===skinKey)throw new DOMException('Storage full','QuotaExceededError');return native.call(this,key,value);};
    },{skinKey});
    try{
      version=await(await context.request.get(new URL('version.json',origin).href)).json();
      if(process.env.EXPECTED_BUILD)assert.equal(version.build,process.env.EXPECTED_BUILD);
      await page.goto(origin,{waitUntil:'networkidle'});await page.locator('#hero-start').waitFor();
      assert.equal(await page.locator('meta[name="app-build"]').getAttribute('content'),version.build);
      assert.equal(await currentSkin(page),'sunny');await fit(page,tag+'-home');
      const sunnyBackground=await page.locator('body').evaluate(e=>getComputedStyle(e).backgroundColor);
      await go(page,'garden');await fit(page,tag+'-garden');await tap(page,'[data-garden-view="collection"]');await fit(page,tag+'-collection');
      await openPicker(page);
      for(const id of ids){
        await choosePage(page,id);await fit(page,tag+'-preview-'+id);
        assert.equal(await page.locator('[data-use-skin]').isDisabled(),!['sunny','classic'].includes(id));
        if(!['sunny','classic'].includes(id)){
          await tap(page,'[data-use-skin]');assert.equal(await currentSkin(page),'sunny');assert.equal(await page.locator('dialog.skin-dialog[open]').count(),1);
        }
      }
      passed(tag+'-locked-skins-cannot-apply');
      await choosePage(page,'classic');await tap(page,'[data-use-skin]');await page.locator('dialog.skin-dialog').waitFor({state:'detached'});
      assert.equal(await currentSkin(page),'classic');assert.notEqual(await page.locator('body').evaluate(e=>getComputedStyle(e).backgroundColor),sunnyBackground);
      await page.reload({waitUntil:'networkidle'});assert.equal(await currentSkin(page),'classic');
      await openPicker(page);await choosePage(page,'sunny');await tap(page,'[data-use-skin]');await page.reload({waitUntil:'networkidle'});assert.equal(await currentSkin(page),'sunny');
      passed(tag+'-free-skins-apply-and-persist');

      await openPicker(page);await choosePage(page,'classic');await page.evaluate(()=>window.__failSkinSave=true);await tap(page,'[data-use-skin]');
      assert.equal(await currentSkin(page),'sunny');assert.equal(await page.evaluate(key=>localStorage.getItem(key),skinKey),'sunny');
      assert.match(await page.locator('.skin-status[role="alert"]').innerText(),/没能保存|存储/);await fit(page,tag+'-save-failure-visible');
      await page.evaluate(()=>window.__failSkinSave=false);await tap(page,'[data-close-skins]');passed(tag+'-failed-save-keeps-theme-and-visible-retry-message');

      await seed(page,unlocked);
      for(const id of ['meadow','peach','grape']){
        await openPicker(page);await choosePage(page,id);assert.equal(await page.locator('[data-use-skin]').isDisabled(),false);await tap(page,'[data-use-skin]');
        await page.reload({waitUntil:'networkidle'});assert.equal(await currentSkin(page),id);assert.equal(await page.evaluate(key=>localStorage.getItem(key),skinKey),id);
      }
      passed(tag+'-recorded-practice-unlocks-and-persists-all-three');

      await go(page,'parent');await tap(page,'[data-parent-panel="backup"]');
      await page.locator('#import-file').setInputFiles({name:'isolated-low-progress.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({app:'english-sprout',version:1,state:learning.createState(today)}))});
      await tap(page,'[data-confirm]');assert.equal(await currentSkin(page),'sunny');
      const imported=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)),stateKey);assert.equal(Object.keys(imported.cards).length,0);
      await page.reload({waitUntil:'networkidle'});assert.equal(await currentSkin(page),'sunny');passed(tag+'-actual-backup-import-relocks-with-free-fallback');

      await go(page,'home');await seed(page,beforeThird);assert.equal(await page.locator('.focus-home').getAttribute('data-next-kind'),'learn');
      await tap(page,'#hero-start');assert.equal(await page.locator('.practice-main').getAttribute('data-lesson-id'),curriculum.lessons[2].id);
      await tap(page,'[data-step="choose"]');await tap(page,`[data-choice="${curriculum.lessons[2].answerIndex}"]`);await tap(page,'#quiz-next');await tap(page,'[data-rating="again"]');
      await page.locator('.completion').waitFor();assert.match(await page.locator('.skin-unlock-note').innerText(),/新皮肤.*薄荷森林/);await fit(page,tag+'-real-learning-unlock');
      const after=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)),stateKey);assert.equal(Object.keys(after.cards).length,3);
      await tap(page,'.skin-unlock-note');assert.equal(await page.locator('[data-use-skin]').getAttribute('data-use-skin'),'meadow');await tap(page,'[data-use-skin]');assert.equal(await currentSkin(page),'meadow');
      passed(tag+'-third-sentence-completion-announces-real-unlock');

      await go(page,'garden');await page.evaluate(()=>navigator.serviceWorker.ready);await page.waitForFunction(()=>navigator.serviceWorker.controller!==null);
      await context.setOffline(true);await page.reload({waitUntil:'domcontentloaded'});await page.locator('[data-open-skins]').waitFor();assert.equal(await currentSkin(page),'meadow');await openPicker(page);await fit(page,tag+'-offline-picker');
      const resources=await page.evaluate(async()=>{
        const name=(await caches.keys()).find(name=>name.startsWith('english-sprout-core-')),cache=await caches.open(name),requests=await cache.keys();
        const results=await Promise.all(requests.map(async request=>{try{const response=await fetch(request.url);return{path:new URL(request.url).pathname,status:response.status,bytes:(await response.arrayBuffer()).byteLength};}catch(error){return{path:new URL(request.url).pathname,error:error.message};}}));
        return{cache:name,results};
      });
      for(const resource of resources.results){assert.equal(resource.status,200,'offline '+resource.path);assert.ok(resource.bytes>0,'empty '+resource.path);}
      for(const file of ['src/skins.js','src/skin-picker.js','src/skins.css'])assert.ok(resources.results.some(item=>item.path.endsWith('/'+file)),file+' missing offline');
      passed(tag+'-offline-reload-retains-skin-and-all-core-resources',{cache:resources.cache,resourceCount:resources.results.length});
      await tap(page,'[data-close-skins]');await openPicker(page);await choosePage(page,'classic');await tap(page,'[data-use-skin]');assert.equal(await currentSkin(page),'classic');
      passed(tag+'-offline-skin-switch');assert.deepEqual(errors,[]);passed(tag+'-no-page-errors');
    }catch(error){checks.push({name:tag+'-flow',status:'FAIL',error:error.stack});console.log('FAIL',tag,error.message);await page.screenshot({path:path.join(out,tag+'-failure.png')}).catch(()=>{});}
    await context.close();
  }
  await browser.close();browser=null;
  const result={url:origin,version,passed:checks.filter(c=>c.status==='PASS').length,failed:checks.filter(c=>c.status==='FAIL').length,checks};
  fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(result,null,2));console.log(JSON.stringify({build:version?.build,passed:result.passed,failed:result.failed,path:out}));process.exitCode=result.failed?1:0;
})().catch(async error=>{console.error(error);if(browser)await browser.close();process.exitCode=1;});
