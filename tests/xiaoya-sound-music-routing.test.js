import test from 'node:test';
import assert from 'node:assert/strict';
import {createGardenMusic} from '../xiaoya/garden-music.js';

const flush=async()=>{for(let i=0;i<6;i++)await Promise.resolve();};
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
