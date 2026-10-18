// Isolated real Edge checks for B's resource choices and seed shop. The fixtures
// call the shipped pure model; gestures, localStorage locks and SW are real.
// No user profile, microphone, ASR or external service is used.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'C:/Users/Jam/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const origin=new URL(process.env.TEST_URL||'http://127.0.0.1:24756').origin;
if(!['127.0.0.1','localhost','[::1]'].includes(new URL(origin).hostname))throw Error('Use a loopback test server.');
const out=path.resolve(process.env.XIAOYA_ECONOMY_TEST_OUT||path.join(__dirname,'../test-results/xiaoya-economy'));
const filter=process.env.XIAOYA_TEST_FILTER?new RegExp(process.env.XIAOYA_TEST_FILTER):null;
const A='xiaoya-english:garden:v1',B='xiaoya-english:meadow:v1',PLAN='xiaoya-english:practice-plan:v1',STATE='xiaoya-english:state:v1';
const DAY='2026-10-18';
const report={origin,scope:'Disposable Edge profiles, real local audio at 4x, true touch, Web Locks and service worker; visibility events are synthesized because headless tabs all stay visible; no real microphone or child learning data.',checks:[]};
let browser;
const save=()=>fs.writeFileSync(path.join(out,filter?'results-filtered.json':'results.json'),JSON.stringify(report,null,2));
const click=(p,action)=>p.locator(`[data-action="${action}"]`).first().tap();
const state=p=>p.evaluate(key=>JSON.parse(localStorage.getItem(key)||'null'),B);
const balance=s=>[s.shells,s.water];
const pending=s=>s.rounds.filter(r=>r.reward==='pending');

