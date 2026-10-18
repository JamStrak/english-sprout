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
import * as gardening from '../xiaoya/garden.js';
import * as voices from '../xiaoya/voices.js';
import * as art from '../xiaoya/art.js';
import * as gardenArt from '../xiaoya/garden-art.js';
import * as practicePlan from '../xiaoya/practice-plan.js';

// Exercise the real renderer and handlers with controlled audio/permission
// completion. This fixture models button attributes, not browser layout.
const source=fs.readFileSync(new URL('../xiaoya/experience.js',import.meta.url),'utf8').replace(/^import .*;\r?\n/gm,'');
const deferred=()=>{let resolve;const promise=new Promise(yes=>{resolve=yes;});return {promise,resolve};};
const flush=()=>new Promise(resolve=>setImmediate(resolve));
function fixture(){
  let nodes=[],html='',timerId=0;
  const timers=new Map(),sounds=[],captures=[],writes=[],calls={cancelRecording:0,cancelOptions:[],cancelRecognition:0,release:0,replay:0,prepareRecording:0};
  function parse(markup){return [...markup.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g)].map(([,attributes,body])=>{
    const attrs=Object.fromEntries([...attributes.matchAll(/([\w-]+)(?:="([^"]*)")?/g)].map(([,name,value])=>[name,value??'']));
    const classes=new Set((attrs.class||'').split(/\s+/));
    return {body,attrs,dataset:{action:attrs['data-action'],previewVoice:attrs['data-preview-voice']},disabled:'disabled' in attrs,
      classList:{toggle(name,on){if(on)classes.add(name);else classes.delete(name);},contains:name=>classes.has(name)},
      hasAttribute:name=>name in attrs,style:{setProperty(){}},focus(){}};
  });}
  const root={addEventListener(){},set innerHTML(value){html=value;nodes=parse(value);},get innerHTML(){return html;}};
  const modalRoot={innerHTML:''};
  const document={baseURI:'http://127.0.0.1/xiaoya-test/',hidden:false,activeElement:null,
    querySelector(selector){if(selector==='#app')return root;if(selector==='#modal-root')return modalRoot;
      const action=selector.match(/^\[data-action="([^"]+)"\]$/)?.[1];return action?nodes.find(node=>node.dataset.action===action):null;},
    querySelectorAll(selector){return selector==='[data-action]'?nodes.filter(node=>node.dataset.action):[];},
    addEventListener(){},body:{append(){}},createElement(){return {remove(){}};}};
  const localStorage={getItem(){return null;},setItem(key,value){writes.push({key,value});}};
  const audio={playSound(file){const pending=deferred();sounds.push({file,...pending});return pending.promise;},stopSound(){},
    cancelRecording(options){calls.cancelRecording++;calls.cancelOptions.push(options);for(const capture of captures)capture.resolve(false);},cancelRecognition(){calls.cancelRecognition++;},
    prepareRecording(){calls.prepareRecording++;return Promise.resolve(true);},
    releaseAudioSession(){calls.release++;audio.cancelRecording();audio.cancelRecognition();},replayClip(){calls.replay++;return Promise.resolve(true);},
    speechReady(){return false;},prepareRecognition(){return new Promise(()=>{});},beginRecording(options){const pending=deferred();captures.push({options,...pending});return pending.promise;},finishRecording(){}};
  const sandbox={...practicePlan,createFeedback:()=>({prepare(){},tap(){},play(kind){(calls.effects??=[]).push(kind);},setSilent(){},cancel(){}}),...content,...learning,...stories,...gardening,...voices,...art,...gardenArt,...storyArt,...meadowArt,...meadowUI,meadow,audio,document,localStorage,
    location:{search:''},URL,URLSearchParams,navigator:{},window:{addEventListener(){},scrollTo(){}},
    setTimeout(fn,delay){const id=++timerId;timers.set(id,{fn,delay});return id;},clearTimeout(id){timers.delete(id);}};
  vm.runInNewContext(source+`;globalThis.ui={render,narrate,sound,sample,teach,record,playStory,storyContinue,navigate,openModal,suspend,actions,prepareMicrophone,
    getSession:()=>session,getState:()=>state,
    setMic(value){prefs.mic=value;},
    setPage(value){page=value;session=null;modal=null;render();},
    setGarden(value){garden=value;page='garden';session=null;modal=null;render();},
    setSession(overrides={}){const story=STORIES[0];session={id:'ui-round',event:story.event,story,context:story.event.contexts[0],phase:'request',assessmentMode:false,helped:false,storyGeneration:0,speechGeneration:0,frame:0,storyReady:false,storyRunning:false,hasClip:false,waiting:false,recording:false,teaching:false,assessment:null,...overrides};page='event';modal=null;prefs={mic:true};loadedPictures.set(imageUrl(story),Promise.resolve());render();return session;}};`,sandbox);
  return {...sandbox.ui,document,sounds,captures,calls,writes,timers,html:()=>html,
    buttons:()=>nodes,button:action=>nodes.find(node=>node.dataset.action===action),
    ears:()=>nodes.filter(node=>node.body.includes('data-icon="ear"')),
    guided:()=>nodes.filter(node=>node.classList.contains('is-guided')).map(node=>node.dataset.action).sort(),
    async nextDelay(){await flush();const timer=[...timers].find(([,value])=>value.delay<2000);assert.ok(timer,'Expected a story frame delay');timers.delete(timer[0]);timer[1].fn();await flush();}};
}

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

test('story Chinese help has a visible ear; its microphone starts recording on the first tap',async()=>{
  const f=fixture(),s=f.setSession({phase:'story'}),playing=f.playStory(true);
  for(let frame=0;frame<4;frame++){
    await f.nextDelay();
    if(frame===s.story.cueFrame){
      assert.deepEqual(f.guided(),['story-replay']);assert.deepEqual(f.ears().map(node=>node.dataset.action),['story-replay']);
      f.sounds.at(-1).resolve(true);await flush();f.sounds.at(-1).resolve(true);await flush();
    }
    await f.nextDelay();
  }
  await playing;assert.equal(s.storyReady,true);assert.equal(s.phase,'story');assert.equal(f.sounds.length,2);
  assert.equal(f.sounds.some(sound=>sound.file.endsWith('garden-speak.mp3')),false);
  f.storyContinue();assert.equal(s.phase,'request');assert.equal(s.waiting,true);assert.equal(f.captures.length,1);assert.equal(f.sounds.length,2);assert.deepEqual(f.guided(),[]);
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
