// Real browser animation geometry: roots are sampled on every native animation
// frame, never inferred from an element bounding box or a disabled animation.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'C:/Users/Jam/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const origin=new URL(process.env.TEST_URL||'http://127.0.0.1:24756').origin;
assert(['127.0.0.1','localhost','[::1]'].includes(new URL(origin).hostname),'Use a loopback QA server');
const out=path.resolve(process.env.XIAOYA_ANCHOR_TEST_OUT||path.join(__dirname,'../test-results/xiaoya-meadow-anchor'));
const filter=process.env.XIAOYA_TEST_FILTER?new RegExp(process.env.XIAOYA_TEST_FILTER):null;
const B='xiaoya-english:meadow:v1';
const report={origin,scope:'Disposable Edge profiles, real mouse/touch/keyboard input, native requestAnimationFrame and CSS transitions/animations, legal shipped economy-model fixtures, native local audio at 4x. No clock acceleration, user profile, child data, microphone, model download, external requests or uploads. Browser touch emulation is not physical-device validation.',checks:[]};
let browser;
const save=()=>fs.writeFileSync(path.join(out,filter?'results-filtered.json':'results.json'),JSON.stringify(report,null,2));
const state=p=>p.evaluate(key=>JSON.parse(localStorage.getItem(key)),B);
const near=(a,b,label,tolerance=.8)=>assert(Math.hypot(a.x-b.x,a.y-b.y)<=tolerance,`${label}: ${JSON.stringify(a)} versus ${JSON.stringify(b)}`);
const specs=(growing=false)=>[
  {flowerId:'daisy',waterings:0,x:.25,y:.43},
  {flowerId:'tulip',waterings:2,x:.75,y:.43},
  {flowerId:'sunflower',waterings:growing?4:5,x:.25,y:.88},
  {flowerId:'giant-daisy',waterings:growing?9:10,x:.75,y:.88},
];

