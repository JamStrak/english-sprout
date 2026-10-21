import {gardenMusicSettings} from '../xiaoya/garden-music.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import * as content from '../xiaoya/content.js';
import * as learning from '../xiaoya/learning.js';
import * as stories from '../xiaoya/stories.js';
import * as storyPictures from '../xiaoya/story-pictures.js';
import * as meadow from '../xiaoya/garden-meadow.js';
import * as meadowArt from '../xiaoya/meadow-art.js';
import * as meadowUI from '../xiaoya/meadow-ui.js';
import * as gardenHistory from '../xiaoya/garden-history.js';
import * as seedShop from '../xiaoya/seed-shop.js';
import * as voices from '../xiaoya/voices.js';
import * as art from '../xiaoya/art.js';
import * as gardenArt from '../xiaoya/garden-art.js';
import * as practicePlan from '../xiaoya/practice-plan.js';
import * as curriculum from '../xiaoya/curriculum.js';
import * as challenge from '../xiaoya/challenges.js';
import * as challengeUI from '../xiaoya/challenge-ui.js';
import { createWelcomeGreetings } from '../xiaoya/welcome-greetings.js';

// Run the real UI and click handlers with deterministic timers and audio endings.
// All storage is isolated; garden fixtures use the same validated economy as production.
const source='const INTERNAL_BUILD=false,GM_SANDBOX=false,appStorage=localStorage;\n'+fs.readFileSync(new URL('../xiaoya/experience.js',import.meta.url),'utf8').replace(/^import .*;\r?\n/gm,'').replace(/^export const /gm,'const ');
const flush=()=>new Promise(resolve=>setImmediate(resolve));
function reward(state,choice='shells'){
  const roundId=`garden-test-${state.rounds.length+1}`;
  return meadow.claimReward(meadow.rewardRound(state,{roundId,eventId:'food-water',date:'2026-10-16'}),roundId,choice);
}
function funded(state,shells=2,water=5){
  while(state.shells<shells)state=reward(state,'shells');
  while(state.water<water)state=reward(state,'water');
  return state;
}
function grown(count){
  let state=meadow.createMeadow();
  for(let i=0;i<count;i++){
    state=meadow.plantSeed(meadow.openSeedPack(funded(state),0),{x:.2+i*.16,y:.65});
    const plant=state.plants.at(-1),flower=meadow.ALL_FLOWERS.find(f=>f.id===plant.flowerId);
    for(let n=0;n<flower.waterNeeded;n++)state=meadow.waterPlant(state,plant.id);
  }
  return state;
}
function readySeed(count=0){return meadow.openSeedPack(funded(grown(count)),0);}
function fixture(initial=meadow.createMeadow(),{search='',extraStorage=[]}={}){
  let html='',nodes=[],modalNodes=[],clock=0,timerId=0;
  const timers=new Map(),sounds=[],writes=[],calls={chimes:0},events={app:{},document:{},window:{},body:{}};
  const storage=new Map([[meadow.MEADOW_KEY,JSON.stringify(initial)],...extraStorage]);
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
    addEventListener:register('document'),body:{append(){},addEventListener:register('body'),dispatchEvent(){}},createElement(){return {remove(){}};}};
  class AudioContext{
    currentTime=0;destination={};resume(){}
    createOscillator(){return {frequency:{},connect(){},start(){calls.chimes++;},stop(){}};}
    createGain(){return {gain:{setValueAtTime(){},linearRampToValueAtTime(){},exponentialRampToValueAtTime(){}},connect(){}};}
  }
  const audio={playSound(file){let resolve;const promise=new Promise(done=>{resolve=done;});sounds.push({file,resolve});return promise;},
    stopSound(){for(const sound of sounds)sound.resolve(false);},cancelRecording(){},cancelRecognition(){},prepareRecording(){return Promise.resolve(true);},
    releaseAudioSession(){audio.stopSound();},speechReady(){return false;}};
  let meadowActions;
  const sandbox={startAudioPack(){},retryAudioPack(){},audioPackMessage:()=> '全部内置声音已准备好',onAudioPackChange(){},
    retryArtPack(){},artPackMessage:()=> '全部插画已准备好',onArtPackChange(){},installPaperArt(){},
    ...practicePlan,...curriculum,challenge,...challengeUI,gardenMusicSettings,createGardenMusic:()=>({setState(){},retry(){},status(){return {playing:false,blocked:false};}}),createFeedback:()=>({prepare(){},tap(){},play(kind){(calls.effects??=[]).push(kind);},setSilent(){},cancel(){}}),
    ...content,...learning,...stories,...gardenHistory,...seedShop,...voices,...art,...gardenArt,...meadowArt,...meadowUI,
    layoutMeadowWatering(){/* Geometry has separate browser tests. */},
    bindMeadowInteractions(root,actions){meadowActions=actions;return ()=>{};},meadow,audio,document,JSON,Event,
    localStorage:{getItem:key=>storage.get(key)??null,setItem(key,value){writes.push({key,value});storage.set(key,value);}},
    location:{search},URL,URLSearchParams,navigator:{},window:{AudioContext,addEventListener:register('window'),scrollTo(){}},
    setTimeout(fn,delay){const id=++timerId;timers.set(id,{fn,due:clock+delay,delay});return id;},clearTimeout(id){timers.delete(id);}};
  Object.assign(sandbox,storyPictures,{createWelcomeGreetings,createPictureLoader:()=>({load(){},status:()=> 'ready'})});
  vm.runInNewContext(source+`;globalThis.ui={enterGarden,gardenGuide,navigate,openModal,closeModal,render,
    getGarden:()=>meadowState,getFeedback:()=>feedback};`,sandbox);
  async function emit(scope,type,event={}){for(const listener of events[scope][type]||[])listener(event);await flush();}
  return {...sandbox.ui,sounds,calls,writes,document,buttons,html:()=>html,storage,
    button:action=>buttons().find(node=>node.dataset.action===action),
    plant:id=>buttons().find(node=>node.dataset.meadowPlant===id),
    async plantAt(point){await meadowActions.onPlant(point);await flush();},
    async water(id){await meadowActions.onWater(id);await flush();},
    guided:()=>buttons().filter(node=>node.classList.contains('is-guided')).map(node=>node.dataset.action),
    async click(action){const target=buttons().find(node=>node.dataset.action===action);assert.ok(target,`Missing target ${action}`);await emit('app','click',{target:{closest:()=>target}});},
    activity:type=>emit('app',type),
    async finishSound(){assert.ok(sounds.length);sounds.at(-1).resolve(true);await flush();},
    async hidden(value){document.hidden=value;await emit('document','visibilitychange');},
    pagehide:()=>emit('window','pagehide'),
    storageEvent:key=>emit('window','storage',{key}),
    async advance(ms){const end=clock+ms;await flush();for(;;){const next=[...timers].filter(([,timer])=>timer.due<=end).sort((a,b)=>a[1].due-b[1].due)[0];if(!next)break;clock=next[1].due;timers.delete(next[0]);next[1].fn();await flush();}clock=end;},
  };
}

