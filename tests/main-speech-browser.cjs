/* Main-path UI integration. Real MediaRecorder, mocked ASR outcomes; not an ASR accuracy test. */
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'C:/Users/Jam/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const {pathToFileURL}=require('node:url');
const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs');
const root=path.resolve(__dirname,'..'),origin=process.env.TEST_URL||'http://127.0.0.1:24736';
const out=path.join(root,'test-results/main-speech'),key='english-sprout-state-v1',today='2026-10-13';
const curriculum=JSON.parse(fs.readFileSync(path.join(root,'public/data/curriculum.json'),'utf8'));
fs.mkdirSync(out,{recursive:true});
const mock=`export async function prepareSpeech(){};
export async function assessRecording(url,expected){
 window.assessmentCalls=(window.assessmentCalls||0)+1;
 window.assessmentHadBlob=typeof url==='string'&&url.startsWith('blob:');
 if(window.assessmentMode==='error')throw new Error('Model unavailable fixture');
 if(window.assessmentMode==='pending')return new Promise(resolve=>{window.finishAssessment=()=>resolve({matched:true,stars:3,coverage:1,precision:1});});
 if(window.assessmentMode==='miss')return {matched:false,stars:1,coverage:0,precision:0};
 return {matched:true,stars:3,coverage:1,precision:1};
}`;
(async()=>{
 const learning=await import(pathToFileURL(path.join(root,'src/learning.js')));
 const garden=await import(pathToFileURL(path.join(root,'src/garden.js')));
 const empty=learning.createState(today);
 const learned=learning.recordResult(learning.createState('2026-10-12'),'hello-01','good','2026-10-12',{isNew:true});
 let checkup=learning.createState('2026-10-01');
 const first=curriculum.lessons.slice(0,3).map(l=>l.id);
 for(let i=0;i<3;i++)checkup=learning.recordResult(checkup,first[i],'good',`2026-10-0${i+1}`,{isNew:true});
 for(const [i,day]of [[0,2],[1,3],[2,4],[0,5],[1,6],[2,7]])checkup=learning.recordResult(checkup,first[i],'good',`2026-10-0${day}`);
 assert.equal(learning.getCheckupPlan(checkup,curriculum.lessons,today).due,true);
 const browser=await chromium.launch({channel:'msedge',headless:true,args:['--no-proxy-server','--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream']});
 const checks=[],contexts=[];
 async function setup(initial=empty,viewport={width:390,height:844},init){
  // Keep one isolated profile alive at a time; closed cases no longer need their
  // audio warm-up pools or fake microphone devices while later cases run.
  for(const prior of contexts)if(prior.pages().length){for(const p of prior.pages()){assert.deepEqual(p.qaErrors,[]);assert.deepEqual(p.qaUploads,[]);}await prior.close();}
  const context=await browser.newContext({serviceWorkers:'block',permissions:['microphone'],viewport,timezoneId:'Asia/Shanghai'});contexts.push(context);
  await context.addInitScript(({key,initial})=>{if(!localStorage.getItem(key))localStorage.setItem(key,JSON.stringify(initial));},{key,initial});
  if(init)await context.addInitScript(init);
  const page=await context.newPage();page.setDefaultTimeout(12000);
  page.qaErrors=[];page.qaUploads=[];page.on('pageerror',e=>page.qaErrors.push(e.message));page.on('request',r=>{if(!['GET','HEAD'].includes(r.method()))page.qaUploads.push(r.url());});
  await page.clock.setFixedTime(new Date(today+'T10:00:00+08:00'));
  await page.route('**/src/speech-local.js',r=>r.fulfill({contentType:'text/javascript',body:mock}));
  try{await page.goto(origin+'/#home');await page.locator('#hero-start').waitFor();return page;}
  catch(error){fs.writeFileSync(path.join(out,'startup-failure.json'),JSON.stringify({error:error.message,pageErrors:page.qaErrors,body:await page.locator('body').innerText(),url:page.url()},null,2));await page.screenshot({path:path.join(out,'startup-failure.png')});throw error;}
 }
 const stored=p=>p.evaluate(k=>JSON.parse(localStorage.getItem(k)),key);
 const rounds=s=>s.garden.actions.filter(a=>a.type==='practice');
 function pass(name){checks.push({name,status:'PASS'});console.log('PASS '+name);}
 async function record(p){
  assert.match(await p.locator('#record').innerText(),/跟读评星/);
  await p.locator('#record').click();await p.waitForFunction(()=>document.querySelector('#record')?.textContent.includes('停止录音'));
  await p.waitForTimeout(4000);await p.locator('#record').click();await p.waitForFunction(()=>window.assessmentCalls>0);
  assert.equal(await p.evaluate(()=>window.assessmentHadBlob),true,'ASR adapter receives a recording blob');
 }
 async function match(p){await record(p);await p.locator('[data-speech-next]:visible').waitFor();assert.equal(await p.locator('.speech-stars').textContent(),'★★★');assert.equal(await p.locator('.rating-buttons').isVisible(),false);}
 async function geometry(p,name){
  const boxes=await p.locator('[data-home-speech],#hero-start,#record,[data-speech-result],.rating-buttons:visible,[data-speech-next]:visible').evaluateAll(nodes=>nodes.filter(n=>!n.hidden).map(n=>({name:n.id||n.className,rect:n.getBoundingClientRect().toJSON()})));
  const {width,height}=p.viewportSize();for(const b of boxes){assert.ok(b.rect.top>=-1&&b.rect.bottom<=height+1&&b.rect.left>=-1&&b.rect.right<=width+1,`${name} ${b.name} within visible viewport: ${JSON.stringify(b.rect)}`);}
  assert.ok(await p.evaluate(()=>document.documentElement.scrollHeight<=innerHeight+2),`${name} no page scrolling`);
 }
 async function chooseMeaning(p,{wrong=false,next='#quiz-next',double=false}={}){const id=await p.locator('[data-lesson-id]').getAttribute('data-lesson-id');const l=curriculum.lessons.find(l=>l.id===id);if(wrong)await p.locator(`[data-choice="${(l.answerIndex+1)%l.choices.length}"]`).click();await p.locator(`[data-choice="${l.answerIndex}"]`).click();if(double)await p.locator(next).evaluate(b=>{b.click();b.click();});else await p.locator(next).click();return id;}
 async function newSpeak(p,{started=false,wrong=false}={}){if(!started)await p.locator('#hero-start').click();await p.locator('[data-step="choose"]').click();return chooseMeaning(p,{wrong});}
 async function reviewSpeak(p){await p.locator('#hero-start').click();assert.equal(await p.locator('[data-step="speak"]').count(),1);await p.locator('[data-step="speak"]').click();}
 try{
  if(process.env.QA_CASE==='review-double'){
   const p=await setup(learned);await reviewSpeak(p);await p.locator('[data-rating="help"]').click();await chooseMeaning(p,{next:'[data-review-next]',double:true});await p.locator('.completion').waitFor();assert.equal((await stored(p)).days[today].results.length,1);assert.deepEqual(p.qaErrors,[]);pass('Double click of final review meaning continuation records once without dereferencing an ended session');fs.writeFileSync(path.join(out,'review-double-results.json'),JSON.stringify({checks},null,2));return;
  }
  for(const introduced of [false,true]){
   const p=await setup(introduced?learned:empty);assert.equal(await p.locator('.focus-home').getAttribute('data-next-kind'),introduced?'review':'learn');
   await p.locator('[data-home-speech]').click();await p.locator('[data-lesson-id]').waitFor();assert.equal(await p.locator('.is-garden-practice').count(),introduced?1:0);
   assert.deepEqual(await stored(p),introduced?learned:empty);pass(`Visible homepage speech entry routes ${introduced?'learned child directly to repeat speech':'new child into today lesson'} without replacing daily priority`);
  }
  for(const viewport of [{width:390,height:844},{width:320,height:568},{width:768,height:1024}]){
   const p=await setup(empty,viewport);assert.equal(await p.locator('[data-home-speech]').isVisible(),true);
   await geometry(p,`home ${viewport.width}`);const id=await newSpeak(p);
   assert.equal(await p.locator('[data-speech-result]').isVisible(),true);await geometry(p,`speak ${viewport.width}`);
   await match(p);await geometry(p,`stars ${viewport.width}`);await p.screenshot({path:path.join(out,`stars-${viewport.width}.png`)});
   await p.locator('[data-speech-next]').evaluate(b=>{b.click();b.click();});await p.locator('.completion').waitFor();
   const state=await stored(p);assert.equal(state.days[today].results.length,1);assert.equal(state.days[today].results[0].rating,'good');assert.equal(state.days[today].results[0].meaning,true);
   assert.equal(rounds(state).length,1);assert.equal(rounds(state)[0].lessonId,id);assert.equal(rounds(state)[0].assessment,'local-speech');
   assert.equal(garden.getGarden(state,today).inventory.water,4);assert.doesNotMatch(JSON.stringify(state),/blob:|heard|transcript/);
   await p.reload();assert.deepEqual(await stored(p),state);pass(`Normal daily path exposes automatic stars, one water reward and single-screen controls at ${viewport.width}x${viewport.height}`);
  }
  for(const reveal of [false,true]){
   const p=await setup(learned);assert.equal(await p.locator('.focus-home').getAttribute('data-next-kind'),'review');await reviewSpeak(p);
   if(reveal)await p.locator('#reveal').click();else assert.doesNotMatch(await p.locator('#answer-area').innerText(),/Hello/);
   await match(p);await p.locator('[data-speech-next]').click();assert.deepEqual(await stored(p),learned,'Speech alone cannot persist a recall result before meaning choice');await chooseMeaning(p,{next:'[data-review-next]',double:true});await p.locator('.completion').waitFor();
   const s=await stored(p);assert.equal(s.days[today].results[0].rating,reveal?'help':'good');assert.equal(s.days[today].results[0].meaning,true);assert.equal(rounds(s).length,1);
   if(reveal)assert.equal(s.cards['hello-01'].due,learning.addDays(today,1));
   pass(`Review automatic match uses ${reveal?'hinted recall (help), not independent recall':'independent recall (good)'} and earns water`);
  }
  for(const unavailable of ['model','mic','miss']){
   const p=await setup(empty,undefined,unavailable==='mic'?()=>{navigator.mediaDevices.getUserMedia=()=>Promise.reject(new DOMException('Denied','NotAllowedError'));}:null);
   await newSpeak(p);await p.evaluate(mode=>window.assessmentMode=mode,unavailable==='model'?'error':unavailable==='miss'?'miss':'match');
   if(unavailable==='mic'){await p.locator('#record').click();await p.waitForFunction(()=>!document.querySelector('#record').disabled&&document.querySelector('#record-status').textContent.includes('没有开启麦克风'));}
   else{await record(p);await p.waitForFunction(()=>{const result=document.querySelector('[data-speech-result]');return result&&result.querySelector('strong')&&!result.querySelector('.speech-listening')&&document.querySelector('[data-speech-next]').hidden;});}
   assert.equal(await p.locator('[data-speech-next]').isVisible(),false);assert.equal(await p.locator('[data-rating="help"]').isVisible(),true);
   assert.doesNotMatch(await p.locator('[data-speech-result]').innerText(),/匹配通过|★★★/);
   await p.locator('[data-rating="good"]').click();await p.locator('.completion').waitFor();const s=await stored(p);assert.equal(rounds(s).length,0);assert.equal(s.days[today].results[0].rating,'help','Manual continue without a match cannot claim independent recall');
   pass(`${unavailable} failure keeps direct completion available without fabricated automatic pass`);
  }
  const game=await setup(checkup);await game.locator('[data-go="parent"]').click();await game.locator('[data-parent-panel="progress"]').click();await game.locator('#start-checkup').click();
  const ids=learning.getCheckupPlan(checkup,curriculum.lessons,today).ids;
  for(let i=0;i<ids.length;i++){
   if(i===0)await game.locator('#reveal').click();await match(game);await game.locator('[data-speech-next]').click();
   assert.deepEqual(await stored(game),checkup,'Partial game does not persist speech rewards or checkup');
   const l=curriculum.lessons.find(l=>l.id===ids[i]);await game.locator(`[data-choice="${l.answerIndex}"]`).click();await game.locator('[data-checkup-next]').click();
   if(i<ids.length-1){assert.equal(await game.locator('[data-speech-next]').isVisible(),false);assert.doesNotMatch(await game.locator('[data-speech-result]').innerText(),/★★★/);}
  }
  await game.locator('.completion').waitFor();const gs=await stored(game);assert.equal(rounds(gs).length,ids.length);assert.deepEqual(gs.cards,checkup.cards);
  assert.deepEqual(gs.checkups[today].map(r=>r.spoken),ids.map((_,i)=>i===0?'help':'good'));pass('Full checkup persists matched water once only at completion and retains hint-aware recall');
  const manualGame=await setup(checkup);await manualGame.locator('[data-go="parent"]').click();await manualGame.locator('[data-parent-panel="progress"]').click();await manualGame.locator('#start-checkup').click();
  for(let i=0;i<ids.length;i++){await manualGame.locator('[data-rating="good"]').click();await chooseMeaning(manualGame,{next:'[data-checkup-next]'});}
  await manualGame.locator('.completion').waitFor();const mg=await stored(manualGame);assert.ok(mg.checkups[today].every(r=>r.spoken==='help'));assert.equal(rounds(mg).length,0);pass('Unassessed manual checkup continuation records help, never good or matching water');
  const manualReview=await setup(learned);await reviewSpeak(manualReview);await manualReview.locator('[data-rating="good"]').click();assert.deepEqual(await stored(manualReview),learned);await chooseMeaning(manualReview,{next:'[data-review-next]'});await manualReview.locator('.completion').waitFor();const mr=await stored(manualReview);assert.equal(mr.days[today].results[0].rating,'help');assert.equal(rounds(mr).length,0);pass('Unassessed manual review requires meaning choice and cannot self-award independent recall');
  for(const kind of ['new','review']){
   const p=await setup(kind==='new'?empty:learned);if(kind==='new')await newSpeak(p,{wrong:true});else await reviewSpeak(p);await match(p);await p.locator('[data-speech-next]').click();if(kind==='review')await chooseMeaning(p,{wrong:true,next:'[data-review-next]'});await p.locator('.completion').waitFor();
   const s=await stored(p),r=s.days[today].results[0];assert.equal(r.meaning,false);assert.equal(r.rating,'again');assert.equal(s.cards[r.lessonId].due,learning.addDays(today,1));pass(`Wrong first meaning choice in ${kind} survives later correct tap and forces retry despite matched speech`);
  }
  const multi=await setup(empty);const learnedIds=[];
  for(let i=0;i<3;i++){learnedIds.push(await newSpeak(multi,{started:i>0}));await match(multi);await multi.locator('[data-speech-next]').click();await multi.locator('.completion').waitFor();const s=await stored(multi);assert.equal(s.days[today].results.filter(r=>r.isNew).length,i+1);if(i<2){assert.match(await multi.locator('#completion-next').innerText(),/再学一句/);await multi.locator('#completion-next').click();}}
  assert.equal(new Set(learnedIds).size,3);const capped=await stored(multi),plan=learning.getDailyPlan(capped,curriculum.lessons,today);assert.equal(plan.newCount,3);assert.equal(plan.newLimit,3);assert.equal(plan.canLearnMore,false);assert.deepEqual(learning.getDailyPlan(capped,curriculum.lessons,learning.addDays(today,1)).dueIds,learnedIds);
  await multi.locator('.completion [data-go="home"]').click();assert.equal(await multi.locator('.focus-home').getAttribute('data-next-kind'),'garden');await multi.locator('#hero-start').click();assert.equal(await multi.locator('[data-lesson-id]').count(),0);await multi.locator('[data-go="library"]').click();await multi.locator('[data-theme-open]').first().click();const fourth=curriculum.lessons[3];await multi.locator(`[data-preview="${fourth.id}"]`).click();await multi.locator('[data-step="choose"]').click();await chooseMeaning(multi);await match(multi);await multi.locator('[data-speech-next]').click();await multi.locator('.focus-library').waitFor();assert.deepEqual(await stored(multi),capped);assert.equal(capped.cards[fourth.id],undefined);pass('Three unique daily new sentences become tomorrow reviews; cap sends child to garden or free library without a fourth admission');
  for(const introduced of [true,false]){
   const p=await setup(introduced?learned:empty);await p.locator('[data-go="library"]').click();await p.locator('[data-theme-open]').first().click();await p.locator('[data-preview="hello-01"]').click();await p.locator('[data-step="choose"]').click();
   const l=curriculum.lessons.find(l=>l.id==='hello-01');await p.locator(`[data-choice="${l.answerIndex}"]`).click();await p.locator('#quiz-next').click();await match(p);await p.locator('[data-speech-next]').click();await p.locator('.focus-library').waitFor();
   const s=await stored(p),before=introduced?learned:empty;assert.deepEqual(s.cards,before.cards);assert.deepEqual(s.days,before.days);assert.equal(rounds(s).length,introduced?1:0);
   pass(`Free practice ${introduced?'of learned sentence earns water without changing review':'of unlearned sentence offers stars without creating learning or water'}`);
  }
  for(const leave of ['exit','next-card']){
   let initial=learned;
   if(leave==='next-card'){initial=learning.recordResult(learning.createState('2026-10-11'),first[0],'good','2026-10-11',{isNew:true});initial=learning.recordResult(initial,first[1],'good','2026-10-12',{isNew:true});}
   const p=await setup(initial);await reviewSpeak(p);await p.evaluate(()=>window.assessmentMode='pending');await record(p);await p.waitForFunction(()=>!!window.finishAssessment);
   if(leave==='exit')await p.locator('#exit-session').click();else{await p.locator('[data-rating="help"]').click();await chooseMeaning(p,{next:'[data-review-next]'});await p.locator('[data-step="speak"]').click();}
   const before=await stored(p);await p.evaluate(()=>window.finishAssessment());await p.waitForTimeout(150);assert.deepEqual(await stored(p),before);assert.equal(await p.locator('[data-speech-next]:visible').count(),0);assert.equal(await p.locator('.speech-stars').count(),0);
   pass(`Late matched response after ${leave} neither contaminates next screen nor grants water`);
  }
  for(const context of contexts)for(const p of context.pages()){assert.deepEqual(p.qaErrors,[]);assert.deepEqual(p.qaUploads,[]);}
  pass('All main flow fixtures completed without uncaught errors or recording uploads');
  fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({testScope:'Real browser recording with mocked ASR outcomes; no claim of speech accuracy or physical iPad validation',checks},null,2));console.log(JSON.stringify({passed:checks.length}));
 }finally{await Promise.all(contexts.map(c=>c.close()));await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
