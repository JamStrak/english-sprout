// Real built modules + Edge, using disposable profiles and no real microphone.
// Run only after npm run build and the loopback server serves that dist version.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'C:/Users/Jam/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const origin=new URL(process.env.TEST_URL||'http://127.0.0.1:24756').origin;
if(!['127.0.0.1','localhost','[::1]'].includes(new URL(origin).hostname))throw new Error('Challenge integration requires an isolated loopback server.');
const out=path.resolve(process.env.XIAOYA_CHALLENGE_TEST_OUT||path.join(__dirname,'../test-results/xiaoya-v013-challenge'));
const filter=process.env.XIAOYA_TEST_FILTER?new RegExp(process.env.XIAOYA_TEST_FILTER):null;
const B='xiaoya-english:meadow:v1',STATE='xiaoya-english:state:v1',PLAN='xiaoya-english:practice-plan:v1',CHALLENGE='xiaoya-english:challenges:v1';
const results=[];let browser;

async function fixture(){
  const c=await browser.newContext({viewport:{width:390,height:844},timezoneId:'Asia/Shanghai',serviceWorkers:'block',isMobile:true,hasTouch:true,reducedMotion:'reduce'});
  const requests=[],errors=[];
  c.on('request',r=>requests.push({url:r.url(),method:r.method()}));
  c.on('page',p=>p.on('pageerror',error=>errors.push(error.message)));
  await c.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort('blockedbyclient'));
  await c.route(/\/(?:xiaoya\/speech\/|speech\/(?:vosk-|model-))/,route=>route.abort('failed'));
  await c.addInitScript(({origin})=>{
    if(location.origin!==origin)return;
    const NativeDate=Date,now=NativeDate.parse('2026-10-19T12:00:00+08:00');
    window.Date=class extends NativeDate{constructor(...args){super(...(args.length?args:[now]));}static now(){return now;}};
    window.qa={errors:[],audios:[],plays:[],micCalls:0};
    window.addEventListener('error',e=>{if(e.message)qa.errors.push(e.message);});
    window.addEventListener('unhandledrejection',e=>qa.errors.push(String(e.reason)));
    // Failing closed proves these cases never request a physical microphone.
    if(navigator.mediaDevices)navigator.mediaDevices.getUserMedia=()=>{qa.micCalls++;return Promise.reject(new Error('No microphone is allowed in challenge integration'));};
    const NativeAudio=Audio;
    window.Audio=function(...args){
      const audio=new NativeAudio(...args),entry={url:String(args[0]||''),ended:false,error:false};
      audio.playbackRate=3;qa.audios.push(entry);
      audio.addEventListener('playing',()=>qa.plays.push({url:entry.url,event:document.querySelector('main[data-event]')?.dataset.event||null}));
      audio.addEventListener('ended',()=>entry.ended=true);audio.addEventListener('error',()=>entry.error=true);return audio;
    };window.Audio.prototype=NativeAudio.prototype;
  },{origin});
  const p=await c.newPage();p.setDefaultTimeout(20000);
  try{
    await p.goto(origin+'/xiaoya/?garden=b');await p.locator('main.home-view').waitFor();
    const gift=p.locator('[data-action="open-welcome-gift"]');
    if(await gift.isVisible()){await gift.click();await p.locator('.welcome-gift-overlay[open]').waitFor({state:'hidden',timeout:12000});}
    return{c,p,requests,errors};
  }
  catch(error){await c.close();throw error;}
}
const click=(p,action)=>p.locator(`[data-action="${action}"]`).first().click();
const saved=(p,key)=>p.evaluate(key=>JSON.parse(localStorage.getItem(key)||'null'),key);
async function reload(p){await p.reload();await p.locator('main.home-view').waitFor();}
async function unlock(p){
  if(await p.locator('#parent-answer').count()){
    const numbers=(await p.locator('label[for="parent-answer"]').textContent()).match(/\d+/g).map(Number);
    await p.locator('#parent-answer').fill(String(numbers[0]+numbers[1]));await click(p,'gate-submit');
  }
}
async function observe(p,result='independent',{expectedHelped=false}={}){
  await click(p,'observe');await unlock(p);await p.locator('#observed-help').waitFor();
  assert.equal(await p.locator('#observed-help').isChecked(),expectedHelped,'The observation accurately exposes whether this attempt heard help');
  if(expectedHelped)assert(await p.locator('#observed-help').isDisabled(),'Hearing the sample cannot be unchecked as independent');
  await p.locator(`[data-observation="${result}"]`).click();await p.locator('[data-phase="resolved"]').waitFor();
  return(await saved(p,STATE)).evidence.at(-1);
}
async function board(p){await click(p,'challenges');await p.locator('[data-challenge-board]').waitFor();}
async function start(p,id='challenge-1'){
  if(!await p.locator('[data-challenge-board]').count())await board(p);
  await p.locator(`[data-challenge-unit="${id}"]`).click();await p.locator(`[data-challenge="${id}"][data-phase="request"]`).waitFor();
}
async function summary(p){return p.evaluate(async({B,STATE,PLAN,CHALLENGE})=>{
  const base=document.querySelector('script[type="module"][src]').src;
  const [ch,pr,learning]=await Promise.all(['challenges.js','practice-plan.js','learning.js'].map(file=>import(new URL(file,base))));
  const read=(key,fallback)=>JSON.parse(localStorage.getItem(key)||'null')||fallback;
  const practicePlan=pr.getPracticePlan(read(PLAN,pr.createPracticePlan()),{rounds:read(B,{rounds:[]}).rounds,learningState:read(STATE,learning.createState()),date:learning.localDay()});
  return ch.getChallenges(read(CHALLENGE,ch.createChallenges()),{practicePlan,date:learning.localDay()});
},{B,STATE,PLAN,CHALLENGE});}
async function seed(p,{studied=4,completed=0,partial=0,pendingOrdinary=false}={}){
  const info=await p.evaluate(async({studied,completed,partial,pendingOrdinary})=>{
    const base=document.querySelector('script[type="module"][src]').src;
    const [ch,pr,meadow,learning,stories]=await Promise.all(['challenges.js','practice-plan.js','garden-meadow.js','learning.js','stories.js'].map(file=>import(new URL(file,base))));
    let plan=pr.createPracticePlan(),progress=ch.createChallenges(),garden=meadow.claimWelcomeGift(meadow.createMeadow(),'2026-10-19');
    const all=ch.CHALLENGE_UNITS.flatMap(unit=>unit.eventIds);
    for(const [i,eventId]of all.slice(0,studied).entries())plan=pr.recordPractice(plan,{roundId:`qa-study-${i}`,eventId,date:'2026-10-18',attemptId:null,mode:'new',rewardVariant:null});
    for(const [ui,unit]of ch.CHALLENGE_UNITS.entries())for(const [ei,eventId]of unit.eventIds.entries()){
      if(ui>=completed&&(ui!==completed||ei>=partial))continue;
      progress=ch.recordChallengeAttempt(progress,{id:`qa-clear-${ui}-${ei}`,unitId:unit.id,eventId,date:'2026-10-19',attemptId:`qa-attempt-${ui}-${ei}`,result:'independent',helped:false,source:'parent'});
    }
    if(pendingOrdinary){garden=meadow.rewardRound(garden,{roundId:'qa-starter',eventId:all[0],date:'2026-10-18'});garden=meadow.openSeedPack(garden,0);}
    localStorage.setItem(pr.PRACTICE_KEY,JSON.stringify(plan));
    localStorage.setItem(ch.CHALLENGE_KEY,JSON.stringify(progress));
    localStorage.setItem(meadow.MEADOW_KEY,JSON.stringify(garden));
    localStorage.setItem(learning.STORAGE_KEY,JSON.stringify(learning.createState()));
    return{units:ch.CHALLENGE_UNITS,stories:stories.STORIES.map(s=>({id:s.id,lessonId:s.event.lessonId,contextId:s.event.contexts[0].id})),originalGarden:garden};
  },{studied,completed,partial,pendingOrdinary});
  await reload(p);
  await p.waitForFunction(({key,count})=>JSON.parse(localStorage.getItem(key)||'null')?.challengeRewards.length===count,{key:B,count:completed});
  return info;
}
async function layout(p){
  await p.evaluate(async()=>Promise.all(document.getAnimations().filter(a=>Number.isFinite(a.effect?.getTiming().iterations)&&a.playState==='running').map(a=>a.finished.catch(()=>{}))));
  const b=await p.evaluate(()=>({width:innerWidth,height:innerHeight,scrollWidth:document.documentElement.scrollWidth,scrollHeight:document.documentElement.scrollHeight}));
  assert(b.scrollWidth<=b.width+1,`Horizontal overflow: ${JSON.stringify(b)}`);
  const isBoard=await p.locator('[data-challenge-board]').count()>0;
  if(!isBoard)assert(b.scrollHeight<=b.height+1,`Child flow needs scrolling: ${JSON.stringify(b)}`);
  assert(!/[A-Za-z]/.test(await p.locator('#app main').innerText()),'Child challenge screens have no English letters');
  for(const r of await p.locator('#app button:visible').evaluateAll(es=>es.map(e=>{const r=e.getBoundingClientRect();return{label:e.getAttribute('aria-label'),x:r.x,y:r.y,width:r.width,height:r.height};}))){
    assert(r.width>=47&&r.height>=47,`Small touch target: ${JSON.stringify(r)}`);
    assert(r.x>=-1&&r.y>=-1&&r.x+r.width<=b.width+1&&r.y+r.height<=(isBoard?b.scrollHeight:b.height)+1,`Target outside screen: ${JSON.stringify(r)}`);
  }
}
async function diagnostic(p){return p.evaluate(()=>({version:document.querySelector('meta[name="xiaoya-version"]')?.content,build:document.querySelector('meta[name="xiaoya-build"]')?.content,main:document.querySelector('main')?.outerHTML,storage:Object.fromEntries(Object.keys(localStorage).filter(k=>k.startsWith('xiaoya')).map(k=>[k,localStorage.getItem(k)])),qa})).catch(error=>({error:error.message}));}
async function test(name,fn){
  if(filter&&!filter.test(name))return;let f;
  try{
    f=await fixture();await fn(f);
    assert.deepEqual(f.errors,[],'No page JavaScript errors across reloads');assert.deepEqual(await f.p.evaluate(()=>qa.errors),[],'No unhandled errors');
    assert.equal(await f.p.evaluate(()=>qa.micCalls),0,'No microphone requested');
    assert(!f.requests.some(r=>r.method!=='GET'||new URL(r.url).origin!==origin),'No uploads or external requests');
    results.push({name,status:'PASS',diagnostic:await diagnostic(f.p)});console.log('PASS',name);
  }catch(error){
    results.push({name,status:'FAIL',error:error.stack,diagnostic:f?await diagnostic(f.p):null});console.error('FAIL',name,error.message);
    if(f)await f.p.screenshot({animations:'disabled',path:path.join(out,`failed-${results.length}.png`),fullPage:true}).catch(()=>{});
  }finally{await f?.c.close();}
}
async function plantPending(p,position={x:130,y:220}){
  if(await p.locator('main.meadow-view').getAttribute('data-tool')!=='seed')await click(p,'meadow-seed');
  await p.locator('[data-meadow-field]').click({position});
  await p.waitForFunction(key=>JSON.parse(localStorage.getItem(key)||'null')?.pendingSeed===null,B);
}

