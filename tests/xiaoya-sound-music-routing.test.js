import test from 'node:test';
import assert from 'node:assert/strict';
import {createGardenMusic} from '../xiaoya/garden-music.js';
import fs from 'node:fs';
import vm from 'node:vm';
import {normalizeSoundSettings} from '../xiaoya/sound-settings.js';
import {SOUND_EVENTS} from '../xiaoya/sound-catalog.js';

const flush=async()=>{for(let i=0;i<6;i++)await Promise.resolve();};
const source=fs.readFileSync(new URL('../xiaoya/experience.js',import.meta.url),'utf8');
function routingFixture(){
  const states=[],resolutions=[];
  const context=vm.createContext({
    page:'home',session:null,audioActivity:{playing:false,recording:false},speaking:false,
    document:{hidden:false},pageSuspended:false,gmWorkbenchOpen:false,gmMusicPreview:false,
    modal:null,welcomePhase:null,prefs:{gardenMusic:{enabled:true,volume:.5}},
    audioControls:()=>({music:true}),gardenMusicSettings:value=>value,
    soundPlayer:{setState(){},resolve(id){resolutions.push(id);return{asset:{url:'same.mp3'},volume:1,enabled:true};}},
    gardenMusic:{setState(value){states.push(value);}},
  });
  vm.runInContext(source.slice(source.indexOf('function syncGardenMusic(){'),source.indexOf('// Cue narration')),context);
  return{context,states,resolutions,sync(change={}){Object.assign(context,change);context.syncGardenMusic();return states.at(-1);}};
}
test('garden music is restricted to garden despite stale bindings, with faded normal transitions',()=>{
  const f=routingFixture();
  for(const page of ['home','event','reward','challenges','challenge-prize','shop','blindbox','parent']){
    const state=f.sync({page});assert.equal(state.active,false,page);assert.equal(state.immediate,false,page);
  }
  assert.equal(f.sync({page:'garden'}).active,true);
  for(const patch of [{modal:'collection'},{welcomePhase:'gift'},{gmWorkbenchOpen:true}]){
    const state=f.sync(patch);assert.equal(state.active,false);assert.equal(state.immediate,false);
    f.sync({modal:null,welcomePhase:null,gmWorkbenchOpen:false});
  }
  assert.equal(f.sync({page:'home',gmWorkbenchOpen:true,gmMusicPreview:true}).active,true);
  const close=f.sync({gmWorkbenchOpen:false,gmMusicPreview:false});assert.equal(close.active,false);assert.equal(close.immediate,false);
  assert.ok(f.resolutions.every(id=>id==='bgm-garden'));assert.ok(f.states.every(state=>state.file==='same.mp3'));
});
test('recording and lifecycle still silence BGM regardless of explicit GM preview',()=>{
  const f=routingFixture();f.sync({page:'garden',gmWorkbenchOpen:true,gmMusicPreview:true});
  for(const patch of [{pageSuspended:true},{document:{hidden:true}},{audioActivity:{recording:true}},{session:{assessment:{status:'preparing'}}}]){
    const state=f.sync(patch);assert.equal(state.active,false);assert.equal(state.immediate,true);
    f.sync({pageSuspended:false,document:{hidden:false},audioActivity:{recording:false},session:null});
  }
});
test('old non-garden music bindings are ignored on restore while garden preferences survive',()=>{
  const events=Object.fromEntries(['bgm-home','bgm-shop','bgm-blindbox'].map(id=>[id,{enabled:true,assetId:'garden-piano',volume:1}]));
  const garden={enabled:true,assetId:'garden-piano',volume:.37};
  const restored=normalizeSoundSettings({events:{...events,'bgm-garden':garden}});
  assert.deepEqual(SOUND_EVENTS.filter(event=>event.kind==='bgm').map(event=>event.id),['bgm-garden']);
  for(const id of Object.keys(events))assert.equal(Object.hasOwn(restored.events,id),false);
  assert.deepEqual(restored.events['bgm-garden'],garden);
});
test('replacing a scene music file releases the old source and a late rejection cannot block its replacement',async()=>{
  const players=[];
  const music=createGardenMusic({createAudio(file){
    let reject;
    const pending=new Promise((_,no)=>{reject=no;});
    const p={file,paused:true,volume:0,removed:false,loads:0,
      play(){this.paused=false;return players.length===1?pending:Promise.resolve();},
      pause(){this.paused=true;},removeAttribute(name){if(name==='src')this.removed=true;},load(){this.loads++;},reject};
    players.push(p);return p;
  }});
  music.setState({active:true,file:'first.mp3',immediate:true});
  music.setState({active:true,file:'data:audio/mpeg;base64,AA==',immediate:true});
  await flush();
  assert.equal(players.length,2);assert.equal(players[0].removed,true);assert.equal(players[0].loads,1);
  assert.equal(players[0].paused,true);assert.equal(players[1].paused,false);
  players[0].reject(new Error('late autoplay rejection'));await flush();
  assert.equal(music.status().blocked,false);assert.equal(music.status().playing,true);
  music.setState({active:false,immediate:true});assert.equal(players[1].paused,true);
});

test('moving between scenes with the same configured music preserves playback position',async()=>{
  let count=0;
  const player={paused:true,currentTime:42,volume:0,play(){this.paused=false;return Promise.resolve();},pause(){this.paused=true;}};
  const music=createGardenMusic({createAudio(){count++;return player;}});
  music.setState({active:true,file:'same.mp3',volume:.5,immediate:true});await flush();
  music.setState({active:true,file:'same.mp3',volume:.275,immediate:true});
  assert.equal(count,1);assert.equal(player.currentTime,42);assert.ok(player.volume>0);
  music.setState({active:true,file:'same.mp3',enabled:false,immediate:true});assert.equal(player.paused,true);
});