test('new gardeners get next-step speech; the third planted seed ends automatic speech',async()=>{
  const f=fixture(readySeed(2));f.enterGarden();assert.match(f.html(),/data-guidance="new"/);
  assert.match(f.sounds.at(-1).file,/meadow-seed\.mp3$/);await f.finishSound();
  const before=f.sounds.length;await f.click('meadow-seed');await f.plantAt({x:.7,y:.7});
  assert.equal(f.getGarden().plants.length,3);assert.match(f.html(),/data-guidance="quiet"/);
  assert.equal(f.sounds.length,before,'The third seed counts before it blooms');
  await f.click('meadow-can');
  for(let i=0;i<5;i++)await f.water('plant-3');
  assert.equal(f.sounds.length,before);assert.equal(f.getGarden().plants.at(-1).waterings,5);
  assert.deepEqual(f.calls.effects,['plant','water','water','water','water','bloom']);
});

test('first planting and bloom give spoken cues; every watering gives its own short effect',async()=>{
  const f=fixture(readySeed());f.enterGarden();await f.finishSound();
  await f.click('meadow-seed');await f.plantAt({x:.4,y:.65});await f.advance(340);
  assert.match(f.sounds.at(-1).file,/meadow-water-beside\.mp3$/);await f.finishSound();
  await f.click('meadow-can');const count=f.sounds.length,water=f.getGarden().water;
  for(let i=1;i<=5;i++){
    await f.water('plant-1');assert.equal(f.getGarden().plants[0].waterings,i);
    assert.equal(f.getGarden().water,water-i);assert.equal(f.getFeedback().plantId,'plant-1');
  }
  await f.advance(340);assert.equal(f.sounds.length,count+1);
  assert.match(f.sounds.at(-1).file,/meadow-bloom\.mp3$/);
  assert.deepEqual(f.calls.effects,['plant','water','water','water','water','bloom']);
});

