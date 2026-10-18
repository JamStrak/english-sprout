// Garden/story regression: isolated browser contexts, real HTML audio, no user profile.
// Run against a built loopback server: node tests/xiaoya-garden-browser.cjs
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'C:/Users/Jam/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const origin=new URL(process.env.TEST_URL||'http://127.0.0.1:24756').origin;
if(!['127.0.0.1','localhost','[::1]'].includes(new URL(origin).hostname))throw new Error('Use an isolated loopback test server.');
const out=path.resolve(process.env.XIAOYA_TEST_OUT||path.join(__dirname,'../test-results/xiaoya-garden'));
const filter=process.env.XIAOYA_TEST_FILTER?new RegExp(process.env.XIAOYA_TEST_FILTER):null;
const GARDEN='xiaoya-english:garden:v1',STATE='xiaoya-english:state:v1',PREFS='xiaoya-english:preferences:v1',VOICE='xiaoya-english:voice:v1';
const STORIES=[{id:'food-water',lesson:'needs-01',cue:'1'},{id:'play-box',lesson:'needs-08',cue:'1'},{id:'hello-goodbye',lesson:'hello-04',cue:'2'}];
const checks=[];let browser;

async function fixture(options={}){
  const {denyMic=false,legacyApis=false,...contextOptions}=options;
  const c=await browser.newContext({viewport:{width:390,height:844},timezoneId:'Asia/Shanghai',serviceWorkers:'block',...contextOptions});
  const requests=[];c.on('request',r=>requests.push({url:r.url(),method:r.method()}));
  await c.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort('blockedbyclient'));
  // The tested silent route and permission-denied route never require a speech model download.
  await c.route(/\/(?:xiaoya\/speech\/whisper-tiny-en-v1\/|speech\/(?:vosk-|model-))/,r=>r.abort('failed'));
  await c.addInitScript(({origin,PREFS,denyMic,legacyApis})=>{
    if(location.origin!==origin)return;
    if(legacyApis){
      Object.defineProperty(crypto,'randomUUID',{configurable:true,value:undefined});
      Object.defineProperty(Array.prototype,'at',{configurable:true,value:undefined});
    }
    if(denyMic){localStorage.setItem(PREFS,JSON.stringify({mic:true}));navigator.mediaDevices.getUserMedia=async()=>{qa.micCalls++;throw new DOMException('Test permission denied','NotAllowedError');};}
    window.qa={errors:[],audios:[],plays:[],frames:[],chimes:[],hold:null,held:null,micCalls:0};
    window.addEventListener('error',event=>qa.errors.push(event.message));
    window.addEventListener('unhandledrejection',event=>qa.errors.push(String(event.reason)));
    const NativeAudio=window.Audio;
    window.Audio=function(...args){
      const audio=new NativeAudio(...args),entry={audio,url:String(args[0]||''),ended:false,error:false};
      qa.audios.push(entry);audio.playbackRate=3;
      audio.addEventListener('playing',()=>{
        qa.plays.push({url:entry.url,frame:document.querySelector('[data-story-frame]')?.dataset.storyFrame??null,phase:document.querySelector('main[data-phase]')?.dataset.phase??null,time:performance.now()});
        if(qa.hold&&entry.url.includes(qa.hold)){qa.held=entry;audio.pause();}
      });
      audio.addEventListener('ended',()=>entry.ended=true);
      audio.addEventListener('error',()=>entry.error=true);
      return audio;
    };window.Audio.prototype=NativeAudio.prototype;
    const contextType=window.AudioContext||window.webkitAudioContext;
    if(contextType){
      const createOscillator=contextType.prototype.createOscillator;
      contextType.prototype.createOscillator=function(...args){
        const oscillator=createOscillator.apply(this,args),start=oscillator.start,notes=[];
        const setFrequency=oscillator.frequency.setValueAtTime.bind(oscillator.frequency);
        oscillator.frequency.setValueAtTime=function(value,at){notes.push({frequency:value,at});return setFrequency(value,at);};
        oscillator.start=function(...args){qa.chimes.push({frequency:oscillator.frequency.value,time:performance.now(),notes});return start.apply(this,args);};
        return oscillator;
      };
    }
    new MutationObserver(()=>{
      const element=document.querySelector('main[data-phase="story"] [data-story-frame]');
      if(!element)return;
      const frame=element.dataset.storyFrame,event=element.closest('main').dataset.event;
      const last=qa.frames[qa.frames.length-1];
      if(!last||last.frame!==frame||last.event!==event)qa.frames.push({frame,event,time:performance.now()});
    }).observe(document,{subtree:true,childList:true,attributes:true,attributeFilter:['data-story-frame']});
  },{origin,PREFS,denyMic,legacyApis});
  const p=await c.newPage();p.setDefaultTimeout(25000);
  try{await p.goto(origin+'/xiaoya/');await p.locator('main.home-view [data-action="next-event"]').waitFor();return{c,p,requests};}
  catch(error){await c.close();throw error;}
}
async function click(p,action){await p.locator(`[data-action="${action}"]`).first().click();}
async function phase(p,value){await p.locator(`main[data-phase="${value}"]`).waitFor();}
async function garden(p){return p.evaluate(key=>JSON.parse(localStorage.getItem(key)||'null'),GARDEN);}
async function untouchedLearning(p){assert.equal(await p.evaluate(key=>localStorage.getItem(key),STATE),null,'Participation, help and device errors must not write learning evidence');}
async function noOldChildUi(p){assert.equal(await p.locator('[data-choice],[data-inventory],[data-furniture],.house-view,.theme-grid').count(),0,'New child flow has no answer cards or furniture rewards');}
async function singleExampleEar(p,action){
  const ears=p.locator('button:visible [data-icon="ear"]');
  assert.equal(await ears.count(),1,'The child page has exactly one ear, for the English example');
  assert.equal(await ears.evaluate(e=>e.closest('button').dataset.action),action);
  assert.equal(await p.locator('header [data-action="help"]').count(),0,'The local question-mark help replaces duplicate header help');
  const helper=p.locator(`[data-action="${action==='sample'?'context-help':'story-help'}"]`);
  assert.equal(await helper.locator('[data-icon="help"]').count(),1,'Help uses a distinct question-mark icon');
}
async function heldGuide(p,fragment,actions){
  await p.waitForFunction(fragment=>qa.held?.url.includes(fragment),fragment);
  const actual=await p.locator('button.is-guided:visible').evaluateAll(elements=>elements.map(e=>e.dataset.action).sort());
  assert.deepEqual(actual,[...actions].sort(),'The spoken action must illuminate its actual button');
  for(const action of actions){
    const style=await p.locator(`[data-action="${action}"].is-guided`).evaluate(e=>{const s=getComputedStyle(e);return {outline:s.outlineStyle,width:parseFloat(s.outlineWidth),disabled:e.disabled};});
    assert.notEqual(style.outline,'none');assert(style.width>=2,'Guidance has a visible outline');assert.equal(style.disabled,false);
  }
}
async function gate(p){
  await p.locator('#parent-answer').waitFor();
  const digits=(await p.locator('label[for="parent-answer"]').textContent()).match(/\d+/g).map(Number);
  await p.locator('#parent-answer').fill(String(digits[0]+digits[1]));await click(p,'gate-submit');
}
async function parent(p){await click(p,'parent');if(await p.locator('#parent-answer').count())await gate(p);await p.locator('.parent-view').waitFor();}
async function selectedStory(p,story){await parent(p);await p.locator('.story-library>details>summary').click();await p.locator(`[data-story="${story.id}"]`).click();await phase(p,'story');assert.equal(await p.locator('main[data-phase]').getAttribute('data-event'),story.id);await noOldChildUi(p);}
async function start(p,story=STORIES[0]){
  await click(p,'next-event');await phase(p,'story');
  assert.equal(await p.locator('main[data-phase]').getAttribute('data-event'),story.id);
  assert.equal(await p.locator('[data-action="story-continue"]').count(),0);
  await noOldChildUi(p);
}
async function throughStory(p){await p.locator('main[data-phase="story"] [data-story-frame="3"]').waitFor();await p.locator('[data-action="story-continue"]:enabled').waitFor();}
async function request(p){
  await throughStory(p);await click(p,'story-continue');await phase(p,'request');
  // One tap now requests recording. The silent participation scenarios decline
  // that request rather than granting permission or accidentally taking a clip.
  if(await p.locator('#parent-answer').count())await click(p,'close');
  else if(await p.locator('[data-action="disable-mic"]').count())await click(p,'disable-mic');
}
async function finishByWatching(p){await click(p,'watch');await phase(p,'resolved');await click(p,'finish');await phase(p,'reward');}
async function openGarden(p,next){await click(p,'garden');await p.locator(`main[data-garden-next="${next}"]`).waitFor();}
async function bloomNewFlower(p){
  await p.locator('main[data-garden-next="pack"]').waitFor();await click(p,'pack');
  await p.locator('main[data-garden-next="plant"]').waitFor();await click(p,'plant');
  await p.locator('main[data-garden-next="water"]').waitFor();await click(p,'water');await click(p,'water');
  await p.locator('main[data-garden-next="learn"]').waitFor();
}
async function seedRounds(p,count){
  await p.evaluate(async({key,count})=>{
    const script=document.querySelector('script[type="module"][src]').src;
    const m=await import(new URL('garden.js',script));let state=m.createGarden();
    const ids=['food-water','play-box','hello-goodbye'];
    for(let i=0;i<count;i++)state=m.rewardRound(state,{roundId:`fixture-${i}`,eventId:ids[i%3],date:'2026-10-16'});
    localStorage.setItem(key,JSON.stringify(state));
  },{key:GARDEN,count});
  await p.reload();await p.locator('main.home-view').waitFor();
}
async function seedGrownGarden(p,{plants=3,extraRounds=1}={}){
  await p.evaluate(async({key,plants,extraRounds})=>{
    const m=await import(new URL('garden.js',document.querySelector('script[type="module"][src]').src));
    let state=m.createGarden();const ids=['food-water','play-box','hello-goodbye'];
    for(let i=0;i<plants+extraRounds;i++){
      state=m.rewardRound(state,{roundId:`grown-fixture-${i}`,eventId:ids[i%3],date:'2026-10-16'});
      if(i<plants){state=m.plantSeed(m.openSeedPack(state));const id=state.plants[state.plants.length-1].id;state=m.waterPlant(m.waterPlant(state,id),id);}
    }
    localStorage.setItem(key,JSON.stringify(state));
  },{key:GARDEN,plants,extraRounds});
  await p.reload();await p.locator('main.home-view').waitFor();
}
async function gardenPrompts(p){return p.evaluate(()=>qa.plays.filter(x=>/\/garden-(open-pack|seed|water|bloom|next)\.mp3(?:\?|$)/.test(x.url)));}
async function noAutomaticGardenPrompt(p){
  // Real audio is preloaded locally. Allow an accidental automatic play to surface.
  await p.waitForTimeout(450);assert.equal((await gardenPrompts(p)).length,0,'Experienced gardeners must not hear an automatic long instruction after each action');
}
async function completeBloomChime(p,since){
  // Feedback schedules the bloom's three notes on a single oscillator. Check
  // the actual frequency timeline, not the obsolete number of oscillators.
  await p.waitForFunction(since=>qa.chimes.slice(since).some(chime=>chime.notes.length===3&&chime.notes.every((n,i)=>n.frequency===[520,780,1040][i])&&chime.notes[1].at>chime.notes[0].at&&chime.notes[2].at>chime.notes[1].at),since);
}
async function neutralPendingSeed(p,existing){
  const seed=p.locator('.seed-reveal');await seed.waitFor();assert.equal(await seed.count(),1);
  assert.equal(await seed.getAttribute('aria-hidden'),'true');
  assert.equal(await seed.locator('button,[data-action],.garden-plant,.plant-art').count(),0,'The revealed seed contains no interactive pot or grown-flower preview');
  assert.equal(await seed.getAttribute('data-action'),null);assert.notEqual(await seed.evaluate(e=>e.tagName),'BUTTON');
  assert.equal(await seed.locator('svg').count(),1,'Only the neutral seed is visible, with no second flower or pot illustration');
  assert(await seed.evaluate(async e=>{
    const m=await import(new URL('garden-art.js',document.querySelector('script[type="module"][src]').src));
    const expected=document.createElement('div');expected.innerHTML=m.seedArt();
    return e.querySelector('svg').outerHTML===expected.querySelector('svg').outerHTML;
  }),'The pending seed keeps its neutral color instead of revealing the hidden flower variety');
  assert.equal(await p.locator('main [data-primary][data-action="plant"]:enabled').count(),1,'The empty planting pot is the single primary planting entry');
  assert.equal(await p.locator('main [data-action="plant"]').count(),1);
  assert.equal(await p.locator('[data-action="seed-voice"]').count(),0,'The seed does not compete with the planting button');
  assert.equal(await p.locator('[data-plant]').count(),existing);
  assert.equal(await p.locator('[data-plant]:enabled').count(),0,'Existing pots cannot intercept a pending-seed planting tap');
}
async function setPageHidden(p,hidden){
  await p.evaluate(hidden=>{
    Object.defineProperty(document,'hidden',{configurable:true,get:()=>hidden});
    Object.defineProperty(document,'visibilityState',{configurable:true,get:()=>hidden?'hidden':'visible'});
    document.dispatchEvent(new Event('visibilitychange'));
  },hidden);
}
async function assertLayout(p){
  // Measure resting touch targets after finite entrance effects, not an intermediate scale.
  await p.locator('main').evaluate(async element=>{
    const finite=element.getAnimations({subtree:true}).filter(a=>Number.isFinite(a.effect?.getComputedTiming().endTime));
    await Promise.allSettled(finite.map(a=>a.finished));
  });
  const bounds=await p.evaluate(()=>({width:innerWidth,height:innerHeight,scrollW:document.documentElement.scrollWidth,scrollH:document.documentElement.scrollHeight}));
  assert(bounds.scrollW<=bounds.width+1,`Horizontal overflow: ${JSON.stringify(bounds)}`);
  assert(bounds.scrollH<=bounds.height+1,`Page needs scrolling to reach its main action: ${JSON.stringify(bounds)}`);
  const primary=p.locator('main [data-primary]:visible');assert.equal(await primary.count(),1);
  const targets=await p.locator('button:visible').evaluateAll(elements=>elements.map(e=>{const r=e.getBoundingClientRect();return {label:e.getAttribute('aria-label'),x:r.x,y:r.y,w:r.width,h:r.height,primary:e.hasAttribute('data-primary')};}));
  for(const r of targets){
    assert(r.w>=48&&r.h>=48,`Touch target under 48px: ${JSON.stringify(r)}`);
    assert(r.x>=-1&&r.y>=-1&&r.x+r.w<=bounds.width+1&&r.y+r.h<=bounds.height+1,`Hidden control: ${JSON.stringify(r)}`);
  }
  assert(await primary.evaluate(e=>{const r=e.getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return hit===e||e.contains(hit);}), 'Main action is occluded');
  assert(!/[a-zA-Z]/.test(await p.locator('#app').innerText()),'Child flow has visible English letters');
}
async function diagnostic(p){return p.evaluate(({GARDEN,STATE,VOICE})=>({build:document.querySelector('meta[name="xiaoya-build"]')?.content,phase:document.querySelector('main[data-phase]')?.dataset.phase,next:document.querySelector('main[data-garden-next]')?.dataset.gardenNext,guidance:document.querySelector('main[data-guidance]')?.dataset.guidance,frame:document.querySelector('[data-story-frame]')?.dataset.storyFrame,frames:qa.frames,plays:qa.plays,chimes:qa.chimes,audios:qa.audios.map(x=>({url:x.url,ended:x.ended,error:x.error,paused:x.audio.paused})),errors:qa.errors,garden:JSON.parse(localStorage.getItem(GARDEN)||'null'),learning:localStorage.getItem(STATE),voice:localStorage.getItem(VOICE)}),{GARDEN,STATE,VOICE}).catch(error=>({error:error.message}));}
async function test(name,fn,options){
  if(filter&&!filter.test(name))return;let f;
  try{
    f=await fixture(options);await fn(f);
    assert.deepEqual(await f.p.evaluate(()=>qa.errors),[]);
    assert(!f.requests.some(r=>r.method!=='GET'||new URL(r.url).origin!==origin),'No uploads or external requests');
    checks.push({name,status:'PASS',diagnostic:await diagnostic(f.p)});console.log('PASS',name);
  }catch(error){
    checks.push({name,status:'FAIL',error:error.stack,diagnostic:f?await diagnostic(f.p):null});console.error('FAIL',name,error.message);
    if(f)await f.p.screenshot({animations:'disabled',path:path.join(out,`failed-${checks.length}.png`),fullPage:true}).catch(()=>{});
  }finally{await f?.c.close();}
}

