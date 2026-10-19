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
import * as curriculum from '../xiaoya/curriculum.js';
import * as challenge from '../xiaoya/challenges.js';
import * as challengeUI from '../xiaoya/challenge-ui.js';
import { installPaperArt } from '../xiaoya/paper-art.js';

// Run the real UI and click handlers with deterministic timers and audio endings.
// All storage is isolated; garden fixtures use the same validated economy as production.
const source=fs.readFileSync(new URL('../xiaoya/experience.js',import.meta.url),'utf8').replace(/^import .*;\r?\n/gm,'');
const flush=()=>new Promise(resolve=>setImmediate(resolve));
function reward(state){return gardening.rewardRound(state,{roundId:`garden-test-${state.rounds.length+1}`,eventId:'food-water',date:'2026-10-16'});}
function grown(count){
  let state=gardening.createGarden();
  for(let i=0;i<count;i++){
    state=gardening.plantSeed(gardening.openSeedPack(reward(state)));
    const id=state.plants.at(-1).id;
    state=gardening.waterPlant(gardening.waterPlant(state,id),id);
  }
  return state;
}
function fixture(initial=gardening.createGarden()){
  let html='',nodes=[],modalNodes=[],clock=0,timerId=0;
  const timers=new Map(),sounds=[],writes=[],calls={chimes:0},events={app:{},document:{},window:{}};
  const storage=new Map([[gardening.GARDEN_KEY,JSON.stringify(initial)]]);
  const register=scope=>(type,listener)=>{(events[scope][type]??=[]).push(listener);};
  function parse(markup){return [...markup.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g)].map(([,attributes,body])=>{
    const attrs=Object.fromEntries([...attributes.matchAll(/([\w-]+)(?:="([^"]*)")?/g)].map(([,name,value])=>[name,value??'']));
    const classes=new Set((attrs.class||'').split(/\s+/));
    return {body,attrs,dataset:Object.fromEntries(Object.entries(attrs).filter(([key])=>key.startsWith('data-')).map(([key,value])=>[key.slice(5).replace(/-([a-z])/g,(_,letter)=>letter.toUpperCase()),value])),disabled:'disabled' in attrs,
      classList:{toggle(name,on){if(on)classes.add(name);else classes.delete(name);},contains:name=>classes.has(name)},
      hasAttribute:name=>name in attrs,style:{setProperty(){}},focus(){}};
  });}
  const root={addEventListener:register('app'),set innerHTML(value){html=value;nodes=parse(value);},get innerHTML(){return html;}};
  const modalRoot={set innerHTML(value){modalNodes=parse(value);}};
  const buttons=()=>[...nodes,...modalNodes];
  const document={baseURI:'http://127.0.0.1/xiaoya-garden-test/',hidden:false,activeElement:null,
    querySelector(selector){if(selector==='#app')return root;if(selector==='#modal-root')return modalRoot;
      const action=selector.match(/^\[data-action="([^"]+)"\]$/)?.[1];return action?buttons().find(node=>node.dataset.action===action):null;},
    querySelectorAll(selector){return selector==='[data-action]'?buttons().filter(node=>node.dataset.action):[];},
    addEventListener:register('document'),body:{append(){}},createElement(){return {remove(){}};}};
  class AudioContext{
    currentTime=0;destination={};resume(){}
    createOscillator(){return {frequency:{},connect(){},start(){calls.chimes++;},stop(){}};}
    createGain(){return {gain:{setValueAtTime(){},linearRampToValueAtTime(){},exponentialRampToValueAtTime(){}},connect(){}};}
  }
  const audio={playSound(file){let resolve;const promise=new Promise(done=>{resolve=done;});sounds.push({file,resolve});return promise;},
    stopSound(){for(const sound of sounds)sound.resolve(false);},cancelRecording(){},cancelRecognition(){},prepareRecording(){return Promise.resolve(true);},
    releaseAudioSession(){audio.stopSound();},speechReady(){return false;}};
  const sandbox={startAudioPack(){},retryAudioPack(){},audioPackMessage:()=> '全部内置声音已准备好',onAudioPackChange(){},...practicePlan,...curriculum,challenge,...challengeUI,installPaperArt,createFeedback:()=>({prepare(){},tap(){},play(kind){(calls.effects??=[]).push(kind);},setSilent(){},cancel(){}}),...content,...learning,...stories,...gardening,...voices,...art,...gardenArt,...storyArt,...meadowArt,...meadowUI,layoutMeadowWatering(){/* Physical layout is covered by watering browser tests. */},meadow,audio,document,JSON,
    localStorage:{getItem:key=>storage.get(key)??null,setItem(key,value){writes.push({key,value});storage.set(key,value);}},
    location:{search:''},URL,URLSearchParams,navigator:{},window:{AudioContext,addEventListener:register('window'),scrollTo(){}},
    setTimeout(fn,delay){const id=++timerId;timers.set(id,{fn,due:clock+delay,delay});return id;},clearTimeout(id){timers.delete(id);}};
  vm.runInNewContext(source+`;globalThis.ui={enterGarden,gardenGuide,navigate,openModal,closeModal,render,
    getGarden:()=>garden,getFeedback:()=>feedback};`,sandbox);
  async function emit(scope,type,event={}){for(const listener of events[scope][type]||[])listener(event);await flush();}
  return {...sandbox.ui,sounds,calls,writes,document,buttons,html:()=>html,storage,
    button:action=>buttons().find(node=>node.dataset.action===action),
    plant:id=>buttons().find(node=>node.dataset.plant===id),
    guided:()=>buttons().filter(node=>node.classList.contains('is-guided')).map(node=>node.dataset.action),
    async click(action){const target=buttons().find(node=>node.dataset.action===action||node.dataset.plant===action);assert.ok(target,`Missing target ${action}`);await emit('app','click',{target:{closest:()=>target}});},
    activity:type=>emit('app',type),
    async finishSound(){assert.ok(sounds.length);sounds.at(-1).resolve(true);await flush();},
    async hidden(value){document.hidden=value;await emit('document','visibilitychange');},
    pagehide:()=>emit('window','pagehide'),
    async advance(ms){const end=clock+ms;await flush();for(;;){const next=[...timers].filter(([,timer])=>timer.due<=end).sort((a,b)=>a[1].due-b[1].due)[0];if(!next)break;clock=next[1].due;timers.delete(next[0]);next[1].fn();await flush();}clock=end;},
  };
}

test('new gardeners get next-step speech; planting the third pot immediately ends automatic speech',async()=>{
  const f=fixture(reward(grown(2)));f.enterGarden();assert.match(f.html(),/data-guidance="new"/);
  assert.match(f.sounds.at(-1).file,/garden-open-pack\.mp3$/);await f.finishSound();
  await f.click('pack');await f.advance(340);assert.match(f.sounds.at(-1).file,/garden-seed\.mp3$/);await f.finishSound();
  const before=f.sounds.length;await f.click('plant');
  assert.equal(f.getGarden().plants.length,3);assert.match(f.html(),/data-guidance="quiet"/);
  assert.equal(f.sounds.length,before,'The third planted seed counts, even before it blooms');
  await f.click('water');await f.click('water');assert.equal(f.sounds.length,before);
  assert.equal(f.getGarden().plants.at(-1).waterings,2);assert.deepEqual(f.calls.effects,['seed','plant','water','bloom']);
});

test('first-time seed, watering and bloom actions play their short cue before spoken guidance',async()=>{
  const f=fixture(reward(grown(0)));f.enterGarden();await f.finishSound();
  for(const [action,cue] of [['pack','seed'],['plant','water'],['water','water'],['water','bloom']]){
    const count=f.sounds.length;await f.click(action);await f.advance(340);
    assert.equal(f.sounds.length,count+1);assert.match(f.sounds.at(-1).file,new RegExp(`garden-${cue}\\.mp3$`));await f.finishSound();
  }
  assert.equal(f.getGarden().water,0);assert.equal(f.getGarden().shells,0);assert.equal(f.getGarden().plants[0].waterings,2);
});

test('experienced entry and a complete seed cycle keep sound effects without repeated speech',async()=>{
  const f=fixture(reward(grown(3)));f.enterGarden();
  assert.equal(f.sounds.length,0);assert.match(f.html(),/data-guidance="quiet"/);
  for(const action of ['pack','plant','water','water'])await f.click(action);
  assert.equal(f.sounds.length,0);assert.deepEqual(f.calls.effects,['seed','plant','water','bloom']);
  assert.equal(f.getGarden().plants.length,4);assert.equal(f.getGarden().water,0);assert.equal(f.getGarden().shells,0);
  assert.ok(f.writes.every(write=>write.key===gardening.GARDEN_KEY),'Garden actions never write learning evidence');
  await f.click('help');assert.match(f.sounds.at(-1).file,/garden-next\.mp3$/);
  assert.deepEqual(f.guided(),['next-event']);await f.finishSound();assert.deepEqual(f.guided(),[]);
});

test('15-second idle guidance is one-shot and responds to current state after real activity',async()=>{
  const f=fixture(reward(grown(3)));f.enterGarden();
  await f.advance(14999);assert.equal(f.sounds.length,0);await f.advance(1);
  assert.equal(f.sounds.length,1);assert.match(f.sounds[0].file,/garden-open-pack\.mp3$/);
  assert.deepEqual(f.guided(),['pack']);await f.finishSound();await f.advance(60000);
  assert.equal(f.sounds.length,1,'Finishing a reminder must not start another reminder loop');
  await f.click('pack');await f.advance(14000);await f.activity('keydown');await f.advance(14000);
  assert.equal(f.sounds.length,1);await f.activity('scroll');await f.advance(14999);assert.equal(f.sounds.length,1);
  await f.advance(1);assert.equal(f.sounds.length,2);assert.match(f.sounds.at(-1).file,/garden-seed\.mp3$/);
  assert.deepEqual(f.guided(),['plant']);await f.finishSound();await f.advance(45000);assert.equal(f.sounds.length,2);
  await f.activity('pointerdown');await f.advance(15000);assert.equal(f.sounds.length,3);
});

test('navigation, modal, background and pagehide cancel idle guidance; return waits a fresh 15 seconds',async()=>{
  for(const exit of ['navigate','modal','hidden','pagehide']){
    const f=fixture(reward(grown(3)));f.enterGarden();await f.advance(14000);
    if(exit==='navigate')f.navigate('home');else if(exit==='modal')f.openModal({type:'error',message:'test'});
    else if(exit==='hidden')await f.hidden(true);else await f.pagehide();
    await f.advance(60000);assert.equal(f.sounds.length,0,exit);
    if(exit==='modal')f.closeModal();else if(exit==='hidden')await f.hidden(false);else f.enterGarden();
    await f.advance(14999);assert.equal(f.sounds.length,0,exit);await f.advance(1);assert.equal(f.sounds.length,1,exit);
  }
});

test('late audio completion cannot resurrect a canceled garden reminder',async()=>{
  for(const exit of [f=>f.navigate('home'),f=>f.openModal({type:'error',message:'test'}),f=>f.hidden(true),f=>f.pagehide()]){
    const f=fixture(reward(grown(0)));f.enterGarden();assert.equal(f.sounds.length,1);
    const old=f.sounds[0];await exit(f);old.resolve(true);await flush();await f.advance(60000);
    assert.equal(f.sounds.length,1);
  }
});

test('seed reveal has no flower preview or fake target; only the empty planting pot remains active',async()=>{
  const empty=fixture();empty.enterGarden();assert.doesNotMatch(empty.html(),/empty-pot/);
  const f=fixture(gardening.openSeedPack(reward(grown(3))));f.enterGarden();
  const reveal=f.html().match(/<div class="seed-reveal" aria-hidden="true">([\s\S]*?)<\/div>/)?.[1];
  assert.equal(reveal,gardenArt.seedArt(),'No flower shape or variety is revealed before planting');
  assert.equal(f.button('seed-voice'),undefined);assert.equal(f.button('plant').body,gardenArt.plantArt(null,-1));
  assert.ok(f.buttons().filter(button=>button.dataset.plant).every(button=>button.disabled));
  const before=JSON.stringify(f.getGarden());await f.click('plant-1');assert.equal(JSON.stringify(f.getGarden()),before);
  assert.deepEqual(f.calls.effects??[],[]);assert.equal(f.writes.length,0);
  await f.click('plant');assert.equal(f.getGarden().plants.length,4);assert.ok(f.plant('plant-1')&&!f.plant('plant-1').disabled);
  assert.doesNotMatch(f.html(),/seed-reveal/);
});

test('tapping an existing flower gives immediate visual and sound feedback without spending or claiming mastery',async()=>{
  const f=fixture(grown(3));f.enterGarden();const before=JSON.stringify(f.getGarden());await f.click('plant-2');
  assert.equal(f.getFeedback().plantId,'plant-2');assert.equal(f.getFeedback().kind,'bloom');
  assert.ok(f.plant('plant-2').classList.contains('just-watered'));assert.match(f.html(),/bloom-sparkles/);
  assert.deepEqual(f.calls.effects,['bloom']);assert.equal(f.sounds.length,0);assert.equal(f.writes.length,0);
  assert.equal(JSON.stringify(f.getGarden()),before);await f.advance(3200);
  assert.equal(f.getFeedback(),null);assert.equal(f.sounds.length,0);
  await f.advance(11800);assert.equal(f.sounds.length,1);await f.finishSound();await f.advance(30000);assert.equal(f.sounds.length,1);
});

test('hands stay hidden until an idle hint while tactile affordances and reduced-motion support remain',()=>{
  const css=fs.readFileSync(new URL('../xiaoya/style.css',import.meta.url),'utf8');
  assert.match(css,/\.tap-cue\{display:none;/);
  assert.match(css,/\.primary-wrap\.is-idle-hint:has\(button:enabled\) \.tap-cue\{display:block\}/);
  assert.match(css,/\.garden-plant:not\(:disabled\)\{[^}]*border-color:[^}]*box-shadow:/);
  assert.match(css,/\.seed-reveal\{[^}]*pointer-events:none/);
  assert.match(css,/@media\(prefers-reduced-motion:reduce\)\{[^]*animation:none!important/);
  assert.doesNotMatch(css,/\.garden[^{}]*\{[^}]*animation:[^;}]+!important/,'Garden motion must not override reduced-motion preference');
});