test('experienced gardeners keep feedback without repeated speech or changes to learning evidence',async()=>{
  const f=fixture(readySeed(3));f.enterGarden();assert.equal(f.sounds.length,0);
  await f.click('meadow-seed');await f.plantAt({x:.75,y:.8});await f.click('meadow-can');
  for(let i=0;i<5;i++)await f.water('plant-4');
  assert.equal(f.sounds.length,0);assert.equal(f.getGarden().plants.length,4);
  assert.deepEqual(f.calls.effects,['plant','water','water','water','water','bloom']);
  assert.ok(f.writes.every(write=>write.key===meadow.MEADOW_KEY));
  await f.click('help');assert.match(f.sounds.at(-1).file,/garden-next\.mp3$/);
  assert.deepEqual(f.guided(),['next-event']);await f.finishSound();assert.deepEqual(f.guided(),[]);
});

test('15-second idle guidance is one-shot and responds to current state after real activity',async()=>{
  const f=fixture(readySeed(3));f.enterGarden();
  await f.advance(14999);assert.equal(f.sounds.length,0);await f.advance(1);
  assert.equal(f.sounds.length,1);assert.match(f.sounds[0].file,/meadow-seed\.mp3$/);
  assert.deepEqual(f.guided(),['meadow-seed']);await f.finishSound();await f.advance(60000);
  assert.equal(f.sounds.length,1,'Finishing a reminder must not create a reminder loop');
  await f.click('meadow-seed');await f.plantAt({x:.75,y:.8});await f.advance(14000);
  await f.activity('keydown');await f.advance(14000);assert.equal(f.sounds.length,1);
  await f.activity('scroll');await f.advance(14999);assert.equal(f.sounds.length,1);
  await f.advance(1);assert.equal(f.sounds.length,2);assert.match(f.sounds.at(-1).file,/meadow-water-beside\.mp3$/);
  assert.deepEqual(f.guided(),['meadow-can']);await f.finishSound();await f.advance(45000);assert.equal(f.sounds.length,2);
  await f.activity('pointerdown');await f.advance(15000);assert.equal(f.sounds.length,3);
});

test('navigation, modal, background and pagehide cancel idle guidance; return waits a fresh 15 seconds',async()=>{
  for(const exit of ['navigate','modal','hidden','pagehide']){
    const f=fixture(readySeed(3));f.enterGarden();await f.advance(14000);
    const gardenSounds=()=>f.sounds.filter(sound=>!sound.file.includes('/welcome-'));
    if(exit==='navigate')f.navigate('home');else if(exit==='modal')f.openModal({type:'error',message:'test'});
    else if(exit==='hidden')await f.hidden(true);else await f.pagehide();
    await f.advance(60000);assert.equal(gardenSounds().length,0,exit);
    if(exit==='modal')f.closeModal();else if(exit==='hidden')await f.hidden(false);else f.enterGarden();
    await f.advance(14999);assert.equal(gardenSounds().length,0,exit);await f.advance(1);assert.equal(gardenSounds().length,1,exit);
  }
});

