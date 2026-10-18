import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import * as content from '../xiaoya/content.js';
import * as learning from '../xiaoya/learning.js';
import * as stories from '../xiaoya/stories.js';
import * as storyArt from '../xiaoya/story-art.js';
import * as meadow from '../xiaoya/garden-meadow.js';
import * as meadowArt from '../xiaoya/meadow-art.js';
import * as meadowUI from '../xiaoya/meadow-ui.js';
import * as seedShop from '../xiaoya/seed-shop.js';
import * as gardening from '../xiaoya/garden.js';
import * as voices from '../xiaoya/voices.js';
import * as art from '../xiaoya/art.js';
import * as gardenArt from '../xiaoya/garden-art.js';
import * as practicePlan from '../xiaoya/practice-plan.js';
import * as curriculum from '../xiaoya/curriculum.js';
import { installPaperArt } from '../xiaoya/paper-art.js';

// Exercise the real renderer and handlers with controlled audio/permission
// completion. Button visibility is explicit; physical layout stays in browser tests.
const source=fs.readFileSync(new URL('../xiaoya/experience.js',import.meta.url),'utf8').replace(/^import .*;\r?\n/gm,'');
const deferred=()=>{let resolve;const promise=new Promise(yes=>{resolve=yes;});return {promise,resolve};};
const flush=()=>new Promise(resolve=>setImmediate(resolve));
function fixture({storyId='',recognized=null}={}){
  let nodes=[],primaryWraps=[],html='',timerId=0,renders=0,now=0;
  const images=[];
  const documentListeners=new Map();
  const timers=new Map(),sounds=[],captures=[],writes=[],calls={cancelRecording:0,cancelOptions:[],cancelRecognition:0,release:0,replay:0,prepareRecording:0};
  const classList=initial=>{const classes=new Set(initial.split(/\s+/));return {toggle(name,on){if(on)classes.add(name);else classes.delete(name);},contains:name=>classes.has(name)};};
  function parse(markup){return [...markup.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g)].map(match=>{
    const [,attributes,body]=match;
    const attrs=Object.fromEntries([...attributes.matchAll(/([\w-]+)(?:="([^"]*)")?/g)].map(([,name,value])=>[name,value??'']));
    return {body,attrs,inPrimaryWrap:markup.slice(0,match.index).endsWith('<div class="primary-wrap">'),visible:true,dataset:{action:attrs['data-action'],previewVoice:attrs['data-preview-voice']},disabled:'disabled' in attrs,
      classList:classList(attrs.class||''),getAttribute:name=>attrs[name]??null,getClientRects(){return this.visible?[{}]:[];},
      hasAttribute:name=>name in attrs,style:{setProperty(){}},focus(){}};
  });}
  const root={addEventListener(){},set innerHTML(value){html=value;nodes=parse(value);primaryWraps=nodes.filter(node=>node.inPrimaryWrap).map(button=>({classList:classList('primary-wrap'),querySelector:selector=>selector==='[data-primary]'&&button.hasAttribute('data-primary')?button:null}));renders++;},get innerHTML(){return html;}};
  const modalRoot={innerHTML:''};
  const document={baseURI:'http://127.0.0.1/xiaoya-test/',hidden:false,activeElement:null,
    querySelector(selector){if(selector==='#app')return root;if(selector==='#modal-root')return modalRoot;
      const pictureId=selector.match(/^\[data-picture-id="([^"]+)"\]$/)?.[1];if(pictureId)return html.includes(`data-picture-id="${pictureId}"`)?{}:null;
      const action=selector.match(/^\[data-action="([^"]+)"\]$/)?.[1];return action?nodes.find(node=>node.dataset.action===action):null;},
    querySelectorAll(selector){return selector==='.primary-wrap'?primaryWraps:selector==='[data-action]'?nodes.filter(node=>node.dataset.action):[];},
    addEventListener(type,callback,options){if(!documentListeners.has(type))documentListeners.set(type,[]);documentListeners.get(type).push({callback,options});},body:{append(){}},createElement(){return {remove(){}};}};
  const localStorage={getItem(){return null;},setItem(key,value){writes.push({key,value});}};
  const audio={playSound(file){const pending=deferred();sounds.push({file,...pending});return pending.promise;},stopSound(){},
    cancelRecording(options){calls.cancelRecording++;calls.cancelOptions.push(options);for(const capture of captures)capture.resolve(false);},cancelRecognition(){calls.cancelRecognition++;},
    prepareRecording(){calls.prepareRecording++;return Promise.resolve(true);},
    releaseAudioSession(){calls.release++;audio.cancelRecording();audio.cancelRecognition();},replayClip(){calls.replay++;return Promise.resolve(true);},
    speechReady(){return recognized!==null;},recognize(){return Promise.resolve(recognized);},prepareRecognition(){return new Promise(()=>{});},beginRecording(options){const pending=deferred();captures.push({options,...pending});return pending.promise;},finishRecording(){}};
  const sandbox={...practicePlan,...curriculum,installPaperArt,createFeedback:()=>({prepare(){},tap(){},play(kind){(calls.effects??=[]).push(kind);},setSilent(){},cancel(){}}),...content,...learning,...stories,...gardening,...voices,...art,...gardenArt,...storyArt,...meadowArt,...meadowUI,...seedShop,layoutMeadowWatering(){/* Physical layout is covered by watering browser tests. */},meadow,audio,document,localStorage,
    // Evidence validation intentionally accepts plain objects from its own realm.
    recordEvidence:(state,input)=>learning.recordEvidence(state,JSON.parse(JSON.stringify(input))),
    location:{search:storyId?`?story=${storyId}`:''},URL,URLSearchParams,Image:class{constructor(){images.push(this);}},navigator:{},window:{addEventListener(){},scrollTo(){}},
    setTimeout(fn,delay){const id=++timerId;timers.set(id,{fn,delay,due:now+delay});return id;},clearTimeout(id){timers.delete(id);}};
  vm.runInNewContext(source+`;globalThis.ui={startEvent,render,narrate,sound,sample,teach,record,playStory,storyContinue,navigate,openModal,suspend,actions,prepareMicrophone,assessClip,assessmentVoice,idleHintTarget,cancelIdleHint,scheduleIdleHint,idleHintActivity,
    getSession:()=>session,getState:()=>state,
    setMic(value){prefs.mic=value;},
    setPage(value){page=value;session=null;modal=null;render();},
    setGarden(value){garden=value;page='garden';session=null;modal=null;render();},
    setMeadowReward(value){gardenVariant='b';meadowState=value;page='reward';session=null;modal=null;rewardSelection=null;render();},
    setSession(overrides={}){const story=STORIES[0];session={id:'ui-round',event:story.event,story,context:story.event.contexts[0],phase:'request',assessmentMode:false,helped:false,storyGeneration:0,speechGeneration:0,frame:0,storyReady:false,storyRunning:false,hasClip:false,waiting:false,recording:false,teaching:false,assessment:null,...overrides};page='event';modal=null;prefs={mic:true};loadedPictures.set(imageUrl(story),Promise.resolve());render();return session;}};`,sandbox);
  return {...sandbox.ui,document,documentListeners,sounds,captures,calls,writes,timers,images,renders:()=>renders,html:()=>html,
    primaryWraps:()=>primaryWraps,
    hinted:()=>primaryWraps.filter(wrap=>wrap.classList.contains('is-idle-hint')).map(wrap=>wrap.querySelector('[data-primary]').dataset.action),
    dispatch(type,extra={}){for(const {callback} of documentListeners.get(type)||[])callback({type,...extra});},
    advance(ms){const until=now+ms;let next;while((next=[...timers].filter(([,timer])=>timer.due<=until).sort((a,b)=>a[1].due-b[1].due||a[0]-b[0])[0])){now=next[1].due;timers.delete(next[0]);next[1].fn();}now=until;},
    buttons:()=>nodes,button:action=>nodes.find(node=>node.dataset.action===action),
    ears:()=>nodes.filter(node=>node.body.includes('data-icon="ear"')),
    guided:()=>nodes.filter(node=>node.classList.contains('is-guided')).map(node=>node.dataset.action).sort(),
    async nextDelay(){await flush();const timer=[...timers].find(([,value])=>value.delay<2000);assert.ok(timer,'Expected a story frame delay');timers.delete(timer[0]);timer[1].fn();await flush();}};
}

test('three-star assessment celebrates once before spoken praise; repaint and replay do not celebrate again',async()=>{
  for(const assessmentMode of [false,true]){
    const f=fixture({recognized:{matched:true,stars:3,heard:'hello everyone'}}),s=f.setSession({assessmentMode});
    await f.assessClip(s,'blob:test',s.speechGeneration);
    assert.equal(s.phase,'resolved');assert.equal(s.assessment.stars,3);
    assert.deepEqual([...f.calls.effects],['three-stars']);assert.equal(f.sounds.length,0);
    f.render();f.render();assert.equal(f.calls.effects.length,1);
    const pending=[...f.timers.values()].find(timer=>timer.delay===760);assert.ok(pending);
    pending.fn();assert.equal(f.sounds.length,1);
    assert.ok(f.sounds[0].file.endsWith(assessmentMode?'speech-saved.mp3':'flow-pass.mp3'));
    f.sounds[0].resolve(true);await flush();
    f.assessmentVoice();assert.equal(f.sounds.length,2);assert.equal(f.calls.effects.length,1);
  }
});

test('one and two stars retain immediate feedback without the three-star celebration',async()=>{
  for(const [stars,matched,cue] of [[1,false,'retry'],[2,false,'partial'],[2,true,'pass']]){
    const f=fixture({recognized:{matched,stars,heard:'hello'}}),s=f.setSession();
    await f.assessClip(s,'blob:test',s.speechGeneration);
    assert.equal(f.calls.effects?.length||0,0);assert.equal(f.sounds.length,1);
    assert.ok(f.sounds[0].file.endsWith(`${cue==='pass'?'flow-pass':`speech-${cue}`}.mp3`));
    assert.equal([...f.timers.values()].some(timer=>timer.delay===760),false);
  }
});

test('three-star delayed praise cannot outlive its screen, attempt, modal or foreground state',async()=>{
  for(const action of ['home','modal','suspend','hidden','attempt','reward']){
    const f=fixture({recognized:{matched:true,stars:3,heard:'hello everyone'}}),s=f.setSession();
    await f.assessClip(s,'blob:test',s.speechGeneration);
    const pending=[...f.timers.values()].find(timer=>timer.delay===760);assert.ok(pending);
    if(action==='home')f.navigate('home');
    if(action==='modal')f.openModal({type:'mic'});
    if(action==='suspend')f.suspend();
    if(action==='hidden')f.document.hidden=true;
    if(action==='attempt')s.speechGeneration++;
    if(action==='reward')s.phase='reward';
    pending.fn();assert.equal(f.sounds.length,0,action);
  }
});

test('an assessment arriving after departure cannot celebrate or save speech evidence',async()=>{
  const result=deferred(),f=fixture({recognized:result.promise}),s=f.setSession();
  const pending=f.assessClip(s,'blob:test',s.speechGeneration);f.navigate('home');
  result.resolve({matched:true,stars:3,heard:'hello everyone'});await pending;
  assert.equal(f.calls.effects?.length||0,0);assert.equal(f.sounds.length,0);assert.equal(f.writes.length,0);
});

test('every child practice state has exactly one ear, always the English demonstration',()=>{
  const f=fixture();
  const states=[{}, {waiting:true}, {recording:true}, {hasClip:true},
    ...['preparing','assessing','retry','silence','unavailable'].map(status=>({hasClip:true,pendingClip:'blob:recording',assessment:{status,stars:2}}))];
  for(const state of states){
    f.setSession(state);
    assert.deepEqual(f.ears().map(node=>node.dataset.action),['sample'],JSON.stringify(state));
    assert.match(f.button('sample').attrs['aria-label'],/英语示范/);
    assert.equal(f.button('help'),undefined,'Local Chinese help replaces the duplicate header help');
    assert.match(f.button('context-help').body,/data-icon="help"/);
    if(state.hasClip)assert.match(f.button('replay').body,/data-icon="voice-replay"/);
    if(state.assessment)assert.match(f.button('assessment-voice').body,/data-icon="sound"/);
  }
});

test('story help points to one English-story ear; garden help is a single question mark',()=>{
  const f=fixture();f.setSession({phase:'story'});
  assert.deepEqual(f.ears().map(node=>node.dataset.action),['story-replay']);
  assert.match(f.button('story-help').body,/data-icon="help"/);
  assert.equal(f.button('help'),undefined);
  f.setPage('garden');
  assert.equal(f.ears().length,0);
  assert.equal(f.buttons().filter(node=>node.body.includes('data-icon="help"')).length,1);
  assert.match(f.button('help').body,/data-icon="help"/);
  assert.equal(f.button('garden-guide'),undefined);
  f.setPage('home');assert.equal(f.ears().length,0);assert.match(f.button('help').body,/data-icon="help"/);
});

test('parent voice previews keep their three ears while generic help remains distinct',()=>{
  const f=fixture();f.setPage('parent');
  assert.deepEqual(f.ears().map(node=>node.dataset.previewVoice),voices.VOICES.map(voice=>voice.id));
  assert.match(f.button('help').body,/data-icon="help"/);
});

test('spoken directions highlight their actual target and survive a renderer refresh',async()=>{
  const f=fixture();f.setSession();
  for(const [cue,targets] of [['speak',['record','sample']],['speech-retry',['sample']],['speech-partial',['sample']],['speech-silent',['record','sample']],['speech-wait',['watch']]]){
    const pending=f.narrate(cue);assert.deepEqual(f.guided(),targets,cue);f.render();assert.deepEqual(f.guided(),targets,cue);
    f.sounds.at(-1).resolve(true);await pending;assert.deepEqual(f.guided(),[]);
  }
  f.setSession({phase:'resolved'});const done=f.narrate('speech-pass');assert.deepEqual(f.guided(),['finish']);f.sounds.at(-1).resolve(true);await done;
  let garden=gardening.rewardRound(gardening.createGarden(),{roundId:'guided-round',eventId:stories.STORIES[0].id,date:'2026-10-16'});
  for(const [cue,action] of [['open-pack','pack'],['seed','plant'],['water','water']]){
    f.setGarden(garden);const pending=f.narrate(cue);assert.deepEqual(f.guided(),[action]);f.sounds.at(-1).resolve(true);await pending;
    if(action==='pack')garden=gardening.openSeedPack(garden);else if(action==='plant')garden=gardening.plantSeed(garden);
  }
});

test('old audio completion cannot erase a newer cue; navigation, modal and background cancel cues',async()=>{
  const f=fixture();f.setSession();const old=f.narrate('speak'),latest=f.narrate('speech-retry');
  f.sounds[0].resolve(false);await old;assert.deepEqual(f.guided(),['sample']);
  f.sounds[1].resolve(true);await latest;assert.deepEqual(f.guided(),[]);
  for(const cancel of [()=>f.navigate('home'),()=>f.openModal({type:'error',message:'test'}),()=>f.suspend()]){
    f.setSession();const pending=f.narrate('speak');assert.ok(f.guided().length);cancel();assert.deepEqual(f.guided(),[]);
    f.sounds.at(-1).resolve(true);await pending;assert.deepEqual(f.guided(),[]);
  }
});

test('the one English ear cancels pending capture and late callbacks cannot restore recording or evidence',async()=>{
  const f=fixture(),s=f.setSession();const recording=f.record();assert.equal(f.captures.length,1);assert.equal(s.waiting,true);
  const sample=f.actions.sample();assert.equal(s.waiting,false);assert.equal(s.recording,false);assert.equal(s.helped,true);
  assert.ok(f.calls.cancelRecording>=2);assert.ok(f.calls.cancelRecognition>=2);
  f.captures[0].options.onReady();f.captures[0].options.onFinish({url:'blob:late',hasVoice:true});
  assert.equal(s.recording,false);assert.equal(s.pendingClip,null);assert.equal(f.writes.length,0);
  assert.equal(f.sounds.at(-1).file,voices.lessonAudio(s.event,'pip'));assert.deepEqual(f.guided(),['sample']);
  f.sounds.at(-1).resolve(true);await sample;await recording;
});

test('Chinese help names the one ear and stale help cannot autoplay after navigation',async()=>{
  const f=fixture(),s=f.setSession({recording:true});const teaching=f.actions['context-help']();
  assert.equal(s.recording,false);assert.equal(s.helped,true);assert.equal(s.teaching,true);
  assert.deepEqual(f.guided(),['sample']);assert.match(f.sounds[0].file,new RegExp(`${s.context.id}\\.mp3$`));
  f.navigate('home');f.sounds[0].resolve(true);await teaching;
  assert.equal(f.sounds.length,1);assert.equal(f.writes.length,0);assert.deepEqual(f.guided(),[]);
});

test('replaying feedback points to the ear without writing another learning observation',async()=>{
  const f=fixture();f.setSession({assessment:{status:'retry',stars:1},hasClip:true});
  f.actions['assessment-voice']();assert.match(f.sounds.at(-1).file,/garden-speech-retry\.mp3$/);assert.deepEqual(f.guided(),['sample']);
  assert.equal(f.writes.length,0);assert.equal(f.calls.cancelRecording,0);
  f.sounds.at(-1).resolve(true);await flush();
  await f.actions.replay();assert.equal(f.calls.replay,1);assert.equal(f.writes.length,0);
});

test('new learning uses one key picture and one phrase, then the first microphone tap records',async()=>{
  const f=fixture(),s=f.setSession({phase:'story'}),playing=f.playStory();
  await f.nextDelay();
  assert.equal(s.frame,s.story.cueFrame);
  assert.deepEqual(f.guided(),['story-replay']);assert.deepEqual(f.ears().map(node=>node.dataset.action),['story-replay']);
  assert.equal(f.sounds[0].file,voices.lessonAudio(s.event,'pip'));
  f.sounds[0].resolve(true);await playing;
  assert.equal(s.storyReady,true);assert.equal(s.phase,'story');assert.equal(f.sounds.length,1);
  assert.equal(f.sounds.some(sound=>sound.file.endsWith('garden-speak.mp3')),false);
  f.storyContinue();assert.equal(s.phase,'request');assert.equal(s.waiting,true);assert.equal(f.captures.length,1);assert.equal(f.sounds.length,1);assert.deepEqual(f.guided(),[]);
});

test('story replay repeats only the phrase and Chinese help is interruptible by the microphone',async()=>{
  const f=fixture(),s=f.setSession({phase:'story',storyReady:true});
  const replay=f.actions['story-replay']();
  assert.equal(s.phase,'request');assert.equal(s.frame,s.story.cueFrame);assert.equal(s.helped,true);
  assert.equal(f.sounds.length,1);assert.equal(f.sounds[0].file,voices.lessonAudio(s.event,'pip'));
  f.sounds[0].resolve(true);await replay;
  const teaching=f.actions['context-help']();assert.equal(s.teaching,true);assert.equal(f.button('record').disabled,false);
  assert.match(f.sounds[1].file,new RegExp(`${s.context.id}\\.mp3$`));
  const recording=f.record();assert.equal(f.captures.length,1);assert.equal(s.waiting,true);assert.equal(s.teaching,false);
  f.sounds[1].resolve(true);await teaching;assert.equal(f.sounds.length,2,'Cancelled help cannot restart an English example over the child');
  f.captures[0].resolve(true);await recording;
});

test('replay, prompt and help glyphs are genuinely different from the English ear',()=>{
  const geometry=name=>art.icon(name).replace(/ data-icon="[^"]*"/,'');
  assert.equal(new Set(['ear','voice-replay','sound','help','mic'].map(geometry)).size,5);
  const css=fs.readFileSync(new URL('../xiaoya/style.css',import.meta.url),'utf8');
  assert.match(css,/\.icon-button\{[^}]*min-width:50px;min-height:50px/);
  assert.match(css,/\.topbar \.icon-button\{[^}]*min-width:48px;min-height:48px/);
  assert.match(css,/\.icon-button\.is-guided[^}]*outline:3px solid/);
  assert.match(css,/@media\(prefers-reduced-motion:reduce\)[\s\S]*animation:none!important/);
});

test('entering speaking warms an opted-in microphone once, never just from rendering',()=>{
  const f=fixture();f.setSession({phase:'story',storyReady:true});
  assert.equal(f.calls.prepareRecording,0);f.prepareMicrophone();assert.equal(f.calls.prepareRecording,1);f.storyContinue();assert.equal(f.captures.length,1);
  f.render();f.render();assert.equal(f.calls.prepareRecording,1,'Rendering cannot renew the idle microphone deadline');
  const g=fixture();g.setSession({phase:'story',storyReady:true});g.setMic(false);g.storyContinue();
  assert.equal(g.calls.prepareRecording,0,'Parent opt-in is still required');
  for(const state of [{phase:'story'},{phase:'resolved'},{waiting:true},{recording:true},{teaching:true}]){
    const h=fixture();h.setSession(state);h.prepareMicrophone();assert.equal(h.calls.prepareRecording,0,JSON.stringify(state));
  }
  f.document.hidden=true;f.prepareMicrophone();assert.equal(f.calls.prepareRecording,1);
  f.document.hidden=false;f.openModal({type:'mic'});f.prepareMicrophone();assert.equal(f.calls.prepareRecording,1);
});

test('click immediately shows preparation and preserves warmth; only native readiness lights the recording state',async()=>{
  const f=fixture(),s=f.setSession();const pending=f.record();
  assert.equal(f.calls.cancelOptions.at(-1).keepPrepared,true);
  assert.equal(s.waiting,true);assert.equal(s.recording,false);
  assert.equal(f.button('record').disabled,true);assert.equal(f.button('record').attrs['aria-busy'],'true');
  assert.match(f.html(),/is-mic-starting/);assert.match(f.button('record').body,/mic-start-ring/);
  assert.doesNotMatch(f.html(),/class="recording-indicator"/);
  f.captures[0].options.onReady();f.captures[0].resolve(true);await pending;
  assert.equal(s.recording,true);assert.equal(s.waiting,false);assert.equal(f.button('record').disabled,false);
  assert.equal(f.button('record').attrs['aria-busy'],'false');assert.doesNotMatch(f.html(),/mic-start-ring/);
  assert.match(f.html(),/class="recording-indicator"/);
});

test('leaving, hiding and opening a parent modal release preparation without rendering it open again',()=>{
  for(const exit of [f=>f.navigate('home'),f=>f.suspend(),f=>f.openModal({type:'mic'})]){
    const f=fixture();f.setSession({phase:'story',storyReady:true});f.prepareMicrophone();f.storyContinue();
    const cancellations=f.calls.cancelRecording;exit(f);
    assert(f.calls.cancelRecording>cancellations);
    assert.notEqual(f.calls.cancelOptions.at(-1)?.keepPrepared,true);
    assert.equal(f.calls.prepareRecording,1);
  }
});

test('home keeps its companion and defers lesson pictures until practice',()=>{
    const f=fixture({storyId:'food-water'});
    assert.match(f.html(),/home-companion/);
    assert.match(f.html(),/data-paper-art="buddy-welcome"/);
    assert.doesNotMatch(f.html(),/data-picture-id|story-picture/);
    f.render();f.render();assert.equal(f.images.length,0);
    assert.deepEqual(f.buttons().filter(b=>b.hasAttribute('data-primary')).map(b=>b.dataset.action),['next-event']);
});

test('direct review recovers failed pictures without a render or request loop',async()=>{
    const f=fixture();
    const story=stories.storyFor('food-water');f.setSession({story,event:story.event,context:story.event.contexts[0],recallMode:true});
    assert.match(f.html(),/data-picture-id="food-water"/);
    f.render();f.render();assert.equal(f.images.length,1);
    f.images[0].onerror();await flush();
    assert.match(f.html(),/vector-picture/);assert.doesNotMatch(f.html(),/data-picture-id="food-water"/);
    f.render();assert.equal(f.images.length,1);assert.equal(f.sounds.length,0);assert.equal(f.writes.length,0);
});

test('late picture failures cannot redraw a different page or interrupt its activity',async()=>{
  const f=fixture(),story=stories.storyFor('food-water');f.setSession({story,event:story.event,context:story.event.contexts[0],recallMode:true});f.navigate('parent');const before=f.renders();
  f.images[0].onerror();await flush();assert.equal(f.renders(),before);assert.equal(f.sounds.length,0);
  f.setPage('home');assert.match(f.html(),/home-companion/);assert.doesNotMatch(f.html(),/story-picture/);assert.equal(f.images.length,1);
});

test('failed story art falls back and advances the short teaching sequence only once',async()=>{
  const f=fixture(),story=stories.storyFor('food-water');
  const s=f.setSession({story,event:story.event,context:story.event.contexts[0],phase:'story'}),playing=f.playStory();
  assert.equal(f.images.length,1);f.images[0].onerror();await f.nextDelay();
  assert.match(f.html(),/vector-picture/);assert.equal(f.sounds.length,1);
  f.sounds[0].resolve(true);await playing;assert.equal(s.storyReady,true);assert.equal(f.images.length,1);
});

test('try again teaches a fallen tower before rebuilding, without repeating its paper image',async()=>{
  const f=fixture(),story=stories.storyFor('play-again');
  assert.deepEqual(story.teachingFrames,[0,1]);
  const s=f.setSession({story,event:story.event,context:story.event.contexts[0],phase:'story'}),playing=f.playStory();
  assert.match(f.html(),/vector-picture/);assert.match(f.html(),/data-cue="fallen-blocks"/);
  assert.doesNotMatch(f.html(),/data-picture-id="play-again"/);
  assert.equal(f.images.length,1);f.images[0].onload();await f.nextDelay();
  assert.match(f.html(),/data-picture-id="play-again" data-story-frame="1"/);
  assert.doesNotMatch(f.html(),/data-cue="fallen-blocks"/);
  await f.nextDelay();assert.equal(f.sounds.length,1);f.sounds[0].resolve(true);await playing;
  assert.equal(s.storyReady,true);assert.equal(f.writes.length,0);
});

test('try again image failure preserves different visible actions for both teaching beats',async()=>{
  const f=fixture(),story=stories.storyFor('play-again');
  f.setSession({story,event:story.event,context:story.event.contexts[0],phase:'story'});
  const playing=f.playStory(),intro=storyArt.storyFrame(story,0);
  f.images[0].onerror();await f.nextDelay();
  assert.match(f.html(),/vector-picture/);assert.match(f.html(),/data-cue="retry-picking-up-block"/);
  const drawing=svg=>svg.replace(/\sdata-[\w-]+="[^"]*"/g,'');
  assert.notEqual(drawing(intro),drawing(storyArt.storyFrame(story,1)));
  await f.nextDelay();f.sounds[0].resolve(true);await playing;
  assert.equal(f.getSession().storyReady,true);assert.equal(f.images.length,1);
});

test('familiar try again review starts at the final picture without playing the answer',()=>{
  const f=fixture(),story=stories.storyFor('play-again');
  f.setSession({story,event:story.event,context:story.event.contexts[0],recallMode:true,frame:0});
  assert.match(f.html(),/data-picture-id="play-again" data-story-frame="1"/);
  assert.doesNotMatch(f.html(),/data-cue="fallen-blocks"|story-progress/);
  assert.equal(f.sounds.length,0);assert.equal(f.writes.length,0);
});


test('review opens with a neutral spoken choice, one ear and no forced microphone hint',async()=>{
  const f=fixture();f.setMic(true);f.startEvent(stories.storyFor('food-water').event,true);
  const s=f.getSession();assert.equal(s.phase,'request');assert.equal(s.recallReady,true);assert.equal(s.helped,false);
  assert.equal(f.sounds.length,1);assert.match(f.sounds[0].file,/flow-recall\.mp3$/);
  assert.match(f.html(),/data-recall-ready/);assert.equal(f.ears().length,1);
  assert.equal(f.button('record').hasAttribute('data-primary'),false);assert.doesNotMatch(f.html(),/tap-cue/);
  assert.deepEqual(f.guided(),['record','sample']);assert.equal(f.writes.length,0);
  f.sounds[0].resolve(true);await flush();assert.equal(s.helped,false);
  const sample=f.sample();assert.equal(s.recallReady,false);assert.equal(s.helped,true);
  assert.match(f.sounds[1].file,new RegExp(`/${s.event.lessonId}\\.mp3$`));
  f.sounds[1].resolve(true);await sample;
});

test('direct recall recording cancels the opening cue without turning independent evidence into helped',async()=>{
  const f=fixture();f.setMic(true);f.startEvent(stories.storyFor('food-water').event,true);const s=f.getSession();
  const recording=f.record();assert.equal(s.recallReady,false);assert.equal(s.helped,false);assert.equal(f.captures.length,1);
  f.captures[0].options.onReady();assert.equal(s.recording,true);
  f.sounds[0].resolve(false);await flush();assert.equal(f.sounds.length,1);assert.equal(s.recording,true);
  f.navigate('home');await recording;assert.equal(f.writes.length,0);
});

test('leaving during the recall cue cannot play an answer or switch back to the lesson',async()=>{
  const f=fixture();f.startEvent(stories.storyFor('food-water').event,true);f.navigate('home');
  f.sounds[0].resolve(false);await flush();assert.equal(f.getSession(),null);assert.equal(f.sounds.length,1);assert.equal(f.writes.length,0);
});

test('assessment completion uses a gift while parent checkups keep their save checkmark',()=>{
  const f=fixture();f.setSession({phase:'resolved'});assert.match(f.button('finish').body,/data-icon="gift"/);assert.doesNotMatch(f.button('finish').body,/data-garden-art="shell"/);
  f.setSession({phase:'resolved',assessmentMode:true});assert.match(f.button('finish').body,/data-icon="check"/);
});

test('the hand waits a full 15 seconds before pointing at the sole available primary action',()=>{
  for(const [state,action] of [[null,'next-event'],[{},'record'],[{phase:'story',storyReady:true},'story-continue'],[{phase:'resolved'},'finish']]){
    const f=fixture();if(state)f.setSession(state);
    assert.equal(f.primaryWraps().length,1);assert.equal(f.idleHintTarget(),f.primaryWraps()[0]);
    assert.deepEqual(f.hinted(),[]);f.advance(14999);assert.deepEqual(f.hinted(),[],action);
    f.advance(1);assert.deepEqual(f.hinted(),[action]);
  }
});

test('document activity removes a visible hand and restarts its full idle interval',()=>{
  for(const type of ['pointerup','pointercancel','keydown','scroll','click']){
    const f=fixture();f.advance(15000);assert.deepEqual(f.hinted(),['next-event']);
    const registered=f.documentListeners.get(type).find(entry=>entry.callback===f.idleHintActivity);
    assert.ok(registered,`${type} is observed`);assert.equal(registered.options.capture,true);assert.equal(registered.options.passive,true);
    f.dispatch(type);assert.deepEqual(f.hinted(),[],type);
    f.advance(14999);assert.deepEqual(f.hinted(),[],type);f.advance(1);assert.deepEqual(f.hinted(),['next-event'],type);
  }
});

test('a held pointer suppresses the hand across repaint until release or cancellation',()=>{
  for(const release of ['pointerup','pointercancel']){
    const f=fixture();f.advance(15000);f.dispatch('pointerdown');assert.deepEqual(f.hinted(),[]);
    assert.equal(f.idleHintTarget(),null);f.render();f.advance(30000);assert.deepEqual(f.hinted(),[]);
    f.dispatch(release);f.advance(14999);assert.deepEqual(f.hinted(),[]);f.advance(1);assert.deepEqual(f.hinted(),['next-event']);
  }
});

test('playback cancels the hand and starts a new idle interval only after the voice ends',async()=>{
  const f=fixture();f.setSession();f.advance(15000);assert.deepEqual(f.hinted(),['record']);
  const pending=f.narrate('speak');assert.equal(f.idleHintTarget(),null);assert.deepEqual(f.hinted(),[]);
  f.render();f.advance(30000);assert.deepEqual(f.hinted(),[]);assert.equal([...f.timers.values()].some(timer=>timer.delay===15000),false);
  f.sounds[0].resolve(true);await pending;assert.deepEqual(f.hinted(),[]);
  f.advance(14999);assert.deepEqual(f.hinted(),[]);f.advance(1);assert.deepEqual(f.hinted(),['record']);
});

test('the hand stays quiet during recording, recognition, teaching and unresolved attempts',()=>{
  for(const state of [{waiting:true},{recording:true},{teaching:true},{storyRunning:true},{phase:'resolved',finishing:true},
    ...['preparing','assessing','retry','silence','unavailable'].map(status=>({assessment:{status,stars:0}}))]){
    const f=fixture();f.setSession(state);
    assert.equal(f.idleHintTarget(),null,JSON.stringify(state));f.advance(30000);assert.deepEqual(f.hinted(),[],JSON.stringify(state));
  }
});

test('modal and background transitions cancel the hand; returning starts a fresh interval',()=>{
  const f=fixture();f.advance(15000);f.openModal({type:'mic'});assert.deepEqual(f.hinted(),[]);assert.equal(f.idleHintTarget(),null);
  f.advance(30000);assert.deepEqual(f.hinted(),[]);f.actions.close();f.advance(14999);assert.deepEqual(f.hinted(),[]);f.advance(1);assert.deepEqual(f.hinted(),['next-event']);
  f.document.hidden=true;f.dispatch('visibilitychange');assert.deepEqual(f.hinted(),[]);assert.equal(f.idleHintTarget(),null);
  f.advance(30000);assert.deepEqual(f.hinted(),[]);f.document.hidden=false;f.dispatch('visibilitychange');
  f.advance(14999);assert.deepEqual(f.hinted(),[]);f.advance(1);assert.deepEqual(f.hinted(),['next-event']);
  for(const page of ['parent','shop']){f.setPage(page);f.advance(30000);assert.equal(f.idleHintTarget(),null);assert.deepEqual(f.hinted(),[],page);}
});

test('recall and unselected reward choices never gain a hand that favors one option',async()=>{
  const recall=fixture();recall.setSession({recallReady:true});
  assert.ok(recall.button('sample'));assert.ok(recall.button('record'));assert.equal(recall.primaryWraps().length,0);
  recall.advance(30000);assert.equal(recall.idleHintTarget(),null);assert.deepEqual(recall.hinted(),[]);
  let garden=meadow.createMeadow();
  for(const roundId of ['starter','choice'])garden=meadow.rewardRound(garden,{roundId,eventId:stories.STORIES[0].id,date:'2026-10-18'});
  for(const choice of ['shells','water']){
    const f=fixture();f.setMeadowReward(garden);assert.ok(f.button('choose-shells'));assert.ok(f.button('choose-water'));
    f.advance(30000);assert.equal(f.idleHintTarget(),null);assert.deepEqual(f.hinted(),[]);
    f.actions[`choose-${choice}`]();assert.equal(f.button('confirm-reward').hasAttribute('data-primary'),true);
    f.advance(30000);assert.deepEqual(f.hinted(),[],'The choice explanation is still playing');
    f.sounds.at(-1).resolve(true);await flush();f.advance(14999);assert.deepEqual(f.hinted(),[]);
    f.advance(1);assert.deepEqual(f.hinted(),['confirm-reward'],'Only the explicitly selected gift is a primary target');
  }
});

test('disabled, busy, hidden or competing primary buttons cannot receive an idle hand',()=>{
  for(const unavailable of ['disabled','busy','hidden','competing']){
    const f=fixture(),button=f.button('next-event');
    if(unavailable==='disabled')button.disabled=true;
    if(unavailable==='busy')button.attrs['aria-busy']='true';
    if(unavailable==='hidden')button.visible=false;
    if(unavailable==='competing')f.primaryWraps().push({...f.primaryWraps()[0]});
    f.scheduleIdleHint();assert.equal(f.idleHintTarget(),null,unavailable);f.advance(30000);assert.deepEqual(f.hinted(),[],unavailable);
  }
});

test('a cancelled timer cannot shorten the new interval even when its target is unchanged',()=>{
  const f=fixture(),old=[...f.timers.values()].find(timer=>timer.delay===15000);assert.ok(old);
  f.advance(5000);f.dispatch('keydown');old.fn();assert.deepEqual(f.hinted(),[]);
  f.advance(14999);assert.deepEqual(f.hinted(),[]);f.advance(1);assert.deepEqual(f.hinted(),['next-event']);
});

test('late timers cannot reveal a hand on an old screen or contaminate a replacement screen',()=>{
  for(const change of ['repaint','navigate','modal','hidden','recording']){
    const f=fixture(),s=f.setSession(),oldWrap=f.primaryWraps()[0],old=[...f.timers.values()].find(timer=>timer.delay===15000);
    assert.ok(old);
    if(change==='repaint')f.render();
    if(change==='navigate')f.navigate('home');
    if(change==='modal')f.openModal({type:'mic'});
    if(change==='hidden')f.document.hidden=true;
    if(change==='recording')s.recording=true;
    old.fn();assert.equal(oldWrap.classList.contains('is-idle-hint'),false,change);assert.deepEqual(f.hinted(),[],change);
    if(['repaint','navigate'].includes(change)){
      f.advance(14999);assert.deepEqual(f.hinted(),[],change);f.advance(1);assert.deepEqual(f.hinted(),[change==='navigate'?'next-event':'record']);
    }else{f.advance(30000);assert.deepEqual(f.hinted(),[],change);}
  }
});