async function fixture({width=390,height=844,motion='reduce',serviceWorkers='block'}={}){
  const c=await browser.newContext({viewport:{width,height},timezoneId:'Asia/Shanghai',isMobile:true,hasTouch:true,reducedMotion:motion,serviceWorkers});
  const requests=[],errors=[];
  c.on('request',r=>requests.push({url:r.url(),method:r.method()}));c.on('page',p=>p.on('pageerror',e=>errors.push(e.message)));
  await c.route('**/*',r=>new URL(r.request().url()).origin===origin?r.continue():r.abort('blockedbyclient'));
  await c.route(/\/(?:xiaoya\/speech\/|speech\/(?:vosk-|model-))/,r=>r.abort('failed'));
  await c.addInitScript(({origin,day})=>{
    if(location.origin!==origin)return;
    const NativeDate=Date;
    const now=()=>NativeDate.parse(`${localStorage.getItem('__qa_economy_day')||day}T12:00:00+08:00`);
    window.Date=class extends NativeDate{constructor(...args){super(...(args.length?args:[now()]));}static now(){return now();}};
    const q=window.qaEconomy={errors:[],audios:[],plays:[]};
    addEventListener('error',e=>{if(e.message)q.errors.push(e.message);});addEventListener('unhandledrejection',e=>q.errors.push(String(e.reason)));
    const NativeAudio=Audio;
    window.Audio=function(...args){const a=new NativeAudio(...args),item={url:String(args[0]||''),ended:false,error:false};a.playbackRate=4;q.audios.push(item);a.addEventListener('playing',()=>q.plays.push(item.url));a.addEventListener('ended',()=>item.ended=true);a.addEventListener('error',()=>item.error=true);return a;};window.Audio.prototype=NativeAudio.prototype;
  },{origin,day:DAY});
  const p=await c.newPage();p.setDefaultTimeout(20000);
  try{
    await p.goto(origin+'/xiaoya/?garden=b');await p.locator('.home-view').waitFor();
    const build=await p.locator('meta[name="xiaoya-build"]').getAttribute('content'),version=await p.locator('meta[name="xiaoya-version"]').getAttribute('content');
    if(report.build)assert.equal(build,report.build,'Do not replace the build during a test run.');else Object.assign(report,{build,version});
    return{c,p,requests,errors};
  }catch(e){await c.close();throw e;}
}
async function reload(p){await p.reload();await p.locator('.home-view').waitFor();}
async function seed(p,{shellRounds=8,waterRounds=2,pendingRounds=0,shop=false,reserved=false}={}){
  const s=await p.evaluate(async({key,day,shellRounds,waterRounds,pendingRounds,shop,reserved})=>{
    const m=await import(new URL('garden-meadow.js',document.querySelector('script[type="module"][src]').src));
    let s=m.rewardRound(m.createMeadow(),{roundId:'qa-starter',eventId:'hello-everyone',date:day});
    for(const [choice,count]of[['shells',shellRounds],['water',waterRounds],['pending',pendingRounds]])for(let i=0;i<count;i++){
      const roundId=`qa-${choice}-${i}`;s=m.rewardRound(s,{roundId,eventId:'food-water',date:day});if(choice!=='pending')s=m.claimReward(s,roundId,choice);
    }
    if(reserved){s=m.ensureShop(s,'2026-10-17',0);s=m.reserveOffer(s,s.shop.offer.id);}
    if(shop||reserved)s=m.ensureShop(s,day,.6);
    m.validateMeadow(s);localStorage.setItem(key,JSON.stringify(s));return s;
  },{key:B,day:DAY,shellRounds,waterRounds,pendingRounds,shop,reserved});await reload(p);return s;
}
async function garden(p){await click(p,'garden');await p.locator('.meadow-view').waitFor();}
async function shop(p){await garden(p);await click(p,'shop');await p.locator('.seed-shop-view').waitFor();}
async function parent(p){await click(p,'parent');if(await p.locator('#parent-answer').count()){const n=(await p.locator('label[for="parent-answer"]').textContent()).match(/\d+/g).map(Number);await p.locator('#parent-answer').fill(String(n[0]+n[1]));await click(p,'gate-submit');}await p.locator('.parent-view').waitFor();}
async function completeStory(p,id,{finish=true}={}){
  await parent(p);const target=p.locator(`[data-story="${id}"]`);
  const depth=await target.evaluate(e=>{let n=0;for(let a=e.parentElement;a;a=a.parentElement)if(a.tagName==='DETAILS')n++;return n;});
  for(let i=depth;i>=1;i--){const d=target.locator(`xpath=ancestor::details[${i}]`);if(!await d.evaluate(e=>e.open))await d.locator(':scope>summary').tap();}
  await target.tap();await p.locator(`[data-event="${id}"][data-phase="story"]`).waitFor();await p.locator('[data-action="story-continue"]:enabled').waitFor({timeout:35000});
  await click(p,'story-continue');await p.locator('[data-phase="request"]').waitFor();
  if(await p.locator('[data-action="disable-mic"]').count())await click(p,'disable-mic');
  await click(p,'watch');await p.locator('[data-phase="resolved"]').waitFor();
  if(finish){await click(p,'finish');await p.locator('.reward-view').waitFor();}
}
async function choose(p,choice){await p.locator(`[data-reward-choice="${choice}"]`).tap();await p.locator('.reward-view[data-choice="false"]').waitFor();}
async function plantPending(p){
  const before=await state(p);assert(before.pendingSeed);const field=await p.locator('[data-meadow-field]').boundingBox();
  // A purchased seed is already held. One real touch on the grass plants it.
  await p.touchscreen.tap(field.x+field.width*.44,field.y+field.height*.72);
  await p.waitForFunction(({key,n})=>JSON.parse(localStorage.getItem(key)).plants.length===n,{key:B,n:before.plants.length+1});
}
async function layout(p){
  await p.evaluate(async()=>Promise.all(document.getAnimations().filter(a=>Number.isFinite(a.effect?.getTiming().iterations)&&a.playState==='running').map(a=>a.finished.catch(()=>{}))));
  const bounds=await p.evaluate(()=>({w:innerWidth,h:innerHeight,sw:document.documentElement.scrollWidth,sh:document.documentElement.scrollHeight}));
  assert(bounds.sw<=bounds.w+1,`Horizontal overflow ${JSON.stringify(bounds)}`);assert(bounds.sh<=bounds.h+1,`Child actions need page scrolling ${JSON.stringify(bounds)}`);
  assert(!/[A-Za-z]/.test(await p.locator('#app').innerText()),'No English writing is required in the child economy');
  for(const r of await p.locator('button:visible').evaluateAll(es=>es.map(e=>{const r=e.getBoundingClientRect();return{label:e.getAttribute('aria-label'),x:r.x,y:r.y,w:r.width,h:r.height};}))){
    assert(r.w>=47&&r.h>=47,`Target smaller than 48px ${JSON.stringify(r)}`);assert(r.x>=-1&&r.y>=-1&&r.x+r.w<=bounds.w+1&&r.y+r.h<=bounds.h+1,`Target outside screen ${JSON.stringify(r)}`);
  }
  return bounds;
}
async function lockPair(f,setup,action){
  const {c,p}=f,other=await c.newPage();other.setDefaultTimeout(20000);await other.goto(origin+'/xiaoya/?garden=b');await other.locator('.home-view').waitFor();await setup(other);
  await p.evaluate(key=>{navigator.locks.request(key,()=>new Promise(resolve=>{qaEconomy.release=resolve;}));},B);await p.waitForFunction(()=>typeof qaEconomy.release==='function');
  try{await Promise.all([action(p,0),action(other,1)]);await p.waitForFunction(async key=>(await navigator.locks.query()).pending.filter(l=>l.name===key).length===2,B);}
  finally{await p.evaluate(()=>qaEconomy.release());}
  await p.waitForFunction(async key=>!(await navigator.locks.query()).pending.some(l=>l.name===key),B);
  await p.waitForTimeout(150);assert.deepEqual(await state(p),await state(other));assert.deepEqual(await other.evaluate(()=>qaEconomy.errors),[]);await other.close();
}
async function holdEconomy(p){await p.evaluate(key=>{navigator.locks.request(key,()=>new Promise(resolve=>{qaEconomy.release=resolve;}));},B);await p.waitForFunction(()=>typeof qaEconomy.release==='function');assert.equal(await p.evaluate(async key=>(await navigator.locks.query()).pending.filter(l=>l.name===key).length,B),0,'The held test lock starts with an empty queue');}
async function queuedEconomy(p){await p.waitForFunction(async key=>(await navigator.locks.query()).pending.some(l=>l.name===key),B);}
async function releaseEconomy(p){await p.evaluate(()=>qaEconomy.release());await p.waitForFunction(async key=>!(await navigator.locks.query()).pending.some(l=>l.name===key),B);await p.waitForTimeout(200);}
async function background(p){await p.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));});return p.evaluate(()=>({audios:qaEconomy.audios.length,plays:qaEconomy.plays.length}));}
async function foreground(p){await p.evaluate(()=>{delete document.hidden;document.dispatchEvent(new Event('visibilitychange'));});}
async function staysSilent(p,from){await p.waitForTimeout(900);assert.deepEqual(await p.evaluate(()=>({audios:qaEconomy.audios.length,plays:qaEconomy.plays.length})),from,'A background transaction must neither construct nor play late narration');}
async function diagnostic(p){return p.evaluate(()=>({build:document.querySelector('meta[name="xiaoya-build"]')?.content,main:document.querySelector('main')?.outerHTML,storage:Object.fromEntries(Object.keys(localStorage).filter(k=>k.startsWith('xiaoya')).map(k=>[k,localStorage.getItem(k)])),qa:qaEconomy})).catch(e=>({error:e.message}));}
async function test(name,fn,options){
  if(filter&&!filter.test(name))return;let f;
  try{f=await fixture(options);await fn(f);assert.deepEqual(f.errors,[]);assert.deepEqual(await f.p.evaluate(()=>qaEconomy.errors),[]);assert(!f.requests.some(r=>r.method!=='GET'||new URL(r.url).origin!==origin),'No uploads or third-party requests');report.checks.push({name,status:'PASS',diagnostic:await diagnostic(f.p)});console.log('PASS',name);}
  catch(e){report.checks.push({name,status:'FAIL',error:e.stack,diagnostic:f?await diagnostic(f.p):null});console.error('FAIL',name,e.message);if(f)await f.p.screenshot({path:path.join(out,`failed-${report.checks.length}.png`),animations:'disabled',fullPage:true}).catch(()=>{});}
  finally{save();await f?.c.close();}
}