test('late audio completion cannot resurrect a canceled garden reminder',async()=>{
  for(const exit of [f=>f.navigate('home'),f=>f.openModal({type:'error',message:'test'}),f=>f.hidden(true),f=>f.pagehide()]){
    const f=fixture(readySeed());f.enterGarden();assert.equal(f.sounds.length,1);
    const old=f.sounds[0];await exit(f);old.resolve(true);await flush();await f.advance(60000);
    assert.equal(f.sounds.filter(sound=>!sound.file.includes('/welcome-')).length,1);
  }
});

test('the seed tool has no flower preview or duplicate planting pot',async()=>{
  const f=fixture(readySeed(3));f.enterGarden();
  assert.match(f.button('meadow-seed').body,/data-seed-color="white"/);
  assert.match(f.button('meadow-seed').body,/seed\.webp/);
  assert.equal(f.button('seed-voice'),undefined);assert.equal(f.button('plant'),undefined);
  assert.doesNotMatch(f.html(),/empty-pot|seed-reveal|data-variant/);
  await f.click('meadow-seed');assert.match(f.html(),/data-tool="seed"/);
  await f.plantAt({x:.75,y:.8});assert.equal(f.getGarden().plants.length,4);
  assert.equal(f.button('meadow-seed'),undefined);assert.ok(f.button('shop'));
});

test('tapping a grown flower gives visual and sound feedback without spending or claiming mastery',async()=>{
  const f=fixture(grown(3));f.enterGarden();const before=JSON.stringify(f.getGarden());await f.water('plant-2');
  assert.equal(f.getFeedback().plantId,'plant-2');assert.equal(f.getFeedback().kind,'bloom');
  assert.ok(f.plant('plant-2').classList.contains('just-watered'));assert.match(f.html(),/meadow-splash/);
  assert.deepEqual(f.calls.effects,['bloom']);assert.equal(f.sounds.length,0);assert.equal(f.writes.length,0);
  assert.equal(JSON.stringify(f.getGarden()),before);await f.advance(3200);
  assert.equal(f.getFeedback(),null);assert.equal(f.sounds.length,0);
  await f.advance(11800);assert.equal(f.sounds.length,1);await f.finishSound();await f.advance(30000);assert.equal(f.sounds.length,1);
});

test('old garden URL and saved A preference cannot select a retired garden or overwrite its archive',async()=>{
  const archive=JSON.stringify({schemaVersion:1,product:'xiaoya-english-garden',rounds:[],shells:99,water:88,plants:[]});
  const initial=readySeed(3),preference='xiaoya-english:garden-variant:v1';
  for(const search of ['', '?garden=a','?garden=b']){
    const f=fixture(initial,{search,extraStorage:[[preference,'a'],[gardenHistory.LEGACY_GARDEN_KEY,archive]]});
    f.enterGarden();assert.match(f.html(),/class="meadow-view"/);assert.doesNotMatch(f.html(),/class="garden-view"|data-variant/);
    assert.equal(JSON.stringify(f.getGarden()),JSON.stringify(initial));
    await f.click('meadow-seed');await f.plantAt({x:.75,y:.8});
    assert.equal(f.getGarden().plants.length,4);assert.equal(f.storage.get(gardenHistory.LEGACY_GARDEN_KEY),archive);
    assert.ok(f.writes.every(write=>write.key===meadow.MEADOW_KEY));
    await f.storageEvent(preference);f.enterGarden();assert.match(f.html(),/class="meadow-view"/);
    assert.equal(f.getGarden().plants.length,4);
  }
});

test('hands stay idle-only and free-garden feedback respects reduced motion',()=>{
  const css=fs.readFileSync(new URL('../xiaoya/style.css',import.meta.url),'utf8');
  const meadowCss=fs.readFileSync(new URL('../xiaoya/meadow.css',import.meta.url),'utf8');
  assert.match(css,/\.tap-cue\{display:none;/);
  assert.match(css,/\.primary-wrap\.is-idle-hint:has\(button:enabled\) \.tap-cue\{display:block\}/);
  assert.match(meadowCss,/\.meadow-tool\.inviting:not\(:disabled\):not\(\.selected\)\{animation:meadow-invite/);
  assert.match(meadowCss,/@media\(prefers-reduced-motion:reduce\)\{\.meadow-view \*,\.vector-picture>svg\{animation:none!important/);
});
