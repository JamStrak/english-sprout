/* Seed inventory acceptance: build:dev first, then node tests/xiaoya-seed-inventory-browser.cjs.
 * Uses disposable browser contexts and the GM memory sandbox, never a child's
 * profile or microphone. Speech scores are simulations, not ASR validation. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const http = require('node:http');
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/Jam/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root = path.resolve(__dirname, '..');
const dist = path.resolve(root, process.env.XIAOYA_DIST_DIR || 'dist');
const out = path.resolve(root, process.env.XIAOYA_INVENTORY_TEST_OUT || 'test-results/xiaoya-v027-inventory');
const filter = process.env.XIAOYA_TEST_FILTER ? new RegExp(process.env.XIAOYA_TEST_FILTER) : null;
const forbidden = /(?:\/(?:speech|models?)\/|\/speech-local\.js|\.(?:onnx|wasm)(?:\?|$)|vosk|whisper)/i;
const mime = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.webmanifest':'application/manifest+json','.webp':'image/webp','.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml','.mp3':'audio/mpeg'};
const report = {startedAt:new Date().toISOString(),scope:{isolatedContexts:true,realStorageUnchanged:true,microphoneUsed:false,realSpeechAssessmentTested:false},checks:[]};
let browser, server, origin, expected;

async function serve() {
  server = http.createServer(async(req,res)=>{
    try {
      let name = decodeURIComponent(new URL(req.url,'http://localhost').pathname); if(name.endsWith('/'))name+='index.html';
      const file=path.resolve(dist,'.'+name),relative=path.relative(dist,file);
      if(relative.startsWith('..')||path.isAbsolute(relative))return res.writeHead(403).end();
      const stat=await fsp.stat(file);if(!stat.isFile())throw Error('Not a file');
      let start=0,end=stat.size-1,status=200;
      const headers={'Content-Type':mime[path.extname(file)]||'application/octet-stream','Cache-Control':'no-cache','Accept-Ranges':'bytes'};
      if(req.headers.range){
        const range=/^bytes=(\d*)-(\d*)$/.exec(req.headers.range);
        if(!range||(!range[1]&&!range[2]))return res.writeHead(416).end();
        if(range[1]){start=Number(range[1]);if(range[2])end=Math.min(end,Number(range[2]));}else start=Math.max(0,stat.size-Number(range[2]));
        if(start>end||start>=stat.size)return res.writeHead(416).end();
        status=206;headers['Content-Range']=`bytes ${start}-${end}/${stat.size}`;
      }
      headers['Content-Length']=end-start+1;res.writeHead(status,headers);
      if(req.method==='HEAD')res.end();else fs.createReadStream(file,{start,end}).on('error',()=>res.destroy()).pipe(res);
    }catch{if(!res.headersSent)res.writeHead(404);res.end('Missing test candidate');}
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  return `http://127.0.0.1:${server.address().port}`;
}
const snapshot=p=>p.evaluate(()=>Object.fromEntries(Object.keys(localStorage).sort().map(key=>[key,localStorage.getItem(key)])));
async function fixture(width=1180){
  const c=await browser.newContext({viewport:{width,height:900},timezoneId:'Asia/Shanghai',serviceWorkers:'block',reducedMotion:'reduce',hasTouch:width<600,isMobile:width<600});
  const requests=[],errors=[],access={microphone:0};
  await c.exposeBinding('qaInventoryMicrophone',()=>access.microphone++);
  c.on('request',r=>requests.push(r.url()));
  await c.route('**/*',route=>new URL(route.request().url()).origin===origin&&!forbidden.test(route.request().url())?route.continue():route.abort('blockedbyclient'));
  await c.addInitScript(({origin})=>{
    if(location.origin!==origin)return;
    localStorage.setItem('qa-inventory-original-child','keep-this-child-record');
    localStorage.setItem('xiaoya-english:preferences:v1',JSON.stringify({welcome:true,mic:false,guideStep:'done',audioControls:{music:false,reminders:false}}));
    const qa=window.qaInventory={mic:0,play:[],errors:[]};
    if(navigator.mediaDevices)navigator.mediaDevices.getUserMedia=()=>{qa.mic++;void window.qaInventoryMicrophone();throw Error('Seed inventory acceptance must never open a microphone');};
    const play=HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play=function(){this.playbackRate=4;const item={url:this.currentSrc||this.src,playing:false};qa.play.push(item);this.addEventListener('playing',()=>{item.url=this.currentSrc||this.src;item.playing=true;},{once:true});return play.call(this);};
    addEventListener('unhandledrejection',event=>qa.errors.push(String(event.reason)));
  },{origin});
  const p=await c.newPage();p.setDefaultTimeout(18000);p.on('pageerror',error=>errors.push(error.message));
  await p.goto(`${origin}/xiaoya/?garden=b&gm=test&gmPage=home`,{waitUntil:'domcontentloaded'});
  await p.locator('[data-chapter-home]').waitFor();
  assert.equal(await p.locator('meta[name="xiaoya-build"]').getAttribute('content'),expected.build);
  return {c,p,width,requests,errors,access,child:await snapshot(p)};
}
async function bridge(p,method,...args){
  return p.evaluate(async({method,args})=>{
    const {gmBridge}=await import(new URL('experience.js',document.querySelector('script[type="module"][src]').src));
    return gmBridge[method](...args);
  },{method,args});
}
async function storage(p,key){
  return p.evaluate(async key=>{
    const {appStorage}=await import(new URL('runtime.js',document.querySelector('script[type="module"][src]').src));
    return JSON.parse(appStorage.getItem(key)||'null');
  },key);
}
async function press(p,selector){
  const el=p.locator(selector).first();await el.waitFor({state:'visible'});assert(await el.isEnabled(),`Disabled ${selector}`);await el.scrollIntoViewIfNeeded();
  const hit=await el.evaluate(e=>{const r=e.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2;return{x,y,hit:e.contains(document.elementFromPoint(x,y))};});
  assert(hit.hit,`Pointer intercepted: ${selector}`);
  if(p.viewportSize().width<600)await p.touchscreen.tap(hit.x,hit.y);else await p.mouse.click(hit.x,hit.y);
}
async function clean(f){
  assert.equal(f.access.microphone,0);assert.equal(await f.p.evaluate(()=>qaInventory.mic),0);
  assert.deepEqual(f.requests.filter(url=>forbidden.test(url)),[],'No speech model/runtime should load');
  assert.deepEqual(f.errors,[]);assert.deepEqual(await f.p.evaluate(()=>qaInventory.errors),[]);
  assert.deepEqual(await snapshot(f.p),f.child,'Sandbox changed the real child records');
}
async function check(name,run,width){
  if(filter&&!filter.test(name))return;
  let f;const start=Date.now();
  try{f=await fixture(width);const detail=await run(f);await clean(f);report.checks.push({name,status:'PASS',ms:Date.now()-start,detail});console.log(`PASS ${name}`);}
  catch(error){process.exitCode=1;report.checks.push({name,status:'FAIL',error:error.stack});console.error(`FAIL ${name}\n${error.stack}`);if(f)await f.p.screenshot({path:path.join(out,`${name.replace(/[^a-z0-9]+/gi,'-')}.png`),fullPage:true}).catch(()=>{});}
  finally{if(f)await f.c.close();}
}

