/* Official GM growth acceptance. Build separately; this runner never builds or
 * touches the user's browser profile. Native WebP decode and pointer input are
 * real; microphone and external requests are forbidden. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const http = require('node:http');
const {pathToFileURL} = require('node:url');
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/Jam/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root=path.resolve(__dirname,'..'), dist=path.join(root,'dist');
const publicBuild=process.env.XIAOYA_EXPECT_PUBLIC==='1';
const filter=process.env.XIAOYA_TEST_FILTER?new RegExp(process.env.XIAOYA_TEST_FILTER):null;
const out=path.resolve(root,process.env.XIAOYA_GROWTH_TEST_OUT||path.join('test-results',publicBuild?'xiaoya-growth-public':'xiaoya-growth-internal'));
const settingsKey='xiaoya-english:growth-settings:v1';
const report={startedAt:new Date().toISOString(),checks:[],scope:{publicBuild,nativeImageDecode:true,isolatedProfiles:true,microphoneUsed:false,realChildRecordsUsed:false,artVisuallyApproved:false,filter:filter?.source||null}};
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.webmanifest':'application/manifest+json','.webp':'image/webp','.png':'image/png','.svg':'image/svg+xml','.mp3':'audio/mpeg'};
const forbidden=/(?:\/(?:speech|models?)\/|\/speech-local\.js|\.(?:onnx|wasm)(?:\?|$)|vosk|whisper)/i;
let browser,server,origin,expected,initialRecords;
async function serve(){
  server=http.createServer(async(req,res)=>{
    try{
      let name=decodeURIComponent(new URL(req.url,'http://localhost').pathname);if(name.endsWith('/'))name+='index.html';
      const file=path.resolve(dist,'.'+name),relative=path.relative(dist,file);
      if(relative.startsWith('..')||path.isAbsolute(relative))return res.writeHead(403).end();
      const stat=await fsp.stat(file);if(!stat.isFile())throw Error('Not a file');
      res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream','Content-Length':stat.size,'Cache-Control':'no-cache'});
      if(req.method==='HEAD')res.end();else fs.createReadStream(file).on('error',()=>res.destroy()).pipe(res);
    }catch{if(!res.headersSent)res.writeHead(404);res.end('Missing test candidate');}
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));return `http://127.0.0.1:${server.address().port}`;
}
const snapshot=p=>p.evaluate(()=>Object.fromEntries(Object.keys(localStorage).sort().map(k=>[k,localStorage.getItem(k)])));
const withoutGrowth=records=>Object.fromEntries(Object.entries(records).filter(([key])=>key!==settingsKey));
const saved=p=>p.evaluate(key=>JSON.parse(localStorage.getItem(key)),settingsKey);
async function fixture(width=1180){
  const c=await browser.newContext({viewport:{width,height:1000},timezoneId:'Asia/Shanghai',serviceWorkers:'block',reducedMotion:'reduce',hasTouch:width<600,isMobile:width<600});
  const requests=[],errors=[],access={microphone:0};
  await c.exposeBinding('qaReportMicrophone',()=>{access.microphone++;});
  c.on('request',r=>requests.push(r.url()));
  await c.route('**/*',route=>new URL(route.request().url()).origin===origin&&!forbidden.test(route.request().url())?route.continue():route.abort('blockedbyclient'));
  await c.addInitScript(({origin,records})=>{
    if(location.origin!==origin)return;
    if(!localStorage.getItem('qa-growth-child'))for(const [key,value]of Object.entries(records))localStorage.setItem(key,value);
    window.qaGrowth={errors:[]};
    if(navigator.mediaDevices)navigator.mediaDevices.getUserMedia=()=>{void window.qaReportMicrophone();throw Error('Growth GM must never request a microphone');};
    addEventListener('unhandledrejection',e=>qaGrowth.errors.push(String(e.reason)));
  },{origin,records:initialRecords});
  const p=await c.newPage();p.setDefaultTimeout(18000);p.on('pageerror',e=>errors.push(e.message));
  await p.goto(`${origin}/xiaoya/?garden=b`,{waitUntil:'domcontentloaded'});await p.locator('main.home-view').waitFor();
  assert.equal(await p.locator('meta[name="xiaoya-build"]').getAttribute('content'),expected.build);
  return {c,p,width,requests,errors,access,child:withoutGrowth(await snapshot(p))};
}
async function press(p,selector){
  const el=p.locator(selector).first();await el.waitFor({state:'visible'});assert(await el.isEnabled(),`Disabled ${selector}`);await el.scrollIntoViewIfNeeded();
  const point=await el.evaluate(e=>{const r=e.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2;return {x,y,hit:e.contains(document.elementFromPoint(x,y))};});
  assert(point.hit,`Pointer intercepted for ${selector}`);
  if(p.viewportSize().width<600)await p.touchscreen.tap(point.x,point.y);else await p.mouse.click(point.x,point.y);
}
async function open(p){
  await press(p,'#xiaoya-gm [data-gm-action="open"]');await p.locator('#gm-workbench[open]').waitFor();
  await press(p,'[data-gm-tab="growth"]');await p.locator('[data-growth-flower]').waitFor();await rendered(p);
}
async function rendered(p){
  await p.waitForFunction(()=>{
    const preview=document.querySelector('[data-growth-preview]');if(preview?.dataset.motionState&&preview.dataset.motionState!=='idle')return false;
    const image=document.querySelector('[data-growth-image]');if(!image||!image.complete||!image.naturalWidth||getComputedStyle(image).visibility!=='visible')return false;
    return Math.abs(new DOMMatrix(getComputedStyle(image).transform).a-Number(image.dataset.scale))<.0001;
  });
}
const waterCount=async p=>Number((await p.locator('[data-growth-progress]').textContent()).match(/^\d+/)[0]);
async function motionRange(p,name,value){
  const input=p.locator(`[data-growth-motion="${name}"]`);await input.waitFor();
  const bounds=await input.evaluate(e=>({min:Number(e.min),max:Number(e.max)}));
  assert(value>=bounds.min&&value<=bounds.max,`${name}=${value} outside ${JSON.stringify(bounds)}`);
  await input.evaluate((e,value)=>{e.value=String(value);e.dispatchEvent(new Event('input',{bubbles:true}));},value);
}
async function phase(p,state){await p.waitForFunction(value=>document.querySelector('[data-growth-preview]')?.dataset.motionState===value,state);}
async function startFrameCapture(p){
  await p.evaluate(()=>{
    window.qaMotionFrames=[];window.qaMotionCapture=true;
    const frame=()=>{
      if(!window.qaMotionCapture)return;
      const preview=document.querySelector('[data-growth-preview]'),image=document.querySelector('[data-growth-image]'),incoming=document.querySelector('[data-growth-incoming]');
      if(preview&&image){
        const style=getComputedStyle(image),matrix=new DOMMatrix(style.transform),next=incoming?getComputedStyle(incoming):null;
        const parent=image.offsetParent,box=parent.getBoundingClientRect(),pivot=style.transformOrigin.split(' ').map(Number.parseFloat),root=document.querySelector('[data-growth-root]').getBoundingClientRect();
        const point=new DOMPoint(parseFloat(style.width)*.5-pivot[0],parseFloat(style.height)*.880859375-pivot[1]).matrixTransform(matrix);
        const rootError=Math.hypot(box.x+parent.clientLeft-parent.scrollLeft+image.offsetLeft+pivot[0]+point.x-root.x-root.width/2,box.y+parent.clientTop-parent.scrollTop+image.offsetTop+pivot[1]+point.y-root.y-root.height/2);
        window.qaMotionFrames.push({t:performance.now(),state:preview.dataset.motionState,opacity:Number(style.opacity),incomingOpacity:next?Number(next.opacity):0,
          transform:style.transform,a:matrix.a,b:matrix.b,c:matrix.c,d:matrix.d,phase:document.querySelector('[data-growth-phase]')?.textContent||'',
          rootError,effectsVisible:[...preview.querySelectorAll('[data-growth-effect]')].filter(e=>Number(getComputedStyle(e).opacity)>.01).length,
          outgoing:image.currentSrc,incoming:incoming?.currentSrc||'',progress:document.querySelector('[data-growth-progress]')?.textContent||''});
      }
      requestAnimationFrame(frame);
    };requestAnimationFrame(frame);
  });
}
async function stopFrameCapture(p){return p.evaluate(()=>{window.qaMotionCapture=false;return window.qaMotionFrames;});}
async function geometry(p){
  await rendered(p);
  return p.locator('[data-growth-image]').evaluate(image=>{
    const r=image.getBoundingClientRect(),root=document.querySelector('[data-growth-root]').getBoundingClientRect(),preview=document.querySelector('[data-growth-preview]').getBoundingClientRect();
    return {stage:Number(image.dataset.stage),scale:Number(image.dataset.scale),src:image.currentSrc,width:image.naturalWidth,height:image.naturalHeight,
      root:{x:root.x+root.width/2,y:root.y+root.height/2},imageRoot:{x:r.x+r.width*.5,y:r.y+r.height*.880859375},
      image:{x:r.x,y:r.y,right:r.right,bottom:r.bottom,width:r.width,height:r.height},preview:{x:preview.x,y:preview.y,right:preview.right,bottom:preview.bottom}};
  });
}
function anchored(g){assert(Math.abs(g.root.x-g.imageRoot.x)<1.2&&Math.abs(g.root.y-g.imageRoot.y)<1.2,`Root moved: ${JSON.stringify(g)}`);assert.deepEqual([g.width,g.height],[384,512]);}
async function clean(f){
  assert.equal(f.access.microphone,0);assert.deepEqual(f.requests.filter(x=>forbidden.test(x)),[]);
  assert.deepEqual(f.errors,[]);assert.deepEqual(await f.p.evaluate(()=>qaGrowth.errors),[]);
  assert.deepEqual(withoutGrowth(await snapshot(f.p)),f.child,'Growth controls changed real child ledger, preferences or learning records');
}
async function check(name,run,width){
  if(filter&&!filter.test(name))return;
  const f=await fixture(width),start=Date.now();
  try{const detail=await run(f);await clean(f);report.checks.push({name,status:'PASS',ms:Date.now()-start,detail});console.log(`PASS ${name}`);}
  catch(error){process.exitCode=1;report.checks.push({name,status:'FAIL',error:error.stack});console.error(`FAIL ${name}\n${error.stack}`);await f.p.screenshot({path:path.join(out,name.replace(/[^a-z0-9]+/gi,'-')+'.png'),fullPage:true}).catch(()=>{});}
  finally{await f.c.close();}
}
async function main(){
  await fsp.mkdir(out,{recursive:true});expected=JSON.parse(await fsp.readFile(path.join(dist,'xiaoya/version.json'),'utf8'));report.candidate=expected;
  assert.equal(expected.channel,publicBuild?'public':'internal','Build intended channel before running.');
  const {createState,STORAGE_KEY}=await import(pathToFileURL(path.join(root,'xiaoya/learning.js')).href);
  const {createMeadow,MEADOW_KEY}=await import(pathToFileURL(path.join(root,'xiaoya/garden-meadow.js')).href);
  const date=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai'}).format(new Date());
  initialRecords={'qa-growth-child':'isolated-existing-child-record','xiaoya-english:preferences:v1':JSON.stringify({welcome:true,mic:false,guideStep:'done'}),'xiaoya-english:voice:v1':'ryan','xiaoya-english:welcome-greetings:v1':JSON.stringify({schema:1,date,id:'welcome-gift-first',remaining:[]}),[STORAGE_KEY]:JSON.stringify(createState()),[MEADOW_KEY]:JSON.stringify(createMeadow())};
  origin=process.env.TEST_URL?new URL(process.env.TEST_URL).origin:await serve();assert(['127.0.0.1','localhost','[::1]'].includes(new URL(origin).hostname));
  browser=await chromium.launch({channel:'msedge',headless:true,args:['--no-proxy-server','--autoplay-policy=no-user-gesture-required']});
  if(publicBuild){
    await check('public excludes growth workbench modules and candidate art',async f=>{
      assert.equal(await f.p.locator('[data-gm-action],[data-gm-tab],[data-growth-preview]').count(),0);
      const release=path.join(dist,'xiaoya','releases',expected.build);
      for(const name of ['gm-growth.js','growth-core.js','growth-settings.js','growth-catalog.js','growth-motion.js'])assert(!fs.existsSync(path.join(release,name)),name+' leaked into public');
      assert(!fs.existsSync(path.join(dist,'xiaoya','growth')),'Unapproved candidate art leaked into public');
      assert(!f.requests.some(url=>/gm-growth|growth-catalog|\/growth\/v09\//.test(url)));
      return {excludedModules:5,excludedCandidateImages:268};
    });return;
  }
  await check('all 50 choices and 268 native transparent WebP decodes',async f=>{
    await open(f.p);assert.equal(await f.p.locator('[data-growth-flower] option').count(),50);assert.equal(await f.p.locator('[data-growth-flower] optgroup').count(),10);
    const receipt=JSON.parse(await fsp.readFile(path.join(root,'design/xiaoya-growth-v09-source.json'),'utf8'));
    const decoded=await f.p.evaluate(async assets=>{
      const results=[];
      for(let offset=0;offset<assets.length;offset+=8)results.push(...await Promise.all(assets.slice(offset,offset+8).map(async asset=>{
        const image=new Image();image.src=new URL('xiaoya/growth/v09/'+asset.target,document.baseURI).href;await image.decode();
        const canvas=document.createElement('canvas');canvas.width=image.naturalWidth;canvas.height=image.naturalHeight;const ctx=canvas.getContext('2d');ctx.drawImage(image,0,0);
        const data=ctx.getImageData(0,0,canvas.width,canvas.height).data;let transparent=0,visible=0;
        for(let i=3;i<data.length;i+=4){if(data[i]===0)transparent++;else visible++;}
        return {id:asset.id,width:image.naturalWidth,height:image.naturalHeight,kind:asset.kind,transparent,visible};
      })));
      return results;
    },receipt.assets);
    assert.equal(decoded.length,268);for(const image of decoded){assert.deepEqual([image.width,image.height],image.kind==='flower'?[384,512]:[256,256],image.id);assert(image.transparent>0&&image.visible>0,image.id);}
    assert.equal(await f.p.locator('[data-growth-frames] img').count(),5);assert.equal(await f.p.locator('[data-growth-seed]').count(),1);
    return {flowers:50,families:10,stages:250,seeds:18,nativeDecodes:decoded.length,transparent:true};
  });
  await check('every drop changes growth while root stays planted and selection resets',async f=>{
    await open(f.p);const steps=[];let previous=await geometry(f.p);anchored(previous);steps.push({water:0,stage:previous.stage,scale:previous.scale});
    for(let water=1;water<=10;water++){
      await press(f.p,'[data-growth-action="water"]');const g=await geometry(f.p);anchored(g);assert(g.scale>previous.scale||g.stage!==previous.stage,`Drop ${water} had no visible change`);
      assert.match(await f.p.locator('[data-growth-progress]').textContent(),new RegExp(`^${water} / 10`));steps.push({water,stage:g.stage,scale:g.scale});previous=g;
    }
    assert.equal(previous.stage,4);assert.equal(previous.scale,1);assert(await f.p.locator('[data-growth-action="water"]').isDisabled());
    const first=await f.p.locator('[data-growth-flower]').inputValue();await press(f.p,'[data-growth-action="next"]');
    assert.notEqual(await f.p.locator('[data-growth-flower]').inputValue(),first);assert.match(await f.p.locator('[data-growth-progress]').textContent(),/^0 \/ 10/);assert.equal((await geometry(f.p)).stage,0);
    await press(f.p,'[data-growth-action="previous"]');assert.equal(await f.p.locator('[data-growth-flower]').inputValue(),first);
    await press(f.p,'[data-growth-action="water"]');await press(f.p,'[data-growth-action="reset"]');assert.match(await f.p.locator('[data-growth-progress]').textContent(),/^0 \/ 10/);
    assert.equal(await saved(f.p),null,'Water preview must not persist a water counter');return {steps,rootErrorLimitPx:1.2,selectionResets:true};
  });
  await check('global defaults and per flower overrides autosave reload and inherit',async f=>{
    await open(f.p);const first=await f.p.locator('[data-growth-flower]').inputValue();
    await f.p.locator('[data-growth-total]').fill('12');await f.p.locator('[data-growth-scale="0"]').fill('45');
    assert.equal((await saved(f.p)).defaults.totalWater,12);assert.equal((await saved(f.p)).defaults.scales[0],.45);
    await f.p.locator('[data-growth-scope]').selectOption('flower');await f.p.locator('[data-growth-total]').fill('8');await f.p.locator('[data-growth-scale="0"]').fill('60');
    assert.equal((await saved(f.p)).overrides[first].totalWater,8);
    await f.p.locator('[data-growth-scope]').selectOption('defaults');await f.p.locator('[data-growth-total]').fill('14');
    assert.match(await f.p.locator('[data-growth-progress]').textContent(),/^0 \/ 8/,'Global edits must not erase per-flower override');
    const downloadPending=f.p.waitForEvent('download');await press(f.p,'[data-growth-action="export"]');const download=await downloadPending;
    assert.equal(download.suggestedFilename(),'xiaoya-growth-settings.json');const exportPath=path.join(out,'growth-settings-export.json');await download.saveAs(exportPath);
    assert.deepEqual(JSON.parse(await fsp.readFile(exportPath,'utf8')),await saved(f.p),'Export must reflect both defaults and individual overrides');
    await f.p.reload();await f.p.locator('main.home-view').waitFor();await open(f.p);
    assert.equal(await f.p.locator('[data-growth-total]').inputValue(),'14');assert.match(await f.p.locator('[data-growth-progress]').textContent(),/^0 \/ 8/);assert.equal((await geometry(f.p)).scale,.6);
    await press(f.p,'[data-growth-action="next"]');assert.match(await f.p.locator('[data-growth-progress]').textContent(),/^0 \/ 14/);assert.equal((await geometry(f.p)).scale,.45);
    await f.p.locator('[data-growth-flower]').selectOption(first);await press(f.p,'[data-growth-action="inherit"]');assert.match(await f.p.locator('[data-growth-progress]').textContent(),/^0 \/ 14/);
    assert(!Object.hasOwn((await saved(f.p)).overrides,first));assert(await f.p.locator('[data-growth-action="inherit"]').isDisabled());
    await press(f.p,'[data-growth-action="defaults"]');assert.equal((await saved(f.p)).defaults.totalWater,10);assert.deepEqual((await saved(f.p)).defaults.scales,[.4,.55,.7,.85,1]);
    return {persistentDefault:14,persistentOverride:8,inheritRestored:true,resetDefault:10,downloadedExportMatchesSaved:true};
  });
  await check('empty fractional and out of range input never overwrites saved settings',async f=>{
    await open(f.p);await f.p.locator('[data-growth-total]').fill('12');const before=await saved(f.p);
    for(const value of ['', '3','51','7.5']){await f.p.locator('[data-growth-total]').fill(value);assert.deepEqual(await saved(f.p),before);assert((await f.p.locator('[data-growth-validation]').textContent()).length>0);}
    await f.p.locator('[data-growth-total]').fill('12');
    for(const value of ['', '14','151','40.5']){await f.p.locator('[data-growth-scale="0"]').fill(value);assert.deepEqual(await saved(f.p),before);}
    await f.p.locator('[data-growth-scale="0"]').fill('40');assert.equal(await f.p.locator('[data-growth-validation]').textContent(),'');
    return {rejectedValues:8,savedDefault:12};
  });
  await check('storage write failure is explicit and retry saves pending changes',async f=>{
    await open(f.p);await f.p.locator('[data-growth-total]').fill('11');const before=await saved(f.p);
    await f.p.evaluate(key=>{window.qaStorageSet=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(k===key)throw new DOMException('QA quota','QuotaExceededError');return window.qaStorageSet.call(this,k,v);};},settingsKey);
    await f.p.locator('[data-growth-total]').fill('13');assert.deepEqual(await saved(f.p),before);assert.match(await f.p.locator('[data-growth-status]').textContent(),/尚未保存/);assert(await f.p.locator('[data-growth-action="retry"]').isVisible());
    assert.match(await f.p.locator('[data-growth-progress]').textContent(),/^0 \/ 13/);
    await f.p.evaluate(()=>{Storage.prototype.setItem=window.qaStorageSet;delete window.qaStorageSet;});await press(f.p,'[data-growth-action="retry"]');
    assert.equal((await saved(f.p)).defaults.totalWater,13);assert.match(await f.p.locator('[data-growth-status]').textContent(),/已自动保存/);assert(await f.p.locator('[data-growth-action="retry"]').isHidden());
    return {original:11,pending:13,retrySaved:true};
  });
  await check('switching flower clears invalid input and stale validation',async f=>{
    await open(f.p);await f.p.locator('[data-growth-total]').fill('3');
    assert.equal(await f.p.locator('[data-growth-total]').evaluate(el=>el.checkValidity()),false);
    assert((await f.p.locator('[data-growth-validation]').textContent()).length>0);
    await press(f.p,'[data-growth-action="next"]');
    assert.equal(await f.p.locator('[data-growth-total]').inputValue(),'10');
    assert.equal(await f.p.locator('[data-growth-total]').evaluate(el=>el.checkValidity()),true);
    assert.equal(await f.p.locator('[data-growth-validation]').textContent(),'');
    return {invalid:3,switchedValue:10,staleValidationCleared:true};
  });
  await check('sandbox settings are memory only and reset after reload',async f=>{
    await open(f.p);await f.p.locator('[data-growth-total]').fill('16');const real=await saved(f.p);
    await f.p.goto(`${origin}/xiaoya/?garden=b&gm=test&gmPage=home`,{waitUntil:'domcontentloaded'});await f.p.locator('main.home-view').waitFor();await open(f.p);
    assert.equal(await f.p.locator('[data-growth-total]').inputValue(),'10');await f.p.locator('[data-growth-total]').fill('7');await f.p.locator('[data-growth-scale="0"]').fill('65');await press(f.p,'[data-growth-action="water"]');
    assert.match(await f.p.locator('[data-growth-status]').textContent(),/临时测试/);assert.deepEqual(await saved(f.p),real);
    await f.p.reload();await f.p.locator('main.home-view').waitFor();await open(f.p);assert.equal(await f.p.locator('[data-growth-total]').inputValue(),'10');assert.equal(await f.p.locator('[data-growth-scale="0"]').inputValue(),'40');assert.match(await f.p.locator('[data-growth-progress]').textContent(),/^0 \/ 10/);
    assert.deepEqual(await saved(f.p),real);return {realDefault:16,sandboxDefault:7,afterReload:10,realSavedDataUnchanged:true};
  });
  await check('motion controls persist export and restore without child ledger changes',async f=>{
    await open(f.p);
    assert.deepEqual(await f.p.locator('[data-growth-preset] option').evaluateAll(options=>options.map(e=>e.value).filter(Boolean).filter(v=>v!=='custom')),['gentle','playful','bouncy']);
    for(const preset of ['gentle','bouncy','playful']){
      await f.p.locator('[data-growth-preset]').selectOption(preset);
      const motion=(await saved(f.p)).motion;assert(motion&&Object.keys(motion).length>=6);
      for(const key of ['duration','sway','flex','bounce','crossfade','particles'])assert.equal(Number(await f.p.locator(`[data-growth-motion="${key}"]`).inputValue()),motion[key]);
    }
    await motionRange(f.p,'duration',2400);await motionRange(f.p,'crossfade',600);await motionRange(f.p,'duration',700);
    assert.equal(await f.p.locator('[data-growth-motion="crossfade"]').getAttribute('max'),'350');
    assert.equal(Number(await f.p.locator('[data-growth-motion="crossfade"]').inputValue()),350);
    assert.equal((await saved(f.p)).motion.crossfade,350,'Shorter animation must save its displayed crossfade limit');
    await motionRange(f.p,'duration',2400);assert.equal(await f.p.locator('[data-growth-motion="crossfade"]').getAttribute('max'),'600');
    const values={duration:1800,sway:12,flex:65,bounce:18,crossfade:300,particles:75};
    for(const [key,value]of Object.entries(values))await motionRange(f.p,key,value);
    assert.deepEqual((await saved(f.p)).motion,values);
    const exportPending=f.p.waitForEvent('download');await press(f.p,'[data-growth-action="export"]');const download=await exportPending;
    const exportPath=path.join(out,'growth-motion-settings-export.json');await download.saveAs(exportPath);
    assert.deepEqual(JSON.parse(await fsp.readFile(exportPath,'utf8')).motion,values);
    await f.p.reload();await f.p.locator('main.home-view').waitFor();await open(f.p);
    for(const [key,value]of Object.entries(values))assert.equal(Number(await f.p.locator(`[data-growth-motion="${key}"]`).inputValue()),value);
    await f.p.goto(`${origin}/xiaoya/?garden=b&gm=test&gmPage=home`,{waitUntil:'domcontentloaded'});await f.p.locator('main.home-view').waitFor();await open(f.p);
    await f.p.locator('[data-growth-preset]').selectOption('gentle');assert.deepEqual((await saved(f.p)).motion,values,'Sandbox motion touched persisted real settings');
    return {savedMotion:values,exportedMotion:true,reloadRestored:true,sandboxDoesNotPersist:true,crossfadeLimitTracksDuration:true};
  });
  await check('real animation drops sway crossfade and settle before committing water',async f=>{
    await open(f.p);await f.p.emulateMedia({reducedMotion:'no-preference'});await f.p.locator('[data-growth-total]').fill('4');
    await motionRange(f.p,'duration',2400);await motionRange(f.p,'crossfade',500);
    const initial=await geometry(f.p);assert(await f.p.locator('[data-growth-action="replay"]').isDisabled());
    await f.p.locator('[data-growth-preview]').scrollIntoViewIfNeeded();await startFrameCapture(f.p);
    await press(f.p,'[data-growth-action="water"]');
    assert(await f.p.locator('[data-growth-action="water"]').isDisabled());assert(await f.p.locator('[data-growth-action="replay"]').isDisabled());assert.equal(await waterCount(f.p),0);
    for(const state of ['drop','sway','grow']){
      await phase(f.p,state);
      if(state==='grow')await f.p.waitForFunction(()=>{const value=Number(getComputedStyle(document.querySelector('[data-growth-incoming]')).opacity);return value>.25&&value<.75;});
      await f.p.locator('[data-growth-preview]').screenshot({path:path.join(out,`motion-${state}.png`)});
    }
    await rendered(f.p);const frames=await stopFrameCapture(f.p);await fsp.writeFile(path.join(out,'motion-frames.json'),JSON.stringify(frames,null,2));
    assert.equal(await waterCount(f.p),1);const final=await geometry(f.p);anchored(final);assert.equal(final.stage,1);assert(final.scale>initial.scale);
    await f.p.locator('[data-growth-preview]').screenshot({path:path.join(out,'motion-settled.png')});
    for(const state of ['drop','sway','grow','settle'])assert(frames.some(frame=>frame.state===state),`Missing animation phase ${state}`);
    assert(frames.some(frame=>frame.b>.005)&&frames.some(frame=>frame.b<-.005),'Sway must visibly change direction');
    const blends=frames.filter(frame=>frame.opacity>.05&&frame.opacity<.95&&frame.incomingOpacity>.05&&frame.incomingOpacity<.95&&frame.outgoing!==frame.incoming);
    assert(blends.length>0,'No real decoded old/new image crossfade frames');
    assert(frames.every(frame=>frame.rootError<1.2),`Root moved during animation: ${Math.max(...frames.map(frame=>frame.rootError))}px`);
    assert(frames.some(frame=>frame.effectsVisible>0),'No water, splash or sparkle feedback was visible');
    assert(frames.filter(frame=>frame.state!=='idle').every(frame=>frame.progress.startsWith('0 / 4')),'Water committed before visual feedback completed');
    assert(frames.some(frame=>frame.state!=='idle'&&frame.phase.length>0),'Animation phases should be readable in the tool');
    await press(f.p,'[data-growth-action="replay"]');await rendered(f.p);assert.equal(await waterCount(f.p),1,'Replay must not add water');anchored(await geometry(f.p));
    const crossfadeTimings=[];
    for(const timing of [{duration:700,crossfade:350},{duration:2400,crossfade:120}]){
      await motionRange(f.p,'duration',timing.duration);await motionRange(f.p,'crossfade',timing.crossfade);await startFrameCapture(f.p);
      await press(f.p,'[data-growth-action="replay"]');await rendered(f.p);const sampled=await stopFrameCapture(f.p);
      const transition=sampled.filter(frame=>frame.state!=='idle'&&frame.incomingOpacity>0&&frame.incomingOpacity<1);
      assert(transition.length>1,'Missing native crossfade samples');
      const measured=transition.at(-1).t-transition[0].t;
      assert(Math.abs(measured-timing.crossfade)<90,`Displayed ${timing.crossfade}ms crossfade lasted ${measured}ms`);
      assert.equal(await waterCount(f.p),1,'Extreme motion replay must not add water');
      crossfadeTimings.push({...timing,measuredMs:measured,frames:transition.length});
      await fsp.writeFile(path.join(out,`motion-crossfade-${timing.duration}-${timing.crossfade}.json`),JSON.stringify(sampled,null,2));
    }
    return {phases:[...new Set(frames.map(frame=>frame.state))],frames:frames.length,blendFrames:blends.length,replayDoesNotAddWater:true,committedOnlyAtEnd:true,maximumRootErrorPx:Math.max(...frames.map(frame=>frame.rootError)),crossfadeTimings};
  });
  await check('automatic watering completes every drop and can restart at maturity',async f=>{
    await open(f.p);await f.p.locator('[data-growth-total]').fill('4');await press(f.p,'[data-growth-action="auto"]');
    await f.p.waitForFunction(()=>document.querySelector('[data-growth-progress]')?.textContent.startsWith('4 / 4')&&document.querySelector('[data-growth-preview]')?.dataset.motionState==='idle');
    assert(await f.p.locator('[data-growth-action="water"]').isDisabled());assert.match(await f.p.locator('[data-growth-action="auto"]').textContent(),/从头/);anchored(await geometry(f.p));
    await f.p.emulateMedia({reducedMotion:'no-preference'});await motionRange(f.p,'duration',1800);await press(f.p,'[data-growth-action="auto"]');await phase(f.p,'drop');
    await press(f.p,'[data-growth-action="stop"]');await rendered(f.p);assert.equal(await waterCount(f.p),0);
    await f.p.waitForTimeout(2100);assert.equal(await waterCount(f.p),0,'Stopped automatic playback resumed itself');
    return {automaticallyCompleted:4,restartFromMaturity:true,stoppedUnfinishedDropNotCounted:true};
  });
  await check('pending image decode cancellation and decode failure never commit water',async f=>{
    await open(f.p);await f.p.emulateMedia({reducedMotion:'no-preference'});await motionRange(f.p,'duration',700);
    const originalImage=await geometry(f.p);
    // Delay only detached predecode images after their real native decode. The
    // visible image and all normal visual evidence still use native decoding.
    await f.p.evaluate(()=>{
      window.qaNativeDecode=HTMLImageElement.prototype.decode;window.qaDecodeReleases=[];
      HTMLImageElement.prototype.decode=function(){
        const native=window.qaNativeDecode.call(this);
        return this.isConnected?native:native.then(()=>new Promise(resolve=>window.qaDecodeReleases.push(resolve)));
      };
    });
    await press(f.p,'[data-growth-action="auto"]');await phase(f.p,'loading');
    await f.p.waitForFunction(()=>window.qaDecodeReleases.length===2);
    assert(await f.p.locator('[data-growth-action="water"]').isDisabled());assert(await f.p.locator('[data-growth-action="replay"]').isDisabled());
    assert.equal(await waterCount(f.p),0);assert.equal(await f.p.locator('[data-growth-image]').evaluate(image=>image.currentSrc),originalImage.src);
    await press(f.p,'[data-growth-action="stop"]');await rendered(f.p);
    await f.p.evaluate(()=>{HTMLImageElement.prototype.decode=window.qaNativeDecode;for(const resolve of window.qaDecodeReleases)resolve();delete window.qaNativeDecode;delete window.qaDecodeReleases;});
    await f.p.waitForTimeout(1100);assert.equal(await waterCount(f.p),0,'A cancelled decode resumed auto watering');
    await f.p.evaluate(()=>{
      const decode=HTMLImageElement.prototype.decode;let fail=true;
      HTMLImageElement.prototype.decode=function(){
        const native=decode.call(this);if(this.isConnected||!fail)return native;
        fail=false;return native.then(()=>{throw new DOMException('QA decode failure','EncodingError');});
      };
      window.qaRestoreDecode=()=>{HTMLImageElement.prototype.decode=decode;delete window.qaRestoreDecode;};
    });
    await press(f.p,'[data-growth-action="water"]');await rendered(f.p);
    assert.equal(await waterCount(f.p),0);assert.match(await f.p.locator('[data-growth-image-error]').textContent(),/未加载/);
    await f.p.evaluate(()=>window.qaRestoreDecode());await press(f.p,'[data-growth-action="water"]');await rendered(f.p);
    assert.equal(await waterCount(f.p),1);anchored(await geometry(f.p));
    return {pendingDecodeCancelled:true,lateDecodeDoesNotResumeAuto:true,injectedDecodeFailureRecovered:true,nativeDecodeThenTestDelay:true};
  });
  await check('unfinished animation cancels on stop edits flower tab close and visibility',async f=>{
    await open(f.p);await press(f.p,'[data-growth-action="water"]');await rendered(f.p);assert.equal(await waterCount(f.p),1);
    await f.p.emulateMedia({reducedMotion:'no-preference'});await motionRange(f.p,'duration',1800);const cancelled=[];
    async function start(){await press(f.p,'[data-growth-action="water"]');await phase(f.p,'drop');}
    async function remains(expectedWater){await rendered(f.p);assert.equal(await waterCount(f.p),expectedWater);await f.p.waitForTimeout(1950);assert.equal(await waterCount(f.p),expectedWater,'Cancelled animation callback changed water');}
    await start();await press(f.p,'[data-growth-action="stop"]');await remains(1);cancelled.push('stop');
    await start();await motionRange(f.p,'sway',10);await remains(1);cancelled.push('motion edit');
    await start();await f.p.locator('[data-growth-total]').fill('12');await remains(1);cancelled.push('growth edit');
    await start();await press(f.p,'[data-growth-action="next"]');await remains(0);cancelled.push('flower');
    await press(f.p,'[data-growth-action="water"]');await rendered(f.p);assert.equal(await waterCount(f.p),1);
    await start();await press(f.p,'[data-gm-tab="music"]');await press(f.p,'[data-gm-tab="growth"]');await remains(1);cancelled.push('tab');
    await start();await press(f.p,'[data-gm-action="close"]');await open(f.p);await remains(1);cancelled.push('close');
    await start();await f.p.evaluate(()=>{
      Object.defineProperty(document,'hidden',{configurable:true,value:true});Object.defineProperty(document,'visibilityState',{configurable:true,value:'hidden'});document.dispatchEvent(new Event('visibilitychange'));
    });
    await remains(1);await f.p.evaluate(()=>{delete document.hidden;delete document.visibilityState;document.dispatchEvent(new Event('visibilitychange'));});cancelled.push('synthetic visibilitychange');
    await f.p.locator('[data-growth-slow]').check();await start();await press(f.p,'[data-growth-action="stop"]');await rendered(f.p);assert.equal(await waterCount(f.p),1);cancelled.push('slow playback stop');
    return {cancelled,completedWaterPreserved:1,visibilityEventSimulated:true};
  });
  await check('reduced motion completes quickly without sway and supports replay',async f=>{
    await open(f.p);await f.p.locator('[data-growth-total]').fill('4');await motionRange(f.p,'duration',2400);await startFrameCapture(f.p);
    const start=Date.now();await press(f.p,'[data-growth-action="water"]');await rendered(f.p);const elapsed=Date.now()-start,frames=await stopFrameCapture(f.p);
    assert.equal(await waterCount(f.p),1);assert(elapsed<1500,`Reduced motion retained full duration: ${elapsed}ms`);
    assert(frames.every(frame=>Math.abs(frame.b)<.001&&Math.abs(frame.c)<.001),'Reduced motion rotated or skewed the flower');
    assert(frames.every(frame=>frame.effectsVisible===0),'Reduced motion showed flying visual effects');
    assert(!frames.some(frame=>frame.state==='sway'),'Reduced motion entered sway phase');
    await press(f.p,'[data-growth-action="replay"]');await rendered(f.p);assert.equal(await waterCount(f.p),1);anchored(await geometry(f.p));
    return {configuredDuration:2400,elapsedMs:elapsed,frames:frames.length,noRotationOrSkew:true,replayDoesNotAddWater:true};
  });
  for(const width of [1180,320])await check(`layout root and full canvas at maximum scale width ${width}`,async f=>{
    await open(f.p);await f.p.locator('[data-growth-scale="0"]').fill('150');const g=await geometry(f.p);anchored(g);
    const layout=await f.p.locator('#gm-workbench').evaluate(el=>({width:el.clientWidth,scroll:el.scrollWidth,viewport:innerWidth,body:document.body.scrollWidth}));
    assert(layout.scroll<=layout.width+1&&layout.body<=layout.viewport+1,JSON.stringify(layout));
    assert(g.image.x>=g.preview.x-1&&g.image.right<=g.preview.right+1&&g.image.y>=g.preview.y-1&&g.image.bottom<=g.preview.bottom+1,'Maximum accepted scale clips full transparent canvas: '+JSON.stringify(g));
    for(const tab of await f.p.locator('[data-gm-tab]').all()){const box=await tab.boundingBox();assert(box.x>=0&&box.x+box.width<=width+1);}
    await f.p.locator('[data-growth-preview]').scrollIntoViewIfNeeded();await f.p.screenshot({path:path.join(out,`growth-${width}.png`),fullPage:true});
    await f.p.locator('[data-growth-action="export"]').scrollIntoViewIfNeeded();await f.p.screenshot({path:path.join(out,`growth-${width}-controls.png`),fullPage:true});
    for(const selector of ['[data-growth-preset]','[data-growth-motion="duration"]','[data-growth-slow]','[data-growth-action="auto"]','[data-growth-action="replay"]']){
      const control=f.p.locator(selector);await control.scrollIntoViewIfNeeded();const box=await control.boundingBox();assert(box.x>=0&&box.x+box.width<=width+1,`Motion control clipped ${selector}`);
    }
    return {width,layout,root:g.root,imageRoot:g.imageRoot,maximumScale:1.5};
  },width);
}
main().catch(error=>{process.exitCode=1;report.checks.push({name:'suite setup',status:'FAIL',error:error.stack});console.error(error);}).finally(async()=>{
  await browser?.close();if(server)await new Promise(resolve=>server.close(resolve));
  report.finishedAt=new Date().toISOString();report.result=report.checks.length&&report.checks.every(x=>x.status==='PASS')?(filter?'PASS_PARTIAL':'PASS_AUTOMATED_SCOPE'):'FAIL';
  if(fs.existsSync(out))fs.writeFileSync(path.join(out,filter?'results-partial.json':'results.json'),JSON.stringify(report,null,2));
});