async function run(){
  await test('Four studied expressions expose a voluntary challenge; its 390px board and prompt do not play the English answer',async({p})=>{
    assert.equal(await p.locator('[data-action="challenges"]').count(),0);
    await seed(p,{studied:3});assert.equal(await p.locator('[data-action="challenges"]').count(),0,'Three expressions cannot advertise a ready four-expression unit');
    const info=await seed(p);assert.equal(await p.locator('[data-action="challenges"]').count(),1);
    const unit=(await summary(p)).units[0];assert.equal(unit.available,true);assert.equal(unit.ready,false,'Learning alone does not trigger an automatic test invitation');
    await board(p);await layout(p);assert.equal(await p.locator('[data-challenge-unit]').count(),info.units.length);
    assert.equal((await p.locator('.challenge-prize-preview').innerText()).replace(/\s/g,''),'4＋6');
    await p.screenshot({animations:'disabled',path:path.join(out,'challenge-board-390.png'),fullPage:true});
    await start(p);const story=info.stories.find(s=>s.id===unit.items[0].eventId);
    assert.equal(await p.locator('.round-goal').isVisible(),false,'The prompt stays focused; rewards are previewed on the board');
    assert.equal(await p.locator('.round-goal').getAttribute('aria-label'),'整组首次完成可获得4枚贝壳和6滴水，还有这关的花种');
    assert.equal(await p.locator('#app main').getAttribute('data-event'),story.id);assert.equal(await p.locator('#app main').getAttribute('data-context'),story.contextId);
    await p.waitForFunction(()=>qa.plays.some(x=>x.url.endsWith('/challenge-question.mp3')));
    await p.waitForFunction(()=>qa.audios.some(x=>x.url.endsWith('/challenge-question.mp3')&&x.ended));
    assert.equal(await p.evaluate(lesson=>qa.plays.filter(x=>x.url.endsWith(`/${lesson}.mp3`)).length,story.lessonId),0,'A challenge never supplies its target answer automatically');
    assert.equal(await p.locator('[data-action="sample"]').count(),1);assert.equal(await p.locator('[data-action="record"]').count(),1);
    await layout(p);await p.screenshot({animations:'disabled',path:path.join(out,'challenge-prompt-390.png'),fullPage:true});
    assert.equal((await saved(p,CHALLENGE)).attempts.length,0);assert.equal((await saved(p,STATE)).evidence.length,0);
  });
  await test('Parent-observed independent steps survive refresh, award 4 shells and 6 water once, and replay cannot farm rewards',async({p})=>{
    const info=await seed(p);await start(p);await observe(p);await click(p,'finish');
    await p.locator(`[data-phase="request"][data-event="${info.units[0].eventIds[1]}"]`).waitFor();
    assert.equal((await summary(p)).units[0].completedCount,1);await reload(p);await board(p);
    assert.equal(await p.locator('[data-challenge-unit="challenge-1"] .done').count(),1);await start(p);
    for(let i=1;i<4;i++){
      assert.equal(await p.locator('#app main').getAttribute('data-event'),info.units[0].eventIds[i]);await observe(p);await click(p,'finish');
      await p.locator(i===3?'[data-challenge-complete="challenge-1"]':'[data-phase="request"]').waitFor();
    }
    const first=await saved(p,B);assert.equal(first.shells,5);assert.equal(first.water,6);assert.equal(first.rounds.length,0);assert.equal(first.challengeRewards.length,1);
    assert.equal((await summary(p)).units[0].completedCount,4);const layoutFailure=await layout(p).then(()=>null,error=>error);
    await p.screenshot({animations:'disabled',path:path.join(out,'challenge-first-clear-390.png'),fullPage:true});
    await reload(p);assert.deepEqual(await saved(p,B),first);await start(p);
    assert.equal(await p.locator('.round-goal').innerText(),'','Replays do not preview rewards that cannot be earned again');
    for(let i=0;i<4;i++){
      assert.equal(await p.locator('#app main').getAttribute('data-event'),info.units[0].eventIds[i]);await observe(p);await click(p,'finish');
      await p.locator(i===3?'[data-challenge-board]':'[data-phase="request"]').waitFor();
    }
    assert.deepEqual(await saved(p,B),first,'Replaying all four expressions neither creates gifts nor duplicates the receipt');
    const log=await saved(p,CHALLENGE),practice=await saved(p,PLAN);
    assert.equal(log.attempts.length,8);assert.equal(practice.entries.filter(x=>x.roundId.startsWith('challenge:')).length,8);assert(practice.entries.every(x=>x.rewardVariant===null));
    await reload(p);assert.deepEqual(await saved(p,B),first);assert.equal((await summary(p)).completedCount,1);if(layoutFailure)throw layoutFailure;
  });
  await test('A sample marks the attempt as helped; a fresh targeted retry clears one step as after-practice without claiming mastery',async({p})=>{
    const info=await seed(p);await start(p);const lesson=info.stories.find(s=>s.id===info.units[0].eventIds[0]).lessonId;
    await click(p,'sample');await p.waitForFunction(lesson=>qa.audios.some(x=>x.url.endsWith(`/${lesson}.mp3`)&&x.ended),lesson);
    const helped=await observe(p,'independent',{expectedHelped:true});assert.equal(helped.result,'supported');assert.equal(helped.helped,true);
    let progress=await summary(p);assert.equal(progress.units[0].completedCount,0);assert.equal(await p.locator('[data-action="finish"]').count(),0);
    const firstAttempt=(await saved(p,CHALLENGE)).attempts[0];assert.equal(firstAttempt.result,'supported');assert.equal(firstAttempt.helped,true);
    await click(p,'challenge-retry');await p.locator('[data-phase="request"]').waitFor();
    const retry=await observe(p);assert.equal(retry.result,'supported','Learning evidence retains the preceding help even when this new game attempt is independent');assert.equal(retry.helped,true);
    const attempts=(await saved(p,CHALLENGE)).attempts;assert.equal(attempts.length,2);assert.equal(attempts[1].result,'independent');assert.equal(attempts[1].helped,false);assert.equal(attempts[1].retryAfterAttemptId,firstAttempt.attemptId);
    progress=await summary(p);assert.equal(progress.units[0].completedCount,1);assert.equal(progress.units[0].items[0].passEvidence,'after-practice');assert.equal(progress.units[0].items[0].priorHelp,true);
    assert.equal((await saved(p,B)).shells,1);assert.equal((await saved(p,B)).water,0);await reload(p);
    progress=await summary(p);assert.equal(progress.units[0].items[0].passEvidence,'after-practice');assert.equal(progress.units[0].completedCount,1);
    await start(p);assert.equal(await p.locator('#app main').getAttribute('data-event'),info.units[0].eventIds[1],'Only unfinished expressions are retried after refresh');
  });
  for(const refresh of [false,true])await test(`A sample followed by leaving without speaking${refresh?' and refreshing':''} keeps same-day help for the fresh challenge`,async({p})=>{
    const info=await seed(p);await start(p);const eventId=info.units[0].eventIds[0],lesson=info.stories.find(s=>s.id===eventId).lessonId;
    await click(p,'sample');await p.waitForFunction(lesson=>qa.audios.some(x=>x.url.endsWith(`/${lesson}.mp3`)&&x.ended),lesson);
    const heard=await saved(p,CHALLENGE);assert.equal(heard.helps.length,1);assert.equal(heard.helps[0].eventId,eventId);assert.equal(heard.helps[0].afterAttemptCount,0);
    assert.equal(heard.attempts.length,0,'Requesting help is not a pretend speech attempt');assert.equal((await saved(p,STATE)).evidence.length,0);
    await click(p,'home');await p.locator('main.home-view').waitFor();if(refresh)await reload(p);
    let item=(await summary(p)).units[0].items[0];assert.equal(item.helpedToday,true);assert.equal(item.passed,false);assert.equal(item.attemptCount,0);
    await start(p);assert.equal(await p.locator('#app main').getAttribute('data-event'),eventId);
    const evidence=await observe(p);assert.equal(evidence.result,'supported','Learning cannot lose the earlier help when a child leaves before recording');assert.equal(evidence.helped,true);
    const log=await saved(p,CHALLENGE);assert.equal(log.helps.length,1);assert.equal(log.attempts.length,1);assert.equal(log.attempts[0].result,'independent');assert.equal(log.attempts[0].helped,false);assert.equal(log.attempts[0].retryAfterAttemptId,null);
    item=(await summary(p)).units[0].items[0];assert.equal(item.passed,true,'A fresh independent answer can still clear the game');assert.equal(item.priorHelp,true);assert.equal(item.helpedToday,true);assert.equal(item.passEvidence,'after-practice');
    await reload(p);item=(await summary(p)).units[0].items[0];assert.equal(item.passEvidence,'after-practice');assert.equal(item.attemptCount,1);
    assert.equal((await saved(p,B)).challengeRewards.length,0);
  });
  await test('A persisted clear with a missing wallet receipt recovers on reload exactly once',async({p})=>{
    await seed(p,{completed:1});const restored=await saved(p,B);
    assert.equal(restored.shells,5);assert.equal(restored.water,6);assert.equal(restored.challengeRewards.length,1);
    assert.equal(restored.challengeRewards[0].id,'challenge:first-clear:challenge-1');assert.equal(restored.challengeSeeds.length,1);
    const log=await saved(p,CHALLENGE),practice=await saved(p,PLAN);
    assert.equal(practice.entries.length,8,'Four existing studies and four interrupted challenge review writes are preserved');
    assert.deepEqual(practice.entries.filter(x=>x.roundId.startsWith('challenge:')),log.attempts.map(a=>({roundId:`challenge:${a.attemptId}`,eventId:a.eventId,date:a.date,attemptId:a.attemptId,mode:'review',rewardVariant:null})),'Recovered review metadata refers only to real saved challenge attempts and grants no participation reward');
    await reload(p);assert.deepEqual(await saved(p,B),restored);assert.deepEqual(await saved(p,CHALLENGE),log);assert.deepEqual(await saved(p,PLAN),practice,'Reload cannot duplicate recovered review entries');
    assert.equal((await saved(p,STATE)).evidence.length,0,'Recovery does not invent independent learning evidence');
  });
  for(const count of [3,6])await test(`Each of ${count} cleared units grants its own flower seed once and preserves an ordinary seed already in hand`,async({p})=>{
    const info=await seed(p,{studied:24,completed:count-1,partial:3,pendingOrdinary:true});
    const held=info.originalGarden.pendingSeed;await start(p,`challenge-${count}`);await observe(p);await click(p,'finish');
    await p.locator(`[data-challenge-complete="challenge-${count}"]`).waitFor();
    let wallet=await saved(p,B);assert.equal(wallet.challengeRewards.length,count);assert.equal(wallet.shells,1+count*4);assert.equal(wallet.water,3+count*6);
    assert.deepEqual(wallet.pendingSeed,held,'Challenge entitlements cannot replace a seed the child already holds');
    const flowers=await p.evaluate(async count=>{const base=document.querySelector('script[type="module"][src]').src;const {getChallengeFlower}=await import(new URL('challenge-flowers.js',base));return Array.from({length:count},(_,i)=>getChallengeFlower(`challenge-${i+1}`).id);},count);
    assert.deepEqual(wallet.challengeSeeds.map(x=>x.flowerId),flowers);assert(wallet.challengeSeeds.every(x=>x.seedId===null));
    assert.equal(await p.locator('.challenge-seed-earned').count(),1);const layoutFailure=await layout(p).then(()=>null,error=>error);
    await p.screenshot({animations:'disabled',path:path.join(out,`challenge-seeds-${count}-390.png`),fullPage:true});
    await click(p,'garden');await p.locator('main.meadow-view[data-garden-next="plant"]').waitFor();assert.equal(await p.locator('[data-action="meadow-seed"]').count(),1);
    await board(p);await click(p,'challenge-seed');await p.locator('main.meadow-view[data-garden-next="plant"]').waitFor();
    assert.deepEqual((await saved(p,B)).pendingSeed,held,'Even requesting the special seed takes the child to plant their existing seed first');
    await plantPending(p);wallet=await saved(p,B);assert.equal(wallet.plants[0].flowerId,held.flowerId);assert.equal(wallet.pendingSeed,null);
    for(const [i,flowerId]of flowers.entries()){
      await p.locator('[data-action="challenge-seed"]').waitFor();await click(p,'challenge-seed');
      await p.waitForFunction(({key,id})=>JSON.parse(localStorage.getItem(key)||'null')?.pendingSeed?.flowerId===id,{key:B,id:flowerId});
      wallet=await saved(p,B);const special=wallet.pendingSeed;assert.equal(wallet.challengeSeeds[i].seedId,special.id);
      assert.equal(wallet.shells,1+count*4,'Claiming an earned seed costs no shells');
      await reload(p);assert.deepEqual((await saved(p,B)).pendingSeed,special,'The exact claimed seed persists across refresh');
      await click(p,'garden');await p.locator('main.meadow-view').waitFor();await plantPending(p,{x:60+(i%3)*100,y:80+Math.floor(i/3)*100});
    }
    wallet=await saved(p,B);assert.deepEqual(wallet.plants.slice(1).map(x=>x.flowerId),flowers);assert(wallet.challengeSeeds.every(x=>x.seedId));
    await board(p);assert.equal(await p.locator('[data-action="challenge-seed"]').count(),0,'Claimed challenge seeds cannot be claimed again');
    assert.equal(await p.locator('.challenge-milestone').count(),0,'Old 3/6-unit reward gates are removed');
    assert.equal(await p.locator('.challenge-unit.completed').count(),count);
    await reload(p);assert.deepEqual(await saved(p,B),wallet,'Restart does not duplicate flower entitlements or wallet rewards');if(layoutFailure)throw layoutFailure;
  });
  await test('All 21 completed units recover 21 different flower rewards and render their real card images',async({p})=>{
    await seed(p,{studied:84,completed:21});const wallet=await saved(p,B);
    assert.equal(wallet.challengeSeeds.length,21);assert.equal(new Set(wallet.challengeSeeds.map(seed=>seed.flowerId)).size,21);
    await board(p);assert.equal(await p.locator('[data-reward-flower]').count(),21);assert.equal(await p.locator('.challenge-unit.completed').count(),21);
    assert.deepEqual(await p.locator('[data-reward-flower]').evaluateAll(cards=>cards.map(card=>card.dataset.rewardFlower)),wallet.challengeSeeds.map(seed=>seed.flowerId));
    const images=await p.locator('.challenge-target-flower image').evaluateAll(async images=>Promise.all(images.map(async element=>{const img=new Image();img.src=element.getAttribute('href');try{await img.decode();return{url:img.src,ok:img.naturalWidth>0};}catch{return{url:img.src,ok:false};}})));
    assert.equal(images.length,21);assert(images.every(image=>image.ok),'Every goal uses a decodable illustrated flower');
    await reload(p);assert.deepEqual(await saved(p,B),wallet,'Recovering all old clears is idempotent');
  });
}

(async()=>{
  fs.mkdirSync(out,{recursive:true});browser=await chromium.launch({channel:'msedge',headless:true,args:['--autoplay-policy=no-user-gesture-required']});
  await run();await browser.close();browser=null;if(!results.length)throw new Error('No challenge integration cases matched the filter.');
  fs.writeFileSync(path.join(out,filter?'results-filtered.json':'results.json'),JSON.stringify(results,null,2));
  console.log(`${results.filter(x=>x.status==='PASS').length}/${results.length} challenge integration cases passed`);if(results.some(x=>x.status!=='PASS'))process.exitCode=1;
})().catch(async error=>{console.error(error);if(browser)await browser.close();process.exitCode=1;});
