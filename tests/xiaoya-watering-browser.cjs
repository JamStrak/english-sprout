// Isolated Edge checks for B's explicit watering drops. Fixtures use the shipped
// pure economy model; clicks are real touch input with browser hit testing.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'C:/Users/Jam/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const origin=new URL(process.env.TEST_URL||'http://127.0.0.1:24756').origin;
if(!['127.0.0.1','localhost','[::1]'].includes(new URL(origin).hostname))throw Error('Use an isolated loopback server.');
const out=path.resolve(process.env.XIAOYA_WATERING_TEST_OUT||path.join(__dirname,'../test-results/xiaoya-v121-watering'));
const filter=process.env.XIAOYA_TEST_FILTER?new RegExp(process.env.XIAOYA_TEST_FILTER):null;
const B='xiaoya-english:meadow:v1',A='xiaoya-english:garden:v1',STATE='xiaoya-english:state:v1';
const report={origin,scope:'Disposable Edge contexts only. Legal model-generated fixtures, native touch and CDP touch drags, real Web Locks, native local audio at 4x. No user profile, microphone, ASR, child data or external requests. Background/page lifecycle events are synthesized; touch input is native browser input. Browser emulation is not a physical-device test.',checks:[]};
let browser;
const touchSessions=new WeakMap();
async function touchSession(p){if(!touchSessions.has(p))touchSessions.set(p,await p.context().newCDPSession(p));return touchSessions.get(p);}
async function nativeTap(p,point){
  if(process.env.XIAOYA_TOUCH_BACKEND==='cdp'){
    const session=await touchSession(p);
    await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...point,radiusX:5,radiusY:5,force:1}]});
    await session.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  }else await p.touchscreen.tap(point.x,point.y);
}
const save=()=>fs.writeFileSync(path.join(out,filter?'results-filtered.json':'results.json'),JSON.stringify(report,null,2));
const state=p=>p.evaluate(key=>JSON.parse(localStorage.getItem(key)||'null'),B);
const click=async(p,action)=>{const loc=p.locator(`[data-action="${action}"]`).first();if(process.env.XIAOYA_TOUCH_BACKEND==='cdp')await nativeTap(p,await center(loc));else await loc.tap();};
const drop=(p,id)=>p.locator(`[data-water-plant="${id}"]`);
const plant=(flowerId='daisy',waterings=0,x=.5,y=.7)=>({flowerId,waterings,x,y});

