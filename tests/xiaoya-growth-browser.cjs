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
    const image=document.querySelector('[data-growth-image]');if(!image||!image.complete||!image.naturalWidth||getComputedStyle(image).visibility!=='visible')return false;
    return Math.abs(new DOMMatrix(getComputedStyle(image).transform).a-Number(image.dataset.scale))<.0001;
  });
}
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
  initialRecords={'qa-growth-child':'isolated-existing-child-record','xiaoya-english:preferences:v1':JSON.stringify({welcome:true,mic:false,guideStep:'done'}),'xiaoya-english:voice:v1':'ryan',[STORAGE_KEY]:JSON.stringify(createState()),[MEADOW_KEY]:JSON.stringify(createMeadow())};
  origin=process.env.TEST_URL?new URL(process.env.TEST_URL).origin:await serve();assert(['127.0.0.1','localhost','[::1]'].includes(new URL(origin).hostname));
  browser=await chromium.launch({channel:'msedge',headless:true,args:['--no-proxy-server','--autoplay-policy=no-user-gesture-required']});
  if(publicBuild){
    await check('public excludes growth workbench modules and candidate art',async f=>{
      assert.equal(await f.p.locator('[data-gm-action],[data-gm-tab],[data-growth-preview]').count(),0);
      const release=path.join(dist,'xiaoya','releases',expected.build);
      for(const name of ['gm-growth.js','growth-core.js','growth-settings.js','growth-catalog.js'])assert(!fs.existsSync(path.join(release,name)),name+' leaked into public');
      assert(!fs.existsSync(path.join(dist,'xiaoya','growth')),'Unapproved candidate art leaked into public');
      assert(!f.requests.some(url=>/gm-growth|growth-catalog|\/growth\/v09\//.test(url)));
      return {excludedModules:4,excludedCandidateImages:268};
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
  for(const width of [1180,320])await check(`layout root and full canvas at maximum scale width ${width}`,async f=>{
    await open(f.p);await f.p.locator('[data-growth-scale="0"]').fill('150');const g=await geometry(f.p);anchored(g);
    const layout=await f.p.locator('#gm-workbench').evaluate(el=>({width:el.clientWidth,scroll:el.scrollWidth,viewport:innerWidth,body:document.body.scrollWidth}));
    assert(layout.scroll<=layout.width+1&&layout.body<=layout.viewport+1,JSON.stringify(layout));
    assert(g.image.x>=g.preview.x-1&&g.image.right<=g.preview.right+1&&g.image.y>=g.preview.y-1&&g.image.bottom<=g.preview.bottom+1,'Maximum accepted scale clips full transparent canvas: '+JSON.stringify(g));
    for(const tab of await f.p.locator('[data-gm-tab]').all()){const box=await tab.boundingBox();assert(box.x>=0&&box.x+box.width<=width+1);}
    await f.p.locator('[data-growth-preview]').scrollIntoViewIfNeeded();await f.p.screenshot({path:path.join(out,`growth-${width}.png`),fullPage:true});
    await f.p.locator('[data-growth-action="export"]').scrollIntoViewIfNeeded();await f.p.screenshot({path:path.join(out,`growth-${width}-controls.png`),fullPage:true});
    return {width,layout,root:g.root,imageRoot:g.imageRoot,maximumScale:1.5};
  },width);
}
main().catch(error=>{process.exitCode=1;report.checks.push({name:'suite setup',status:'FAIL',error:error.stack});console.error(error);}).finally(async()=>{
  await browser?.close();if(server)await new Promise(resolve=>server.close(resolve));
  report.finishedAt=new Date().toISOString();report.result=report.checks.length&&report.checks.every(x=>x.status==='PASS')?(filter?'PASS_PARTIAL':'PASS_AUTOMATED_SCOPE'):'FAIL';
  if(fs.existsSync(out))fs.writeFileSync(path.join(out,filter?'results-partial.json':'results.json'),JSON.stringify(report,null,2));
});