async function fixture({touch=false,motion='no-preference',growing=false,fallback=false}={}){
  const c=await browser.newContext({viewport:touch?{width:390,height:844}:{width:1100,height:950},timezoneId:'Asia/Shanghai',hasTouch:touch,isMobile:touch,reducedMotion:motion,serviceWorkers:'block'});
  const requests=[],errors=[];
  c.on('request',r=>requests.push({url:r.url(),method:r.method()}));
  await c.route('**/*',r=>new URL(r.request().url()).origin===origin?r.continue():r.abort('blockedbyclient'));
  if(fallback)await c.route(/\/xiaoya\/paper\/v1\//,r=>r.abort('failed'));
  await c.addInitScript(origin=>{
    if(location.origin!==origin)return;
    const q=window.qaAnchor={errors:[],rings:[],gestures:[],audios:[],microphoneCalls:0,active:new Set()};
    addEventListener('error',e=>{if(e.message)q.errors.push(e.message);});
    addEventListener('unhandledrejection',e=>q.errors.push(String(e.reason)));
    for(const type of ['pointerdown','pointerup','click','keydown'])document.addEventListener(type,e=>q.gestures.push({type,x:e.clientX,y:e.clientY,key:e.key,detail:e.detail,pointerType:e.pointerType,at:performance.now()}),true);
    const NativeAudio=Audio;
    window.Audio=function(...args){const a=new NativeAudio(...args),item={url:String(args[0]||''),ended:false};a.playbackRate=4;q.audios.push(item);a.addEventListener('playing',()=>q.active.add(a));a.addEventListener('ended',()=>{item.ended=true;q.active.delete(a);});a.addEventListener('pause',()=>q.active.delete(a));return a;};window.Audio.prototype=NativeAudio.prototype;
    const gum=navigator.mediaDevices?.getUserMedia.bind(navigator.mediaDevices);
    if(gum)navigator.mediaDevices.getUserMedia=(...args)=>{q.microphoneCalls++;return gum(...args);};
    const seenRings=new WeakSet();
    new MutationObserver(records=>{for(const record of records)for(const node of record.addedNodes){if(node.nodeType!==1)continue;for(const ring of [...(node.matches('.xiaoya-fx-ring')?[node]:[]),...node.querySelectorAll('.xiaoya-fx-ring')]){if(seenRings.has(ring))continue;seenRings.add(ring);const r=ring.getBoundingClientRect();q.rings.push({x:r.left+r.width/2,y:r.top+r.height/2,left:ring.style.left,top:ring.style.top,size:Number.parseFloat(getComputedStyle(ring).width),still:ring.classList.contains('xiaoya-fx-still'),at:performance.now()});}}}).observe(document,{childList:true,subtree:true});
    q.root=id=>{
      const button=document.querySelector(`[data-meadow-plant="${id}"]`),svg=button?.querySelector(':scope > svg');if(!svg)return null;
      const soil=svg.querySelector('[data-part="soil"]'),body=svg.querySelector('[data-plant-body]')||svg;
      const map=(element,x,y)=>{const p=new DOMPoint(x,y).matrixTransform(element.getScreenCTM());return {x:p.x,y:p.y};};
      const image=svg.querySelector('[data-paper-image]'),art=svg.querySelector('[data-paper-art]'),fallback=svg.querySelector('[data-paper-fallback]');
      // Existing art contract: a 384x512 canvas has its painted root at (.5,.88).
      // Check it independently from the soil, including xMidYMax letterboxing.
      const w=image.width.baseVal.value,h=image.height.baseVal.value,paintedHeight=Math.min(h,w/(384/512));
      const paperRoot=map(image,image.x.baseVal.value+w/2,image.y.baseVal.value+h-paintedHeight*.12);
      const style=getComputedStyle(body);
      return {soil:map(soil,soil.cx.baseVal.value,soil.cy.baseVal.value),body:map(body,80,164),paper:paperRoot,vector:map(fallback,80,164),paperState:art.dataset.paperState,transform:style.transform,scale:style.scale,animations:body.getAnimations().map(a=>a.animationName||a.transitionProperty),waterings:Number(button.dataset.waterings)};
    };
    q.start=id=>{
      q.rings=[];q.gestures=[];q.samples=[];
      const start=performance.now();q.baseline=q.root(id);
      q.traceDone=new Promise(resolve=>{const sample=()=>{q.samples.push({at:performance.now()-start,...q.root(id)});if(performance.now()-start<1000)requestAnimationFrame(sample);else resolve();};sample();});
    };
  },origin);
  const p=await c.newPage();p.setDefaultTimeout(20000);p.on('pageerror',e=>errors.push(e.message));
  try{
    await p.goto(origin+'/xiaoya/?garden=b');await p.locator('.home-view').waitFor();
    const meta=await p.evaluate(()=>({build:document.querySelector('meta[name="xiaoya-build"]').content,version:document.querySelector('meta[name="xiaoya-version"]').content}));
    const expected=JSON.parse(fs.readFileSync(path.join(__dirname,'../dist/xiaoya/version.json'),'utf8'));
    assert.equal(meta.build,expected.build);assert.equal(meta.version,expected.version);if(report.build)assert.equal(meta.build,report.build,'Build must not change during QA');else Object.assign(report,meta);
    const plants=specs(growing);
    await p.evaluate(async({key,plants})=>{
      const m=await import(new URL('garden-meadow.js',document.querySelector('script[type="module"][src]').src));
      const date='2026-10-18';let s=m.rewardRound(m.createMeadow(),{roundId:'qa-anchor-starter',eventId:'hello-everyone',date});
      for(let i=0;i<plants.length-1;i++){const roundId=`qa-anchor-shells-${i}`;s=m.claimReward(m.rewardRound(s,{roundId,eventId:'food-water',date}),roundId,'shells');}
      for(let i=0;i<9;i++){const roundId=`qa-anchor-water-${i}`;s=m.claimReward(m.rewardRound(s,{roundId,eventId:'food-water',date}),roundId,'water');}
      for(const f of plants){s=m.openSeedPack(s,(m.FLOWERS.findIndex(x=>x.id===f.flowerId)+.1)/m.FLOWERS.length);s=m.plantSeed(s,{x:f.x,y:f.y});}
      for(let i=0;i<plants.length;i++)for(let n=0;n<plants[i].waterings;n++)s=m.waterPlant(s,`plant-${i+1}`);
      m.validateMeadow(s);localStorage.setItem(key,JSON.stringify(s));
    },{key:B,plants});
    await p.reload();await p.locator('.home-view').waitFor();await p.locator('[data-action="garden"]').click();await p.locator('.meadow-view').waitFor();
    await p.waitForFunction(fallback=>[...document.querySelectorAll('.meadow-plant [data-paper-art]')].length===4&&[...document.querySelectorAll('.meadow-plant [data-paper-art]')].every(n=>n.dataset.paperState===(fallback?'fallback':'ready')),fallback);
    await settle(p);
    return {c,p,requests,errors,motion,touch,fallback};
  }catch(e){await c.close();throw e;}
}

async function settle(p){await p.waitForTimeout(450);await p.waitForFunction(()=>[...qaAnchor.active].every(a=>a.paused||a.ended));await p.waitForTimeout(300);}
async function can(p){await p.locator('[data-action="meadow-can"]').click();await p.locator('[data-water-layer].is-ready').waitFor();await settle(p);}
async function center(locator){const b=await locator.boundingBox();assert(b);return {x:b.x+b.width/2,y:b.y+b.height/2};}
async function pointFor(p,id){return p.evaluate(id=>{const root=qaAnchor.root(id).body;for(const [x,y] of [[6,-5],[-12,-5],[15,-12],[-20,-12]]){const point={x:root.x+x,y:root.y+y};if(document.elementFromPoint(point.x,point.y)?.closest('[data-meadow-plant]')?.dataset.meadowPlant===id)return point;}throw Error(`No exposed root-adjacent click point for ${id}`);},id);}
async function hit(p,selector,point){assert(await p.evaluate(({selector,point})=>!!document.elementFromPoint(point.x,point.y)?.closest(selector),{selector,point}),'The intended plant/drop receives actual browser hit testing');}
async function trace(f,id,{input='mouse',drop=false,watering=false,key='Enter'}={}){
  const {p,motion}=f,selector=drop?`[data-water-plant="${id}"]`:`[data-meadow-plant="${id}"]`,loc=p.locator(selector);
  if(input==='keyboard')await loc.focus();
  const point=drop?await center(loc):await pointFor(p,id);await hit(p,selector,point);
  const before=await state(p),baseline=await p.evaluate(id=>qaAnchor.root(id),id);
  await p.evaluate(id=>qaAnchor.start(id),id);
  if(input==='touch')await p.touchscreen.tap(point.x,point.y);
  else if(input==='keyboard')await loc.press(key);
  else {await p.mouse.move(point.x,point.y);await p.mouse.down();await p.waitForTimeout(90);await p.mouse.up();}
  await p.evaluate(()=>qaAnchor.traceDone);
  const evidence=await p.evaluate(()=>({baseline:qaAnchor.baseline,samples:qaAnchor.samples,rings:qaAnchor.rings,gestures:qaAnchor.gestures}));
  assert(evidence.samples.length>=12,'Observe many native frames across the full feedback animation');
  assert(evidence.samples.some(s=>s.at<150)&&evidence.samples.some(s=>s.at>300&&s.at<700)&&evidence.samples.some(s=>s.at>=900),'Observe press, growth midpoint and settled phases');
  const drift={soil:0,body:0,paper:0,vector:0};
  for(const sample of evidence.samples)for(const anchor of Object.keys(drift)){
    assert(sample[anchor],`The ${id} root remains present during rerender`);
    drift[anchor]=Math.max(drift[anchor],Math.hypot(sample[anchor].x-baseline[anchor].x,sample[anchor].y-baseline[anchor].y));
    near(sample[anchor],baseline[anchor],`${id} ${anchor} stays planted at ${Math.round(sample.at)} ms`);
  }
  const expected=input==='keyboard'?(drop?point:baseline.body):point;
  const tapRings=evidence.rings.filter(r=>r.size===26);
  assert.equal(tapRings.length,1,'One activation creates one tap acknowledgement without a duplicated bubbling click');
  near(tapRings[0],expected,`${input} ${drop?'drop':'plant'} ring belongs at its actual input point`);
  if(motion==='reduce'){
    assert(evidence.rings.every(r=>r.still),'Reduced motion uses still feedback rings');
    assert(evidence.samples.every(s=>(s.transform==='none'||s.transform==='matrix(1, 0, 0, 1, 0, 0)')&&['none','1'].includes(s.scale)),'Reduced motion never moves or scales a plant');
  }else if(watering||input==='mouse')assert(evidence.samples.some(s=>s.transform!=='none'&&s.transform!=='matrix(1, 0, 0, 1, 0, 0)'||!['none','1'].includes(s.scale)),'The measured plant really animates; this is not a disabled-motion pass');
  const after=await state(p);
  if(watering)assert.deepEqual(after,{...before,water:before.water-1,plants:before.plants.map(x=>x.id===id?{...x,waterings:x.waterings+1}:x)},'One activation spends one water on exactly the selected plant');
  else assert.deepEqual(after,before,'Greeting a plant cannot change its saved position, growth or resources');
  await settle(p);
  return {id,input,drop,watering,point,expectedRing:expected,frames:evidence.samples.length,drift,rings:evidence.rings,animationFrames:evidence.samples.filter(s=>s.animations.length).length,gestures:evidence.gestures};
}
async function shot(p,name){const file=path.join(out,name+'.png');await p.screenshot({path:file,fullPage:true});return file;}
async function check(name,fn,options){
  if(filter&&!filter.test(name))return;let f;
  try{f=await fixture(options);const evidence=await fn(f);assert.deepEqual(f.errors,[]);assert.deepEqual(await f.p.evaluate(()=>qaAnchor.errors),[]);assert.equal(await f.p.evaluate(()=>qaAnchor.microphoneCalls),0);assert(f.requests.every(r=>r.method==='GET'&&new URL(r.url).origin===origin));report.checks.push({name,status:'PASS',evidence});console.log('PASS '+name);}
  catch(e){report.checks.push({name,status:'FAIL',error:e.stack,diagnostic:f?await f.p.evaluate(()=>({main:document.querySelector('main')?.outerHTML,samples:qaAnchor.samples,baseline:qaAnchor.baseline,rings:qaAnchor.rings,gestures:qaAnchor.gestures})).catch(()=>null):null,screenshot:f?await shot(f.p,'failure-'+(report.checks.length+1)).catch(()=>null):null});process.exitCode=1;console.error('FAIL '+name+' '+e.message);}
  finally{await f?.c.close();save();}
}

(async()=>{
  fs.mkdirSync(out,{recursive:true});browser=await chromium.launch({channel:'msedge',headless:true,args:['--no-proxy-server','--autoplay-policy=no-user-gesture-required']});
  await check('Mouse press and feedback keep seed, sprout, flower and giant roots planted',async f=>{const stages=[];for(let n=1;n<=4;n++)stages.push(await trace(f,`plant-${n}`));return {stages,screenshot:await shot(f.p,'desktop-four-stages')};});
  await check('Native touch rings follow finger position across all four plant stages',async f=>{const stages=[];for(let n=1;n<=4;n++)stages.push(await trace(f,`plant-${n}`,{input:'touch'}));return {stages,screenshot:await shot(f.p,'touch-four-stages')};},{touch:true});
  await check('Direct watering and both bloom transitions preserve soil and painted roots throughout growth',async f=>{await can(f.p);const stages=[];for(let n=1;n<=4;n++)stages.push(await trace(f,`plant-${n}`,{watering:true}));return {stages,screenshot:await shot(f.p,'grown-four-stages')};},{growing:true});
  await check('Overhead touch drops acknowledge the touched drop while their own plants stay rooted',async f=>{await can(f.p);return {stages:[await trace(f,'plant-1',{input:'touch',drop:true,watering:true}),await trace(f,'plant-4',{input:'touch',drop:true,watering:true})],screenshot:await shot(f.p,'touch-overhead-drops')};},{touch:true,growing:true});
  await check('Keyboard feedback anchors plant activation at roots and drop activation at the drop',async f=>{const stages=[await trace(f,'plant-1',{input:'keyboard'}),await trace(f,'plant-3',{input:'keyboard',key:'Space'})];await can(f.p);stages.push(await trace(f,'plant-1',{input:'keyboard',drop:true,watering:true}));return {stages};});
  await check('Reduced motion preserves actual touch positions and suppresses plant motion during growth',async f=>{const stages=[];for(let n=1;n<=4;n++)stages.push(await trace(f,`plant-${n}`,{input:'touch'}));await can(f.p);stages.push(await trace(f,'plant-1',{input:'touch',drop:true,watering:true}));return {stages,screenshot:await shot(f.p,'reduced-motion')};},{touch:true,motion:'reduce'});
  await check('Missing paper art keeps the vector fallback rooted during watering and giant bloom',async f=>{await can(f.p);return {stages:[await trace(f,'plant-1',{watering:true}),await trace(f,'plant-4',{watering:true})],screenshot:await shot(f.p,'vector-fallback')};},{growing:true,fallback:true});
})().catch(e=>{report.fatal=e.stack;process.exitCode=1;console.error(e);}).finally(async()=>{await browser?.close();save();});