async function fixture({width=390,height=844,motion='reduce',serviceWorkers='block',desktop=false}={}){
  const c=await browser.newContext({viewport:{width,height},timezoneId:'Asia/Shanghai',isMobile:!desktop,hasTouch:!desktop,reducedMotion:motion,serviceWorkers});
  const requests=[],errors=[];
  c.on('request',r=>requests.push({url:r.url(),method:r.method()}));
  c.on('page',p=>p.on('pageerror',e=>errors.push(e.message)));
  await c.route('**/*',r=>new URL(r.request().url()).origin===origin?r.continue():r.abort('blockedbyclient'));
  await c.route(/\/(?:xiaoya\/speech\/|speech\/(?:vosk-|model-))/,r=>r.abort('failed'));
  await c.addInitScript(origin=>{
    if(location.origin!==origin)return;
    const q=window.qaWatering={errors:[],audios:[],plays:[],gestures:[]};
    let downTarget=null;
    for(const type of ['pointerdown','pointerup','pointercancel','touchstart','touchend','click'])document.addEventListener(type,e=>{
      if(type==='pointerdown')downTarget=e.target;
      const item={type,time:performance.now(),target:e.target.closest('[data-water-plant],[data-meadow-plant],[data-meadow-tool],[data-action]')?.outerHTML.slice(0,300),x:e.clientX,y:e.clientY,pointerType:e.pointerType,pointerId:e.pointerId,isPrimary:e.isPrimary,button:e.button,downConnected:downTarget?.isConnected,sameDownTarget:downTarget===e.target};q.gestures.push(item);
      queueMicrotask(()=>Object.assign(item,{defaultPrevented:e.defaultPrevented,afterConnected:e.target.isConnected,afterDownConnected:downTarget?.isConnected}));
    },true);
    addEventListener('error',e=>{if(e.message)q.errors.push(e.message);});
    addEventListener('unhandledrejection',e=>q.errors.push(String(e.reason)));
    const NativeAudio=Audio;
    window.Audio=function(...args){const a=new NativeAudio(...args),item={url:String(args[0]||''),ended:false,error:false};a.playbackRate=4;q.audios.push(item);a.addEventListener('playing',()=>q.plays.push(item.url));a.addEventListener('ended',()=>item.ended=true);a.addEventListener('error',()=>item.error=true);return a;};window.Audio.prototype=NativeAudio.prototype;
  },origin);
  const p=await c.newPage();p.setDefaultTimeout(15000);
  try{
    await p.goto(origin+'/xiaoya/?garden=b');await p.locator('.home-view').waitFor();
    const build=await p.locator('meta[name="xiaoya-build"]').getAttribute('content'),version=await p.locator('meta[name="xiaoya-version"]').getAttribute('content');
    assert.equal(version,'0.12.1');
    if(report.build)assert.equal(build,report.build,'Do not replace the build during a run.');else Object.assign(report,{build,version});
    return{c,p,requests,errors};
  }catch(e){await c.close();throw e;}
}
async function seed(p,{plants=[plant()],waterRounds=null,pending=false}={}){
  assert.equal(plants[0]?.flowerId,'daisy','The new-user first pack stays a daisy.');
  const value=await p.evaluate(async({key,plants,waterRounds,pending})=>{
    const m=await import(new URL('garden-meadow.js',document.querySelector('script[type="module"][src]').src));
    const date='2026-10-18';let s=m.rewardRound(m.createMeadow(),{roundId:'qa-water-starter',eventId:'hello-everyone',date});
    const n=plants.length+Number(pending),spent=plants.reduce((sum,p)=>sum+p.waterings,0);
    for(let i=0;i<Math.max(0,n-1);i++){const roundId=`qa-water-shells-${i}`;s=m.rewardRound(s,{roundId,eventId:'food-water',date});s=m.claimReward(s,roundId,'shells');}
    const rounds=waterRounds===null?Math.max(0,Math.ceil((spent+20-5)/5)):waterRounds;
    for(let i=0;i<rounds;i++){const roundId=`qa-water-water-${i}`;s=m.rewardRound(s,{roundId,eventId:'food-water',date});s=m.claimReward(s,roundId,'water');}
    for(let i=0;i<n;i++){
      const f=plants[i]||{flowerId:'bow-blue'},draw=(m.FLOWERS.findIndex(x=>x.id===f.flowerId)+.1)/m.FLOWERS.length;
      s=m.openSeedPack(s,draw);if(i<plants.length)s=m.plantSeed(s,{x:f.x,y:f.y});
    }
    for(let i=0;i<plants.length;i++)for(let count=0;count<plants[i].waterings;count++)s=m.waterPlant(s,`plant-${i+1}`);
    m.validateMeadow(s);localStorage.setItem(key,JSON.stringify(s));return s;
  },{key:B,plants,waterRounds,pending});
  assert.deepEqual(value.plants.map(p=>({flowerId:p.flowerId,waterings:p.waterings,x:p.x,y:p.y})),plants,'The fixture ledger must produce exactly the requested garden.');
  await p.reload();await p.locator('.home-view').waitFor();return value;
}
async function garden(p){await click(p,'garden');await p.locator('.meadow-view').waitFor();}
async function chooseCan(p){await click(p,'meadow-can');await p.waitForFunction(()=>document.querySelector('.meadow-view')?.dataset.tool==='can');}
async function bounds(locator){const b=await locator.boundingBox();assert(b,'The real touch target exists');return b;}
async function center(locator){const b=await bounds(locator);return{x:b.x+b.width/2,y:b.y+b.height/2};}
async function hit(p,id){
  const target=drop(p,id);await target.waitFor({state:'visible'});const point=await center(target);
  assert.equal(await p.evaluate(({x,y})=>document.elementFromPoint(x,y)?.closest('[data-water-plant]')?.dataset.waterPlant,point),id,`The visible drop for ${id} must receive touch, including through overlapping flowers.`);
  return point;
}
async function tapDrop(p,id){
  const before=await state(p),target=before.plants.find(x=>x.id===id);assert(before.water>0);
  const point=await hit(p,id);
  await nativeTap(p,point);
  await p.waitForFunction(({key,id,n})=>JSON.parse(localStorage.getItem(key)).plants.find(x=>x.id===id).waterings===n,{key:B,id,n:target.waterings+1});
  await p.waitForTimeout(110);const after=await state(p);
  const expected={...before,water:before.water-1,plants:before.plants.map(x=>x.id===id?{...x,waterings:x.waterings+1}:x)};
  assert.deepEqual(after,expected,'One real touch changes only this plant and spends exactly one water.');return after;
}
async function layout(p){
  await p.evaluate(async()=>Promise.all(document.getAnimations().filter(a=>Number.isFinite(a.effect?.getTiming().iterations)&&a.playState==='running').map(a=>a.finished.catch(()=>{}))));
  const size=await p.evaluate(()=>({w:innerWidth,h:innerHeight,sw:document.documentElement.scrollWidth,sh:document.documentElement.scrollHeight}));
  assert(size.sw<=size.w+1&&size.sh<=size.h+1,`Garden actions fit without page scrolling ${JSON.stringify(size)}`);
  assert(!/[A-Za-z]/.test(await p.locator('#app').innerText()));
  const field=await bounds(p.locator('[data-meadow-field]'));
  for(const id of await p.locator('[data-water-plant]:visible').evaluateAll(es=>es.map(e=>e.dataset.waterPlant))){
    const b=await bounds(drop(p,id));assert(b.width>=47&&b.height>=47,`${id} is a touch target of at least 48px`);
    assert(b.x>=field.x-1&&b.y>=field.y-1&&b.x+b.width<=field.x+field.width+1&&b.y+b.height<=field.y+field.height+1,`${id} stays inside the grass`);
    await hit(p,id);
  }
  for(const b of await p.locator('.meadow-tools button:visible,.topbar button:visible').evaluateAll(es=>es.map(e=>{const r=e.getBoundingClientRect();return{x:r.x,y:r.y,w:r.width,h:r.height};}))){assert(b.w>=47&&b.h>=47);assert(b.x>=-1&&b.y>=-1&&b.x+b.w<=size.w+1&&b.y+b.h<=size.h+1);}
}
async function shot(p,name){await p.screenshot({path:path.join(out,name+'.png'),animations:'disabled',fullPage:true});}
async function hold(p){await p.evaluate(key=>{navigator.locks.request(key,()=>new Promise(resolve=>qaWatering.release=resolve));},B);await p.waitForFunction(()=>typeof qaWatering.release==='function');}
async function queued(p,count=1){await p.waitForFunction(async({key,count})=>(await navigator.locks.query()).pending.filter(x=>x.name===key).length===count,{key:B,count});}
async function release(p){await p.evaluate(()=>qaWatering.release());await p.waitForFunction(async key=>!(await navigator.locks.query()).pending.some(x=>x.name===key),B);await p.waitForTimeout(160);}
async function touchDrag(f,from,to,{cancel=false}={}){
  const session=await touchSession(f.p);
  {
    await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...from,radiusX:5,radiusY:5,force:1}]});
    for(let i=1;i<=7;i++)await session.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:from.x+(to.x-from.x)*i/7,y:from.y+(to.y-from.y)*i/7,radiusX:5,radiusY:5,force:1}]});
    await session.send('Input.dispatchTouchEvent',{type:cancel?'touchCancel':'touchEnd',touchPoints:[]});
  }
}
async function diagnostic(p){return p.evaluate(()=>({build:document.querySelector('meta[name="xiaoya-build"]')?.content,main:document.querySelector('main')?.outerHTML,storage:Object.fromEntries(Object.keys(localStorage).filter(k=>k.startsWith('xiaoya')).map(k=>[k,localStorage.getItem(k)])),qa:qaWatering})).catch(e=>({error:e.message}));}
async function test(name,fn,options){
  if(filter&&!filter.test(name))return;let f;
  try{
    f=await fixture(options);await fn(f);assert.deepEqual(f.errors,[]);assert.deepEqual(await f.p.evaluate(()=>qaWatering.errors),[]);
    assert(!f.requests.some(r=>r.method!=='GET'||new URL(r.url).origin!==origin),'No uploads or external requests');
    assert.equal(await f.p.evaluate(key=>localStorage.getItem(key),STATE),null,'Watering does not invent learning evidence');
    assert.equal(await f.p.evaluate(key=>localStorage.getItem(key),A),null,'B watering never writes the A garden');
    report.checks.push({name,status:'PASS',diagnostic:await diagnostic(f.p)});console.log('PASS',name);
  }catch(e){report.checks.push({name,status:'FAIL',error:e.stack,diagnostic:f?await diagnostic(f.p):null});console.error('FAIL',name,e.message);if(f)await shot(f.p,`failed-${report.checks.length}`).catch(()=>{});}
  finally{save();await f?.c.close();}
}