async function cases(){
  await test('Real first story gives the starter pair, first mystery is daisy, later stories offer one resource',async({p})=>{
    await completeStory(p,'hello-everyone');let s=await state(p);assert.deepEqual(balance(s),[2,5]);assert.equal(s.rounds[0].reward,'starter');assert.equal(s.rounds[0].starter,true);assert.equal(await p.locator('[data-reward-choice]').count(),0);
    await garden(p);await click(p,'shop');await p.locator('.seed-shop-view').waitFor();await click(p,'shop-pack');await p.locator('.meadow-view').waitFor();s=await state(p);assert.deepEqual(balance(s),[0,5]);assert.equal(s.pendingSeed.flowerId,'daisy','The first mystery seed is the familiar starter daisy');
    await plantPending(p);await completeStory(p,'hello-morning');s=await state(p);assert.deepEqual(balance(s),[0,5]);assert.equal(pending(s).length,1);await choose(p,'shells');assert.deepEqual(balance(await state(p)),[2,5]);
    await completeStory(p,'family-love');assert.deepEqual(balance(await state(p)),[2,5]);await reload(p);await click(p,'garden');await p.locator('[data-reward-choice="water"]').waitFor();await choose(p,'water');s=await state(p);assert.deepEqual(balance(s),[2,10]);assert.equal(pending(s).length,0);assert.deepEqual(s.rounds.map(r=>r.reward),['starter','shells','water']);
    assert.equal(await p.evaluate(key=>localStorage.getItem(key),STATE),null,'Participation rewards never invent speech mastery');
  });
  await test('A rapid duplicate claim only settles one pending round and survives reload',async({p})=>{
    const before=await seed(p,{shellRounds:0,waterRounds:0,pendingRounds:2});await click(p,'garden');await p.locator('[data-reward-choice="shells"]').waitFor();
    await p.locator('[data-reward-choice="shells"]').evaluate(b=>{b.click();b.click();});await p.waitForFunction(key=>JSON.parse(localStorage.getItem(key)).rounds.filter(r=>r.reward==='pending').length===1,B);
    let s=await state(p);assert.deepEqual(balance(s),[before.shells+2,before.water]);assert.equal(s.rounds.filter(r=>r.reward==='shells').length,1);
    await reload(p);await click(p,'garden');await choose(p,'water');s=await state(p);assert.deepEqual(balance(s),[before.shells+2,before.water+5]);assert.equal(pending(s).length,0);
    await reload(p);assert.deepEqual(await state(p),s,'Refresh never pays a claimed round twice');
  });
  await test('Persisted practice reward intent restores a pending choice without auto-grant or duplicate credit',async({p})=>{
    const before=await seed(p,{shellRounds:0,waterRounds:0});
    await p.evaluate(async({key,day})=>{const m=await import(new URL('practice-plan.js',document.querySelector('script[type="module"][src]').src));const plan=m.recordPractice(m.createPracticePlan(),{roundId:'qa-recover-economy',eventId:'hello-thanks',date:day,mode:'new',rewardVariant:'b'});localStorage.setItem(key,JSON.stringify(plan));},{key:PLAN,day:DAY});
    await reload(p);await p.waitForFunction(key=>JSON.parse(localStorage.getItem(key)).rounds.some(r=>r.roundId==='qa-recover-economy'),B);assert.deepEqual(balance(await state(p)),balance(before));
    await click(p,'garden');await choose(p,'water');const paid=await state(p);assert.deepEqual(balance(paid),[before.shells,before.water+5]);await reload(p);assert.deepEqual(await state(p),paid);
  });
  await test('Insufficient shells leave a known offer unchanged and point back to learning',async({p})=>{
    await seed(p,{shellRounds:0,waterRounds:0,shop:true});await shop(p);const before=await state(p);assert(before.shop.offer.price>=3);
    await p.locator('[data-buy-offer][data-source="shop"]').tap();assert.deepEqual(await state(p),before);await p.waitForFunction(()=>qaEconomy.plays.some(x=>x.endsWith('/economy-short.mp3')));assert(await p.locator('[data-action="next-event"]').isVisible());
    await click(p,'shop-pack');await p.locator('.meadow-view').waitFor();await plantPending(p);await click(p,'shop');await p.locator('.seed-shop-view').waitFor();const empty=await state(p);assert.equal(empty.shells,0);await click(p,'shop-pack');await p.waitForFunction(()=>qaEconomy.plays.some(x=>x.endsWith('/economy-shells-short.mp3')));assert.deepEqual(await state(p),empty);
  });
  await test('Known seed price matches its type, purchase is exact and refill differs',async({p})=>{
    await seed(p,{shop:true});await shop(p);const before=await state(p),offer=before.shop.offer,price=offer.flowerId.startsWith('giant-')?8:offer.flowerId.startsWith('bow-')?6:3;
    assert.equal(offer.price,price);assert.equal(await p.locator(`[data-offer-id="${offer.id}"]`).getAttribute('data-price'),String(price));
    await p.locator('[data-buy-offer][data-source="shop"]').tap();await p.locator('.meadow-view').waitFor();const bought=await state(p);assert.deepEqual(balance(bought),[before.shells-price,before.water]);assert.equal(bought.pendingSeed.flowerId,offer.flowerId);assert.notEqual(bought.shop.offer.id,offer.id);assert.notEqual(bought.shop.offer.flowerId,offer.flowerId);
    await reload(p);await garden(p);assert.deepEqual(await state(p),bought);await click(p,'meadow-seed');await plantPending(p);assert.equal((await state(p)).plants[0].flowerId,offer.flowerId);
  });
  await test('Reservation survives midnight and reload; cancel keeps it, confirmation replaces it',async({p})=>{
    await seed(p,{shop:true});await shop(p);const first=(await state(p)).shop.offer;await p.locator('[data-reserve-offer]').tap();await p.waitForFunction(({key,id})=>JSON.parse(localStorage.getItem(key)).shop.reserved?.id===id,{key:B,id:first.id});assert.deepEqual((await state(p)).shop.reserved,first);
    await p.evaluate(()=>localStorage.setItem('__qa_economy_day','2026-10-19'));await reload(p);await shop(p);let s=await state(p);assert.deepEqual(s.shop.reserved,first);assert.notEqual(s.shop.offer.id,first.id);assert.notEqual(s.shop.offer.flowerId,first.flowerId);const next=s.shop.offer;
    await p.locator('[data-reserve-offer]').tap();await p.locator('[data-action="replace-reservation"]').waitFor();await click(p,'close');assert.deepEqual((await state(p)).shop.reserved,first);
    await p.locator('[data-reserve-offer]').tap();await click(p,'replace-reservation');await p.waitForFunction(({key,id})=>JSON.parse(localStorage.getItem(key)).shop.reserved.id===id,{key:B,id:next.id});await reload(p);await shop(p);assert.deepEqual((await state(p)).shop.reserved,next);
  });
  await test('Buying a saved older offer preserves todays different offer and deducts only its stated price',async({p})=>{
    await seed(p,{reserved:true});await shop(p);const before=await state(p);assert.notEqual(before.shop.reserved.id,before.shop.offer.id);
    await p.locator('[data-buy-offer][data-source="reserved"]').tap();await p.locator('.meadow-view').waitFor();const after=await state(p);assert.equal(after.shells,before.shells-before.shop.reserved.price);assert.equal(after.water,before.water);assert.equal(after.pendingSeed.flowerId,before.shop.reserved.flowerId);assert.equal(after.shop.reserved,null);assert.deepEqual(after.shop.offer,before.shop.offer);
  });
  await test('Two tabs choosing different resources serialize into one reward credit',async f=>{
    const before=await seed(f.p,{pendingRounds:1});await click(f.p,'garden');await f.p.locator('[data-reward-choice]').first().waitFor();
    await lockPair(f,async p=>{await click(p,'garden');await p.locator('[data-reward-choice]').first().waitFor();},(p,i)=>p.locator(`[data-reward-choice="${i?'water':'shells'}"]`).tap());
    const after=await state(f.p),paid=after.rounds.find(r=>r.roundId==='qa-pending-0');assert(['shells','water'].includes(paid.reward));assert.deepEqual(balance(after),paid.reward==='shells'?[before.shells+2,before.water]:[before.shells,before.water+5]);assert.equal(pending(after).length,0);
  });
  await test('Two tabs buying the same known offer create one seed and one deduction',async f=>{
    await seed(f.p,{shop:true});await shop(f.p);const before=await state(f.p);await lockPair(f,shop,p=>p.locator('[data-buy-offer][data-source="shop"]').tap());
    const after=await state(f.p);assert.equal(after.shells,before.shells-before.shop.offer.price);assert.equal(after.seedPacksOpened,before.seedPacksOpened+1);assert.equal(after.pendingSeed.flowerId,before.shop.offer.flowerId);
  });
  await test('Two tabs opening mystery packs create one pending seed and spend two shells once',async f=>{
    await seed(f.p,{shop:true});await shop(f.p);const before=await state(f.p);await lockPair(f,shop,p=>click(p,'shop-pack'));const after=await state(f.p);assert.equal(after.shells,before.shells-2);assert.equal(after.seedPacksOpened,before.seedPacksOpened+1);assert(after.pendingSeed);
  });
  await test('A delayed shop opening never interrupts a newly started story',async({p})=>{
    await seed(p);await garden(p);await holdEconomy(p);await click(p,'shop');await queuedEconomy(p);await click(p,'next-event');await p.locator('.event-view').waitFor();const id=await p.locator('[data-event]').getAttribute('data-event'),plays=await p.evaluate(()=>qaEconomy.plays.length);
    await releaseEconomy(p);assert.equal(await p.locator('[data-event]').getAttribute('data-event'),id);assert.equal(await p.locator('.seed-shop-view').count(),0);assert((await state(p)).shop.offer,'The queued data transaction still completes');assert(!await p.evaluate(n=>qaEconomy.plays.slice(n).some(x=>x.endsWith('/economy-shop.mp3')),plays));
  });
  await test('A delayed shop opening cannot dismiss or narrate over the parent gate',async({p})=>{
    await seed(p);await garden(p);await holdEconomy(p);await click(p,'shop');await queuedEconomy(p);await click(p,'parent');await p.locator('#parent-answer').waitFor();const plays=await p.evaluate(()=>qaEconomy.plays.length);
    await releaseEconomy(p);assert(await p.locator('#parent-answer').isVisible());assert.equal(await p.locator('.seed-shop-view').count(),0);assert((await state(p)).shop.offer);assert(!await p.evaluate(n=>qaEconomy.plays.slice(n).some(x=>x.endsWith('/economy-shop.mp3')),plays));
  });
  await test('A delayed reservation persists without pulling back or speaking after leaving the shop',async({p})=>{
    await seed(p,{shop:true});await shop(p);const offer=(await state(p)).shop.offer;await holdEconomy(p);await p.locator('[data-reserve-offer]').tap();await queuedEconomy(p);await click(p,'shop-back');await p.locator('.meadow-view').waitFor();const plays=await p.evaluate(()=>qaEconomy.plays.length);
    await releaseEconomy(p);assert(await p.locator('.meadow-view').isVisible());assert.equal(await p.locator('.seed-shop-view').count(),0);assert.deepEqual((await state(p)).shop.reserved,offer);assert(!await p.evaluate(n=>qaEconomy.plays.slice(n).some(x=>x.endsWith('/economy-reserve.mp3')),plays));
  });
  for(const action of ['shop','reserve'])await test(`A delayed ${action} transaction stays silent during simulated background visibility`,async({p})=>{
    await seed(p,{shop:action==='reserve'});if(action==='shop')await garden(p);else await shop(p);const before=await state(p);await holdEconomy(p);
    if(action==='shop')await click(p,'shop');else await p.locator('[data-reserve-offer]').tap();await queuedEconomy(p);
    await p.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));});const plays=await p.evaluate(()=>qaEconomy.plays.length);await releaseEconomy(p);
    assert(await p.locator(action==='shop'?'.meadow-view':'.seed-shop-view').isVisible());if(action==='shop')assert((await state(p)).shop.offer);else assert.deepEqual((await state(p)).shop.reserved,before.shop.offer);
    assert(!await p.evaluate(n=>qaEconomy.plays.slice(n).some(x=>/\/economy-(shop|reserve)\.mp3$/.test(x)),plays));
    await p.evaluate(()=>{delete document.hidden;document.dispatchEvent(new Event('visibilitychange'));});
  });
  await test('A delayed finish credits once silently in background and restores starter or pending choice on visibility',async({p})=>{
    for(const [i,id]of['hello-everyone','hello-morning'].entries()){
      await completeStory(p,id,{finish:false});const before=await state(p);await holdEconomy(p);await click(p,'finish');await queuedEconomy(p);const silence=await background(p);await releaseEconomy(p);await staysSilent(p,silence);
      const credited=await state(p),round=credited.rounds[credited.rounds.length-1];assert.equal(credited.rounds.length,i+1);assert.equal(round.eventId,id);assert.equal(round.reward,i?'pending':'starter');assert.equal(round.starter,!i);assert.deepEqual(balance(credited),i?balance(before):[2,5]);
      assert.equal(await p.evaluate(({key,id})=>JSON.parse(localStorage.getItem(key)).entries.filter(r=>r.roundId===id).length,{key:PLAN,id:round.roundId}),1,'The completed practice identity is also persisted once');
      await foreground(p);await p.locator(`.reward-view[data-choice="${i?'true':'false'}"]`).waitFor();assert.deepEqual(await state(p),credited);assert.equal(await p.locator('[data-reward-choice]').count(),i?2:0);await p.screenshot({path:path.join(out,`foreground-finish-${i?'pending':'starter'}.png`),animations:'disabled',fullPage:true});
      await foreground(p);await p.waitForTimeout(400);assert.deepEqual(await state(p),credited,'Repeated foreground events never repeat the reward');await reload(p);assert.deepEqual(await state(p),credited,'Reload never repeats a background completion');
      if(i){await click(p,'garden');await choose(p,'water');const paid=await state(p);assert.deepEqual(balance(paid),[2,10]);assert.equal(pending(paid).length,0);await reload(p);assert.deepEqual(await state(p),paid);}
    }
  });
  await test('A delayed purchase stays silent in background and restores the purchased seed instead of stale shop',async({p})=>{
    await seed(p,{shop:true});await shop(p);const before=await state(p),offer=before.shop.offer;await holdEconomy(p);await p.locator('[data-buy-offer][data-source="shop"]').tap();await queuedEconomy(p);const silence=await background(p);await releaseEconomy(p);await staysSilent(p,silence);
    const bought=await state(p);assert.equal(bought.shells,before.shells-offer.price);assert.equal(bought.water,before.water);assert.equal(bought.seedPacksOpened,before.seedPacksOpened+1);assert.equal(bought.pendingSeed.flowerId,offer.flowerId);assert.equal(bought.purchases.filter(s=>s.offerId===offer.id).length,1);
    await foreground(p);await p.locator('.meadow-view[data-garden-next="plant"]').waitFor();assert.equal(await p.locator('.seed-shop-view').count(),0);assert(await p.locator('[data-action="meadow-seed"]').isVisible());assert.equal(await p.locator('.meadow-view').getAttribute('data-tool'),'seed');assert.deepEqual(await state(p),bought);await p.screenshot({path:path.join(out,'foreground-purchase-seed.png'),animations:'disabled',fullPage:true});
    await foreground(p);assert.deepEqual(await state(p),bought);await plantPending(p);const planted=await state(p);assert.equal(planted.pendingSeed,null);assert.equal(planted.plants[planted.plants.length-1].flowerId,offer.flowerId);assert.deepEqual(balance(planted),balance(bought));await reload(p);assert.deepEqual(await state(p),planted,'Returning and planting never deduct the purchase twice');
  });
  await test('A failed claim save leaves the reward pending and a retry pays once',async({p})=>{
    const before=await seed(p,{pendingRounds:1});await click(p,'garden');await p.locator('[data-reward-choice]').first().waitFor();
    await p.evaluate(key=>{const old=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(k===key)throw new DOMException('QA quota','QuotaExceededError');return old.call(this,k,v);};qaEconomy.restoreStorage=()=>Storage.prototype.setItem=old;},B);
    await p.locator('[data-reward-choice="water"]').tap();await p.locator('.modal-card').waitFor();assert.deepEqual(await state(p),before);await p.evaluate(()=>qaEconomy.restoreStorage());await click(p,'close');await choose(p,'water');const after=await state(p);assert.deepEqual(balance(after),[before.shells,before.water+5]);await reload(p);assert.deepEqual(await state(p),after);
  });
  await test('Legacy schema1 migrates in place, preserving old rewards, A data and plant IDs',async({p})=>{
    const legacy={schemaVersion:1,product:'xiaoya-english-meadow',shells:3,water:9,rounds:[0,1,2].map(i=>({roundId:`qa-legacy-${i}`,eventId:'food-water',date:'2026-10-17'})),seedPacksOpened:2,bag:['giant-daisy','bow-blue','tulip','bow-yellow','sunflower','bow-purple','bellflower','giant-sunflower','poppy','violet'],pendingSeed:null,plants:[{id:'plant-1',seedId:'seed-1',flowerId:'daisy',waterings:5,x:.2,y:.7},{id:'plant-2',seedId:'seed-2',flowerId:'bow-pink',waterings:1,x:.7,y:.7}]};
    const aRaw=await p.evaluate(async({a,b,legacy})=>{const m=await import(new URL('garden.js',document.querySelector('script[type="module"][src]').src));const aRaw=JSON.stringify(m.rewardRound(m.createGarden(),{roundId:'qa-a-original',eventId:'food-water',date:'2026-10-17'}));localStorage.setItem(a,aRaw);localStorage.setItem(b,JSON.stringify(legacy));return aRaw;},{a:A,b:B,legacy});
    await reload(p);await garden(p);assert.equal(await p.locator('[data-meadow-plant]').count(),2);await click(p,'meadow-can');await p.locator('[data-meadow-plant="plant-2"]').tap();await p.waitForFunction(key=>JSON.parse(localStorage.getItem(key)).plants[1].waterings===2,B);
    const migrated=await state(p);assert.equal(migrated.schemaVersion,2);assert.deepEqual(balance(migrated),[3,8]);assert.deepEqual(migrated.plants[0],legacy.plants[0]);assert.deepEqual(migrated.rounds.map(r=>r.roundId),legacy.rounds.map(r=>r.roundId));assert(migrated.rounds.every(r=>r.reward==='legacy'));assert.equal(pending(migrated).length,0);assert.equal(await p.evaluate(key=>localStorage.getItem(key),A),aRaw);
    await completeStory(p,'hello-everyone');const next=await state(p);assert.deepEqual(balance(next),balance(migrated));assert.equal(pending(next).length,1);assert.equal(next.rounds[next.rounds.length-1].starter,false,'Migrated users do not receive a second starter award');
  });
  await test('An empty schema1 save receives its first starter reward and complete daisy planting loop',async({p})=>{
    const empty={schemaVersion:1,product:'xiaoya-english-meadow',shells:0,water:0,rounds:[],seedPacksOpened:0,bag:['daisy','bow-pink','giant-daisy','bow-blue','tulip','bow-yellow','sunflower','bow-purple','bellflower','giant-sunflower','poppy','violet'],pendingSeed:null,plants:[]};
    await p.evaluate(({key,value})=>localStorage.setItem(key,JSON.stringify(value)),{key:B,value:empty});await reload(p);await completeStory(p,'hello-everyone');const first=await state(p);assert.equal(first.schemaVersion,2);assert.deepEqual(balance(first),[2,5]);assert.equal(first.rounds[0].reward,'starter');assert.equal(first.rounds[0].starter,true);assert.equal(pending(first).length,0);
    await garden(p);await click(p,'shop');await p.locator('.seed-shop-view').waitFor();await click(p,'shop-pack');await p.locator('.meadow-view').waitFor();assert.equal((await state(p)).pendingSeed.flowerId,'daisy');await plantPending(p);await click(p,'meadow-can');await p.locator('[data-meadow-plant="plant-1"]').tap();await p.waitForFunction(key=>JSON.parse(localStorage.getItem(key)).plants[0].waterings===1,B);assert.deepEqual(balance(await state(p)),[0,4]);
  });
  for(const [width,height,motion]of[[320,568,'no-preference'],[320,568,'reduce'],[390,844,'reduce'],[768,1024,'no-preference']])await test(`Shop and resource choice touch layout ${width}x${height} ${motion}`,async({p})=>{
    await seed(p,{reserved:true});await shop(p);assert.equal(await p.locator('.seed-offer').count(),3);await layout(p);await p.screenshot({path:path.join(out,`shop-${width}-${motion}.png`),animations:'disabled',fullPage:true});
    await p.locator('[data-reserve-offer]').tap();await p.locator('[data-action="replace-reservation"]').waitFor();await layout(p);await p.screenshot({path:path.join(out,`replace-${width}-${motion}.png`),animations:'disabled',fullPage:true});await click(p,'close');
    await seed(p,{pendingRounds:1});await click(p,'garden');await p.locator('[data-reward-choice]').first().waitFor();await layout(p);await p.screenshot({path:path.join(out,`choice-${width}-${motion}.png`),animations:'disabled',fullPage:true});
    await choose(p,'water');await garden(p);await layout(p);
  },{width,height,motion});
  await test('Cached shop and pending choice work in a real offline cold page without rerolling',async({c,p})=>{
    await seed(p,{reserved:true});await shop(p);const warmed=await state(p);await p.waitForFunction(()=>!!navigator.serviceWorker.controller,undefined,{timeout:30000});assert.equal(await p.evaluate(async()=>(await navigator.serviceWorker.ready).scope),origin+'/xiaoya/');
    await p.evaluate(async key=>{const m=await import(new URL('garden-meadow.js',document.querySelector('script[type="module"][src]').src));localStorage.setItem(key,JSON.stringify(m.rewardRound(JSON.parse(localStorage.getItem(key)),{roundId:'qa-offline-pending',eventId:'hello-thanks',date:'2026-10-18'})));},B);
    await c.setOffline(true);const cold=await c.newPage();cold.setDefaultTimeout(20000);await cold.goto(origin+'/xiaoya/?garden=b');await cold.locator('.home-view').waitFor();await click(cold,'garden');await choose(cold,'shells');assert.deepEqual(balance(await state(cold)),[warmed.shells+2,warmed.water]);await garden(cold);await click(cold,'shop');await cold.locator('.seed-shop-view').waitFor();assert.deepEqual((await state(cold)).shop,warmed.shop);
    await cold.locator('[data-buy-offer][data-source="reserved"]').tap();await cold.locator('.meadow-view').waitFor();const bought=await state(cold);assert.equal(bought.pendingSeed.flowerId,warmed.shop.reserved.flowerId);await plantPending(cold);await click(cold,'meadow-can');await cold.locator('[data-meadow-plant="plant-1"]').tap();await cold.waitForFunction(key=>JSON.parse(localStorage.getItem(key)).plants[0].waterings===1,B);await layout(cold);assert.deepEqual(await cold.evaluate(()=>qaEconomy.errors),[]);await cold.screenshot({path:path.join(out,'offline-shop-purchased-and-planted.png'),animations:'disabled',fullPage:true});await cold.close();
  },{serviceWorkers:'allow'});
}
(async()=>{fs.mkdirSync(out,{recursive:true});browser=await chromium.launch({channel:'msedge',headless:true,args:['--autoplay-policy=no-user-gesture-required']});await cases();assert(report.checks.length,'No economy checks selected');await browser.close();browser=null;save();console.log(`${report.checks.filter(c=>c.status==='PASS').length}/${report.checks.length} passed`);if(report.checks.some(c=>c.status!=='PASS'))process.exitCode=1;})().catch(async e=>{console.error(e);if(browser)await browser.close();process.exitCode=1;});