async function garden(p){
  return p.evaluate(async()=>{
    const base=document.querySelector('script[type="module"][src]').src;
    const [{appStorage},m,{getEconomySettings}]=await Promise.all(['runtime.js','garden-meadow.js','economy-settings.js'].map(name=>import(new URL(name,base))));
    const state=m.validateMeadow(JSON.parse(appStorage.getItem(m.MEADOW_KEY)));
    return {state,owned:m.ownedSeeds(state),challenge:m.pendingChallengeSeeds(state),unlimited:m.hasUnlimitedResources(state),packPrice:getEconomySettings().packPrice};
  });
}
async function seedGarden(p){
  await p.evaluate(async()=>{
    const base=document.querySelector('script[type="module"][src]').src;
    const [{appStorage},m]=await Promise.all(['runtime.js','garden-meadow.js'].map(name=>import(new URL(name,base))));
    let state=m.createMeadow();delete state.testMode;
    // A normal, validated economy inside GM memory also tests actual debits.
    for(let i=1;i<=3;i++)state=m.rewardChallenge(state,{unitId:`challenge-${i}`,date:'2026-10-22'},.99);
    for(const random of [.03,.22,.63])state=m.openSeedPack(state,random,.99);
    appStorage.setItem(m.MEADOW_KEY,JSON.stringify(m.validateMeadow(state)));
  });
  // The normal shop transaction reads the injected GM ledger into UI state.
  await bridge(p,'navigate','shop');await p.locator('[data-action="shop-pack"]').waitFor();
  await bridge(p,'navigate','garden');await p.locator('[data-meadow-field]').waitFor();
  const state=await garden(p);assert.equal(state.owned.length,3);assert.equal(state.challenge.length,3);assert.equal(state.unlimited,false);return state;
}
async function inventory(p){await press(p,'[data-action="meadow-inventory"]');await p.locator('.modal-seeds').waitFor();}
async function point(p,x=.7,y=.7){
  const r=await p.locator('[data-meadow-field]').boundingBox();assert(r);return{x:r.x+r.width*x,y:r.y+r.height*y};
}
async function clickPoint(p,at){
  if(p.viewportSize().width<600)await p.touchscreen.tap(at.x,at.y);else await p.mouse.click(at.x,at.y);
}
async function waitPlants(p,count){await p.waitForFunction(count=>document.querySelectorAll('[data-meadow-plant]').length===count,count);}
async function dragSeed(f,key,to,{cancel=false}={}){
  const p=f.p,item=p.locator(`[data-inventory-seed="${key}"]`);await item.scrollIntoViewIfNeeded();
  const r=await item.boundingBox();assert(r);const start={x:r.x+r.width/2,y:r.y+r.height/2};
  if(f.width<600){
    const cdp=await f.c.newCDPSession(p),touch=pt=>[{x:pt.x,y:pt.y,radiusX:8,radiusY:8,force:.7,id:1}];
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:touch(start)});
    for(let i=1;i<=8;i++)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:touch({x:start.x+(to.x-start.x)*i/8,y:start.y+(to.y-start.y)*i/8})});
    assert.equal(await p.locator('.meadow-drag-ghost').count(),1,'Touch drag has no seed feedback');
    await cdp.send('Input.dispatchTouchEvent',{type:cancel?'touchCancel':'touchEnd',touchPoints:[]});await cdp.detach();
  }else{
    await p.mouse.move(start.x,start.y);await p.mouse.down();await p.mouse.move(to.x,to.y,{steps:12});
    assert.equal(await p.locator('.meadow-drag-ghost').count(),1,'Mouse drag has no seed feedback');
    await p.mouse.up();
  }
}
async function touchActionGesture(f,selector,{cancel=false,move=false}={}){
  const button=f.p.locator(selector).first();await button.scrollIntoViewIfNeeded();
  const r=await button.boundingBox();assert(r);const x=r.x+r.width/2,y=r.y+r.height/2;
  const cdp=await f.c.newCDPSession(f.p),touch=x=>[{x,y,radiusX:8,radiusY:8,force:.7,id:1}];
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:touch(x)});
  if(move){
    await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:touch(x-24)});
    await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:touch(x)});
  }
  await cdp.send('Input.dispatchTouchEvent',{type:cancel?'touchCancel':'touchEnd',touchPoints:[]});await cdp.detach();
}
async function noOverflow(p){
  const box=await p.evaluate(()=>({viewport:innerWidth,document:document.documentElement.scrollWidth,body:document.body.scrollWidth}));
  assert(box.document<=box.viewport+1&&box.body<=box.viewport+1,JSON.stringify(box));return box;
}
async function decode(p,selector){
  return p.locator(selector).evaluateAll(async images=>Promise.all(images.map(async image=>{await image.decode();return{url:image.currentSrc,width:image.naturalWidth,height:image.naturalHeight};})));
}
async function assertPlacement(p,id,x,y){
  const {state}=await garden(p),plant=state.plants.find(item=>item.seedId===id);assert(plant,`Missing planted ${id}`);
  assert(Math.abs(plant.x-x)<.015&&Math.abs(plant.y-y)<.015,`Unexpected position ${JSON.stringify(plant)}`);return plant;
}