async function run(){
  await test('Selecting the can reveals one drop per unfinished plant; each real touch waters only its owner',async({p})=>{
    const before=await seed(p,{plants:[plant('daisy',0,.25,.65),plant('tulip',2,.72,.72),plant('giant-daisy',10,.5,.8)]});await garden(p);
    assert.equal(await p.locator('[data-water-plant]').count(),0);await chooseCan(p);
    assert.deepEqual((await p.locator('[data-water-plant]').evaluateAll(es=>es.map(e=>e.dataset.waterPlant))).sort(),['plant-1','plant-2']);
    assert.deepEqual(await state(p),before,'Selecting the can itself costs nothing');
    await tapDrop(p,'plant-1');await tapDrop(p,'plant-2');await layout(p);await shot(p,'water-drops-390');
  });
  for(const motion of ['no-preference','reduce'])await test(`Water drops visibly invite touch with motion preference ${motion}`,async({p})=>{
    await seed(p);await garden(p);await chooseCan(p);await drop(p,'plant-1').waitFor();
    const animations=await drop(p,'plant-1').evaluate(e=>e.getAnimations({subtree:true}).map(a=>({duration:a.effect?.getTiming().duration,iterations:a.effect?.getTiming().iterations===Infinity?'infinite':a.effect?.getTiming().iterations,playState:a.playState})));
    if(motion==='no-preference')assert(animations.some(a=>a.playState==='running'&&a.iterations==='infinite'),'The visible water drop has an ongoing invitation animation');
    else assert(!animations.some(a=>a.playState==='running'&&(a.iterations==='infinite'||Number(a.duration)>100)),'Reduced motion removes repeated flashing or travel');
    await tapDrop(p,'plant-1');
  },{motion});
  for(const [width,height,motion]of[[320,568,'no-preference'],[320,568,'reduce'],[390,844,'reduce'],[768,1024,'no-preference']])await test(`Dense overlapping flowers keep all water drops reachable ${width}x${height} ${motion}`,async({p})=>{
    await seed(p,{plants:[plant('daisy',0,.5,.72),plant('giant-daisy',10,.5,.75),plant('bow-pink',1,.51,.72),plant('tulip',2,.49,.71),plant('bow-blue',3,.5,.73),plant('giant-sunflower',4,.51,.74)]});
    await garden(p);await chooseCan(p);assert.equal(await p.locator('[data-water-plant]').count(),5);await layout(p);
    await shot(p,`dense-water-${width}-${motion}`);
    for(const id of ['plant-1','plant-3','plant-4','plant-5','plant-6'])await tapDrop(p,id);
    await layout(p);
  },{width,height,motion});
  await test('Overflow garden tools stay behind the collection modal',async({p})=>{
    await seed(p,{plants:Array.from({length:33},(_,i)=>plant(i?'tulip':'daisy',0,.5,.72))});await garden(p);await chooseCan(p);
    await p.locator('.has-water-overflow').waitFor();assert.equal(await p.locator('[data-water-plant]').count(),33);
    assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Dense gardens scroll vertically without horizontal overflow');
    await click(p,'meadow-collection');await p.locator('.meadow-collection').waitFor();
    const layers=await p.locator('.meadow-tools button').evaluateAll(es=>es.map(e=>{const r=e.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2,top=document.elementFromPoint(x,y);return{x,y,visible:x>=0&&x<innerWidth&&y>=0&&y<innerHeight,modal:!!top?.closest('.modal-backdrop'),top:top?.outerHTML.slice(0,180)};}));
    assert(layers.some(x=>x.visible),'At least one sticky garden tool is under the visible modal');
    for(const item of layers.filter(x=>x.visible))assert(item.modal,`Garden tools cannot receive touches through the modal: ${JSON.stringify(item)}`);
    await shot(p,'overflow-collection-320');await click(p,'close');await p.locator('.modal-backdrop').waitFor({state:'hidden'});
    await drop(p,'plant-1').scrollIntoViewIfNeeded();await tapDrop(p,'plant-1');
  },{width:320,height:568});
  await test('A bloom crossing a dense grid row leaves every other drop in its original slot',async({p})=>{
    await seed(p);await garden(p);const width=await p.locator('[data-meadow-field]').evaluate(e=>e.clientWidth),columns=Math.max(1,Math.floor((width-8)/56)),count=columns*8+1;
    await seed(p,{plants:Array.from({length:count},(_,i)=>plant(i?'tulip':'daisy',i?0:4,.5,.72))});await garden(p);await chooseCan(p);await p.locator('.has-water-overflow').waitFor();
    const positions=()=>p.locator('[data-water-plant]').evaluateAll(es=>Object.fromEntries(es.map(e=>[e.dataset.waterPlant,{left:e.style.left,top:e.style.top}])));
    const before=await positions(),height=await p.locator('[data-meadow-field]').evaluate(e=>e.clientHeight);await shot(p,'overflow-before-bloom-320');
    await drop(p,'plant-1').scrollIntoViewIfNeeded();await tapDrop(p,'plant-1');assert.equal(await drop(p,'plant-1').count(),0);
    const after=await positions();delete before['plant-1'];assert.deepEqual(after,before,'Maturing one flower must leave the vacated slot empty until tool switch or resize');
    assert.equal(await p.locator('[data-meadow-field]').evaluate(e=>e.clientHeight),height,'The current watering grid keeps its height when the count crosses a row boundary');
    await drop(p,'plant-2').scrollIntoViewIfNeeded();await tapDrop(p,'plant-2');await shot(p,'overflow-after-bloom-320');
  },{width:320,height:568});
  await test('The fifth ordinary and tenth giant pour remove only the mature plant drop',async({p})=>{
    await seed(p,{plants:[plant('daisy',4,.25,.65),plant('giant-daisy',9,.75,.8)],waterRounds:2});await garden(p);await chooseCan(p);
    const otherPoint=await hit(p,'plant-2');
    await tapDrop(p,'plant-1');assert.equal(await drop(p,'plant-1').count(),0);assert.equal(await drop(p,'plant-2').count(),1);
    assert.deepEqual(await hit(p,'plant-2'),otherPoint,'A mature neighbor disappearing does not move another drop beneath the finger');
    await tapDrop(p,'plant-2');assert.equal(await p.locator('[data-water-plant]').count(),0);
    const mature=await state(p);assert.equal(mature.water,0);assert.deepEqual(mature.plants.map(x=>x.waterings),[5,10]);
    await p.locator('[data-meadow-plant="plant-2"]').tap();assert.deepEqual(await state(p),mature);
    await p.reload();await p.locator('.home-view').waitFor();await garden(p);assert.deepEqual(await state(p),mature);assert.equal(await p.locator('[data-water-plant]').count(),0);await shot(p,'both-mature');
  });
  await test('Switching to seeds, leaving, and returning never leaves stale watering overlays',async({p})=>{
    const before=await seed(p,{plants:[plant()],pending:true});await garden(p);await chooseCan(p);assert.equal(await p.locator('[data-water-plant]').count(),1);
    await click(p,'meadow-seed');assert.equal(await p.locator('[data-water-plant]').count(),0);assert.deepEqual(await state(p),before);
    await chooseCan(p);await click(p,'home');assert.equal(await p.locator('[data-water-plant]').count(),0);await garden(p);assert.equal(await p.locator('[data-water-plant]').count(),0);assert.deepEqual(await state(p),before);
  });
  await test('Empty water gives the replenishment voice without charging or watering',async({p})=>{
    const before=await seed(p,{plants:[plant('daisy',4,.3,.7),plant('tulip',1,.7,.7)],waterRounds:0});assert.equal(before.water,0);await garden(p);
    const n=await p.evaluate(()=>qaWatering.plays.length);await click(p,'meadow-can');
    await p.waitForFunction(n=>qaWatering.plays.slice(n).some(x=>x.endsWith('/economy-water-short.mp3')),n);
    assert.deepEqual(await state(p),before);assert.equal(await p.locator('[data-water-plant]:not([aria-disabled="true"]):enabled').count(),0);await shot(p,'empty-water');
  });
  await test('A visible drop explains an exhausted balance without an extra pour',async({p})=>{
    await seed(p,{plants:[plant('daisy',3,.3,.7),plant('tulip',1,.7,.7)],waterRounds:0});await garden(p);await chooseCan(p);
    await tapDrop(p,'plant-1');const empty=await state(p);assert.equal(empty.water,0);
    assert.equal(await drop(p,'plant-1').getAttribute('aria-disabled'),'true');
    const n=await p.evaluate(()=>qaWatering.plays.length),point=await hit(p,'plant-1');await p.touchscreen.tap(point.x,point.y);
    await p.waitForFunction(n=>qaWatering.plays.slice(n).some(x=>x.endsWith('/economy-water-short.mp3')),n);
    assert.deepEqual(await state(p),empty);assert.equal(await p.locator('[data-water-plant]:not([aria-disabled="true"]):enabled').count(),0);
  });
  await test('Resize recomputes edge and overlapping drop positions without spending water',async({p})=>{
    const before=await seed(p,{plants:[plant('daisy',2,.07,.26),plant('giant-daisy',9,.93,.26),plant('bow-blue',0,.93,.94),plant('tulip',1,.07,.94),plant('bow-pink',2,.5,.65)]});await garden(p);await chooseCan(p);
    for(const [width,height]of[[768,1024],[320,568],[390,844]]){await p.setViewportSize({width,height});await p.waitForTimeout(200);await layout(p);assert.deepEqual(await state(p),before);await shot(p,`resize-water-${width}`);}
    await tapDrop(p,'plant-2');assert.equal(await drop(p,'plant-2').count(),0);await layout(p);
  });
  await test('Repeated real taps queued behind a lock cannot double-spend one accepted pour',async({p})=>{
    const before=await seed(p);await garden(p);await chooseCan(p);await hold(p);
    try{const point=await hit(p,'plant-1');await p.touchscreen.tap(point.x,point.y);await queued(p);await p.touchscreen.tap(point.x,point.y);await queued(p);}
    finally{await release(p);}
    const after=await state(p);assert.equal(after.water,before.water-1);assert.equal(after.plants[0].waterings,1);await p.waitForTimeout(500);assert.deepEqual(await state(p),after);
    await tapDrop(p,'plant-1');assert.equal((await state(p)).plants[0].waterings,2,'A subsequent independent tap still works');
  });
  await test('Legacy real touch can drag waters once, while cancel and outside drops spend nothing',async f=>{
    const {p}=f;await seed(p,{plants:[plant('daisy',0,.3,.7),plant('tulip',1,.7,.7)]});await garden(p);const before=await state(p);
    const tool=p.locator('[data-action="meadow-can"]'),target=p.locator('[data-meadow-plant="plant-1"]');
    await touchDrag(f,await center(tool),await center(target),{cancel:true});assert.deepEqual(await state(p),before);
    await touchDrag(f,await center(tool),{x:2,y:2});assert.deepEqual(await state(p),before);
    await touchDrag(f,await center(tool),await center(target));
    await p.waitForFunction(key=>JSON.parse(localStorage.getItem(key)).plants[0].waterings===1,B);await p.waitForTimeout(500);
    const after=await state(p);assert.equal(after.water,before.water-1);assert.equal(after.plants[0].waterings,1);assert.equal(after.plants[1].waterings,1);
    await touchDrag(f,await center(tool),await hit(p,'plant-2'));
    await p.waitForFunction(key=>JSON.parse(localStorage.getItem(key)).plants[1].waterings===2,B);await p.waitForTimeout(500);
    const second=await state(p);assert.equal(second.water,after.water-1);assert.equal(second.plants[0].waterings,1);assert.equal(second.plants[1].waterings,2);
    await tapDrop(p,'plant-2');
  });
  await test('Drop cancellation, finger movement, outside release and vertical scrolling never spend water',async f=>{
    const {p}=f,before=await seed(p,{plants:Array.from({length:33},(_,i)=>plant(i?'tulip':'daisy',0,.5,.72))});await garden(p);await chooseCan(p);
    await drop(p,'plant-1').scrollIntoViewIfNeeded();let point=await hit(p,'plant-1');
    await touchDrag(f,point,point,{cancel:true});assert.deepEqual(await state(p),before,'Cancelled contact is not a pour');
    await touchDrag(f,point,{x:point.x+20,y:point.y});assert.deepEqual(await state(p),before,'A moved finger is not a short tap');
    const b=await bounds(drop(p,'plant-1'));await touchDrag(f,{x:b.x+2,y:b.y+b.height/2},{x:b.x-3,y:b.y+b.height/2});
    assert.deepEqual(await state(p),before,'Even less than 8px movement cannot water after lifting outside the drop');
    await drop(p,'plant-1').scrollIntoViewIfNeeded();point=await hit(p,'plant-1');const y=await p.evaluate(()=>scrollY),n=await p.evaluate(()=>qaWatering.gestures.length);
    await touchDrag(f,point,{x:point.x,y:Math.max(10,point.y-150)});await p.waitForTimeout(150);
    assert(await p.evaluate(({y,n})=>scrollY!==y||qaWatering.gestures.slice(n).some(x=>x.type==='pointercancel'),{y,n}),'The browser processes this contact as scroll/cancel');
    assert.deepEqual(await state(p),before,'Scrolling the large garden cannot spend water');
    await drop(p,'plant-1').scrollIntoViewIfNeeded();await tapDrop(p,'plant-1');
  },{width:320,height:568});
  await test('A held drop cancelled by page lifecycle never pours on the later release',async f=>{
    const {p}=f;await seed(p);await garden(p);await chooseCan(p);const session=await touchSession(p);
    for(const lifecycle of ['pagehide','visibility']){
      const before=await state(p),point=await hit(p,'plant-1');
      await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...point,radiusX:5,radiusY:5,force:1}]});
      await p.evaluate(type=>{
        if(type==='visibility'){Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));}
        else dispatchEvent(new PageTransitionEvent('pagehide',{persisted:true}));
      },lifecycle);
      assert.deepEqual(await state(p),before,'Holding before suspend cannot spend water');
      await p.evaluate(type=>{
        if(type==='visibility'){delete document.hidden;document.dispatchEvent(new Event('visibilitychange'));}
        else dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true}));
      },lifecycle);
      await session.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await p.waitForTimeout(180);
      assert.deepEqual(await state(p),before,`${lifecycle} cancels the incomplete press rather than completing it on resume`);
      await tapDrop(p,'plant-1');
    }
  });
  await test('Desktop mouse and keyboard each water once without synthesized click duplication',async({p})=>{
    await seed(p);await p.locator('[data-action="garden"]').click();await p.locator('.meadow-view').waitFor();await p.locator('[data-action="meadow-can"]').click();
    for(const action of ['mouse','Enter','Space']){
      const before=await state(p),point=await hit(p,'plant-1');
      if(action==='mouse')await p.mouse.click(point.x,point.y);else{await drop(p,'plant-1').focus();await p.keyboard.press(action);}
      await p.waitForFunction(({key,n})=>JSON.parse(localStorage.getItem(key)).plants[0].waterings===n,{key:B,n:before.plants[0].waterings+1});
      await p.waitForTimeout(110);assert.deepEqual(await state(p),{...before,water:before.water-1,plants:[{...before.plants[0],waterings:before.plants[0].waterings+1}]},`${action} changes the ledger exactly once`);
    }
  },{width:768,height:1024,desktop:true});
  await test('A pour accepted before leaving commits once without pulling back or late narration',async({p})=>{
    const before=await seed(p,{plants:[plant('daisy',4),plant('tulip',0,.25,.7),plant('bow-blue',0,.75,.7)]});await garden(p);await chooseCan(p);await hold(p);
    let audio;
    try{const point=await hit(p,'plant-1');await p.touchscreen.tap(point.x,point.y);await queued(p);await click(p,'home');await p.locator('.home-view').waitFor();audio=await p.evaluate(()=>({audios:qaWatering.audios.length,plays:qaWatering.plays.length}));}
    finally{await release(p);}
    await p.waitForTimeout(900);await p.locator('.home-view').waitFor();assert.equal(await p.locator('[data-water-plant]').count(),0);
    assert.deepEqual(await p.evaluate(()=>({audios:qaWatering.audios.length,plays:qaWatering.plays.length})),audio,'There is no late garden narration on the home page');
    const after=await state(p);assert.equal(after.water,before.water-1);assert.equal(after.plants[0].waterings,5);await garden(p);assert.deepEqual(await state(p),after);
  });
  await test('Two real tabs racing for the last water never overdraw or water twice',async({c,p})=>{
    const before=await seed(p,{plants:[plant('daisy',4)],waterRounds:0});assert.equal(before.water,1);await garden(p);await chooseCan(p);
    const other=await c.newPage();await other.goto(origin+'/xiaoya/?garden=b');await other.locator('.home-view').waitFor();await garden(other);await chooseCan(other);await hold(p);
    try{const a=await hit(p,'plant-1'),b=await hit(other,'plant-1');await Promise.all([p.touchscreen.tap(a.x,a.y),other.touchscreen.tap(b.x,b.y)]);await queued(p,2);}
    finally{await release(p);}
    const after=await state(p);assert.equal(after.water,0);assert.equal(after.plants[0].waterings,5);assert.deepEqual(await state(other),after);assert.equal(await p.locator('[data-water-plant]:not([aria-disabled="true"]):enabled').count(),0);assert.equal(await other.locator('[data-water-plant]:not([aria-disabled="true"]):enabled').count(),0);assert.deepEqual(await other.evaluate(()=>qaWatering.errors),[]);await other.close();
  });
  await test('Cached drop controls still water once after a real offline cold-page reload',async({c,p})=>{
    await seed(p);await garden(p);await chooseCan(p);await tapDrop(p,'plant-1');const before=await state(p);
    await p.waitForFunction(()=>!!navigator.serviceWorker.controller,undefined,{timeout:30000});await c.setOffline(true);await p.reload();await p.locator('.home-view').waitFor();await garden(p);await chooseCan(p);assert.deepEqual(await state(p),before);await tapDrop(p,'plant-1');await layout(p);await shot(p,'offline-water');
  },{serviceWorkers:'allow'});
}
(async()=>{
  fs.mkdirSync(out,{recursive:true});browser=await chromium.launch({channel:'msedge',headless:true,args:['--autoplay-policy=no-user-gesture-required']});
  await run();if(!report.checks.length)throw Error('No watering cases matched.');await browser.close();browser=null;save();
  console.log(`${report.checks.filter(x=>x.status==='PASS').length}/${report.checks.length} passed`);if(report.checks.some(x=>x.status!=='PASS'))process.exitCode=1;
})().catch(async e=>{console.error(e);if(browser)await browser.close();process.exitCode=1;});