(async()=>{
  fs.mkdirSync(out,{recursive:true});
  browser=await chromium.launch({channel:'msedge',headless:true,args:['--autoplay-policy=no-user-gesture-required']});
  await test('Complete story, real assisted audio, one reward, one seed and two waterings',async({p})=>{
    assert.equal(await p.evaluate(key=>localStorage.getItem(key),VOICE),null,'Fresh context uses the default voice');
    await noOldChildUi(p);await start(p);await throughStory(p);
    assert.deepEqual(await p.evaluate(()=>qa.frames.map(x=>x.frame)),['0','1','2','3']);
    const target=await p.evaluate(()=>qa.plays.filter(x=>x.url.includes('needs-01.mp3')));
    assert.equal(target.length,1);assert.equal(target[0].frame,'1');assert(target[0].url.includes('/characters/pip/'));
    assert.equal(await garden(p),null);await untouchedLearning(p);
    await request(p);
    await p.evaluate(()=>{qa.hold='needs-01.mp3';qa.held=null;});await click(p,'watch');
    await p.waitForFunction(()=>!!qa.held);
    assert.equal(await p.locator('main').getAttribute('data-phase'),'request','Assisted audio must finish before rewards are available');
    assert.equal(await p.locator('[data-action="finish"]').count(),0);assert.equal(await garden(p),null);
    assert(await p.evaluate(()=>qa.audios.some(x=>x.url.includes('garden-watch.mp3')&&x.ended)),'Chinese assisted prompt really finished');
    await p.evaluate(()=>{qa.hold=null;return qa.held.audio.play();});await phase(p,'resolved');
    assert(await p.evaluate(()=>qa.held.ended),'English assisted prompt really finished');
    await click(p,'finish');await phase(p,'reward');
    let state=await garden(p);assert.deepEqual([state.shells,state.water,state.rounds.length],[3,2,1]);
    await openGarden(p,'pack');await bloomNewFlower(p);
    state=await garden(p);assert.deepEqual([state.shells,state.water,state.plants.length,state.plants[0].waterings],[0,0,1,2]);
    assert.equal(state.pendingSeed,null);assert.equal(state.plants[0].id,'plant-1');
    await p.locator('[data-plant="plant-1"]').click();assert.deepEqual(await garden(p),state,'Bloomed pot cannot spend more water');
    await noOldChildUi(p);await untouchedLearning(p);await p.screenshot({animations:'disabled',path:path.join(out,'first-bloom-390.png'),fullPage:true});
  });
  await test('Pending seed and charged price survive refresh without reroll or duplicate planting',async({p})=>{
    await seedRounds(p,2);await openGarden(p,'pack');await click(p,'pack');
    await p.locator('main[data-garden-next="plant"]').waitFor();const saved=await garden(p);
    assert.deepEqual([saved.shells,saved.water,saved.seedPacksOpened],[3,4,1]);assert.equal(saved.pendingSeed.id,'seed-1');
    await p.reload();await p.locator('main.home-view [data-action="garden"]').first().waitFor();await openGarden(p,'plant');
    assert.deepEqual(await garden(p),saved);assert.equal(await p.locator('[data-action="pack"]').count(),0);
    await click(p,'plant');const planted=await garden(p);assert.equal(planted.plants.length,1);assert.equal(planted.plants[0].flowerId,saved.pendingSeed.flowerId);
    assert.equal(planted.plants[0].seedId,saved.pendingSeed.id);assert.equal(planted.pendingSeed,null);
    await p.reload();await p.locator('main.home-view').waitFor();await openGarden(p,'water');assert.deepEqual(await garden(p),planted);await untouchedLearning(p);
  });
  await test('Three parent-selected stories complete three rounds and grow three different flowers',async({p})=>{
    for(const [index,story] of STORIES.entries()){
      await selectedStory(p,story);await request(p);await finishByWatching(p);await openGarden(p,'pack');await bloomNewFlower(p);
      const state=await garden(p);assert.equal(state.rounds.length,index+1);assert.equal(state.rounds[index].eventId,story.id);assert.equal(state.plants.length,index+1);
      assert.deepEqual([state.shells,state.water],[0,0]);assert.equal(new Set(state.plants.map(x=>x.flowerId)).size,index+1);
    }
    const state=await garden(p);assert.equal(new Set(state.rounds.map(x=>x.roundId)).size,3);
    for(const story of STORIES){
      const plays=await p.evaluate(lesson=>qa.plays.filter(x=>x.url.includes(`${lesson}.mp3`)),story.lesson);
      assert.equal(plays.length,2);assert.equal(plays[0].frame,story.cue);assert(plays.every(x=>x.url.includes('/characters/pip/')));
    }
    await noOldChildUi(p);await untouchedLearning(p);await p.screenshot({animations:'disabled',path:path.join(out,'three-flowers-390.png'),fullPage:true});
  });
  await test('Parent gate protects voice changes; all three voices preview and persist',async({p,requests})=>{
    await click(p,'parent');await p.locator('#parent-answer').waitFor();assert.equal(await p.locator('[data-select-voice]').count(),0);
    await gate(p);await p.locator('.parent-view').waitFor();assert.equal(await p.locator('[data-select-voice]').count(),3);
    assert.equal(await p.locator('button [data-icon="ear"]').count(),3,'Each parent voice preview retains its own ear');
    assert.equal(await p.locator('header [data-action="help"] [data-icon="help"]').count(),1,'Parent general help is not another preview ear');
    for(const [id,part] of [['aiden','/audio/needs-01.mp3'],['ryan','/audio/ryan/needs-01.mp3'],['pip','/audio/characters/pip/needs-01.mp3']]){
      const before=await p.evaluate(()=>qa.plays.length);
      await p.locator(`[data-select-voice="${id}"]`).click();
      await p.waitForFunction(({part,before})=>qa.plays.slice(before).some(x=>new URL(x.url,document.baseURI).pathname.endsWith(part)),{part,before});
      assert.equal(await p.evaluate(key=>localStorage.getItem(key),VOICE),id);
      assert(requests.some(r=>new URL(r.url).pathname.endsWith(part)),`Actual ${id} audio requested`);
    }
    await p.reload();await p.locator('main.home-view').waitFor();await start(p);await throughStory(p);
    assert(await p.evaluate(()=>qa.plays.some(x=>x.url.includes('/characters/pip/needs-01.mp3'))));
    await untouchedLearning(p);assert.equal(await garden(p),null);
  });
  await test('Denied microphone stays unassessed and the assisted route remains available',async({p})=>{
    await start(p);await request(p);await p.locator('[data-assessment][data-status="unavailable"]').waitFor();
    assert.equal(await p.evaluate(()=>qa.micCalls),1);await phase(p,'request');assert.equal(await p.locator('[data-action="finish"]').count(),0);
    await singleExampleEar(p,'sample');
    assert.equal(await p.locator('[data-action="assessment-voice"] [data-icon="sound"]').count(),1,'Feedback replay is a speaker, not a second ear');
    assert.equal(await garden(p),null);await untouchedLearning(p);
    await click(p,'context-help');await p.locator('[data-action="record"]:enabled').waitFor();await phase(p,'request');
    await finishByWatching(p);assert.equal((await garden(p)).rounds.length,1);await untouchedLearning(p);
  },{denyMic:true});
  await test('Spoken guidance highlights the unique English ear and each real garden action',async({p})=>{
    await start(p);await singleExampleEar(p,'story-replay');
    await p.evaluate(()=>{qa.hold='/food-water.mp3';qa.held=null;});await click(p,'story-help');
    await heldGuide(p,'/food-water.mp3',['story-replay']);await singleExampleEar(p,'story-replay');
    await p.screenshot({animations:'disabled',path:path.join(out,'story-help-one-ear.png'),fullPage:true});
    await p.evaluate(()=>{qa.hold=null;return qa.held.audio.play();});await throughStory(p);
    await request(p);await singleExampleEar(p,'sample');
    assert.equal(await p.evaluate(()=>qa.plays.filter(x=>x.url.endsWith('garden-speak.mp3')).length),0,'The first microphone action does not play a redundant spoken instruction');
    await p.screenshot({animations:'disabled',path:path.join(out,'request-one-ear-guidance.png'),fullPage:true});
    await p.evaluate(()=>{qa.hold='/food-water.mp3';qa.held=null;});await click(p,'context-help');
    await heldGuide(p,'/food-water.mp3',['sample']);await singleExampleEar(p,'sample');
    await click(p,'home');assert.equal(await p.locator('.is-guided').count(),0,'Leaving the prompt clears its highlight');
    await seedRounds(p,1);
    await p.evaluate(()=>{qa.hold='garden-open-pack.mp3';qa.held=null;});await openGarden(p,'pack');
    assert.equal(await p.locator('main.garden-view').getAttribute('data-guidance'),'new','New gardeners still receive immediate spoken guidance');
    await heldGuide(p,'garden-open-pack.mp3',['pack']);
    assert.equal(await p.locator('button [data-icon="ear"]').count(),0,'Garden guidance has no English example ear');
    assert.equal(await p.locator('[data-action="help"]').count(),1,'Garden has one general help entry');
    assert.equal(await p.locator('[data-action="garden-guide"]').count(),0,'No duplicate garden help entry');
    await p.evaluate(()=>{qa.hold='garden-seed.mp3';qa.held=null;});await click(p,'pack');await heldGuide(p,'garden-seed.mp3',['plant']);
    await p.evaluate(()=>{qa.hold='garden-water.mp3';qa.held=null;});await click(p,'plant');await heldGuide(p,'garden-water.mp3',['water']);
    await p.screenshot({animations:'disabled',path:path.join(out,'garden-one-help-guidance.png'),fullPage:true});
    await untouchedLearning(p);
  });
  await test('Three planted flowers make garden actions quiet while rewards, neutral seeds and explicit help still work',async({p})=>{
    await seedGrownGarden(p);await openGarden(p,'pack');
    assert.equal(await p.locator('main.garden-view').getAttribute('data-guidance'),'quiet');
    assert.equal(await p.locator('main .tap-cue:visible').count(),0,'Experienced gardeners do not receive a persistent pointing hand');
    await noAutomaticGardenPrompt(p);
    const before=await garden(p),chimes=await p.evaluate(()=>qa.chimes.length);
    await click(p,'pack');await p.locator('main[data-garden-next="plant"]').waitFor();await neutralPendingSeed(p,3);await noAutomaticGardenPrompt(p);
    const pending=await garden(p);assert.deepEqual([pending.shells,pending.water,pending.seedPacksOpened],[0,2,4]);
    assert.equal(pending.pendingSeed.id,'seed-4');assert.equal(pending.plants.length,3);
    await click(p,'plant');await p.locator('main[data-garden-next="water"]').waitFor();await noAutomaticGardenPrompt(p);
    await click(p,'water');await noAutomaticGardenPrompt(p);await click(p,'water');await p.locator('main[data-garden-next="learn"]').waitFor();await noAutomaticGardenPrompt(p);
    const after=await garden(p);assert.deepEqual([after.shells,after.water,after.plants.length,after.plants[3].waterings],[0,0,4,2]);
    assert.deepEqual(after.rounds,before.rounds,'Garden care never creates an extra participation reward');
    assert.equal(after.pendingSeed,null);assert(await p.evaluate(n=>qa.chimes.length>n,chimes),'Quiet gardening retains real short oscillator feedback');
    const beforeBloom=await p.evaluate(()=>qa.chimes.length);
    await p.locator('[data-plant="plant-1"]').click();
    await p.locator('[data-plant="plant-1"].just-watered').waitFor();await p.locator('.bloom-sparkles').waitFor();
    await completeBloomChime(p,beforeBloom);
    assert.deepEqual(await garden(p),after,'Touching a mature flower cannot charge water or create another reward');await noAutomaticGardenPrompt(p);
    await p.evaluate(()=>{qa.hold='garden-next.mp3';qa.held=null;});await click(p,'help');
    await heldGuide(p,'garden-next.mp3',['next-event']);
    assert.equal(await p.locator('main .tap-cue:visible').count(),1,'Explicit help restores the pointing cue for its spoken action');
    await p.screenshot({animations:'disabled',path:path.join(out,'quiet-garden-explicit-help-390.png'),fullPage:true});await untouchedLearning(p);
  });
  await test('Quiet garden waits a real 15 seconds after activity, reminds once, and rearms only after new activity',async({p})=>{
    await seedGrownGarden(p);await openGarden(p,'pack');
    const entered=await p.evaluate(()=>performance.now());
    await p.waitForTimeout(8000);await p.locator('[data-plant="plant-1"]').click();const activity=await p.evaluate(()=>performance.now());
    await p.waitForTimeout(8000);assert.equal((await gardenPrompts(p)).length,0,'Activity postpones the original entry deadline instead of leaving two timers');
    await p.waitForFunction(()=>qa.plays.some(x=>x.url.endsWith('/garden-open-pack.mp3')),null,{timeout:12000});
    let prompts=await gardenPrompts(p);assert.equal(prompts.length,1);
    assert(prompts[0].time-entered>=22500,'The original 15-second timer did not fire after activity');
    assert(prompts[0].time-activity>=14700,`Reminder fired before 15 seconds of actual inactivity: ${prompts[0].time-activity} ms`);
    await p.waitForTimeout(16500);assert.equal((await gardenPrompts(p)).length,1,'One uninterrupted idle period produces only one reminder');
    await p.locator('main [data-primary]').focus();await p.keyboard.press('Shift');const nextActivity=await p.evaluate(()=>performance.now());
    await p.waitForFunction(()=>qa.plays.filter(x=>x.url.endsWith('/garden-open-pack.mp3')).length===2,null,{timeout:20000});
    prompts=await gardenPrompts(p);assert(prompts[1].time-nextActivity>=14700,'The next idle reminder waits another complete inactivity period');
    assert.equal(prompts.length,2);assert.deepEqual([(await garden(p)).shells,(await garden(p)).plants.length],[3,3]);await untouchedLearning(p);
  });
  await test('Leaving a quiet garden cancels its pending idle reminder',async({p})=>{
    await seedGrownGarden(p);await openGarden(p,'pack');await p.waitForTimeout(1000);
    await click(p,'home');await p.locator('main.home-view').waitFor();await p.waitForTimeout(16000);
    assert.equal((await gardenPrompts(p)).length,0,'A garden reminder must not play over the home screen');
    assert.equal(await p.locator('.is-guided').count(),0);await untouchedLearning(p);
  });
  await test('A parent modal cancels quiet garden idle guidance and closing it starts a fresh idle period',async({p})=>{
    await seedGrownGarden(p);await openGarden(p,'pack');await p.waitForTimeout(1000);
    await click(p,'parent');await p.locator('[role="dialog"]').waitFor();await p.waitForTimeout(16000);
    assert.equal((await gardenPrompts(p)).length,0,'The pending child reminder cannot talk across the parent gate');
    await click(p,'close');await p.locator('[role="dialog"]').waitFor({state:'detached'});const closed=await p.evaluate(()=>performance.now());
    await p.waitForFunction(()=>qa.plays.some(x=>x.url.endsWith('/garden-open-pack.mp3')),null,{timeout:20000});
    const prompts=await gardenPrompts(p);assert.equal(prompts.length,1);assert(prompts[0].time-closed>=14700,'Closing a modal does not deliver an already-expired reminder');
    await p.evaluate(()=>{qa.hold='garden-open-pack.mp3';qa.held=null;});await click(p,'help');await heldGuide(p,'garden-open-pack.mp3',['pack']);
    await click(p,'parent');await p.locator('[role="dialog"]').waitFor();
    assert(await p.evaluate(()=>qa.held.audio.paused&&qa.held.audio.getAttribute('src')===null),'Opening the parent gate also stops an already-started child reminder');
    await untouchedLearning(p);
  });
  await test('Hidden and pagehide lifecycle signals cancel garden reminders; returning visible starts a fresh idle period',async({p})=>{
    await seedGrownGarden(p);await openGarden(p,'pack');await p.waitForTimeout(1000);
    await setPageHidden(p,true);await p.waitForTimeout(16000);
    assert.equal((await gardenPrompts(p)).length,0,'A hidden page cannot start a new garden voice');
    await setPageHidden(p,false);const shown=await p.evaluate(()=>performance.now());
    await p.waitForFunction(()=>qa.plays.some(x=>x.url.endsWith('/garden-open-pack.mp3')),null,{timeout:20000});
    const prompts=await gardenPrompts(p);assert.equal(prompts.length,1);assert(prompts[0].time-shown>=14700);
    await p.locator('main [data-primary]').focus();await p.keyboard.press('Shift');await p.evaluate(()=>window.dispatchEvent(new Event('pagehide')));await p.waitForTimeout(16000);
    assert.equal((await gardenPrompts(p)).length,1,'Pagehide cancels a rearmed idle reminder');await untouchedLearning(p);
  });
  await test('Missing story artwork cannot advance or reward; replay recovers after the asset returns',async({c,p})=>{
    const target=/\/xiaoya\/stories\/water-v1\.webp(?:\?.*)?$/;let blocked=0;await c.route(target,r=>{blocked++;return r.abort('failed');});
    // The home story card now shares this picture. Reload after installing the
    // failure so an already rendered card cannot satisfy the story from memory.
    await p.reload();await p.locator('main.home-view [data-action="next-event"]').waitFor();
    await start(p);await p.locator('[data-primary][data-action="story-replay"]:enabled').waitFor();
    assert(blocked>0,'The missing-art scenario must actually reject an image request');
    assert.equal(await p.locator('[data-action="story-continue"]').count(),0);assert.equal(await garden(p),null);await untouchedLearning(p);
    await c.unroute(target);await click(p,'story-replay');await request(p);await finishByWatching(p);await untouchedLearning(p);
  });
  await test('Missing English at its story cue cannot advance; replay with restored audio recovers',async({c,p})=>{
    const target=/\/needs-01\.mp3(?:\?.*)?$/;await c.route(target,r=>r.abort('failed'));await start(p);
    await p.locator('[data-primary][data-action="story-replay"]:enabled').waitFor();
    assert.equal(await p.locator('[data-story-frame]').getAttribute('data-story-frame'),'1');assert.equal(await p.locator('[data-action="story-continue"]').count(),0);
    assert.equal(await garden(p),null);await untouchedLearning(p);await c.unroute(target);await click(p,'story-replay');await request(p);await finishByWatching(p);await untouchedLearning(p);
  });
  await test('Missing assisted Chinese does not resolve the round and can recover on another tap',async({c,p})=>{
    await start(p);await request(p);const target=/\/garden-watch\.mp3(?:\?.*)?$/;await c.route(target,r=>r.abort('failed'));
    await click(p,'watch');await p.waitForFunction(()=>qa.audios.some(x=>x.url.includes('garden-watch.mp3')&&x.error));
    await p.locator('[data-action="record"]:enabled').waitFor();await phase(p,'request');
    assert.equal(await p.locator('[data-action="finish"]').count(),0);assert.equal(await garden(p),null);await untouchedLearning(p);
    await c.unroute(target);await finishByWatching(p);await untouchedLearning(p);
  });
  await test('Leaving a held English cue stops audio and prevents delayed rewards or story advancement',async({p})=>{
    await p.evaluate(()=>{qa.hold='needs-01.mp3';});await start(p);await p.waitForFunction(()=>!!qa.held);
    const count=await p.evaluate(()=>qa.audios.length);await click(p,'home');await p.locator('main.home-view').waitFor();
    assert(await p.evaluate(count=>qa.audios.slice(0,count).every(x=>x.audio.paused&&x.audio.getAttribute('src')===null),count));
    await p.waitForTimeout(2100);assert.equal(await p.locator('main[data-phase]').count(),0);assert.equal(await garden(p),null);await untouchedLearning(p);
    await p.evaluate(()=>{qa.hold=null;qa.held=null;});await start(p);await request(p);
  });
  await test('Missing randomUUID and Array.at still allow a complete round, reward and planting',async({p})=>{
    assert.deepEqual(await p.evaluate(()=>[typeof crypto.randomUUID,typeof Array.prototype.at]),['undefined','undefined']);
    await start(p);await request(p);await finishByWatching(p);await openGarden(p,'pack');
    await click(p,'pack');await p.locator('main[data-garden-next="plant"]').waitFor();
    await click(p,'plant');await p.locator('main[data-garden-next="water"]').waitFor();
    const state=await garden(p);assert.equal(state.rounds.length,1);assert.equal(state.rounds[0].eventId,'food-water');
    assert.equal(typeof state.rounds[0].roundId,'string');assert(state.rounds[0].roundId.length>0);
    assert.deepEqual([state.shells,state.water,state.seedPacksOpened,state.plants.length],[0,2,1,1]);
    assert.equal(state.pendingSeed,null);assert.equal(state.plants[0].seedId,'seed-1');await untouchedLearning(p);
  },{legacyApis:true});
  await test('Parent checkups stay neutral, change context after reliable speech and lock help as supported',async({p})=>{
    await parent(p);
    async function openNeutralCheckup(expectedContext){
      await p.locator('.story-library>details>summary').click();
      const before=await p.evaluate(()=>({plays:qa.plays.length,audios:qa.audios.length}));
      await p.locator('[data-checkup="food-water"]').click();await phase(p,'request');
      await p.waitForTimeout(350);
      const played=await p.evaluate(before=>qa.plays.slice(before).map(x=>x.url),before.plays);
      assert.equal(played.length,0,'Checkup entry stays silent: no English answer, semantic Chinese cue or redundant microphone instruction');
      assert.equal(await p.locator('main[data-context]').getAttribute('data-context'),expectedContext);
      assert.equal(await p.locator('[data-action="story-continue"]').count(),0);
    }
    await openNeutralCheckup('food-water-elsewhere');await untouchedLearning(p);
    await click(p,'observe');await p.locator('#observed-help').waitFor();
    assert.equal(await p.locator('#observed-help').isChecked(),false);assert.equal(await p.locator('#observed-help').isDisabled(),false);
    await p.locator('[data-observation="independent"]').click();await phase(p,'resolved');
    let state=await p.evaluate(key=>JSON.parse(localStorage.getItem(key)),STATE);
    assert.equal(state.evidence.length,1);assert.deepEqual([state.evidence[0].contextId,state.evidence[0].source,state.evidence[0].result,state.evidence[0].helped],['food-water-elsewhere','parent','independent',false]);
    await click(p,'finish');await p.locator('.parent-view').waitFor();assert.equal(await garden(p),null,'A parent checkup is not a reward round');
    await openNeutralCheckup('food-water');
    const beforeHelp=await p.evaluate(()=>qa.audios.length);await click(p,'context-help');
    await p.waitForFunction(before=>qa.audios.slice(before).some(x=>x.url.includes('needs-01.mp3')&&x.ended),beforeHelp);
    await p.locator('[data-action="record"]:enabled').waitFor();await click(p,'observe');await p.locator('#observed-help').waitFor();
    assert.equal(await p.locator('#observed-help').isChecked(),true);assert.equal(await p.locator('#observed-help').isDisabled(),true,'Known help cannot be unchecked');
    await p.locator('[data-observation="independent"]').click();await phase(p,'resolved');
    state=await p.evaluate(key=>JSON.parse(localStorage.getItem(key)),STATE);
    assert.equal(state.evidence.length,2);assert.deepEqual([state.evidence[1].contextId,state.evidence[1].source,state.evidence[1].result,state.evidence[1].helped],['food-water','parent','supported',true]);
    await click(p,'finish');await p.locator('.parent-view').waitFor();
    await openNeutralCheckup('food-water');assert.equal(await garden(p),null,'Assisted checkups do not award participation currency');
  });
  await test('Fourth mature flower can be reached by touch scrolling and tapped at 320 pixels without changing rewards',async({c,p})=>{
    await seedGrownGarden(p,{plants:4,extraRounds:0});await openGarden(p,'learn');
    const before=await garden(p),grid=p.locator('.garden-plants');
    const metrics=await grid.evaluate(e=>({overflow:getComputedStyle(e).overflowY,scrollHeight:e.scrollHeight,clientHeight:e.clientHeight,scrollTop:e.scrollTop}));
    assert.equal(metrics.overflow,'auto');assert(metrics.scrollHeight>metrics.clientHeight,'Four flowers overflow only the internal garden grid');
    assert.equal(metrics.scrollTop,0);
    const box=await grid.boundingBox(),x=box.x+box.width/2,start=box.y+box.height-16,end=box.y+16;
    const input=await c.newCDPSession(p);
    try{
      await input.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y:start}]});
      for(let step=1;step<=8;step++){
        await input.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x,y:start+(end-start)*step/8}]});
        await p.waitForTimeout(35);
      }
      await input.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    }finally{await input.detach();}
    await p.waitForFunction(()=>document.querySelector('.garden-plants').scrollTop>0);
    // Allow native touch inertia to settle before selecting the visible fourth pot.
    await p.waitForTimeout(600);
    const last=p.locator('[data-plant="plant-4"]');
    const fourthVisible=()=>last.evaluate(e=>{const r=e.getBoundingClientRect(),g=e.closest('.garden-plants').getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return r.top>=g.top&&r.bottom<=g.bottom&&(hit===e||e.contains(hit));});
    assert(await fourthVisible(),'The fourth flower is fully visible and its center is genuinely tappable after a swipe');
    const position=await grid.evaluate(e=>e.scrollTop);
    await p.screenshot({animations:'disabled',path:path.join(out,'quiet-fourth-flower-scrolled-320.png'),fullPage:true});
    const target=await last.boundingBox(),chimes=await p.evaluate(()=>qa.chimes.length);
    await p.touchscreen.tap(target.x+target.width/2,target.y+target.height/2);
    await p.locator('[data-plant="plant-4"].just-watered').waitFor();await p.locator('.bloom-sparkles').waitFor();
    await completeBloomChime(p,chimes);
    assert.deepEqual(await garden(p),before,'A mature flower tap changes no saved garden state or rewards');
    assert(Math.abs(await grid.evaluate(e=>e.scrollTop)-position)<=2,'The bloom render preserves the internal garden scroll position');
    assert(await fourthVisible(),'The flower that was just tapped remains visible during its feedback');
    await noAutomaticGardenPrompt(p);await untouchedLearning(p);
    await p.screenshot({animations:'disabled',path:path.join(out,'quiet-fourth-flower-after-tap-320.png'),fullPage:true});
    await p.locator('[data-plant="plant-4"].just-watered').waitFor({state:'detached'});
    assert(Math.abs(await grid.evaluate(e=>e.scrollTop)-position)<=2,'Ending bloom feedback also preserves the scroll position');
    assert(await fourthVisible(),'The fourth flower stays visible when its temporary feedback ends');
    assert.deepEqual(await garden(p),before);await untouchedLearning(p);
  },{viewport:{width:320,height:568},isMobile:true,hasTouch:true});
  for(const [width,height,reducedMotion] of [[320,568,'no-preference'],[390,844,'no-preference'],[320,568,'reduce']])await test(`Story and growing garden fit ${width}x${height}, motion ${reducedMotion}`,async({p})=>{
    await assertLayout(p);await start(p);await assertLayout(p);await throughStory(p);await assertLayout(p);
    await p.screenshot({animations:'disabled',path:path.join(out,`story-${width}-${reducedMotion}.png`),fullPage:true});
    await request(p);await assertLayout(p);
    await finishByWatching(p);await assertLayout(p);await openGarden(p,'pack');await assertLayout(p);
    await click(p,'pack');await assertLayout(p);
    await p.screenshot({animations:'disabled',path:path.join(out,`pending-seed-${width}-${reducedMotion}.png`),fullPage:true});
    await click(p,'plant');await assertLayout(p);await click(p,'water');await assertLayout(p);await click(p,'water');await assertLayout(p);
    if(reducedMotion==='reduce'){
      assert(await p.evaluate(()=>matchMedia('(prefers-reduced-motion: reduce)').matches));
      const moving=await p.locator('main').evaluate(e=>e.getAnimations({subtree:true}).filter(a=>a.playState==='running'&&Number(a.effect?.getTiming().duration)>20).length);
      assert.equal(moving,0,'Reduced motion disables continuing decorative animation');
    }
    await untouchedLearning(p);await p.screenshot({animations:'disabled',path:path.join(out,`garden-${width}-${reducedMotion}.png`),fullPage:true});
    await seedGrownGarden(p);await openGarden(p,'pack');await assertLayout(p);
    assert.equal(await p.locator('main.garden-view').getAttribute('data-guidance'),'quiet');
    await click(p,'pack');await neutralPendingSeed(p,3);await assertLayout(p);
    await p.screenshot({animations:'disabled',path:path.join(out,`quiet-pending-seed-${width}-${reducedMotion}.png`),fullPage:true});
    await click(p,'plant');await click(p,'water');await click(p,'water');await assertLayout(p);
    await p.locator('[data-plant="plant-1"]').click();await p.locator('.bloom-sparkles').waitFor();await assertLayout(p);
    if(reducedMotion==='reduce')assert.equal(await p.locator('main').evaluate(e=>e.getAnimations({subtree:true}).filter(a=>a.playState==='running'&&Number(a.effect?.getTiming().duration)>20).length),0,'Mature-flower feedback also respects reduced motion');
    await untouchedLearning(p);await p.screenshot({animations:'disabled',path:path.join(out,`quiet-four-flowers-${width}-${reducedMotion}.png`),fullPage:true});
  },{viewport:{width,height},isMobile:true,hasTouch:true,reducedMotion});
  await browser.close();browser=null;
  fs.writeFileSync(path.join(out,filter?'results-filtered.json':'results.json'),JSON.stringify(checks,null,2));
  console.log(`${checks.filter(x=>x.status==='PASS').length}/${checks.length} passed`);
  if(!checks.length||checks.some(x=>x.status==='FAIL'))process.exitCode=1;
})().catch(async error=>{console.error(error);await browser?.close();process.exitCode=1;});