async function main(){
  await fsp.mkdir(out,{recursive:true});expected=JSON.parse(await fsp.readFile(path.join(dist,'xiaoya/version.json'),'utf8'));report.candidate=expected;
  assert.equal(expected.channel,'internal','Run npm run build:dev before this test');
  origin=await serve();browser=await chromium.launch({channel:'msedge',headless:true,args:['--no-proxy-server','--autoplay-policy=no-user-gesture-required']});

  await check('inventory selects any owned seed and consumes only when planted',async f=>{
    const p=f.p,initial=await seedGarden(p);await inventory(p);
    assert.equal(await p.locator('[data-inventory-seed]').count(),6);
    assert.equal(await p.locator('[data-inventory-seed^="challenge:"]').count(),3);
    const art=await decode(p,'.inventory-seed-art img');assert(art.every(image=>image.width>0));
    await p.screenshot({path:path.join(out,'inventory-desktop.png'),fullPage:true});
    await press(p,'[data-inventory-seed="owned:seed-1"]');await p.locator('.modal-seeds').waitFor({state:'hidden'});
    let current=await garden(p);assert.equal(current.state.pendingSeed.id,'seed-1');assert.equal(current.owned.length,3);assert.equal(current.state.plants.length,0);assert.equal(current.state.shells,initial.state.shells);
    const at=await point(p,.72,.72);await p.mouse.move(at.x,at.y);
    await p.locator('.meadow-seed-cursor').waitFor();
    const cursor=await p.locator('.meadow-seed-cursor').evaluate(e=>({x:parseFloat(e.style.left),y:parseFloat(e.style.top),events:getComputedStyle(e).pointerEvents}));
    assert(Math.abs(cursor.x-at.x)<1&&Math.abs(cursor.y-at.y)<1);assert.equal(cursor.events,'none');
    await decode(p,'.meadow-seed-cursor img');assert(await p.locator('.meadow-seed-cursor').isVisible());
    await p.screenshot({path:path.join(out,'seed-follows-mouse.png')});
    await p.mouse.move(4,150);assert.equal(await p.locator('.meadow-seed-cursor').count(),0,'Cursor must disappear outside the field');
    await p.mouse.move(at.x,at.y);await clickPoint(p,at);await waitPlants(p,1);await assertPlacement(p,'seed-1',.72,.72);
    current=await garden(p);assert.equal(current.owned.length,2);assert.equal(current.state.pendingSeed,null);assert.equal(current.state.shells,initial.state.shells);assert.equal(await p.locator('.meadow-seed-cursor').count(),0);
    await inventory(p);assert.equal(await p.locator('[data-inventory-seed="owned:seed-1"]').count(),0);
    await press(p,'[data-inventory-seed="owned:seed-3"]');await p.locator('.modal-seeds').waitFor({state:'hidden'});
    await clickPoint(p,await point(p,.3,.58));await waitPlants(p,2);await assertPlacement(p,'seed-3',.3,.58);
    assert.deepEqual((await garden(p)).state.plants.map(plant=>plant.seedId),['seed-1','seed-3']);
    return{owned:3,challenge:3,plantingOrder:['seed-1','seed-3'],onlyGroundConsumes:true,cursor};
  });

  await check('current pending seed can be selected again from inventory',async f=>{
    const p=f.p,initial=await seedGarden(p);assert.equal(initial.state.pendingSeed.id,'seed-3');await inventory(p);
    await press(p,'[data-inventory-seed="owned:seed-3"]');await p.locator('.modal-seeds').waitFor({state:'hidden'});
    assert.equal((await garden(p)).owned.length,3);await clickPoint(p,await point(p,.52,.74));await waitPlants(p,1);
    assert.equal((await garden(p)).state.plants[0].seedId,'seed-3');return{selectedAgain:true};
  });

  for(const width of [1180,390])await check(`current pending seed can be dragged directly from inventory at ${width}`,async f=>{
    const p=f.p,initial=await seedGarden(p);assert.equal(initial.state.pendingSeed.id,'seed-3');await inventory(p);
    await dragSeed(f,'owned:seed-3',await point(p,.58,.72));await p.locator('.modal-seeds').waitFor({state:'hidden'});await waitPlants(p,1);
    await assertPlacement(p,'seed-3',.58,.72);const current=await garden(p);
    assert.equal(current.owned.length,2);assert.equal(current.state.shells,initial.state.shells);
    return{width,currentSeedDraggable:true,onlyGroundConsumes:true};
  },width);

  for(const width of [1180,390,320])await check(`seed panel closes from backdrop and fixed close button at ${width}`,async f=>{
    const p=f.p;await seedGarden(p);await inventory(p);await noOverflow(p);
    const r=await p.locator('.modal-close').boundingBox();assert(r&&r.y>=0&&r.y+r.height<=900,'Close button is outside viewport');
    await clickPoint(p,{x:4,y:150});await p.locator('.modal-seeds').waitFor({state:'hidden'});
    await inventory(p);await press(p,'.modal-close');await p.locator('.modal-seeds').waitFor({state:'hidden'});
    await press(p,'[data-action="meadow-collection"]');await p.locator('.modal-collection').waitFor();await noOverflow(p);
    await clickPoint(p,{x:4,y:150});await p.locator('.modal-collection').waitFor({state:'hidden'});
    await inventory(p);await p.screenshot({path:path.join(out,`inventory-${width}.png`),fullPage:true});
    return{width,backdrop:true,headerClose:true,inventoryCount:await p.locator('[data-inventory-seed]').count()};
  },width);

  for(const width of [1180,390,320])await check(`direct inventory drag plants while outside drag preserves seed at ${width}`,async f=>{
    const p=f.p;await seedGarden(p);await inventory(p);const initial=await garden(p);
    await dragSeed(f,'owned:seed-1',{x:5,y:120});
    await p.locator('.modal-seeds').waitFor();assert.equal(await p.locator('.meadow-drag-ghost').count(),0);assert.deepEqual((await garden(p)).state,initial.state,'Outside drop changed the inventory');
    // Let the intentional post-drag compatibility-click suppression finish.
    await p.waitForTimeout(500);
    const at=await point(p,.75,.8);await dragSeed(f,'owned:seed-1',at);await p.locator('.modal-seeds').waitFor({state:'hidden'});await waitPlants(p,1);
    await assertPlacement(p,'seed-1',.75,.8);assert.equal((await garden(p)).owned.length,2);
    assert.equal(await p.locator('.meadow-drag-ghost').count(),0);await noOverflow(p);
    await p.waitForTimeout(500);await inventory(p);const key=(await garden(p)).challenge[2].milestoneId;
    await dragSeed(f,`challenge:${key}`,await point(p,.26,.62));await p.locator('.modal-seeds').waitFor({state:'hidden'});await waitPlants(p,2);
    const current=await garden(p);assert.equal(current.owned.length,2);assert.equal(current.challenge.length,2);assert.equal(current.state.purchases.at(-1).source,'challenge');assert.equal(current.state.plants.at(-1).seedId,current.state.purchases.at(-1).id);assert.equal(current.state.shells,initial.state.shells);
    await p.screenshot({path:path.join(out,`planted-drag-${width}.png`),fullPage:true});
    await press(p,'[data-action="shop"]');await p.locator('[data-action="shop-pack"]').waitFor();
    assert.deepEqual((await garden(p)).state,current.state,'Opening the shop changed the seed ledger');
    return{width,mouse:width>=600,touch:width<600,outsidePreserved:true,firstInventoryTap:true,firstShopTap:true,plants:current.state.plants};
  },width);

  for(const width of [390,320])await check(`touch selection then field tap and cancelled gesture at ${width}`,async f=>{
    const p=f.p;await seedGarden(p);await inventory(p);const initial=await garden(p);
    await dragSeed(f,'owned:seed-1',await point(p,.64,.7),{cancel:true});await p.locator('.modal-seeds').waitFor();
    assert.equal(await p.locator('.meadow-drag-ghost').count(),0);assert.deepEqual((await garden(p)).state,initial.state);
    await p.waitForTimeout(500);await press(p,'[data-inventory-seed="owned:seed-2"]');await p.locator('.modal-seeds').waitFor({state:'hidden'});
    assert.equal((await garden(p)).owned.length,3);assert.equal(await p.locator('.meadow-seed-cursor').count(),0,'Touch must not retain a mouse cursor');
    await clickPoint(p,await point(p,.48,.76));await waitPlants(p,1);await assertPlacement(p,'seed-2',.48,.76);await noOverflow(p);
    return{width,cancelPreserved:true,tapToPlace:true};
  },width);

  for(const width of [390,320])await check(`touch toolbar cancellation and consecutive pours remain single actions at ${width}`,async f=>{
    const p=f.p;await seedGarden(p);const initial=await garden(p);
    await touchActionGesture(f,'[data-action="meadow-inventory"]',{cancel:true});
    assert.equal(await p.locator('.modal-seeds').count(),0,'Cancelled touch opened inventory');
    await touchActionGesture(f,'[data-action="meadow-inventory"]',{move:true});
    assert.equal(await p.locator('.modal-seeds').count(),0,'Moved touch opened inventory');
    await inventory(p);await dragSeed(f,'owned:seed-1',await point(p,.54,.7));
    await p.locator('.modal-seeds').waitFor({state:'hidden'});await waitPlants(p,1);
    await press(p,'[data-action="meadow-can"]');await p.locator('[data-water-plant="plant-1"]').waitFor();
    for(let count=1;count<=3;count++){
      await press(p,'[data-water-plant="plant-1"]');
      await p.locator(`[data-meadow-plant="plant-1"][data-waterings="${count}"]`).waitFor();
      // Allow the reduced-motion growth transition and any compatibility click.
      await p.waitForTimeout(500);
      const current=await garden(p);assert.equal(current.state.plants[0].waterings,count);
      assert.equal(current.state.water,initial.state.water-count,'One touch must consume exactly one drop');
      assert.equal(current.state.shells,initial.state.shells);
    }
    await touchActionGesture(f,'[data-action="shop"]',{cancel:true});
    assert.equal(await p.locator('[data-action="shop-pack"]').count(),0,'Cancelled shop touch navigated');
    await press(p,'[data-action="shop"]');await p.locator('[data-action="shop-pack"]').waitFor();
    return{width,cancelAndMoveDoNotActivate:true,pours:3,waterSpent:3,firstTapAfterCancel:true};
  },width);

  await check('blindbox retains six choices with inventory and double activation charges once',async f=>{
    const p=f.p,initial=await seedGarden(p);await bridge(p,'navigate','shop');await press(p,'[data-action="shop-pack"]');
    await p.locator('[data-blindbox-phase="choose"]').waitFor();assert.equal(await p.locator('[data-mystery-bag]').count(),6);
    await p.screenshot({path:path.join(out,'six-bags-with-inventory.png'),fullPage:true});
    const bag=p.locator('[data-mystery-bag="2"]');await bag.scrollIntoViewIfNeeded();const r=await bag.boundingBox();
    await p.mouse.dblclick(r.x+r.width/2,r.y+r.height/2,{delay:30});await p.locator('[data-blindbox-phase="revealed"]').waitFor();
    const current=await garden(p);assert.equal(current.state.purchases.length,initial.state.purchases.length+1);assert.equal(current.state.shells,initial.state.shells-initial.packPrice);assert.equal(current.owned.length,4);
    await bridge(p,'navigate','shop');await press(p,'[data-action="shop-pack"]');await p.locator('[data-blindbox-phase="choose"]').waitFor();assert.equal(await p.locator('[data-mystery-bag]').count(),6);
    await noOverflow(p);return{existingInventory:3,inventoryAfter:4,packPrice:initial.packPrice,debitedOnce:true,choices:6};
  });
}
main().catch(error=>{process.exitCode=1;report.fatal=error.stack;console.error(error);}).finally(async()=>{
  if(browser)await browser.close();if(server)await new Promise(resolve=>server.close(resolve));
  report.finishedAt=new Date().toISOString();await fsp.mkdir(out,{recursive:true});await fsp.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));
  console.log(`Inventory report: ${path.join(out,'report.json')}`);
});
